// Reglas PURAS de «todo documento de seguro subido es una oportunidad» (29/09/2026).
//
// Alberto: «toda documentación que se suba, donde se suba —recibo, póliza, imagen—, esa
// información no se puede perder porque hay que llamarlo un mes y pico antes del vencimiento».
// Decisiones suyas del mismo día: llamada 45 días antes; sin vencimiento legible se crea igual
// con una tarea para pedirlo; si el documento es de OTRA persona, lead automático por DNI y
// relación con quien lo sube.
//
// Aquí no hay BD ni red: lo que decide va testeado en `oportunidad-documento-reglas.test.ts`.

import { DIAS_AVISO_OPORTUNIDAD, fechaAvisoOportunidad } from '@central/module-seguros'

/** Días antes del vencimiento a los que se llama: la regla única de las oportunidades (`@central/module-seguros`). */
export const DIAS_LLAMADA_ANTES_VENCIMIENTO = DIAS_AVISO_OPORTUNIDAD

const RAMOS = ['auto', 'moto', 'hogar', 'vida', 'salud', 'decesos', 'responsabilidad_civil', 'comercio', 'comunidades', 'accidentes', 'otros'] as const
export type RamoDocumento = (typeof RAMOS)[number]

/** El ramo leído, o `otros`: un documento de seguro sin ramo claro sigue siendo una venta. */
export function ramoOportunidad(ramo: unknown): RamoDocumento {
  return RAMOS.find((r) => r === ramo) ?? 'otros'
}

const iso = (d: Date) => d.toISOString().slice(0, 10)
const utc = (s: string) => new Date(`${s}T00:00:00Z`)

/**
 * El PRÓXIMO vencimiento. Una póliza de 2025 subida hoy vence otra vez este año: los seguros
 * se renuevan cada año, así que un vencimiento pasado se corre de año en año hasta hoy o
 * después. Sin esto, la oportunidad nacería con la fecha ya vencida y nadie la llamaría.
 */
export function proximoVencimiento(fecha: string | null | undefined, hoy: Date): string | null {
  if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null
  const d = utc(fecha)
  if (Number.isNaN(d.getTime())) return null
  const hoyIso = iso(hoy)
  let anios = 0
  let r = fecha
  while (r < hoyIso && anios < 30) {
    anios++
    const n = new Date(Date.UTC(d.getUTCFullYear() + anios, d.getUTCMonth(), d.getUTCDate()))
    // 29/02 en año no bisiesto: Date lo pasa a 01/03; se queda en el 28/02.
    if (n.getUTCMonth() !== d.getUTCMonth()) n.setUTCDate(0)
    r = iso(n)
  }
  return r < hoyIso ? null : r
}

/** Cuándo llamar: 45 días antes del vencimiento; si eso ya pasó (o no hay fecha), mañana. */
export function fechaLlamada(vence: string | null, hoy: Date): string {
  return fechaAvisoOportunidad(vence, iso(hoy))
}

/**
 * ¿Trae algo de un seguro? Un DNI, un carné o una foto cualquiera no traen compañía, nº de
 * póliza, vencimiento ni prima: se guardan como documento y no abren nada.
 */
export function esDocumentoDeSeguro(d: { compania?: unknown; numeroPoliza?: unknown; fechaVencimiento?: unknown; primaAnual?: unknown }): boolean {
  const txt = (v: unknown) => typeof v === 'string' && v.trim() !== ''
  return txt(d.compania) || txt(d.numeroPoliza) || txt(d.fechaVencimiento) || (typeof d.primaAnual === 'number' && d.primaAnual > 0)
}

// Partículas que no identifican a nadie: «de la» no puede contar como media persona.
const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'i'])
const palabras = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9ñ]+/).filter((p) => p.length >= 2 && !PARTICULAS.has(p))

/**
 * ¿Es el mismo nombre? Las pólizas escriben «PIÑA FRANCO MANUEL ANTONIO» y la ficha «Manuel Antonio
 * Piña Franco»: se compara por palabras, sin orden. Mismo si TODAS las palabras del nombre más corto
 * están en el otro y son al menos dos. Un padre «Manuel Piña Ruiz» no es su hijo «Manuel Antonio
 * Piña Franco» (falta «ruiz»). Ante la duda, NO es el mismo: duplicar se ve, mezclar no. Las
 * partículas («de», «la», «y»…) no cuentan.
 */
export function mismoNombre(a: string | null | undefined, b: string | null | undefined, opts: { exacto?: boolean } = {}): boolean {
  const pa = new Set(palabras(a))
  const pb = new Set(palabras(b))
  const [corto, largo] = pa.size <= pb.size ? [pa, pb] : [pb, pa]
  if (corto.size < 2) return false
  // `exacto`: las mismas palabras, sin sobrar ninguna. Es lo que se exige cuando el documento trae un
  // DNI que la ficha no tiene: «Manuel Piña» (hijo, sin DNI) no se queda la póliza de «Manuel Piña Ruiz».
  if (opts.exacto && corto.size !== largo.size) return false
  for (const p of corto) if (!largo.has(p)) return false
  return true
}

