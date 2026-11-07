/**
 * IRPF — retención por el procedimiento general del Reglamento (RIRPF arts. 82-86). Puro, en CÉNTIMOS y ppm, por año.
 * Fuente: RIRPF y LIRPF consolidados del BOE (ver tablas/irpf-2026.ts). Orden de operaciones (art. 82):
 *   1. RA    = cuantía total de retribuciones previsibles del año (art. 83.2; sin atrasos de ejercicios anteriores).
 *   2. RNr   = max(0, RA − cotizaciones del trabajador)                       (art. 83.3.b; base de la reducción, art. 20 LIRPF).
 *   3. red   = reducción art. 83.3.d) según RNr, con tope RNr.
 *   4. gast  = min(2.000 [+3.500/7.750 discapacidad], RNr)                     (art. 83.3.c y art. 19.2.f LIRPF).
 *   5. base  = max(0, RNr − gast − red − 600 € si > 2 descendientes − pensión compensatoria)  (art. 83.3.e-f).
 *   6. mín   = mínimo personal y familiar (art. 84; arts. 57-61 LIRPF; descendientes por mitad salvo derecho exclusivo).
 *   7. cuota = max(0, esc(base) − esc(mín)) [art. 85.1]; con anualidades por alimentos < base: esc(anual.) + esc(base − anual.)
 *              − esc(mín + 1.980) [art. 85.2]. Si base − mín ≤ 0 → tipo 0 (art. 86.1).
 *   8. límite art. 85.3: si RA ≤ 35.200 €, cuota ≤ 43 % × (RA − límite excluyente del art. 81 de su situación).
 *   9. tipo  = cuota / RA con 2 decimales (art. 86.1); −2 puntos por hipoteca si RA < 33.007,2 € (art. 86.1);
 *              mínimo 2 % en contratos de duración inferior al año (art. 86.2).
 *  10. límite excluyente (art. 81.1): RA ≤ límite → 0 %, SALVO cuando corresponde el tipo mínimo del art. 86.2 (art. 81.3).
 *  Sin modelo 145 (`situacion === null`): art. 88.2 → mismo cálculo SIN circunstancias personales ni familiares
 *  (mínimo personal 5.550 €, situación 3.ª, sin descendientes, sin discapacidad, sin pensión ni hipoteca).
 *  La deducción DA 61.ª LIRPF (rentas ≤ 20.048,45 €) va a la cuota líquida de la declaración, no a la retención: solo aviso.
 *
 * Fail-closed: cifra con `valor: null` → CifraDesconocidaError (salvo el límite excluyente: se omite y queda PENDIENTE);
 * cifra/regla PENDIENTE_VERIFICAR → en modo «calculo» LANZA CifraPendienteError, en «simulacion» se lista.
 */
import { CifraDesconocidaError, CifraPendienteError, PENDIENTE_VERIFICAR, type Cifra } from './cifras'
import { aplicarTipo, cocienteATipo, esCentimos, type Centimos, type Ppm } from './dinero'
import { edadA31Dic, type SituacionFamiliar } from './situacion-familiar'
import { tablaIrpfDelAño, type TablaIrpf } from './tablas'

export type ModoIrpf = 'calculo' | 'simulacion'

/**
 * Reglas del IRPF que este módulo NO resuelve bien aún: en modo cálculo bloquean si se activan.
 * Cerradas el 07/11/2026 con el BOE: sin 145 (art. 88.2 RIRPF), anualidades por alimentos (art. 85.2), deducción SMI
 * (DA 61.ª LIRPF: no afecta a la retención), atrasos de ejercicios anteriores (art. 80.1.5.º: 15 %, ver atrasos.ts).
 */
export const REGLAS_IRPF_PENDIENTES = {
  embargo_paga_extra: 'Embargo en el mes de paga extra: criterio de cómputo (SMI por percepción) no contrastado',
} as const

export interface EntradaIrpf {
  /** Retribución anual previsible (céntimos). */
  retribucionAnual: Centimos
  /** Cotizaciones anuales del trabajador (CC + desempleo + FP + MEI), céntimos. */
  cotizacionesAnual: Centimos
  /** Modelo 145 vigente; null = no comunicado. */
  situacion: SituacionFamiliar | null
  /** Contrato o relación de duración inferior a un año (tipo mínimo 2 %). */
  duracionInferiorAño?: boolean
}

export interface OpcionesIrpf {
  año: number
  modo: ModoIrpf
  /** Para tests: tabla explícita. Por defecto, la del año (o error). */
  tabla?: TablaIrpf
}

