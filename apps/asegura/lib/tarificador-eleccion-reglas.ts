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
//
// MEMORIA (13/10/2026, «que el bot vaya aprendiendo»): antes de la IA se mira `seguros.tarificador_elecciones` por
// (correduría, compañía, ramo, clave del vehículo). Solo se usa si su código está EXACTAMENTE una vez en la lista de HOY
// (`eleccionDeMemoria`); si no, se pregunta a la IA. La IA no enseña al elegir: su elección se guarda SOLO cuando el
// trabajo termina `ok` con tarificación (`memoriaTrasExito`). Una elección de memoria que vuelve a pedir versión se
// borra (`memoriaAInvalidar`). Todo esto, solo con `TARIFICADOR_IA_ELECCION=1`; la elección HUMANA se guarda siempre.

import {
  claveMemoriaVersion,
  contextoEleccionVersion,
  eleccionDeMemoria,
  elegirDeLista,
  peticionEleccionVersion,
  validarFormularioAuto,
  validarOpcionesVersion,
  type CandidatoVersion,
  type EleccionIa,
  type EntradaMemoria,
  type OpcionLista,
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
  if (f.modo === 'exploracion') return { intentar: false, motivo: 'trabajo de exploración' }
  if (f.ramo !== 'moto' && f.ramo !== 'auto') return { intentar: false, motivo: `ramo ${f.ramo}` }
  const err = obj(f.error)
  if (err?.tipo !== 'eleccion' && err?.tipo !== 'captcha') return { intentar: false, motivo: 'no es una elección de versión' }
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

/** Marca del intento automático en `riesgo.eleccionVersionIa`: de dónde salió y con qué clave se aprende. */
export type OrigenAutomatico = 'ia' | 'memoria'
export type MarcaAutomatica = { origen: OrigenAutomatico; clave: string | null }

/** Lo que identifica una entrada de memoria. */
export type ClaveMemoria = { correduriaId: string; compania: string; ramo: string; clave: string }

export type DepsEleccion = {
  env: Record<string, string | undefined>
  leer: (trabajoId: string) => Promise<FilaEleccion | null>
  ia: PreguntarIa
  /** Memoria de elecciones. `null` = no hay (o no se pudo leer: entonces se pregunta a la IA, como antes). */
  leerMemoria: (k: ClaveMemoria) => Promise<Pick<EntradaMemoria, 'codigo'> | null>
  /** Borra la entrada SI sigue apuntando a `codigo` (una más nueva no se toca). */
  invalidarMemoria: (k: ClaveMemoria, codigo: string) => Promise<void>
  /** En UNA transacción con `for update`: re-comprueba (mismo fallo, sin elección previa) y aplica. `false` = carrera. */
  aplicar: (f: FilaEleccion, eleccion: EleccionAplicable, motivo: string, errorEn: string | null, marca: MarcaAutomatica) => Promise<boolean>
  /** Anota en el `error` del trabajo que la IA no se atrevió (queda en `requiere_humano`). */
  anotarBaja: (f: FilaEleccion, r: EleccionIa, errorEn: string | null) => Promise<void>
  lanzar: (correduriaId: string, compania: string) => Promise<unknown>
}

export type ResultadoEleccion =
  | { estado: 'omitido'; motivo: string }
  | { estado: 'baja'; motivo: string }
  | { estado: 'carrera' }
  | { estado: 'aplicado'; codigo: string; origen: OrigenAutomatico }

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)

/** La elección automática que lleva el riesgo (`eleccionVersion` + marca `eleccionVersionIa`), o `null`. */
function eleccionAutomatica(riesgo: unknown): { codigo: string; etiqueta: string; origen: OrigenAutomatico; clave: string } | null {
  const rg = obj(riesgo)
  const ev = obj(rg?.eleccionVersion)
  const marca = obj(rg?.eleccionVersionIa)
  const codigo = texto(ev?.codigo)
  const clave = texto(marca?.clave)
  // Marcas de antes de la memoria (sin `origen`/`clave`): no se aprende de ellas (no se sabe de qué clave salieron).
  if (!codigo || !clave || (marca?.origen !== 'ia' && marca?.origen !== 'memoria')) return null
  return { codigo, etiqueta: texto(ev?.etiqueta) ?? codigo, origen: marca.origen, clave }
}

