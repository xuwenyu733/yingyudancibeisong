const fail=(status,message)=>Object.assign(new Error(message),{status});
export function localRequest(req){const address=req.socket?.remoteAddress||'';return ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address)&&!req.headers['x-forwarded-for'];}
export function sessionToken(req){const match=/(?:^|;\s*)pr_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'');return match?.[1]||'';}
export async function socialRoute({req,res,path,url,service,body,json,config,repository,validate}){
 if(!path.startsWith('/api/v1/social/'))return false;
 const input=async()=>{if(!req.headers['content-type']?.startsWith('application/json'))throw fail(415,'请使用JSON请求');const value=await body(req,65536);if(!value||typeof value!=='object'||Array.isArray(value))throw fail(400,'请求内容无效');return value;};
 const isPost=()=>{if(req.method!=='POST')throw fail(405,'此操作需要POST请求');};
 const address=config.trustProxy?String(req.headers['x-forwarded-for']||req.socket.remoteAddress).split(',')[0].trim():req.socket.remoteAddress;
 const cookie=(token,age=400*86400)=>{const secure=config.publicOrigin?.startsWith('https://')||req.socket.encrypted;res.setHeader('Set-Cookie','pr_session='+token+'; HttpOnly; SameSite=Strict; Path=/; Max-Age='+age+(secure?'; Secure':''));};
 if(path==='/api/v1/social/enter'){
  isPost();const data=await input();if(Object.keys(data).length)throw fail(400,'自动进入不需要昵称或密码');const result=await service.enter(sessionToken(req),address);cookie(result.token);json(res,200,{ok:true,identity:result.identity,created:result.created});return true;
 }
 if(['/api/v1/social/register','/api/v1/social/login','/api/v1/social/logout','/api/v1/social/local-saves','/api/v1/social/import-local'].includes(path))throw fail(410,'登录和注册已移除，请直接进入小屋');
 const me=await service.authenticate(sessionToken(req));
 if(path==='/api/v1/social/me'&&req.method==='GET'){json(res,200,{ok:true,identity:me});return true;}
 if(path==='/api/v1/social/overview'&&req.method==='GET'){json(res,200,await service.overview(me));return true;}
 if(path==='/api/v1/social/search'&&req.method==='GET'){json(res,200,{ok:true,user:await service.search(me,url.searchParams.get('id'))});return true;}
 if(path==='/api/v1/social/messages'&&req.method==='GET'){json(res,200,await service.messages(me,url.searchParams.get('peerId'),url.searchParams.get('after')));return true;}
 if(path==='/api/v1/social/visit'&&req.method==='GET'){json(res,200,await service.visit(me,url.searchParams.get('id')));return true;}
 isPost();const data=await input();let result;
 if(path==='/api/v1/social/request')result=await service.request(me,data.peerId);
 else if(path==='/api/v1/social/respond'){if(typeof data.accept!=='boolean')throw fail(400,'申请处理选项无效');result=await service.respond(me,data.peerId,data.accept);}
 else if(path==='/api/v1/social/remove')result=await service.remove(me,data.peerId);
 else if(path==='/api/v1/social/block'){if(typeof data.block!=='boolean')throw fail(400,'屏蔽选项无效');result=await service.block(me,data.peerId,data.block);}
 else if(path==='/api/v1/social/messages')result=await service.send(me,data);
 else if(path==='/api/v1/social/invite')result=await service.invite(me,data.peerId);
 else if(path==='/api/v1/social/invitation')result=await service.respondInvite(me,data.id,data.action);
 else if(path==='/api/v1/social/name')result=await service.rename(me,data.name);
 else throw fail(404,'这个好友操作不存在');
 json(res,200,result);return true;
}
