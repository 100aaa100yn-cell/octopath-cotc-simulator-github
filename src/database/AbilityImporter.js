export class AbilityImporter {
  static parseCsv(text) {
    const rows = this.parseRows(String(text ?? "").replace(/^\uFEFF/, ""));
    if (rows.length < 2) return [];

    const headers = rows[0].map(value => value.trim());
    return rows.slice(1)
      .filter(row => row.some(value => value.trim() !== ""))
      .map((row, index) => this.normalize(
        Object.fromEntries(headers.map((header, column) => [header, row[column] ?? ""])),
        index + 2
      ));
  }

  static parseRows(text) {
    const rows = [];
    let row = [];
    let value = "";
    let quoted = false;

    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      const next = text[index + 1];

      if (character === '"') {
        if (quoted && next === '"') {
          value += '"';
          index += 1;
        } else {
          quoted = !quoted;
        }
      } else if (character === "," && !quoted) {
        row.push(value);
        value = "";
      } else if ((character === "\n" || character === "\r") && !quoted) {
        if (character === "\r" && next === "\n") index += 1;
        row.push(value);
        rows.push(row);
        row = [];
        value = "";
      } else {
        value += character;
      }
    }

    row.push(value);
    if (row.some(item => item !== "") || rows.length === 0) rows.push(row);
    return rows;
  }

  static normalize(record, line) {
    const number = (value, fallback = 0) => {
      if (value === "") return fallback;
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) throw new Error(`${line}行目：数値「${value}」を解釈できません。`);
      return parsed;
    };

    if (!record.id || !record.ownerId || !record.name || !record.category) {
      throw new Error(`${line}行目：id、ownerId、name、categoryは必須です。`);
    }

    let effects = [];
    if (record.effectsJson?.trim()) {
      try {
        effects = JSON.parse(record.effectsJson);
      } catch {
        throw new Error(`${line}行目：effectsJsonが正しいJSONではありません。`);
      }
    } else if (record.effectType) {
      effects = [{ type: record.effectType, value: number(record.effectValue) }];
    }

    return {
      id: record.id.trim(),
      ownerId: record.ownerId.trim(),
      category: record.category.trim(),
      name: record.name.trim(),
      timing: record.timing?.trim() || "setup",
      sp: number(record.sp),
      power: number(record.power),
      hits: number(record.hits, 1),
      shield: number(record.shield),
      duration: number(record.duration),
      maxBoost: number(record.maxBoost, 3),
      dataStatus: record.dataStatus?.trim() || "provisional",
      dataNote: record.dataNote?.trim() || "",
      effects
    };
  }

  static merge(current, incoming) {
    const map = new Map(current.map(item => [item.id, structuredClone(item)]));
    const report = { added: 0, updated: 0 };

    for (const item of incoming) {
      if (map.has(item.id)) report.updated += 1;
      else report.added += 1;
      map.set(item.id, item);
    }

    return { abilities: [...map.values()], report };
  }
}
