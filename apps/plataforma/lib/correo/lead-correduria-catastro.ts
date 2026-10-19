// lib/correo/lead-correduria-catastro.ts — el Catastro en el lead de HOGAR por correo (19/10/2026). PURO.
//
// Si el correo trae una referencia catastral VÁLIDA (control correcto: `referenciasCatastralesEn`), el proceso consulta
// el Catastro (gratis, servicio público) y con esto:
//   1. elige la VIVIENDA: con varias referencias (vivienda + garaje, p. ej.) solo vale si exactamente UNA es de uso
//      residencial; si no, no se elige a ciegas (`ambiguo`);
//   2. calcula qué escribir en `info_riesgo.datosVivienda` de la oportunidad de hogar: SOLO lo que está vacío
//      (`precargaCatastroVivienda`, la misma regla que la pantalla: un dato del cliente nunca se pisa);
//   3. dice qué claves del contrato ya no hay que preguntarle al cliente — solo si quedaron GUARDADAS en el riesgo;
//   4. redacta la línea de Telegram: m², año, uso y CP/municipio (sin la calle: en Telegram solo conteos y lo mínimo).
// Catastro caído o sin dato → `null` = «no se sabe»: nada se rellena, la petición pregunta como siempre y no bloquea.
import { escapeHtml } from '@central/core-telegram'
import { precargaCatastroVivienda, type CatastroVivienda } from '../correduria/catastro-vivienda.ts'

/** Lo que el proceso trae del Catastro por cada referencia (`precalificarHogar(...).datos`); `null` = no respondió. */
export type DatosCatastroLead = CatastroVivienda & { uso: string | null }

export type EleccionCatastro =
  | { estado: 'ok'; referencia: string; datos: DatosCatastroLead }
  | { estado: 'ambiguo'; residenciales: number }
  | { estado: 'sin_dato' }

/** Elige la vivienda entre las referencias consultadas. PURA. */
export function elegirViviendaCatastro(consultas: readonly { referencia: string; datos: DatosCatastroLead | null }[]): EleccionCatastro {
  const con = consultas.filter((c): c is { referencia: string; datos: DatosCatastroLead } => c.datos !== null)
  if (con.length === 0) return { estado: 'sin_dato' }
  const residenciales = con.filter((c) => /residencial|vivienda/i.test(c.datos.uso ?? ''))
  if (residenciales.length === 1) return { estado: 'ok', referencia: residenciales[0].referencia, datos: residenciales[0].datos }
  // Una sola referencia sin uso publicado: se usa (los avisos de `precalificarHogar` ya lo dicen en la pantalla).
  if (residenciales.length === 0 && con.length === 1 && con[0].datos.uso === null) return { estado: 'ok', referencia: con[0].referencia, datos: con[0].datos }
  return { estado: 'ambiguo', residenciales: residenciales.length }
}

/** `datosVivienda` guardado → formulario de texto (lo que espera `precargaCatastroVivienda`). `null`/'' = vacío. PURA. */
function comoFormulario(datos: Record<string, unknown> | null): Record<string, string | undefined> {
  const f: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(datos ?? {})) if (v !== null && v !== undefined && v !== '') f[k] = String(v)
  return f
}

/**
 * Qué escribir en `datosVivienda` (solo campos vacíos) y qué ya había distinto (se enseña, no se toca). Los números
 * vuelven a número. Sin nada que escribir → `cambios` vacío (no se llama al puerto). PURA.
 */
export function cambiosViviendaDesdeCatastro(actual: Record<string, unknown> | null, referencia: string, c: DatosCatastroLead): {
  cambios: Record<string, string | number>
  distintos: string[]
} {
  const p = precargaCatastroVivienda(comoFormulario(actual), referencia, c)
  const cambios: Record<string, string | number> = {}
  for (const [k, v] of Object.entries(p.cambios)) {
    if (v === undefined) continue
    cambios[k] = k === 'metrosCuadrados' || k === 'anioConstruccion' ? Number(v) : v
  }
  return { cambios, distintos: p.distintos.map((d) => d.campo) }
}

/**
 * Claves del contrato de HOGAR que no hay que preguntar porque YA están en el riesgo (guardadas ahora o de antes):
 * con dirección + CP del Catastro se da por sabida la dirección completa (calle, número, piso, tipo de vía). PURA.
 */
export function conocidosDeVivienda(guardado: Record<string, unknown>): string[] {
  const hay = (k: string) => guardado[k] !== null && guardado[k] !== undefined && guardado[k] !== ''
  const out: string[] = []
  if (hay('referenciaCatastral')) out.push('referenciaCatastral')
  if (hay('metrosCuadrados')) out.push('metrosCuadrados')
  if (hay('anioConstruccion')) out.push('anioConstruccion')
  if (hay('cp')) out.push('cp')
  if (hay('cp') && (hay('direccion') || (hay('nombreVia') && hay('numeroVia')))) out.push('nombreVia', 'numeroVia', 'planta', 'tipoViaId')
  return out
}

const m2 = (n: number) => `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0, useGrouping: 'always' } as Intl.NumberFormatOptions).format(n)} m²`

/** La línea de Telegram. Sin la calle. PURA. */
export function lineaCatastroTelegram(
  r: { estado: 'ok'; datos: DatosCatastroLead; guardado: 'si' | 'no' | 'nada_nuevo'; distintos: string[] }
    | { estado: 'ambiguo'; residenciales: number } | { estado: 'sin_dato' } | { estado: 'fallo' },
): string {
  if (r.estado === 'fallo') return '📍 Catastro: no se ha podido consultar (no se sabe). Se le preguntan los datos de la vivienda.'
  if (r.estado === 'sin_dato') return '📍 Catastro: la referencia del correo no devuelve datos (no se sabe). Se le preguntan los datos de la vivienda.'
  if (r.estado === 'ambiguo') return `📍 Catastro: el correo trae varias referencias y ${r.residenciales === 0 ? 'ninguna es' : 'más de una es'} de vivienda: no elijo a ciegas, míralo en la ficha.`
  const d = r.datos
  const partes = [
    d.metrosCuadrados !== null ? m2(d.metrosCuadrados) : null,
    d.anioConstruccion !== null ? String(d.anioConstruccion) : null,
    d.uso,
    [d.codigoPostal, d.localidad].filter(Boolean).join(' ') || null,
  ].filter((x): x is string => !!x)
  const guardado = r.guardado === 'si' ? 'guardado en el riesgo (derivado, sin confirmar)'
    : r.guardado === 'nada_nuevo' ? 'el riesgo ya lo tenía' : '⚠️ NO se ha podido guardar en el riesgo: se le pregunta'
  const distintos = r.distintos.length ? ` · ⚠️ distinto de lo guardado: ${r.distintos.join(', ')} (no se ha tocado)` : ''
  return `📍 Catastro: ${escapeHtml(partes.join(' · ') || 'sin datos publicados')} — ${guardado}${escapeHtml(distintos)}`
}
