import type { Animal, Batch, BatchAddition, BirdSale, BreedingEvent, CropCycle, CropHarvest, CropOperationInput, CropSale, EggDisposition, EggProduction, EggSale, Enterprise, Expense, FeedConsumption, FeedHarvest, FeedProductionInput, FeedProductionUnit, FeedPurchase, FeedType, HealthRecord, Herd, HerdAddition, HerdHealth, HerdMortality, HerdSale, LabourLog, LandPlot, LayingCountLog, MortalityEvent, OtherIncome, PoultryWeightLog, WeightLog } from './types';

import { localDate } from './types';
import type { PlotCycle } from './types';

export type FarmData = { enterprises: Enterprise[]; expenses: Expense[]; otherIncome: OtherIncome[]; labourLogs: LabourLog[]; batches: Batch[]; additions: BatchAddition[]; mortalities: MortalityEvent[]; healthRecords: HealthRecord[]; eggProduction: EggProduction[]; eggDispositions: EggDisposition[]; eggSales: EggSale[]; birdSales: BirdSale[]; feedTypes?: FeedType[]; feedPurchases?: FeedPurchase[]; feedUnits?: FeedProductionUnit[]; feedInputs?: FeedProductionInput[]; feedHarvests?: FeedHarvest[]; feedConsumption?: FeedConsumption[]; poultryWeights?: PoultryWeightLog[]; layingCountLogs?:LayingCountLog[]; herds?: Herd[]; animals?:Animal[]; breedingEvents?:BreedingEvent[]; herdAdditions?: HerdAddition[]; herdMortalities?: HerdMortality[]; herdHealth?: HerdHealth[]; weightLogs?:WeightLog[]; herdSales?: HerdSale[]; landPlots?: LandPlot[]; plotCycles?: PlotCycle[]; cropCycles?: CropCycle[]; cropInputs?: CropOperationInput[]; cropHarvests?:CropHarvest[]; cropSales?: CropSale[] };
export type Period = { from: string; to: string };
const inPeriod = (date: string, period?: Period) => !period || (date >= period.from && date <= period.to);
export const allocatedAmount = (log: LabourLog | Expense, enterpriseId: string) => {
  if ('enterpriseId' in log && log.enterpriseId) return log.enterpriseId === enterpriseId ? log.amount : 0;
  return log.amount * ((log.allocations?.find(a => a.enterpriseId === enterpriseId)?.percent || 0) / 100);
};
const todayIso = localDate;
export const batchCurrentCount = (batch: Batch, data: FarmData, asOf = todayIso()) => batch.acquisitionDate > asOf || (!!batch.closedDate && asOf > batch.closedDate) ? 0 : Math.max(0, batch.initialCount
  + data.additions.filter(x => x.batchId === batch.id && (!x.date||x.date <= asOf)).reduce((s, x) => s + x.count, 0)
  - data.mortalities.filter(x => x.batchId === batch.id && (!x.date||x.date <= asOf)).reduce((s, x) => s + x.countLost, 0)
  - data.birdSales.filter(x => x.batchId === batch.id && (!x.date||x.date <= asOf)).reduce((s, x) => s + x.count, 0));
