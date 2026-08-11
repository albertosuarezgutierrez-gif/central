// Motor PURO de deducciones IRPF (estatales + autonómicas Andalucía) + optimizador.
// Sin BD, sin red: todo son funciones deterministas y testeables (`node --test`).
//
// ⚠️ ORIENTATIVO — no sustituye asesoría fiscal. Los importes legales viven en
// IMPORTES_POR_ANIO con su FUENTE y FECHA DE REVISIÓN: actualizar = tocar una línea.
// El vigilante `.claude/skills/fiscal-novedades` contrasta estas cifras con BOE/BOJA.
import { eur } from './dinero.ts'

export type ImportesAnio = {
  fuente: string
  revisado: string // YYYY-MM-DD
  // ── Mínimo personal y familiar ──
  minimoContribuyente: number
  minimoDescendiente: number[] // 1º..4º+ (el último se repite para 5º+)
  incrementoMenor3: number
  minimoDiscapacidad33: number // grado 33–64 %
  minimoDiscapacidad65: number // grado ≥ 65 %
  minimoAscendiente: number
  minimoAscendiente75Extra: number
  // ── Reducciones de base ──
  limitePlanPensiones: number
  // ── Deducciones de cuota (estatales) ──
  maternidadPorHijo: number // por hijo < 3, madre con actividad
  maternidadGuarderiaMax: number
  familiaNumerosaGeneral: number
  familiaNumerosaEspecial: number
  // ── Autonómicas Andalucía (orientativo, con límites de renta) ──
  andaluciaNacimiento: number
  andaluciaFamiliaNumerosaGeneral: number
  andaluciaFamiliaNumerosaEspecial: number
  // Límite de renta de la deducción autonómica por FAMILIA NUMEROSA (suma de bases general+ahorro):
  // individual e conjunta. La deducción por NACIMIENTO ya NO tiene límite (Ley 8/2025).
  andaluciaFamiliaNumerosaLimiteIndividual: number
  andaluciaFamiliaNumerosaLimiteConjunta: number
  // ── Tarifa IRPF (escala estatal + autonómica combinada, aproximada) ──
  tramos: { desde: number; hasta: number | null; tipo: number }[]
}

