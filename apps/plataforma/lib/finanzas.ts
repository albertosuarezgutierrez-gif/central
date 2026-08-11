import { prisma } from './db'
import { Prisma } from '@prisma/client'
import { DESTINO_LABEL, type Destino } from './destino'
import { claveComercio } from './correduria'
import { comercioDe } from './comercio'
import {
  calcularResultadoFiscal,
  avisosOportunidad,
  deduccionesAplicablesNoMarcadas,
  transicionesEdad,
  importesDe,
  PLAZOS_FISCALES,
  type PerfilFiscal,
  type Descendiente,
  type ResultadoFiscal,
} from './fiscal-deducciones'

export type DescendienteView = {
  id: string
  nombre: string
  fechaNacimiento: string
  gradoDiscapacidad: number
  computoCompleto: boolean
}

export type NovedadView = {
  id: string
  clave: string
  concepto: string
  importeAnterior: number | null
  importeNuevo: number | null
  ambito: string
  fuenteUrl: string | null
}

export type DeduccionesView = {
  perfil: PerfilFiscal
  descendientes: DescendienteView[]
  resultado: ResultadoFiscal
  avisos: string[]
  sugerencias: { clave: string; motivo: string }[]
  transiciones: { nombre: string; aviso: string }[]
  calendario: typeof PLAZOS_FISCALES
  novedades: NovedadView[]
  historico: { anio: number; cuotaLiquida: number; deduccionesTotal: number; resultado: number }[]
  fuente: string
  revisado: string
}

const PERFIL_DEFECTO: PerfilFiscal = {
  comunidadAutonoma: 'andalucia',
  declaracionConjunta: true,
  familiaNumerosa: null,
  conyugeTrabaja: false,
  gastoGuarderiaAnual: 0,
  aportacionPlanPensiones: 0,
  gradoDiscapacidadTitular: 0,
  gradoDiscapacidadConyuge: 0,
  ascendientesACargo: 0,
  ascendientesMayores75: 0,
  donativosAnual: 0,
  gastoDeportivoAnual: 0,
}

export type MovResumen = {
  id: string
  fecha: string | null
  concepto: string
  categoria: string | null
  importe: number
  confirmado: boolean
}

export type MesData = { mes: string; ingresos: number; gastos: number }

export type MovConfirmados = { confirmados: number; total: number }

export type ResumenFinanciero = {
  correduria: {
    cobradoNeto: number
    prestacionesExentas: number   // cobrado que NO tributa (Art. 7.h LIRPF): fuera de la base imponible
    retencionesEstimadas: number
    ingresosBrutos: number
    gastosDeducibles: number
    resultado: number
    porMes: MesData[]
    recientes: MovResumen[]
    porCompania: { nombre: string; importe: number }[]
    verificacion: MovConfirmados
  }
  pisos: {
    total: { ingresos: number; gastos: number; resultado: number }
    kutxa: { ingresos: number; gastos: number; resultado: number }
    bbva: { ingresos: number; gastos: number; resultado: number }
    porMes: MesData[]
    recientes: MovResumen[]
    verificacion: MovConfirmados
  }
  personal: {
    bbva: { gastos: number; porCategoria: { categoria: string; importe: number }[] }
    kutxa: { gastos: number; porCategoria: { categoria: string; importe: number }[] }
    total: number
    recientes: MovResumen[]
    verificacion: MovConfirmados
  }
  fiscal: {
    baseImponibleEstimada: number
    // Base ANTES de la reducción por tributación conjunta (compararDeclaracion la aplica ella misma).
    baseImponibleSinReduccion: number
    tramosIRPF: { desde: number; hasta: number | null; tipo: number; importe: number }[]
    tramoActual: { desde: number; hasta: number | null; tipo: number }
    margenHastaProximoTramo: number | null
    margenHastaTramoPrevio: number
    ahorroBajarTramo: number | null
    tramoPrevioTipo: number | null
    tipoEfectivo: number
    reduccionConjunta: number
    // Ingresos EXENTOS de IRPF (p.ej. prestación por paternidad, Art. 7.h): cobrados de verdad pero
    // fuera de la base imponible. Se expone para explicar en pantalla por qué la base < caja.
    exento: number
    trimestres: { q: number; ingresos: number; gastosDeducibles: number; resultado: number; ivaSoportado: number }[]
    retencionesAcumuladas: number
  }
  deducciones: DeduccionesView
  amortizables: { total: number; recientes: MovResumen[] }
  // Salud del agente de extracción de facturas (skill `facturas-correo`). Lo escribe la propia skill en
  // `agente_salud`; alimenta un badge 🔴 en /finanzas cuando la extracción de PDFs lleva días caída.
  // null = tabla sin aplicar / sin fila (no se pinta badge).
  saludExtraccion: { ok: boolean; diasCaido: number; detalle: string | null } | null
  year: number
  quarter: number
  anterior: { ingresos: number; gastos: number; resultado: number } | null
  yearsDisponibles: number[]
}

// ── Control de gastos (deducibilidad por bucket) ─────────────────────────────
// Bucket fiscal derivado del `destino` del movimiento. No es una columna nueva: la
// deducibilidad ya está modelada en `movimientos_bancarios.destino`. La lógica vive en
// el módulo PURO `lib/deducibilidad.ts` (fuente única, compartida con el cliente); aquí
// se importa (uso interno en getGastosControl) y se re-exporta para no romper a los
// consumidores que la importan desde `@/lib/finanzas`.
import { BUCKET_LABEL, BUCKET_DEDUCIBLE, bucketDeDestino, type GastoBucket } from './deducibilidad'
export { BUCKET_LABEL, BUCKET_DEDUCIBLE, bucketDeDestino, type GastoBucket }

export type DeduccionCuotaTipo = 'mecenazgo' | 'guarderia' | 'deportiva_and'

export const DEDUCCION_CUOTA_LABEL: Record<DeduccionCuotaTipo, string> = {
  mecenazgo:    '🏛️ Mecenazgo',
  guarderia:    '👶 Guardería',
  deportiva_and: '⚽ Deportiva And.',
}

// Límites orientativos de cada deducción de cuota para el tracker de la UI.
export const DEDUCCION_CUOTA_LIMITE: Record<DeduccionCuotaTipo, { limite: number; descripcion: string }> = {
  mecenazgo:    { limite: 150,  descripcion: 'tramo 80% (Ley 49/2002)' },
  guarderia:    { limite: 1000, descripcion: 'adicional maternidad (Art.81bis)' },
  deportiva_and: { limite: 100, descripcion: 'base máx. 15% (Andalucía)' },
}

export type GastoMov = {
  id: string
  fecha: string | null
  concepto: string
  banco: string
  importe: number          // positivo (es un cargo)
  destino: Destino
  destinoLabel: string
  bucket: GastoBucket
  deducible: boolean
  confirmado: boolean
  porRevisar: boolean
  conciliado: boolean
  facturaRef: string | null
  amortizable: boolean
  // Deducción especial de cuota (no reduce base, reduce cuota directamente).
  deduccionCuotaTipo: DeduccionCuotaTipo | null
  // Texto para buscar el justificante en Gmail/Drive (comercio/concepto).
  busqueda: string
  // Comercio detectado del concepto (PETROPRIX, IONOS…) para agrupar la bandeja. null si no hay uno claro.
  comercio: string | null
  // Reparto por piso (lavandería/suministros que facturan en bloque). Vacío si no está desglosado.
  // El reparto NO cambia la deducibilidad; solo alimenta el P&L de cada piso.
  desglose: { propiedad: string; porcentaje: number; importe: number }[]
  // Nota libre del usuario para controlar mejor el gasto (qué es, a qué corresponde). null si no hay.
  comentario: string | null
}