const dniNormal = (s: string | null | undefined) => (s ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '')

export type DecisionFicha =
  | { tipo: 'ficha'; clienteId: string; porque: 'dni_ficha' | 'dni_cartera' | 'nombre' | 'sin_tomador' }
  | { tipo: 'lead' }
  | { tipo: 'sin_persona' }

/**
 * ¿A qué ficha va la oportunidad? Por IDENTIDAD (DNI) antes que por nombre, y dos DNI distintos
 * no se funden nunca (regla «agrupar personas por identidad»).
 *
 * - `clienteSube`: la ficha donde se ha subido (null si se sube sin ficha, p. ej. el portal sin
 *   vínculo). `dniFicha`: su DNI descifrado (null si no tiene o no se pudo leer).
 * - `coincidencias`: fichas con el DNI del documento. `null` = no se pudo buscar (≠ `[]`).
 */
export function decidirFicha(e: {
  clienteSube: string | null
  nombreFicha: string | null
  dniFicha: string | null
  tomador: string | null
  dniDocumento: string | null
  coincidencias: { id: string; activo: boolean }[] | null
}): DecisionFicha {
  const dniDoc = dniNormal(e.dniDocumento)
  if (dniDoc) {
    if (e.clienteSube && e.dniFicha && dniNormal(e.dniFicha) === dniDoc) return { tipo: 'ficha', clienteId: e.clienteSube, porque: 'dni_ficha' }
    const cs = e.coincidencias ?? []
    if (cs.length > 0) {
      const propia = e.clienteSube ? cs.find((c) => c.id === e.clienteSube) : undefined
      const elegida = propia ?? cs.find((c) => c.activo) ?? cs[0]
      return { tipo: 'ficha', clienteId: elegida.id, porque: 'dni_cartera' }
    }
    // La ficha no tiene DNI guardado (o no se pudo leer) pero se llama igual: es ella. Con OTRO DNI
    // en la ficha, no: es otra persona aunque se llame igual.
    if (e.clienteSube && !e.dniFicha && mismoNombre(e.tomador, e.nombreFicha, { exacto: true })) return { tipo: 'ficha', clienteId: e.clienteSube, porque: 'nombre' }
    return { tipo: 'lead' }
  }
  if (!e.tomador || palabras(e.tomador).length === 0) {
    return e.clienteSube ? { tipo: 'ficha', clienteId: e.clienteSube, porque: 'sin_tomador' } : { tipo: 'sin_persona' }
  }
  if (e.clienteSube && mismoNombre(e.tomador, e.nombreFicha)) return { tipo: 'ficha', clienteId: e.clienteSube, porque: 'nombre' }
  return { tipo: 'lead' }
}

/**
 * Sin ficha por DNI, las fichas que comparten su teléfono o email son POSIBLES DUPLICADOS, y nada
 * más (03/10/2026, revisión del PR #4147): no se asigna la póliza a ninguna ni se le escribe el DNI.
 *
 * 🚨 Un móvil identifica un HOGAR, no a una persona (740 números compartidos por 1.599 fichas; caso
 * fundacional del 21/09/2026: el hijo trae la póliza del padre con SU teléfono). Asignar por
 * contacto fundiría a dos personas para siempre; duplicar se ve y se arregla fusionando por SQL con
 * lote y guarda de identidad. Se abre el lead y se deja la nota «posible duplicado de <id>».
 */
export function posiblesDuplicadosPorContacto(candidatos: { id: string }[], excepto?: string | null): string[] {
  return [...new Set(candidatos.map((c) => c.id))].filter((id) => id !== excepto)
}

/** Orígenes donde quien sube el documento es el CLIENTE (no el corredor). */
export const ORIGENES_DEL_CLIENTE: readonly string[] = ['portal', 'solicitud']

/**
 * ¿Se vuelcan a la ficha los datos personales que trae el documento? (03/10/2026, revisión PR #4147)
 *
 * 🚨 Desde el PORTAL (o el enlace de datos) sube el cliente, y el email que se vuelque puede acabar
 * enlazando la sesión del portal: subir la póliza de OTRA persona con tu email sería tomar su cuenta.
 * Ahí solo se vuelca si la ficha destino es la PROPIA de quien sube. Nunca sin verificar, ni sin
 * tomador (no se sabe de quién son los datos).
 */
export function puedeVolcarEnFicha(e: {
  origen: string
  verificado: boolean
  hayTomador: boolean
  porqueFicha: string | null
  clienteId: string
  clienteSube: string | null
}): boolean {
  if (!e.verificado || !e.hayTomador || e.porqueFicha === 'sin_tomador') return false
  if (ORIGENES_DEL_CLIENTE.includes(e.origen)) return e.clienteSube !== null && e.clienteId === e.clienteSube
  return true
}
