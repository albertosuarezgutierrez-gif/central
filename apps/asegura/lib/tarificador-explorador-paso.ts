// Explorador IA del tarificador RPA — ORQUESTACIÓN de un paso y del cierre (fase B, 13/10/2026). Sin Prisma: la BD, la IA
// y el lock llegan inyectados (`DepsPaso`/`DepsCierre`), así el orden se prueba con dobles (tarificador-explorador-paso.test.ts).
//
// 🔒 Concurrencia (revisión de #4572): la conexión de BD NO se queda abierta durante la IA (pool de 3 y hasta 45 s):
//   tx1 (try-lock): lee, decide sin IA (parada, bucle, topes, memoria) o RESERVA la IA (`ia_en_vuelo_hasta`) y suelta;
//   IA FUERA de toda transacción;
//   tx2 (try-lock): si el estado cambió entretanto (otro paso o cierre), DESCARTA, anota el coste y 409; si no, registra.
// Mientras hay una IA reservada, otro paso o el cierre reciben 409 sin gastar (el tope de 2 € no se salta por concurrencia).

import {
  comprobarTopes,
  costeLlamada,
  costeMaximoLlamada,
  detectarBucle,
  detectarParada,
  huellaPantalla,
  huellaRelleno,
  planDesdeMapa,
  presupuestoEnCursoDe,
  erroresDeIncidencias,
  esRespuestaLogin,
  MAX_PANTALLAS_LOGIN,
  respuestaParar,
  respuestaPararLogin,
  validarRespuestaLogin,
  type RespuestaLogin,
  topesExplorador,
  validarRespuestaExplorador,
  textoRechazo,
  type ValidacionRespuesta,
  type ContextoValidacion,
  type IncidenciaEjecucion,
  type InventarioDom,
  type RespuestaExplorador,
} from '@central/module-tarificacion'
import {
  MAX_TOKENS_SALIDA_EXPLORADOR,
  MAX_TOKENS_SALIDA_LOGIN,
  SYSTEM_EXPLORADOR,
  SYSTEM_EXPLORADOR_LOGIN,
  historialCorto,
  promptLoginExplorador,
  pantallaDeMemoria,
  promptExplorador,
  type PasoGuardado,
} from './tarificador-explorador-reglas.ts'

/** Otro paso (o el cierre) de la MISMA exploración tiene el lock o una IA en vuelo: quien llega segundo → 409, sin IA. */
export class PasoOcupado extends Error {
  constructor() {
    super('paso_en_curso')
    this.name = 'PasoOcupado'
  }
}

/** Lo que se lee de la exploración DENTRO del lock. */
export type EstadoPaso = {
  /** `inventario` (ya redactado, el guardado): de él sale la huella de RELLENO para no confundir progreso con bucle. */
  pasos: (PasoGuardado & { inventario?: InventarioDom })[]
  cerrada: boolean
  /** Hay una llamada de IA reservada y no caducada (`ia_en_vuelo_hasta > now()`). */
  iaEnVuelo: boolean
  /** Inicio acumulado (reclamo actual o primer paso, el más antiguo). */
  inicio: Date | null
  /** Acumulados de la cabecera: incluyen las llamadas DESCARTADAS (no tienen fila de paso pero costaron). */
  llamadasCabecera: number
  eurCabecera: number
}

export type PasoARegistrar = {
  /** `RespuestaLogin` (fase de login asistido): lleva `fase: 'login'` y nunca entra en el mapa (el cierre la re-valida como normal y cae). */
  respuesta: RespuestaExplorador | RespuestaLogin; origen: 'ia' | 'mapa' | 'regla'; errores: string[] | null; costeEur: number; modelo: string | null
  /** Errores de EJECUCIÓN del lote anterior (14/10/2026): se AÑADEN a los `errores` del último paso guardado, no a este. */
  erroresPasoAnterior?: string[]
}

/**
 * Las incidencias que trae el worker → `errores` del ÚLTIMO paso guardado (el que pidió esas acciones), con la etiqueta de
 * SU inventario guardado (redactado). Sin incidencias o sin pasos → `undefined` (no se toca nada). Pura.
 */
