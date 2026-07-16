import { TABLE_NAMES, db } from './db';
import { localDate, type AppSetting } from './types';
import type { ReportingData } from './reporting';

export type SampleKey = 'balanced' | 'poultry-growth' | 'dairy-led' | 'crop-led' | 'stress-test';
export type SampleFarmData = ReportingData & { settings: AppSetting[]; workers: NonNullable<ReportingData['workers']> };
type ScenarioConfig = {
  key: SampleKey; name: string; description: string; mortalityLoss: number; eggPrice: number;
  cropPrice: number; milkPrice: number; sharedPoultry: number;
};

export const SAMPLE_SCENARIOS: ScenarioConfig[] = [
  { key:'balanced', name:'Balanced mixed farm', description:'A healthy poultry, goat, sheep, commercial-crop and fodder operation with moderate shared costs.', mortalityLoss:1, eggPrice:9, cropPrice:28, milkPrice:60, sharedPoultry:50 },
  { key:'poultry-growth', name:'Poultry growth and recovery', description:'Poultry-led farm with laying, hatching, bird sales, flock weights, FCR inputs and recovery revenue.', mortalityLoss:2, eggPrice:11, cropPrice:24, milkPrice:55, sharedPoultry:70 },
  { key:'dairy-led', name:'Goat and sheep dairy', description:'Livestock-led farm covering tagged animals, breeding, births, health, weights, live sales and milk income.', mortalityLoss:1, eggPrice:8, cropPrice:25, milkPrice:80, sharedPoultry:25 },
  { key:'crop-led', name:'Commercial and feed crops', description:'Crop-led farm with land rotations, repeated harvests, crop inventory, sales and feed-crop routing.', mortalityLoss:1, eggPrice:8, cropPrice:40, milkPrice:55, sharedPoultry:30 },
  { key:'stress-test', name:'Alerts and cost pressure', description:'A valid but pressured farm designed to trigger mortality, health, wage, harvest and feed alerts.', mortalityLoss:5, eggPrice:7, cropPrice:20, milkPrice:45, sharedPoultry:45 }
];

