const STORAGE_KEY = "locallab.selectedModel";

export function getStoredModel(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredModel(model: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, model);
  } catch {
    // Ignore quota errors and private browsing restrictions.
  }
}
