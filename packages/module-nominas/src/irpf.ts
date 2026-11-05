/**
 * IRPF — retención por el algoritmo de la AEAT (Reglamento IRPF arts. 80-89). Puro, en CÉNTIMOS y ppm, por año.
 *
 * Pasos (UNA retención anual → un TIPO que se aplica a cada pago del año; la regularización lo recalcula):
 *   1. RA   = retribución anual previsible (dineraria + especie).
 *   2. RN   = max(0, RA − cotizaciones SS del trabajador − otros gastos 2.000 € [− 3.500/7.750 € discapacidad del trabajador]).
 *   3. red  = reducción art. 20 LIRPF según RN (7.302 € hasta 14.852; 7.302 − 1,75·(RN−14.852) hasta 17.673,52;
 *             2.364,34 − 1,14·(RN−17.673,52) hasta 19.747,50; 0 desde ahí).
 *   4. base = max(0, RN − red − pensión compensatoria al cónyuge).
 *   5. mín  = mínimo personal y familiar (modelo 145; arts. 57-61 LIRPF).
 *   6. cuota = max(0, escala(base) − escala(mín)); escala = art. 85.1 RIRPF, UN solo redondeo por aplicación.
 *   7. límite art. 85.3: cuota ≤ pct × (RA − mín)  (PENDIENTE_VERIFICAR: la base del límite no está contrastada).
 *   8. tipo = cuota / RA con 2 decimales (art. 86.1) → ppm múltiplo de 100.
 *   9. ajustes del tipo: hipoteca vivienda anterior a 2013 (−2 puntos si RA ≤ 33.007,20 €); mínimo 2 % en contratos < 1 año;
 *      mínimo exento (art. 81.1: RA ≤ límite → 0; por encima, la retención no pasa de RA − límite).
 *  Sin modelo 145 (`situacion === null`): tipo MÁXIMO de la tabla (regla del spec, ver abajo) — no se aplica nada de lo anterior.
 *
 * Fail-closed: cifra con `valor: null` → CifraDesconocidaError (salvo el límite excluyente: se omite y queda PENDIENTE);
 * cifra/regla PENDIENTE_VERIFICAR → en modo «calculo» LANZA CifraPendienteError, en «simulacion» se lista.
 */
import { CifraDesconocidaError, CifraPendienteError, PENDIENTE_VERIFICAR, type Cifra } from './cifras'
import { aplicarTipo, cocienteATipo, esCentimos, type Centimos, type Ppm } from './dinero'
import { edadA31Dic, type SituacionFamiliar } from './situacion-familiar'
import { tablaIrpfDelAño, type TablaIrpf } from './tablas'

export type ModoIrpf = 'calculo' | 'simulacion'

