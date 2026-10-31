// Cargador (SOLO LECTURA) de la base fiscal por devengo: lee BD y arma `EntradaBase` para el helper
// puro `base-fiscal-devengo.ts`. Ver ese fichero para las reglas.
//
// Fuentes por bloque:
//  - Pisos: `incomes` (bruto/neto/check-in) + `gastos` (revisado = true, no descartados) +
//    `limpieza_facturas` (limpieza de Sique Brilla por piso, con IVA). NUNCA movimientos bancarios:
//    así, al reconectar el feed de una tarjeta (p. ej. el televisor de 1.749€ pagado con tarjeta
//    Kutxabank, que ya está en `gastos`), no se cuenta dos veces.
//  - Correduría: INGRESOS de CIMA (vista agregada `seguros_agregado.v_comisiones_mes`, ver `leerIngresosCima`); sus GASTOS y los de
//    Pilar no tienen equivalente en `gastos` (se leen solo filas de pisos), salen del banco (destino
//    `seguros` / `actividad_pilar`), tarjetas incluidas: no hay doble conteo porque `gastos` de la
//    correduría NO se lee aquí. Si el rol de BD no puede leer la vista, los ingresos caen al banco (legado).
import { prisma } from './db'
import {
  avisosDatos, calcularCostesUnitarios, mismoDiaAnioAnterior, calcularPeriodo, compararConjuntaIndividual, estimarCierre, periodoCierre,
  type Actividad, type AvisosDatos, type Comparativa, type EntradaBase, type EntradaCostes, type Estimacion, type FilaIngreso, type Periodo,
  type PropiedadFiscal, type ParamsCuota,
} from './base-fiscal-devengo.ts'

export type BaseDevengo = {
  anio: number
  hoy: string
  hastaHoy: Periodo
  comparativaHoy: Comparativa | null
  estimacion: Estimacion
  /** Un cierre (real + escenario estimado) y su comparativa conjunta/individual por escenario. */
  cierres: { id: Estimacion['escenarios'][number]['id']; cierre: Periodo; comparativa: Comparativa | null }[]
  propiedades: PropiedadFiscal[]
  avisos: AvisosDatos
}

const num = (x: unknown) => Number(x)

/**
 * Ingresos de la correduría desde CIMA: `comision_bruta` (texto → número) de los recibos `cobrado`, en el mes de
 * `fecha_situacion`; retención = solo `retencion_irpf` cuando consta; pendientes por mes de efecto (estimación).
 * Los anulados/devueltos ya NO son `cobrado`, así que no entran (restarlos los descontaría dos veces).
 * `null` = no se pudo leer (p. ej. falta la vista o su GRANT): el llamador cae al banco y lo declara.
 */
export async function leerIngresosCima(cuentaId: string, anio: number): Promise<Pick<Actividad, 'ingresosPorMes' | 'retencionPorMes' | 'pendientePorMes'> | null> {
  const ini = `${anio}-01`, fin = `${anio}-12`
  try {
    // Vista AGREGADA `seguros_agregado.v_comisiones_mes` (SQL `prisma/sql/2026-10-31_vista_comisiones_cima.sql`):
    // el rol de plataforma NO lee `seguros`; la vista ya resuelve cuenta → correduría, suma solo las comisiones
    // numéricas y pone `mes` = mes de `fecha_situacion` (cobrado) o de `fecha_efecto_actual` (pendiente).
    const filas = await prisma.$queryRaw<Array<{ mes: string; situacion: string; bruto: unknown; ret: unknown }>>`
      SELECT v.mes, v.situacion, sum(v.comision_bruta_sum) AS bruto, sum(v.retencion_irpf_sum) AS ret
      FROM seguros_agregado.v_comisiones_mes v
      WHERE v.cuenta_id = ${cuentaId}::uuid AND v.situacion IN ('cobrado', 'pendiente')
        AND v.mes BETWEEN ${ini} AND ${fin} AND v.comision_bruta_sum IS NOT NULL
      GROUP BY 1, 2`
    const cob = filas.filter(r => r.situacion === 'cobrado'), pen = filas.filter(r => r.situacion === 'pendiente')
    return {
      ingresosPorMes: Object.fromEntries(cob.map(r => [r.mes, num(r.bruto)])),
      retencionPorMes: Object.fromEntries(cob.filter(r => r.ret != null).map(r => [r.mes, num(r.ret)])),
      pendientePorMes: Object.fromEntries(pen.map(r => [r.mes, num(r.bruto)])),
    }
  } catch {
    return null
  }
}

