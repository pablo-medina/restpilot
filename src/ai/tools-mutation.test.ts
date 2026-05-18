import { beforeEach, describe, expect, it } from "vitest";
import { executeAiTool } from "./tools";
import { state } from "../app/state";
import { defaultConfig } from "../types";

describe("ai request mutation tools", () => {
  beforeEach(() => {
    const config = defaultConfig();
    state.items = config.items;
  });

  it("create_request_draft dedupes same title url method", async () => {
    const args = JSON.stringify({
      title: "LM Studio models",
      method: "GET",
      url: "http://127.0.0.1:1234/v1/models"
    });
    const first = JSON.parse(await executeAiTool("create_request_draft", args)) as {
      created: boolean;
      request_id: string;
    };
    expect(first.created).toBe(true);

    const second = JSON.parse(await executeAiTool("create_request_draft", args)) as {
      already_exists: boolean;
      request_id: string;
    };
    expect(second.already_exists).toBe(true);
    expect(second.request_id).toBe(first.request_id);
    expect(state.items.filter((i) => i.kind === "request")).toHaveLength(1);
  });

  it("create_request_draft resolves parent_path at root", async () => {
    state.items.push({
      id: "folder-or",
      kind: "folder",
      parentId: "/",
      title: "OpenRouter",
      expanded: true
    });

    const created = JSON.parse(
      await executeAiTool(
        "create_request_draft",
        JSON.stringify({
          title: "Models",
          method: "GET",
          url: "https://openrouter.ai/api/v1/models",
          parent_path: "/OpenRouter"
        })
      )
    ) as { created: boolean; request_id: string };

    expect(created.created).toBe(true);
    const item = state.items.find((i) => i.id === created.request_id);
    expect(item?.kind === "request" && item.parentId).toBe("folder-or");
  });

  it("create_request_draft resolves /Prueba parent_path", async () => {
    state.items.push({
      id: "folder-p",
      kind: "folder",
      parentId: "/",
      title: "Prueba",
      expanded: true
    });

    const created = JSON.parse(
      await executeAiTool(
        "create_request_draft",
        JSON.stringify({
          title: "Test",
          method: "GET",
          url: "https://example.com",
          parent_id: "/Prueba"
        })
      )
    ) as { created: boolean };

    expect(created.created).toBe(true);
  });

  it("create_request_draft auto-creates missing parent_path folder", async () => {
    const created = JSON.parse(
      await executeAiTool(
        "create_request_draft",
        JSON.stringify({
          title: "JSONPlaceholder item",
          method: "GET",
          url: "https://jsonplaceholder.typicode.com/posts/1",
          parent_path: "/data"
        })
      )
    ) as {
      created: boolean;
      parent_path: string;
      folders_created?: Array<{ path: string }>;
    };

    expect(created.created).toBe(true);
    expect(created.parent_path).toBe("/data");
    expect(created.folders_created?.some((entry) => entry.path === "/data")).toBe(true);
    expect(state.items.some((item) => item.kind === "folder" && item.title === "data")).toBe(true);
  });

  it("create_folder accepts parent_path as full folder path", async () => {
    const result = JSON.parse(await executeAiTool("create_folder", JSON.stringify({ parent_path: "/data" }))) as {
      created: boolean;
      path: string;
    };
    expect(result.path).toBe("/data");
    expect(state.items.some((item) => item.kind === "folder" && item.title === "data")).toBe(true);
  });

  it("update_request sets body on existing request", async () => {
    const created = JSON.parse(
      await executeAiTool(
        "create_request_draft",
        JSON.stringify({ title: "Test", method: "POST", url: "http://127.0.0.1:1234/v1/chat/completions" })
      )
    ) as { request_id: string };

    const updated = JSON.parse(
      await executeAiTool(
        "update_request",
        JSON.stringify({
          request_id: created.request_id,
          body_mode: "raw",
          raw_type: "json",
          body: '{"model":"local"}'
        })
      )
    ) as { updated: boolean; has_body: boolean };

    expect(updated.updated).toBe(true);
    expect(updated.has_body).toBe(true);
    const item = state.items.find((i) => i.id === created.request_id);
    expect(item?.kind === "request" && JSON.parse(item.body)).toEqual({ model: "local" });
  });
});
