//! QuickJS host for the script library.
//!
//! The engine is embedded rather than the webview's for two reasons: only an embedded one can
//! be interrupted (a runaway script must not be able to hang the app), and it behaves the same
//! on Windows, Linux and macOS, where the webview would be V8 or two different JavaScriptCore
//! versions.
//!
//! Scripts are user JavaScript, so nothing here panics on bad input: every failure comes back
//! as `ScriptOutcome::error`.

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use rquickjs::function::Func;
use rquickjs::{CatchResultExt, Context, Runtime};
use serde::{Deserialize, Serialize};

use crate::script_signature::{
    is_identifier, jsdoc_before, jsdoc_param_types, parameters, top_level_functions,
};

/// The interrupt handler fires very often, so the deadline and the cancellation flag are only
/// really checked every so many calls.
const INTERRUPT_CHECK_INTERVAL: u32 = 512;
/// A `console.log` inside a loop must not be able to eat all the memory.
const MAX_LOG_LINES: usize = 2000;
const MAX_LOG_LINE_CHARS: usize = 4000;
/// Ceiling for the whole context. Hitting it surfaces as an ordinary script error.
const MEMORY_LIMIT_BYTES: usize = 64 * 1024 * 1024;

/// One entry of the script library. The source declares the function; its name is read back
/// out of it rather than stored alongside.
#[derive(Debug, Deserialize)]
pub(crate) struct HelperDef {
    pub code: String,
}

/// One parameter of the exported function.
#[derive(Debug, Serialize)]
pub(crate) struct ParamInfo {
    pub name: String,
    /// From a JSDoc `@param`, and only when it names a type this app can render a field for.
    /// Absent means the argument stays a plain string, which is what it always was.
    #[serde(rename = "type")]
    pub kind: Option<String>,
    /// The default written in the declaration, as source text — what a blank field falls back
    /// to, which is worth showing rather than leaving the author to guess.
    pub default: Option<String>,
}

