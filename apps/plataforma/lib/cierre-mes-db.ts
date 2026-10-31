// lib/cierre-mes-db.ts — lecturas/escrituras del cierre mensual. La lógica (checks, veredicto, guard) es
// pura y está testeada en `cierre-mes.ts`; aquí solo SQL y el ensamblado.
//
// Cada lectura va por `leer()`: si revienta, ESA entrada llega como `null` y su check sale `no_se_sabe`
// (nunca una lista vacía que se lea como «no hay nada pendiente»).
import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { cargosSinFactura, claveMovimiento, claveProveedor, type CargoBanco } from '@/lib/cierre-negocios'
import { listarGastosFijos, huellaFijo } from '@/lib/sivra/gastos-fijos'
import { PROVEEDOR_LIMPIEZA } from '@/lib/sivra/factura-limpieza-lectura'
import {
  UNIDADES_PISO, PROPIEDAD_COMPARTIDA, unidadesDeMovimiento, unidadesDeGasto, coberturaFifo, evaluarUnidad,
  facturasSinCargo, unidadesQueNoCuadran, finDeMes, mesSiguiente, sumarDias, paresBloqueados, mensajeBloqueo,
  type Apunte, type CuentaUnidad, type ReservaMes, type MovDuplicable, type ResultadoUnidad, type ParMesUnidad,
  type FijosMes, type LimpiezaMes,
} from '@/lib/cierre-mes'

const CANALES_OTA = ['BOOKING', 'AIRBNB', 'EXPEDIA', 'AGODA']
const DESTINOS = ['turistico_duplex', 'turistico_pisos'] as const

async function leer<T>(etiqueta: string, p: Promise<T>): Promise<T | null> {
  try { return await p } catch (e) {
    console.error(`[cierre-mes] lectura caída (${etiqueta}):`, e instanceof Error ? e.message : e)
    return null
  }
}

const iso = (d: Date | string | null): string | null => (d == null ? null : typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10))
const minFecha = (a: string, b: string) => (a < b ? a : b)

/**
 * Cuenta (tenant) dueña de los pisos. Las tablas de sivra (`incomes`, `gastos`) no tienen `cuenta_id`: se
 * deduce de quién tiene movimientos de destino turístico. Si hubiera MÁS de una, no se adivina: null.
 */
export async function cuentaDeLosPisos(): Promise<string | null> {
  const r = await prisma.$queryRaw<{ cuenta_id: string }[]>(Prisma.sql`
    SELECT DISTINCT cb.cuenta_id::text AS cuenta_id
    FROM v_movimientos_activos m
    JOIN cuentas_bancarias cb ON cb.id = m.cuenta_bancaria_id
    WHERE m.destino IN ('turistico_duplex', 'turistico_pisos')
  `)
  return r.length === 1 ? r[0].cuenta_id : null
}

type MovRow = {
  id: string; cuenta: string; fecha: string; importe: number; destino: string | null; propiedad_id: string | null
  concepto: string | null; contraparte: string | null; conciliado: boolean | null; factura_ref: string | null
  duplicado_estado: string | null
}

