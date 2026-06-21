// ia.rest · alerta-ritmo-cron v3 (local_id)
// Evaluador de reglas + mensajes de voz naturales + push real

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)
const PUSH_URL = Deno.env.get('SUPABASE_URL')!.replace(/\/$/, '') + '/functions/v1/push-send'
const SRK     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const DEDUP_MIN = 15

function generarMensajeVoz(
  triggerTipos: string[],
  mesaCodigo: string | null,
  contexto: Record<string, unknown>
): string {
  const mesa = mesaCodigo ? `Mesa ${mesaCodigo}` : null
  const tipo = triggerTipos[0] ?? ''

  const minSinPedir    = contexto['min sin pedir']     as number | undefined
  const minCuenta      = contexto['min esperando cuenta'] as number | undefined
  const minTotal       = contexto['min ocupada']        as number | undefined
  const latencia       = contexto['latencia media ms']  as number | undefined

  if (triggerTipos.includes('ticket_sin_marcar') && triggerTipos.includes('mesa_tiempo_total')) {
    return mesa
      ? `${mesa}, urgente: llevan esperando la comanda más de ${minTotal ?? 60} minutos y cocina no ha sacado nada. Ve a reclamar.`
      : 'Atención: cocina con retraso importante en una mesa que lleva mucho tiempo.'
  }

  switch (tipo) {
    case 'mesa_sin_pedir':
      return mesa
        ? `${mesa}, llevan ${minSinPedir ?? 10} minutos sin pedir nada. Acércate.`
        : `Hay una mesa sin pedir desde hace ${minSinPedir ?? 10} minutos.`
    case 'ticket_sin_marcar':
      return mesa
        ? `${mesa}, tu comanda lleva más de ${Math.round((contexto['items sin marcar'] as number ?? 12))} minutos en cocina sin salir. Ve a reclamar.`
        : 'Atención: hay comandas en cocina con retraso. Recuerda reclamar.'
    case 'esperando_cuenta':
      return mesa
        ? `${mesa} lleva ${minCuenta ?? 5} minutos esperando cobrar. Pasa a cobrar ya.`
        : 'Una mesa está esperando cobrar. Pasa a atenderles.'
    case 'mesa_tiempo_total':
      return mesa
        ? `${mesa} lleva más de ${minTotal ?? 90} minutos ocupada. Revísala.`
        : `Una mesa lleva más de ${minTotal ?? 90} minutos. Revísala.`
    case 'mesa_sin_camarero':
      return mesa
        ? `${mesa} está ocupada y no tiene camarero asignado. ¿Quien la atiende?`
        : 'Hay una mesa sin camarero asignado.'
    case 'solo_bebidas':
      return mesa
        ? `${mesa} solo ha pedido bebidas. Quizás quieran comer algo. Acércate.`
        : 'Una mesa solo ha pedido bebidas. ¿Les ofreces algo de comer?'
    case 'num_items_bajo':
      return mesa
        ? `${mesa} ha pedido muy pocos platos. Puedes sugerirles algo más.`
        : 'Una mesa tiene pocos items pedidos.'
    case 'importe_bajo':
      return mesa
        ? `${mesa} lleva un ticket bajo. Puedes sugerirles postre o bebida.`
        : 'Una mesa tiene ticket bajo. Sugiere algo más.'
    case 'producto_86_frecuente':
      return 'Aviso para sala: hay productos que se han agotado varias veces hoy. No los ofrecéis hasta que cocina confirme existencias.'
    case 'latencia_alta':
      return `Aviso técnico: la latencia del sistema está alta, ${Math.round((latencia ?? 0) / 1000)} segundos. Revisad la conexión.`
    default:
      return mesa ? `Atención con ${mesa}.` : 'Atención, hay una alerta activa.'
  }
}

function generarTituloPush(triggerTipos: string[], mesaCodigo: string | null): string {
  const mesa = mesaCodigo ? `Mesa ${mesaCodigo}` : 'Alerta'
  const tipo = triggerTipos[0] ?? ''
  if (triggerTipos.includes('ticket_sin_marcar') && triggerTipos.includes('mesa_tiempo_total')) return `${mesa} — urgente`
  switch (tipo) {
    case 'mesa_sin_pedir':       return `${mesa} — sin pedir`
    case 'ticket_sin_marcar':    return `${mesa} — reclamar a cocina`
    case 'esperando_cuenta':     return `${mesa} — cobrar`
    case 'mesa_tiempo_total':    return `${mesa} — mesa larga`
    case 'mesa_sin_camarero':    return `${mesa} — sin camarero`
    case 'producto_86_frecuente': return '⚠️ Producto agotado'
    case 'latencia_alta':        return '⚠️ Sistema lento'
    default: return mesa
  }
}

