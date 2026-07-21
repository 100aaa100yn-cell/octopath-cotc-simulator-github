export class CharacterImporter {
  static requiredColumns = ["id", "name", "weapon", "element", "role"];

  static parseCsv(text) {
    const rows = [];
    let row = [];
    let value = "";
    let quoted = false;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      const next = text[index + 1];

      if (char === '"' && quoted && next === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === "," && !quoted) {
        row.push(value);
        value = "";
      } else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && next === "\n") index += 1;
        row.push(value);
        if (row.some(cell => cell.trim() !== "")) rows.push(row);
        row = [];
        value = "";
      } else {
        value += char;
      }
    }

    if (value || row.length) {
      row.push(value);
      rows.push(row);
    }

    if (!rows.length) return [];

    const headers = rows[0].map(header => header.trim().replace(/^\uFEFF/, ""));
    const missing = this.requiredColumns.filter(column => !headers.includes(column));
    if (missing.length) {
      throw new Error(`必須列がありません: ${missing.join(", ")}`);
    }

    return rows.slice(1).map((cells, rowIndex) => {
      const item = Object.fromEntries(
        headers.map((header, index) => [header, (cells[index] ?? "").trim()])
      );

      for (const key of ["rarity", "level", "patk", "eatk", "speed", "maxSp", "baseScore", "crit"]) {
        if (item[key] !== "") item[key] = Number(item[key]);
      }

      item.supportIds = [];
      item.battleIds = [];
      item.ultimateId = null;
      item.exId = null;
      item.dataStatus ||= "provisional";
      item.dataNote ||= "CSV一括取込";
      item.__row = rowIndex + 2;
      return item;
    });
  }

  static merge(current, incoming, mode = "upsert") {
    const result = structuredClone(current);
    const indexById = new Map(result.map((item, index) => [item.id, index]));
    const report = { added: 0, updated: 0, skipped: 0, errors: [] };

    for (const raw of incoming) {
      const item = { ...raw };
      delete item.__row;

      if (!item.id || !item.name) {
        report.errors.push(`行${raw.__row ?? "?"}: id/nameが不足`);
        continue;
      }

      const existingIndex = indexById.get(item.id);
      if (existingIndex === undefined) {
        result.push(item);
        indexById.set(item.id, result.length - 1);
        report.added += 1;
      } else if (mode === "upsert") {
        result[existingIndex] = { ...result[existingIndex], ...item };
        report.updated += 1;
      } else {
        report.skipped += 1;
      }
    }

    return { characters: result, report };
  }
}