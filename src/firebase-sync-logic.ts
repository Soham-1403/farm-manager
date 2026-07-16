import { compareSyncTimestamps } from './sync';

export type ComparableRecord = { updatedAt: string; [key: string]: unknown };
export type ComparableCloudRecord = { record: ComparableRecord; updatedAt: string; deviceId: string };

export function firebaseSyncDirection(local: ComparableRecord | undefined, remote: ComparableCloudRecord | undefined, localDeviceId: string): 'upload' | 'apply' | 'none' {
  if (!local) return remote ? 'apply' : 'none';
  if (!remote) return 'upload';
  const order = compareSyncTimestamps(local.updatedAt, remote.updatedAt);
  if (order > 0) return 'upload';
  if (order < 0) return 'apply';
  if (JSON.stringify(local) === JSON.stringify(remote.record)) return 'none';
  return localDeviceId > remote.deviceId ? 'upload' : 'apply';
}
