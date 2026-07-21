export class Game8AbilityImporter {
  static normalizeText(input) {
    if (!input) return "";
    if (/<[a-z][\s\S]*>/i.test(input)) {
      const doc = new DOMParser().parseFromString(input, "text/html");
      input = doc.body?.innerText ?? input;
    }
    return String(input)
      .replace(/\r/g, "")
      .replace(/[\u00a0\u3000]/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  static slug(value) {
    return String(value ?? "ability")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g, "-")
      .replace(/^-+|-+$/g, "") || "ability";
  }

  static detectCharacterName(text) {
    const patterns = [
      /#?\s*〖オクトラ〗([^\n]+?)の評価とおすすめアビリティ/,
      /##?\s*([^\n]+?)のアビリティ[・一覧]/,
      /^([^\n]{1,30})の評価とおすすめアビリティ/m
    ];
    for (const pattern of patterns) {
      const found = text.match(pattern)?.[1]?.trim();
      if (found) return found;
    }
    return "";
  }

  static findCharacter(repo, name, explicitOwnerId = "") {
    if (explicitOwnerId) return repo.getCharacter(explicitOwnerId) ?? null;
    const normalized = String(name).normalize("NFKC").replace(/\s/g, "").toLowerCase();
    return repo.getCharacters().find(character => {
      const candidates = [character.name, character.id, ...(character.aliases ?? [])];
      return candidates.some(candidate => String(candidate).normalize("NFKC").replace(/\s/g, "").toLowerCase() === normalized);
    }) ?? null;
  }

  static extractBattleSection(text) {
    const startPatterns = [
      /###\s*アビリティ一覧[\s\S]*?\n\s*バトアビ\s*\n/,
      /アビリティ一覧[\s\S]*?\n\s*バトアビ\s*\n/,
      /\n\s*バトアビ\s*\n/
    ];
    let start = -1;
    let consumed = 0;
    for (const pattern of startPatterns) {
      const match = pattern.exec(text);
      if (match) { start = match.index; consumed = match[0].length; break; }
    }
    if (start < 0) throw new Error("Game8の『アビリティ一覧 → バトアビ』を見つけられませんでした。");
    const tail = text.slice(start + consumed);
    const endCandidates = [
      tail.search(/\n\s*サポアビ\s*\n/),
      tail.search(/\n###?\s*サポートアビリティ/),
      tail.search(/\n###?\s*必殺技/),
      tail.search(/\n##\s*[^\n]+の灯火/)
    ].filter(index => index >= 0);
    return tail.slice(0, endCandidates.length ? Math.min(...endCandidates) : tail.length).trim();
  }

  static parse({ text, sourceUrl = "", ownerId = "", repo }) {
    const normalized = this.normalizeText(text);
    const characterName = this.detectCharacterName(normalized);
    const character = this.findCharacter(repo, characterName, ownerId);
    if (!character) throw new Error(`キャラクターを特定できませんでした。${characterName ? `検出名：${characterName}` : "キャラクターを選択してください。"}`);

    const section = this.extractBattleSection(normalized)
      .replace(/^\s*[＊*]{3,}\s*$/gm, "")
      .replace(/^\s*Image:[^\n]*$/gm, "")
      .trim();

    const lines = section.split("\n").map(line => line.trim()).filter(Boolean);
    const abilities = [];
    let current = null;
    const flush = () => {
      if (!current) return;
      current.description = current.descriptionLines.join("\n").trim();
      delete current.descriptionLines;
      if (!current.name || current.name.length > 60) { current = null; return; }
      current.effects = this.inferEffects(current.description);
      current.dataStatus = "verified";
      current.dataNote = `Game8掲載内容から取り込み。特殊効果はdescription/sourceTextを確認してください。`;
      current.source = {
        provider: "Game8",
        url: sourceUrl,
        checkedAt: new Date().toISOString().slice(0, 10),
        characterName
      };
      current.sourceText = `${current.name}\n${current.description}`.trim();
      abilities.push(current);
      current = null;
    };

    const ignored = /^(バトアビ|サポアビ|特殊|必殺技\/EX|灯火強化前|灯火強化後)$/;
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (ignored.test(line) || /^〖灯火強化前/.test(line)) continue;
      const spMatch = line.match(/〖消費SP\s*(\d+)〗/);
      if (spMatch) {
        if (!current) continue;
        current.sp = Number(spMatch[1]);
        continue;
      }
      const boostMatch = line.match(/〖ブースト時〗\s*(?:威力|ターン)\s*([\d./]+)/);
      if (boostMatch && current) {
        current.boostValues = boostMatch[1].split("/").map(Number).filter(Number.isFinite);
        current.descriptionLines.push(line);
        continue;
      }
      const looksLikeName = index + 1 < lines.length && /〖消費SP\s*\d+〗/.test(lines[index + 1]);
      if (looksLikeName) {
        flush();
        const cleanName = line.replace(/灯火の加護/g, "").replace(/^[①②③④⑤⑥⑦⑧⑨⑩\d.、\s]+/, "").trim();
        current = {
          id: `game8_${character.id}_battle_${this.slug(cleanName)}`,
          ownerId: character.id,
          category: "battle",
          name: cleanName,
          timing: "setup",
          sp: 0,
          power: 0,
          hits: 1,
          shield: 0,
          duration: 0,
          maxBoost: 3,
          boostValues: [],
          descriptionLines: []
        };
        continue;
      }
      if (current) current.descriptionLines.push(line);
    }
    flush();

    if (!abilities.length) throw new Error("バトルアビリティを解析できませんでした。個別ページ全文をコピーして貼り付けてください。");
    for (const ability of abilities) this.inferCombatFields(ability);
    return { character, characterName, abilities, sourceUrl };
  }

  static inferCombatFields(ability) {
    const text = ability.description;
    const power = text.match(/威力\s*([\d,]+)/)?.[1];
    if (power) ability.power = Number(power.replaceAll(",", ""));
    const hitPatterns = [/(\d+)回の(?:剣|槍|短剣|斧|弓|杖|本|扇|火|氷|雷|風|光|闇)/, /攻撃回数が(\d+)回/, /([一二三四五六七八九十])連/];
    for (const pattern of hitPatterns) {
      const match = text.match(pattern);
      if (!match) continue;
      ability.hits = /^\d+$/.test(match[1]) ? Number(match[1]) : ({一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10}[match[1]] ?? 1);
      break;
    }
    const attackType = text.match(/(剣|槍|短剣|斧|弓|杖|本|扇|火|氷|雷|風|光|闇)(?:物理|属性)攻撃/);
    ability.damageType = attackType?.[1] ?? "none";
    ability.attackClass = text.includes("属性攻撃") ? "elemental" : text.includes("物理攻撃") ? "physical" : "support";
    ability.target = text.includes("敵全体") ? "allEnemies" : text.includes("ランダム") ? "randomEnemy" : text.includes("味方前衛全体") ? "allAllies" : text.includes("自身") ? "self" : "singleEnemy";
    ability.shield = ability.power > 0 ? ability.hits : 0;
    const duration = text.match(/（(\d+)ターン/);
    if (duration) ability.duration = Number(duration[1]);
  }

  static inferEffects(text) {
    const effects = [];
    const mappings = [
      ["物攻", "physicalAttack"], ["属攻", "elementalAttack"], ["物防", "physicalDefense"],
      ["属防", "elementalDefense"], ["速度", "speed"], ["会心", "critical"]
    ];
    for (const [label, stat] of mappings) {
      const up = text.match(new RegExp(`${label}(?:・[^\\n]*?)?アップ(\\d+)%`));
      const down = text.match(new RegExp(`${label}(?:・[^\\n]*?)?ダウン(\\d+)%`));
      if (up) effects.push({ type: `${stat}Up`, value: Number(up[1]) });
      if (down) effects.push({ type: `${stat}Down`, value: Number(down[1]) });
    }
    const heal = text.match(/HP回復[^\n]*?（効力\s*(\d+)）/);
    if (heal) effects.push({ type: "heal", value: Number(heal[1]) });
    return effects;
  }

  static merge(currentAbilities, parsedAbilities, { replaceOwnerBattle = false, ownerId = "" } = {}) {
    let base = currentAbilities.map(item => structuredClone(item));
    if (replaceOwnerBattle && ownerId) {
      base = base.filter(item => !(item.ownerId === ownerId && item.category === "battle"));
    }
    const map = new Map(base.map(item => [item.id, item]));
    const report = { added: 0, updated: 0, removed: currentAbilities.length - base.length };
    for (const ability of parsedAbilities) {
      if (map.has(ability.id)) report.updated += 1;
      else report.added += 1;
      map.set(ability.id, ability);
    }
    return { abilities: [...map.values()], report };
  }
}
