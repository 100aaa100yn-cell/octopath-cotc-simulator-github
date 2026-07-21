import fs from "node:fs";
import assert from "node:assert/strict";
import { Repository } from "../src/database/Repository.js";
import { DataQualityManager } from "../src/engine/DataQualityManager.js";
const read = path => JSON.parse(fs.readFileSync(new URL(path, import.meta.url), "utf8"));
const repo = new Repository({
  characters: read("../data/characters/characters.json"),
  abilities: read("../data/abilities/abilities.json"),
  enemies: read("../data/system/enemies.json"),
  equipment: [], effectRules: {}, damageRules: {}
});
for (const character of repo.getCharacters()) {
  const abilities = repo.getAbilities(character.id);
  assert.ok(abilities.filter(a => a.category === "battle").length >= 3);
  assert.ok(abilities.some(a => a.category === "ultimate"));
  assert.ok(abilities.some(a => a.category === "ex"));
}
const summary = new DataQualityManager(repo).summary();
assert.equal(summary.totalCharacters, 276);
assert.ok(summary.missingAbilities > 0);
console.log("DataQualityManager tests passed.");
