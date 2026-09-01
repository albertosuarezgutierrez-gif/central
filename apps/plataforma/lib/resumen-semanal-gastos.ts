import { prisma } from './db'
import { tgAviso } from '@/lib/telegram'
import { eur } from './dinero'

const EMOJI: Record<string, string> = {
  supermercado: '🛒', restaurante_bar: '🍺', gasolina: '⛽',
  farmacia: '💊', ropa: '👕', colegio: '🎒', deporte: '🏊',
  suscripcion: '📱', hogar: '🏠', suministros_piso: '💡',
  reforma: '🔨', seguro: '🛡️', transporte: '🚗', ocio: '🎬',
  otros_gasto: '•', alquiler_booking: '🏖️', alquiler_airbnb: '🏡',
  alquiler_transferencia: '🏠', comision_seguro: '🛡️', nomina: '👤',
  transferencia_familiar: '👨‍👩‍👧', otros_ingreso: '💶',
}

function getISOWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

export async function enviarResumenSemanal(): Promise<void> {
  const hoy = new Date()
  const inicioSemana = new Date(hoy)
  inicioSemana.setDate(hoy.getDate() - 7)
  const desde = inicioSemana.toISOString().slice(0, 10)
  const hasta = hoy.toISOString().slice(0, 10)
  const semana = getISOWeek(hoy)

  const gastos = await prisma.$queryRaw<{ subcategoria: string; total: number }[]>`
    SELECT subcategoria, SUM(ABS(importe))::float as total
    FROM movimientos_bancarios
    WHERE importe < 0
      AND subcategoria IS NOT NULL
      AND fecha_operacion BETWEEN ${desde}::date AND ${hasta}::date
      AND COALESCE(duplicado_estado, '') <> 'ignorado'
    GROUP BY subcategoria
    ORDER BY total DESC
    LIMIT 15
  `

  const ingresos = await prisma.$queryRaw<{ total: number }[]>`
    SELECT COALESCE(SUM(importe), 0)::float as total
    FROM movimientos_bancarios
    WHERE importe > 0
      AND fecha_operacion BETWEEN ${desde}::date AND ${hasta}::date
      AND COALESCE(duplicado_estado, '') <> 'ignorado'
  `

  if (!gastos.length && !ingresos[0]?.total) return

  const totalGastos = gastos.reduce((s, r) => s + Number(r.total), 0)
  const totalIngresos = Number(ingresos[0]?.total ?? 0)

  const lineas = gastos.map(r => {
    const emoji = EMOJI[r.subcategoria] ?? '•'
    const cat = r.subcategoria.replace(/_/g, ' ')
    const label = (cat.charAt(0).toUpperCase() + cat.slice(1)).padEnd(18)
    return `${emoji} ${label} ${eur(Number(r.total))}`
  })

  const msg = [
    `📊 *Semana ${semana} | Resumen gastos*`,
    '',
    ...lineas,
    '',
    `💶 Total gastos:   ${eur(totalGastos)}`,
    `💰 Total ingresos: ${eur(totalIngresos)}`,
  ].join('\n')

  await tgAviso('finanzas.resumen-semanal-gastos', msg)
}