// Cifras de referencia por año (revisar cada campaña — el vigilante abre PR si cambian).
export const IMPORTES_POR_ANIO: Record<number, ImportesAnio> = {
  2025: {
    fuente: 'https://sede.agenciatributaria.gob.es (Ley 35/2006 IRPF) + BOJA Andalucía',
    revisado: '2026-06-18',
    minimoContribuyente: 5550,
    minimoDescendiente: [2400, 2700, 4000, 4500],
    incrementoMenor3: 2800,
    minimoDiscapacidad33: 3000,
    minimoDiscapacidad65: 9000,
    minimoAscendiente: 1150,
    minimoAscendiente75Extra: 1400,
    limitePlanPensiones: 1500,
    maternidadPorHijo: 1200,
    maternidadGuarderiaMax: 1000,
    familiaNumerosaGeneral: 1200,
    familiaNumerosaEspecial: 2400,
    andaluciaNacimiento: 200,
    andaluciaFamiliaNumerosaGeneral: 200,
    andaluciaFamiliaNumerosaEspecial: 400,
    andaluciaFamiliaNumerosaLimiteIndividual: 25000,
    andaluciaFamiliaNumerosaLimiteConjunta: 30000,
    tramos: [
      { desde: 0, hasta: 12450, tipo: 0.19 },
      { desde: 12450, hasta: 20200, tipo: 0.24 },
      { desde: 20200, hasta: 35200, tipo: 0.30 },
      { desde: 35200, hasta: 60000, tipo: 0.37 },
      { desde: 60000, hasta: 300000, tipo: 0.45 },
      { desde: 300000, hasta: null, tipo: 0.47 },
    ],
  },
  // 2026: PGE no aprobados (prórroga). Mínimos, tramos y deducciones sin cambio respecto a 2025.
  // Novedad: RDL 5/2026 (BOE-A-2026-3810) amplía la deducción para rentas bajas de €340 a €590,89
  // para rendimientos del trabajo ≤ €17.094 (SMI 2026), con reducción progresiva hasta €20.048,45.
  // Esa deducción no está en los campos vigilados porque depende del nivel de renta del declarante
  // y no afecta al perfil actual (rendimientos > €20.048,45). Sin cambios en campos vigilados.
  2026: {
    fuente: 'https://sede.agenciatributaria.gob.es (Ley 35/2006 + RDL 5/2026) + BOJA Andalucía — revisado sin cambios en mínimos/tramos/deducciones',
    revisado: '2026-07-01',
    minimoContribuyente: 5550,
    minimoDescendiente: [2400, 2700, 4000, 4500],
    incrementoMenor3: 2800,
    minimoDiscapacidad33: 3000,
    minimoDiscapacidad65: 9000,
    minimoAscendiente: 1150,
    minimoAscendiente75Extra: 1400,
    limitePlanPensiones: 1500,
    maternidadPorHijo: 1200,
    maternidadGuarderiaMax: 1000,
    familiaNumerosaGeneral: 1200,
    familiaNumerosaEspecial: 2400,
    andaluciaNacimiento: 200,
    andaluciaFamiliaNumerosaGeneral: 200,
    andaluciaFamiliaNumerosaEspecial: 400,
    andaluciaFamiliaNumerosaLimiteIndividual: 25000,
    andaluciaFamiliaNumerosaLimiteConjunta: 30000,
    tramos: [
      { desde: 0, hasta: 12450, tipo: 0.19 },
      { desde: 12450, hasta: 20200, tipo: 0.24 },
      { desde: 20200, hasta: 35200, tipo: 0.30 },
      { desde: 35200, hasta: 60000, tipo: 0.37 },
      { desde: 60000, hasta: 300000, tipo: 0.45 },
      { desde: 300000, hasta: null, tipo: 0.47 },
    ],
  },
}

export function importesDe(anio: number): ImportesAnio {
  // Si no hay tabla del año pedido, usa la más reciente disponible.
  if (IMPORTES_POR_ANIO[anio]) return IMPORTES_POR_ANIO[anio]
  const anios = Object.keys(IMPORTES_POR_ANIO).map(Number).sort((a, b) => b - a)
  return IMPORTES_POR_ANIO[anios[0]]
}

export type PerfilFiscal = {
  comunidadAutonoma: string
  declaracionConjunta: boolean
  familiaNumerosa: 'general' | 'especial' | null
  conyugeTrabaja: boolean // madre autónoma/cuenta ajena ⇒ activa maternidad
  gastoGuarderiaAnual: number
  aportacionPlanPensiones: number
  gradoDiscapacidadTitular: number
  gradoDiscapacidadConyuge: number
  ascendientesACargo: number
  ascendientesMayores75: number
  donativosAnual: number
  // Gasto en actividades deportivas (Andalucía D.A.1ª Ley 7/2021): 15% sobre base máx. €100.
  gastoDeportivoAnual: number
}

export type Descendiente = {
  nombre: string
  fechaNacimiento: string // YYYY-MM-DD
  gradoDiscapacidad: number
  computoCompleto: boolean // false ⇒ 50 % (custodia compartida)
}

export type LineaDeduccion = {
  clave: string
  concepto: string
  importe: number
  ambito: 'estatal' | 'andalucia'
  reembolsable: boolean // maternidad/FN devuelven aunque no haya cuota
}

export type ResultadoFiscal = {
  minimoPersonalYFamiliar: number
  baseLiquidable: number
  cuotaIntegra: number
  deducciones: LineaDeduccion[]
  totalDeducciones: number
  cuotaLiquida: number
  retenciones: number
  resultado: number // > 0 a pagar · < 0 a devolver
}

