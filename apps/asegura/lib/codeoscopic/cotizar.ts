// Orquestador de la cotización: la única puerta por la que se gasta dinero.
//
// El orden de los pasos ES el diseño:
//   0. Simulación     → si está puesta, se devuelve una cotización INVENTADA y
//                       marcada (`simulado: true`) y no se toca nada más: ni
//                       vendor, ni libro, ni tope. No ha costado nada.
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
import {
  resolverConfig,
  explicarConfig,
  simulacionActiva,
  COSTE_COTIZACION_CENTS,
  type Topes,
} from './config.ts'
import { puedeCotizar, eurCents, type Veredicto, type Consumo } from './contador.ts'
import { consumoActual, reservar, cerrarFacturable, cerrarDescartado } from './consumo.ts'
import { peticion, obtenerToken, ErrorCodeoscopic } from './cliente.ts'
import { leerCotizacion, type Cotizacion } from './respuesta.ts'
import { cotizacionSimulada } from './simulacion.ts'
import {
  guardarSinTumbar,
  type ContextoCotizacion,
  type Guardado,
  type GuardarCotizacion,
} from './cotizaciones.ts'

export type ResultadoCotizacion =
  | {
      ok: true
      /**
       * 🚨 `true` = la cotización NO la ha dado ninguna compañía: la ha
       * inventado `simulacion.ts` porque el modo simulación está puesto en el
       * servidor. Es un dato del objeto, no un texto dentro de un mensaje, para
       * que no se pueda perder por el camino: quien pinte esto tiene que poder
       * distinguirlo de un precio real sin leer prosa.
       */
      simulado: boolean
      cotizacion: Cotizacion
      coste: string
      /** `null` = no se ha mirado el libro (simulación). NO es «quedan 0». */
      restantesHoy: number | null
      /**
       * Qué pasó con la COPIA en `seguros.tarificaciones`. Tres estados y no un
       * booleano: «guardada», «se intentó y falló (con el motivo)» y «ni se
       * intentó». El precio de arriba vale igual —ya está pagado— pero quien lo
       * pinte tiene que poder decir que no ha quedado copia, en vez de suponer
       * que sí. Un `guardado: true` optimista sería justo la mentira barata.
       */
      guardado: Guardado
    }
  | { ok: false; razon: 'apagado' | 'mal-configurado' | 'sin-libro' | 'tope' | 'vendor'; mensaje: string }

export type PeticionCotizacion = {
  correduriaId: string
  /** Cuerpo `CreateInsuranceRequest_V1` ya construido. */
  cuerpo: unknown
  /** Por qué se gasta: 'smoke', 'alta-manual', 'defensa-cartera'… Va al libro. */
  motivo: string
  solicitadoPor: string
  /**
   * De dónde viene (ramo, puerta, póliza, cliente). Es lo que hace guardable la
   * cotización: sin él NO se inventa un ramo ni una puerta, simplemente no se
   * guarda y el resultado lo dice (`guardado.estado === 'no_intentada'`).
   */
  contexto?: ContextoCotizacion
}

/**
 * Lo que el embudo llama y un test puede doblar. Solo la persistencia: la
 * llamada al vendor y el libro de consumo NO se doblan aquí a propósito, para
 * que no exista un camino por el que alguien pueda saltarse el tope.
 */
export type DepsCotizar = { guardar?: GuardarCotizacion }

/**
 * Guarda la cotización sin poder tumbarla.
 *
 * 🚨 El orden y el `try` de aquí son la decisión de diseño del módulo: cuando
 * se llega a este punto el cliente YA ha pagado los 0,50€ y YA tiene su precio.
 * Perderlo por un error de BD sería cobrárselo dos veces. Así que el fallo se
 * REGISTRA en el resultado —con su motivo— y no cambia ni el precio ni el `ok`.
 */
