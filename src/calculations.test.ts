import { describe, expect, it } from 'vitest';
import { allocatedAmount, allocationDriverValues, batchBirdDays, batchCountsRemainValidWithoutAddition, batchCurrentCount, batchMetrics, batchShareOnDate, cropAreaForEnterprise, cropAvailable, cropMetrics, depreciationMonths, enterprisePnl, expenseShare, feedCostPerUnit, feedIssueCostPerUnit, feedStock, feedUnitCost, hatchingCostBasis, herdCurrentCount, herdMetrics, undispositionedEggs } from './calculations';
import { dateRangesOverlap, leastCostPearson } from './advanced';
import { feedCostDrift, feedInventoryLots, optimizeFeedRation, stageDailyFeedNeed, validateFeedIssueTargets, validateFeedTypeValues } from './feed-system';
import { validateHerdSale } from './livestock-tools';
import { AGMARKNET_RESOURCE_ID, commoditySignals, cropForecasts, marketPriceFromApiRecord, normalizeApiDate, normalizedMarketPrice, shouldReplaceWeather, weatherWarnings } from './intelligence';
import { buildMLRows, mlCsv, seasonForDate, unifiedLedger } from './reporting';
import { landAreaLabel, landToAcres } from './land';
import { buildAlerts } from './core';
import { cropCycleIdentity } from './crop-tools';
import { localDate, roundMoney } from './types';
import { normalizeLegacyFeedLinks } from './migrations';

