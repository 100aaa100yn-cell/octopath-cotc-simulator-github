export class DataCatalog {
  constructor(repo) {
    this.repo = repo;
  }

  summarize() {
    const characters = this.repo.getCharacters();
    const abilities = this.repo.getAllAbilities();
    const byStatus = this.countBy(characters, item => item.dataStatus ?? "incomplete");
    const byBaseRank = this.countBy(characters, item => `★${item.baseRank ?? item.rarity ?? "?"}`);
    const bySeries = this.countBy(characters, item => item.series ?? "未分類");
    const byWeapon = this.countBy(characters, item => item.weapon ?? "unknown");
    const byRole = this.countBy(characters, item => item.role ?? "unknown");
    const byCategory = this.countBy(abilities, item => item.category ?? "unknown");

    const referencedAbilityIds = new Set();
    for (const character of characters) {
      for (const id of [
        ...(character.supportIds ?? []),
        ...(character.battleIds ?? []),
        character.ultimateId,
        character.exId
      ].filter(Boolean)) {
        referencedAbilityIds.add(id);
      }
    }

    return {
      characters: characters.length,
      abilities: abilities.length,
      verifiedCharacters: byStatus.verified ?? 0,
      provisionalCharacters: byStatus.provisional ?? 0,
      incompleteCharacters: byStatus.incomplete ?? 0,
      orphanAbilities: abilities.filter(ability => !this.repo.getCharacter(ability.ownerId)).length,
      unreferencedAbilities: abilities.filter(ability => !referencedAbilityIds.has(ability.id)).length,
      charactersWithoutAbilities: characters.filter(character => this.repo.getAbilities(character.id).length === 0).length,
      byStatus,
      byBaseRank,
      bySeries,
      byWeapon,
      byRole,
      byCategory
    };
  }

  countBy(items, selector) {
    return items.reduce((result, item) => {
      const key = selector(item);
      result[key] = (result[key] ?? 0) + 1;
      return result;
    }, {});
  }

  search(query, filters = {}) {
    const normalized = String(query ?? "").trim().toLowerCase();

    return this.repo.getCharacters().filter(character => {
      const abilities = this.repo.getAbilities(character.id);
      const searchable = [
        character.id,
        character.name,
        character.alias,
        character.series,
        character.weapon,
        character.element,
        character.role,
        ...(character.tags ?? []),
        ...abilities.flatMap(ability => [ability.id, ability.name, ability.category])
      ].filter(Boolean).join(" ").toLowerCase();

      return (!normalized || searchable.includes(normalized)) &&
        (!filters.baseRank || String(character.baseRank ?? character.rarity) === String(filters.baseRank)) &&
        (!filters.weapon || character.weapon === filters.weapon) &&
        (!filters.element || character.element === filters.element) &&
        (!filters.role || character.role === filters.role) &&
        (!filters.series || character.series === filters.series) &&
        (!filters.dataStatus || (character.dataStatus ?? "incomplete") === filters.dataStatus) &&
        (!filters.abilityCategory || abilities.some(ability => ability.category === filters.abilityCategory)) &&
        (!filters.hasAbilities || abilities.length > 0);
    });
  }
}
