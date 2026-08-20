// ────────────────────────────────────────────────────────────────────────────
// Parseo PURO de la ficha del Portal de Subastas del BOE
// (`subastas.boe.es/detalleSubasta.php?idSub=…`), que es donde viven las CIFRAS
// que el correo de alerta no trae: valor de subasta, tasación, tramos, depósito,
// cantidad reclamada, y la situación posesoria real del bien.
//
// La ficha son varias pestañas (`&ver=N`); las de datos comparten la forma
// `<tr><th>Etiqueta</th><td>Valor</td></tr>`:
//   · general   → identificador, fechas, importes
//   · ver=2     → autoridad gestora (juzgado/notaría) con teléfono y correo
//   · ver=3     → el bien: dirección postal, provincia, posesión, visitable
//   · ver=5     → PUJAS (ver `pujasDeFicha` al final): ni la general ni ninguna
//                 otra publica lo que ha pujado nadie, solo esta.
//
// CENTINELAS: el portal escribe «Sin lotes», «No consta» y —crítico— «0,00 €»
// cuando NO hay dato. Un 0 que se cuele como número haría dividir por cero en
// el descuento y produciría un chollo falso. Todos ellos se traducen a `null`.
// EXCEPCIÓN deliberada: «Sin puja mínima» NO es falta de dato — es el portal
// declarando que cualquier postura es admisible. Se traduce a `pujaMinima: 0`
// («revisado: no hay mínimo»), distinto del `null` de «no publicado». Un
// «Puja mínima: 0,00 €» numérico sigue siendo `null` (no es una declaración).
// ────────────────────────────────────────────────────────────────────────────

import { decodificarHtml } from './email-boe.ts'
import { norm, parseFechaEs, parseImporteEs } from './parsing.ts'
import type { Ejecutado, SituacionPosesoria, TipoSubasta } from './types.ts'

/** Todo lo que la ficha aporta por encima del correo de alerta. */
export interface FichaBoe {
  identificador: string | null
  boeId: string | null
  tipo: TipoSubasta | null
  fechaInicio: string | null
  fechaFin: string | null

  valorSubasta: number | null
  tasacion: number | null
  /** `0` = «Sin puja mínima» declarado por el portal · `null` = no publicada. */
  pujaMinima: number | null
  tramos: number | null
  deposito: number | null
  /** Deuda que se reclama en el procedimiento. Contexto útil para pujar. */
  cantidadReclamada: number | null
  lotes: number | null

  descripcion: string | null
  direccion: string | null
  codigoPostal: string | null
  localidad: string | null
  provincia: string | null

  situacionPosesoria: SituacionPosesoria
  /** El registro recoge un arrendamiento: podrías heredar inquilino. */
  arrendamientoInscrito: boolean
  sinVisita: boolean
  ejecutado: Ejecutado

  autoridad: string | null
  telefonoAutoridad: string | null
  emailAutoridad: string | null

  cargas: number | null
  cargasTexto: string | null
  cargasConocidas: boolean
}

/** Extrae los pares `<th>Etiqueta</th><td>Valor</td>` de una pestaña. */
export function paresFicha(html: string): Map<string, string> {
  const out = new Map<string, string>()
  if (!html) return out
  for (const fila of html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? []) {
    const celdas = [...fila.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)]
      .map((m) => decodificarHtml(m[1].replace(/<[^>]+>/g, ' ')))
      .filter((c) => c)
    if (celdas.length >= 2) out.set(norm(celdas[0]).replace(/:$/, ''), celdas[1])
  }
  return out
}

/** Centinelas textuales del portal que significan «no hay dato». */
function vacio(v: string | undefined): boolean {
  if (!v) return true
  return /^(sin\s|no consta$|no aplica|-{1,2}$)/.test(norm(v))
}

function texto(m: Map<string, string>, ...claves: string[]): string | null {
  for (const k of claves) {
    const v = m.get(k)
    if (v && !vacio(v)) return v
  }
  return null
}

/**
 * Importe de la ficha. Devuelve `null` tanto si falta como si vale 0: el
 * portal publica «Tasación 0,00 €» cuando no hay tasación, y tratarlo como
 * cero produciría descuentos infinitos.
 */
function importe(m: Map<string, string>, ...claves: string[]): number | null {
  const v = texto(m, ...claves)
  if (v == null) return null
  const n = parseImporteEs(v)
  return n != null && n > 0 ? n : null
}

