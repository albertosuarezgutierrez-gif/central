import { prisma } from './db'
import { Prisma } from '@prisma/client'
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
}

export type MovResumen = {
  id: string
  fecha: string | null
  concepto: string
  categoria: string | null
  importe: number
}

export type MesData = { mes: string; ingresos: number; gastos: number }

export type ResumenFinanciero = {
  correduria: {
    cobradoNeto: number
    retencionesEstimadas: number
    ingresosBrutos: number
    gastosDeducibles: number
    resultado: number
    porMes: MesData[]
    recientes: MovResumen[]
    porCompania: { nombre: string; importe: number }[]
  }
  pisos: {
    total: { ingresos: number; gastos: number; resultado: number }
    kutxa: { ingresos: number; gastos: number; resultado: number }
    bbva: { ingresos: number; gastos: number; resultado: number }
    porMes: MesData[]
    recientes: MovResumen[]
  }
  personal: {
    bbva: { gastos: number; porCategoria: { categoria: string; importe: number }[] }
    kutxa: { gastos: number; porCategoria: { categoria: string; importe: number }[] }
    total: number
    recientes: MovResumen[]
  }
  fiscal: {
    baseImponibleEstimada: number
    tramosIRPF: { desde: number; hasta: number | null; tipo: number; importe: number }[]
    tramoActual: { desde: number; hasta: number | null; tipo: number }
    margenHastaProximoTramo: number | null
    reduccionConjunta: number
    trimestres: { q: number; ingresos: number; gastosDeducibles: number; resultado: number }[]
    retencionesAcumuladas: number
  }
  deducciones: DeduccionesView
  year: number
  quarter: number
  anterior: { ingresos: number; gastos: number; resultado: number } | null
  yearsDisponibles: number[]
}

const RETENCION_SEGUROS = 0.15
const REDUCCION_CONJUNTA = 3400

const TRAMOS_IRPF = [
  { desde: 0, hasta: 12450, tipo: 0.19 },
  { desde: 12450, hasta: 20200, tipo: 0.24 },
  { desde: 20200, hasta: 35200, tipo: 0.30 },
  { desde: 35200, hasta: 60000, tipo: 0.37 },
  { desde: 60000, hasta: 300000, tipo: 0.45 },
  { desde: 300000, hasta: null, tipo: 0.47 },
]

