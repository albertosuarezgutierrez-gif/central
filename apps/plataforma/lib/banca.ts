// Persistencia y consolidación bancaria. Lee/escribe la BD compartida por SQL crudo
// (mismo patrón que lib/financiero.ts), siempre scopeado por cuenta_id. La lógica de
// parseo del extracto vive en lib/norma43.ts (pura, testeable).

import { Prisma } from '@prisma/client'
import { prisma } from './db'
import { dedupeHash, type ExtractoN43 } from './norma43'
import { fmtEur } from './financiero'
import { agruparDuplicados, DUP_UMBRAL_BANNER, type DupGrupo, type DupPar } from './duplicados'
import { getEstadoCobrosOTA } from './sivra/cobros-ota-db'
import { type Pendiente } from './sivra/cobros-ota'
import { tgSend } from '@central/core-telegram'
import { getMovimientosDudosos, sugerirDestinoConContexto, enviarMensajeDudoso } from './agente-movimientos'

export type { DupGrupo, DupMovimiento } from './duplicados'

export { fmtEur }

// Importa los extractos de un fichero Norma 43 en una sociedad de la cuenta.
// Upsert de la cuenta bancaria (por sociedad+ccc), inserta movimientos deduplicados
// y actualiza el saldo con el saldo final del extracto.
export async function importarExtracto(
  cuentaId: string,
  sociedadId: string,
  extractos: ExtractoN43[],
  origen = 'norma43',
  titular: 'titular' | 'conyuge' = 'titular',
  tipo: 'corriente' | 'tarjeta' | 'ahorro' = 'corriente',
): Promise<{ insertados: number; duplicados: number; cuentas: number; cuentaBancariaIds: string[]; fechaInicio: string | null; fechaFin: string | null }> {
  let insertados = 0
  let duplicados = 0
  let cuentas = 0
  const cuentasTocadas = new Set<string>()
  let fechaMin: string | null = null
  let fechaMax: string | null = null

  for (const ex of extractos) {
    if (!ex.ccc) continue
    const divisa = /^[A-Z]{3}$/.test(ex.divisa) ? ex.divisa : 'EUR'
    const mascara = ex.ccc.length >= 4 ? `****${ex.ccc.slice(-4)}` : ex.ccc
    const banco = ex.banco || null

    if (ex.fechaInicio && (!fechaMin || ex.fechaInicio < fechaMin)) fechaMin = ex.fechaInicio
    if (ex.fechaFin && (!fechaMax || ex.fechaFin > fechaMax)) fechaMax = ex.fechaFin

    // Upsert de la cuenta bancaria (unique sociedad_id + iban). Devuelve su id.
    const filas = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO cuentas_bancarias (cuenta_id, sociedad_id, banco, iban, iban_mascara, divisa, saldo_actual, saldo_fecha, titular, tipo)
      VALUES (
        ${cuentaId}::uuid, ${sociedadId}::uuid, ${banco}, ${ex.ccc}, ${mascara}, ${divisa},
        ${ex.saldoFinal}, ${ex.fechaFin}::date, ${titular}, ${tipo}
      )
      ON CONFLICT (sociedad_id, iban) DO UPDATE SET
        banco        = COALESCE(EXCLUDED.banco, cuentas_bancarias.banco),
        saldo_actual = COALESCE(EXCLUDED.saldo_actual, cuentas_bancarias.saldo_actual),
        saldo_fecha  = COALESCE(EXCLUDED.saldo_fecha, cuentas_bancarias.saldo_fecha),
        titular      = EXCLUDED.titular,
        tipo         = EXCLUDED.tipo
      RETURNING id
    `
    const cuentaBancariaId = filas[0]?.id
    if (!cuentaBancariaId) continue
    cuentas += 1
    cuentasTocadas.add(cuentaBancariaId)

    // Ordinal por hash base para distinguir movimientos idénticos del mismo extracto.
    // Inserción EN BLOQUE (un solo INSERT por extracto) — antes era uno a uno y con ficheros
    // grandes (p. ej. el extracto de la tarjeta, cientos de filas) el endpoint daba timeout.
    const vistos = new Map<string, number>()
    const filasMov = ex.movimientos.map(m => {
      const base = dedupeHash(m)
      const n = (vistos.get(base) ?? 0) + 1
      vistos.set(base, n)
      const hash = n > 1 ? `${base}-${n}` : base
      return Prisma.sql`(
        ${cuentaBancariaId}::uuid, ${m.fechaOperacion || null}::date, ${m.fechaValor || null}::date,
        ${m.importe}, ${m.saldoPosterior ?? null}, ${m.concepto || null}, ${m.contraparte || null}, ${m.referencia || null},
        ${origen}, ${hash}
      )`
    })
    if (filasMov.length) {
      const res = await prisma.$executeRaw(Prisma.sql`
        INSERT INTO movimientos_bancarios
          (cuenta_bancaria_id, fecha_operacion, fecha_valor, importe, saldo_posterior, concepto, contraparte, referencia, origen, dedupe_hash)
        VALUES ${Prisma.join(filasMov)}
        ON CONFLICT (cuenta_bancaria_id, dedupe_hash) DO NOTHING
      `)
      const ins = Number(res)
      insertados += ins
      duplicados += filasMov.length - ins

      // Categorizar con IA los movimientos recién insertados
      if (ins > 0) {
        const { categorizarYAlertar } = await import('./alertas-categoria')
        const nuevos = await prisma.$queryRaw<{ id: string; concepto: string | null; contraparte: string | null; importe: number; destino: string | null }[]>`
          SELECT id, concepto, contraparte, importe::float, destino
          FROM movimientos_bancarios
          WHERE cuenta_bancaria_id = ${cuentaBancariaId}::uuid
            AND subcategoria IS NULL
            AND fecha_operacion >= now() - interval '3 days'
        `
        await Promise.allSettled(nuevos.map(m => categorizarYAlertar(cuentaBancariaId, m)))
      }
    }
  }

  // Anti-duplicado CROSS-ORIGEN (LANDMINE 26/06/2026). Un mismo movimiento puede entrar por el
  // feed del banco (origen='psd2') Y por un Excel con el CONCEPTO distinto (el banco lo trae
  // verboso, "...FACTURA DIGI"; el Excel lo trae truncado, "RECIBO DIGI SPAIN TELECO"). Como el
  // `dedupe_hash` se calcula por CONTENIDO (incluye el concepto), los dos hashes difieren y el
  // `ON CONFLICT (cuenta_bancaria_id, dedupe_hash)` NO los colapsa → el Excel reimporta encima del
  // banco y se DUPLICAN gastos e ingresos (pasó el 21/06: 138 cobros/cargos duplicados, +41.762€
  // de ingreso fantasma + 11.872€ de gasto fantasma). Por eso, tras importar un Excel marcamos como
  // duplicado (`duplicado_estado='ignorado'`, REVERSIBLE) las filas recién importadas que ya tienen
  // gemelo PSD2 por (cuenta, fecha, importe), sin pasarnos del nº de gemelos PSD2 (preserva las
  // repeticiones legítimas del mismo día/importe). Se conserva SIEMPRE el feed del banco (psd2).
  if (origen !== 'psd2' && cuentasTocadas.size) {
    const ids = [...cuentasTocadas]
    // Regla idempotente y conservadora: solo si el feed del banco CUBRE POR COMPLETO el grupo
    // (psd2_n >= filas de este Excel) se marcan TODAS las de Excel. Así re-ejecutar no erosiona
    // nada (las ya marcadas salen del recuento) y, si el banco trae MENOS que el Excel (feed
    // incompleto ese día), no se toca ninguna (queda para revisión manual, nunca se pierde dato).
    await prisma.$executeRaw(Prisma.sql`
      WITH cnt AS (
        SELECT cuenta_bancaria_id, fecha_operacion, importe,
               count(*) FILTER (WHERE origen = 'psd2')     AS psd2_n,
               count(*) FILTER (WHERE origen = ${origen})  AS this_n
        FROM movimientos_bancarios
        WHERE cuenta_bancaria_id = ANY(${ids}::uuid[])
          AND origen IN ('psd2', ${origen})
          AND coalesce(duplicado_estado, '') <> 'ignorado'
        GROUP BY 1, 2, 3
      )
      UPDATE movimientos_bancarios m
      SET duplicado_estado = 'ignorado',
          comentario = COALESCE(m.comentario || ' | ', '') || 'auto-dedup: duplicado del feed del banco (psd2)'
      FROM cnt
      WHERE m.cuenta_bancaria_id = cnt.cuenta_bancaria_id
        AND m.fecha_operacion = cnt.fecha_operacion AND m.importe = cnt.importe
        AND m.origen = ${origen}
        AND coalesce(m.duplicado_estado, '') <> 'ignorado'
        AND cnt.psd2_n > 0 AND cnt.psd2_n >= cnt.this_n
    `)

    // Anti-duplicado CROSS-CUENTA tarjeta↔corriente (01/07/2026). Kutxabank exporta los cargos
    // de la tarjeta en DOS extractos: el de la CUENTA CORRIENTE y el PROPIO de la tarjeta.
    // Al importar ambos Excels, la misma compra entra bajo dos cuenta_bancaria_id distintos.
    // Regla: si las cuentas recién importadas son de tipo='corriente' y ya existe el mismo
    // (fecha, importe) en una cuenta tipo='tarjeta' de la misma sociedad → la corriente es
    // el duplicado. Y viceversa si se importa la tarjeta y ya existe la corriente.
    // Conservamos SIEMPRE el movimiento de la tarjeta (tiene el detalle del comercio).
    if (tipo === 'corriente' || tipo === 'tarjeta') {
      const tipoGanador = 'tarjeta'
      const tipoPerdedor = 'corriente'
      await prisma.$executeRaw(Prisma.sql`
        WITH tarjeta_otras AS (
          SELECT mb.fecha_operacion, mb.importe, count(*) AS n
          FROM movimientos_bancarios mb
          JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
          WHERE cb.sociedad_id = ${sociedadId}::uuid
            AND cb.tipo = ${tipoGanador}
            AND mb.cuenta_bancaria_id <> ALL(${ids}::uuid[])
            AND coalesce(mb.duplicado_estado, '') <> 'ignorado'
          GROUP BY 1, 2
        ),
        cnt AS (
          SELECT m.cuenta_bancaria_id, m.fecha_operacion, m.importe,
                 count(*) FILTER (WHERE coalesce(m.duplicado_estado,'') <> 'ignorado') AS this_n,
                 coalesce(t.n, 0) AS tarjeta_n
          FROM movimientos_bancarios m
          JOIN cuentas_bancarias cb ON cb.id = m.cuenta_bancaria_id
          LEFT JOIN tarjeta_otras t ON t.fecha_operacion = m.fecha_operacion AND t.importe = m.importe
          WHERE m.cuenta_bancaria_id = ANY(${ids}::uuid[])
            AND cb.tipo = ${tipoPerdedor}
            AND coalesce(m.duplicado_estado, '') <> 'ignorado'
          GROUP BY m.cuenta_bancaria_id, m.fecha_operacion, m.importe, t.n
        )
        UPDATE movimientos_bancarios m
        SET duplicado_estado = 'ignorado',
            comentario = COALESCE(m.comentario || ' | ', '') ||
                         'auto-dedup: duplicado cross-cuenta tarjeta↔corriente'
        FROM cnt
        JOIN cuentas_bancarias cb ON cb.id = cnt.cuenta_bancaria_id
        WHERE m.cuenta_bancaria_id = cnt.cuenta_bancaria_id
          AND m.fecha_operacion = cnt.fecha_operacion AND m.importe = cnt.importe
          AND cb.tipo = ${tipoPerdedor}
          AND coalesce(m.duplicado_estado, '') <> 'ignorado'
          AND cnt.tarjeta_n > 0 AND cnt.tarjeta_n >= cnt.this_n
      `)
    }
  }

  return { insertados, duplicados, cuentas, cuentaBancariaIds: [...cuentasTocadas], fechaInicio: fechaMin, fechaFin: fechaMax }
}

// Envía un resumen por Telegram del extracto de tarjeta de crédito recién importado.
export async function enviarResumenTarjeta(
  cuentaId: string,
  cuentaBancariaIds: string[],
  mes: string, // YYYY-MM
): Promise<void> {
  if (!cuentaBancariaIds.length) return
  const [anio, numMes] = mes.split('-').map(Number)
  const inicio = `${mes}-01`
  const fin = new Date(anio, numMes, 0).toISOString().slice(0, 10)
  const mesPrev = numMes === 1 ? `${anio - 1}-12` : `${anio}-${String(numMes - 1).padStart(2, '0')}`
  const inicioPrev = `${mesPrev}-01`
  const finPrev = new Date(anio, numMes - 1, 0).toISOString().slice(0, 10)

  const ids = cuentaBancariaIds

  const movs = await prisma.$queryRaw<Array<{
    cuenta_bancaria_id: string
    iban_mascara: string | null
    banco: string | null
    concepto: string | null
    importe: unknown
    destino: string | null
  }>>`
    SELECT mb.cuenta_bancaria_id, cb.iban_mascara, cb.banco,
           coalesce(mb.concepto_normalizado, mb.concepto) AS concepto,
           mb.importe, mb.destino
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE mb.cuenta_bancaria_id = ANY(${ids}::uuid[])
      AND mb.fecha_operacion BETWEEN ${inicio}::date AND ${fin}::date
      AND coalesce(mb.duplicado_estado, '') <> 'ignorado'
  `

  const movsPrev = await prisma.$queryRaw<Array<{ total: unknown }>>`
    SELECT coalesce(sum(abs(importe)) FILTER (WHERE importe < 0), 0) AS total
    FROM movimientos_bancarios mb
    WHERE mb.cuenta_bancaria_id = ANY(${ids}::uuid[])
      AND mb.fecha_operacion BETWEEN ${inicioPrev}::date AND ${finPrev}::date
      AND coalesce(mb.duplicado_estado, '') <> 'ignorado'
      AND importe < 0
  `

  const cargos = movs.filter(m => Number(m.importe) < 0)
  const totalMes = cargos.reduce((s, m) => s + Math.abs(Number(m.importe)), 0)
  const totalPrev = Number(movsPrev[0]?.total ?? 0)
  const sinClasificar = cargos.filter(m => !m.destino).length

  const tarjeta = movs[0]
  const label = tarjeta?.banco ? `${tarjeta.banco} ${tarjeta.iban_mascara ?? ''}`.trim() : (tarjeta?.iban_mascara ?? 'tarjeta')

  // Top 5 por importe (mayor gasto primero)
  const topConceptos = new Map<string, number>()
  for (const m of cargos) {
    const c = (m.concepto ?? 'Sin concepto').slice(0, 40)
    topConceptos.set(c, (topConceptos.get(c) ?? 0) + Math.abs(Number(m.importe)))
  }
  const top5 = [...topConceptos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)

  // Desglose por destino
  const porDestino = new Map<string, number>()
  for (const m of cargos) {
    const d = m.destino ?? 'sin_clasificar'
    porDestino.set(d, (porDestino.get(d) ?? 0) + Math.abs(Number(m.importe)))
  }
  const destinoLabel: Record<string, string> = {
    personal: 'Personal', seguros: 'Seguros', turistico_pisos: 'Pisos', turistico_duplex: 'Dúplex',
    traspaso_interno: 'Traspaso', sin_clasificar: '❓ Sin clasificar',
  }

  const diff = totalPrev > 0 ? ((totalMes - totalPrev) / totalPrev * 100).toFixed(0) : null
  const diffStr = diff != null ? ` (${Number(diff) >= 0 ? '+' : ''}${diff}% vs mes anterior)` : ''

  const lineasTop = top5.map(([c, v]) => `  · ${c}: ${fmtEur(v)}`).join('\n')
  const lineasDest = [...porDestino.entries()].map(([d, v]) => `  · ${destinoLabel[d] ?? d}: ${fmtEur(v)}`).join('\n')

  // Movimientos dudosos para revisión interactiva
  const dudosos = await getMovimientosDudosos(ids, mes).catch(() => [] as Awaited<ReturnType<typeof getMovimientosDudosos>>)

  // Calcular deducible/no deducible para el resumen
  const deducibleDestinos = new Set(['turistico_pisos', 'turistico_duplex', 'seguros'])
  const totalDeducible = cargos.filter(m => deducibleDestinos.has(m.destino ?? '')).reduce((s, m) => s + Math.abs(Number(m.importe)), 0)
  const totalNoDeducible = cargos.filter(m => m.destino === 'personal').reduce((s, m) => s + Math.abs(Number(m.importe)), 0)

  const texto = [
    `💳 <b>Tarjeta ${mes} importada</b>`,
    `<b>${label.toUpperCase()}</b>`,
    '',
    `Total gastado: <b>${fmtEur(totalMes)}</b>${diffStr}`,
    `✅ ${cargos.length - dudosos.length} clasificados automáticamente`,
    dudosos.length > 0 ? `❓ ${dudosos.length} necesitan revisión` : '✅ todos clasificados',
    '',
    `Deducible: <b>${fmtEur(totalDeducible)}</b> · No deducible: ${fmtEur(totalNoDeducible)}`,
    '',
    '<b>Top gastos:</b>',
    lineasTop || '  (sin datos)',
    '',
    '<b>Por categoría:</b>',
    lineasDest || '  (sin datos)',
  ].join('\n')

  await tgSend(texto).catch(() => {})

  // Enviar un mensaje por cada movimiento dudoso con sugerencia IA
  if (dudosos.length > 0) {
    // Contexto: movimientos del mes con destino ya confirmado
    const movsConfirmados = await prisma.$queryRaw<Array<{ concepto: string | null; importe: unknown; destino: string; fecha: string }>>`
      SELECT coalesce(mb.concepto_normalizado, mb.concepto) AS concepto,
             mb.importe::float AS importe, mb.destino,
             mb.fecha_operacion::text AS fecha
      FROM movimientos_bancarios mb
      WHERE mb.cuenta_bancaria_id = ANY(${ids}::uuid[])
        AND mb.fecha_operacion BETWEEN ${`${mes}-01`}::date AND ${new Date(Number(mes.split('-')[0]), Number(mes.split('-')[1]), 0).toISOString().slice(0, 10)}::date
        AND mb.destino_confirmado = true
        AND coalesce(mb.duplicado_estado, '') <> 'ignorado'
    `.catch(() => [])

    const movsMes = movsConfirmados.map(m => ({
      concepto: m.concepto,
      importe: Number(m.importe),
      destino: m.destino,
      fecha: m.fecha,
    }))

    for (const mov of dudosos) {
      const sugerencia = await sugerirDestinoConContexto(mov, movsMes).catch(() => ({ destino: 'personal' as const, confianza: 0, explicacion: '' }))
      await enviarMensajeDudoso(mov, sugerencia).catch(() => {})
    }
  }
}

export type CuentaBancaria = {
  id: string
  sociedadId: string
  sociedadNombre: string
  banco: string | null
  ibanMascara: string | null
  alias: string | null
  divisa: string
  saldoActual: number | null
  saldoFecha: string | null
  oculta: boolean
  sincronizada: boolean
}

export type SaldoConsolidado = {
  total: number
  porSociedad: Array<{ sociedadId: string; sociedadNombre: string; saldo: number }>
  cuentas: CuentaBancaria[]
}

// Saldo consolidado de TODAS las cuentas bancarias de una cuenta (scoped por cuenta_id).
// Las cuentas con oculta=true se devuelven al final del array pero NO suman al total.
export async function getSaldoConsolidado(cuentaId: string): Promise<SaldoConsolidado> {
  const cuentas = await prisma.$queryRaw<Array<{
    id: string; sociedad_id: string; sociedad_nombre: string; banco: string | null
    iban_mascara: string | null; alias: string | null; divisa: string
    saldo_actual: unknown; saldo_fecha: Date | null; oculta: boolean; sincronizada: boolean
  }>>`
    SELECT cb.id, cb.sociedad_id, s.nombre AS sociedad_nombre, cb.banco, cb.iban_mascara,
           cb.alias, cb.divisa, cb.saldo_actual, cb.saldo_fecha, cb.oculta,
           EXISTS (
             SELECT 1 FROM movimientos_bancarios mb
             WHERE mb.cuenta_bancaria_id = cb.id AND mb.origen = 'psd2'
           ) AS sincronizada
    FROM cuentas_bancarias cb
    JOIN sociedades s ON s.id = cb.sociedad_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
    ORDER BY cb.oculta, s.nombre, cb.banco
  `

  const lista: CuentaBancaria[] = cuentas.map(c => ({
    id: c.id,
    sociedadId: c.sociedad_id,
    sociedadNombre: c.sociedad_nombre,
    banco: c.banco,
    ibanMascara: c.iban_mascara,
    alias: c.alias,
    divisa: c.divisa,
    saldoActual: c.saldo_actual == null ? null : Number(c.saldo_actual),
    saldoFecha: c.saldo_fecha ? c.saldo_fecha.toISOString().slice(0, 10) : null,
    oculta: c.oculta,
    sincronizada: c.sincronizada,
  }))

  const porSocMap = new Map<string, { sociedadId: string; sociedadNombre: string; saldo: number }>()
  let total = 0
  for (const c of lista) {
    if (c.oculta) continue
    const s = c.saldoActual ?? 0
    total += s
    const prev = porSocMap.get(c.sociedadId) ?? { sociedadId: c.sociedadId, sociedadNombre: c.sociedadNombre, saldo: 0 }
    prev.saldo += s
    porSocMap.set(c.sociedadId, prev)
  }

  return { total, porSociedad: [...porSocMap.values()], cuentas: lista }
}

// ── Saldo por cuenta + últimos movimientos (home) ──────────────────────────────
// Un movimiento con la MÁXIMA información disponible para el bloque "Saldo por cuenta".
export type MovReciente = {
  id: string
  fechaOperacion: string | null
  fechaValor: string | null
  importe: number
  saldoPosterior: number | null
  concepto: string | null
  contraparte: string | null
  categoria: string | null
  destino: string | null
  conciliado: boolean
  requiereRevision: boolean
}
export type CuentaConMovimientos = {
  id: string
  banco: string | null
  alias: string | null
  ibanMascara: string | null
  sociedadNombre: string
  saldoActual: number | null
  saldoFecha: string | null
  movs: MovReciente[]
}

// Saldo de cada cuenta bancaria PROPIA (excluye titular='conyuge', las de Pilar) con sus
// últimos `maxMovs` movimientos (por nº, no por días: si el feed lleva días sin traer nada,
// la tarjeta no se queda vacía). Para el bloque "Saldo por cuenta" de la home. La ventana de
// 90 días acota el ROW_NUMBER sin cambiar el resultado en cuentas con actividad normal.
export async function getCuentasConMovimientos(cuentaId: string, maxMovs = 5): Promise<CuentaConMovimientos[]> {
  const rows = await prisma.$queryRaw<Array<{
    id: string; banco: string | null; alias: string | null; iban_mascara: string | null
    sociedad_nombre: string; saldo_actual: unknown; saldo_fecha: Date | null
    mov_id: string | null; fecha_operacion: Date | null; fecha_valor: Date | null
    importe: unknown; saldo_posterior: unknown; concepto: string | null; contraparte: string | null
    categoria: string | null; destino: string | null; conciliado: boolean | null; requiere_revision: boolean | null
  }>>`
    SELECT * FROM (
      SELECT cb.id, cb.banco, cb.alias, cb.iban_mascara, s.nombre AS sociedad_nombre,
             cb.saldo_actual, cb.saldo_fecha,
             mb.id AS mov_id, mb.fecha_operacion, mb.fecha_valor, mb.importe, mb.saldo_posterior,
             coalesce(mb.concepto_normalizado, mb.concepto) AS concepto, mb.contraparte,
             mb.categoria, mb.destino, mb.conciliado, mb.requiere_revision,
             row_number() OVER (
               PARTITION BY cb.id
               ORDER BY mb.fecha_operacion DESC NULLS LAST, abs(mb.importe) DESC
             ) AS rn
      FROM cuentas_bancarias cb
      JOIN sociedades s ON s.id = cb.sociedad_id
      LEFT JOIN movimientos_bancarios mb
        ON mb.cuenta_bancaria_id = cb.id
       AND mb.fecha_operacion >= (current_date - 90)
       AND coalesce(mb.duplicado_estado, '') <> 'ignorado'
      WHERE cb.cuenta_id = ${cuentaId}::uuid
        AND coalesce(cb.titular, 'titular') <> 'conyuge'
        AND NOT cb.oculta
    ) t
    WHERE t.rn <= ${maxMovs}::int OR t.mov_id IS NULL
    ORDER BY t.sociedad_nombre, t.banco, t.rn
  `

  const porCuenta = new Map<string, CuentaConMovimientos>()
  for (const r of rows) {
    let c = porCuenta.get(r.id)
    if (!c) {
      c = {
        id: r.id, banco: r.banco, alias: r.alias, ibanMascara: r.iban_mascara,
        sociedadNombre: r.sociedad_nombre,
        saldoActual: r.saldo_actual == null ? null : Number(r.saldo_actual),
        saldoFecha: r.saldo_fecha ? r.saldo_fecha.toISOString().slice(0, 10) : null,
        movs: [],
      }
      porCuenta.set(r.id, c)
    }
    if (r.mov_id) {
      c.movs.push({
        id: r.mov_id,
        fechaOperacion: r.fecha_operacion ? r.fecha_operacion.toISOString().slice(0, 10) : null,
        fechaValor: r.fecha_valor ? r.fecha_valor.toISOString().slice(0, 10) : null,
        importe: Number(r.importe),
        saldoPosterior: r.saldo_posterior == null ? null : Number(r.saldo_posterior),
        concepto: r.concepto,
        contraparte: r.contraparte,
        categoria: r.categoria,
        destino: r.destino,
        conciliado: r.conciliado ?? false,
        requiereRevision: r.requiere_revision ?? false,
      })
    }
  }
  return [...porCuenta.values()]
}

// Lo "ya cobrado" de los pisos = abonos REALES en banco con destino turístico (conciliado con
// banco, decisión del dueño). El banco solo distingue Dúplex (BBVA) vs resto de pisos (Kutxa
// agrupados); no hay atribución por piso individual. Mes en curso + acumulado del año.
export type CobradoPisos = {
  mes: { duplex: number; pisos: number; total: number }
  ytd: { duplex: number; pisos: number; total: number }
}
export async function getCobradoPisos(cuentaId: string, anio: number): Promise<CobradoPisos> {
  const rows = await prisma.$queryRaw<Array<{ destino: string; mes: number | null; ytd: number | null }>>`
    SELECT mb.destino,
           SUM(mb.importe) FILTER (
             WHERE date_part('month', mb.fecha_operacion) = date_part('month', current_date)
               AND date_part('year', mb.fecha_operacion) = ${anio}
           )::float AS mes,
           SUM(mb.importe) FILTER (WHERE date_part('year', mb.fecha_operacion) = ${anio})::float AS ytd
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
      AND mb.importe > 0
      AND mb.destino IN ('turistico_duplex', 'turistico_pisos')
      AND coalesce(mb.duplicado_estado, '') <> 'ignorado'
    GROUP BY mb.destino
  `
  const pick = (dest: string, k: 'mes' | 'ytd') => Number(rows.find(r => r.destino === dest)?.[k] ?? 0)
  const r2 = (n: number) => Math.round(n * 100) / 100
  const mesDuplex = r2(pick('turistico_duplex', 'mes')), mesPisos = r2(pick('turistico_pisos', 'mes'))
  const ytdDuplex = r2(pick('turistico_duplex', 'ytd')), ytdPisos = r2(pick('turistico_pisos', 'ytd'))
  return {
    mes: { duplex: mesDuplex, pisos: mesPisos, total: r2(mesDuplex + mesPisos) },
    ytd: { duplex: ytdDuplex, pisos: ytdPisos, total: r2(ytdDuplex + ytdPisos) },
  }
}

// Serie mensual de lo cobrado de pisos (últimos N meses, incluido el actual) para la gráfica
// del dashboard. Misma detección que getCobradoPisos (abonos destino turistico_*), pero leyendo
// de la vista canónica v_movimientos_activos (regla: toda lectura NUEVA de P&L va por la vista).
export type MesCobros = { mes: string; duplex: number; pisos: number }
type SerieCobrosRow = { mes: string; duplex: number | null; pisos: number | null }
export async function getSerieCobrosPisos(cuentaId: string, meses = 6): Promise<MesCobros[]> {
  const rows = (await prisma.$queryRaw<SerieCobrosRow[]>`
    SELECT to_char(date_trunc('month', mb.fecha_operacion), 'YYYY-MM') AS mes,
           SUM(mb.importe) FILTER (WHERE mb.destino = 'turistico_duplex')::float AS duplex,
           SUM(mb.importe) FILTER (WHERE mb.destino = 'turistico_pisos')::float AS pisos
    FROM v_movimientos_activos mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
      AND mb.importe > 0
      AND mb.destino IN ('turistico_duplex', 'turistico_pisos')
      AND mb.fecha_operacion >= date_trunc('month', current_date) - make_interval(months => ${meses - 1}::int)
    GROUP BY 1
    ORDER BY 1
  `) as SerieCobrosRow[]
  const porMes = new Map(rows.map((r: SerieCobrosRow) => [r.mes, r]))
  const r2 = (n: number) => Math.round(n * 100) / 100
  // Rellena los meses sin cobros con 0 para que la gráfica no "salte" huecos.
  const serie: MesCobros[] = []
  const hoy = new Date()
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - i, 1))
    const clave = d.toISOString().slice(0, 7)
    const r = porMes.get(clave)
    serie.push({ mes: clave, duplex: r2(Number(r?.duplex ?? 0)), pisos: r2(Number(r?.pisos ?? 0)) })
  }
  return serie
}

// Los gastos (cargos) más grandes del mes en curso, para revisar de un vistazo. Excluye
// traspasos internos (no son gasto real).
export type GastoGrande = {
  id: string
  fechaOperacion: string | null
  importe: number
  concepto: string | null
  contraparte: string | null
  categoria: string | null
  destino: string | null
}
export async function getTopGastosMes(cuentaId: string, n = 5): Promise<GastoGrande[]> {
  const rows = await prisma.$queryRaw<Array<{
    id: string; fecha_operacion: Date | null; importe: number
    concepto: string | null; contraparte: string | null; categoria: string | null; destino: string | null
  }>>`
    SELECT mb.id, mb.fecha_operacion,
           coalesce(mb.concepto_normalizado, mb.concepto) AS concepto, mb.contraparte,
           mb.categoria, mb.destino, mb.importe::float AS importe
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
      AND mb.importe < 0
      AND coalesce(mb.destino, '') <> 'traspaso_interno'
      AND coalesce(mb.duplicado_estado, '') <> 'ignorado'
      AND date_part('month', mb.fecha_operacion) = date_part('month', current_date)
      AND date_part('year', mb.fecha_operacion) = date_part('year', current_date)
    ORDER BY abs(mb.importe) DESC
    LIMIT ${n}
  `
  return rows.map(r => ({
    id: r.id,
    fechaOperacion: r.fecha_operacion ? r.fecha_operacion.toISOString().slice(0, 10) : null,
    importe: Number(r.importe),
    concepto: r.concepto,
    contraparte: r.contraparte,
    categoria: r.categoria,
    destino: r.destino,
  }))
}

export type MovimientoBancario = {
  id: string
  cuentaBancariaId: string
  fechaOperacion: string | null
  importe: number
  concepto: string | null
  conceptoNormalizado: string | null
  categoria: string | null
  contraparte: string | null
  conciliado: boolean
  requiereRevision: boolean
}

const SELECT_MOV = Prisma.sql`mb.id, mb.cuenta_bancaria_id, mb.fecha_operacion, mb.importe, mb.concepto,
  mb.concepto_normalizado, mb.categoria, mb.contraparte, mb.conciliado, mb.requiere_revision`

function mapMov(r: MovRow): MovimientoBancario {
  return {
    id: r.id,
    cuentaBancariaId: r.cuenta_bancaria_id,
    fechaOperacion: r.fecha_operacion ? r.fecha_operacion.toISOString().slice(0, 10) : null,
    importe: Number(r.importe),
    concepto: r.concepto,
    conceptoNormalizado: r.concepto_normalizado,
    categoria: r.categoria,
    contraparte: r.contraparte,
    conciliado: r.conciliado,
    requiereRevision: r.requiere_revision,
  }
}

// Últimos movimientos de una cuenta (todas sus cuentas bancarias, o una concreta).
export async function listarMovimientos(
  cuentaId: string,
  cuentaBancariaId?: string,
  limite = 100,
): Promise<MovimientoBancario[]> {
  const rows = cuentaBancariaId
    ? await prisma.$queryRaw<MovRow[]>`
        SELECT ${SELECT_MOV}
        FROM movimientos_bancarios mb
        JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
        WHERE cb.cuenta_id = ${cuentaId}::uuid AND mb.cuenta_bancaria_id = ${cuentaBancariaId}::uuid
          AND COALESCE(mb.duplicado_estado, '') <> 'ignorado' -- excluir duplicados marcados
        ORDER BY mb.fecha_operacion DESC NULLS LAST, mb.created_at DESC
        LIMIT ${limite}
      `
    : await prisma.$queryRaw<MovRow[]>`
        SELECT ${SELECT_MOV}
        FROM movimientos_bancarios mb
        JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
        WHERE cb.cuenta_id = ${cuentaId}::uuid
          AND COALESCE(mb.duplicado_estado, '') <> 'ignorado' -- excluir duplicados marcados
        ORDER BY mb.fecha_operacion DESC NULLS LAST, mb.created_at DESC
        LIMIT ${limite}
      `
  return rows.map(mapMov)
}

// ── Libro completo de movimientos (paginado, con filtros) ───────────────────────────────────────
// Para la vista "ver TODOS los movimientos" de /banca: filtra por cuenta bancaria, rango de fechas,
// signo y texto, y pagina en el servidor (LIMIT/OFFSET) para no montar miles de filas de golpe.
// Devuelve el negocio (`destino`) por fila para poder reclasificar en línea. Scoped por cuenta_id.
export type MovLedger = {
  id: string
  fecha: string | null
  concepto: string
  contraparte: string | null
  importe: number
  destino: string | null
  categoria: string | null
  banco: string | null
  cuentaBancariaId: string
  conciliado: boolean
  requiereRevision: boolean
  // Bien de inversión (mobiliario/obra): sigue en un bucket deducible pero se amortiza por años,
  // no cuenta como gasto deducible del ejercicio. La UI lo matiza en el badge de deducibilidad.
  amortizable: boolean
}
export type LedgerFiltros = {
  cuentaBancariaId?: string
  desde?: string   // YYYY-MM-DD
  hasta?: string   // YYYY-MM-DD
  signo?: 'ingreso' | 'gasto'
  q?: string
}
export async function listarMovimientosLedger(
  cuentaId: string, filtros: LedgerFiltros = {}, limite = 50, offset = 0,
): Promise<{ movimientos: MovLedger[]; total: number; hayMas: boolean }> {
  const conds: Prisma.Sql[] = [
    Prisma.sql`cb.cuenta_id = ${cuentaId}::uuid`,
    Prisma.sql`COALESCE(mb.duplicado_estado, '') <> 'ignorado'`,
  ]
  if (filtros.cuentaBancariaId) conds.push(Prisma.sql`mb.cuenta_bancaria_id = ${filtros.cuentaBancariaId}::uuid`)
  if (filtros.desde) conds.push(Prisma.sql`mb.fecha_operacion >= ${filtros.desde}::date`)
  if (filtros.hasta) conds.push(Prisma.sql`mb.fecha_operacion <= ${filtros.hasta}::date`)
  if (filtros.signo === 'ingreso') conds.push(Prisma.sql`mb.importe > 0`)
  if (filtros.signo === 'gasto') conds.push(Prisma.sql`mb.importe < 0`)
  if (filtros.q) {
    const like = `%${filtros.q}%`
    conds.push(Prisma.sql`(mb.concepto ILIKE ${like} OR mb.contraparte ILIKE ${like} OR mb.concepto_normalizado ILIKE ${like})`)
  }
  const where = Prisma.join(conds, ' AND ')

  const rows = await prisma.$queryRaw<Array<{
    id: string; fecha_operacion: Date | null; concepto: string | null; contraparte: string | null
    importe: unknown; destino: string | null; categoria: string | null; banco: string | null
    cuenta_bancaria_id: string; conciliado: boolean; requiere_revision: boolean; amortizable: boolean | null
  }>>(Prisma.sql`
    SELECT mb.id, mb.fecha_operacion,
           coalesce(mb.concepto_normalizado, mb.concepto, mb.contraparte) AS concepto,
           mb.contraparte, mb.importe, mb.destino, mb.categoria, cb.banco,
           mb.cuenta_bancaria_id, mb.conciliado, mb.requiere_revision, mb.amortizable
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE ${where}
    ORDER BY mb.fecha_operacion DESC NULLS LAST, mb.created_at DESC
    LIMIT ${limite} OFFSET ${offset}
  `)
  const totalRows = await prisma.$queryRaw<Array<{ n: bigint }>>(Prisma.sql`
    SELECT count(*)::bigint AS n
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE ${where}
  `)
  const total = Number(totalRows[0]?.n ?? 0)
  const movimientos: MovLedger[] = rows.map(r => ({
    id: r.id,
    fecha: r.fecha_operacion ? r.fecha_operacion.toISOString().slice(0, 10) : null,
    concepto: r.concepto || '',
    contraparte: r.contraparte,
    importe: Number(r.importe),
    destino: r.destino,
    categoria: r.categoria,
    banco: r.banco,
    cuentaBancariaId: r.cuenta_bancaria_id,
    conciliado: r.conciliado,
    requiereRevision: r.requiere_revision,
    amortizable: !!r.amortizable,
  }))
  return { movimientos, total, hayMas: offset + movimientos.length < total }
}

// INGRESOS (abonos) marcados para revisar cuyo NEGOCIO está sin confirmar. Antes un ingreso mal
// clasificado no tenía dónde aparecer (la revisión de /finanzas/gastos es solo importe<0); estos
// abonos se surten aquí para que el dueño les asigne el negocio (destino) desde /banca. Scoped.
export async function listarIngresosPorRevisar(cuentaId: string, limite = 40): Promise<MovLedger[]> {
  const rows = await prisma.$queryRaw<Array<{
    id: string; fecha_operacion: Date | null; concepto: string | null; contraparte: string | null
    importe: unknown; destino: string | null; categoria: string | null; banco: string | null
    cuenta_bancaria_id: string; conciliado: boolean; requiere_revision: boolean
  }>>`
    SELECT mb.id, mb.fecha_operacion,
           coalesce(mb.concepto_normalizado, mb.concepto, mb.contraparte) AS concepto,
           mb.contraparte, mb.importe, mb.destino, mb.categoria, cb.banco,
           mb.cuenta_bancaria_id, mb.conciliado, mb.requiere_revision
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
      AND mb.importe > 0
      AND mb.requiere_revision = true
      AND COALESCE(mb.destino_confirmado, false) = false
      AND COALESCE(mb.duplicado_estado, '') <> 'ignorado'
      -- Los traspasos internos (pago del recibo de la tarjeta "PAGO RECIBO 466…", movimientos entre
      -- cuentas propias) NO son ingresos: el gasto real ya está en el detalle de la tarjeta. No tienen
      -- negocio que asignar → fuera de la bandeja aunque conserven la marca de revisión.
      AND COALESCE(mb.destino, '') <> 'traspaso_interno'
    ORDER BY mb.fecha_operacion DESC NULLS LAST, mb.importe DESC
    LIMIT ${limite}
  `
  return rows.map(r => ({
    id: r.id,
    fecha: r.fecha_operacion ? r.fecha_operacion.toISOString().slice(0, 10) : null,
    concepto: r.concepto || '',
    contraparte: r.contraparte,
    importe: Number(r.importe),
    destino: r.destino,
    categoria: r.categoria,
    banco: r.banco,
    cuentaBancariaId: r.cuenta_bancaria_id,
    conciliado: r.conciliado,
    requiereRevision: r.requiere_revision,
    amortizable: false,   // los abonos (ingresos) no son bienes de inversión amortizables
  }))
}

// GASTOS que la IA marcó "por revisar": lo dudoso es el NEGOCIO (destino) — la bandeja de /banca
// lo resuelve vía /api/banca/destino (confirma + aprende regla del comercio).
export async function listarPorRevisar(cuentaId: string, limite = 40): Promise<MovimientoBancario[]> {
  const rows = await prisma.$queryRaw<MovRow[]>`
    SELECT ${SELECT_MOV}
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid AND mb.requiere_revision = true
      AND COALESCE(mb.destino_confirmado, false) = false  -- un destino YA confirmado no es "por revisar":
                          -- reclasificar/confirmar deja el negocio decidido; mostrarlo aquí es un flag
                          -- zombie (mismo criterio que getAlertas, health-check y /finanzas/gastos).
      AND mb.importe < 0  -- solo GASTOS: los ingresos dudosos viven en «Ingresos por revisar» (negocio),
                          -- si no, el mismo abono salía en las dos bandejas (categoría y negocio).
      AND COALESCE(mb.duplicado_estado, '') <> 'ignorado' -- excluir duplicados marcados
    ORDER BY mb.fecha_operacion DESC NULLS LAST, mb.created_at DESC
    LIMIT ${limite}
  `
  return rows.map(mapMov)
}

type MovRow = {
  id: string; cuenta_bancaria_id: string; fecha_operacion: Date | null; importe: unknown
  concepto: string | null; concepto_normalizado: string | null; categoria: string | null
  contraparte: string | null; conciliado: boolean; requiere_revision: boolean
}

// Resumen por "destino"/negocio (pisos, dúplex, seguros, traspaso interno, personal).
// Evolución mensual (ingresos vs gastos) de los últimos N meses, desde los movimientos
// bancarios, excluyendo traspasos internos (no son ingreso/gasto real). Para el gráfico.
export type MesEvolucion = { mes: string; ingresos: number; gastos: number }
export async function getEvolucionMensual(cuentaId: string, meses = 12): Promise<MesEvolucion[]> {
  const rows = await prisma.$queryRaw<Array<{ mes: string; ingresos: unknown; gastos: unknown }>>`
    SELECT to_char(date_trunc('month', mb.fecha_operacion), 'YYYY-MM') AS mes,
           coalesce(sum(mb.importe) FILTER (WHERE mb.importe > 0), 0) AS ingresos,
           coalesce(sum(-mb.importe) FILTER (WHERE mb.importe < 0), 0) AS gastos
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
      AND coalesce(mb.destino, '') <> 'traspaso_interno'
      AND COALESCE(mb.duplicado_estado, '') <> 'ignorado' -- excluir duplicados marcados
      AND mb.fecha_operacion >= (date_trunc('month', current_date) - make_interval(months => ${meses - 1}::int))
    GROUP BY 1 ORDER BY 1
  `
  return rows.map(r => ({ mes: r.mes, ingresos: Number(r.ingresos), gastos: Number(r.gastos) }))
}

// Todos los movimientos de la cuenta para exportar (al gestor). Orden cronológico,
// con la sociedad/banco, categoría y negocio ya resueltos. Scoped por cuenta_id.
export type MovExport = {
  fecha: string | null; valor: string | null; sociedad: string; banco: string | null
  concepto: string; contraparte: string | null; categoria: string | null
  categoriaPgc: string | null; destino: string | null; importe: number; conciliado: boolean
}
export async function getMovimientosExport(cuentaId: string): Promise<MovExport[]> {
  const rows = await prisma.$queryRaw<Array<{
    fecha_operacion: Date | null; fecha_valor: Date | null; sociedad: string; banco: string | null
    concepto: string | null; concepto_normalizado: string | null; contraparte: string | null
    categoria: string | null; categoria_pgc: string | null; destino: string | null
    importe: unknown; conciliado: boolean
  }>>`
    SELECT mb.fecha_operacion, mb.fecha_valor, s.nombre AS sociedad, cb.banco,
           mb.concepto, mb.concepto_normalizado, mb.contraparte, mb.categoria,
           mb.categoria_pgc, mb.destino, mb.importe, mb.conciliado
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    JOIN sociedades s ON s.id = cb.sociedad_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
      AND COALESCE(mb.duplicado_estado, '') <> 'ignorado' -- excluir duplicados marcados
    ORDER BY mb.fecha_operacion ASC NULLS LAST, mb.created_at ASC
  `
  return rows.map(r => ({
    fecha: r.fecha_operacion ? r.fecha_operacion.toISOString().slice(0, 10) : null,
    valor: r.fecha_valor ? r.fecha_valor.toISOString().slice(0, 10) : null,
    sociedad: r.sociedad,
    banco: r.banco,
    concepto: r.concepto_normalizado || r.concepto || r.contraparte || '',
    contraparte: r.contraparte,
    categoria: r.categoria,
    categoriaPgc: r.categoria_pgc,
    destino: r.destino,
    importe: Number(r.importe),
    conciliado: r.conciliado,
  }))
}

// Comparativa del mes en curso vs el mes anterior (ingresos/gastos/neto), excluyendo
// traspasos internos. Para la tira de "este mes vs anterior" del dashboard.
export type ComparativaMes = { ingresos: number; gastos: number; neto: number }
export async function getComparativaMensual(cuentaId: string): Promise<{ actual: ComparativaMes; anterior: ComparativaMes }> {
  const rows = await prisma.$queryRaw<Array<{ mes: string; ingresos: unknown; gastos: unknown }>>`
    SELECT to_char(date_trunc('month', mb.fecha_operacion), 'YYYY-MM') AS mes,
           coalesce(sum(mb.importe) FILTER (WHERE mb.importe > 0), 0) AS ingresos,
           coalesce(sum(-mb.importe) FILTER (WHERE mb.importe < 0), 0) AS gastos
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
      AND coalesce(mb.destino, '') <> 'traspaso_interno'
      AND COALESCE(mb.duplicado_estado, '') <> 'ignorado' -- excluir duplicados marcados
      AND mb.fecha_operacion >= (date_trunc('month', current_date) - make_interval(months => 1))
    GROUP BY 1
  `
  const mesActual = new Date().toISOString().slice(0, 7)
  const find = (mes: string): ComparativaMes => {
    const r = rows.find(x => x.mes === mes)
    const ingresos = r ? Number(r.ingresos) : 0
    const gastos = r ? Number(r.gastos) : 0
    return { ingresos, gastos, neto: ingresos - gastos }
  }
  const prev = new Date(); prev.setDate(1); prev.setMonth(prev.getMonth() - 1)
  return { actual: find(mesActual), anterior: find(prev.toISOString().slice(0, 7)) }
}

// Desglose de GASTOS por categoría (la etiqueta IA/reglas) del año en curso, para el
// gráfico de barras "en qué se va el dinero". Excluye traspasos internos.
export type GastoCategoria = { categoria: string; total: number; movs: number }
export async function getGastosPorCategoria(cuentaId: string): Promise<GastoCategoria[]> {
  const rows = await prisma.$queryRaw<Array<{ categoria: string | null; total: unknown; movs: bigint }>>`
    SELECT coalesce(nullif(mb.categoria, ''), 'otros') AS categoria,
           coalesce(sum(-mb.importe), 0) AS total, count(*) AS movs
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid AND mb.importe < 0
      AND coalesce(mb.destino, '') <> 'traspaso_interno'
      AND COALESCE(mb.duplicado_estado, '') <> 'ignorado' -- excluir duplicados marcados
      AND mb.fecha_operacion >= date_trunc('year', current_date)
    GROUP BY 1 ORDER BY 2 DESC
  `
  return rows.map(r => ({ categoria: r.categoria ?? 'otros', total: Number(r.total), movs: Number(r.movs) }))
}

// Evolución del NETO mensual por negocio/destino (últimos N meses), para ver qué negocio
// tira de la caja mes a mes. Devuelve {meses, filas: por destino con neto por mes}.
export type EvolucionDestino = { destino: string; netoPorMes: number[]; total: number }
export async function getEvolucionPorDestino(cuentaId: string, meses = 6): Promise<{ meses: string[]; filas: EvolucionDestino[] }> {
  const rows = await prisma.$queryRaw<Array<{ destino: string | null; mes: string; neto: unknown }>>`
    SELECT coalesce(mb.destino, 'personal') AS destino,
           to_char(date_trunc('month', mb.fecha_operacion), 'YYYY-MM') AS mes,
           coalesce(sum(mb.importe), 0) AS neto
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
      AND coalesce(mb.destino, '') <> 'traspaso_interno'
      AND COALESCE(mb.duplicado_estado, '') <> 'ignorado' -- excluir duplicados marcados
      AND mb.fecha_operacion >= (date_trunc('month', current_date) - make_interval(months => ${meses - 1}::int))
    GROUP BY 1, 2
  `
  // Eje de meses (los últimos N, en orden cronológico).
  const ejes: string[] = []
  const base = new Date(); base.setDate(1)
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(base); d.setMonth(d.getMonth() - i)
    ejes.push(d.toISOString().slice(0, 7))
  }
  const porDestino = new Map<string, Map<string, number>>()
  for (const r of rows) {
    const dest = r.destino ?? 'personal'
    if (!porDestino.has(dest)) porDestino.set(dest, new Map())
    porDestino.get(dest)!.set(r.mes, Number(r.neto))
  }
  const filas: EvolucionDestino[] = [...porDestino.entries()].map(([destino, m]) => {
    const netoPorMes = ejes.map(mes => m.get(mes) ?? 0)
    return { destino, netoPorMes, total: netoPorMes.reduce((s, n) => s + n, 0) }
  }).sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
  return { meses: ejes, filas }
}

// Alertas accionables para el dashboard: movimientos por revisar y posibles cargos
// duplicados (mismo importe y contraparte en ±4 días). Todo desde movimientos_bancarios.
export type Alertas = {
  porRevisar: number
  sinJustificante: number
  duplicados: number
  duplicadosDetalle: Array<{ concepto: string; importe: number; fecha: string | null }>
  facturasFaltantes: number
  cobrosPendientes: number              // nº de reservas OTA con cobro pendiente pasado de margen
  cobrosPendientesEur: number           // € que faltan por cobrar
  cobrosDetalle: Pendiente[]            // hasta 3 reservas citadas en el banner
}
export async function getAlertas(cuentaId: string): Promise<Alertas> {
  const now = new Date()
  const mesPrev = now.getMonth() === 0 ? 12 : now.getMonth()
  const añoPrev = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()

  const [rev, sinJustif, grupos, registrosPrev, cobros] = await Promise.all([
    // «Por revisar»: mismo criterio que la bandeja de /finanzas?tab=gastos
    // (requiere_revision, aún sin confirmar, que no sea un traspaso interno y que sea un GASTO).
    // El filtro importe<0 evita etiquetar como "gastos por revisar" a los abonos (ingresos) que
    // conservan el flag requiere_revision sin confirmar — antes inflaban el contador del banner.
    prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*) AS n
      FROM movimientos_bancarios mb
      JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
      WHERE cb.cuenta_id = ${cuentaId}::uuid
        AND mb.requiere_revision = true
        AND mb.importe < 0
        AND COALESCE(mb.destino_confirmado, false) = false
        AND COALESCE(mb.destino, '') <> 'traspaso_interno'
        AND COALESCE(mb.duplicado_estado, '') <> 'ignorado'`,
    // «Sin justificante»: cargos deducibles del año en curso (correduría + pisos), no
    // amortizables, sin factura conciliada. Espejo de `resumen.sinJustificante` del panel.
    prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*) AS n
      FROM movimientos_bancarios mb
      JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
      WHERE cb.cuenta_id = ${cuentaId}::uuid
        AND mb.importe < 0
        AND mb.destino IN ('seguros', 'turistico_pisos', 'turistico_duplex')
        AND COALESCE(mb.amortizable, false) = false
        AND COALESCE(mb.conciliado, false) = false
        AND mb.factura_ref IS NULL
        AND date_part('year', mb.fecha_operacion) = ${now.getFullYear()}
        AND COALESCE(mb.duplicado_estado, '') <> 'ignorado'`,
    getDuplicadosSospechosos(cuentaId),
    prisma.$queryRaw<Array<{ proveedor: string }>>`
      SELECT proveedor FROM facturas_drive WHERE anio = ${añoPrev} AND mes = ${mesPrev}`,
    getEstadoCobrosOTA(cuentaId),
  ])

  // Facturas recurrentes que faltan del mes anterior. Se importa la lib aquí (no al tope del
  // fichero) para no crear dependencia circular con lib/sivra/facturas-control.
  const { PROVEEDORES_RECURRENTES, esperadoEnMes } = await import('./sivra/facturas-control')
  const esperados = PROVEEDORES_RECURRENTES.filter(p => esperadoEnMes(p, añoPrev, mesPrev))
  const archivados = new Set(registrosPrev.map(r => r.proveedor))
  const facturasFaltantes = esperados.filter(p => !archivados.has(p.id)).length

  const visibles = grupos.filter(g => g.superaUmbral)
  return {
    porRevisar: Number(rev[0]?.n ?? 0),
    sinJustificante: Number(sinJustif[0]?.n ?? 0),
    duplicados: visibles.length,
    duplicadosDetalle: visibles.slice(0, 3).map(g => ({
      concepto: g.movimientos[0]?.concepto || 'Movimiento',
      importe: g.importe,
      fecha: g.movimientos[0]?.fecha ?? null,
    })),
    facturasFaltantes,
    cobrosPendientes: cobros.hayDescuadre ? cobros.pendientes.length : 0,
    cobrosPendientesEur: cobros.hayDescuadre ? cobros.pendientesEur : 0,
    cobrosDetalle: cobros.hayDescuadre ? cobros.pendientes.slice(0, 3) : [],
  }
}

type DupRow = {
  id: string; otro_id: string
  concepto: string | null; otro_concepto: string | null
  importe: number
  fecha_operacion: Date | null; otro_fecha: Date | null
  conciliado: boolean; otro_conciliado: boolean
  contraparte_key: string | null
  ocurrencias_contraparte: number
  origen_a: string | null; origen_b: string | null
  cuenta_label_a: string | null; cuenta_label_b: string | null
}

// Pares de gastos sospechosos de cobro doble: mismo importe + misma contraparte/concepto en
// ±4 días, últimos 60 días, AMBOS sin resolver (duplicado_estado IS NULL). Excluye pares donde
// los dos están conciliados a facturas DISTINTAS (gastos legítimos, no duplicado). La
// clasificación/agrupación es pura (lib/duplicados.ts).
// También detecta pares CROSS-CUENTA (misma sociedad, distinta cuenta bancaria): caso tarjeta
// con CCC importada por Excel y la misma tarjeta sincronizada por PSD2 con IBAN.
export async function getDuplicadosSospechosos(cuentaId: string): Promise<DupGrupo[]> {
  const rows = await prisma.$queryRaw<DupRow[]>`
    -- Pares dentro de la MISMA cuenta bancaria
    SELECT a.id, b.id AS otro_id,
           coalesce(a.concepto_normalizado, a.concepto, a.contraparte) AS concepto,
           coalesce(b.concepto_normalizado, b.concepto, b.contraparte) AS otro_concepto,
           a.importe::float AS importe,
           a.fecha_operacion, b.fecha_operacion AS otro_fecha,
           a.conciliado, b.conciliado AS otro_conciliado,
           coalesce(a.contraparte, a.concepto) AS contraparte_key,
           (SELECT count(*)::int FROM movimientos_bancarios m2
             WHERE m2.cuenta_bancaria_id = a.cuenta_bancaria_id
               AND coalesce(m2.contraparte, m2.concepto) = coalesce(a.contraparte, a.concepto)
               AND m2.importe < 0
               AND m2.fecha_operacion >= current_date - 60) AS ocurrencias_contraparte,
           a.origen AS origen_a, b.origen AS origen_b,
           -- Mismo par = misma cuenta bancaria → misma etiqueta para los dos (banco + IBAN
           -- enmascarado), para que el dueño sepa DÓNDE buscar cada cargo y verificarlo.
           coalesce(cb.banco || coalesce(' ' || cb.iban_mascara, ''), cb.alias, cb.iban_mascara, 'Cuenta') AS cuenta_label_a,
           coalesce(cb.banco || coalesce(' ' || cb.iban_mascara, ''), cb.alias, cb.iban_mascara, 'Cuenta') AS cuenta_label_b
    FROM movimientos_bancarios a
    JOIN movimientos_bancarios b
      ON b.cuenta_bancaria_id = a.cuenta_bancaria_id AND b.id > a.id
     AND b.importe = a.importe
     AND coalesce(b.contraparte, b.concepto) = coalesce(a.contraparte, a.concepto)
     AND abs(b.fecha_operacion - a.fecha_operacion) <= 4
    JOIN cuentas_bancarias cb ON cb.id = a.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
      AND a.importe < 0
      AND a.duplicado_estado IS NULL AND b.duplicado_estado IS NULL
      AND a.fecha_operacion >= current_date - 60
      AND NOT (a.conciliado AND b.conciliado
               AND a.factura_ref IS NOT NULL AND b.factura_ref IS NOT NULL
               AND a.factura_ref <> b.factura_ref)
      -- Idea A: excluir pares cross-origen (manual↔PSD2): misma tx importada dos veces
      AND NOT (
        (a.origen = 'psd2' AND b.origen IN ('norma43', 'xls-bbva', 'xls-kutxa'))
        OR (b.origen = 'psd2' AND a.origen IN ('norma43', 'xls-bbva', 'xls-kutxa'))
      )
      -- Backstop PSD2: excluir pares psd2+psd2 mismo concepto+fecha (banco rota entry_reference)
      AND NOT (
        a.origen = 'psd2' AND b.origen = 'psd2'
        AND a.fecha_operacion = b.fecha_operacion
        AND a.concepto IS NOT NULL AND a.concepto = b.concepto
      )

    UNION ALL

    -- Pares CROSS-CUENTA dentro de la misma sociedad (CCC vs IBAN, tarjeta vs corriente).
    -- Misma fecha exacta + mismo importe: alta probabilidad de ser la misma transacción
    -- registrada bajo dos cuentas_bancarias distintas (el IBAN del PSD2 difiere del CCC del Excel).
    SELECT a.id, b.id AS otro_id,
           coalesce(a.concepto_normalizado, a.concepto, a.contraparte) AS concepto,
           coalesce(b.concepto_normalizado, b.concepto, b.contraparte) AS otro_concepto,
           a.importe::float AS importe,
           a.fecha_operacion, b.fecha_operacion AS otro_fecha,
           a.conciliado, b.conciliado AS otro_conciliado,
           coalesce(a.contraparte, a.concepto) AS contraparte_key,
           0::int AS ocurrencias_contraparte,
           a.origen AS origen_a, b.origen AS origen_b,
           coalesce(cba.banco || coalesce(' ' || cba.iban_mascara, ''), cba.alias, cba.iban_mascara, 'Cuenta A') AS cuenta_label_a,
           coalesce(cbb.banco || coalesce(' ' || cbb.iban_mascara, ''), cbb.alias, cbb.iban_mascara, 'Cuenta B') AS cuenta_label_b
    FROM movimientos_bancarios a
    JOIN cuentas_bancarias cba ON cba.id = a.cuenta_bancaria_id
    JOIN movimientos_bancarios b
      ON b.cuenta_bancaria_id <> a.cuenta_bancaria_id
     AND b.importe = a.importe
     AND b.fecha_operacion = a.fecha_operacion
     AND b.id > a.id
    JOIN cuentas_bancarias cbb
      ON cbb.id = b.cuenta_bancaria_id
     AND cbb.sociedad_id = cba.sociedad_id
    WHERE cba.cuenta_id = ${cuentaId}::uuid
      AND a.importe < 0
      AND a.duplicado_estado IS NULL AND b.duplicado_estado IS NULL
      AND a.fecha_operacion >= current_date - 60

    ORDER BY fecha_operacion DESC NULLS LAST
  `
  const toIso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)
  const pares: DupPar[] = rows.map(r => ({
    id: r.id, otroId: r.otro_id,
    concepto: r.concepto || '', otroConcepto: r.otro_concepto || '',
    importe: r.importe,
    fecha: toIso(r.fecha_operacion), otroFecha: toIso(r.otro_fecha),
    conciliado: r.conciliado, otroConciliado: r.otro_conciliado,
    contraparteKey: r.contraparte_key || '',
    ocurrenciasContraparte: Number(r.ocurrencias_contraparte),
    origenA: r.origen_a ?? undefined, origenB: r.origen_b ?? undefined,
    cuentaLabelA: r.cuenta_label_a ?? undefined, cuentaLabelB: r.cuenta_label_b ?? undefined,
  }))
  return agruparDuplicados(pares, DUP_UMBRAL_BANNER)
}

// Resueltos recientes (para el plegable "ya resueltos" con opción de reactivar).
export type DupResuelto = { id: string; fecha: string | null; concepto: string; importe: number; estado: 'ignorado' | 'confirmado'; cuentaLabel?: string }
export async function getDuplicadosResueltos(cuentaId: string, limite = 40): Promise<DupResuelto[]> {
  const rows = await prisma.$queryRaw<Array<{ id: string; fecha_operacion: Date | null; concepto: string | null; contraparte: string | null; importe: number; duplicado_estado: string; cuenta_label: string | null }>>`
    SELECT mb.id, mb.fecha_operacion,
           coalesce(mb.concepto_normalizado, mb.concepto, mb.contraparte) AS concepto,
           mb.contraparte, mb.importe::float AS importe, mb.duplicado_estado,
           coalesce(cb.banco || coalesce(' ' || cb.iban_mascara, ''), cb.alias, cb.iban_mascara, 'Cuenta') AS cuenta_label
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid AND mb.duplicado_estado IN ('ignorado', 'confirmado')
    ORDER BY mb.fecha_operacion DESC NULLS LAST, mb.created_at DESC
    LIMIT ${limite}
  `
  return rows.map(r => ({
    id: r.id,
    fecha: r.fecha_operacion ? r.fecha_operacion.toISOString().slice(0, 10) : null,
    concepto: r.concepto || r.contraparte || 'Movimiento',
    importe: Number(r.importe),
    estado: r.duplicado_estado as 'ignorado' | 'confirmado',
    cuentaLabel: r.cuenta_label ?? undefined,
  }))
}

// Marca (o desmarca) movimientos como duplicado resuelto. Scoped por cuenta_id vía join: solo
// toca movimientos de cuentas bancarias de la sesión. estado=null → deshacer (vuelve a NULL).
export async function resolverDuplicados(
  cuentaId: string,
  ids: string[],
  estado: 'ignorado' | 'confirmado' | null,
): Promise<number> {
  if (ids.length === 0) return 0
  const res = await prisma.$executeRaw`
    UPDATE movimientos_bancarios mb
    SET duplicado_estado = ${estado}
    FROM cuentas_bancarias cb
    WHERE cb.id = mb.cuenta_bancaria_id
      AND cb.cuenta_id = ${cuentaId}::uuid
      AND mb.id = ANY(${ids}::uuid[])
  `
  return Number(res)
}

export type ResumenDestino = { destino: string; movs: number; ingresos: number; gastos: number }
export async function getResumenPorDestino(cuentaId: string): Promise<ResumenDestino[]> {
  const rows = await prisma.$queryRaw<Array<{ destino: string | null; movs: bigint; ingresos: unknown; gastos: unknown }>>`
    SELECT coalesce(mb.destino, 'personal') AS destino,
           count(*) AS movs,
           coalesce(sum(mb.importe) FILTER (WHERE mb.importe > 0), 0) AS ingresos,
           coalesce(sum(mb.importe) FILTER (WHERE mb.importe < 0), 0) AS gastos
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
      AND COALESCE(mb.duplicado_estado, '') <> 'ignorado' -- excluir duplicados marcados
    GROUP BY coalesce(mb.destino, 'personal')
    ORDER BY count(*) DESC
  `
  return rows.map(r => ({ destino: r.destino ?? 'personal', movs: Number(r.movs), ingresos: Number(r.ingresos), gastos: Number(r.gastos) }))
}