/** Reglas del IRPF que este módulo NO resuelve bien aún: en modo cálculo bloquean si se activan. */
export const REGLAS_IRPF_PENDIENTES = {
  irpf_sin_145:
    'Sin modelo 145 se aplica el tipo MÁXIMO (regla del spec, fuente secundaria). Mi lectura del art. 88 RIRPF es que se calcula con el solo mínimo personal: revisar con asesor laboral antes de confirmar',
  irpf_anualidades_alimentos: 'Anualidades por alimentos a hijos (art. 85 RIRPF, escala aparte): no implementado',
  irpf_deduccion_smi: 'Deducción 2026 para rentas ≤ SMI (hasta 590,89 €, decreciente): norma y fórmula sin identificar; no se aplica',
  irpf_atrasos: 'Retención de atrasos de ejercicios anteriores: el tipo (actual vs. del año de devengo) no está contrastado',
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

export type MotivoTipoIrpf = 'algoritmo' | 'sin_145_tipo_maximo' | 'minimo_exento' | 'sin_retribucion'

export interface DetalleIrpf {
  año: number
  motivo: MotivoTipoIrpf
  retribucionAnual: Centimos
  cotizacionesAnual: Centimos
  gastos: Centimos
  rendimientoNeto: Centimos
  reduccionTrabajo: Centimos
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

function minimoDiscapacidad(grado: SituacionFamiliar['discapacidad'], asistencia: boolean | undefined, m: TablaIrpf['minimos'], usar: Usar): Centimos {
  let x = 0
  if (grado === '33') x += usar(m.discapacidad33)
  else if (grado === '65') x += usar(m.discapacidad65)
  if (asistencia) x += usar(m.asistencia)
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

  const desc = s.descendientes
    .filter(d => !d.rentasMayores8000 && (edadA31Dic(d.fechaNacimiento, año) < 25 || d.discapacidad !== 'ninguna'))
    .sort((a, b) => a.fechaNacimiento.localeCompare(b.fechaNacimiento))
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

/** Hijos y otros descendientes que cuentan para la tabla del mínimo exento: 0, 1 ó 2 («2 o más»). */
function hijosParaExento(s: SituacionFamiliar, año: number): 0 | 1 | 2 {
  const n = s.descendientes.filter(d => !d.rentasMayores8000 && (edadA31Dic(d.fechaNacimiento, año) < 25 || d.discapacidad !== 'ninguna')).length
  return n >= 2 ? 2 : (n as 0 | 1)
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
  const vacio = { gastos: 0, rendimientoNeto: 0, reduccionTrabajo: 0, pensionCompensatoria: 0, baseTipo: 0, minimoPersonalFamiliar: 0, cuota1: 0, cuota2: 0 }

  if (RA === 0) return cerrar({ ...vacio, motivo: 'sin_retribucion', cuota: 0, tipoPpm: 0 })

  // Sin modelo 145 → tipo máximo (regla del spec; ver REGLAS_IRPF_PENDIENTES.irpf_sin_145).
  if (e.situacion === null) {
    pend.add('regla:irpf_sin_145')
    avisos.push('sin_modelo_145_tipo_maximo')
    const tipo = usar(tabla.tipoMaximo)
    return cerrar({ ...vacio, motivo: 'sin_145_tipo_maximo', cuota: aplicarTipo(RA, tipo), tipoPpm: tipo })
  }
  const s = e.situacion

  const gastosDisc = s.necesitaAsistencia || s.discapacidad === '65' ? usar(tabla.gastos.discapacidad65) : s.discapacidad === '33' ? usar(tabla.gastos.discapacidad33) : 0
  const gastos = e.cotizacionesAnual + usar(tabla.gastos.otros) + gastosDisc
  const rn = Math.max(0, RA - gastos)
  const red = reduccionArt20(rn, tabla, usar)
  const pension = s.pensionCompensatoriaAnual ?? 0
  const base = Math.max(0, rn - red - pension)
  const minimo = minimoPersonalYFamiliar(s, opts.año, tabla, usar)

  const escala = tabla.escala.map(t => ({ hasta: t.hasta === null ? null : usar(t.hasta), tipo: usar(t.tipo) }))
  const cuota1 = aplicarEscala(base, escala)
  const cuota2 = aplicarEscala(minimo, escala)
  let cuota = Math.max(0, cuota1 - cuota2)
  if ((s.anualidadesAlimentosAnual ?? 0) > 0) pend.add('regla:irpf_anualidades_alimentos')

  // Art. 85.3
  const limite = aplicarTipo(Math.max(0, RA - minimo), usar(tabla.limite853.porcentaje))
  if (cuota > limite) { cuota = limite; avisos.push('limite_art_85_3_aplicado') }

  // Tipo con 2 decimales (art. 86.1): centésimas de % → ppm múltiplo de 100.
  let tipo: Ppm = cocienteATipo(cuota, RA)

  if (s.hipotecaViviendaAnterior2013 && RA <= usar(tabla.hipotecaAnterior2013.limiteRetribucion)) {
    tipo = Math.max(0, tipo - usar(tabla.hipotecaAnterior2013.reduccionTipo))
    avisos.push('reduccion_hipoteca_anterior_2013')
  }
  if (e.duracionInferiorAño) {
    const min = usar(tabla.tipoMinimoContratoCorto)
    if (tipo < min) { tipo = min; avisos.push('tipo_minimo_contrato_corto') }
  }
  if (RA <= usar(tabla.deduccionSmi.retribucionHasta)) pend.add('regla:irpf_deduccion_smi')

  // Mínimo exento (art. 81.1).
  let motivo: MotivoTipoIrpf = 'algoritmo'
  const clave = `${s.situacion}:${hijosParaExento(s, opts.año)}`
  const exento = tabla.exento[clave]
  if (exento) {
    if (exento.valor === null) {
      pend.add(exento.clave)
      avisos.push('minimo_exento_desconocido')
    } else {
      const limiteExento = usar(exento)
      if (RA <= limiteExento) { tipo = 0; motivo = 'minimo_exento'; avisos.push('minimo_exento') }
      else {
        const tope = cocienteATipo(RA - limiteExento, RA, 'abajo')
        if (tipo > tope) { tipo = tope; avisos.push('limite_sobre_minimo_exento') }
      }
    }
  }

  return cerrar({ gastos, rendimientoNeto: rn, reduccionTrabajo: red, pensionCompensatoria: pension, baseTipo: base, minimoPersonalFamiliar: minimo, cuota1, cuota2, motivo, cuota, tipoPpm: tipo })
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
