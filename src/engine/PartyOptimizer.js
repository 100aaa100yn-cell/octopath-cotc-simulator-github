export class PartyOptimizer {
  constructor(repo, rosterManager = null) {
    this.repo = repo;
    this.rosterManager = rosterManager;
  }
  effectApplies(effect, attacker) {
    if (effect.weapon && effect.weapon !== attacker.weapon) return false;
    if (effect.element && effect.element !== attacker.element) return false;
    return true;
  }

  getAttackAbilities(character) {
    return this.repo.getAbilities(character.id).filter(ability =>
      ability.category === "battle" &&
      (Number(ability.power) > 0 || Number(ability.hits) > 0 || Number(ability.shield) > 0)
    );
  }

  getWeaknessProfile(character, enemy) {
    const weaponWeak = Boolean(enemy?.weakWeapons?.includes(character.weapon));
    const elementWeak = Boolean(enemy?.weakElements?.includes(character.element));
    const attacks = this.getAttackAbilities(character);
    const bestHits = attacks.reduce((max, ability) => Math.max(max, Number(ability.hits ?? ability.shield ?? 0)), 0);
    const bestPower = attacks.reduce((max, ability) => Math.max(max, Number(ability.power ?? 0)), 0);
    const matchingTypes = [weaponWeak ? character.weapon : null, elementWeak ? character.element : null].filter(Boolean);
    return { weaponWeak, elementWeak, matchingTypes, bestHits, bestPower, attacks };
  }

  scoreCandidate(candidate, attacker, priority, enemy = null) {
    const abilities = this.repo.getAbilities(candidate.id);
    const effects = abilities
      .flatMap(ability => (ability.effects ?? []).map(effect => ({ ...effect, abilityName: ability.name })))
      .filter(effect => this.effectApplies(effect, attacker));

    let score = Number(candidate.baseScore ?? 0) * 0.12;
    const reasons = [];
    const breakdown = {
      base: Math.round(score * 10) / 10,
      weakness: 0,
      shield: 0,
      damage: 0,
      support: 0,
      speed: 0
    };

    for (const effect of effects) {
      const rule = this.repo.getEffectRule(effect.type);
      if (!rule) continue;
      let weight = Number(rule.weight ?? 0);
      if (priority === "damage" && [
        "physical_attack_up", "element_attack_up", "weapon_damage_up", "damage_up",
        "weapon_resistance_down", "element_resistance_down", "damage_cap_up"
      ].includes(effect.type)) weight *= 1.35;
      if (priority === "break" && effect.type === "break_support") weight *= 2.2;
      const contribution = Math.min(Number(effect.value ?? 0), Number(rule.cap ?? effect.value ?? 0)) * weight;
      score += contribution;
      breakdown.support += contribution;
      reasons.push({ label: rule.label, value: effect.value, abilityName: effect.abilityName, type: effect.type, contribution });
    }

    const profile = this.getWeaknessProfile(candidate, enemy);
    if (profile.weaponWeak) {
      const value = priority === "break" ? 22 : 16;
      score += value; breakdown.weakness += value;
      reasons.push({ label: "武器弱点一致", value, abilityName: candidate.weapon, type: "weak_weapon", contribution: value });
    }
    if (profile.elementWeak) {
      const value = priority === "damage" ? 18 : 14;
      score += value; breakdown.weakness += value;
      reasons.push({ label: "属性弱点一致", value, abilityName: candidate.element, type: "weak_element", contribution: value });
    }
    if (profile.weaponWeak || profile.elementWeak) {
      const hitValue = Math.min(profile.bestHits, 6) * (priority === "break" ? 4 : 2.4);
      score += hitValue; breakdown.shield += hitValue;
      if (hitValue > 0) reasons.push({ label: "弱点連撃", value: profile.bestHits, abilityName: `${profile.bestHits}hit`, type: "weak_hits", contribution: hitValue });

      const damageStat = profile.elementWeak && Number(candidate.eatk) > Number(candidate.patk)
        ? Number(candidate.eatk ?? 0) : Number(candidate.patk ?? 0);
      const damageValue = Math.min(14, profile.bestPower / 30 + damageStat / 100);
      score += damageValue; breakdown.damage += damageValue;
    }

    const speedValue = Math.min(6, Number(candidate.speed ?? 0) / 70);
    score += speedValue; breakdown.speed += speedValue;
    if (candidate.weapon === attacker.weapon) score += 6;
    if (candidate.element === attacker.element) score += 4;
    if (candidate.role === "support" || candidate.role === "debuffer") score += 4;

    for (const key of Object.keys(breakdown)) breakdown[key] = Math.round(breakdown[key] * 10) / 10;
    return { candidate, score: Math.round(score * 10) / 10, reasons, breakdown, weaknessProfile: profile };
  }

  buildTotals(selected) {
    const totals = {};
    for (const item of selected) {
      for (const reason of item.reasons) {
        const rule = this.repo.getEffectRule(reason.type);
        if (!rule) continue;
        totals[reason.type] ??= { label: rule.label, total: 0, cap: rule.cap, sources: [] };
        totals[reason.type].total += Number(reason.value ?? 0);
        totals[reason.type].sources.push(`${item.candidate.name}：${reason.abilityName}`);
      }
    }
    for (const key of Object.keys(totals)) totals[key].effective = Math.min(totals[key].total, totals[key].cap);
    return totals;
  }

  buildCoverage(attacker, selected, enemy) {
    const members = [attacker, ...selected.map(item => item.candidate)];
    const weapon = Object.fromEntries((enemy?.weakWeapons ?? []).map(type => [type, []]));
    const element = Object.fromEntries((enemy?.weakElements ?? []).map(type => [type, []]));
    for (const member of members) {
      if (weapon[member.weapon]) weapon[member.weapon].push(member.name);
      if (element[member.element]) element[member.element].push(member.name);
    }
    const covered = [...Object.values(weapon), ...Object.values(element)].filter(names => names.length).length;
    const total = Object.keys(weapon).length + Object.keys(element).length;
    return { weapon, element, covered, total, ratio: total ? Math.round(covered / total * 100) : 100 };
  }

  selectBalancedCandidates(candidates, slots, enemy) {
    const selected = [];
    const used = new Set();
    const coverageCounts = {};
    while (selected.length < slots) {
      let best = null;
      for (const item of candidates) {
        if (used.has(item.candidate.id)) continue;
        const types = item.weaknessProfile.matchingTypes;
        const diversityBonus = types.reduce((sum, type) => sum + (coverageCounts[type] ? 0 : 8), 0);
        const adjusted = item.score + diversityBonus;
        if (!best || adjusted > best.adjusted) best = { item, adjusted };
      }
      if (!best) break;
      selected.push(best.item); used.add(best.item.candidate.id);
      for (const type of best.item.weaknessProfile.matchingTypes) coverageCounts[type] = (coverageCounts[type] ?? 0) + 1;
    }
    return selected;
  }

  optimize(attackerId, { weapon, element, enemyId = "", priority = "balanced", lockedIds = [] } = {}) {
    const attacker = this.repo.getCharacter(attackerId);
    if (attacker && this.rosterManager && !this.rosterManager.isAvailable(attackerId)) throw new Error("選択したリーダーはマイ旅団で使用不可です。");
    if (!attacker) throw new Error(`Character not found: ${attackerId}`);
    const enemy = enemyId ? this.repo.getEnemy(enemyId) : null;
    const uniqueLockedIds = [...new Set(lockedIds)].filter(id => id !== attackerId).filter(id => this.repo.getCharacter(id)).slice(0, 7);
    const candidates = this.repo.getCharacters()
      .filter(character => character.id !== attackerId)
      .filter(character => !this.rosterManager || this.rosterManager.isAvailable(character.id))
      .map(character => this.scoreCandidate(character, attacker, priority, enemy))
      .sort((a, b) => b.score - a.score);
    const candidateById = Object.fromEntries(candidates.map(item => [item.candidate.id, item]));
    const locked = uniqueLockedIds.map(id => candidateById[id]).filter(Boolean);
    const lockedSet = new Set(uniqueLockedIds);
    const pool = candidates.filter(item => !lockedSet.has(item.candidate.id));
    const automatic = enemy
      ? this.selectBalancedCandidates(pool, Math.max(0, 7 - locked.length), enemy)
      : pool.slice(0, Math.max(0, 7 - locked.length));
    const selected = [...locked, ...automatic];
    const totals = this.buildTotals(selected);
    const coverage = this.buildCoverage(attacker, selected, enemy);
    let synergy = selected.reduce((sum, item) => sum + item.score, 0);
    if (weapon && weapon === attacker.weapon) synergy += 12;
    if (element && element === attacker.element) synergy += 8;
    synergy += coverage.covered * 3;
    return {
      attacker, enemy, candidates, selected, lockedIds: uniqueLockedIds,
      automaticIds: automatic.map(item => item.candidate.id), totals, coverage,
      totalScore: selected.length ? Math.round(synergy / selected.length) : 0,
      capCount: Object.values(totals).filter(item => item.total >= item.cap).length
    };
  }
}
