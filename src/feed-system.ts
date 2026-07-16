import type { Batch, BatchAddition, BirdSale, FeedConsumption, FeedPurchase, FeedType, Herd, MortalityEvent } from './types';
import { localDate } from './types';

export type FeedInventoryData={feedPurchases?:FeedPurchase[];feedConsumption?:FeedConsumption[]};
export type FeedLotBalance={purchase:FeedPurchase;remaining:number;expired:boolean;expiringSoon:boolean};

export function validateFeedTypeValues(values:{cpPercent?:number;energyKcalKg?:number;calciumPercent?:number;costPerUnit?:number;minInclusionPercent?:number;maxInclusionPercent?:number}){
  for(const [name,value] of Object.entries(values))if(value!=null&&(!Number.isFinite(value)||value<0))throw Error(`${name} cannot be negative.`);
  if((values.cpPercent??0)>100||(values.calciumPercent??0)>100||(values.minInclusionPercent??0)>100||(values.maxInclusionPercent??0)>100)throw Error('Protein, calcium and inclusion percentages cannot exceed 100%.');
  if((values.minInclusionPercent??0)>(values.maxInclusionPercent??100))throw Error('Minimum inclusion cannot exceed maximum inclusion.');
}

const day=(value:string)=>new Date(`${value}T00:00:00Z`).getTime();
export function feedInventoryLots(feedTypeId:string,data:FeedInventoryData,asOf=localDate()):FeedLotBalance[]{
  const purchases=(data.feedPurchases||[]).filter(x=>x.feedTypeId===feedTypeId&&x.date<=asOf).slice().sort((a,b)=>(a.expiryDate||'9999-12-31').localeCompare(b.expiryDate||'9999-12-31')||a.date.localeCompare(b.date));
  const remaining=new Map(purchases.map(x=>[x.id,x.quantity]));
  const issues=(data.feedConsumption||[]).filter(x=>x.feedTypeId===feedTypeId&&x.date<=asOf).slice().sort((a,b)=>a.date.localeCompare(b.date)||(a.createdAt||'').localeCompare(b.createdAt||''));
  for(const issue of issues){if(issue.feedPurchaseId){const id=issue.feedPurchaseId;remaining.set(id,Math.max(0,(remaining.get(id)||0)-issue.quantity));continue}let quantity=issue.quantity;for(const purchase of purchases.filter(x=>x.date<=issue.date)){const available=remaining.get(purchase.id)||0,take=Math.min(quantity,available);remaining.set(purchase.id,available-take);quantity-=take;if(quantity<=.000001)break}}
  const soon=day(asOf)+30*86400000;
  return purchases.map(purchase=>({purchase,remaining:remaining.get(purchase.id)||0,expired:!!purchase.expiryDate&&purchase.expiryDate<asOf,expiringSoon:!!purchase.expiryDate&&day(purchase.expiryDate)>=day(asOf)&&day(purchase.expiryDate)<=soon}));
}

export function validateFeedIssueTargets(date:string,targets:Array<Pick<Batch,'acquisitionDate'>|Pick<Herd,'acquisitionDate'>>){
  if(targets.some(target=>date<target.acquisitionDate))throw Error('Feed cannot be issued before a selected batch or herd was acquired.');
}

export type FeedDemandData=FeedInventoryData&{batches?:Batch[];additions?:BatchAddition[];mortalities?:MortalityEvent[];birdSales?:BirdSale[];herds?:Herd[];settings?:{key:string;value:string}[]};
export function recentDailyFeedUse(feedTypeId:string,data:FeedDemandData,asOf=localDate(),days=14){const from=new Date(day(asOf)-(days-1)*86400000).toISOString().slice(0,10);return (data.feedConsumption||[]).filter(x=>x.feedTypeId===feedTypeId&&x.date>=from&&x.date<=asOf).reduce((v,x)=>v+x.quantity,0)/days}
export function stageDailyFeedNeed(data:FeedDemandData,asOf=localDate()){const setting=(key:string,fallback:number)=>Number(data.settings?.find(x=>x.key===key)?.value||fallback),count=(batch:Batch)=>batch.acquisitionDate>asOf?0:Math.max(0,batch.initialCount+(data.additions||[]).filter(x=>x.batchId===batch.id&&x.date<=asOf).reduce((v,x)=>v+x.count,0)-(data.mortalities||[]).filter(x=>x.batchId===batch.id&&x.date<=asOf).reduce((v,x)=>v+x.countLost,0)-(data.birdSales||[]).filter(x=>x.batchId===batch.id&&x.date<=asOf).reduce((v,x)=>v+x.count,0));const growers=(data.batches||[]).filter(x=>x.active!==false&&x.stage!=='adult').reduce((v,x)=>v+count(x),0),adults=(data.batches||[]).filter(x=>x.active!==false&&x.stage==='adult').reduce((v,x)=>v+count(x),0);return (growers*setting('growerFeedGrams',70)+adults*setting('layerFeedGrams',110))/1000}
export function feedCostDrift(feedTypeId:string,data:FeedInventoryData,asOf=localDate()){const end=day(asOf),recentStart=new Date(end-29*86400000).toISOString().slice(0,10),previousStart=new Date(end-59*86400000).toISOString().slice(0,10),rows=(data.feedPurchases||[]).filter(x=>x.feedTypeId===feedTypeId);const avg=(from:string,to:string)=>{const set=rows.filter(x=>x.date>=from&&x.date<=to),quantity=set.reduce((v,x)=>v+x.quantity,0);return quantity?set.reduce((v,x)=>v+x.totalCost,0)/quantity:0};const current=avg(recentStart,asOf),previous=avg(previousStart,new Date(end-30*86400000).toISOString().slice(0,10));return {current,previous,percent:current&&previous?(current-previous)/previous*100:0}}

