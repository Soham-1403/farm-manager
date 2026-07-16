import { db, TABLE_NAMES } from './db';

export const SYNC_TABLE_NAMES = TABLE_NAMES.filter(name => name !== 'settings');

export type SyncConfig = { serverUrl: string; token: string; deviceId: string; cursor: number };
export type SyncResult = { uploaded: number; downloaded: number; applied: number; conflicts: number; cursor: number };
type FarmRecord = { id: string; updatedAt: string; [key: string]: unknown };
type WireChange = { table: typeof SYNC_TABLE_NAMES[number]; key: string; record: FarmRecord; deviceId?: string };

export function compareSyncTimestamps(left:string,right:string){
  const leftTime=Date.parse(left),rightTime=Date.parse(right);
  if(!Number.isFinite(leftTime)||!Number.isFinite(rightTime))return left.localeCompare(right);
  return leftTime===rightTime?0:leftTime>rightTime?1:-1;
}

export function normalizeSyncRecord(table:string,record:FarmRecord,normalizedAt=new Date().toISOString()):FarmRecord{
  if(table==='batches'&&(record.deletedAt||(record.active===false&&!record.closedDate))){const normalized:FarmRecord={...record,active:false,closedDate:String(record.deletedAt||record.updatedAt||normalizedAt).slice(0,10),updatedAt:normalizedAt};delete normalized.deletedAt;return normalized}
  if(table==='herds'&&(record.deletedAt||(record.active===false&&!record.closedDate))){const normalized:FarmRecord={...record,active:false,closedDate:String(record.deletedAt||record.updatedAt||normalizedAt).slice(0,10),updatedAt:normalizedAt};delete normalized.deletedAt;return normalized}
  if(table==='cropCycles'&&record.status==='complete'&&!record.completedDate)return {...record,completedDate:String(record.expectedHarvest||record.updatedAt||normalizedAt).slice(0,10),updatedAt:normalizedAt};
  return record;
}

export function normalizeSyncUrl(raw: string): string {
  const value = raw.trim().replace(/\/+$/, '');
  let url: URL;
  try { url = new URL(value); } catch { throw Error('Enter a valid synchronization server URL.'); }
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) throw Error('Use HTTPS. Plain HTTP is allowed only for localhost.');
  if (url.username || url.password || url.search || url.hash) throw Error('Use the server base URL without credentials, query text, or a fragment.');
  return url.toString().replace(/\/$/, '');
}

function isWireChange(value: unknown): value is WireChange {
  if (!value || typeof value !== 'object') return false;
  const change = value as Partial<WireChange>;
  return typeof change.table === 'string' && SYNC_TABLE_NAMES.includes(change.table as typeof SYNC_TABLE_NAMES[number]) &&
    typeof change.key === 'string' && Boolean(change.record) && typeof change.record?.id === 'string' &&
    change.record.id === change.key && typeof change.record.updatedAt === 'string';
}

export async function readSyncConfig(): Promise<SyncConfig | null> {
  const rows = await db.settings.bulkGet(['syncServerUrl', 'syncToken', 'syncDeviceId', 'syncCursor']);
  const [serverUrl, token, deviceId, cursor] = rows.map(row => row?.value || '');
  if (!serverUrl || !token || !deviceId) return null;
  return { serverUrl: normalizeSyncUrl(serverUrl), token, deviceId, cursor: Math.max(0, Number(cursor) || 0) };
}

export async function synchronize(config?: SyncConfig): Promise<SyncResult> {
  const resolved = config || await readSyncConfig();
  if (!resolved) throw Error('Save the synchronization server URL and token first.');
  const serverUrl = normalizeSyncUrl(resolved.serverUrl);
  const changes: WireChange[] = [];
  for (const table of SYNC_TABLE_NAMES) {
    const records = await db.table(table).toArray() as FarmRecord[];
    for (const record of records) if (record?.id && record?.updatedAt) changes.push({ table, key: record.id, record });
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 30000);
  let response: Response;
  try {
    response = await fetch(`${serverUrl}/v1/sync`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${resolved.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: resolved.deviceId, cursor: resolved.cursor, changes }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw Error('Synchronization timed out after 30 seconds.');
    throw Error('Could not reach the synchronization server. Check the URL, network, and HTTPS certificate.');
  } finally { window.clearTimeout(timeout); }

  let payload: unknown;
  try { payload = await response.json(); } catch { throw Error(`Synchronization server returned an invalid response (${response.status}).`); }
  if (!response.ok) throw Error((payload as { error?: string })?.error || `Synchronization failed (${response.status}).`);
  const result = payload as { cursor?: unknown; changes?: unknown; conflicts?: unknown };
  if (!Number.isInteger(result.cursor) || Number(result.cursor) < 0 || !Array.isArray(result.changes) || !result.changes.every(isWireChange)) {
    throw Error('Synchronization server response does not match protocol version 1.');
  }

  let applied = 0;
  const incoming = result.changes as WireChange[];
  await db.transaction('rw', SYNC_TABLE_NAMES.map(name => db.table(name)), async () => {
    for (const change of incoming) {
      const table = db.table(change.table);
      const local = await table.get(change.key) as FarmRecord | undefined;
      const remote=normalizeSyncRecord(change.table,change.record),remoteOrder = [remote.updatedAt, change.deviceId || ''];
      const localOrder = [local?.updatedAt || '', resolved.deviceId];
      const timestampOrder=compareSyncTimestamps(remoteOrder[0],localOrder[0]);
      if (!local || timestampOrder>0 || (timestampOrder===0 && remoteOrder[1] > localOrder[1])) {
        await table.put(remote);
        applied += 1;
      }
    }
  });
  const completedAt = new Date().toISOString();
  await db.settings.bulkPut([
    { key: 'syncCursor', value: String(result.cursor) },
    { key: 'syncLastAt', value: completedAt },
    { key: 'syncLastError', value: '' },
  ]);
  return { uploaded: changes.length, downloaded: incoming.length, applied, conflicts: Number(result.conflicts) || 0, cursor: Number(result.cursor) };
}
