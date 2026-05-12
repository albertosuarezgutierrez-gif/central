import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function autorizado(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${secret}`
}

function aplicaHorario(regla: ReglaActiva, ahora: Date): boolean {
  if (!regla.horario_desde && !regla.horario_hasta) return true
  const hhmm = ahora.getHours() * 60 + ahora.getMinutes()
  const [dh, dm] = (regla.horario_desde ?? '00:00').split(':').map(Number)
  const [hh, hm] = (regla.horario_hasta ?? '23:59').split(':').map(Number)
  return hhmm >= dh * 60 + dm && hhmm <= hh * 60 + hm
}

function aplicaDias(regla: ReglaActiva, ahora: Date): boolean {
  if (!regla.dias_semana || regla.dias_semana.length === 0) return true
  const jsDay = ahora.getDay()
  const day = jsDay === 0 ? 7 : jsDay
  return regla.dias_semana.includes(day)
}

function interpolarMensaje(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? k))
}

async function yaAlertado(
  supabase: ReturnType<typeof createServerClient>,
  rid: string, condicion: string, ref: string, ventanaMin = 30
): Promise<boolean> {
  const hace = new Date(Date.now() - ventanaMin * 60_000).toISOString()
  const { data } = await supabase
    .from('alerta_log').select('id')
    .eq('restaurante_id', rid)
    .eq('referencia_id', ref)
    .gte('disparada_at', hace).limit(1)
  return (data?.length ?? 0) > 0
}

async function sendPush(rid: string, title: string, body: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://www.iarest.es'
  await fetch(`${base}/api/push/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-ia-restaurante-id': rid },
    body: JSON.stringify({ title, body }),
  }).catch(e => console.error('[CRON push]', e))
}

async function registrar(
  supabase: ReturnType<typeof createServerClient>,
  rid: string, regla: ReglaActiva, ref: string, mensaje: string
) {
  await supabase.from('alerta_log').insert({
    restaurante_id: rid,
    regla_id: regla.id ?? null,
    regla_nombre: regla.nombre ?? '',
    referencia_id: ref,
    trigger_tipos: [regla.condicion ?? 'sin_comanda'],
    contexto: { ref, mensaje },
    mensaje_voz: mensaje,
    disparada_at: new Date().toISOString(),
    leida: false,
  })
  console.log(`[CRON] ${regla.condicion}:${ref} → ${mensaje}`)
}

interface ReglaActiva {
  id?: string; restaurante_id: string; nombre?: string
  condicion?: string; tipo?: string; objeto?: string
  umbral_minutos?: number; threshold_min?: number
  horario_desde?: string | null; horario_hasta?: string | null
  dias_semana?: number[] | null; zona_ids?: string[] | null
  destinatario?: string; partida_id?: string | null
  accion?: string; mensaje?: string | null
  escalar_a?: string | null; escalar_minutos?: number | null
  prioridad?: number
}

function getUmbral(r: ReglaActiva): number {
  return r.umbral_minutos ?? r.threshold_min ?? 10
}
function getCond(r: ReglaActiva): string {
  return r.condicion ?? r.tipo ?? 'sin_comanda'
}

async function evalSinComanda(supabase: ReturnType<typeof createServerClient>, rid: string, regla: ReglaActiva, alertas: string[]) {
  const hace = new Date(Date.now() - getUmbral(regla) * 60_000).toISOString()
  const { data: mesas } = await supabase.from('mesas').select('id, codigo, ultima_comanda')
    .eq('restaurante_id', rid).in('estado', ['activa','marchar','aviso','urgente','cuenta'])
    .lt('ultima_comanda', hace).not('ultima_comanda', 'is', null)
  for (const mesa of mesas ?? []) {
    const ref = `sin_comanda_${mesa.id}`
    if (await yaAlertado(supabase, rid, getCond(regla), ref)) continue
    const min = Math.floor((Date.now() - new Date(mesa.ultima_comanda).getTime()) / 60_000)
    const msg = interpolarMensaje(regla.mensaje ?? 'Mesa {mesa} lleva {tiempo} min sin pedir', { mesa: mesa.codigo, tiempo: min })
    await sendPush(rid, regla.nombre ?? 'Mesa sin atender', msg)
    await registrar(supabase, rid, regla, ref, msg)
    alertas.push(`sin_comanda:${mesa.codigo}`)
  }
}