/// What a library entry's source says it is.
#[derive(Debug, Default, Serialize)]
pub(crate) struct Signature {
    pub name: Option<String>,
    pub params: Vec<ParamInfo>,
    /// Why the source does not describe a usable function.
    pub error: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct ParseScriptPayload {
    pub code: String,
}

/// The function an entry exports: the **last** top-level declaration, so private helpers can
/// be written above it. The offset is where its `function` keyword sits, which is where the
/// JSDoc block above it is looked for.
pub(crate) fn exported_function(source: &str) -> Option<(String, usize)> {
    top_level_functions(source)
        .into_iter().rfind(|(name, _)| is_identifier(name))
}

pub(crate) fn exported_name(source: &str) -> Option<String> {
    exported_function(source).map(|(name, _)| name)
}

/// Pairs the parameters the declaration lists with the types its JSDoc block declares.
///
/// The declaration is the authority on which parameters exist and in what order; JSDoc only
/// adds a type to one that is already there, so a stale `@param` for a parameter that was
/// renamed or removed is ignored rather than inventing an argument.
fn described_params(
    source: &str,
    offset: usize,
    declared: Vec<(String, Option<String>)>,
) -> Vec<ParamInfo> {
    let types = jsdoc_before(source, offset)
        .map(jsdoc_param_types)
        .unwrap_or_default();

    declared
        .into_iter()
        .map(|(name, default)| {
            let kind = types
                .iter()
                .find(|(annotated, _)| *annotated == name)
                .map(|(_, kind)| kind.clone());
            ParamInfo {
                name,
                kind,
                default,
            }
        })
        .collect()
}

/// Reads the signature, then has the engine compile the source so a syntax error is reported
/// against what the author wrote rather than surfacing later at call time.
pub(crate) fn describe(source: &str) -> Signature {
    let Some((name, offset)) = exported_function(source) else {
        return Signature {
            name: None,
            params: Vec::new(),
            error: Some("no-function".to_string()),
        };
    };

    let runtime = match Runtime::new() {
        Ok(runtime) => runtime,
        Err(error) => {
            return Signature {
                name: Some(name),
                params: Vec::new(),
                error: Some(error.to_string()),
            }
        }
    };
    let context = match Context::full(&runtime) {
        Ok(context) => context,
        Err(error) => {
            return Signature {
                name: Some(name),
                params: Vec::new(),
                error: Some(error.to_string()),
            }
        }
    };

    context.with(|ctx| {
        // `String(fn)` is the compiled function's own source, so the parameter list is split
        // from something known to be well formed.
        let probe = format!(
            "(function () {{ {source}\n; return typeof {name} === \"function\" ? String({name}) : null; }})()"
        );
        match ctx.eval::<Option<String>, _>(probe).catch(&ctx) {
            Ok(Some(text)) => Signature {
                name: Some(name),
                params: described_params(source, offset, parameters(&text)),
                error: None,
            },
            Ok(None) => Signature {
                name: Some(name),
                params: Vec::new(),
                error: Some("no-function".to_string()),
            },
            Err(error) => Signature {
                name: Some(name),
                params: Vec::new(),
                error: Some(error.to_string().trim().to_string()),
            },
        }
    })
}

#[derive(Debug, Deserialize)]
pub(crate) struct VariableSnapshot {
    pub name: String,
    pub value: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct RunScriptPayload {
    /// Shared with `cancel_request`, so the same cancel path stops a script.
    pub run_id: String,
    /// Body of the entry function. `response`, `env`, `lib` and `args` are in scope.
    pub code: String,
    #[serde(default)]
    pub helpers: Vec<HelperDef>,
    /// Arguments for the entry script, reachable as `args`.
    #[serde(default)]
    pub args: Vec<serde_json::Value>,
    /// Positions in `args` that are `undefined` rather than a value.
    ///
    /// JSON cannot say "undefined", and the difference matters: a parameter written with a
    /// default (`function f(a = 10)`) takes it for `undefined` and not for `null`.
    #[serde(default)]
    pub undefined_args: Vec<usize>,
    /// Variables the script reads through `env`. Writes never touch this.
    #[serde(default)]
    pub variables: Vec<VariableSnapshot>,
    /// Response the script reads as `response`; absent when there is none.
    #[serde(default)]
    pub response: Option<serde_json::Value>,
    pub timeout_ms: u64,
}

/// A message a script asked to show the person running it. Not `console`: that is the
/// author's debugging channel, and it stays inside the editor's output panel.
#[derive(Debug, Clone, Serialize)]
pub(crate) struct ToastLine {
    /// Empty when `ui.showToast` was called with plain text.
    pub title: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct LogLine {
    pub level: String,
    pub text: String,
}

#[derive(Debug, Serialize)]
pub(crate) struct EnvWrite {
    pub name: String,
    /// `None` when the script deleted the variable.
    pub value: Option<String>,
}

#[derive(Debug, Default, Serialize)]
pub(crate) struct ScriptOutcome {
    /// JSON of the returned value; absent when the script returned nothing.
    pub value: Option<String>,
    pub writes: Vec<EnvWrite>,
    pub logs: Vec<LogLine>,
    pub error: Option<String>,
    pub duration_ms: u64,
}

/// Everything the script sees beyond the entry arguments.
///
/// `env` reads come from `__envSeed` and writes are buffered into `__envWrites` rather than
/// calling back into Rust, so a write costs nothing and the whole set can be applied at once —
/// or dropped entirely when the script fails.
///
/// `lib` compiles each entry on first use by evaluating its source and handing back the
/// function it declares. Compiling does not run the body, which is why a library function
/// calling another one needs no cycle guard.
const PRELUDE: &str = r#"
globalThis.__envWrites = [];

function __toVariableValue(value) {
  if (value === null) return "";
  if (typeof value === "object") {
    try { return JSON.stringify(value); } catch (e) { return String(value); }
  }
  return String(value);
}

function __envRead(name) {
  for (let i = __envWrites.length - 1; i >= 0; i--) {
    if (__envWrites[i][0] === name) {
      const written = __envWrites[i][1];
      return written === null ? undefined : written;
    }
  }
  return Object.prototype.hasOwnProperty.call(__envSeed, name) ? __envSeed[name] : undefined;
}

function __envNames() {
  const names = Object.keys(__envSeed);
  for (const [name, value] of __envWrites) {
    const at = names.indexOf(name);
    if (value === null) { if (at >= 0) names.splice(at, 1); }
    else if (at < 0) names.push(name);
  }
  return names;
}

globalThis.env = new Proxy(Object.create(null), {
  get: (_t, name) => (typeof name === "string" ? __envRead(name) : undefined),
  set(_t, name, value) {
    if (typeof name !== "string") return false;
    // `env.x = undefined` reads as "there is no such variable", so it clears it — the same
    // thing `delete env.x` does. A null keeps its place as an empty value, because that is a
    // value an API actually returned.
    __envWrites.push([name, value === undefined ? null : __toVariableValue(value)]);
    return true;
  },
  deleteProperty(_t, name) {
    if (typeof name !== "string") return false;
    __envWrites.push([name, null]);
    return true;
  },
  has: (_t, name) => typeof name === "string" && __envRead(name) !== undefined,
  ownKeys: () => __envNames(),
  getOwnPropertyDescriptor: (_t, name) =>
    typeof name === "string" && __envRead(name) !== undefined
      ? { value: __envRead(name), enumerable: true, configurable: true, writable: true }
      : undefined
});

const __helperCache = Object.create(null);

globalThis.lib = new Proxy(Object.create(null), {
  get(_t, name) {
    if (typeof name !== "string") return undefined;
    if (name in __helperCache) return __helperCache[name];
    const helper = __helpers[name];
    if (!helper) throw new Error('Unknown library function: "' + name + '"');
    const fn = new Function(helper.code + "\n; return typeof " + name + " === 'function' ? " + name + " : undefined;")();
    if (typeof fn !== "function") {
      throw new Error('Library entry "' + name + '" does not declare a function called ' + name);
    }
    __helperCache[name] = fn;
    return fn;
  },
  has: (_t, name) => typeof name === "string" && name in __helpers,
  ownKeys: () => Object.keys(__helpers),
  getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true })
});

function __format(value) {
  if (typeof value === "string") return value;
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "object") {
    try { return JSON.stringify(value); } catch (e) { return String(value); }
  }
  return String(value);
}

