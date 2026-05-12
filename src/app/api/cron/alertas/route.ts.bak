import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Vercel Cron autentifica con CRON_SECRET en el header Authorization
function autorizado(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true // dev local sin secret → permitir
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${secret}`
}

async function yaAlertado(
  supabase: ReturnType<typeof createServerClient>,
  rid: string,
  tipo: string,
  ref: string
): Promise<boolean> {
  const hace30m = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('alerta_log')
    .select('id')
    .eq('restaurante_id', rid)
    .eq('tipo', tipo)
    .eq('referencia_id', ref)
    .gte('enviada_en', hace30m)
    .limit(1)
  return (data?.length ?? 0) > 0
}

async function sendPush(rid: string, title: string, body: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://www.iarest.es'
  // Construir header de sesión falso para que getRestauranteId devuelva el rid correcto
  await fetch(`${base}/api/push/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ia-restaurante-id': rid,   // header directo que añadiremos a getRestauranteId
    },
    body: JSON.stringify({ title, body }),
  }).catch(e => console.error('[CRON push]', e))
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerClient()
  const alertasEnviadas: string[] = []

  try {
    // Obtener reglas activas agrupadas por restaurante
    const { data: reglas } = await supabase
      .from('alerta_reglas')
      .select('restaurante_id, tipo, threshold_min')
      .eq('activa', true)

    if (!reglas?.length) return NextResponse.json({ ok: true, alertas: [] })

    const porRestaurante = new Map<string, typeof reglas>()
    for (const r of reglas) {
      if (!porRestaurante.has(r.restaurante_id)) porRestaurante.set(r.restaurante_id, [])
      porRestaurante.get(r.restaurante_id)!.push(r)
    }

    for (const [rid, reglasR] of porRestaurante) {

      // ── ESPERA LARGA: mesa activa sin comanda en >N minutos ──────────────
      const reglaEspera = reglasR.find(r => r.tipo === 'espera_larga')
      if (reglaEspera) {
        const hace = new Date(Date.now() - reglaEspera.threshold_min * 60_000).toISOString()
        const { data: mesas } = await supabase
          .from('mesas')
          .select('id, codigo, ultima_comanda')
          .eq('restaurante_id', rid)
          .in('estado', ['activa', 'ocupada', 'marchar'])
          .lt('ultima_comanda', hace)
          .not('ultima_comanda', 'is', null)

        for (const mesa of mesas ?? []) {
          const ref = `espera_${mesa.id}`
          if (await yaAlertado(supabase, rid, 'espera_larga', ref)) continue
          const min = Math.floor((Date.now() - new Date(mesa.ultima_comanda).getTime()) / 60_000)
          await sendPush(rid, 'Mesa sin actividad',
            `${mesa.codigo} lleva ${min} min sin comanda — ¿está atendida?`)
          await supabase.from('alerta_log').insert({ restaurante_id: rid, tipo: 'espera_larga', referencia_id: ref })
          alertasEnviadas.push(`espera_larga:${mesa.codigo}`)
        }
      }

      // ── KDS ATASCADO: item en KDS sin marcar en >N minutos ───────────────
      const reglaKds = reglasR.find(r => r.tipo === 'kds_atascado')
      if (reglaKds) {
        const hace = new Date(Date.now() - reglaKds.threshold_min * 60_000).toISOString()
        const { data: items } = await supabase
          .from('comanda_items')
          .select('id, nombre, created_at, comanda_id')
          .eq('estado', 'pendiente')
          .lt('created_at', hace)

        // Filtrar por restaurante via comandas
        for (const it of items ?? []) {
          const { data: comanda } = await supabase
            .from('comandas')
            .select('restaurante_id, mesa:mesas(codigo)')
            .eq('id', it.comanda_id)
            .eq('restaurante_id', rid)
            .single()
          if (!comanda) continue

          const ref = `kds_${it.id}`
          if (await yaAlertado(supabase, rid, 'kds_atascado', ref)) continue
          const min = Math.floor((Date.now() - new Date(it.created_at).getTime()) / 60_000)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const mesaCodigo = (comanda.mesa as any)?.codigo ?? '?'
          await sendPush(rid, 'KDS atascado',
            `${it.nombre} (${mesaCodigo}) lleva ${min} min sin marcar listo — ¿incidencia en cocina?`)
          await supabase.from('alerta_log').insert({ restaurante_id: rid, tipo: 'kds_atascado', referencia_id: ref })
          alertasEnviadas.push(`kds_atascado:${it.nombre}`)
        }
      }

      // ── CUENTAS SIMULTÁNEAS: N mesas pidieron cuenta en <5 min ──────────
      const reglaCuentas = reglasR.find(r => r.tipo === 'cuentas_simultaneas')
      if (reglaCuentas) {
        const hace5m = new Date(Date.now() - 5 * 60_000).toISOString()
        const { data: cuentas } = await supabase
          .from('comandas')
          .select('id')
          .eq('restaurante_id', rid)
          .eq('tipo', 'cuenta')
          .gte('created_at', hace5m)

        const nCuentas = cuentas?.length ?? 0
        if (nCuentas >= reglaCuentas.threshold_min) {
          const ref = `cuentas_${Math.floor(Date.now() / (5 * 60_000))}`
          if (!(await yaAlertado(supabase, rid, 'cuentas_simultaneas', ref))) {
            await sendPush(rid, 'Pico de cuentas',
              `${nCuentas} mesas pidieron cuenta en los últimos 5 min — ¿refuerzo en caja?`)
            await supabase.from('alerta_log').insert({ restaurante_id: rid, tipo: 'cuentas_simultaneas', referencia_id: ref })
            alertasEnviadas.push(`cuentas_simultaneas:${nCuentas}`)
          }
        }
      }
    }

    console.log('[CRON alertas]', alertasEnviadas.length, 'enviadas:', alertasEnviadas)
    return NextResponse.json({ ok: true, alertas: alertasEnviadas, ts: new Date().toISOString() })

  } catch (err) {
    console.error('[CRON alertas] error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
