// PATRIMONIO (22/10/2026, paso 9) — qué variación de índice (IPC/IRAV) se usa para PROPONER la actualización de la renta
// de un contrato, y si lo que el propietario pide aplicar es exactamente lo propuesto. PURO: sin prisma ni sesión ni reloj.
//
// Las filas llegan de `seguros.portal_patrimonio_indice` (la llena el cron de `apps/asegura`, paso 9b; el portal solo la
// LEE, en `contratos-bd.ts`). La regla de la renta en sí es `calcularActualizacionRenta` de `@central/module-patrimonio`.
//
// Reglas (cada una con su test en `indices.test.ts`):
//  1. Sin cláusula de actualización → no se propone nada (`sin_clausula`; lo decide el puro, aquí no se rodea).
//  2. Solo cuenta el índice QUE PACTA EL CONTRATO. Un IPC no sirve para un contrato IRAV: si solo hay IPC, es
//     `sin_indice` («no lo sabemos»), jamás «0 %» ni «el que haya». Un contrato `otro` no tiene tabla → `sin_indice`.
//  3. Mes de referencia: el último índice publicado ANTES del mes del aniversario (LAU art. 18: «el último índice que
//     estuviera publicado en la fecha de actualización»). Se toma el periodo más reciente ≤ mes anterior al aniversario.
//  4. 🚨 Índice VIEJO = no hay índice. Si el último periodo que tenemos es de hace más de `MAX_MESES_DESFASE` meses
//     respecto al de referencia, es que el cron se ha quedado mudo: se dice `sin_indice`, no se propone con un IPC de
//     hace medio año.
//  5. Revisión del INE (fila nueva `revisado=true`): manda la más reciente por `descargadoEn`.
//  6. Aplicar = lo que el SERVIDOR recalcula ahora. El cuerpo solo CONFIRMA (desde, renta nueva, índice, periodo): si no
//     coincide → `propuesta_cambiada`; si el índice del cuerpo no es el del contrato → `indice_distinto`. Nunca se
//     inserta un importe que venga del navegador.
import {
  calcularActualizacionRenta,
  esFecha,
  type Contrato,
  type Fecha,
  type IndiceActualizacion,
  type ResultadoActualizacion,
  type VariacionIndice,
} from '@central/module-patrimonio'

/** Lo que el lector trae de `portal_patrimonio_indice` (ya convertido: `pct` number, `descargadoEn` Date). */
export type FilaIndice = { indice: string; periodo: string; pct: number; descargadoEn: Date }

/**
 * Tope legal a la subida, en %. `null` = sin tope codificado: los límites cambian por ley (2022-2024, IRAV desde 2025,
 * zonas tensionadas) y no se adivinan aquí. La pantalla lo dice: «confirma con tu asesor si hay límites en tu zona».
 */
export const TOPE_LEGAL_PCT: number | null = null

/** Meses de desfase máximo entre el periodo de referencia y el último índice que tenemos (regla 4). */
export const MAX_MESES_DESFASE = 2

const PERIODO = /^(\d{4})-(0[1-9]|1[0-2])$/

function mesIndice(periodo: string): number | null {
  const m = PERIODO.exec(periodo.trim())
  return m ? Number(m[1]) * 12 + (Number(m[2]) - 1) : null
}

function periodoDe(n: number): string {
  const y = Math.floor(n / 12)
  const m = (n % 12) + 1
  return `${y}-${String(m).padStart(2, '0')}`
}

/** Periodo de referencia (`YYYY-MM`) para un aniversario: el mes ANTERIOR al del aniversario. */
export function periodoReferencia(aniversario: Fecha): string {
  if (!esFecha(aniversario)) throw new Error('aniversario_invalido')
  const n = mesIndice(aniversario.slice(0, 7))!
  return periodoDe(n - 1)
}

/** Los dos índices que la tabla puede tener (el CHECK de la BD). `otro` no tiene tabla. */
const CON_TABLA: readonly IndiceActualizacion[] = ['IPC', 'IRAV']

