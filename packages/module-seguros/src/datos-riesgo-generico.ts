/**
 * Motor común de los «datos del riesgo» de una oportunidad que NO es de vehículo (30/09/2026):
 * vivienda (hogar), capital (vida/salud/decesos) y riesgo libre (RC, comercio, comunidades, otros).
 * Mismo patrón que `datos-vehiculo-riesgo.ts`, sin repetirlo tres veces: cada bloque declara su ESPECIFICACIÓN
 * (campo → tipo) y este motor valida, lee, aplica la edición y decide el sello de confirmación.
 *
 * 🚨 `null` = «no se sabe», nunca `''` ni `0`. Un `0` es un dato («cero euros declarados»); un campo sin dato
 * es `null`. Una clave ausente en la edición = «no se toca»; `null`/`''` = «borrar este dato».
 *
 * Solo TS puro (sin `node:*`): lo importan la pantalla y el puerto.
 */

export type TipoCampoRiesgo =
  | { t: 'texto'; max: number }
  /** Identificador de catálogo (`Calle`, `MiddleFloor`, un número como texto…). */
  | { t: 'id' }
  | { t: 'cp' }
  /** 20 caracteres alfanuméricos (la de 14 es la del edificio y no sirve). */
  | { t: 'referencia' }
  | { t: 'entero'; min: number; max: number | 'anioTope' }
  /** Número con decimales; `min` incluido salvo `sobreMin` (estrictamente mayor). */
  | { t: 'numero'; min: number; max: number; sobreMin?: boolean }
  | { t: 'bool' }
  /** Código numérico de N cifras (p. ej. la profesión CNO-11 de nivel 4: `2612`). */
  | { t: 'codigo'; digitos: number }

export type EspecCampo = { clave: string; etiqueta: string; tipo: TipoCampoRiesgo }
export type Espec = readonly EspecCampo[]

export type ErrorCampo = { campo: string; motivo: string }
export type ValorCampo = string | number | boolean | null
export type CambioCampo = { campo: string; antes: ValorCampo; despues: ValorCampo }

const RE_CP = /^\d{5}$/
const RE_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/
const RE_REF20 = /^[0-9A-Z]{20}$/

/** «1.250,50» / «15.000» / «12000» / 12000 → número; cualquier otra cosa → NaN. */
export function numeroDesdeTexto(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : Number.NaN
  if (typeof v !== 'string') return Number.NaN
  const t = v.replace(/\s/g, '').replace(/€/g, '')
  if (t === '') return Number.NaN
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) return Number(t.replace(/\./g, '').replace(',', '.'))
  if (/^\d+,\d+$/.test(t)) return Number(t.replace(',', '.'))
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t)
  return Number.NaN
}

function texto(v: unknown, max: number): string | null | 'invalido' {
  if (v === null || v === undefined) return null
  if (typeof v !== 'string') return 'invalido'
  const t = v.replace(/\s+/g, ' ').trim()
  if (t === '') return null
  return t.length > max ? 'invalido' : t
}

const vacio = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '')

/** Año máximo admitido en un año de construcción/reforma: el que viene (una obra que acaba de terminar). */
export function anioTope(hoy: string): number {
  return Number(hoy.slice(0, 4)) + 1
}

/**
 * Valida un objeto PARCIAL contra la especificación. Solo devuelve las claves que vinieron.
 * Las claves que no están en la especificación se ignoran (no se cuelan al JSON guardado).
 */
