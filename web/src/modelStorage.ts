const STORAGE_KEY = "locallab.selectedModel";

/** Legacy browser-only model preference; migrated into SQLite app settings. */
export function getStoredModel(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearStoredModel(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore private browsing restrictions.
  }
}
