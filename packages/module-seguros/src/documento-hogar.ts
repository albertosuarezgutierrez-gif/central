/**
 * Normalización de lo que una máquina dice haber leído en una PÓLIZA DE HOGAR.
 *
 * Puro: sin BD, sin red, sin proveedor de IA. Hermano de `documento-auto.ts`:
 * mismo propósito (lo que hace falta para PEDIR PRECIO, no los cinco campos
 * que ve el asegurado en su bóveda — eso es `@central/module-seguros-portal`),
 * mismo comportamiento ante un «no lo sé» disfrazado de dato (vigilado por el
 * mismo guardián compartido, `test/regression-marcadores-sin-dato.test.ts`),
 * pero un tipo DISTINTO porque lo que hace falta para cotizar hogar no es el
 * vehículo: es el riesgo (dirección, m², año, capitales) — exactamente los
 * campos que `lib/codeoscopic/desde-cartera-hogar.ts` ya lee de la póliza o de
 * su copia gemela, y que hasta ahora nadie podía traer de un documento nuevo.
 *
 * La regla, entera (la misma que `documento-auto.ts`):
 *  - `null` = «no se sabe». Es el estado por defecto de TODO campo.
 *  - Un valor de CAJÓN se ANULA aquí, antes de que nadie lo escriba.
 *  - Nada se inventa ni se deduce. Lo que no encaje con su forma se anula.
 */

import { MARCADORES_SIN_DATO } from './documento-auto.ts'

const SET_MARCADORES = new Set(MARCADORES_SIN_DATO)

/** Lo que se puede leer de una póliza de hogar. TODO puede ser `null`. */
export type HogarLeido = {
  // ── Identificación de la póliza ──
  compania: string | null
  codigoEntidadDgs: string | null
  numeroPoliza: string | null
  fechaEfecto: string | null
  fechaVencimiento: string | null
  primaAnual: number | null

  // ── El riesgo (la vivienda) ──
  direccion: string | null
  cp: string | null
  localidad: string | null
  metrosCuadrados: number | null
  anioConstruccion: number | null
  capitalContinente: number | null
  capitalContenido: number | null

  // ── Tomador ──
  tomador: string | null
  dni: string | null
  fechaNacimiento: string | null
}

/** Qué campos son de PERSONA. Nunca se suponen (regla de la casa). */
export const CAMPOS_PERSONALES_HOGAR: readonly (keyof HogarLeido)[] = ['tomador', 'dni', 'fechaNacimiento']

export function hogarLeidoVacio(): HogarLeido {
  return {
    compania: null,
    codigoEntidadDgs: null,
    numeroPoliza: null,
    fechaEfecto: null,
    fechaVencimiento: null,
    primaAnual: null,
    direccion: null,
    cp: null,
    localidad: null,
    metrosCuadrados: null,
    anioConstruccion: null,
    capitalContinente: null,
    capitalContenido: null,
    tomador: null,
    dni: null,
    fechaNacimiento: null,
  }
}

/** ¿Se ha leído ALGO? `false` = el documento no se pudo leer, no que esté vacío. */
export function seLeyoAlgoHogar(d: HogarLeido): boolean {
  return Object.values(d).some((v) => v !== null)
}

// ─── Primitivas (mismo comportamiento que documento-auto.ts, no el mismo código:
//      la regla se comparte por el guardián, no por un helper importado) ──────

function texto(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const limpio = v.trim()
  if (SET_MARCADORES.has(limpio.toLowerCase())) return null
  return limpio === '' ? null : limpio
}

const ANIO_MAX_CONSTRUCCION = new Date().getUTCFullYear() + 1

/** Entero en un rango. Fuera de forma o de rango, `null`. */
function enteroEnRango(v: unknown, min: number, max: number): number | null {
  let n: number
  if (typeof v === 'number') n = v
  else if (typeof v === 'string') {
    const t = texto(v)
    if (t === null) return null
    if (!/^\d{1,6}$/.test(t)) return null
    n = Number(t)
  } else return null
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) return null
  return n
}

