//! Reads a function's identity out of its own source.
//!
//! A library entry is ordinary JavaScript — the author writes `function doSomething(dni) { … }`
//! and the name and parameters come from that declaration, not from fields filled in beside it.
//!
//! This is a scanner, not a parser: it tracks strings, comments and bracket depth, which is
//! enough to find a top-level declaration and split its parameter list. Anything it gets wrong
//! surfaces when the engine compiles the source for real.

/// Characters that may appear in an identifier after the first one.
fn is_ident_continue(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_' || c == '$'
}

fn is_ident_start(c: char) -> bool {
    c.is_ascii_alphabetic() || c == '_' || c == '$'
}

/// Walks `source` yielding `(index, char)` for code only: string bodies and comments are
/// skipped, and `depth` reports nesting of `()`, `[]` and `{}` at each position.
struct CodeScan<'a> {
    chars: Vec<(usize, char)>,
    at: usize,
    depth: i32,
    source: &'a str,
}

impl<'a> CodeScan<'a> {
    fn new(source: &'a str) -> Self {
        Self {
            chars: source.char_indices().collect(),
            at: 0,
            depth: 0,
            source,
        }
    }

    fn peek(&self, ahead: usize) -> Option<char> {
        self.chars.get(self.at + ahead).map(|(_, c)| *c)
    }

    /// Advances past a string, template or comment starting at the cursor. Returns whether one
    /// was skipped.
    fn skip_noncode(&mut self) -> bool {
        let Some(current) = self.peek(0) else {
            return false;
        };

        if current == '/' && self.peek(1) == Some('/') {
            while let Some(c) = self.peek(0) {
                self.at += 1;
                if c == '\n' {
                    break;
                }
            }
            return true;
        }

        if current == '/' && self.peek(1) == Some('*') {
            self.at += 2;
            while self.peek(0).is_some() {
                if self.peek(0) == Some('*') && self.peek(1) == Some('/') {
                    self.at += 2;
                    break;
                }
                self.at += 1;
            }
            return true;
        }

        if current == '"' || current == '\'' || current == '`' {
            let quote = current;
            self.at += 1;
            while let Some(c) = self.peek(0) {
                if c == '\\' {
                    self.at += 2;
                    continue;
                }
                self.at += 1;
                if c == quote {
                    break;
                }
            }
            return true;
        }

        false
    }

    /// Next code character, keeping `depth` current. Returns its byte offset in the source.
    fn next(&mut self) -> Option<(usize, char)> {
        loop {
            if self.at >= self.chars.len() {
                return None;
            }
            if self.skip_noncode() {
                continue;
            }
            let (offset, c) = self.chars[self.at];
            self.at += 1;
            match c {
                '(' | '[' | '{' => self.depth += 1,
                ')' | ']' | '}' => self.depth -= 1,
                _ => {}
            }
            return Some((offset, c));
        }
    }

    fn slice(&self, from: usize, to: usize) -> &'a str {
        &self.source[from..to]
    }
}

/// Every top-level `function NAME(…)` declaration, in source order, with the byte offset of
/// its `function` keyword — which is where the search for a JSDoc block starts.
///
/// Only declarations count. A `const f = () => …` can still be written as a private helper
/// inside an entry, it just is not what the entry exports.
pub(crate) fn top_level_functions(source: &str) -> Vec<(String, usize)> {
    let mut names = Vec::new();
    let mut scan = CodeScan::new(source);
    let mut word_start: Option<usize> = None;

    while let Some((offset, c)) = scan.next() {
        if is_ident_start(c) || is_ident_continue(c) {
            if word_start.is_none() {
                word_start = Some(offset);
            }
            continue;
        }

        let Some(start) = word_start.take() else {
            continue;
        };
        // `depth` already counts the delimiter just consumed, so a declaration at the top
        // level is one whose keyword ended with the cursor still outside every bracket.
        let ended_at_top = scan.depth == 0 || (c == '(' && scan.depth == 1);
        if !ended_at_top || scan.slice(start, offset) != "function" {
            continue;
        }

        // `function` may be followed by `*` for a generator, then the name.
        let mut name = String::new();
        let mut started = false;
        while let Some((_, next)) = scan.next() {
            if !started && (next.is_whitespace() || next == '*') {
                continue;
            }
            if !started && !is_ident_start(next) {
                break; // an anonymous function expression
            }
            started = true;
            if is_ident_continue(next) {
                name.push(next);
            } else {
                break;
            }
        }
        if !name.is_empty() {
            names.push((name, start));
        }
    }

    names
}

