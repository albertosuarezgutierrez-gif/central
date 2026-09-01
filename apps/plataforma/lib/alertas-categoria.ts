import { prisma } from './db'
import { tgAviso } from '@/lib/telegram'
import { EMOJI } from './categorias-personales'
import { clasificarPorKeywords } from './subcategoria-keywords'
import { eur } from './dinero'

// Comprueba si el gasto del mes en la subcategoría supera el límite de presupuesto de la cuenta y,
// en tal caso, avisa por Telegram (una vez por mes). Scoped por cuenta_id.
export async function comprobarAlertas(cuentaId: string, subcategoria: string): Promise<void> {
  const alertas = await prisma.$queryRaw<{ limite_mensual: number }[]>`
    SELECT limite_mensual FROM categoria_alertas
    WHERE categoria = ${subcategoria} AND activa = true AND cuenta_id = ${cuentaId}::uuid
  `
  if (!alertas.length) return

  // Dedup MENSUAL: como es un presupuesto mensual, basta un aviso por categoría y mes.
  const reciente = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count FROM categoria_alertas_log
    WHERE categoria = ${subcategoria} AND cuenta_id = ${cuentaId}::uuid
      AND enviado_at >= date_trunc('month', now())
  `
  if (Number(reciente[0]?.count ?? 0) > 0) return

  const suma = await prisma.$queryRaw<{ total: number }[]>`
    SELECT COALESCE(SUM(ABS(mb.importe)), 0)::float as total
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
      AND mb.subcategoria = ${subcategoria}
      AND mb.importe < 0
      AND mb.fecha_operacion >= date_trunc('month', now())
      AND COALESCE(mb.duplicado_estado, '') <> 'ignorado'
  `
  const totalMes = Number(suma[0]?.total ?? 0)

  for (const alerta of alertas) {
    if (totalMes >= alerta.limite_mensual) {
      const emoji = EMOJI[subcategoria] ?? '💸'
      const exceso = totalMes - alerta.limite_mensual
      const cat = subcategoria.replace(/_/g, ' ')
      await tgAviso('finanzas.presupuesto-categoria', 
        `${emoji} *Alerta gasto: ${cat}*\nLlevas ${eur(totalMes)} de ${eur(alerta.limite_mensual)} este mes\nExceso: ${eur(exceso)}`
      )
      await prisma.$executeRaw`
        INSERT INTO categoria_alertas_log (categoria, cuenta_id) VALUES (${subcategoria}, ${cuentaId}::uuid)
      `
    }
  }
}

type MovParaAlerta = { id: string; concepto: string | null; contraparte: string | null; importe: number; destino: string | null }

// En la ingesta (banca.ts / psd2.ts): clasifica el movimiento recién insertado por keyword (gratis,
// sin IA de pago) y, si es gasto personal con categoría clara, comprueba el presupuesto. Los ambiguos
// se dejan para el barrido diario (`barrerSubcategoriasPersonal`), que también avisa. Ya no usa la vía
// Anthropic de pago que había aquí.
export async function categorizarYAlertar(cuentaBancariaId: string, mov: MovParaAlerta): Promise<void> {
  const esPersonal = mov.importe < 0 && (mov.destino ?? 'personal') === 'personal'
  const sub = esPersonal ? clasificarPorKeywords(mov.concepto, mov.contraparte) : null
  if (!sub) return

  await prisma.$executeRaw`
    UPDATE movimientos_bancarios SET subcategoria = COALESCE(subcategoria, ${sub}) WHERE id = ${mov.id}::uuid
  `
  const cta = await prisma.$queryRaw<{ cuenta_id: string }[]>`
    SELECT cuenta_id FROM cuentas_bancarias WHERE id = ${cuentaBancariaId}::uuid
  `
  const cuentaId = cta[0]?.cuenta_id
  if (cuentaId) await comprobarAlertas(cuentaId, sub)
}
