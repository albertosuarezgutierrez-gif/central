// Sustitución AUTOMÁTICA de una póliza por otra: el cliente se cambia de compañía (o renueva con
// número nuevo) y la póliza nueva entra por CIMA sin que nadie la enlace con la vieja.
//
// Caso fundacional (23/09/2026): José Suárez pasó su Hyundai Kona 9833LJC de Mapfre a Reale y el
// portal le enseñaba DOS seguros «En vigor» del mismo coche. La Reale no salió de un presupuesto
// emitido por Codeoscopic (que ya enlaza solo, `lib/emision.ts` de asegura), así que nada decía que
// una sustituía a la otra. Dictado de Alberto: «tiene que ser automático… tienes información de
// todo en cada momento».
//
// Solo se enlaza cuando la prueba es DETERMINISTA — mismo cliente, mismo ramo y la MISMA matrícula —
// y la nueva empieza cerca del vencimiento de la vieja. Si una vieja casa con dos nuevas (o una
// nueva con dos viejas) no se enlaza ninguna: elegir por el orden de la consulta enlazaría el coche
// equivocado, y ese error no deja hueco visible. Hogar no entra todavía: su dirección viaja cifrada
// y comparar la cadena cifrada no prueba nada.

import { normalizarMatricula } from './matricula.ts'
import { normalizarNumeroPoliza } from './duplicados.ts'

/** Días antes del vencimiento de la vieja en los que la nueva puede empezar (cambio anticipado). */
export const SUSTITUCION_DIAS_ANTES = 60
/** Días después del vencimiento de la vieja en los que aún se considera continuación. */
export const SUSTITUCION_DIAS_DESPUES = 30

export type PolizaParaSustitucion = {
  id: string
  clienteId: string
  /** `tipo` de la póliza (`auto`, `moto`…). */
  ramo: string
  numeroPoliza: string | null
  /** `YYYY-MM-DD`. `null` = no se sabe → no se enlaza. */
  fechaInicio: string | null
  fechaVencimiento: string | null
  /** `datos_especificos.matricula` tal cual. `null`/vacía = sin prueba → no se enlaza. */
  matricula: string | null
  /** La nueva tiene que seguir en vigor: una que el cliente ya anuló no sustituye a nada. */
  vigente: boolean
  /** Ya marcada como sustituida (por emisión o por una pasada anterior). */
  sustituida: boolean
  /** Ya tiene `poliza_origen_id`: ya sabe a quién sustituye. */
  conOrigen: boolean
}

export type SustitucionDetectada = { viejaId: string; nuevaId: string; matricula: string }

export type ResultadoSustituciones = {
  enlaces: SustitucionDetectada[]
  /** Parejas que casaban pero no de forma única: no se enlazan y se cuentan. */
  ambiguas: number
}

function dias(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5)
}

function menosUnAnio(fecha: string): string {
  const [a, m, d] = fecha.split('-')
  const anio = Number(a) - 1
  // 29/02 de un año sin bisiesto → 28/02.
  const ultimo = new Date(Date.UTC(anio, Number(m), 0)).getUTCDate()
  return `${anio}-${m}-${String(Math.min(Number(d), ultimo)).padStart(2, '0')}`
}

/**
 * Distancia (en días) del inicio de la nueva al aniversario de la vieja más cercano. Se mira también
 * el ANTERIOR al vencimiento: si el cliente no avisó a tiempo, CIMA ya trae la vieja renovada (su
 * vencimiento salta un año) cuando la nueva entra. Medido el 23/09/2026: Occident renovada hasta
 * 09/09/2027 y la Allianz del mismo coche con efecto 17/09/2026.
 */
function distanciaAniversario(inicioVieja: string, vencimiento: string, inicioNueva: string): number {
  const a = dias(vencimiento, inicioNueva)
  const anterior = menosUnAnio(vencimiento)
  // El aniversario anterior solo cuenta si la vieja ya estaba viva entonces (se RENOVÓ ahí). Si es
  // su propio efecto, dos pólizas que empiezan con un día de diferencia se «sustituirían» entre sí.
  if (anterior <= inicioVieja) return a
  const b = dias(anterior, inicioNueva)
  return Math.abs(a) <= Math.abs(b) ? a : b
}

