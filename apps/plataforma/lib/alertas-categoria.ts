import { prisma } from './db'
import { tgSend } from '@central/core-telegram'

const EMOJI: Record<string, string> = {
  supermercado: '🛒', restaurante_bar: '🍺', gasolina: '⛽',
  farmacia: '💊', ropa: '👕', colegio: '🎒', deporte: '🏊',
  suscripcion: '📱', hogar: '🏠', suministros_piso: '💡',
  reforma: '🔨', seguro: '🛡️', transporte: '🚗', ocio: '🎬',
}

export async function comprobarAlertas(subcategoria: string): Promise<void> {
  const alertas = await prisma.$queryRaw<{ limite_mensual: number }[]>`
    SELECT limite_mensual FROM categoria_alertas
    WHERE categoria = ${subcategoria} AND activa = true
  `
  if (!alertas.length) return

  const reciente = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count FROM categoria_alertas_log
    WHERE categoria = ${subcategoria}
      AND enviado_at > now() - interval '24 hours'
  `
  if (Number(reciente[0]?.count ?? 0) > 0) return

  const ahora = new Date()
  const inicioMes = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-01`

  const suma = await prisma.$queryRaw<{ total: number }[]>`
    SELECT COALESCE(SUM(ABS(importe)), 0)::float as total
    FROM movimientos_bancarios
    WHERE subcategoria = ${subcategoria}
      AND importe < 0
      AND fecha_operacion >= ${inicioMes}::date
      AND COALESCE(duplicado_estado, '') <> 'ignorado'
  `
  const totalMes = Number(suma[0]?.total ?? 0)

  for (const alerta of alertas) {
    if (totalMes >= alerta.limite_mensual) {
      const emoji = EMOJI[subcategoria] ?? '💸'
      const exceso = (totalMes - alerta.limite_mensual).toFixed(2)
      const cat = subcategoria.replace(/_/g, ' ')
      await tgSend(
        `${emoji} *Alerta gasto: ${cat}*\nLlevas €${totalMes.toFixed(2)} de €${alerta.limite_mensual.toFixed(2)} este mes\nExceso: €${exceso}`
      )
      await prisma.$executeRaw`
        INSERT INTO categoria_alertas_log (categoria) VALUES (${subcategoria})
      `
    }
  }
}

export async function categorizarYAlertar(
  cuentaBancariaId: string,
  mov: import('./categoria-ia').MovParaCategoria,
): Promise<void> {
  const { categorizarMovimiento } = await import('./categoria-ia')
  const subcategoria = await categorizarMovimiento(cuentaBancariaId, mov)
  await comprobarAlertas(subcategoria)
}