export type RationIngredient=Pick<FeedType,'id'|'name'|'cpPercent'|'energyKcalKg'|'calciumPercent'|'costPerUnit'|'minInclusionPercent'|'maxInclusionPercent'>;
export type RationTarget={proteinMin:number;energyMin:number;calciumMin:number;calciumMax:number};
export type RationResult={percentages:Record<string,number>;costPerKg:number;protein:number;energy:number;calcium:number};
type Constraint={a:number[];b:number};
const solve=(matrix:number[][],rhs:number[])=>{const a=matrix.map((row,i)=>[...row,rhs[i]]),n=a.length;for(let c=0;c<n;c++){let pivot=c;for(let r=c+1;r<n;r++)if(Math.abs(a[r][c])>Math.abs(a[pivot][c]))pivot=r;if(Math.abs(a[pivot][c])<1e-9)return null;[a[c],a[pivot]]=[a[pivot],a[c]];const d=a[c][c];for(let j=c;j<=n;j++)a[c][j]/=d;for(let r=0;r<n;r++)if(r!==c){const f=a[r][c];for(let j=c;j<=n;j++)a[r][j]-=f*a[c][j]}}return a.map(row=>row[n])};
const combinations=(size:number,count:number)=>{const out:number[][]=[];const visit=(start:number,row:number[])=>{if(row.length===count){out.push(row);return}for(let i=start;i<size;i++)visit(i+1,[...row,i])};visit(0,[]);return out};
export function optimizeFeedRation(ingredients:RationIngredient[],target:RationTarget):RationResult|null{
  const feeds=ingredients.filter(x=>x.costPerUnit!=null&&x.cpPercent!=null&&x.energyKcalKg!=null&&x.calciumPercent!=null),n=feeds.length;if(!n||target.calciumMax<target.calciumMin)return null;
  const constraints:Constraint[]=[];feeds.forEach((x,i)=>{const low=Array(n).fill(0);low[i]=-1;constraints.push({a:low,b:-(x.minInclusionPercent||0)});const high=Array(n).fill(0);high[i]=1;constraints.push({a:high,b:x.maxInclusionPercent??100})});
  constraints.push({a:feeds.map(x=>-x.cpPercent!),b:-target.proteinMin*100},{a:feeds.map(x=>-x.energyKcalKg!),b:-target.energyMin*100},{a:feeds.map(x=>-x.calciumPercent!),b:-target.calciumMin*100},{a:feeds.map(x=>x.calciumPercent!),b:target.calciumMax*100});
  let best:RationResult|null=null;for(const selected of combinations(constraints.length,n-1)){const rows=[Array(n).fill(1),...selected.map(i=>constraints[i].a)],rhs=[100,...selected.map(i=>constraints[i].b)],values=solve(rows,rhs);if(!values||constraints.some(c=>c.a.reduce((v,a,i)=>v+a*values[i],0)>c.b+1e-6))continue;const protein=feeds.reduce((v,x,i)=>v+values[i]*x.cpPercent!/100,0),energy=feeds.reduce((v,x,i)=>v+values[i]*x.energyKcalKg!/100,0),calcium=feeds.reduce((v,x,i)=>v+values[i]*x.calciumPercent!/100,0),costPerKg=feeds.reduce((v,x,i)=>v+values[i]*x.costPerUnit!/100,0);if(!best||costPerKg<best.costPerKg)best={percentages:Object.fromEntries(feeds.map((x,i)=>[x.id,Math.max(0,values[i])])),costPerKg,protein,energy,calcium}}
  return best;
}
