/**
 * El CAPITAL y los datos de la PERSONA de un riesgo de personas (vida, salud, decesos), en
 * `seguros.oportunidades.info_riesgo.datosCapital`:
 *   · vida    → capital, profesión (CNO-11, 4 cifras) y fumador (lo que viaja al vendor como `insured`);
 *   · salud   → capital (nota: no viaja), modalidad deseada (nota) y asegurados adicionales;
 *   · decesos → capital (nota) y asegurados adicionales.
 * Nombres alineados con `ResueltosVidaNueva/SaludNueva/DecesosNueva` de asegura.
 *
 * 🚨 `null` = «no se sabe». Faltan para pedir precio: el capital, y solo en VIDA (`revisarDatosVida`; en salud y
 * decesos el capital es opcional y ni viaja al vendor). Profesión y fumador solo los exige el vendor según
 * `person-roles` (lo dice la pantalla de precio, gratis): aquí son opcionales. «Duración» de vida se quitó el
 * 03/10/2026 (`TermLifeRisk_V1` no tiene campo): ya no se ofrece ni se anota; si hay una guardada, se conserva
 * (sin tocarla) pero no se enseña.
 */
import {
  aplicarEdicionBloque, leerBloque, validarParcial, vaciosDe,
  type CambioCampo, type ErrorCampo, type Espec,
} from './datos-riesgo-generico.ts'

export type RamoCapital = 'vida' | 'salud' | 'decesos'

export function admiteDatosCapital(ramo: unknown): ramo is RamoCapital {
  return ramo === 'vida' || ramo === 'salud' || ramo === 'decesos'
}

export const ESPEC_CAPITAL = [
  { clave: 'capital', etiqueta: 'Capital asegurado (€)', tipo: { t: 'numero', min: 0, max: 100_000_000, sobreMin: true } },
  // Heredado: ya no se ofrece en ningún ramo (ver cabecera). Sigue en la espec para no perder lo ya guardado.
  { clave: 'duracionAnios', etiqueta: 'Duración (años)', tipo: { t: 'entero', min: 1, max: 100 } },
  { clave: 'modalidadDeseada', etiqueta: 'Modalidad deseada', tipo: { t: 'texto', max: 80 } },
  { clave: 'profesion', etiqueta: 'Profesión (código CNO-11)', tipo: { t: 'codigo', digitos: 4 } },
  { clave: 'fumador', etiqueta: '¿Fuma?', tipo: { t: 'bool' } },
] as const satisfies Espec

/**
 * Un asegurado además del tomador (`insureds[1..]` de salud y decesos). 🔒 SIN DNI/NIE ni nacionalidad: en la cartera el
 * DNI y la fecha de nacimiento se guardan CIFRADOS y a la pantalla no viaja el DNI; en `info_riesgo` (jsonb en claro) no
 * se escribe ningún documento. Se teclea de nuevo en la pantalla de precio si la compañía lo exige.
 */
export type AseguradoAdicional = {
  nombre: string
  apellido1: string
  apellido2: string | null
  /** aaaa-mm-dd */
  fechaNacimiento: string
  sexo: 'hombre' | 'mujer'
}
export const MAX_ASEGURADOS = 10

export type CampoCapital = 'capital' | 'duracionAnios' | 'modalidadDeseada' | 'profesion' | 'fumador' | 'asegurados'
export type DatosCapitalRiesgo = {
  capital: number | null
  /** Heredado, no se ofrece. */
  duracionAnios: number | null
  modalidadDeseada: string | null
  profesion: string | null
  fumador: boolean | null
  /** `null` = sin mirar; `[]` = revisado, ninguno. */
  asegurados: AseguradoAdicional[] | null
  confirmadoAt: string | null
}

export const CAMPOS_CAPITAL: readonly CampoCapital[] = ['capital', 'duracionAnios', 'modalidadDeseada', 'profesion', 'fumador', 'asegurados']
export const ETIQUETA_CAMPO_CAPITAL: Record<CampoCapital, string> = {
  capital: 'Capital asegurado',
  duracionAnios: 'Duración (años)',
  modalidadDeseada: 'Modalidad deseada',
  profesion: 'Profesión (código CNO-11)',
  fumador: '¿Fuma?',
  asegurados: 'Asegurados además del tomador',
}

/** Qué campos se ofrecen en cada ramo (la duración ya no existe en ninguno). */
export function camposCapitalDelRamo(ramo: RamoCapital): readonly CampoCapital[] {
  return ramo === 'vida' ? ['capital', 'profesion', 'fumador'] : ramo === 'salud' ? ['capital', 'modalidadDeseada', 'asegurados'] : ['capital', 'asegurados']
}

const esObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const textoLeido = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

// ─── Asegurados adicionales ──────────────────────────────────────────────────