const anioNacimiento = (fecha: string) => parseInt(fecha.slice(0, 4), 10)

/** Menor de 3 años a efectos del incremento del mínimo y de la maternidad. */
export function esMenor3(fechaNacimiento: string, anio: number): boolean {
  return anio - anioNacimiento(fechaNacimiento) <= 2
}

/** Edad cumplida a 31-dic del año fiscal. */
export function edadAFinDe(fechaNacimiento: string, anio: number): number {
  const fin = new Date(anio, 11, 31)
  const nac = new Date(fechaNacimiento)
  let edad = fin.getFullYear() - nac.getFullYear()
  const m = fin.getMonth() - nac.getMonth()
  if (m < 0 || (m === 0 && fin.getDate() < nac.getDate())) edad--
  return edad
}

/** Tarifa progresiva: cuota acumulada para una base dada. */
export function cuotaTarifa(base: number, tramos: ImportesAnio['tramos']): number {
  const b = Math.max(0, base)
  return tramos.reduce((acc, t) => {
    const hasta = t.hasta ?? Infinity
    const tramo = Math.max(0, Math.min(b, hasta) - t.desde)
    return acc + tramo * t.tipo
  }, 0)
}

/** Mínimo personal y familiar (contribuyente + descendientes + discapacidad + ascendientes). */
export function minimoPersonalYFamiliar(
  perfil: PerfilFiscal,
  descendientes: Descendiente[],
  anio: number,
  imp: ImportesAnio = importesDe(anio),
): number {
  let min = imp.minimoContribuyente
  if (perfil.gradoDiscapacidadTitular >= 65) min += imp.minimoDiscapacidad65
  else if (perfil.gradoDiscapacidadTitular >= 33) min += imp.minimoDiscapacidad33
  if (perfil.gradoDiscapacidadConyuge >= 65) min += imp.minimoDiscapacidad65
  else if (perfil.gradoDiscapacidadConyuge >= 33) min += imp.minimoDiscapacidad33

  // Descendientes: el escalado va del mayor (1º) al menor.
  const orden = [...descendientes].sort((a, b) => anioNacimiento(a.fechaNacimiento) - anioNacimiento(b.fechaNacimiento))
  orden.forEach((h, i) => {
    const factor = h.computoCompleto ? 1 : 0.5
    const escala = imp.minimoDescendiente[Math.min(i, imp.minimoDescendiente.length - 1)]
    let mh = escala
    if (esMenor3(h.fechaNacimiento, anio)) mh += imp.incrementoMenor3
    if (h.gradoDiscapacidad >= 65) mh += imp.minimoDiscapacidad65
    else if (h.gradoDiscapacidad >= 33) mh += imp.minimoDiscapacidad33
    min += mh * factor
  })

  min += perfil.ascendientesACargo * imp.minimoAscendiente
  min += perfil.ascendientesMayores75 * imp.minimoAscendiente75Extra
  return min
}

/**
 * Deducciones de cuota: estatales (maternidad, familia numerosa) + Andalucía + donativos.
 * `baseParaLimites` = base imponible (suma general+ahorro) para las deducciones autonómicas con
 * límite de renta; si es `undefined` no se aplica el límite (compat con llamadas antiguas/tests).
 */