export const batchCountsRemainValidWithoutAddition = (batch: Batch, additionId: string, data: FarmData) => {
  const changes=new Map<string,number>();
  const change=(date:string,amount:number)=>changes.set(date,(changes.get(date)||0)+amount);
  data.additions.filter(x=>x.batchId===batch.id&&x.id!==additionId).forEach(x=>change(x.date,x.count));
  data.mortalities.filter(x=>x.batchId===batch.id).forEach(x=>change(x.date,-x.countLost));
  data.birdSales.filter(x=>x.batchId===batch.id).forEach(x=>change(x.date,-x.count));
  let count=batch.initialCount;
  for(const [,amount] of [...changes].sort(([left],[right])=>left.localeCompare(right))){count+=amount;if(count<0)return false}
  return true;
};
export const batchBirdDays = (batch: Batch, data: FarmData, to = localDate()) => {
  let total=0; const start=new Date(`${batch.acquisitionDate}T00:00:00Z`).getTime(),effectiveTo=batch.closedDate&&batch.closedDate<to?batch.closedDate:to,end=new Date(`${effectiveTo}T00:00:00Z`).getTime();
  if(!Number.isFinite(start)||start>end)return 0;
  for(let time=start;time<=end;time+=86400000){const day=new Date(time).toISOString().slice(0,10);total+=Math.max(0,batch.initialCount+data.additions.filter(x=>x.batchId===batch.id&&x.date<=day).reduce((v,x)=>v+x.count,0)-data.mortalities.filter(x=>x.batchId===batch.id&&x.date<=day).reduce((v,x)=>v+x.countLost,0)-data.birdSales.filter(x=>x.batchId===batch.id&&x.date<=day).reduce((v,x)=>v+x.count,0))}
  return total;
};
export const batchShareOnDate = (batch: Batch, data: FarmData, date: string) => {
  const eligible=data.batches.filter(x=>x.enterpriseId===batch.enterpriseId&&x.acquisitionDate<=date&&(!x.closedDate||date<=x.closedDate)),counts=eligible.map(x=>({id:x.id,count:batchCurrentCount(x,data,date)})),total=counts.reduce((v,x)=>v+x.count,0);
  if(total)return (counts.find(x=>x.id===batch.id)?.count||0)/total;
  return eligible.some(x=>x.id===batch.id)&&eligible.length?1/eligible.length:0;
};
export const herdShareOnDate = (herd: Herd, data: FarmData, date: string) => {
  const eligible=(data.herds||[]).filter(x=>x.enterpriseId===herd.enterpriseId&&x.acquisitionDate<=date&&(!x.closedDate||date<=x.closedDate)),counts=eligible.map(x=>({id:x.id,count:herdCurrentCount(x,data,date)})),total=counts.reduce((v,x)=>v+x.count,0);
  if(total)return (counts.find(x=>x.id===herd.id)?.count||0)/total;
  return eligible.some(x=>x.id===herd.id)&&eligible.length?1/eligible.length:0;
};
const purchaseEnterpriseCost=(purchase:FeedPurchase,enterpriseId:string,direct:boolean)=>purchase.totalCost*((purchase.allocations.find(x=>x.enterpriseId===enterpriseId)?.percent??(direct?100:0))/100);
export const feedCostPerUnit = (feedTypeId:string,data:FarmData) => {
  const type=(data.feedTypes||[]).find(x=>x.id===feedTypeId); if(!type)return 0;
  if(type.source==='purchased'){const purchases=(data.feedPurchases||[]).filter(x=>x.feedTypeId===feedTypeId),quantity=purchases.reduce((v,x)=>v+x.quantity,0);return quantity?purchases.reduce((v,x)=>v+x.totalCost,0)/quantity:(type.costPerUnit||0)}
  const units=(data.feedUnits||[]).filter(x=>x.feedTypeId===feedTypeId),ids=new Set(units.map(x=>x.id));const cost=(data.feedInputs||[]).filter(x=>ids.has(x.unitId)&&!x.isCapital).reduce((v,x)=>v+x.amount,0)+units.reduce((v,u)=>v+(u.cropCycleId?(data.cropInputs||[]).filter(x=>x.cycleId===u.cropCycleId&&!x.isCapital).reduce((s,x)=>s+x.amount,0):0)+(u.plotCycleId?data.expenses.filter(x=>x.plotCycleId===u.plotCycleId&&!x.isCapital).reduce((s,x)=>s+x.amount,0):0),0),quantity=(data.feedHarvests||[]).filter(x=>ids.has(x.unitId)).reduce((v,x)=>v+x.quantity,0);return quantity?cost/quantity:(type.costPerUnit||0)
};
export const feedIssueCostPerUnit=(issue:FeedConsumption,data:FarmData)=>{const lot=issue.feedPurchaseId?(data.feedPurchases||[]).find(x=>x.id===issue.feedPurchaseId):undefined;return lot?.quantity?lot.totalCost/lot.quantity:feedCostPerUnit(issue.feedTypeId,data)};
export const feedStock = (feedTypeId:string,data:FarmData,asOf?:string) => {const byDate=(x:{date?:string})=>!asOf||!x.date||x.date<=asOf,purchased=(data.feedPurchases||[]).filter(x=>x.feedTypeId===feedTypeId&&byDate(x)).reduce((v,x)=>v+x.quantity,0),unitIds=new Set((data.feedUnits||[]).filter(x=>x.feedTypeId===feedTypeId).map(x=>x.id)),harvested=(data.feedHarvests||[]).filter(x=>unitIds.has(x.unitId)&&byDate(x)).reduce((v,x)=>v+x.quantity,0),used=(data.feedConsumption||[]).filter(x=>x.feedTypeId===feedTypeId&&byDate(x)).reduce((v,x)=>v+x.quantity,0);return purchased+harvested-used};
export const hatchingCostBasis=(parentBatchId:string|undefined,eggs:number,data:FarmData)=>{const parent=data.batches.find(x=>x.id===parentBatchId);return parent?batchMetrics(parent,data).costPerEgg*eggs:0};
export const batchMetrics = (batch: Batch, data: FarmData) => {
  const mortality = data.mortalities.filter(x => x.batchId === batch.id).reduce((s, x) => s + x.countLost, 0);
  const additionCost = data.additions.filter(x => x.batchId === batch.id).reduce((s, x) => s + (x.cost || 0), 0);
  const health = data.healthRecords.filter(x => x.batchId === batch.id).reduce((s, x) => s + x.cost, 0);
  const expenses = data.expenses.filter(x => x.batchId === batch.id && !x.isCapital).reduce((s, x) => s + x.amount, 0);
  const consumption=(data.feedConsumption||[]).filter(x=>x.batchId===batch.id),consumptionCost=consumption.reduce((v,x)=>v+x.quantity*feedIssueCostPerUnit(x,data),0);
  const linkedPurchaseCost = (data.feedPurchases || []).filter(x=>x.date>=batch.acquisitionDate&&(x.batchId===batch.id||(!x.batchId&&!x.herdId))).reduce((s,x)=>s+(x.batchId===batch.id?purchaseEnterpriseCost(x,batch.enterpriseId,true):purchaseEnterpriseCost(x,batch.enterpriseId,false)*batchShareOnDate(batch,data,x.date)),0);
  const feed=consumption.length?consumptionCost:linkedPurchaseCost;
  const cumulativePeriod={from:batch.acquisitionDate,to:localDate()},sharedExpenses=data.expenses.filter(x=>!x.batchId&&!x.isCapital&&x.date>=batch.acquisitionDate).reduce((v,x)=>v+expenseShare(x,batch.enterpriseId,data,cumulativePeriod)*batchShareOnDate(batch,data,x.date),0);
  const labour = data.labourLogs.filter(x => x.batchId === batch.id).reduce((s, x) => s + allocatedAmount(x, batch.enterpriseId), 0)+data.labourLogs.filter(x=>!x.batchId&&x.date>=batch.acquisitionDate).reduce((v,x)=>v+allocatedAmount(x,batch.enterpriseId)*batchShareOnDate(batch,data,x.date),0);
  const eggRevenue = data.eggSales.filter(x => x.batchId === batch.id).reduce((s, x) => s + x.total, 0);
  const birdRevenue = data.birdSales.filter(x => x.batchId === batch.id).reduce((s, x) => s + x.total, 0);
  const cost = batch.acquisitionCost + additionCost + health + expenses + sharedExpenses + feed + labour,currentCount=batchCurrentCount(batch,data),eggsProduced=data.eggProduction.filter(x=>x.batchId===batch.id).reduce((v,x)=>v+x.eggsCollected,0),birdDays=batchBirdDays(batch,data),birdsEntered=batch.initialCount+data.additions.filter(x=>x.batchId===batch.id).reduce((v,x)=>v+x.count,0);
  const weights=(data.poultryWeights||[]).filter(x=>x.batchId===batch.id).sort((a,b)=>a.date.localeCompare(b.date)),firstWeight=weights[0],lastWeight=weights.at(-1),soldWeight=weights.length>1?data.birdSales.filter(x=>x.batchId===batch.id&&x.date>firstWeight.date&&x.date<=lastWeight!.date).reduce((v,x)=>v+(x.totalWeightKg||0),0):0,weightGain=weights.length>1?Math.max(0,lastWeight!.totalWeightKg+soldWeight-firstWeight.totalWeightKg):0,solidFeed=consumption.filter(x=>(data.feedTypes||[]).find(t=>t.id===x.feedTypeId)?.unit!=='litre'&&(!firstWeight||x.date>=firstWeight.date)&&(!lastWeight||x.date<=lastWeight.date)),totalFeed=solidFeed.reduce((v,x)=>v+x.quantity,0);
  const purchasedFeed=solidFeed.filter(x=>(data.feedTypes||[]).find(t=>t.id===x.feedTypeId)?.source==='purchased').reduce((v,x)=>v+x.quantity,0),homeFeed=Math.max(0,totalFeed-purchasedFeed),meatKg=data.birdSales.filter(x=>x.batchId===batch.id).reduce((v,x)=>v+(x.totalWeightKg||0),0);
  const layingLogs=(data.layingCountLogs||[]).filter(x=>x.batchId===batch.id).sort((a,b)=>a.date.localeCompare(b.date)),productionDates=data.eggProduction.filter(x=>x.batchId===batch.id),layingHenDays=productionDates.reduce((v,x)=>{const latest=layingLogs.filter(l=>l.date<=x.date).at(-1);return v+(latest?.layingHenCount||currentCount)},0);
  const recoveryGap=eggRevenue-cost,recentStart=localDate(new Date(Date.now()-29*86400000)),recentRevenue=data.eggSales.filter(x=>x.batchId===batch.id&&x.date>=recentStart).reduce((v,x)=>v+x.total,0),recentFeedCost=consumption.filter(x=>x.date>=recentStart).reduce((v,x)=>v+x.quantity*feedIssueCostPerUnit(x,data),0),recentLabour=data.labourLogs.filter(x=>x.date>=recentStart&&(x.batchId===batch.id||!x.batchId)).reduce((v,x)=>v+allocatedAmount(x,batch.enterpriseId)*(x.batchId?1:batchShareOnDate(batch,data,x.date)),0),recentHealth=data.healthRecords.filter(x=>x.batchId===batch.id&&x.date>=recentStart).reduce((v,x)=>v+x.cost,0),dailyRevenue=recentRevenue/30,dailyOngoingCost=(recentFeedCost+recentLabour+recentHealth)/30,dailyNetRecovery=dailyRevenue-dailyOngoingCost,projectedRecoveryDate=recoveryGap<0&&dailyNetRecovery>0?localDate(new Date(Date.now()+Math.ceil(-recoveryGap/dailyNetRecovery)*86400000)):undefined;
  return { currentCount, mortality, mortalityRate: birdsEntered ? mortality / birdsEntered * 100 : 0, cumulativeCost: cost, acquisitionAndAdditionCost:batch.acquisitionCost+additionCost, feedCost: feed, sharedCost:sharedExpenses, totalFeed, purchasedFeed, homeFeed, homeFeedPercent:totalFeed?homeFeed/totalFeed*100:0, eggRevenue, birdRevenue, eggsProduced, birdDays, layingHenDays, henDayPercent:layingHenDays?eggsProduced/layingHenDays*100:0, costPerEgg:eggsProduced?cost/eggsProduced:0, costPerKgMeat:meatKg?cost/meatKg:0, labourCost:labour, labourPerBird:currentCount?labour/currentCount:0, fcr:weightGain?totalFeed/weightGain:0, weightGain, recoveryPercent: cost ? eggRevenue / cost * 100 : 0, recoveryGap, dailyEggRevenue:dailyRevenue, dailyOngoingCost,dailyNetRecovery, projectedRecoveryDate };
};
export const undispositionedEggs = (production: EggProduction, data: FarmData) => {const rows=data.eggProduction.filter(x=>x.date===production.date&&x.batchId===production.batchId);if(rows[0]?.id!==production.id)return 0;return rows.reduce((v,x)=>v+x.eggsCollected,0)-data.eggDispositions.filter(x => x.date === production.date && x.batchId === production.batchId).reduce((s, x) => s + x.quantity, 0)};