function leerAsegurados(bruto: unknown): AseguradoAdicional[] | null {
  if (!Array.isArray(bruto)) return null
  const out: AseguradoAdicional[] = []
  for (const x of bruto) {
    if (!esObj(x)) continue
    const nombre = textoLeido(x.nombre)
    const apellido1 = textoLeido(x.apellido1)
    const fechaNacimiento = textoLeido(x.fechaNacimiento)
    const sexo = x.sexo === 'hombre' || x.sexo === 'mujer' ? x.sexo : null
    // Una fila a medias no se inventa: sin lo mínimo no es un asegurado leído.
    if (nombre === null || apellido1 === null || fechaNacimiento === null || sexo === null) continue
    out.push({ nombre, apellido1, apellido2: textoLeido(x.apellido2), fechaNacimiento, sexo })
  }
  // Una lista con filas pero ninguna legible NO es «revisado, ninguno»: es «no se sabe» (null), nunca [].
  return bruto.length > 0 && out.length === 0 ? null : out
}

const fechaValida = (s: string, hoy: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s && s <= hoy && s >= '1900-01-01'
}

/** Valida la lista entera de asegurados adicionales. Cada fila con su motivo; `null` = borrar (sin mirar). */
export function validarAseguradosAdicionales(
  v: unknown,
  opciones: { hoy?: string } = {},
): { ok: true; valor: AseguradoAdicional[] | null } | { ok: false; errores: ErrorCampo[] } {
  const hoy = opciones.hoy ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())
  if (v === null) return { ok: true, valor: null }
  if (!Array.isArray(v)) return { ok: false, errores: [{ campo: 'asegurados', motivo: 'Asegurados: tiene que ser una lista.' }] }
  if (v.length > MAX_ASEGURADOS) return { ok: false, errores: [{ campo: 'asegurados', motivo: `Asegurados: como mucho ${MAX_ASEGURADOS}.` }] }
  const errores: ErrorCampo[] = []
  const valor: AseguradoAdicional[] = []
  const opt = (x: unknown, max: number): string | null | 'invalido' => {
    if (x === null || x === undefined) return null
    if (typeof x !== 'string') return 'invalido'
    const t = x.replace(/\s+/g, ' ').trim()
    return t === '' ? null : t.length > max ? 'invalido' : t
  }
  v.forEach((x, i) => {
    const mal = (motivo: string) => errores.push({ campo: 'asegurados', motivo: `Asegurado ${i + 1}: ${motivo}` })
    if (!esObj(x)) return mal('tiene que ser un objeto.')
    const nombre = opt(x.nombre, 60)
    const apellido1 = opt(x.apellido1, 60)
    const apellido2 = opt(x.apellido2, 60)
    if (nombre === 'invalido' || apellido1 === 'invalido' || apellido2 === 'invalido') return mal('texto no válido o demasiado largo.')
    if (nombre === null) return mal('falta el nombre.')
    if (apellido1 === null) return mal('falta el primer apellido.')
    const fecha = typeof x.fechaNacimiento === 'string' ? x.fechaNacimiento.trim() : ''
    if (fecha === '') return mal('falta la fecha de nacimiento.')
    if (!fechaValida(fecha, hoy)) return mal('la fecha de nacimiento tiene que ser aaaa-mm-dd, real y no futura.')
    if (x.sexo !== 'hombre' && x.sexo !== 'mujer') return mal('elige hombre o mujer.')
    // Cualquier `dni`/`nacionalidad` que venga (la cotización los manda al vendor) se IGNORA: no se guarda ningún documento.
    valor.push({ nombre, apellido1, apellido2, fechaNacimiento: fecha, sexo: x.sexo })
  })
  return errores.length > 0 ? { ok: false, errores } : { ok: true, valor }
}

/** Una lista como texto corto para el historial: `null` = sin mirar; «ninguno» = revisada y vacía. */
export function textoAseguradosAdicionales(l: readonly AseguradoAdicional[] | null): string | null {
  if (l === null) return null
  if (l.length === 0) return 'ninguno'
  // 🔒 Sin fecha de nacimiento: el historial es de solo añadir y quedaría una copia en claro aunque luego se borre del riesgo.
  return l.map((a) => `${a.nombre} ${a.apellido1}`).join(' · ')
}

// ─── Lectura, validación, edición ────────────────────────────────────────────

export function datosCapitalVacios(): DatosCapitalRiesgo {
  return { ...(vaciosDe(ESPEC_CAPITAL) as Omit<DatosCapitalRiesgo, 'asegurados'>), asegurados: null }
}
export function leerDatosCapital(bruto: unknown): DatosCapitalRiesgo | null {
  const base = leerBloque(ESPEC_CAPITAL, bruto)
  if (base === null || !esObj(bruto)) return null
  return { ...(base as unknown as Omit<DatosCapitalRiesgo, 'asegurados'>), asegurados: leerAsegurados(bruto.asegurados) }
}

export type ValorEdicionCapital = Partial<Omit<DatosCapitalRiesgo, 'confirmadoAt'>>
export type ValidacionCapital =
  | { ok: true; valor: ValorEdicionCapital }
  | { ok: false; errores: ErrorCampo[] }

