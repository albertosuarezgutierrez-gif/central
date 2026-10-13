// Elección AUTOMÁTICA de la versión del vehículo con IA (13/10/2026) — lo PURO (`node --test`): cuándo se intenta y
// qué se hace con la respuesta. La BD, la IA real y el lanzador llegan INYECTADOS (`DepsEleccion`); el cableado vive en
// `tarificador-eleccion.ts`.
//
// Flujo: el worker (determinista, sin IA) para con `requiere_eleccion_version` y manda la lista COMPLETA en
// `error.opcionesVersion` → asegura marca `requiere_humano` como siempre → si `TARIFICADOR_IA_ELECCION=1`, la IA elige
// de la lista (`elegirDeLista`, solo datos del VEHÍCULO) → con `alta` y un código de la lista se guarda
// `riesgo.eleccionVersion` en el MISMO trabajo, vuelve a `pendiente` y se lanza. Con `baja` queda en `requiere_humano`.
//
// 🚨 UN solo intento automático por trabajo: la marca es el propio `riesgo.eleccionVersion` (+ `eleccionVersionIa`). Si el
//    riesgo ya trae una elección (de la IA o de una persona) y el portal vuelve a pedir versión → `requiere_humano`.

import {
  elegirDeLista,
  peticionEleccionVersion,
  validarFormularioAuto,
  validarOpcionesVersion,
  type CandidatoVersion,
  type EleccionIa,
  type PreguntarIa,
} from '@central/module-tarificacion'

/** Interruptor. APAGADO salvo `TARIFICADOR_IA_ELECCION=1` exacto (fail-closed, como `TARIFICADOR_RPA_ACTIVO`). */
export function eleccionIaActiva(env: Record<string, string | undefined>): boolean {
  return env.TARIFICADOR_IA_ELECCION === '1'
}

/** Lo que se lee del trabajo (con `correduria_id` y `compania` para relanzarlo). */
export type FilaEleccion = {
  id: string
  correduria_id: string
  compania: string
  ramo: string
  estado: string
  modo: string | null
  riesgo: unknown
  error: unknown
}

const obj = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null)

export type PlanEleccion =
  | { intentar: true; opciones: CandidatoVersion[]; peticion: NonNullable<ReturnType<typeof peticionEleccionVersion>>; errorEn: string | null }
  | { intentar: false; motivo: string }

/** ¿Se intenta la elección automática en este trabajo? Pura. Cualquier duda → no (queda para una persona). */
export function planEleccionVersion(f: FilaEleccion, hoy: Date = new Date()): PlanEleccion {
  if (f.estado !== 'requiere_humano') return { intentar: false, motivo: `estado ${f.estado}` }
  if (f.modo === 'emision') return { intentar: false, motivo: 'trabajo de emisión' }
  if (f.ramo !== 'moto' && f.ramo !== 'auto') return { intentar: false, motivo: `ramo ${f.ramo}` }
  const err = obj(f.error)
  if (err?.tipo !== 'captcha') return { intentar: false, motivo: 'no es una elección de versión' }
  const opciones = validarOpcionesVersion(err.opcionesVersion)
  if (!opciones) return { intentar: false, motivo: 'sin lista de versiones' }
  const rg = obj(f.riesgo)
  // Tope: UN intento automático. Con una elección ya hecha (IA o persona) el siguiente «elige versión» es para una persona.
  if (rg && ((rg.eleccionVersion !== undefined && rg.eleccionVersion !== null) || rg.eleccionVersionIa !== undefined)) {
    return { intentar: false, motivo: 'el trabajo ya tuvo una elección de versión' }
  }
  const v = validarFormularioAuto(f.riesgo, hoy)
  if (!v.ok) return { intentar: false, motivo: 'riesgo no válido' }
  const peticion = peticionEleccionVersion(v.formulario, opciones)
  if (!peticion) return { intentar: false, motivo: 'opciones sin código o repetidas' }
  return { intentar: true, opciones, peticion, errorEn: typeof err.en === 'string' ? err.en : null }
}

/** Lo que se escribe en el riesgo al aplicar (código de la lista + SU etiqueta de catálogo, nunca la de la IA). */
export type EleccionAplicable = { codigo: string; etiqueta: string }

export function eleccionAplicable(r: EleccionIa, opciones: readonly CandidatoVersion[]): EleccionAplicable | null {
  if (r.confianza !== 'alta' || !r.codigo) return null
  const casan = opciones.filter((o) => o.codigo === r.codigo)
  return casan.length === 1 ? { codigo: casan[0].codigo!, etiqueta: casan[0].etiqueta } : null
}

export type DepsEleccion = {
  env: Record<string, string | undefined>
  leer: (trabajoId: string) => Promise<FilaEleccion | null>
  ia: PreguntarIa
  /** En UNA transacción con `for update`: re-comprueba (mismo fallo, sin elección previa) y aplica. `false` = carrera. */
  aplicar: (f: FilaEleccion, eleccion: EleccionAplicable, motivo: string, errorEn: string | null) => Promise<boolean>
  /** Anota en el `error` del trabajo que la IA no se atrevió (queda en `requiere_humano`). */
  anotarBaja: (f: FilaEleccion, r: EleccionIa, errorEn: string | null) => Promise<void>
  lanzar: (correduriaId: string, compania: string) => Promise<unknown>
}

export type ResultadoEleccion =
  | { estado: 'omitido'; motivo: string }
  | { estado: 'baja'; motivo: string }
  | { estado: 'carrera' }
  | { estado: 'aplicado'; codigo: string }

/** El ciclo completo. Nunca lanza por la IA (la IA que falla es `baja`). */
export async function procesarEleccionVersion(trabajoId: string, d: DepsEleccion): Promise<ResultadoEleccion> {
  if (!eleccionIaActiva(d.env)) return { estado: 'omitido', motivo: 'TARIFICADOR_IA_ELECCION apagado' }
  const f = await d.leer(trabajoId)
  if (!f) return { estado: 'omitido', motivo: 'trabajo no encontrado' }
  const plan = planEleccionVersion(f)
  if (!plan.intentar) return { estado: 'omitido', motivo: plan.motivo }
  const r = await elegirDeLista(plan.peticion, d.ia)
  const aplicable = eleccionAplicable(r, plan.opciones)
  if (!aplicable) {
    await d.anotarBaja(f, r, plan.errorEn)
    return { estado: 'baja', motivo: r.motivo }
  }
  if (!(await d.aplicar(f, aplicable, r.motivo, plan.errorEn))) return { estado: 'carrera' }
  // Mejor esfuerzo, como la bandeja: si Fly falla, el trabajo queda `pendiente` y el barrido lo lanza.
  await d.lanzar(f.correduria_id, f.compania).catch(() => null)
  return { estado: 'aplicado', codigo: aplicable.codigo }
}
