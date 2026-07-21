export class PartyOptimizer {
  constructor(repository) {
    this.repo = repository;
  }

  effectApplies(effect, attacker) {
    if (effect.weapon && effect.weapon !== attacker.weapon) return false;
    if (effect.element && effect.element !== attacker.element) return false;
    return true;
  }

  scoreCandidate(candidate, attacker, priority) {
    const effects = this.repo.getAbilities(candidate.id)
      .flatMap(ability =>
        (ability.effects ?? []).map(effect => ({
          ...effect,
          abilityName: ability.name
        }))
      )
      .filter(effect => this.effectApplies(effect, attacker));

    let score = candidate.baseScore * 0.12;
    const reasons = [];

    for (const effect of effects) {
      const rule = this.repo.getEffectRule(effect.type);
      if (!rule) continue;

      let weight = rule.weight;

      if (
        priority === "damage" &&
        [
          "physical_attack_up",
          "element_attack_up",
          "weapon_damage_up",
          "damage_up",
          "weapon_resistance_down",
          "element_resistance_down",
          "damage_cap_up"
        ].includes(effect.type)
      ) {
        weight *= 1.35;
      }

      if (priority === "break" && effect.type === "break_support") {
        weight *= 2.2;
      }

      const contribution = Math.min(effect.value, rule.cap) * weight;
      score += contribution;
      reasons.push({
        label: rule.label,
        value: effect.value,
        abilityName: effect.abilityName,
        type: effect.type
      });
    }

    if (candidate.weapon === attacker.weapon) score += 6;
    if (candidate.element === attacker.element) score += 4;
    if (candidate.role === "support" || candidate.role === "debuffer") score += 4;

    return {
      candidate,
      score: Math.round(score * 10) / 10,
      reasons
    };
  }

  buildTotals(selected) {
    const totals = {};

    for (const item of selected) {
      for (const reason of item.reasons) {
        const rule = this.repo.getEffectRule(reason.type);
        if (!rule) continue;

        totals[reason.type] ??= {
          label: rule.label,
          total: 0,
          cap: rule.cap,
          sources: []
        };

        totals[reason.type].total += reason.value;
        totals[reason.type].sources.push(
          `${item.candidate.name}：${reason.abilityName}`
        );
      }
    }

    for (const key of Object.keys(totals)) {
      totals[key].effective = Math.min(totals[key].total, totals[key].cap);
    }

    return totals;
  }

  optimize(
    attackerId,
    {
      weapon,
      element,
      priority = "balanced",
      lockedIds = []
    } = {}
  ) {
    const attacker = this.repo.getCharacter(attackerId);
    if (!attacker) throw new Error(`Character not found: ${attackerId}`);

    const uniqueLockedIds = [...new Set(lockedIds)]
      .filter(id => id !== attackerId)
      .filter(id => this.repo.getCharacter(id))
      .slice(0, 7);

    const candidates = this.repo.getCharacters()
      .filter(character => character.id !== attackerId)
      .map(character => this.scoreCandidate(character, attacker, priority))
      .sort((a, b) => b.score - a.score);

    const candidateById = Object.fromEntries(
      candidates.map(item => [item.candidate.id, item])
    );

    const locked = uniqueLockedIds
      .map(id => candidateById[id])
      .filter(Boolean);

    const lockedSet = new Set(uniqueLockedIds);
    const automatic = candidates
      .filter(item => !lockedSet.has(item.candidate.id))
      .slice(0, Math.max(0, 7 - locked.length));

    const selected = [...locked, ...automatic];
    const totals = this.buildTotals(selected);

    let synergy = selected.reduce((sum, item) => sum + item.score, 0);
    if (weapon && weapon === attacker.weapon) synergy += 12;
    if (element && element === attacker.element) synergy += 8;

    return {
      attacker,
      candidates,
      selected,
      lockedIds: uniqueLockedIds,
      automaticIds: automatic.map(item => item.candidate.id),
      totals,
      totalScore: selected.length
        ? Math.round(synergy / selected.length)
        : 0,
      capCount: Object.values(totals)
        .filter(item => item.total >= item.cap)
        .length
    };
  }
}