async function evalPlatoSinLlegar(supabase: ReturnType<typeof createServerClient>, rid: string, regla: ReglaActiva, alertas: string[]) {
  const hace = new Date(Date.now() - getUmbral(regla) * 60_000).toISOString()
  const { data: items } = await supabase.from('comanda_items').select('id, nombre, created_at, comanda_id')
    .eq('estado', 'pendiente').lt('created_at', hace)
  for (const it of items ?? []) {
    const { data: comanda } = await supabase.from('comandas').select('restaurante_id, mesa:mesas(codigo)')
      .eq('id', it.comanda_id).eq('restaurante_id', rid).single()
    if (!comanda) continue
    const ref = `plato_sin_llegar_${it.id}`
    if (await yaAlertado(supabase, rid, getCond(regla), ref)) continue
    const min = Math.floor((Date.now() - new Date(it.created_at).getTime()) / 60_000)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mesaCodigo = (comanda.mesa as any)?.codigo ?? '?'
    const msg = interpolarMensaje(regla.mensaje ?? 'Mesa {mesa} lleva {tiempo} min esperando {plato}', { mesa: mesaCodigo, tiempo: min, plato: it.nombre })
    await sendPush(rid, regla.nombre ?? 'Plato sin llegar', msg)
    await registrar(supabase, rid, regla, ref, msg)
    alertas.push(`plato_sin_llegar:${it.nombre}`)
  }
}

async function evalTicketSinTocar(supabase: ReturnType<typeof createServerClient>, rid: string, regla: ReglaActiva, alertas: string[]) {
  const hace = new Date(Date.now() - getUmbral(regla) * 60_000).toISOString()
  const { data: items } = await supabase.from('comanda_items').select('id, nombre, created_at, comanda_id')
    .eq('estado', 'pendiente').lt('created_at', hace)
  for (const it of items ?? []) {
    const { data: comanda } = await supabase.from('comandas').select('restaurante_id, mesa:mesas(codigo)')
      .eq('id', it.comanda_id).eq('restaurante_id', rid).single()
    if (!comanda) continue
    const ref = `ticket_sin_tocar_${it.id}`
    if (await yaAlertado(supabase, rid, getCond(regla), ref)) continue
    const min = Math.floor((Date.now() - new Date(it.created_at).getTime()) / 60_000)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mesaCodigo = (comanda.mesa as any)?.codigo ?? '?'
    const msg = interpolarMensaje(regla.mensaje ?? 'Ticket {mesa} lleva {tiempo} min en cocina sin tocar', { mesa: mesaCodigo, tiempo: min, plato: it.nombre })
    await sendPush(rid, regla.nombre ?? 'KDS atascado', msg)
    await registrar(supabase, rid, regla, ref, msg)
    alertas.push(`ticket_sin_tocar:${it.nombre}`)
  }
}

async function evalCuentaSinCobrar(supabase: ReturnType<typeof createServerClient>, rid: string, regla: ReglaActiva, alertas: string[]) {
  const hace = new Date(Date.now() - getUmbral(regla) * 60_000).toISOString()
  const { data: cuentas } = await supabase.from('comandas').select('id, created_at, mesa:mesas(codigo)')
    .eq('restaurante_id', rid).eq('tipo', 'cuenta').eq('estado', 'nueva').lt('created_at', hace)
  for (const c of cuentas ?? []) {
    const ref = `cuenta_sin_cobrar_${c.id}`
    if (await yaAlertado(supabase, rid, getCond(regla), ref)) continue
    const min = Math.floor((Date.now() - new Date(c.created_at).getTime()) / 60_000)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mesaCodigo = (c.mesa as any)?.codigo ?? '?'
    const msg = interpolarMensaje(regla.mensaje ?? 'Mesa {mesa} lleva {tiempo} min esperando cobro', { mesa: mesaCodigo, tiempo: min })
    await sendPush(rid, regla.nombre ?? 'Cuenta sin cobrar', msg)
    await registrar(supabase, rid, regla, ref, msg)
    alertas.push(`cuenta_sin_cobrar:${mesaCodigo}`)
  }
}

