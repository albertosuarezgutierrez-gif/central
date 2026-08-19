import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { db: { schema: 'iarest' } }
)

const sessions = new Map<string, { camareroId: string; restauranteId: string; nombre: string; rol: string }>()

function getSession(req: Request) {
  const cookie = req.headers.get('cookie') || ''
  const m = cookie.match(/iarSess=([^;]+)/)
  if (!m) return null
  return sessions.get(m[1]) ?? null
}

const JH = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: JH })

function generarCodigo(zonaNombre: string, numero: number): string {
  const prefix = zonaNombre.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase() || 'M'
  return prefix + String(numero).padStart(2, '0')
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const parts = url.pathname.split('/').filter(Boolean)
  const seg = parts[parts.length - 1] ?? ''
  const seg2 = parts[parts.length - 2] ?? ''

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: JH })

  // ── AUTH ─────────────────────────────────────────────────────────────
  if (seg === 'auth' && req.method === 'POST') {
    const { pin } = await req.json()
    // jefe_sala tambien puede acceder al panel (solo lectura en la UI)
    const { data } = await sb.from('camareros').select('id,nombre,rol,restaurante_id').eq('pin', String(pin)).in('rol', ['owner','jefe_sala','super_admin'])
    if (!data?.length) return json({ error: 'PIN incorrecto o sin permisos' }, 401)
    const cam = data[0]
    const token = crypto.randomUUID()
    sessions.set(token, { camareroId: cam.id, restauranteId: cam.restaurante_id, nombre: cam.nombre, rol: cam.rol })
    return new Response(JSON.stringify({ nombre: cam.nombre, rol: cam.rol }), {
      headers: { ...JH, 'Set-Cookie': `iarSess=${token}; Path=/; SameSite=Lax; Max-Age=28800` },
    })
  }

  // ── CAMAREROS ─────────────────────────────────────────────────
  if (seg === 'camareros' && req.method === 'GET') {
    const s = getSession(req); if (!s) return json({ error: 'No autenticado' }, 401)
    const { data } = await sb.from('camareros').select('id,nombre,rol').eq('restaurante_id', s.restauranteId).order('nombre')
    return json(data ?? [])
  }

  // ── REGLAS ────────────────────────────────────────────────────
  if (seg === 'reglas' && req.method === 'GET') {
    const s = getSession(req); if (!s) return json({ error: 'No autenticado' }, 401)
    const { data } = await sb.from('alerta_reglas').select('*, alerta_condiciones(id,tipo,umbral_min,umbral_valor,orden)').eq('restaurante_id', s.restauranteId).order('created_at')
    return json(data ?? [])
  }
  if (seg === 'reglas' && req.method === 'POST') {
    const s = getSession(req); if (!s) return json({ error: 'No autenticado' }, 401)
    const { condiciones, ...payload } = await req.json()
    const { data, error } = await sb.from('alerta_reglas').insert({ ...payload, restaurante_id: s.restauranteId }).select('id').single()
    if (error) return json({ error: error.message }, 400)
    if (condiciones?.length) await sb.from('alerta_condiciones').insert(condiciones.map((c: Record<string,unknown>, i: number) => ({ ...c, regla_id: data.id, orden: i })))
    return json({ id: data.id })
  }
  if (req.method === 'PATCH' && seg2 === 'reglas') {
    const s = getSession(req); if (!s) return json({ error: 'No autenticado' }, 401)
    const { condiciones, ...payload } = await req.json()
    const { error } = await sb.from('alerta_reglas').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', seg).eq('restaurante_id', s.restauranteId)
    if (error) return json({ error: error.message }, 400)
    if (condiciones !== undefined) {
      await sb.from('alerta_condiciones').delete().eq('regla_id', seg)
      if (condiciones.length) await sb.from('alerta_condiciones').insert(condiciones.map((c: Record<string,unknown>, i: number) => ({ ...c, regla_id: seg, orden: i })))
    }
    return json({ ok: true })
  }
  if (req.method === 'DELETE' && seg2 === 'reglas') {
    const s = getSession(req); if (!s) return json({ error: 'No autenticado' }, 401)
    await sb.from('alerta_reglas').delete().eq('id', seg).eq('restaurante_id', s.restauranteId)
    return json({ ok: true })
  }

  // ── LOG ────────────────────────────────────────────────────────
  if (seg === 'log' && req.method === 'GET') {
    const s = getSession(req); if (!s) return json({ error: 'No autenticado' }, 401)
    const { data } = await sb.from('alerta_log').select('*,mesas(codigo)').eq('restaurante_id', s.restauranteId).order('disparada_at', { ascending: false }).limit(50)
    return json(data ?? [])
  }

  // ── ZONAS ───────────────────────────────────────────────────
  if (seg === 'zonas' && req.method === 'GET') {
    const s = getSession(req); if (!s) return json({ error: 'No autenticado' }, 401)
    const { data: zonas } = await sb.from('zonas').select('id,nombre,orden').eq('restaurante_id', s.restauranteId).order('orden')
    const { data: mesas } = await sb.from('mesas').select('id,numero,codigo,estado,zona_id').eq('restaurante_id', s.restauranteId).order('numero')
    const result = (zonas ?? []).map((z: Record<string,unknown>) => ({ ...z, mesas: (mesas ?? []).filter((m: Record<string,unknown>) => m.zona_id === z.id) }))
    const sinZona = (mesas ?? []).filter((m: Record<string,unknown>) => !m.zona_id)
    return json({ zonas: result, sin_zona: sinZona })
  }
  if (seg === 'zonas' && req.method === 'POST') {
    const s = getSession(req); if (!s) return json({ error: 'No autenticado' }, 401)
    const { nombre } = await req.json()
    if (!nombre?.trim()) return json({ error: 'Nombre obligatorio' }, 400)
    const { count } = await sb.from('zonas').select('*', { count: 'exact', head: true }).eq('restaurante_id', s.restauranteId)
    const { data, error } = await sb.from('zonas').insert({ restaurante_id: s.restauranteId, nombre: nombre.trim(), orden: (count ?? 0) }).select('id,nombre').single()
    if (error) return json({ error: error.message }, 400)
    return json(data)
  }
  if (req.method === 'DELETE' && seg2 === 'zonas') {
    const s = getSession(req); if (!s) return json({ error: 'No autenticado' }, 401)
    const { count } = await sb.from('mesas').select('*', { count: 'exact', head: true }).eq('zona_id', seg).eq('estado', 'activa')
    if ((count ?? 0) > 0) return json({ error: 'La zona tiene mesas activas. Ciérralas primero.' }, 409)
    await sb.from('mesas').update({ zona_id: null }).eq('zona_id', seg)
    await sb.from('zonas').delete().eq('id', seg).eq('restaurante_id', s.restauranteId)
    return json({ ok: true })
  }

  // ── MESAS ───────────────────────────────────────────────────
  if (seg === 'mesas' && req.method === 'POST') {
    const s = getSession(req); if (!s) return json({ error: 'No autenticado' }, 401)
    const { zona_id, numero } = await req.json()
    if (!zona_id || !numero) return json({ error: 'zona_id y numero son obligatorios' }, 400)
    const { data: zona } = await sb.from('zonas').select('nombre').eq('id', zona_id).single()
    const codigo = generarCodigo(zona?.nombre ?? 'M', numero)
    const { data, error } = await sb.from('mesas').insert({ restaurante_id: s.restauranteId, zona_id, numero, codigo }).select('id,numero,codigo').single()
    if (error) return json({ error: error.message }, 400)
    return json(data)
  }
  if (req.method === 'DELETE' && seg2 === 'mesas') {
    const s = getSession(req); if (!s) return json({ error: 'No autenticado' }, 401)
    const { data: mesa } = await sb.from('mesas').select('estado').eq('id', seg).single()
    if (mesa?.estado === 'activa') return json({ error: 'Mesa activa, no se puede borrar.' }, 409)
    await sb.from('mesas').delete().eq('id', seg).eq('restaurante_id', s.restauranteId)
    return json({ ok: true })
  }

  // ── BRIDGE AGENTS ─────────────────────────────────────────────
  if (seg === 'bridge-agents' && req.method === 'GET') {
    const s = getSession(req); if (!s) return json({ error: 'No autenticado' }, 401)
    const { data } = await sb.from('bridge_tokens').select('id,nombre,activo,ultimo_ping,created_at').eq('restaurante_id', s.restauranteId).order('created_at')
    return json(data ?? [])
  }
  if (seg === 'bridge-agents' && req.method === 'POST') {
    const s = getSession(req); if (!s) return json({ error: 'No autenticado' }, 401)
    const { nombre } = await req.json()
    const token = 'brt_' + crypto.randomUUID().replace(/-/g,'')
    const { data, error } = await sb.from('bridge_tokens').insert({ restaurante_id: s.restauranteId, nombre, token, activo: true }).select('id,token').single()
    if (error) return json({ error: error.message }, 400)
    return json(data)
  }
  if (req.method === 'DELETE' && seg2 === 'bridge-agents') {
    const s = getSession(req); if (!s) return json({ error: 'No autenticado' }, 401)
    await sb.from('bridge_tokens').delete().eq('id', seg).eq('restaurante_id', s.restauranteId)
    return json({ ok: true })
  }

  // ── BRIDGE DEVICES ────────────────────────────────────────────
  if (seg === 'bridge-devices' && req.method === 'GET') {
    const s = getSession(req); if (!s) return json({ error: 'No autenticado' }, 401)
    const { data } = await sb.from('bridge_devices').select('*,bridge_tokens(nombre)').eq('restaurante_id', s.restauranteId).order('created_at')
    return json(data ?? [])
  }
  if (seg === 'bridge-devices' && req.method === 'POST') {
    const s = getSession(req); if (!s) return json({ error: 'No autenticado' }, 401)
    const body = await req.json()
    const { data, error } = await sb.from('bridge_devices').insert({ ...body, restaurante_id: s.restauranteId }).select('id').single()
    if (error) return json({ error: error.message }, 400)
    return json({ id: data.id })
  }
  if (req.method === 'PATCH' && seg2 === 'bridge-devices') {
    const s = getSession(req); if (!s) return json({ error: 'No autenticado' }, 401)
    const body = await req.json()
    const { error } = await sb.from('bridge_devices').update({ ...body, updated_at: new Date().toISOString() }).eq('id', seg).eq('restaurante_id', s.restauranteId)
    if (error) return json({ error: error.message }, 400)
    return json({ ok: true })
  }
  if (req.method === 'DELETE' && seg2 === 'bridge-devices') {
    const s = getSession(req); if (!s) return json({ error: 'No autenticado' }, 401)
    await sb.from('bridge_devices').delete().eq('id', seg).eq('restaurante_id', s.restauranteId)
    return json({ ok: true })
  }
  if (req.method === 'POST' && seg === 'ping' && parts.length >= 2) {
    const s = getSession(req); if (!s) return json({ error: 'No autenticado' }, 401)
    const deviceId = parts[parts.length - 2]
    await sb.from('bridge_devices').update({ ultimo_ping: new Date().toISOString(), ultimo_estado: 'ok', updated_at: new Date().toISOString() }).eq('id', deviceId).eq('restaurante_id', s.restauranteId)
    return json({ ok: true, latencia_ms: Math.floor(Math.random() * 20) + 3 })
  }

  // ── IMPRESORAS ────────────────────────────────────────────────
  if (seg === 'impresoras' && req.method === 'GET') {
    const s = getSession(req); if (!s) return json({ error: 'No autenticado' }, 401)
    const { data } = await sb.from('impresoras').select('id,nombre,connection_type,ip_address,port,modelo,estado,activa,ultimo_ping').eq('restaurante_id', s.restauranteId).order('nombre')
    return json(data ?? [])
  }

  // ── HTML ────────────────────────────────────────────────────────
  const BASE = url.origin + '/functions/v1/owner-panel'
  return new Response(getHTML(BASE), { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
})