export const herdCurrentCount = (herd: Herd, data: FarmData, asOf = todayIso()) => herd.acquisitionDate > asOf || Boolean(herd.closedDate&&asOf>herd.closedDate) ? 0 : Math.max(0, herd.initialCount
  + (data.herdAdditions || []).filter(x => x.herdId === herd.id && (!x.date||x.date <= asOf)).reduce((s, x) => s + x.count, 0)
  - (data.herdMortalities || []).filter(x => x.herdId === herd.id && (!x.date||x.date <= asOf)).reduce((s, x) => s + x.countLost, 0)
  - (data.herdSales || []).filter(x => x.herdId === herd.id && (!x.date||x.date <= asOf) && x.saleType !== 'milk').reduce((s, x) => s + x.count, 0));

export const herdMetrics=(herd:Herd,data:FarmData)=>{const through=herd.closedDate||localDate(),currentCount=herdCurrentCount(herd,data),additions=(data.herdAdditions||[]).filter(x=>x.herdId===herd.id&&x.date<=through),additionCost=additions.reduce((v,x)=>v+(x.cost||0),0),cumulativePeriod={from:herd.acquisitionDate,to:through},generalCost=data.expenses.filter(x=>!x.isCapital&&!x.batchId&&x.date>=herd.acquisitionDate&&x.date<=through).reduce((v,x)=>v+expenseShare(x,herd.enterpriseId,data,cumulativePeriod)*herdShareOnDate(herd,data,x.date),0),labourCost=data.labourLogs.filter(x=>!x.batchId&&x.date>=herd.acquisitionDate&&x.date<=through).reduce((v,x)=>v+allocatedAmount(x,herd.enterpriseId)*herdShareOnDate(herd,data,x.date),0),mortality=(data.herdMortalities||[]).filter(x=>x.herdId===herd.id&&x.date<=through).reduce((v,x)=>v+x.countLost,0),consumption=(data.feedConsumption||[]).filter(x=>x.herdId===herd.id&&x.date<=through),consumptionCost=consumption.reduce((v,x)=>v+x.quantity*feedIssueCostPerUnit(x,data),0),purchaseCost=(data.feedPurchases||[]).filter(x=>x.date>=herd.acquisitionDate&&x.date<=through&&(x.herdId===herd.id||(!x.batchId&&!x.herdId))).reduce((v,x)=>v+(x.herdId===herd.id?purchaseEnterpriseCost(x,herd.enterpriseId,true):purchaseEnterpriseCost(x,herd.enterpriseId,false)*herdShareOnDate(herd,data,x.date)),0),feedCost=consumption.length?consumptionCost:purchaseCost,weights=(data.weightLogs||[]).filter(x=>x.herdId===herd.id&&x.date<=through).sort((a,b)=>a.date.localeCompare(b.date)),totalWeight=(x:WeightLog)=>x.weightBasis==='average'?x.weightKg*x.animalCount:x.weightKg,first=weights[0],last=weights.at(-1),soldWeight=first&&last?(data.herdSales||[]).filter(x=>x.herdId===herd.id&&x.saleType!=='milk'&&x.unit==='kg'&&x.date>first.date&&x.date<=last.date).reduce((v,x)=>v+x.quantity,0):0,weightGain=first&&last?Math.max(0,totalWeight(last)+soldWeight-totalWeight(first)):0,totalFeed=first&&last?consumption.filter(x=>x.date>=first.date&&x.date<=last.date&&(data.feedTypes||[]).find(t=>t.id===x.feedTypeId)?.unit!=='litre').reduce((v,x)=>v+x.quantity,0):0,purchasedFeed=consumption.filter(x=>(data.feedTypes||[]).find(t=>t.id===x.feedTypeId)?.source==='purchased').reduce((v,x)=>v+x.quantity,0),allFeed=consumption.reduce((v,x)=>v+x.quantity,0),healthCost=(data.herdHealth||[]).filter(x=>x.herdId===herd.id&&x.date<=through).reduce((v,x)=>v+x.cost,0),revenue=(data.herdSales||[]).filter(x=>x.herdId===herd.id&&x.date<=through).reduce((v,x)=>v+x.total,0),born=(data.breedingEvents||[]).filter(x=>x.herdId===herd.id&&x.date<=through).reduce((v,x)=>v+x.numberBorn,0),survived=(data.breedingEvents||[]).filter(x=>x.herdId===herd.id&&x.date<=through).reduce((v,x)=>v+x.numberSurvived,0),headEntered=herd.initialCount+additions.reduce((v,x)=>v+x.count,0);return {currentCount,mortality,mortalityRate:headEntered?mortality/headEntered*100:0,feedCost,totalFeed:allFeed,purchasedFeed,homeFeedPercent:allFeed?(allFeed-purchasedFeed)/allFeed*100:0,weightGain,fcr:weightGain?totalFeed/weightGain:0,healthCost,generalCost,labourCost,revenue,cumulativeDirectCost:herd.acquisitionCost+additionCost+feedCost+healthCost+generalCost+labourCost,born,survived,birthSurvivalRate:born?survived/born*100:0}}

