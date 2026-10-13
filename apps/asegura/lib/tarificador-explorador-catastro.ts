// Año de construcción y m² del CATASTRO para una exploración anclada a una OPORTUNIDAD de Hogar (14/10/2026).
//
// La pantalla «Datos del tomador y vivienda» de Allianz Hogar los EXIGE y no los autocompleta antes de avanzar: sin ellos la
// exploración paraba. Si `datosVivienda` no los trae, se consultan aquí AL ENCOLAR, con lo mismo que ya usa asegura para
// Hogar (`catastroPorReferencia` y `inmueblesPorDireccion` de `@central/core-catastro`), y se vuelcan SOLO al `riesgo` del
// trabajo (la oportunidad no se toca).
//
// 🚨 Solo un resultado INEQUÍVOCO (`inmuebleUnicoCatastro`: un único inmueble que casa con planta/puerta). Varios, ninguno,
//    error o tiempo agotado → se sigue SIN valor (la exploración parará con `dato_no_disponible`): nunca se adivina y nunca
//    tumba el encolado. Las dependencias de red se inyectan (tests con Catastro simulado).

import { completarInmuebleConCatastro, faltanDatosCatastro, inmuebleUnicoCatastro, type CampoCatastroRiesgo, type InmuebleCatastroMin } from '@central/module-tarificacion'
import { partirDireccion, siglaCanonica, siglaDeTipoVia } from './codeoscopic/direccion.ts'

export type DatosCatastroVivienda = { anioConstruccion: number | null; metrosCuadrados: number | null }

export type DepsCatastroExploracion = {
  /** `catastroPorReferencia` (lib/codeoscopic/catastro-referencia.ts), reducido a lo que se usa. */
  porReferencia: (ref: string) => Promise<
    | { estado: 'ok'; catastro: DatosCatastroVivienda }
    | { estado: 'invalida' }
    | { estado: 'no_encontrado' }
    | { estado: 'error'; motivo: string }
  >
  /** `inmueblesPorDireccion` de `@central/core-catastro/http`: `null` = vía ambigua en el callejero. */
  inmuebles: (p: { provincia: string; municipio: string; sigla: string; calle: string; numero: string }) => Promise<{ via: string; inmuebles: InmuebleCatastroMin[] } | null>
  /** Tope de TODA la consulta (por defecto 10 s): pasado, se sigue sin valor. */
  timeoutMs?: number
}

/** Cómo fue (para el log; sin valores ni dirección). */
export type EstadoCatastroExploracion =
  | 'no_hacia_falta' | 'completado' | 'sin_datos_para_buscar' | 'via_ambigua' | 'varios' | 'ninguno' | 'no_encontrado' | 'error'

type RiesgoOportunidad = { tomador: Record<string, string>; inmueble: Record<string, string | number>; hogar: Record<string, string | number> }

const obj = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
const txt = (v: unknown, max = 80): string | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  if (typeof v !== 'string') return null
  const t = v.trim().replace(/\s+/g, ' ')
  return t !== '' && t.length <= max ? t : null
}

/**
 * Ids ingleses de `/road-types` de Codeoscopic → sigla del Catastro. Solo los ATESTIGUADOS en el repo (tests de
 * `codeoscopic/desde-cartera.test.ts`): otro id no se traduce (se prueba con el texto libre de `direccion`).
 */
const SIGLA_DE_ID_VENDOR: Readonly<Record<string, string>> = Object.freeze({ Street: 'CL' })

/** Sigla del Catastro (`CL`, `AV`…) del tipo de vía de la oportunidad; `null` si no se sabe (no se adivina). */
export function siglaViaOportunidad(v: Record<string, unknown>): string | null {
  const id = txt(v.tipoViaId, 30)
  if (id) {
    if (Object.hasOwn(SIGLA_DE_ID_VENDOR, id)) return SIGLA_DE_ID_VENDOR[id]
    const canon = siglaCanonica(id)
    const s = canon ? siglaDeTipoVia(canon) : null
    if (s) return s
  }
  const libre = partirDireccion(txt(v.direccion, 200)).tipoVia
  return libre ? siglaDeTipoVia(libre) : null
}

