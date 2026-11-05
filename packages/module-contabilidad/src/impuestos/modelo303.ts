// Modelo 303 (autoliquidación trimestral de IVA, régimen general) y 390 (resumen anual). PURO, BORRADOR REVISABLE.
//
// MAPEO casilla → origen (ejercicio 2024-2026; certeza 'alta' = recordada con seguridad; 'media' = a contrastar con el formulario vigente):
//   DEVENGADO (operaciones EMITIDAS, clase interior, tipos 4/10/21)
//     01 base · 02 tipo · 03 cuota  → emitidas al 4 %          (alta)
//     04 base · 05 tipo · 06 cuota  → emitidas al 10 %         (alta)
//     07 base · 08 tipo · 09 cuota  → emitidas al 21 %         (alta)
//     10 base · 11 cuota            → adquisiciones intracomunitarias de bienes y servicios (RECIBIDAS intracom_*), autorrepercutidas (alta)
//     12 base · 13 cuota            → otras operaciones con inversión del sujeto pasivo (RECIBIDAS isp), autorrepercutidas (alta)
//     27 total cuota devengada      = 03+06+09+11+13 (+ 15, 18, 21, 24, 26 que aquí son 0: modificaciones y recargo NO soportados) (alta)
//   DEDUCIBLE (RECIBIDAS con IVA deducible)
//     28 base · 29 cuota  → interiores corrientes (clase interior e isp, sin bien de inversión)    (alta)
//     30 base · 31 cuota  → interiores, bienes de inversión                                         (alta)
//     32 base · 33 cuota  → importaciones, corrientes                                               (alta)
//     34 base · 35 cuota  → importaciones, bienes de inversión                                      (alta)
//     36 base · 37 cuota  → adquisiciones intracomunitarias, corrientes                             (alta)
//     38 base · 39 cuota  → adquisiciones intracomunitarias, bienes de inversión                    (alta)
//     45 total a deducir  = 29+31+33+35+37+39 (+ 41, 42, 43, 44 = 0: rectificaciones/regularizaciones NO soportadas) (alta)
//   RESULTADO
//     46 resultado régimen general = 27 − 45                                                        (alta)
//     64 suma de resultados = 46 (no hay otros regímenes)                                            (media)
//     65 % atribuible a la Administración del Estado = 100 (sin foral)                                (media)
//     66 atribuible a la Administración del Estado = 64 × 65 %                                        (media)
//     68 cuotas a compensar de periodos anteriores aplicadas                                          (media)
//     71 resultado de la liquidación = 66 − 68                                                        (media)
//   Casillas 14-15 (modificación de bases/cuotas), 16-26 (recargo de equivalencia), 41-44, 47-63 (información adicional), 67, 69-70 NO se
//   generan: el modelo se marca «no soportado» si el caso aparece. Las exentas/exportaciones se listan como INFORMATIVAS sin número de casilla.
//
// Fuentes (sede AEAT no accesible desde el entorno; contrastar con el asesor): https://sede.agenciatributaria.gob.es (modelo 303, «Instrucciones
// de cumplimentación»), Ley 37/1992 del IVA (arts. 92-114 deducciones), RD 1624/1992.
//
// «No se calcula mal»: prorrata, recargo de equivalencia, régimen simplificado/REAGP/REBU/criterio de caja, tipos distintos de 4/10/21/0 y
// operaciones de importación con IVA diferido NO se soportan → `noSoportado` con el motivo, `resultado` null y sin posibilidad de revisarlo.
import { porcentajeDe } from '../partida/dinero.ts'
import { casilla, enRango, rangoDeModelo, sumar, DISENO_OFICIAL_PENDIENTE, validarEjercicio, importeDe, type CalculoModelo, type Casilla, type PeriodoModelo } from './comun.ts'
import { problemasOperacion, type OperacionIva } from './operaciones.ts'

export type ParametrosModelo303 = {
  anio: number
  trimestre: 1 | 2 | 3 | 4
  /**
   * Régimen de IVA de la empresa (`empresas.regimen_iva`). `null` = no se sabe (se avisa: se asume general); distinto de 'general' = NO soportado.
   */
  regimenIva: string | null
  /** Casilla 68: cuotas a compensar de periodos anteriores que se aplican (≥ 0, céntimos). */
  compensarAnteriores?: number
}

const TIPOS_GENERAL = [4, 10, 21] as const

