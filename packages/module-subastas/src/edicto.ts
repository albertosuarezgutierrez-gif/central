// ────────────────────────────────────────────────────────────────────────────
// Documentos adjuntos a la ficha del Portal de Subastas del BOE. PURO.
//
// La ficha lista sus documentos como enlaces `verDocumento.php?idSub=…&idDoc=…`
// (verificado el 29/07/2026 contra dos fichas reales: EDICTO, CERTIFICACIÓN DE
// CARGAS, CESIÓN DEL CRÉDITO…). Los edictos y las escrituras suelen traer capa
// de texto; las certificaciones registrales suelen ser escaneos (esas no se
// pueden leer aquí — quedan para el flujo manual del chat).
//
// Del texto del edicto SOLO se extraen señales EXPLÍCITAS. Lección del día:
// el boilerplate legal contiene «para el caso de que el inmueble estuviera
// ocupado…» — un detector ingenuo de "ocupado" se envenena con la plantilla,
// así que aquí no se infiere ocupación jamás; solo frases literales.
// Errata REAL vista: «VIVENDA HABITUAL DEL DEMANDADO» (sin la primera I).
// ────────────────────────────────────────────────────────────────────────────
import { decodificarHtml } from './email-boe.ts'

const BASE = 'https://subastas.boe.es/'

/** Un documento adjunto a la ficha. */
export interface DocumentoFicha {
  /** Identificador del documento en el portal («1-a32c…»). */
  idDoc: string
  /** Título del enlace, tal cual lo publica el portal («EDICTO», …). */
  titulo: string
  /** URL absoluta de descarga. */
  url: string
}

/** Señales explícitas halladas en el texto de un edicto. */
export interface DatosEdicto {
  /** El edicto dice literalmente que NO consta la situación posesoria. */
  posesionNoConsta: boolean
  /** «VIVIENDA HABITUAL DEL DEMANDADO: SI|NO|NO CONSTA», si aparece. */
  viviendaHabitual: 'si' | 'no' | 'no_consta' | null
  /** La ejecución va contra una herencia yacente (titular fallecido). */
  herenciaYacente: boolean
}

/** Enlaces a documentos de una ficha del portal (HTML de cualquier pestaña). */
export function enlacesDocumentos(html: string): DocumentoFicha[] {
  const docs: DocumentoFicha[] = []
  const vistos = new Set<string>()
  const re = /<a[^>]+href="(verDocumento\.php\?[^"]*idDoc=([^"&]+)[^"]*)"[^>]*>([^<]*)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const idDoc = m[2]
    if (vistos.has(idDoc)) continue
    vistos.add(idDoc)
    docs.push({
      idDoc,
      titulo: decodificarHtml(m[3]).trim() || 'Documento',
      url: BASE + decodificarHtml(m[1]),
    })
  }
  return docs
}

/** Señales explícitas del texto de un edicto. Nunca infiere: solo literales. */
export function datosDeEdicto(texto: string): DatosEdicto {
  const t = texto.replace(/\s+/g, ' ')
  const vh = t.match(/VIVI?ENDA HABITUAL DEL DEMANDADO\s*:?\s*(NO CONSTA|S[IÍ]|NO)\b/i)
  return {
    posesionNoConsta: /No consta la situaci[oó]n posesoria/i.test(t),
    viviendaHabitual: vh
      ? vh[1].toUpperCase() === 'NO CONSTA'
        ? 'no_consta'
        : vh[1].toUpperCase() === 'NO'
          ? 'no'
          : 'si'
      : null,
    herenciaYacente: /HERENCIA YACENTE/i.test(t),
  }
}

/** Los hallazgos, como líneas legibles para la ficha. `[]` = nada explícito. */
export function notasDeEdicto(d: DatosEdicto): string[] {
  const notas: string[] = []
  if (d.herenciaYacente) notas.push('⚖️ Ejecución contra herencia yacente (titular fallecido)')
  if (d.viviendaHabitual === 'no') notas.push('El edicto declara que NO es la vivienda habitual del demandado')
  if (d.viviendaHabitual === 'si') notas.push('⚠️ El edicto declara que ES la vivienda habitual del demandado')
  if (d.viviendaHabitual === 'no_consta') notas.push('Vivienda habitual del demandado: no consta')
  if (d.posesionNoConsta) notas.push('El edicto no concreta la situación posesoria')
  return notas
}
