// LO QUE VIAJA al pedir precio de COCHE (Avant2 y bots), campo a campo y con su ORIGEN (15/10/2026). PURO, sin E/S.
//
// Antes cada pantalla lo calculaba a su manera: el cotizador (`AutoNuevo.tsx`) arrancaba su estado con `garajeInicial`,
// los 10.000 km, «compra = matriculación», `historialDeclarado` + topes en línea + `seguroActualEmbebido`; «Datos del
// vehículo» y «Historial y bonificaciones» pintaban «sin dato» sin decir con qué se iba a cotizar; y el resumen del
// cotizador lo repetía con otras palabras. Tres copias del mismo dato que podían contradecirse.
//
// Ahora hay UNA fuente: `valoresQueViajan(riesgo, catalogos, leido, modo)` devuelve, por campo, `{ valor, origen, nota }`:
//   · `riesgo`               — lo guardado en el riesgo (datos del vehículo o lo declarado en «Historial y bonificaciones»).
//   · `leido`                — lo leído de su póliza actual (la oportunidad).
//   · `supuesto`             — nadie lo ha dicho: viaja un supuesto DECLARADO (garaje comunitario, 10.000 km, el máximo…).
//   · `sin_dato`             — no se sabe y no viaja nada (`valor: null`; nunca un 0 ni un `''` que parezca dato).
//   · `riesgo_no_reconocido` — el riesgo trae un valor que la lista de la compañía no reconoce: se pregunta, no se cambia.
// El cotizador INICIALIZA su estado con `formularioInicial(...)`; las pantallas de arriba y la verificación PINTAN la nota.
//
// 🚨 INVARIANTE: lo que viaja (cuerpo de la petición a Avant2 y formulario de los bots) es IDÉNTICO al de antes de este
// fichero para el mismo riesgo. Lo vigila `supuestos-auto.test.ts` (copia congelada del cálculo viejo + valores fijos).

import { HISTORIAL_MAXIMO, ultimosDigitosPoliza, type DatosVehiculoRiesgo, type HistorialDeclaradoRiesgo, type SeguroAnterior } from '@central/module-seguros'
import { garajeInicial } from '../supuestos-presupuesto.ts'
import { codigoCompania, historialDeclarado, type AnteriorParaTarificar } from '../seguro-anterior.ts'
import { KM_AUTO_POR_DEFECTO } from './km-auto.ts'

type Opcion = { id: string; nombre: string }

export type OrigenValor = 'riesgo' | 'leido' | 'supuesto' | 'sin_dato' | 'riesgo_no_reconocido'
/** Un campo: `valor: null` = no viaja nada (no se sabe). `nota` = lo que se pinta junto al campo (`null` = nada que decir). */
export type ValorQueViaja<T> = { valor: T | null; origen: OrigenValor; nota: string | null }

/** `embebido` = cotizador dentro de la oportunidad (manda lo declarado arriba); `completo` = la pantalla `auto-nuevo`. */
export type ModoCotizador = 'embebido' | 'completo'

export type ValoresQueViajan = {
  /** `valor` = id del catálogo de garajes. `sinCasar` = etiqueta del garaje del riesgo que el catálogo no reconoce. */
  garaje: ValorQueViaja<string> & { sinCasar: string | null }
  km: ValorQueViaja<number>
  /** `valor` = aaaa-mm-dd. Supuesto = la de matriculación (no se manda nada: el precalificador ya la usa). */
  fechaCompra: ValorQueViaja<string>
  tieneSeguro: ValorQueViaja<boolean>
  /** `valor` = lo que va en `companiaAnteriorCodigo` (código, o el texto libre sin lista). */
  compania: ValorQueViaja<string> & { codigo: string; libre: string; noReconocida: string | null }
  /** En embebido, los 5 últimos (lo que manda Codeoscopic); en la pantalla completa, lo leído tal cual. */
  poliza: ValorQueViaja<string>
  aniosAsegurado: ValorQueViaja<number>
  aniosEnCompania: ValorQueViaja<number>
  aniosSinSiniestros: ValorQueViaja<number>
  siniestrosUltimos5: ValorQueViaja<number>
}

