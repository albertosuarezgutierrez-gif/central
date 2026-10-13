import { NextResponse } from 'next/server'
import {
  comprobarTopes,
  costeLlamada,
  costeMaximoLlamada,
  detectarBucle,
  detectarParada,
  huellaPantalla,
  planDesdeMapa,
  redactarValoresInventario,
  respuestaParar,
  topesExplorador,
  validarRespuestaExplorador,
  valoresSensiblesExploracion,
  type RespuestaExplorador,
} from '@central/module-tarificacion'
import { workerAutorizado } from '@/lib/tarificador-worker-auth'
import { hayExplorador } from '@/lib/esquema-bd'
import { iaTexto } from '@/lib/ia'
import { PasoOcupado, conPasoExclusivo, exploracionViva, mapasMemoria, pasosDe, registrarPaso, riesgoDeExploracion } from '@/lib/tarificador-explorador'
import {
  MAX_TOKENS_SALIDA_EXPLORADOR,
  SYSTEM_EXPLORADOR,
  TIMEOUT_IA_EXPLORADOR_MS,
  consumoDe,
  exploradorActivo,
  historialCorto,
  leerPeticionPaso,
  modeloExplorador,
  pantallaDeMemoria,
  promptExplorador,
} from '@/lib/tarificador-explorador-reglas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * `POST /api/tarificador/explorador/paso` — el worker, en modo exploración, manda el INVENTARIO SANEADO de la pantalla y
 * pide el siguiente lote de acciones. Bearer `TARIFICADOR_WORKER_SECRET`. Cuerpo `{ trabajoId, inventario, avancesFallidos? }`.
 * 200 `{ respuesta, origen, huella }` — `respuesta` es una `RespuestaExplorador` YA validada (o un `parar`).
 *
 * Orden (fail-closed; todo dentro de un lock por exploración — `pg_try_advisory_xact_lock`: ocupado → 409 sin IA):
 *   0. REDACCIÓN: se quitan del inventario los valores conocidos (contacto de entorno y, con datos reales, los del riesgo
 *      del trabajo: nombre, dirección, CP, fecha de nacimiento, matrícula, NIF…) ANTES de la IA y de guardarlo. Con datos
 *      reales y sin riesgo legible → 503 `parar`, sin IA ni fila;
 *   1. parada determinista (OTP/SMS, CAPTCHA, pantalla de emisión) → `parar`, sin IA;
 *   2. bucle (3.ª huella igual seguida o 2 avances sin efecto) → `parar sin_salida`;
 *   3. topes de pasos/acciones/tiempo → `parar`;
 *   4. MEMORIA: la pantalla ya está en un mapa → plan del mapa, sin IA (si valida);
 *   5. tope de coste/llamadas con el PEOR caso de la siguiente llamada → `parar`;
 *   6. IA por la pasarela (modelo explícito de OpenRouter, `cliente_ref = explorador:<trabajo>`), y su respuesta pasa por
 *      `validarRespuestaExplorador`; si no valida → `parar ambiguo`.
 * El worker REVALIDA cada acción contra su propio inventario antes de tocar el portal. Sin `auditado()`: puerto del worker;
 * el rastro es `tarificador_exploracion_pasos`.
 */
export async function POST(req: Request) {
  if (!workerAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!exploradorActivo(process.env)) return NextResponse.json({ estado: 'apagado', motivo: 'explorador_apagado (TARIFICADOR_EXPLORADOR_ACTIVO)' }, { status: 503 })
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

    const out = await conPasoExclusivo(e, async (bd) => {
      const pasos = await pasosDe(e.exploracionId, bd)
      const huella = huellaPantalla(inventario)
      const ctx = { inventario, ramo: e.ramo, entrada: e.entrada }
      const consumo = consumoDe(pasos, e.iniciadoAt, new Date())
      const topes = topesExplorador(process.env)
      const guardar = async (respuesta: RespuestaExplorador, origen: 'ia' | 'mapa' | 'regla', extra: { errores?: string[] | null; coste?: number } = {}) => {
        await registrarPaso(e, { huella, inventario, respuesta, origen, errores: extra.errores ?? null, costeEur: extra.coste ?? 0, modelo: origen === 'ia' ? modelo : null }, bd)
        return { respuesta, origen, huella }
      }

      const parada = detectarParada(inventario)
      if (parada) return guardar(respuestaParar(parada.motivo, `parada determinista: ${parada.senal}`), 'regla')
      if (detectarBucle(pasos.map((x) => x.huella), huella, p.avancesFallidos)) return guardar(respuestaParar('sin_salida', 'bucle: misma pantalla o avances sin efecto'), 'regla')
      const tope0 = comprobarTopes(consumo, topes, 0)
      if (tope0) return guardar(respuestaParar('sin_salida', tope0), 'regla')

      // MEMORIA: lo ya mapeado no vuelve a costar IA.
      const pantalla = pantallaDeMemoria(await mapasMemoria(e), huella)
      const plan = pantalla ? planDesdeMapa(pantalla, inventario) : null
      if (plan) {
        const v = validarRespuestaExplorador(plan, ctx)
        if (v.ok) return guardar(v.respuesta, 'mapa')
      }

      const historial = historialCorto(pasos)
      const prompt = promptExplorador({ entrada: e.entrada, ramo: e.ramo, inventario, historial, conDatosReales: e.conDatosReales, avancesFallidos: p.avancesFallidos })
      const caracteres = SYSTEM_EXPLORADOR.length + prompt.length
      const peor = costeMaximoLlamada(modelo, caracteres, MAX_TOKENS_SALIDA_EXPLORADOR)
      const tope1 = comprobarTopes(consumo, topes, peor)
      if (tope1) return guardar(respuestaParar('sin_salida', tope1), 'regla')

      let texto: string
      try {
        texto = await iaTexto(prompt, {
          system: SYSTEM_EXPLORADOR, maxTokens: MAX_TOKENS_SALIDA_EXPLORADOR, timeoutMs: TIMEOUT_IA_EXPLORADOR_MS, privado: true,
          modeloOpenRouter: modelo, cliente: `explorador:${e.trabajoId}`, cacheSystem: true,
        })
      } catch (err) {
        // Sin respuesta no se sabe lo gastado: se cuenta el PEOR caso (el tope se queda del lado seguro).
        return guardar(respuestaParar('ambiguo', 'la IA no respondió'), 'ia', { errores: [`ia_no_disponible: ${err instanceof Error ? err.message.slice(0, 120) : 'error'}`], coste: peor })
      }
      const coste = costeLlamada(modelo, caracteres, texto.length)
      const v = validarRespuestaExplorador(texto, ctx)
      if (!v.ok) return guardar(respuestaParar('ambiguo', 'respuesta de la IA rechazada por el validador'), 'ia', { errores: v.errores, coste })
      return guardar(v.respuesta, 'ia', { coste })
    })
    return NextResponse.json({ estado: 'ok', ...out }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    if (err instanceof PasoOcupado) return NextResponse.json({ estado: 'conflicto', motivo: 'paso_en_curso' }, { status: 409 })
    // Nunca el inventario ni la respuesta en el log: solo el id y el mensaje recortado.
    console.error('[tarificador/explorador] paso', p.trabajoId, err instanceof Error ? err.message.slice(0, 200) : 'error')
    return NextResponse.json({ estado: 'error', respuesta: respuestaParar('ambiguo', 'error interno') }, { status: 503 })
  }
}
