// Parte con BD de «facturas de tarjeta» (la lógica pura vive en `tarjeta.ts` y `casar-cargos.ts`).
// Sin estado nuevo en BD: «pendiente de cobro de tarjeta» = estado abierto + forma de pago tarjeta (true) +
// no conciliada. `estado` es TEXT sin CHECK, así que un valor `cobro_tarjeta_pendiente` no exigiría migración,
// pero no hace falta para funcionar.

import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { escapeHtml } from '@central/core-telegram'
import { asignarCargos, ratioTarjeta, enVentanaCargo, VENTANA_CARGO_ANTES, VENTANA_CARGO_DESPUES } from './casar-cargos'
import { claveProveedor, claveUtil, clavesDeTitulares, CLAVES_GENERICAS } from './forma-pago'
import { clasificarTarjeta, tarjetaDeRaw, RE_CONCEPTO_TARJETA, RE_CONCEPTO_OTRO, divisaEfectiva, planificarAvisoTarjeta, textoAvisoTarjeta, tocaAvisoTarjetaSemanal, type FacturaTarjeta } from './tarjeta'
import { cargarTitulares } from './titulares'
import { avisaTarjetaSinCargo } from './avisos'
import { cerrarFacturaConCargo, actualizarMensajeTg } from './conciliar-par'

const ESTADOS_ABIERTOS = ['nueva', 'pendiente_revision', 'aprobada', 'pago_iniciando', 'pago_iniciado']

interface FilaFactura { id: string; proveedor: string; importe: number; divisa: string | null; cambio: number | null; fecha_factura: string; telegram_msg_id: number | null }

/** Forma de pago «tarjeta» (true/false/null) por proveedor, desde la factura leída + historial de cargos. Un fallo = null. */
export async function proveedoresTarjeta(cuentaId: string, proveedores: string[]): Promise<Map<string, boolean | null>> {
  const out = new Map<string, boolean | null>()
  const titulares = await cargarTitulares().catch(() => [])
  const excluidas = clavesDeTitulares(titulares.map((t) => t.nombre))
  for (const prov of new Set(proveedores)) {
    let explicita: boolean | null = null
    let tarjeta = 0, otros = 0
    try {
      const g = await prisma.$queryRaw<{ raw: unknown }[]>(Prisma.sql`
        SELECT raw_extraction AS raw FROM gastos g
        WHERE g.proveedor = ${prov} AND raw_extraction IS NOT NULL
          AND (to_jsonb(g)->>'sociedad_id' IS NULL
               OR (to_jsonb(g)->>'sociedad_id')::uuid IN (SELECT s.id FROM sociedades s WHERE s.cuenta_id = ${cuentaId}::uuid))
        ORDER BY to_jsonb(g)->>'created_at' DESC NULLS LAST LIMIT 5`)
      const vistos = g.map((r) => tarjetaDeRaw(r.raw))
      // Contradicción entre lecturas = no se sabe.
      if (vistos.includes(true) && !vistos.includes(false)) explicita = true
      else if (vistos.includes(false) && !vistos.includes(true)) explicita = false
      const clave = claveProveedor(prov)
      if (claveUtil(clave, excluidas)) {
        const m = await prisma.$queryRaw<{ tarjeta: bigint; otros: bigint }[]>(Prisma.sql`
          SELECT COUNT(*) FILTER (WHERE cb.tipo = 'tarjeta' OR COALESCE(mb.concepto, '') ~* ${RE_CONCEPTO_TARJETA.source}) AS tarjeta,
                 COUNT(*) FILTER (WHERE cb.tipo IS DISTINCT FROM 'tarjeta' AND COALESCE(mb.concepto, '') !~* ${RE_CONCEPTO_TARJETA.source}
                                    AND COALESCE(mb.concepto, '') ~* ${RE_CONCEPTO_OTRO.source}) AS otros
          FROM v_movimientos_activos mb
          JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id AND cb.cuenta_id = ${cuentaId}::uuid
          WHERE mb.importe < 0
            AND (upper(translate(mb.concepto, 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN')) LIKE '%' || ${clave} || '%'
              OR upper(translate(COALESCE(mb.contraparte, ''), 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN')) LIKE '%' || ${clave} || '%')`)
        tarjeta = Number(m[0]?.tarjeta ?? 0); otros = Number(m[0]?.otros ?? 0)
      }
    } catch { out.set(prov, null); continue }   // fallo de lectura = no se sabe
    out.set(prov, clasificarTarjeta({ proveedor: prov, tarjetaExplicita: explicita, cargosTarjetaPrevios: tarjeta, cargosOtrosPrevios: otros }))
  }
  return out
}

