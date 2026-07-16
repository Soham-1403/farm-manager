import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { firebaseSignIn, firebaseSignOut, subscribeFirebaseSyncState, synchronizeFirebase, type FirebaseSyncState } from './firebase-sync';
import type { AppSetting } from './types';

type Action = (fn: () => Promise<unknown>, message?: string) => Promise<boolean>;
const Card = ({ children }: { children: ReactNode }) => <section className="card">{children}</section>;
const get = (settings: AppSetting[], key: string) => settings.find(item => item.key === key)?.value || '';
const initialState: FirebaseSyncState = { user: null, phase: 'connecting', message: 'Checking Firebase connection…', lastSyncAt: '' };

export function SyncPanel({ settings, act }: { settings: AppSetting[]; act: Action }) {
  const [syncState, setSyncState] = useState(initialState);
  const [busy, setBusy] = useState(false);
  useEffect(() => subscribeFirebaseSyncState(setSyncState), []);
  const lastAt = syncState.lastSyncAt || get(settings, 'firebaseLastSyncAt');

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget), email = String(form.get('email') || '').trim(), password = String(form.get('password') || '');
    setBusy(true);
    await act(async () => { await firebaseSignIn(email, password); }, 'Signed in; automatic synchronization started');
    setBusy(false);
  };

  const syncNow = async () => {
    setBusy(true);
    await act(async () => { await synchronizeFirebase(); }, 'Synchronization complete');
    setBusy(false);
  };

  return <Card><h2>Automatic device synchronization</h2><p className="note">Firebase securely synchronizes farm records between installations signed into the same account. Local records remain available offline and synchronize after saves, when connectivity returns, every five minutes while open, and when the app starts.</p>{!syncState.user ? <form onSubmit={signIn}><label>Email<input name="email" type="email" autoComplete="username" placeholder="Your Firebase user email" required /></label><label>Password<input name="password" type="password" autoComplete="current-password" required /></label><button className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in and synchronize'}</button></form> : <div className="durability"><b>Connected as {syncState.user.email}</b><p className={syncState.phase === 'error' ? 'validationError' : ''}>{syncState.message}</p><p className="muted">{lastAt ? `Last completed ${new Date(lastAt).toLocaleString()}` : 'Initial synchronization will begin automatically.'}</p><button className="primary" type="button" disabled={busy} onClick={syncNow}>{busy ? 'Synchronizing…' : 'Sync now'}</button> <button type="button" disabled={busy} onClick={() => act(firebaseSignOut, 'Signed out of synchronization')}>Sign out</button></div>}<p className="muted">Your password is handled by Firebase Authentication and is never stored in the farm database. Continue making normal backup files; synchronization is not a backup replacement.</p></Card>;
}
