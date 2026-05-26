export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { tgAlert } from '@/lib/telegram'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const supabase = createServerClient()

  const hoy = new Date()
  hoy.setHours(23, 59, 59, 999)

  const [proximosRes, silencioRes] = await Promise.allSettled([
    // Próximas acciones de hoy o vencidas
    supabase
      .from('leads')
      .select('nombre, restaurante, siguiente_contacto_texto, siguiente_contacto_at, siguiente_contacto_id, contacto:siguiente_contacto_id(nombre)')
      .lte('siguiente_contacto_at', hoy.toISOString())
      .not('estado', 'in', '(cliente,descartado)')
      .not('siguiente_contacto_at', 'is', null),

    // Silencio en estados avanzados (>14 días sin actividad)
    supabase
      .from('leads')
      .select('nombre, restaurante, estado, ultima_actividad_at')
      .in('estado', ['contactado', 'demo'])
      .not('ultima_actividad_at', 'is', null)
      .lt('ultima_actividad_at', new Date(Date.now() - 14 * 86400000).toISOString())
  ])

  let nProximos = 0
  let nSilencio = 0

  if (proximosRes.status === 'fulfilled' && proximosRes.value.data?.length) {
    const proximos = proximosRes.value.data
    nProximos = proximos.length
    const lineas = proximos.map((l: { nombre: string; siguiente_contacto_texto: string | null; contacto: { nombre: string }[] | null }) => {
      const contactoNombre = Array.isArray(l.contacto) ? l.contacto[0]?.nombre : (l.contacto as { nombre: string } | null)?.nombre
      const contacto = contactoNombre ? ` → <b>${contactoNombre}</b>` : ''
      return `• ${l.nombre}${contacto}: ${l.siguiente_contacto_texto ?? 'Acción pendiente'}`
    }).join('\n')
    await tgAlert(`📋 <b>CRM — ${nProximos} contacto${nProximos > 1 ? 's' : ''} pendiente${nProximos > 1 ? 's' : ''} hoy</b>\n\n${lineas}`, 'aviso')
  }

  if (silencioRes.status === 'fulfilled' && silencioRes.value.data?.length) {
    const silencio = silencioRes.value.data
    nSilencio = silencio.length
    const lineas = silencio.map((l: { nombre: string; estado: string; ultima_actividad_at: string }) => {
      const dias = Math.floor((Date.now() - new Date(l.ultima_actividad_at).getTime()) / 86400000)
      return `• ${l.nombre} (${l.estado}) — ${dias}d sin actividad`
    }).join('\n')
    await tgAlert(`🔇 <b>CRM — Silencio en pipeline avanzado</b>\n\n${lineas}\n\n<i>Considera retomar el contacto.</i>`, 'critico')
  }

  return NextResponse.json({ ok: true, proximos: nProximos, silencio: nSilencio })
}