export function erroresPasoAnterior(pasos: EstadoPaso['pasos'], incidencias: readonly IncidenciaEjecucion[] | undefined): string[] | undefined {
  if (!incidencias?.length || pasos.length === 0) return undefined
  return erroresDeIncidencias(incidencias, pasos[pasos.length - 1].inventario)
}

export type DepsPaso<B> = {
  /** Transacción CORTA con `pg_try_advisory_xact_lock` por exploración; ocupado → lanza `PasoOcupado`. */
  conLock: <T>(fn: (bd: B) => Promise<T>) => Promise<T>
  leer: (bd: B) => Promise<EstadoPaso>
  /** Marca la IA en vuelo (`ia_en_vuelo_hasta = now() + RESERVA_IA_MS`). */
  reservarIA: (bd: B) => Promise<void>
  liberarIA: (bd: B) => Promise<void>
  /** Inserta el paso, acumula en la cabecera, libera la IA y RENUEVA el lease. Devuelve el lease nuevo (ISO) o null. */
  registrar: (bd: B, p: PasoARegistrar & { huella: string; inventario: InventarioDom }) => Promise<string | null>
  /** Una llamada descartada (carrera): su coste a la cabecera, sin fila de paso. */
  anotarDescartada: (bd: B, costeEur: number) => Promise<void>
  /**
   * Red de seguridad si la tx2 LANZA (`PasoOcupado` o error de BD) con la IA ya pagada: anota el coste en la cabecera y libera
   * la reserva, SIN lock (una sola sentencia). Opcional; si falla, se ignora (el error original es el que sube).
   */
  rescate?: (costeEur: number) => Promise<void>
  mapas: () => Promise<{ estado: string; mapa: unknown }[]>
  ia: (prompt: string) => Promise<string>
  ahora: () => Date
  env: Record<string, string | undefined>
}

export type EntradaPaso = {
  inventario: InventarioDom
  avancesFallidos: number
  ramo: string
  entrada: string
  conDatosReales: boolean
  modelo: string
  /** Con datos reales: el riesgo del trabajo (solo para el catálogo del prompt: claves sin valor, uso/régimen). */
  riesgo?: unknown
  /** Lo que el lote ANTERIOR no pudo aplicar (worker, 14/10/2026). */
  incidencias?: IncidenciaEjecucion[]
  /** Vista aria ya saneada (opcional). */
  vistaAria?: string
  /**
   * `login` = fase de LOGIN ASISTIDO (14/10/2026): prompt y validador propios (`validarRespuestaLogin`: solo claves
   * `credencial.*`), SIN memoria, y como mucho `MAX_PANTALLAS_LOGIN` pasos de login. La ruta ya comprobó la entrada.
   */
  fase?: 'normal' | 'login'
}

/**
 * Con datos REALES un plan de MEMORIA con `elegir`/`marcar` no se reutiliza: repetiría la opción de OTRA exploración (uso
 * «habitual», régimen «propietario»…) y el uso/régimen decide la tarifa. Lo que sí vale es `rellenar` (va por clave y su
 * valor sale del riesgo de ESTE trabajo). `false` = que decida la IA, que ve el uso/régimen de este riesgo.
 */
export function planDeMemoriaUsable(plan: RespuestaExplorador, conDatosReales: boolean): boolean {
  return !conDatosReales || !plan.acciones.some((a) => a.accion === 'elegir' || a.accion === 'marcar')
}

/**
 * 0.3.24 (Fidelidade real 30/10/2026, 2f0d9b15…, «Datos Cliente - Nombre y régimen»): el MAPA repitió `marcar` del radio en 3 pasos
 * seguidos sobre la MISMA pantalla (el avance seguía deshabilitado: faltaba el nombre, que el mapa no traía) y la exploración acabó en
 * `bucle` sin llamar a la IA. Regla: si la racha final de pasos guardados con ESTA huella (la pantalla no ha cambiado) incluye uno
 * servido por el mapa, el mapa ya se aplicó aquí y no bastó → se abandona para esta pantalla y decide la IA con el inventario completo.
 * Otra pantalla por medio rompe la racha (volver a ella más tarde puede usar el mapa). Pura.
 */
export function memoriaAgotadaEnPantalla(pasos: readonly Pick<PasoGuardado, 'huella' | 'origen'>[], huella: string): boolean {
  for (let i = pasos.length - 1; i >= 0 && pasos[i].huella === huella; i--) if (pasos[i].origen === 'mapa') return true
  return false
}

