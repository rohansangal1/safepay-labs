const fs=require('node:fs'); const path=require('node:path');
const root=path.join(__dirname,'..');
const rows=[];
for(let family=1;family<=8;family++)for(const architecture of ['hosted','embedded','custom'])for(const provider of ['stripe','square'])for(let profile=0;profile<16;profile++)for(let seed=0;seed<4;seed++){
 rows.push({id:`F${family}-${architecture}-${provider}-M${profile}-S${seed}`,kind:'synthetic-manifest-only',family:`F${family}`,architecture,provider,profile,seed,split:family<=5?'train':family===6?'validation':'test',execution_status:'not-run',authorization:'owned-lab-only'});
}
fs.mkdirSync(path.join(root,'data'),{recursive:true});fs.writeFileSync(path.join(root,'data','manifest.json'),JSON.stringify(rows,null,2)+'\n');
console.log(JSON.stringify({records:rows.length,independent_template_families:8,status:'Planned configurations, not websites or completed experiments'}));