export const feedUnitCost = (unitId: string, data: FarmData) => {
  const unit=(data.feedUnits||[]).find(x=>x.id===unitId),productionCost = (data.feedInputs || []).filter(x => x.unitId === unitId && !x.isCapital).reduce((s, x) => s + x.amount, 0),cropCost=unit?.cropCycleId?(data.cropInputs||[]).filter(x=>x.cycleId===unit.cropCycleId&&!x.isCapital).reduce((s,x)=>s+x.amount,0):0,rotationCost=unit?.plotCycleId?data.expenses.filter(x=>x.plotCycleId===unit.plotCycleId&&!x.isCapital).reduce((s,x)=>s+x.amount,0):0,cost=productionCost+cropCost+rotationCost;
  const quantity = (data.feedHarvests || []).filter(x => x.unitId === unitId).reduce((s, x) => s + x.quantity, 0);
  return quantity ? cost / quantity : 0;
};

export const cropAreaForEnterprise = (enterpriseId: string, data: FarmData, period: Period) => (data.cropCycles || [])
  .filter(x => {const end=x.completedDate||x.expectedHarvest;return x.enterpriseId === enterpriseId && x.sowingDate <= period.to && (!end || end >= period.from)})
  .reduce((s, x) => s + x.areaAcres, 0);

