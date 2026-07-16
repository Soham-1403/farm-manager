import type { AppSetting, Enterprise } from './types';

export const sharedSplitKey = (enterpriseId: string) => `sharedSplit:${enterpriseId}`;

export function sharedSplitDefault(settings: AppSetting[], enterprise: Pick<Enterprise, 'id' | 'name'>) {
  const saved = settings.find(x => x.key === sharedSplitKey(enterprise.id))?.value;
  return saved == null || saved === '' ? (enterprise.name.trim().toLowerCase() === 'poultry' ? 100 : 0) : Number(saved);
}