// Grupo de la bandeja «Por revisar»: cargos del MISMO comercio → una decisión los clasifica todos
// (y aprende la regla del comercio). Los que no tienen comercio claro van como grupo de 1.
export type GastoGrupo = {
  comercio: string | null   // clave del comercio (null = movimiento suelto)
  label: string
  count: number
  total: number
  sinJustificante: number
  movs: GastoMov[]
}

export type Piso = { id: string; nombre: string }

export type CuotaDeduccionResumen = {
  mecenazgo: number
  guarderia: number
  deportivaAnd: number
}

export type GastosControl = {
  porRevisar: GastoMov[]
  porRevisarGrupos: GastoGrupo[]
  buckets: { bucket: GastoBucket; label: string; deducible: boolean; total: number; movs: GastoMov[] }[]
  resumen: {
    deducibleTotal: number       // gasto deducible del año (negocio + renta, SIN amortizables)
    amortizablesTotal: number
    noDeducibleTotal: number
    sinJustificante: number       // nº de cargos deducibles sin factura conciliada
  }
  // Sumas etiquetadas como deducciones de cuota (mecenazgo, guardería, deportiva And.).
  cuotaDeduccionResumen: CuotaDeduccionResumen
  // Pisos turísticos sobre los que se puede repartir un cargo compartido.
  pisos: Piso[]
  year: number
  quarter: number
}

const RETENCION_SEGUROS = 0.15
const REDUCCION_CONJUNTA = 3400

// Los tramos IRPF ya NO se hardcodean aquí: la FUENTE ÚNICA es `IMPORTES_POR_ANIO[year].tramos`
// (en fiscal-deducciones.ts, vigilada por la skill `fiscal-novedades`). `calcularTramos` los recibe.
type Tramo = { desde: number; hasta: number | null; tipo: number }

function calcularTramos(base: number, tramos: Tramo[]) {
  const basePos = Math.max(0, base)
  const resultado = tramos.map(t => {
    const desde = t.desde
    const hasta = t.hasta ?? Infinity
    const aplicado = Math.max(0, Math.min(basePos, hasta) - desde)
    return { desde: t.desde, hasta: t.hasta, tipo: t.tipo, importe: aplicado * t.tipo }
  })
  const tramoActualIdx = tramos.findLastIndex(t => basePos >= t.desde)
  const tramoActual = tramos[tramoActualIdx] ?? tramos[0]
  const siguienteTramo = tramos.find(t => t.desde > basePos)
  const margenHastaProximoTramo = siguienteTramo ? siguienteTramo.desde - basePos : null
  const margenHastaTramoPrevio = basePos - tramoActual.desde
  const tramoPrevio = tramoActualIdx > 0 ? tramos[tramoActualIdx - 1] : null
  const ahorroBajarTramo = tramoPrevio && margenHastaTramoPrevio > 0
    ? margenHastaTramoPrevio * (tramoActual.tipo - tramoPrevio.tipo)
    : null
  return {
    tramosIRPF: resultado,
    tramoActual: { desde: tramoActual.desde, hasta: tramoActual.hasta, tipo: tramoActual.tipo },
    margenHastaProximoTramo,
    margenHastaTramoPrevio,
    ahorroBajarTramo,
    tramoPrevioTipo: tramoPrevio?.tipo ?? null,
  }
}

function mesRange(year: number, quarter: number): { inicio: string; fin: string } {
  if (quarter === 0) {
    return { inicio: `${year}-01-01`, fin: `${year}-12-31` }
  }
  const mesInicio = (quarter - 1) * 3 + 1
  const mesFin = quarter * 3
  const fin = new Date(year, mesFin, 0)
  return {
    inicio: `${year}-${String(mesInicio).padStart(2, '0')}-01`,
    fin: fin.toISOString().slice(0, 10),
  }
}

// Desplaza el año de una fecha 'YYYY-MM-DD' (para la comparativa "mismo periodo del año anterior"
// cuando el periodo es un rango libre). Solo toca los 4 primeros caracteres.
function shiftYearStr(fecha: string, delta: number): string {
  const y = Number(fecha.slice(0, 4))
  return `${y + delta}${fecha.slice(4)}`
}

// ── Deducciones fiscales (perfil familiar + motor puro) ──────────────────────
async function getDeducciones(
  cuentaId: string,
  year: number,
  baseImponible: number,
  retenciones: number,
): Promise<DeduccionesView> {
  const perfilRows = await prisma.$queryRaw<Array<{
    comunidad_autonoma: string; declaracion_conjunta: boolean; familia_numerosa: string | null
    conyuge_trabaja: boolean; gasto_guarderia_anual: unknown; aportacion_plan_pensiones: unknown
    grado_discapacidad_titular: number; grado_discapacidad_conyuge: number
    ascendientes_a_cargo: number; ascendientes_mayores_75: number; donativos_anual: unknown
    gasto_deportivo_anual: unknown
  }>>`SELECT * FROM fiscal_perfil WHERE cuenta_id = ${cuentaId}::uuid LIMIT 1`

  const perfil: PerfilFiscal = perfilRows[0]
    ? {
        comunidadAutonoma: perfilRows[0].comunidad_autonoma,
        declaracionConjunta: perfilRows[0].declaracion_conjunta,
        familiaNumerosa: (perfilRows[0].familia_numerosa as PerfilFiscal['familiaNumerosa']) ?? null,
        conyugeTrabaja: perfilRows[0].conyuge_trabaja,
        gastoGuarderiaAnual: Number(perfilRows[0].gasto_guarderia_anual),
        aportacionPlanPensiones: Number(perfilRows[0].aportacion_plan_pensiones),
        gradoDiscapacidadTitular: perfilRows[0].grado_discapacidad_titular,
        gradoDiscapacidadConyuge: perfilRows[0].grado_discapacidad_conyuge,
        ascendientesACargo: perfilRows[0].ascendientes_a_cargo,
        ascendientesMayores75: perfilRows[0].ascendientes_mayores_75,
        donativosAnual: Number(perfilRows[0].donativos_anual),
        gastoDeportivoAnual: Number(perfilRows[0].gasto_deportivo_anual ?? 0),
      }
    : { ...PERFIL_DEFECTO }

  const hijosRows = await prisma.$queryRaw<Array<{
    id: string; nombre: string; fecha_nacimiento: Date; grado_discapacidad: number; computo_completo: boolean
  }>>`SELECT id, nombre, fecha_nacimiento, grado_discapacidad, computo_completo
      FROM fiscal_descendientes WHERE cuenta_id = ${cuentaId}::uuid ORDER BY fecha_nacimiento`

  const descendientes: DescendienteView[] = hijosRows.map(h => ({
    id: h.id,
    nombre: h.nombre,
    fechaNacimiento: h.fecha_nacimiento.toISOString().slice(0, 10),
    gradoDiscapacidad: h.grado_discapacidad,
    computoCompleto: h.computo_completo,
  }))
  const hijosCalc: Descendiente[] = descendientes.map(h => ({
    nombre: h.nombre, fechaNacimiento: h.fechaNacimiento, gradoDiscapacidad: h.gradoDiscapacidad, computoCompleto: h.computoCompleto,
  }))

  const novedadesRows = await prisma.$queryRaw<Array<{
    id: string; clave: string; importe_anterior: unknown; importe_nuevo: unknown; ambito: string; fuente_url: string | null
  }>>`SELECT id, clave, importe_anterior, importe_nuevo, ambito, fuente_url
      FROM fiscal_novedades WHERE beneficia = true AND descartado = false ORDER BY detectado_at DESC LIMIT 5`

  const novedades: NovedadView[] = novedadesRows.map(n => ({
    id: n.id,
    clave: n.clave,
    concepto: n.clave,
    importeAnterior: n.importe_anterior != null ? Number(n.importe_anterior) : null,
    importeNuevo: n.importe_nuevo != null ? Number(n.importe_nuevo) : null,
    ambito: n.ambito,
    fuenteUrl: n.fuente_url,
  }))

  const histRows = await prisma.$queryRaw<Array<{
    anio: number; cuota_liquida: unknown; deducciones_total: unknown; resultado: unknown
  }>>`SELECT anio, cuota_liquida, deducciones_total, resultado
      FROM fiscal_historico WHERE cuenta_id = ${cuentaId}::uuid ORDER BY anio`
  const historico = histRows.map(h => ({
    anio: h.anio,
    cuotaLiquida: Number(h.cuota_liquida),
    deduccionesTotal: Number(h.deducciones_total),
    resultado: Number(h.resultado),
  }))

  const imp = importesDe(year)
  const resultado = calcularResultadoFiscal(baseImponible, retenciones, perfil, hijosCalc, year, imp)

  return {
    perfil,
    descendientes,
    resultado,
    avisos: avisosOportunidad(perfil, baseImponible, year, imp),
    sugerencias: deduccionesAplicablesNoMarcadas(perfil, hijosCalc, year),
    transiciones: transicionesEdad(hijosCalc, year),
    calendario: PLAZOS_FISCALES,
    novedades,
    historico,
    fuente: imp.fuente,
    revisado: imp.revisado,
  }
}

