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
 const prompt='You are a high-end visual identity creative director for a Miami barber styling-gel brand. Produce exactly 3 DIFFERENT logo directions as JSON. Interpret the user brief semantically; do not merely change the color. Each direction should use a distinct symbol and design approach. Symbols MUST be one of wave, sun, leaf, lines, star, monogram (these are the supported vector motifs). Names must be short creative direction names, not the brand name. Colors must be six-digit hex colors with good contrast. Use accessible luxury editorial design. No trademarks, copyrighted logos, or claims of exclusive rights. Return JSON ONLY as {"concepts":[{"name":"...","symbol":"wave","bg":"#123456","fg":"#FFFFFF","accent":"#AABBCC","font":"serif","rationale":"One short sentence"}]} with exactly 3 objects. Brand: '+brand+'. Creative brief: '+vibe;
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),22000);
 try{
 const model=process.env.GEMINI_MODEL||'gemini-2.5-flash-lite';
 const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent',{
 method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},
 body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{responseMimeType:'application/json',temperature:0.8,maxOutputTokens:2400,thinkingConfig:{thinkingBudget:0}}}),
 signal:controller.signal
 });
 if(!response.ok){
 let detail={};try{detail=await response.json()}catch{}
 const status=response.status,code=String(detail?.error?.status||'').slice(0,40);
 const message=status===400?'Gemini rejected the request (400): model or request settings.':status===401||status===403?'Gemini access denied ('+status+'): check API key and project restrictions.':status===404?'Gemini model unavailable (404).':status===429?'Gemini quota reached (429): free-tier usage may not be available.':status>=500?'Gemini server error ('+status+').':'Gemini HTTP error '+status+'.';
 return res.status(status===429?429:502).json({error:message+(code?' ['+code+']':'')});
}
 const data=await response.json();const raw=data?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'';
 const parsed=JSON.parse(raw);const arr=parsed?.concepts;
 const symbols=new Set(['wave','sun','leaf','lines','star','monogram']);
 const hex=x=>typeof x==='string'&&/^#[0-9a-fA-F]{6}$/.test(x);
 if(!Array.isArray(arr)||arr.length!==3)throw Error('Invalid AI response');
 const concepts=arr.map(x=>{if(!symbols.has(x.symbol)||!hex(x.bg)||!hex(x.fg)||!hex(x.accent))throw Error('Invalid concept');return {name:String(x.name||'Concept').slice(0,45),symbol:x.symbol,bg:x.bg,fg:x.fg,accent:x.accent,font:x.font==='serif'?'Georgia,serif':'Arial,sans-serif',rationale:String(x.rationale||'').slice(0,180)}});
 return res.status(200).json({concepts,source:'gemini'});
 }catch(e){return res.status(502).json({error:e?.name==='AbortError'?'Gemini request timed out.':e instanceof SyntaxError?'Gemini returned invalid JSON.':'Gemini returned an unexpected result.'});}
 finally{clearTimeout(timer);}
};