async function evalRotacionLarga(supabase: ReturnType<typeof createServerClient>, rid: string, regla: ReglaActiva, alertas: string[]) {
  const hace = new Date(Date.now() - getUmbral(regla) * 60_000).toISOString()
  const { data: mesas } = await supabase.from('mesas').select('id, codigo, updated_at')
    .eq('restaurante_id', rid).in('estado', ['activa','marchar','aviso','urgente','cuenta']).lt('updated_at', hace)
  for (const mesa of mesas ?? []) {
    const ref = `rotacion_larga_${mesa.id}`
    if (await yaAlertado(supabase, rid, getCond(regla), ref, 60)) continue
    const min = Math.floor((Date.now() - new Date(mesa.updated_at).getTime()) / 60_000)
    const msg = interpolarMensaje(regla.mensaje ?? 'Mesa {mesa} lleva {tiempo} min ocupada', { mesa: mesa.codigo, tiempo: min })
    await sendPush(rid, regla.nombre ?? 'Mesa larga', msg)
    await registrar(supabase, rid, regla, ref, msg)
    alertas.push(`rotacion_larga:${mesa.codigo}`)
  }
}

async function evalCuentasSimultaneas(supabase: ReturnType<typeof createServerClient>, rid: string, regla: ReglaActiva, alertas: string[]) {
  const hace5m = new Date(Date.now() - 5 * 60_000).toISOString()
  const { data: cuentas } = await supabase.from('comandas').select('id')
    .eq('restaurante_id', rid).eq('tipo', 'cuenta').gte('created_at', hace5m)
  const n = cuentas?.length ?? 0
  if (n >= getUmbral(regla)) {
    const ref = `cuentas_simultaneas_${Math.floor(Date.now() / (5 * 60_000))}`
    if (await yaAlertado(supabase, rid, getCond(regla), ref)) return
    const msg = interpolarMensaje(regla.mensaje ?? '{n} mesas pidieron cuenta en los últimos 5 min', { n })
    await sendPush(rid, regla.nombre ?? 'Pico de cuentas', msg)
    await registrar(supabase, rid, regla, ref, msg)
    alertas.push(`cuentas_simultaneas:${n}`)
  }
}

async function evalRegla(supabase: ReturnType<typeof createServerClient>, rid: string, regla: ReglaActiva, ahora: Date, alertas: string[]) {
  if (!aplicaHorario(regla, ahora)) return
  if (!aplicaDias(regla, ahora)) return
  switch (getCond(regla)) {
    case 'sin_comanda': case 'espera_larga':
      await evalSinComanda(supabase, rid, regla, alertas); break
    case 'plato_sin_llegar':
      await evalPlatoSinLlegar(supabase, rid, regla, alertas); break
    case 'ticket_sin_tocar': case 'kds_atascado':
      await evalTicketSinTocar(supabase, rid, regla, alertas); break
    case 'cuenta_sin_cobrar':
      await evalCuentaSinCobrar(supabase, rid, regla, alertas); break
    case 'rotacion_larga':
      await evalRotacionLarga(supabase, rid, regla, alertas); break
    case 'cuentas_simultaneas':
      await evalCuentasSimultaneas(supabase, rid, regla, alertas); break
    default:
      console.warn('[CRON] condición desconocida:', getCond(regla))
  }
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createServerClient()
  const ahora = new Date()
  const alertasEnviadas: string[] = []
  try {
    const { data: reglas } = await supabase.from('alerta_reglas').select('*').eq('activa', true)
    if (!reglas?.length) return NextResponse.json({ ok: true, alertas: [] })
    const porRestaurante = new Map<string, ReglaActiva[]>()
    for (const r of reglas as ReglaActiva[]) {
      if (!porRestaurante.has(r.restaurante_id)) porRestaurante.set(r.restaurante_id, [])
      porRestaurante.get(r.restaurante_id)!.push(r)
    }
    for (const [rid, reglasR] of porRestaurante) {
      const ordenadas = reglasR.sort((a, b) => (a.prioridad ?? 0) - (b.prioridad ?? 0))
      for (const regla of ordenadas) {
        await evalRegla(supabase, rid, regla, ahora, alertasEnviadas)
      }
    }
    console.log('[CRON alertas]', alertasEnviadas.length, 'enviadas:', alertasEnviadas)
    return NextResponse.json({ ok: true, alertas: alertasEnviadas, ts: ahora.toISOString() })
  } catch (err) {
    console.error('[CRON alertas] error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
