// ⚠️ RESCATADA del panel de Supabase el 20/08/2026 — ver ../README.md
// 🔑 SECRETO SUSTITUIDO: llevaba un TERCER PAT de GitHub, `ghp_hft2…`, distinto de los dos
//    ya conocidos (`ghp_97Ct…` y `ghp_5MfB…`) → Deno.env.get('GITHUB_TOKEN'). Revocar los tres.
// ✂️ PAYLOAD ELIDIDO — tercera y última elisión del rescate. El original traía en
//    `ROUTE_B64` el `app/route.ts` entero (base64) que commitea a `house-sevillana-landing`:
//    una ruta edge que lee las ~31 filas gzip de `_deploy_assets` por PostgREST y devuelve
//    la landing. Dentro llevaba la **clave anon de la Supabase compartida** en claro.
// 🔍 MEDIDO, no supuesto: esa anon del blob es la variante de **44 caracteres de firma**
//    (`…i0VjgQ_sux…`). La buena tiene 43 (`…i0Vjg_sux…`) — es la que lleva el cron `jobid 28`
//    (`monitor-health-cron`), que responde 200, y la que ya está allowlistada en
//    `.gitleaks.toml` como clave de cliente. O sea: **la del blob está corrupta y no
//    autentica**, así que esa landing venía sirviéndose rota. No cambia la rotación —
//    el consumidor legacy que importa sigue siendo el jobid 28, ya documentado en
//    ../../docs/ROTACION-SERVICE-ROLE.md — pero sí explica por qué se abandonó el invento.
//    Se elide igualmente: no se republica una credencial ni aunque venga mal escrita.
// ⚠️ `verify_jwt=false` y apunta a `house-sevillana-landing`, el repo pendiente de borrar.
//    La landing viva es hoy `apps/housesevillana` del monorepo, que sirve el HTML
//    directamente y NO toca Supabase (comprobado: sin referencias en `apps/housesevillana/app/`).
//    Candidata a borrar con el repo.
const TOKEN=Deno.env.get("GITHUB_TOKEN")!;
const REPO='albertosuarezgutierrez-gif/house-sevillana-landing';
// El original traía aquí el `app/route.ts` completo en base64, CON la anon key dentro.
const ROUTE_B64=Deno.env.get("ROUTE_TS_B64") ?? '';
Deno.serve(async(_req:Request)=>{
  const gh={'Authorization':`token ${TOKEN}`,'Accept':'application/vnd.github.v3+json','User-Agent':'Supabase-Edge','Content-Type':'application/json'};
  const checkRes=await fetch(`https://api.github.com/repos/${REPO}/contents/app/route.ts`,{headers:gh});
  const existing=checkRes.ok?await checkRes.json():null;
  const body:Record<string,unknown>={message:'fix: concatenate all chunks then decompress gzip',content:ROUTE_B64,branch:'main'};
  if(existing) body.sha=(existing as {sha:string}).sha;
  const putRes=await fetch(`https://api.github.com/repos/${REPO}/contents/app/route.ts`,{method:'PUT',headers:gh,body:JSON.stringify(body)});
  const result=await putRes.json();
  return new Response(JSON.stringify({ok:putRes.ok,status:putRes.status,commit:(result as {commit?:{sha?:string}}).commit?.sha}),{headers:{'Content-Type':'application/json'}});
});