async function anotar(
  deps: DepsCotizar,
  p: PeticionCotizacion,
  extra: { cotizacion: Cotizacion; intentoId: string | null; simulado: boolean },
): Promise<Guardado> {
  if (!p.contexto) {
    return {
      estado: 'no_intentada',
      motivo:
        'no se ha declarado el contexto (ramo y puerta), y eso no se adivina: un ramo ' +
        'inventado en la tabla se leería después como un dato.',
    }
  }
  try {
    const guardar = deps.guardar ?? guardarSinTumbar
    return await guardar({
      correduriaId: p.correduriaId,
      contexto: p.contexto,
      peticion: p.cuerpo,
      solicitadoPor: p.solicitadoPor,
      ...extra,
    })
  } catch (e) {
    // `guardarSinTumbar` ya no lanza; este `catch` cubre cualquier futura
    // implementación que sí lo haga. Una cotización pagada no se pierde nunca
    // por un fallo de escritura.
    return { estado: 'no_guardada', motivo: e instanceof Error ? e.message : String(e) }
  }
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
): Promise<
  | { veredicto: Veredicto; gastadoMes: string; consumo: Consumo; topes: Topes }
  | { error: string }
> {
  const r = resolverConfig(env)
  if (r.estado !== 'lista') return { error: explicarConfig(r) }
  try {
    const consumo = await consumoActual(correduriaId)
    const gastado = (consumo.mesFacturables + consumo.mesEnVuelo) * COSTE_COTIZACION_CENTS
    // El consumo CRUDO viaja también: quien quiera calcular una tanda lo
    // necesita, y reconstruirlo a ojo desde el veredicto lleva a partir de cero
    // —que hace parecer el tope más vacío de lo que está y diría que caben más
    // de las que caben—.
    return {
      veredicto: puedeCotizar(consumo, r.config.topes),
      gastadoMes: eurCents(gastado),
      consumo,
      topes: r.config.topes,
    }
  } catch (e) {
    // No devolvemos «0 gastado» ante un fallo de lectura: diríamos que no se ha
    // gastado nada cuando lo cierto es que no lo sabemos.
    return { error: `No se pudo leer el libro de consumo: ${e instanceof Error ? e.message : String(e)}` }
  }
}

export async function cotizar(
  p: PeticionCotizacion,
  env: Record<string, string | undefined> = process.env,
  deps: DepsCotizar = {},
): Promise<ResultadoCotizacion> {
  // 0 — SIMULACIÓN. Va lo PRIMERO, y por eso el resto de pasos ni se ejecuta:
  // no hay llamada, luego no hay cargo; y sin cargo no hay nada que reservar,
  // que cerrar ni que contar contra el tope. El interruptor sale de `env` —del
  // servidor—, nunca de `p`: si viniera en la petición, cualquiera podría pedir
  // que la app enseñara precios inventados a un cliente.
  if (simulacionActiva(env)) {
    const inventada = cotizacionSimulada(p.cuerpo)
    // Se guarda IGUAL que una real, y a propósito: así se puede recorrer la
    // pantalla entera sin gastar. Va marcada `simulado: true` y SIN intentoId
    // —no hay línea en el libro porque no hubo llamada ni cargo—, que es el
    // invariante `simulado = (intento_id is null)` de la tabla. El índice
    // parcial deja lo simulado fuera de toda estimación.
    const guardado = await anotar(deps, p, {
      cotizacion: inventada,
      intentoId: null,
      simulado: true,
    })
    return {
      ok: true,
      simulado: true,
      cotizacion: inventada,
      // No ha costado nada, y esto no es un redondeo: no ha salido la petición.
      coste: eurCents(0),
      // No se ha leído `seguros.codeoscopic_consumo` (no hacía falta), así que
      // no se sabe cuántas quedan hoy. `null` es «no se ha mirado»; un número
      // aquí sería inventar cupo. Tampoco se anota nada EN EL LIBRO: una
      // simulación no consume tope ni alimenta ninguna estimación posterior.
      restantesHoy: null,
      guardado,
    }
  }

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

    // 8 — La copia de los precios. DESPUÉS del cierre, y nunca antes: si
    // guardar tumbara el paso 7, un cargo real de 0,50€ se quedaría sin apuntar
    // en el libro y el tope contaría de menos justo cuando más falta hace.
    const guardado = await anotar(deps, p, { cotizacion, intentoId, simulado: false })

    return {
      ok: true,
      // Explícito: este precio SÍ lo ha dado una compañía y SÍ ha costado 0,50€.
      simulado: false,
      cotizacion,
      coste: eurCents(COSTE_COTIZACION_CENTS),
      restantesHoy: veredicto.restantesHoy - 1,
      guardado,
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
