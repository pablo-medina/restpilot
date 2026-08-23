/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useReducer } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { state } from "../../app/state";
import { defaultConfig, type SavedRequest } from "../../types";
import { RequestEditor } from "./RequestEditor";

function request(url = ""): SavedRequest {
  return {
    id: "r1",
    kind: "request",
    parentId: "/",
    title: "Test",
    method: "GET",
    url,
    urlHash: "",
    queryParams: [],
    headers: [],
    bodyMode: "none",
    rawType: "json",
    body: "",
    form: [],
    streamResponse: false,
    auth: { type: "none" },
    lastResponse: null,
    lastError: null
  };
}

/** The real `refresh` re-renders the editor, which is how the field gets a fresh `composed`. */
function Host() {
  const [, bump] = useReducer((count: number) => count + 1, 0);
  return <RequestEditor refresh={bump} />;
}

function mount(target: SavedRequest) {
  Object.assign(state, {
    ...defaultConfig(),
    items: [target],
    openTabs: [target.id],
    activeTabId: target.id
  });
  render(<Host />);
  return document.getElementById("url") as HTMLInputElement;
}

/** `userEvent` reads `{` as the start of a special-key sequence and `{{` as one literal brace. */
function literal(text: string) {
  return text.replace(/\{/g, "{{");
}

describe("URL field", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
  });

  afterEach(cleanup);

  it("types a path template through without rewriting itself", async () => {
    const user = userEvent.setup();
    const target = request();
    const field = mount(target);

    await user.click(field);
    await user.keyboard(literal("https://x.test/posts/{{?numPost}}"));

    expect(field.value).toBe("https://x.test/posts/{{?numPost}}");
    expect(target.url).toBe("https://x.test/posts/{{?numPost}}");
    expect(target.queryParams).toEqual([]);
  });

  it("survives backspacing the closing braces and retyping them", async () => {
    const user = userEvent.setup();
    const target = request("https://x.test/posts/{{?numPost}}");
    const field = mount(target);

    await user.click(field);
    await user.keyboard("{End}{Backspace}{Backspace}");
    expect(field.value).toBe("https://x.test/posts/{{?numPost");

    await user.keyboard("}}");
    expect(field.value).toBe("https://x.test/posts/{{?numPost}}");
    expect(target.queryParams).toEqual([]);
  });

  it("still splits a real query typed after a path template", async () => {
    const user = userEvent.setup();
    const target = request("https://x.test/posts/{{?numPost}}");
    const field = mount(target);

    await user.click(field);
    await user.keyboard("{End}?full=1");

    expect(target.url).toBe("https://x.test/posts/{{?numPost}}");
    expect(target.queryParams.map((pair) => [pair.key, pair.value])).toEqual([["full", "1"]]);
  });

  it("keeps a template typed into a query value readable", async () => {
    const user = userEvent.setup();
    const target = request("https://x.test/posts?id=");
    const field = mount(target);

    await user.click(field);
    await user.keyboard(`{End}${literal("{{?numPost}}")}`);

    expect(field.value).toBe("https://x.test/posts?id={{?numPost}}");
    expect(target.queryParams.map((pair) => [pair.key, pair.value])).toEqual([["id", "{{?numPost}}"]]);
  });

  it("shows the canonical URL again once focus leaves", async () => {
    const user = userEvent.setup();
    const target = request();
    const field = mount(target);

    await user.click(field);
    await user.keyboard("https://x.test/posts?b=2&a=1");
    await user.tab();

    expect(field.value).toBe("https://x.test/posts?b=2&a=1");
    expect(target.queryParams.map((pair) => pair.key)).toEqual(["b", "a"]);
  });
});