// ── Seguro actual del cotizador embebido (13/10/2026; movido aquí desde `auto-nuevo/verificacion-embebido.ts`) ────────
// Lo DECLARADO arriba («Historial y bonificaciones», `historialDeclarado`) manda; sin dato arriba, lo de siempre (lo leído
// de su póliza o el máximo). `verificacion-embebido.ts` lo reexporta (lo usa también moto).

export type OrigenDato = 'arriba' | 'leido' | 'ninguno'
export type SeguroActualEmbebido = {
  tieneSeguroActual: boolean
  /** Arriba no dice si tiene seguro y no hay póliza leída: «no se sabe», no «no tiene». */
  tieneSeguroSinDato: boolean
  companiaCodigo: string
  companiaLibre: string
  /** Lo que se teclea arriba como compañía y no casa con la lista de Codeoscopic. */
  companiaNoReconocida: string | null
  /** Lo que viaja a Codeoscopic: los 5 últimos (`ultimosDigitosPoliza`). '' = falta. */
  polizaDigitos: string
  aniosSinSiniestros: string
  siniestrosUltimos5: string
  origen: { tiene: OrigenDato; compania: OrigenDato; poliza: OrigenDato; sinSiniestros: OrigenDato; siniestros5: OrigenDato }
}

/**
 * PURA. `leido` es lo de siempre (precarga de la póliza leída / el máximo); `codigoDe` traduce un texto de compañía a su
 * código DGS de la lista de Codeoscopic (`null` = no casa o no hay lista). `conCatalogo: false` = sin lista: la compañía va
 * en libre (código DGS) tal cual.
 */
export function seguroActualEmbebido(e: {
  arriba: Partial<HistorialDeclaradoRiesgo> | null
  leido: { tiene: boolean; companiaCodigo: string; companiaLibre: string; poliza: string; aniosSinSiniestros: number; siniestrosUltimos5: number | null }
  conCatalogo: boolean
  codigoDe: (texto: string) => string | null
}): SeguroActualEmbebido {
  const a = e.arriba ?? {}
  const l = e.leido
  const tieneArriba = a.tieneSeguroActual ?? null
  const companiaArriba = a.companiaActual ?? null
  let companiaCodigo = l.companiaCodigo
  let companiaLibre = l.companiaLibre
  let companiaNoReconocida: string | null = null
  if (companiaArriba !== null) {
    if (e.conCatalogo) {
      companiaCodigo = e.codigoDe(companiaArriba) ?? ''
      companiaLibre = ''
      if (companiaCodigo === '') companiaNoReconocida = companiaArriba
    } else {
      companiaCodigo = ''
      companiaLibre = companiaArriba
    }
  }
  const codigoParaPoliza = companiaCodigo || companiaLibre
  const polizaArriba = a.numeroPoliza ?? null
  const polizaFuente = polizaArriba ?? (l.poliza.trim() === '' ? null : l.poliza)
  const sinArriba = a.aniosSinSiniestros ?? null
  const s5Arriba = a.siniestrosUltimos5 ?? null
  const s5 = s5Arriba ?? l.siniestrosUltimos5
  return {
    tieneSeguroActual: tieneArriba ?? l.tiene,
    tieneSeguroSinDato: tieneArriba === null && !l.tiene,
    companiaCodigo,
    companiaLibre,
    companiaNoReconocida,
    polizaDigitos: polizaFuente === null ? '' : ultimosDigitosPoliza(polizaFuente, codigoParaPoliza) ?? '',
    aniosSinSiniestros: String(sinArriba ?? l.aniosSinSiniestros),
    siniestrosUltimos5: s5 === null ? '' : String(s5),
    origen: {
      tiene: tieneArriba !== null ? 'arriba' : l.tiene ? 'leido' : 'ninguno',
      compania: companiaArriba !== null ? 'arriba' : l.companiaCodigo || l.companiaLibre ? 'leido' : 'ninguno',
      poliza: polizaArriba !== null ? 'arriba' : polizaFuente !== null ? 'leido' : 'ninguno',
      sinSiniestros: sinArriba !== null ? 'arriba' : 'leido',
      siniestros5: s5Arriba !== null ? 'arriba' : l.siniestrosUltimos5 !== null ? 'leido' : 'ninguno',
    },
  }
}

