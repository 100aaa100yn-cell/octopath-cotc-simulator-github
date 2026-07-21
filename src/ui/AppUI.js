import { DataCatalog } from "../database/DataCatalog.js";
export class AppUI {
  constructor(repo, partyOptimizer, turnOptimizer, dataManager, damageEngine, battleEngine, stateManager, analytics, equipmentManager) {
    this.repo = repo;
    this.partyOptimizer = partyOptimizer;
    this.turnOptimizer = turnOptimizer;
    this.dataManager = dataManager;
    this.damageEngine = damageEngine;
    this.battleEngine = battleEngine;
    this.stateManager = stateManager;
    this.analytics = analytics;
    this.equipmentManager = equipmentManager;
    this.dataCatalog = new DataCatalog(repo);
    this.autoSaveTimer = null;
    this.activeCollection = "characters";
    this.selectedPartyIds = [];
    this.equipmentCharacterId = "";
  }

  $(id) {
    return document.getElementById(id);
  }

  init() {
    this.bindEvents();
    this.refreshSelectors();
    this.renderDatabaseEditor();
    this.renderValidation(this.dataManager.validate());
    this.runSimulation();
    this.refreshDamageCalculator();
    this.refreshBattleSelectors();
    this.refreshCharacterFilters();
    this.renderCharacterSelector();
    this.refreshEquipmentUi();
    this.renderCatalogSummary();
    this.restoreInitialState();
  }

  bindEvents() {
    this.$("optimizeBtn").onclick = () => this.runSimulation();
    this.$("themeBtn").onclick = () => document.body.classList.toggle("dark");
    this.$("validateBtn").onclick = () => this.renderValidation(this.dataManager.validate());
    this.$("saveCollectionBtn").onclick = () => this.saveActiveCollection();
    this.$("resetDataBtn").onclick = () => this.resetData();
    this.$("exportDataBtn").onclick = () => this.exportDatabase();
    this.$("importDataInput").onchange = event => this.importDatabase(event);
    this.$("addCharacterBtn").onclick = () => this.addCharacter();
    this.$("addAbilityBtn").onclick = () => this.addAbility();
    this.$("addEnemyBtn").onclick = () => this.addEnemy();
    this.$("calculateDamageBtn").onclick = () => this.calculateManualDamage();
    this.$("runBattleBtn").onclick = () => this.runBattleSimulation();
    this.$("exportBattleLogBtn").onclick = () => this.exportBattleLog();
    this.$("savePresetBtn").onclick = () => this.savePreset();
    this.$("loadPresetBtn").onclick = () => this.loadPreset();
    this.$("clearPresetBtn").onclick = () => this.clearPreset();
    this.$("copyShareUrlBtn").onclick = () => this.copyShareUrl();
    this.$("exportPresetBtn").onclick = () => this.exportPreset();
    this.$("importPresetInput").onchange = event => this.importPreset(event);
    this.$("characterSearch").oninput = () => this.renderCharacterSelector();
    this.$("characterWeaponFilter").onchange = () => this.renderCharacterSelector();
    this.$("characterElementFilter").onchange = () => this.renderCharacterSelector();
    this.$("characterRoleFilter").onchange = () => this.renderCharacterSelector();
    this.$("clearPartySelectionBtn").onclick = () => this.clearPartySelection();
    this.$("characterCsvInput").onchange = event => this.importCharacterCsv(event);
    this.$("downloadCharacterTemplateBtn").onclick = () => this.downloadCharacterTemplate();
    this.$("baseRankFilter").onchange = () => this.renderCharacterSelector();
    this.$("dataStatusFilter").onchange = () => this.renderCharacterSelector();
    this.$("abilityCategoryFilter").onchange = () => this.renderCharacterSelector();
    this.$("hasAbilitiesFilter").onchange = () => this.renderCharacterSelector();
    this.$("seriesFilter").onchange = () => this.renderCharacterSelector();
    this.$("selectAllVisibleBtn").onclick = () => this.selectAllVisibleCharacters();
    this.$("abilityCsvInput").onchange = event => this.importAbilityCsv(event);
    this.$("downloadAbilityTemplateBtn").onclick = () => this.downloadAbilityTemplate();
    this.$("refreshCatalogBtn").onclick = () => this.renderCatalogSummary();
    this.$("equipmentCharacterSelect").onchange = () => this.refreshEquipmentSlots();
    for (const id of ["equipmentWeaponSelect", "equipmentArmorSelect", "equipmentAccessory1Select", "equipmentAccessory2Select"]) {
      this.$(id).onchange = () => this.updateEquipment();
    }
    this.$("clearEquipmentBtn").onclick = () => this.clearEquipment();

    document.querySelectorAll("select, input").forEach(element => {
      if (element.type !== "file") {
        element.addEventListener("change", () => this.scheduleAutoSave());
      }
    });

    document.querySelectorAll("[data-collection]").forEach(button => {
      button.onclick = () => {
        this.activeCollection = button.dataset.collection;
        document.querySelectorAll("[data-collection]").forEach(x => x.classList.remove("active"));
        button.classList.add("active");
        this.renderDatabaseEditor();
      };
    });
  }

  refreshRepository() {
    this.repo.replaceDatabase(this.dataManager.getDatabase());
    this.refreshSelectors();
    this.selectedPartyIds = this.selectedPartyIds
      .filter(id => this.repo.getCharacter(id))
      .slice(0, 8);
    this.refreshCharacterFilters();
    this.renderCharacterSelector();
    this.renderCatalogSummary();
  }

  refreshSelectors() {
    const previousAttacker = this.$("attackerSelect").value;
    const previousEnemy = this.$("enemySelect").value;

    const attackers = this.repo.getCharacters();
    this.$("attackerSelect").innerHTML = attackers
      .map(c => `<option value="${c.id}">${c.name}</option>`)
      .join("");

    this.$("enemySelect").innerHTML = this.repo.getEnemies()
      .map(e => `<option value="${e.id}">${e.name}</option>`)
      .join("");

    if (attackers.some(x => x.id === previousAttacker)) this.$("attackerSelect").value = previousAttacker;
    if (this.repo.getEnemies().some(x => x.id === previousEnemy)) this.$("enemySelect").value = previousEnemy;
    this.refreshDamageCalculator();
    this.refreshBattleSelectors();
  }

