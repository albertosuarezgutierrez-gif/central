// GET /api/owner/flota/resumen — resumen de rentabilidad de la flota (solo lectura, ADITIVO).
// Lee las tablas existentes `vehiculos_grupo` y `evento_transporte`, las mapea al modelo genérico
// de @central/module-flota (vía flota-adapter) y calcula coste estimado/real y desviación por
// vehículo con la lógica del módulo. No modifica ninguna ruta ni comportamiento existente.
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { costePorteEstimado, costePorteReal, round2 } from '@central/module-flota'
import {
  vehiculoFromRow,
  porteFromRow,
  type VehiculoGrupoRow,
  type EventoTransporteRow,
} from '@/lib/flota-adapter'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const [{ data: vehData, error: vehErr }, { data: transData, error: transErr }] = await Promise.all([
    supabase
      .from('vehiculos_grupo')
      .select(
        'id, cuenta_id, nombre, matricula, capacidad_kg, capacidad_m3, tipo, es_propio, proveedor_transporte, tarifa_km, tarifa_fija_evento, activo',
      )
      .eq('local_id', restauranteId)
      .eq('activo', true)
      .order('nombre'),
    supabase
      .from('evento_transporte')
      .select(
        'id, evento_id, vehiculo_id, conductor_id, km_estimados, km_reales, coste_estimado, coste_real, hora_salida, hora_llegada',
      )
      .eq('local_id', restauranteId),
  ])

  if (vehErr) return NextResponse.json({ error: vehErr.message }, { status: 500 })
  if (transErr) return NextResponse.json({ error: transErr.message }, { status: 500 })

  const vehiculos = ((vehData ?? []) as VehiculoGrupoRow[]).map(vehiculoFromRow)
  const portes = ((transData ?? []) as EventoTransporteRow[]).map(porteFromRow)

  const resumen = vehiculos.map((v) => {
    const portesV = portes.filter((p) => p.vehiculoId === v.id)
    const costeEstimado = round2(portesV.reduce((s, p) => s + costePorteEstimado(p, v), 0))
    const costeReal = round2(portesV.reduce((s, p) => s + costePorteReal(p, v), 0))
    const kmReales = round2(portesV.reduce((s, p) => s + (p.kmReales ?? 0), 0))
    return {
      id: v.id,
      nombre: v.nombre,
      matricula: v.matricula,
      tipo: v.tipo,
      esPropio: v.esPropio,
      nPortes: portesV.length,
      kmReales,
      costeEstimado,
      costeReal,
      desviacion: round2(costeReal - costeEstimado),
    }
  })

  const totales = {
    vehiculos: vehiculos.length,
    portes: portes.length,
    costeEstimado: round2(resumen.reduce((s, r) => s + r.costeEstimado, 0)),
    costeReal: round2(resumen.reduce((s, r) => s + r.costeReal, 0)),
  }

  return NextResponse.json({ resumen, totales })
}