function hoyMadrid(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())
}

export async function cargarEntradaBase(cuentaId: string, anio: number, hoy: string): Promise<EntradaBase> {
  const ini = `${anio}-01-01`, fin = `${anio}-12-31`

  const refIni = mismoDiaAnioAnterior(hoy), refFin = `${anio - 1}-12-31`
  const [tit, ing, gas, limp, bancoCor, bancoPil, lavFact, fijosBd, refBd, cima] = await Promise.all([
    prisma.$queryRaw<Array<{ propiedad_id: string; titular: string; porcentaje: unknown; regimen: string | null; nombre: string | null }>>`
      SELECT t.propiedad_id, t.titular, t.porcentaje, t.regimen, p.name AS nombre
      FROM propiedad_titularidad t LEFT JOIN properties p ON p.id = t.propiedad_id`,
    prisma.$queryRaw<Array<{ pid: string; ci: string; co: string; bruto: unknown; neto: unknown; bruto_ok: boolean; portal: string | null; adultos: number | null; ninos: number | null }>>`
      SELECT "propertyId" AS pid, portal::text AS portal, adults AS adultos, children AS ninos,
             to_char(("checkIn" AT TIME ZONE 'Europe/Madrid')::date, 'YYYY-MM-DD') AS ci,
             to_char(("checkOut" AT TIME ZONE 'Europe/Madrid')::date, 'YYYY-MM-DD') AS co,
             coalesce(amount_gross, amount) AS bruto, amount AS neto, (amount_gross IS NOT NULL) AS bruto_ok
      FROM incomes
      -- también las estancias que entran desde el año anterior: solo cuentan sus días para la amortización
      WHERE amount > 0 AND ("checkOut" AT TIME ZONE 'Europe/Madrid')::date >= ${ini}::date
        AND ("checkIn" AT TIME ZONE 'Europe/Madrid')::date <= ${fin}::date`,
    prisma.$queryRaw<Array<{ propiedad: string; categoria: string | null; proveedor: string | null; concepto: string | null; mes: string; total: unknown }>>`
      SELECT propiedad, categoria, proveedor, concepto, to_char(fecha, 'YYYY-MM') AS mes, total
      FROM gastos
      WHERE fecha BETWEEN ${ini}::date AND ${fin}::date
        AND descartado_at IS NULL AND revisado = true AND total IS NOT NULL
        AND propiedad LIKE 'prop\_%'`,
    prisma.$queryRaw<Array<{ periodo: string; pid: string; importe: unknown; sesiones: unknown; factor: unknown }>>`
      SELECT lf.periodo, x->>'propertyId' AS pid, (x->>'importe')::numeric AS importe, (x->>'sesiones')::numeric AS sesiones,
             lf.total / nullif(lf.base, 0) AS factor
      FROM limpieza_facturas lf, jsonb_array_elements(lf.limpieza) x
      WHERE lf.cuenta_id = ${cuentaId} AND lf.periodo BETWEEN ${anio + '-01'} AND ${anio + '-12'}`,
    prisma.$queryRaw<Array<{ mes: string; ingresos: unknown; gastos: unknown }>>`
      SELECT to_char(mb.fecha_operacion, 'YYYY-MM') AS mes,
             coalesce(sum(mb.importe) FILTER (WHERE mb.importe > 0 AND coalesce(mb.subcategoria,'') <> 'exento'
                      AND coalesce(mb.categoria,'') <> 'devolucion_impuestos'), 0) AS ingresos,
             coalesce(sum(-mb.importe) FILTER (WHERE mb.importe < 0 AND NOT coalesce(mb.amortizable,false)), 0) AS gastos
      FROM movimientos_bancarios mb JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
      WHERE cb.cuenta_id = ${cuentaId}::uuid AND mb.destino = 'seguros' AND coalesce(mb.duplicado_estado,'') <> 'ignorado'
        AND mb.fecha_operacion BETWEEN ${ini}::date AND ${fin}::date
      GROUP BY 1`,
    prisma.$queryRaw<Array<{ mes: string; ingresos: unknown; gastos: unknown }>>`
      SELECT to_char(mb.fecha_operacion, 'YYYY-MM') AS mes,
             coalesce(sum(mb.importe) FILTER (WHERE mb.importe > 0), 0) AS ingresos,
             coalesce(sum(-mb.importe) FILTER (WHERE mb.importe < 0), 0) AS gastos
      FROM movimientos_bancarios mb JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
      WHERE cb.cuenta_id = ${cuentaId}::uuid AND mb.destino = 'actividad_pilar' AND coalesce(mb.duplicado_estado,'') <> 'ignorado'
        AND mb.fecha_operacion BETWEEN ${ini}::date AND ${fin}::date
      GROUP BY 1`,
    // Lavandería de las facturas de limpieza (sin IVA en la tabla): con IVA = lavanderia × total/base.
    prisma.$queryRaw<Array<{ periodo: string; importe: unknown }>>`
      SELECT periodo, lavanderia * total / nullif(base, 0) AS importe
      FROM limpieza_facturas
      WHERE cuenta_id = ${cuentaId} AND periodo BETWEEN ${anio + '-01'} AND ${anio + '-12'} AND lavanderia > 0`,
    // Resto de gastos fijos: plantillas activas de `gastos_fijos` (importe mensual con IVA).
    prisma.$queryRaw<Array<{ propiedad: string; categoria: string | null; proveedor: string | null; total: unknown }>>`
      SELECT propiedad, categoria, proveedor, total FROM gastos_fijos
      WHERE activo = true AND propiedad LIKE 'prop\_%'`,
    // Estancias del mismo tramo (hoy→31/12) del año anterior: referencia del escenario de ocupación.
    prisma.$queryRaw<Array<{ pid: string; ci: string; co: string; bruto: unknown; neto: unknown; bruto_ok: boolean; portal: string | null; adultos: number | null; ninos: number | null }>>`
      SELECT "propertyId" AS pid, portal::text AS portal, adults AS adultos, children AS ninos,
             to_char(("checkIn" AT TIME ZONE 'Europe/Madrid')::date, 'YYYY-MM-DD') AS ci,
             to_char(("checkOut" AT TIME ZONE 'Europe/Madrid')::date, 'YYYY-MM-DD') AS co,
             coalesce(amount_gross, amount) AS bruto, amount AS neto, (amount_gross IS NOT NULL) AS bruto_ok
      FROM incomes
      WHERE amount > 0 AND ("checkIn" AT TIME ZONE 'Europe/Madrid')::date BETWEEN ${refIni}::date AND ${refFin}::date`,
    leerIngresosCima(cuentaId, anio),
  ])

  // Propiedades y titularidad
  const mapa = new Map<string, PropiedadFiscal>()
  for (const t of tit) {
    const p = mapa.get(t.propiedad_id) ?? {
      id: t.propiedad_id, nombre: t.nombre ?? t.propiedad_id,
      bloque: t.regimen === 'arrendamiento' ? 'capital_mobiliario' : 'capital_inmobiliario', titulares: [],
    } as PropiedadFiscal
    p.titulares.push({ titular: t.titular, porcentaje: num(t.porcentaje) })
    mapa.set(t.propiedad_id, p)
  }
  const propiedades = [...mapa.values()]

  // Gastos: directos por piso, compartidos y mobiliario (íntegro)
  const gastosPiso: EntradaBase['gastosPiso'] = []
  const gastosCompartidos: EntradaBase['gastosCompartidos'] = []
  for (const g of gas) {
    const importe = num(g.total)
    if (g.propiedad === 'prop_multi_apartamentos') {
      const prov = (g.proveedor ?? '').toLowerCase()
      // Sique Brilla ya entra por limpieza_facturas (repartida por piso); la comisión de Booking.com
      // ya está en bruto − neto (posible duplicado).
      if (prov.includes('brilla') || prov.includes('booking.com')) continue
      gastosCompartidos.push({ mes: g.mes, importe, categoria: g.categoria ?? undefined })
    } else if (mapa.has(g.propiedad)) {
      gastosPiso.push({ propertyId: g.propiedad, mes: g.mes, importe, categoria: g.categoria ?? 'OTRO' })
    }
  }
  for (const l of limp) {
    if (!mapa.has(l.pid) || l.factor == null) continue
    gastosPiso.push({ propertyId: l.pid, mes: l.periodo, importe: num(l.importe) * num(l.factor), categoria: 'LIMPIEZA' })
  }

  const act = (rows: typeof bancoCor): Actividad => {
    const a: Actividad = { ingresosPorMes: {}, gastosPorMes: {} }
    for (const r of rows) {
      if (num(r.ingresos) !== 0) a.ingresosPorMes[r.mes] = num(r.ingresos)
      if (num(r.gastos) !== 0) a.gastosPorMes[r.mes] = num(r.gastos)
    }
    return a
  }

  const fila = (r: (typeof ing)[number]): FilaIngreso => ({
    propertyId: r.pid, checkIn: r.ci, checkOut: r.co, bruto: num(r.bruto), neto: num(r.neto), portal: r.portal, brutoConocido: r.bruto_ok,
    huespedes: r.adultos == null ? null : r.adultos + (r.ninos ?? 0),
  })
  const ingresos = ing.map(fila)

  // Costes unitarios: MISMA lógica que el informe de costes (media por estancia / fijo mensual), desde BD.
  const esAgua = (prov: string | null) => /emasesa/i.test(prov ?? '')
  const esLuz = (g: { proveedor: string | null; concepto: string | null }) =>
    /endesa|totalenergies|iberdrola|naturgy/i.test(g.proveedor ?? '') && !/ajustes del sistema|inspecci/i.test(g.concepto ?? '')
  const costes = calcularCostesUnitarios({
    anio, hoy, propiedadIds: propiedades.map(p => p.id),
    limpieza: limp.map(l => ({ propertyId: l.pid, sesiones: num(l.sesiones), importe: num(l.importe), factor: l.factor == null ? null : num(l.factor) })),
    lavanderia: [
      ...gas.filter(g => g.propiedad === 'prop_multi_apartamentos' && g.categoria === 'LAVANDERIA').map(g => ({ mes: g.mes, importe: num(g.total) })),
      ...lavFact.map(l => ({ mes: l.periodo, importe: num(l.importe) })),
    ],
    estancias: ingresos,
    suministros: gas.flatMap((g): EntradaCostes['suministros'] => {
      if (g.categoria !== 'SUMINISTROS' || !mapa.has(g.propiedad)) return []
      const base = { propertyId: g.propiedad, mes: g.mes, importe: num(g.total) }
      return esAgua(g.proveedor) ? [{ ...base, tipo: 'agua' as const }] : esLuz(g) ? [{ ...base, tipo: 'luz' as const }] : []
    }),
    // Luz y agua van por su propio coste; internet y demás plantillas son «resto de fijos».
    fijos: fijosBd.filter(f => mapa.has(f.propiedad) && !esAgua(f.proveedor) && !/endesa|totalenergies|iberdrola|naturgy/i.test(f.proveedor ?? ''))
      .map(f => ({ propertyId: f.propiedad, total: num(f.total) })),
  })

  return {
    anio, hoy, propiedades, ingresos,
    gastosPiso, gastosCompartidos,
    // Ingresos de CIMA (bruto); los gastos siguen saliendo del banco. Sin lectura de CIMA: banco legado.
    correduria: cima ? { ...act(bancoCor), ingresosPorMes: cima.ingresosPorMes, fuente: 'cima', retencionPorMes: cima.retencionPorMes, pendientePorMes: cima.pendientePorMes } : act(bancoCor),
    pilar: act(bancoPil),
    costes, referencia: refBd.map(fila),
  }
}