/**
 * A script speaking to whoever ran it. Both shapes go through one host call, with an empty
 * title standing for the plain-text form.
 *
 * Deliberately unthrottled: a loop that fires eighty of these is the author's own doing, and
 * a cap would only make the honest cases harder to reason about.
 */
globalThis.ui = {
  showToast(arg) {
    if (arg !== null && typeof arg === "object") {
      __toast(__format(arg.title === undefined ? "" : arg.title), __format(arg.message));
    } else {
      __toast("", __format(arg));
    }
  }
};

globalThis.console = {
  log: (...parts) => __log("log", parts.map(__format).join(" ")),
  info: (...parts) => __log("log", parts.map(__format).join(" ")),
  warn: (...parts) => __log("warn", parts.map(__format).join(" ")),
  error: (...parts) => __log("error", parts.map(__format).join(" "))
};
"#;

/// Wraps the user's code in the entry function.
///
/// The prefix deliberately carries no newline, so line 1 of the user's code is line 1 of what
/// QuickJS compiles and reported line numbers match what they wrote. Only the column on the
/// first line is shifted.
fn wrap_entry(code: &str) -> String {
    format!(
        "(function () {{ const __result = (function (response, env, lib, args) {{{code}\n}})(__response, env, lib, __args); return __result === undefined ? null : JSON.stringify(__result); }})()"
    )
}

/// Keyed by the name each entry's source declares. An entry that declares nothing usable is
/// left out, so calling it fails with "Unknown library function" instead of something obscure.
fn helper_table(helpers: &[HelperDef]) -> String {
    let mut map = serde_json::Map::new();
    for helper in helpers {
        let Some(name) = exported_name(&helper.code) else {
            continue;
        };
        map.insert(name, serde_json::json!({ "code": helper.code }));
    }
    serde_json::Value::Object(map).to_string()
}

fn variable_seed(variables: &[VariableSnapshot]) -> String {
    let mut map = serde_json::Map::new();
    for variable in variables {
        let name = variable.name.trim();
        if name.is_empty() {
            continue;
        }
        map.insert(
            name.to_string(),
            serde_json::Value::String(variable.value.clone()),
        );
    }
    serde_json::Value::Object(map).to_string()
}