export type SalidaPaso =
  | { tipo: 'ok'; respuesta: RespuestaExplorador | RespuestaLogin; origen: 'ia' | 'mapa' | 'regla'; huella: string; leaseHasta: string | null }
  | { tipo: 'conflicto'; motivo: 'exploracion_cerrada' | 'estado_cambiado' }

/** Consumo para los topes: llamadas y € de la CABECERA (cuentan las descartadas); acciones y pasos de las filas. */
export function consumoPaso(st: EstadoPaso, ahora: Date): { llamadas: number; acciones: number; eur: number; ms: number; pasos: number } {
  const eurPasos = st.pasos.reduce((n, p) => n + (Number.isFinite(p.costeEur) ? p.costeEur : 0), 0)
  return {
    llamadas: Math.max(st.llamadasCabecera, st.pasos.filter((p) => p.llamadaIA).length),
    acciones: st.pasos.reduce((n, p) => n + p.acciones, 0),
    eur: Math.round(Math.max(st.eurCabecera, eurPasos) * 1e6) / 1e6,
    ms: st.inicio ? Math.max(0, ahora.getTime() - st.inicio.getTime()) : 0,
    pasos: st.pasos.length,
  }
}

/**
 * ¿Bucle? Misma huella estructural Y mismo relleno (refs con valor) que los pasos anteriores (14/10/2026: Allianz Hogar
 * paró por FALSO bucle a la 3.ª huella igual mientras cada lote rellenaba más campos). Paso guardado sin inventario o sin
 * `conValor` → relleno desconocido = «sin cambio» (lo conservador). Pura.
 */
export function esBucle(pasos: EstadoPaso['pasos'], inventario: InventarioDom, huella: string, avancesFallidos: number): boolean {
  return detectarBucle(pasos.map((x) => x.huella), huella, avancesFallidos, {
    anteriores: pasos.map((x) => (x.inventario ? huellaRelleno(x.inventario) : null)),
    actual: huellaRelleno(inventario),
  })
}