const conTope = <T,>(p: Promise<T>, ms: number): Promise<T | 'tope'> =>
  new Promise((resolve) => {
    const t = setTimeout(() => resolve('tope'), ms)
    p.then((x) => { clearTimeout(t); resolve(x) }, () => { clearTimeout(t); resolve('tope') })
  })

async function consultar(v: Record<string, unknown>, deps: DepsCatastroExploracion): Promise<{ estado: EstadoCatastroExploracion; datos?: DatosCatastroVivienda }> {
  // 1. Referencia catastral del piso (20): la vía más directa.
  const ref = txt(v.referenciaCatastral, 30)?.replace(/[\s-]/g, '').toUpperCase() ?? null
  if (ref) {
    const c = await deps.porReferencia(ref)
    if (c.estado === 'ok') return { estado: 'completado', datos: c.catastro }
    if (c.estado === 'no_encontrado') return { estado: 'no_encontrado' }
    if (c.estado === 'error') return { estado: 'error' }
    // `invalida` (p. ej. la de 14, del edificio): se prueba por dirección.
  }
  // 2. Dirección → inmuebles del portal → uno solo que case con planta/puerta → su referencia → año y m².
  const provincia = txt(v.provincia, 60)
  const municipio = txt(v.municipio, 80)
  const calle = txt(v.nombreVia, 80)
  const numero = txt(v.numeroVia, 10)
  const sigla = siglaViaOportunidad(v)
  if (!provincia || !municipio || !calle || !numero || !sigla) return { estado: 'sin_datos_para_buscar' }
  const r = await deps.inmuebles({ provincia: provincia.toUpperCase(), municipio: municipio.toUpperCase(), sigla, calle, numero })
  if (r === null) return { estado: 'via_ambigua' }
  const e = inmuebleUnicoCatastro(r.inmuebles, { planta: v.planta, puerta: v.puertaVivienda, codigoPostal: v.cp })
  if (e.estado !== 'unico') return { estado: e.estado }
  const c = await deps.porReferencia(e.refCompleta)
  if (c.estado === 'ok') return { estado: 'completado', datos: c.catastro }
  return { estado: c.estado === 'error' ? 'error' : 'no_encontrado' }
}

/**
 * El riesgo de la oportunidad con año/m² del Catastro donde falten. Nunca lanza: ante cualquier fallo devuelve el riesgo
 * TAL CUAL con su estado. `anadidos` = qué campos se completaron (nombres, nunca valores).
 */
export async function completarRiesgoConCatastro(
  riesgo: RiesgoOportunidad,
  datosVivienda: unknown,
  deps: DepsCatastroExploracion,
): Promise<{ riesgo: RiesgoOportunidad; estado: EstadoCatastroExploracion; anadidos: CampoCatastroRiesgo[] }> {
  if (faltanDatosCatastro(riesgo).length === 0) return { riesgo, estado: 'no_hacia_falta', anadidos: [] }
  const v = obj(datosVivienda)
  if (!v) return { riesgo, estado: 'sin_datos_para_buscar', anadidos: [] }
  const r = await conTope(consultar(v, deps), deps.timeoutMs ?? 10_000)
  if (r === 'tope') return { riesgo, estado: 'error', anadidos: [] }
  if (r.estado !== 'completado' || !r.datos) return { riesgo, estado: r.estado, anadidos: [] }
  const c = completarInmuebleConCatastro(riesgo, r.datos)
  // El Catastro respondió pero sin un año/m² válido: no se ha completado nada (null = no se sabe).
  return { riesgo: c.riesgo, estado: c.anadidos.length ? 'completado' : 'ninguno', anadidos: c.anadidos }
}
