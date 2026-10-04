/**
 * El CAPITAL de un riesgo de personas (vida, salud, decesos), 30/09/2026, en
 * `seguros.oportunidades.info_riesgo.datosCapital`: {capital, duracionAnios (vida), modalidadDeseada (salud)}.
 * Nombres alineados con `ResueltosVidaNueva/SaludNueva/DecesosNueva` de asegura.
 *
 * 🚨 `null` = «no se sabe». Faltan para pedir precio: el capital, y solo en VIDA (`revisarDatosVida`; en salud y
 * decesos el capital es opcional y ni viaja al vendor). La duración de vida es opcional y sin verificar.
 */
import { aplicarEdicionBloque, leerBloque, validarParcial, vaciosDe, type CambioCampo, type ErrorCampo, type Espec } from './datos-riesgo-generico.ts'

export type RamoCapital = 'vida' | 'salud' | 'decesos'

export function admiteDatosCapital(ramo: unknown): ramo is RamoCapital {
  return ramo === 'vida' || ramo === 'salud' || ramo === 'decesos'
}

export const ESPEC_CAPITAL = [
  { clave: 'capital', etiqueta: 'Capital asegurado (€)', tipo: { t: 'numero', min: 0, max: 100_000_000, sobreMin: true } },
  { clave: 'duracionAnios', etiqueta: 'Duración (años)', tipo: { t: 'entero', min: 1, max: 100 } },
  { clave: 'modalidadDeseada', etiqueta: 'Modalidad deseada', tipo: { t: 'texto', max: 80 } },
] as const satisfies Espec

export type CampoCapital = 'capital' | 'duracionAnios' | 'modalidadDeseada'
export type DatosCapitalRiesgo = {
  capital: number | null
  duracionAnios: number | null
  modalidadDeseada: string | null
  confirmadoAt: string | null
}

export const CAMPOS_CAPITAL: readonly CampoCapital[] = ['capital', 'duracionAnios', 'modalidadDeseada']
export const ETIQUETA_CAMPO_CAPITAL: Record<CampoCapital, string> = {
  capital: 'Capital asegurado',
  duracionAnios: 'Duración (años)',
  modalidadDeseada: 'Modalidad deseada',
}

/** Qué campos se ofrecen en cada ramo: la duración solo existe en vida, la modalidad solo en salud. */
export function camposCapitalDelRamo(ramo: RamoCapital): readonly CampoCapital[] {
  return ramo === 'vida' ? ['capital', 'duracionAnios'] : ramo === 'salud' ? ['capital', 'modalidadDeseada'] : ['capital']
}

export function datosCapitalVacios(): DatosCapitalRiesgo {
  return vaciosDe(ESPEC_CAPITAL) as DatosCapitalRiesgo
}
export function leerDatosCapital(bruto: unknown): DatosCapitalRiesgo | null {
  return leerBloque(ESPEC_CAPITAL, bruto) as DatosCapitalRiesgo | null
}

export type ValidacionCapital =
  | { ok: true; valor: Partial<Omit<DatosCapitalRiesgo, 'confirmadoAt'>> }
  | { ok: false; errores: ErrorCampo[] }

export function validarDatosCapitalRiesgo(parcial: unknown, opciones: { hoy?: string; ramo?: RamoCapital } = {}): ValidacionCapital {
  const hoy = opciones.hoy ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())
  const v = validarParcial(ESPEC_CAPITAL, parcial, { hoy, nombreBloque: 'El capital' })
  if (!v.ok) return v
  // Un campo que no es de ese ramo se rechaza en vez de guardarse en silencio (la duración de una salud no existe).
  if (opciones.ramo) {
    const validos = camposCapitalDelRamo(opciones.ramo)
    const fuera = Object.keys(v.valor).filter((k) => !(validos as readonly string[]).includes(k) && v.valor[k] !== null)
    if (fuera.length > 0) {
      return { ok: false, errores: fuera.map((campo) => ({ campo, motivo: `${ETIQUETA_CAMPO_CAPITAL[campo as CampoCapital]}: no se usa en ${opciones.ramo}.` })) }
    }
  }
  return { ok: true, valor: v.valor as Partial<Omit<DatosCapitalRiesgo, 'confirmadoAt'>> }
}

/** Solo VIDA exige capital (`revisarDatosVida`). Salud y decesos: nada obligatorio en el riesgo. `null` = falta todo. */
export function faltanDatosCapital(datos: Partial<DatosCapitalRiesgo> | null | undefined, ramo: RamoCapital): CampoCapital[] {
  if (ramo !== 'vida') return []
  return datos?.capital === null || datos?.capital === undefined ? ['capital'] : []
}

export function textoFaltanCapital(faltan: readonly CampoCapital[] | null | undefined): string | null {
  if (faltan === null || faltan === undefined || faltan.length === 0) return null
  return `Falta para pedir precio: ${faltan.map((c) => ETIQUETA_CAMPO_CAPITAL[c].toLowerCase()).join(', ')}.`
}

export function aplicarEdicionCapital(
  actual: DatosCapitalRiesgo | null,
  valor: Partial<Omit<DatosCapitalRiesgo, 'confirmadoAt'>>,
  opciones: { confirmar: boolean; ahora: string },
): { datos: DatosCapitalRiesgo; cambios: CambioCampo[] } {
  const r = aplicarEdicionBloque(ESPEC_CAPITAL, actual as Record<string, never> | null, valor as Record<string, never>, opciones)
  return { datos: r.datos as DatosCapitalRiesgo, cambios: r.cambios }
}

export function motivoNoConfirmableCapital(d: DatosCapitalRiesgo): string | null {
  return d.capital !== null || d.duracionAnios !== null || d.modalidadDeseada !== null ? null : 'No se puede confirmar un capital sin ningún dato.'
}

/**
 * Lo que una cotización de vida/salud/decesos con `?oportunidad=` deja anotado en el riesgo: `resueltos.capital`,
 * `.duracionAnios` (vida) y `.modalidadDeseada` (salud). Solo claves con valor; lo inválido, descartado.
 */
export function datosCapitalDeCotizacion(cuerpo: unknown, ramo: RamoCapital, opciones: { hoy?: string } = {}): Partial<Omit<DatosCapitalRiesgo, 'confirmadoAt'>> {
  const c = typeof cuerpo === 'object' && cuerpo !== null && !Array.isArray(cuerpo) ? (cuerpo as Record<string, unknown>) : {}
  const res = typeof c.resueltos === 'object' && c.resueltos !== null && !Array.isArray(c.resueltos) ? (c.resueltos as Record<string, unknown>) : {}
  const candidato: Record<string, unknown> = {}
  for (const k of camposCapitalDelRamo(ramo)) {
    const v = res[k]
    if (v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '')) candidato[k] = v
  }
  for (let i = 0; i < CAMPOS_CAPITAL.length; i++) {
    const v = validarDatosCapitalRiesgo(candidato, { ...opciones, ramo })
    if (v.ok) return v.valor
    for (const e of v.errores) delete candidato[e.campo]
  }
  return {}
}