/** Las fechas traen la ISO entre paréntesis: se prefiere por inequívoca. */
function fecha(m: Map<string, string>, clave: string): string | null {
  const v = m.get(clave)
  if (!v || vacio(v)) return null
  const iso = v.match(/ISO:\s*([\d\-T:+]+)/i)
  if (iso) {
    const d = new Date(iso[1])
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  return parseFechaEs(v.replace(/\s*\(.*$/, ''))
}

const TIPOS: Array<[RegExp, TipoSubasta]> = [
  [/judicial/, 'judicial'],
  [/notarial/, 'notarial'],
  [/agencia tributaria|aeat/, 'agencia_tributaria'],
  [/seguridad social|tgss/, 'seguridad_social'],
  [/concursal/, 'concursal'],
  [/administrativa/, 'administrativa'],
]

/**
 * Parsea la ficha completa. Las tres pestañas son opcionales: con la general
 * ya se obtienen las cifras, que es lo que desbloquea el scoring.
 */
export function parsearFichaBoe(
  htmlGeneral: string,
  htmlBien = '',
  htmlAutoridad = '',
): FichaBoe {
  const g = paresFicha(htmlGeneral)
  const b = paresFicha(htmlBien)
  const a = paresFicha(htmlAutoridad)

  const tipoRaw = norm(texto(g, 'tipo de subasta') ?? '')
  const tipo = TIPOS.find(([re]) => re.test(tipoRaw))?.[1] ?? null

  const posesionRaw = texto(b, 'situacion posesoria') ?? ''
  const posesionNorm = norm(posesionRaw)
  const arrendamiento = /arrendamiento|arrendaticio|inquilino/.test(posesionNorm)

  let situacionPosesoria: SituacionPosesoria = 'desconocida'
  if (/libre de (ocupantes|arrendatarios)|desocupad/.test(posesionNorm)) situacionPosesoria = 'libre'
  else if (/ocupad/.test(posesionNorm)) situacionPosesoria = 'ocupada'
  // Un arrendamiento inscrito NO es «libre»: se hereda al inquilino. Se trata
  // como ocupación probable aunque el portal diga «no consta».
  else if (arrendamiento) situacionPosesoria = 'ocupada_desconocida'

  const cargasTexto = texto(g, 'cargas') ?? texto(b, 'cargas')

  return {
    identificador: texto(g, 'identificador'),
    boeId: texto(g, 'anuncio boe'),
    tipo,
    fechaInicio: fecha(g, 'fecha de inicio'),
    fechaFin: fecha(g, 'fecha de conclusion'),

    valorSubasta: importe(g, 'valor subasta'),
    tasacion: importe(g, 'tasacion'),
    // «Sin puja mínima» es una declaración, no un hueco: 0 = revisado, no hay.
    pujaMinima: /^sin puja/.test(norm(g.get('puja minima') ?? '')) ? 0 : importe(g, 'puja minima'),
    tramos: importe(g, 'tramos entre pujas'),
    deposito: importe(g, 'importe del deposito'),
    cantidadReclamada: importe(g, 'cantidad reclamada'),
    lotes: (() => {
      const v = texto(g, 'lotes')
      const n = v ? parseImporteEs(v) : null
      return n != null && Number.isInteger(n) && n > 0 ? n : null
    })(),

    descripcion: texto(b, 'descripcion'),
    direccion: texto(b, 'direccion'),
    codigoPostal: texto(b, 'codigo postal'),
    localidad: texto(b, 'localidad'),
    provincia: texto(b, 'provincia'),

    situacionPosesoria,
    arrendamientoInscrito: arrendamiento,
    // «Visitable: No consta» no es un sí: se asume que no hay acceso.
    sinVisita: !/^si/.test(norm(texto(b, 'visitable') ?? '')),
    ejecutado: 'desconocido',

    autoridad: texto(a, 'descripcion'),
    telefonoAutoridad: texto(a, 'telefono'),
    emailAutoridad: texto(a, 'correo electronico'),

    cargas: cargasTexto ? parseImporteEs(cargasTexto) : null,
    cargasTexto,
    cargasConocidas: cargasTexto != null,
  }
}

// ── Resultado tras la conclusión ─────────────────────────────────────────────
// La ficha de una subasta ABIERTA no publica ningún estado (verificado contra
// el portal el 28/07/2026); qué enseña una CONCLUIDA aún no se ha podido ver.
// Este parser es DEFENSIVO: si tras el cierre la ficha trae un estado o una
// puja, lo captura; si no reconoce nada, devuelve `null` y el caller lo deja
// pendiente — nunca inventa. Se valida con la primera conclusión real.

export interface ResultadoSubasta {
  /** concluida | cancelada | suspendida | desierta */
  resultado: string
  /** Mejor puja publicada, si la ficha la enseña. */
  importe: number | null
}

export function resultadoDeFicha(pares: Map<string, string>): ResultadoSubasta | null {
  let estadoRaw: string | null = null
  for (const [k, v] of pares) {
    if (/estado/.test(k)) {
      estadoRaw = norm(v)
      break
    }
  }
  if (!estadoRaw) return null

  let resultado: string | null = null
  if (/desiert/.test(estadoRaw)) resultado = 'desierta'
  else if (/cancelad/.test(estadoRaw)) resultado = 'cancelada'
  else if (/suspendid/.test(estadoRaw)) resultado = 'suspendida'
  else if (/conclui|finaliz/.test(estadoRaw)) resultado = 'concluida'
  if (!resultado) return null
  // Celebrándose / abierta: no es un resultado.
  if (/celebr|abiert/.test(estadoRaw)) return null

  let importe: number | null = null
  for (const [k, v] of pares) {
    if (/puja maxima|mejor puja|importe de adjudicacion/.test(k)) {
      const n = parseImporteEs(texto2(v))
      if (n != null && n > 0) importe = n
      break
    }
  }
  return { resultado, importe }
}

function texto2(html: string): string {
  return decodificarHtml(html.replace(/<[^>]+>/g, ' '))
}

// ── Cierre visto en una ficha REAL (validado el 09/08/2026, El Puerto) ───────
// La primera conclusión real enseñó el marcado: la ficha concluida NO publica
// el estado como par clave/valor (por eso `resultadoDeFicha` devolvía null y el
// cron llevaba semanas logueando «sin estado reconocible») sino como BANNER en
// una caja de aviso: «LA SUBASTA HA CONCLUIDO SU PERIODO DE PUJAS (se encuentra
// pendiente de finalización…)». El desenlace definitivo del periodo de pujas
// vive en el CERTIFICADO DE CIERRE (PDF público, `verCertificadoCierre.php`):
// «La subasta concluyó con pujas (puja máxima X euros)».

/**
 * Detecta el banner de conclusión en el HTML CRUDO de la ficha — no aparece en
 * los pares clave/valor, así que hay que mirar el texto completo.
 * `null` = ningún banner reconocido, que NO es «sigue abierta».
 */
export function resultadoDeBanner(html: string): 'concluida' | null {
  const t = norm(texto2(html))
  return /ha concluido su periodo de pujas/.test(t) ? 'concluida' : null
}

export interface CierreCertificado {
  /**
   * `con_pujas` = hubo remate (la aprobación del LAJ puede seguir pendiente,
   * pero la puja máxima ya es definitiva) · `desierta` = cerró sin pujas.
   */
  resultado: 'con_pujas' | 'desierta'
  /** Puja máxima del certificado (el remate). `null` solo en desiertas. */
  pujaMaxima: number | null
}

/**
 * Desenlace del certificado de cierre (texto extraído de su PDF). Defensivo:
 * si el marcado no se reconoce devuelve `null` y el caller reintenta en la
 * pasada siguiente — nunca inventa.
 */
export function parsearCertificadoCierre(texto: string): CierreCertificado | null {
  const t = norm(texto)
  const con = t.match(/concluyo con pujas[^(]*\(puja maxima ([0-9.,]+) euros?\)/)
  if (con) {
    const n = parseImporteEs(con[1])
    return { resultado: 'con_pujas', pujaMaxima: n != null && n > 0 ? n : null }
  }
  if (/concluyo sin pujas/.test(t)) return { resultado: 'desierta', pujaMaxima: null }
  return null
}

// ── Pestaña «Pujas» (`&ver=5`): la ÚNICA que publica las pujas ───────────────
// Verificado el 20/08/2026 contra fichas reales (3 vivas + 2 concluidas): la
// pestaña GENERAL no publica jamás una puja. Lo que trae —«Puja mínima»,
// «Tramos entre pujas»— son las REGLAS del remate, no lo que ha pujado nadie.
// Las pujas viven en `detalleSubasta.php?idSub=…&ver=5`, y allí el Portal dice
// tres cosas distintas, todas ellas sin sesión:
//   · viva sin pujas → «La subasta no ha recibido pujas.»
//   · viva con pujas → «La subasta ha recibido alguna puja. Para ver su importe
//                       debe acceder como usuario registrado.»
//   · pujas secretas → «La puja máxima de la subasta es secreta.» — la autoridad
//                       gestora ha decidido no publicarlas: no es que no lo
//                       hayamos mirado, es que NO SE VA A SABER (3 de las 13
//                       vivas el 20/08/2026). Prometer una pasada futura que
//                       nunca traerá el dato es la otra forma de mentir.
//   · concluida      → «Puja máxima de la subasta» + el importe del remate
// O sea: el SÍ/NO es público SIEMPRE; el importe en vivo solo con sesión en el
// Portal. Por eso esto son TRES estados y no un número: «sin pujas» (revisado,
// no hay) ≠ «hay pujas de importe desconocido» ≠ «no se ha podido mirar».
// Colapsarlos a `mejorPuja: number | null` fue justo el error anterior: el
// parser miraba la pestaña que nunca lo publica, así que el `null` perpetuo se
// leía como «nadie ha pujado» cuando significaba «no lo hemos mirado».

/** Qué sabemos de las pujas de una subasta tras mirar su pestaña `ver=5`. */
export type EstadoPujas =
  /** El Portal declara que no ha recibido pujas: revisado, no hay. */
  | 'sin_pujas'
  /** Hay al menos una puja (con o sin importe visible). */
  | 'hay_pujas'
  /** La autoridad las declaró SECRETAS: no se sabrá nunca, ni con sesión. */
  | 'secreta'
  /** La pestaña no se ha podido leer: NO afirma nada. */
  | 'no_publicado'

export interface ObservacionPujas {
  estado: EstadoPujas
  /** Importe de la puja más alta. `null` = escondido tras el login, o no hay. */
  importe: number | null
  /** Hay puja pero el Portal esconde el importe: haría falta sesión iniciada. */
  requiereSesion: boolean
}

const PUJAS_SIN_MIRAR: ObservacionPujas = { estado: 'no_publicado', importe: null, requiereSesion: false }

/**
 * Lee la pestaña «Pujas» (`&ver=5`) del Portal. Defensivo por el mismo motivo
 * que `resultadoDeFicha`: si la respuesta no es esa pestaña (error del Portal,
 * redirección a la búsqueda) devuelve `no_publicado` y quien llama NO escribe
 * nada — un fallo de lectura no es un dato.
 *
 * Con sesión iniciada en el Portal, la subasta viva publica el importe en el
 * mismo `<strong>` que la concluida; por eso el importe se busca siempre y no
 * solo en las cerradas.
 */
export function pujasDeFicha(html: string): ObservacionPujas {
  const bloque = bloquePujas(html)
  if (bloque == null) return PUJAS_SIN_MIRAR
  const texto = texto2(bloque)
  const t = norm(texto)

  // El importe manda cuando está: es el dato, no el mensaje de cortesía.
  const importe = importeDestacado(texto)
  if (importe != null) return { estado: 'hay_pujas', importe, requiereSesion: false }

  // «Revisado, no hay»: el único false que el Portal AFIRMA.
  if (/no ha recibido (ninguna |alguna )?puja/.test(t)) {
    return { estado: 'sin_pujas', importe: null, requiereSesion: false }
  }
  // Ausencia DEFINITIVA: la gestora decidió que la puja no se publica. Volver a
  // mirar mañana no la traerá, así que no se puede tratar como «pendiente».
  if (/puja maxima de la subasta es secreta/.test(t)) {
    return { estado: 'secreta', importe: null, requiereSesion: false }
  }
  if (/ha recibido (alguna|una) puja/.test(t)) {
    return { estado: 'hay_pujas', importe: null, requiereSesion: true }
  }
  return PUJAS_SIN_MIRAR
}

/**
 * Aísla el bloque de pujas (`<h3>Pujas</h3>` → `id="idBloqueDatos8"`). Sin este
 * recorte, el «Puja mínima: 0,00 €» de otra pestaña o un importe del pie se
 * colarían como si fueran una puja real.
 */
function bloquePujas(html: string): string | null {
  const i = html.search(/<h3[^>]*>\s*Pujas\s*<\/h3>/i)
  if (i < 0) return null
  const resto = html.slice(i)
  const fin = resto.search(/<div class="bloqueBotones"|<\/div>\s*<!-- \/contenido/i)
  return fin > 0 ? resto.slice(0, fin) : resto
}

/** Primer importe en euros del bloque, en formato español. */
function importeDestacado(texto: string): number | null {
  const m = texto.match(/(\d[\d.]*(?:,\d{1,2})?)\s*€/)
  if (!m) return null
  const n = parseImporteEs(m[1])
  return n != null && n > 0 ? n : null
}
