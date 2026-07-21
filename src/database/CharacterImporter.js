export class CharacterImporter {
  static requiredColumns = ["id", "name"];
  static numericColumns = [
    "baseRank", "rarity", "level", "hp", "sp", "maxSp", "patk", "eatk",
    "pdef", "edef", "crit", "speed", "baseScore"
  ];
  static arrayColumns = ["tags", "supportIds", "battleIds"];

  static parseCsv(text) {
    const rows = [];
    let row = [];
    let value = "";
    let quoted = false;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      const next = text[index + 1];
      if (char === '"' && quoted && next === '"') {
        value += '"'; index += 1;
      } else if (char === '"') quoted = !quoted;
      else if (char === "," && !quoted) { row.push(value); value = ""; }
      else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && next === "\n") index += 1;
        row.push(value);
        if (row.some(cell => cell.trim() !== "")) rows.push(row);
        row = []; value = "";
      } else value += char;
    }
    if (quoted) throw new Error("引用符が閉じていないCSVです。");
    if (value || row.length) { row.push(value); rows.push(row); }
    if (!rows.length) return [];

    const headers = rows[0].map(header => header.trim().replace(/^\uFEFF/, ""));
    const duplicateHeaders = headers.filter((header, index) => headers.indexOf(header) !== index);
    if (duplicateHeaders.length) throw new Error(`列名が重複しています: ${[...new Set(duplicateHeaders)].join(", ")}`);
    const missing = this.requiredColumns.filter(column => !headers.includes(column));
    if (missing.length) throw new Error(`必須列がありません: ${missing.join(", ")}`);

    return rows.slice(1).map((cells, rowIndex) => {
      const item = { __row: rowIndex + 2 };
      headers.forEach((header, index) => {
        const raw = (cells[index] ?? "").trim();
        if (raw === "") return; // 空欄は既存値を保持するため取り込まない
        item[header] = raw;
      });

      for (const key of this.numericColumns) {
        if (item[key] === undefined) continue;
        const number = Number(item[key]);
        if (!Number.isFinite(number)) throw new Error(`行${item.__row}: ${key} は数値で入力してください。`);
        item[key] = number;
      }
      if (item.sp !== undefined && item.maxSp === undefined) item.maxSp = item.sp;
      delete item.sp;

      for (const key of this.arrayColumns) {
        if (item[key] !== undefined) {
          item[key] = String(item[key]).split(/[;；|]/).map(x => x.trim()).filter(Boolean);
        }
      }
      if (item.baseRank !== undefined && ![3, 4, 5].includes(item.baseRank)) {
        throw new Error(`行${item.__row}: baseRank は3・4・5のいずれかです。`);
      }
      return item;
    });
  }

  static merge(current, incoming, mode = "upsert") {
    const result = structuredClone(current);
    const indexById = new Map(result.map((item, index) => [item.id, index]));
    const report = { added: 0, updated: 0, unchanged: 0, skipped: 0, errors: [] };

    for (const raw of incoming) {
      const item = { ...raw };
      delete item.__row;
      if (!item.id || !item.name) {
        report.errors.push(`行${raw.__row ?? "?"}: id/nameが不足`); continue;
      }
      const existingIndex = indexById.get(item.id);
      if (existingIndex === undefined) {
        const created = {
          supportIds: [], battleIds: [], ultimateId: null, exId: null,
          dataStatus: "incomplete", dataNote: "CSV一括取込", ...item
        };
        result.push(created);
        indexById.set(item.id, result.length - 1);
        report.added += 1;
      } else if (mode === "upsert") {
        const before = result[existingIndex];
        const after = { ...before, ...item };
        if (JSON.stringify(before) === JSON.stringify(after)) report.unchanged += 1;
        else { result[existingIndex] = after; report.updated += 1; }
      } else report.skipped += 1;
    }
    return { characters: result, report };
  }

  static completeness(character, abilities = []) {
    const coreFields = ["baseRank", "weapon", "element", "role", "hp", "maxSp", "patk", "eatk", "pdef", "edef", "crit", "speed"];
    const missingCore = coreFields.filter(field => character[field] === undefined || character[field] === null || character[field] === "");
    const categories = new Set(abilities.map(ability => ability.category));
    const missingAbilities = ["support", "battle", "ultimate"].filter(category => !categories.has(category));
    const score = Math.round(((coreFields.length - missingCore.length) + (3 - missingAbilities.length)) / (coreFields.length + 3) * 100);
    return { score, missingCore, missingAbilities, ready: missingCore.length === 0 && missingAbilities.length === 0 };
  }
}