/**
 * ¿Hay que BORRAR una entrada de memoria? Sí cuando el trabajo, relanzado con una versión SACADA DE MEMORIA, vuelve a
 * pararse pidiendo versión: lo recordado ya no vale para este portal. Pura.
 */
export function memoriaAInvalidar(f: FilaEleccion): { k: ClaveMemoria; codigo: string } | null {
  if (f.estado !== 'requiere_humano') return null
  const err = obj(f.error)
  if ((err?.tipo !== 'eleccion' && err?.tipo !== 'captcha') || !validarOpcionesVersion(err.opcionesVersion)) return null
  const a = eleccionAutomatica(f.riesgo)
  if (!a || a.origen !== 'memoria') return null
  return { k: { correduriaId: f.correduria_id, compania: f.compania, ramo: f.ramo, clave: a.clave }, codigo: a.codigo }
}

/**
 * Lo que se APRENDE cuando un trabajo termina `ok` con tarificación: la versión automática (de la IA o de la memoria)
 * que llevaba. Una elección humana no pasa por aquí (se guardó al elegirla). Sin marca automática → `null`. Pura.
 */
export function memoriaTrasExito(t: { correduria_id: string; compania: string; ramo: string; riesgo: unknown }): { k: ClaveMemoria; codigo: string; etiqueta: string } | null {
  const a = eleccionAutomatica(t.riesgo)
  if (!a) return null
  return { k: { correduriaId: t.correduria_id, compania: t.compania, ramo: t.ramo, clave: a.clave }, codigo: a.codigo, etiqueta: a.etiqueta }
}

/**
 * Clave de memoria de un riesgo tal como lo lee el bot (`validarFormularioAuto` → lista blanca del vehículo). Riesgo no
 * válido o sin marca/modelo → `null` (no se aprende). Para la elección HUMANA de la bandeja. Pura.
 */
export function claveMemoriaDeRiesgo(riesgo: unknown, hoy: Date = new Date()): string | null {
  const v = validarFormularioAuto(riesgo, hoy)
  return v.ok ? claveMemoriaVersion(contextoEleccionVersion(v.formulario)) : null
}

/** El ciclo completo. Nunca lanza por la IA (la IA que falla es `baja`). */
export async function procesarEleccionVersion(trabajoId: string, d: DepsEleccion): Promise<ResultadoEleccion> {
  if (!eleccionIaActiva(d.env)) return { estado: 'omitido', motivo: 'TARIFICADOR_IA_ELECCION apagado' }
  const f = await d.leer(trabajoId)
  if (!f) return { estado: 'omitido', motivo: 'trabajo no encontrado' }
  // La versión que dio la memoria no sirvió (el portal volvió a pedirla): se olvida. El trabajo queda para una persona.
  const inv = memoriaAInvalidar(f)
  if (inv) await d.invalidarMemoria(inv.k, inv.codigo)
  const plan = planEleccionVersion(f)
  if (!plan.intentar) return { estado: 'omitido', motivo: plan.motivo }
  const clave = claveMemoriaVersion(plan.peticion.contexto)
  // 1) Memoria: solo si su código está EXACTAMENTE una vez en la lista de HOY. Si no, a la IA.
  const recordada = clave ? await d.leerMemoria({ correduriaId: f.correduria_id, compania: f.compania, ramo: f.ramo, clave }) : null
  const deMemoria: OpcionLista | null = eleccionDeMemoria(recordada, plan.peticion.opciones)
  let aplicable: EleccionAplicable | null
  let motivo: string
  let origen: OrigenAutomatico
  if (deMemoria) {
    aplicable = deMemoria
    motivo = 'memoria: versión ya confirmada antes para este vehículo'
    origen = 'memoria'
  } else {
    // 2) IA.
    const r = await elegirDeLista(plan.peticion, d.ia)
    aplicable = eleccionAplicable(r, plan.opciones)
    if (!aplicable) {
      await d.anotarBaja(f, r, plan.errorEn)
      return { estado: 'baja', motivo: r.motivo }
    }
    motivo = r.motivo
    origen = 'ia'
  }
  if (!(await d.aplicar(f, aplicable, motivo, plan.errorEn, { origen, clave }))) return { estado: 'carrera' }
  // Mejor esfuerzo, como la bandeja: si Fly falla, el trabajo queda `pendiente` y el barrido lo lanza.
  await d.lanzar(f.correduria_id, f.compania).catch(() => null)
  return { estado: 'aplicado', codigo: aplicable.codigo, origen }
}
