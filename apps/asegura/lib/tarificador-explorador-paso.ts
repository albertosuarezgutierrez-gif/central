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
  planDesdeMapa,
  respuestaParar,
  topesExplorador,
  validarRespuestaExplorador,
  type InventarioDom,
  type RespuestaExplorador,
} from '@central/module-tarificacion'
import {
  MAX_TOKENS_SALIDA_EXPLORADOR,
  SYSTEM_EXPLORADOR,
  historialCorto,
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
  pasos: PasoGuardado[]
  cerrada: boolean
  /** Hay una llamada de IA reservada y no caducada (`ia_en_vuelo_hasta > now()`). */
  iaEnVuelo: boolean
  /** Inicio acumulado (reclamo actual o primer paso, el más antiguo). */
  inicio: Date | null
  /** Acumulados de la cabecera: incluyen las llamadas DESCARTADAS (no tienen fila de paso pero costaron). */
  llamadasCabecera: number
  eurCabecera: number
}

export type PasoARegistrar = { respuesta: RespuestaExplorador; origen: 'ia' | 'mapa' | 'regla'; errores: string[] | null; costeEur: number; modelo: string | null }

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
}

/**
 * Con datos REALES un plan de MEMORIA con `elegir`/`marcar` no se reutiliza: repetiría la opción de OTRA exploración (uso
 * «habitual», régimen «propietario»…) y el uso/régimen decide la tarifa. Lo que sí vale es `rellenar` (va por clave y su
 * valor sale del riesgo de ESTE trabajo). `false` = que decida la IA, que ve el uso/régimen de este riesgo.
 */
export function planDeMemoriaUsable(plan: RespuestaExplorador, conDatosReales: boolean): boolean {
  return !conDatosReales || !plan.acciones.some((a) => a.accion === 'elegir' || a.accion === 'marcar')
}

export type SalidaPaso =
  | { tipo: 'ok'; respuesta: RespuestaExplorador; origen: 'ia' | 'mapa' | 'regla'; huella: string; leaseHasta: string | null }
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

/** Un paso del explorador. Lanza `PasoOcupado` (→ 409) si el lock o la IA están tomados. */
export async function ejecutarPaso<B>(e: EntradaPaso, d: DepsPaso<B>): Promise<SalidaPaso> {
  const inventario = e.inventario
  const huella = huellaPantalla(inventario)
  const ctx = { inventario, ramo: e.ramo, entrada: e.entrada }
  const topes = topesExplorador(d.env)

  type Decision = { tipo: 'hecho'; salida: SalidaPaso } | { tipo: 'ia'; prompt: string; caracteres: number; peor: number; nAntes: number }
  // ── tx1: decidir sin IA, o reservarla ──
  const decision = await d.conLock(async (bd): Promise<Decision> => {
    const st = await d.leer(bd)
    if (st.cerrada) return { tipo: 'hecho', salida: { tipo: 'conflicto', motivo: 'exploracion_cerrada' } }
    if (st.iaEnVuelo) throw new PasoOcupado()
    const consumo = consumoPaso(st, d.ahora())
    const guardar = async (respuesta: RespuestaExplorador, origen: 'mapa' | 'regla'): Promise<Decision> => {
      const leaseHasta = await d.registrar(bd, { huella, inventario, respuesta, origen, errores: null, costeEur: 0, modelo: null })
      return { tipo: 'hecho', salida: { tipo: 'ok', respuesta, origen, huella, leaseHasta } }
    }
    const parada = detectarParada(inventario)
    if (parada) return guardar(respuestaParar(parada.motivo, `parada determinista: ${parada.senal}`), 'regla')
    if (detectarBucle(st.pasos.map((x) => x.huella), huella, e.avancesFallidos)) return guardar(respuestaParar('sin_salida', 'bucle: misma pantalla o avances sin efecto'), 'regla')
    const tope0 = comprobarTopes(consumo, topes, 0)
    if (tope0) return guardar(respuestaParar('sin_salida', tope0), 'regla')
    // MEMORIA: lo ya mapeado no vuelve a costar IA.
    const pantalla = pantallaDeMemoria(await d.mapas(), huella)
    const plan = pantalla ? planDesdeMapa(pantalla, inventario) : null
    if (plan && planDeMemoriaUsable(plan, e.conDatosReales)) {
      const v = validarRespuestaExplorador(plan, ctx)
      if (v.ok) return guardar(v.respuesta, 'mapa')
    }
    const prompt = promptExplorador({ entrada: e.entrada, ramo: e.ramo, inventario, historial: historialCorto(st.pasos), conDatosReales: e.conDatosReales, avancesFallidos: e.avancesFallidos, riesgo: e.riesgo })
    const caracteres = SYSTEM_EXPLORADOR.length + prompt.length
    const peor = costeMaximoLlamada(e.modelo, caracteres, MAX_TOKENS_SALIDA_EXPLORADOR)
    const tope1 = comprobarTopes(consumo, topes, peor)
    if (tope1) return guardar(respuestaParar('sin_salida', tope1), 'regla')
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
  x: { huella: string; inventario: InventarioDom; ctx: { inventario: InventarioDom; ramo: string; entrada: string }; coste: number; texto: string | null; fallo: string | null },
): Promise<SalidaPaso> {
  const { huella, inventario, ctx, coste, texto, fallo } = x
  return d.conLock(async (bd): Promise<SalidaPaso> => {
    const st = await d.leer(bd)
    if (st.cerrada || st.pasos.length !== decision.nAntes) {
      await d.anotarDescartada(bd, coste)
      await d.liberarIA(bd)
      return { tipo: 'conflicto', motivo: st.cerrada ? 'exploracion_cerrada' : 'estado_cambiado' }
    }
    const base = { huella, inventario, origen: 'ia' as const, modelo: e.modelo, costeEur: coste }
    if (texto === null) {
      const respuesta = respuestaParar('ambiguo', 'la IA no respondió')
      const leaseHasta = await d.registrar(bd, { ...base, respuesta, errores: [`ia_no_disponible: ${fallo}`] })
      return { tipo: 'ok', respuesta, origen: 'ia', huella, leaseHasta }
    }
    const v = validarRespuestaExplorador(texto, ctx)
    const respuesta = v.ok ? v.respuesta : respuestaParar('ambiguo', 'respuesta de la IA rechazada por el validador')
    const leaseHasta = await d.registrar(bd, { ...base, respuesta, errores: v.ok ? null : v.errores })
    return { tipo: 'ok', respuesta, origen: 'ia', huella, leaseHasta }
  })
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