export function calcularDeducciones(
  perfil: PerfilFiscal,
  descendientes: Descendiente[],
  anio: number,
  imp: ImportesAnio = importesDe(anio),
  baseParaLimites?: number,
): LineaDeduccion[] {
  const lineas: LineaDeduccion[] = []
  const menores3 = descendientes.filter(h => esMenor3(h.fechaNacimiento, anio))

  // Maternidad (madre con actividad): €1.200/año (€100/mes) por hijo < 3 + incremento guardería.
  // PRORRATEO por mes: en el AÑO de nacimiento solo cuentan los meses desde el nacimiento (un hijo
  // nacido en nov. da 2/12 ≈ €200, no €1.200). Los hijos nacidos en años anteriores (y aún < 3) dan
  // el año completo. ⚠️ Sigue SIN topar por las cotizaciones de la madre ese periodo (dato que no
  // tenemos aquí) → puede sobreestimar si la madre cotizó poco; es orientativo (borrador AEAT manda).
  if (perfil.conyugeTrabaja && menores3.length > 0) {
    const importeMaternidad = Math.round(
      menores3.reduce((s, h) => {
        const nacEsteAnio = anioNacimiento(h.fechaNacimiento) === anio
        // getMonth() 0-11 → meses con derecho en el año de nacimiento = de su mes a diciembre.
        const meses = nacEsteAnio ? 12 - new Date(h.fechaNacimiento).getMonth() : 12
        return s + imp.maternidadPorHijo * (meses / 12)
      }, 0),
    )
    lineas.push({
      clave: 'maternidad', ambito: 'estatal', reembolsable: true,
      concepto: `Deducción por maternidad (${menores3.length} hijo/s < 3)`,
      importe: importeMaternidad,
    })
    if (perfil.gastoGuarderiaAnual > 0) {
      lineas.push({
        clave: 'guarderia', ambito: 'estatal', reembolsable: true,
        concepto: 'Incremento por gastos de guardería/custodia',
        importe: Math.min(perfil.gastoGuarderiaAnual, imp.maternidadGuarderiaMax),
      })
    }
  }

  // Familia numerosa (estatal).
  if (perfil.familiaNumerosa === 'general') {
    lineas.push({ clave: 'fn_general', ambito: 'estatal', reembolsable: true, concepto: 'Deducción familia numerosa (general)', importe: imp.familiaNumerosaGeneral })
  } else if (perfil.familiaNumerosa === 'especial') {
    lineas.push({ clave: 'fn_especial', ambito: 'estatal', reembolsable: true, concepto: 'Deducción familia numerosa (especial)', importe: imp.familiaNumerosaEspecial })
  }

  // Autonómicas Andalucía.
  if (perfil.comunidadAutonoma === 'andalucia') {
    // Nacimiento/adopción: SOLO el año del nacimiento; SIN límite de renta (Ley 8/2025 lo eliminó).
    const nacidos = descendientes.filter(h => anioNacimiento(h.fechaNacimiento) === anio)
    if (nacidos.length > 0) {
      lineas.push({ clave: 'and_nacimiento', ambito: 'andalucia', reembolsable: false, concepto: `Andalucía: nacimiento/adopción (${nacidos.length})`, importe: nacidos.length * imp.andaluciaNacimiento })
    }
    // Familia numerosa autonómica: SÍ tiene límite de renta (suma de bases ≤ 25.000 individual /
    // 30.000 conjunta). Solo se aplica si conocemos la base y NO supera el límite.
    const limiteFN = perfil.declaracionConjunta ? imp.andaluciaFamiliaNumerosaLimiteConjunta : imp.andaluciaFamiliaNumerosaLimiteIndividual
    const dentroLimiteFN = baseParaLimites === undefined || baseParaLimites <= limiteFN
    if (dentroLimiteFN) {
      if (perfil.familiaNumerosa === 'general') {
        lineas.push({ clave: 'and_fn', ambito: 'andalucia', reembolsable: false, concepto: 'Andalucía: familia numerosa (general)', importe: imp.andaluciaFamiliaNumerosaGeneral })
      } else if (perfil.familiaNumerosa === 'especial') {
        lineas.push({ clave: 'and_fn', ambito: 'andalucia', reembolsable: false, concepto: 'Andalucía: familia numerosa (especial)', importe: imp.andaluciaFamiliaNumerosaEspecial })
      }
    }
  }

  // Donativos / mecenazgo (Ley 49/2002): 80 % primeros €150, 40 % resto. Base de deducción topada
  // al 10 % de la base liquidable (si la conocemos): el exceso donado no genera deducción ese año.
  if (perfil.donativosAnual > 0) {
    const topeBase = baseParaLimites !== undefined ? Math.max(0, baseParaLimites * 0.1) : Infinity
    const d = Math.min(perfil.donativosAnual, topeBase)
    const importe = Math.round(Math.min(d, 150) * 0.8 + Math.max(0, d - 150) * 0.4)
    if (importe > 0) {
      lineas.push({ clave: 'donativos', ambito: 'estatal', reembolsable: false, concepto: 'Deducción por donativos/mecenazgo (Ley 49/2002)', importe })
    }
  }

  // Deducción deportiva Andalucía (D.A.1ª Ley 7/2021): 15 % sobre base máx. €100.
  if (perfil.comunidadAutonoma === 'andalucia' && perfil.gastoDeportivoAnual > 0) {
    const base = Math.min(perfil.gastoDeportivoAnual, 100)
    const importe = Math.round(base * 0.15)
    if (importe > 0) {
      lineas.push({ clave: 'and_deportiva', ambito: 'andalucia', reembolsable: false, concepto: `Andalucía: actividad deportiva (15%, base máx. €100)`, importe })
    }
  }

  return lineas
}