/** Importe en euros. Un capital o una prima de 0€ no existen: son un «no lo he leído». */
function importe(v: unknown): number | null {
  let n: number
  if (typeof v === 'number') n = v
  else if (typeof v === 'string') {
    const t = texto(v)
    if (t === null) return null
    n = Number(
      t
        .replace(/[€\s]/g, '')
        .replace(/\.(?=\d{3}(\D|$))/g, '')
        .replace(',', '.'),
    )
  } else return null
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

/** `aaaa-mm-dd` estricto: rechaza los días que `Date` «arregla» solo. */
function fechaIso(v: unknown): string | null {
  const t = texto(v)
  if (t === null) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null
  const d = new Date(`${t}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10) === t ? t : null
}

/**
 * Código postal español: 5 dígitos, SIEMPRE como texto (Álava, Albacete y
 * Alicante empiezan por 0 — la misma trampa que ya evita `campos-ramo.ts`).
 */
function codigoPostal(v: unknown): string | null {
  const t = texto(v)
  if (t === null) return null
  const limpio = t.replace(/\s/g, '')
  return /^\d{5}$/.test(limpio) ? limpio : null
}

/** DNI/NIE. Se comprueba la LETRA: un DNI mal leído es de otra persona. */
function documentoIdentidad(v: unknown): string | null {
  const t = texto(v)
  if (t === null) return null
  const limpio = t.toUpperCase().replace(/[\s-]/g, '')
  const m = /^([XYZ]?)(\d{7,8})([A-Z])$/.exec(limpio)
  if (!m) return null
  const numero = Number((m[1] === '' ? '' : String('XYZ'.indexOf(m[1]))) + m[2])
  if (!Number.isFinite(numero)) return null
  if ('TRWAGMYFPDXBNJZSQVHLCKE'[numero % 23] !== m[3]) return null
  return limpio
}

/** Código DGS de entidad: `C` + 4 dígitos (C0058 Mapfre, C0109 Allianz…). */
function codigoDgs(v: unknown): string | null {
  const t = texto(v)
  if (t === null) return null
  const limpio = t.toUpperCase().replace(/\s/g, '')
  return /^C\d{4}$/.test(limpio) ? limpio : null
}

/**
 * Convierte lo que devuelva el modelo en `HogarLeido`.
 *
 * Nunca lanza: una respuesta ilegible produce TODO a `null`.
 */
export function normalizarHogarLeido(raw: unknown): HogarLeido {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return hogarLeidoVacio()
  const o = raw as Record<string, unknown>
  return {
    compania: texto(o.compania),
    codigoEntidadDgs: codigoDgs(o.codigoEntidadDgs),
    numeroPoliza: texto(o.numeroPoliza),
    fechaEfecto: fechaIso(o.fechaEfecto),
    fechaVencimiento: fechaIso(o.fechaVencimiento),
    primaAnual: importe(o.primaAnual),
    direccion: texto(o.direccion),
    cp: codigoPostal(o.cp),
    localidad: texto(o.localidad),
    metrosCuadrados: enteroEnRango(o.metrosCuadrados, 1, 10000),
    anioConstruccion: enteroEnRango(o.anioConstruccion, 1800, ANIO_MAX_CONSTRUCCION),
    capitalContinente: importe(o.capitalContinente),
    capitalContenido: importe(o.capitalContenido),
    tomador: texto(o.tomador),
    dni: documentoIdentidad(o.dni),
    fechaNacimiento: fechaIso(o.fechaNacimiento),
  }
}

/** Los campos que SÍ se han leído. Es lo que la pantalla enseña para revisar. */
export function camposLeidosHogar(d: HogarLeido): (keyof HogarLeido)[] {
  return (Object.keys(d) as (keyof HogarLeido)[]).filter((k) => d[k] !== null)
}