function calcularTramos(base: number) {
  const basePos = Math.max(0, base)
  const resultado = TRAMOS_IRPF.map(t => {
    const desde = t.desde
    const hasta = t.hasta ?? Infinity
    const aplicado = Math.max(0, Math.min(basePos, hasta) - desde)
    return { desde: t.desde, hasta: t.hasta, tipo: t.tipo, importe: aplicado * t.tipo }
  })
  const tramoActual = TRAMOS_IRPF.findLast(t => basePos >= t.desde) ?? TRAMOS_IRPF[0]
  const siguienteTramo = TRAMOS_IRPF.find(t => t.desde > basePos)
  const margen = siguienteTramo ? siguienteTramo.desde - basePos : null
  return { tramosIRPF: resultado, tramoActual: { desde: tramoActual.desde, hasta: tramoActual.hasta, tipo: tramoActual.tipo }, margenHastaProximoTramo: margen }
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
): Promise<ResumenFinanciero> {
  const { inicio, fin } = mesRange(year, quarter)
  const { inicio: inicioAnt, fin: finAnt } = mesRange(year - 1, quarter)

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
    gastos: unknown
  }>>`
    SELECT
      coalesce(mb.destino, 'personal') AS destino,
      lower(coalesce(cb.banco, '')) AS banco,
      to_char(date_trunc('month', mb.fecha_operacion), 'YYYY-MM') AS mes,
      coalesce(sum(mb.importe) FILTER (WHERE mb.importe > 0), 0) AS ingresos,
      coalesce(sum(-mb.importe) FILTER (WHERE mb.importe < 0), 0) AS gastos
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
    banco: string | null
  }>>`
    SELECT mb.id, mb.fecha_operacion, mb.concepto, mb.concepto_normalizado, mb.contraparte,
           mb.categoria, mb.importe, mb.destino, lower(coalesce(cb.banco, '')) AS banco
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
      AND coalesce(mb.duplicado_estado, '') <> 'ignorado'
      AND mb.fecha_operacion BETWEEN ${inicio}::date AND ${fin}::date
    ORDER BY mb.fecha_operacion DESC NULLS LAST
    LIMIT 120
  `

  const mapReciente = (r: typeof recientesAll[0]): MovResumen => ({
    id: r.id,
    fecha: r.fecha_operacion ? r.fecha_operacion.toISOString().slice(0, 10) : null,
    concepto: r.concepto_normalizado || r.concepto || r.contraparte || '—',
    categoria: r.categoria,
    importe: Number(r.importe),
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
  let corrIng = 0, corrGas = 0
  let pisosKutxaIng = 0, pisosKutxaGas = 0
  let pisosBbvaIng = 0, pisosBbvaGas = 0
  let persGas = 0

  const corrPorMes = new Map<string, MesData>()
  const pisosPorMes = new Map<string, MesData>()

  for (const r of rows) {
    const ing = Number(r.ingresos)
    const gas = Number(r.gastos)
    const dest = r.destino ?? 'personal'
    const banco = r.banco ?? ''
    const esBbva = banco.includes('bbva')

    if (dest === 'seguros') {
      corrIng += ing; corrGas += gas
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

  // Correduría: bruto estimado y retenciones
  const retencionesEstimadas = corrIng * (RETENCION_SEGUROS / (1 - RETENCION_SEGUROS))
  const ingresosBrutos = corrIng + retencionesEstimadas
  const corrResultado = corrIng - corrGas

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
  const { tramosIRPF, tramoActual, margenHastaProximoTramo } = calcularTramos(baseImponible)

  // Trimestres (fiscal — siempre año completo para el bloque fiscal)
  const trimestresRows = await prisma.$queryRaw<Array<{
    q: number; ingresos: unknown; gastos: unknown
  }>>`
    SELECT
      EXTRACT(quarter FROM mb.fecha_operacion)::int AS q,
      coalesce(sum(mb.importe) FILTER (WHERE mb.importe > 0 AND mb.destino IN ('seguros','turistico_pisos','turistico_duplex')), 0) AS ingresos,
      coalesce(sum(-mb.importe) FILTER (WHERE mb.importe < 0 AND mb.destino IN ('seguros','turistico_pisos','turistico_duplex')), 0) AS gastos
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
      AND coalesce(mb.duplicado_estado, '') <> 'ignorado'
      AND EXTRACT(year FROM mb.fecha_operacion) = ${year}
    GROUP BY 1 ORDER BY 1
  `
  const trimestres = [1, 2, 3, 4].map(q => {
    const r = trimestresRows.find(x => x.q === q)
    const ing = Number(r?.ingresos ?? 0)
    const gas = Number(r?.gastos ?? 0)
    return { q, ingresos: ing, gastosDeducibles: gas, resultado: ing - gas }
  })

  // Deducciones fiscales (perfil familiar → cuota → resultado)
  const deducciones = await getDeducciones(cuentaId, year, baseImponible, retencionesEstimadas)

  // Recientes por destino
  const corrRecientes = recientesAll.filter(r => r.destino === 'seguros').slice(0, 8).map(mapReciente)
  const pisosRecientes = recientesAll.filter(r => r.destino === 'turistico_pisos' || r.destino === 'turistico_duplex').slice(0, 8).map(mapReciente)
  const persRecientes = recientesAll.filter(r => (r.destino ?? 'personal') === 'personal').slice(0, 8).map(mapReciente)

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
    // Plataformas/agregadores que pagan en nombre de varias compañías
    else if (txt.includes('M00171')) nombre = 'Plataforma (m00171)'
    else if (txt.includes('8/92361')) nombre = 'Plataforma (8/92361)'
    else if (/LIQ\.COMISIONES|LIQ\. COMISIONES/.test(txt)) nombre = 'Liq. comisiones'
    else if (txt.includes('FRA-COMIS')) nombre = 'Fra-comisiones'
    else if (/^COMISIONES /.test(txt)) nombre = 'Comisiones mensuales'
    else if (txt.includes('PD005')) nombre = 'Pd005 agente'
    else if (txt.includes('REMSALDO')) nombre = 'Remsaldo'
    else if (txt.includes('M1454')) nombre = 'M1454'
    else if (/LIQ\.?\s*SALDO CUENTA/.test(txt)) nombre = 'Liq. saldo cuenta'
    else if (/PAGO SALDO CTA/.test(txt)) nombre = 'Pago saldo cta'
    else if (/LIQUIDACION DE COMISIONES/.test(txt)) nombre = 'Liquidación comisiones'
    compMap.set(nombre, (compMap.get(nombre) ?? 0) + Number(r.importe))
  }
  const porCompania = [...compMap.entries()]
    .map(([nombre, importe]) => ({ nombre, importe: Math.round(importe * 100) / 100 }))
    .sort((a, b) => b.importe - a.importe)

  return {
    correduria: {
      cobradoNeto: corrIng,
      retencionesEstimadas,
      ingresosBrutos,
      gastosDeducibles: corrGas,
      resultado: corrResultado,
      porMes: [...corrPorMes.values()].sort((a, b) => a.mes.localeCompare(b.mes)),
      recientes: corrRecientes,
      porCompania,
    },
    pisos: {
      total: pisosTotal,
      kutxa: { ingresos: pisosKutxaIng, gastos: pisosKutxaGas, resultado: pisosKutxaIng - pisosKutxaGas },
      bbva: { ingresos: pisosBbvaIng, gastos: pisosBbvaGas, resultado: pisosBbvaIng - pisosBbvaGas },
      porMes: [...pisosPorMes.values()].sort((a, b) => a.mes.localeCompare(b.mes)),
      recientes: pisosRecientes,
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
    },
    fiscal: {
      baseImponibleEstimada: baseImponible,
      tramosIRPF,
      tramoActual,
      margenHastaProximoTramo,
      reduccionConjunta: REDUCCION_CONJUNTA,
      trimestres,
      retencionesAcumuladas: retencionesEstimadas,
    },
    deducciones,
    year,
    quarter,
    anterior,
    yearsDisponibles: yearsDisponibles.length ? yearsDisponibles : [year],
  }
}
