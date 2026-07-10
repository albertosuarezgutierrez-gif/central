import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { getResumenFinanciero } from '@/lib/finanzas'
import { calcularEstadoDeclaracion, type EstadoDeclaracion } from '@/lib/comparativa-declaracion'
import RadiografiaClient from './RadiografiaClient'

export const dynamic = 'force-dynamic'

// Radiografía financiera unificada: una pantalla, un selector de intervalo, y la foto del periodo
// (negocios + personal + fiscal). Por defecto el MES EN CURSO (la "radiografía mensual").
export default async function RadiografiaPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; quarter?: string; desde?: string; hasta?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const params = await searchParams
  const now = new Date()
  const year = parseInt(params.year || '') || now.getFullYear()
  const quarter = parseInt(params.quarter || '0') || 0
  let desde = params.desde || ''
  let hasta = params.hasta || ''

  // Sin filtro explícito → mes en curso (radiografía mensual por defecto).
  const sinFiltro = !params.year && !params.quarter && !params.desde
  if (sinFiltro) {
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    desde = `${now.getFullYear()}-${mm}-01`
    hasta = `${now.getFullYear()}-${mm}-${lastDay}`
  }

  const resumen = await getResumenFinanciero(session.id, year, quarter, desde || undefined, hasta || undefined)

  // "Sin identificar" = movimientos del periodo sin confirmar su destino, sumando los tres buckets.
  const v = [resumen.correduria.verificacion, resumen.pisos.verificacion, resumen.personal.verificacion]
  const sinConfirmar = v.reduce((s, x) => s + Math.max(0, (x?.total ?? 0) - (x?.confirmados ?? 0)), 0)

  // ── Lente Fiscal = SIEMPRE del AÑO completo (la declaración es anual, no del intervalo). ─────────
  // Si el intervalo elegido YA es el año fiscal completo reutilizamos `resumen`; si no (mes/trimestre/
  // rango libre) calculamos un resumen anual aparte para no mostrar una base imponible del mes.
  const esAnual = !desde && !hasta && quarter === 0
  const resumenAnual = esAnual ? resumen : await getResumenFinanciero(session.id, year, 0)
  // Declaración (hoy / fin de año · solo yo / conjunta) reutilizando el resumen anual ya calculado.
  // Si algo falla, la lente Fiscal degrada al resumen sin la parte de "Mi declaración" (no rompe).
  let declaracion: EstadoDeclaracion | null = null
  try {
    declaracion = await calcularEstadoDeclaracion(session.id, year, resumenAnual)
  } catch (e) {
    console.error('[radiografia] calcularEstadoDeclaracion', e)
  }

  return (
    <RadiografiaClient
      periodo={{ year, quarter, desde, hasta }}
      resumen={resumen}
      fiscalAnual={resumenAnual.fiscal}
      declaracion={declaracion}
      sinConfirmar={sinConfirmar}
    />
  )
}
