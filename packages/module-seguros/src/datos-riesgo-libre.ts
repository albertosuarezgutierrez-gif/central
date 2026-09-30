/**
 * El riesgo LIBRE (30/09/2026): responsabilidad civil, comunidades y otros ramos (el comercio tiene el suyo: datos-comercio-riesgo.ts) que NO tarifican por
 * Codeoscopic. Se cotizan fuera; estos datos son para el EXPEDIENTE: `info_riesgo.datosRiesgoLibre`
 * {descripcion, direccion, capital, notas}. No hay «faltan» (no hay tarifa a la que pedir nada).
 *
 * 🚨 `null` = «no se sabe»; un capital de 0 no es lo mismo que sin capital.
 */
import { aplicarEdicionBloque, leerBloque, validarParcial, vaciosDe, type CambioCampo, type ErrorCampo, type Espec } from './datos-riesgo-generico.ts'

export const ESPEC_LIBRE = [
  { clave: 'descripcion', etiqueta: 'Qué se asegura', tipo: { t: 'texto', max: 300 } },
  { clave: 'direccion', etiqueta: 'Dirección', tipo: { t: 'texto', max: 200 } },
  { clave: 'capital', etiqueta: 'Capital (€)', tipo: { t: 'numero', min: 0, max: 1_000_000_000 } },
  { clave: 'notas', etiqueta: 'Notas', tipo: { t: 'texto', max: 1000 } },
] as const satisfies Espec

export type CampoRiesgoLibre = 'descripcion' | 'direccion' | 'capital' | 'notas'
export type DatosRiesgoLibre = {
  descripcion: string | null
  direccion: string | null
  capital: number | null
  notas: string | null
  confirmadoAt: string | null
}

export const CAMPOS_LIBRE: readonly CampoRiesgoLibre[] = ['descripcion', 'direccion', 'capital', 'notas']
export const ETIQUETA_CAMPO_LIBRE: Record<CampoRiesgoLibre, string> = {
  descripcion: 'Qué se asegura',
  direccion: 'Dirección',
  capital: 'Capital',
  notas: 'Notas',
}

/** Ramos que se cotizan fuera y llevan este bloque (todos los que no son vehículo, hogar, personas ni comercio). */
export function admiteDatosRiesgoLibre(ramo: unknown): boolean {
  return typeof ramo === 'string' && !['auto', 'moto', 'hogar', 'vida', 'salud', 'decesos', 'comercio'].includes(ramo)
}

export function datosRiesgoLibreVacios(): DatosRiesgoLibre {
  return vaciosDe(ESPEC_LIBRE) as DatosRiesgoLibre
}
export function leerDatosRiesgoLibre(bruto: unknown): DatosRiesgoLibre | null {
  return leerBloque(ESPEC_LIBRE, bruto) as DatosRiesgoLibre | null
}

export type ValidacionLibre =
  | { ok: true; valor: Partial<Omit<DatosRiesgoLibre, 'confirmadoAt'>> }
  | { ok: false; errores: ErrorCampo[] }

export function validarDatosRiesgoLibre(parcial: unknown, opciones: { hoy?: string } = {}): ValidacionLibre {
  const hoy = opciones.hoy ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())
  const v = validarParcial(ESPEC_LIBRE, parcial, { hoy, nombreBloque: 'Los datos del riesgo' })
  return v.ok ? { ok: true, valor: v.valor as Partial<Omit<DatosRiesgoLibre, 'confirmadoAt'>> } : v
}

/** Este ramo no tiene tarifa: no hay nada que «falte para pedir precio». Siempre `[]`, dicho a propósito. */
export function faltanDatosRiesgoLibre(): CampoRiesgoLibre[] {
  return []
}

export const AVISO_RIESGO_LIBRE = 'Este ramo se cotiza fuera: los datos son para el expediente.'

export function aplicarEdicionLibre(
  actual: DatosRiesgoLibre | null,
  valor: Partial<Omit<DatosRiesgoLibre, 'confirmadoAt'>>,
  opciones: { confirmar: boolean; ahora: string },
): { datos: DatosRiesgoLibre; cambios: CambioCampo[] } {
  const r = aplicarEdicionBloque(ESPEC_LIBRE, actual as Record<string, never> | null, valor as Record<string, never>, opciones)
  return { datos: r.datos as DatosRiesgoLibre, cambios: r.cambios }
}

export function motivoNoConfirmableLibre(d: DatosRiesgoLibre): string | null {
  return CAMPOS_LIBRE.some((k) => d[k] !== null) ? null : 'No se puede confirmar un riesgo sin ningún dato.'
}

/**
 * Precarga desde la póliza de la que nace la oportunidad: `objetoAsegurado` ya sabe qué asegura (título/detalle)
 * y la dirección anotada si la hay. Sin inventar; el cifrado y los valores de cajón, fuera.
 */
export function precargaLibreDePoliza(objeto: { titulo?: string | null; detalle?: string | null } | null | undefined, datos: unknown): Partial<Omit<DatosRiesgoLibre, 'confirmadoAt'>> {
  const d = typeof datos === 'object' && datos !== null && !Array.isArray(datos) ? (datos as Record<string, unknown>) : {}
  const dir = typeof d.direccion === 'string' ? d.direccion.trim() : ''
  const candidato: Record<string, unknown> = {}
  const partes = [objeto?.titulo, objeto?.detalle].filter((x): x is string => typeof x === 'string' && x.trim() !== '')
  if (partes.length > 0) candidato.descripcion = partes.join(' · ')
  if (dir !== '' && !dir.startsWith('v1:') && !/^(N\/A|NA|NULL|OTRO|SIN DATOS?|NO CONSTA|0|-+)$/i.test(dir)) candidato.direccion = dir
  const v = validarDatosRiesgoLibre(candidato)
  if (v.ok) return v.valor
  for (const e of v.errores) delete candidato[e.campo]
  const v2 = validarDatosRiesgoLibre(candidato)
  return v2.ok ? v2.valor : {}
}