export async function cargarAvisos(cuentaId: string, anio: number, hoy: string): Promise<AvisosDatos> {
  const [cuentas, limp, sumin] = await Promise.all([
    prisma.$queryRaw<Array<{ nombre: string; ult: string | null }>>`
      SELECT coalesce(nullif(cb.alias, ''), cb.banco) AS nombre,
             to_char(max(mb.fecha_operacion), 'YYYY-MM-DD') AS ult
      FROM cuentas_bancarias cb
      JOIN movimientos_bancarios mb ON mb.cuenta_bancaria_id = cb.id AND coalesce(mb.duplicado_estado,'') <> 'ignorado'
      WHERE cb.cuenta_id = ${cuentaId}::uuid
      GROUP BY cb.id, cb.alias, cb.banco`,
    prisma.$queryRaw<Array<{ periodo: string }>>`
      SELECT DISTINCT periodo FROM limpieza_facturas WHERE cuenta_id = ${cuentaId} AND periodo LIKE ${anio + '-%'}`,
    prisma.$queryRaw<Array<{ mes: string }>>`
      SELECT DISTINCT to_char(fecha, 'YYYY-MM') AS mes FROM gastos
      WHERE categoria = 'SUMINISTROS' AND propiedad = 'prop_house_sevillana'
        AND descartado_at IS NULL AND revisado = true AND fecha BETWEEN ${anio + '-01-01'}::date AND ${anio + '-12-31'}::date`,
  ])
  return avisosDatos({
    hoy, anio,
    cuentas: cuentas.map(c => ({ nombre: c.nombre, ultimoMovimiento: c.ult })),
    mesesConFacturaLimpieza: limp.map(r => r.periodo),
    mesesConSuministros: sumin.map(r => r.mes),
  })
}

