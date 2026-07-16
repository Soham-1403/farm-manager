import { describe, expect, it } from 'vitest';
import { firebaseSyncDirection } from './firebase-sync-logic';

const record = (updatedAt: string, value: number) => ({ id: 'row-1', updatedAt, value });

describe('Firebase synchronization conflict handling', () => {
  it('downloads a cloud-only record', () => expect(firebaseSyncDirection(undefined, { record: record('2026-01-01T00:00:00Z', 1), updatedAt: '2026-01-01T00:00:00Z', deviceId: 'b' }, 'a')).toBe('apply'));
  it('uploads a local-only record', () => expect(firebaseSyncDirection(record('2026-01-01T00:00:00Z', 1), undefined, 'a')).toBe('upload'));
  it('keeps the newest timestamp', () => {
    expect(firebaseSyncDirection(record('2026-01-02T00:00:00Z', 2), { record: record('2026-01-01T00:00:00Z', 1), updatedAt: '2026-01-01T00:00:00Z', deviceId: 'b' }, 'a')).toBe('upload');
    expect(firebaseSyncDirection(record('2026-01-01T00:00:00Z', 1), { record: record('2026-01-02T00:00:00Z', 2), updatedAt: '2026-01-02T00:00:00Z', deviceId: 'b' }, 'a')).toBe('apply');
  });
  it('does nothing when both copies match', () => expect(firebaseSyncDirection(record('2026-01-01T00:00:00Z', 1), { record: record('2026-01-01T00:00:00Z', 1), updatedAt: '2026-01-01T00:00:00Z', deviceId: 'b' }, 'a')).toBe('none'));
  it('uses the device id as a deterministic equal-time tie breaker', () => {
    const remote = { record: record('2026-01-01T00:00:00Z', 2), updatedAt: '2026-01-01T00:00:00Z', deviceId: 'b' };
    expect(firebaseSyncDirection(record('2026-01-01T00:00:00Z', 1), remote, 'a')).toBe('apply');
    expect(firebaseSyncDirection(record('2026-01-01T00:00:00Z', 1), remote, 'c')).toBe('upload');
  });
});