describe('phase one calculations', () => {
  it('uses and validates the official Agmarknet daily-price resource shape',()=>{
    expect(AGMARKNET_RESOURCE_ID).toBe('9ef84268-d588-465a-a308-a864a43d0070');
    expect(normalizeApiDate('16/07/2026')).toBe('2026-07-16');
    expect(marketPriceFromApiRecord({arrival_date:'16/07/2026',commodity:'Maize',market:'Ramanagara',min_price:'2,100',max_price:'2,500',modal_price:'2,350',arrival_quantity:'24'},'Maize')).toMatchObject({date:'2026-07-16',commodity:'Maize',market:'Ramanagara',minPrice:2100,maxPrice:2500,modalPrice:2350,arrivalQuantity:24,unit:'quintal',source:'data.gov.in'});
    expect(marketPriceFromApiRecord({min_price:'2500',max_price:'2000',modal_price:'0'},'Maize')).toBeNull();
  });
  it('stores computed transaction totals at canonical two-decimal precision',()=>expect(roundMoney(1.005)).toBe(1.01));
  it('repairs legacy feed production units without losing their harvest unit',()=>{
    const tables={feedUnits:[{id:'u',name:'Azolla',updatedAt:'old'}],feedTypes:[],feedHarvests:[{unitId:'u',unit:'litre'}]} as Record<string,unknown[]>;
    normalizeLegacyFeedLinks(tables,'2026-07-15T00:00:00Z');const unit=tables.feedUnits[0] as Record<string,unknown>,type=tables.feedTypes[0] as Record<string,unknown>;
    expect(unit.feedTypeId).toBe(type.id);expect(unit.updatedAt).toBe('2026-07-15T00:00:00Z');expect(type).toMatchObject({name:'Azolla',source:'home-grown',unit:'litre',active:true});
  });
  it('formats operational dates from local calendar fields',()=>expect(localDate(new Date(2026,6,15,0,30))).toBe('2026-07-15'));
  it('splits labour by enterprise percentage', () => expect(allocatedAmount({ amount: 1500, allocations: [{ enterpriseId: 'p', percent: 60 }] } as never, 'p')).toBe(900));
  it('matches the worked recovery example', () => {
    const batch = { id:'a', initialCount:50, acquisitionCost:3000, enterpriseId:'p' } as never;
    const data = { additions:[], mortalities:[{batchId:'a',countLost:3}], birdSales:[], healthRecords:[{batchId:'a',cost:500}], expenses:[{batchId:'a',amount:8500,isCapital:false}], labourLogs:[], eggSales:[{batchId:'a',total:16000}], eggProduction:[], eggDispositions:[] } as never;
    const value = batchMetrics(batch, data);
    expect(value.currentCount).toBe(47); expect(value.mortalityRate).toBe(6); expect(value.cumulativeCost).toBe(12000); expect(value.recoveryPercent).toBeCloseTo(133.33, 1);
  });
  it('derives home-grown feed unit cost and herd count', () => {
    const data = { feedInputs:[{unitId:'u',amount:600,isCapital:false},{unitId:'u',amount:400,isCapital:true}],feedHarvests:[{unitId:'u',quantity:120}],herdAdditions:[{herdId:'h',count:4}],herdMortalities:[{herdId:'h',countLost:2}],herdSales:[{herdId:'h',count:3,saleType:'live'}] } as never;
    expect(feedUnitCost('u',data)).toBe(5);
    expect(herdCurrentCount({id:'h',initialCount:20} as never,data)).toBe(19);
    expect(herdCurrentCount({id:'h',initialCount:20,closedDate:'2026-01-15'} as never,data,'2026-01-10')).toBe(19);
    expect(herdCurrentCount({id:'h',initialCount:20,closedDate:'2026-01-15'} as never,data,'2026-01-16')).toBe(0);
  });
  it('flows a linked plot-rotation expense into feed cost without double-counting P&L',()=>{
    const base={otherIncome:[],labourLogs:[],batches:[],additions:[],mortalities:[],healthRecords:[],eggProduction:[],eggDispositions:[],eggSales:[],birdSales:[],feedPurchases:[],feedInputs:[],herds:[],herdAdditions:[],herdHealth:[],herdSales:[],cropInputs:[],cropSales:[],cropCycles:[],landPlots:[]},data={...base,enterprises:[{id:'fodder'},{id:'p'}],expenses:[{id:'e',date:'2026-07-01',amount:200,isCapital:false,enterpriseId:'fodder',plotCycleId:'rotation'}],feedUnits:[{id:'u',plotCycleId:'rotation'}],feedHarvests:[{unitId:'u',date:'2026-07-10',quantity:20,allocations:[{enterpriseId:'p',percent:100}]}]} as never,period={from:'2026-01-01',to:'2026-12-31'};
    expect(feedUnitCost('u',data)).toBe(10);expect(enterprisePnl('fodder',data,period).recurring).toBe(0);expect(enterprisePnl('p',data,period).homeFeed).toBe(200);
  });
  it('rejects impossible feed nutrient and inclusion values',()=>{
    expect(()=>validateFeedTypeValues({cpPercent:-1})).toThrow('negative');expect(()=>validateFeedTypeValues({calciumPercent:101})).toThrow('100%');expect(()=>validateFeedTypeValues({maxInclusionPercent:101})).toThrow('100%');expect(()=>validateFeedTypeValues({minInclusionPercent:60,maxInclusionPercent:40})).toThrow('Minimum');
  });
  it('allocates unissued feed purchases across poultry groups and supports direct herd fallback',()=>{
    const common={additions:[],mortalities:[],birdSales:[],healthRecords:[],expenses:[],labourLogs:[],eggSales:[],eggProduction:[],eggDispositions:[],feedConsumption:[],herdAdditions:[],herdMortalities:[],herdSales:[],herdHealth:[],breedingEvents:[],weightLogs:[]},batches=[{id:'a',enterpriseId:'p',acquisitionDate:'2026-01-01',initialCount:10,acquisitionCost:0},{id:'b',enterpriseId:'p',acquisitionDate:'2026-01-01',initialCount:30,acquisitionCost:0}],herd={id:'h',enterpriseId:'g',acquisitionDate:'2026-01-01',initialCount:5,acquisitionCost:0},data={...common,batches,herds:[herd],feedPurchases:[{date:'2026-02-01',totalCost:400,allocations:[{enterpriseId:'p',percent:100}]},{date:'2026-02-01',herdId:'h',totalCost:250,allocations:[{enterpriseId:'g',percent:100}]}]} as never;
    expect(batchMetrics(batches[0] as never,data).feedCost).toBe(100);expect(batchMetrics(batches[1] as never,data).feedCost).toBe(300);expect(herdMetrics(herd as never,data).feedCost).toBe(250);
  });
  it('recomputes shared area costs for the selected report period', () => {
    const common = { otherIncome:[],labourLogs:[],batches:[],additions:[],mortalities:[],healthRecords:[],eggProduction:[],eggDispositions:[],eggSales:[],birdSales:[],feedPurchases:[],feedInputs:[],feedHarvests:[],herds:[],herdAdditions:[],herdMortalities:[],herdHealth:[],herdSales:[],cropInputs:[],cropSales:[],landPlots:[] };
    const data = { ...common,enterprises:[{id:'a'},{id:'b'}],expenses:[{date:'2026-06-01',amount:300,isCapital:false,allocationDriver:'area'}],cropCycles:[{enterpriseId:'a',sowingDate:'2026-01-01',expectedHarvest:'2026-12-01',areaAcres:2},{enterpriseId:'b',sowingDate:'2026-01-01',expectedHarvest:'2026-12-01',areaAcres:1}] } as never;
    expect(enterprisePnl('a',data,{from:'2026-01-01',to:'2026-12-31'}).recurring).toBe(200);
    expect(enterprisePnl('b',data,{from:'2026-01-01',to:'2026-12-31'}).recurring).toBe(100);
  });
  it('selects the least-cost Pearson-square feed pair', () => {
    const feeds = [{name:'Cheap low',cpPercent:10,costPerUnit:10},{name:'Cheap high',cpPercent:20,costPerUnit:20},{name:'Costly high',cpPercent:25,costPerUnit:50}] as never;
    const blend = leastCostPearson(feeds,16);
    expect(blend?.aName).toBe('Cheap low'); expect(blend?.bName).toBe('Cheap high'); expect(blend?.cost).toBe(16);
  });
  it('costs poultry feed consumption and calculates FCR from growth', () => {
    const batch={id:'p',initialCount:10,acquisitionCost:100,enterpriseId:'e',acquisitionDate:'2026-07-01'} as never;
    const data={additions:[],mortalities:[],birdSales:[],healthRecords:[],expenses:[],labourLogs:[],eggSales:[],eggProduction:[],eggDispositions:[],feedTypes:[{id:'f',source:'purchased',unit:'kg'}],feedPurchases:[{feedTypeId:'f',quantity:100,totalCost:2000,allocations:[]}],feedConsumption:[{batchId:'p',feedTypeId:'f',quantity:20,date:'2026-07-05'}],poultryWeights:[{batchId:'p',date:'2026-07-01',totalWeightKg:5},{batchId:'p',date:'2026-07-10',totalWeightKg:15}]} as never;
    expect(feedCostPerUnit('f',data)).toBe(20);
    const metrics=batchMetrics(batch,data);expect(metrics.feedCost).toBe(400);expect(metrics.fcr).toBe(2);expect(metrics.cumulativeCost).toBe(500);
  });
  it('does not double-subtract dispositions when daily egg rows are duplicated', () => {
    const first={id:'one',date:'2026-07-01',batchId:'p',eggsCollected:10} as never,second={id:'two',date:'2026-07-01',batchId:'p',eggsCollected:5} as never;
    const data={eggProduction:[first,second],eggDispositions:[{date:'2026-07-01',batchId:'p',quantity:8}]} as never;
    expect(undispositionedEggs(first,data)).toBe(7);expect(undispositionedEggs(second,data)).toBe(0);
  });
  it('transfers egg cost to a hatched batch without treating it as a purchased P&L acquisition', () => {
    const parent={id:'p',initialCount:10,acquisitionCost:100,enterpriseId:'e',acquisitionDate:'2026-01-01',source:'purchased'} as never;
    const data={enterprises:[{id:'e'}],batches:[parent,{id:'h',source:'hatched',enterpriseId:'e',acquisitionDate:'2026-07-01',acquisitionCost:50}],additions:[],mortalities:[],birdSales:[],healthRecords:[],expenses:[],labourLogs:[],eggSales:[],eggProduction:[{batchId:'p',eggsCollected:10}],eggDispositions:[],otherIncome:[],feedPurchases:[],feedInputs:[],feedHarvests:[],herds:[],herdHealth:[],herdSales:[],cropInputs:[],cropSales:[]} as never;
    expect(hatchingCostBasis('p',5,data)).toBe(50);
    expect(enterprisePnl('e',data,{from:'2026-01-01',to:'2026-12-31'}).acquisitions).toBe(100);
  });
  it('uses laying-hen history and ongoing costs in poultry recovery metrics', () => {
    const batch={id:'p',initialCount:10,acquisitionCost:1000,enterpriseId:'e',acquisitionDate:'2026-07-01'} as never;
    const data={batches:[batch],additions:[],mortalities:[],birdSales:[],healthRecords:[{batchId:'p',date:'2026-07-10',cost:600}],expenses:[],labourLogs:[],eggSales:[{batchId:'p',date:'2026-07-10',total:1500}],eggProduction:[{batchId:'p',date:'2026-07-10',eggsCollected:10}],eggDispositions:[],layingCountLogs:[{batchId:'p',date:'2026-07-01',layingHenCount:5}]} as never;
    const value=batchMetrics(batch,data);expect(value.henDayPercent).toBe(200);expect(value.dailyOngoingCost).toBe(20);expect(value.dailyNetRecovery).toBe(30);expect(value.projectedRecoveryDate).toBeTruthy();
  });
  it('allocates batch recovery costs using the flock present on each transaction date',()=>{
    const first={id:'a',enterpriseId:'p',acquisitionDate:'2026-01-01',initialCount:10,acquisitionCost:0},later={id:'b',enterpriseId:'p',acquisitionDate:'2026-07-01',initialCount:10,acquisitionCost:0},base={batches:[first,later],additions:[],mortalities:[],birdSales:[],healthRecords:[],labourLogs:[],eggSales:[],eggProduction:[],eggDispositions:[]},data={...base,expenses:[{date:'2026-02-01',amount:100,isCapital:false,enterpriseId:'p'},{date:'2026-08-01',amount:100,isCapital:false,enterpriseId:'p'}]} as never;
    expect(batchShareOnDate(first as never,data,'2026-02-01')).toBe(1);expect(batchShareOnDate(later as never,data,'2026-02-01')).toBe(0);expect(batchShareOnDate(first as never,data,'2026-08-01')).toBe(.5);
    const firstCost=batchMetrics(first as never,data).sharedCost,laterCost=batchMetrics(later as never,data).sharedCost;expect(firstCost).toBe(150);expect(laterCost).toBe(50);expect(firstCost+laterCost).toBe(200);
  });
  it('includes driver-allocated shared expenses in poultry batch recovery',()=>{
    const batch={id:'b',enterpriseId:'p',acquisitionDate:'2026-01-01',initialCount:10,acquisitionCost:0} as never,data={enterprises:[{id:'p',active:true}],batches:[batch],additions:[],mortalities:[],birdSales:[],healthRecords:[],labourLogs:[],eggSales:[],eggProduction:[],eggDispositions:[],expenses:[{date:'2026-02-01',amount:100,isCapital:false,allocationDriver:'animal-days'}],herds:[],cropCycles:[],landPlots:[],feedHarvests:[]} as never;
    expect(batchMetrics(batch,data).sharedCost).toBe(100);
  });
  it('computes feed stock from purchases, home harvests and consumption',()=>{
    const data={feedPurchases:[{feedTypeId:'f',quantity:20}],feedUnits:[{id:'u',feedTypeId:'f'}],feedHarvests:[{unitId:'u',quantity:10}],feedConsumption:[{feedTypeId:'f',quantity:7}]} as never;
    expect(feedStock('f',data)).toBe(23);
  });
  it('does not include future flock changes in the current feed forecast',()=>{
    const data={batches:[{id:'b',stage:'adult',acquisitionDate:'2026-01-01',initialCount:10},{id:'future',stage:'adult',acquisitionDate:'2026-08-01',initialCount:100}],additions:[{batchId:'b',date:'2026-08-01',count:20}],mortalities:[{batchId:'b',date:'2026-08-02',countLost:5}],birdSales:[],settings:[{key:'layerFeedGrams',value:'100'}]} as never;
    expect(stageDailyFeedNeed(data,'2026-07-15')).toBe(1);
    expect(stageDailyFeedNeed(data,'2026-08-03')).toBe(12.5);
  });
  it('detects overlapping open and closed land-use periods',()=>{
    expect(dateRangesOverlap('2026-01-01','2026-06-30','2026-06-01','2026-12-01')).toBe(true);
    expect(dateRangesOverlap('2026-01-01','2026-05-01','2026-06-01',undefined)).toBe(false);
    expect(dateRangesOverlap('2026-01-01',undefined,'2027-01-01','2027-02-01')).toBe(true);
  });
  it('allocates legacy consumption to purchased lots by earliest expiry',()=>{
    const data={feedPurchases:[{id:'late',feedTypeId:'f',date:'2026-07-01',expiryDate:'2026-12-01',quantity:10},{id:'early',feedTypeId:'f',date:'2026-07-01',expiryDate:'2026-08-01',quantity:10}],feedConsumption:[{feedTypeId:'f',date:'2026-07-10',quantity:12}]} as never;
    const lots=feedInventoryLots('f',data,'2026-07-14');
    expect(lots.map(x=>[x.purchase.id,x.remaining])).toEqual([['early',0],['late',8]]);
  });
  it('does not allocate an earlier automatic feed issue from a lot purchased later',()=>{
    const data={feedPurchases:[{id:'future',feedTypeId:'f',date:'2026-07-05',expiryDate:'2026-08-01',quantity:10},{id:'available',feedTypeId:'f',date:'2026-07-01',expiryDate:'2026-12-01',quantity:10}],feedConsumption:[{feedTypeId:'f',date:'2026-07-02',quantity:8}]} as never;
    const lots=feedInventoryLots('f',data,'2026-07-10');expect(lots.map(x=>[x.purchase.id,x.remaining])).toEqual([['future',10],['available',2]]);
  });
  it('rejects grouped feed targets acquired after the issue date',()=>{
    expect(()=>validateFeedIssueTargets('2026-07-01',[{acquisitionDate:'2026-07-02'}])).toThrow('acquired');expect(()=>validateFeedIssueTargets('2026-07-02',[{acquisitionDate:'2026-07-02'}])).not.toThrow();
  });
  it('uses the selected lot cost for a linked feed issue',()=>{
    const data={feedPurchases:[{id:'cheap',feedTypeId:'f',quantity:10,totalCost:100},{id:'costly',feedTypeId:'f',quantity:10,totalCost:300}]} as never;
    expect(feedIssueCostPerUnit({feedTypeId:'f',feedPurchaseId:'costly'} as never,data)).toBe(30);
  });
  it('finds a least-cost ration while enforcing all nutrient and inclusion bounds',()=>{
    const ingredients=[{id:'corn',name:'Corn',cpPercent:9,energyKcalKg:3300,calciumPercent:.1,costPerUnit:20,maxInclusionPercent:55},{id:'soy',name:'Soy',cpPercent:44,energyKcalKg:2400,calciumPercent:.3,costPerUnit:45,maxInclusionPercent:40},{id:'lime',name:'Limestone',cpPercent:0,energyKcalKg:0,calciumPercent:38,costPerUnit:8,maxInclusionPercent:10}];
    const result=optimizeFeedRation(ingredients,{proteinMin:18,energyMin:2400,calciumMin:3.5,calciumMax:4.5});
    expect(result).not.toBeNull();expect(result!.protein).toBeGreaterThanOrEqual(18);expect(result!.energy).toBeGreaterThanOrEqual(2400);expect(result!.calcium).toBeGreaterThanOrEqual(3.5);expect(result!.calcium).toBeLessThanOrEqual(4.5);expect(result!.percentages.corn).toBeLessThanOrEqual(55.0001);expect(result!.percentages.soy).toBeLessThanOrEqual(40.0001);
  });
  it('reports infeasible ration targets and rolling purchase-cost drift',()=>{
    expect(optimizeFeedRation([{id:'a',name:'A',cpPercent:10,energyKcalKg:2000,calciumPercent:1,costPerUnit:10}],{proteinMin:20,energyMin:3000,calciumMin:2,calciumMax:3})).toBeNull();
    const drift=feedCostDrift('f',{feedPurchases:[{feedTypeId:'f',date:'2026-05-20',quantity:10,totalCost:100},{feedTypeId:'f',date:'2026-07-01',quantity:10,totalCost:120}]} as never,'2026-07-14');expect(drift.percent).toBeCloseTo(20);
    expect(feedCostDrift('f',{feedPurchases:[{feedTypeId:'f',date:'2026-06-05',quantity:10,totalCost:100}]} as never,'2026-07-14')).toMatchObject({current:0,previous:10,percent:0});
  });
  it('excludes closed grower and adult batches from forecast feed demand',()=>{
    const data={batches:[{id:'grower',active:false,stage:'grower',acquisitionDate:'2026-01-01',initialCount:10},{id:'adult',active:false,stage:'adult',acquisitionDate:'2026-01-01',initialCount:10},{id:'open',active:true,stage:'adult',acquisitionDate:'2026-01-01',initialCount:10}],additions:[],mortalities:[],birdSales:[],settings:[{key:'growerFeedGrams',value:'70'},{key:'layerFeedGrams',value:'110'}]} as never;
    expect(stageDailyFeedNeed(data,'2026-07-15')).toBe(1.1);
  });
  it('calculates herd mortality, birth survival, lot-aware feed cost and FCR',()=>{
    const herd={id:'h',initialCount:10,acquisitionCost:1000} as never,data={expenses:[],labourLogs:[],herdAdditions:[{herdId:'h',date:'2026-06-01',count:2}],herdMortalities:[{herdId:'h',date:'2026-06-02',countLost:1}],herdSales:[],herdHealth:[{herdId:'h',date:'2026-06-03',cost:100}],breedingEvents:[{herdId:'h',date:'2026-06-01',numberBorn:3,numberSurvived:2}],feedTypes:[{id:'f',source:'purchased',unit:'kg'}],feedPurchases:[{id:'lot',feedTypeId:'f',date:'2026-06-01',quantity:100,totalCost:2000}],feedConsumption:[{herdId:'h',feedTypeId:'f',feedPurchaseId:'lot',date:'2026-07-05',quantity:20}],weightLogs:[{herdId:'h',date:'2026-07-01',weightKg:200,animalCount:10,weightBasis:'total'},{herdId:'h',date:'2026-07-10',weightKg:240,animalCount:11,weightBasis:'total'}]} as never;
    const value=herdMetrics(herd,data);expect(value.currentCount).toBe(11);expect(value.mortalityRate).toBeCloseTo(8.33,1);expect(value.birthSurvivalRate).toBeCloseTo(66.67,1);expect(value.feedCost).toBe(400);expect(value.weightGain).toBe(40);expect(value.fcr).toBe(.5);
  });
  it('includes allocated general expenses and labour in herd recovery cost',()=>{
    const herd={id:'h',enterpriseId:'livestock',acquisitionDate:'2026-01-01',initialCount:10,acquisitionCost:1000} as never,data={enterprises:[{id:'livestock',active:true,type:'livestock'}],herds:[herd],herdAdditions:[],herdMortalities:[],herdSales:[],herdHealth:[],breedingEvents:[],feedConsumption:[],feedPurchases:[],weightLogs:[],expenses:[{date:'2026-02-01',amount:200,isCapital:false,enterpriseId:'livestock'}],labourLogs:[{date:'2026-02-02',amount:100,allocations:[{enterpriseId:'livestock',percent:100}]}],batches:[],additions:[],mortalities:[],birdSales:[],cropCycles:[],landPlots:[],feedHarvests:[]} as never,value=herdMetrics(herd,data);
    expect(value.generalCost).toBe(200);expect(value.labourCost).toBe(100);expect(value.cumulativeDirectCost).toBe(1300);
  });
  it('enforces canonical units and counts for livestock sales',()=>{
    expect(()=>validateHerdSale('milk','kg',0,10,5)).toThrow('litres');expect(()=>validateHerdSale('meat','head',1,1,5)).toThrow('kg');expect(()=>validateHerdSale('live','head',2,1,5)).toThrow('quantity');expect(()=>validateHerdSale('live','kg',6,100,5)).toThrow('exceeds');expect(()=>validateHerdSale('milk','litre',0,10,5)).not.toThrow();
  });
  it('tracks crop inventory by cycle and unit and calculates break-even metrics',()=>{
    const cycle={id:'c',areaAcres:2} as never,data={cropHarvests:[{cycleId:'c',unit:'kg',quantity:1000}],cropSales:[{cycleId:'c',unit:'kg',quantity:400,total:800}],cropInputs:[{cycleId:'c',amount:500,isCapital:false},{cycleId:'c',amount:100,isCapital:true}]} as never;
    expect(cropAvailable('c','kg',data)).toBe(600);const value=cropMetrics(cycle,data);expect(value.yieldPerAcre).toBe(500);expect(value.costPerUnit).toBe(.6);expect(value.breakEvenPrice).toBe(1.5);expect(value.net).toBe(200);
  });
  it('stops completed crop acreage from occupying later report periods',()=>{
    const data={cropCycles:[{enterpriseId:'crop',sowingDate:'2026-01-01',completedDate:'2026-03-31',areaAcres:2}]} as never;expect(cropAreaForEnterprise('crop',data,{from:'2026-01-01',to:'2026-03-31'})).toBe(2);expect(cropAreaForEnterprise('crop',data,{from:'2026-04-01',to:'2026-12-31'})).toBe(0);
  });
  it('flows feed-crop cultivation cost into feed cost without double-counting consolidated operating cost',()=>{
    const base={expenses:[],otherIncome:[],labourLogs:[],batches:[],additions:[],mortalities:[],healthRecords:[],eggProduction:[],eggDispositions:[],eggSales:[],birdSales:[],feedPurchases:[],feedInputs:[],feedConsumption:[],herds:[],herdAdditions:[],herdMortalities:[],herdHealth:[],herdSales:[],cropSales:[],landPlots:[]},data={...base,enterprises:[{id:'crop'},{id:'poultry'}],cropCycles:[{id:'cycle',enterpriseId:'crop',type:'feed',sowingDate:'2026-01-01',areaAcres:1}],cropInputs:[{cycleId:'cycle',date:'2026-06-01',amount:100,isCapital:false}],feedUnits:[{id:'unit',feedTypeId:'feed',cropCycleId:'cycle'}],feedHarvests:[{unitId:'unit',date:'2026-06-15',quantity:10,allocations:[{enterpriseId:'poultry',percent:100}]}],feedTypes:[{id:'feed',source:'home-grown'}]} as never;
    expect(feedUnitCost('unit',data)).toBe(10);const period={from:'2026-01-01',to:'2026-12-31'};expect(enterprisePnl('crop',data,period).cropInputs).toBe(0);expect(enterprisePnl('poultry',data,period).homeFeed).toBe(100);
  });
  it('keeps pre-harvest home-feed operating and capital costs in consolidated reports',()=>{
    const base={expenses:[],otherIncome:[],labourLogs:[],batches:[],additions:[],mortalities:[],healthRecords:[],eggProduction:[],eggDispositions:[],eggSales:[],birdSales:[],feedPurchases:[],feedHarvests:[],feedConsumption:[],herds:[],herdAdditions:[],herdMortalities:[],herdHealth:[],herdSales:[],cropInputs:[],cropSales:[],cropCycles:[],landPlots:[]},data={...base,enterprises:[{id:'p',type:'livestock',active:true}],feedUnits:[{id:'unit'}],feedInputs:[{unitId:'unit',date:'2026-07-01',amount:100,isCapital:false},{unitId:'unit',date:'2026-07-02',amount:500,isCapital:true}]} as never,pnl=enterprisePnl('p',data,{from:'2026-01-01',to:'2026-12-31'});
    expect(pnl.homeFeed).toBe(100);expect(pnl.capital).toBe(500);expect(pnl.directCosts).toBe(600);
  });
  it('normalizes quintal prices and compares actual crop sales with market history',()=>{
    expect(normalizedMarketPrice({modalPrice:2500,unit:'quintal'} as never,'kg')).toBe(25);const data={cropCycles:[{id:'c',crop:'Tomato'}],cropHarvests:[{cycleId:'c',unit:'kg',quantity:100}],cropSales:[{cycleId:'c',unit:'kg',quantity:100,total:3000}],marketPrices:[{commodity:'Tomato',unit:'quintal',modalPrice:2000,date:'2026-07-01',arrivalQuantity:100},{commodity:'Tomato',unit:'quintal',modalPrice:2500,date:'2026-07-10',arrivalQuantity:80}]} as never;const signal=commoditySignals(data)[0];expect(signal.currentMarket).toBe(25);expect(signal.averageMarket).toBe(22.5);expect(signal.actualAverage).toBe(30);expect(signal.gapPercent).toBeCloseTo(33.33,1);expect(signal.bestDate).toBe('2026-07-10');expect(signal.arrivalTrend).toBe(-20);
    expect(commoditySignals({cropCycles:[{id:'c',crop:'Tomato'}],cropHarvests:[{cycleId:'c',unit:'kg',quantity:100}],cropSales:[{cycleId:'c',unit:'kg',quantity:100,total:3000}],marketPrices:[{commodity:'Tomato',unit:'quintal',modalPrice:2500,date:'2026-07-10',arrivalQuantity:80}]} as never)[0].arrivalTrend).toBe(0);
  });
  it('projects active crop yield from completed cycles of the same crop',()=>{
    const data={cropCycles:[{id:'old',crop:'Maize',status:'complete',areaAcres:2},{id:'new',crop:'Maize',status:'active',areaAcres:3}],cropHarvests:[{cycleId:'old',unit:'kg',quantity:1000}],cropInputs:[{cycleId:'new',amount:300,isCapital:false}],cropSales:[],marketPrices:[{commodity:'Maize',unit:'quintal',modalPrice:2500,date:'2026-07-10'}]} as never;const forecast=cropForecasts(data)[0];expect(forecast.projectedYield).toBe(1500);expect(forecast.marketPrice).toBe(25);expect(forecast.projectedRevenue).toBe(37500);expect(forecast.breakEvenPrice).toBe(.2);expect(forecast.confidence).toBe('historical');
  });
  it('creates deterministic operational warnings from cached forecasts',()=>{
    const data={weatherLogs:[{forecast:true,date:'2026-07-15',rainfallMm:60,tempMax:36,humidityPercent:90}]} as never,warnings=weatherWarnings(data,'2026-07-15');expect(warnings.some(x=>x.includes('rain forecast'))).toBe(true);expect(warnings.some(x=>x.includes('heat stress'))).toBe(true);expect(warnings.some(x=>x.includes('fungal'))).toBe(true);
  });
  it('preserves manual weather observations from automated refreshes',()=>{
    const manual={source:'manual'} as never,automatic={source:'open-meteo'} as never;expect(shouldReplaceWeather(manual,'open-meteo')).toBe(false);expect(shouldReplaceWeather(automatic,'open-meteo')).toBe(true);expect(shouldReplaceWeather(automatic,'manual')).toBe(true);
  });
  it('builds a deduplicated period-filtered cash ledger from specialized transactions',()=>{
    const data={expenses:[{id:'e',date:'2026-07-01',category:'misc',amount:100}],otherIncome:[{id:'i',date:'2026-07-02',source:'rent',amount:200,enterpriseId:'x'}],labourLogs:[],batches:[],healthRecords:[],eggSales:[],birdSales:[],feedPurchases:[],feedTypes:[],feedInputs:[],feedUnits:[],herds:[],herdHealth:[],herdSales:[],cropInputs:[{id:'ci',cycleId:'c',date:'2026-07-03',inputType:'seed-sapling',amount:50}],cropCycles:[{id:'c',crop:'Maize',enterpriseId:'x'}],cropSales:[]} as never;const rows=unifiedLedger(data,{from:'2026-07-01',to:'2026-07-31'});expect(rows).toHaveLength(3);expect(rows.filter(x=>x.direction==='in').reduce((v,x)=>v+x.amount,0)).toBe(200);expect(rows.filter(x=>x.direction==='out').reduce((v,x)=>v+x.amount,0)).toBe(150);expect(rows.map(x=>x.source)).toContain('Crop input');
  });
  it('exports normalized ML rows across animal, feed, crop, weather and market domains',()=>{
    const data={expenses:[],otherIncome:[],labourLogs:[],batches:[{id:'b',enterpriseId:'p',acquisitionDate:'2026-07-01'}],additions:[],mortalities:[{date:'2026-07-01',batchId:'b',countLost:1,cause:'heat'}],healthRecords:[],eggProduction:[],eggDispositions:[],layingCountLogs:[],eggSales:[],birdSales:[],poultryWeights:[],feedPurchases:[],feedHarvests:[],feedConsumption:[{date:'2026-07-01',id:'fc',feedTypeId:'f',enterpriseId:'p',quantity:2}],feedTypes:[{id:'f',unit:'kg'}],herds:[{id:'h',enterpriseId:'l'}],animals:[],herdAdditions:[],breedingEvents:[],herdMortalities:[],herdHealth:[],weightLogs:[],herdSales:[],cropInputs:[],cropHarvests:[{date:'2026-07-01',cycleId:'c',quantity:5,unit:'kg'}],cropSales:[],cropCycles:[{id:'c',enterpriseId:'crop',sowingDate:'2026-07-01'}],plotCycles:[{id:'pc',plotId:'plot',enterpriseId:'crop',startDate:'2026-06-01',seasonYear:'Kharif 2026',cropOrUse:'Maize'}],landPlots:[{id:'plot',areaAcres:2}],weatherLogs:[{id:'w',date:'2026-07-01',forecast:false,tempMin:20,tempMax:30,rainfallMm:4,humidityPercent:70,source:'manual'}],marketPrices:[{id:'m',date:'2026-07-01',commodity:'Maize',market:'X',minPrice:10,maxPrice:20,modalPrice:15,unit:'kg'}],feedUnits:[],feedInputs:[]} as never;const rows=buildMLRows(data),domains=new Set(rows.map(x=>x.entity_type));expect(domains).toEqual(new Set(['poultry','feed','land','crop','weather','market']));expect(rows.every(x=>/^\d{4}-\d{2}-\d{2}T00:00:00$/.test(x.timestamp))).toBe(true);expect(rows.find(x=>x.entity_type==='weather')?.context).toContain('Kharif');expect(mlCsv(data)).toContain('"entity_type"');
  });
  it('derives Bengaluru agricultural seasons consistently',()=>{expect(seasonForDate('2026-07-01')).toBe('Kharif');expect(seasonForDate('2026-12-01')).toBe('Rabi');expect(seasonForDate('2026-04-01')).toBe('summer')});
  it('recomputes labour-quantity and feed-harvest allocation drivers for the report period',()=>{
    const data={enterprises:[{id:'a'},{id:'b'}],labourLogs:[{date:'2026-07-01',quantity:10,allocations:[{enterpriseId:'a',percent:60},{enterpriseId:'b',percent:40}]},{date:'2025-07-01',quantity:100,allocations:[{enterpriseId:'a',percent:100}]}],feedHarvests:[{date:'2026-07-01',quantity:20,allocations:[{enterpriseId:'a',percent:25},{enterpriseId:'b',percent:75}]}]} as never,period={from:'2026-01-01',to:'2026-12-31'};expect(allocationDriverValues('labour-quantity',data,period).map(x=>x.value)).toEqual([6,4]);expect(allocationDriverValues('harvest-share',data,period).map(x=>x.value)).toEqual([5,15]);expect(expenseShare({amount:1000,allocationDriver:'labour-quantity'} as never,'a',data,period)).toBe(600);expect(expenseShare({amount:1000,allocationDriver:'harvest-share'} as never,'b',data,period)).toBe(750);
  });
  it('keeps a driver-allocated shared expense in consolidated costs when its driver has no activity',()=>{
    const data={enterprises:[{id:'a',active:true},{id:'b',active:true}],labourLogs:[],feedHarvests:[]} as never,period={from:'2026-01-01',to:'2026-12-31'},expense={amount:100,allocationDriver:'area'} as never;
    expect(expenseShare(expense,'a',data,period)).toBe(50);expect(expenseShare(expense,'b',data,period)).toBe(50);
  });
  it('separates batch-linked direct costs from shared allocated costs',()=>{
    const common={otherIncome:[],additions:[],mortalities:[],healthRecords:[],eggProduction:[],eggDispositions:[],eggSales:[],birdSales:[],feedPurchases:[],feedHarvests:[],herds:[],herdHealth:[],herdSales:[],cropInputs:[],cropSales:[],cropCycles:[],landPlots:[]},data={...common,enterprises:[{id:'p'},{id:'x'}],batches:[{id:'b',enterpriseId:'p',source:'hatched'}],expenses:[{date:'2026-07-01',amount:100,isCapital:false,batchId:'b'},{date:'2026-07-01',amount:200,isCapital:false,allocationDriver:'manual',allocations:[{enterpriseId:'p',percent:25},{enterpriseId:'x',percent:75}]}],labourLogs:[{date:'2026-07-01',amount:50,quantity:1,batchId:'b',allocations:[]}]} as never,pnl=enterprisePnl('p',data,{from:'2026-01-01',to:'2026-12-31'});expect(pnl.directAttributedCosts).toBe(150);expect(pnl.sharedAllocatedCosts).toBe(50);expect(pnl.directCosts).toBe(200);
  });
  it('keeps active depreciation from assets bought before the report period',()=>{
    const period={from:'2026-01-01',to:'2026-06-30'},base={otherIncome:[],labourLogs:[],batches:[],additions:[],mortalities:[],healthRecords:[],eggProduction:[],eggDispositions:[],eggSales:[],birdSales:[],feedPurchases:[],feedInputs:[],feedHarvests:[],herds:[],herdAdditions:[],herdHealth:[],herdSales:[],cropInputs:[],cropSales:[],cropCycles:[],landPlots:[]},data={...base,enterprises:[{id:'p'}],expenses:[{date:'2025-07-15',amount:1200,isCapital:true,usefulLifeMonths:12,enterpriseId:'p'}]} as never;
    expect(depreciationMonths('2025-07-15',12,period)).toBe(6);expect(enterprisePnl('p',data,period,true).depreciation).toBe(600);expect(enterprisePnl('p',data,period,true).operatingCosts).toBe(0);expect(enterprisePnl('p',data,period,false).capital).toBe(0);
  });
  it('separates operating cost from capital while subtracting capital once in cash profit',()=>{
    const base={otherIncome:[],labourLogs:[],batches:[],additions:[],mortalities:[],healthRecords:[],eggProduction:[],eggDispositions:[],eggSales:[],birdSales:[],feedPurchases:[],feedInputs:[],feedHarvests:[],herds:[],herdAdditions:[],herdHealth:[],herdSales:[],cropInputs:[],cropSales:[],cropCycles:[],landPlots:[]},data={...base,enterprises:[{id:'p'}],expenses:[{date:'2026-07-01',amount:100,isCapital:false,enterpriseId:'p'},{date:'2026-07-02',amount:1200,isCapital:true,usefulLifeMonths:12,enterpriseId:'p'}]} as never,pnl=enterprisePnl('p',data,{from:'2026-07-01',to:'2026-07-31'});
    expect(pnl.operatingCosts).toBe(100);expect(pnl.capital).toBe(1200);expect(pnl.directCosts).toBe(1300);expect(pnl.net).toBe(-1300);
  });
  it('does not make capital without a useful life disappear from the depreciated view',()=>{
    const base={otherIncome:[],labourLogs:[],batches:[],additions:[],mortalities:[],healthRecords:[],eggProduction:[],eggDispositions:[],eggSales:[],birdSales:[],feedPurchases:[],feedInputs:[],feedHarvests:[],herds:[],herdAdditions:[],herdHealth:[],herdSales:[],cropInputs:[],cropSales:[],cropCycles:[],landPlots:[]},data={...base,enterprises:[{id:'p'}],expenses:[{date:'2026-07-01',amount:900,isCapital:true,enterpriseId:'p'}]} as never,pnl=enterprisePnl('p',data,{from:'2026-07-01',to:'2026-07-31'},true);
    expect(pnl.depreciation).toBe(0);expect(pnl.selectedCapitalCost).toBe(900);expect(pnl.directCosts).toBe(900);
  });
  it('allocates feed-crop capital to the consumers instead of stranding it on the crop enterprise',()=>{
    const base={expenses:[],otherIncome:[],labourLogs:[],batches:[],additions:[],mortalities:[],healthRecords:[],eggProduction:[],eggDispositions:[],eggSales:[],birdSales:[],feedPurchases:[],feedInputs:[],herds:[],herdAdditions:[],herdHealth:[],herdSales:[],cropSales:[],landPlots:[]},data={...base,enterprises:[{id:'crop'},{id:'p'}],cropCycles:[{id:'cycle',enterpriseId:'crop',type:'feed',sowingDate:'2026-01-01',areaAcres:1}],cropInputs:[{cycleId:'cycle',date:'2026-07-01',amount:500,isCapital:true}],feedUnits:[{id:'unit',cropCycleId:'cycle'}],feedHarvests:[{unitId:'unit',date:'2026-07-10',quantity:10,allocations:[{enterpriseId:'p',percent:100}]}]} as never,period={from:'2026-01-01',to:'2026-12-31'};
    expect(enterprisePnl('crop',data,period).capital).toBe(0);expect(enterprisePnl('p',data,period,true).selectedCapitalCost).toBe(500);
  });
  it('uses event dates for stock validation and includes paid additions in recovery cost',()=>{
    const batch={id:'b',acquisitionDate:'2026-01-01',initialCount:10,acquisitionCost:100,enterpriseId:'p'} as never,data={batches:[batch],additions:[{batchId:'b',date:'2026-02-01',count:5,cost:50}],mortalities:[{batchId:'b',date:'2026-03-01',countLost:4}],birdSales:[],healthRecords:[],expenses:[],labourLogs:[],eggSales:[],eggProduction:[],eggDispositions:[]} as never;
    expect(batchCurrentCount(batch,data,'2026-02-15')).toBe(15);expect(batchCurrentCount(batch,data,'2026-03-15')).toBe(11);expect(batchMetrics(batch,data).cumulativeCost).toBe(150);expect(batchMetrics(batch,data).mortalityRate).toBeCloseTo(26.67,1);
  });
  it('retains a closed batch historically but removes it from later counts and allocation',()=>{
    const closed={id:'closed',enterpriseId:'p',acquisitionDate:'2026-01-01',closedDate:'2026-03-01',initialCount:10} as never,open={id:'open',enterpriseId:'p',acquisitionDate:'2026-01-01',initialCount:10} as never,data={batches:[closed,open],additions:[],mortalities:[],birdSales:[]} as never;
    expect(batchCurrentCount(closed,data,'2026-02-28')).toBe(10);expect(batchCurrentCount(closed,data,'2026-03-02')).toBe(0);expect(batchShareOnDate(closed,data,'2026-02-28')).toBe(.5);expect(batchShareOnDate(closed,data,'2026-03-02')).toBe(0);expect(batchBirdDays(closed,data,'2026-03-03')).toBe(600);
  });
  it('blocks removal of a poultry addition when later departures depend on it',()=>{
    const batch={id:'b',acquisitionDate:'2026-01-01',initialCount:5} as never,data={additions:[{id:'a',batchId:'b',date:'2026-02-01',count:5}],mortalities:[{batchId:'b',date:'2026-03-01',countLost:8}],birdSales:[]} as never;
    expect(batchCountsRemainValidWithoutAddition(batch,'a',data)).toBe(false);
    expect(batchCountsRemainValidWithoutAddition(batch,'missing',data)).toBe(true);
  });
  it('honours an explicit enterprise split even when labour is tagged to a batch',()=>{
    const base={otherIncome:[],additions:[],mortalities:[],healthRecords:[],eggProduction:[],eggDispositions:[],eggSales:[],birdSales:[],feedPurchases:[],feedInputs:[],feedHarvests:[],herds:[],herdAdditions:[],herdHealth:[],herdSales:[],cropInputs:[],cropSales:[],cropCycles:[],landPlots:[],expenses:[]},data={...base,enterprises:[{id:'p'},{id:'g'}],batches:[{id:'b',enterpriseId:'p',source:'hatched'}],labourLogs:[{date:'2026-07-01',amount:100,quantity:1,batchId:'b',allocations:[{enterpriseId:'p',percent:40},{enterpriseId:'g',percent:60}]}]} as never,period={from:'2026-01-01',to:'2026-12-31'};
    expect(enterprisePnl('p',data,period).labour).toBe(40);expect(enterprisePnl('g',data,period).labour).toBe(60);
  });
  it('builds farm-wide poultry and configurable feed alerts',()=>{
    const data={settings:[{key:'mortalityDeathThreshold',value:'2'},{key:'feedReorderDays',value:'10'}],enterprises:[],expenses:[],otherIncome:[],workers:[],labourLogs:[],batches:[{id:'b',name:'Layers',acquisitionDate:'2026-01-01',initialCount:10,ageAtAcquisitionDays:0,purpose:'layer',expectedLayStart:'2026-07-01'}],additions:[],mortalities:[{batchId:'b',date:'2026-07-14',countLost:2}],healthRecords:[],eggProduction:[],eggDispositions:[],eggSales:[],birdSales:[],feedTypes:[{id:'f',name:'Layer mash'}],feedPurchases:[{feedTypeId:'f',quantity:10}],feedUnits:[],feedInputs:[],feedHarvests:[],feedConsumption:[{feedTypeId:'f',date:'2026-07-14',quantity:7}],landPlots:[],plotCycles:[],herds:[],animals:[],breedingEvents:[],herdAdditions:[],herdMortalities:[],herdHealth:[],weightLogs:[],poultryWeights:[],layingCountLogs:[],herdSales:[],cropCycles:[],cropInputs:[],cropHarvests:[],cropSales:[],weatherLogs:[],marketPrices:[]} as never,titles=buildAlerts(data,'2026-07-15').map(x=>x.title);
    expect(titles).toContain('Poultry mortality spike');expect(titles).toContain('Expected laying start reached');expect(titles).toContain('Feed reorder due');
  });
  it('evaluates feed alerts at the requested audit date instead of today',()=>{
    const data={settings:[],enterprises:[],expenses:[],otherIncome:[],workers:[],labourLogs:[],batches:[],additions:[],mortalities:[],healthRecords:[],eggProduction:[],eggDispositions:[],eggSales:[],birdSales:[],feedTypes:[{id:'f',name:'Feed'}],feedPurchases:[{feedTypeId:'f',date:'2025-01-01',quantity:10}],feedUnits:[],feedInputs:[],feedHarvests:[],feedConsumption:[{feedTypeId:'f',date:'2026-01-01',quantity:10}],landPlots:[],plotCycles:[],herds:[],animals:[],breedingEvents:[],herdAdditions:[],herdMortalities:[],herdHealth:[],weightLogs:[],poultryWeights:[],layingCountLogs:[],herdSales:[],cropCycles:[],cropInputs:[],cropHarvests:[],cropSales:[],weatherLogs:[],marketPrices:[]} as never;
    expect(buildAlerts(data,'2025-07-01').some(x=>x.title==='Feed out of stock')).toBe(false);
  });
  it('clears a due health reminder when a later treatment of the same type exists',()=>{
    const base={settings:[],enterprises:[],expenses:[],otherIncome:[],workers:[],labourLogs:[],batches:[{id:'b',name:'Layers',active:true,acquisitionDate:'2026-01-01',initialCount:10,ageAtAcquisitionDays:0,purpose:'layer'}],additions:[],mortalities:[],eggProduction:[],eggDispositions:[],eggSales:[],birdSales:[],feedTypes:[],feedPurchases:[],feedUnits:[],feedInputs:[],feedHarvests:[],feedConsumption:[],landPlots:[],plotCycles:[],herds:[],animals:[],breedingEvents:[],herdAdditions:[],herdMortalities:[],herdHealth:[],weightLogs:[],poultryWeights:[],layingCountLogs:[],herdSales:[],cropCycles:[],cropInputs:[],cropHarvests:[],cropSales:[],weatherLogs:[],marketPrices:[]},data={...base,healthRecords:[{id:'old',batchId:'b',date:'2026-01-01',type:'Ranikhet',nextDueDate:'2026-02-01',updatedAt:'1'},{id:'new',batchId:'b',date:'2026-02-01',type:'Ranikhet',updatedAt:'2'}]} as never;
    expect(buildAlerts(data,'2026-02-02').some(x=>x.title==='Poultry health due')).toBe(false);
  });
  it('converts acres, guntas and cents to canonical acres',()=>{
    expect(landToAcres(1,20,25)).toBe(1.75);expect(landAreaLabel(1)).toContain('40.00 guntas');expect(landAreaLabel(1)).toContain('100.0 cents');
  });
  it('derives controlled crop identity from the enterprise registry',()=>{
    expect(cropCycleIdentity({name:'Roses',type:'commercial-crop',active:true})).toEqual({crop:'Roses',type:'commercial'});
    expect(cropCycleIdentity({name:'Mulberry',type:'feed-crop',active:true})).toEqual({crop:'Mulberry',type:'feed'});
    expect(()=>cropCycleIdentity({name:'Poultry',type:'livestock',active:true})).toThrow('crop enterprise');
    expect(()=>cropCycleIdentity({name:'Old crop',type:'commercial-crop',active:false})).toThrow('crop enterprise');
  });
});