/// The `/** … */` block immediately above `offset`, if the declaration has one.
///
/// Searched backwards through the raw source rather than through `CodeScan`, which skips
/// comments on purpose — here the comment is the thing being looked for.
pub(crate) fn jsdoc_before(source: &str, offset: usize) -> Option<&str> {
    let head = source.get(..offset)?.trim_end();
    if !head.ends_with("*/") {
        return None;
    }
    let start = head.rfind("/**")?;
    Some(&head[start..])
}

/// Reads the brace-delimited type of a `@param`, keeping nesting so `{{ a: string }}` is one
/// type rather than one that stops at the first `}`.
fn braced(text: &str) -> Option<(&str, &str)> {
    let mut chars = text.char_indices();
    if chars.next()?.1 != '{' {
        return None;
    }
    let mut depth = 1;
    for (index, c) in chars {
        match c {
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    return Some((&text[1..index], &text[index + 1..]));
                }
            }
            _ => {}
        }
    }
    None
}

/// Maps a JSDoc type onto the closed set the argument prompt knows how to render.
///
/// Anything else — a custom type, a union, something misspelled — reads as `None`, exactly
/// like no annotation at all. Pretending to understand `{Foo}` would be worse than admitting
/// the annotation says nothing this app can act on.
fn normalize_type(text: &str) -> Option<String> {
    let cleaned = text
        .trim()
        .trim_start_matches(['!', '?'])
        .trim_end_matches('=')
        .trim();
    let lowered = cleaned.to_lowercase();

    if lowered.ends_with("[]") || lowered.starts_with("array<") || lowered == "array" {
        return Some("array".to_string());
    }
    if cleaned.starts_with('{') || lowered == "object" {
        return Some("object".to_string());
    }
    match lowered.as_str() {
        "string" => Some("string".to_string()),
        "number" | "int" | "integer" | "float" | "double" => Some("number".to_string()),
        "boolean" | "bool" => Some("boolean".to_string()),
        _ => None,
    }
}

/// `@param` types out of a JSDoc block, keyed by parameter name.
///
/// A `@param` with no brace type, or one this app does not know, is left out — the parameter
/// then behaves as it did before anyone annotated anything.
pub(crate) fn jsdoc_param_types(block: &str) -> Vec<(String, String)> {
    let mut found = Vec::new();

    for line in block.lines() {
        let line = line.trim().trim_start_matches('*').trim();
        let Some(rest) = line.strip_prefix("@param") else {
            continue;
        };
        let Some((type_text, after)) = braced(rest.trim_start()) else {
            continue;
        };
        let Some(kind) = normalize_type(type_text) else {
            continue;
        };

        // The name may be wrapped for an optional parameter: `[dni]`, `[dni=123]`.
        let after = after.trim_start().trim_start_matches('[');
        let name: String = after.chars().take_while(|c| is_ident_continue(*c)).collect();
        if !name.is_empty() {
            found.push((name, kind));
        }
    }

    found
}

