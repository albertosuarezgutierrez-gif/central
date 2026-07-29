// ────────────────────────────────────────────────────────────────────────────
// Alertas de Fotocasa por correo → comparables de mercado. PURO.
//
// A diferencia de lo que se creyó al montar el mercado (solo Idealista), las
// alertas actuales de Fotocasa SÍ traen detalle por anuncio: badge (NOVEDAD /
// BAJADA DE PRECIO / POR SI TE LO PERDISTE), precio, tipo, dirección/municipio,
// «N habs · M m² · B baños» y el enlace a la ficha. Verificado contra correos
// reales de la etiqueta `inmobiliaria` (29/07/2026) — de ahí los fixtures.
//
// El anunciante (👤 particular vs agencia) NO viene en el correo: se saca de la
// FICHA del anuncio, que embebe JSON con `clientAlias`/`clientName`/
// `clientTypeId` (+ coordenadas). `datosFichaFotocasa` parsea esa página.
// ────────────────────────────────────────────────────────────────────────────

import type { Comparable } from './comparables.ts'
import { tipoComparable } from './comparables.ts'
import { parseImporteEs } from './parsing.ts'

export const PORTAL_FOTOCASA = 'fotocasa'

export function esAlertaFotocasa(remitente: string | null | undefined): boolean {
  return /fotocasa\.es/i.test(remitente ?? '')
}

/** URL de tarjeta: /es/comprar/<categoría>/<municipio>/<atributos>/<id>/d */
const RE_CARD_URL = /https:\/\/www\.fotocasa\.es\/es\/comprar\/[a-z0-9-]+\/[a-z0-9%-]+\/[a-z0-9-]*\/?(\d{6,})\/d/g

const RE_CARD_TEXTO =
  /(?:NOVEDAD|BAJADA DE PRECIO|POR SI TE LO PERDISTE)\|([\d.]+)\s*€\|([^|]{2,40})\|·\|([^|]{2,120})\|((?:\d+\s*habs?)[^|]*)/g

function aLineas(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .split('\n')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('|')
}

/**
 * Parsea una alerta de Fotocasa. Las tarjetas del correo y sus enlaces van en
 * el MISMO orden, así que se emparejan por posición; si los conteos divergen
 * (plantilla nueva del portal) se empareja hasta el mínimo — mejor perder una
 * tarjeta que asignarle la URL de otra.
 */
export function parsearAlertaFotocasa(html: string): Comparable[] {
  const urls: string[] = []
  const vistos = new Set<string>()
  for (const m of html.matchAll(RE_CARD_URL)) {
    if (vistos.has(m[1])) continue
    vistos.add(m[1])
    urls.push(m[0])
  }

  const texto = aLineas(html)
  const tarjetas = [...texto.matchAll(RE_CARD_TEXTO)]

  const n = Math.min(urls.length, tarjetas.length)
  const out: Comparable[] = []
  for (let i = 0; i < n; i++) {
    const [, precioTxt, tipoTxt, zonaTxt, caract] = tarjetas[i]
    const precio = parseImporteEs(precioTxt + ' €')
    if (precio == null || precio <= 0) continue

    const zona = zonaTxt.trim()
    const superficie = caract.match(/([\d.]+(?:,\d+)?)\s*m²/)
    const habs = caract.match(/(\d+)\s*habs?/)
    const m2 = superficie ? parseImporteEs(superficie[1] + ' €') : null

    const refAnuncio = urls[i].match(/(\d{6,})\/d$/)?.[1] ?? urls[i]
    out.push({
      portal: 'fotocasa',
      refAnuncio,
      titulo: `${tipoTxt.trim()} en ${zona}`,
      tipo: tipoComparable(tipoTxt),
      zona,
      precio,
      superficie: m2,
      habitaciones: habs ? Number(habs[1]) : null,
      precioM2: m2 != null && m2 > 0 ? Math.round(precio / m2) : null,
      url: urls[i],
    })
  }
  return out
}

/** Datos del anunciante embebidos en la ficha del anuncio de Fotocasa. */
export interface FichaFotocasa {
  /** Nombre comercial del anunciante; `null` cuando no hay (típico particular). */
  anunciante: string | null
  clientTipoId: number | null
  /**
   * true = sin alias/nombre de cliente (anuncio de particular) · false = hay
   * agencia identificada · null = la página no trajo el bloque (no se sabe).
   */
  esParticular: boolean | null
  lat: number | null
  lng: number | null
}

export function datosFichaFotocasa(html: string): FichaFotocasa {
  const alias = html.match(/"clientAlias"\s*:\s*"([^"]*)"/)?.[1]?.trim() ?? null
  const nombre = html.match(/"clientName"\s*:\s*"([^"]*)"/)?.[1]?.trim() ?? null
  const tipoId = html.match(/"clientTypeId"\s*:\s*(\d+)/)?.[1]
  const coords = html.match(/"coordinates"\s*:\s*\{\s*"latitude"\s*:\s*(-?[\d.]+)\s*,\s*"longitude"\s*:\s*(-?[\d.]+)/)

  const anunciante = alias || nombre || null
  const esParticular = tipoId == null && anunciante == null
    ? null
    : anunciante == null || /particular/i.test(anunciante)

  return {
    anunciante,
    clientTipoId: tipoId != null ? Number(tipoId) : null,
    esParticular,
    lat: coords ? Number(coords[1]) : null,
    lng: coords ? Number(coords[2]) : null,
  }
}
