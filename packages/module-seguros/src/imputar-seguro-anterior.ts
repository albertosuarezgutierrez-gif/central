// Imputar la bonificación del CONDUCTOR al tarificar un vehículo NUEVO (03/10/2026, Alberto).
//
// Antes, auto-nuevo y moto-nuevo cotizaban «de calle» (`aseguradoAntes: false`) con el argumento de
// «vehículo nuevo sin histórico». Ese era el error: el vehículo es nuevo, pero el HISTORIAL es del
// conductor, y ya lo conocemos por sus otras pólizas de auto/moto (las de nuestra cartera y las de la
// competencia leídas de su PDF). Aquí vive la parte PURA:
//
//   1. `elegirSeguroAnteriorParaImputar()` — de todas las pólizas de motor conocidas de ESA ficha,
//      cuál se declara como «seguro anterior». Regla aprobada por Alberto: turismo antes que moto;
//      luego la de efecto más antiguo sin siniestros conocidos. Devuelve la elegida, el porqué y las
//      demás (el corredor puede cambiarla). Por IDENTIDAD (`clienteId`), nunca por nombre: una póliza
//      de otra ficha no entra aunque se llame igual.
//   2. `historialParaImputar()` — los años que se declaran con esa póliza. Lo que no se sabe va al
//      MÁXIMO (dictado de Alberto: la compañía lo contrasta con SINCO por el nº de póliza), y si lo
//      que se ha supuesto es el bonus (`aniosSinSiniestros`), el presupuesto sale marcado
//      `bonusSupuesto: true` → «condicionado a verificación SINCO/certificado».
//   3. `decidirBloqueoBonus()` — al EMITIR, un bonus supuesto sin verificación no se emite (4xx).
//
// Tres estados siempre: `null` = no se sabe, `0`/`[]` = mirado y no hay, valor = dato. Nunca `?? 0`.

import { HISTORIAL_MAXIMO } from './historial-maximo.ts'
import type { SeguroAnterior } from './oportunidad-seguimiento.ts'

/** El vehículo que se va a tarificar. */
export type TipoVehiculoNuevo = 'auto' | 'moto'

/** El vehículo de la póliza candidata. `null` = no se sabe: nunca se trata como turismo. */
export type TipoVehiculoCandidata = 'turismo' | 'moto' | null

export type OrigenCandidata =
  /** Póliza de NUESTRA cartera en vigor (CIMA): compañía y nº los trae EIAC. */
  | 'cartera'
  /** La póliza que tiene en otra correduría/compañía, leída de su PDF y guardada en la oportunidad. */
  | 'competencia'

export type CandidataSeguroAnterior = {
  /** Estable y opaco (`poliza:<uuid>`, `oportunidad:<uuid>`): lo que manda el corredor para elegir otra. */
  id: string
  origen: OrigenCandidata
  /** La ficha (tomador) de esa póliza. `null` = no se sabe de quién es → NUNCA se imputa. */
  clienteId: string | null
  tipoVehiculo: TipoVehiculoCandidata
  /** Nombre de la compañía, para pintar. */
  compania: string | null
  /** Lo que se sabe de esa póliza (código DGS, efecto, nº, matrícula, bonus…). */
  seguro: SeguroAnterior
  /**
   * Siniestros ANOTADOS en nuestro CRM para esa póliza (solo cartera). `null` = no se ha mirado.
   * 🚨 `0` = ninguno anotado, que NO prueba que no los haya.
   */
  siniestrosAnotados?: number | null
  /** «1234ABC · Nissan Juke», para decir en pantalla de qué póliza se habla. */
  etiqueta?: string | null
  /** Cómo se obtuvo algún dato que no venía tal cual (p. ej. el código DGS deducido del nombre). */
  notas?: string[]
  /**
   * Nombre del CÓNYUGE/pareja del tomador cuando la póliza es SUYA (vínculo `Cónyuge/Pareja de Hecho`
   * comprobado por quien lee). Solo se ofrece para que el corredor la elija: nunca se imputa sola.
   */
  delConyuge?: string | null
}

