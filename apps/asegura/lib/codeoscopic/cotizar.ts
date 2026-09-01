// Orquestador de la cotización: la única puerta por la que se gasta dinero.
//
// El orden de los pasos ES el diseño:
//   1. Config          → si está apagada o incompleta, no hay llamada.
//   2. Ámbito          → sin correduría no hay libro contra el que contar.
//   3. Libro           → si no se puede leer, NO se cotiza (fail closed).
//   4. Tope            → decisión pura, ya probada.
//   5. Reserva         → se escribe ANTES de llamar.
//   6. Llamada         → un solo intento.
//   7. Cierre          → facturable, o descartado CON evidencia.
//
// Saltarse el 3 «porque la BD está caída y total es una cotización» es
// exactamente lo que convierte un tope en un adorno.

import { randomUUID } from 'node:crypto'
import { resolverConfig, explicarConfig, COSTE_COTIZACION_CENTS } from './config.ts'
import { puedeCotizar, eurCents, type Veredicto } from './contador.ts'
import { consumoActual, reservar, cerrarFacturable, cerrarDescartado } from './consumo.ts'
import { peticion, obtenerToken, ErrorCodeoscopic } from './cliente.ts'
import { leerCotizacion, type Cotizacion } from './respuesta.ts'

export type ResultadoCotizacion =
  | { ok: true; cotizacion: Cotizacion; coste: string; restantesHoy: number }
  | { ok: false; razon: 'apagado' | 'mal-configurado' | 'sin-libro' | 'tope' | 'vendor'; mensaje: string }

export type PeticionCotizacion = {
  correduriaId: string
  /** Cuerpo `CreateInsuranceRequest_V1` ya construido. */
  cuerpo: unknown
  /** Por qué se gasta: 'smoke', 'alta-manual', 'defensa-cartera'… Va al libro. */
  motivo: string
  solicitadoPor: string
}

/**
 * Sonda GRATIS: pide solo el token OAuth2.
 *
 * Sirve para verificar host y credenciales sin gastar una cotización — que es
 * como hay que estrenar la integración, porque no hay sandbox utilizable. Un
 * fallo de `conexion` apunta al host (`CODEOSCOPIC_BASE_URL`); uno de `auth`,
 * a las credenciales. Distinguirlo importa: son arreglos distintos.
 */
export async function probarConexion(
  env: Record<string, string | undefined> = process.env,
): Promise<{ ok: boolean; mensaje: string }> {
  // La sonda no exige el interruptor: pedir el token no cuesta nada.
  const r = resolverConfig(env, { ignorarInterruptor: true })
  if (r.estado !== 'lista') return { ok: false, mensaje: explicarConfig(r) }

  try {
    await obtenerToken(r.config)
    return { ok: true, mensaje: `Token OK contra ${r.config.baseUrl}. No se ha gastado ninguna cotización.` }
  } catch (e) {
    if (e instanceof ErrorCodeoscopic && e.clase === 'conexion') {
      return {
        ok: false,
        mensaje:
          `No se pudo conectar con ${r.config.baseUrl}. Antes de tocar las credenciales, ` +
          `revisa el host: ${e.detalle}`,
      }
    }
    if (e instanceof ErrorCodeoscopic && e.clase === 'auth') {
      return { ok: false, mensaje: `El host responde pero rechaza las credenciales: ${e.detalle}` }
    }
    return { ok: false, mensaje: e instanceof Error ? e.message : String(e) }
  }
}

/** Lo consumido y lo que queda. Para pintarlo antes de que nadie pulse nada. */
export async function estadoConsumo(
  correduriaId: string,
  env: Record<string, string | undefined> = process.env,
): Promise<{ veredicto: Veredicto; gastadoMes: string } | { error: string }> {
  const r = resolverConfig(env)
  if (r.estado !== 'lista') return { error: explicarConfig(r) }
  try {
    const consumo = await consumoActual(correduriaId)
    const gastado = (consumo.mesFacturables + consumo.mesEnVuelo) * COSTE_COTIZACION_CENTS
    return { veredicto: puedeCotizar(consumo, r.config.topes), gastadoMes: eurCents(gastado) }
  } catch (e) {
    // No devolvemos «0 gastado» ante un fallo de lectura: diríamos que no se ha
    // gastado nada cuando lo cierto es que no lo sabemos.
    return { error: `No se pudo leer el libro de consumo: ${e instanceof Error ? e.message : String(e)}` }
  }
}

export async function cotizar(
  p: PeticionCotizacion,
  env: Record<string, string | undefined> = process.env,
): Promise<ResultadoCotizacion> {
  // 1 — Config
  const r = resolverConfig(env)
  if (r.estado === 'apagado') return { ok: false, razon: 'apagado', mensaje: explicarConfig(r) }
  if (r.estado === 'incompleta')
    return { ok: false, razon: 'mal-configurado', mensaje: explicarConfig(r) }
  const config = r.config

  // 2/3 — Libro. Si no se puede leer, se para aquí.
  let consumo
  try {
    consumo = await consumoActual(p.correduriaId)
  } catch (e) {
    return {
      ok: false,
      razon: 'sin-libro',
      mensaje:
        'No se puede cotizar porque no se puede leer el libro de consumo, y sin él el tope ' +
        `no existe: ${e instanceof Error ? e.message : String(e)}`,
    }
  }

  // 4 — Tope
  const veredicto = puedeCotizar(consumo, config.topes)
  if (!veredicto.permitido) return { ok: false, razon: 'tope', mensaje: veredicto.explicacion }

  // 5 — Reserva ANTES de llamar
  const intentoId = randomUUID()
  try {
    await reservar({
      correduriaId: p.correduriaId,
      intentoId,
      motivo: p.motivo,
      solicitadoPor: p.solicitadoPor,
    })
  } catch (e) {
    return {
      ok: false,
      razon: 'sin-libro',
      mensaje: `No se pudo anotar la reserva, así que no se llama al vendor: ${
        e instanceof Error ? e.message : String(e)
      }`,
    }
  }

  // 6 — La llamada que cuesta dinero. Un solo intento.
  try {
    const crudo = await peticion(config, {
      metodo: 'POST',
      path: config.quotePath,
      cuerpo: p.cuerpo,
      timeoutMs: config.timeoutCotizacionMs,
    })

    const cotizacion = leerCotizacion(crudo)
    // 7 — Cierre. El projectId es la prueba del cargo y la clave del webhook.
    await cerrarFacturable(intentoId, cotizacion.projectId)

    return {
      ok: true,
      cotizacion,
      coste: eurCents(COSTE_COTIZACION_CENTS),
      restantesHoy: veredicto.restantesHoy - 1,
    }
  } catch (e) {
    if (e instanceof ErrorCodeoscopic && e.pruebaQueNoHuboCargo) {
      await cerrarDescartado(intentoId, `${e.clase}: ${e.detalle}`, e.clase).catch(() => {
        // Si ni el descarte se puede escribir, la reserva se queda abierta y
        // sigue contando. Conservador a propósito.
      })
      return { ok: false, razon: 'vendor', mensaje: e.message }
    }

    // Timeout, 5xx o respuesta ilegible: la reserva se queda ABIERTA y sigue
    // contando contra el tope. No sabemos si nos han cobrado, y ese «no lo sé»
    // no se convierte aquí en un «fue gratis».
    return {
      ok: false,
      razon: 'vendor',
      mensaje:
        `${e instanceof Error ? e.message : String(e)} — la cotización queda anotada como ` +
        `consumida porque no hay prueba de que el vendor no la haya facturado.`,
    }
  }
}