function minDesde(ts: string | null): number {
  if (!ts) return Infinity
  return (Date.now() - new Date(ts).getTime()) / 60000
}

function enHorario(desde: string | null, hasta: string | null): boolean {
  if (!desde || !hasta) return true
  const now   = new Date()
  const hhmm  = now.getHours() * 60 + now.getMinutes()
  const [dh, dm] = desde.split(':').map(Number)
  const [hh, hm] = hasta.split(':').map(Number)
  const d = dh * 60 + dm, h = hh * 60 + hm
  return d <= h ? hhmm >= d && hhmm <= h : hhmm >= d || hhmm <= h
}

async function getComandaIds(mesaId: string): Promise<string[]> {
  const { data } = await sb.from('comandas').select('id').eq('mesa_id', mesaId)
  return (data ?? []).map((c: {id: string}) => c.id)
}

async function yaAlertado(reglaId: string, mesaId: string | null): Promise<boolean> {
  const desde = new Date(Date.now() - DEDUP_MIN * 60 * 1000).toISOString()
  let q = sb.from('alerta_log').select('id', { count: 'exact', head: true }).eq('regla_id', reglaId).gte('disparada_at', desde)
  if (mesaId) q = q.eq('mesa_id', mesaId)
  const { count } = await q
  return (count ?? 0) > 0
}

async function getDestinatarios(regla: Record<string,unknown>, mesa: Record<string,unknown> | null): Promise<string[]> {
  const tipo = regla.destinatario_tipo as string
  const rid  = regla.local_id as string
  if (tipo === 'camarero_asignado') return mesa?.camarero_id ? [mesa.camarero_id as string] : []
  if (tipo === 'camarero_especifico') return regla.camarero_id ? [regla.camarero_id as string] : []
  if (tipo === 'todos_turno') {
    const { data } = await sb.from('camareros').select('id').eq('local_id', rid).in('rol', ['camarero','admin','owner'])
    return (data ?? []).map((c:{id:string}) => c.id)
  }
  if (tipo === 'owner') {
    const { data } = await sb.from('camareros').select('id').eq('local_id', rid).in('rol', ['owner','super_admin'])
    return (data ?? []).map((c:{id:string}) => c.id)
  }
  return []
}

interface Cond { tipo:string; umbral_min:number|null; umbral_valor:number|null; orden:number }
interface Mesa { id:string; codigo:string; estado:string; local_id:string; camarero_id:string|null; ocupada_desde:string|null; ultima_comanda:string|null }
interface CondResult { ok:boolean; ctx:Record<string,unknown> }