/** Lo que el vendor exige para declarar un seguro anterior y la candidata no trae. */
export type FaltaDeclarar = 'codigoDgs' | 'numeroPoliza'

export type CandidataEvaluada = CandidataSeguroAnterior & {
  /** Vacío = se puede declarar tal cual. */
  faltan: FaltaDeclarar[]
  /** `true` si consta algún siniestro (en el documento o anotado en el CRM). */
  conSiniestrosConocidos: boolean
}

export type ImputacionSeguroAnterior = {
  estado: 'ok'
  /** `null` = ninguna se puede declarar: se cotiza sin seguro anterior y se dice por qué. */
  elegida: CandidataEvaluada | null
  /** Por qué ESA (o por qué ninguna), en castellano para pantalla. */
  porque: string
  /** Las demás que se pueden elegir, en el orden de la regla. */
  alternativas: CandidataEvaluada[]
  /** Las que no entran (otra ficha, sin ficha), con el motivo. */
  descartadas: { id: string; porque: string }[]
  /** `true` = la ha elegido el corredor (`elegidaId`), no la regla. */
  elegidaPorCorredor: boolean
  avisos: string[]
}

export type ErrorImputacion = {
  estado: 'error'
  causa: 'elegida_desconocida' | 'elegida_no_declarable'
  mensaje: string
}

const RANGO_TIPO: Record<'turismo' | 'moto' | 'null', number> = { turismo: 0, moto: 1, null: 2 }

function faltanDe(c: CandidataSeguroAnterior): FaltaDeclarar[] {
  const f: FaltaDeclarar[] = []
  if (!c.seguro.codigoDgs) f.push('codigoDgs')
  if (!c.seguro.numeroPoliza) f.push('numeroPoliza')
  return f
}

function conSiniestros(c: CandidataSeguroAnterior): boolean {
  return (c.seguro.siniestrosUltimos5 ?? 0) > 0 || (c.siniestrosAnotados ?? 0) > 0
}

function normalPoliza(s: string | null | undefined): string | null {
  const t = (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^0+/, '')
  return t.length >= 4 ? t : null
}

/**
 * La MISMA póliza vista dos veces (en cartera y leída de su PDF en una oportunidad): se funde en la
 * de cartera, rellenando SOLO sus huecos con lo leído (el bonus suele venir del PDF y no de CIMA).
 * Se fusiona por nº de póliza dentro de la misma ficha, nunca por nombre ni entre fichas.
 */
function fundirDuplicadas(cs: CandidataSeguroAnterior[]): CandidataSeguroAnterior[] {
  const out: CandidataSeguroAnterior[] = []
  for (const c of cs) {
    const n = normalPoliza(c.seguro.numeroPoliza)
    const gemela = n === null ? undefined : out.find(o => o.clienteId === c.clienteId && normalPoliza(o.seguro.numeroPoliza) === n)
    if (!gemela) {
      out.push({ ...c, seguro: { ...c.seguro } })
      continue
    }
    const [base, otra] = gemela.origen === 'cartera' || c.origen !== 'cartera' ? [gemela, c] : [c, gemela]
    const seguro: SeguroAnterior = { ...base.seguro }
    for (const k of Object.keys(otra.seguro) as (keyof SeguroAnterior)[]) {
      if ((seguro[k] === null || seguro[k] === undefined) && otra.seguro[k] !== null && otra.seguro[k] !== undefined) {
        ;(seguro as Record<string, unknown>)[k] = otra.seguro[k]
      }
    }
    const fundida: CandidataSeguroAnterior = {
      ...base,
      tipoVehiculo: base.tipoVehiculo ?? otra.tipoVehiculo,
      compania: base.compania ?? otra.compania,
      etiqueta: base.etiqueta ?? otra.etiqueta ?? null,
      seguro,
      notas: [...(base.notas ?? []), ...(otra.notas ?? []), `misma póliza que ${otra.id}: se completan sus huecos con lo leído allí`],
    }
    out[out.indexOf(gemela)] = fundida
  }
  return out
}

