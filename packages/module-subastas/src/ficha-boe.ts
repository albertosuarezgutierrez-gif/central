// ────────────────────────────────────────────────────────────────────────────
// Parseo PURO de la ficha del Portal de Subastas del BOE
// (`subastas.boe.es/detalleSubasta.php?idSub=…`), que es donde viven las CIFRAS
// que el correo de alerta no trae: valor de subasta, tasación, tramos, depósito,
// cantidad reclamada, y la situación posesoria real del bien.
//
// La ficha son tres pestañas (`&ver=N`), todas con la misma forma
// `<tr><th>Etiqueta</th><td>Valor</td></tr>`:
//   · general   → identificador, fechas, importes
//   · ver=2     → autoridad gestora (juzgado/notaría) con teléfono y correo
//   · ver=3     → el bien: dirección postal, provincia, posesión, visitable
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