/**
 * La variación que corresponde a ese aniversario, del índice del contrato. `null` = no la tenemos (regla 2 y 4).
 */
export function elegirVariacion(
  filas: readonly FilaIndice[],
  indice: IndiceActualizacion,
  aniversario: Fecha,
): VariacionIndice | null {
  if (!CON_TABLA.includes(indice)) return null
  const ref = mesIndice(periodoReferencia(aniversario))!
  let mejor: { n: number; fila: FilaIndice } | null = null
  for (const f of filas) {
    if (f.indice !== indice) continue
    if (typeof f.pct !== 'number' || !Number.isFinite(f.pct)) continue
    const n = mesIndice(f.periodo)
    if (n === null || n > ref) continue
    if (
      mejor === null ||
      n > mejor.n ||
      (n === mejor.n && f.descargadoEn.getTime() > mejor.fila.descargadoEn.getTime())
    ) {
      mejor = { n, fila: f }
    }
  }
  if (mejor === null) return null
  if (ref - mejor.n > MAX_MESES_DESFASE) return null
  return { indice, pct: mejor.fila.pct, periodo: periodoDe(mejor.n) }
}

/**
 * Propuesta de actualización para HOY. Delega en el puro; aquí solo se elige la variación del índice del contrato para
 * el aniversario que toca. Sin cláusula, el puro devuelve `sin_clausula` antes de mirar índice alguno.
 */
export function propuestaRenta(contrato: Contrato, filas: readonly FilaIndice[], hoy: Fecha): ResultadoActualizacion {
  if (contrato.clausula.tipo === 'ninguna') return calcularActualizacionRenta({ contrato, hoy, variacion: null })
  // Primer cálculo sin variación: da el aniversario que toca (o `no_toca`/`terminado`, que no necesitan índice).
  const previo = calcularActualizacionRenta({ contrato, hoy, variacion: null, topePct: TOPE_LEGAL_PCT })
  if (previo.estado !== 'sin_indice') return previo
  const variacion = elegirVariacion(filas, contrato.clausula.indice, previo.proximoAniversario)
  return calcularActualizacionRenta({ contrato, hoy, variacion, topePct: TOPE_LEGAL_PCT })
}

export type ConfirmacionRenta = { desde: Fecha; rentaNuevaCent: number; indice: IndiceActualizacion; periodo: string }

export type ResultadoConfirmacion =
  | { ok: true; propuesta: Extract<ResultadoActualizacion, { estado: 'propuesta' }> }
  | { ok: false; error: 'datos_invalidos' | 'indice_distinto' | 'propuesta_cambiada' | ResultadoActualizacion['estado'] }

/** Regla 6: el cuerpo confirma lo propuesto; no aporta nada que se guarde. */
export function confirmarAplicacion(cuerpo: unknown, propuesta: ResultadoActualizacion): ResultadoConfirmacion {
  const b = cuerpo && typeof cuerpo === 'object' ? (cuerpo as Record<string, unknown>) : null
  if (!b) return { ok: false, error: 'datos_invalidos' }
  const { desde, rentaNuevaCent, indice, periodo } = b
  if (typeof desde !== 'string' || !esFecha(desde)) return { ok: false, error: 'datos_invalidos' }
  if (typeof rentaNuevaCent !== 'number' || !Number.isSafeInteger(rentaNuevaCent) || rentaNuevaCent <= 0) {
    return { ok: false, error: 'datos_invalidos' }
  }
  if (typeof indice !== 'string' || typeof periodo !== 'string') return { ok: false, error: 'datos_invalidos' }
  if (propuesta.estado === 'indice_distinto') return { ok: false, error: 'indice_distinto' }
  if (propuesta.estado !== 'propuesta') return { ok: false, error: propuesta.estado }
  if (indice !== propuesta.indice) return { ok: false, error: 'indice_distinto' }
  if (desde !== propuesta.aplicableDesde || rentaNuevaCent !== propuesta.rentaNueva || periodo !== propuesta.periodo) {
    return { ok: false, error: 'propuesta_cambiada' }
  }
  return { ok: true, propuesta }
}