type Acum = { base: number; cuota: number; refs: string[] }
const nuevo = (): Acum => ({ base: 0, cuota: 0, refs: [] })
const suma = (a: Acum, o: OperacionIva) => { a.base += o.base; a.cuota += o.cuota; a.refs.push(o.ref) }

export function calcularModelo303(ops: readonly OperacionIva[], p: ParametrosModelo303): CalculoModelo {
  validarEjercicio(p.anio)
  const periodo = `${p.trimestre}T` as PeriodoModelo
  const rango = rangoDeModelo(p.anio, periodo)
  const noSoportado: string[] = []
  const avisos: string[] = []
  const excluidas: { ref: string; motivo: string }[] = []

  const reg = (p.regimenIva ?? '').trim().toLowerCase()
  if (p.regimenIva === null || reg === '') avisos.push('Régimen de IVA de la empresa sin declarar: se asume el régimen general. Confírmalo antes de revisar.')
  else if (reg !== 'general') noSoportado.push(`Régimen de IVA «${p.regimenIva}» no soportado (solo régimen general)`)

  const devengado = { 4: nuevo(), 10: nuevo(), 21: nuevo() }
  const intracomDev = nuevo()
  const ispDev = nuevo()
  const ded = { interior: nuevo(), interiorInv: nuevo(), imp: nuevo(), impInv: nuevo(), intra: nuevo(), intraInv: nuevo() }
  const informativas = { exentas: nuevo(), exportaciones: nuevo(), noSujetas: nuevo(), noDeducible: nuevo() }

  for (const o of ops) {
    if (!enRango(o.fecha, rango)) continue
    const pr = problemasOperacion(o)
    if (pr.length) { excluidas.push({ ref: String(o.ref), motivo: pr.join('; ') }); continue }
    if (o.regimen) { noSoportado.push(`${o.ref}: régimen especial «${o.regimen}» no soportado`); excluidas.push({ ref: o.ref, motivo: `régimen ${o.regimen} no soportado` }); continue }
    const est = o.tipoIva === 4 || o.tipoIva === 10 || o.tipoIva === 21 || o.tipoIva === 0
    if (!est && o.clase !== 'exenta' && o.clase !== 'no_sujeta' && o.clase !== 'exportacion') {
      noSoportado.push(`${o.ref}: tipo de IVA ${o.tipoIva} % no soportado (solo 21/10/4/0)`)
      excluidas.push({ ref: o.ref, motivo: `tipo ${o.tipoIva} % no soportado` })
      continue
    }
    if (o.sentido === 'emitida') {
      switch (o.clase) {
        case 'interior':
          if (o.tipoIva === 0) { if (o.cuota !== 0) { noSoportado.push(`${o.ref}: tipo 0 con cuota`); excluidas.push({ ref: o.ref, motivo: 'tipo 0 con cuota' }) } else suma(informativas.exentas, o); break }
          suma(devengado[o.tipoIva as 4 | 10 | 21], o); break
        case 'exenta': suma(informativas.exentas, o); break
        case 'exportacion': suma(informativas.exportaciones, o); break
        case 'no_sujeta': suma(informativas.noSujetas, o); break
        case 'intracom_bienes':
        case 'intracom_servicios': suma(informativas.exentas, o); break // entregas intracomunitarias exentas (van al 349)
        case 'isp':
        case 'importacion':
          noSoportado.push(`${o.ref}: operación emitida de clase «${o.clase}» no soportada en el 303`)
          excluidas.push({ ref: o.ref, motivo: `emitida ${o.clase} no soportada` })
          break
      }
      continue
    }
    // Recibidas
    if (o.deducible === false) { suma(informativas.noDeducible, o); if (o.clase !== 'isp' && o.clase !== 'intracom_bienes' && o.clase !== 'intracom_servicios') continue }
    const inv = o.bienInversion === true
    switch (o.clase) {
      case 'interior': suma(inv ? ded.interiorInv : ded.interior, o); break
      case 'isp': suma(ispDev, o); if (o.deducible !== false) suma(ded.interior, o); break
      case 'intracom_bienes':
      case 'intracom_servicios': suma(intracomDev, o); if (o.deducible !== false) suma(inv ? ded.intraInv : ded.intra, o); break
      case 'importacion': suma(inv ? ded.impInv : ded.imp, o); break
      case 'exenta':
      case 'no_sujeta':
      case 'exportacion': suma(informativas.noSujetas, o); break
    }
  }
  if (ded.imp.refs.length || ded.impInv.refs.length) avisos.push('Hay importaciones: se asume IVA pagado en aduana (casillas 32-35). Si lo difieres en el 303 (DIVA), no está soportado.')

  const cs: Casilla[] = []
  const filaGeneral = (n1: string, n2: string, n3: string, tipo: 4 | 10 | 21) => {
    const a = devengado[tipo]
    cs.push(casilla(n1, `Base imponible al ${tipo} % (régimen general)`, a.base, a.refs))
    cs.push(casilla(n2, `Tipo ${tipo} %`, tipo, [], 'alta', 'porcentaje'))
    cs.push(casilla(n3, `Cuota devengada al ${tipo} %`, a.cuota, a.refs))
  }
  filaGeneral('01', '02', '03', 4)
  filaGeneral('04', '05', '06', 10)
  filaGeneral('07', '08', '09', 21)
  cs.push(casilla('10', 'Adquisiciones intracomunitarias de bienes y servicios: base', intracomDev.base, intracomDev.refs))
  cs.push(casilla('11', 'Adquisiciones intracomunitarias de bienes y servicios: cuota', intracomDev.cuota, intracomDev.refs))
  cs.push(casilla('12', 'Otras operaciones con inversión del sujeto pasivo: base', ispDev.base, ispDev.refs))
  cs.push(casilla('13', 'Otras operaciones con inversión del sujeto pasivo: cuota', ispDev.cuota, ispDev.refs))
  const dev = devengado[4].cuota + devengado[10].cuota + devengado[21].cuota + intracomDev.cuota + ispDev.cuota
  cs.push(casilla('27', 'Total cuota devengada', dev, [...devengado[4].refs, ...devengado[10].refs, ...devengado[21].refs, ...intracomDev.refs, ...ispDev.refs]))

  const par = (nb: string, nc: string, etiqueta: string, a: Acum) => {
    cs.push(casilla(nb, `${etiqueta}: base`, a.base, a.refs))
    cs.push(casilla(nc, `${etiqueta}: cuota soportada deducible`, a.cuota, a.refs))
  }
  par('28', '29', 'Operaciones interiores corrientes', ded.interior)
  par('30', '31', 'Operaciones interiores, bienes de inversión', ded.interiorInv)
  par('32', '33', 'Importaciones de bienes corrientes', ded.imp)
  par('34', '35', 'Importaciones de bienes de inversión', ded.impInv)
  par('36', '37', 'Adquisiciones intracomunitarias de bienes corrientes', ded.intra)
  par('38', '39', 'Adquisiciones intracomunitarias de bienes de inversión', ded.intraInv)
  const todas = [ded.interior, ded.interiorInv, ded.imp, ded.impInv, ded.intra, ded.intraInv]
  const aDeducir = sumar(todas.map((a) => a.cuota))
  cs.push(casilla('45', 'Total a deducir', aDeducir, todas.flatMap((a) => a.refs)))
  const r46 = dev - aDeducir
  cs.push(casilla('46', 'Resultado régimen general (27 − 45)', r46, cs.filter((c) => c.casilla === '27' || c.casilla === '45').flatMap((c) => c.origen)))
  cs.push(casilla('64', 'Suma de resultados', r46, [], 'media'))
  cs.push(casilla('65', '% atribuible a la Administración del Estado', 100, [], 'media', 'porcentaje'))
  const r66 = porcentajeDe(r46, 100)
  cs.push(casilla('66', 'Atribuible a la Administración del Estado', r66, [], 'media'))
  const comp = p.compensarAnteriores ?? 0
  if (!Number.isSafeInteger(comp) || comp < 0) throw new RangeError('compensarAnteriores debe ser un entero ≥ 0 en céntimos')
  if (comp > 0 && r66 <= 0) avisos.push('Se pide compensar cuotas de periodos anteriores pero el resultado no es a ingresar: no se aplica')
  const aplicada = r66 > 0 ? Math.min(comp, r66) : 0
  cs.push(casilla('68', 'Cuotas a compensar de periodos anteriores aplicadas en este periodo', aplicada, [], 'media'))
  const r71 = r66 - aplicada
  cs.push(casilla('71', 'Resultado de la liquidación', r71, [], 'media'))

  const info = (clave: string, a: Acum, d: string) => { if (a.refs.length) avisos.push(`Información (sin casilla asignada): ${d} ${a.base} céntimos de base (${a.refs.length} operación/es) — ${clave}`) }
  info('exentas', informativas.exentas, 'operaciones exentas / entregas intracomunitarias:')
  info('exportaciones', informativas.exportaciones, 'exportaciones:')
  info('no sujetas', informativas.noSujetas, 'operaciones no sujetas:')
  if (informativas.noDeducible.refs.length) avisos.push(`${informativas.noDeducible.refs.length} operación/es con IVA no deducible: fuera de las casillas 28-45`)

  const bloqueado = noSoportado.length > 0
  return {
    modelo: '303', anio: p.anio, periodo, casillas: cs,
    resultado: bloqueado ? null : r71,
    noSoportado: [...new Set(noSoportado)], avisos, excluidas,
    ficheroOficial: DISENO_OFICIAL_PENDIENTE,
  }
}

