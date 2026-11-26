const $=selector=>document.querySelector(selector);
const $$=selector=>[...document.querySelectorAll(selector)];
const token=$('meta[name="panel-token"]').content;
const families={all:'全部物品',fruit:'水果',vegetable:'瓜菜',cheese:'奶酪',bread:'面包蛋糕',sweet:'甜点食品',care:'日用品'};
const labels={queued:'待生成',ready:'待发布',published:'已发布',needs_review:'待处理',skipped:'已过期',cancelled:'已取消',gui_uncertain:'结果待核对',gui_publishing:'正在分享',uploading:'上传中',processing:'转码中',publishing:'发布中',uncertain:'结果待核对'};
const strategies={cycle_all:'全部 100 种按顺序循环',cycle_selected:'所选物品按顺序循环',random:'从所选物品随机选择'};
$('#frequency').innerHTML=Array.from({length:24},(_,i)=>`<option value="${i+1}">${i+1} 次 / 天</option>`).join('');
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state,dirty=false,selected=new Set(),category='all',expanded=false,toastTimer,refreshing=false,queuePage=0;
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,5500);}
async function api(path,body){const response=await fetch('/api/'+path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Panel-Token':token},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw new Error(data.error??'操作失败');return data;}
function markDirty(){dirty=true;$('#save-state').textContent='有尚未保存的修改';$('#save-state').classList.add('dirty');}
const strategy=()=>$('input[name=strategy]:checked')?.value??'random';
function times(){return $$('#time-slots input').map(input=>input.value);}
function drawTimes(values){$('#time-slots').innerHTML=values.map((time,i)=>`<label class="time-slot"><span>${String(i+1).padStart(2,'0')}</span><input type="time" aria-label="第 ${i+1} 次发布时间" value="${esc(time)}" required></label>`).join('');}
function distribute(count){return Array.from({length:count},(_,i)=>{const minutes=count===1?1200:480+Math.round(i*840/(count-1));return String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');});}
function setSelect(id,value,label){const el=$(id);if(![...el.options].some(o=>o.value===String(value))){const opt=new Option(label??String(value),String(value));el.add(opt);}el.value=String(value);}
function hydrate(s){
  setSelect('#frequency',s.times.length,s.times.length+' 次 / 天');setSelect('#timezone',s.utcOffset,'UTC'+s.utcOffset);
  drawTimes(s.times);$('#days-ahead').value=s.daysAhead;$('#render-ahead').value=s.renderAheadHours;
  const radio=$(`input[name=strategy][value="${s.strategy}"]`);if(radio)radio.checked=true;
  selected=new Set(s.objects);$('#username').value=s.username;setSelect('#width',s.width);setSelect('#fps',s.fps);
  $('#late-grace').value=s.lateGraceMinutes;$('#cuts').value=s.cuts.join(', ');$('#seconds').value=s.seconds.join(', ');$('#caption').value=s.caption;
  $('#save-state').textContent='所有设置已同步';$('#save-state').classList.remove('dirty');renderLibrary();
}
function objectImage(item){
  const solid=item.shape==='box'?`<path d="M14 31 62 18 106 33 58 48Z" fill="${item.peel}"/><path d="M14 31 58 48 58 74 14 57Z" fill="${item.peel}"/><path d="M58 48 106 33 106 59 58 74Z" fill="${item.flesh}" opacity=".95"/>`:item.shape==='cylinder'?`<path d="M25 35V61C25 81 95 81 95 61V35Z" fill="${item.peel}"/><ellipse cx="60" cy="35" rx="35" ry="16" fill="${item.flesh}"/>`:`<ellipse cx="60" cy="49" rx="37" ry="28" fill="${item.peel}"/><ellipse cx="70" cy="46" rx="24" ry="24" fill="${item.flesh}"/><ellipse cx="71" cy="44" rx="17" ry="18" fill="${item.peel}" opacity=".08"/>`;
  return 'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 95"><ellipse cx="60" cy="80" rx="39" ry="5" fill="#d9d4ca" opacity=".28"/>${solid}</svg>`);
}
function renderLibrary(){
  if(!state)return;const mode=strategy(),all=mode==='cycle_all';if(all)selected=new Set(state.catalog.map(o=>o.id));
  $('#selection-count').textContent=`已选 ${selected.size} / ${state.catalog.length}`;
  $('#select-all').disabled=all;$('#clear-selection').disabled=all;
  const term=$('#search').value.toLowerCase().trim();
  const items=state.catalog.filter(o=>(category==='all'||o.family===category)&&(!term||(o.name+' '+o.id).toLowerCase().includes(term)));
  const shown=expanded?items:items.slice(0,16);
  $('#categories').innerHTML=Object.entries(families).map(([key,name])=>`<button type="button" data-family="${key}" class="category ${category===key?'active':''}">${name}</button>`).join('');
  $('#object-grid').innerHTML=shown.map(o=>`<label class="object-card ${selected.has(o.id)?'selected':''}" title="${esc(o.name+' · '+o.id)}"><input type="checkbox" data-id="${o.id}" aria-label="${esc(o.name)}" ${selected.has(o.id)?'checked':''} ${all?'disabled':''}><img src="${objectImage(o)}" alt="" loading="lazy"><span class="object-name">${esc(o.name)}</span></label>`).join('');
  $('#empty-objects').hidden=!!items.length;$('#show-more').hidden=items.length<=16;$('#show-more').textContent=expanded?'收起物品库':`展开全部 ${items.length} 种物品`;
  const n=all?100:selected.size,frequency=Number($('#frequency').value);
  $('#cycle-description').textContent=mode==='random'?'从所选物品中随机抽取；随机策略不保证一轮覆盖全部物品。':`${n} 种物品，按每天 ${frequency} 次计算，约 ${Math.ceil(n/frequency)} 天完成一轮。循环进度会保存。`;
}
function formatTime(date,withDay=true){
  const offset=state?.settings.utcOffset??'+08:00';const sign=offset[0]==='-'?-1:1;
  const minutes=sign*(Number(offset.slice(1,3))*60+Number(offset.slice(4)));
  const d=new Date(Date.parse(date)+minutes*60000);if(Number.isNaN(d.getTime()))return '—';
  return d.toISOString().slice(withDay?5:11,16).replace('T',' ');
}
function renderQueue(){
  const filter=$('#queue-filter').value;
  const isUpcoming=j=>['queued','ready','processing','uploading'].includes(j.status)&&Date.parse(j.scheduled)>=Date.now();
  const rows=state.jobs.filter(j=>filter==='all'||filter==='published'&&j.status==='published'||filter==='upcoming'&&isUpcoming(j)||filter==='issues'&&['needs_review','gui_uncertain','uncertain'].includes(j.status));
  rows.sort((a,b)=>isUpcoming(a)&&isUpcoming(b)?Date.parse(a.scheduled)-Date.parse(b.scheduled):isUpcoming(a)?-1:isUpcoming(b)?1:Date.parse(b.scheduled)-Date.parse(a.scheduled));
  const pages=Math.max(1,Math.ceil(rows.length/10));queuePage=Math.min(queuePage,pages-1);
  $('#queue-body').innerHTML=rows.slice(queuePage*10,queuePage*10+10).map(j=>`<tr><td>${esc(j.name)}</td><td>${formatTime(j.scheduled)}</td><td><span class="status-badge ${esc(j.status)}">${esc(labels[j.status]??j.status)}</span></td><td>${esc(j.error??(j.status==='published'?'已记录分享成功':j.status==='queued'?'按备片窗口自动生成':j.status==='ready'?'等待计划发布时间':'—'))}</td><td>${j.hasVideo?`<button type="button" class="text-button" data-video="${j.id}">预览</button>`:''}${['queued','ready'].includes(j.status)?`<button type="button" class="text-button" data-job="${j.id}" data-action="cancel">取消</button>`:''}${j.canRetry?`<button type="button" class="text-button" data-job="${j.id}" data-action="retry">恢复备片</button>`:''}</td></tr>`).join('');
  $('#queue-page').textContent=`${queuePage+1} / ${pages} 页 · 共 ${rows.length} 条`;
  $('#queue-prev').disabled=queuePage===0;$('#queue-next').disabled=queuePage===pages-1;
  $('#empty-queue').hidden=!!rows.length;
}
function renderStatus(){
  const s=state.settings,enabled=s.enabled,busy=!!state.operation;
  $('#account-tag').textContent='Instagram · @'+s.username;
  $('#automation-toggle').setAttribute('aria-checked',String(enabled));$('#automation-toggle').setAttribute('aria-label',enabled?'关闭自动化发布':'开启自动化发布');
  $('#automation-toggle').disabled=!enabled && (busy||state.loginOpen||state.workerLocked);
  const blocked=enabled&&!!state.paused;
  $('#automation-badge').textContent=blocked?'需要处理':enabled?'已开启':'已关闭';$('#automation-badge').className='badge '+(blocked?'warning':enabled?'on':'');
  $('#automation-description').textContent=enabled?(busy?'正在执行任务，关闭开关后将停止后续发布。':blocked?'发布队列已暂停，请先处理账号验证或待核对结果。':'自动备片与定时发布已开启，请保持电脑和面板服务运行。'):'开启后，面板会自动备片，并在设定时间发布到 Instagram。';
  const problem=state.paused?.reason??(state.lastResult?.code!==0&&state.lastResult?state.lastResult.output.split('\n').filter(x=>x.trim()&&!x.includes('ExperimentalWarning')&&!x.includes('trace-warnings')).slice(-2).join(' '):'');
  $('#alert').hidden=!problem;$('#alert').textContent=problem?'需要处理：'+problem:'';
  $('#stat-frequency').textContent=s.times.length;$('#stat-times').textContent=s.times.join(' · ');
  $('#stat-pool').textContent=s.objects.length;$('#stat-strategy').textContent=strategies[s.strategy];
  $('#stat-next').textContent=state.next?formatTime(state.next.scheduled):'尚未排期';
  $('#stat-next-object').textContent=state.next?((state.catalog.find(o=>o.id===state.next.video?.object)?.name??'本地视频')+' · UTC'+s.utcOffset):'保存设置后生成计划';
  $('#engine-message').textContent=state.loginOpen?'登录窗口已打开，完成登录和验证后，点击“已登录，验证并保存”。':busy?'正在运行：'+({prepare:'生成视频',run:'自动发布轮询',doctor:'检查账号',plan:'更新排期'}[state.operation.command]??state.operation.command):state.workerLocked?'检测到其他发布任务正在使用引擎。':'使用专用 Edge 会话。电脑需开机，面板服务需保持运行。';
  $('#login').hidden=state.loginOpen;$('#verify-login').hidden=!state.loginOpen;$('#close-login').hidden=!state.loginOpen;
  for(const id of ['#doctor','#prepare','#login','#save'])$(id).disabled=busy||state.loginOpen||state.workerLocked;
  $('#result-card').hidden=!state.lastResult;
  if(state.lastResult){$('#result-status').textContent=state.lastResult.code===0?'执行成功':'需要处理';$('#result-status').className='badge '+(state.lastResult.code===0?'success':'warning');$('#result-output').textContent=state.lastResult.output??'';}
  renderQueue();
}
async function refresh(force=false){
  if(refreshing)return;refreshing=true;
  try{state=await api('state');if(force||!dirty)hydrate(state.settings);renderStatus();}
  catch(error){toast('无法读取面板状态：'+error.message);}finally{refreshing=false;}
}
async function perform(button,fn){button.disabled=true;try{await fn();await refresh();}catch(error){toast(error.message);}finally{button.disabled=false;if(state)renderStatus();}}
$('#settings-form').addEventListener('input',event=>{if(!event.target.closest('#search'))markDirty();});
$('#settings-form').addEventListener('change',event=>{if(event.target.name==='strategy'){renderLibrary();markDirty();}});
$('#frequency').addEventListener('change',()=>{const previous=times(),count=Number($('#frequency').value),defaults=distribute(count);drawTimes(count>previous.length?defaults:previous.slice(0,count));renderLibrary();markDirty();});
$('#distribute').onclick=()=>{drawTimes(distribute(Number($('#frequency').value)));markDirty();};
$('#search').oninput=()=>renderLibrary();
$('#categories').onclick=event=>{const button=event.target.closest('[data-family]');if(button){category=button.dataset.family;renderLibrary();}};
$('#show-more').onclick=()=>{expanded=!expanded;renderLibrary();};
$('#select-all').onclick=()=>{selected=new Set(state.catalog.map(o=>o.id));markDirty();renderLibrary();};
$('#clear-selection').onclick=()=>{selected.clear();markDirty();renderLibrary();};
$('#object-grid').onchange=event=>{const id=event.target.dataset.id;if(!id)return;if(event.target.checked)selected.add(id);else selected.delete(id);markDirty();renderLibrary();};
$('#settings-form').onsubmit=event=>{event.preventDefault();void perform($('#save'),async()=>{
  const values=times();if(new Set(values).size!==values.length)throw new Error('发布时间不能重复');
  if(!selected.size)throw new Error('请至少选择一种物品');
  const numbers=id=>$(id).value.split(/[,，]/).map(s=>Number(s.trim()));
  const settings={username:$('#username').value.trim(),times:values.sort(),utcOffset:$('#timezone').value,daysAhead:Number($('#days-ahead').value),renderAheadHours:Number($('#render-ahead').value),lateGraceMinutes:Number($('#late-grace').value),strategy:strategy(),objects:state.catalog.filter(o=>selected.has(o.id)).map(o=>o.id),cuts:numbers('#cuts'),seconds:numbers('#seconds'),width:Number($('#width').value),fps:Number($('#fps').value),caption:$('#caption').value};
  const result=await api('settings',{revision:state.revision,settings});dirty=false;toast(`已保存，更新 ${result.removed} 个未来任务，生成 ${result.added} 个新计划`);
});};
$('#automation-toggle').onclick=()=>{void perform($('#automation-toggle'),async()=>{if(dirty&&!state.settings.enabled)throw new Error('请先保存当前修改，再开启自动发布');const enabled=!state.settings.enabled;await api('automation',{enabled});toast(enabled?'自动发布已开启，将按已保存的计划执行':'自动发布已关闭；已发起的分享仍会完成状态核对');});};
$('#refresh').onclick=()=>{if(dirty){void refresh();toast('运行状态已刷新，未保存的编辑已保留');}else void refresh(true);};
for(const [id,command] of [['#doctor','doctor'],['#prepare','prepare']])$(id).onclick=()=>{void perform($(id),async()=>{await api('action',{command,live:command==='doctor'});toast(command==='prepare'?'备片任务已开始':'正在检查 Instagram 账号');});};
$('#login').onclick=()=>{void perform($('#login'),async()=>{if(dirty)throw new Error('请先保存账号和其他设置');await api('login/open',{});toast('请在打开的 Edge 窗口登录，并完成验证');});};
$('#verify-login').onclick=()=>{void perform($('#verify-login'),async()=>{await api('login/verify',{});toast('账号验证成功，登录状态已保存');});};
$('#close-login').onclick=()=>{void perform($('#close-login'),async()=>{await api('login/close',{});});};
$('#queue-filter').onchange=()=>{queuePage=0;renderQueue();};
$('#queue-prev').onclick=()=>{queuePage--;renderQueue();};$('#queue-next').onclick=()=>{queuePage++;renderQueue();};
$('#queue-body').onclick=event=>{
  const video=event.target.closest('[data-video]');if(video){$('#video-dialog video').src='/media/'+video.dataset.video;$('#video-dialog').showModal();return;}
  const button=event.target.closest('[data-job]');if(button)void perform(button,async()=>{await api('job',{id:button.dataset.job,action:button.dataset.action});toast(button.dataset.action==='cancel'?'任务已取消':'已恢复待发布状态；如队列暂停，还需验证账号');});
};
$('#close-video').onclick=()=>{$('#video-dialog video').pause();$('#video-dialog').close();};
$('#video-dialog').addEventListener('close',()=>{$('#video-dialog video').pause();$('#video-dialog video').removeAttribute('src');});
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
await refresh(true);setInterval(()=>{void refresh();},4000);