fn parse_env_writes(raw: &str) -> Vec<EnvWrite> {
    let Ok(serde_json::Value::Array(entries)) = serde_json::from_str::<serde_json::Value>(raw)
    else {
        return Vec::new();
    };
    entries
        .into_iter()
        .filter_map(|entry| {
            let pair = entry.as_array()?;
            let name = pair.first()?.as_str()?.trim().to_string();
            if name.is_empty() {
                return None;
            }
            let value = match pair.get(1) {
                Some(serde_json::Value::Null) | None => None,
                Some(other) => Some(other.as_str().unwrap_or_default().to_string()),
            };
            Some(EnvWrite { name, value })
        })
        .collect()
}

/// Runs `payload` to completion. `cancel` is polled from the interrupt handler; `on_log` and
/// `on_toast` are called as each is written, so the UI shows them while the script is going.
pub(crate) fn run_script(
    payload: RunScriptPayload,
    cancel: Arc<dyn Fn() -> bool + Send + Sync>,
    on_log: Arc<dyn Fn(&LogLine) + Send + Sync>,
    on_toast: Arc<dyn Fn(&ToastLine) + Send + Sync>,
) -> ScriptOutcome {
    let started = Instant::now();
    let mut outcome = ScriptOutcome::default();

    let runtime = match Runtime::new() {
        Ok(runtime) => runtime,
        Err(error) => {
            outcome.error = Some(error.to_string());
            return outcome;
        }
    };
    runtime.set_memory_limit(MEMORY_LIMIT_BYTES);

    let deadline = Instant::now() + Duration::from_millis(payload.timeout_ms.max(1));
    let mut ticks: u32 = 0;
    runtime.set_interrupt_handler(Some(Box::new(move || {
        ticks = ticks.wrapping_add(1);
        if !ticks.is_multiple_of(INTERRUPT_CHECK_INTERVAL) {
            return false;
        }
        Instant::now() >= deadline || cancel()
    })));

    let context = match Context::full(&runtime) {
        Ok(context) => context,
        Err(error) => {
            outcome.error = Some(error.to_string());
            return outcome;
        }
    };

    let logs: Arc<Mutex<Vec<LogLine>>> = Arc::new(Mutex::new(Vec::new()));
    let response_json = payload
        .response
        .as_ref()
        .map(|value| value.to_string())
        .unwrap_or_else(|| "null".to_string());
    let args_json = serde_json::Value::Array(payload.args).to_string();
    let undefined_args_json = serde_json::Value::Array(
        payload
            .undefined_args
            .iter()
            .map(|index| serde_json::json!(index))
            .collect(),
    )
    .to_string();

    let collector = logs.clone();
    let result: Result<(Option<String>, String), String> = context.with(|ctx| {
        let globals = ctx.globals();
        globals
            .set("__helperTableJson", helper_table(&payload.helpers))
            .and_then(|()| globals.set("__envSeedJson", variable_seed(&payload.variables)))
            .and_then(|()| globals.set("__responseJson", response_json))
            .and_then(|()| globals.set("__argsJson", args_json))
            .and_then(|()| globals.set("__undefinedArgsJson", undefined_args_json))
            .and_then(|()| {
                globals.set(
                    "__toast",
                    Func::from(move |title: String, message: String| {
                        on_toast(&ToastLine { title, message });
                    }),
                )
            })
            .and_then(|()| {
                globals.set(
                    "__log",
                    Func::from(move |level: String, text: String| {
                        let mut lines = match collector.lock() {
                            Ok(lines) => lines,
                            Err(_) => return,
                        };
                        if lines.len() >= MAX_LOG_LINES {
                            return;
                        }
                        let text = if text.chars().count() > MAX_LOG_LINE_CHARS {
                            text.chars().take(MAX_LOG_LINE_CHARS).collect::<String>() + "…"
                        } else {
                            text
                        };
                        let line = LogLine { level, text };
                        on_log(&line);
                        lines.push(line);
                    }),
                )
            })
            .map_err(|error| error.to_string())?;

        // Parsed here rather than in Rust so the script sees ordinary JS values.
        ctx.eval::<(), _>(
            "globalThis.__helpers = JSON.parse(__helperTableJson);\
             globalThis.__envSeed = JSON.parse(__envSeedJson);\
             globalThis.__response = JSON.parse(__responseJson);\
             globalThis.__args = JSON.parse(__argsJson);             for (const __i of JSON.parse(__undefinedArgsJson)) __args[__i] = undefined;",
        )
        .catch(&ctx)
        .map_err(|error| error.to_string())?;

        ctx.eval::<(), _>(PRELUDE)
            .catch(&ctx)
            .map_err(|error| error.to_string())?;

        let value = ctx
            .eval::<Option<String>, _>(wrap_entry(&payload.code))
            .catch(&ctx)
            .map_err(|error| error.to_string())?;

        // Read whatever the script managed to buffer, even though a failed run discards it —
        // the caller decides, this only reports.
        let writes = ctx
            .eval::<String, _>("JSON.stringify(__envWrites)")
            .catch(&ctx)
            .map_err(|error| error.to_string())?;

        Ok((value, writes))
    });

    outcome.logs = logs.lock().map(|lines| lines.clone()).unwrap_or_default();
    outcome.duration_ms = started.elapsed().as_millis() as u64;

    match result {
        Ok((value, writes)) => {
            outcome.value = value;
            outcome.writes = parse_env_writes(&writes);
        }
        // A script that failed halfway leaves no writes behind: half-applied variables are
        // impossible to reason about.
        Err(error) => outcome.error = Some(error.trim().to_string()),
    }

    outcome
}

