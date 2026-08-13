// ────────────────────────────────────────────────────────────────────────────
// Adaptador de SURUS IN SITU (surusin.com). PURO.
//
// Qué es: portal privado de subastas electrónicas de activos en liquidación
// (concursal y de fondos). No es el BOE — aquí no hay LEC 670, ni umbral del
// 70%, ni Mesa: el vendedor se reserva adjudicar o no, y el COMPRADOR paga una
// comisión al portal. Eso es lo que cambia los números frente a una subasta
// oficial y por eso vale la pena tratarlo como fuente propia.
//
// ── QUÉ SE PARSEA Y CONTRA QUÉ SE VALIDÓ ───────────────────────────────────
// Este parser lee la FICHA DEL LOTE en texto plano (la que Surus genera en PDF
// y publica en la página del lote), validada carácter a carácter contra la
// ficha real de «VIVIENDA EN SANTILLANA DEL MAR (CANTABRIA)» de 08/2026 — ver
// `test/fixtures-surus.ts`, copiado del documento, no escrito a mano.
//
// 🚨 LO QUE **NO** ESTÁ VALIDADO: el correo de alerta de Surus. Cuando se
// escribió esto (13/08/2026) Alberto acababa de darse de alta y no había
// llegado ninguno, así que inventarse su maquetación habría sido escribir el
// parser y el fixture con la misma suposición equivocada. La ingesta por
// correo (`apps/plataforma/lib/subastas/surus.ts`) aplica ESTE mismo lector de
// etiquetas al texto del correo: si Surus usa su vocabulario de siempre, sale
// la ficha; si no, sale `null` y el cron lo CUENTA como «no se pudo leer»
// (nunca lo da por «no había nada»).
//
// Las etiquetas son fijas y muy distintivas («Valor De Tasación:», «Situación
// Posesoria», «M2 Construido»), en ese Título Con Mayúsculas Raro que usa el
// gestor de contenidos de Surus. Se buscan sin acentos ni mayúsculas para que
// un cambio de tilde no rompa la lectura.
// ────────────────────────────────────────────────────────────────────────────

import { norm, parseImporteEs } from './parsing.ts'
import { provinciaCanonica } from './geo.ts'
import type { SituacionPosesoria, SubastaInmueble } from './types.ts'

/** Dominio del portal. Sirve para reconocer sus enlaces y su remitente. */
export const DOMINIO_SURUS = 'surusin.com'

/**
 * Comisión que Surus carga al COMPRADOR: 5% del precio final + 400 € fijos,
 * más el 21% de IVA. Publicada en las condiciones de todos sus lotes de
 * inmuebles; el parser la lee del texto y esto es solo el respaldo.
 */
export const COMISION_SURUS = { pct: 0.05, fija: 400, iva: 0.21 } as const

/** Ficha de un lote de Surus, con lo que la propia ficha declara. */
export interface LoteSurus {
  /** Título del lote, tal cual encabeza la ficha. */
  titulo: string
  /** Municipio de la línea «Localización». */
  municipio: string | null
  provincia: string | null
  /** Dirección postal completa de la sección «Ubicación». */
  direccion: string | null
  codigoPostal: string | null
  /** Precio de salida (a partir del cual se puja). */
  precioSalida: number | null
  tasacion: number | null
  /** Depósito de garantía EXIGIDO por el portal (no es el 5% de la LEC). */
  deposito: number | null
  fechaInicio: string | null
  fechaFin: string | null
  refCatastral: string | null
  /** m² construidos, según la ficha. */
  superficie: number | null
  /** m² de parcela, cuando el lote es una casa con terreno. */
  superficieParcela: number | null
  anioConstruccion: number | null
  usoPrincipal: string | null
  situacionPosesoria: SituacionPosesoria
  /**
   * `true` si la ficha declara que se vende libre de cargas hipotecarias.
   * `false` si declara cargas, `null` si NO dice nada — que no es lo mismo.
   */
  libreDeCargas: boolean | null
  cargasTexto: string | null
  /** Comisión del portal leída de la ficha. `null` = la ficha no la publica. */
  comision: { pct: number | null; fija: number | null } | null
  /**
   * `true` cuando la ficha declara que la finca todavía NO está inscrita a
   * nombre del vendedor («En trámite de inscripción»). Riesgo real de plazo,
   * no una curiosidad: sin inscripción no hay escritura.
   */
  registroEnTramite: boolean
}