/**
 * PURA (13/10/2026): los años del historial que manda el cotizador. Lo DECLARADO arriba manda (asegurado / en la
 * compañía); lo que no viene de arriba (lo leído de su póliza o el máximo) se TOPA a los años asegurado: Avant2 exige en la
 * compañía y sin siniestros ≤ asegurado y ese 400 se paga. Lo declarado arriba NO se topa: si es incoherente, la
 * verificación lo marca ✗ y se corrige arriba. Sin `arriba` (pantalla completa) = lo leído o el máximo, topado.
 */
export function historialConTopes<T extends { aniosAsegurado: number; aniosEnCompania: number; aniosSinSiniestros: number }>(
  leido: T,
  arriba: Partial<HistorialDeclaradoRiesgo> | null,
): T & { origenAsegurado: OrigenDato; origenEnCompania: OrigenDato } {
  const aseguradoArriba = arriba?.aniosAsegurado ?? null
  const enCompaniaArriba = arriba?.aniosEnCompania ?? null
  const asegurado = aseguradoArriba ?? leido.aniosAsegurado
  return {
    ...leido,
    aniosAsegurado: asegurado,
    aniosEnCompania: enCompaniaArriba ?? Math.min(leido.aniosEnCompania, asegurado),
    aniosSinSiniestros: Math.min(leido.aniosSinSiniestros, asegurado),
    origenAsegurado: aseguradoArriba !== null ? 'arriba' : 'leido',
    origenEnCompania: enCompaniaArriba !== null ? 'arriba' : 'leido',
  }
}

// ── Textos ───────────────────────────────────────────────────────────────────────────────────────────────────────────

const conMiles = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
const fechaEs = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}
const anios = (n: number) => `${n} ${n === 1 ? 'año' : 'años'}`
/** La frase única de un supuesto: «Sin dato · se cotizará con X (supuesto)». */
export const notaSupuesto = (x: string) => `Sin dato · se cotizará con ${x} (supuesto)`
export const NOTA_LEIDO = 'lo leído de su póliza actual'

/** El aviso de un garaje del riesgo que no está en la lista de la compañía (15/10/2026: nunca se cambia por el defecto). */
export function avisoGarajeSinCasar(etiqueta: string): string {
  return `El riesgo dice «${etiqueta}» pero no está en la lista de la compañía: elígelo`
}

// ── La fuente única ──────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * PURA. Qué viaja al pedir precio de coche y de dónde sale, campo a campo.
 * - `riesgo.historialDeclarado`: lo declarado en «Historial y bonificaciones». Solo cuenta en modo `embebido` (la
 *   pantalla completa no tiene «arriba»: ahí manda lo leído o el máximo, como siempre).
 * - `catalogos.garajes`: el catálogo de garajes de Avant2 (`[]` = no se pudo leer). `catalogos.companias`: la lista de
 *   compañías (`null` = no se pudo leer: la compañía va como texto libre, el código DGS).
 * - `leido.anterior`: el seguro de hoy leído de su póliza (`null` = ninguno leído).
 */
