export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import {
  resumenJornada, detalleJornada, chequearDescansos, horasExtra,
  LIMITES_DEFECTO, type TurnoFichaje, type LimitesJornada,
} from '@central/module-horario'

/**
 * GET /api/owner/horario?desde=YYYY-MM-DD&hasta=YYYY-MM-DD[&camarero_id]
 * Registro de jornada legal (RD 8/2019) por empleado a partir de los turnos fichados
 * (cerrados). Devuelve resumen, detalle por fecha, avisos de descanso y horas extra.
 * Todo gobernado por `config_horario` (límites + toggles); defaults legales si no hay fila.
 */
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const { searchParams } = new URL(req.url)
  const hoy = new Date()
  const primeroMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split('T')[0]
  const desde = searchParams.get('desde') ?? primeroMes
  const hasta = searchParams.get('hasta') ?? hoy.toISOString().split('T')[0]
  const camareroId = searchParams.get('camarero_id')

  // Config del local (límites + toggles); defaults legales si no existe.
  const { data: cfg } = await supabase
    .from('config_horario').select('*').eq('local_id', rid).maybeSingle()
  const limites: LimitesJornada = {
    jornada_max_diaria: Number(cfg?.jornada_max_diaria ?? LIMITES_DEFECTO.jornada_max_diaria),
    jornada_max_semanal: Number(cfg?.jornada_max_semanal ?? LIMITES_DEFECTO.jornada_max_semanal),
    descanso_min_entre_jornadas: Number(cfg?.descanso_min_entre_jornadas ?? LIMITES_DEFECTO.descanso_min_entre_jornadas),
    descanso_semanal_horas: Number(cfg?.descanso_semanal_horas ?? LIMITES_DEFECTO.descanso_semanal_horas),
    tope_extra_anual: Number(cfg?.tope_extra_anual ?? LIMITES_DEFECTO.tope_extra_anual),
  }
  const avisosDescanso = cfg?.avisos_descanso ?? true
  const avisoExtra = cfg?.aviso_horas_extra ?? true

  // Turnos cerrados del rango.
  let q = supabase
    .from('turnos')
    .select('id, camarero_id, fecha, entrada_at, salida_at, horas_totales, tipo')
    .eq('local_id', rid).eq('estado', 'cerrado')
    .gte('fecha', desde).lte('fecha', hasta)
  if (camareroId) q = q.eq('camarero_id', camareroId)
  const { data: rows, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Nombres de empleados.
  const { data: cams } = await supabase.from('camareros').select('id, nombre').eq('local_id', rid)
  const nombre = new Map<string, string>((cams ?? []).map(c => [c.id as string, c.nombre as string]))

  const turnos: TurnoFichaje[] = (rows ?? []).map(t => ({
    camarero_id: t.camarero_id,
    camarero_nombre: t.camarero_id ? (nombre.get(t.camarero_id) ?? null) : null,
    fecha: t.fecha,
    entrada_at: t.entrada_at,
    salida_at: t.salida_at,
    horas_totales: t.horas_totales != null ? Number(t.horas_totales) : null,
    tipo: t.tipo ?? 'normal',
  }))

  return NextResponse.json({
    ok: true, desde, hasta, limites,
    resumen: resumenJornada(turnos, limites),
    detalle: detalleJornada(turnos),
    descansos: avisosDescanso ? chequearDescansos(turnos, limites) : [],
    extras: avisoExtra ? horasExtra(turnos, limites) : [],
  })
}
