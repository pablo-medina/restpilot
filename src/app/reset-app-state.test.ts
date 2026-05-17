import { describe, expect, it } from "vitest";
import { defaultConfig, defaultSettings } from "../types";
import { defaultRuntimeState, resetAppStateToDefaults } from "./reset-app-state";
import type { AppState } from "./state";

function mockPopulatedState(): AppState {
  return {
    items: [{ id: "1", kind: "folder", parentId: null, title: "X", expanded: true }],
    variables: [{ id: "v1", name: "a", value: "b", enabled: true }],
    environments: [{ id: "e1", name: "Prod", variables: [] }],
    activeEnvironmentId: "e1",
    openTabs: ["1"],
    activeTabId: "1",
    settings: {
      ...defaultSettings(),
      theme: "dark",
      language: "es",
      proxy: { mode: "manual", httpProxy: "http://x", httpsProxy: "", noProxy: "x", authMode: "ntlm" },
      proxyTestUrl: "https://example.com"
    },
    tabs: { "1": { requestId: "1", response: null, error: null, loading: false, streaming: false, requestRunId: null, selectedResponseTab: "body", selectedRequestTab: "body" } },
    activePanel: "settings",
    selectedTreeId: "1",
    editingTreeId: "1",
    autoTitleFromUrlId: "1",
    pendingCurl: null,
    contextMenu: null,
    previousPanel: "variables",
    openRequestPopover: "environment",
    envManageSelectedId: "e1",
    variablesWorkspaceTab: "environments",
    collectionSearchQuery: "find me",
    collectionSidebarOpen: false
  };
}

describe("resetAppStateToDefaults", () => {
  it("resets persisted data and settings to factory defaults", () => {
    const state = mockPopulatedState();
    resetAppStateToDefaults(state);
    const expected = defaultConfig();
    expect(state.items).toEqual(expected.items);
    expect(state.variables).toEqual(expected.variables);
    expect(state.environments).toEqual(expected.environments);
    expect(state.settings).toEqual(expected.settings);
    expect(state.openTabs).toEqual(expected.openTabs);
  });

  it("resets runtime-only fields", () => {
    const state = mockPopulatedState();
    resetAppStateToDefaults(state);
    expect(state).toMatchObject(defaultRuntimeState());
  });
});
