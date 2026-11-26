import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { catalog, objectIds } from './catalog.mjs';

if (!process.argv.includes('--write')) {
  console.table(objectIds.map(id=>({id,名称:catalog[id].name,形状:catalog[id].shape})));
} else {
  const root=new URL('../',import.meta.url);
  const names={fruit:'水果',vegetable:'瓜菜',cheese:'奶酪',sweet:'甜点与食品',bread:'面包与蛋糕',care:'日用品'};
  const lines=['# 100 种可切割物品','',
    '包含原有 3 种，新增 97 种。采用椭圆体、圆角方块和圆柱三类简化模型；每种有独立的颜色、尺寸或纹理参数。品种及口味变体也分别计入预设数量。', '',
    '这是程序化 3D 动画。果核、种子、奶酪孔洞等是切面纹理；不模拟硬核阻刀、流心、拉丝、柔体或真实物理断裂。胡萝卜、黄瓜、莲藕等以规则段形建模。', '',
    '配置中的 `object` 使用下表 ID。`label` 只修改字幕，不改变物品。','',
    '```powershell','node scripts/objects.mjs','node scripts/render.mjs examples/objects/watermelon.json output/watermelon.mp4','```','',
    '自动发布的 `video.objects` 也接受全部 ID。此处只扩展支持范围，不改动已有排期和发布账号。', '',
    '| 序号 | 物品 | ID | 分类 | 形状 | 切面纹理 |','|---|---|---|---|---|---|'];
  await mkdir(new URL('examples/objects/',root),{recursive:true});
  for(const [i,id] of objectIds.entries()) {
    const s=catalog[id];
    lines.push(`| ${i+1} | ${s.name} | \`${id}\` | ${names[s.family]} | ${{ellipsoid:'椭圆体',box:'圆角方块',cylinder:'圆柱'}[s.shape]} | ${s.section} |`);
    await writeFile(new URL(`examples/objects/${id}.json`,root),JSON.stringify({object:id,cuts:[10,50,100],seconds:[5.6,6.4,7.6],width:720,fps:30,seed:1511},null,2)+'\n');
  }
  await writeFile(new URL('OBJECTS.md',root),lines.join('\n')+'\n');
  await writeFile(new URL('examples/all-objects.json',root),JSON.stringify({objects:objectIds},null,2)+'\n');
  console.log(`Wrote ${objectIds.length} examples and ${fileURLToPath(new URL('OBJECTS.md',root))}`);
}
