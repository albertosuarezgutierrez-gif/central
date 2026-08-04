// apps/plataforma/lib/contable/proactivo.ts
// Proactividad del agente (spec §7): que te hable él primero. v1 = un resumen breve, y SOLO cuando
// hay algo que decir (nada de ruido). Lee counts scoped por cuenta_id y añade lo que sabe de la
// rutina (contable_memoria). Se dispara desde un cron ligero; reutiliza el bot único de Telegram.
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { tgSend } from '@central/core-telegram'
import { getMemoria } from './memoria'

async function num(sql: Prisma.Sql): Promise<number> {
  const r = await prisma.$queryRaw<{ n: bigint }[]>(sql).catch(() => [])
  return r[0] ? Number(r[0].n) : 0
}

export async function construirResumenProactivo(cuentaId: string): Promise<string | null> {
  // Movimientos pendientes de revisar (mismo criterio que la pestaña Gastos de /finanzas).
  const porRevisar = await num(Prisma.sql`
    SELECT count(*)::bigint AS n
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
      AND (mb.duplicado_estado IS NULL OR mb.duplicado_estado <> 'ignorado')
      AND (mb.requiere_revision OR NOT coalesce(mb.destino_confirmado, false))
      AND coalesce(mb.destino, '') <> 'traspaso_interno'`)

  // Facturas de proveedor aún sin pagar (excluye pagada/rechazada).
  const facturasPend = await num(Prisma.sql`
    SELECT count(*)::bigint AS n FROM facturas_proveedor
    WHERE cuenta_id = ${cuentaId}::uuid AND estado NOT IN ('pagada', 'rechazada')`)

  // Cargos deducibles recientes sin justificante conciliado (últimos 30 días).
  const sinJustificante = await num(Prisma.sql`
    SELECT count(*)::bigint AS n
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
      AND (mb.duplicado_estado IS NULL OR mb.duplicado_estado <> 'ignorado')
      AND mb.importe < 0
      AND coalesce(mb.destino_confirmado, false) = true
      AND coalesce(mb.destino, '') IN ('seguros', 'turistico_pisos', 'turistico_duplex')
      AND coalesce(mb.conciliado, false) = false
      AND mb.factura_ref IS NULL
      AND mb.fecha_operacion >= (now()::date - 30)`)

  if (porRevisar === 0 && facturasPend === 0 && sinJustificante === 0) return null

  const lineas: string[] = ['🧮 <b>Tu contable, al día:</b>']
  if (porRevisar > 0) lineas.push(`• ${porRevisar} movimiento(s) por revisar.`)
  if (facturasPend > 0) lineas.push(`• ${facturasPend} factura(s) de proveedor sin cerrar.`)
  if (sinJustificante > 0) lineas.push(`• ${sinJustificante} cargo(s) deducible(s) de los últimos 30 días sin factura conciliada.`)

  const memoria = await getMemoria(cuentaId).catch(() => [] as { clave: string; insight: string }[])
  if (memoria.length) lineas.push('', 'Escríbeme y lo vemos — recuerdo tus criterios.')
  else lineas.push('', 'Escríbeme por aquí y lo resolvemos.')
  return lineas.join('\n')
}

// Envía el resumen si hay algo que decir. Devuelve si se envió.
export async function resumenProactivo(cuentaId: string): Promise<boolean> {
  const texto = await construirResumenProactivo(cuentaId)
  if (!texto) return false
  await tgSend(texto).catch(() => {})
  return true
}