export async function getResumenFinanciero(
  cuentaId: string,
  year: number,
  quarter = 0,
  desde?: string,
  hasta?: string,
): Promise<ResumenFinanciero> {
  // Periodo principal: rango libre si se pasa (mes/rango de la radiografía), si no año/trimestre.
  const rangoLibre = !!(desde && hasta)
  const { inicio, fin } = rangoLibre ? { inicio: desde!, fin: hasta! } : mesRange(year, quarter)
  // Comparativa = mismo periodo del año anterior (rango desplazado −1 año, o trimestre del año previo).
  const { inicio: inicioAnt, fin: finAnt } = rangoLibre
    ? { inicio: shiftYearStr(desde!, -1), fin: shiftYearStr(hasta!, -1) }
    : mesRange(year - 1, quarter)

  // ── Años disponibles ─────────────────────────────────────────────────────────
  const yearsRows = await prisma.$queryRaw<Array<{ anio: number }>>`
    SELECT DISTINCT EXTRACT(year FROM mb.fecha_operacion)::int AS anio
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid AND mb.fecha_operacion IS NOT NULL
    ORDER BY 1 DESC LIMIT 5
  `
  const yearsDisponibles = yearsRows.map(r => r.anio)

  // ── Agrupación principal por destino+banco+mes ───────────────────────────────
  const rows = await prisma.$queryRaw<Array<{
    destino: string | null
    banco: string | null
    mes: string
    ingresos: unknown
    ingresos_exento: unknown
    gastos: unknown
    gastos_amortizable: unknown
  }>>`
    SELECT
      coalesce(mb.destino, 'personal') AS destino,
      lower(coalesce(cb.banco, '')) AS banco,
      to_char(date_trunc('month', mb.fecha_operacion), 'YYYY-MM') AS mes,
      coalesce(sum(mb.importe) FILTER (WHERE mb.importe > 0), 0) AS ingresos,
      -- Ingresos EXENTOS de IRPF (p.ej. prestación por nacimiento y cuidado del menor, Art. 7.h LIRPF):
      -- se cobran en la correduría pero NO tributan → se excluyen de la base imponible (no del cobrado).
      coalesce(sum(mb.importe) FILTER (WHERE mb.importe > 0 AND mb.subcategoria = 'exento'), 0) AS ingresos_exento,
      coalesce(sum(-mb.importe) FILTER (WHERE mb.importe < 0), 0) AS gastos,
      coalesce(sum(-mb.importe) FILTER (WHERE mb.importe < 0 AND coalesce(mb.amortizable, false)), 0) AS gastos_amortizable
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
      AND coalesce(mb.duplicado_estado, '') <> 'ignorado'
      AND mb.fecha_operacion BETWEEN ${inicio}::date AND ${fin}::date
    GROUP BY 1, 2, 3
    ORDER BY 3
  `

  // ── Movimientos recientes por destino (últimos 8) ────────────────────────────
  const recientesAll = await prisma.$queryRaw<Array<{
    id: string; fecha_operacion: Date | null; concepto: string | null
    concepto_normalizado: string | null; contraparte: string | null
    categoria: string | null; importe: unknown; destino: string | null
    banco: string | null; destino_confirmado: boolean | null; amortizable: boolean | null
  }>>`
    SELECT mb.id, mb.fecha_operacion, mb.concepto, mb.concepto_normalizado, mb.contraparte,
           mb.categoria, mb.importe, mb.destino, lower(coalesce(cb.banco, '')) AS banco,
           mb.destino_confirmado, mb.amortizable
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
      AND coalesce(mb.duplicado_estado, '') <> 'ignorado'
      AND mb.fecha_operacion BETWEEN ${inicio}::date AND ${fin}::date
    ORDER BY mb.fecha_operacion DESC NULLS LAST
    LIMIT 120
  `

  // ── Conteo de movimientos confirmados por destino ────────────────────────────
  const verificRows = await prisma.$queryRaw<Array<{
    destino: string; total: unknown; confirmados: unknown
  }>>`
    SELECT coalesce(mb.destino, 'personal') AS destino,
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE mb.destino_confirmado = true)::int AS confirmados
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
      AND coalesce(mb.duplicado_estado, '') <> 'ignorado'
      AND mb.fecha_operacion BETWEEN ${inicio}::date AND ${fin}::date
    GROUP BY 1
  `
  const verifMap = new Map(verificRows.map(r => [r.destino, { total: Number(r.total), confirmados: Number(r.confirmados) }]))
  const verifOf = (dest: string[]): MovConfirmados => {
    const combined = dest.reduce((acc, d) => {
      const v = verifMap.get(d)
      if (v) { acc.total += v.total; acc.confirmados += v.confirmados }
      return acc
    }, { total: 0, confirmados: 0 })
    return combined
  }

  const mapReciente = (r: typeof recientesAll[0]): MovResumen => ({
    id: r.id,
    fecha: r.fecha_operacion ? r.fecha_operacion.toISOString().slice(0, 10) : null,
    concepto: r.concepto_normalizado || r.concepto || r.contraparte || '—',
    categoria: r.categoria,
    importe: Number(r.importe),
    confirmado: !!r.destino_confirmado,
  })

  // ── Gastos personales por categoría ──────────────────────────────────────────
  const catRows = await prisma.$queryRaw<Array<{
    banco: string | null; categoria: string | null; gastos: unknown
  }>>`
    SELECT lower(coalesce(cb.banco, '')) AS banco,
           coalesce(nullif(mb.categoria, ''), 'otros') AS categoria,
           coalesce(sum(-mb.importe), 0) AS gastos
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
      AND coalesce(mb.destino, 'personal') = 'personal'
      AND mb.importe < 0
      AND coalesce(mb.duplicado_estado, '') <> 'ignorado'
      AND mb.fecha_operacion BETWEEN ${inicio}::date AND ${fin}::date
    GROUP BY 1, 2 ORDER BY 3 DESC
  `

  // ── Año anterior para comparativa ────────────────────────────────────────────
  const antRows = await prisma.$queryRaw<Array<{ ingresos: unknown; gastos: unknown }>>`
    SELECT
      coalesce(sum(mb.importe) FILTER (WHERE mb.importe > 0), 0) AS ingresos,
      coalesce(sum(-mb.importe) FILTER (WHERE mb.importe < 0), 0) AS gastos
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
      AND coalesce(mb.destino, '') <> 'traspaso_interno'
      AND coalesce(mb.duplicado_estado, '') <> 'ignorado'
      AND mb.fecha_operacion BETWEEN ${inicioAnt}::date AND ${finAnt}::date
  `
  const antI = Number(antRows[0]?.ingresos ?? 0)
  const antG = Number(antRows[0]?.gastos ?? 0)
  const anterior = antI + antG > 0 ? { ingresos: antI, gastos: antG, resultado: antI - antG } : null

  // ── Construir aggregates ──────────────────────────────────────────────────────
  let corrIng = 0, corrGas = 0, corrExento = 0
  let pisosKutxaIng = 0, pisosKutxaGas = 0
  let pisosBbvaIng = 0, pisosBbvaGas = 0
  let persGas = 0
  let amortizablesTotal = 0

  const corrPorMes = new Map<string, MesData>()
  const pisosPorMes = new Map<string, MesData>()

  for (const r of rows) {
    const ing = Number(r.ingresos)
    const dest = r.destino ?? 'personal'
    const banco = r.banco ?? ''
    const esBbva = banco.includes('bbva')

    // Los amortizables (inmovilizado) NO son gasto deducible del año: se restan del gasto de su
    // bucket y se contabilizan aparte para la asesoría.
    const gasAmort = Number(r.gastos_amortizable)
    const gas = Number(r.gastos) - gasAmort
    if ((dest === 'seguros' || dest === 'turistico_pisos' || dest === 'turistico_duplex')) amortizablesTotal += gasAmort

    if (dest === 'seguros') {
      corrIng += ing; corrGas += gas
      corrExento += Number(r.ingresos_exento)
      const prev = corrPorMes.get(r.mes) ?? { mes: r.mes, ingresos: 0, gastos: 0 }
      prev.ingresos += ing; prev.gastos += gas
      corrPorMes.set(r.mes, prev)
    } else if (dest === 'turistico_duplex' || (dest === 'turistico_pisos' && esBbva)) {
      pisosBbvaIng += ing; pisosBbvaGas += gas
      const prev = pisosPorMes.get(r.mes) ?? { mes: r.mes, ingresos: 0, gastos: 0 }
      prev.ingresos += ing; prev.gastos += gas
      pisosPorMes.set(r.mes, prev)
    } else if (dest === 'turistico_pisos') {
      pisosKutxaIng += ing; pisosKutxaGas += gas
      const prev = pisosPorMes.get(r.mes) ?? { mes: r.mes, ingresos: 0, gastos: 0 }
      prev.ingresos += ing; prev.gastos += gas
      pisosPorMes.set(r.mes, prev)
    } else if (dest === 'personal') {
      persGas += gas
    }
  }

  // Correduría: bruto estimado y retenciones. Sobre el ingreso GRAVABLE (cobrado − exento): las
  // prestaciones exentas (Art. 7.h LIRPF) no tributan ni llevan retención → fuera de la base.
  const corrIngGravable = Math.max(0, corrIng - corrExento)
  const retencionesEstimadas = corrIngGravable * (RETENCION_SEGUROS / (1 - RETENCION_SEGUROS))
  const ingresosBrutos = corrIngGravable + retencionesEstimadas
  const corrResultado = corrIng - corrGas   // resultado de CAJA (incluye lo exento, es dinero real cobrado)

  // Pisos
  const pisosTotal = {
    ingresos: pisosKutxaIng + pisosBbvaIng,
    gastos: pisosKutxaGas + pisosBbvaGas,
    resultado: (pisosKutxaIng + pisosBbvaIng) - (pisosKutxaGas + pisosBbvaGas),
  }

  // Personal por categoría
  const catBbva = catRows.filter(r => (r.banco ?? '').includes('bbva'))
  const catKutxa = catRows.filter(r => !(r.banco ?? '').includes('bbva'))
  const persGasBbva = catBbva.reduce((s, r) => s + Number(r.gastos), 0)
  const persGasKutxa = catKutxa.reduce((s, r) => s + Number(r.gastos), 0)

  // Fiscal
  const baseImponibleBruta = ingresosBrutos - corrGas + pisosTotal.ingresos - pisosTotal.gastos
  const baseImponible = Math.max(0, baseImponibleBruta - REDUCCION_CONJUNTA)
  const { tramosIRPF, tramoActual, margenHastaProximoTramo, margenHastaTramoPrevio, ahorroBajarTramo, tramoPrevioTipo } = calcularTramos(baseImponible, importesDe(year).tramos)

  // Trimestres (fiscal — siempre año completo para el bloque fiscal)
  // Incluye IVA soportado de facturas_proveedor pagadas en cada trimestre.
  const [trimestresRows, ivaProvRows] = await Promise.all([
    prisma.$queryRaw<Array<{
      q: number; ingresos: unknown; gastos: unknown
    }>>`
      SELECT
        EXTRACT(quarter FROM mb.fecha_operacion)::int AS q,
        coalesce(sum(mb.importe) FILTER (WHERE mb.importe > 0 AND mb.destino IN ('seguros','turistico_pisos','turistico_duplex') AND coalesce(mb.subcategoria,'') <> 'exento'), 0) AS ingresos,
        coalesce(sum(-mb.importe) FILTER (WHERE mb.importe < 0 AND mb.destino IN ('seguros','turistico_pisos','turistico_duplex') AND NOT coalesce(mb.amortizable, false)), 0) AS gastos
      FROM movimientos_bancarios mb
      JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
      WHERE cb.cuenta_id = ${cuentaId}::uuid
        AND coalesce(mb.duplicado_estado, '') <> 'ignorado'
        AND EXTRACT(year FROM mb.fecha_operacion) = ${year}
      GROUP BY 1 ORDER BY 1
    `,
    prisma.$queryRaw<Array<{ q: number; iva_soportado: unknown }>>`
      SELECT
        EXTRACT(quarter FROM pago_confirmado_at)::int AS q,
        COALESCE(SUM(cuota_iva), 0) AS iva_soportado
      FROM facturas_proveedor
      WHERE cuenta_id = ${cuentaId}::uuid
        AND estado = 'pagada'
        AND cuota_iva IS NOT NULL
        AND pago_confirmado_at IS NOT NULL
        AND EXTRACT(year FROM pago_confirmado_at) = ${year}
      GROUP BY 1
    `,
  ])
  const ivaSoportadoMap = new Map(ivaProvRows.map(r => [r.q, Number(r.iva_soportado)]))
  const trimestres = [1, 2, 3, 4].map(q => {
    const r = trimestresRows.find(x => x.q === q)
    const ing = Number(r?.ingresos ?? 0)
    const gas = Number(r?.gastos ?? 0)
    const ivaSoportado = ivaSoportadoMap.get(q) ?? 0
    return { q, ingresos: ing, gastosDeducibles: gas, resultado: ing - gas, ivaSoportado }
  })

  // Deducciones fiscales (perfil familiar → cuota → resultado)
  const deducciones = await getDeducciones(cuentaId, year, baseImponible, retencionesEstimadas)

  // Tipo efectivo REAL = cuota íntegra (ya con el método español tarifa(base)−tarifa(mínimo), es decir
  // descontado el mínimo personal y familiar) / base imponible. Antes se calculaba aplicando la tarifa
  // a TODA la base sin restar el mínimo → salía bastante más alto que el real (engañoso en pantalla).
  const tipoEfectivo = baseImponible > 0 ? deducciones.resultado.cuotaIntegra / baseImponible : 0

  // Recientes por destino
  const corrRecientes = recientesAll.filter(r => r.destino === 'seguros').slice(0, 8).map(mapReciente)
  const pisosRecientes = recientesAll.filter(r => r.destino === 'turistico_pisos' || r.destino === 'turistico_duplex').slice(0, 8).map(mapReciente)
  const persRecientes = recientesAll.filter(r => (r.destino ?? 'personal') === 'personal').slice(0, 8).map(mapReciente)
  const amortizablesRecientes = recientesAll.filter(r => r.amortizable && Number(r.importe) < 0).slice(0, 20).map(mapReciente)

  // Desglose de ingresos de correduría por compañía aseguradora
  const compRows = await prisma.$queryRaw<Array<{ concepto: string | null; concepto_normalizado: string | null; contraparte: string | null; importe: unknown }>>`
    SELECT mb.concepto, mb.concepto_normalizado, mb.contraparte, mb.importe
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
      AND mb.destino = 'seguros'
      AND mb.importe > 0
      AND coalesce(mb.duplicado_estado, '') <> 'ignorado'
      AND mb.fecha_operacion BETWEEN ${inicio}::date AND ${fin}::date
  `
  const compMap = new Map<string, number>()
  for (const r of compRows) {
    const txt = `${r.concepto ?? ''} ${r.concepto_normalizado ?? ''} ${r.contraparte ?? ''}`.toUpperCase()
    let nombre = 'Otras comisiones'
    // Compañías que pagan directo con su nombre en el concepto
    if (txt.includes('GENERALI')) nombre = 'Generali'
    else if (txt.includes('ALLIANZ')) nombre = 'Allianz'
    else if (txt.includes('MAPFRE')) nombre = 'Mapfre'
    else if (txt.includes('CASER')) nombre = 'Caser'
    else if (/\bAXA\b/.test(txt)) nombre = 'AXA'
    else if (txt.includes('ZURICH')) nombre = 'Zürich'
    else if (txt.includes('REALE')) nombre = 'Reale'
    else if (txt.includes('MUTUA')) nombre = 'Mutua'
    else if (txt.includes('LINEA DIRECTA') || txt.includes('LÍNEA DIRECTA')) nombre = 'Línea Directa'
    else if (txt.includes('OCCIDENT') || txt.includes('CATALANA')) nombre = 'Occident'
    else if (txt.includes('HELVETIA')) nombre = 'Helvetia'
    else if (txt.includes('PELAYO')) nombre = 'Pelayo'
    else if (txt.includes('LIBERTY')) nombre = 'Liberty'
    else if (txt.includes('PLUS ULTRA')) nombre = 'Plus Ultra'
    else if (txt.includes('SANITAS') || txt.includes('ADESLAS') || txt.includes('DKV') || txt.includes('ASISA')) nombre = 'Salud'
    // Plataformas/agregadores — compañía confirmada por Alberto
    else if (txt.includes('M00171') || txt.includes('8/92361')) nombre = 'Occident'
    else if (/LIQ\.COMISIONES|LIQ\. COMISIONES/.test(txt)) nombre = 'Mapfre'
    else if (txt.includes('FRA-COMIS')) nombre = 'CSR/Caser'
    else if (/^COMISIONES /.test(txt)) nombre = 'Pelayo'
    else if (txt.includes('REMSALDO')) nombre = 'Aegon'
    else if (txt.includes('M1454')) nombre = 'M1454 (por identificar)'
    else if (txt.includes('PD005')) nombre = 'Pd005 (por identificar)'
    else if (/LIQ\.?\s*SALDO CUENTA/.test(txt)) nombre = 'AXA'
    else if (/LIQUIDACION DE COMISIONES/.test(txt)) nombre = 'Reale'
    else if (/PAGO SALDO CTA/.test(txt)) nombre = 'Generali'
    compMap.set(nombre, (compMap.get(nombre) ?? 0) + Number(r.importe))
  }
  const porCompania = [...compMap.entries()]
    .map(([nombre, importe]) => ({ nombre, importe: Math.round(importe * 100) / 100 }))
    .sort((a, b) => b.importe - a.importe)

  // ── Salud del agente de extracción de facturas (badge de corte) ──────────────
  // Lo escribe la skill `facturas-correo` en `agente_salud`. Tolerante: si la tabla aún no está
  // aplicada en este entorno, degrada a null (no rompe la página de finanzas).
  let saludExtraccion: ResumenFinanciero['saludExtraccion'] = null
  try {
    const saludRows = await prisma.$queryRaw<Array<{ ok: boolean; dias_caido: number; detalle: string | null }>>`
      SELECT ok, dias_caido, detalle FROM agente_salud
      WHERE agente = 'facturas-extraccion-pdf' LIMIT 1
    `
    if (saludRows[0]) {
      saludExtraccion = { ok: saludRows[0].ok, diasCaido: Number(saludRows[0].dias_caido), detalle: saludRows[0].detalle }
    }
  } catch { /* tabla agente_salud aún no aplicada en este entorno: sin badge */ }

  return {
    correduria: {
      cobradoNeto: corrIng,
      prestacionesExentas: corrExento,
      retencionesEstimadas,
      ingresosBrutos,
      gastosDeducibles: corrGas,
      resultado: corrResultado,
      porMes: [...corrPorMes.values()].sort((a, b) => a.mes.localeCompare(b.mes)),
      recientes: corrRecientes,
      porCompania,
      verificacion: verifOf(['seguros']),
    },
    pisos: {
      total: pisosTotal,
      kutxa: { ingresos: pisosKutxaIng, gastos: pisosKutxaGas, resultado: pisosKutxaIng - pisosKutxaGas },
      bbva: { ingresos: pisosBbvaIng, gastos: pisosBbvaGas, resultado: pisosBbvaIng - pisosBbvaGas },
      porMes: [...pisosPorMes.values()].sort((a, b) => a.mes.localeCompare(b.mes)),
      recientes: pisosRecientes,
      verificacion: verifOf(['turistico_pisos', 'turistico_duplex']),
    },
    personal: {
      bbva: {
        gastos: persGasBbva,
        porCategoria: catBbva.slice(0, 5).map(r => ({ categoria: r.categoria ?? 'otros', importe: Number(r.gastos) })),
      },
      kutxa: {
        gastos: persGasKutxa,
        porCategoria: catKutxa.slice(0, 5).map(r => ({ categoria: r.categoria ?? 'otros', importe: Number(r.gastos) })),
      },
      total: persGas,
      recientes: persRecientes,
      verificacion: verifOf(['personal']),
    },
    fiscal: {
      baseImponibleEstimada: baseImponible,
      baseImponibleSinReduccion: Math.max(0, baseImponibleBruta),
      tramosIRPF,
      tramoActual,
      margenHastaProximoTramo,
      margenHastaTramoPrevio,
      ahorroBajarTramo,
      tramoPrevioTipo,
      tipoEfectivo,
      reduccionConjunta: REDUCCION_CONJUNTA,
      exento: corrExento,
      trimestres,
      retencionesAcumuladas: retencionesEstimadas,
    },
    deducciones,
    amortizables: { total: amortizablesTotal, recientes: amortizablesRecientes },
    saludExtraccion,
    year,
    quarter,
    anterior,
    yearsDisponibles: yearsDisponibles.length ? yearsDisponibles : [year],
  }
}

