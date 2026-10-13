import { NextResponse } from 'next/server'
import { redactarValoresInventario, respuestaParar, valoresSensiblesExploracion } from '@central/module-tarificacion'
import { workerAutorizado } from '@/lib/tarificador-worker-auth'
import { hayExplorador } from '@/lib/esquema-bd'
import { iaTexto } from '@/lib/ia'
import {
  PasoOcupado,
  anotarDescartada,
  conLockExploracion,
  exploracionViva,
  leerEstadoPaso,
  liberarIA,
  mapasMemoria,
  type Bd,
  registrarPaso,
  rescatarIA,
  reservarIA,
  riesgoDeExploracion,
} from '@/lib/tarificador-explorador'
import { ejecutarPaso } from '@/lib/tarificador-explorador-paso'
import {
  MAX_TOKENS_SALIDA_EXPLORADOR,
  SYSTEM_EXPLORADOR,
  TIMEOUT_IA_EXPLORADOR_MS,
  exploradorActivo,
  leerPeticionPaso,
  modeloExplorador,
} from '@/lib/tarificador-explorador-reglas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60 // RESERVA_IA_MS (75 s) debe ser mayor: lo ata tarificador-explorador-paso.test.ts

/**
 * `POST /api/tarificador/explorador/paso` — el worker, en modo exploración, manda el INVENTARIO SANEADO de la pantalla y
 * pide el siguiente lote de acciones. Bearer `TARIFICADOR_WORKER_SECRET`. Cuerpo `{ trabajoId, inventario, avancesFallidos? }`.
 * 200 `{ respuesta, origen, huella, leaseHasta }` — `respuesta` es una `RespuestaExplorador` YA validada (o un `parar`);
 * `leaseHasta` = el lease RENOVADO (nunca más allá del tope de tiempo acumulado + margen).
 *
 * Orden (fail-closed). La orquestación está en `lib/tarificador-explorador-paso.ts` (`ejecutarPaso`, con test):
 *   0. REDACCIÓN: se quitan del inventario los valores conocidos (contacto de entorno y, con datos reales, los del riesgo
 *      del trabajo) ANTES de la IA y de guardarlo. Con datos reales y sin riesgo legible → 503 `parar`, sin IA ni fila;
 *   1. tx1 CORTA con try-lock por exploración (ocupado o IA ya en vuelo → 409 sin IA): parada determinista (OTP/SMS,
 *      CAPTCHA, emisión), bucle, topes, MEMORIA del mapa (sin IA) → se registra y responde; si hace falta IA, se RESERVA;
 *   2. IA por la pasarela FUERA de toda transacción (la conexión del pool no se queda colgada hasta 45 s);
 *   3. tx2 con el mismo try-lock: si el estado cambió entretanto (otro paso, cierre) se DESCARTA (su coste va a la
 *      cabecera) y 409; si no, se valida (`validarRespuestaExplorador`; si no valida → `parar ambiguo`) y se registra.
 * El worker REVALIDA cada acción contra su propio inventario antes de tocar el portal. Sin `auditado()`: puerto del worker;
 * el rastro es `tarificador_exploracion_pasos`.
 */
export async function POST(req: Request) {
  if (!workerAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!exploradorActivo(process.env)) return NextResponse.json({ estado: 'apagado', motivo: 'explorador_apagado (TARIFICADOR_EXPLORADOR_ACTIVO)', respuesta: respuestaParar('ambiguo', 'explorador apagado') }, { status: 503 })
  const modelo = modeloExplorador(process.env)
  if (!modelo) return NextResponse.json({ estado: 'error', motivo: 'modelo_no_valido (TARIFICADOR_EXPLORADOR_MODELO)' }, { status: 503 })
  const l = leerPeticionPaso(await req.json().catch(() => null))
  if (!l.ok) return NextResponse.json({ estado: 'error', errores: l.errores }, { status: 400 })
  const p = l.p
  try {
    if (!(await hayExplorador())) return NextResponse.json({ estado: 'error', motivo: 'explorador_sin_esquema (aplicar 2026-10-13_tarificador_explorador.sql)' }, { status: 503 })
    const e = await exploracionViva(p.trabajoId)
    if (!e) return NextResponse.json({ estado: 'no_disponible', motivo: 'exploracion_no_en_curso' }, { status: 404 })
    if (e.cerrada) return NextResponse.json({ estado: 'conflicto', motivo: 'exploracion_cerrada' }, { status: 409 })

    // PII: nada del inventario llega a la IA ni a la BD sin quitar antes los valores del cliente que se conocen.
    const riesgo = e.conDatosReales ? await riesgoDeExploracion(e).catch(() => null) : null
    const valores = valoresSensiblesExploracion({ conDatosReales: e.conDatosReales, riesgo, env: process.env })
    if (valores === null) {
      return NextResponse.json({ estado: 'error', motivo: 'riesgo_no_disponible', respuesta: respuestaParar('dato_sensible_requerido', 'sin riesgo para redactar el inventario') }, { status: 503 })
    }
    const inventario = redactarValoresInventario(p.inventario, valores)

    let inicio: Date | null = null
    const out = await ejecutarPaso<Bd>(
      { inventario, avancesFallidos: p.avancesFallidos, ramo: e.ramo, entrada: e.entrada, conDatosReales: e.conDatosReales, modelo, riesgo },
      {
        conLock: (fn) => conLockExploracion(e, fn),
        leer: async (bd) => {
          const st = await leerEstadoPaso(e, bd)
          inicio = st.inicio
          return st
        },
        reservarIA: (bd) => reservarIA(e, bd),
        liberarIA: (bd) => liberarIA(e, bd),
        registrar: (bd, paso) => registrarPaso(e, paso, inicio, bd),
        anotarDescartada: (bd, coste) => anotarDescartada(e, coste, bd),
        rescate: (coste) => rescatarIA(e, coste),
        mapas: () => mapasMemoria(e),
        ia: (prompt) => iaTexto(prompt, {
          system: SYSTEM_EXPLORADOR, maxTokens: MAX_TOKENS_SALIDA_EXPLORADOR, timeoutMs: TIMEOUT_IA_EXPLORADOR_MS, privado: true,
          modeloOpenRouter: modelo, cliente: `explorador:${e.trabajoId}`, cacheSystem: true,
        }),
        ahora: () => new Date(),
        env: process.env,
      },
    )
    if (out.tipo === 'conflicto') return NextResponse.json({ estado: 'conflicto', motivo: out.motivo }, { status: 409 })
    return NextResponse.json({ estado: 'ok', respuesta: out.respuesta, origen: out.origen, huella: out.huella, leaseHasta: out.leaseHasta }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    if (err instanceof PasoOcupado) return NextResponse.json({ estado: 'conflicto', motivo: 'paso_en_curso' }, { status: 409 })
    // Nunca el inventario ni la respuesta en el log: solo el id y el mensaje recortado.
    console.error('[tarificador/explorador] paso', p.trabajoId, err instanceof Error ? err.message.slice(0, 200) : 'error')
    return NextResponse.json({ estado: 'error', respuesta: respuestaParar('ambiguo', 'error interno') }, { status: 503 })
  }
}
