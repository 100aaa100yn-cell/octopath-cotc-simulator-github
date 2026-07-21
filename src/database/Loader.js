export async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
}

export async function loadDatabase() {
  const [characters, abilities, effectRules, enemies, damageRules] = await Promise.all([
    loadJson("data/characters/characters.json"),
    loadJson("data/abilities/abilities.json"),
    loadJson("data/system/effect-rules.json"),
    loadJson("data/system/enemies.json"),
    loadJson("data/system/damage-rules.json")
  ]);

  return { characters, abilities, effectRules, enemies, damageRules };
}