export type MotivoTipoIrpf = 'algoritmo' | 'sin_145_sin_circunstancias' | 'minimo_exento' | 'sin_retribucion'

export interface DetalleIrpf {
  año: number
  motivo: MotivoTipoIrpf
  retribucionAnual: Centimos
  cotizacionesAnual: Centimos
  /** Cotizaciones + otros gastos del art. 19.2.f) ya limitados. */
  gastos: Centimos
  /** RA − gastos (art. 19 LIRPF). */
  rendimientoNeto: Centimos
  /** RA − cotizaciones: el rendimiento sobre el que se calcula la reducción (art. 20 LIRPF último párr.; art. 83.3.d). */
  rendimientoNetoReduccion: Centimos
  reduccionTrabajo: Centimos
  /** 600 € por más de dos descendientes (art. 83.3.e). */
  reduccionDescendientes: Centimos
  pensionCompensatoria: Centimos
  baseTipo: Centimos
  minimoPersonalFamiliar: Centimos
  cuota1: Centimos
  cuota2: Centimos
  /** Cuota anual de retención tras el límite del art. 85.3 (antes de los ajustes del tipo). */
  cuota: Centimos
  /** Tipo final en ppm (2 decimales de %: múltiplo de 100). */
  tipoPpm: Ppm
  cifrasPendientes: string[]
  avisos: string[]
}

type Usar = <T>(c: Cifra<T>) => T

function aplicarEscala(base: Centimos, tramos: { hasta: Centimos | null; tipo: Ppm }[]): Centimos {
  let desde = 0
  let numerador = 0
  for (const t of tramos) {
    const techo = t.hasta ?? Infinity
    if (base > desde) numerador += (Math.min(base, techo) - desde) * t.tipo
    desde = techo
    if (base <= techo) break
  }
  return Math.round(numerador / 1_000_000)
}

function reduccionArt20(rn: Centimos, tabla: TablaIrpf, usar: Usar): Centimos {
  const r = tabla.reduccionTrabajo
  if (rn <= usar(r.umbral1)) return usar(r.reduccionMax)
  if (rn <= usar(r.umbral2)) return usar(r.reduccionMax) - aplicarTipo(rn - usar(r.umbral1), usar(r.factor1))
  if (rn <= usar(r.umbral3)) return usar(r.reduccionUmbral2) - aplicarTipo(rn - usar(r.umbral2), usar(r.factor2))
  return 0
}

/** Art. 60 LIRPF: 3.000/9.000 € + 3.000 € de asistencia si necesita ayuda de terceros, movilidad reducida O grado ≥ 65 %. */
function minimoDiscapacidad(grado: SituacionFamiliar['discapacidad'], asistencia: boolean | undefined, m: TablaIrpf['minimos'], usar: Usar): Centimos {
  let x = 0
  if (grado === '33') x += usar(m.discapacidad33)
  else if (grado === '65') x += usar(m.discapacidad65)
  if (asistencia || grado === '65') x += usar(m.asistencia)
  return x
}

/** Mínimo personal y familiar a efectos del tipo (art. 84 RIRPF) con los datos del modelo 145. */
export function minimoPersonalYFamiliar(s: SituacionFamiliar, año: number, tabla: TablaIrpf, usar: Usar): Centimos {
  const m = tabla.minimos
  const edad = edadA31Dic(s.fechaNacimientoContribuyente, año)
  let total = usar(m.personal)
  if (edad > 65) total += usar(m.mayor65)
  if (edad > 75) total += usar(m.mayor75)
  total += minimoDiscapacidad(s.discapacidad, s.necesitaAsistencia, m, usar)

  const desc = descendientesConMinimo(s, año).sort((a, b) => a.fechaNacimiento.localeCompare(b.fechaNacimiento))
  desc.forEach((d, i) => {
    let x = usar(m.descendientes[Math.min(i, 3)])
    if (edadA31Dic(d.fechaNacimiento, año) < 3) x += usar(m.descendienteMenor3)
    x += minimoDiscapacidad(d.discapacidad, d.necesitaAsistencia, m, usar)
    total += d.porEntero ? x : Math.round(x / 2)
  })

  for (const a of s.ascendientes) {
    const e = edadA31Dic(a.fechaNacimiento, año)
    if (a.rentasMayores8000 || !a.convive || !(e > 65 || a.discapacidad !== 'ninguna')) continue
    let x = usar(m.ascendiente)
    if (e > 75) x += usar(m.ascendienteMayor75)
    x += minimoDiscapacidad(a.discapacidad, a.necesitaAsistencia, m, usar)
    total += a.porEntero ? x : Math.round(x / 2)
  }
  return total
}