/** Facturas abiertas cuyo proveedor se cobra con tarjeta (true). */
export async function facturasTarjetaPendientes(cuentaId: string): Promise<FilaFactura[]> {
  const filas = await prisma.$queryRaw<FilaFactura[]>(Prisma.sql`
    SELECT f.id::text AS id, f.proveedor, f.importe::float AS importe,
           to_jsonb(f)->>'divisa' AS divisa,
           NULLIF(to_jsonb(f)->>'tipo_cambio', '')::float AS cambio,
           COALESCE(f.fecha_factura, f.created_at::date)::text AS fecha_factura,
           f.telegram_msg_id
    FROM facturas_proveedor f
    WHERE f.cuenta_id = ${cuentaId}::uuid AND f.estado = ANY(${ESTADOS_ABIERTOS}) AND f.importe > 0`)
  const formas = await proveedoresTarjeta(cuentaId, filas.map((f) => f.proveedor))
  return filas.filter((f) => formas.get(f.proveedor) === true)
}

/**
 * Casa las facturas de tarjeta pendientes con cargos (ventana [−3, +10] días sobre la fecha de factura,
 * clave de proveedor en concepto/contraparte, ±3 % en EUR o sobre la conversión en divisa) y las marca
 * pagadas (mismo efecto que `conciliarConBanco`). Devuelve cuántas casaron. LANZA si la consulta falla.
 */
export async function conciliarFacturasTarjeta(cuentaId: string): Promise<number> {
  const facturas = await facturasTarjetaPendientes(cuentaId)
  if (facturas.length === 0) return 0
  const cands: { factura_id: string; movimiento_id: string; dist: number; ratio: number; tolerancia: number }[] = []
  for (const f of facturas) {
    const clave = claveProveedor(f.proveedor)
    if (clave.length < 4 || CLAVES_GENERICAS.includes(clave)) continue
    const movs = await prisma.$queryRaw<{ id: string; importe: number; dias: number }[]>(Prisma.sql`
      SELECT mb.id::text AS id, ABS(mb.importe)::float AS importe, (mb.fecha_operacion - ${f.fecha_factura}::date)::int AS dias
      FROM v_movimientos_activos mb
      JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id AND cb.cuenta_id = ${cuentaId}::uuid
      WHERE mb.importe < 0 AND mb.conciliado IS NOT TRUE
        AND mb.fecha_operacion BETWEEN ${f.fecha_factura}::date - ${VENTANA_CARGO_ANTES}::int AND ${f.fecha_factura}::date + ${VENTANA_CARGO_DESPUES}::int
        AND (upper(translate(mb.concepto, 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN')) LIKE '%' || ${clave} || '%'
          OR upper(translate(COALESCE(mb.concepto_normalizado, ''), 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN')) LIKE '%' || ${clave} || '%'
          OR upper(translate(COALESCE(mb.contraparte, ''), 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN')) LIKE '%' || ${clave} || '%')`)
    for (const m of movs) {
      if (!enVentanaCargo(m.dias)) continue
      const r = ratioTarjeta(f.importe, divisaEfectiva(f.proveedor, f.divisa), m.importe, f.cambio)
      if (r) cands.push({ factura_id: f.id, movimiento_id: m.id, dist: Math.abs(m.dias), ratio: r.ratio, tolerancia: r.tolerancia })
    }
  }
  const pares = asignarCargos(cands)
  if (pares.length === 0) return 0
  const msgPorFactura = new Map(facturas.map((f) => [f.id, f.telegram_msg_id]))
  let n = 0
  for (const par of pares) {
    // Atómico con el movimiento: un cargo no cierra dos facturas.
    if (!(await cerrarFacturaConCargo(cuentaId, par, ESTADOS_ABIERTOS))) continue
    n++
    await actualizarMensajeTg(msgPorFactura.get(par.factura_id) ?? null, `✅ Pago conciliado con el cargo de la tarjeta.`)
  }
  return n
}

/**
 * Aviso de facturas de tarjeta sin cargo a los 10 días (para el cron del agente). Devuelve cuántas avisó.
 * Antes de avisar CONCILIA (los cargos de la débito entran por PSD2, no solo al importar extracto) y
 * solo avisa los lunes (sin estado de avisos en BD, es lo que evita repetir el mismo aviso cada día).
 */
export async function avisarTarjetaSinCargo(cuentaId: string, hoy = new Date().toISOString().slice(0, 10), nombreCuenta?: string | null): Promise<number> {
  await conciliarFacturasTarjeta(cuentaId)
  if (!tocaAvisoTarjetaSemanal(hoy)) return 0
  const pendientes = await facturasTarjetaPendientes(cuentaId)
  const plan = planificarAvisoTarjeta(pendientes as FacturaTarjeta[], hoy)
  const texto = textoAvisoTarjeta(plan, escapeHtml, nombreCuenta)
  if (!texto) return 0
  await avisaTarjetaSinCargo(texto)
  return plan.sinCargo.length
}
