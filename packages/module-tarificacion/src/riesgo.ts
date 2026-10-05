// Validación PURA del riesgo de comunidad que llega al encolar (05/10/2026). Lo que no viene se
// guarda como `null` («no se sabe»), nunca como 0 ni `false`.

import type { RiesgoComunidad } from './tipos.ts'

export type ValidacionRiesgo = { ok: true; riesgo: RiesgoComunidad } | { ok: false; errores: string[] }

const obj = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null

function texto(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t
}

/** Entero ≥ min o null. Un valor presente pero inválido es ERROR (no se convierte en null). */
function entero(v: unknown, campo: string, errores: string[], min = 0, max = Number.MAX_SAFE_INTEGER): number | null {
  if (v === undefined || v === null || v === '') return null
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  if (!Number.isInteger(n) || n < min || n > max) {
    errores.push(`${campo}: «${String(v)}» no es un entero entre ${min} y ${max}`)
    return null
  }
  return n
}

function importe(v: unknown, campo: string, errores: string[]): number | null {
  if (v === undefined || v === null || v === '') return null
  const n = typeof v === 'number' ? v : NaN
  if (!Number.isFinite(n) || n <= 0) {
    errores.push(`${campo}: tiene que ser un importe en euros mayor que 0 (número, no texto)`)
    return null
  }
  return Math.round(n * 100) / 100
}

function booleano(v: unknown, campo: string, errores: string[]): boolean | null {
  if (v === undefined || v === null) return null
  if (typeof v !== 'boolean') {
    errores.push(`${campo}: tiene que ser true/false (o no venir)`)
    return null
  }
  return v
}

export function validarRiesgoComunidad(entrada: unknown, hoy: Date = new Date()): ValidacionRiesgo {
  const e = obj(entrada)
  if (!e) return { ok: false, errores: ['el riesgo tiene que ser un objeto'] }
  const errores: string[] = []
  if (e.ramo !== undefined && e.ramo !== 'comunidades') errores.push(`ramo «${String(e.ramo)}» no es comunidades`)

  const d = obj(e.direccion)
  const via = texto(d?.via)
  const cp = texto(d?.codigoPostal)
  if (!via) errores.push('direccion.via es obligatoria')
  if (!cp || !/^\d{5}$/.test(cp)) errores.push('direccion.codigoPostal tiene que tener 5 dígitos')

  const anioMax = hoy.getUTCFullYear()
  const anioConstruccion = entero(e.anioConstruccion, 'anioConstruccion', errores, 1800, anioMax)
  const anioRehabilitacion = entero(e.anioRehabilitacion, 'anioRehabilitacion', errores, 1800, anioMax)
  const m2Construidos = entero(e.m2Construidos, 'm2Construidos', errores, 1)
  const numViviendas = entero(e.numViviendas, 'numViviendas', errores, 0)
  const numLocales = entero(e.numLocales, 'numLocales', errores, 0)
  const numGarajes = entero(e.numGarajes, 'numGarajes', errores, 0)
  const plantas = entero(e.plantas, 'plantas', errores, 1, 80)
  const plantasBajoRasante = entero(e.plantasBajoRasante, 'plantasBajoRasante', errores, 0, 10)
  const siniestros = entero(e.siniestrosUltimos3Anios, 'siniestrosUltimos3Anios', errores, 0)
  const capitalContinente = importe(e.capitalContinente, 'capitalContinente', errores)
  const capitalContenido = importe(e.capitalContenido, 'capitalContenido', errores)
  if (m2Construidos === null && capitalContinente === null) {
    errores.push('hace falta m2Construidos o capitalContinente: sin ninguno no hay con qué dimensionar el edificio')
  }

  const calidad = e.calidadConstruccion
  if (calidad !== undefined && calidad !== null && calidad !== 'normal' && calidad !== 'alta' && calidad !== 'lujo') {
    errores.push('calidadConstruccion: normal | alta | lujo')
  }

  const fecha = texto(e.fechaEfecto)
  if (fecha !== null && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) errores.push('fechaEfecto: formato AAAA-MM-DD')
  if (fecha !== null && /^\d{4}-\d{2}-\d{2}$/.test(fecha) && fecha < hoy.toISOString().slice(0, 10)) {
    errores.push('fechaEfecto: ya ha pasado (una fecha de efecto caducada no se tarifica)')
  }

  const ascensor = booleano(e.ascensor, 'ascensor', errores)
  const piscina = booleano(e.piscina, 'piscina', errores)
  const zonas = booleano(e.zonasAjardinadas, 'zonasAjardinadas', errores)

  if (errores.length) return { ok: false, errores }
  return {
    ok: true,
    riesgo: {
      ramo: 'comunidades',
      direccion: {
        via: via as string,
        numero: texto(d?.numero),
        codigoPostal: cp as string,
        municipio: texto(d?.municipio),
        provincia: texto(d?.provincia),
      },
      referenciaCatastral: texto(e.referenciaCatastral),
      anioConstruccion,
      anioRehabilitacion,
      m2Construidos,
      numViviendas,
      numLocales,
      numGarajes,
      plantas,
      plantasBajoRasante,
      ascensor,
      piscina,
      zonasAjardinadas: zonas,
      calidadConstruccion: (calidad as RiesgoComunidad['calidadConstruccion']) ?? null,
      capitalContinente,
      capitalContenido,
      siniestrosUltimos3Anios: siniestros,
      companiaActual: texto(e.companiaActual),
      fechaEfecto: fecha,
    },
  }
}
