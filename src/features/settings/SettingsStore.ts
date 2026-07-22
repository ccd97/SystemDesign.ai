import type { Settings } from "./types";

export async function loadSettings(): Promise<Settings> {
  return window.settingsAPI.load();
}

export async function saveSettings(settings: Settings): Promise<void> {
  return window.settingsAPI.save(settings);
}