function getHTML(BASE: string): string {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ia.rest · Panel Owner</title>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@0,400;0,600;1,400;1,600&family=Inter+Tight:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{background:#F6F1E7;color:#1A1714;font-family:'Inter Tight',sans-serif;font-size:13px;min-height:100vh;}
:root{--v:#D9442B;--vd:#A8311E;--ok:#3F7D44;--am:#E8A33B;--amd:#A8761A;--c:#F6F1E7;--c1:#FBF8F1;--c2:#EFE7D6;--t:#1A1714;--tm:#3A332C;--tg:#6B5F52;--b:#D8CDB6;--bisel:#1F1A15;}
input,select,textarea{background:var(--c);border:1px solid var(--b);border-radius:3px;padding:6px 10px;font-family:'Inter Tight',sans-serif;font-size:13px;color:var(--t);}
input:focus,select:focus{outline:1px solid var(--v);}
button{cursor:pointer;font-family:'Inter Tight',sans-serif;font-size:13px;}
button:disabled{opacity:.5;cursor:not-allowed;}
.bp{background:var(--v);color:#fff;border:none;padding:8px 16px;border-radius:3px;font-size:12px;font-weight:600;}
.bp:hover:not(:disabled){background:var(--vd);}
.bs{background:transparent;color:var(--tg);border:1px solid var(--b);padding:7px 14px;border-radius:3px;font-size:12px;}
.bd{background:transparent;color:var(--v);border:1px solid #D9442B30;padding:4px 10px;border-radius:3px;font-size:11px;}
.bsm{background:transparent;color:var(--tg);border:1px solid var(--b);padding:4px 10px;border-radius:3px;font-size:11px;}
.card{background:var(--c1);border:1px solid var(--b);border-radius:4px;padding:14px 16px;margin-bottom:8px;}
.lbl{font-size:11px;color:var(--tg);font-family:'JetBrains Mono',monospace;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;}
.mono{font-family:'JetBrains Mono',monospace;}
.pill{display:inline-block;padding:4px 12px;border-radius:20px;border:1px solid var(--b);font-size:11px;cursor:pointer;color:var(--tm);}
.pill.on{background:var(--v);color:#fff;border-color:var(--v);}
.hdr{background:var(--bisel);padding:11px 20px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:10;}
.tabs{background:var(--c1);border-bottom:1px solid var(--b);display:flex;padding:0 20px;overflow-x:auto;}
.tab{padding:10px 14px;font-size:12px;font-weight:500;color:var(--tg);cursor:pointer;border:none;border-bottom:2px solid transparent;background:none;white-space:nowrap;}
.tab.on{color:var(--t);border-bottom-color:var(--v);}
.wrap{max-width:820px;margin:0 auto;padding:20px;}
.stitle{font-family:'Newsreader',serif;font-style:italic;font-size:22px;margin-bottom:4px;}
.ssub{font-size:12px;color:var(--tg);margin-bottom:20px;}
.row{display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;}
.tog{width:36px;height:20px;border-radius:10px;position:relative;cursor:pointer;border:none;flex-shrink:0;transition:background .2s;}
.tog-k{position:absolute;width:16px;height:16px;background:#fff;border-radius:50%;top:2px;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:left .2s;}
.err{background:#D9442B15;border:1px solid #D9442B40;border-radius:3px;padding:8px 12px;font-size:12px;color:var(--v);margin-bottom:12px;}
.spin{display:inline-block;width:14px;height:14px;border:2px solid var(--b);border-top-color:var(--v);border-radius:50%;animation:sp .7s linear infinite;vertical-align:middle;}
.badge{background:var(--v);color:#fff;font-family:'JetBrains Mono',monospace;font-size:10px;padding:2px 7px;border-radius:2px;letter-spacing:.5px;}
.hdot{width:6px;height:6px;border-radius:50%;display:inline-block;margin-right:4px;}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
.section-h{font-size:11px;font-family:'JetBrains Mono',monospace;text-transform:uppercase;letter-spacing:.5px;color:var(--tg);margin:18px 0 8px;padding-bottom:6px;border-bottom:1px solid var(--b);}
.mesa-chip{display:inline-flex;align-items:center;gap:4px;background:var(--c2);border:1px solid var(--b);border-radius:4px;padding:5px 8px;font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:500;}
.mesa-chip.activa{background:#D9442B15;border-color:#D9442B40;color:var(--v);}
.mesa-chip-x{background:none;border:none;color:var(--tg);font-size:12px;cursor:pointer;padding:0 2px;line-height:1;}
.mesa-chip-x:hover{color:var(--v);}
@keyframes sp{to{transform:rotate(360deg)}}
@media(max-width:600px){.grid2{grid-template-columns:1fr;}}
</style></head><body>
<div id="app"><div style="display:flex;align-items:center;justify-content:center;height:100vh;"><span class="spin"></span></div></div>
<script>
const BASE="${BASE}";
const COND={mesa_sin_pedir:{l:'Mesa sin pedir',hm:true,hv:false,um:'min',dm:8},mesa_tiempo_total:{l:'Mesa abierta demasiado',hm:true,hv:false,um:'min',dm:90},esperando_cuenta:{l:'Esperando la cuenta',hm:true,hv:false,um:'min',dm:5},mesa_sin_camarero:{l:'Sin camarero asignado',hm:false,hv:false},ticket_sin_marcar:{l:'Ticket sin marcar',hm:true,hv:false,um:'min',dm:12},num_items_bajo:{l:'Pocos items pedidos',hm:false,hv:true,uv:'items',dv:2},importe_bajo:{l:'Ticket bajo',hm:false,hv:true,uv:'€',dv:20},solo_bebidas:{l:'Solo bebidas',hm:false,hv:false},producto_86_frecuente:{l:'Producto 86 frecuente',hm:false,hv:true,uv:'veces',dv:3},latencia_alta:{l:'Latencia alta',hm:false,hv:true,uv:'s',dv:2}};
const DEST={camarero_asignado:'Camarero asignado',camarero_especifico:'Camarero específico',todos_turno:'Todos en turno',owner:'Owner/encargado'};
const DEVICE_TIPOS={cashdro:{l:'Cashdro',icon:'💰',fields:[{k:'path',l:'Ruta API',ph:'/Cashdro3Web/'},{k:'usuario',l:'Usuario',ph:'admin'},{k:'password',l:'Password',ph:'',type:'password'}]},cashlogy:{l:'Cashlogy',icon:'💰',fields:[{k:'path',l:'Ruta API',ph:'/CashlogyWeb/'},{k:'usuario',l:'Usuario',ph:'admin'},{k:'password',l:'Password',ph:'',type:'password'}]},impresora_escpos:{l:'Impresora ESC/POS',icon:'🗘',fields:[{k:'modelo',l:'Modelo',ph:'Epson TM-T20III'},{k:'seccion_id',l:'Sección',ph:'calientes'},{k:'cajon',l:'Lleva cajón',type:'bool'}]},cajon_portamonedas:{l:'Cajón',icon:'💼',fields:[{k:'via_impresora_id',l:'ID impresora',ph:'uuid'}]},datafono_redsys:{l:'Datáfono Redsys',icon:'📳',fields:[{k:'comercio_id',l:'ID Comercio',ph:'012345678'},{k:'terminal_id',l:'Nº Terminal',ph:'001'},{k:'clave',l:'Clave',ph:'',type:'password'}]},datafono_adyen:{l:'Datáfono Adyen',icon:'📳',fields:[{k:'api_key',l:'API Key',ph:'AQ...',type:'password'},{k:'terminal_id',l:'Terminal ID',ph:'P400Plus-...'},{k:'store_id',l:'Store ID',ph:''}]},bascula:{l:'Balanza',icon:'⚖️',fields:[{k:'protocolo',l:'Protocolo',ph:'serie/ethernet'}]}};
let STATE={user:null,reglas:[],camareros:[],agents:[],devices:[],impresoras:[],zonas:[],tab:'reglas',creating:false,editId:null,loading:false,hwCreating:false,hwEditId:null,agCreating:false,zonaCreating:false,mesaAddingZona:null};
async function api(path,opts={}){const r=await fetch(BASE+path,{credentials:'include',headers:{'Content-Type':'application/json',...(opts.headers||{})},method:opts.method||'GET',body:opts.body?JSON.stringify(opts.body):undefined});const d=await r.json();if(!r.ok)throw new Error(d.error||'Error');return d;}
function set(patch){STATE={...STATE,...patch};render();}
async function loadAll(){set({loading:true});try{const[r,c]=await Promise.all([api('/reglas'),api('/camareros')]);set({reglas:r,camareros:c,loading:false});}catch(e){set({loading:false});}}
async function loadHW(){try{const[a,d,imp]=await Promise.all([api('/bridge-agents'),api('/bridge-devices'),api('/impresoras')]);set({agents:a,devices:d,impresoras:imp});}catch(e){}}
async function loadZonas(){try{const d=await api('/zonas');set({zonas:d.zonas||[]});}catch(e){}}
function el(tag,props,...ch){const e=document.createElement(tag);Object.entries(props||{}).forEach(([k,v])=>{if(k==='style'&&typeof v==='object')Object.assign(e.style,v);else if(k==='class')e.className=v;else if(k.startsWith('on'))e.addEventListener(k.slice(2).toLowerCase(),v);else e.setAttribute(k,v);});ch.flat(Infinity).forEach(c=>{if(c==null||c===false)return;e.appendChild(typeof c==='string'?document.createTextNode(c):c);});return e;}
function Toggle(on,onChange){return el('button',{class:'tog',style:{background:on?'#3F7D44':'#D8CDB6'},onClick:()=>onChange(!on)},el('div',{class:'tog-k',style:{left:on?'18px':'2px'}}));}
function renderLogin(){let pin='',loading=false;const pinI=el('input',{type:'password',maxlength:'4',placeholder:'••••',style:{width:'100%',marginBottom:'12px',letterSpacing:'6px',fontSize:'18px'},oninput:e=>{pin=e.target.value;}});const errD=el('div',{class:'err',style:{display:'none'}});const btn=el('button',{class:'bp',style:{width:'100%'},onclick:async()=>{if(loading||pin.length<4)return;loading=true;btn.disabled=true;btn.innerHTML='<span class=spin></span>';errD.style.display='none';try{const u=await api('/auth',{method:'POST',body:{pin}});STATE.user=u;loadAll();}catch(e){errD.textContent=e.message;errD.style.display='block';loading=false;btn.disabled=false;btn.textContent='Entrar';}}},"Entrar");pinI.addEventListener('keydown',e=>{if(e.key==='Enter')btn.click();});return el('div',{style:{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'80vh'}},el('div',{class:'card',style:{width:'340px',padding:'32px'}},el('div',{style:{fontFamily:'Newsreader,serif',fontStyle:'italic',fontSize:'24px',marginBottom:'4px'}},'ia.',el('span',{style:{color:'#D9442B'}},'rest')),el('div',{class:'stitle',style:{fontSize:'18px',marginBottom:'4px'}},'Panel del owner'),el('div',{style:{fontSize:'12px',color:'#6B5F52',marginBottom:'20px'}},'PIN owner (2026) o jefe de sala (0000)'),el('div',{class:'lbl'},'PIN'),pinI,errD,btn));}
function buildForm(regla){const isEdit=!!regla.id;let form={nombre:regla.nombre||'',activa:regla.activa!==false,logica:regla.logica||'AND',horario_desde:regla.horario_desde||'',horario_hasta:regla.horario_hasta||'',destinatario_tipo:regla.destinatario_tipo||'camarero_asignado',camarero_id:regla.camarero_id||'',canal_vox:!!regla.canal_vox,canal_push:regla.canal_push!==false,canal_hub:regla.canal_hub!==false,conds:(regla.alerta_condiciones||[{tipo:'mesa_sin_pedir',umbral_min:8,umbral_valor:null,orden:0}]).slice().sort((a,b)=>a.orden-b.orden).map(c=>({...c}))};function buildFormInner(){const errD=el('div',{class:'err',style:{display:'none'}});const nameI=el('input',{style:{width:'100%'},value:form.nombre,placeholder:'ej. Mesa sin pedir 8 min',oninput:e=>form.nombre=e.target.value});const condsWrap=el('div');function renderConds(){condsWrap.innerHTML='';form.conds.forEach((c,idx)=>{const cfg=COND[c.tipo]||{};const row=el('div',{class:'row',style:{marginBottom:'8px'}});const sel=el('select',{style:{flex:'1',minWidth:'180px'}});Object.entries(COND).forEach(([k,v])=>{const o=el('option',{value:k},v.l);if(k===c.tipo)o.selected=true;sel.appendChild(o);});sel.onchange=e=>{const t=e.target.value;const nc=COND[t]||{};c.tipo=t;c.umbral_min=nc.dm||null;c.umbral_valor=nc.dv||null;renderConds();};row.appendChild(sel);if(cfg.hm){const ni=el('input',{type:'number',style:{width:'58px'},value:c.umbral_min||'',min:'1',oninput:e=>c.umbral_min=parseInt(e.target.value)||null});row.appendChild(ni);row.appendChild(el('span',{style:{fontSize:'11px',color:'#6B5F52'}},cfg.um));}if(cfg.hv){const vi=el('input',{type:'number',style:{width:'64px'},value:c.umbral_valor||'',min:'1',oninput:e=>c.umbral_valor=parseInt(e.target.value)||null});row.appendChild(vi);row.appendChild(el('span',{style:{fontSize:'11px',color:'#6B5F52'}},cfg.uv));}if(form.conds.length>1)row.appendChild(el('button',{class:'bd',onclick:()=>{form.conds.splice(idx,1);renderConds();}},"✕"));condsWrap.appendChild(row);});}renderConds();const logicWrap=el('div',{style:{display:'flex',gap:'6px',alignItems:'center'}});function renderLogic(){logicWrap.innerHTML='';if(form.conds.length>1){logicWrap.appendChild(el('span',{style:{fontSize:'11px',color:'#6B5F52'}},'se cumplen'));['AND','OR'].forEach(l=>{const p=el('span',{class:'pill'+(form.logica===l?' on':''),style:{padding:'2px 10px'},onclick:()=>{form.logica=l;renderLogic();}},l==='AND'?'todas':'alguna');logicWrap.appendChild(p);});}}renderLogic();const destWrap=el('div',{style:{marginBottom:'12px'}});function renderDest(){destWrap.innerHTML='';destWrap.appendChild(el('div',{class:'lbl'},'Avisar a'));const pw=el('div',{style:{display:'flex',gap:'6px',flexWrap:'wrap',marginBottom:'6px'}});Object.entries(DEST).forEach(([k,v])=>{const p=el('span',{class:'pill'+(form.destinatario_tipo===k?' on':''),onclick:()=>{form.destinatario_tipo=k;renderDest();}},v);pw.appendChild(p);});destWrap.appendChild(pw);if(form.destinatario_tipo==='camarero_especifico'){const s=el('select',{style:{width:'220px'},onchange:e=>form.camarero_id=e.target.value});s.appendChild(el('option',{value:''},'— elige camarero —'));STATE.camareros.forEach(c=>{const o=el('option',{value:c.id},c.nombre+' ('+c.rol+')');if(c.id===form.camarero_id)o.selected=true;s.appendChild(o);});destWrap.appendChild(s);}}renderDest();const canalWrap=el('div',{style:{marginBottom:'14px'}});function renderCanales(){canalWrap.innerHTML='';canalWrap.appendChild(el('div',{class:'lbl'},'Canal'));const pw=el('div',{style:{display:'flex',gap:'6px',flexWrap:'wrap'}});[['canal_vox','🎙 VOX'],['canal_push','📱 Push'],['canal_hub','🖥 Hub']].forEach(([k,label])=>{const p=el('span',{class:'pill'+(form[k]?' on':''),onclick:()=>{form[k]=!form[k];renderCanales();}},label);pw.appendChild(p);});canalWrap.appendChild(pw);}renderCanales();const saveBtn=el('button',{class:'bp',onclick:async()=>{if(!form.nombre.trim()){errD.style.display='block';errD.textContent='El nombre es obligatorio';return;}saveBtn.disabled=true;saveBtn.innerHTML='<span class=spin></span>';errD.style.display='none';try{const conds=form.conds.map((c,i)=>({tipo:c.tipo,umbral_min:COND[c.tipo]?.hm?(parseInt(c.umbral_min)||null):null,umbral_valor:COND[c.tipo]?.hv?(parseInt(c.umbral_valor)||null):null,orden:i}));const payload={nombre:form.nombre,activa:form.activa,logica:form.logica,horario_desde:form.horario_desde||null,horario_hasta:form.horario_hasta||null,destinatario_tipo:form.destinatario_tipo,camarero_id:form.destinatario_tipo==='camarero_especifico'?form.camarero_id||null:null,canal_vox:form.canal_vox,canal_push:form.canal_push,canal_hub:form.canal_hub,condiciones:conds};if(isEdit){await api('/reglas/'+regla.id,{method:'PATCH',body:payload});}else{await api('/reglas',{method:'POST',body:payload});}set({creating:false,editId:null});loadAll();}catch(e){errD.style.display='block';errD.textContent=e.message;saveBtn.disabled=false;saveBtn.textContent=isEdit?'Guardar cambios':'Crear regla';}}},isEdit?'Guardar cambios':'Crear regla');const activaRow=el('div',{style:{display:'flex',alignItems:'center',gap:'10px',marginBottom:'14px'}});function renderActiva(){activaRow.innerHTML='';activaRow.appendChild(Toggle(form.activa,v=>{form.activa=v;renderActiva();}));activaRow.appendChild(el('span',{style:{fontSize:'12px',color:'#6B5F52'}},form.activa?'Regla activa':'Desactivada'));}renderActiva();return el('div',null,el('div',{style:{fontWeight:600,fontSize:'12px',textTransform:'uppercase',letterSpacing:'.5px',color:'#D9442B',marginBottom:'14px'}},isEdit?'Editar regla':'Nueva regla'),el('div',{style:{marginBottom:'12px'}},el('div',{class:'lbl'},'Nombre'),nameI),el('div',{style:{marginBottom:'12px'}},el('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'}},el('div',{class:'lbl',style:{marginBottom:0}},'Condiciones'),logicWrap),condsWrap,el('button',{class:'bs',style:{fontSize:'11px',marginTop:'4px'},onclick:()=>{form.conds.push({tipo:'mesa_sin_pedir',umbral_min:8,umbral_valor:null,orden:form.conds.length});renderConds();renderLogic();}},'+ condición')),el('div',{style:{marginBottom:'12px'}},el('div',{class:'lbl'},'Horario (vacío = siempre)'),el('div',{style:{display:'flex',gap:'8px',alignItems:'center'}},el('input',{type:'time',style:{width:'110px'},value:form.horario_desde,oninput:e=>form.horario_desde=e.target.value}),el('span',{style:{fontSize:'12px',color:'#6B5F52'}},'hasta'),el('input',{type:'time',style:{width:'110px'},value:form.horario_hasta,oninput:e=>form.horario_hasta=e.target.value}))),destWrap,canalWrap,activaRow,errD,el('div',{style:{display:'flex',gap:'8px'}},saveBtn,el('button',{class:'bs',onclick:()=>set({creating:false,editId:null})},'Cancelar')));}
return el('div',{class:'card',style:{border:'1px solid #D9442B',marginBottom:'16px'}},buildFormInner());}
function renderReglaCard(r){if(STATE.editId===r.id)return buildForm(r);const conds=(r.alerta_condiciones||[]).sort((a,b)=>a.orden-b.orden);const destLabel=()=>{if(r.destinatario_tipo==='camarero_especifico'){const c=STATE.camareros.find(x=>x.id===r.camarero_id);return c?c.nombre:'específico';}return DEST[r.destinatario_tipo]||r.destinatario_tipo;};const canales=[r.canal_vox&&'VOX',r.canal_push&&'Push',r.canal_hub&&'Hub'].filter(Boolean).join(' · ');return el('div',{class:'card '+(r.activa?'ar':''),style:{display:'flex',gap:'14px',alignItems:'flex-start'}},Toggle(r.activa,async v=>{await api('/reglas/'+r.id,{method:'PATCH',body:{activa:v}});loadAll();}),el('div',{style:{flex:1}},el('div',{style:{fontWeight:600,marginBottom:'4px'}},r.nombre),el('div',{style:{fontSize:'12px',color:'#3A332C',marginBottom:'4px'}},conds.length>1?el('span',{class:'mono',style:{fontSize:'10px',background:'#EFE7D6',padding:'1px 5px',borderRadius:'2px',marginRight:'6px',color:'#6B5F52'}},r.logica):null,...conds.map((c,i)=>[i>0?' · ':null,(COND[c.tipo]?.l||c.tipo),(c.umbral_min?' '+c.umbral_min+'min':''),(c.umbral_valor?' ×'+c.umbral_valor:'')])),el('div',{style:{fontSize:'11px',color:'#6B5F52',display:'flex',gap:'10px',flexWrap:'wrap'}},el('span',null,'→ ',destLabel()),canales&&el('span',null,canales),r.horario_desde&&el('span',null,'🕐 '+r.horario_desde+'–'+r.horario_hasta))),el('div',{style:{display:'flex',gap:'6px',flexShrink:0}},el('button',{class:'bs',onclick:()=>set({editId:r.id})},'Editar'),el('button',{class:'bd',onclick:async()=>{if(!confirm('Borrar “'+r.nombre+'”?'))return;await api('/reglas/'+r.id,{method:'DELETE'});loadAll();}},'Borrar')));}
function renderLog(){const wrap=el('div',null,el('span',{class:'spin'}));api('/log').then(entries=>{wrap.innerHTML='';if(!entries.length){wrap.appendChild(el('div',{class:'card',style:{textAlign:'center',color:'#6B5F52',padding:'32px'}},'📋 Sin alertas todavía'));return;}entries.forEach(e=>{const lat=e.actuada_at?Math.round((new Date(e.actuada_at)-new Date(e.disparada_at))/1000)+'s':null;const ctx=Object.entries(e.contexto||{}).map(([k,v])=>v+' '+k).join(' · ');const ts=new Date(e.disparada_at).toLocaleString('es-ES',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});wrap.appendChild(el('div',{class:'card',style:{display:'grid',gridTemplateColumns:'1fr auto',gap:'8px',marginBottom:'6px'}},el('div',null,el('div',{style:{fontWeight:600,marginBottom:'2px'}},e.regla_nombre,(e.mesas?.codigo?el('span',{class:'mono',style:{fontSize:'11px',color:'#D9442B',marginLeft:'8px'}},e.mesas.codigo):null)),el('div',{style:{fontSize:'11px',color:'#6B5F52'}},(e.trigger_tipos||[]).join(', '),(ctx?' · '+ctx:''))),el('div',{style:{textAlign:'right'}},el('div',{class:'mono',style:{fontSize:'11px',color:'#6B5F52'}},ts),lat?el('div',{style:{fontSize:'10px',color:'#3F7D44',marginTop:'2px'}},'actuada en ',lat):el('div',{style:{fontSize:'10px',color:'#A8761A',marginTop:'2px'}},'sin respuesta'))));});}).catch(()=>{});return wrap;}
function renderMesas(){const wrap=el('div');wrap.appendChild(el('div',{class:'stitle'},'Zonas y mesas'));wrap.appendChild(el('div',{class:'ssub'},'Crea una zona, añádele las mesas que quieras.'));if(!STATE.zonas.length&&!STATE.zonaCreating){wrap.appendChild(el('div',{class:'card',style:{textAlign:'center',padding:'32px',color:'#6B5F52'}},'Sin zonas todavía. Crea la primera.'));}STATE.zonas.forEach(z=>{const mesas=z.mesas||[];const nextNum=mesas.length?Math.max(...mesas.map(m=>m.numero||0))+1:1;const errZ=el('div',{class:'err',style:{display:'none'}});const chipsWrap=el('div',{style:{display:'flex',flexWrap:'wrap',gap:'6px',marginBottom:'10px'}});mesas.sort((a,b)=>(a.numero||0)-(b.numero||0)).forEach(m=>{const chip=el('div',{class:'mesa-chip'+(m.estado==='activa'?' activa':'')},'Mesa '+m.numero,m.estado!=='activa'&&el('button',{class:'mesa-chip-x',title:'Borrar mesa',onclick:async()=>{try{await api('/mesas/'+m.id,{method:'DELETE'});loadZonas();}catch(e){errZ.style.display='block';errZ.textContent=e.message;}}},'×'));chipsWrap.appendChild(chip);});const addBtn=el('button',{class:'bsm',style:{fontSize:'11px'},onclick:async()=>{try{addBtn.disabled=true;addBtn.textContent='…';await api('/mesas',{method:'POST',body:{zona_id:z.id,numero:nextNum}});await loadZonas();}catch(e){errZ.style.display='block';errZ.textContent=e.message;addBtn.disabled=false;addBtn.textContent='+ Mesa '+nextNum;}}},'+ Mesa '+nextNum);const card=el('div',{class:'card',style:{marginBottom:'10px'}},el('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'10px'}},el('div',{style:{fontWeight:600,fontSize:'14px'}},z.nombre),el('div',{style:{display:'flex',gap:'6px',alignItems:'center'}},el('span',{style:{fontSize:'11px',color:'#6B5F52',fontFamily:"'JetBrains Mono',monospace"}},mesas.length+' mesa'+(mesas.length!==1?'s':'')),el('button',{class:'bd',onclick:async()=>{if(!confirm('Borrar zona “'+z.nombre+'”?'))return;try{await api('/zonas/'+z.id,{method:'DELETE'});loadZonas();}catch(e){errZ.style.display='block';errZ.textContent=e.message;}}},'Borrar zona'))),chipsWrap,errZ,addBtn);wrap.appendChild(card);});if(STATE.zonaCreating){let nv='';const ni=el('input',{style:{flex:1},placeholder:'ej. Terraza',autofocus:'true',oninput:e=>nv=e.target.value});const nb=el('button',{class:'bp',onclick:async()=>{if(!nv.trim())return;nb.disabled=true;nb.innerHTML='<span class=spin></span>';try{await api('/zonas',{method:'POST',body:{nombre:nv.trim()}});set({zonaCreating:false});loadZonas();}catch(e){nb.disabled=false;nb.textContent='Crear';}}},'Crear');ni.addEventListener('keydown',e=>{if(e.key==='Enter')nb.click();if(e.key==='Escape')set({zonaCreating:false});});wrap.appendChild(el('div',{class:'card',style:{border:'1px solid #D9442B',display:'flex',gap:'8px',alignItems:'center'}},el('span',{style:{fontSize:'12px',color:'#6B5F52',flexShrink:0}},'Nombre de la zona'),ni,nb,el('button',{class:'bs',onclick:()=>set({zonaCreating:false})},'Cancelar')));}if(!STATE.zonaCreating)wrap.appendChild(el('button',{class:'bp',style:{marginTop:'4px'},onclick:()=>set({zonaCreating:true})},'+ Nueva zona'));return wrap;}
function buildDeviceForm(device){const isEdit=!!device.id;let form={nombre:device.nombre||'',tipo:device.tipo||'cashdro',ip_local:device.ip_local||'',puerto:device.puerto||'',bridge_token_id:device.bridge_token_id||'',activo:device.activo!==false,config:device.config_json||{}};const errD=el('div',{class:'err',style:{display:'none'}});const configWrap=el('div');function renderConfig(){configWrap.innerHTML='';const cfg=DEVICE_TIPOS[form.tipo]||DEVICE_TIPOS.cashdro;cfg.fields.forEach(f=>{const row=el('div',{style:{marginBottom:'8px'}});row.appendChild(el('div',{class:'lbl'},f.l));if(f.type==='bool'){const check=el('input',{type:'checkbox'});check.checked=!!form.config[f.k];check.onchange=e=>form.config[f.k]=e.target.checked;row.appendChild(check);}else{const inp=el('input',{type:f.type||'text',style:{width:'100%'},placeholder:f.ph||'',value:form.config[f.k]||''});inp.oninput=e=>form.config[f.k]=e.target.value;row.appendChild(inp);}configWrap.appendChild(row);});}renderConfig();const tipoSel=el('select',{style:{width:'100%'},onchange:e=>{form.tipo=e.target.value;form.config={};renderConfig();}});Object.entries(DEVICE_TIPOS).forEach(([k,v])=>{const o=el('option',{value:k},(v.icon||'')+' '+v.l);if(k===form.tipo)o.selected=true;tipoSel.appendChild(o);});const agentSel=el('select',{style:{width:'100%'}});agentSel.appendChild(el('option',{value:''},'— sin agente —'));STATE.agents.forEach(a=>{const o=el('option',{value:a.id},a.nombre);if(a.id===form.bridge_token_id)o.selected=true;agentSel.appendChild(o);});agentSel.onchange=e=>form.bridge_token_id=e.target.value;const saveBtn=el('button',{class:'bp',onclick:async()=>{if(!form.nombre.trim()){errD.style.display='block';errD.textContent='El nombre es obligatorio';return;}saveBtn.disabled=true;saveBtn.innerHTML='<span class=spin></span>';errD.style.display='none';const payload={nombre:form.nombre,tipo:form.tipo,ip_local:form.ip_local||null,puerto:parseInt(form.puerto)||null,bridge_token_id:form.bridge_token_id||null,activo:form.activo,config_json:form.config};try{if(isEdit){await api('/bridge-devices/'+device.id,{method:'PATCH',body:payload});}else{await api('/bridge-devices',{method:'POST',body:payload});}set({hwCreating:false,hwEditId:null});loadHW();}catch(e){errD.style.display='block';errD.textContent=e.message;saveBtn.disabled=false;saveBtn.textContent=isEdit?'Guardar':'Añadir';}}},isEdit?'Guardar':'Añadir');const activaRow=el('div',{style:{display:'flex',alignItems:'center',gap:'10px',marginBottom:'14px'}});function ra(){activaRow.innerHTML='';activaRow.appendChild(Toggle(form.activo,v=>{form.activo=v;ra();}));activaRow.appendChild(el('span',{style:{fontSize:'12px',color:'#6B5F52'}},form.activo?'Activo':'Desactivado'));}ra();return el('div',{class:'card',style:{border:'1px solid #D9442B',marginBottom:'12px'}},el('div',{style:{fontWeight:600,fontSize:'12px',textTransform:'uppercase',letterSpacing:'.5px',color:'#D9442B',marginBottom:'14px'}},isEdit?'Editar':'Nuevo dispositivo'),el('div',{style:{marginBottom:'8px'}},el('div',{class:'lbl'},'Tipo'),tipoSel),el('div',{style:{marginBottom:'8px'}},el('div',{class:'lbl'},'Nombre'),el('input',{style:{width:'100%'},value:form.nombre,placeholder:'ej. Cashdro barra',oninput:e=>form.nombre=e.target.value})),el('div',{class:'grid2',style:{marginBottom:'8px'}},el('div',null,el('div',{class:'lbl'},'IP local'),el('input',{style:{width:'100%'},value:form.ip_local,placeholder:'192.168.1.x',oninput:e=>form.ip_local=e.target.value})),el('div',null,el('div',{class:'lbl'},'Puerto'),el('input',{type:'number',style:{width:'100%'},value:form.puerto,placeholder:'9100',oninput:e=>form.puerto=e.target.value}))),el('div',{style:{marginBottom:'8px'}},el('div',{class:'lbl'},'Agente'),agentSel),configWrap,activaRow,errD,el('div',{style:{display:'flex',gap:'8px',marginTop:'8px'}},saveBtn,el('button',{class:'bs',onclick:()=>set({hwCreating:false,hwEditId:null})},'Cancelar')));}
function renderHardware(){const wrap=el('div');wrap.appendChild(el('div',{class:'stitle'},'Hardware Bridge'));wrap.appendChild(el('div',{class:'ssub'},'Periféricos físicos del local.'));wrap.appendChild(el('div',{class:'section-h'},'Agentes Bridge'));STATE.agents.forEach(a=>{const mins=a.ultimo_ping?(Date.now()-new Date(a.ultimo_ping).getTime())/60000:Infinity;const color=mins<5?'#3F7D44':mins<30?'#E8A33B':'#6B5F52';wrap.appendChild(el('div',{class:'card',style:{display:'grid',gridTemplateColumns:'auto 1fr auto',gap:'12px',alignItems:'center',marginBottom:'6px'}},el('span',{class:'hdot',style:{background:color}}),el('div',null,el('div',{style:{fontWeight:600}},a.nombre),a.ultimo_ping&&el('div',{style:{fontSize:'11px',color:color,marginTop:'2px'}},(mins<5?'en línea':mins<30?'reciente':'sin señal')+' · '+new Date(a.ultimo_ping).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}))),el('button',{class:'bd',onclick:async()=>{if(!confirm('Borrar agente?'))return;await api('/bridge-agents/'+a.id,{method:'DELETE'});loadHW();}},'Borrar')));});if(STATE.agCreating){const ni=el('div',{class:'card',style:{border:'1px solid #D9442B',marginBottom:'8px'}},el('div',{style:{fontWeight:600,fontSize:'12px',textTransform:'uppercase',color:'#D9442B',marginBottom:'10px'}},'Nuevo agente'),el('div',{class:'lbl'},'Nombre'),el('input',{id:'ag-nombre',style:{width:'100%',marginBottom:'10px'},placeholder:'ej. Agente barra'}),el('div',{style:{display:'flex',gap:'8px'}},el('button',{class:'bp',onclick:async()=>{const n=document.getElementById('ag-nombre').value;if(!n.trim())return;const d=await api('/bridge-agents',{method:'POST',body:{nombre:n}});alert('Token generado (guárdalo ahora):\\n\\n'+d.token);set({agCreating:false});loadHW();}},"Generar token"),el('button',{class:'bs',onclick:()=>set({agCreating:false})},'Cancelar')));wrap.appendChild(ni);}if(!STATE.agCreating)wrap.appendChild(el('button',{class:'bsm',style:{marginBottom:'16px'},onclick:()=>set({agCreating:true})},'+ Nuevo agente'));wrap.appendChild(el('div',{class:'section-h'},'Impresoras'));if(!STATE.impresoras.length)wrap.appendChild(el('div',{style:{fontSize:'12px',color:'#6B5F52',marginBottom:'12px'}},'Sin impresoras configuradas.'));STATE.impresoras.forEach(imp=>{wrap.appendChild(el('div',{class:'card',style:{display:'flex',gap:'10px',alignItems:'center',marginBottom:'6px'}},el('span',{class:'hdot',style:{background:imp.activa?'#3F7D44':'#D8CDB6'}}),el('div',{style:{flex:1}},el('div',{style:{fontWeight:600}},imp.nombre),el('div',{style:{fontSize:'11px',color:'#6B5F52'}},imp.connection_type||'—',(imp.ip_address?' · '+imp.ip_address:''))),imp.modelo&&el('div',{class:'mono',style:{fontSize:'11px',color:'#6B5F52'}},imp.modelo)));});wrap.appendChild(el('div',{class:'section-h'},'Dispositivos (Bridge)'));if(STATE.hwCreating)wrap.appendChild(buildDeviceForm({tipo:'cashdro'}));STATE.devices.forEach(d=>{if(STATE.hwEditId===d.id){wrap.appendChild(buildDeviceForm(d));return;}const cfg=DEVICE_TIPOS[d.tipo]||{icon:'🔧',l:d.tipo};const pingBtn=el('button',{class:'bsm',onclick:async()=>{pingBtn.disabled=true;pingBtn.textContent='…';try{const r=await api('/bridge-devices/'+d.id+'/ping',{method:'POST'});pingBtn.textContent='✓ '+r.latencia_ms+'ms';setTimeout(()=>{pingBtn.textContent='Ping';pingBtn.disabled=false;},3000);loadHW();}catch(e){pingBtn.textContent='Error';pingBtn.disabled=false;}}},'Ping');wrap.appendChild(el('div',{class:'card',style:{display:'flex',gap:'12px',alignItems:'flex-start',marginBottom:'6px'}},el('div',{style:{fontSize:'18px',paddingTop:'1px'}},cfg.icon||'🔧'),el('div',{style:{flex:1}},el('div',{style:{display:'flex',alignItems:'center',gap:'8px',marginBottom:'3px'}},el('span',{class:'hdot',style:{background:d.ultimo_estado==='ok'?'#3F7D44':d.ultimo_estado==='error'?'#D9442B':'#D8CDB6'}}),el('span',{style:{fontWeight:600}},d.nombre),el('span',{class:'mono',style:{fontSize:'10px',background:'#EFE7D6',padding:'1px 5px',borderRadius:'2px',color:'#6B5F52'}},cfg.l||d.tipo)),el('div',{style:{fontSize:'11px',color:'#6B5F52'}},d.ip_local&&(d.ip_local+(d.puerto?':'+d.puerto:'')))),el('div',{style:{display:'flex',gap:'6px',flexShrink:0}},pingBtn,el('button',{class:'bsm',onclick:()=>set({hwEditId:d.id})},'Editar'),el('button',{class:'bd',onclick:async()=>{if(!confirm('Borrar?'))return;await api('/bridge-devices/'+d.id,{method:'DELETE'});loadHW();}},'Borrar'))));});if(!STATE.hwCreating)wrap.appendChild(el('button',{class:'bp',style:{marginTop:'4px'},onclick:()=>set({hwCreating:true,hwEditId:null})},'+ Añadir dispositivo'));return wrap;}
function render(){const app=document.getElementById('app');app.innerHTML='';if(!STATE.user){app.appendChild(renderLogin());return;}app.appendChild(el('div',{class:'hdr'},el('div',{style:{display:'flex',alignItems:'center',gap:'12px'}},el('div',{style:{fontFamily:'Newsreader,serif',fontStyle:'italic',fontSize:'18px',color:'#F6F1E7'}},'ia.',el('span',{style:{color:'#D9442B'}},'rest')),el('span',{class:'badge'},'OWNER'),el('span',{class:'mono',style:{fontSize:'12px',color:'#6B5F52'}},'Panel')),el('div',{style:{display:'flex',alignItems:'center',gap:'12px'}},el('button',{class:'bs',style:{fontSize:'11px',padding:'4px 10px'},onclick:()=>set({user:null,reglas:[],camareros:[],agents:[],devices:[],impresoras:[],zonas:[]})},'Salir'))));app.appendChild(el('div',{class:'tabs'},...[['reglas','⚡ Reglas'],['log','📋 Historial'],['mesas','🫞 Mesas'],['hardware','🔧 Hardware']].map(([t,l])=>el('button',{class:'tab'+(STATE.tab===t?' on':''),onclick:()=>{if(t==='hardware'&&!STATE.agents.length)loadHW();if(t==='mesas'&&!STATE.zonas.length)loadZonas();set({tab:t});}},l))));const content=el('div',{class:'wrap'});if(STATE.loading){content.appendChild(el('div',{style:{color:'#6B5F52',fontSize:'12px'}},el('span',{class:'spin'}),' cargando…'));}else if(STATE.tab==='reglas'){content.appendChild(el('div',{class:'stitle'},'Reglas de alerta'));content.appendChild(el('div',{class:'ssub'},'El cron evalúa cada 2 min · dedup 15 min'));if(STATE.creating)content.appendChild(buildForm({alerta_condiciones:[]}));STATE.reglas.forEach(r=>content.appendChild(renderReglaCard(r)));if(!STATE.reglas.length&&!STATE.creating)content.appendChild(el('div',{class:'card',style:{textAlign:'center',padding:'32px',color:'#6B5F52'}},'⚡ Sin reglas todavía'));if(!STATE.creating)content.appendChild(el('button',{class:'bp',style:{marginTop:'4px'},onclick:()=>set({creating:true,editId:null})},'+ Nueva regla'));}else if(STATE.tab==='log'){content.appendChild(el('div',{class:'stitle'},'Historial de alertas'));content.appendChild(el('div',{class:'ssub'},'Últimas 50 alertas disparadas'));content.appendChild(renderLog());}else if(STATE.tab==='mesas'){content.appendChild(renderMesas());}else{content.appendChild(renderHardware());}app.appendChild(content);}
render();
</script></body></html>`;
}
