import { useState, type FormEvent, type ReactNode } from 'react';
import { db } from './db';
import { normalizeSyncUrl, synchronize, type SyncResult } from './sync';
import type { AppSetting } from './types';

type Action = (fn: () => Promise<unknown>, message?: string) => Promise<boolean>;
const Card = ({ children }: { children: ReactNode }) => <section className="card">{children}</section>;
const get = (settings: AppSetting[], key: string) => settings.find(item => item.key === key)?.value || '';

export function SyncPanel({ settings, act }: { settings: AppSetting[]; act: Action }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const configured = Boolean(get(settings, 'syncServerUrl') && get(settings, 'syncToken') && get(settings, 'syncDeviceId'));
  const lastAt = get(settings, 'syncLastAt');

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    return act(async () => {
      const serverUrl = normalizeSyncUrl(String(form.get('serverUrl') || ''));
      const token = String(form.get('token') || '').trim();
      if (token.length < 16) throw Error('Use a synchronization token of at least 16 characters.');
      const existingUrl = get(settings, 'syncServerUrl');
      const deviceId = get(settings, 'syncDeviceId') || crypto.randomUUID();
      await db.settings.bulkPut([
        { key: 'syncServerUrl', value: serverUrl }, { key: 'syncToken', value: token },
        { key: 'syncDeviceId', value: deviceId },
        { key: 'syncCursor', value: existingUrl === serverUrl ? get(settings, 'syncCursor') || '0' : '0' },
      ]);
    }, 'Synchronization settings saved');
  };

  const run = async () => {
    setBusy(true); setStatus('Synchronizing…');
    try {
      const result: SyncResult = await synchronize();
      setStatus(`Complete: ${result.uploaded} checked, ${result.downloaded} received, ${result.applied} applied${result.conflicts ? `, ${result.conflicts} conflict${result.conflicts === 1 ? '' : 's'} resolved` : ''}.`);
      await act(async () => undefined, 'Synchronization complete');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Synchronization failed.';
      setStatus(message);
      await db.settings.put({ key: 'syncLastError', value: message });
    } finally { setBusy(false); }
  };

  const disconnect = () => act(() => db.settings.bulkDelete(['syncServerUrl', 'syncToken', 'syncDeviceId', 'syncCursor', 'syncLastAt', 'syncLastError']), 'Synchronization disconnected');

  return <Card><h2>Optional device synchronization</h2><p className="note">Connect this installation to your private Farm Manager sync service. Farm records remain available offline and move only when you press Sync now. App settings, PIN details, and this token are never uploaded.</p><form onSubmit={save}><label>Server URL<input name="serverUrl" type="url" placeholder="https://sync.example.com" defaultValue={get(settings, 'syncServerUrl')} required /></label><label>Bearer token<input name="token" type="password" defaultValue={get(settings, 'syncToken')} minLength={16} autoComplete="off" required /></label><button className="primary">Save connection</button></form>{configured && <div className="durability"><b>Synchronization status</b><p>{lastAt ? `Last completed ${new Date(lastAt).toLocaleString()}` : 'Not synchronized yet.'}</p><p className="muted">Cursor {get(settings, 'syncCursor') || '0'} · Device {get(settings, 'syncDeviceId').slice(0, 8)}</p><button className="primary" type="button" disabled={busy} onClick={run}>{busy ? 'Synchronizing…' : 'Sync now'}</button> <button className="danger" type="button" disabled={busy} onClick={disconnect}>Disconnect</button></div>}{status && <p className={status.startsWith('Complete') ? 'validationOk' : 'validationError'}>{status}</p>}<p className="muted">Use HTTPS outside localhost. The server setup is documented in <code>sync_server/README.md</code>. Keep normal backups even when synchronization is enabled.</p></Card>;
}