/// Splits the parameter list of a single function's source into `(name, default)`.
///
/// The default is kept as written (`gender = "M"` gives `Some("\"M\"")`) so the prompt can show
/// what leaving the field blank will use. Rest and destructured parameters keep their written
/// form, so the prompt can still label them with something recognisable.
pub(crate) fn parameters(function_source: &str) -> Vec<(String, Option<String>)> {
    let mut scan = CodeScan::new(function_source);

    // Skip to the opening parenthesis of the parameter list.
    let mut inner_start = None;
    while let Some((offset, c)) = scan.next() {
        if c == '(' {
            inner_start = Some(offset + 1);
            break;
        }
    }
    let Some(inner_start) = inner_start else {
        return Vec::new();
    };

    let mut pieces: Vec<String> = Vec::new();
    let mut piece_start = inner_start;
    let mut end = None;

    while let Some((offset, c)) = scan.next() {
        if scan.depth == 0 && c == ')' {
            end = Some(offset);
            break;
        }
        if scan.depth == 1 && c == ',' {
            pieces.push(scan.slice(piece_start, offset).to_string());
            piece_start = offset + 1;
        }
    }

    if let Some(end) = end {
        let last = scan.slice(piece_start, end);
        if !last.trim().is_empty() {
            pieces.push(last.to_string());
        }
    }

    pieces
        .into_iter()
        .filter_map(|piece| clean_parameter(&piece))
        .collect()
}

/// Just the names, for callers that do not care what a blank field would fall back to.
#[cfg(test)]
pub(crate) fn parameter_names(function_source: &str) -> Vec<String> {
    parameters(function_source)
        .into_iter()
        .map(|(name, _)| name)
        .collect()
}

/// Splits one parameter into its name and, when it has one, the default written after `=`.
fn clean_parameter(piece: &str) -> Option<(String, Option<String>)> {
    let mut scan = CodeScan::new(piece);
    let mut cut = piece.len();

    let mut previous = ' ';
    while let Some((offset, c)) = scan.next() {
        if scan.depth == 0 && c == '=' {
            // Not a default when it is part of `==`, `===`, `=>`, `<=`, `>=` or `!=`.
            let next = scan.peek(0);
            if next != Some('=') && next != Some('>') && !matches!(previous, '=' | '!' | '<' | '>')
            {
                cut = offset;
                break;
            }
        }
        previous = c;
    }

    let name: String = piece[..cut].split_whitespace().collect::<Vec<_>>().join(" ");
    let trimmed = name.trim().to_string();
    if trimmed.is_empty() {
        return None;
    }

    let default = if cut < piece.len() {
        let written = piece[cut + 1..].trim();
        if written.is_empty() {
            None
        } else {
            Some(written.to_string())
        }
    } else {
        None
    };

    Some((trimmed, default))
}

