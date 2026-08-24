import { beforeEach, describe, expect, it, vi } from "vitest";
import { mountBodyEditor } from "./large-text-editor";
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
