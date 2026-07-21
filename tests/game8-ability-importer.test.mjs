import assert from "node:assert/strict";
import { Game8AbilityImporter } from "../src/database/Game8AbilityImporter.js";

globalThis.DOMParser = class { parseFromString() { throw new Error("HTML not used in this test"); } };
const character = { id: "aaron", name: "アーロン" };
const repo = { getCharacter: id => id === "aaron" ? character : null, getCharacters: () => [character] };
const text = `# 〖オクトラ〗アーロンの評価とおすすめアビリティ\n### アビリティ一覧\nバトアビ\nニ連斬\n〖消費SP 26〗\n敵単体に2回の剣物理攻撃（威力90）\n〖ブースト時〗威力105/125/180\nかばう\n〖消費SP 59〗\n自身に特殊効果を付与（1ターン）\n〖ブースト時〗ターン2/3/4\nサポアビ\n力をためる`;
const parsed = Game8AbilityImporter.parse({ text, sourceUrl: "https://game8.jp/octopathtraveler-sp/793075", repo });
assert.equal(parsed.character.id, "aaron");
assert.equal(parsed.abilities.length, 2);
assert.equal(parsed.abilities[0].name, "ニ連斬");
assert.equal(parsed.abilities[0].sp, 26);
assert.equal(parsed.abilities[0].power, 90);
assert.equal(parsed.abilities[0].hits, 2);
assert.deepEqual(parsed.abilities[0].boostValues, [105,125,180]);
assert.equal(parsed.abilities[0].source.provider, "Game8");
const merged = Game8AbilityImporter.merge([], parsed.abilities, { replaceOwnerBattle: true, ownerId: "aaron" });
assert.equal(merged.report.added, 2);
console.log("Game8AbilityImporter tests passed");