#[cfg(test)]
mod tests {
    use super::*;

    const NL: &str = "
";

    fn noop_cancel() -> Arc<dyn Fn() -> bool + Send + Sync> {
        Arc::new(|| false)
    }

    fn noop_log() -> Arc<dyn Fn(&LogLine) + Send + Sync> {
        Arc::new(|_| {})
    }

    fn noop_toast() -> Arc<dyn Fn(&ToastLine) + Send + Sync> {
        Arc::new(|_| {})
    }

    /// Runs `payload` and returns the toasts it asked for, in order.
    fn toasts(code: &str) -> Vec<(String, String)> {
        let collected: Arc<Mutex<Vec<(String, String)>>> = Arc::new(Mutex::new(Vec::new()));
        let sink = collected.clone();
        run_script(
            payload(code),
            noop_cancel(),
            noop_log(),
            Arc::new(move |line: &ToastLine| {
                if let Ok(mut all) = sink.lock() {
                    all.push((line.title.clone(), line.message.clone()));
                }
            }),
        );
        let all = collected.lock().unwrap().clone();
        all
    }

    fn payload(code: &str) -> RunScriptPayload {
        RunScriptPayload {
            run_id: "test".to_string(),
            code: code.to_string(),
            helpers: Vec::new(),
            args: Vec::new(),
            undefined_args: Vec::new(),
            variables: Vec::new(),
            response: None,
            timeout_ms: 5_000,
        }
    }

    fn run(payload: RunScriptPayload) -> ScriptOutcome {
        run_script(payload, noop_cancel(), noop_log(), noop_toast())
    }