export function valoresQueViajan(
  riesgo: { datosVehiculo: DatosVehiculoRiesgo | null; historialDeclarado: Partial<HistorialDeclaradoRiesgo> | null },
  catalogos: { garajes: readonly Opcion[]; companias: { codigoDgs: string; nombreComun: string }[] | null },
  leido: { anterior: AnteriorParaTarificar | null },
  modo: ModoCotizador,
): ValoresQueViajan {
  const d = riesgo.datosVehiculo
  const anterior = leido.anterior
  const companias = catalogos.companias
  const arriba = modo === 'embebido' ? riesgo.historialDeclarado : null

  // ── Garaje: el del riesgo resuelto contra el catálogo; sin certeza, vacío y se pregunta; el defecto, solo sin garaje.
  const g = garajeInicial(d?.garaje, catalogos.garajes)
  const nombreGaraje = (id: string) => catalogos.garajes.find((x) => x.id === id)?.nombre ?? id
  const riesgoTraeGaraje = (d?.garaje ?? '').trim() !== ''
  const garaje: ValoresQueViajan['garaje'] = g.delRiesgo
    ? { valor: g.id, origen: 'riesgo', nota: null, sinCasar: null }
    : g.sinCasar !== null
      ? { valor: null, origen: 'riesgo_no_reconocido', nota: avisoGarajeSinCasar(g.sinCasar), sinCasar: g.sinCasar }
      : g.id !== ''
        ? { valor: g.id, origen: 'supuesto', nota: notaSupuesto(nombreGaraje(g.id)), sinCasar: null }
        : {
            valor: null, origen: 'sin_dato', sinCasar: null,
            nota: catalogos.garajes.length === 0
              ? 'Sin dato · no se ha podido leer la lista de garajes de la compañía'
              : riesgoTraeGaraje ? 'Sin dato' : 'Sin dato · la lista de la compañía no trae ningún garaje: elígelo',
          }

  // ── Km: los del riesgo; si no, los 10.000 de partida como SUPUESTO (`kmParaCotizar` los manda marcados).
  const km: ValoresQueViajan['km'] = d?.kmAnuales != null
    ? { valor: d.kmAnuales, origen: 'riesgo', nota: null }
    : { valor: KM_AUTO_POR_DEFECTO, origen: 'supuesto', nota: notaSupuesto(`${conMiles(KM_AUTO_POR_DEFECTO)} km`) }

  // ── Fecha de compra: la del riesgo; si no, la de matriculación (no se manda: el precalificador ya la usa).
  const compraRiesgo = d?.fechaCompra ?? null
  const matriculacion = d?.fechaMatriculacion ?? null
  const fechaCompra: ValoresQueViajan['fechaCompra'] = compraRiesgo !== null && compraRiesgo !== ''
    ? { valor: compraRiesgo, origen: 'riesgo', nota: null }
    : matriculacion
      ? { valor: matriculacion, origen: 'supuesto', nota: notaSupuesto(`la de matriculación (${fechaEs(matriculacion)})`) }
      : { valor: null, origen: 'sin_dato', nota: 'Sin dato · se cotizará con la de matriculación, que tampoco consta' }

  // ── Historial: lo declarado arriba manda; si no, lo leído o el máximo, topado a los años asegurado.
  const sa: SeguroAnterior | null = anterior?.seguroAnterior ?? null
  const historial = historialConTopes(historialDeclarado(sa), arriba)
  const seguroLeido = {
    tiene: anterior !== null,
    companiaCodigo: anterior && companias ? codigoCompania(companias, { codigoDgs: sa?.codigoDgs ?? null, nombre: anterior.aseguradora }) ?? '' : '',
    companiaLibre: companias === null ? sa?.codigoDgs ?? '' : '',
    poliza: anterior?.numeroPoliza?.trim() ?? '',
    aniosSinSiniestros: historial.aniosSinSiniestros,
    siniestrosUltimos5: historial.siniestrosUltimos5,
  }
  const emb = modo === 'embebido'
    ? seguroActualEmbebido({
        arriba,
        leido: seguroLeido,
        conCatalogo: companias !== null,
        codigoDe: (t) => {
          const c = t.trim().toUpperCase()
          return companias ? codigoCompania(companias, { codigoDgs: /^[CM]\d{4}$/.test(c) ? c : null, nombre: t }) : null
        },
      })
    : null
  const deOrigen = (o: OrigenDato): OrigenValor => (o === 'arriba' ? 'riesgo' : o === 'leido' ? 'leido' : 'sin_dato')

  const tiene = emb?.tieneSeguroActual ?? seguroLeido.tiene
  const tieneSeguro: ValoresQueViajan['tieneSeguro'] = emb && emb.origen.tiene === 'arriba'
    ? { valor: tiene, origen: 'riesgo', nota: null }
    : seguroLeido.tiene
      ? { valor: true, origen: 'leido', nota: NOTA_LEIDO }
      : { valor: false, origen: 'supuesto', nota: 'Sin dato · se cotizará sin seguro en vigor («de calle»: precio estimado)' }

  const codigo = emb?.companiaCodigo ?? seguroLeido.companiaCodigo
  const libre = emb?.companiaLibre ?? seguroLeido.companiaLibre
  const noReconocida = emb?.companiaNoReconocida ?? null
  const origenCompania: OrigenValor = noReconocida !== null ? 'riesgo_no_reconocido' : emb ? deOrigen(emb.origen.compania) : codigo || libre ? 'leido' : 'sin_dato'
  const compania: ValoresQueViajan['compania'] = {
    valor: codigo || libre || null,
    origen: origenCompania,
    nota: noReconocida !== null
      ? `«${noReconocida}» no está en la lista de compañías de Codeoscopic: elígela de la lista arriba («Historial y bonificaciones»)`
      : origenCompania === 'leido' ? NOTA_LEIDO
        : origenCompania === 'sin_dato'
          ? anterior?.aseguradora ? `Sin dato · la leída («${anterior.aseguradora}») no casa con la lista de compañías` : 'Sin dato'
          : null,
    codigo, libre, noReconocida,
  }

  const polizaTexto = emb?.polizaDigitos ?? seguroLeido.poliza
  const origenPoliza: OrigenValor = emb ? deOrigen(emb.origen.poliza) : polizaTexto !== '' ? 'leido' : 'sin_dato'
  const poliza: ValoresQueViajan['poliza'] = {
    valor: polizaTexto === '' ? null : polizaTexto,
    origen: origenPoliza,
    nota: origenPoliza === 'riesgo' && polizaTexto === '' ? 'el nº declarado arriba no llega a los 5 últimos caracteres'
      : origenPoliza === 'leido' ? NOTA_LEIDO : origenPoliza === 'sin_dato' ? 'Sin dato' : null,
  }

  const aseguradoArriba = arriba?.aniosAsegurado ?? null
  const limpiosLeidos = sa?.aniosSinSiniestros ?? null
  const aniosAsegurado: ValoresQueViajan['aniosAsegurado'] = aseguradoArriba !== null
    ? { valor: historial.aniosAsegurado, origen: 'riesgo', nota: null }
    : limpiosLeidos !== null && limpiosLeidos > HISTORIAL_MAXIMO.aniosAsegurado
      ? { valor: historial.aniosAsegurado, origen: 'leido', nota: `${NOTA_LEIDO} (sus años sin siniestros)` }
      : { valor: historial.aniosAsegurado, origen: 'supuesto', nota: notaSupuesto(`${anios(historial.aniosAsegurado)}, el máximo; lo contrasta SINCO`) }

  const aniosEnCompania: ValoresQueViajan['aniosEnCompania'] = (arriba?.aniosEnCompania ?? null) !== null
    ? { valor: historial.aniosEnCompania, origen: 'riesgo', nota: null }
    : { valor: historial.aniosEnCompania, origen: 'supuesto', nota: notaSupuesto(`${anios(historial.aniosEnCompania)}, los años asegurado como mucho ${HISTORIAL_MAXIMO.aniosEnCompania}`) }

  const sinSiniestrosValor = emb ? Number(emb.aniosSinSiniestros) : historial.aniosSinSiniestros
  const aniosSinSiniestros: ValoresQueViajan['aniosSinSiniestros'] = emb?.origen.sinSiniestros === 'arriba'
    ? { valor: sinSiniestrosValor, origen: 'riesgo', nota: null }
    : limpiosLeidos !== null
      ? { valor: sinSiniestrosValor, origen: 'leido', nota: sinSiniestrosValor < limpiosLeidos ? `${NOTA_LEIDO}, topado a los años asegurado` : NOTA_LEIDO }
      : { valor: sinSiniestrosValor, origen: 'supuesto', nota: notaSupuesto(`${anios(sinSiniestrosValor)}, el máximo; lo contrasta SINCO`) }

  const s5Texto = emb ? emb.siniestrosUltimos5 : historial.siniestrosUltimos5 === null ? '' : String(historial.siniestrosUltimos5)
  const s5Valor = s5Texto === '' ? null : Number(s5Texto)
  const siniestrosUltimos5: ValoresQueViajan['siniestrosUltimos5'] = emb?.origen.siniestros5 === 'arriba'
    ? { valor: s5Valor, origen: 'riesgo', nota: null }
    : (sa?.siniestrosUltimos5 ?? null) !== null
      ? { valor: s5Valor, origen: 'leido', nota: NOTA_LEIDO }
      : s5Valor !== null
        ? { valor: s5Valor, origen: 'supuesto', nota: notaSupuesto(s5Valor === 0 ? 'ninguno' : String(s5Valor)) }
        : { valor: null, origen: 'sin_dato', nota: 'Sin dato · solo hace falta con menos de 5 años sin siniestros; si la compañía lo exige, lo dirá sin cobrar' }

  return { garaje, km, fechaCompra, tieneSeguro, compania, poliza, aniosAsegurado, aniosEnCompania, aniosSinSiniestros, siniestrosUltimos5 }
}