export function validarDatosCapitalRiesgo(parcial: unknown, opciones: { hoy?: string; ramo?: RamoCapital } = {}): ValidacionCapital {
  const hoy = opciones.hoy ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())
  const v = validarParcial(ESPEC_CAPITAL, parcial, { hoy, nombreBloque: 'El capital' })
  if (!esObj(parcial)) return v as { ok: false; errores: ErrorCampo[] }
  const errores: ErrorCampo[] = v.ok ? [] : [...v.errores]
  const valor: Record<string, unknown> = v.ok ? { ...v.valor } : {}
  if (Object.prototype.hasOwnProperty.call(parcial, 'asegurados')) {
    const a = validarAseguradosAdicionales(parcial.asegurados === undefined ? null : parcial.asegurados, { hoy })
    if (a.ok) valor.asegurados = a.valor
    else errores.push(...a.errores)
  }
  // Un campo que no es de ese ramo se rechaza en vez de guardarse en silencio (los asegurados de una vida no existen).
  if (opciones.ramo) {
    const validos = camposCapitalDelRamo(opciones.ramo)
    const fuera = Object.keys(valor).filter((k) => !(validos as readonly string[]).includes(k) && valor[k] !== null)
    for (const k of fuera) {
      const et = ETIQUETA_CAMPO_CAPITAL[k as CampoCapital] ?? k
      errores.push({ campo: k, motivo: `${et}: no se usa en ${opciones.ramo}.` })
    }
  }
  return errores.length > 0 ? { ok: false, errores } : { ok: true, valor: valor as ValorEdicionCapital }
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
  valor: ValorEdicionCapital,
  opciones: { confirmar: boolean; ahora: string },
): { datos: DatosCapitalRiesgo; cambios: CambioCampo[] } {
  const previo = actual ?? datosCapitalVacios()
  const escalares: Record<string, never> = {}
  for (const c of ESPEC_CAPITAL) if (Object.prototype.hasOwnProperty.call(valor, c.clave)) escalares[c.clave] = (valor as Record<string, never>)[c.clave]
  const r = aplicarEdicionBloque(ESPEC_CAPITAL, previo as unknown as Record<string, never>, escalares, opciones)
  const datos = { ...previo, ...(r.datos as object) } as DatosCapitalRiesgo
  const cambios = [...r.cambios]
  if (Object.prototype.hasOwnProperty.call(valor, 'asegurados')) {
    const nuevo = valor.asegurados ?? null
    if (JSON.stringify(nuevo) !== JSON.stringify(previo.asegurados)) {
      cambios.push({ campo: 'asegurados', antes: textoAseguradosAdicionales(previo.asegurados), despues: textoAseguradosAdicionales(nuevo) })
      datos.asegurados = nuevo
    }
  }
  // Mismo sello que el resto: se confirma → `ahora`; cualquier cambio sin confirmar (también la lista) → se borra.
  if (opciones.confirmar) datos.confirmadoAt = opciones.ahora
  else if (cambios.length > 0) datos.confirmadoAt = null
  return { datos, cambios }
}

export function motivoNoConfirmableCapital(d: DatosCapitalRiesgo): string | null {
  const alguno = d.capital !== null || d.duracionAnios !== null || d.modalidadDeseada !== null || d.profesion !== null || d.fumador !== null || d.asegurados !== null
  return alguno ? null : 'No se puede confirmar un capital sin ningún dato.'
}

/**
 * Lo que una cotización de vida/salud/decesos con `?oportunidad=` deja anotado en el riesgo: de `resueltos`, los
 * campos del ramo (`capital`; vida: `profesion` y `fumador`; salud: `modalidadDeseada`; salud y decesos: `asegurados`).
 * Solo claves con valor; lo inválido, descartado (mejor no anotarlo que anotarlo mal). Lo que la cotización no trae
 * no borra lo guardado.
 */
export function datosCapitalDeCotizacion(cuerpo: unknown, ramo: RamoCapital, opciones: { hoy?: string } = {}): ValorEdicionCapital {
  const c = esObj(cuerpo) ? cuerpo : {}
  const res = esObj(c.resueltos) ? c.resueltos : {}
  const candidato: Record<string, unknown> = {}
  for (const k of camposCapitalDelRamo(ramo)) {
    const v = res[k]
    if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) continue
    // Una lista vacía no es «revisado, ninguno»: es que la cotización no llevaba asegurados. No se anota.
    if (k === 'asegurados' && (!Array.isArray(v) || v.length === 0)) continue
    candidato[k] = v
  }
  for (let i = 0; i < CAMPOS_CAPITAL.length; i++) {
    const v = validarDatosCapitalRiesgo(candidato, { ...opciones, ramo })
    if (v.ok) return v.valor
    for (const e of v.errores) delete candidato[e.campo]
  }
  return {}
}
