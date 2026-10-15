/**
 * El riesgo LIBRE (30/09/2026): responsabilidad civil, comunidades y otros ramos (el comercio tiene el suyo: datos-comercio-riesgo.ts) que NO tarifican por
 * Codeoscopic. Se cotizan fuera; estos datos son para el EXPEDIENTE: `info_riesgo.datosRiesgoLibre`
 * {descripcion, direccion, capital, notas} y, en RC (15/10/2026, consultas a compañías), los datos mínimos que pide
 * una compañía para cotizar: {actividad, cnae, facturacion, plantilla, siniestralidad3Anios, limiteDeseado}. Es el
 * ÚNICO sitio de esos datos (la pantalla del riesgo los edita y la consulta los lee de aquí). No hay «faltan» de
 * tarifa (no hay tarifa a la que pedir nada); los mínimos de RC los avisa `faltanDatosConsulta` (consulta-compania.ts).
 *
 * 🚨 `null` = «no se sabe»; un capital de 0 no es lo mismo que sin capital.
 */
import { aplicarEdicionBloque, leerBloque, validarParcial, vaciosDe, type CambioCampo, type ErrorCampo, type Espec } from './datos-riesgo-generico.ts'

export const ESPEC_LIBRE = [
  { clave: 'descripcion', etiqueta: 'Qué se asegura', tipo: { t: 'texto', max: 300 } },
  { clave: 'direccion', etiqueta: 'Dirección', tipo: { t: 'texto', max: 200 } },
  { clave: 'capital', etiqueta: 'Capital (€)', tipo: { t: 'numero', min: 0, max: 1_000_000_000 } },
  { clave: 'notas', etiqueta: 'Notas', tipo: { t: 'texto', max: 1000 } },
  // Datos mínimos de RC para consultar a compañías (15/10/2026). En los demás ramos libres no se enseñan.
  { clave: 'actividad', etiqueta: 'Actividad', tipo: { t: 'texto', max: 200 } },
  { clave: 'cnae', etiqueta: 'CNAE', tipo: { t: 'texto', max: 20 } },
  { clave: 'facturacion', etiqueta: 'Facturación anual (€)', tipo: { t: 'numero', min: 0, max: 100_000_000_000 } },
  { clave: 'plantilla', etiqueta: 'Plantilla (personas)', tipo: { t: 'entero', min: 0, max: 1_000_000 } },
  { clave: 'siniestralidad3Anios', etiqueta: 'Siniestralidad últimos 3 años', tipo: { t: 'texto', max: 300 } },
  { clave: 'limiteDeseado', etiqueta: 'Límite de indemnización deseado (€)', tipo: { t: 'numero', min: 0, max: 100_000_000_000 } },
] as const satisfies Espec

export type CampoRiesgoLibreBase = 'descripcion' | 'direccion' | 'capital' | 'notas'
export type CampoRiesgoLibreRc = 'actividad' | 'cnae' | 'facturacion' | 'plantilla' | 'siniestralidad3Anios' | 'limiteDeseado'
export type CampoRiesgoLibre = CampoRiesgoLibreBase | CampoRiesgoLibreRc
export type DatosRiesgoLibre = {
  descripcion: string | null
  direccion: string | null
  capital: number | null
  notas: string | null
  actividad: string | null
  cnae: string | null
  facturacion: number | null
  plantilla: number | null
  siniestralidad3Anios: string | null
  limiteDeseado: number | null
  confirmadoAt: string | null
}

export const CAMPOS_LIBRE_BASE: readonly CampoRiesgoLibreBase[] = ['descripcion', 'direccion', 'capital', 'notas']
/** Los datos mínimos que pide una compañía para cotizar una RC (decisión 9 del spec de consultas a compañías). */
export const CAMPOS_LIBRE_RC: readonly CampoRiesgoLibreRc[] = ['actividad', 'cnae', 'facturacion', 'plantilla', 'siniestralidad3Anios', 'limiteDeseado']
export const CAMPOS_LIBRE: readonly CampoRiesgoLibre[] = [...CAMPOS_LIBRE_BASE, ...CAMPOS_LIBRE_RC]
export const ETIQUETA_CAMPO_LIBRE: Record<CampoRiesgoLibre, string> = {
  descripcion: 'Qué se asegura',
  direccion: 'Dirección',
  capital: 'Capital',
  notas: 'Notas',
  actividad: 'Actividad',
  cnae: 'CNAE',
  facturacion: 'Facturación anual',
  plantilla: 'Plantilla (personas)',
  siniestralidad3Anios: 'Siniestralidad últimos 3 años',
  limiteDeseado: 'Límite de indemnización deseado',
}

/** Ramos de RC: el bloque libre enseña y edita además los datos mínimos de {@link CAMPOS_LIBRE_RC}. */
export const RAMOS_RC_LIBRE = ['responsabilidad_civil', 'rc_profesional'] as const
export function esRamoRc(ramo: unknown): boolean {
  return typeof ramo === 'string' && (RAMOS_RC_LIBRE as readonly string[]).includes(ramo)
}
/** Los campos del bloque libre que se enseñan en este ramo (RC: los base + los mínimos de RC). */
export function camposLibreDelRamo(ramo: unknown): readonly CampoRiesgoLibre[] {
  return esRamoRc(ramo) ? CAMPOS_LIBRE : CAMPOS_LIBRE_BASE
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