// ── Control de gastos: lista de cargos del periodo agrupada por bucket de deducibilidad ────────
// Alimenta la pestaña «Gastos» de /finanzas. Excluye traspasos del cómputo de totales y las
// cuentas del cónyuge (Pilar tiene su propia página). Los "por revisar" salen primero.
export async function getGastosControl(
  cuentaId: string,
  year: number,
  quarter = 0,
  desde?: string,
  hasta?: string,
): Promise<GastosControl> {
  const { inicio, fin } = (desde && hasta) ? { inicio: desde, fin: hasta } : mesRange(year, quarter)

  const [rows, repartoRows, pisoRows] = await Promise.all([
    prisma.$queryRaw<Array<{
      id: string; fecha_operacion: Date | null; concepto: string | null
      concepto_normalizado: string | null; contraparte: string | null
      importe: unknown; destino: string | null; banco: string | null
      destino_confirmado: boolean | null; requiere_revision: boolean | null
      conciliado: boolean | null; factura_ref: string | null; amortizable: boolean | null
      desglosado: boolean | null; comentario: string | null; deduccion_cuota_tipo: string | null
    }>>`
      SELECT mb.id, mb.fecha_operacion, mb.concepto, mb.concepto_normalizado, mb.contraparte,
             mb.importe, coalesce(mb.destino, 'personal') AS destino, coalesce(cb.banco, '') AS banco,
             mb.destino_confirmado, mb.requiere_revision, mb.conciliado, mb.factura_ref, mb.amortizable,
             mb.desglosado, mb.comentario, mb.deduccion_cuota_tipo
      FROM movimientos_bancarios mb
      JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
      WHERE cb.cuenta_id = ${cuentaId}::uuid
        AND coalesce(cb.titular, 'titular') <> 'conyuge'
        AND mb.importe < 0
        AND coalesce(mb.duplicado_estado, '') <> 'ignorado'
        AND mb.fecha_operacion BETWEEN ${inicio}::date AND ${fin}::date
      ORDER BY mb.fecha_operacion DESC NULLS LAST, mb.created_at DESC
    `,
    // Repartos de los cargos desglosados del periodo (scoped por cuenta vía join).
    prisma.$queryRaw<Array<{ movimiento_id: string; propiedad: string; porcentaje: unknown; importe: unknown }>>`
      SELECT r.movimiento_id, r.propiedad, r.porcentaje, r.importe
      FROM movimiento_reparto r
      JOIN movimientos_bancarios mb ON mb.id = r.movimiento_id
      JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
      WHERE cb.cuenta_id = ${cuentaId}::uuid
        AND mb.fecha_operacion BETWEEN ${inicio}::date AND ${fin}::date
    `,
    // Pisos turísticos para el selector de reparto (excluye el cubo de compartidos).
    prisma.$queryRaw<Array<{ id: string; name: string }>>`
      SELECT id, name FROM properties WHERE id <> 'prop_multi_apartamentos' ORDER BY name
    `,
  ])

  const repartoPorMov = new Map<string, { propiedad: string; porcentaje: number; importe: number }[]>()
  for (const r of repartoRows) {
    const arr = repartoPorMov.get(r.movimiento_id) ?? []
    arr.push({ propiedad: r.propiedad, porcentaje: Number(r.porcentaje), importe: Number(r.importe) })
    repartoPorMov.set(r.movimiento_id, arr)
  }
  const pisos: Piso[] = pisoRows.map(p => ({ id: p.id, nombre: p.name }))

  const movs: GastoMov[] = rows.map(r => {
    const destino = (r.destino ?? 'personal') as Destino
    const bucket = bucketDeDestino(destino)
    const concepto = r.concepto_normalizado || r.concepto || r.contraparte || '—'
    return {
      id: r.id,
      fecha: r.fecha_operacion ? r.fecha_operacion.toISOString().slice(0, 10) : null,
      concepto,
      banco: r.banco ?? '',
      importe: Math.abs(Number(r.importe)),
      destino,
      destinoLabel: DESTINO_LABEL[destino] ?? destino,
      bucket,
      deducible: BUCKET_DEDUCIBLE[bucket],
      confirmado: !!r.destino_confirmado,
      // «Por revisar» = solo lo que el sistema NO sabe con seguridad (clasificado por descarte →
      // requiere_revision) y aún sin confirmar. Lo reconocido por patrón/regla (revisar=false) o ya
      // confirmado NO entra en la bandeja (sigue visible en su bucket).
      porRevisar: !!r.requiere_revision && !r.destino_confirmado && bucket !== 'traspaso',
      conciliado: !!r.conciliado,
      facturaRef: r.factura_ref,
      amortizable: !!r.amortizable,
      deduccionCuotaTipo: (r.deduccion_cuota_tipo as DeduccionCuotaTipo | null) ?? null,
      busqueda: (r.contraparte || r.concepto_normalizado || r.concepto || '').slice(0, 80),
      comercio: claveComercio(r.concepto) ?? claveComercio(r.concepto_normalizado),
      desglose: repartoPorMov.get(r.id) ?? [],
      comentario: r.comentario,
    }
  })

  const porRevisar = movs.filter(m => m.porRevisar)
  // Agrupar la bandeja por comercio: una decisión clasifica todos los iguales (y aprende la regla).
  // Los que no tienen comercio claro son grupos de 1 (clave = id).
  const grupoMap = new Map<string, GastoMov[]>()
  for (const m of porRevisar) {
    const key = m.comercio ?? `__${m.id}`
    const arr = grupoMap.get(key); if (arr) arr.push(m); else grupoMap.set(key, [m])
  }
  const porRevisarGrupos: GastoGrupo[] = [...grupoMap.values()].map(ms => ({
    comercio: ms[0].comercio,
    label: ms[0].comercio ?? ms[0].concepto,
    count: ms.length,
    total: ms.reduce((s, m) => s + m.importe, 0),
    sinJustificante: ms.filter(m => m.deducible && !m.conciliado && !m.facturaRef).length,
    movs: ms,
  })).sort((a, b) => b.count - a.count || b.total - a.total)
  const orden: GastoBucket[] = ['negocio', 'renta', 'no_deducible', 'traspaso']
  const buckets = orden.map(bucket => {
    const list = movs.filter(m => m.bucket === bucket)
    return {
      bucket,
      label: BUCKET_LABEL[bucket],
      deducible: BUCKET_DEDUCIBLE[bucket],
      total: list.reduce((s, m) => s + m.importe, 0),
      movs: list,
    }
  })

  const deducibleTotal = movs.filter(m => m.deducible && !m.amortizable).reduce((s, m) => s + m.importe, 0)
  const amortizablesTotal = movs.filter(m => m.deducible && m.amortizable).reduce((s, m) => s + m.importe, 0)
  const noDeducibleTotal = movs.filter(m => m.bucket === 'no_deducible').reduce((s, m) => s + m.importe, 0)
  const sinJustificante = movs.filter(m => m.deducible && !m.conciliado && !m.facturaRef).length

  const cuotaDeduccionResumen: CuotaDeduccionResumen = {
    mecenazgo:    movs.filter(m => m.deduccionCuotaTipo === 'mecenazgo').reduce((s, m) => s + m.importe, 0),
    guarderia:    movs.filter(m => m.deduccionCuotaTipo === 'guarderia').reduce((s, m) => s + m.importe, 0),
    deportivaAnd: movs.filter(m => m.deduccionCuotaTipo === 'deportiva_and').reduce((s, m) => s + m.importe, 0),
  }

  return {
    porRevisar,
    porRevisarGrupos,
    buckets,
    resumen: { deducibleTotal, amortizablesTotal, noDeducibleTotal, sinJustificante },
    cuotaDeduccionResumen,
    pisos,
    year,
    quarter,
  }
}