/** Todo lo que pinta el bloque «Hasta hoy» + «Estimación cierre de año». */
export async function getBaseDevengo(cuentaId: string, anio: number, cuota: ParamsCuota | null): Promise<BaseDevengo> {
  const hoyReal = hoyMadrid()
  // Año pasado: «hoy» = 31/12; año futuro: sin datos → 01/01.
  const hoy = hoyReal.slice(0, 4) === String(anio) ? hoyReal : hoyReal > `${anio}-12-31` ? `${anio}-12-31` : `${anio}-01-01`
  const [entrada, avisos] = await Promise.all([cargarEntradaBase(cuentaId, anio, hoy), cargarAvisos(cuentaId, anio, hoy)])
  const hastaHoy = calcularPeriodo(entrada, `${anio}-01-01`, hoy)
  const estimacion = estimarCierre(entrada, hastaHoy)
  const cierres = estimacion.escenarios.map(esc => {
    const cierre = periodoCierre(hastaHoy, esc, anio)
    return { id: esc.id, cierre, comparativa: cuota ? compararConjuntaIndividual(cierre, entrada.propiedades, cuota) : null }
  })
  return {
    anio, hoy, hastaHoy, estimacion, cierres, avisos, propiedades: entrada.propiedades,
    comparativaHoy: cuota ? compararConjuntaIndividual(hastaHoy, entrada.propiedades, cuota) : null,
  }
}
