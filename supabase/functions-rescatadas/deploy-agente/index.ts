// ⚠️ RESCATADA del panel de Supabase el 20/08/2026 — ver ../README.md
// 🔑 SECRETO SUSTITUIDO: llevaba el PAT `ghp_97Ct…` en claro → Deno.env.get('GITHUB_TOKEN').
// ✂️ PAYLOAD ELIDIDO — segunda (y última) función del rescate que NO es copia literal.
//    El original incrustaba ~16 KB de base64 en tres constantes: `ROUTE` (el
//    `app/api/agente/route.ts` completo, un endpoint de analítica con `$queryRaw` sobre
//    `incomes`/`gastos`) y `PAGE_P1`+`PAGE_P2` (el `app/(dashboard)/agente/page.tsx`
//    entero, partido en dos porque no cabía en una sola constante). Ese código ya vive
//    versionado en el repo destino; el blob aquí solo estorbaría a la lectura.
//    Lo que importa —qué escribe, dónde y con qué credencial— sí está.
//    El original íntegro sigue en el panel de Supabase mientras la función exista.
// 📌 Parche de una tarde: commitea esos dos ficheros a `main` de `roi-intranet`.
//    `verify_jwt=false`, pero no acepta parámetros: el daño está acotado a repetir ESE
//    commit. Candidata a borrar.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const O="albertosuarezgutierrez-gif",R="roi-intranet",T=Deno.env.get("GITHUB_TOKEN")!;
async function gh(p:string,m:string="GET",b?:unknown){const r=await fetch("https://api.github.com/repos/"+O+"/"+R+p,{method:m,headers:{"Authorization":"Bearer "+T,"Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","Content-Type":"application/json"},body:b?JSON.stringify(b):undefined});const d=await r.json();if(!r.ok)throw new Error("GH "+r.status+": "+JSON.stringify(d));return d;}
async function put(path:string,b64:string,msg:string){let sha:string|undefined;try{const f=await gh("/contents/"+path);sha=f.sha;}catch(_){}const body:Record<string,unknown>={message:msg,content:b64};if(sha)body["sha"]=sha;return gh("/contents/"+path,"PUT",body);}
// Los tres blobs base64 del original van aquí. Ver nota de cabecera.
const ROUTE=Deno.env.get("AGENTE_ROUTE_B64") ?? "";
const PAGE_P1=Deno.env.get("AGENTE_PAGE_B64_P1") ?? "";
const PAGE_P2=Deno.env.get("AGENTE_PAGE_B64_P2") ?? "";
Deno.serve(async()=>{try{
  const res:unknown[]=[];
  res.push(await put("app/api/agente/route.ts",ROUTE,"feat: agente route - business analytics no AI"));
  res.push(await put("app/(dashboard)/agente/page.tsx",PAGE_P1+PAGE_P2,"feat: agente page - automated analysis dashboard"));
  return new Response(JSON.stringify({ok:true,count:res.length}),{headers:{"Content-Type":"application/json"}});
}catch(e:any){return new Response(JSON.stringify({error:e.message}),{status:500,headers:{"Content-Type":"application/json"}});}});