/** ¿Este texto es una ficha/aviso de Surus? Conservador a propósito. */
export function esSurus(texto: string | null | undefined): boolean {
  if (!texto) return false
  const t = norm(texto)
  return t.includes('surusin') || t.includes('surus in situ') || t.includes('@surusin.com')
}

/**
 * Lee la ficha de un lote. Devuelve `null` cuando el texto no trae las señales
 * mínimas de una ficha (un título Y al menos un dato duro: precio, depósito o
 * referencia catastral). Preferimos NO ingerir a ingerir una fila hueca que
 * luego se lea como «este lote no tiene datos» — que es otra cosa.
 */
export function parsearLoteSurus(texto: string | null | undefined): LoteSurus | null {
  if (!texto || !texto.trim()) return null
  // La ficha viene de un PDF pasado a texto: el corte de página deja un salto
  // de formulario pegado a la línea siguiente y partiría una etiqueta en dos.
  const lineas = texto.replace(/\f/g, '\n').split(/\r?\n/).map((l) => l.trimEnd())
  const plano = lineas.join('\n')

  const titulo = tituloDe(lineas.map((l) => l.trim()))
  const ubicacion = valorTrasEtiqueta(plano, 'ubicacion')
  const localizacion = localizacionDe(plano)
  const provincia = provinciaDe(titulo, ubicacion, localizacion)

  const ficha: LoteSurus = {
    titulo,
    municipio: municipioDe(localizacion, ubicacion),
    provincia,
    direccion: ubicacion,
    codigoPostal: ubicacion?.match(/\b(\d{5})\b/)?.[1] ?? null,
    precioSalida: importeTrasEtiqueta(plano, 'precio de salida'),
    tasacion:
      importeTrasEtiqueta(plano, 'valor de tasacion') ?? importeTrasEtiqueta(plano, 'valor de tasación'),
    deposito:
      importeTrasEtiqueta(plano, 'deposito de garantia') ??
      importeTrasEtiqueta(plano, 'cantidad solicitada como deposito'),
    fechaInicio: fechaEtiquetada(plano, 'fecha inicio'),
    fechaFin: fechaEtiquetada(plano, 'fecha fin'),
    refCatastral: refCatastralSurus(plano),
    superficie: numeroTrasEtiqueta(plano, 'm2 construido'),
    superficieParcela: numeroTrasEtiqueta(plano, 'm2 de parcela'),
    anioConstruccion: anioDe(plano),
    usoPrincipal: valorTrasEtiqueta(plano, 'uso principal'),
    situacionPosesoria: posesionDe(valorTrasEtiqueta(plano, 'situacion posesoria')),
    ...cargasDe(plano),
    comision: comisionDe(plano),
    registroEnTramite: /en tramite de inscripcion/.test(norm(valorTrasEtiqueta(plano, 'datos registrales') ?? '')),
  }

  const hayDatoDuro =
    ficha.precioSalida != null || ficha.tasacion != null ||
    ficha.deposito != null || ficha.refCatastral != null
  return ficha.titulo && hayDatoDuro ? ficha : null
}

/**
 * Lote → contrato común. `url` e `id` los aporta quien descarga (la ficha en
 * PDF no los lleva dentro), y sin ninguno de los dos la clave de dedupe se
 * deriva del título + la salida, que es lo único estable que queda.
 *
 * `tipo: 'concursal'` porque el catálogo de Surus es liquidación de activos,
 * NO ejecución judicial: aquí no aplican los umbrales del art. 670 LEC.
 */