/** Un paso del explorador. Lanza `PasoOcupado` (→ 409) si el lock o la IA están tomados. */
export async function ejecutarPaso<B>(e: EntradaPaso, d: DepsPaso<B>): Promise<SalidaPaso> {
  const inventario = e.inventario
  const huella = huellaPantalla(inventario)
  // Con datos reales, el riesgo entra en la validación: elegir/marcar solo sobre uso/régimen/tipo con valor conocido.
  // `presupuestoEnCurso` (guardado del presupuesto, 14/10/2026) sale de los pasos YA guardados: se fija dentro del lock (tx1) y
  // tx2 solo registra si nada cambió (mismo nº de pasos), así que vale para las dos.
  const ctx: ContextoValidacion = { inventario, ramo: e.ramo, entrada: e.entrada, datosReales: e.conDatosReales ? { riesgo: e.riesgo ?? null } : null, presupuestoEnCurso: false }
  const topes = topesExplorador(d.env)
  const login = e.fase === 'login'
  const parar = login ? respuestaPararLogin : respuestaParar
  const system = login ? SYSTEM_EXPLORADOR_LOGIN : SYSTEM_EXPLORADOR
  const maxTokens = login ? MAX_TOKENS_SALIDA_LOGIN : MAX_TOKENS_SALIDA_EXPLORADOR

  type Decision = { tipo: 'hecho'; salida: SalidaPaso } | { tipo: 'ia'; prompt: string; caracteres: number; peor: number; nAntes: number }
  // ── tx1: decidir sin IA, o reservarla ──
  const decision = await d.conLock(async (bd): Promise<Decision> => {
    const st = await d.leer(bd)
    if (st.cerrada) return { tipo: 'hecho', salida: { tipo: 'conflicto', motivo: 'exploracion_cerrada' } }
    if (st.iaEnVuelo) throw new PasoOcupado()
    ctx.presupuestoEnCurso = presupuestoEnCursoDe(st.pasos.map((p) => p.respuesta))
    const consumo = consumoPaso(st, d.ahora())
    const guardar = async (respuesta: RespuestaExplorador | RespuestaLogin, origen: 'mapa' | 'regla'): Promise<Decision> => {
      const leaseHasta = await d.registrar(bd, { huella, inventario, respuesta, origen, errores: null, costeEur: 0, modelo: null, erroresPasoAnterior: erroresPasoAnterior(st.pasos, e.incidencias) })
      return { tipo: 'hecho', salida: { tipo: 'ok', respuesta, origen, huella, leaseHasta } }
    }
    const parada = detectarParada(inventario)
    if (parada) return guardar(parar(parada.motivo, `parada determinista: ${parada.senal}`), 'regla')
    if (esBucle(st.pasos, inventario, huella, e.avancesFallidos)) return guardar(parar('sin_salida', 'bucle: misma pantalla o avances sin efecto'), 'regla')
    const tope0 = comprobarTopes(consumo, topes, 0)
    if (tope0) return guardar(parar('sin_salida', tope0), 'regla')
    const pasosLogin = st.pasos.filter((x) => esRespuestaLogin(x.respuesta)).length
    if (login) {
      // Tope PROPIO de la fase de login (el worker también lo cuenta): ni memoria ni más pantallas que las previstas.
      if (pasosLogin >= MAX_PANTALLAS_LOGIN) return guardar(parar('sin_salida', `login asistido: ${MAX_PANTALLAS_LOGIN} pantallas sin llegar al portal`), 'regla')
    } else {
      // MEMORIA: lo ya mapeado no vuelve a costar IA. 0.3.24: salvo que ya se aplicó en ESTA pantalla y no la movió (`memoriaAgotadaEnPantalla`).
      const pantalla = memoriaAgotadaEnPantalla(st.pasos, huella) ? null : pantallaDeMemoria(await d.mapas(), huella)
      const plan = pantalla ? planDesdeMapa(pantalla, inventario) : null
      if (plan && planDeMemoriaUsable(plan, e.conDatosReales)) {
        const v = validarRespuestaExplorador(plan, ctx)
        if (v.ok) return guardar(v.respuesta, 'mapa')
      }
    }
    const prompt = login
      ? promptLoginExplorador({ entrada: e.entrada, inventario, historial: historialCorto(st.pasos.filter((x) => esRespuestaLogin(x.respuesta))), avancesFallidos: e.avancesFallidos, pantallasLogin: pasosLogin })
      : promptExplorador({ entrada: e.entrada, ramo: e.ramo, inventario, historial: historialCorto(st.pasos), conDatosReales: e.conDatosReales, avancesFallidos: e.avancesFallidos, riesgo: e.riesgo, ...(e.vistaAria ? { vistaAria: e.vistaAria } : {}) })
    const caracteres = system.length + prompt.length
    const peor = costeMaximoLlamada(e.modelo, caracteres, maxTokens)
    const tope1 = comprobarTopes(consumo, topes, peor)
    if (tope1) return guardar(parar('sin_salida', tope1), 'regla')
    await d.reservarIA(bd)
    return { tipo: 'ia', prompt, caracteres, peor, nAntes: st.pasos.length }
  })
  if (decision.tipo === 'hecho') return decision.salida

  // ── IA, FUERA de toda transacción ──
  let texto: string | null = null
  let fallo: string | null = null
  try {
    texto = await d.ia(decision.prompt)
  } catch (err) {
    fallo = err instanceof Error ? err.message.slice(0, 120) : 'error'
  }
  // Sin respuesta no se sabe lo gastado: el PEOR caso (el tope se queda del lado seguro).
  const coste = texto === null ? decision.peor : costeLlamada(e.modelo, decision.caracteres, texto.length)

  // ── tx2: registrar, si nada cambió entretanto ──
  try {
    return await tx2(d, e, decision, { huella, inventario, ctx, coste, texto, fallo })
  } catch (err) {
    // La IA ya se pagó: que el tope la cuente y la reserva no quede colgada hasta caducar. Nunca tapa el error original.
    try {
      await d.rescate?.(coste)
    } catch {
      /* el error que sube es el original */
    }
    throw err
  }
}

