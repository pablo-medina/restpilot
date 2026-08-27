import { beforeEach, describe, expect, it, vi } from "vitest";
import { mountBodyEditor, scriptCompletions, type LibraryCompletion } from "./large-text-editor";
import { pushToast } from "../react/components/Toast";

vi.mock("../react/components/Toast", () => ({ pushToast: vi.fn() }));

function mount(rawType: "json" | "text", initial: string) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  let value = initial;
  const cleanup = mountBodyEditor(host, initial, {
    tabSize: 2,
    rawType,
    onChange: (next) => {
      value = next;
    }
  });
  return {
    host,
    cleanup,
    value: () => value,
    pressFormatShortcut() {
      const content = host.querySelector(".cm-content") as HTMLElement;
      const event = new KeyboardEvent("keydown", {
        key: "F",
        code: "KeyF",
        keyCode: 70,
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true
      });
      content.dispatchEvent(event);
      return event;
    }
  };
}

describe("body editor Ctrl+Shift+F", () => {
  beforeEach(() => {
    vi.mocked(pushToast).mockClear();
  });

  it("formats a JSON body", () => {
    const editor = mount("json", '{"a":1,"b":[1,2]}');
    const event = editor.pressFormatShortcut();

    expect(event.defaultPrevented).toBe(true);
    expect(editor.value()).toBe('{\n  "a": 1,\n  "b": [\n    1,\n    2\n  ]\n}');
    expect(pushToast).not.toHaveBeenCalled();
    editor.cleanup();
  });

  it("reports a body that is not valid JSON instead of doing nothing", () => {
    const editor = mount("json", '{\\"a\\":1}');
    editor.pressFormatShortcut();

    expect(editor.value()).toBe('{\\"a\\":1}');
    expect(pushToast).toHaveBeenCalledTimes(1);
    editor.cleanup();
  });

  it("leaves a plain-text body alone", () => {
    const editor = mount("text", '{"a":1}');
    editor.pressFormatShortcut();

    expect(editor.value()).toBe('{"a":1}');
    expect(pushToast).not.toHaveBeenCalled();
    editor.cleanup();
  });
});

describe("scriptCompletions", () => {
  /** Enough of a `CompletionContext` for the source: what it reads is `matchBefore`. */
  function contextFor(before: string, explicit = false) {
    return {
      explicit,
      matchBefore(expression: RegExp) {
        const anchored = new RegExp(expression.source + "$");
        const found = anchored.exec(before);
        if (!found) return null;
        return { from: before.length - found[0].length, to: before.length, text: found[0] };
      }
    } as unknown as Parameters<ReturnType<typeof scriptCompletions>>[0];
  }

  function entry(name: string, signature = "()"): LibraryCompletion {
    return { name, signature, takesArguments: signature !== "()" };
  }

  function complete(before: string, library: LibraryCompletion[] = [], explicit = false) {
    return scriptCompletions(() => library)(contextFor(before, explicit));
  }

  function labels(before: string, library: LibraryCompletion[] = [], explicit = false) {
    return complete(before, library, explicit)?.options.map((option) => option.label) ?? null;
  }

  it("offers what the engine puts in scope", () => {
    expect(labels("  en")).toEqual(["env", "lib", "response", "args", "console", "ui"]);
  });

  it("offers the one thing on `ui`", () => {
    expect(labels("  ui.")).toEqual(["showToast"]);
  });

  it("offers the library by name after lib.", () => {
    expect(labels("  lib.", [entry("cuil"), entry("pad")])).toEqual(["cuil", "pad"]);
  });

  it("shows each function's signature beside its name", () => {
    const options = complete("  lib.", [entry("cuil", "(dni: string, monto: number)")])?.options;
    expect(options?.[0].detail).toBe("(dni: string, monto: number)");
  });

  it("offers the response properties a script can read", () => {
    expect(labels("  response.")).toEqual(["status", "statusText", "headers", "body"]);
  });

  it("offers the console methods", () => {
    expect(labels("  console.")).toEqual(["log", "warn", "error"]);
  });

  it("replaces only what follows the dot", () => {
    const before = "  response.sta";
    const result = complete(before);
    expect(before.slice(result!.from)).toBe("sta");
  });

  it("says nothing about something it knows nothing about", () => {
    expect(labels("  Math.")).toBeNull();
    // An empty library has nothing to offer either: no list beats an empty one.
    expect(labels("  lib.")).toBeNull();
  });

  it("stays quiet on an empty position unless asked", () => {
    expect(labels("  ")).toBeNull();
  });
});