/** Calcula los checks de los pisos para `mes` a fecha `hoy` ('YYYY-MM-DD'). Solo lectura. */
export async function calcularCierre(cuentaId: string, mes: string, hoy: string): Promise<ResultadoUnidad[]> {
  const inicio = `${mes}-01`
  const fin = finDeMes(mes)
  const siguiente = `${mesSiguiente(mes)}-01`
  const ancla = `${mesSiguiente(mes, -2)}-01`              // pool FIFO de cobros: 3 meses
  const movDesde = sumarDias(inicio, -15)
  const movHasta = minFecha(hoy, sumarDias(fin, 45))
  const pisos = UNIDADES_PISO.map(u => u.id)
  const pisosSql = Prisma.join(pisos)
  const conCompartida = Prisma.join([...pisos, PROPIEDAD_COMPARTIDA])

  const [cuentasRows, movs, abonos, reservas, docs, facturas, limpieza, salidas, fijos] = await Promise.all([
    // a) Cuentas por destino: las que tienen movimientos del destino en el mes, más las VISIBLES con
    //    movimientos del destino en los 3 meses previos (una cuenta cuya sincronización se cortó no tiene
    //    movimientos en el mes, y es justo la que hay que señalar).
    leer('cuentas', prisma.$queryRaw<{ destino: string; nombre: string; sello: Date | null; ultimo: Date | null }[]>(Prisma.sql`
      SELECT d.destino, COALESCE(cb.alias, cb.banco || ' ' || COALESCE(cb.iban_mascara, '')) AS nombre,
             cb.saldo_fecha AS sello,
             (SELECT max(x.fecha_operacion) FROM v_movimientos_activos x WHERE x.cuenta_bancaria_id = cb.id) AS ultimo
      FROM cuentas_bancarias cb
      CROSS JOIN (VALUES ('turistico_duplex'), ('turistico_pisos')) AS d(destino)
      WHERE cb.cuenta_id = ${cuentaId}::uuid
        AND EXISTS (
          SELECT 1 FROM v_movimientos_activos m
          WHERE m.cuenta_bancaria_id = cb.id AND m.destino = d.destino
            AND m.fecha_operacion <= ${fin}::date
            AND (m.fecha_operacion >= ${inicio}::date
                 OR (COALESCE(cb.oculta, false) = false AND m.fecha_operacion >= ${ancla}::date))
        )
    `)),
    // b, f) Movimientos de los destinos turísticos en la ventana (mes −15 d … mes +45 d, sin pasar de hoy).
    leer('movimientos', prisma.$queryRaw<MovRow[]>(Prisma.sql`
      SELECT m.id::text AS id, m.cuenta_bancaria_id::text AS cuenta, m.fecha_operacion::text AS fecha,
             m.importe::float8 AS importe, m.destino, m.propiedad_id,
             COALESCE(m.concepto_normalizado, m.concepto) AS concepto, m.contraparte, m.conciliado, m.factura_ref,
             m.duplicado_estado
      FROM v_movimientos_activos m
      JOIN cuentas_bancarias cb ON cb.id = m.cuenta_bancaria_id
      WHERE cb.cuenta_id = ${cuentaId}::uuid
        AND m.destino IN ('turistico_duplex', 'turistico_pisos')
        AND m.fecha_operacion >= ${movDesde}::date AND m.fecha_operacion <= ${movHasta}::date
    `)),
    // c) Abonos al pool de cada destino desde el ancla hasta hoy.
    leer('abonos', prisma.$queryRaw<{ destino: string; fecha: string; importe: number }[]>(Prisma.sql`
      SELECT m.destino, m.fecha_operacion::text AS fecha, m.importe::float8 AS importe
      FROM v_movimientos_activos m
      JOIN cuentas_bancarias cb ON cb.id = m.cuenta_bancaria_id
      WHERE cb.cuenta_id = ${cuentaId}::uuid
        AND m.destino IN ('turistico_duplex', 'turistico_pisos')
        AND m.importe > 0
        AND m.fecha_operacion >= ${ancla}::date AND m.fecha_operacion <= ${hoy}::date
    `)),
    // c) Reservas OTA: las terminadas desde el ancla (consumen el pool) y las que entran en el mes.
    leer('reservas', prisma.$queryRaw<{ id: string; pid: string; canal: string; check_in: Date; check_out: Date; base: number | null }[]>(Prisma.sql`
      SELECT "reservationId"::text AS id, "propertyId" AS pid, portal::text AS canal, "checkIn" AS check_in,
             "checkOut" AS check_out, COALESCE(amount_gross, amount)::float8 AS base
      FROM incomes
      WHERE "propertyId" IN (${pisosSql})
        AND portal::text IN (${Prisma.join(CANALES_OTA)})
        AND "checkOut" IS NOT NULL AND "checkIn" IS NOT NULL
        AND (("checkOut"::date >= ${ancla}::date AND "checkOut"::date <= ${hoy}::date)
             OR ("checkIn"::date >= ${inicio}::date AND "checkIn"::date < ${siguiente}::date))
    `)),
    // b) Proveedores que suelen facturar (mismo criterio que el cierre por negocio del día 5).
    leer('docs', Promise.all([
      prisma.$queryRaw<{ proveedor: string | null; fecha: string; importe: number }[]>(Prisma.sql`
        SELECT proveedor, fecha_factura::text AS fecha, importe::float8 AS importe FROM facturas_proveedor
        WHERE cuenta_id = ${cuentaId}::uuid AND estado <> 'rechazada' AND fecha_factura >= ${ancla}::date - 365`),
      prisma.$queryRaw<{ proveedor: string | null; fecha: string; importe: number }[]>(Prisma.sql`
        SELECT proveedor, fecha::text AS fecha, total::float8 AS importe FROM gastos
        WHERE fecha >= ${ancla}::date - 365 AND descartado_at IS NULL`),
    ]).then(([a, b]) => [...a, ...b].map(r => ({ clave: claveProveedor(r.proveedor), fecha: r.fecha, importe: Math.abs(Number(r.importe)) })))),
    // b) Facturas del mes de los pisos (y las compartidas). Los fijos son prorrateos sin cargo propio: fuera.
    leer('facturas', prisma.$queryRaw<{ id: string; fecha: string; total: number; nombre: string | null; propiedad: string }[]>(Prisma.sql`
      SELECT id::text, fecha::text AS fecha, total::float8 AS total, COALESCE(proveedor, concepto) AS nombre, propiedad
      FROM gastos
      WHERE fecha >= ${inicio}::date AND fecha < ${siguiente}::date
        AND propiedad IN (${conCompartida})
        AND origen IS DISTINCT FROM 'fijo'
        AND descartado_at IS NULL
        AND total > 0
    `)),
    // d) Factura de Si que Brilla del PERIODO (mes de servicio).
    leer('limpieza', prisma.$queryRaw<{ limpieza: unknown }[]>(Prisma.sql`
      SELECT limpieza FROM limpieza_facturas
      WHERE cuenta_id = ${cuentaId} AND proveedor = ${PROVEEDOR_LIMPIEZA} AND periodo = ${mes}
    `)),
    leer('salidas', prisma.$queryRaw<{ pid: string; n: number }[]>(Prisma.sql`
      SELECT "propertyId" AS pid, COUNT(*)::int AS n FROM incomes
      WHERE "checkOut"::date >= ${inicio}::date AND "checkOut"::date < ${siguiente}::date
      GROUP BY "propertyId"
    `)),
    // e) Gastos fijos activos y cuáles tienen ya su gasto en el mes (misma huella que `generarGastosFijos`).
    leer('fijos', (async () => {
      const lista = (await listarGastosFijos(true)).filter(f => f.propiedad && (pisos.includes(f.propiedad) || f.propiedad === PROPIEDAD_COMPARTIDA))
      const huellas = lista.map(f => ({ propiedad: f.propiedad as string, huella: huellaFijo(f), concepto: f.concepto })).filter(h => h.huella)
      const hechas = huellas.length
        ? await prisma.$queryRaw<{ fp: string }[]>(Prisma.sql`
            SELECT DISTINCT fingerprint AS fp FROM gastos
            WHERE fingerprint IN (${Prisma.join(huellas.map(h => h.huella))})
              AND fecha >= ${inicio}::date AND fecha < ${siguiente}::date`)
        : []
      return { huellas, hechas: hechas.map(h => h.fp) }
    })()),
  ])

  // ── Ensamblado por unidad ──
  const movUnidad = (u: string) => movs?.filter(m => unidadesDeMovimiento(m.destino, m.propiedad_id).includes(u)) ?? null
  const enMes = (f: string) => f >= inicio && f <= fin

  // c) FIFO por destino (pool de la cuenta).
  const reservasMesPorDestino = new Map<string, ReservaMes[] | null>()
  for (const destino of DESTINOS) {
    if (!reservas || !abonos) { reservasMesPorDestino.set(destino, null); continue }
    const delGrupo = UNIDADES_PISO.filter(u => u.destino === destino).map(u => u.id)
    const rs = reservas.filter(r => delGrupo.includes(r.pid)).map(r => ({
      id: r.id, pid: r.pid, canal: r.canal, checkIn: iso(r.check_in)!, checkOut: iso(r.check_out)!,
      base: r.base == null || !Number.isFinite(Number(r.base)) ? null : Number(r.base),
    }))
    const terminadas = rs.filter(r => r.checkOut >= ancla && r.checkOut <= hoy)
    const cobertura = coberturaFifo(terminadas, abonos.filter(a => a.destino === destino).map(a => ({ fecha: a.fecha, importe: Number(a.importe) })))
    reservasMesPorDestino.set(destino, rs.filter(r => enMes(r.checkIn)).map(r => ({
      id: r.id, unidad: r.pid, canal: r.canal, checkOut: r.checkOut, bruto: r.base,
      // Sin terminar todavía → no ha podido cobrarse (y estará en plazo); base NULL → no se sabe.
      cubierta: r.base === null ? null : (cobertura.get(r.id) ?? false),
    })))
  }

  // d) Desglose de la factura del periodo (puede haber más de una fila: se suman).
  let facturaPorPiso: Record<string, number> | null = null
  if (limpieza && limpieza.length) {
    facturaPorPiso = {}
    for (const f of limpieza) {
      for (const l of (Array.isArray(f.limpieza) ? f.limpieza : []) as { propertyId?: string; importe?: number }[]) {
        if (!l?.propertyId || !Number.isFinite(Number(l.importe))) continue
        facturaPorPiso[l.propertyId] = (facturaPorPiso[l.propertyId] ?? 0) + Number(l.importe)
      }
    }
  }

  return UNIDADES_PISO.map(u => {
    const mu = movUnidad(u.id)
    const cuentas: CuentaUnidad[] | null = cuentasRows
      ? cuentasRows.filter(c => c.destino === u.destino).map(c => ({ nombre: c.nombre, sincronizadaHasta: iso(c.sello), ultimoMovimiento: iso(c.ultimo) }))
      : null

    let sinFactura: Apunte[] | null = null
    let sinCargo: Apunte[] | null = null
    if (mu && docs && facturas) {
      const cargosMes: CargoBanco[] = mu.filter(m => enMes(m.fecha) && m.importe < 0).map(m => ({
        id: m.id, fecha: m.fecha, importe: m.importe, destino: m.destino,
        clave: claveMovimiento(m.contraparte, m.concepto), nombre: m.contraparte ?? m.concepto ?? '—',
        conciliado: m.conciliado, facturaRef: m.factura_ref,
      }))
      sinFactura = cargosSinFactura(cargosMes, docs).lista.map(x => ({ fecha: x.fecha, importe: x.importe, nombre: x.nombre }))
      sinCargo = facturasSinCargo(
        facturas.filter(f => unidadesDeGasto(f.propiedad).includes(u.id)).map(f => ({ id: f.id, fecha: f.fecha, total: Number(f.total), nombre: f.nombre ?? '—' })),
        mu.filter(m => m.importe < 0).map(m => ({ id: m.id, fecha: m.fecha, importe: m.importe })),
      )
    }

    const movimientos: MovDuplicable[] | null = mu
      ? mu.filter(m => enMes(m.fecha)).map(m => ({ id: m.id, cuenta: m.cuenta, fecha: m.fecha, importe: m.importe, concepto: m.concepto, duplicadoEstado: m.duplicado_estado }))
      : null

    // Salidas: si la consulta fue bien, un piso sin filas tuvo 0 salidas (revisado, no «no se sabe»).
    const lim: LimpiezaMes | null = salidas && limpieza
      ? { facturaPorPiso, salidas: salidas.find(s => s.pid === u.id)?.n ?? 0 }
      : null

    const fij: FijosMes | null = fijos
      ? {
          esperados: fijos.huellas.filter(h => unidadesDeGasto(h.propiedad).includes(u.id)).map(h => ({ huella: h.huella, concepto: h.concepto })),
          generadas: fijos.hechas,
        }
      : null

    return evaluarUnidad({
      mes, unidad: u.id, hoy, cuentas,
      cargosSinFactura: sinFactura, facturasSinCargo: sinCargo,
      reservas: reservasMesPorDestino.get(u.destino) ?? null,
      limpieza: lim, fijos: fij, movimientos,
    })
  })
}