/** Orden de la regla de Alberto. Menor = antes. */
function comparar(a: CandidataEvaluada, b: CandidataEvaluada): number {
  const ta = RANGO_TIPO[a.tipoVehiculo ?? 'null'] - RANGO_TIPO[b.tipoVehiculo ?? 'null']
  if (ta !== 0) return ta
  const sa = Number(a.conSiniestrosConocidos) - Number(b.conSiniestrosConocidos)
  if (sa !== 0) return sa
  const fa = a.seguro.fechaEfecto
  const fb = b.seguro.fechaEfecto
  if (fa && fb && fa !== fb) return fa < fb ? -1 : 1
  if (fa && !fb) return -1
  if (!fa && fb) return 1
  if (a.origen !== b.origen) return a.origen === 'cartera' ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

function describir(c: CandidataEvaluada): string {
  const quien = [c.compania, c.seguro.numeroPoliza ? `nº …${c.seguro.numeroPoliza.slice(-4)}` : null, c.etiqueta].filter(Boolean).join(' · ')
  return quien || c.id
}

/**
 * Qué póliza del cliente se declara como seguro anterior al tarificar un vehículo NUEVO.
 *
 * - `candidatas`: las pólizas de auto/moto conocidas (cartera + competencia), de la ficha que sea.
 * - `tipoNuevo`: el vehículo que se tarifica (solo cambia los avisos: la regla es la misma).
 * - `opciones.clienteId`: la ficha que se tarifica. Solo entran SUS pólizas.
 * - `opciones.elegidaId`: la que ha elegido el corredor; manda sobre la regla si es suya y declarable.
 *
 * Regla: turismo antes que moto (tipo desconocido, al final); luego sin siniestros conocidos antes
 * que con; luego la de EFECTO más antiguo (sin fecha, al final); empate → cartera antes que
 * competencia. Solo se elige automáticamente entre las DECLARABLES (con código DGS y nº de póliza:
 * el vendor exige los dos); una que encabezaría la regla pero no es declarable sale en `avisos`.
 */
export function elegirSeguroAnteriorParaImputar(
  candidatas: readonly CandidataSeguroAnterior[],
  tipoNuevo: TipoVehiculoNuevo,
  opciones: { clienteId: string; elegidaId?: string | null },
): ImputacionSeguroAnterior | ErrorImputacion {
  const descartadas: { id: string; porque: string }[] = []
  const propias: CandidataSeguroAnterior[] = []
  const delConyuge: CandidataSeguroAnterior[] = []
  for (const c of candidatas) {
    if (c.clienteId === null) descartadas.push({ id: c.id, porque: 'no se sabe de qué ficha es: no se imputa a nadie' })
    else if (c.clienteId === opciones.clienteId) propias.push(c)
    else if (typeof c.delConyuge === 'string' && c.delConyuge.trim() !== '') delConyuge.push(c)
    else descartadas.push({ id: c.id, porque: 'es de otra ficha: el historial es de cada persona' })
  }

  const evaluar = (cs: CandidataSeguroAnterior[]): CandidataEvaluada[] =>
    fundirDuplicadas(cs)
      .map(c => ({ ...c, faltan: faltanDe(c), conSiniestrosConocidos: conSiniestros(c) }))
      .sort(comparar)
  // Las del cónyuge van DESPUÉS y solo se pueden elegir a mano: la regla automática no las toca.
  const evaluadasPropias = evaluar(propias)
  const evaluadas: CandidataEvaluada[] = [...evaluadasPropias, ...evaluar(delConyuge)]
  const declarables = evaluadasPropias.filter(c => c.faltan.length === 0)
  const avisos: string[] = []

  if (opciones.elegidaId) {
    const e = evaluadas.find(c => c.id === opciones.elegidaId)
    if (!e) {
      return {
        estado: 'error',
        causa: 'elegida_desconocida',
        mensaje: 'La póliza elegida como seguro anterior no es de este cliente (o ya no está en vigor). No se ha pedido precio.',
      }
    }
    if (e.faltan.length > 0) {
      return {
        estado: 'error',
        causa: 'elegida_no_declarable',
        mensaje: `A la póliza elegida le falta ${e.faltan.map(f => (f === 'codigoDgs' ? 'el código DGS de la compañía' : 'el nº de póliza')).join(' y ')}: sin eso la compañía no puede contrastar el historial. Complétalo o elige otra.`,
      }
    }
    avisos.push(...avisosDe(e, tipoNuevo))
    if (e.delConyuge) avisos.push(`Se declara una póliza del cónyuge (${e.delConyuge}): solo vale si la compañía admite la bonificación del cónyuge/pareja.`)
    return {
      estado: 'ok',
      elegida: e,
      porque: `la ha elegido el corredor: ${describir(e)}`,
      alternativas: evaluadas.filter(c => c.id !== e.id),
      descartadas,
      elegidaPorCorredor: true,
      avisos,
    }
  }

  const primera = evaluadasPropias[0]
  const elegida = declarables[0] ?? null
  if (primera && elegida && primera.id !== elegida.id) {
    avisos.push(
      `Por la regla iría antes ${describir(primera)}, pero le falta ${primera.faltan.map(f => (f === 'codigoDgs' ? 'el código DGS' : 'el nº de póliza')).join(' y ')}: se declara la siguiente.`,
    )
  }
  if (!elegida) {
    return {
      estado: 'ok',
      elegida: null,
      porque:
        evaluadasPropias.length === 0
          ? 'no conocemos ninguna póliza de auto o moto de este cliente: se cotiza sin seguro anterior'
          : 'ninguna de sus pólizas de motor trae compañía (código DGS) y nº de póliza a la vez: se cotiza sin seguro anterior hasta completarla',
      alternativas: evaluadas,
      descartadas,
      elegidaPorCorredor: false,
      avisos,
    }
  }
  avisos.push(...avisosDe(elegida, tipoNuevo))
  return {
    estado: 'ok',
    elegida,
    porque: porqueDe(elegida, declarables),
    alternativas: evaluadas.filter(c => c.id !== elegida.id),
    descartadas,
    elegidaPorCorredor: false,
    avisos,
  }
}

function porqueDe(e: CandidataEvaluada, declarables: CandidataEvaluada[]): string {
  const partes: string[] = []
  if (declarables.length === 1) partes.push('es la única póliza de motor suya que se puede declarar')
  else {
    if (e.tipoVehiculo === 'turismo' && declarables.some(c => c.tipoVehiculo !== 'turismo')) partes.push('turismo antes que moto')
    if (!e.conSiniestrosConocidos && declarables.some(c => c.conSiniestrosConocidos)) partes.push('sin siniestros conocidos')
    if (e.seguro.fechaEfecto) partes.push(`efecto más antiguo (${e.seguro.fechaEfecto})`)
  }
  return `${describir(e)}: ${partes.join('; ') || 'primera por la regla'}`
}

function avisosDe(e: CandidataEvaluada, tipoNuevo: TipoVehiculoNuevo): string[] {
  const a: string[] = []
  if (tipoNuevo === 'moto' && e.tipoVehiculo === 'turismo') {
    a.push('Se declara el historial de un TURISMO para una moto: la API no documenta si la compañía lo acepta; si no, el precio se quedará en estimado.')
  }
  if (tipoNuevo === 'auto' && e.tipoVehiculo === 'moto') {
    a.push('Se declara el historial de una MOTO para un turismo: la compañía puede no aplicarlo.')
  }
  if (e.seguro.cesionDerechos === true) {
    a.push(`Esa póliza tiene cesión de derechos${e.seguro.canal ? ` (canal ${e.seguro.canal})` : ''}: si se da de baja, avisa a la financiera.`)
  }
  return a
}

// ─── Los años que se declaran ───────────────────────────────────────────────

/** Años completos entre dos fechas aaaa-mm-dd. `null` si alguna no es fecha o van al revés. */
export function aniosCompletos(desde: string | null | undefined, hasta: string): number | null {
  if (!desde || !/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) return null
  const [y1, m1, d1] = desde.split('-').map(Number)
  const [y2, m2, d2] = hasta.split('-').map(Number)
  if (Number.isNaN(Date.UTC(y1, m1 - 1, d1)) || desde > hasta) return null
  let n = y2 - y1
  if (m2 < m1 || (m2 === m1 && d2 < d1)) n--
  return n < 0 ? null : n
}

/**
 * El MÁXIMO de años sin siniestros que se declara cuando no se saben (03/10/2026). El esquema de
 * Codeoscopic (`MotorPreviousInsurance_V1.yearsWithoutAccidents`) NO documenta un máximo, así que
 * es el menor entre los años de carné y `HISTORIAL_MAXIMO` (10): nadie lleva más años sin
 * siniestros que conduciendo. Si el vendor rechaza el valor, `cotizar()` aprende su tope
 * (`codeoscopic_topes_historial`) y lo recorta solo. Sin fecha de carné, el 10 (y se dice).
 */
export function maximoAniosSinSiniestros(fechaCarnet: string | null | undefined, hoy: string): { valor: number; porque: string } {
  const carne = aniosCompletos(fechaCarnet ?? null, hoy)
  if (carne === null) {
    return { valor: HISTORIAL_MAXIMO.aniosSinSiniestros, porque: `no consta la fecha del carné: se declara el máximo (${HISTORIAL_MAXIMO.aniosSinSiniestros})` }
  }
  if (carne < HISTORIAL_MAXIMO.aniosSinSiniestros) {
    return { valor: carne, porque: `el máximo posible: los años de carné (${carne})` }
  }
  return { valor: HISTORIAL_MAXIMO.aniosSinSiniestros, porque: `el máximo (${HISTORIAL_MAXIMO.aniosSinSiniestros})` }
}

/**
 * Los años ASEGURADO que acreditan los datos de una póliza: los años desde su efecto y los años
 * limpios leídos (nadie lleva más años sin siniestros que asegurado). Es una COTA INFERIOR: lo que
 * no consta no suma (no es «no hay»), y todo lo que se declare por encima es supuesto.
 */
export function aniosAseguradoAcreditados(
  s: { fechaEfecto?: string | null; aniosSinSiniestros?: number | null },
  hoy: string,
): number {
  return Math.max(aniosCompletos(s.fechaEfecto ?? null, hoy) ?? 0, s.aniosSinSiniestros ?? 0)
}

/**
 * De dónde salen unos años declarados A MANO (pantalla de vehículo nuevo con «tiene seguro»), con la
 * MISMA regla que `historialParaImputar`: `'documento'` solo si no pasan de lo que acreditan los datos
 * leídos de su póliza; si no (precargados al máximo, o tecleados por encima), `null` = supuesto, y la
 * emisión pedirá verificarlos. Así la ruta manual y la automática dan lo mismo con los mismos datos.
 */
export function origenesHistorialManual(e: {
  seguro: { fechaEfecto?: string | null; aniosSinSiniestros?: number | null } | null
  aniosAsegurado: number
  aniosSinSiniestros: number
  hoy: string
}): { bonusOrigen?: 'documento'; aniosAseguradoOrigen?: 'documento' } {
  const s = e.seguro ?? {}
  const dentro = (v: number, tope: number) => Number.isFinite(v) && v >= 0 && v <= tope
  return {
    ...(dentro(e.aniosSinSiniestros, s.aniosSinSiniestros ?? 0) ? { bonusOrigen: 'documento' as const } : {}),
    ...(dentro(e.aniosAsegurado, aniosAseguradoAcreditados(s, e.hoy)) ? { aniosAseguradoOrigen: 'documento' as const } : {}),
  }
}

export type CampoHistorial = 'aniosAsegurado' | 'aniosEnCompania' | 'aniosSinSiniestros' | 'siniestrosUltimos5'

export type HistorialImputado = {
  /** Mismos nombres que `DatosAuto`/`DatosMoto` de asegura: se mezclan tal cual en la precalificación. */
  datos: {
    aseguradoAntes: true
    companiaAnteriorCodigo: string
    polizaAnterior: string
    /** `null` = no se sabe → el vendor recibe la matrícula del vehículo nuevo (y puede no encontrar el historial). */
    matriculaAnterior: string | null
    aniosAsegurado: number
    aniosEnCompania: number
    aniosSinSiniestros: number
    siniestrosUltimos5: number
  }
  supuestos: {
    campo: CampoHistorial
    valor: number
    porque: string
    optimista: boolean
    /** `true` = ESTE supuesto es el que pone `bonusSupuesto` (condiciona el precio y la emisión). */
    condiciona?: boolean
  }[]
  /** `true` = los años sin siniestros y/o los años asegurado NO se saben y se ha declarado el máximo: hay que verificarlo antes de emitir. */
  bonusSupuesto: boolean
}

/**
 * Los años que se declaran con la póliza elegida. Lo SABIDO manda (declarar 10 años limpios cuando
 * el papel dice 3 es mentir); lo que no, al máximo y marcado. Con siniestros conocidos y sin años
 * limpios, se declaran 0 años limpios y el nº de siniestros (no se supone a favor).
 *
 * Lanza si la candidata no es declarable: elegirla es trabajo de `elegirSeguroAnteriorParaImputar`.
 */
export function historialParaImputar(
  c: CandidataEvaluada,
  contexto: { fechaCarnet: string | null | undefined; hoy: string },
): HistorialImputado {
  if (!c.seguro.codigoDgs || !c.seguro.numeroPoliza) throw new Error('historialParaImputar: candidata no declarable')
  const supuestos: HistorialImputado['supuestos'] = []
  const maximo = maximoAniosSinSiniestros(contexto.fechaCarnet, contexto.hoy)
  const desdeEfecto = aniosCompletos(c.seguro.fechaEfecto, contexto.hoy)

  // ── Años sin siniestros: el bonus ──
  let aniosSinSiniestros: number
  let bonusSupuesto = false
  if (c.seguro.aniosSinSiniestros !== null) {
    aniosSinSiniestros = c.seguro.aniosSinSiniestros
  } else if (c.conSiniestrosConocidos) {
    aniosSinSiniestros = 0
    supuestos.push({
      campo: 'aniosSinSiniestros',
      valor: 0,
      porque: 'no consta cuántos años lleva sin siniestros, pero SÍ consta algún siniestro: se declaran 0 (no se supone a su favor)',
      optimista: false,
    })
  } else {
    aniosSinSiniestros = maximo.valor
    bonusSupuesto = true
    supuestos.push({
      campo: 'aniosSinSiniestros',
      valor: maximo.valor,
      condiciona: true,
      porque: `no consta en su póliza: ${maximo.porque}. Precio CONDICIONADO a verificación (SINCO o certificado de siniestralidad) antes de emitir`,
      optimista: true,
    })
  }

  // ── Años asegurado: al menos los limpios; si no se saben, el máximo ──
  // Lo SABIDO es lo que acreditan sus datos (años limpios leídos, años desde el efecto de esa póliza);
  // todo lo que el máximo pone por encima es SUPUESTO y también condiciona el precio (`bonusSupuesto`).
  const techo = Math.max(maximo.valor, aniosSinSiniestros)
  const aniosAsegurado = Math.max(techo, desdeEfecto ?? 0)
  const sabidos = aniosAseguradoAcreditados(c.seguro, contexto.hoy)
  if (aniosAsegurado > sabidos) {
    bonusSupuesto = true
    supuestos.push({
      campo: 'aniosAsegurado',
      valor: aniosAsegurado,
      condiciona: true,
      porque: `solo constan ${sabidos} año(s): se declara el máximo; la compañía lo contrasta con SINCO por el nº de póliza y aplica el real. Precio CONDICIONADO a verificación antes de emitir`,
      optimista: true,
    })
  }

  // ── Años en esa compañía: desde el efecto de esa póliza, si se sabe ──
  let aniosEnCompania: number
  if (desdeEfecto !== null && desdeEfecto > 0) {
    aniosEnCompania = Math.min(desdeEfecto, aniosAsegurado)
  } else {
    aniosEnCompania = aniosAsegurado
    supuestos.push({
      campo: 'aniosEnCompania',
      valor: aniosAsegurado,
      porque: 'no consta desde cuándo está en esa compañía: se declaran los mismos años que asegurado',
      optimista: true,
    })
  }

  // ── Siniestros en 5 años ──
  let siniestrosUltimos5: number
  if (c.seguro.siniestrosUltimos5 !== null) siniestrosUltimos5 = c.seguro.siniestrosUltimos5
  else if ((c.siniestrosAnotados ?? 0) > 0) siniestrosUltimos5 = c.siniestrosAnotados as number
  else if (aniosSinSiniestros < 5 && aniosSinSiniestros < aniosAsegurado) {
    // Menos años limpios que asegurado, y menos de 5: hubo AL MENOS un siniestro en los últimos 5 años
    // (es lo que dicen sus propios datos). Declarar 0 sería mentir sabiéndolo; cuántos, no consta →
    // se declara el mínimo implícito (1) y el precio queda condicionado a verificación.
    siniestrosUltimos5 = 1
    bonusSupuesto = true
    supuestos.push({
      campo: 'siniestrosUltimos5',
      valor: 1,
      condiciona: true,
      porque: `constan ${aniosSinSiniestros} año(s) sin siniestros de ${aniosAsegurado} asegurado: hubo al menos uno en los últimos 5 y no consta cuántos. Precio CONDICIONADO a verificación antes de emitir`,
      optimista: true,
    })
  } else {
    siniestrosUltimos5 = 0
    supuestos.push({
      campo: 'siniestrosUltimos5',
      valor: 0,
      porque: 'no consta ningún siniestro (que no esté anotado no prueba que no lo haya)',
      optimista: true,
    })
  }

  return {
    datos: {
      aseguradoAntes: true,
      companiaAnteriorCodigo: c.seguro.codigoDgs,
      polizaAnterior: c.seguro.numeroPoliza,
      matriculaAnterior: c.seguro.matricula ?? null,
      aniosAsegurado,
      aniosEnCompania,
      aniosSinSiniestros,
      siniestrosUltimos5,
    },
    supuestos,
    bonusSupuesto,
  }
}

/** Lo que cruza el puerto de una candidata: sin ficha (clienteId) ni notas internas. */
export type CandidataPublica = {
  id: string
  origen: OrigenCandidata
  tipoVehiculo: TipoVehiculoCandidata
  compania: string | null
  etiqueta: string | null
  /** Nombre del cónyuge/pareja si la póliza es SUYA (no del tomador); `null` = es del tomador. */
  delConyuge: string | null
  numeroPoliza: string | null
  codigoDgs: string | null
  fechaEfecto: string | null
  matricula: string | null
  canal: string | null
  cesionDerechos: boolean | null
  modalidad: string | null
  aniosSinSiniestros: number | null
  siniestrosUltimos5: number | null
  conSiniestrosConocidos: boolean
  faltan: FaltaDeclarar[]
}

export function candidataPublica(c: CandidataEvaluada): CandidataPublica {
  return {
    id: c.id,
    origen: c.origen,
    tipoVehiculo: c.tipoVehiculo,
    compania: c.compania,
    etiqueta: c.etiqueta ?? null,
    delConyuge: c.delConyuge?.trim() || null,
    numeroPoliza: c.seguro.numeroPoliza ?? null,
    codigoDgs: c.seguro.codigoDgs,
    fechaEfecto: c.seguro.fechaEfecto,
    matricula: c.seguro.matricula ?? null,
    canal: c.seguro.canal ?? null,
    cesionDerechos: c.seguro.cesionDerechos ?? null,
    modalidad: c.seguro.modalidad ?? null,
    aniosSinSiniestros: c.seguro.aniosSinSiniestros,
    siniestrosUltimos5: c.seguro.siniestrosUltimos5,
    conSiniestrosConocidos: c.conSiniestrosConocidos,
    faltan: c.faltan,
  }
}

// ─── Emisión: un bonus supuesto no se emite sin verificar ───────────────────

export const FUENTES_VERIFICACION_BONUS = ['certificado', 'sinco', 'dato_confirmado'] as const
export type FuenteVerificacionBonus = (typeof FUENTES_VERIFICACION_BONUS)[number]

export type VerificacionBonus = { fuente: FuenteVerificacionBonus; nota: string | null }

/** Lo que manda quien emite (`bonusVerificado`), saneado. Cualquier otra cosa → `null` (no verificado). */
export function verificacionBonusDe(v: unknown): VerificacionBonus | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  if (typeof o.fuente !== 'string' || !(FUENTES_VERIFICACION_BONUS as readonly string[]).includes(o.fuente)) return null
  const nota = typeof o.nota === 'string' && o.nota.trim() !== '' ? o.nota.trim().slice(0, 300) : null
  return { fuente: o.fuente as FuenteVerificacionBonus, nota }
}

