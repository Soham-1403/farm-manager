import { browserLocalPersistence, onAuthStateChanged, setPersistence, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { collection, doc, onSnapshot, writeBatch, type DocumentData, type Unsubscribe } from 'firebase/firestore';
import { db, TABLE_NAMES } from './db';
import { firebaseAuth, firestore } from './firebase';
import { normalizeSyncRecord } from './sync';
import { firebaseSyncDirection } from './firebase-sync-logic';

export const FIREBASE_SYNC_TABLES = TABLE_NAMES.filter(name => name !== 'settings');
type TableName = typeof FIREBASE_SYNC_TABLES[number];
type FarmRecord = { id: string; updatedAt: string; [key: string]: unknown };
type CloudRecord = { table: TableName; key: string; record: FarmRecord; updatedAt: string; deviceId: string };
export type FirebaseSyncResult = { uploaded: number; downloaded: number; applied: number };
export type FirebaseSyncState = {
  user: User | null;
  phase: 'signed-out' | 'connecting' | 'syncing' | 'synced' | 'offline' | 'error';
  message: string;
  lastSyncAt: string;
};

let state: FirebaseSyncState = { user: firebaseAuth.currentUser, phase: firebaseAuth.currentUser ? 'connecting' : 'signed-out', message: '', lastSyncAt: '' };
const stateListeners = new Set<(value: FirebaseSyncState) => void>();
const remoteRecords = new Map<string, CloudRecord>();
let snapshotStop: Unsubscribe | null = null;
let snapshotReady = false;
let activeUid = '';
let deviceId = '';
let refreshLocal: (() => void | Promise<void>) | null = null;
let syncPromise: Promise<FirebaseSyncResult> | null = null;
let debounceTimer: number | null = null;

const publish = (patch: Partial<FirebaseSyncState>) => {
  state = { ...state, ...patch };
  for (const listener of stateListeners) listener(state);
};

export function subscribeFirebaseSyncState(listener: (value: FirebaseSyncState) => void) {
  stateListeners.add(listener);
  listener(state);
  return () => { stateListeners.delete(listener); };
}

export async function firebaseSignIn(email: string, password: string) {
  await setPersistence(firebaseAuth, browserLocalPersistence);
  return signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
}

export async function firebaseSignOut() {
  await signOut(firebaseAuth);
}

function cloudKey(table: string, key: string) { return `${table}__${key}`; }
function cleanRecord(record: FarmRecord): FarmRecord { return JSON.parse(JSON.stringify(record)) as FarmRecord; }
function validCloudRecord(value: DocumentData): value is CloudRecord {
  return Boolean(value) && FIREBASE_SYNC_TABLES.includes(value.table as TableName) && typeof value.key === 'string' &&
    Boolean(value.record) && value.record.id === value.key && typeof value.record.updatedAt === 'string' &&
    typeof value.updatedAt === 'string' && typeof value.deviceId === 'string';
}

async function getDeviceId() {
  if (deviceId) return deviceId;
  const saved = await db.settings.get('firebaseDeviceId');
  deviceId = saved?.value || crypto.randomUUID();
  if (!saved) await db.settings.put({ key: 'firebaseDeviceId', value: deviceId });
  return deviceId;
}

async function applySnapshot(records: CloudRecord[]) {
  let applied = 0;
  await db.transaction('rw', FIREBASE_SYNC_TABLES.map(name => db.table(name)), async () => {
    for (const change of records) {
      const table = db.table(change.table);
      const local = await table.get(change.key) as FarmRecord | undefined;
      const remote = normalizeSyncRecord(change.table, cleanRecord(change.record));
      if (firebaseSyncDirection(local, { record: remote, updatedAt: remote.updatedAt, deviceId: change.deviceId }, deviceId) === 'apply') {
        await table.put(remote);
        applied += 1;
      }
    }
  });
  if (applied) await refreshLocal?.();
  return applied;
}

async function startUserSnapshot(user: User) {
  snapshotStop?.();
  snapshotStop = null;
  snapshotReady = false;
  activeUid = user.uid;
  remoteRecords.clear();
  await getDeviceId();
  publish({ user, phase: navigator.onLine ? 'connecting' : 'offline', message: navigator.onLine ? 'Connecting to your farm…' : 'Offline; changes will synchronize when online.' });
  const recordsCollection = collection(firestore, 'users', user.uid, 'records');
  snapshotStop = onSnapshot(recordsCollection, { includeMetadataChanges: true }, async snapshot => {
    if (user.uid !== activeUid) return;
    const incoming: CloudRecord[] = [];
    for (const item of snapshot.docs) {
      const value = item.data();
      if (!validCloudRecord(value)) continue;
      remoteRecords.set(cloudKey(value.table, value.key), value);
      incoming.push(value);
    }
    const applied = await applySnapshot(incoming);
    snapshotReady = true;
    publish({ phase: snapshot.metadata.fromCache && !navigator.onLine ? 'offline' : 'synced', message: applied ? `${applied} remote change${applied === 1 ? '' : 's'} applied.` : 'Farm records are synchronized.' });
    void synchronizeFirebase().catch(() => undefined);
  }, async error => {
    const message = error.code === 'permission-denied' ? 'Firestore access was denied. Confirm Authentication and security rules.' : error.message;
    await db.settings.put({ key: 'firebaseLastSyncError', value: message });
    publish({ phase: navigator.onLine ? 'error' : 'offline', message });
  });
}

async function performSync(): Promise<FirebaseSyncResult> {
  const user = firebaseAuth.currentUser;
  if (!user) throw Error('Sign in to Firebase before synchronizing.');
  if (!snapshotReady) return { uploaded: 0, downloaded: 0, applied: 0 };
  if (!navigator.onLine) {
    publish({ phase: 'offline', message: 'Offline; changes are safely stored locally and will synchronize when connectivity returns.' });
    return { uploaded: 0, downloaded: remoteRecords.size, applied: 0 };
  }
  publish({ phase: navigator.onLine ? 'syncing' : 'offline', message: navigator.onLine ? 'Synchronizing…' : 'Offline; changes are safely queued locally.' });
  const currentDevice = await getDeviceId();
  const uploads: CloudRecord[] = [];
  let applied = 0;
  for (const tableName of FIREBASE_SYNC_TABLES) {
    const table = db.table(tableName);
    const localRows = await table.toArray() as FarmRecord[];
    for (const row of localRows) {
      if (!row?.id || !row.updatedAt) continue;
      const key = cloudKey(tableName, row.id);
      const remote = remoteRecords.get(key);
      const direction = firebaseSyncDirection(row, remote, currentDevice);
      if (direction === 'upload') {
        uploads.push({ table: tableName, key: row.id, record: cleanRecord(row), updatedAt: row.updatedAt, deviceId: currentDevice });
      } else if (direction === 'apply' && remote) {
        await table.put(normalizeSyncRecord(tableName, cleanRecord(remote.record)));
        applied += 1;
      }
    }
  }
  for (let offset = 0; offset < uploads.length; offset += 450) {
    const batch = writeBatch(firestore);
    for (const change of uploads.slice(offset, offset + 450)) {
      batch.set(doc(firestore, 'users', user.uid, 'records', cloudKey(change.table, change.key)), change);
      remoteRecords.set(cloudKey(change.table, change.key), change);
    }
    await batch.commit();
  }
  if (applied) await refreshLocal?.();
  const completedAt = new Date().toISOString();
  await db.settings.bulkPut([{ key: 'firebaseLastSyncAt', value: completedAt }, { key: 'firebaseLastSyncError', value: '' }]);
  publish({ phase: navigator.onLine ? 'synced' : 'offline', lastSyncAt: completedAt, message: navigator.onLine ? 'Farm records are synchronized.' : 'Changes are queued and will synchronize when online.' });
  return { uploaded: uploads.length, downloaded: remoteRecords.size, applied };
}

export function synchronizeFirebase() {
  if (syncPromise) return syncPromise;
  syncPromise = performSync().catch(async error => {
    const message = error instanceof Error ? error.message : 'Synchronization failed.';
    await db.settings.put({ key: 'firebaseLastSyncError', value: message });
    publish({ phase: navigator.onLine ? 'error' : 'offline', message });
    throw error;
  }).finally(() => { syncPromise = null; });
  return syncPromise;
}

export function requestFirebaseSync(delay = 600) {
  if (!firebaseAuth.currentUser) return;
  if (debounceTimer !== null) window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => { debounceTimer = null; void synchronizeFirebase().catch(() => undefined); }, delay);
}

export function startFirebaseAutoSync(onLocalDataChanged: () => void | Promise<void>) {
  refreshLocal = onLocalDataChanged;
  const authStop = onAuthStateChanged(firebaseAuth, user => {
    if (user) void startUserSnapshot(user);
    else {
      snapshotStop?.(); snapshotStop = null; snapshotReady = false; activeUid = ''; remoteRecords.clear();
      publish({ user: null, phase: 'signed-out', message: 'Sign in to synchronize mobile and desktop.' });
    }
  });
  const online = () => requestFirebaseSync(0);
  const offline = () => publish({ phase: 'offline', message: 'Offline; changes will synchronize when connectivity returns.' });
  window.addEventListener('online', online);
  window.addEventListener('offline', offline);
  const interval = window.setInterval(() => requestFirebaseSync(0), 5 * 60 * 1000);
  return () => {
    authStop(); snapshotStop?.(); snapshotStop = null; refreshLocal = null;
    window.removeEventListener('online', online); window.removeEventListener('offline', offline); window.clearInterval(interval);
    if (debounceTimer !== null) window.clearTimeout(debounceTimer);
  };
}
