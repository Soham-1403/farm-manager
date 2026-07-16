import { describe, expect, it } from 'vitest';
import { compareSyncTimestamps, normalizeSyncRecord, normalizeSyncUrl } from './sync';

describe('synchronization URL safety', () => {
  it('accepts HTTPS and removes a trailing slash', () => {
    expect(normalizeSyncUrl('https://sync.example.com/')).toBe('https://sync.example.com');
  });

  it('allows plain HTTP only for local development', () => {
    expect(normalizeSyncUrl('http://127.0.0.1:8765/')).toBe('http://127.0.0.1:8765');
    expect(() => normalizeSyncUrl('http://sync.example.com')).toThrow(/HTTPS/);
  });

  it('rejects credentials or query text in the base URL', () => {
    expect(() => normalizeSyncUrl('https://user:pass@sync.example.com')).toThrow(/without credentials/);
    expect(() => normalizeSyncUrl('https://sync.example.com?token=secret')).toThrow(/without credentials/);
  });

  it('compares equivalent ISO timestamps by instant instead of text',()=>{
    expect(compareSyncTimestamps('2026-07-15T12:00:00+05:30','2026-07-15T07:00:00Z')).toBeLessThan(0);
    expect(compareSyncTimestamps('2026-07-15T12:30:00+05:30','2026-07-15T07:00:00Z')).toBe(0);
    expect(compareSyncTimestamps('2026-07-15T12:31:00+05:30','2026-07-15T07:00:00Z')).toBeGreaterThan(0);
  });

  it('preserves batches closed by older clients instead of orphaning their history',()=>{
    const normalized=normalizeSyncRecord('batches',{id:'b',updatedAt:'2026-01-01T00:00:00Z',deletedAt:'2026-01-01T00:00:00Z'},'2026-02-01T00:00:00Z');
    expect(normalized.deletedAt).toBeUndefined();expect(normalized.active).toBe(false);expect(normalized.closedDate).toBe('2026-01-01');expect(normalized.updatedAt).toBe('2026-02-01T00:00:00Z');
  });

  it('adds a closure date to inactive batches received from an intermediate client',()=>{
    const normalized=normalizeSyncRecord('batches',{id:'b',active:false,updatedAt:'2026-03-04T10:00:00Z'},'2026-03-05T00:00:00Z');
    expect(normalized.closedDate).toBe('2026-03-04');expect(normalized.updatedAt).toBe('2026-03-05T00:00:00Z');
  });

  it('preserves herds closed by older clients instead of orphaning their history',()=>{
    const normalized=normalizeSyncRecord('herds',{id:'h',updatedAt:'2026-01-02T00:00:00Z',deletedAt:'2026-01-02T00:00:00Z'},'2026-02-01T00:00:00Z');
    expect(normalized.deletedAt).toBeUndefined();expect(normalized.active).toBe(false);expect(normalized.closedDate).toBe('2026-01-02');
  });

  it('adds a completion date to completed crop cycles from older clients',()=>{
    const normalized=normalizeSyncRecord('cropCycles',{id:'c',status:'complete',expectedHarvest:'2026-04-10',updatedAt:'2026-04-11T00:00:00Z'},'2026-05-01T00:00:00Z');expect(normalized.completedDate).toBe('2026-04-10');expect(normalized.updatedAt).toBe('2026-05-01T00:00:00Z');
  });
});