/** Qué hacer con el resultado: a ingresar, a compensar (negativo) o sin actividad. En el 4T, el negativo también puede pedirse en devolución. */
export function tipoResultado303(c: CalculoModelo): 'a_ingresar' | 'a_compensar' | 'cero' | 'no_calculable' {
  if (c.resultado === null) return 'no_calculable'
  return c.resultado > 0 ? 'a_ingresar' : c.resultado < 0 ? 'a_compensar' : 'cero'
}

// ── 390 ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export type Modelo390 = CalculoModelo & {
  /** Los cuatro 303 del ejercicio (de donde sale cada cifra). */
  trimestres: CalculoModelo[]
  /** Volumen anual de operaciones (bases emitidas + exentas), informativo. */
  volumenOperaciones: number
}

/**
 * Resumen anual: suma casilla a casilla de los cuatro 303 (las casillas llevan la numeración del 303 de origen; la del 390 se contrastará).
 * [Probable] Hay indicios de que el 390 deja de existir desde el ejercicio 2025 (se integraría en el 303 del 4T): contrastar con el asesor.
 * Las cuotas a compensar entre trimestres (casilla 68) no se encadenan aquí: cada trimestre se calcula con lo que se le pasó.
 */
export function calcularModelo390(ops: readonly OperacionIva[], p: { anio: number; regimenIva: string | null; compensarPorTrimestre?: readonly number[] }): Modelo390 {
  validarEjercicio(p.anio)
  const trimestres = ([1, 2, 3, 4] as const).map((t) => calcularModelo303(ops, { anio: p.anio, trimestre: t, regimenIva: p.regimenIva, compensarAnteriores: p.compensarPorTrimestre?.[t - 1] ?? 0 }))
  const por = new Map<string, Casilla>()
  for (const c of trimestres.flatMap((t) => t.casillas)) {
    const x = por.get(c.casilla)
    if (!x) { por.set(c.casilla, { ...c, origen: [...c.origen] }); continue }
    if (c.tipo === 'porcentaje') continue
    x.importe += c.importe
    x.origen = [...new Set([...x.origen, ...c.origen])].sort()
  }
  // Las casillas «derivadas» se recalculan del total anual (no se suman los porcentajes ni se arrastra el 65).
  const anual = [...por.values()].filter((c) => !['64', '65', '66', '68', '71'].includes(c.casilla))
  const res46 = anual.find((c) => c.casilla === '46')?.importe ?? 0
  const noSoportado = [...new Set(trimestres.flatMap((t) => t.noSoportado))]
  const comp = trimestres.reduce((t, x) => t + importeDe(x, '68'), 0)
  anual.push(casilla('68', 'Cuotas compensadas en el año (suma de los 303)', comp, [], 'media'))
  const resultado = noSoportado.length ? null : trimestres.reduce((t, x) => t + (x.resultado ?? 0), 0)
  const volumen = trimestres.reduce((t, x) => t + importeDe(x, '01') + importeDe(x, '04') + importeDe(x, '07'), 0)
  return {
    modelo: '390', anio: p.anio, periodo: '0A',
    casillas: [...anual, casilla('46A', 'Resultado anual régimen general (suma de 46 trimestrales)', res46, [], 'alta')],
    resultado, noSoportado,
    avisos: [...new Set([...trimestres.flatMap((t) => t.avisos), '[Probable] El 390 podría haber sido suprimido desde el ejercicio 2025 (integrado en el 303 del 4T): confirma con el asesor si hay que presentarlo.'])],
    excluidas: trimestres.flatMap((t) => t.excluidas),
    ficheroOficial: DISENO_OFICIAL_PENDIENTE,
    trimestres, volumenOperaciones: volumen,
  }
}