async function tx2<B>(
  d: DepsPaso<B>,
  e: EntradaPaso,
  decision: { nAntes: number },
  x: { huella: string; inventario: InventarioDom; ctx: ContextoValidacion; coste: number; texto: string | null; fallo: string | null },
): Promise<SalidaPaso> {
  const { huella, inventario, ctx, coste, texto, fallo } = x
  return d.conLock(async (bd): Promise<SalidaPaso> => {
    const st = await d.leer(bd)
    if (st.cerrada || st.pasos.length !== decision.nAntes) {
      await d.anotarDescartada(bd, coste)
      await d.liberarIA(bd)
      return { tipo: 'conflicto', motivo: st.cerrada ? 'exploracion_cerrada' : 'estado_cambiado' }
    }
    const base = { huella, inventario, origen: 'ia' as const, modelo: e.modelo, costeEur: coste, erroresPasoAnterior: erroresPasoAnterior(st.pasos, e.incidencias) }
    const login = e.fase === 'login'
    const parar = login ? respuestaPararLogin : respuestaParar
    if (texto === null) {
      const respuesta = parar('ambiguo', 'la IA no respondió')
      const leaseHasta = await d.registrar(bd, { ...base, respuesta, errores: [`ia_no_disponible: ${fallo}`] })
      return { tipo: 'ok', respuesta, origen: 'ia', huella, leaseHasta }
    }
    const v = login ? validarRespuestaLogin(texto, { inventario, entrada: e.entrada }) : validarRespuestaExplorador(texto, ctx)
    // La CONTRASEÑA, una vez por exploración y para siempre (los pasos sobreviven a un reintento del trabajo tras una caída
    // de infra; el tope del worker es solo en memoria): un segundo `rellenar credencial.contrasena` → parar (bloqueo de cuenta).
    const segundaContrasena = login && v.ok && contrasenaPedida(v.respuesta) && st.pasos.some((x) => esRespuestaLogin(x.respuesta) && contrasenaPedida(x.respuesta))
    const respuesta = segundaContrasena ? parar('ambiguo', 'login asistido: la contraseña ya se pidió en esta exploración (no se reenvía)')
      : v.ok ? v.respuesta : parar('ambiguo', 'respuesta de la IA rechazada por el validador')
    // 0.3.16: con el rechazo, QUÉ acción y sobre QUÉ ref (sin valores), para saber la próxima vez sobre qué elemento falló.
    const rechazos = !v.ok && !login ? ((v as Extract<ValidacionRespuesta, { ok: false }>).rechazos ?? []).map(textoRechazo) : []
    const leaseHasta = await d.registrar(bd, { ...base, respuesta, errores: segundaContrasena ? ['login_contrasena_repetida'] : v.ok ? null : [...v.errores, ...rechazos] })
    return { tipo: 'ok', respuesta, origen: 'ia', huella, leaseHasta }
  })
}

/** ¿La respuesta (guardada o nueva) pide escribir la contraseña? */
function contrasenaPedida(r: unknown): boolean {
  const acc = (r as { acciones?: unknown } | null)?.acciones
  return Array.isArray(acc) && acc.some((a) => (a as { accion?: unknown; dato?: unknown })?.accion === 'rellenar' && (a as { dato?: unknown }).dato === 'credencial.contrasena')
}

export type DepsCierre<B> = {
  conLock: <T>(fn: (bd: B) => Promise<T>) => Promise<T>
  leer: (bd: B) => Promise<Pick<EstadoPaso, 'cerrada' | 'iaEnVuelo'>>
  /** Construye y guarda el mapa (solo si sigue abierta). `false` = ya estaba cerrada. */
  cerrar: (bd: B) => Promise<boolean>
}

export type SalidaCierre = { tipo: 'ok' } | { tipo: 'conflicto'; motivo: 'exploracion_cerrada' }

/**
 * El cierre toma el MISMO try-lock que `paso` y respeta la IA reservada: nunca corre a la vez que un paso en vuelo (un
 * paso que registrara después del mapa quedaría fuera de él). Ocupado → `PasoOcupado` (409; el worker reintenta).
 */
export async function ejecutarCierre<B>(d: DepsCierre<B>): Promise<SalidaCierre> {
  return d.conLock(async (bd) => {
    const st = await d.leer(bd)
    if (st.cerrada) return { tipo: 'conflicto', motivo: 'exploracion_cerrada' }
    if (st.iaEnVuelo) throw new PasoOcupado()
    return (await d.cerrar(bd)) ? { tipo: 'ok' } : { tipo: 'conflicto', motivo: 'exploracion_cerrada' }
  })
}
