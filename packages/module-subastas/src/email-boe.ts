// ────────────────────────────────────────────────────────────────────────────
// Parseo PURO de las alertas del Portal de Subastas del BOE que llegan por
// correo (`no-responder@boe.es`, asunto `SUBASTAS BOE: Mi búsqueda "X" de …`).
//
// POR QUÉ ESTA ES LA FUENTE PRINCIPAL Y NO EL SCRAPING: el BOE ya filtra por
// las búsquedas guardadas del usuario y las envía en HTML estructurado. No hay
// que adivinar la forma del sumario, ni pelearse con el 403 que boe.es devuelve
// a IPs de fuera, ni depender de que el portal siga respondiendo. El correo trae
// identificador, estado, fecha de cierre, descripción y enlace a la ficha.
//
// LO QUE EL CORREO **NO** TRAE: tasación, valor de subasta, cargas y depósito.
// Eso vive solo en la ficha del portal y se añade después como enriquecimiento.
// Mientras no esté, el scoring devuelve `null` con su motivo — que es justo lo
// que debe hacer, en vez de inventarse un número.
//
// Sin dependencias: el HTML se trocea con regex a propósito (el módulo es puro
// y no arrastra un parser de DOM).
// ────────────────────────────────────────────────────────────────────────────

import { parseFechaEs } from './parsing.ts'
import type { SubastaInmueble } from './types.ts'

/** Un resultado de alerta, con la búsqueda guardada que lo produjo. */
export interface ResultadoAlertaBoe {
  /** Nombre de la búsqueda guardada: "INMUEBLE SEVILLA", "PUNTA UMBRIA"… */
  busqueda: string
  /** Estado literal del portal: "Celebrándose", "Próxima apertura", "Concluida"… */
  estado: string | null
  subasta: SubastaInmueble
}

const ENTIDADES: Record<string, string> = {
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  ntilde: 'ñ', Ntilde: 'Ñ', uuml: 'ü', Uuml: 'Ü',
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', euro: '€',
}

/** Decodifica las entidades HTML que usa el BOE y colapsa espacios. */
export function decodificarHtml(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => ENTIDADES[name] ?? m)
    .replace(/\s+/g, ' ')
    .trim()
}

/** Quita etiquetas y decodifica. */
function texto(html: string): string {
  return decodificarHtml(html.replace(/<[^>]*>/g, ' '))
}

/**
 * Extrae los pares `<dt>Etiqueta:</dt><dd>valor</dd>` de un bloque. El BOE los
 * usa para cada resultado, así que son el esqueleto fiable del correo.
 */
function paresDefinicion(bloque: string): Map<string, string> {
  const out = new Map<string, string>()
  const re = /<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(bloque)) !== null) {
    const clave = texto(m[1]).replace(/:$/, '').toLowerCase()
    if (clave) out.set(clave, m[2])
  }
  return out
}

/** El enlace a la ficha del portal, que es también donde vive el identificador. */
function enlaceFicha(bloque: string): string | null {
  const m = bloque.match(/href=['"]([^'"]*detalleSubasta\.php[^'"]*)['"]/i)
  return m ? decodificarHtml(m[1]) : null
}

/**
 * "Celebrándose [Fecha prevista de finalización: 13/08/2026 a las 18:00]"
 * → estado + fecha de cierre en ISO.
 */
export function parsearEstado(valor: string): { estado: string; fechaFin: string | null } {
  const plano = texto(valor)
  const m = plano.match(/fecha prevista de finalizaci[oó]n:\s*([\d/-]+)(?:\s*a las\s*(\d{1,2}:\d{2}))?/i)
  const estado = plano.replace(/\s*\[[^\]]*\]\s*/g, '').trim()
  if (!m) return { estado, fechaFin: null }
  return { estado, fechaFin: parseFechaEs(m[2] ? `${m[1]} ${m[2]}` : m[1]) }
}

/**
 * Convierte el HTML de una alerta del BOE en sus resultados.
 *
 * Un mismo correo lleva UNA búsqueda guardada (el asunto la nombra) pero el
 * cuerpo puede traer varias secciones `<h3>`, así que se recorren todas y cada
 * resultado hereda la búsqueda de su sección.
 */
export function parsearAlertaBoe(html: string, asunto?: string | null): ResultadoAlertaBoe[] {
  if (!html) return []

  const busquedaDelAsunto = asunto?.match(/Mi b[úu]squeda\s*"([^"]+)"/i)?.[1]?.trim() ?? ''

  // Cada <h3> abre una búsqueda; los <li> que la siguen son sus resultados.
  const secciones: Array<{ busqueda: string; cuerpo: string }> = []
  const reH3 = /<h3[^>]*>([\s\S]*?)<\/h3>/gi
  const cortes: Array<{ busqueda: string; desde: number }> = []
  let h: RegExpExecArray | null
  while ((h = reH3.exec(html)) !== null) {
    const nombre = texto(h[1]).match(/Mi b[úu]squeda\s*"([^"]+)"/i)?.[1]?.trim()
    cortes.push({ busqueda: nombre ?? busquedaDelAsunto, desde: reH3.lastIndex })
  }
  if (!cortes.length) {
    secciones.push({ busqueda: busquedaDelAsunto, cuerpo: html })
  } else {
    for (let i = 0; i < cortes.length; i++) {
      const hasta = i + 1 < cortes.length ? cortes[i + 1].desde : html.length
      secciones.push({ busqueda: cortes[i].busqueda, cuerpo: html.slice(cortes[i].desde, hasta) })
    }
  }

  const resultados: ResultadoAlertaBoe[] = []
  for (const sec of secciones) {
    for (const bloque of sec.cuerpo.split(/<li\b/i).slice(1)) {
      const campos = paresDefinicion(bloque)
      const identificador = texto(campos.get('subasta') ?? '').toUpperCase()
      if (!/^SUB-[A-Z]{2}-\d{4}-\d+$/.test(identificador)) continue

      const { estado, fechaFin } = parsearEstado(campos.get('estado') ?? '')
      const descripcion = texto(campos.get('descripción') ?? campos.get('descripcion') ?? '')

      resultados.push({
        busqueda: sec.busqueda,
        estado: estado || null,
        subasta: {
          dedupeKey: identificador,
          fuente: 'boe',
          identificador,
          // El tipo real se afina al enriquecer con la ficha; el prefijo del
          // identificador es lo único que da el correo.
          tipo: identificador.startsWith('SUB-JA') ? 'judicial' : identificador.startsWith('SUB-NE') ? 'notarial' : 'otra',
          descripcion: descripcion || null,
          url: enlaceFicha(bloque),
          fechaFin,
          // El correo no publica cifras: se rellenan al enriquecer con la ficha.
          valorSubasta: null,
          tasacion: null,
          cargas: null,
          cargasConocidas: false,
          situacionPosesoria: 'desconocida',
          ejecutado: 'desconocido',
        },
      })
    }
  }
  return resultados
}

/** ¿Es este correo una alerta del Portal de Subastas del BOE? */
export function esAlertaBoe(remitente: string | null | undefined, asunto: string | null | undefined): boolean {
  const de = (remitente ?? '').toLowerCase()
  const asu = asunto ?? ''
  return de.includes('boe.es') && /SUBASTAS BOE/i.test(asu)
}
