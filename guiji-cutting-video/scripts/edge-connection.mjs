export function localCdpEndpoint(value='http://127.0.0.1:9222') {
  let url;
  try { url=new URL(value); }catch{throw new Error('Edge 连接地址无效');}
  if(url.protocol!=='http:' || !['127.0.0.1','localhost','[::1]'].includes(url.hostname) ||
    url.username || url.password || url.search || url.hash || url.pathname!=='/' || !url.port) {
    throw new Error('Edge 连接地址只能使用带端口的本机 HTTP 地址，例如 http://127.0.0.1:9222');
  }
  return url.origin;
}

export async function inspectEdge(endpoint) {
  endpoint=localCdpEndpoint(endpoint);
  let data;
  try {
    const response=await fetch(endpoint+'/json/version',{signal:AbortSignal.timeout(5000),redirect:'error'});
    if(!response.ok)throw new Error();data=await response.json();
  }catch{throw new Error('无法连接已有 Edge：请先启用本机调试端口，并确认 '+endpoint+'/json/version 可以打开；程序不会启动新浏览器。');}
  if(!/Edg\//i.test((data.Browser??'')+' '+(data['User-Agent']??'')))throw new Error('该端口不是 Microsoft Edge，请检查连接地址');
  let websocket;
  try{websocket=new URL(data.webSocketDebuggerUrl);}catch{throw new Error('Edge 未提供有效的调试连接');}
  if(websocket.protocol!=='ws:' || !['127.0.0.1','localhost','[::1]'].includes(websocket.hostname) || websocket.username || websocket.password || websocket.port!==new URL(endpoint).port)throw new Error('Edge 调试连接必须位于相同的本机端口');
  return {endpoint,browser:data.Browser};
}
