import fs from 'node:fs';
import assert from 'node:assert/strict';

const characters = JSON.parse(fs.readFileSync(new URL('../data/characters/characters.json', import.meta.url)));
const abilities = JSON.parse(fs.readFileSync(new URL('../data/abilities/abilities.json', import.meta.url)));
const names = ['アーロン', 'ヴィオラEx2', '黒蝕の剣士', '最終皇帝(男)', 'レイメ'];
for (const name of names) {
  const character = characters.find(item => item.name === name);
  assert.ok(character, `${name} が見つかりません`);
  assert.equal(character.battleIds.length, 10, `${name} のバトルアビリティ数`);
  const owned = abilities.filter(item => item.ownerId === character.id && item.category === 'battle');
  assert.equal(owned.length, 10, `${name} の能力データ数`);
  for (const ability of owned) {
    assert.equal(ability.dataStatus, 'verified');
    assert.equal(ability.source?.provider, 'Game8');
    assert.ok(ability.sourceUrl?.startsWith('https://game8.jp/'));
  }
}
console.log('Game8 batch01 data tests passed');