/// True when `name` is something that can be written after a dot and spliced into generated
/// code safely.
pub(crate) fn is_identifier(name: &str) -> bool {
    let mut chars = name.chars();
    match chars.next() {
        Some(first) if is_ident_start(first) => chars.all(is_ident_continue),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const NL: &str = "\n";

    fn names(source: &str) -> Vec<String> {
        top_level_functions(source)
            .into_iter()
            .map(|(name, _)| name)
            .collect()
    }

    #[test]
    fn finds_a_plain_declaration() {
        assert_eq!(
            names("function doSomething(nrodoc) {\n  return 1;\n}"),
            vec!["doSomething"]
        );
    }

    #[test]
    fn ignores_functions_nested_inside_another() {
        let source = "function outer(a) {\n  function inner(b) { return b; }\n  return inner(a);\n}";
        assert_eq!(names(source), vec!["outer"]);
    }

    #[test]
    fn ignores_the_word_function_inside_strings_and_comments() {
        let source = "// function commented(x) {}\nconst s = 'function quoted(y) {}';\nfunction real(z) { return z; }";
        assert_eq!(names(source), vec!["real"]);
    }

    #[test]
    fn lists_several_declarations_in_order() {
        let source = "function pad(n) { return n; }\nfunction cuil(dni) { return pad(dni); }";
        assert_eq!(names(source), vec!["pad", "cuil"]);
    }

    #[test]
    fn skips_an_anonymous_function_expression() {
        let source = "const f = function (a) { return a; };\nfunction named(b) { return b; }";
        assert_eq!(names(source), vec!["named"]);
    }

    #[test]
    fn reads_plain_parameters() {
        assert_eq!(
            parameter_names("function f(dni, gender) { return 1; }"),
            vec!["dni", "gender"]
        );
    }

    #[test]
    fn a_function_without_parameters_has_none() {
        assert!(parameter_names("function f() { return 1; }").is_empty());
    }

    #[test]
    fn drops_default_values() {
        assert_eq!(
            parameter_names("function f(dni, gender = 'M', extra = { a: 1 }) {}"),
            vec!["dni", "gender", "extra"]
        );
    }

    #[test]
    fn keeps_rest_and_destructured_parameters_readable() {
        assert_eq!(
            parameter_names("function f({ nombre, edad }, [first], ...rest) {}"),
            vec!["{ nombre, edad }", "[first]", "...rest"]
        );
    }

    #[test]
    fn a_comma_inside_a_default_does_not_split_a_parameter() {
        assert_eq!(
            parameter_names("function f(a = fn(1, 2), b) {}"),
            vec!["a", "b"]
        );
    }

    #[test]
    fn reports_the_default_a_blank_field_would_fall_back_to() {
        assert_eq!(
            parameters("function f(a = 10, b = 'M', c) {}"),
            vec![
                ("a".to_string(), Some("10".to_string())),
                ("b".to_string(), Some("'M'".to_string())),
                ("c".to_string(), None)
            ]
        );
    }

    #[test]
    fn an_arrow_default_is_not_mistaken_for_a_default_value_cut() {
        assert_eq!(
            parameter_names("function f(cb = (x) => x, b) {}"),
            vec!["cb", "b"]
        );
    }

    fn types(block: &str) -> Vec<(String, String)> {
        jsdoc_param_types(block)
    }

    #[test]
    fn reads_param_types_out_of_a_jsdoc_block() {
        let block = ["/**", " * @param {string} dni", " * @param {number} monto", " */"].join(NL);
        assert_eq!(
            types(&block),
            vec![
                ("dni".to_string(), "string".to_string()),
                ("monto".to_string(), "number".to_string())
            ]
        );
    }

    #[test]
    fn accepts_the_spellings_jsdoc_actually_gets_written_in() {
        let block = [
            "/**",
            " * @param {Boolean} a",
            " * @param {int} b",
            " * @param {String[]} c",
            " * @param {Array<number>} d",
            " * @param {{ x: string }} e",
            " */",
        ]
        .join(NL);
        let kinds: Vec<String> = types(&block).into_iter().map(|(_, k)| k).collect();
        assert_eq!(kinds, vec!["boolean", "number", "array", "array", "object"]);
    }

    #[test]
    fn keeps_the_name_of_an_optional_parameter() {
        let block = ["/**", " * @param {number} [monto=10] How much.", " */"].join(NL);
        assert_eq!(types(&block), vec![("monto".to_string(), "number".to_string())]);
    }

    #[test]
    fn a_type_this_app_cannot_render_reads_as_no_annotation() {
        let block = ["/**", " * @param {Promise<Foo>} a", " * @param b", " */"].join(NL);
        assert!(types(&block).is_empty());
    }

    #[test]
    fn finds_the_block_attached_to_a_declaration_and_only_that_one() {
        let source = ["/** @param {number} a */", "function f(a) {}"].join(NL);
        let (_, offset) = top_level_functions(&source).pop().unwrap();
        assert!(jsdoc_before(&source, offset).is_some());

        let detached = ["/** @param {number} a */", "const x = 1;", "function f(a) {}"].join(NL);
        let (_, offset) = top_level_functions(&detached).pop().unwrap();
        assert!(jsdoc_before(&detached, offset).is_none());
    }
    #[test]
    fn identifiers_are_recognised() {
        assert!(is_identifier("doSomething"));
        assert!(is_identifier("_private$1"));
        assert!(!is_identifier("2fast"));
        assert!(!is_identifier("mi funcion"));
        assert!(!is_identifier(""));
    }
}