// ── Resumen actividad de Pilar (autónoma) ─────────────────────────────────────

export type ClientePilar = { contraparte: string; numCobros: number; total: number; pct: number }
export type TrimPilar = {
  q: number
  cobros: number
  gastos: number
  cuotaSS: number
  rendimientoNeto: number
  retenciones: number
  pagoFraccionado: number
  plazo: string
  estado: 'pasado' | 'proximo' | 'futuro'
}

export type ResumenPilar = {
  cobros: number
  gastosProfesionales: number
  cuotaAutonomos: number
  rendimientoNeto: number
  retenciones: number
  porMes: MesData[]
  recientes: MovResumen[]
  clientes: ClientePilar[]
  alertaConcentracion: string | null
  trimestres: TrimPilar[]
  year: number
  quarter: number
  yearsDisponibles: number[]
  tieneExtracto: boolean
  notas: string[]
}

const RETENCION_AUTONOMO = 0.15
const PLAZOS_130: Record<number, { fecha: string; label: string }> = {
  1: { fecha: `${new Date().getFullYear()}-04-20`, label: '20 abr' },
  2: { fecha: `${new Date().getFullYear()}-07-20`, label: '20 jul' },
  3: { fecha: `${new Date().getFullYear()}-10-20`, label: '20 oct' },
  4: { fecha: `${new Date().getFullYear() + 1}-01-30`, label: '30 ene' },
}

