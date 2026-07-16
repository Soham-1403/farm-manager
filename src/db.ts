import Dexie, { type EntityTable } from 'dexie';
import type { Animal, AppSetting, Batch, BatchAddition, BirdSale, BreedingEvent, CropCycle, CropHarvest, CropOperationInput, CropSale, EggDisposition, EggProduction, EggSale, Enterprise, Expense, FeedConsumption, FeedHarvest, FeedProductionInput, FeedProductionUnit, FeedPurchase, FeedType, HealthRecord, Herd, HerdAddition, HerdHealth, HerdMortality, HerdSale, LabourLog, LandPlot, LayingCountLog, MarketPrice, MortalityEvent, OtherIncome, PlotCycle, PoultryWeightLog, WeatherLog, WeightLog, Worker } from './types';
import { stamp } from './types';
import { normalizeLegacyFeedLinks } from './migrations';

export class FarmDB extends Dexie {
  enterprises!: EntityTable<Enterprise, 'id'>;
  expenses!: EntityTable<Expense, 'id'>;
  otherIncome!: EntityTable<OtherIncome, 'id'>;
  workers!: EntityTable<Worker, 'id'>;
  labourLogs!: EntityTable<LabourLog, 'id'>;
  batches!: EntityTable<Batch, 'id'>;
  additions!: EntityTable<BatchAddition, 'id'>;
  mortalities!: EntityTable<MortalityEvent, 'id'>;
  healthRecords!: EntityTable<HealthRecord, 'id'>;
  eggProduction!: EntityTable<EggProduction, 'id'>;
  eggDispositions!: EntityTable<EggDisposition, 'id'>;
  eggSales!: EntityTable<EggSale, 'id'>;
  birdSales!: EntityTable<BirdSale, 'id'>;
  feedTypes!: EntityTable<FeedType, 'id'>;
  feedPurchases!: EntityTable<FeedPurchase, 'id'>;
  feedUnits!: EntityTable<FeedProductionUnit, 'id'>;
  feedInputs!: EntityTable<FeedProductionInput, 'id'>;
  feedHarvests!: EntityTable<FeedHarvest, 'id'>;
  feedConsumption!: EntityTable<FeedConsumption, 'id'>;
  landPlots!: EntityTable<LandPlot, 'id'>;
  plotCycles!: EntityTable<PlotCycle, 'id'>;
  herds!: EntityTable<Herd, 'id'>;
  animals!: EntityTable<Animal, 'id'>;
  breedingEvents!: EntityTable<BreedingEvent, 'id'>;
  herdAdditions!: EntityTable<HerdAddition, 'id'>;
  herdMortalities!: EntityTable<HerdMortality, 'id'>;
  herdHealth!: EntityTable<HerdHealth, 'id'>;
  weightLogs!: EntityTable<WeightLog, 'id'>;
  poultryWeights!: EntityTable<PoultryWeightLog, 'id'>;
  layingCountLogs!: EntityTable<LayingCountLog, 'id'>;
  herdSales!: EntityTable<HerdSale, 'id'>;
  cropCycles!: EntityTable<CropCycle, 'id'>;
  cropInputs!: EntityTable<CropOperationInput, 'id'>;
  cropHarvests!: EntityTable<CropHarvest, 'id'>;
  cropSales!: EntityTable<CropSale, 'id'>;
  weatherLogs!: EntityTable<WeatherLog, 'id'>;
  marketPrices!: EntityTable<MarketPrice, 'id'>;
  settings!: EntityTable<AppSetting, 'key'>;

