import { useState } from 'react';
import { exportExcel } from './io';
import { createSampleFarm, downloadSampleBackup, loadSampleFarm, SAMPLE_SCENARIOS, type SampleKey } from './sample-farms';

type Action=(fn:()=>Promise<unknown>,message?:string)=>Promise<boolean>;

export function SampleFarmPanel({act}:{act:Action}) {
  const [key,setKey]=useState<SampleKey>('balanced'),[confirming,setConfirming]=useState(false),scenario=SAMPLE_SCENARIOS.find(x=>x.key===key)!;
  const sample=()=>createSampleFarm(key),period={from:'2026-01-01',to:'2026-12-31'};
  const load=async()=>{
    setConfirming(false);
    await act(()=>loadSampleFarm(key),`${scenario.name} loaded`);
  };
  return <section className="card sampleFarmPanel"><div className="sectionHead"><div><small>COMPLETE TEST DATA</small><h2>Sample farms</h2></div><span className="pill">5 scenarios</span></div>
    <p className="note">Each scenario fills the entire application with connected poultry, livestock, feed, land, crops, labour, finance, weather and market records. They are designed for checking calculations, alerts, reports and file workflows.</p>
    <label>Scenario<select value={key} onChange={e=>setKey(e.target.value as SampleKey)}>{SAMPLE_SCENARIOS.map(x=><option value={x.key} key={x.key}>{x.name}</option>)}</select></label>
    <div className="sampleSummary"><b>{scenario.name}</b><p>{scenario.description}</p><small>Includes sales and expenses · shared allocations · health reminders · feed stock · crop inventory · reporting history</small></div>
    <div className="sampleActions"><button onClick={()=>act(async()=>downloadSampleBackup(key),'Sample backup downloaded')}>Download backup</button><button onClick={()=>{const data=sample();act(()=>exportExcel(data,data.workers,period,false),'Sample Excel workbook downloaded')}}>Download Excel</button><button className="danger" onClick={()=>setConfirming(true)}>Load selected sample</button></div>
    {confirming&&<div className="sampleConfirm" role="dialog" aria-modal="true" aria-labelledby="sample-confirm-title"><div className="sampleConfirmBody"><h3 id="sample-confirm-title">Load {scenario.name}?</h3><p>This replaces all farm records currently stored in this browser. Download a backup first if you need them.</p><div className="sampleConfirmActions"><button onClick={()=>setConfirming(false)}>Cancel</button><button className="danger" onClick={load}>Replace and load</button></div></div></div>}
    <p className="note">Downloading does not change your records. Loading replaces this browser’s current farm data and therefore always asks for confirmation.</p>
  </section>;
}
