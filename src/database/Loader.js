const DATA_BASE_URL = new URL("../../data/", import.meta.url);

export async function loadJson(relativePath) {
  const url = new URL(relativePath, DATA_BASE_URL);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${url.pathname}: HTTP ${response.status}`);
  try {
    return await response.json();
  } catch (error) {
    throw new Error(`${url.pathname}: JSON解析失敗 (${error.message})`);
  }
}

export async function loadDatabase() {
  const [characters, abilities, effectRules, enemies, damageRules, equipment] = await Promise.all([
    loadJson("characters/characters.json"),
    loadJson("abilities/abilities.json"),
    loadJson("system/effect-rules.json"),
    loadJson("system/enemies.json"),
    loadJson("system/damage-rules.json"),
    loadJson("equipment/equipment.json")
  ]);

  return { characters, abilities, effectRules, enemies, damageRules, equipment };
}
