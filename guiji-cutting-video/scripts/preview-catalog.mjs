import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {loadDependencies,findBrowser} from './render.mjs';

const folder=resolve(process.argv[2] ?? 'output/catalog-verification');
const report=JSON.parse(await readFile(join(folder,'report.json'),'utf8'));
const {chromium}=loadDependencies();
const browser=await chromium.launch({executablePath:findBrowser(),headless:true});
try {
  const page=await browser.newPage();
  for(let batch=0;batch<5;batch++){
    const items=[];
    for(let i=batch*20;i<(batch+1)*20;i++){
      const {id}=report.results[i];
      const prefix=String(i+1).padStart(3,'0')+'-'+id;
      const whole=(await readFile(join(folder,prefix+'-whole.jpg'))).toString('base64');
      const cut=(await readFile(join(folder,prefix+'-cut.jpg'))).toString('base64');
      items.push({id,index:i+1,whole,cut});
    }
    const png=await page.evaluate(async items=>{
      const canvas=document.createElement('canvas');canvas.width=1500;canvas.height=1240;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#101c21';ctx.fillRect(0,0,canvas.width,canvas.height);
      for(const [n,item] of items.entries()){
        const x=n%5*300,y=Math.floor(n/5)*310;
        ctx.fillStyle='#eeeeee';ctx.font='16px Arial';ctx.fillText(item.index+'. '+item.id,x+8,y+22);
        for(const [offset,key] of [[0,'whole'],[150,'cut']]){
          const image=new Image();image.src='data:image/jpeg;base64,'+item[key];await image.decode();
          ctx.drawImage(image,x+offset,y+34,150,267);
        }
      }
      return canvas.toDataURL('image/png').split(',')[1];
    },items);
    const target=join(folder,`preview-${batch+1}.png`);
    await writeFile(target,Buffer.from(png,'base64'));console.log(target);
  }
}finally{await browser.close();}
