import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {homedir} from 'node:os';

export function discoverEdgeEndpoint(userDataDir=join(process.env.LOCALAPPDATA ?? join(homedir(),'AppData','Local'),'Microsoft','Edge','User Data')) {
  let content;
  try{content=readFileSync(join(userDataDir,'DevToolsActivePort'),'utf8');}
  catch{throw new Error('未检测到 Edge 调试端口：请在 Edge 打开 edge://inspect/#remote-debugging，勾选“允许对此浏览器实例进行远程调试”，然后重试。');}
  const [port,path]=content.trim().split(/\r?\n/);
  if(!/^\d+$/.test(port) || Number(port)<1 || Number(port)>65535 || !/^\/devtools\/browser\/[a-z0-9-]+$/i.test(path??''))throw new Error('Edge 调试端口记录无效，请在 edge://inspect/#remote-debugging 重新启用远程调试');
  return 'ws://127.0.0.1:'+Number(port)+path;
}

export function localCdpEndpoint(value='http://127.0.0.1:9222') {
  let url;
  try { url=new URL(value); }catch{throw new Error('Edge 连接地址无效');}
  if(url.protocol!=='http:' || !['127.0.0.1','localhost','[::1]'].includes(url.hostname) ||
    url.username || url.password || url.search || url.hash || url.pathname!=='/' || !url.port) {
    throw new Error('Edge 连接地址只能使用带端口的本机 HTTP 地址，例如 http://127.0.0.1:9222');
  }
  return url.origin;
}

export async function inspectEdge(endpoint,{userDataDir}={}) {
  // Approval-mode servers expose WebSocket only: /json/version legitimately returns 404.
  if(endpoint==='auto')return {endpoint:discoverEdgeEndpoint(userDataDir),browser:null,source:'active-port'};
  endpoint=localCdpEndpoint(endpoint);
  let data;
  try {
    const response=await fetch(endpoint+'/json/version',{signal:AbortSignal.timeout(5000),redirect:'error'});
    if(!response.ok)throw new Error();data=await response.json();
  }catch{throw new Error('无法连接已有 Edge：请在 edge://inspect/#remote-debugging 启用远程调试并选择自动检测，或确认 '+endpoint+'/json/version 可以打开；程序不会启动新浏览器。');}
  if(!/Edg\//i.test((data.Browser??'')+' '+(data['User-Agent']??'')))throw new Error('该端口不是 Microsoft Edge，请检查连接地址');
  let websocket;
  try{websocket=new URL(data.webSocketDebuggerUrl);}catch{throw new Error('Edge 未提供有效的调试连接');}
  if(websocket.protocol!=='ws:' || !['127.0.0.1','localhost','[::1]'].includes(websocket.hostname) || websocket.username || websocket.password || websocket.port!==new URL(endpoint).port)throw new Error('Edge 调试连接必须位于相同的本机端口');
  return {endpoint,browser:data.Browser};
}
