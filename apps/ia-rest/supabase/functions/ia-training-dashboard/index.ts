import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPER_PIN = "9999";

// 🧪 PILOTO de la migración a las claves nuevas de Supabase (`sb_secret_…`), ver
// docs/ROTACION-SERVICE-ROLE.md. Esta función es el conejillo de indias a propósito:
// solo lee, está detrás de un PIN y se abre en el navegador, así que si la clave nueva
// NO sirviera contra PostgREST se ve al instante y no se cae nada que importe.
//
// Prefiere la clave nueva y cae a la legacy si aún no estuviera: mientras las dos
// convivan esto es reversible, y el día que se pulse «Disable JWT-based API keys» las
// 43 funciones de ia-rest tienen que estar ya en la primera rama.
//
// OJO al copiar esto a las demás: aquí NO hay problema de cabeceras porque el cliente
// habla con PostgREST. En las funciones que INVOCAN a otras funciones con
// `Authorization: Bearer <service_role>` la clave nueva no vale — no es un JWT — y hay
// que pasarla en `apikey` con `verify_jwt=false` en la función destino.
function claveSecreta(): string {
  const nuevas = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (nuevas) {
    try {
      const porNombre = JSON.parse(nuevas) as Record<string, string>;
      if (porNombre["default"]) return porNombre["default"];
    } catch { /* JSON ilegible: cae a la legacy en vez de tumbar la función */ }
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  throw new Error("Sin clave de servicio: ni SUPABASE_SECRET_KEYS['default'] ni SUPABASE_SERVICE_ROLE_KEY");
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const pin = url.searchParams.get("pin");
  if (!pin || pin !== SUPER_PIN) return new Response(authPage(), { headers: { "Content-Type": "text/html; charset=utf-8" } });
  if (url.searchParams.get("api") === "1") {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, claveSecreta(), { db: { schema: 'iarest' } });
    const [a, b, c, d, e] = await Promise.all([
      sb.from("v_training_stats").select("*"),
      sb.from("ia_training_log").select("id,created_at,input_raw,output_brain,latencia_ms,calidad,fue_corregido").order("created_at",{ascending:false}).limit(20),
      sb.from("ia_training_log").select("id,calidad,fue_corregido",{count:"exact"}),
      sb.from("ia_hitos").select("*").order("created_at",{ascending:false}),
      sb.from("restaurantes").select("id",{count:"exact"}).eq("activo",true),
    ]);
    const total = c.count ?? 0;
    const rows = (c.data??[]) as Array<{calidad:number,fue_corregido:boolean}>;
    const corregidos = rows.filter(r=>r.fue_corregido).length;
    const calidad_media = total>0?(rows.reduce((s,r)=>s+(r.calidad??0),0)/total).toFixed(2):"0.00";
    return new Response(JSON.stringify({
      stats:a.data??[], recientes:b.data??[], hitos:d.data??[],
      resumen:{total,corregidos,calidad_media,clientes_activos:e.count??0}
    }),{headers:{"Content-Type":"application/json"}});
  }
  return new Response(dashboardPage(pin),{headers:{"Content-Type":"text/html; charset=utf-8"}});
});

function authPage():string{
  return '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>ia.rest IA Training</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#14110E;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:system-ui}.card{background:#1F1A15;border:1px solid #3A332C;border-radius:16px;padding:48px 40px;text-align:center;width:320px}.logo{font-style:italic;font-size:28px;color:#F6F1E7;margin-bottom:8px}.sub{color:#6B5F52;font-size:12px;margin-bottom:32px;text-transform:uppercase;letter-spacing:.05em}input{width:100%;background:#14110E;border:1px solid #3A332C;border-radius:10px;padding:14px;color:#F6F1E7;font-size:24px;text-align:center;letter-spacing:12px;outline:none;margin-bottom:16px}input:focus{border-color:#D9442B}button{width:100%;background:#D9442B;color:#fff;border:none;border-radius:10px;padding:14px;font-size:15px;font-weight:600;cursor:pointer}button:hover{background:#A8311E}</style></head><body><div class="card"><div class="logo">ia.rest</div><div class="sub">IA Training &middot; Super Admin</div><form onsubmit="go(event)"><input type="password" id="p" maxlength="4" placeholder="&middot;&middot;&middot;&middot;" autofocus><button>Acceder</button></form></div><script>function go(e){e.preventDefault();var v=document.getElementById("p").value;if(v)window.location.search="?pin="+v;}<\/script></body></html>';
}

