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
import { norm } from './parsing.ts'

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

/**
 * ¿El HTML recibido es DE VERDAD la ficha de esa subasta?
 *
 * 🚨 Sin esta comprobación, cualquier respuesta 200 que no sea la ficha (página
 * de error del Portal, muro de un WAF, mantenimiento) produce `enlacesDocumentos
 * → []`, que se persiste como «esta subasta no publica documentos» — y la cola
 * del cron no vuelve a mirarla nunca. Es la MISMA mentira que motivó todo esto,
 * pero grabada en la BD en vez de pintada en pantalla.
 *
 * Las fichas reales siempre traen los enlaces de sus pestañas
 * (`detalleSubasta.php?idSub=<id>&ver=N`), tengan o no adjuntos — verificado el
 * 30/07/2026 contra fichas vivas CON documentos y SIN ellos.
 */
export function fichaLegible(html: string, identificador: string): boolean {
  if (!html || !identificador) return false
  const id = identificador.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`detalleSubasta\\.php\\?idSub=${id}(&amp;|&)ver=`, 'i').test(html)
}

/**
 * Hasta dónde deja VER el Portal los documentos de esta ficha a quien no ha
 * iniciado sesión.
 *
 * 🚨 Caso real (SUB-JA-2026-262097, queja de Alberto el 20/08/2026): la ficha
 * publica «SUBASTA LOCAL COMERCIAL» y «CERTIFICACIÓN DE CARGAS LOCAL COMERCIAL»,
 * y la app decía «Cargas no publicadas: pide la certificación registral antes de
 * pujar». Lo que pasa es que el bloque «Información complementaria» —donde vive
 * la lista de documentos— el Portal SOLO se lo enseña a los usuarios
 * identificados en unas subastas y no en otras (lo decide la autoridad gestora).
 * El cron entra anónimo, recibe un 200 con la ficha entera y CERO enlaces, y ese
 * «no lo veo» se grababa como «no lo hay». Auditado el mismo día: las 8 subastas
 * vivas que decían «no publicadas» tenían las tres el muro; NINGUNA carecía de
 * documentos de verdad.
 *
 * `fichaLegible` no lo detecta y no puede: la ficha ES la ficha, con sus datos y
 * sus pestañas. Lo que falta es el bloque, no la página.
 *
 *  · `ninguno` — el Portal enseña la lista entera: un `[]` aquí sí significa
 *    «esta subasta no adjunta documentos».
 *  · `parcial` — enseña ALGUNOS y anuncia que hay más tras el login: la lista
 *    que se lea está incompleta, así que no se puede afirmar que falte nada.
 *  · `total`   — no enseña ninguno: no sabemos siquiera cuántos hay.
 */
export type MuroDocumental = 'ninguno' | 'parcial' | 'total'

export function muroDocumental(html: string): MuroDocumental {
  // Sin etiquetas y sin entidades: el aviso lleva un <strong> justo en medio
  // («debe <strong>Iniciar sesión</strong>») y el Portal escribe los acentos
  // como `&#xF3;`, así que buscar sobre el HTML crudo no encuentra nada.
  const t = norm(decodificarHtml(html.replace(/<[^>]*>/g, ' ')))
  if (!/informacion complementaria debe iniciar sesion/.test(t)) return 'ninguno'
  // «Para consultar MÁS información complementaria…» = ha enseñado algunos.
  return /consultar mas informacion complementaria/.test(t) ? 'parcial' : 'total'
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

/**
 * Recupera la señal «vivienda habitual» desde las NOTAS persistidas
 * (`subastas.notas_edicto` guarda las líneas de `notasDeEdicto`, no el
 * `DatosEdicto` estructurado). Es el inverso de las tres líneas de abajo — el
 * test de round-trip fija que no diverjan. `null` = el edicto no lo dijo.
 */
export function viviendaHabitualDeNotas(notas: string | null | undefined): DatosEdicto['viviendaHabitual'] {
  if (!notas) return null
  if (/ES la vivienda habitual/.test(notas)) return 'si'
  if (/NO es la vivienda habitual/.test(notas)) return 'no'
  if (/Vivienda habitual del demandado: no consta/.test(notas)) return 'no_consta'
  return null
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