export type CampoHistorial = 'aniosAsegurado' | 'aniosEnCompania' | 'aniosSinSiniestros' | 'siniestrosUltimos5'

/**
 * PURA. La nota de una fila SIN DATO de «Historial y bonificaciones» (15/10/2026): con qué se cotizará. Los años solo
 * viajan con seguro en vigor; sin él (declarado que no, o sin dato) se dice que no viajan, nunca un «se cotizará con 10».
 */
export function notaCotizaraHistorial(v: ValoresQueViajan, campo: CampoHistorial): string | null {
  if (v.tieneSeguro.valor !== true) {
    return v.tieneSeguro.origen === 'riesgo'
      ? 'Sin dato · no viaja: declarado sin seguro en vigor'
      : 'Sin dato · solo viaja con seguro en vigor, y no consta que lo tenga (se cotiza «de calle»)'
  }
  const c = v[campo]
  if (c.origen === 'riesgo') return null
  if (c.origen === 'leido' && c.valor !== null) {
    const x = campo === 'siniestrosUltimos5' ? (c.valor === 0 ? 'ninguno' : String(c.valor)) : anios(c.valor)
    return `Sin dato aquí · se cotizará con ${x} (${c.nota ?? NOTA_LEIDO})`
  }
  return c.nota
}

/** Lo que el riesgo dice del seguro de hoy, para la verificación: arriba no dice si tiene seguro ni hay póliza leída. */
export function tieneSeguroSinDato(v: ValoresQueViajan): boolean {
  return v.tieneSeguro.origen === 'supuesto'
}

