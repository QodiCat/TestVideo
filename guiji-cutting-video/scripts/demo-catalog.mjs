// Render a short local demo covering all three geometry families.
import {spawnSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const folder=resolve(root,process.argv[2] ?? 'output/catalog-demo');await mkdir(folder,{recursive:true});
const run=(exe,args)=>{const p=spawnSync(exe,args,{cwd:root,stdio:'inherit',windowsHide:true});if(p.error)throw p.error;if(p.status!==0)throw new Error(exe+' exited '+p.status);};
for(const object of ['watermelon','gouda','rainbow_cake']){
  const config=join(folder,object+'.json');
  await writeFile(config,JSON.stringify({object,cuts:[10,50,100],seconds:[5.6,3.2,3.2],width:540,fps:24,seed:1511},null,2));
  run(process.execPath,['scripts/render.mjs',config,join(folder,object+'.mp4')]);
}
await writeFile(join(folder,'concat.txt'),['watermelon','gouda','rainbow_cake'].map(id=>`file '${id}.mp4'`).join('\n')+'\n');
run('ffmpeg',['-hide_banner','-loglevel','error','-n','-f','concat','-safe','0','-i',join(folder,'concat.txt'),'-c','copy','-movflags','+faststart',join(folder,'catalog-demo.mp4')]);
console.log(join(folder,'catalog-demo.mp4'));