  constructor() {
    super('mixed-farm-manager');
    this.version(1).stores({
      enterprises: 'id, name, type, active, deletedAt', expenses: 'id, date, enterpriseId, batchId, isCapital, deletedAt',
      otherIncome: 'id, date, enterpriseId, deletedAt', workers: 'id, name, active, deletedAt', labourLogs: 'id, date, workerId, batchId, deletedAt',
      batches: 'id, name, enterpriseId, acquisitionDate, source, deletedAt', additions: 'id, batchId, date, deletedAt', mortalities: 'id, batchId, date, deletedAt',
      healthRecords: 'id, batchId, date, nextDueDate, deletedAt', eggProduction: 'id, batchId, date, deletedAt', eggDispositions: 'id, batchId, date, type, deletedAt',
      eggSales: 'id, batchId, date, enterpriseId, deletedAt', birdSales: 'id, batchId, date, enterpriseId, deletedAt', settings: 'key'
    });
    this.version(2).stores({
      enterprises: 'id, name, type, active, deletedAt', expenses: 'id, date, enterpriseId, batchId, isCapital, deletedAt', otherIncome: 'id, date, enterpriseId, deletedAt', workers: 'id, name, active, deletedAt', labourLogs: 'id, date, workerId, batchId, deletedAt', batches: 'id, name, enterpriseId, acquisitionDate, source, deletedAt', additions: 'id, batchId, date, deletedAt', mortalities: 'id, batchId, date, deletedAt', healthRecords: 'id, batchId, date, nextDueDate, deletedAt', eggProduction: 'id, batchId, date, deletedAt', eggDispositions: 'id, batchId, date, type, deletedAt', eggSales: 'id, batchId, date, enterpriseId, deletedAt', birdSales: 'id, batchId, date, enterpriseId, deletedAt', settings: 'key',
      feedTypes: 'id, name, source, active, deletedAt', feedPurchases: 'id, date, feedTypeId, batchId, herdId, deletedAt', feedUnits: 'id, name, plotCycleId, active, deletedAt', feedInputs: 'id, unitId, date, isCapital, deletedAt', feedHarvests: 'id, unitId, date, deletedAt', feedConsumption: 'id, date, feedTypeId, batchId, herdId, enterpriseId, deletedAt', landPlots: 'id, name, active, deletedAt', plotCycles: 'id, plotId, enterpriseId, startDate, deletedAt', herds: 'id, species, enterpriseId, acquisitionDate, deletedAt', herdAdditions: 'id, herdId, date, deletedAt', herdMortalities: 'id, herdId, date, deletedAt', herdHealth: 'id, herdId, date, nextDueDate, deletedAt', weightLogs: 'id, herdId, date, deletedAt', herdSales: 'id, herdId, enterpriseId, date, deletedAt', cropCycles: 'id, plotId, enterpriseId, sowingDate, status, deletedAt', cropInputs: 'id, cycleId, date, isCapital, deletedAt', cropHarvests: 'id, cycleId, date, deletedAt', cropSales: 'id, cycleId, enterpriseId, date, deletedAt', weatherLogs: 'id, &date, source, forecast, deletedAt', marketPrices: 'id, date, commodity, market, deletedAt'
    });
    this.version(3).stores({
      poultryWeights: 'id, batchId, date, deletedAt'
    }).upgrade(async tx => {
      const defaults = [{key:'layerFeedGrams',value:'110'},{key:'growerFeedGrams',value:'70'},{key:'layerCP',value:'17'},{key:'layerEnergy',value:'2650'},{key:'layerCalcium',value:'3.75'},{key:'growerCP',value:'16'},{key:'growerEnergy',value:'2600'},{key:'mortalityDeathThreshold',value:'3'},{key:'mortalityPercentThreshold',value:'2'},{key:'feedReorderDays',value:'7'},{key:'vaccinationSchedule',value:'Confirm the farm schedule with a veterinarian.'}];
      for (const setting of defaults) if (!await tx.table('settings').get(setting.key)) await tx.table('settings').put(setting);
    });
    this.version(4).stores({ layingCountLogs: 'id, batchId, date, deletedAt' }).upgrade(async tx => {
      const defaults=[{key:'vaccineRanikhetDays',value:'90'},{key:'vaccineGumboroDays',value:'28'},{key:'vaccineFowlPoxDays',value:'365'},{key:'dewormingIntervalDays',value:'90'}];
      for(const setting of defaults)if(!await tx.table('settings').get(setting.key))await tx.table('settings').put(setting);
    });
    this.version(5).stores({feedPurchases:'id, date, feedTypeId, batchId, herdId, expiryDate, lotNumber, deletedAt',feedConsumption:'id, date, feedTypeId, batchId, herdId, enterpriseId, feedPurchaseId, issueGroupId, deletedAt'});
    this.version(6).stores({animals:'id, &tag, herdId, species, sex, status, birthDate, deletedAt',breedingEvents:'id, herdId, damId, date, followUpDate, deletedAt'}).upgrade(async tx=>{if(!await tx.table('settings').get('smallRuminantFollowUpDays'))await tx.table('settings').put({key:'smallRuminantFollowUpDays',value:'7'})});
    this.version(7).stores({feedUnits:'id, name, plotCycleId, cropCycleId, feedTypeId, active, deletedAt',cropHarvests:'id, cycleId, date, feedHarvestId, deletedAt'});
    this.version(8).stores({batches:'id, name, enterpriseId, acquisitionDate, source, active, closedDate, deletedAt'}).upgrade(async tx=>{await tx.table('batches').toCollection().modify(batch=>{if(batch.deletedAt){batch.closedDate=String(batch.deletedAt).slice(0,10);delete batch.deletedAt;batch.active=false;batch.updatedAt=new Date().toISOString()}else if(batch.active==null)batch.active=true})});
    this.version(9).stores({feedUnits:'id, name, plotCycleId, cropCycleId, feedTypeId, active, deletedAt',batches:'id, name, enterpriseId, acquisitionDate, source, active, closedDate, deletedAt'}).upgrade(async tx=>{
      const tables={feedUnits:await tx.table('feedUnits').toArray(),feedTypes:await tx.table('feedTypes').toArray(),feedHarvests:await tx.table('feedHarvests').toArray()};
      normalizeLegacyFeedLinks(tables);
      await tx.table('feedTypes').bulkPut(tables.feedTypes);
      await tx.table('feedUnits').bulkPut(tables.feedUnits);
      await tx.table('batches').toCollection().modify(batch=>{if(batch.active===false&&!batch.closedDate)batch.closedDate=String(batch.updatedAt||new Date().toISOString()).slice(0,10)});
    });
    this.version(10).stores({cropCycles:'id, plotId, enterpriseId, sowingDate, expectedHarvest, completedDate, status, deletedAt'}).upgrade(async tx=>{await tx.table('cropCycles').toCollection().modify(cycle=>{if(cycle.status==='complete'&&!cycle.completedDate)cycle.completedDate=String(cycle.expectedHarvest||cycle.updatedAt||cycle.sowingDate).slice(0,10)})});
    this.version(11).stores({herds:'id, species, enterpriseId, acquisitionDate, active, closedDate, deletedAt'}).upgrade(async tx=>{await tx.table('herds').toCollection().modify(herd=>{if(herd.deletedAt){herd.closedDate=String(herd.deletedAt).slice(0,10);delete herd.deletedAt;herd.active=false;herd.updatedAt=new Date().toISOString()}else if(herd.active==null)herd.active=true;if(herd.active===false&&!herd.closedDate)herd.closedDate=String(herd.updatedAt||new Date().toISOString()).slice(0,10)})});
    this.on('populate', async () => {
      const poultry = stamp({ name: 'Poultry', type: 'livestock' as const, active: true });
      await this.enterprises.add(poultry);
      await this.settings.bulkPut([
        { key: 'poultryEnterpriseId', value: poultry.id }, { key: 'backupCadenceDays', value: '7' },
        { key: 'naatiLayStartDays', value: '165' }, { key: 'improvedLayStartDays', value: '150' },
        { key: 'targetMeatAgeDays', value: '180' }, { key: 'capitalUsefulLifeMonths', value: '60' },
        { key: 'layerFeedGrams', value: '110' }, { key: 'growerFeedGrams', value: '70' }, { key: 'layerCP', value: '17' }, { key: 'layerEnergy', value: '2650' }, { key: 'layerCalcium', value: '3.75' }, { key: 'growerCP', value: '16' }, { key: 'growerEnergy', value: '2600' }, { key: 'mortalityDeathThreshold', value: '3' }, { key: 'mortalityPercentThreshold', value: '2' }, { key: 'feedReorderDays', value: '7' }, { key: 'vaccinationSchedule', value: 'Confirm the farm schedule with a veterinarian.' }
        ,{ key: 'vaccineRanikhetDays', value: '90' }, { key: 'vaccineGumboroDays', value: '28' }, { key: 'vaccineFowlPoxDays', value: '365' }, { key: 'dewormingIntervalDays', value: '90' }, {key:'smallRuminantFollowUpDays',value:'7'}
      ]);
    });
  }
}

export const db = new FarmDB();
export const active = <T extends { deletedAt?: string }>(rows: T[]) => rows.filter(row => !row.deletedAt);
export const TABLE_NAMES = ['enterprises','expenses','otherIncome','workers','labourLogs','batches','additions','mortalities','healthRecords','eggProduction','eggDispositions','eggSales','birdSales','feedTypes','feedPurchases','feedUnits','feedInputs','feedHarvests','feedConsumption','landPlots','plotCycles','herds','animals','breedingEvents','herdAdditions','herdMortalities','herdHealth','weightLogs','poultryWeights','layingCountLogs','herdSales','cropCycles','cropInputs','cropHarvests','cropSales','weatherLogs','marketPrices','settings'] as const;