async function evalCondMesa(cond: Cond, mesa: Mesa): Promise<CondResult> {
  const um = cond.umbral_min ?? 10
  const uv = cond.umbral_valor ?? 3
  switch (cond.tipo) {
    case 'mesa_sin_pedir': {
      if (mesa.estado !== 'activa') return { ok:false, ctx:{} }
      const ref = mesa.ultima_comanda ?? mesa.ocupada_desde
      const mins = minDesde(ref)
      return { ok: mins >= um, ctx: { 'min sin pedir': Math.floor(mins) } }
    }
    case 'mesa_tiempo_total': {
      if (!mesa.ocupada_desde) return { ok:false, ctx:{} }
      const mins = minDesde(mesa.ocupada_desde)
      return { ok: mins >= um, ctx: { 'min ocupada': Math.floor(mins) } }
    }
    case 'esperando_cuenta': {
      const estados = ['cuenta','esperando_cuenta','pide_cuenta']
      if (!estados.includes(mesa.estado)) return { ok:false, ctx:{} }
      const mins = minDesde(mesa.ultima_comanda ?? mesa.ocupada_desde)
      return { ok: mins >= um, ctx: { 'min esperando cuenta': Math.floor(mins) } }
    }
    case 'mesa_sin_camarero': {
      if (mesa.estado !== 'activa' || mesa.camarero_id !== null) return { ok:false, ctx:{} }
      const mins = minDesde(mesa.ocupada_desde)
      return { ok: mins > 3, ctx: { 'min sin camarero': Math.floor(mins) } }
    }
    case 'ticket_sin_marcar': {
      const hace = new Date(Date.now() - um * 60 * 1000).toISOString()
      const ids  = await getComandaIds(mesa.id)
      if (!ids.length) return { ok:false, ctx:{} }
      const { count } = await sb.from('comanda_items').select('id',{count:'exact',head:true}).in('comanda_id',ids).eq('estado','pendiente').lt('created_at',hace)
      return { ok:(count??0)>0, ctx:{ 'items sin marcar': count??0 } }
    }
    case 'num_items_bajo': {
      if (mesa.estado !== 'activa') return { ok:false, ctx:{} }
      const ids = await getComandaIds(mesa.id)
      if (!ids.length) return { ok:true, ctx:{ 'items pedidos':0 } }
      const { count } = await sb.from('comanda_items').select('id',{count:'exact',head:true}).in('comanda_id',ids)
      return { ok:(count??0)<uv, ctx:{ 'items pedidos':count??0 } }
    }
    case 'importe_bajo': {
      if (mesa.estado !== 'activa') return { ok:false, ctx:{} }
      const ids = await getComandaIds(mesa.id)
      if (!ids.length) return { ok:true, ctx:{ 'importe €':0 } }
      const { data } = await sb.from('comanda_items').select('precio_unitario,cantidad').in('comanda_id',ids)
      const total = (data??[]).reduce((s:number, r:{precio_unitario:number;cantidad:number}) => s + (r.precio_unitario??0)*(r.cantidad??1), 0)
      return { ok:total<uv, ctx:{ 'importe €': Math.round(total*100)/100 } }
    }
    case 'solo_bebidas': {
      if (mesa.estado !== 'activa') return { ok:false, ctx:{} }
      const ids = await getComandaIds(mesa.id)
      if (!ids.length) return { ok:false, ctx:{} }
      const { data } = await sb.from('comanda_items').select('seccion_id').in('comanda_id',ids)
      if (!data?.length) return { ok:false, ctx:{} }
      const BEBER = ['bebidas','bar','bebida','drinks','barra']
      const solo = data.every((i:{seccion_id:string}) => BEBER.includes((i.seccion_id??'').toLowerCase()))
      return { ok:solo, ctx:{ 'items solo bebidas':data.length } }
    }
    default: return { ok:false, ctx:{} }
  }
}

async function evalCondGlobal(cond: Cond, rid: string): Promise<CondResult> {
  const uv = cond.umbral_valor ?? 3
  switch (cond.tipo) {
    case 'producto_86_frecuente': {
      const hoy = new Date(); hoy.setHours(0,0,0,0)
      const { data } = await sb.from('productos_86').select('producto_id').eq('local_id',rid).gte('created_at',hoy.toISOString())
      const m = new Map<string,number>()
      for (const r of data??[]) m.set(r.producto_id,(m.get(r.producto_id)??0)+1)
      const freq = [...m.values()].filter(c=>c>=uv)
      return { ok:freq.length>0, ctx:{ 'productos 86 frecuentes':freq.length } }
    }
    case 'latencia_alta': {
      const ms = (cond.umbral_valor??1)*1000
      const hace5 = new Date(Date.now()-5*60*1000).toISOString()
      const { data } = await sb.from('transcripciones').select('latencia_ms').eq('local_id',rid).gte('created_at',hace5).not('latencia_ms','is',null)
      if (!data?.length) return { ok:false, ctx:{} }
      const avg = data.reduce((s:number,r:{latencia_ms:number})=>s+r.latencia_ms,0)/data.length
      return { ok:avg>ms, ctx:{ 'latencia media ms':Math.round(avg) } }
    }
    default: return { ok:false, ctx:{} }
  }
}

const COND_GLOBAL = new Set(['producto_86_frecuente','latencia_alta'])

interface Regla { id:string; local_id:string; nombre:string; logica:'AND'|'OR'; horario_desde:string|null; horario_hasta:string|null; destinatario_tipo:string; camarero_id:string|null; canal_vox:boolean; canal_push:boolean; canal_hub:boolean; condiciones:Cond[] }
interface Match { mesa:Mesa|null; trigger_tipos:string[]; contexto:Record<string,unknown> }

