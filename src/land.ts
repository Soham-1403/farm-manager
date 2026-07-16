export const landToAcres=(acres=0,guntas=0,cents=0)=>acres+guntas/40+cents/100;
export const landAreaLabel=(acres:number)=>`${acres.toFixed(3)} acres · ${(acres*40).toFixed(2)} guntas · ${(acres*100).toFixed(1)} cents`;