export function validarParcial(
  spec: Espec,
  parcial: unknown,
  opciones: { hoy: string; nombreBloque: string },
): { ok: true; valor: Record<string, ValorCampo> } | { ok: false; errores: ErrorCampo[] } {
  if (typeof parcial !== 'object' || parcial === null || Array.isArray(parcial)) {
    return { ok: false, errores: [{ campo: spec[0]?.clave ?? '', motivo: `${opciones.nombreBloque}: tienen que ser un objeto.` }] }
  }
  const e = parcial as Record<string, unknown>
  const valor: Record<string, ValorCampo> = {}
  const errores: ErrorCampo[] = []
  for (const c of spec) {
    if (!Object.prototype.hasOwnProperty.call(e, c.clave)) continue
    const v = e[c.clave]
    const mal = (motivo: string) => errores.push({ campo: c.clave, motivo: `${c.etiqueta}: ${motivo}` })
    const t = c.tipo
    switch (t.t) {
      case 'texto': {
        const x = texto(v, t.max)
        if (x === 'invalido') mal('texto no válido o demasiado largo.')
        else valor[c.clave] = x
        break
      }
      case 'id': {
        const x = texto(v, 40)
        if (x === 'invalido' || (x !== null && /[\s"'<>]/.test(x))) mal('identificador no válido.')
        else valor[c.clave] = x
        break
      }
      case 'cp': {
        const x = texto(v, 10)
        if (x === 'invalido' || (x !== null && !RE_CP.test(x))) mal('5 cifras.')
        else valor[c.clave] = x
        break
      }
      case 'referencia': {
        const x = texto(v, 40)
        if (x === 'invalido') mal('referencia no válida.')
        else if (x === null) valor[c.clave] = null
        else {
          const r = x.replace(/[\s-]/g, '').toUpperCase()
          if (!RE_REF20.test(r)) mal('tienen que ser los 20 caracteres del recibo del IBI (la de 14 es la del edificio).')
          else valor[c.clave] = r
        }
        break
      }
      case 'entero': {
        if (vacio(v)) { valor[c.clave] = null; break }
        const n = numeroDesdeTexto(v)
        const max = t.max === 'anioTope' ? anioTope(opciones.hoy) : t.max
        if (!Number.isInteger(n) || n < t.min || n > max) mal(`un número entero entre ${t.min} y ${max}.`)
        else valor[c.clave] = n
        break
      }
      case 'numero': {
        if (vacio(v)) { valor[c.clave] = null; break }
        const n = numeroDesdeTexto(v)
        if (!Number.isFinite(n) || (t.sobreMin ? n <= t.min : n < t.min) || n > t.max) {
          mal(t.sobreMin ? `un número mayor que ${t.min} y como mucho ${t.max}.` : `un número entre ${t.min} y ${t.max}.`)
        } else valor[c.clave] = Math.round(n * 100) / 100
        break
      }
      case 'bool': {
        if (v === null || v === undefined) valor[c.clave] = null
        else if (typeof v === 'boolean') valor[c.clave] = v
        else mal('sí o no.')
        break
      }
      case 'codigo': {
        const x = texto(typeof v === 'number' ? String(v) : v, 20)
        if (x === 'invalido' || (x !== null && !new RegExp(`^\\d{${t.digitos}}$`).test(x))) mal(`${t.digitos} cifras.`)
        else valor[c.clave] = x
        break
      }
    }
  }
  return errores.length > 0 ? { ok: false, errores } : { ok: true, valor }
}

/** Todos los campos a `null` + sin sello. */
export function vaciosDe(spec: Espec): Record<string, ValorCampo> {
  const o: Record<string, ValorCampo> = {}
  for (const c of spec) o[c.clave] = null
  o.confirmadoAt = null
  return o
}

/**
 * Lee un bloque tal como está en la BD, sin fiarse: un campo con otro tipo (o fuera de rango de tipo, no de
 * negocio) es «no se sabe» (null), no un valor inventado.
 */
export function leerBloque(spec: Espec, bruto: unknown): Record<string, ValorCampo> | null {
  if (typeof bruto !== 'object' || bruto === null || Array.isArray(bruto)) return null
  const o = bruto as Record<string, unknown>
  const out = vaciosDe(spec)
  for (const c of spec) {
    const v = o[c.clave]
    switch (c.tipo.t) {
      case 'texto': case 'id': case 'cp': case 'referencia': case 'codigo':
        out[c.clave] = typeof v === 'string' && v.trim() !== '' ? v.trim() : null
        break
      case 'entero': case 'numero':
        out[c.clave] = typeof v === 'number' && Number.isFinite(v) ? v : null
        break
      case 'bool':
        out[c.clave] = typeof v === 'boolean' ? v : null
        break
    }
  }
  const iso = typeof o.confirmadoAt === 'string' ? o.confirmadoAt.trim() : null
  out.confirmadoAt = iso !== null && RE_ISO.test(iso) ? iso : null
  return out
}

/**
 * Aplica una edición ya validada y decide el sello (mismas reglas que el vehículo):
 *  - hay cambios y NO se confirma → `confirmadoAt` se BORRA;
 *  - se confirma → `confirmadoAt = ahora` (con o sin cambios);
 *  - sin cambios y sin confirmar → todo igual, sello incluido.
 * Compara con lo guardado, no con lo mandado.
 */
export function aplicarEdicionBloque(
  spec: Espec,
  actual: Record<string, ValorCampo> | null,
  valor: Record<string, ValorCampo>,
  opciones: { confirmar: boolean; ahora: string },
): { datos: Record<string, ValorCampo>; cambios: CambioCampo[] } {
  const previo = actual ?? vaciosDe(spec)
  const datos: Record<string, ValorCampo> = { ...previo }
  const cambios: CambioCampo[] = []
  for (const c of spec) {
    if (!Object.prototype.hasOwnProperty.call(valor, c.clave)) continue
    const nuevo = valor[c.clave] ?? null
    if (nuevo === previo[c.clave]) continue
    cambios.push({ campo: c.clave, antes: previo[c.clave] ?? null, despues: nuevo })
    datos[c.clave] = nuevo
  }
  if (opciones.confirmar) datos.confirmadoAt = opciones.ahora
  else if (cambios.length > 0) datos.confirmadoAt = null
  return { datos, cambios }
}

/** Solo los campos cuyo valor difiere del estado inicial (para no pisar escrituras concurrentes ni copiar fallbacks). */
export function soloLoQueCambia(
  inicial: Record<string, unknown> | null,
  actual: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(actual)) {
    const antes = inicial?.[k] ?? null
    const ahora = typeof v === 'string' && v.trim() === '' ? null : v
    // «12.000» tecleado sobre un 12000 guardado no es un cambio.
    if (typeof antes === 'number' && typeof ahora === 'string' && numeroDesdeTexto(ahora) === antes) continue
    if (antes !== ahora) out[k] = ahora
  }
  return out
}