export type BloqueoBonus =
  | { bloquea: false }
  | { bloquea: true; causa: 'bonus_sin_verificar'; mensaje: string }

/**
 * ¿Se puede EMITIR una tarificación de auto/moto con lo que declaró de seguro anterior?
 *
 * - `previamenteAsegurado`: `risk.previouslyInsured` de la petición guardada. `null` = no se ha
 *   podido leer → como si hubiera bonus (estado conservador).
 * - `bonusSupuesto`: la marca guardada con la tarificación. `null` = no consta (tarificación
 *   anterior a la marca, o no se pudo leer) → no se sabe si se supuso → como si se hubiera supuesto.
 * - `verificacion`: la que manda el corredor al emitir, o la guardada antes.
 */
export function decidirBloqueoBonus(e: {
  ramo: string | null
  previamenteAsegurado: boolean | null
  bonusSupuesto: boolean | null
  verificacion: VerificacionBonus | null
}): BloqueoBonus {
  if (e.ramo !== 'auto' && e.ramo !== 'moto') return { bloquea: false }
  if (e.previamenteAsegurado === false) return { bloquea: false }
  if (e.bonusSupuesto === false && e.previamenteAsegurado === true) return { bloquea: false }
  if (e.verificacion) return { bloquea: false }
  const porque =
    e.previamenteAsegurado === null
      ? 'no se ha podido leer qué seguro anterior se declaró en esta tarificación'
      : e.bonusSupuesto === true
        ? 'el bonus (años sin siniestros) se declaró al MÁXIMO porque no constaba'
        : 'esta tarificación no dice si el bonus declarado era un dato o un supuesto'
  return {
    bloquea: true,
    causa: 'bonus_sin_verificar',
    mensaje:
      `No se ha enviado nada: ${porque}. Antes de emitir hay que verificarlo (certificado de siniestralidad, ` +
      'consulta SINCO o dato confirmado por el cliente) y reenviar con `bonusVerificado: { fuente }`. ' +
      'Si la compañía aplica menos bonus, el precio real será mayor que el presupuestado.',
  }
}

/** El nombre de una compañía → su código DGS, solo si encaja con UNA. Varias o ninguna → `null`. */
export function codigoDgsPorNombre(
  catalogo: readonly { codigoDgs: string; nombreComun: string; nombreCima?: string | null }[],
  nombre: string | null | undefined,
): string | null {
  const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  if (!nombre) return null
  const n = normal(nombre)
  if (n === '') return null
  const nombres = (c: (typeof catalogo)[number]) => [c.nombreComun, c.nombreCima].flatMap(x => (x ? [normal(x)] : [])).filter(m => m !== '')
  const exactas = [...new Set(catalogo.filter(c => nombres(c).includes(n)).map(c => c.codigoDgs))]
  if (exactas.length === 1) return exactas[0]
  if (exactas.length > 1) return null
  const encajan = [...new Set(catalogo.filter(c => nombres(c).some(m => ` ${n} `.includes(` ${m} `) || ` ${m} `.includes(` ${n} `))).map(c => c.codigoDgs))]
  return encajan.length === 1 ? encajan[0] : null
}
