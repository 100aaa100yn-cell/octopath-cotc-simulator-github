export class StateManager {
  constructor(storageKey = "octopath-cotc-simulator-v1") {
    this.storageKey = storageKey;
  }

  save(state) {
    localStorage.setItem(this.storageKey, JSON.stringify({
      version: 1,
      savedAt: new Date().toISOString(),
      state
    }));
  }

  load() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return null;
      const payload = JSON.parse(raw);
      return payload?.state ?? null;
    } catch {
      return null;
    }
  }

  clear() {
    localStorage.removeItem(this.storageKey);
  }

  encodeShareState(state) {
    const json = JSON.stringify(state);
    const bytes = new TextEncoder().encode(json);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary)
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");
  }

  decodeShareState(value) {
    try {
      const normalized = value
        .replaceAll("-", "+")
        .replaceAll("_", "/")
        .padEnd(Math.ceil(value.length / 4) * 4, "=");
      const binary = atob(normalized);
      const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return null;
    }
  }

  createShareUrl(state) {
    const url = new URL(location.href);
    url.searchParams.set("share", this.encodeShareState(state));
    return url.toString();
  }

  readShareState() {
    const value = new URL(location.href).searchParams.get("share");
    return value ? this.decodeShareState(value) : null;
  }
}