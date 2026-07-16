import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { TABLE_NAMES } from './db';
import { batchCurrentCount, batchMetrics, cropAvailable, cropMetrics, enterprisePnl, feedStock, herdCurrentCount, undispositionedEggs } from './calculations';
import { buildAlerts } from './core';
import { buildExcelWorkbook, inspectExcelImport } from './io';
import { buildMLRows, mlCsv, unifiedLedger } from './reporting';
import { commoditySignals, weatherWarnings, wholeFarmInsights } from './intelligence';
import { createSampleFarm, sampleBackupPayload, sampleTables, SAMPLE_SCENARIOS } from './sample-farms';

const asOf='2026-07-16',period={from:'2026-01-01',to:'2026-12-31'};

describe('complete sample farms',()=>{
  for(const scenario of SAMPLE_SCENARIOS)it(`${scenario.name} connects every application domain`,()=>{
    const data=createSampleFarm(scenario.key,asOf),tables=sampleTables(data),layer=data.batches.find(x=>x.name==='Layer A')!,goat=data.herds.find(x=>x.species==='goat')!;
    const tomato=data.cropCycles.find(x=>x.crop==='Tomato')!,layerFeed=data.feedTypes.find(x=>x.name==='Layer Mash')!;
    expect(TABLE_NAMES.every(name=>Array.isArray(tables[name])&&tables[name].length>0)).toBe(true);
    expect(batchCurrentCount(layer,data,asOf)).toBe(105-scenario.mortalityLoss);
    expect(herdCurrentCount(goat,data,asOf)).toBe(21);
    expect(undispositionedEggs(data.eggProduction[0],data)).toBe(0);
    expect(batchMetrics(layer,data).henDayPercent).toBeGreaterThan(0);
    expect(batchMetrics(layer,data).henDayPercent).toBeLessThanOrEqual(100);
    expect(cropAvailable(tomato.id,'kg',data,asOf)).toBe(400);
    expect(feedStock(layerFeed.id,data,asOf)).toBe(scenario.key==='stress-test'?20:700);
    const pnls=data.enterprises.map(x=>enterprisePnl(x.id,data,period));
    expect(pnls.every(x=>Number.isFinite(x.revenue)&&Number.isFinite(x.operatingCosts)&&Number.isFinite(x.net))).toBe(true);
    expect(pnls.reduce((v,x)=>v+x.revenue,0)).toBeGreaterThan(0);
    const ledger=unifiedLedger(data,period),directions=new Set(ledger.map(x=>x.direction));
    expect(directions).toEqual(new Set(['in','out']));
    expect(ledger.map(x=>x.source)).toEqual(expect.arrayContaining(['Expense','Labour','Poultry acquisition','Egg sale','Bird sale','Feed purchase','Herd acquisition','Herd milk sale','Crop input','Crop sale']));
    const alerts=buildAlerts(data as never,asOf).map(x=>x.title);
    expect(alerts).toEqual(expect.arrayContaining(['Poultry health due','Herd health due','Kidding/lambing follow-up','Wage unpaid','Harvest window']));
    const ml=buildMLRows(data),domains=new Set(ml.map(x=>x.entity_type));
    expect(domains).toEqual(new Set(['finance','labour','poultry','feed','animal','herd','land','crop','weather','market']));
    expect(mlCsv(data).split('\r\n').length).toBe(ml.length+1);
    const payload=sampleBackupPayload(data),roundTrip=JSON.parse(JSON.stringify(payload));
    expect(roundTrip.format).toBe('mixed-farm-manager-backup');expect(roundTrip.version).toBe(11);
    expect(TABLE_NAMES.every(name=>Array.isArray(roundTrip.tables[name]))).toBe(true);
  });

  it('balanced farm matches its fixed calculation answer sheet',()=>{
    const data=createSampleFarm('balanced',asOf),currentPeriod={from:'2026-01-01',to:asOf},pnls=data.enterprises.map(enterprise=>({name:enterprise.name,...enterprisePnl(enterprise.id,data,currentPeriod)}));
    const total=pnls.reduce((sum,pnl)=>({revenue:sum.revenue+pnl.revenue,operating:sum.operating+pnl.operatingCosts,capital:sum.capital+pnl.capital,net:sum.net+pnl.net}),{revenue:0,operating:0,capital:0,net:0});
    expect(total).toEqual({revenue:53855,operating:185880,capital:12900,net:-144925});
    const depreciated=data.enterprises.map(enterprise=>enterprisePnl(enterprise.id,data,currentPeriod,true));expect(depreciated.reduce((sum,pnl)=>sum+pnl.selectedCapitalCost,0)).toBe(1900);expect(depreciated.reduce((sum,pnl)=>sum+pnl.net,0)).toBeCloseTo(-133925,2);
    expect(pnls.map(x=>[x.name,Math.round(x.net*100)/100])).toEqual([['Poultry',-53422.09],['Goats & Sheep',-92808.79],['Tomato',2334.45],['Maize Fodder',-1028.57]]);
    const layer=data.batches.find(x=>x.name==='Layer A')!,goat=data.herds.find(x=>x.species==='goat')!,layerFeed=data.feedTypes.find(x=>x.name==='Layer Mash')!,tomato=data.cropCycles.find(x=>x.crop==='Tomato')!;
    const layerMetrics=batchMetrics(layer,data),tomatoMetrics=cropMetrics(tomato,data);
    expect(batchCurrentCount(layer,data,asOf)).toBe(104);expect(layerMetrics.mortalityRate).toBeCloseTo(.90909,4);expect(layerMetrics.cumulativeCost).toBeCloseTo(18503.51,2);expect(layerMetrics.henDayPercent).toBe(93.75);
    expect(herdCurrentCount(goat,data,asOf)).toBe(21);expect(feedStock(layerFeed.id,data,asOf)).toBe(700);expect(cropAvailable(tomato.id,'kg',data,asOf)).toBe(400);expect(tomatoMetrics).toMatchObject({cost:14050,revenue:18250,net:4200,yieldPerAcre:500,costPerUnit:14.05});
    expect(buildAlerts(data as never,asOf).map(x=>x.title)).toEqual(['Poultry health due','Herd health due','Kidding/lambing follow-up','Herd mortality spike','Wage unpaid','Harvest window','Feed out of stock','Feed out of stock','Feed out of stock']);
    expect(commoditySignals(data).map(x=>({commodity:x.commodity,currentMarket:x.currentMarket,actualAverage:x.actualAverage}))).toEqual([{commodity:'Tomato',currentMarket:27,actualAverage:28},{commodity:'Maize Fodder',currentMarket:4,actualAverage:0}]);
    expect(weatherWarnings(data,asOf)).toEqual(['No threshold-based weather warnings for the next 7 days.']);expect(wholeFarmInsights(data,currentPeriod.from,currentPeriod.to).top?.enterprise.name).toBe('Tomato');
  });

  it('stress scenario activates mortality and feed-pressure alerts',()=>{
    const alerts=buildAlerts(createSampleFarm('stress-test',asOf) as never,asOf).map(x=>x.title);
    expect(alerts).toEqual(expect.arrayContaining(['Poultry mortality spike','Feed reorder due']));
  });

  it('covers all selectable operational options in every sample',()=>{
    const expected=(values:string[])=>new Set(values),actual=(rows:unknown[],field:string)=>new Set((rows as Record<string,string>[]).map(x=>x[field]));
    for(const scenario of SAMPLE_SCENARIOS){const d=createSampleFarm(scenario.key,asOf);
      expect(actual(d.expenses,'category')).toEqual(expected(['feed','utilities','infrastructure','equipment','transport','misc']));
      expect(actual(d.expenses.filter(x=>x.allocationDriver),'allocationDriver')).toEqual(expected(['manual','animal-days','area','labour-quantity','harvest-share']));
      expect(actual(d.workers,'wageType')).toEqual(expected(['daily','monthly','piece']));
      expect(actual(d.batches,'purpose')).toEqual(expected(['layer','meat','dual']));expect(actual(d.batches,'source')).toEqual(expected(['purchased','hatched']));expect(actual(d.batches,'stage')).toEqual(expected(['chick','grower','adult']));
      expect(actual(d.mortalities,'cause')).toEqual(expected(['disease','predator','heat','injury','unknown']));expect(actual(d.eggDispositions,'type')).toEqual(expected(['sold','home-use','set-for-hatching','broken-spoiled']));
      expect(actual(d.birdSales,'saleType')).toEqual(expected(['live','dressed']));expect(actual(d.birdSales,'pricingBasis')).toEqual(expected(['kg','bird']));
      expect(actual(d.feedTypes,'category')).toEqual(expected(['energy','protein','greens','mineral','complete']));expect(actual(d.feedTypes,'source')).toEqual(expected(['purchased','home-grown']));expect(actual(d.feedTypes,'unit')).toEqual(expected(['kg','litre']));
      expect(actual(d.feedUnits,'sourceType')).toEqual(expected(['azolla-pit','bsf-bin','mulberry-strip','maize-plot','other']));expect(actual(d.feedInputs,'inputType')).toEqual(expected(['seed-spawn','setup-material','labour','water-electricity','fertiliser','other']));
      expect(actual(d.herds,'species')).toEqual(expected(['goat','sheep']));expect(actual(d.herds,'purpose')).toEqual(expected(['meat','milk','breeding']));expect(actual(d.animals,'sex')).toEqual(expected(['female','male']));expect(actual(d.animals,'status')).toEqual(expected(['active','sold','died']));
      expect(actual(d.herdAdditions,'eventType')).toEqual(expected(['purchase','birth']));expect(actual(d.herdMortalities,'cause')).toEqual(expected(['disease','predator','heat','injury','unknown']));expect(actual(d.weightLogs,'weightBasis')).toEqual(expected(['total','average']));
      expect(actual(d.herdSales,'saleType')).toEqual(expected(['live','meat','milk']));expect(actual(d.herdSales,'unit')).toEqual(expected(['kg','litre','head']));
      expect(actual(d.cropCycles,'type')).toEqual(expected(['commercial','feed']));expect(actual(d.cropCycles,'status')).toEqual(expected(['planned','active','harvesting','complete']));expect(actual(d.cropInputs,'inputType')).toEqual(expected(['land-prep','seed-sapling','fertiliser','pesticide','irrigation','labour','other']));expect(actual(d.cropHarvests,'unit')).toEqual(expected(['kg','bunch','piece']));
      expect(actual(d.weatherLogs,'source')).toEqual(expected(['manual','open-meteo']));expect(actual(d.marketPrices,'source')).toEqual(expected(['manual','data.gov.in']));
    }
  });

  it('each sample exports a complete multi-sheet Excel workbook that reads back',async()=>{
    for(const scenario of SAMPLE_SCENARIOS){
      const data=createSampleFarm(scenario.key,asOf),workbook=await buildExcelWorkbook(data,data.workers,period,false);
      expect(workbook.SheetNames).toEqual(expect.arrayContaining(['Summary','Unified Ledger','Enterprise P&L','Batches','Feed Consumption','Animals','Crop Sales','Weather','Market Prices']));
      const bytes=XLSX.write(workbook,{type:'array',bookType:'xlsx'}),readBack=XLSX.read(bytes,{type:'array'});
      expect(readBack.SheetNames).toEqual(workbook.SheetNames);
      const summary=XLSX.utils.sheet_to_json<Record<string,unknown>>(readBack.Sheets.Summary);
      expect(summary).toHaveLength(1);expect(summary[0].ReportFrom).toBe(period.from);expect(summary[0].ReportTo).toBe(period.to);
      expect(XLSX.utils.sheet_to_json(readBack.Sheets.Batches).length).toBe(data.batches.length);
      expect(XLSX.utils.sheet_to_json(readBack.Sheets['Market Prices']).length).toBe(data.marketPrices.length);
      const empty=Object.fromEntries(TABLE_NAMES.map(name=>[name,[]])),file={arrayBuffer:async()=>bytes} as File;
      const preview=await inspectExcelImport(file,empty);
      expect(preview.errors,`${scenario.name}: ${preview.errors.join(' | ')}`).toEqual([]);
      expect(preview.counts.Batches).toBe(data.batches.length);
    }
  });
});
