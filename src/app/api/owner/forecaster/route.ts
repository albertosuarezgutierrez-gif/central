import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { callAI, cleanJSON } from '@/lib/ai-client'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  // ── Histórico 90 días ──────────────────────────────────────────────────────
  const hace90 = new Date(); hace90.setDate(hace90.getDate() - 90)
  const { data: comandas } = await supabase
    .from('comandas').select('id, created_at')
    .eq('restaurante_id', restauranteId).gte('created_at', hace90.toISOString())

  if (!comandas?.length)
    return NextResponse.json({ error: 'Sin datos suficientes (mínimo 1 semana de comandas)' }, { status: 422 })

  const ids = comandas.map((c: { id: string }) => c.id)
  const { data: items } = await supabase
    .from('comanda_items').select('nombre, cantidad, precio_unitario, comanda_id').in('comanda_id', ids)

  const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
  const porDia: Record<string, { cmds: number; rev: number; semanas: Set<string> }> = {}
  const porProducto: Record<string, number> = {}
  const porHora: Record<number, number> = {}
  const mapaFecha: Record<string, Date> = {}

  for (const c of comandas) {
    const f = new Date(c.created_at); mapaFecha[c.id] = f
    const dia = dias[f.getDay()]; const sem = `${f.getFullYear()}-W${Math.ceil(f.getDate() / 7)}`
    if (!porDia[dia]) porDia[dia] = { cmds: 0, rev: 0, semanas: new Set() }
    porDia[dia].cmds++; porDia[dia].semanas.add(sem)
    porHora[f.getHours()] = (porHora[f.getHours()] ?? 0) + 1
  }
  for (const item of items ?? []) {
    const f = mapaFecha[item.comanda_id]
    if (f) { const dia = dias[f.getDay()]; if (porDia[dia]) porDia[dia].rev += (item.cantidad ?? 1) * (item.precio_unitario ?? 0) }
    porProducto[item.nombre] = (porProducto[item.nombre] ?? 0) + (item.cantidad ?? 1)
  }

  const topProductos = Object.entries(porProducto).sort((a, b) => b[1] - a[1]).slice(0, 10)
  const horaPico = Object.entries(porHora).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '?'
  const resumeDias = Object.entries(porDia).map(([dia, d]) => ({
    dia, comandas_media: Math.round(d.cmds / Math.max(d.semanas.size, 1)),
    revenue_media: Math.round(d.rev / Math.max(d.semanas.size, 1)),
  }))

  // ── Eventos del entorno próximos 14 días ───────────────────────────────────
  const en14d = new Date(Date.now() + 14 * 86400000)
  const { data: eventos } = await supabase
    .from('eventos_entorno')
    .select('id, nombre, fecha_inicio, tipo, fuente, aforo_estimado, impacto_estimado, venue_nombre, venue_direccion')
    .eq('restaurante_id', restauranteId)
    .gte('fecha_inicio', new Date().toISOString())
    .lte('fecha_inicio', en14d.toISOString())
    .order('fecha_inicio', { ascending: true })
    .limit(15)

  // ── IA: predicción con contexto de eventos ─────────────────────────────────
  const contextEventos = eventos?.length
    ? '\nEventos próximos en la zona:\n' + eventos.map(e => {
        const pct = e.impacto_estimado >= 1
          ? '+' + Math.round((e.impacto_estimado - 1) * 100) + '% afluencia'
          : Math.round((e.impacto_estimado - 1) * 100) + '% afluencia (impacto negativo)'
        const fecha = new Date(e.fecha_inicio).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
        return '· ' + fecha + ': ' + e.nombre + ' (' + pct + ')' + (e.aforo_estimado ? ' · Aforo ~' + e.aforo_estimado + ' personas' : '')
      }).join('\n')
    : ''

  const raw = await callAI(
    `Eres analista de negocio para hostelería española. Genera predicción próximos 7 días en JSON:
{"prediccion_semana":[{"dia":"Lunes DD mes","comandas_esperadas":N,"revenue_estimado":N,"nivel":"bajo|medio|alto","consejo":"frase corta accionable"}],"producto_estrella_semana":"nombre","dia_mas_fuerte":"día","alerta":"insight importante o null","consejo_stock":"qué preparar más esta semana"}
Ten en cuenta los eventos externos para ajustar la predicción de los días afectados.
Hoy: ${new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}`,
    `Datos históricos (promedio semanal 90d): ${JSON.stringify(resumeDias)}\nTop productos: ${JSON.stringify(topProductos)}\nHora pico: ${horaPico}:00h${contextEventos}`
  )

  let prediccion = null
  try { prediccion = JSON.parse(cleanJSON(raw ?? '')) } catch { /* sin prediccion */ }

  return NextResponse.json({
    historico: { resumeDias, topProductos, horaPico, totalComandas: comandas.length },
    prediccion,
    eventos: eventos ?? [],
  })
}