/** Guarda la evaluación. Un mes `cerrado` NO se toca (es un snapshot); uno `reabierto` sigue reabierto. */
export async function persistirCierre(cuentaId: string, mes: string, resultados: ResultadoUnidad[]): Promise<void> {
  for (const r of resultados) {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO cierres_mes (cuenta_id, mes, unidad, estado, checks, veredicto, calculado_at)
      VALUES (${cuentaId}::uuid, ${mes}, ${r.unidad}, 'en_revision', ${JSON.stringify(r.checks)}::jsonb, ${r.veredicto}, now())
      ON CONFLICT (cuenta_id, mes, unidad) DO UPDATE
        SET checks = EXCLUDED.checks, veredicto = EXCLUDED.veredicto, calculado_at = now(), updated_at = now(),
            estado = CASE WHEN cierres_mes.estado = 'reabierto' THEN 'reabierto' ELSE 'en_revision' END
        WHERE cierres_mes.estado <> 'cerrado'
    `)
  }
}

export async function estadosCierre(cuentaId: string, mes: string): Promise<Record<string, string>> {
  const rows = await prisma.$queryRaw<{ unidad: string; estado: string }[]>(Prisma.sql`
    SELECT unidad, estado FROM cierres_mes WHERE cuenta_id = ${cuentaId}::uuid AND mes = ${mes}`)
  return Object.fromEntries(rows.map(r => [r.unidad, r.estado]))
}

/**
 * Botón ✅ Cerrar mes. Se RECALCULA en el momento de pulsar (los datos pueden haber cambiado desde el aviso):
 * solo cierra si TODAS las unidades siguen cuadrando; si alguna no, no cierra ninguna y dice cuál.
 */
export async function cerrarMes(cuentaId: string, mes: string, hoy: string, actor: string): Promise<{ cerradas: string[]; noCuadran: string[] }> {
  const resultados = await calcularCierre(cuentaId, mes, hoy)
  await persistirCierre(cuentaId, mes, resultados)
  const noCuadran = unidadesQueNoCuadran(resultados, await estadosCierre(cuentaId, mes))
  if (noCuadran.length) return { cerradas: [], noCuadran }
  const filas = await prisma.$queryRaw<{ unidad: string }[]>(Prisma.sql`
    UPDATE cierres_mes SET estado = 'cerrado', cerrado_at = now(), cerrado_por = ${actor}, updated_at = now()
    WHERE cuenta_id = ${cuentaId}::uuid AND mes = ${mes}
      AND unidad IN (${Prisma.join(resultados.map(r => r.unidad))})
      AND estado <> 'cerrado' AND veredicto = 'cuadra'
    RETURNING unidad`)
  return { cerradas: filas.map(f => f.unidad), noCuadran: [] }
}

export type ResultadoReapertura = 'reabierto' | 'no_existe' | 'no_cerrado'

/** Reapertura explícita con motivo (≥5 caracteres; lo exige también el CHECK de la tabla). */
export async function reabrirCierre(cuentaId: string, mes: string, unidad: string, motivo: string, actor: string): Promise<ResultadoReapertura> {
  const filas = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    UPDATE cierres_mes
    SET estado = 'reabierto', reabierto_at = now(), reabierto_motivo = ${motivo}, reabierto_por = ${actor}, updated_at = now()
    WHERE cuenta_id = ${cuentaId}::uuid AND mes = ${mes} AND unidad = ${unidad} AND estado = 'cerrado'
    RETURNING id::text`)
  if (filas.length) return 'reabierto'
  const existe = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id::text FROM cierres_mes WHERE cuenta_id = ${cuentaId}::uuid AND mes = ${mes} AND unidad = ${unidad}`)
  return existe.length ? 'no_cerrado' : 'no_existe'
}

// ── Guard de escrituras de `gastos` ─────────────────────────────────────────────────────────────────
// `gastos` es single-tenant (tabla de sivra, sin cuenta_id): el cierre de un piso se busca sin filtrar por
// cuenta, igual que el resto de lecturas de `gastos` (ver `resumen-mensual.ts`).

/** Pares cerrados entre los dados. Tabla aún sin crear (migración pendiente) = ninguno cerrado. */
async function paresCerrados(pares: ParMesUnidad[]): Promise<ParMesUnidad[]> {
  if (!pares.length) return []
  const conds = pares.map(p => Prisma.sql`(mes = ${p.mes} AND unidad = ${p.unidad})`)
  try {
    return await prisma.$queryRaw<ParMesUnidad[]>(Prisma.sql`
      SELECT mes, unidad FROM cierres_mes WHERE estado = 'cerrado' AND (${Prisma.join(conds, ' OR ')})`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/cierres_mes/.test(msg) && /does not exist|no existe/.test(msg)) return []
    throw e
  }
}

/**
 * 409 si la escritura toca un (mes, unidad) cerrado; 503 si no se pudo comprobar (fail-CLOSED: un guard
 * que no sabe no deja pasar); null = adelante.
 */
export async function bloqueoPorCierre(pares: ParMesUnidad[]): Promise<NextResponse | null> {
  let cerrados: ParMesUnidad[]
  try { cerrados = await paresCerrados(pares) } catch (e) {
    console.error('[cierre-mes] guard sin poder leer cierres_mes:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'No se pudo comprobar si el mes está cerrado. Inténtalo de nuevo.' }, { status: 503 })
  }
  const b = paresBloqueados(pares, cerrados)
  if (!b.length) return null
  return NextResponse.json({ error: mensajeBloqueo(b), cierre: b }, { status: 409 })
}

/** Pares (mes, unidad) que tocan los gastos existentes `ids` (y, si se cambia el piso, también el nuevo). */
export async function paresDeGastos(ids: string[], nuevaPropiedad?: string | null): Promise<ParMesUnidad[]> {
  if (!ids.length) return []
  const filas = await prisma.$queryRaw<{ fecha: string | null; propiedad: string | null }[]>(Prisma.sql`
    SELECT fecha::text AS fecha, propiedad FROM gastos WHERE id::text IN (${Prisma.join(ids)})`)
  const out: ParMesUnidad[] = []
  for (const f of filas) {
    if (!f.fecha) continue
    const mes = f.fecha.slice(0, 7)
    for (const u of unidadesDeGasto(f.propiedad)) out.push({ mes, unidad: u })
    if (nuevaPropiedad !== undefined) for (const u of unidadesDeGasto(nuevaPropiedad)) out.push({ mes, unidad: u })
  }
  return out
}

/** Ids que confirmaría `confirmarProveedor(id)`: la de partida + sus hermanas pendientes con la misma huella. */
export async function idsPendientesDelProveedor(id: string): Promise<string[]> {
  const filas = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT g.id::text FROM gastos g
    JOIN gastos o ON o.id = ${id}::uuid
    WHERE g.revisado = false AND g.origen IS NOT NULL
      AND (g.id = o.id OR (o.fingerprint IS NOT NULL AND g.fingerprint = o.fingerprint))`)
  return filas.map(f => f.id)
}

/** Pisos con el mes cerrado (para que la generación de fijos los salte). */
export async function pisosCerrados(mes: string): Promise<Set<string>> {
  const c = await paresCerrados(UNIDADES_PISO.map(u => ({ mes, unidad: u.id })))
  return new Set(c.map(x => x.unidad))
}