function claveBien(p: PolizaParaSustitucion): string | null {
  const m = normalizarMatricula(p.matricula ?? '')
  // Menos de 5 caracteres no es una matrícula (un «-», «SIN», un bastidor cortado): sin prueba.
  return m.length >= 5 ? `${p.clienteId}|${p.ramo}|${m}` : null
}

/**
 * Parejas vieja → nueva que se pueden enlazar solas. Ninguna escritura: quien llama marca la vieja
 * `sustituida_at` y la nueva `poliza_origen_id`.
 */
export function detectarSustituciones(polizas: readonly PolizaParaSustitucion[]): ResultadoSustituciones {
  const porBien = new Map<string, PolizaParaSustitucion[]>()
  for (const p of polizas) {
    const k = claveBien(p)
    if (k === null || p.fechaInicio === null) continue
    porBien.set(k, [...(porBien.get(k) ?? []), p])
  }

  const candidatas: SustitucionDetectada[] = []
  for (const [k, grupo] of porBien) {
    if (grupo.length < 2) continue
    for (const vieja of grupo) {
      if (vieja.sustituida || vieja.fechaVencimiento === null) continue
      for (const nueva of grupo) {
        if (nueva.id === vieja.id || !nueva.vigente || nueva.conOrigen || nueva.fechaInicio === null) continue
        // La misma póliza escrita dos veces (volcado + CIMA, ceros a la izquierda) NO es una sustitución.
        const nv = normalizarNumeroPoliza(vieja.numeroPoliza)
        if (nv !== null && nv === normalizarNumeroPoliza(nueva.numeroPoliza)) continue
        if (nueva.fechaInicio <= vieja.fechaInicio!) continue
        const d = distanciaAniversario(vieja.fechaInicio!, vieja.fechaVencimiento, nueva.fechaInicio)
        if (d < -SUSTITUCION_DIAS_ANTES || d > SUSTITUCION_DIAS_DESPUES) continue
        candidatas.push({ viejaId: vieja.id, nuevaId: nueva.id, matricula: k.split('|')[2]! })
      }
    }
  }

  const cuentaVieja = new Map<string, number>()
  const cuentaNueva = new Map<string, number>()
  for (const c of candidatas) {
    cuentaVieja.set(c.viejaId, (cuentaVieja.get(c.viejaId) ?? 0) + 1)
    cuentaNueva.set(c.nuevaId, (cuentaNueva.get(c.nuevaId) ?? 0) + 1)
  }
  const enlaces = candidatas.filter((c) => cuentaVieja.get(c.viejaId) === 1 && cuentaNueva.get(c.nuevaId) === 1)
  return { enlaces, ambiguas: candidatas.length - enlaces.length }
}

/**
 * Lo que ve el cliente: la vieja desaparece de su lista cuando la que la sustituye está en la MISMA
 * lista (si no, esconderla le dejaría sin ninguna), y la nueva sabe a quién sustituye.
 */
export function ocultarSustituidas<T extends { id: string; sustituidaAt: unknown; polizaOrigenId: string | null }>(
  polizas: readonly T[],
): { visibles: T[]; sustituyeA: Map<string, T> } {
  const porId = new Map(polizas.map((p) => [p.id, p]))
  const sustituyeA = new Map<string, T>()
  for (const p of polizas) {
    const origen = p.polizaOrigenId === null ? undefined : porId.get(p.polizaOrigenId)
    if (origen !== undefined && origen.sustituidaAt != null) sustituyeA.set(p.id, origen)
  }
  const ocultas = new Set([...sustituyeA.values()].map((v) => v.id))
  return { visibles: polizas.filter((p) => !ocultas.has(p.id)), sustituyeA }
}
