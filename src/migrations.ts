import { id, now } from './types';

type Row = Record<string, unknown>;

export function normalizeLegacyFeedLinks(tables: Record<string, unknown[]>, normalizedAt = now()) {
  const units = (tables.feedUnits || []) as Row[];
  const feedTypes = (tables.feedTypes || []) as Row[];
  const harvests = (tables.feedHarvests || []) as Row[];
  tables.feedUnits = units;
  tables.feedTypes = feedTypes;
  for (const unit of units) {
    if (unit.feedTypeId) continue;
    const name = String(unit.name || 'Home-grown feed').trim() || 'Home-grown feed';
    let feedType = feedTypes.find(row => !row.deletedAt && row.source === 'home-grown' && String(row.name || '').trim().toLowerCase() === name.toLowerCase());
    if (!feedType) {
      const unitName = harvests.find(row => row.unitId === unit.id && !row.deletedAt)?.unit === 'litre' ? 'litre' : 'kg';
      feedType = { id: id(), createdAt: normalizedAt, updatedAt: normalizedAt, name, category: 'greens', source: 'home-grown', unit: unitName, active: true };
      feedTypes.push(feedType);
    }
    unit.feedTypeId = feedType.id;
    unit.updatedAt = normalizedAt;
  }
  return tables;
}
