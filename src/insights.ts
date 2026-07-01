import type { DecliningPage, KeywordOpportunity, SearchAnalyticsRow } from "./types.js";

function rowByFirstKey(rows: SearchAnalyticsRow[]): Map<string, SearchAnalyticsRow> {
  const result = new Map<string, SearchAnalyticsRow>();
  for (const row of rows) {
    const key = row.keys[0];
    if (key) result.set(key, row);
  }
  return result;
}

export function computeDecliningPages(
  currentRows: SearchAnalyticsRow[],
  previousRows: SearchAnalyticsRow[],
  options: { minImpressions: number; limit: number }
): DecliningPage[] {
  const currentByPage = rowByFirstKey(currentRows);
  const previousByPage = rowByFirstKey(previousRows);
  const declines: DecliningPage[] = [];

  for (const [page, previous] of previousByPage.entries()) {
    const current = currentByPage.get(page);
    if (!current || previous.impressions < options.minImpressions) continue;

    const deltas = {
      clicks: current.clicks - previous.clicks,
      impressions: current.impressions - previous.impressions,
      ctr: current.ctr - previous.ctr,
      position: current.position - previous.position
    };
    const declined = deltas.clicks < 0 || deltas.impressions < 0 || deltas.ctr < 0 || deltas.position > 0;
    if (!declined) continue;

    const clickLoss = Math.abs(Math.min(0, deltas.clicks));
    const positionText =
      deltas.position > 0 ? ` Average position worsened by ${deltas.position.toFixed(1)}.` : "";
    declines.push({
      page,
      current,
      previous,
      deltas,
      explanation: `${page} lost ${clickLoss} clicks versus the previous period and impressions changed by ${deltas.impressions}.${positionText}`
    });
  }

  return declines
    .sort((a, b) => a.deltas.clicks - b.deltas.clicks || a.deltas.impressions - b.deltas.impressions)
    .slice(0, options.limit);
}

export function computeKeywordOpportunities(
  rows: SearchAnalyticsRow[],
  options: {
    minImpressions: number;
    maxCtr: number;
    positionMin: number;
    positionMax: number;
    limit: number;
  }
): KeywordOpportunity[] {
  return rows
    .filter(
      (row) =>
        row.impressions >= options.minImpressions &&
        row.ctr <= options.maxCtr &&
        row.position >= options.positionMin &&
        row.position <= options.positionMax &&
        Boolean(row.keys[0])
    )
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, options.limit)
    .map((row) => {
      const query = row.keys[0] ?? "";
      const page = row.keys[1];
      return {
        query,
        ...(page ? { page } : {}),
        impressions: row.impressions,
        clicks: row.clicks,
        ctr: row.ctr,
        position: row.position,
        opportunityReason: `${query} has high impressions (${row.impressions}) with CTR ${(row.ctr * 100).toFixed(
          2
        )}% and average position ${row.position.toFixed(1)}.`
      };
    });
}