    #[test]
    fn returns_json_of_the_returned_value() {
        let outcome = run(payload("return { a: [1, 2], b: 'x' };"));
        assert_eq!(outcome.error, None);
        assert_eq!(outcome.value.as_deref(), Some(r#"{"a":[1,2],"b":"x"}"#));
    }

    #[test]
    fn a_script_returning_nothing_has_no_value() {
        let outcome = run(payload("const unused = 1;"));
        assert_eq!(outcome.error, None);
        assert_eq!(outcome.value, None);
    }

    #[test]
    fn reads_the_response_with_json_already_parsed() {
        let mut input = payload("return response.body.token;");
        input.response = Some(serde_json::json!({ "body": { "token": "abc" } }));
        assert_eq!(run(input).value.as_deref(), Some(r#""abc""#));
    }

    #[test]
    fn collects_env_writes_in_order_and_stringifies_objects() {
        let mut input = payload(
            "env['dni'] = 12345678; env['datos'] = { nombre: 'Ada' }; delete env['viejo'];",
        );
        input.variables = vec![VariableSnapshot {
            name: "viejo".to_string(),
            value: "x".to_string(),
        }];
        let outcome = run(input);
        assert_eq!(outcome.error, None);
        let writes: Vec<(String, Option<String>)> = outcome
            .writes
            .into_iter()
            .map(|write| (write.name, write.value))
            .collect();
        assert_eq!(
            writes,
            vec![
                ("dni".to_string(), Some("12345678".to_string())),
                ("datos".to_string(), Some(r#"{"nombre":"Ada"}"#.to_string())),
                ("viejo".to_string(), None),
            ]
        );
    }

    #[test]
    fn assigning_undefined_clears_a_variable_but_null_keeps_it_empty() {
        let outcome = run(payload("env['a'] = undefined; env['b'] = null;"));
        let writes: Vec<(String, Option<String>)> = outcome
            .writes
            .into_iter()
            .map(|write| (write.name, write.value))
            .collect();
        assert_eq!(
            writes,
            vec![
                ("a".to_string(), None),
                ("b".to_string(), Some(String::new())),
            ]
        );
    }

    #[test]
    fn an_undefined_argument_lets_a_declared_default_apply() {
        let mut input = payload("return args[0];");
        input.args = vec![serde_json::Value::Null];
        input.undefined_args = vec![0];
        // JSON carried a null; the position list is what turns it back into undefined, so a
        // parameter written with a default takes it.
        assert_eq!(run(input).value, None);
    }

    #[test]
    fn a_library_default_applies_when_the_argument_was_left_blank() {
        let mut input = payload("return lib.randomish(args[0]);");
        input.helpers = vec![HelperDef {
            code: "function randomish(a = 10) { return a; }".to_string(),
        }];
        input.args = vec![serde_json::Value::Null];
        input.undefined_args = vec![0];
        assert_eq!(run(input).value.as_deref(), Some("10"));
    }

    #[test]
    fn env_reads_see_the_seed_and_earlier_writes() {
        let mut input = payload("const before = env['base']; env['base'] = 'nuevo'; return [before, env['base']];");
        input.variables = vec![VariableSnapshot {
            name: "base".to_string(),
            value: "viejo".to_string(),
        }];
        assert_eq!(run(input).value.as_deref(), Some(r#"["viejo","nuevo"]"#));
    }

    #[test]
    fn library_functions_take_declared_params_and_can_call_each_other() {
        let mut input = payload("return lib.cuil('1234567', 'F');");
        input.helpers = vec![
            HelperDef {
                code: "function pad(n, len) { return String(n).padStart(len, '0'); }".to_string(),
            },
            HelperDef {
                code: "function cuil(dni, gender) { return (gender === 'F' ? 27 : 20) + '-' + lib.pad(dni, 8) + '-9'; }"
                    .to_string(),
            },
        ];
        assert_eq!(run(input).value.as_deref(), Some(r#""27-01234567-9""#));
    }

    #[test]
    fn args_reach_the_entry_script() {
        let mut input = payload("return args[0] + args[1];");
        input.args = vec![serde_json::json!("a"), serde_json::json!("b")];
        assert_eq!(run(input).value.as_deref(), Some(r#""ab""#));
    }

    #[test]
    fn ui_show_toast_takes_plain_text_or_a_title_and_message() {
        assert_eq!(
            toasts("ui.showToast('listo'); ui.showToast({ title: 'Falló', message: 'sin token' });"),
            vec![
                (String::new(), "listo".to_string()),
                ("Falló".to_string(), "sin token".to_string()),
            ]
        );
    }

    #[test]
    fn a_toast_formats_what_it_is_given_the_way_console_does() {
        assert_eq!(
            toasts("ui.showToast({ message: { a: 1 } }); ui.showToast(42);"),
            vec![
                (String::new(), r#"{"a":1}"#.to_string()),
                (String::new(), "42".to_string()),
            ]
        );
    }

    #[test]
    fn toasts_are_not_capped() {
        // Deliberate: a loop firing eighty of these is the author's own doing, and a throttle
        // would only make the honest cases harder to reason about.
        assert_eq!(toasts("for (let i = 0; i < 80; i++) ui.showToast('x');").len(), 80);
    }

    #[test]
    fn console_output_is_collected_with_levels() {
        let outcome = run(payload(
            "console.log('hola', { a: 1 }); console.error('mal');",
        ));
        let lines: Vec<(String, String)> = outcome
            .logs
            .into_iter()
            .map(|line| (line.level, line.text))
            .collect();
        assert_eq!(
            lines,
            vec![
                ("log".to_string(), r#"hola {"a":1}"#.to_string()),
                ("error".to_string(), "mal".to_string()),
            ]
        );
    }

    #[test]
    fn a_failing_script_reports_the_error_and_applies_nothing() {
        let outcome = run(payload("env['a'] = 1;\nnope.boom();"));
        let error = outcome.error.expect("script should have failed");
        assert!(error.contains("nope is not defined"), "{error}");
        // The line the user wrote it on, not the wrapper's.
        assert!(error.contains(":2:"), "{error}");
        assert_eq!(outcome.value, None);
    }

    #[test]
    fn an_entry_is_registered_under_the_name_its_source_declares() {
        let mut input = payload("return lib.saludar('Ada');");
        input.helpers = vec![HelperDef {
            code: "function saludar(quien) { return 'hola ' + quien; }".to_string(),
        }];
        assert_eq!(run(input).value.as_deref(), Some(r#""hola Ada""#));
    }

    #[test]
    fn private_helpers_can_be_declared_above_the_exported_one() {
        let mut input = payload("return lib.cuil('1234567');");
        input.helpers = vec![HelperDef {
            code: "function pad(n) { return String(n).padStart(8, '0'); }
function cuil(dni) { return '20-' + pad(dni) + '-9'; }"
                .to_string(),
        }];
        assert_eq!(run(input).value.as_deref(), Some(r#""20-01234567-9""#));
    }

    fn param_names(signature: &Signature) -> Vec<&str> {
        signature.params.iter().map(|p| p.name.as_str()).collect()
    }

    fn param_types(signature: &Signature) -> Vec<Option<&str>> {
        signature.params.iter().map(|p| p.kind.as_deref()).collect()
    }

    #[test]
    fn describe_reads_the_name_and_parameters_out_of_the_source() {
        let signature = describe("function doSomething(nrodoc, gender = 'M') {
  return 1;
}");
        assert_eq!(signature.name.as_deref(), Some("doSomething"));
        assert_eq!(param_names(&signature), vec!["nrodoc", "gender"]);
        assert_eq!(signature.error, None);
    }

    #[test]
    fn describe_reads_types_from_a_jsdoc_block_above_the_declaration() {
        let source = [
            "/**",
            " * @param {string} dni - With or without dots.",
            " * @param {number} monto",
            " * @param {object} filtros",
            " */",
            "function calcular(dni, monto, filtros, extra) { return 1; }",
        ]
        .join(NL);
        let signature = describe(&source);
        assert_eq!(param_names(&signature), vec!["dni", "monto", "filtros", "extra"]);
        // `extra` was never annotated, so it stays untyped rather than guessing.
        assert_eq!(
            param_types(&signature),
            vec![Some("string"), Some("number"), Some("object"), None]
        );
    }

    #[test]
    fn describe_ignores_a_jsdoc_param_the_declaration_no_longer_lists() {
        let source = [
            "/**",
            " * @param {number} renamedAway",
            " */",
            "function calcular(monto) { return monto; }",
        ]
        .join(NL);
        let signature = describe(&source);
        assert_eq!(param_names(&signature), vec!["monto"]);
        assert_eq!(param_types(&signature), vec![None]);
    }

    #[test]
    fn describe_ignores_a_comment_that_is_not_attached_to_the_declaration() {
        let source = [
            "/**",
            " * @param {number} monto",
            " */",
            "const unrelated = 1;",
            "",
            "function calcular(monto) { return monto; }",
        ]
        .join(NL);
        assert_eq!(param_types(&describe(&source)), vec![None]);
    }

    #[test]
    fn describe_reports_source_that_declares_no_function() {
        let signature = describe("const f = (a) => a;");
        assert_eq!(signature.name, None);
        assert_eq!(signature.error.as_deref(), Some("no-function"));
    }

    #[test]
    fn describe_reports_a_syntax_error_from_the_engine() {
        let signature = describe("function broken(a) { return a");
        assert!(signature.error.is_some());
    }

    #[test]
    fn an_endless_loop_is_stopped_by_the_timeout() {
        let mut input = payload("while (true) {}");
        input.timeout_ms = 200;
        let started = Instant::now();
        let outcome = run(input);
        assert!(outcome.error.is_some());
        assert!(
            started.elapsed() < Duration::from_secs(5),
            "the timeout did not stop the script"
        );
    }

    #[test]
    fn cancellation_stops_a_running_script() {
        let mut input = payload("while (true) {}");
        input.timeout_ms = 60_000;
        let outcome = run_script(input, Arc::new(|| true), noop_log(), noop_toast());
        assert!(outcome.error.is_some());
    }
}
