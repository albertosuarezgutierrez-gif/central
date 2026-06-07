// GET /api/cron/cobros-eventos
// Vercel Cron (cada hora). Dos tareas sobre los portales de cobro de grupo:
//   A) Email de CIERRE al dueño cuando un portal cierra (pagados + pendientes).
//   B) RECORDATORIO a los invitados que dejaron el pago a medias, antes del cierre.
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { enviarEmailCierreCobros, enviarEmailRecordatorioPagoCobro } from '@/lib/email'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BASE = 'https://www.iarest.es'

function autorizado(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createServerClient()
  let cierres = 0
  let recordatorios = 0

  // ── A. Email de cierre al dueño ───────────────────────────────
  // Portales cerrados hace poco (límite en los últimos 7 días) sin email enviado aún.
  try {
    const hace7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: cerrados } = await supabase
      .from('cobros_grupo')
      .select('id, titulo, local_id, restaurantes(nombre, email_contacto)')
      .eq('estado', 'cerrado')
      .eq('email_cierre_enviado', false)
      .gte('fecha_limite_pago', hace7d)

    await Promise.allSettled((cerrados ?? []).map(async (portal: any) => {
      const email = portal.restaurantes?.email_contacto
      if (!email) {
        console.error('[cobros-eventos] portal sin email_contacto:', portal.id)
        return
      }
      const { data: pagos } = await supabase
        .from('cobros_grupo_pagos')
        .select('estado, importe_eur, concepto, nombre_pagador, telefono_pagador')
        .eq('cobro_grupo_id', portal.id)

      const pagados = (pagos ?? []).filter((p: any) => p.estado === 'pagado')
      const pendientes = (pagos ?? []).filter((p: any) => p.estado === 'pendiente')
      const totalPagado = pagados.reduce((a: number, p: any) => a + Number(p.importe_eur || 0), 0)

      await enviarEmailCierreCobros({
        email,
        nombreRestaurante: portal.restaurantes?.nombre || '',
        titulo: portal.titulo,
        totalPagado,
        pagados: pagados.map((p: any) => ({ nombre: p.nombre_pagador || 'Anónimo', concepto: p.concepto || '', importe: Number(p.importe_eur || 0) })),
        pendientes: pendientes.map((p: any) => ({ nombre: p.nombre_pagador || 'Anónimo', concepto: p.concepto || '', telefono: p.telefono_pagador })),
      })

      await supabase.from('cobros_grupo').update({ email_cierre_enviado: true }).eq('id', portal.id)
      cierres++
    }))
  } catch (e) {
    console.error('[cobros-eventos] cierre:', e)
  }

  // ── B. Recordatorio a pagos a medias (antes del cierre) ───────
  // Portales activos cuyo límite cae en las próximas 24 h.
  try {
    const ahora = new Date().toISOString()
    const en24h = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const { data: porCerrar } = await supabase
      .from('cobros_grupo')
      .select('id, slug, titulo')
      .eq('estado', 'activo')
      .gte('fecha_limite_pago', ahora)
      .lte('fecha_limite_pago', en24h)

    for (const portal of (porCerrar ?? []) as { id: string; slug: string; titulo: string }[]) {
      const { data: pend } = await supabase
        .from('cobros_grupo_pagos')
        .select('id, email_pagador, nombre_pagador')
        .eq('cobro_grupo_id', portal.id)
        .eq('estado', 'pendiente')
        .is('recordatorio_enviado_at', null)

      // Un recordatorio por persona (agrupado por email). Sin email → no se puede avisar.
      const porEmail = new Map<string, { nombre: string; ids: string[] }>()
      for (const p of (pend ?? []) as { id: string; email_pagador: string | null; nombre_pagador: string | null }[]) {
        const email = (p.email_pagador || '').trim().toLowerCase()
        if (!email) continue
        const g = porEmail.get(email) || { nombre: p.nombre_pagador || '', ids: [] }
        g.ids.push(p.id)
        porEmail.set(email, g)
      }

      await Promise.allSettled(Array.from(porEmail.entries()).map(async ([email, g]) => {
        await enviarEmailRecordatorioPagoCobro({
          email,
          nombre: g.nombre,
          titulo: portal.titulo,
          link: `${BASE}/cobro/${portal.slug}`,
        })
        await supabase
          .from('cobros_grupo_pagos')
          .update({ recordatorio_enviado_at: new Date().toISOString() })
          .in('id', g.ids)
        recordatorios++
      }))
    }
  } catch (e) {
    console.error('[cobros-eventos] recordatorio:', e)
  }

  return NextResponse.json({ ok: true, cierres, recordatorios })
}