async function evaluarRegla(regla: Regla, mesas: Mesa[]): Promise<Match[]> {
  const cG = regla.condiciones.filter(c=>COND_GLOBAL.has(c.tipo))
  const cM = regla.condiciones.filter(c=>!COND_GLOBAL.has(c.tipo))

  if (cG.length>0 && cM.length===0) {
    const res = await Promise.all(cG.map(c=>evalCondGlobal(c,regla.local_id)))
    const ok = regla.logica==='AND' ? res.every(r=>r.ok) : res.some(r=>r.ok)
    if (!ok) return []
    return [{ mesa:null, trigger_tipos:cG.filter((_,i)=>res[i].ok).map(c=>c.tipo), contexto:Object.assign({},...res.filter(r=>r.ok).map(r=>r.ctx)) }]
  }

  const matches: Match[] = []
  const resG = cG.length>0 ? await Promise.all(cG.map(c=>evalCondGlobal(c,regla.local_id))) : []

  for (const mesa of mesas) {
    if (mesa.estado==='libre') continue
    const resM = await Promise.all(cM.map(c=>evalCondMesa(c,mesa)))
    const todos = [...resM, ...resG]
    const condTodas = [...cM, ...cG]
    const ok = regla.logica==='AND' ? todos.every(r=>r.ok) : todos.some(r=>r.ok)
    if (!ok) continue
    const cumplidas = condTodas.filter((_,i)=>todos[i].ok)
    matches.push({ mesa, trigger_tipos:cumplidas.map(c=>c.tipo), contexto:Object.assign({},...todos.filter(r=>r.ok).map(r=>r.ctx)) })
  }
  return matches
}

async function enviarPush(camarero_ids: string[], title: string, body: string, mensaje_voz: string) {
  if (!camarero_ids.length) return
  await fetch(PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${SRK}` },
    body: JSON.stringify({ camarero_ids, title, body, mensaje_voz }),
  }).catch(e => console.error('[push]', e))
}

Deno.serve(async () => {
  try {
    const { data: raw, error } = await sb.from('alerta_reglas')
      .select('id,local_id,nombre,logica,horario_desde,horario_hasta,destinatario_tipo,camarero_id,canal_vox,canal_push,canal_hub,alerta_condiciones(tipo,umbral_min,umbral_valor,orden)')
      .eq('activa', true)
    if (error) throw error
    if (!raw?.length) return new Response('ok-no-rules',{status:200})

    const reglas: Regla[] = raw.map((r:Record<string,unknown>)=>({ ...r, condiciones:((r.alerta_condiciones as Cond[])??[]).sort((a,b)=>a.orden-b.orden) }))
    const rids = [...new Set(reglas.map(r=>r.local_id))]
    const { data: mesasRaw } = await sb.from('mesas').select('id,codigo,estado,local_id,camarero_id,ocupada_desde,ultima_comanda').in('local_id',rids).neq('estado','libre')
    const porR = new Map<string,Mesa[]>()
    for (const m of mesasRaw??[]) { if(!porR.has(m.local_id))porR.set(m.local_id,[]); porR.get(m.local_id)!.push(m) }

    const disparadas: string[] = []

    for (const regla of reglas) {
      if (!regla.condiciones.length) continue
      if (!enHorario(regla.horario_desde, regla.horario_hasta)) continue
      const mesas = porR.get(regla.local_id) ?? []
      const matches = await evaluarRegla(regla, mesas)

      for (const match of matches) {
        const mesaId   = match.mesa?.id ?? null
        const mesaCod  = match.mesa?.codigo ?? null
        if (await yaAlertado(regla.id, mesaId)) continue

        const destinatarios = await getDestinatarios(regla as unknown as Record<string,unknown>, match.mesa as unknown as Record<string,unknown>)
        const mensaje_voz   = generarMensajeVoz(match.trigger_tipos, mesaCod, match.contexto)
        const titulo_push   = generarTituloPush(match.trigger_tipos, mesaCod)

        if (regla.canal_push) await enviarPush(destinatarios, titulo_push, mensaje_voz, mensaje_voz)

        await sb.from('alerta_log').insert({
          local_id: regla.local_id,
          regla_id: regla.id,
          regla_nombre: regla.nombre,
          mesa_id: mesaId,
          camarero_notificado_id: destinatarios[0] ?? null,
          trigger_tipos: match.trigger_tipos,
          contexto: match.contexto,
          mensaje_voz,
        })

        const label = match.mesa ? `${regla.nombre} → ${mesaCod}` : regla.nombre
        disparadas.push(label)
        console.log(`[alerta] ${label} | VOZ: ${mensaje_voz}`)
      }
    }

    return new Response(JSON.stringify({ ok:true, total:disparadas.length, alertas:disparadas }),{status:200,headers:{'Content-Type':'application/json'}})
  } catch(err) {
    console.error('[alerta-ritmo-cron]', err)
    return new Response(JSON.stringify({error:String(err)}),{status:500})
  }
})