/** Descendientes con derecho al mínimo (art. 58 LIRPF): < 25 años o con discapacidad, sin rentas > 8.000 €. */
function descendientesConMinimo(s: SituacionFamiliar, año: number) {
  return s.descendientes.filter(d => !d.rentasMayores8000 && (edadA31Dic(d.fechaNacimiento, año) < 25 || d.discapacidad !== 'ninguna'))
}

/**
 * Clave del cuadro del art. 81.1: `${situación}:${hijos}` con hijos 0, 1 ó 2 («2 o más»). La situación 1.ª exige
 * descendientes (monoparental); sin ellos el contribuyente está en la 3.ª (art. 81.1, 3.ª b-c).
 */
function claveExento(s: SituacionFamiliar | null, año: number): { clave: string; reclasificada: boolean } {
  if (s === null) return { clave: '3:0', reclasificada: false }
  const n = descendientesConMinimo(s, año).length
  const hijos = n >= 2 ? 2 : n
  if (s.situacion === 1 && hijos === 0) return { clave: '3:0', reclasificada: true }
  return { clave: `${s.situacion}:${hijos}`, reclasificada: false }
}

export function calcularTipoIrpf(e: EntradaIrpf, opts: OpcionesIrpf): DetalleIrpf {
  if (!esCentimos(e.retribucionAnual) || e.retribucionAnual < 0) throw new Error('retribucionAnual debe ser céntimos enteros ≥ 0')
  if (!esCentimos(e.cotizacionesAnual) || e.cotizacionesAnual < 0) throw new Error('cotizacionesAnual debe ser céntimos enteros ≥ 0')
  const tabla = opts.tabla ?? tablaIrpfDelAño(opts.año)
  if (tabla.año !== opts.año) throw new Error(`Tabla IRPF de ${tabla.año} para un cálculo de ${opts.año}`)

  const pend = new Set<string>()
  const usar: Usar = c => {
    if (c.valor === null) throw new CifraDesconocidaError(c.clave)
    if (c.certeza === PENDIENTE_VERIFICAR) pend.add(c.clave)
    return c.valor
  }
  const avisos: string[] = []
  const RA = e.retribucionAnual
  const cerrar = (d: Omit<DetalleIrpf, 'cifrasPendientes' | 'avisos' | 'año' | 'retribucionAnual' | 'cotizacionesAnual'>): DetalleIrpf => {
    const cifrasPendientes = [...pend].sort()
    if (opts.modo === 'calculo' && cifrasPendientes.length) throw new CifraPendienteError(cifrasPendientes)
    return { año: opts.año, retribucionAnual: RA, cotizacionesAnual: e.cotizacionesAnual, ...d, cifrasPendientes, avisos }
  }

  if (RA === 0) {
    return cerrar({ motivo: 'sin_retribucion', gastos: 0, rendimientoNeto: 0, rendimientoNetoReduccion: 0, reduccionTrabajo: 0, reduccionDescendientes: 0,
      pensionCompensatoria: 0, baseTipo: 0, minimoPersonalFamiliar: 0, cuota1: 0, cuota2: 0, cuota: 0, tipoPpm: 0 })
  }

  // Art. 88.2: sin comunicación, el tipo se calcula SIN las circunstancias personales y familiares.
  const s = e.situacion
  if (s === null) avisos.push('sin_modelo_145_sin_circunstancias')

  const rnRed = Math.max(0, RA - e.cotizacionesAnual)
  const red = Math.min(rnRed, reduccionArt20(rnRed, tabla, usar))
  const gastosDisc = s === null ? 0 : s.necesitaAsistencia || s.discapacidad === '65' ? usar(tabla.gastos.discapacidad65) : s.discapacidad === '33' ? usar(tabla.gastos.discapacidad33) : 0
  const gastosF = Math.min(rnRed, usar(tabla.gastos.otros) + gastosDisc)
  const redDesc = s !== null && descendientesConMinimo(s, opts.año).length > 2 ? usar(tabla.reduccionMasDeDosDescendientes) : 0
  const pension = s?.pensionCompensatoriaAnual ?? 0
  const base = Math.max(0, rnRed - gastosF - red - redDesc - pension)
  const minimo = s === null ? usar(tabla.minimos.personal) : minimoPersonalYFamiliar(s, opts.año, tabla, usar)

  const escala = tabla.escala.map(t => ({ hasta: t.hasta === null ? null : usar(t.hasta), tipo: usar(t.tipo) }))
  const anualidades = s?.anualidadesAlimentosAnual ?? 0
  let cuota1: Centimos
  let cuota2: Centimos
  if (anualidades > 0 && anualidades < base) {
    // Art. 85.2: escala por separado a las anualidades y al resto; mínimo incrementado en 1.980 €.
    cuota1 = aplicarEscala(anualidades, escala) + aplicarEscala(base - anualidades, escala)
    cuota2 = aplicarEscala(minimo + usar(tabla.anualidadesIncrementoMinimo), escala)
    avisos.push('anualidades_alimentos_art_85_2')
  } else {
    if (anualidades > 0) avisos.push('anualidades_alimentos_no_inferiores_a_la_base')
    cuota1 = aplicarEscala(base, escala)
    cuota2 = aplicarEscala(minimo, escala)
  }
  let cuota = base - minimo <= 0 ? 0 : Math.max(0, cuota1 - cuota2)

  const { clave, reclasificada } = claveExento(s, opts.año)
  if (reclasificada) avisos.push('situacion_1_sin_descendientes_como_3')
  const exento = tabla.exento[clave]
  let limiteExento: Centimos | null = null
  if (exento) {
    if (exento.valor === null) { pend.add(exento.clave); avisos.push('minimo_exento_desconocido') }
    else limiteExento = usar(exento)
  }

  // Art. 85.3: solo con RA ≤ 35.200 €; tope = 43 % × (RA − límite excluyente de su situación).
  if (RA <= usar(tabla.limite853.retribucionHasta)) {
    if (limiteExento === null) avisos.push('limite_art_85_3_sin_limite_excluyente')
    else {
      const limite = aplicarTipo(Math.max(0, RA - limiteExento), usar(tabla.limite853.porcentaje))
      if (cuota > limite) { cuota = limite; avisos.push('limite_art_85_3_aplicado') }
    }
  }

  // Art. 86.1: tipo con 2 decimales → ppm múltiplo de 100.
  let tipo: Ppm = cocienteATipo(cuota, RA)
  if (s?.hipotecaViviendaAnterior2013 && RA < usar(tabla.hipotecaAnterior2013.limiteRetribucion)) {
    tipo = Math.max(0, tipo - usar(tabla.hipotecaAnterior2013.reduccionTipo))
    avisos.push('reduccion_hipoteca_anterior_2013')
  }
  let motivo: MotivoTipoIrpf = s === null ? 'sin_145_sin_circunstancias' : 'algoritmo'
  if (e.duracionInferiorAño) {
    // Art. 86.2 + art. 81.3: con tipo mínimo no se aplica el límite excluyente.
    const min = usar(tabla.tipoMinimoContratoCorto)
    if (tipo < min) { tipo = min; avisos.push('tipo_minimo_contrato_corto') }
    if (limiteExento !== null && RA <= limiteExento) avisos.push('limite_excluyente_no_aplica_contrato_corto')
  } else if (limiteExento !== null && RA <= limiteExento) {
    tipo = 0; motivo = 'minimo_exento'; avisos.push('minimo_exento')
  }

  if (RA < usar(tabla.deduccionSmi.retribucionHasta)) avisos.push('deduccion_da61_en_declaracion')

  return cerrar({
    motivo, gastos: e.cotizacionesAnual + gastosF, rendimientoNeto: rnRed - gastosF, rendimientoNetoReduccion: rnRed, reduccionTrabajo: red,
    reduccionDescendientes: redDesc, pensionCompensatoria: pension, baseTipo: base, minimoPersonalFamiliar: minimo, cuota1, cuota2, cuota, tipoPpm: tipo,
  })
}

/**
 * Regularización (arts. 87-88 RIRPF): al cambiar las circunstancias se recalcula la cuota anual y el tipo del resto del
 * año = (cuota anual nueva − retenido ya) / (retribución anual − ya percibida), 2 decimales, mínimo 0.
 */
export function regularizarTipo(p: { cuotaAnual: Centimos; retribucionAnual: Centimos; retribucionPercibida: Centimos; retenidoPracticado: Centimos }): { tipoPpm: Ppm; retribucionRestante: Centimos } {
  for (const [k, v] of Object.entries(p)) if (!esCentimos(v) || v < 0) throw new Error(`${k} debe ser céntimos enteros ≥ 0`)
  const restante = p.retribucionAnual - p.retribucionPercibida
  if (restante <= 0) throw new Error('No queda retribución por pagar: no hay tipo que regularizar')
  const porRetener = Math.max(0, p.cuotaAnual - p.retenidoPracticado)
  return { tipoPpm: cocienteATipo(porRetener, restante), retribucionRestante: restante }
}