function dashboardPage(pin:string):string{
  const api="?pin="+pin+"&api=1";
  const css='<style>*{box-sizing:border-box;margin:0;padding:0}body{background:#14110E;color:#F6F1E7;font-family:system-ui;min-height:100vh}header{background:#1F1A15;border-bottom:1px solid #3A332C;padding:16px 24px;display:flex;align-items:center;gap:12px}.logo{font-style:italic;font-size:22px}.badge{background:#D9442B;color:#fff;font-size:10px;font-weight:700;padding:3px 8px;border-radius:20px;text-transform:uppercase;letter-spacing:.08em}.main{padding:24px;max-width:1100px;margin:0 auto}h2{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#6B5F52;margin:28px 0 12px}h2:first-of-type{margin-top:0}.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}.kpi{background:#1F1A15;border:1px solid #3A332C;border-radius:12px;padding:20px}.kpi .val{font-style:italic;font-size:34px;color:#F6F1E7;line-height:1}.kpi .lbl{font-size:10px;color:#6B5F52;margin-top:6px;text-transform:uppercase;letter-spacing:.06em}.kpi.g .val{color:#3F7D44}.kpi.r .val{color:#D9442B}table{width:100%;border-collapse:collapse;font-size:13px}th{color:#6B5F52;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:8px 12px;border-bottom:1px solid #3A332C;text-align:left}td{padding:9px 12px;border-bottom:1px solid #1F1A15;color:#F6F1E7;vertical-align:middle}tr:hover td{background:#1F1A15}.tbl{background:#1F1A15;border:1px solid #3A332C;border-radius:12px;overflow:hidden}.empty{text-align:center;padding:40px;color:#3A332C}.refresh{margin-left:auto;background:transparent;border:1px solid #3A332C;color:#6B5F52;padding:6px 14px;border-radius:8px;font-size:12px;cursor:pointer}.refresh:hover{border-color:#D9442B;color:#D9442B}.ts{font-size:11px;color:#6B5F52}.lat{font-family:monospace;font-size:11px;color:#6B5F52}.raw{font-size:12px;color:#6B5F52;max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mesa{font-family:monospace;font-size:12px;background:#14110E;border:1px solid #3A332C;padding:2px 5px;border-radius:4px;color:#D9442B}.intent{font-size:11px;background:#14110E;border:1px solid #3A332C;padding:2px 5px;border-radius:4px;color:#E8A33B}.hito{background:#1F1A15;border-left:3px solid #D9442B;border-radius:0 8px 8px 0;padding:14px 16px;margin-bottom:8px;font-size:13px;color:#F6F1E7}.hito .ht{font-size:11px;color:#6B5F52;margin-top:4px}.hito.done{border-left-color:#3F7D44}.bar-bg{background:#14110E;border-radius:4px;height:5px;margin-top:4px;overflow:hidden}.bar{height:100%;background:#D9442B;border-radius:4px}.prog-wrap{background:#1F1A15;border:1px solid #3A332C;border-radius:12px;padding:20px;margin-bottom:12px}.prog-label{font-size:11px;color:#6B5F52;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px}.prog-val{font-style:italic;font-size:28px;color:#F6F1E7;line-height:1;margin-bottom:4px}</style>';
  const js='var API="'+api+'";'+
  'async function load(){try{var r=await fetch(API);var d=await r.json();render(d);}catch(e){document.getElementById("app").innerHTML="<div class=\\"empty\\">Error</div>";}}'+
  'function fmt(n){return n==null?"—":Number(n).toLocaleString("es-ES");}'+
  'function fd(s){if(!s)return"—";var d=new Date(s);return d.toLocaleDateString("es-ES",{day:"2-digit",month:"2-digit"})+" "+d.toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"});}'+
  'function cp(c){var m={5:{b:"#1a3320",t:"#3F7D44"},4:{b:"#1a2a33",t:"#4A9EC4"},3:{b:"#2a2a1a",t:"#E8A33B"},2:{b:"#2a1a1a",t:"#D9442B"},1:{b:"#2a1a1a",t:"#D9442B"}};var x=m[Math.min(Math.max(c,1),5)];return "<span style=\\"background:"+x.b+";color:"+x.t+";padding:2px 7px;border-radius:20px;font-size:11px;font-weight:600\\">"+"★".repeat(c)+"</span>";}'+
  'function render(d){'+
  '  var res=d.resumen,s=d.stats,rec=d.recientes,hitos=d.hitos||[];'+
  '  var pctB=res.total>0?(((res.total-res.corregidos)/res.total)*100).toFixed(1):0;'+
  '  var pct50=Math.min(Math.round((res.clientes_activos/50)*100),100);'+
  '  var h="";'+
  '  h+="<h2>Hoja de ruta hacia la IA propia</h2>";'+
  '  h+="<div class=\\"prog-wrap\\"><div class=\\"prog-label\\">Clientes activos &rarr; objetivo 50</div>";'+
  '  h+="<div class=\\"prog-val\\">"+res.clientes_activos+" / 50</div>";'+
  '  h+="<div class=\\"bar-bg\\"><div class=\\"bar\\" style=\\"width:"+pct50+"%\\"></div></div></div>";'+
  '  if(hitos.length>0){h+="<h2>Hitos alcanzados</h2>";hitos.forEach(function(x){h+="<div class=\\"hito done\\">"+ x.mensaje+"<div class=\\"ht\\">"+fd(x.created_at)+"</div></div>";});}'+
  '  h+="<h2>Resumen global</h2><div class=\\"kpis\\">";'+
  '  h+="<div class=\\"kpi\\"><div class=\\"val\\">"+fmt(res.total)+"</div><div class=\\"lbl\\">Pares grabados</div></div>";'+
  '  h+="<div class=\\"kpi g\\"><div class=\\"val\\">"+res.calidad_media+" / 5</div><div class=\\"lbl\\">Calidad media</div></div>";'+
  '  h+="<div class=\\"kpi r\\"><div class=\\"val\\">"+fmt(res.corregidos)+"</div><div class=\\"lbl\\">Correcciones</div></div>";'+
  '  h+="<div class=\\"kpi g\\"><div class=\\"val\\">"+pctB+"%</div><div class=\\"lbl\\">Acierto BRAIN</div></div>";'+
  '  h+="</div>";'+
  '  if(s.length>0){h+="<h2>Por restaurante</h2><div class=\\"tbl\\"><table><tr><th>Restaurante</th><th>Registros</th><th>Calidad</th><th>Errores</th><th>Latencia</th></tr>";s.forEach(function(x){var bw=Math.round((parseFloat(x.calidad_media||0)/5)*100);h+="<tr><td style=\\"font-weight:600\\">"+( x.restaurante||"—")+"</td><td>"+fmt(x.total_registros)+"</td><td>"+parseFloat(x.calidad_media||0).toFixed(1)+"/5<div class=\\"bar-bg\\"><div class=\\"bar\\" style=\\"width:"+bw+"%\\"></div></div></td><td>"+fmt(x.correcciones)+" <span class=\\"ts\\">("+(x.pct_error||0)+"%)</span></td><td class=\\"lat\\">"+( x.latencia_media_ms?x.latencia_media_ms+"ms":"—")+"</td></tr>";});h+="</table></div>";}'+
  '  h+="<h2>Últimas transcripciones</h2>";'+
  '  if(rec.length===0){h+="<div class=\\"empty\\">Sin datos aún. Apárecerán en cuanto haya comandas por voz.</div>";}'+
  '  else{h+="<div class=\\"tbl\\"><table><tr><th>Fecha</th><th>Transcripción</th><th>Mesa</th><th>Intent</th><th>Calidad</th><th>Lat.</th><th>Estado</th></tr>";rec.forEach(function(r){var br=r.output_brain||{};var cor=r.fue_corregido?"<span style=\\"color:#E8A33B;font-size:11px\\">⚠ corregido</span>":"<span style=\\"color:#3F7D44;font-size:11px\\">✓ ok</span>";var raw=(r.input_raw||"").replace(/</g,"&lt;");h+="<tr><td class=\\"ts\\">"+fd(r.created_at)+"</td><td><div class=\\"raw\\" title=\\""+raw+"\\">"+raw+"</div></td><td><span class=\\"mesa\\">"+( br.mesa||"—")+"</span></td><td><span class=\\"intent\\">"+( br.intent||"—")+"</span></td><td>"+cp(r.calidad||1)+"</td><td class=\\"lat\\">"+( r.latencia_ms?r.latencia_ms+"ms":"—")+"</td><td>"+cor+"</td></tr>";});h+="</table></div>";}'+
  '  document.getElementById("app").innerHTML=h;'+
  '}'+
  'load();';
  return '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ia.rest &middot; IA Training</title>'+css+'</head><body><header><div class="logo">ia.rest</div><div class="badge">IA Training</div><button class="refresh" onclick="load()">&#8635; Actualizar</button></header><div class="main" id="app" style="padding-top:32px"><div style="text-align:center;padding:60px;color:#3A332C">Cargando&hellip;</div></div><script>'+js+'<\/script></body></html>';
}