const cropUnits:CropHarvest['unit'][]=['kg','bunch','piece'];
export const cropAvailable=(cycleId:string,unit:CropHarvest['unit'],data:FarmData,asOf?:string)=>(data.cropHarvests||[]).filter(x=>x.cycleId===cycleId&&x.unit===unit&&(!asOf||x.date<=asOf)).reduce((v,x)=>v+x.quantity,0)-(data.cropSales||[]).filter(x=>x.cycleId===cycleId&&x.unit===unit&&(!asOf||x.date<=asOf)).reduce((v,x)=>v+x.quantity,0);
export const cropMetrics=(cycle:CropCycle,data:FarmData)=>{const inputs=(data.cropInputs||[]).filter(x=>x.cycleId===cycle.id),operatingCost=inputs.filter(x=>!x.isCapital).reduce((v,x)=>v+x.amount,0),capital=inputs.filter(x=>x.isCapital).reduce((v,x)=>v+x.amount,0),sales=(data.cropSales||[]).filter(x=>x.cycleId===cycle.id),revenue=sales.reduce((v,x)=>v+x.total,0),harvests=(data.cropHarvests||[]).filter(x=>x.cycleId===cycle.id),quantities=Object.fromEntries([...cropUnits].map(unit=>[unit,harvests.filter(x=>x.unit===unit).reduce((v,x)=>v+x.quantity,0)])) as Record<CropHarvest['unit'],number>,sold=Object.fromEntries([...cropUnits].map(unit=>[unit,sales.filter(x=>x.unit===unit).reduce((v,x)=>v+x.quantity,0)])) as Record<CropHarvest['unit'],number>,primary=[...cropUnits].sort((a,b)=>quantities[b]-quantities[a])[0],harvested=quantities[primary],soldPrimary=sold[primary],cost=operatingCost+capital;return {operatingCost,capital,cost,revenue,net:revenue-cost,margin:revenue?(revenue-cost)/revenue*100:0,quantities,sold,primaryUnit:primary,yieldPerAcre:cycle.areaAcres?harvested/cycle.areaAcres:0,costPerUnit:harvested?cost/harvested:0,breakEvenPrice:soldPrimary?cost/soldPrimary:harvested?cost/harvested:0,available:quantities[primary]-sold[primary]}}