export function loteASubasta(
  l: LoteSurus,
  opciones: { url?: string | null; id?: string | null } = {},
): SubastaInmueble {
  const id = opciones.id ?? idDeUrl(opciones.url) ?? null
  return {
    dedupeKey: `surus:${id ?? claveDeTitulo(l)}`,
    fuente: 'surus',
    identificador: id,
    tipo: 'concursal',
    autoridad: 'Surus in situ',
    provincia: l.provincia,
    municipio: l.municipio,
    direccion: l.direccion,
    codigoPostal: l.codigoPostal,
    descripcion: l.titulo || null,
    url: opciones.url ?? null,
    fechaInicio: l.fechaInicio,
    fechaFin: l.fechaFin,
    valorSubasta: l.precioSalida,
    tasacion: l.tasacion,
    deposito: l.deposito,
    // Surus no publica puja mínima ni tramo fijo (los saltos son por escala),
    // así que se quedan sin declarar en vez de inventados.
    pujaMinima: null,
    tramos: null,
    // Sin importe de cargas: la ficha dice si se vende libre, no cuánto. Un 0
    // aquí sería afirmar «no hay cargas» con un dato que no se ha leído.
    cargas: l.libreDeCargas === true ? 0 : null,
    cargasTexto: l.cargasTexto,
    cargasConocidas: l.libreDeCargas != null,
    situacionPosesoria: l.situacionPosesoria,
    // Vendedor en liquidación (concursal o fondo) = persona jurídica. Aun así
    // una vivienda de segunda mano suele ir por ITP (exención del art. 20.Uno.22
    // LIVA), así que se deja `desconocido` y que lo declare el aviso del coste
    // en vez de forzar el IVA+AJD por el tipo de vendedor.
    ejecutado: 'desconocido',
    refCatastral: l.refCatastral,
    superficie: l.superficie,
    superficieOrigen: l.superficie != null ? 'anuncio' : null,
    anioConstruccion: l.anioConstruccion,
    usoCatastral: l.usoPrincipal,
    sinVisita: false, // Surus SÍ organiza visitas; lo dice en sus condiciones.
  }
}

// ── Lectores de etiqueta ────────────────────────────────────────────────────
// Surus escribe «Etiqueta: valor» o «Etiqueta\nvalor» según la sección, así que
// se aceptan las dos formas de un tirón.

/** Texto que sigue a una etiqueta, en la misma línea o en la siguiente. */
function valorTrasEtiqueta(texto: string, etiqueta: string): string | null {
  const lineas = texto.split('\n')
  const objetivo = norm(etiqueta)
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i]
    if (!l) continue
    const n = norm(l)
    if (!n.startsWith(objetivo)) continue
    const resto = l.slice(etiqueta.length).replace(/^\s*:?\s*/, '').trim()
    if (resto) return resto
    // Etiqueta sola: el valor va en la primera línea no vacía de debajo.
    for (let j = i + 1; j < lineas.length && j <= i + 3; j++) {
      if (lineas[j]) return lineas[j].trim()
    }
    return null
  }
  return null
}

function importeTrasEtiqueta(texto: string, etiqueta: string): number | null {
  const v = valorTrasEtiqueta(texto, etiqueta)
  if (v) {
    const m = v.match(/-?[\d.,]+\s*(?:€|eur)/i) ?? v.match(/-?[\d.,]+/)
    const n = m ? parseImporteEs(m[0]) : null
    if (n != null) return n
  }
  return importeColumnar(texto, etiqueta)
}

/**
 * Importe de una TABLA de dos filas: los rótulos en una línea y los valores
 * alineados debajo. Así publica Surus la cabecera del lote —
 *
 *   Tipo de inmueble       Precio de salida       Valor de tasación
 *   Viviendas              30.000,00 €            120.000 €
 *
 * — y por eso «Precio de salida» no se puede leer como «etiqueta: valor». Se
 * empareja por POSICIÓN: de los importes de la fila de valores gana el que
 * empieza más cerca de la columna del rótulo. Si el más cercano está a más de
 * media tabla de distancia se descarta: preferimos no leerlo a leer el de al
 * lado (confundir la salida con la tasación sería un error de 90.000 €).
 */
function importeColumnar(texto: string, etiqueta: string): number | null {
  const lineas = texto.split('\n')
  const objetivo = norm(etiqueta)
  for (let i = 0; i < lineas.length; i++) {
    const cabecera = lineas[i]
    if (!cabecera || !/\s{2,}/.test(cabecera)) continue
    const col = cabecera.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().indexOf(objetivo)
    if (col < 0) continue

    for (let j = i + 1; j < lineas.length && j <= i + 4; j++) {
      const valores = lineas[j]
      if (!valores?.trim()) continue
      let mejor: { n: number; d: number } | null = null
      for (const m of valores.matchAll(/-?\d[\d.,]*\s*(?:€|eur)/gi)) {
        const n = parseImporteEs(m[0])
        if (n == null) continue
        const d = Math.abs((m.index ?? 0) - col)
        if (!mejor || d < mejor.d) mejor = { n, d }
      }
      // Tolerancia: la mitad del ancho de la tabla, nunca más.
      if (mejor && mejor.d <= Math.max(20, cabecera.trimEnd().length / 2)) return mejor.n
      break
    }
  }
  return null
}

