import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {submitBrowserJob} from './browser-publisher.mjs';
import {render,probe} from './publish.mjs';

export function automationEnabled(root){
  try{return JSON.parse(readFileSync(join(root,'publisher.json'),'utf8')).automation?.enabled===true;}catch{return false;}
}

export function immediateCandidate(job){
  return !!job && ['queued','ready'].includes(job.status) && !job.containerId && !job.browserShareStartedAt && !job.manualPublishRequestedAt;
}

// A manual click is permission for this one job, independently of the automatic schedule switch.
export async function publishImmediately(id,store,browser,{root,renderJob=render,verifyVideo=probe}={}){
  const job=store.get(id);
  if(!job)throw new Error('任务不存在');
  if(job.status==='published')return {job,alreadyPublished:true};
  if(!immediateCandidate(job))throw new Error('只能提前发布尚未开始的待生成或待发布任务；已上传、已取消或结果不明确的任务不能重发');
  if(browser.paused)throw new Error('发布队列已暂停，请先验证账号并核对待处理任务');
  job.manualPublishRequestedAt=new Date().toISOString();store.save(job);
  try{
    if(job.status==='queued')await renderJob(job,store,root);
    await verifyVideo(job.file);
    await submitBrowserJob(job,store,browser,{manual:true});
    if(job.status!=='published')throw new Error(job.error??'未能确认分享成功');
    job.publishedEarlyAt=job.publishedAt;store.save(job);
    return {job,alreadyPublished:false};
  }finally{
    // A server crash leaves this marker behind, blocking automated or manual replay until reviewed.
    delete job.manualPublishRequestedAt;store.save(job);
  }
}

// Runs in the panel process, reusing its one browser object and authorized CDP connection.
export async function runBrowserSchedule(config,store,browser,{root,renderJob=render,verifyVideo=probe,now=()=>Date.now()}={}){
  store.plan(config,new Date(now()));let published=0,prepared=0,failed=0;
  for(const job of store.all()){
    if(['published','needs_review','cancelled','skipped'].includes(job.status))continue;
    if(job.manualPublishRequestedAt){job.status='needs_review';job.error='上次立即发布被中断，请核对结果后处理，禁止自动重发';store.save(job);continue;}
    if(['gui_publishing','gui_uncertain'].includes(job.status)){
      await submitBrowserJob(job,store,browser);break;
    }
    if(job.containerId || ['uploading','processing','publishing','uncertain'].includes(job.status)){
      job.status='needs_review';job.error='此任务已通过 API 开始上传，不能切换到网页重发';store.save(job);continue;
    }
    if(browser.paused)break;
    if(job.retryAt && Date.parse(job.retryAt)>now())continue;
    const due=Date.parse(job.scheduled);
    if(now()-due>config.schedule.lateGraceMinutes*60000){job.status='skipped';job.error='超出迟发宽限期';store.save(job);continue;}
    try{
      if(job.status==='queued' && due-now()<=config.schedule.renderAheadHours*3600000){await renderJob(job,store,root);prepared++;}
      if(job.status!=='ready' || due>now())continue;
      if(!automationEnabled(root))break;
      await verifyVideo(job.file);await submitBrowserJob(job,store,browser);
      if(job.status==='published')published++;
    }catch{
      failed++;
      job.attempts=(job.attempts??0)+1;job.error='视频准备失败，请检查生成结果和文件格式';
      job.retryAt=new Date(now()+Math.min(3600,60*2**(job.attempts-1))*1000).toISOString();
      if(job.attempts>=5)job.status='needs_review';store.save(job);
    }
  }
  return {published,prepared,failed,paused:browser.paused};
}
