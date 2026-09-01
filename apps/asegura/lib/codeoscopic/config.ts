// Configuración del cliente de Codeoscopic / Avant2 (tarificación).
//
// ─── Por qué esto es un helper PURO y con TRES estados ───────────────────────
// Aquí no hay sandbox utilizable (las credenciales que entregó Manuel el
// 01/09/2026 son de PRODUCCIÓN), así que **cada cotización cuesta 0,50€ de
// verdad**. Eso invierte el criterio habitual: ante la duda, NO se llama.
//
// Por eso la resolución de config distingue tres cosas y no dos:
//   - `apagado`     → el interruptor no está puesto. No es un error: es el
//                     estado por defecto y deliberado del sistema.
//   - `incompleta`  → se quiso encender pero faltan variables. Decimos CUÁLES.
//   - `lista`       → se puede llamar al vendor.
// Un `incompleta` jamás se degrada a `apagado`: son cosas distintas y el
// operador tiene que poder distinguir «no lo he encendido» de «lo encendí mal».

/** Coste que Codeoscopic factura por CADA cotización (`POST /insurances`).
 *  Confirmado el 01/09/2026 en dos fuentes escritas del Gmail de Alberto:
 *  el email del CEO (09/04/2026) y el presupuesto del 14/05/2026. Se factura
 *  a mes vencido. NO es por emisión: es por cotización. */
export const COSTE_COTIZACION_CENTS = 50

/** Media type con el que Avant2 pinea la versión de la API (no va en el path). */
export const MEDIA_TYPE_V1 = 'application/vnd.codeoscopic.v1+json'

export type ConfigCodeoscopic = {
  baseUrl: string
  tokenUrl: string
  clientId: string
  clientSecret: string
  clientApp: string
  userEmail: string
  quotePath: string
  timeoutCotizacionMs: number
  timeoutGenericoMs: number
  margenRefrescoTokenS: number
  topes: Topes
}

export type Topes = { diario: number; mensual: number }

export type ResolucionConfig =
  | { estado: 'apagado'; motivo: string }
  | { estado: 'incompleta'; faltan: string[] }
  | { estado: 'lista'; config: ConfigCodeoscopic }

/** Variables sin las que no se puede ni intentar una llamada. */
const OBLIGATORIAS = [
  'CODEOSCOPIC_BASE_URL',
  'CODEOSCOPIC_CLIENT_ID',
  'CODEOSCOPIC_CLIENT_SECRET',
  'CODEOSCOPIC_CLIENT_APP',
  'CODEOSCOPIC_USER_EMAIL',
] as const

// Topes por defecto, a propósito BAJOS. La regla es que un despiste cueste
// céntimos, no cientos de euros: 20 cotizaciones/día son 10,00€ y 200/mes son
// 100,00€. Se suben por env cuando haga falta (p. ej. una pasada de defensa de
// cartera sobre las ~109 pólizas vivas, que son 54,50€ de una tacada).
export const TOPE_DIARIO_DEFECTO = 20
export const TOPE_MENSUAL_DEFECTO = 200

// Techo absoluto que el env NO puede superar. Existe contra el dedo gordo: un
// `2000` donde iba `200` son 1.000,00€. Para pasar de aquí hay que tocar código,
// que es exactamente la fricción que queremos.
export const TOPE_DIARIO_MAXIMO = 250
export const TOPE_MENSUAL_MAXIMO = 1000

function entero(valor: string | undefined, defecto: number, maximo: number): number {
  if (valor === undefined || valor.trim() === '') return defecto
  const n = Number(valor)
  // Un valor ilegible NO se interpreta como «sin límite»: se cae al defecto.
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return defecto
  return Math.min(n, maximo)
}

export function resolverTopes(env: Record<string, string | undefined>): Topes {
  return {
    diario: entero(env.CODEOSCOPIC_TOPE_DIARIO, TOPE_DIARIO_DEFECTO, TOPE_DIARIO_MAXIMO),
    mensual: entero(env.CODEOSCOPIC_TOPE_MENSUAL, TOPE_MENSUAL_DEFECTO, TOPE_MENSUAL_MAXIMO),
  }
}

/**
 * Resuelve la config desde un objeto de entorno. Puro: no lee `process.env`
 * directamente para poder probarlo.
 */
export function resolverConfig(
  env: Record<string, string | undefined>,
  opciones: { ignorarInterruptor?: boolean } = {},
): ResolucionConfig {
  // ── Interruptor general ────────────────────────────────────────────────────
  // Apagado por defecto y de forma EXPLÍCITA: solo el literal 'true' enciende.
  // Es el equivalente en código a «el smoke solo con el OK de Alberto»: mientras
  // esta variable no esté puesta a mano en Vercel, no sale ni una cotización.
  //
  // `ignorarInterruptor` existe solo para la SONDA del token, que es gratis. Así
  // se puede comprobar host y credenciales ANTES de encender nada — verificar
  // primero y encender después, y no al revés.
  if (!opciones.ignorarInterruptor && env.CODEOSCOPIC_TARIFICACION_ACTIVA !== 'true') {
    return {
      estado: 'apagado',
      motivo:
        'CODEOSCOPIC_TARIFICACION_ACTIVA no está a "true". Cada cotización cuesta ' +
        '0,50€ reales, así que el cliente arranca apagado a propósito.',
    }
  }

  const faltan = OBLIGATORIAS.filter((k) => !env[k] || env[k]!.trim() === '')
  if (faltan.length > 0) return { estado: 'incompleta', faltan: [...faltan] }

  const baseUrl = env.CODEOSCOPIC_BASE_URL!.trim().replace(/\/+$/, '')

  return {
    estado: 'lista',
    config: {
      baseUrl,
      tokenUrl: env.CODEOSCOPIC_TOKEN_URL?.trim() || `${baseUrl}/oauth2/token`,
      clientId: env.CODEOSCOPIC_CLIENT_ID!.trim(),
      clientSecret: env.CODEOSCOPIC_CLIENT_SECRET!,
      clientApp: env.CODEOSCOPIC_CLIENT_APP!.trim(),
      userEmail: env.CODEOSCOPIC_USER_EMAIL!.trim(),
      quotePath: env.CODEOSCOPIC_QUOTE_PATH?.trim() || '/insurances',
      // 150 s: una cotización real consulta a ~20 compañías y puede pasar del minuto.
      timeoutCotizacionMs: entero(env.CODEOSCOPIC_QUOTE_TIMEOUT_MS, 150_000, 300_000),
      timeoutGenericoMs: entero(env.CODEOSCOPIC_REQUEST_TIMEOUT_MS, 15_000, 60_000),
      margenRefrescoTokenS: entero(env.CODEOSCOPIC_OAUTH2_REFRESH_MARGIN_S, 30, 600),
      topes: resolverTopes(env),
    },
  }
}

/** Explica en una frase por qué no se puede tarificar. Para la UI y los logs. */
export function explicarConfig(r: ResolucionConfig): string {
  if (r.estado === 'lista') return 'Tarificación activa.'
  if (r.estado === 'apagado') return `Tarificación apagada. ${r.motivo}`
  return `Tarificación encendida pero mal configurada: faltan ${r.faltan.join(', ')}.`
}