/** Cálculo completo: base → cuota íntegra → deducciones → retenciones → resultado. */
export function calcularResultadoFiscal(
  baseImponible: number,
  retenciones: number,
  perfil: PerfilFiscal,
  descendientes: Descendiente[],
  anio: number,
  imp: ImportesAnio = importesDe(anio),
): ResultadoFiscal {
  const aportacion = Math.min(Math.max(0, perfil.aportacionPlanPensiones), imp.limitePlanPensiones)
  const baseLiquidable = Math.max(0, baseImponible - aportacion)
  const minimo = minimoPersonalYFamiliar(perfil, descendientes, anio, imp)

  // Método español: cuota = tarifa(base) − tarifa(mínimo).
  const cuotaIntegra = Math.max(0, cuotaTarifa(baseLiquidable, imp.tramos) - cuotaTarifa(minimo, imp.tramos))

  const deducciones = calcularDeducciones(perfil, descendientes, anio, imp, baseLiquidable)
  const noReembolsables = deducciones.filter(d => !d.reembolsable).reduce((s, d) => s + d.importe, 0)
  const reembolsables = deducciones.filter(d => d.reembolsable).reduce((s, d) => s + d.importe, 0)

  const cuotaLiquida = Math.max(0, cuotaIntegra - noReembolsables)
  const totalDeducciones = noReembolsables + reembolsables
  const resultado = cuotaLiquida - retenciones - reembolsables

  return { minimoPersonalYFamiliar: minimo, baseLiquidable, cuotaIntegra, deducciones, totalDeducciones, cuotaLiquida, retenciones, resultado }
}

// ── Optimizador / avisos ────────────────────────────────────────────────────

/** Avisos de oportunidad antes del cierre del ejercicio. */
export function avisosOportunidad(
  perfil: PerfilFiscal,
  baseImponible: number,
  anio: number,
  imp: ImportesAnio = importesDe(anio),
): string[] {
  const avisos: string[] = []
  const base = Math.max(0, baseImponible - Math.min(perfil.aportacionPlanPensiones, imp.limitePlanPensiones))
  const tramoActual = imp.tramos.findLast(t => base >= t.desde)
  if (tramoActual && tramoActual.desde > 0) {
    const margen = base - tramoActual.desde
    const restante = imp.limitePlanPensiones - Math.min(perfil.aportacionPlanPensiones, imp.limitePlanPensiones)
    if (margen > 0 && restante > 0) {
      const baja = Math.min(margen, restante)
      avisos.push(`Aportando ${eur(baja)} más al plan de pensiones bajarías del tramo del ${(tramoActual.tipo * 100).toFixed(0)} %.`)
    }
  }
  return avisos
}