const animalDaysForEnterprise = (enterpriseId: string, data: FarmData, period: Period) => {
  let total = 0;
  for (let time = new Date(`${period.from}T00:00:00Z`).getTime(), end = new Date(`${period.to}T00:00:00Z`).getTime(); time <= end; time += 86400000) {
    const day = new Date(time).toISOString().slice(0,10);
    total += data.batches.filter(b => b.enterpriseId === enterpriseId).reduce((sum,b) => sum + batchCurrentCount(b,data,day),0);
    total += (data.herds || []).filter(h => h.enterpriseId === enterpriseId).reduce((sum,h) => sum + herdCurrentCount(h,data,day),0);
  }
  return Math.max(0,total);
};

export const allocationDriverValues=(driver:Exclude<NonNullable<Expense['allocationDriver']>,'manual'>,data:FarmData,period:Period)=>data.enterprises.map(enterprise=>{let value=0;if(driver==='area')value=cropAreaForEnterprise(enterprise.id,data,period);else if(driver==='animal-days')value=animalDaysForEnterprise(enterprise.id,data,period);else if(driver==='labour-quantity')value=data.labourLogs.filter(x=>inPeriod(x.date,period)).reduce((v,x)=>v+x.quantity*((x.allocations.find(a=>a.enterpriseId===enterprise.id)?.percent||0)/100),0);else value=(data.feedHarvests||[]).filter(x=>inPeriod(x.date,period)).reduce((v,x)=>v+x.quantity*((x.allocations.find(a=>a.enterpriseId===enterprise.id)?.percent||0)/100),0);return {id:enterprise.id,value}});
export const expenseShare = (expense: Expense, enterpriseId: string, data: FarmData, period: Period) => {
  if(expense.batchId){const batch=data.batches.find(x=>x.id===expense.batchId);return batch?.enterpriseId===enterpriseId?expense.amount:0}
  if (expense.enterpriseId || !expense.allocationDriver || expense.allocationDriver === 'manual') return allocatedAmount(expense, enterpriseId);
  const values = allocationDriverValues(expense.allocationDriver,data,period);
  const denominator = values.reduce((s,x)=>s+x.value,0); const own = values.find(x=>x.id===enterpriseId)?.value || 0;
  if(denominator)return expense.amount * own / denominator;
  const fallback=data.enterprises.filter(x=>x.active!==false);
  return fallback.some(x=>x.id===enterpriseId)&&fallback.length?expense.amount/fallback.length:0;
};

const monthNumber=(date:string)=>{const [year,month]=date.slice(0,7).split('-').map(Number);return year*12+month-1};
export const depreciationMonths=(assetDate:string,usefulLifeMonths:number,period:Period)=>{
  if(usefulLifeMonths<=0||assetDate>period.to)return 0;
  const assetMonth=monthNumber(assetDate),first=Math.max(assetMonth,monthNumber(period.from)),last=Math.min(assetMonth+usefulLifeMonths-1,monthNumber(period.to));
  return Math.max(0,last-first+1);
};

const feedInputShare=(amount:number,unitId:string,enterpriseId:string,data:FarmData)=>{
  const harvests=(data.feedHarvests||[]).filter(x=>x.unitId===unitId),total=harvests.reduce((v,x)=>v+x.quantity,0);
  if(total){const allocated=harvests.reduce((v,x)=>v+x.quantity*((x.allocations.find(a=>a.enterpriseId===enterpriseId)?.percent||0)/100),0);return amount*allocated/total}
  const unit=(data.feedUnits||[]).find(x=>x.id===unitId),cycle=unit?.cropCycleId?(data.cropCycles||[]).find(x=>x.id===unit.cropCycleId):undefined,rotation=unit?.plotCycleId?(data.plotCycles||[]).find(x=>x.id===unit.plotCycleId):undefined,producerId=cycle?.enterpriseId||rotation?.enterpriseId;
  if(producerId)return producerId===enterpriseId?amount:0;
  const active=data.enterprises.filter(x=>x.active!==false),livestock=active.filter(x=>x.type==='livestock'),recipients=livestock.length?livestock:active;
  return recipients.some(x=>x.id===enterpriseId)&&recipients.length?amount/recipients.length:0;
};