function numeroTrasEtiqueta(texto: string, etiqueta: string): number | null {
  const v = valorTrasEtiqueta(texto, etiqueta)
  if (!v) return null
  const m = v.match(/[\d.,]+/)
  const n = m ? parseImporteEs(m[0]) : null
  return n != null && n > 0 ? n : null
}

/**
 * «Año Construcción: 1.945» → 1945. Surus escribe el año con punto de millar,
 * así que `parseImporteEs` lo leería bien pero un año fuera de rango es más
 * probablemente otra cosa (una superficie, un importe): se descarta.
 */
function anioDe(texto: string): number | null {
  const n = numeroTrasEtiqueta(texto, 'ano construccion') ?? numeroTrasEtiqueta(texto, 'año construcción')
  if (n == null) return null
  const anio = Math.round(n)
  return anio >= 1700 && anio <= 2100 ? anio : null
}

/** «10/08/2026 a las 12:30» → ISO. Sin hora se queda a las 00:00. */
function fechaEtiquetada(texto: string, etiqueta: string): string | null {
  const directo = valorTrasEtiqueta(texto, etiqueta)
  // La cabecera de Surus pone los tres rótulos en una fila y los tres valores
  // en la siguiente («Santillana del Mar, España  10/08/2026 a las 12:30  …»),
  // así que si la etiqueta no trae su valor pegado se cae a las fechas en orden.
  const candidatas = directo && /\d{2}\/\d{2}\/\d{4}/.test(directo)
    ? [directo]
    : fechasDeCabecera(texto)
  const cual = etiqueta.includes('fin') ? candidatas[candidatas.length - 1] : candidatas[0]
  return cual ? aIso(cual) : null
}

function fechasDeCabecera(texto: string): string[] {
  const linea = texto
    .split('\n')
    .find((l) => (l.match(/\d{2}\/\d{2}\/\d{4}/g) ?? []).length >= 2)
  if (!linea) return []
  return linea.match(/\d{2}\/\d{2}\/\d{4}(?:\s+a las\s+\d{1,2}[:.]\d{2})?/g) ?? []
}

function aIso(raw: string): string | null {
  const f = raw.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (!f) return null
  const h = raw.match(/a las\s+(\d{1,2})[:.](\d{2})/i)
  const hora = h ? `${h[1].padStart(2, '0')}:${h[2]}` : '00:00'
  return `${f[3]}-${f[2]}-${f[1]}T${hora}:00`
}

/** Referencia catastral de la sección «Datos Catastrales» (14 o 20 caracteres). */
function refCatastralSurus(texto: string): string | null {
  const v = valorTrasEtiqueta(texto, 'datos catastrales')
  const m = (v ?? texto).match(/\b[0-9A-Z]{14}(?:[0-9A-Z]{6})?\b/)
  return m ? m[0] : null
}

/** Primera línea con contenido: el título del lote. Se une si viene partido. */
function tituloDe(lineas: string[]): string {
  const utiles: string[] = []
  for (const l of lineas) {
    if (!l) {
      if (utiles.length) break
      continue
    }
    if (/^(localizacion|localización|tipo de inmueble)\b/i.test(l)) break
    utiles.push(l)
    if (l.endsWith('.') && utiles.join(' ').length > 12) break
    if (utiles.length >= 3) break
  }
  return utiles.join(' ').replace(/\s+/g, ' ').trim()
}

/** «Santillana del Mar, España» de la fila de cabecera. */
function localizacionDe(texto: string): string | null {
  const linea = texto.split('\n').find((l) => /,\s*Espa(ñ|n)a\b/i.test(l) && /\d{2}\/\d{2}\/\d{4}/.test(l))
  if (linea) return linea.split(/\s{2,}/)[0].trim() || null
  return texto.split('\n').find((l) => /,\s*Espa(ñ|n)a\s*$/i.test(l))?.trim() ?? null
}

