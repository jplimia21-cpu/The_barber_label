// Vercel Node.js Function. Gemini free-tier text model; no secrets in browser.
const LIMIT=6,WINDOW=60*60*1000;
const hits=new Map();
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed'});}
 const key=process.env.GEMINI_API_KEY;
 if(!key)return res.status(503).json({error:'AI is not enabled yet. The curated preview is still available.'});
 const origin=req.headers.origin||'';
 const host=req.headers.host||'';
 if(origin){try{if(new URL(origin).host!==host)return res.status(403).json({error:'Origin not allowed'});}catch{return res.status(403).json({error:'Invalid origin'});}}
 const ip=String(req.headers['x-forwarded-for']||'unknown').split(',')[0].trim();
 const now=Date.now(),recent=(hits.get(ip)||[]).filter(t=>now-t<WINDOW);
 if(recent.length>=LIMIT)return res.status(429).json({error:'AI testing limit reached. Please try later.'});
 recent.push(now);hits.set(ip,recent);
 if(hits.size>1000){for(const [k,v] of hits){if(!v.some(t=>now-t<WINDOW))hits.delete(k);}}
 let body=req.body;
 if(typeof body==='string'){if(body.length>2500)return res.status(413).json({error:'Request too large'});try{body=JSON.parse(body)}catch{return res.status(400).json({error:'Invalid JSON'});}}
 const brand=String(body?.brand||'').trim(),vibe=String(body?.vibe||'').trim();
 if(brand.length<2||brand.length>50||vibe.length<5||vibe.length>300)return res.status(400).json({error:'Please enter a brand name and a creative direction (5–300 characters).'});
 const prompt='You are a high-end visual identity creative director for a Miami barber styling-gel brand. Produce exactly 3 DIFFERENT logo directions as JSON. Interpret the user brief semantically; do not merely change the color. Each direction should use a distinct symbol and design approach. Symbols MUST be one of scissors, clippers, razor, barberpole, comb, wave, sun, leaf, lines, star, monogram. These symbols render as actual vector drawings. If the brief explicitly names a physical object such as scissors, clippers, razor, barber pole, or comb, EVERY concept MUST feature that exact symbol; vary the palette, typography and visual treatment instead. Never replace a requested object with a generic symbol. Names must be short creative direction names, not the brand name. Colors must be six-digit hex colors with good contrast. Use accessible luxury editorial design. No trademarks, copyrighted logos, or claims of exclusive rights. Return JSON ONLY as {"concepts":[{"name":"...","symbol":"wave","bg":"#123456","fg":"#FFFFFF","accent":"#AABBCC","font":"serif","rationale":"One short sentence"}]} with exactly 3 objects. Brand: '+brand+'. Creative brief: '+vibe;
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),27000);
 try{
 const preferred=process.env.GEMINI_MODEL||'';
 const listResponse=await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=100',{headers:{'x-goog-api-key':key},signal:controller.signal});
 if(!listResponse.ok){
  const status=listResponse.status;
  return res.status(status===429?429:502).json({error:status===401||status===403?'Gemini API key is denied access ('+status+').':status===429?'Gemini free-tier quota exceeded (429).':'Unable to list available Gemini models (HTTP '+status+').'});
 }
 const listing=await listResponse.json();
 const available=(listing.models||[]).filter(m=>Array.isArray(m.supportedGenerationMethods)&&m.supportedGenerationMethods.includes('generateContent'));
 const names=available.map(m=>m.name.replace(/^models\//,''));
 const preferredModels=[preferred,'gemini-2.5-flash','gemini-2.5-flash-lite','gemini-2.0-flash','gemini-2.0-flash-lite'].filter(Boolean);
 const candidates=[...new Set([...preferredModels.filter(n=>names.includes(n)),...names.filter(n=>/gemini.*flash/i.test(n)&&!/image|live|audio|tts|embedding/i.test(n)),...names.filter(n=>/gemini/i.test(n)&&!/image|live|audio|tts|embedding/i.test(n))])].slice(0,5);
 if(!candidates.length)return res.status(503).json({error:'Your Gemini API key has no compatible text-generation models available.'});
 let response,model='',lastStatus=0,lastCode='',attempted=[];
 for(const candidate of candidates){
  model=candidate;attempted.push(candidate);
  response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(candidate)+':generateContent',{
   method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},
   body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{responseMimeType:'application/json',temperature:0.8,maxOutputTokens:2400}}),
   signal:controller.signal
  });
  if(response.ok)break;
  lastStatus=response.status;
  let detail={};try{detail=await response.json()}catch{}
  lastCode=String(detail?.error?.status||'').slice(0,40);
  if(![404,502,503].includes(lastStatus))break;
 }
 if(!response.ok){
 const status=lastStatus,code=lastCode;
 const message=status===400?'Gemini rejected the request (400): model or request settings.':status===401||status===403?'Gemini access denied ('+status+'): check API key and project restrictions.':status===404?'Gemini models returned 404 after trying '+attempted.join(', ')+'.':status===429?'Gemini quota reached (429): free-tier usage may not be available.':status>=500?'Gemini service temporarily unavailable ('+status+'); attempted '+attempted.join(', ')+'.':'Gemini HTTP error '+status+'.';
 return res.status(status===429?429:502).json({error:message+(code?' ['+code+']':'')});
 }
 const data=await response.json();const raw=data?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'';
 const parsed=JSON.parse(raw);const arr=parsed?.concepts;
 const symbols=new Set(['scissors','clippers','razor','barberpole','comb','wave','sun','leaf','lines','star','monogram']);
 const hex=x=>typeof x==='string'&&/^#[0-9a-fA-F]{6}$/.test(x);
 if(!Array.isArray(arr)||arr.length!==3)throw Error('Invalid AI response');
 const requested=/scissor|shear/i.test(vibe)?'scissors':/clipper|trimmer/i.test(vibe)?'clippers':/razor|straight blade/i.test(vibe)?'razor':/barber.?pole/i.test(vibe)?'barberpole':/comb/i.test(vibe)?'comb':null;
 const concepts=arr.map(x=>{if(!symbols.has(x.symbol)||!hex(x.bg)||!hex(x.fg)||!hex(x.accent))throw Error('Invalid concept');return {name:String(x.name||'Concept').slice(0,45),symbol:requested||x.symbol,bg:x.bg,fg:x.fg,accent:x.accent,font:x.font==='serif'?'Georgia,serif':'Arial,sans-serif',rationale:String(x.rationale||'').slice(0,180)}});
 return res.status(200).json({concepts,source:'gemini',model});
 }catch(e){return res.status(502).json({error:e?.name==='AbortError'?'Gemini request timed out.':e instanceof SyntaxError?'Gemini returned invalid JSON.':'Gemini returned an unexpected result.'});}
 finally{clearTimeout(timer);}
};