export const enterprisePnl = (enterpriseId: string, data: FarmData, period: Period, depreciated = false) => {
  const feedPlotCycles=new Set((data.feedUnits||[]).map(x=>x.plotCycleId).filter((x):x is string=>!!x)),expenses = data.expenses.filter(x => inPeriod(x.date, period)&&!(x.plotCycleId&&!x.isCapital&&feedPlotCycles.has(x.plotCycleId)));
  const isDirect=(x:Expense)=>!!x.enterpriseId||!!x.batchId,directRecurring=expenses.filter(x=>!x.isCapital&&isDirect(x)).reduce((s,x)=>s+expenseShare(x,enterpriseId,data,period),0),sharedRecurring=expenses.filter(x=>!x.isCapital&&!isDirect(x)).reduce((s,x)=>s+expenseShare(x,enterpriseId,data,period),0),recurring=directRecurring+sharedRecurring;
  const capital = expenses.filter(x => x.isCapital).reduce((s, x) => s + expenseShare(x, enterpriseId, data, period), 0);
  const depreciationFor=(direct:boolean)=>data.expenses.filter(x => x.isCapital && x.usefulLifeMonths&&x.date<=period.to&&isDirect(x)===direct).reduce((s, x) => s + expenseShare(x, enterpriseId, data, period) / (x.usefulLifeMonths || 1) * depreciationMonths(x.date,x.usefulLifeMonths||0,period), 0),directDepreciation=depreciationFor(true),sharedDepreciation=depreciationFor(false),depreciation=directDepreciation+sharedDepreciation;
  const labourShare=(x:LabourLog)=>x.batchId&&!x.allocations?.length?(data.batches.find(b=>b.id===x.batchId)?.enterpriseId===enterpriseId?x.amount:0):allocatedAmount(x,enterpriseId),directLabour=data.labourLogs.filter(x=>inPeriod(x.date,period)&&x.batchId).reduce((s,x)=>s+labourShare(x),0),sharedLabour=data.labourLogs.filter(x=>inPeriod(x.date,period)&&!x.batchId).reduce((s,x)=>s+labourShare(x),0),labour=directLabour+sharedLabour;
  const health = data.healthRecords.filter(x => inPeriod(x.date, period)).filter(x => data.batches.find(b => b.id === x.batchId)?.enterpriseId === enterpriseId).reduce((s, x) => s + x.cost, 0);
  const acquisitions = data.batches.filter(x => x.enterpriseId === enterpriseId && x.source==='purchased' && inPeriod(x.acquisitionDate, period)).reduce((s, x) => s + x.acquisitionCost, 0)+data.additions.filter(x=>inPeriod(x.date,period)&&data.batches.find(b=>b.id===x.batchId)?.enterpriseId===enterpriseId).reduce((s,x)=>s+(x.cost||0),0);
  const feedPurchases = (data.feedPurchases || []).filter(x => inPeriod(x.date, period)).reduce((s, x) => s + x.totalCost * ((x.allocations.find(a => a.enterpriseId === enterpriseId)?.percent || 0) / 100), 0);
  const harvestedUnits=new Set((data.feedHarvests||[]).map(x=>x.unitId)),pendingFeedUnits=(data.feedUnits||[]).filter(x=>!harvestedUnits.has(x.id));
  const harvestedHomeFeed = (data.feedHarvests || []).filter(x => inPeriod(x.date, period)).reduce((s, x) => s + x.quantity * feedUnitCost(x.unitId, data) * ((x.allocations.find(a => a.enterpriseId === enterpriseId)?.percent || 0) / 100), 0);
  const pendingHomeFeed=pendingFeedUnits.reduce((value,unit)=>{const direct=(data.feedInputs||[]).filter(x=>x.unitId===unit.id&&!x.isCapital&&inPeriod(x.date,period)).reduce((v,x)=>v+x.amount,0),crop=unit.cropCycleId?(data.cropInputs||[]).filter(x=>x.cycleId===unit.cropCycleId&&!x.isCapital&&inPeriod(x.date,period)).reduce((v,x)=>v+x.amount,0):0,rotation=unit.plotCycleId?data.expenses.filter(x=>x.plotCycleId===unit.plotCycleId&&!x.isCapital&&inPeriod(x.date,period)).reduce((v,x)=>v+x.amount,0):0;return value+feedInputShare(direct+crop+rotation,unit.id,enterpriseId,data)},0),homeFeed=harvestedHomeFeed+pendingHomeFeed;
  const herdAcquisitions = (data.herds || []).filter(x => x.enterpriseId === enterpriseId && inPeriod(x.acquisitionDate, period)).reduce((s, x) => s + x.acquisitionCost, 0)+(data.herdAdditions||[]).filter(x=>inPeriod(x.date,period)&&(data.herds||[]).find(h=>h.id===x.herdId)?.enterpriseId===enterpriseId).reduce((s,x)=>s+(x.cost||0),0);
  const herdHealth = (data.herdHealth || []).filter(x => inPeriod(x.date, period) && (data.herds || []).find(h => h.id === x.herdId)?.enterpriseId === enterpriseId).reduce((s, x) => s + x.cost, 0);
  const cropInputs = (data.cropInputs || []).filter(x => inPeriod(x.date, period) && (data.cropCycles || []).find(c => c.id === x.cycleId)?.enterpriseId === enterpriseId && (data.cropCycles || []).find(c=>c.id===x.cycleId)?.type!=='feed' && !x.isCapital).reduce((s, x) => s + x.amount, 0);
  const cropCapital = (data.cropInputs || []).filter(x => inPeriod(x.date, period) && (data.cropCycles || []).find(c => c.id === x.cycleId)?.enterpriseId === enterpriseId && (data.cropCycles || []).find(c=>c.id===x.cycleId)?.type!=='feed' && x.isCapital).reduce((s, x) => s + x.amount, 0);
  const eggRevenue = data.eggSales.filter(x => x.enterpriseId === enterpriseId && inPeriod(x.date, period)).reduce((s, x) => s + x.total, 0);
  const birdRevenue = data.birdSales.filter(x => x.enterpriseId === enterpriseId && inPeriod(x.date, period)).reduce((s, x) => s + x.total, 0);
  const otherRevenue = data.otherIncome.filter(x => x.enterpriseId === enterpriseId && inPeriod(x.date, period)).reduce((s, x) => s + x.amount, 0);
  const herdRevenue = (data.herdSales || []).filter(x => x.enterpriseId === enterpriseId && inPeriod(x.date, period)).reduce((s, x) => s + x.total, 0);
  const cropRevenue = (data.cropSales || []).filter(x => x.enterpriseId === enterpriseId && inPeriod(x.date, period)).reduce((s, x) => s + x.total, 0);
  const feedInputCapital=(data.feedInputs||[]).filter(x=>x.isCapital&&inPeriod(x.date,period)).reduce((v,x)=>v+feedInputShare(x.amount,x.unitId,enterpriseId,data),0);
  const feedCropCapital=(data.cropInputs||[]).filter(x=>x.isCapital&&inPeriod(x.date,period)&&(data.cropCycles||[]).find(c=>c.id===x.cycleId)?.type==='feed').reduce((v,x)=>{const unit=(data.feedUnits||[]).find(u=>u.cropCycleId===x.cycleId);return v+(unit?feedInputShare(x.amount,unit.id,enterpriseId,data):((data.cropCycles||[]).find(c=>c.id===x.cycleId)?.enterpriseId===enterpriseId?x.amount:0))},0),feedCapital=feedInputCapital+feedCropCapital,allCapital = capital + cropCapital + feedCapital;
  const directExpenseCapital=expenses.filter(x=>x.isCapital&&isDirect(x)).reduce((v,x)=>v+expenseShare(x,enterpriseId,data,period),0),sharedExpenseCapital=capital-directExpenseCapital;
  const directNonDepreciable=expenses.filter(x=>x.isCapital&&isDirect(x)&&!x.usefulLifeMonths).reduce((v,x)=>v+expenseShare(x,enterpriseId,data,period),0),sharedNonDepreciable=expenses.filter(x=>x.isCapital&&!isDirect(x)&&!x.usefulLifeMonths).reduce((v,x)=>v+expenseShare(x,enterpriseId,data,period),0);
  const directCapitalSelected=depreciated?directDepreciation+directNonDepreciable+cropCapital:directExpenseCapital+cropCapital,sharedCapitalSelected=depreciated?sharedDepreciation+sharedNonDepreciable+feedCapital:sharedExpenseCapital+feedCapital,directAttributedCosts=directRecurring+directLabour+health+acquisitions+herdAcquisitions+herdHealth+cropInputs+directCapitalSelected,sharedAllocatedCosts=sharedRecurring+sharedLabour+feedPurchases+homeFeed+sharedCapitalSelected,directCosts=directAttributedCosts+sharedAllocatedCosts;
  const revenue = eggRevenue + birdRevenue + otherRevenue + herdRevenue + cropRevenue,selectedCapitalCost=directCapitalSelected+sharedCapitalSelected,operatingCosts=Math.max(0,directCosts-selectedCapitalCost); const net = revenue - directCosts;
  const acres = cropAreaForEnterprise(enterpriseId, data, period); const profitPerAcre = acres ? net / acres : 0;
  return { revenue, recurring,directRecurring,sharedRecurring, labour,directLabour,sharedLabour, health, acquisitions, feedPurchases, homeFeed, herdAcquisitions, herdHealth, cropInputs, capital: allCapital, depreciation,operatingCosts,selectedCapitalCost,directAttributedCosts,sharedAllocatedCosts, directCosts, net, margin: revenue ? net/revenue*100 : 0, acres, profitPerAcre, returnPerRupee: directCosts ? net/directCosts : 0 };
};

