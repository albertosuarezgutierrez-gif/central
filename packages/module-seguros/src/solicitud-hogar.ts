/**
 * Enlace de datos de HOGAR (25/10/2026): de lo que contestó el cliente (+ lo que diga el Catastro) a lo que la
 * correduría necesita para tarificar sin reteclear. PURO.
 *
 * Reglas:
 * - `null` = «no se sabe». Lo que el cliente dejó en blanco o el Catastro no publica NO se escribe (nunca 0 ni '').
 * - El Catastro solo cuenta con un inmueble INEQUÍVOCO (`estado: 'ok'`): varios, ninguno o caído = sin datos del
 *   Catastro, y se dice cuál de esas fue (no es lo mismo «no responde» que «hay 15 pisos y no sé cuál»).
 * - Lo que sale de aquí es DECLARADO: se escribe en `info_riesgo.datosVivienda` sin confirmar y solo en los huecos
 *   (lo que la correduría ya tenía escrito manda). Nunca en la ficha del cliente.
 */
import { claveDireccion, type Respuesta } from './solicitud-datos.ts'

export type DireccionDeclarada = {
  cp: string | null
  provincia: string | null
  municipio: string | null
  calle: string | null
  numero: string | null
  planta: string | null
  puerta: string | null
  /** Calle OFICIAL del callejero; ambas `null` = texto libre. */
  viaTipo: string | null
  viaNombre: string | null
}

const txt = (v: Respuesta | undefined): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

/** La dirección declarada en un campo `direccion` (por defecto `vivienda`). `null` si no hay ni CP ni calle. */
export function direccionDeRespuestas(r: Record<string, Respuesta>, clave = 'vivienda'): DireccionDeclarada | null {
  const d: DireccionDeclarada = {
    cp: txt(r[claveDireccion(clave, 'Cp')]),
    provincia: txt(r[claveDireccion(clave, 'Provincia')]),
    municipio: txt(r[claveDireccion(clave, 'Municipio')]),
    calle: txt(r[claveDireccion(clave, 'Calle')]),
    numero: txt(r[claveDireccion(clave, 'Numero')]),
    planta: txt(r[claveDireccion(clave, 'Planta')]),
    puerta: txt(r[claveDireccion(clave, 'Puerta')]),
    viaTipo: txt(r[claveDireccion(clave, 'ViaTipo')]),
    viaNombre: txt(r[claveDireccion(clave, 'ViaNombre')]),
  }
  return d.cp === null && d.calle === null ? null : d
}

/** Una línea legible: «CL SOCORRO 24, 2º B · 41003 SEVILLA (SEVILLA)». */
export function direccionLegible(d: DireccionDeclarada): string {
  const via = d.viaTipo && d.viaNombre ? `${d.viaTipo} ${d.viaNombre}` : d.calle ?? ''
  const interior = [d.planta ? `${d.planta}º` : null, d.puerta].filter(Boolean).join(' ')
  const primera = [via, d.numero].filter(Boolean).join(' ') + (interior ? `, ${interior}` : '')
  const zona = [d.cp, d.municipio].filter(Boolean).join(' ') + (d.provincia && d.provincia !== d.municipio ? ` (${d.provincia})` : '')
  return [primera.trim(), zona.trim()].filter((x) => x !== '').join(' · ')
}

/** Qué dijo el Catastro de la dirección declarada. Solo `ok` trae datos. */
export type CatastroSolicitud =
  | { estado: 'ok'; referencia: string; metrosCuadrados: number | null; anioConstruccion: number | null; uso: string | null }
  | { estado: 'varios' | 'ninguno' | 'no_encontrado' | 'via_ambigua' | 'sin_direccion' | 'error' }

export function textoCatastroSolicitud(c: CatastroSolicitud | null): string {
  if (c === null) return 'Catastro sin consultar'
  switch (c.estado) {
    case 'ok': {
      const m = c.metrosCuadrados !== null && c.metrosCuadrados > 0 ? `${c.metrosCuadrados} m²` : 'm² sin dato'
      const a = c.anioConstruccion !== null ? `año ${c.anioConstruccion}` : 'año sin dato'
      const uso = c.uso && !/residencial/i.test(c.uso) ? ` · ⚠️ uso catastral «${c.uso}», no vivienda` : c.uso === null ? ' · uso sin dato' : ''
      return `Catastro: ref. ${c.referencia} · ${m} · ${a}${uso}`
    }
    case 'varios': return 'Catastro: varios pisos en ese portal y ninguno casa solo con planta/puerta (elige tú)'
    case 'ninguno': return 'Catastro: ningún inmueble casa con esa planta/puerta (revisa la dirección)'
    case 'no_encontrado': return 'Catastro: no encuentra esa dirección'
    case 'via_ambigua': return 'Catastro: la calle es ambigua en el callejero (revisa la dirección)'
    case 'sin_direccion': return 'Catastro: dirección incompleta, no se ha consultado'
    case 'error': return 'Catastro: no respondió (no es «no existe»: vuelve a consultarlo desde el riesgo)'
  }
}

/**
 * Lo que se propone escribir en `datosVivienda` (claves de `ESPEC_VIVIENDA`), sin nulls: solo lo que se sabe.
 * `ahoraIso` sella la consulta al Catastro cuando la hubo.
 */
export function viviendaDeSolicitud(r: Record<string, Respuesta>, catastro: CatastroSolicitud | null, ahoraIso: string): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  const d = direccionDeRespuestas(r)
  if (d) {
    if (d.cp) out.cp = d.cp
    if (d.provincia) out.provincia = d.provincia
    if (d.municipio) out.municipio = d.municipio
    const nombreVia = d.viaNombre ?? d.calle
    if (nombreVia) out.nombreVia = nombreVia.slice(0, 80)
    if (d.numero) out.numeroVia = d.numero
    if (d.planta) out.planta = d.planta
    if (d.puerta) out.puertaVivienda = d.puerta
    const legible = direccionLegible(d)
    if (legible) out.direccion = legible.slice(0, 200)
  }
  if (typeof r.valorContenido === 'number' && r.valorContenido > 0) out.capitalContenido = r.valorContenido
  if (typeof r.hipoteca === 'boolean') out.hipoteca = r.hipoteca
  const banco = txt(r.entidadHipoteca)
  if (r.hipoteca === true && banco) out.bancoHipoteca = banco.slice(0, 80)
  if (catastro?.estado === 'ok') {
    out.referenciaCatastral = catastro.referencia
    out.catastroReferencia = catastro.referencia
    out.catastroConsultadoAt = ahoraIso
    if (catastro.uso) out.usoCatastral = catastro.uso.slice(0, 60)
    if (catastro.metrosCuadrados !== null && catastro.metrosCuadrados > 0) {
      out.metrosCuadrados = catastro.metrosCuadrados
      out.catastroMetrosCuadrados = catastro.metrosCuadrados
    }
    if (catastro.anioConstruccion !== null && catastro.anioConstruccion >= 1500) {
      out.anioConstruccion = catastro.anioConstruccion
      out.catastroAnioConstruccion = catastro.anioConstruccion
    }
  }
  return out
}

/** Solo los huecos: lo que `actual` ya tiene (≠ null) manda y no se pisa. */
export function soloHuecos(actual: Record<string, unknown> | null, propuesta: Record<string, string | number | boolean>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  for (const [k, v] of Object.entries(propuesta)) {
    const a = actual?.[k]
    if (a === null || a === undefined || a === '') out[k] = v
  }
  return out
}
