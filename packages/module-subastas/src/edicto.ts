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
  /** Certificación registral: «NO hay cargas registradas» en procedencia. */
  sinCargasProcedencia: boolean
  /** Certificación: no existen asientos de titulares POSTERIORES a la hipoteca. */
  sinTitularesPosteriores: boolean
  /** Certificación: hay anotación de EMBARGO (administrativo o judicial). */
  anotacionEmbargo: boolean
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
    // Señales de la CERTIFICACIÓN DE DOMINIO Y CARGAS (los dos formatos vistos
    // en fixtures reales: la del Registro 16 en prosa y la del 11 tabulada).
    // OJO: pdf-parse extrae estos PDFs con las palabras PEGADAS
    // («CARGASPROCEDENCIA NOhaycargasregistradas») — verificado en producción
    // el 29/07/2026 — así que el separador entre palabras es \s* (opcional).
    sinCargasProcedencia: /CARGAS\s*PROCEDENCIA\s*NO\s*hay\s*cargas\s*registradas/i.test(t),
    sinTitularesPosteriores: /no\s*existir\s*asientos\s*vigentes\s*de\s*titulares\s*de\s*derechos\s*inscritos\s*con\s*posterioridad/i.test(t),
    anotacionEmbargo: /Texto\s*literal:\s*EL\s*EMBARGO\s*a\s*favor\s*de/i.test(t) || /Tipo\s*anotaci[oó]n:\s*Embargo/i.test(t),
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
  if (d.sinCargasProcedencia) notas.push('Certificación: sin cargas de procedencia registradas')
  if (d.sinTitularesPosteriores) notas.push('Certificación: sin acreedores posteriores a la hipoteca que se ejecuta')
  if (d.anotacionEmbargo) notas.push('⚠️ Certificación: anotación de EMBARGO — revisar importe, vigencia y si es posterior (se cancelaría)')
  return notas
}