export type FormularioInicialAuto = {
  garaje: string
  kmAnuales: string
  /** '' = sigue a la matriculación (no se manda nada). */
  fechaCompra: string
  tieneSeguroActual: boolean
  companiaActualCodigo: string
  companiaActualLibre: string
  polizaActualDigitos: string
  aniosAsegurado: string
  aniosEnCompania: string
  aniosSinSiniestros: string
  siniestrosUltimos5: string
}

/** PURA. El estado con el que NACE el cotizador de coche (los textos de sus campos), sacado de `valoresQueViajan`. */
export function formularioInicial(v: ValoresQueViajan): FormularioInicialAuto {
  const txt = (n: number | null) => (n === null ? '' : String(n))
  return {
    garaje: v.garaje.valor ?? '',
    kmAnuales: txt(v.km.valor),
    fechaCompra: v.fechaCompra.origen === 'riesgo' ? v.fechaCompra.valor ?? '' : '',
    tieneSeguroActual: v.tieneSeguro.valor === true,
    companiaActualCodigo: v.compania.codigo,
    companiaActualLibre: v.compania.libre,
    polizaActualDigitos: v.poliza.valor ?? '',
    aniosAsegurado: txt(v.aniosAsegurado.valor),
    aniosEnCompania: txt(v.aniosEnCompania.valor),
    aniosSinSiniestros: txt(v.aniosSinSiniestros.valor),
    siniestrosUltimos5: txt(v.siniestrosUltimos5.valor),
  }
}
