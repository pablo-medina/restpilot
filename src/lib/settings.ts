/** How much of the app to re-render after a settings mutation. */
export type SettingsChangeScope = "full" | "content" | "persist";

export type SettingsTabId = "general" | "editor" | "network" | "about";

/** Clears settings-panel session state after Clear all data. */
export function resetSettingsSessionState() {
  // React SettingsPanel owns proxy reveal/test UI state locally.
}