function municipioDe(localizacion: string | null, ubicacion: string | null): string | null {
  const fuente = localizacion ?? ubicacion
  if (!fuente) return null
  const partes = fuente.split(',').map((p) => p.trim()).filter(Boolean)
  // «Santillana del Mar, España» → el municipio es lo de delante de España.
  const sinPais = partes.filter((p) => !/^espa(ñ|n)a$/i.test(p))
  if (!sinPais.length) return null
  if (localizacion) return sinPais[0] || null
  // De una dirección postal («Bo. Riaño, 11, 39314 Santillana del Mar,
  // Cantabria») el municipio va pegado al código postal.
  const conCp = sinPais.find((p) => /^\d{5}\s+\S/.test(p))
  return conCp ? conCp.replace(/^\d{5}\s+/, '').trim() : null
}

function provinciaDe(titulo: string, ubicacion: string | null, localizacion: string | null): string | null {
  // El título de Surus la trae entre paréntesis: «… (CANTABRIA).»
  const entreParentesis = titulo.match(/\(([^)]+)\)/)?.[1] ?? null
  const candidatas = [entreParentesis, ...(ubicacion?.split(',').map((p) => p.trim()) ?? []), localizacion]
  for (const c of candidatas) {
    if (!c) continue
    const canonica = provinciaCanonica(c.replace(/^\d{5}\s+/, ''))
    if (canonica) return canonica
  }
  return null
}

function posesionDe(texto: string | null): SituacionPosesoria {
  if (!texto) return 'desconocida'
  const t = norm(texto)
  if (/\bocupad/.test(t)) return 'ocupada'
  if (/\blibre\b|desocupad|sin ocupantes/.test(t)) return 'libre'
  if (/desconocid/.test(t)) return 'ocupada_desconocida'
  return 'desconocida'
}

/**
 * Cargas. Surus las declara en prosa («Se venderá libre de cargas
 * hipotecarias»), nunca cuantificadas. Se guarda el texto literal y un
 * booleano de tres estados — `null` cuando la ficha no dice nada.
 */
function cargasDe(texto: string): { libreDeCargas: boolean | null; cargasTexto: string | null } {
  const linea = valorTrasEtiqueta(texto, 'cargas')
  if (!linea) return { libreDeCargas: null, cargasTexto: null }
  const t = norm(linea)
  if (/libre de cargas/.test(t)) return { libreDeCargas: true, cargasTexto: linea }
  if (/sin cargas/.test(t)) return { libreDeCargas: true, cargasTexto: linea }
  return { libreDeCargas: false, cargasTexto: linea }
}

/** «5% de la puja + 400 € fijos como gastos de gestión» → {pct:0.05, fija:400}. */
function comisionDe(texto: string): { pct: number | null; fija: number | null } | null {
  const linea =
    valorTrasEtiqueta(texto, 'gastos de gestion') ??
    valorTrasEtiqueta(texto, 'gastos de gestión') ??
    valorTrasEtiqueta(texto, 'comision de venta') ??
    valorTrasEtiqueta(texto, 'comisión de venta')
  if (!linea) return null
  const pct = linea.match(/([\d.,]+)\s*%/)
  const fija = linea.match(/(?:\+|mas|más)\s*([\d.,]+)\s*€/i)
  const p = pct ? parseImporteEs(pct[1]) : null
  const f = fija ? parseImporteEs(fija[1]) : null
  if (p == null && f == null) return null
  return { pct: p != null ? p / 100 : null, fija: f }
}

/** El id del lote va en la URL de Surus; sin URL no hay id que inventar. */
function idDeUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.match(/\/(?:lote|subasta|activo)s?\/([\w-]+)/i) ?? url.match(/[?&]id=([\w-]+)/i)
  return m ? m[1] : null
}

/** Respaldo de dedupe cuando no hay id: título + salida, normalizados. */
function claveDeTitulo(l: LoteSurus): string {
  const t = norm(l.titulo).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70)
  return `${t || 'lote'}:${l.precioSalida ?? 'sin-precio'}`
}
