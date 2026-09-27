(function(root){
'use strict';
function score(controls, results){
 const ids=new Set(controls.map(c=>c.id));
 if(ids.size!==controls.length || !controls.length) throw new Error('Invalid control catalog');
 for(const key of Object.keys(results)) if(!ids.has(key)) throw new Error('Unknown control: '+key);
 let total=0,pass=0,fail=0,unknown=0; const criticalFailures=[],criticalUnknown=[];
 for(const c of controls){
  if(!Number.isFinite(c.weight)||c.weight<=0) throw new Error('Weights must be positive');
  const r=results[c.id]||{status:'unknown'};
  if(!['pass','fail','unknown','na'].includes(r.status)) throw new Error('Invalid status');
  if(r.status==='na'){if(!r.rationale||!r.reviewed) throw new Error('N/A requires reviewed rationale');continue;}
  total+=c.weight;
  if(r.status==='pass'||r.status==='fail'){
   if(!r.evidence) throw new Error('Assessed controls require evidence');
   if(r.status==='pass')pass+=c.weight;else fail+=c.weight;
  }else unknown+=c.weight;
  if(c.critical&&r.status==='fail')criticalFailures.push(c.id);
  if(c.critical&&r.status==='unknown')criticalUnknown.push(c.id);
 }
 if(!total)return {lower:null,upper:null,observed:null,coverage:0,gate:'not-applicable',criticalFailures,criticalUnknown};
 const coverage=100*(pass+fail)/total;
 return {lower:100*pass/total,upper:100*(pass+unknown)/total,observed:pass+fail?100*pass/(pass+fail):null,coverage,
 gate:criticalFailures.length?'critical-failure':criticalUnknown.length||coverage<80?'insufficient-evidence':'assessed',criticalFailures,criticalUnknown};
}
if(typeof module!=='undefined')module.exports={score};else root.PIL={score};
})(globalThis);