export async function getResumenPilar(cuentaId: string, year: number, quarter = 0, desde?: string, hasta?: string): Promise<ResumenPilar> {
  // Periodo principal (KPIs/clientes/evolución) acepta rango libre; el Modelo 130 por trimestre
  // de más abajo se mantiene por año fiscal.
  const { inicio, fin } = (desde && hasta) ? { inicio: desde, fin: hasta } : mesRange(year, quarter)

  const [movRows, clienteRows, porMesRows, yearsRows] = await Promise.all([
    prisma.$queryRaw<Array<{
      id: string; fecha_operacion: Date | null; importe: unknown
      concepto: string | null; concepto_normalizado: string | null
      contraparte: string | null; subcategoria: string | null; destino_confirmado: boolean
      comentario: string | null
    }>>`
      SELECT mb.id, mb.fecha_operacion, mb.importe, mb.concepto, mb.concepto_normalizado,
             mb.contraparte, mb.subcategoria, mb.destino_confirmado, mb.comentario
      FROM movimientos_bancarios mb
      JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
      WHERE cb.cuenta_id = ${cuentaId}::uuid
        AND cb.titular = 'conyuge'
        AND mb.destino = 'actividad_pilar'
        AND mb.fecha_operacion BETWEEN ${inicio}::date AND ${fin}::date
      ORDER BY mb.fecha_operacion DESC NULLS LAST, mb.created_at DESC
    `,
    prisma.$queryRaw<Array<{ contraparte: string | null; num_cobros: bigint; total: unknown }>>`
      SELECT mb.contraparte, count(*) AS num_cobros, sum(mb.importe) AS total
      FROM movimientos_bancarios mb
      JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
      WHERE cb.cuenta_id = ${cuentaId}::uuid
        AND cb.titular = 'conyuge'
        AND mb.destino = 'actividad_pilar'
        AND mb.importe > 0
        AND mb.fecha_operacion BETWEEN ${inicio}::date AND ${fin}::date
      GROUP BY mb.contraparte
      ORDER BY sum(mb.importe) DESC
    `,
    prisma.$queryRaw<Array<{ mes: string; ingresos: unknown; gastos: unknown }>>`
      SELECT to_char(date_trunc('month', mb.fecha_operacion), 'YYYY-MM') AS mes,
             coalesce(sum(mb.importe) FILTER (WHERE mb.importe > 0), 0) AS ingresos,
             coalesce(sum(-mb.importe) FILTER (WHERE mb.importe < 0), 0) AS gastos
      FROM movimientos_bancarios mb
      JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
      WHERE cb.cuenta_id = ${cuentaId}::uuid
        AND cb.titular = 'conyuge'
        AND mb.destino = 'actividad_pilar'
        AND mb.fecha_operacion >= (date_trunc('month', make_date(${year}::int, 1, 1)))
        AND mb.fecha_operacion <= make_date(${year}::int, 12, 31)
      GROUP BY 1 ORDER BY 1
    `,
    prisma.$queryRaw<Array<{ anio: number }>>`
      SELECT DISTINCT EXTRACT(year FROM mb.fecha_operacion)::int AS anio
      FROM movimientos_bancarios mb
      JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
      WHERE cb.cuenta_id = ${cuentaId}::uuid AND cb.titular = 'conyuge'
        AND mb.destino = 'actividad_pilar' AND mb.fecha_operacion IS NOT NULL
      ORDER BY 1 DESC
    `,
  ])

  let cobros = 0, gastosProfesionales = 0, cuotaAutonomos = 0
  for (const r of movRows) {
    const imp = Number(r.importe)
    if (imp > 0) cobros += imp
    else if (r.subcategoria === 'cuota_autonomos') cuotaAutonomos += Math.abs(imp)
    else gastosProfesionales += Math.abs(imp)
  }
  const retenciones = cobros * RETENCION_AUTONOMO
  const rendimientoNeto = cobros - gastosProfesionales - cuotaAutonomos

  // Clientes con % sobre el total
  const totalCobros = cobros || 1
  const clientes: ClientePilar[] = clienteRows.map(r => ({
    contraparte: r.contraparte || 'Sin identificar',
    numCobros: Number(r.num_cobros),
    total: Number(r.total),
    pct: (Number(r.total) / totalCobros) * 100,
  }))
  const topPct = clientes[0]?.pct ?? 0
  const alertaConcentracion = topPct >= 75
    ? `⚠️ El ${topPct.toFixed(0)}% de los ingresos vienen de un solo cliente. Hacienda puede cuestionar la condición de autónoma.`
    : null

  // Trimestres para Modelo 130
  const hoy = new Date()
  const trimestres: TrimPilar[] = [1, 2, 3, 4].map(q => {
    const { inicio: qi, fin: qf } = mesRange(year, q)
    let qCobros = 0, qGastos = 0, qCuota = 0
    for (const r of movRows) {
      const fecha = r.fecha_operacion?.toISOString().slice(0, 10)
      if (!fecha || fecha < qi || fecha > qf) continue
      const imp = Number(r.importe)
      if (imp > 0) qCobros += imp
      else if (r.subcategoria === 'cuota_autonomos') qCuota += Math.abs(imp)
      else qGastos += Math.abs(imp)
    }
    const qRet = qCobros * RETENCION_AUTONOMO
    const qNeto = qCobros - qGastos - qCuota
    const pagoFraccionado = Math.max(0, qNeto * 0.20 - qRet)
    const plazoInfo = PLAZOS_130[q]
    const plazoFecha = new Date(plazoInfo.fecha)
    const diasHasta = Math.ceil((plazoFecha.getTime() - hoy.getTime()) / 86400000)
    const estado: TrimPilar['estado'] = diasHasta < 0 ? 'pasado' : diasHasta <= 15 ? 'proximo' : 'futuro'
    return { q, cobros: qCobros, gastos: qGastos, cuotaSS: qCuota, rendimientoNeto: qNeto, retenciones: qRet, pagoFraccionado, plazo: plazoInfo.label, estado }
  })

  const recientes: MovResumen[] = movRows.slice(0, 20).map(r => ({
    id: r.id,
    fecha: r.fecha_operacion ? r.fecha_operacion.toISOString().slice(0, 10) : null,
    concepto: r.concepto_normalizado || r.concepto || r.contraparte || 'Movimiento',
    categoria: r.subcategoria,
    importe: Number(r.importe),
    confirmado: r.destino_confirmado,
  }))

  const yearsDisponibles = yearsRows.map(r => r.anio)

  // Avisos manuales dejados en `comentario` al cargar un movimiento a mano (p.ej. una
  // factura estimada a partir del neto cobrado en banco, sin el desglose real). Se
  // deduplican para no repetir el mismo aviso por cada factura idéntica.
  const notas = [...new Set(movRows.map(r => r.comentario).filter((c): c is string => !!c))]

  return {
    cobros,
    gastosProfesionales,
    cuotaAutonomos,
    rendimientoNeto,
    retenciones,
    porMes: porMesRows.map(r => ({ mes: r.mes, ingresos: Number(r.ingresos), gastos: Number(r.gastos) })),
    recientes,
    clientes,
    alertaConcentracion,
    trimestres,
    year,
    quarter,
    yearsDisponibles: yearsDisponibles.length ? yearsDisponibles : [year],
    tieneExtracto: movRows.length > 0,
    notas,
  }
}