  runSimulation() {
    const attackerId = this.$("attackerSelect").value;
    const enemy = this.repo.getEnemy(this.$("enemySelect").value);
    if (!attackerId || !enemy) return;

    const priority = this.$("prioritySelect").value;
    const party = this.partyOptimizer.optimize(attackerId, {
      weapon: enemy.weakWeapons[0] ?? "",
      element: enemy.weakElements[0] ?? "",
      priority,
      lockedIds: this.getLockedPartyIds(attackerId)
    });

    const plan = this.turnOptimizer.createPlan(party, {
      enemyId: enemy.id,
      maxTurns: Number(this.$("turnSelect").value),
      priority
    });

    this.renderSimulation(party, plan);
  }

  renderSimulation(party, plan) {
    this.$("totalScore").textContent = party.totalScore;
    this.$("attackTurn").textContent = `${plan.attackTurn}T`;
    this.$("estimatedDamage").textContent = plan.estimatedDamage.toLocaleString();
    this.$("enemyShield").textContent = plan.enemy.shield;

    const members = [party.attacker, ...party.selected.map(x => x.candidate)];
    this.$("partyGrid").innerHTML = members.map((character, index) => `
      <article class="member">
        <span class="rank">#${index + 1}</span>
        <span class="selection-badge ${
          index === 0 ? "leader" :
          party.lockedIds?.includes(character.id) ? "locked" : "auto"
        }">${
          index === 0 ? "LEADER" :
          party.lockedIds?.includes(character.id) ? "固定" : "自動"
        }</span>
        <div class="member-head">
          <span class="member-icon">${character.icon ?? "◈"}</span>
          <div>
            <h3>${character.name}</h3>
            <div class="chips">
              <span class="chip">${character.weapon}</span>
              <span class="chip">${character.element}</span>
              <span class="chip">${character.role}</span>
            </div>
          </div>
        </div>
        <div class="contribution">SP ${character.maxSp ?? 0} / 速度 ${character.speed ?? 0}</div>
      </article>
    `).join("");

    this.$("timeline").innerHTML = plan.turns.map(turn => `
      <article class="turn-card ${turn.turn === plan.attackTurn ? "attack-turn" : ""}">
        <div class="turn-head">
          <strong>${turn.turn}ターン目｜${turn.phase}</strong>
          <span>残りシールド ${turn.shield}${turn.broken ? "｜BREAK" : ""}</span>
        </div>
        <div class="action-grid">
          ${turn.actions.sort((a, b) => b.character.speed - a.character.speed).map(action => `
            <div class="action">
              <span class="action-icon">${action.character.icon ?? "◈"}</span>
              <div>
                <b>${action.character.name}</b><br>
                <span>${action.name}${action.boost ? `［BP${action.boost}］` : ""}</span>
                <small>SP ${action.sp}${action.shield ? ` / シールド-${action.shield}` : ""}</small>
              </div>
            </div>
          `).join("")}
        </div>
      </article>
    `).join("");

    const attackData = plan.turns.find(turn => turn.turn === plan.attackTurn);
    const grouped = {};

    for (const effect of attackData?.activeEffects ?? []) {
      grouped[effect.type] ??= { value: 0, sources: [] };
      grouped[effect.type].value += effect.value;
      grouped[effect.type].sources.push(`${effect.owner}：${effect.ability}`);
    }

    this.$("activeEffects").innerHTML = Object.entries(grouped).map(([type, item]) => {
      const rule = this.repo.getEffectRule(type);
      const effective = Math.min(item.value, rule?.cap ?? item.value);
      return `
        <div class="effect-box">
          <b>${rule?.label ?? type} +${effective}%</b>
          <small>${item.sources.join("、")}</small>
        </div>
      `;
    }).join("") || '<p class="empty">有効効果なし</p>';

    const breakTurn = plan.turns.find(turn => turn.broken)?.turn;
    this.$("planSummary").innerHTML = `
      <div class="reason">敵：${plan.enemy.name}</div>
      <div class="reason">弱点：${plan.enemy.weakWeapons.join("・")} / ${plan.enemy.weakElements.join("・")}</div>
      <div class="reason">ブレイク予定：${breakTurn ? `${breakTurn}ターン目` : "未達"}</div>
      <div class="reason">フィニッシュ予定：${plan.attackTurn}ターン目</div>
      <div class="reason">推定ダメージ：${plan.estimatedDamage.toLocaleString()}</div>
    `;

    this.$("rankingBody").innerHTML = party.candidates.map((candidate, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${candidate.candidate.icon ?? "◈"} ${candidate.candidate.name}</td>
        <td>${candidate.candidate.role}</td>
        <td>${candidate.score}</td>
        <td>${candidate.reasons.slice(0, 3).map(reason => `${reason.label}+${reason.value}%`).join("、") || "基礎相性"}</td>
      </tr>
    `).join("");
  }

  refreshDamageCalculator() {
    const attackerSelect = this.$("damageAttackerSelect");
    const abilitySelect = this.$("damageAbilitySelect");
    const enemySelect = this.$("damageEnemySelect");
    if (!attackerSelect || !abilitySelect || !enemySelect) return;

    const previousAttacker = attackerSelect.value;
    const previousEnemy = enemySelect.value;

    attackerSelect.innerHTML = this.repo.getCharacters()
      .map(c => `<option value="${c.id}">${c.name}</option>`)
      .join("");

    enemySelect.innerHTML = this.repo.getEnemies()
      .map(e => `<option value="${e.id}">${e.name}</option>`)
      .join("");

    if (this.repo.getCharacter(previousAttacker)) attackerSelect.value = previousAttacker;
    if (this.repo.getEnemy(previousEnemy)) enemySelect.value = previousEnemy;

    attackerSelect.onchange = () => this.refreshDamageAbilities();
    this.refreshDamageAbilities();
  }

  refreshDamageAbilities() {
    const attackerId = this.$("damageAttackerSelect").value;
    const abilities = this.repo.getAbilities(attackerId).filter(a => (a.power ?? 0) > 0);

    this.$("damageAbilitySelect").innerHTML = abilities
      .map(a => `<option value="${a.id}">${a.name}｜威力${a.power}×${a.hits ?? 1}</option>`)
      .join("");
  }

  parseManualEffects() {
    const values = {
      physical_attack_up: Number(this.$("damagePatkBuff").value || 0),
      element_attack_up: Number(this.$("damageEatkBuff").value || 0),
      weapon_damage_up: Number(this.$("damageWeaponBuff").value || 0),
      damage_up: Number(this.$("damageGeneralBuff").value || 0),
      weapon_resistance_down: Number(this.$("damageWeaponResDown").value || 0),
      element_resistance_down: Number(this.$("damageElementResDown").value || 0),
      damage_cap_up: Number(this.$("damageCapBuff").value || 0),
      ultimate_power: Number(this.$("damageUltimateBuff").value || 0)
    };

    return Object.entries(values)
      .filter(([, value]) => value !== 0)
      .map(([type, value]) => ({ type, value }));
  }

  calculateManualDamage() {
    const baseAttacker = this.repo.getCharacter(this.$("damageAttackerSelect").value);
    const attacker = this.equipmentManager.applyToCharacter(baseAttacker);
    const ability = this.repo.getAbility(this.$("damageAbilitySelect").value);
    const enemy = this.repo.getEnemy(this.$("damageEnemySelect").value);

    if (!attacker || !ability || !enemy) {
      this.$("damageResult").innerHTML = '<div class="validation-item error">計算対象を選択してください。</div>';
      return;
    }

    const input = {
      attacker,
      ability,
      enemy,
      effects: this.parseManualEffects(),
      boost: Number(this.$("damageBoost").value || 0),
      critical: this.$("damageCritical").checked,
      broken: this.$("damageBroken").checked,
      weakness: this.$("damageWeakness").checked
    };

    const result = this.damageEngine.calculateRange(input);
    const average = result.average;

    this.$("damageResult").innerHTML = `
      <div class="damage-hero">
        <span>平均ダメージ</span>
        <strong>${average.totalDamage.toLocaleString()}</strong>
        <small>${average.perHit.toLocaleString()} × ${average.hits}ヒット</small>
      </div>
      <div class="damage-range">
        <div><span>最小</span><strong>${result.min.totalDamage.toLocaleString()}</strong></div>
        <div><span>平均</span><strong>${average.totalDamage.toLocaleString()}</strong></div>
        <div><span>最大</span><strong>${result.max.totalDamage.toLocaleString()}</strong></div>
      </div>
      <div class="formula-grid">
        <div><span>実効攻撃力</span><b>${average.effectiveAttack}</b></div>
        <div><span>装備補正</span><b>${this.formatStatBonuses(attacker.equipmentBonuses)}</b></div>
        <div><span>敵防御力</span><b>${average.defense}</b></div>
        <div><span>攻防比</span><b>${average.defenseRatio.toFixed(3)}</b></div>
        <div><span>BP倍率</span><b>×${average.boostMultiplier.toFixed(2)}</b></div>
        <div><span>弱点倍率</span><b>×${average.weaknessMultiplier.toFixed(2)}</b></div>
        <div><span>ブレイク倍率</span><b>×${average.breakMultiplier.toFixed(2)}</b></div>
        <div><span>クリティカル</span><b>×${average.criticalMultiplier.toFixed(2)}</b></div>
        <div><span>1ヒット上限</span><b>${average.damageCap.toLocaleString()}</b></div>
      </div>
      <div class="damage-breakdown">
        <div>能力バフ：+${(average.effectTotals.statBuff * 100).toFixed(0)}%</div>
        <div>武器ダメージ：+${(average.effectTotals.weaponDamage * 100).toFixed(0)}%</div>
        <div>ダメージUP：+${(average.effectTotals.generalDamage * 100).toFixed(0)}%</div>
        <div>耐性DOWN：+${(average.effectTotals.resistanceDown * 100).toFixed(0)}%</div>
      </div>
    `;
  }


  runBattleSimulation() {
    const result = this.battleEngine.simulate({
      attackerId: this.$("battleAttackerSelect").value,
      enemyId: this.$("battleEnemySelect").value,
      priority: this.$("battlePrioritySelect").value,
      maxBattleTurns: Number(this.$("battleMaxTurns").value || 20),
      planHorizon: Number(this.$("battlePlanHorizon").value || 5),
      lockedIds: this.getLockedPartyIds(this.$("battleAttackerSelect").value)
    });

    this.lastBattleResult = result;
    this.renderBattleResult(result);
  }

  refreshBattleSelectors() {
    const attackerSelect = this.$("battleAttackerSelect");
    const enemySelect = this.$("battleEnemySelect");
    if (!attackerSelect || !enemySelect) return;

    const attackers = this.repo.getCharacters();
    attackerSelect.innerHTML = attackers
      .map(x => `<option value="${x.id}">${x.name}</option>`)
      .join("");

    enemySelect.innerHTML = this.repo.getEnemies()
      .map(x => `<option value="${x.id}">${x.name}｜HP ${x.maxHp?.toLocaleString() ?? "-"}</option>`)
      .join("");
  }

  renderBattleResult(result) {
    const summary = result.summary;

    this.$("battleSummary").innerHTML = `
      <div class="battle-metric ${summary.victory ? "victory" : "defeat"}">
        <span>結果</span><strong>${summary.victory ? "VICTORY" : "TIME UP"}</strong>
      </div>
      <div class="battle-metric"><span>討伐ターン</span><strong>${summary.turnsUsed}</strong></div>
      <div class="battle-metric"><span>総ダメージ</span><strong>${summary.totalDamage.toLocaleString()}</strong></div>
      <div class="battle-metric"><span>DPT</span><strong>${summary.dpt.toLocaleString()}</strong></div>
      <div class="battle-metric"><span>ブレイク回数</span><strong>${summary.breakCount}</strong></div>
      <div class="battle-metric"><span>残りHP</span><strong>${summary.remainingHp.toLocaleString()}</strong></div>
    `;

    const maxHp = result.enemy.maxHp;
    const remainingPercent = Math.max(0, summary.remainingHp / maxHp * 100);
    this.$("battleHpBar").innerHTML = `
      <div class="boss-name">${result.enemy.name}</div>
      <div class="hp-track"><span style="width:${remainingPercent}%"></span></div>
      <div class="hp-value">${summary.remainingHp.toLocaleString()} / ${maxHp.toLocaleString()}</div>
    `;

    this.renderBattleAnalytics(result);

    this.$("battleLog").innerHTML = result.log.map(turn => `
      <article class="battle-turn ${turn.broken ? "is-broken" : ""}">
        <div class="battle-turn-head">
          <strong>TURN ${turn.turn}</strong>
          <span>ダメージ ${turn.turnDamage.toLocaleString()}｜HP ${turn.enemyHp.toLocaleString()}｜盾 ${turn.enemyShield}</span>
        </div>
        <div class="battle-actions">
          ${turn.partyActions.map(action => `
            <div class="battle-action">
              <b>${action.actor}</b>
              <span>${action.action}${action.boost ? ` BP${action.boost}` : ""}</span>
              <small>${action.damage ? `${action.damage.toLocaleString()} damage` : ""}${action.shieldDamage ? ` / shield -${action.shieldDamage}` : ""}</small>
            </div>
          `).join("")}
          ${turn.enemyAction ? `
            <div class="battle-action enemy-action">
              <b>${turn.enemyAction.actor}</b>
              <span>${turn.enemyAction.action}</span>
              <small>${turn.enemyAction.skipped ? "行動不能" : "敵行動"}</small>
            </div>
          ` : ""}
        </div>
      </article>
    `).join("");
  }

  exportBattleLog() {
    if (!this.lastBattleResult) {
      this.setStatus("先に戦闘シミュレーションを実行してください。", "warning");
      return;
    }

    const payload = {
      generatedAt: new Date().toISOString(),
      enemy: {
        id: this.lastBattleResult.enemy.id,
        name: this.lastBattleResult.enemy.name,
        maxHp: this.lastBattleResult.enemy.maxHp
      },
      summary: this.lastBattleResult.summary,
      log: this.lastBattleResult.log
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json"
    });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = "octopath-battle-replay-v0.9.json";
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }


  collectUiState() {
    const ids = [
      "attackerSelect", "enemySelect", "prioritySelect", "turnSelect",
      "battleAttackerSelect", "battleEnemySelect", "battlePrioritySelect",
      "battleMaxTurns", "battlePlanHorizon",
      "damageAttackerSelect", "damageAbilitySelect", "damageEnemySelect",
      "damageBoost", "damagePatkBuff", "damageEatkBuff", "damageWeaponBuff",
      "damageGeneralBuff", "damageWeaponResDown", "damageElementResDown",
      "damageCapBuff", "damageUltimateBuff"
    ];

    const fields = {};
    for (const id of ids) {
      const element = this.$(id);
      if (element) fields[id] = element.value;
    }

    for (const id of ["damageWeakness", "damageBroken", "damageCritical"]) {
      const element = this.$(id);
      if (element) fields[id] = element.checked;
    }

    return {
      fields,
      activeCollection: this.activeCollection,
      theme: document.body.classList.contains("dark") ? "dark" : "light",
      selectedPartyIds: this.selectedPartyIds,
      equipmentLoadouts: this.equipmentManager.getLoadouts(),
      equipmentCharacterId: this.$("equipmentCharacterSelect")?.value ?? "",
      characterFilters: {
        search: this.$("characterSearch")?.value ?? "",
        weapon: this.$("characterWeaponFilter")?.value ?? "",
        element: this.$("characterElementFilter")?.value ?? "",
        role: this.$("characterRoleFilter")?.value ?? "",
        series: this.$("seriesFilter")?.value ?? "",
        dataStatus: this.$("dataStatusFilter")?.value ?? ""
      }
    };
  }

  applyUiState(state) {
    if (!state?.fields) return;

    for (const [id, value] of Object.entries(state.fields)) {
      const element = this.$(id);
      if (!element) continue;

      if (element.type === "checkbox") element.checked = Boolean(value);
      else if ([...element.options ?? []].some(option => option.value === String(value)) || element.tagName !== "SELECT") {
        element.value = value;
      }
    }

    this.equipmentManager.setLoadouts(state.equipmentLoadouts ?? {});
    this.equipmentCharacterId = state.equipmentCharacterId ?? "";

    this.selectedPartyIds = (state.selectedPartyIds ?? [])
      .filter(id => this.repo.getCharacter(id))
      .slice(0, 8);

    if (state.characterFilters) {
      if (this.$("characterSearch")) this.$("characterSearch").value = state.characterFilters.search ?? "";
      if (this.$("characterWeaponFilter")) this.$("characterWeaponFilter").value = state.characterFilters.weapon ?? "";
      if (this.$("characterElementFilter")) this.$("characterElementFilter").value = state.characterFilters.element ?? "";
      if (this.$("characterRoleFilter")) this.$("characterRoleFilter").value = state.characterFilters.role ?? "";
      if (this.$("seriesFilter")) this.$("seriesFilter").value = state.characterFilters.series ?? "";
      if (this.$("dataStatusFilter")) this.$("dataStatusFilter").value = state.characterFilters.dataStatus ?? "";
    }

    this.renderCharacterSelector();
    this.refreshEquipmentUi();

    if (state.theme === "dark") document.body.classList.add("dark");
    else document.body.classList.remove("dark");

    if (state.activeCollection) {
      this.activeCollection = state.activeCollection;
      document.querySelectorAll("[data-collection]").forEach(button => {
        button.classList.toggle("active", button.dataset.collection === this.activeCollection);
      });
      this.renderDatabaseEditor();
    }

    this.refreshDamageAbilities();
  }

  restoreInitialState() {
    const shared = this.stateManager.readShareState();
    const saved = this.stateManager.load();
    const state = shared ?? saved;

    if (state) {
      this.applyUiState(state);
      this.setPresetStatus(shared ? "共有URLの設定を読み込みました。" : "保存済み設定を復元しました。", "success");
      this.runSimulation();
      this.calculateManualDamage();
    }
  }

  scheduleAutoSave() {
    clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(() => {
      this.stateManager.save(this.collectUiState());
      this.setPresetStatus("自動保存しました。", "success");
    }, 250);
  }

  savePreset() {
    this.stateManager.save(this.collectUiState());
    this.setPresetStatus("現在の設定を保存しました。", "success");
  }

  loadPreset() {
    const state = this.stateManager.load();
    if (!state) {
      this.setPresetStatus("保存済み設定がありません。", "warning");
      return;
    }

    this.applyUiState(state);
    this.runSimulation();
    this.calculateManualDamage();
    this.setPresetStatus("保存済み設定を読み込みました。", "success");
  }

  clearPreset() {
    this.stateManager.clear();
    this.setPresetStatus("保存済み設定を削除しました。", "success");
  }

  async copyShareUrl() {
    const url = this.stateManager.createShareUrl(this.collectUiState());

    try {
      await navigator.clipboard.writeText(url);
      this.setPresetStatus("共有URLをコピーしました。", "success");
    } catch {
      this.$("shareUrlOutput").value = url;
      this.$("shareUrlOutput").select();
      this.setPresetStatus("共有URLを表示しました。手動でコピーしてください。", "warning");
    }

    this.$("shareUrlOutput").value = url;
  }

  exportPreset() {
    const payload = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      state: this.collectUiState()
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json"
    });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = "octopath-simulator-preset-v1.0.json";
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }

  async importPreset(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const payload = JSON.parse(await file.text());
      const state = payload.state ?? payload;
      this.applyUiState(state);
      this.stateManager.save(state);
      this.runSimulation();
      this.calculateManualDamage();
      this.setPresetStatus("設定ファイルを読み込みました。", "success");
    } catch (error) {
      this.setPresetStatus(`設定読込エラー：${error.message}`, "error");
    } finally {
      event.target.value = "";
    }
  }

  setPresetStatus(message, type = "") {
    const element = this.$("presetStatus");
    element.textContent = message;
    element.className = `preset-status ${type}`;
  }

  renderBattleAnalytics(result) {
    const analytics = this.analytics.analyze(result);
    this.$("analyticsSummary").innerHTML = `
      <div><span>最大ターンダメージ</span><strong>${analytics.peakDamage.toLocaleString()}</strong></div>
      <div><span>最大ダメージターン</span><strong>T${analytics.peakTurn || "-"}</strong></div>
      <div><span>攻撃ターン平均</span><strong>${analytics.averageActiveDamage.toLocaleString()}</strong></div>
      <div><span>総行動数</span><strong>${analytics.actionCount}</strong></div>
    `;

    const maxDamage = Math.max(1, ...analytics.damageByTurn);
    this.$("damageChart").innerHTML = analytics.damageByTurn.map((damage, index) => {
      const height = Math.max(2, damage / maxDamage * 100);
      const isBreak = analytics.breakTurns.includes(index + 1);
      return `
        <div class="chart-column" title="T${index + 1}: ${damage.toLocaleString()}">
          <div class="chart-bar ${isBreak ? "break-bar" : ""}" style="height:${height}%"></div>
          <small>T${index + 1}</small>
        </div>
      `;
    }).join("");
  }


  refreshCharacterFilters() {
    const characters = this.repo.getCharacters();
    const fill = (id, values, labels = {}) => {
      const element = this.$(id);
      if (!element) return;
      const previous = element.value;
      element.innerHTML = [
        '<option value="">すべて</option>',
        ...[...new Set(values.filter(Boolean))].sort().map(value =>
          `<option value="${value}">${labels[value] ?? value}</option>`
        )
      ].join("");
      if ([...element.options].some(option => option.value === previous)) {
        element.value = previous;
      }
    };

    fill("characterWeaponFilter", characters.map(x => x.weapon));
    fill("characterElementFilter", characters.map(x => x.element));
    fill("characterRoleFilter", characters.map(x => x.role));
    fill("seriesFilter", characters.map(x => x.series));
    fill("baseRankFilter", characters.map(x => x.baseRank ?? x.rarity), { 5: "★5", 4: "★4", 3: "★3" });
    fill("abilityCategoryFilter", this.repo.getAllAbilities().map(x => x.category), {
      support: "サポート", battle: "バトル", ultimate: "必殺技", ex: "EX"
    });
    fill("dataStatusFilter", characters.map(x => x.dataStatus), {
      verified: "検証済み",
      provisional: "暫定",
      simulator: "検証用",
      incomplete: "未入力"
    });
  }

  getVisibleCharacters() {
    const query = (this.$("characterSearch")?.value ?? "").trim().toLowerCase();
    const weapon = this.$("characterWeaponFilter")?.value ?? "";
    const element = this.$("characterElementFilter")?.value ?? "";
    const role = this.$("characterRoleFilter")?.value ?? "";
    const series = this.$("seriesFilter")?.value ?? "";
    const baseRank = this.$("baseRankFilter")?.value ?? "";
    const dataStatus = this.$("dataStatusFilter")?.value ?? "";
    const abilityCategory = this.$("abilityCategoryFilter")?.value ?? "";
    const hasAbilities = this.$("hasAbilitiesFilter")?.checked ?? false;

    return this.dataCatalog.search(query, { baseRank, weapon, element, role, series, dataStatus, abilityCategory, hasAbilities }).filter(character => {
      const searchable = [
        character.name,
        character.id,
        character.weapon,
        character.element,
        character.role
      ].join(" ").toLowerCase();

      return true;
    });
  }

  renderCharacterSelector() {
    const container = this.$("characterSelectorGrid");
    if (!container) return;

    const characters = this.getVisibleCharacters();
    const selectedSet = new Set(this.selectedPartyIds);

    container.innerHTML = characters.map(character => {
      const selected = selectedSet.has(character.id);
      return `
        <button
          type="button"
          class="character-select-card ${selected ? "selected" : ""}"
          data-character-id="${character.id}"
          aria-pressed="${selected}"
        >
          <span class="character-check">${selected ? "✓" : "+"}</span>
          <span class="character-select-icon">${character.icon ?? "◈"}</span>
          <strong>${character.name}</strong><span class="rank-badge rank-${character.baseRank ?? character.rarity ?? 0}">★${character.baseRank ?? character.rarity ?? "?"}</span>
          <small>${character.weapon}・${character.element}・${character.role}</small>
          <span class="character-series">${character.series ?? "未分類"}</span>
          <span class="data-status status-${character.dataStatus ?? "incomplete"}">${
            character.dataStatus === "verified" ? "検証済み" :
            character.dataStatus === "provisional" ? "暫定" :
            character.dataStatus === "simulator" ? "検証用" : "未入力"
          }</span>
          <span class="character-stats">物攻 ${this.equipmentManager.applyToCharacter(character).patk ?? "-"} / 属攻 ${this.equipmentManager.applyToCharacter(character).eatk ?? "-"} / 速 ${this.equipmentManager.applyToCharacter(character).speed ?? "-"}</span>
          <span class="character-ability-count">技 ${this.repo.getAbilities(character.id).length}件${(character.tags ?? []).length ? ` / ${(character.tags ?? []).slice(0, 3).join("・")}` : ""}</span>
        </button>
      `;
    }).join("") || '<p class="empty">条件に一致するキャラクターがいません。</p>';

    container.querySelectorAll("[data-character-id]").forEach(button => {
      button.onclick = () => this.togglePartyCharacter(button.dataset.characterId);
    });

    this.renderSelectedPartyStrip();
  }

  renderSelectedPartyStrip() {
    const container = this.$("selectedPartyStrip");
    if (!container) return;

    const selected = this.selectedPartyIds
      .map(id => this.repo.getCharacter(id))
      .filter(Boolean);

    container.innerHTML = selected.length
      ? selected.map((character, index) => `
          <button type="button" class="selected-party-chip" data-remove-character="${character.id}">
            <span>${index + 1}</span>
            ${character.icon ?? "◈"} ${character.name}
            <b>×</b>
          </button>
        `).join("")
      : '<span class="empty">未選択です。0人の場合は7枠すべて自動編成されます。</span>';

    container.querySelectorAll("[data-remove-character]").forEach(button => {
      button.onclick = () => this.togglePartyCharacter(button.dataset.removeCharacter);
    });

    this.$("selectedPartyCount").textContent = `${selected.length} / 8`;
  }

  togglePartyCharacter(characterId) {
    if (this.selectedPartyIds.includes(characterId)) {
      this.selectedPartyIds = this.selectedPartyIds.filter(id => id !== characterId);
    } else {
      if (this.selectedPartyIds.length >= 8) {
        this.setPresetStatus("編成に固定できるのは最大8人です。", "warning");
        return;
      }
      this.selectedPartyIds = [...this.selectedPartyIds, characterId];
    }

    this.renderCharacterSelector();
    this.scheduleAutoSave();
    this.runSimulation();
  }

  clearPartySelection() {
    this.selectedPartyIds = [];
    this.equipmentCharacterId = "";
    this.renderCharacterSelector();
    this.scheduleAutoSave();
    this.runSimulation();
  }

  selectAllVisibleCharacters() {
    const visibleIds = this.getVisibleCharacters().map(character => character.id);
    const combined = [...new Set([...this.selectedPartyIds, ...visibleIds])];
    this.selectedPartyIds = combined.slice(0, 8);
    this.renderCharacterSelector();
    this.scheduleAutoSave();
    this.runSimulation();

    if (combined.length > 8) {
      this.setPresetStatus("先頭から8人を選択しました。", "warning");
    }
  }


  formatStatBonuses(bonuses = {}) {
    const labels = { hp: "HP", patk: "物攻", eatk: "属攻", pdef: "物防", edef: "属防", speed: "速度", maxSp: "SP" };
    const values = Object.entries(bonuses).filter(([, value]) => Number(value) !== 0);
    return values.length ? values.map(([key, value]) => `${labels[key] ?? key}${value >= 0 ? "+" : ""}${value}`).join(" / ") : "なし";
  }

  refreshEquipmentUi() {
    const select = this.$("equipmentCharacterSelect");
    if (!select) return;
    const previous = this.equipmentCharacterId || select.value;
    select.innerHTML = this.repo.getCharacters().map(character => `<option value="${character.id}">${character.icon ?? "◈"} ${character.name}</option>`).join("");
    if (this.repo.getCharacter(previous)) select.value = previous;
    this.equipmentCharacterId = select.value;
    this.refreshEquipmentSlots();
  }

  equipmentOptions(slot, character, selectedId) {
    const items = this.repo.getEquipmentList().filter(item => {
      if (item.slot !== slot) return false;
      return slot !== "weapon" || !item.weapon || item.weapon === character.weapon;
    });
    return [`<option value="">装備なし</option>`, ...items.map(item => `<option value="${item.id}" ${item.id === selectedId ? "selected" : ""}>${item.name}｜${this.formatStatBonuses(item.stats)}</option>`)].join("");
  }

  refreshEquipmentSlots() {
    const characterId = this.$("equipmentCharacterSelect")?.value;
    const character = this.repo.getCharacter(characterId);
    if (!character) return;
    this.equipmentCharacterId = characterId;
    const loadout = this.equipmentManager.getLoadout(characterId);
    this.$("equipmentWeaponSelect").innerHTML = this.equipmentOptions("weapon", character, loadout.weapon);
    this.$("equipmentArmorSelect").innerHTML = this.equipmentOptions("armor", character, loadout.armor);
    this.$("equipmentAccessory1Select").innerHTML = this.equipmentOptions("accessory", character, loadout.accessory1);
    this.$("equipmentAccessory2Select").innerHTML = this.equipmentOptions("accessory", character, loadout.accessory2);
    const equipped = this.equipmentManager.applyToCharacter(character);
    this.$("equipmentStatSummary").innerHTML = `
      <strong>${character.icon ?? "◈"} ${character.name}</strong><span class="rank-badge rank-${character.baseRank ?? character.rarity ?? 0}">★${character.baseRank ?? character.rarity ?? "?"}</span>
      <span>物攻 ${character.patk ?? 0} → <b>${equipped.patk}</b></span>
      <span>属攻 ${character.eatk ?? 0} → <b>${equipped.eatk}</b></span>
      <span>速度 ${character.speed ?? 0} → <b>${equipped.speed}</b></span>
      <span>最大SP ${character.maxSp ?? 0} → <b>${equipped.maxSp}</b></span>
      <small>${this.formatStatBonuses(equipped.equipmentBonuses)}</small>`;
  }

  updateEquipment() {
    const characterId = this.$("equipmentCharacterSelect").value;
    const values = {
      weapon: this.$("equipmentWeaponSelect").value,
      armor: this.$("equipmentArmorSelect").value,
      accessory1: this.$("equipmentAccessory1Select").value,
      accessory2: this.$("equipmentAccessory2Select").value
    };
    for (const [slot, id] of Object.entries(values)) this.equipmentManager.equip(characterId, slot, id);
    this.refreshEquipmentSlots();
    this.renderCharacterSelector();
    this.calculateManualDamage();
    this.scheduleAutoSave();
  }

  clearEquipment() {
    const characterId = this.$("equipmentCharacterSelect").value;
    for (const slot of ["weapon", "armor", "accessory1", "accessory2"]) this.equipmentManager.equip(characterId, slot, "");
    this.refreshEquipmentSlots();
    this.renderCharacterSelector();
    this.calculateManualDamage();
    this.scheduleAutoSave();
  }

  async importCharacterCsv(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const { CharacterImporter } = await import("../database/CharacterImporter.js");
      const incoming = CharacterImporter.parseCsv(await file.text());
      const currentDb = this.dataManager.getDatabase();
      const merged = CharacterImporter.merge(currentDb.characters, incoming, "upsert");

      this.dataManager.replace({
        ...currentDb,
        characters: merged.characters
      });
      this.repo.replaceDatabase(this.dataManager.getDatabase());
      this.refreshSelectors();
      this.refreshCharacterFilters();
      this.renderCharacterSelector();
      this.renderDatabaseEditor();

      const report = merged.report;
      this.setPresetStatus(
        `CSV取込完了：追加 ${report.added} / 更新 ${report.updated} / スキップ ${report.skipped}`,
        report.errors.length ? "warning" : "success"
      );
    } catch (error) {
      this.setPresetStatus(`CSV取込エラー：${error.message}`, "error");
    } finally {
      event.target.value = "";
    }
  }

  downloadCharacterTemplate() {
    const headers = [
      "id","name","weapon","element","role","series","rarity","level",
      "patk","eatk","speed","maxSp","baseScore","icon","dataStatus","dataNote"
    ];
    const sample = [
      "sample_traveler","サンプル旅人","sword","fire","attacker",
      "大陸の覇者","5","100","450","400","300","400","80","⚔️",
      "provisional","入力例"
    ];
    const escape = value => `"${String(value).replaceAll('"', '""')}"`;
    const csv = "\uFEFF" + [headers, sample]
      .map(row => row.map(escape).join(","))
      .join("\r\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = "characters-import-template.csv";
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }


  renderCatalogSummary() {
    const summary = this.dataCatalog.summarize();
    const container = this.$("catalogSummary");
    const breakdown = this.$("catalogBreakdown");
    if (!container || !breakdown) return;

    container.innerHTML = `
      <div><span>キャラクター</span><strong>${summary.characters}</strong></div>
      <div><span>アビリティ</span><strong>${summary.abilities}</strong></div>
      <div><span>検証済み</span><strong>${summary.verifiedCharacters}</strong></div>
      <div><span>暫定</span><strong>${summary.provisionalCharacters}</strong></div>
      <div><span>技なし</span><strong>${summary.charactersWithoutAbilities}</strong></div>
      <div><span>未参照技</span><strong>${summary.unreferencedAbilities}</strong></div>
    `;

    const formatGroup = (title, values) => `
      <section>
        <b>${title}</b>
        ${Object.entries(values)
          .sort((a, b) => b[1] - a[1])
          .map(([key, value]) => `<span>${key}<strong>${value}</strong></span>`)
          .join("") || "<small>データなし</small>"}
      </section>
    `;

    breakdown.innerHTML = [
      formatGroup("ベースランク", summary.byBaseRank),
      formatGroup("シリーズ", summary.bySeries),
      formatGroup("武器", summary.byWeapon),
      formatGroup("役割", summary.byRole),
      formatGroup("技分類", summary.byCategory)
    ].join("");
  }

  async importAbilityCsv(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const { AbilityImporter } = await import("../database/AbilityImporter.js");
      const incoming = AbilityImporter.parseCsv(await file.text());
      const currentDb = this.dataManager.getDatabase();
      const merged = AbilityImporter.merge(currentDb.abilities, incoming);

      const result = this.dataManager.replaceDatabase({
        ...currentDb,
        abilities: merged.abilities
      });

      this.refreshRepository();
      this.renderDatabaseEditor();
      this.renderValidation(result);
      this.renderCatalogSummary();
      this.setPresetStatus(
        `技CSV取込完了：追加 ${merged.report.added} / 更新 ${merged.report.updated}`,
        result.valid ? "success" : "warning"
      );
    } catch (error) {
      this.setPresetStatus(`技CSV取込エラー：${error.message}`, "error");
    } finally {
      event.target.value = "";
    }
  }

  downloadAbilityTemplate() {
    const headers = [
      "id","ownerId","category","name","timing","sp","power","hits","shield",
      "duration","maxBoost","effectType","effectValue","effectsJson","dataStatus","dataNote"
    ];
    const sample = [
      "sample_traveler_battle_01","sample_traveler","battle","サンプル斬撃",
      "attack","25","180","2","2","0","3","","",
      '[{"type":"physicalDamageUp","value":15}]',"provisional","入力例"
    ];
    const escape = value => `"${String(value).replaceAll('"', '""')}"`;
    const csv = "\uFEFF" + [headers, sample]
      .map(row => row.map(escape).join(","))
      .join("\r\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = "abilities-import-template.csv";
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }


  getLockedPartyIds(attackerId) {
    return this.selectedPartyIds
      .filter(id => id !== attackerId)
      .slice(0, 7);
  }


  renderDatabaseEditor() {
    this.$("collectionTitle").textContent = this.activeCollection;
    this.$("databaseEditor").value = JSON.stringify(
      this.dataManager.getCollection(this.activeCollection),
      null,
      2
    );
  }

  saveActiveCollection() {
    try {
      const value = JSON.parse(this.$("databaseEditor").value);
      const result = this.dataManager.saveCollection(this.activeCollection, value);
      this.refreshRepository();
      this.renderValidation(result);
      this.setStatus(`${this.activeCollection}を保存しました。`, "success");
      this.runSimulation();
    } catch (error) {
      this.setStatus(`保存エラー：${error.message}`, "error");
    }
  }

  resetData() {
    const result = this.dataManager.reset();
    this.refreshRepository();
    this.renderDatabaseEditor();
    this.renderValidation(result);
    this.setStatus("初期データへ戻しました。", "success");
    this.runSimulation();
  }

  exportDatabase() {
    const blob = new Blob([this.dataManager.exportJson()], { type: "application/json" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = "octopath-cotc-database-v0.7.json";
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }

  async importDatabase(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const nextDb = JSON.parse(await file.text());
      const result = this.dataManager.replaceDatabase(nextDb);
      this.refreshRepository();
      this.renderDatabaseEditor();
      this.renderValidation(result);
      this.setStatus("データベースを読み込みました。", result.valid ? "success" : "warning");
      this.runSimulation();
    } catch (error) {
      this.setStatus(`読込エラー：${error.message}`, "error");
    } finally {
      event.target.value = "";
    }
  }

  renderValidation(result) {
    const summary = result.summary;
    this.$("validationSummary").innerHTML = `
      <div class="validation-metric"><span>キャラ</span><strong>${summary.characters}</strong></div>
      <div class="validation-metric"><span>アビリティ</span><strong>${summary.abilities}</strong></div>
      <div class="validation-metric"><span>敵</span><strong>${summary.enemies}</strong></div>
      <div class="validation-metric error"><span>エラー</span><strong>${summary.errors}</strong></div>
      <div class="validation-metric warning"><span>警告</span><strong>${summary.warnings}</strong></div>
    `;

    const items = [...result.errors, ...result.warnings];
    this.$("validationList").innerHTML = items.map(item => `
      <div class="validation-item ${item.level}">
        <div><b>${item.code}</b>｜${item.message}</div>
        <small>${item.path || "database"}</small>
      </div>
    `).join("") || '<div class="validation-ok">データに問題は見つかりませんでした。</div>';
  }

  addCharacter() {
    try {
      const character = {
        id: this.$("newCharacterId").value.trim(),
        name: this.$("newCharacterName").value.trim(),
        weapon: this.$("newCharacterWeapon").value,
        element: this.$("newCharacterElement").value,
        role: this.$("newCharacterRole").value,
        icon: this.$("newCharacterIcon").value.trim() || "◈",
        baseScore: Number(this.$("newCharacterScore").value || 80),
        maxSp: Number(this.$("newCharacterSp").value || 400),
        speed: Number(this.$("newCharacterSpeed").value || 300),
        supportIds: [],
        battleIds: [],
        ultimateId: null,
        exId: null
      };

      const result = this.dataManager.addCharacter(character);
      this.refreshRepository();
      this.renderValidation(result);
      this.activeCollection = "characters";
    this.selectedPartyIds = [];
    this.equipmentCharacterId = "";
      this.renderDatabaseEditor();
      this.setStatus(`${character.name || character.id}を追加しました。`, result.valid ? "success" : "warning");
    } catch (error) {
      this.setStatus(`追加エラー：${error.message}`, "error");
    }
  }

  addAbility() {
    try {
      const ability = {
        id: this.$("newAbilityId").value.trim(),
        ownerId: this.$("newAbilityOwner").value.trim(),
        category: this.$("newAbilityCategory").value,
        name: this.$("newAbilityName").value.trim(),
        timing: this.$("newAbilityTiming").value,
        sp: Number(this.$("newAbilitySp").value || 0),
        duration: Number(this.$("newAbilityDuration").value || 1),
        shield: Number(this.$("newAbilityShield").value || 0),
        power: Number(this.$("newAbilityPower").value || 0),
        effects: [{
          type: this.$("newAbilityEffectType").value.trim(),
          value: Number(this.$("newAbilityEffectValue").value || 0),
          target: this.$("newAbilityTarget").value
        }]
      };

      const result = this.dataManager.addAbility(ability);
      this.refreshRepository();
      this.renderValidation(result);
      this.activeCollection = "abilities";
      this.renderDatabaseEditor();
      this.setStatus(`${ability.name || ability.id}を追加しました。`, result.valid ? "success" : "warning");
    } catch (error) {
      this.setStatus(`追加エラー：${error.message}`, "error");
    }
  }

  addEnemy() {
    try {
      const enemy = {
        id: this.$("newEnemyId").value.trim(),
        name: this.$("newEnemyName").value.trim(),
        shield: Number(this.$("newEnemyShield").value || 1),
        weakWeapons: this.$("newEnemyWeapons").value.split(",").map(x => x.trim()).filter(Boolean),
        weakElements: this.$("newEnemyElements").value.split(",").map(x => x.trim()).filter(Boolean),
        breakMultiplier: Number(this.$("newEnemyBreak").value || 2)
      };

      const result = this.dataManager.addEnemy(enemy);
      this.refreshRepository();
      this.renderValidation(result);
      this.activeCollection = "enemies";
      this.renderDatabaseEditor();
      this.setStatus(`${enemy.name || enemy.id}を追加しました。`, result.valid ? "success" : "warning");
    } catch (error) {
      this.setStatus(`追加エラー：${error.message}`, "error");
    }
  }

  setStatus(message, type = "") {
    const element = this.$("dataStatus");
    element.textContent = message;
    element.className = `data-status ${type}`;
  }
}