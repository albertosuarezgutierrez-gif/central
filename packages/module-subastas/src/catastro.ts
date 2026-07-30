// ────────────────────────────────────────────────────────────────────────────
// Parseo PURO de la respuesta del Catastro (servicios web LIBRES de la Sede
// Electrónica, sin registro ni clave).
//
// Endpoint que FUNCIONA (probado el 28/07/2026):
//   https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCallejero.asmx
//     /Consulta_DNPRC?Provincia=&Municipio=&RC=<referencia>
// Devuelve XML. Ojo: el endpoint REST `/json/…` de la documentación responde
// 400 y sin User-Agent de navegador la conexión se corta — ambas cosas están
// contempladas en el adaptador de la app.
//
// ⚠️ LO QUE ESTE SERVICIO **NO** DA: el VALOR DE REFERENCIA, que es la base
// imponible del ITP desde 2022. Es dato protegido y exige certificado digital,
// así que el coste sigue estimándose sobre el remate y `costes.ts` deja su
// aviso. No hay forma automática y gratuita de obtenerlo.
// ────────────────────────────────────────────────────────────────────────────

import { decodificarHtml } from './email-boe.ts'

/** Datos catastrales de una finca. Todo opcional: no siempre están publicados. */
export interface DatosCatastro {
  /** Dirección oficial completa («CL VIRGEN MILAGROS 83 Es:1 Pl:02 …»). */
  direccion: string | null
  /** Superficie construida en m², según Catastro. */
  superficie: number | null
  anioConstruccion: number | null
  /** Uso principal: Residencial, Comercial, Industrial… */
  uso: string | null
  /** Coeficiente de participación en la propiedad horizontal, en %. */
  cuotaParticipacion: number | null
  /** `UR` urbana · `RU` rústica. */
  clase: string | null
  provincia: string | null
  municipio: string | null
  codigoPostal: string | null
}

function etiqueta(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'))
  if (!m) return null
  const v = decodificarHtml(m[1].trim())
  return v || null
}

function numero(xml: string, tag: string): number | null {
  const v = etiqueta(xml, tag)
  if (v == null) return null
  // El Catastro usa coma decimal («3,080000»).
  const n = Number(v.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Convierte el XML de `Consulta_DNPRC` en datos utilizables. */
export function parsearCatastro(xml: string): DatosCatastro {
  if (!xml) return vacio()
  // El bloque <bico> es el del bien concreto; si no está, se lee el documento.
  const b = xml.match(/<bico>[\s\S]*?<\/bico>/i)?.[0] ?? xml

  const cuota = numero(b, 'cpt')
  return {
    direccion: etiqueta(b, 'ldt'),
    superficie: numero(b, 'sfc'),
    anioConstruccion: (() => {
      const n = numero(b, 'ant')
      // Un año fuera de rango es dato corrupto, no una finca medieval.
      return n != null && n >= 1000 && n <= 2100 ? Math.trunc(n) : null
    })(),
    uso: etiqueta(b, 'luso'),
    // 100 % = finca completa, no una cuota de propiedad horizontal.
    cuotaParticipacion: cuota != null && cuota < 100 ? Math.round(cuota * 100) / 100 : null,
    clase: etiqueta(b, 'cn'),
    provincia: etiqueta(b, 'np'),
    municipio: etiqueta(b, 'nm'),
    codigoPostal: etiqueta(b, 'dp'),
  }
}

function vacio(): DatosCatastro {
  return {
    direccion: null, superficie: null, anioConstruccion: null, uso: null,
    cuotaParticipacion: null, clase: null, provincia: null, municipio: null,
    codigoPostal: null,
  }
}

/** ¿La respuesta indica error del servicio (referencia inexistente, etc.)? */
export function errorCatastro(xml: string): string | null {
  const des = xml.match(/<des>([\s\S]*?)<\/des>/i)?.[1]?.trim()
  return des ? decodificarHtml(des) : null
}

// ── Coordenadas por referencia catastral (Consulta_CPMRC) ───────────────────
// Servicio hermano del de arriba, mismo host y también libre:
//   …/OVCCoordenadas.asmx/Consulta_CPMRC?Provincia=&Municipio=&SRS=EPSG:4326&RC=<rc14>
// Con SRS=EPSG:4326, <xcen> es la LONGITUD y <ycen> la LATITUD (en ese orden,
// que es el que despista). Acepta la referencia de la PARCELA (14 caracteres);
// el recorte de los 20 a 14 lo hace el adaptador de la app.

export interface CoordenadasCatastro {
  lat: number
  lon: number
}

/**
 * Convierte el XML de `Consulta_CPMRC` en coordenadas WGS84. `null` si el
 * servicio no las da (error, referencia inexistente o respuesta corrupta) —
 * nunca devuelve un punto inventado.
 */
export function parsearCoordenadas(xml: string): CoordenadasCatastro | null {
  if (!xml || errorCatastro(xml)) return null
  // A diferencia de <sfc>/<cpt>, aquí el decimal viene con PUNTO («-6.2334177»):
  // el `numero()` de arriba (que quita puntos de millar) lo destrozaría.
  const lon = Number(xml.match(/<xcen>([\s\S]*?)<\/xcen>/i)?.[1]?.trim())
  const lat = Number(xml.match(/<ycen>([\s\S]*?)<\/ycen>/i)?.[1]?.trim())
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  // Un (0,0) o un valor fuera de rango es dato corrupto, no una finca en el golfo de Guinea.
  if (lat === 0 && lon === 0) return null
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  return { lat, lon }
}

/**
 * Superficie con la que valorar el inmueble: la del CATASTRO manda sobre la que
 * publica el anuncio.
 *
 * POR QUÉ el Catastro primero: es la oficial y es la que usa el cálculo del
 * €/m² de mercado. Si el scoring usara la registral y la referencia la
 * catastral, el valor estimado saldría con dos superficies distintas (El Puerto
 * de Santa María: 115,66 m² en el registro, 112 m² en el Catastro).
 *
 * Un 0 cuenta como AUSENTE — el Catastro devuelve 0 en fincas sin construcción,
 * y valorar un piso a 0 m² daría 0 € de valor, que es peor que no valorar.
 */
export function superficieUtil(catastro?: number | null, anuncio?: number | null): number | null {
  for (const v of [catastro, anuncio]) {
    if (v != null && Number.isFinite(v) && v > 0) return v
  }
  return null
}
