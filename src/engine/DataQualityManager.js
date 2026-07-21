export class DataQualityManager {
  constructor(repo) { this.repo = repo; }

  statusOf(item) {
    if (!item || item.isPlaceholder || item.dataStatus === "incomplete") return "missing";
    if (["verified", "complete", "official"].includes(item.dataStatus)) return "verified";
    return "provisional";
  }

  characterReport(characterId) {
    const character = this.repo.getCharacter(characterId);
    const abilities = this.repo.getAbilities(characterId);
    const groups = { battle: [], ultimate: [], ex: [] };
    for (const ability of abilities) if (groups[ability.category]) groups[ability.category].push(ability);
    const required = { battle: 3, ultimate: 1, ex: 1 };
    const categories = Object.fromEntries(Object.entries(required).map(([category, minimum]) => {
      const list = groups[category];
      const real = list.filter(a => !a.isPlaceholder);
      const verified = real.filter(a => this.statusOf(a) === "verified");
      return [category, { minimum, total: list.length, real: real.length, verified: verified.length, missing: Math.max(0, minimum - real.length) }];
    }));
    const realCount = Object.values(categories).reduce((n, x) => n + Math.min(x.minimum, x.real), 0);
    const verifiedCount = Object.values(categories).reduce((n, x) => n + Math.min(x.minimum, x.verified), 0);
    const requiredCount = 5;
    return { character, categories, completeness: Math.round(100 * realCount / requiredCount), confidence: Math.round(100 * verifiedCount / requiredCount) };
  }

  summary() {
    const reports = this.repo.getCharacters().map(c => this.characterReport(c.id));
    const complete = reports.filter(r => r.completeness === 100).length;
    const verified = reports.filter(r => r.confidence === 100).length;
    const missingAbilities = reports.reduce((n, r) => n + Object.values(r.categories).reduce((m, x) => m + x.missing, 0), 0);
    const averageCompleteness = reports.length ? Math.round(reports.reduce((n, r) => n + r.completeness, 0) / reports.length) : 0;
    const enemies = this.repo.getEnemies();
    const readyEnemies = enemies.filter(e => e.dataStatus !== "incomplete" && Number(e.maxHp) > 0 && Number(e.shield) >= 0).length;
    return { totalCharacters: reports.length, completeCharacters: complete, verifiedCharacters: verified, missingAbilities, averageCompleteness, totalEnemies: enemies.length, readyEnemies, reports };
  }
}