// ── Comerciantes por categoría personal ───────────────────────────────────────

export type MerchantRow = {
  comerciante: string
  total: number
  count: number
  ticket_medio: number
  porMes: { mes: string; total: number }[]
}

// Filtro por cuenta para el eje personal: BBVA (100% de Alberto) vs "familiar" (el resto, p.ej.
// Kutxabank). Coherente con la separación de `getResumenFinanciero.personal.bbva/.kutxa`.
export function bancoCond(banco?: string) {
  if (banco === 'bbva') return Prisma.sql`AND LOWER(COALESCE(cb.banco, '')) LIKE '%bbva%'`
  if (banco === 'familiar' || banco === 'kutxa') return Prisma.sql`AND LOWER(COALESCE(cb.banco, '')) NOT LIKE '%bbva%'`
  return Prisma.empty
}

export async function getMerchantsForCategoria(
  cuentaId: string,
  categoria: string,
  desde: string,
  hasta: string,
  banco?: string,
): Promise<MerchantRow[]> {
  // Se traen las filas crudas (concepto + contraparte) y se agrupa en JS por `comercioDe`, que deriva
  // el comercio del CONCEPTO cuando la contraparte viene vacía (así "Sin identificar" no colapsa
  // comercios distintos como OSORNITO/BAZAR/DIA…). El volumen es el gasto personal de UNA subcategoría
  // en el rango → cientos de filas como mucho.
  const filas = await prisma.$queryRaw<Array<{ concepto: string | null; contraparte: string | null; importe: number; mes: string }>>`
    SELECT mb.concepto, mb.contraparte, ABS(mb.importe)::float AS importe,
           TO_CHAR(DATE_TRUNC('month', mb.fecha_operacion), 'YYYY-MM') AS mes
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
      AND mb.subcategoria = ${categoria}
      AND mb.importe < 0
      -- SOLO gasto PERSONAL: el eje "En qué gasto" no debe mezclar costes profesionales (cuota de
      -- autónomos TGSS, tributos del negocio…) que comparten subcategoría pero tienen destino distinto.
      AND COALESCE(mb.destino, 'personal') = 'personal'
      AND COALESCE(mb.duplicado_estado, '') <> 'ignorado'
      AND mb.fecha_operacion BETWEEN ${desde}::date AND ${hasta}::date
      ${bancoCond(banco)}
  `

  const map = new Map<string, { total: number; count: number; porMes: Map<string, number> }>()
  for (const f of filas) {
    const com = comercioDe(f.contraparte, f.concepto)
    const e = map.get(com) ?? { total: 0, count: 0, porMes: new Map<string, number>() }
    e.total += f.importe
    e.count += 1
    e.porMes.set(f.mes, (e.porMes.get(f.mes) ?? 0) + f.importe)
    map.set(com, e)
  }

  return [...map.entries()]
    .map(([comerciante, e]) => ({
      comerciante,
      total: e.total,
      count: e.count,
      ticket_medio: e.total / e.count,
      porMes: [...e.porMes.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([mes, total]) => ({ mes, total })),
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 20)
}
