// apps/plataforma/lib/contable/proactivo.ts
// Proactividad del agente (spec §7): que te hable él primero. v1 = un resumen breve, y SOLO cuando
// hay algo que decir (nada de ruido). Lee counts scoped por cuenta_id y añade lo que sabe de la
// rutina (contable_memoria). Se dispara desde un cron ligero; reutiliza el bot único de Telegram.
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { tgAviso } from '@/lib/telegram'
import { getMemoria } from './memoria'
import { avisosHipoteca, type CuotaMov, type FichaHipoteca } from './hipoteca-vigia'

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

  // Vigía de hipoteca: cambio de cuota en recibos "CUOTA PTMO <ref>" (revisión de tipo o
  // bonificación perdida/recuperada) y ficha de patrimonio desincronizada con el banco.
  // Un fallo de consulta NO puede ponerse verde en silencio: se distingue error de vacío.
  let hipoteca: string[] = []
  try {
    const cuotas = await prisma.$queryRaw<CuotaMov[]>(Prisma.sql`
      SELECT mb.fecha_operacion::text AS fecha, mb.importe::float8 AS importe, mb.concepto
      FROM movimientos_bancarios mb
      JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
      WHERE cb.cuenta_id = ${cuentaId}::uuid
        AND (mb.duplicado_estado IS NULL OR mb.duplicado_estado <> 'ignorado')
        AND mb.importe < 0
        AND mb.concepto ~* 'CUOTA\\s+PTMO'
        AND mb.fecha_operacion >= (now()::date - 400)
      ORDER BY mb.fecha_operacion DESC`)
    const fichas = await prisma.$queryRaw<{ id: string; nombre: string; cuota: number | null; notas: string | null }[]>(Prisma.sql`
      SELECT id, nombre, hipoteca_cuota_mensual::float8 AS cuota, notas
      FROM patrimonio_activos
      WHERE cuenta_id = ${cuentaId}::uuid AND estado = 'activo' AND hipoteca_cuota_mensual IS NOT NULL`)
    const fichasHipoteca: FichaHipoteca[] = fichas.map((f) => ({ id: f.id, nombre: f.nombre, cuotaMensual: f.cuota, notas: f.notas }))
    hipoteca = avisosHipoteca(cuotas, fichasHipoteca)
  } catch {
    hipoteca = ['🏦 No he podido comprobar la cuota de la hipoteca (fallo de consulta) — revisar a mano.']
  }

  if (porRevisar === 0 && facturasPend === 0 && sinJustificante === 0 && hipoteca.length === 0) return null

  const lineas: string[] = ['🧮 <b>Tu contable, al día:</b>']
  if (porRevisar > 0) lineas.push(`• ${porRevisar} movimiento(s) por revisar.`)
  if (facturasPend > 0) lineas.push(`• ${facturasPend} factura(s) de proveedor sin cerrar.`)
  if (sinJustificante > 0) lineas.push(`• ${sinJustificante} cargo(s) deducible(s) de los últimos 30 días sin factura conciliada.`)
  for (const aviso of hipoteca) lineas.push(`• ${aviso}`)

  const memoria = await getMemoria(cuentaId).catch(() => [] as { clave: string; insight: string }[])
  if (memoria.length) lineas.push('', 'Escríbeme y lo vemos — recuerdo tus criterios.')
  else lineas.push('', 'Escríbeme por aquí y lo resolvemos.')
  return lineas.join('\n')
}

// Envía el resumen si hay algo que decir. Devuelve si se envió.
export async function resumenProactivo(cuentaId: string): Promise<boolean> {
  const texto = await construirResumenProactivo(cuentaId)
  if (!texto) return false
  await tgAviso('finanzas.contable-proactivo', texto).catch(() => {})
  return true
}