/** Deducciones que APLICAN según el perfil pero podrían no estar reflejadas. */
export function deduccionesAplicablesNoMarcadas(
  perfil: PerfilFiscal,
  descendientes: Descendiente[],
  anio: number,
): { clave: string; motivo: string }[] {
  const sugerencias: { clave: string; motivo: string }[] = []
  const hayMenor3 = descendientes.some(h => esMenor3(h.fechaNacimiento, anio))
  if (hayMenor3 && perfil.conyugeTrabaja && perfil.gastoGuarderiaAnual === 0) {
    sugerencias.push({ clave: 'guarderia', motivo: 'Tienes hijos < 3 y madre con actividad: si pagas guardería puedes sumar hasta 1.000 €/año.' })
  }
  if (descendientes.length >= 3 && !perfil.familiaNumerosa) {
    sugerencias.push({ clave: 'fn', motivo: 'Con 3 hijos podrías solicitar el título de familia numerosa (deducción estatal 1.200 €/año + autonómica).' })
  }
  if (perfil.aportacionPlanPensiones === 0) {
    sugerencias.push({ clave: 'plan_pensiones', motivo: 'No declaras aportaciones a plan de pensiones: reducen base hasta 1.500 €.' })
  }
  return sugerencias
}

/** Hijos que cambian de tramo de edad el año siguiente (afecta a las deducciones). */
export function transicionesEdad(
  descendientes: Descendiente[],
  anio: number,
): { nombre: string; aviso: string }[] {
  const avisos: { nombre: string; aviso: string }[] = []
  for (const h of descendientes) {
    const edadFin = edadAFinDe(h.fechaNacimiento, anio)
    if (edadFin === 2) avisos.push({ nombre: h.nombre, aviso: `cumple 3 años pronto: ${anio + (esMenor3(h.fechaNacimiento, anio + 1) ? 1 : 0)} es el último con maternidad/incremento por menor de 3.` })
    if (edadFin === 24) avisos.push({ nombre: h.nombre, aviso: 'cumple 25 años pronto: dejará de dar derecho al mínimo por descendiente.' })
  }
  return avisos
}

// ── Comparativa conjunta vs separada ────────────────────────────────────────

export type ComparativaDeclaracion = {
  conjunta: { base: number; cuota: number; resultado: number }
  separada: {
    titular: { base: number; cuota: number; resultado: number }
    conyuge: { base: number; cuota: number; resultado: number }
    total: number
  }
  ahorroConjunta: number // positivo = conviene conjunta; negativo = conviene separada
  recomendacion: 'conjunta' | 'separada'
}

/**
 * Compara si conviene declaración conjunta o separada.
 * Para la conjunta: suma las bases, aplica reducción €3.400, usa deducciones comunes.
 * Para la separada: cada cónyuge con su propia base e mínimo individual (los mínimos por
 * descendientes se quedan íntegros en el titular — orientativo; en separada real van 50/50).
 *
 * ⚠️ `baseTitular` debe llegar SIN la reducción por tributación conjunta: esta función la
 * aplica ella misma (solo en la rama conjunta). `retencionesTitular` son las retenciones
 * REALES ya pagadas — NO se estiman aquí: solo la correduría lleva retención del 15 %, y
 * estimarla sobre toda la base (que incluye capital inmobiliario sin retención) inventaba
 * miles de euros de pagos a cuenta y hacía salir "a devolver" ambas modalidades.
 */
