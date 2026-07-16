import { useState, type FormEvent, type ReactNode } from 'react';
import { db } from './db';
import { dateRangesOverlap, type AdvancedData } from './advanced';
import { landAreaLabel, landToAcres } from './land';
import { sharedSplitDefault, sharedSplitKey } from './allocation-defaults';
import { localDate, stamp, type AppSetting } from './types';
import type { FarmData } from './calculations';

type LandData = FarmData & AdvancedData & { settings: AppSetting[] };
type Action = (fn: () => Promise<unknown>, message?: string) => Promise<boolean>;
const Card = ({ children }: { children: ReactNode }) => <section className="card">{children}</section>;
const today = () => localDate();
const date = (value: string) => value.split('-').reverse().join('-');

export function LandManager({ data, act }: { data: LandData; act: Action }) {
  const [mode, setMode] = useState<'plots' | 'rotation' | 'allocation'>('plots');

  const plotSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget, f = new FormData(form), name = String(f.get('name')).trim();
    const areaAcres = landToAcres(Number(f.get('acres')), Number(f.get('guntas')), Number(f.get('cents')));
    act(async () => {
      if(areaAcres <= 0) throw Error('Land area must be greater than zero.');
      if(data.landPlots.some(x => x.name.trim().toLowerCase() === name.toLowerCase())) throw Error('A plot with this name already exists.');
      await db.landPlots.add(stamp({ name, areaAcres, notes: String(f.get('notes') || ''), active: true }));
    }, 'Land plot created').then(saved => { if(saved) form.reset() });
  };

  const rotationSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget, f = new FormData(form), plotId = String(f.get('plotId'));
    const startDate = String(f.get('start')), endDate = String(f.get('end') || '') || undefined;
    act(async () => {
      if(!data.landPlots.some(x => x.id === plotId && x.active)) throw Error('Select an active plot.');
      if(!data.enterprises.some(x => x.id === String(f.get('enterpriseId')) && x.active)) throw Error('Select an active enterprise.');
      if(endDate && endDate < startDate) throw Error('Rotation end date cannot be before its start date.');
      if(data.plotCycles.some(x => x.plotId === plotId && dateRangesOverlap(startDate, endDate, x.startDate, x.endDate))) throw Error('This plot already has an overlapping rotation record.');
      await db.plotCycles.add(stamp({ plotId, seasonYear: String(f.get('season')).trim(), cropOrUse: String(f.get('use')).trim(), enterpriseId: String(f.get('enterpriseId')), startDate, endDate }));
    }, 'Land rotation saved').then(saved => { if(saved) form.reset() });
  };

  const allocationSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const f = new FormData(event.currentTarget), enterprises = data.enterprises.filter(x => x.active);
    const values = enterprises.map(x => ({ key: sharedSplitKey(x.id), value: String(Number(f.get(`split-${x.id}`) || 0)) }));
    if(Math.abs(values.reduce((sum, x) => sum + Number(x.value), 0) - 100) > .01) {
      act(async () => { throw Error('The default shared-cost split must total exactly 100%.'); });
      return;
    }
    act(() => db.settings.bulkPut(values), 'Shared allocation defaults saved');
  };

  return <div className="twoCol"><Card><div className="toggle">
    <button className={mode === 'plots' ? 'active' : ''} onClick={() => setMode('plots')}>Plot</button>
    <button className={mode === 'rotation' ? 'active' : ''} onClick={() => setMode('rotation')}>Rotation</button>
    <button className={mode === 'allocation' ? 'active' : ''} onClick={() => setMode('allocation')}>Shared defaults</button>
  </div>
  {mode === 'plots' && <form onSubmit={plotSubmit}>
    <label>Plot name<input name="name" placeholder="e.g. East field" required /></label>
    <fieldset><legend>Land area</legend><div className="formRow">
      <label>Acres<input name="acres" type="number" min="0" step=".001" defaultValue="0" /></label>
      <label>Guntas<input name="guntas" type="number" min="0" step=".01" defaultValue="0" /></label>
      <label>Cents<input name="cents" type="number" min="0" step=".01" defaultValue="0" /></label>
    </div><p className="note">1 acre = 40 guntas = 100 cents. Values are stored canonically in acres.</p></fieldset>
    <label>Notes<textarea name="notes" placeholder="e.g. Borewell access" /></label>
    <button className="primary" type="submit">Create plot</button>
  </form>}
  {mode === 'rotation' && <form onSubmit={rotationSubmit}>
    <label>Plot<select name="plotId" required><option value="">Select plot</option>{data.landPlots.filter(x => x.active).map(x => <option value={x.id} key={x.id}>{x.name}</option>)}</select></label>
    <label>Season/year<input name="season" placeholder="e.g. Kharif 2026" required /></label>
    <label>Crop or use<input name="use" placeholder="e.g. Maize" required /></label>
    <label>Enterprise<select name="enterpriseId" required><option value="">Select enterprise</option>{data.enterprises.filter(x => x.active).map(x => <option value={x.id} key={x.id}>{x.name}</option>)}</select></label>
    <div className="formRow"><label>Start<input name="start" type="date" defaultValue={today()} required /></label><label>End<input name="end" type="date" /></label></div>
    <button className="primary" type="submit">Save rotation</button>
  </form>}
  {mode === 'allocation' && <form onSubmit={allocationSubmit}>
    <h2>Shared-cost split defaults</h2>
    <p className="note">These percentages prefill manual allocations for expenses, labour, purchased or home-grown feed, and feed-crop harvests. You can still change a split on an individual record.</p>
    <fieldset><legend>Default enterprise split (must total 100%)</legend>{data.enterprises.filter(x => x.active).map(x => <label key={x.id}>{x.name} %<input name={`split-${x.id}`} type="number" min="0" max="100" step=".01" defaultValue={sharedSplitDefault(data.settings, x)} /></label>)}</fieldset>
    <button className="primary" type="submit">Save shared defaults</button>
  </form>}</Card>
  <Card><h2>Farm land</h2>{data.landPlots.length ? data.landPlots.map(plot => <div key={plot.id}>
    <div className="record"><span><b>{plot.name}</b><small>{plot.notes}</small></span><b>{landAreaLabel(plot.areaAcres)}</b></div>
    {data.plotCycles.filter(x => x.plotId === plot.id).map(x => <div className="record" key={x.id}><span><b>↳ {x.cropOrUse}</b><small>{x.seasonYear} · {date(x.startDate)}{x.endDate ? ` – ${date(x.endDate)}` : ''}</small></span></div>)}
  </div>) : <div className="empty">Create a plot to begin land and rotation tracking.</div>}</Card></div>;
}
