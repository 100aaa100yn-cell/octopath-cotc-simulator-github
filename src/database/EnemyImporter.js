export class EnemyImporter {
  static requiredColumns = ["id", "name"];
  static numericColumns = [
    "level", "maxHp", "shield", "shieldRecovery", "pdef", "edef",
    "breakMultiplier", "weaknessMultiplier", "breakDuration", "phaseCount"
  ];
  static arrayColumns = ["weakWeapons", "weakElements", "tags"];

  static parseCsv(text) {
    const rows = [];
    let row = [], value = "", quoted = false;
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index], next = text[index + 1];
      if (char === '"' && quoted && next === '"') { value += '"'; index += 1; }
      else if (char === '"') quoted = !quoted;
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
    const missing = this.requiredColumns.filter(column => !headers.includes(column));
    if (missing.length) throw new Error(`必須列がありません: ${missing.join(", ")}`);

    return rows.slice(1).map((cells, rowIndex) => {
      const item = { __row: rowIndex + 2 };
      headers.forEach((header, index) => {
        const raw = (cells[index] ?? "").trim();
        if (raw !== "") item[header] = raw;
      });
      for (const key of this.numericColumns) {
        if (item[key] === undefined) continue;
        const number = Number(item[key]);
        if (!Number.isFinite(number)) throw new Error(`行${item.__row}: ${key} は数値で入力してください。`);
        item[key] = number;
      }
      for (const key of this.arrayColumns) {
        if (item[key] !== undefined) item[key] = String(item[key]).split(/[;；|]/).map(x => x.trim()).filter(Boolean);
      }
      if (item.criticalAllowed !== undefined) item.criticalAllowed = !["false", "0", "no", "off"].includes(String(item.criticalAllowed).toLowerCase());
      for (const key of ["phasesJson", "actionsJson"]) {
        if (item[key] === undefined) continue;
        try { item[key === "phasesJson" ? "phases" : "actions"] = JSON.parse(item[key]); }
        catch (error) { throw new Error(`行${item.__row}: ${key} のJSONが不正です (${error.message})`); }
        delete item[key];
      }
      return item;
    });
  }

  static merge(current, incoming, mode = "upsert") {
    const result = structuredClone(current);
    const indexById = new Map(result.map((item, index) => [item.id, index]));
    const report = { added: 0, updated: 0, unchanged: 0, skipped: 0, errors: [] };
    for (const raw of incoming) {
      const item = { ...raw }; delete item.__row;
      if (!item.id || !item.name) { report.errors.push(`行${raw.__row ?? "?"}: id/nameが不足`); continue; }
      const existingIndex = indexById.get(item.id);
      if (existingIndex === undefined) {
        const created = {
          level: 100, maxHp: 1, shield: 1, shieldRecovery: item.shield ?? 1,
          weakWeapons: [], weakElements: [], breakMultiplier: 2,
          weaknessMultiplier: 1.5, breakDuration: 1, criticalAllowed: true,
          dataStatus: "incomplete", actions: [], phases: [], ...item
        };
        result.push(created); indexById.set(item.id, result.length - 1); report.added += 1;
      } else if (mode === "upsert") {
        const before = result[existingIndex], after = { ...before, ...item };
        if (JSON.stringify(before) === JSON.stringify(after)) report.unchanged += 1;
        else { result[existingIndex] = after; report.updated += 1; }
      } else report.skipped += 1;
    }
    return { enemies: result, report };
  }

  static completeness(enemy) {
    const core = ["level","maxHp","shield","shieldRecovery","pdef","edef","weakWeapons","weakElements","breakMultiplier"];
    const missingCore = core.filter(field => {
      const value = enemy[field];
      return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
    });
    const hasActions = Array.isArray(enemy.actions) && enemy.actions.length > 0;
    const score = Math.round(((core.length - missingCore.length) + (hasActions ? 1 : 0)) / (core.length + 1) * 100);
    return { score, missingCore, hasActions, ready: missingCore.length === 0 && hasActions };
  }
}