const shift = (base: string, days: number) => {
  const value = new Date(`${base}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10);
};

export function createSampleFarm(key: SampleKey, asOf = localDate()): SampleFarmData {
  const c = SAMPLE_SCENARIOS.find(x => x.key === key) || SAMPLE_SCENARIOS[0], p = `sample-${c.key}`;
  const rid = (name: string) => `${p}-${name}`, timestamp = `${asOf}T08:00:00.000Z`;
  const row = <T extends object>(name: string, value: T) => ({ id: rid(name), createdAt: timestamp, updatedAt: timestamp, ...value });
  const poultry=rid('enterprise-poultry'), goats=rid('enterprise-goats'), tomato=rid('enterprise-tomato'), maize=rid('enterprise-maize');
  const layer=rid('batch-layer'), hatched=rid('batch-hatched'), broiler=rid('batch-broiler'), worker=rid('worker-primary'), layerFeed=rid('feed-layer'), fodderFeed=rid('feed-fodder'), azollaFeed=rid('feed-azolla');
  const layerLot=rid('feed-purchase-layer'), fodderUnit=rid('feed-unit-fodder'), azollaUnit=rid('feed-unit-azolla'), goatHerd=rid('herd-goat'), sheepHerd=rid('herd-sheep');
  const goatFemale=rid('animal-goat-female'), goatSold=rid('animal-goat-sold'), sheepDied=rid('animal-sheep-died');
  const commercialPlot=rid('plot-commercial'), fodderPlot=rid('plot-fodder'), tomatoCycle=rid('crop-tomato'), maizeCycle=rid('crop-maize');
  const feedHarvest=rid('feed-harvest-maize'), soldDisposition=rid('egg-disposition-sold'), hatchDisposition=rid('egg-disposition-hatch');
  const sharedGoats=100-c.sharedPoultry;
  const data = {
    enterprises:[
      row('enterprise-poultry',{name:'Poultry',type:'livestock',active:true}), row('enterprise-goats',{name:'Goats & Sheep',type:'livestock',active:true}),
      row('enterprise-tomato',{name:'Tomato',type:'commercial-crop',active:true}), row('enterprise-maize',{name:'Maize Fodder',type:'feed-crop',active:true})
    ],
    expenses:[
      row('expense-utilities',{date:shift(asOf,-25),category:'utilities',amount:1200,isCapital:false,allocationDriver:'manual',allocations:[{enterpriseId:poultry,percent:c.sharedPoultry},{enterpriseId:goats,percent:sharedGoats}],note:'Shared electricity and water'}),
      row('expense-equipment',{date:shift(asOf,-120),category:'equipment',amount:12000,isCapital:true,usefulLifeMonths:60,enterpriseId:poultry,note:'Brooder and weighing scale'}),
      row('expense-transport',{date:shift(asOf,-14),category:'transport',amount:700,isCapital:false,allocationDriver:'animal-days',note:'Shared market transport'}),
      row('expense-infrastructure',{date:shift(asOf,-80),category:'infrastructure',amount:2400,isCapital:false,allocationDriver:'area',note:'Shared irrigation repair'}),
      row('expense-feed',{date:shift(asOf,-12),category:'feed',amount:500,isCapital:false,enterpriseId:goats,note:'Mineral supplements'}),
      row('expense-misc',{date:shift(asOf,-8),category:'misc',amount:300,isCapital:false,allocationDriver:'labour-quantity',note:'Shared farm supplies'}),
      row('expense-harvest-share',{date:shift(asOf,-7),category:'misc',amount:250,isCapital:false,allocationDriver:'harvest-share',note:'Shared harvest handling'})
    ],
    otherIncome:[row('income-compost',{date:shift(asOf,-6),source:'Compost sale',amount:850,enterpriseId:goats,note:'Manure compost'})],
    workers:[row('worker-primary',{name:'Ravi',wageType:'daily',rate:650,phone:'9000000001',active:true}),row('worker-monthly',{name:'Lakshmi',wageType:'monthly',rate:15000,phone:'9000000002',active:true}),row('worker-piece',{name:'Manju',wageType:'piece',rate:4,active:true})],
    labourLogs:[
      row('labour-unpaid',{workerId:worker,date:shift(asOf,-2),task:'Cleaning and feeding',quantity:1,amount:650,allocations:[{enterpriseId:poultry,percent:c.sharedPoultry},{enterpriseId:goats,percent:sharedGoats}],batchId:layer,paid:false}),
      row('labour-crop',{workerId:rid('worker-piece'),date:shift(asOf,-10),task:'Harvest sorting',quantity:50,amount:200,allocations:[{enterpriseId:tomato,percent:100}],paid:true})
    ],
    batches:[
      row('batch-layer',{name:'Layer A',breed:'Giriraja',purpose:'layer',source:'purchased',acquisitionDate:shift(asOf,-190),stage:'adult',ageAtAcquisitionDays:30,initialCount:100,acquisitionCost:6500,expectedLayStart:shift(asOf,-60),targetMeatAgeDays:180,enterpriseId:poultry,active:true,notes:'Primary laying flock'}),
      row('batch-hatched',{name:'Layer A-H',breed:'Giriraja cross',purpose:'dual',source:'hatched',acquisitionDate:shift(asOf,-40),stage:'chick',ageAtAcquisitionDays:0,initialCount:8,acquisitionCost:0,expectedLayStart:shift(asOf,110),targetMeatAgeDays:180,parentDispositionId:hatchDisposition,eggsSet:10,hatchSuccessCount:8,enterpriseId:poultry,active:true}),
      row('batch-broiler',{name:'Broiler B',breed:'Vanaraja',purpose:'meat',source:'purchased',acquisitionDate:shift(asOf,-70),stage:'grower',ageAtAcquisitionDays:1,initialCount:30,acquisitionCost:2400,targetMeatAgeDays:120,enterpriseId:poultry,active:true,notes:'Meat batch for option coverage'})
    ],
    additions:[row('batch-addition',{batchId:layer,date:shift(asOf,-30),count:10,cost:500,note:'Replacement pullets'})],
    mortalities:[row('poultry-mortality',{batchId:layer,date:shift(asOf,-1),countLost:c.mortalityLoss,cause:c.key==='stress-test'?'heat':'disease',note:'Sample mortality event'}),...(['disease','predator','heat','injury','unknown'] as const).map((cause,index)=>row(`broiler-mortality-${cause}`,{batchId:broiler,date:shift(asOf,-55+index),countLost:1,cause,note:`${cause} option example`}))],
    healthRecords:[row('poultry-health',{batchId:layer,date:shift(asOf,-95),type:'Ranikhet',quantity:100,cost:450,nextDueDate:shift(asOf,-5),note:'Due reminder example'}),row('poultry-health-custom',{batchId:layer,date:shift(asOf,-20),type:'Probiotic course',quantity:1,cost:180,note:'Custom reusable health type'})],
    eggProduction:[row('egg-production',{date:shift(asOf,-3),batchId:layer,eggsCollected:75})],
    eggDispositions:[
      row('egg-disposition-sold',{date:shift(asOf,-3),batchId:layer,quantity:45,type:'sold',linkedSaleId:rid('egg-sale')}),
      row('egg-disposition-home',{date:shift(asOf,-3),batchId:layer,quantity:15,type:'home-use'}),
      row('egg-disposition-hatch',{date:shift(asOf,-3),batchId:layer,quantity:10,type:'set-for-hatching',linkedBatchId:hatched}),
      row('egg-disposition-broken',{date:shift(asOf,-3),batchId:layer,quantity:5,type:'broken-spoiled'})
    ],
    eggSales:[row('egg-sale',{date:shift(asOf,-3),batchId:layer,quantity:45,pricePerEgg:c.eggPrice,total:45*c.eggPrice,buyer:'Anita Stores',dispositionId:soldDisposition,enterpriseId:poultry})],
    birdSales:[row('bird-sale',{date:shift(asOf,-5),batchId:layer,count:5,saleType:'live',pricingBasis:'bird',unitPrice:550,total:2750,buyer:'Village buyer',enterpriseId:poultry}),row('bird-sale-dressed',{date:shift(asOf,-20),batchId:broiler,count:2,saleType:'dressed',totalWeightKg:4,pricingBasis:'kg',unitPrice:300,total:1200,buyer:'Hotel buyer',enterpriseId:poultry})],
    feedTypes:[
      row('feed-layer',{name:'Layer Mash',category:'complete',source:'purchased',unit:'kg',cpPercent:17,energyKcalKg:2650,calciumPercent:3.75,costPerUnit:32,minInclusionPercent:70,maxInclusionPercent:100,active:true}),
      row('feed-fodder',{name:'Maize Fodder',category:'greens',source:'home-grown',unit:'kg',cpPercent:9,energyKcalKg:2100,costPerUnit:4,minInclusionPercent:0,maxInclusionPercent:40,active:true}),
      row('feed-mineral',{name:'Mineral Mix',category:'mineral',source:'purchased',unit:'kg',calciumPercent:20,costPerUnit:80,minInclusionPercent:1,maxInclusionPercent:5,active:true}),
      row('feed-energy',{name:'Crushed Maize',category:'energy',source:'purchased',unit:'kg',cpPercent:9,energyKcalKg:3300,costPerUnit:26,minInclusionPercent:0,maxInclusionPercent:50,active:true}),
      row('feed-protein',{name:'Soybean Meal',category:'protein',source:'purchased',unit:'kg',cpPercent:44,energyKcalKg:2450,costPerUnit:48,minInclusionPercent:0,maxInclusionPercent:30,active:true}),
      row('feed-azolla',{name:'Azolla Slurry',category:'greens',source:'home-grown',unit:'litre',cpPercent:20,costPerUnit:3,minInclusionPercent:0,maxInclusionPercent:10,active:true})
    ],
    feedPurchases:[row('feed-purchase-layer',{date:shift(asOf,-35),feedTypeId:layerFeed,quantity:1000,totalCost:32000,supplier:'Kaveri Feeds',lotNumber:'KF-001',expiryDate:shift(asOf,120),allocations:[{enterpriseId:poultry,percent:100}],batchId:layer})],
    feedUnits:[row('feed-unit-fodder',{name:'Maize fodder plot',sourceType:'maize-plot',feedTypeId:fodderFeed,plotCycleId:rid('rotation-maize'),cropCycleId:maizeCycle,active:true}),row('feed-unit-azolla',{name:'Azolla pit',sourceType:'azolla-pit',feedTypeId:azollaFeed,active:true}),row('feed-unit-bsf',{name:'BSF demonstration bin',sourceType:'bsf-bin',feedTypeId:fodderFeed,active:true}),row('feed-unit-mulberry',{name:'Mulberry strip',sourceType:'mulberry-strip',feedTypeId:fodderFeed,active:true}),row('feed-unit-other',{name:'Other greens unit',sourceType:'other',feedTypeId:fodderFeed,active:true})],
    feedInputs:[row('feed-input',{unitId:fodderUnit,date:shift(asOf,-75),inputType:'seed-spawn',amount:1200,isCapital:false}),row('feed-input-setup',{unitId:fodderUnit,date:shift(asOf,-70),inputType:'setup-material',amount:900,isCapital:true}),row('feed-input-labour',{unitId:fodderUnit,date:shift(asOf,-60),inputType:'labour',amount:500,isCapital:false}),row('feed-input-water',{unitId:fodderUnit,date:shift(asOf,-30),inputType:'water-electricity',amount:600,isCapital:false}),row('feed-input-fertiliser',{unitId:fodderUnit,date:shift(asOf,-25),inputType:'fertiliser',amount:350,isCapital:false}),row('feed-input-other',{unitId:fodderUnit,date:shift(asOf,-20),inputType:'other',amount:150,isCapital:false})],
    feedHarvests:[row('feed-harvest-maize',{unitId:fodderUnit,date:shift(asOf,-7),quantity:500,unit:'kg',allocations:[{enterpriseId:poultry,percent:40},{enterpriseId:goats,percent:60}]}),row('feed-harvest-azolla',{unitId:azollaUnit,date:shift(asOf,-6),quantity:100,unit:'litre',allocations:[{enterpriseId:poultry,percent:50},{enterpriseId:goats,percent:50}]})],
    feedConsumption:[row('feed-consumption-layer',{date:shift(asOf,-4),feedTypeId:layerFeed,quantity:c.key==='stress-test'?980:300,batchId:layer,enterpriseId:poultry,feedPurchaseId:layerLot}),row('feed-consumption-fodder',{date:shift(asOf,-4),feedTypeId:fodderFeed,quantity:100,herdId:goatHerd,enterpriseId:goats}),row('feed-consumption-azolla',{date:shift(asOf,-3),feedTypeId:azollaFeed,quantity:20,herdId:goatHerd,enterpriseId:goats})],
    landPlots:[row('plot-commercial',{name:'East Field',areaAcres:2,notes:'Commercial vegetables',active:true}),row('plot-fodder',{name:'North Fodder',areaAcres:1.5,notes:'Irrigated fodder',active:true})],
    plotCycles:[row('rotation-tomato',{plotId:commercialPlot,seasonYear:'Kharif sample',cropOrUse:'Tomato',enterpriseId:tomato,startDate:shift(asOf,-100),endDate:shift(asOf,20)}),row('rotation-maize',{plotId:fodderPlot,seasonYear:'Kharif sample',cropOrUse:'Maize Fodder',enterpriseId:maize,startDate:shift(asOf,-90),endDate:shift(asOf,10)})],
    herds:[row('herd-goat',{name:'Goat Herd A',species:'goat',breed:'Osmanabadi',purpose:'milk',acquisitionDate:shift(asOf,-200),initialCount:20,acquisitionCost:90000,enterpriseId:goats,notes:'Milk and breeding herd',active:true}),row('herd-sheep',{name:'Sheep Herd A',species:'sheep',breed:'Bellary',purpose:'meat',acquisitionDate:shift(asOf,-180),initialCount:15,acquisitionCost:60000,enterpriseId:goats,active:true}),row('herd-breeding',{name:'Breeding Does',species:'goat',breed:'Sirohi',purpose:'breeding',acquisitionDate:shift(asOf,-160),initialCount:8,acquisitionCost:48000,enterpriseId:goats,active:true})],
    animals:[row('animal-goat-female',{herdId:goatHerd,tag:'G-001',species:'goat',sex:'female',breed:'Osmanabadi',birthDate:shift(asOf,-500),status:'active'}),row('animal-goat-sold',{herdId:goatHerd,tag:'G-002',species:'goat',sex:'male',breed:'Osmanabadi',birthDate:shift(asOf,-400),status:'sold'}),row('animal-sheep-died',{herdId:sheepHerd,tag:'S-001',species:'sheep',sex:'female',breed:'Bellary',birthDate:shift(asOf,-450),status:'died'})],
    breedingEvents:[row('breeding-event',{herdId:goatHerd,damId:goatFemale,date:shift(asOf,-8),numberBorn:2,numberSurvived:2,followUpDate:shift(asOf,-1),note:'Twin kids'})],
    herdAdditions:[row('herd-addition',{herdId:goatHerd,date:shift(asOf,-8),count:2,eventType:'birth',born:2,survived:2,note:'Linked birth outcome'}),row('herd-purchase',{herdId:sheepHerd,date:shift(asOf,-30),count:2,eventType:'purchase',cost:9000,note:'Purchased ewes'})],
    herdMortalities:[row('herd-mortality',{herdId:sheepHerd,animalId:sheepDied,date:shift(asOf,-6),countLost:1,cause:'injury',note:'Tagged mortality'}),...(['disease','predator','heat','unknown'] as const).map((cause,index)=>row(`herd-mortality-${cause}`,{herdId:sheepHerd,date:shift(asOf,-65+index),countLost:1,cause,note:`${cause} option example`}))],
    herdHealth:[row('herd-health',{herdId:goatHerd,date:shift(asOf,-100),type:'PPR',cost:600,nextDueDate:shift(asOf,-2),note:'Due reminder example'}),row('herd-health-enterotoxaemia',{herdId:goatHerd,date:shift(asOf,-80),type:'Enterotoxaemia',cost:400}),row('herd-health-fmd',{herdId:sheepHerd,date:shift(asOf,-70),type:'FMD',cost:450}),row('herd-health-deworming',{herdId:sheepHerd,date:shift(asOf,-30),type:'deworming',cost:250}),row('herd-health-custom',{herdId:sheepHerd,date:shift(asOf,-20),type:'Hoof care',cost:300,note:'Custom health type'})],
    weightLogs:[row('herd-weight',{herdId:goatHerd,date:shift(asOf,-15),weightKg:720,animalCount:20,weightBasis:'total'}),row('herd-weight-average',{herdId:sheepHerd,date:shift(asOf,-14),weightKg:32,animalCount:12,weightBasis:'average'})],
    poultryWeights:[row('poultry-weight-first',{batchId:layer,date:shift(asOf,-25),totalWeightKg:180,birdCount:100}),row('poultry-weight-latest',{batchId:layer,date:shift(asOf,-5),totalWeightKg:220,birdCount:100})],
    layingCountLogs:[row('laying-count',{batchId:layer,date:shift(asOf,-3),layingHenCount:80})],
    herdSales:[row('herd-live-sale',{herdId:goatHerd,animalId:goatSold,enterpriseId:goats,date:shift(asOf,-12),count:1,saleType:'live',quantity:1,unit:'head',unitPrice:8500,total:8500,buyer:'Ramesh'}),row('herd-meat-sale',{herdId:sheepHerd,enterpriseId:goats,date:shift(asOf,-11),count:1,saleType:'meat',quantity:30,unit:'kg',unitPrice:650,total:19500,buyer:'Meat shop'}),row('herd-milk-sale',{herdId:goatHerd,enterpriseId:goats,date:shift(asOf,-2),count:0,saleType:'milk',quantity:40,unit:'litre',unitPrice:c.milkPrice,total:40*c.milkPrice,buyer:'Local dairy'})],
    cropCycles:[row('crop-tomato',{plotId:commercialPlot,crop:'Tomato',enterpriseId:tomato,type:'commercial',sowingDate:shift(asOf,-100),expectedHarvest:shift(asOf,-10),completedDate:shift(asOf,-2),areaAcres:2,status:'complete'}),row('crop-maize',{plotId:fodderPlot,crop:'Maize Fodder',enterpriseId:maize,type:'feed',sowingDate:shift(asOf,-90),expectedHarvest:shift(asOf,5),areaAcres:1.5,status:'harvesting'}),row('crop-tomato-active',{plotId:commercialPlot,crop:'Tomato',enterpriseId:tomato,type:'commercial',sowingDate:shift(asOf,30),expectedHarvest:shift(asOf,120),areaAcres:1,status:'active'}),row('crop-tomato-planned',{plotId:commercialPlot,crop:'Tomato',enterpriseId:tomato,type:'commercial',sowingDate:shift(asOf,150),expectedHarvest:shift(asOf,240),areaAcres:1,status:'planned'})],
    cropInputs:[row('crop-input-land',{cycleId:tomatoCycle,date:shift(asOf,-95),inputType:'land-prep',amount:5000,isCapital:false}),row('crop-input-seed',{cycleId:tomatoCycle,date:shift(asOf,-90),inputType:'seed-sapling',amount:3000,isCapital:false}),row('crop-input-fertiliser',{cycleId:tomatoCycle,date:shift(asOf,-70),inputType:'fertiliser',amount:2200,isCapital:false}),row('crop-input-pesticide',{cycleId:tomatoCycle,date:shift(asOf,-60),inputType:'pesticide',amount:1400,isCapital:false}),row('crop-input-irrigation',{cycleId:maizeCycle,date:shift(asOf,-40),inputType:'irrigation',amount:1800,isCapital:false}),row('crop-input-labour',{cycleId:tomatoCycle,date:shift(asOf,-35),inputType:'labour',amount:2000,isCapital:false}),row('crop-input-other',{cycleId:tomatoCycle,date:shift(asOf,-25),inputType:'other',amount:450,isCapital:false})],
    cropHarvests:[row('crop-harvest-tomato',{cycleId:tomatoCycle,date:shift(asOf,-15),quantity:1000,unit:'kg'}),row('crop-harvest-bunch',{cycleId:tomatoCycle,date:shift(asOf,-14),quantity:100,unit:'bunch'}),row('crop-harvest-piece',{cycleId:tomatoCycle,date:shift(asOf,-13),quantity:200,unit:'piece'}),row('crop-harvest-maize',{cycleId:maizeCycle,date:shift(asOf,-7),quantity:500,unit:'kg',feedHarvestId:feedHarvest})],
    cropSales:[row('crop-sale',{cycleId:tomatoCycle,enterpriseId:tomato,date:shift(asOf,-10),quantity:600,unit:'kg',unitPrice:c.cropPrice,total:600*c.cropPrice,buyer:'City market'}),row('crop-sale-bunch',{cycleId:tomatoCycle,enterpriseId:tomato,date:shift(asOf,-9),quantity:40,unit:'bunch',unitPrice:30,total:1200,buyer:'Local florist'}),row('crop-sale-piece',{cycleId:tomatoCycle,enterpriseId:tomato,date:shift(asOf,-8),quantity:50,unit:'piece',unitPrice:5,total:250,buyer:'Farm gate buyer'})],
    weatherLogs:[row('weather-history',{date:shift(asOf,-1),tempMin:21,tempMax:31,rainfallMm:4,humidityPercent:70,notes:'Manual observation',source:'manual',forecast:false}),row('weather-forecast',{date:shift(asOf,1),tempMin:20,tempMax:30,rainfallMm:8,humidityPercent:75,source:'open-meteo',forecast:true})],
    marketPrices:[row('market-manual',{date:shift(asOf,-2),commodity:'Tomato',variety:'Local',market:'Yeshwanthpur',minPrice:2200,maxPrice:3000,modalPrice:2700,arrivalQuantity:120,unit:'quintal',source:'manual'}),row('market-online',{date:shift(asOf,-1),commodity:'Maize Fodder',variety:'Green',market:'K R Market',minPrice:300,maxPrice:500,modalPrice:400,arrivalQuantity:80,unit:'quintal',source:'data.gov.in'})],
    settings:[
      {key:'poultryEnterpriseId',value:poultry},{key:'backupCadenceDays',value:'7'},{key:'capitalUsefulLifeMonths',value:'60'},
      {key:'targetMeatAgeDays',value:'180'},{key:'mortalityDeathThreshold',value:'3'},{key:'mortalityPercentThreshold',value:'2'},
      {key:'feedReorderDays',value:'7'},{key:'smallRuminantFollowUpDays',value:'7'},{key:`sharedSplit:${poultry}`,value:String(c.sharedPoultry)},{key:`sharedSplit:${goats}`,value:String(sharedGoats)}
    ]
  } as unknown as SampleFarmData;
  return data;
}

export function sampleTables(data: SampleFarmData): Record<string, unknown[]> {
  return Object.fromEntries(TABLE_NAMES.map(name => [name, name === 'settings' ? data.settings : (data[name as keyof SampleFarmData] as unknown[] || [])]));
}

export function sampleBackupPayload(data: SampleFarmData) {
  return { format:'mixed-farm-manager-backup', version:11, exportedAt:new Date().toISOString(), tables:sampleTables(data) };
}

export function downloadSampleBackup(key: SampleKey) {
  const data=createSampleFarm(key), payload=sampleBackupPayload(data), url=URL.createObjectURL(new Blob([JSON.stringify(payload)],{type:'application/octet-stream'}));
  const a=document.createElement('a');a.href=url;a.download=`farm-sample-${key}.farmbackup`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export async function loadSampleFarm(key: SampleKey) {
  const tables=sampleTables(createSampleFarm(key));
  await db.transaction('rw',TABLE_NAMES.map(name=>db.table(name)),async()=>{for(const name of TABLE_NAMES){await db.table(name).clear();await db.table(name).bulkAdd(tables[name])}});
}