export function compararDeclaracion(
  baseTitular: number,
  retencionesTitular: number,
  rendimientoNetoConyuge: number,
  retencionesConyuge: number,
  perfil: PerfilFiscal,
  descendientes: Descendiente[],
  anio: number,
  imp: ImportesAnio = importesDe(anio),
): ComparativaDeclaracion {
  const reduccionConjunta = 3400
  const baseConjunta = Math.max(0, baseTitular + rendimientoNetoConyuge - reduccionConjunta)
  const retAlberto = Math.max(0, retencionesTitular)
  const minConjunto = minimoPersonalYFamiliar(perfil, descendientes, anio, imp)
  const cuotaConjunta = Math.max(0, cuotaTarifa(baseConjunta, imp.tramos) - cuotaTarifa(minConjunto, imp.tramos))
  const deduccionesConj = calcularDeducciones(perfil, descendientes, anio, imp, baseConjunta)
  const dedNoReemb = deduccionesConj.filter(d => !d.reembolsable).reduce((s, d) => s + d.importe, 0)
  const dedReemb = deduccionesConj.filter(d => d.reembolsable).reduce((s, d) => s + d.importe, 0)
  const cuotaLiqConjunta = Math.max(0, cuotaConjunta - dedNoReemb)
  const resultadoConjunta = cuotaLiqConjunta - retAlberto - retencionesConyuge - dedReemb

  // Separada — Alberto
  const perfilSep: PerfilFiscal = { ...perfil, declaracionConjunta: false }
  const minAlb = minimoPersonalYFamiliar(perfilSep, descendientes, anio, imp)
  const cuotaAlb = Math.max(0, cuotaTarifa(Math.max(0, baseTitular), imp.tramos) - cuotaTarifa(minAlb, imp.tramos))
  const dedAlb = calcularDeducciones(perfilSep, descendientes, anio, imp, Math.max(0, baseTitular))
  const dedAlbNoReemb = dedAlb.filter(d => !d.reembolsable).reduce((s, d) => s + d.importe, 0)
  const dedAlbReemb = dedAlb.filter(d => d.reembolsable).reduce((s, d) => s + d.importe, 0)
  const cuotaLiqAlb = Math.max(0, cuotaAlb - dedAlbNoReemb)
  const resultadoAlb = cuotaLiqAlb - retAlberto - dedAlbReemb

  // Separada — Pilar (mínimo individual, sin descendientes si ya los aplica Alberto)
  const minPilar = imp.minimoContribuyente
  const cuotaPilar = Math.max(0, cuotaTarifa(Math.max(0, rendimientoNetoConyuge), imp.tramos) - cuotaTarifa(minPilar, imp.tramos))
  const resultadoPilar = cuotaPilar - retencionesConyuge

  const totalSeparada = resultadoAlb + resultadoPilar
  const ahorroConjunta = totalSeparada - resultadoConjunta // positivo = conjunta ahorra

  return {
    conjunta: { base: baseConjunta, cuota: cuotaLiqConjunta, resultado: resultadoConjunta },
    separada: {
      titular: { base: baseTitular, cuota: cuotaLiqAlb, resultado: resultadoAlb },
      conyuge: { base: rendimientoNetoConyuge, cuota: cuotaPilar, resultado: resultadoPilar },
      total: totalSeparada,
    },
    ahorroConjunta,
    recomendacion: ahorroConjunta >= 0 ? 'conjunta' : 'separada',
  }
}

// ── Calendario fiscal (plazos clave) ─────────────────────────────────────────
export const PLAZOS_FISCALES = [
  { clave: 'renta', etiqueta: 'Campaña de la Renta (IRPF)', ventana: 'Abr–Jun', detalle: 'Presentación de la declaración anual' },
  { clave: 'm130_q', etiqueta: 'Modelo 130 — pago fraccionado IRPF', ventana: 'Trimestral (día 20)', detalle: 'Actividad económica (autónoma)' },
  { clave: 'm303_q', etiqueta: 'Modelo 303 — IVA', ventana: 'Trimestral (día 20)', detalle: 'Autoliquidación de IVA' },
  // Modelo 179 eliminado (02/07/2026): lo presentan las plataformas intermediarias (Booking/Airbnb),
  // no el propietario/cedente. Nuestra obligación es declarar los rendimientos en el IRPF.
  { clave: 'm140', etiqueta: 'Modelo 140 — Maternidad anticipada', ventana: 'Cualquier momento', detalle: 'Cobro anticipado de 100 €/mes por hijo < 3' },
] as const
