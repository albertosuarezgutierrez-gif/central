import { createHash } from 'node:crypto'

/**
 * VAPID y opciones de entrega del push del portal, UNA vez para los dos crons
 * (`/api/cron/avisos-push` y `/api/cron/avisos-cima`).
 *
 * 🚨 Las claves salen de `requireSecret()` (sin fallback a literal ni a `''`), pero se leen DENTRO del
 * handler, nunca al importar: un módulo que lanza al cargarse tumba el build o la ruta entera. Si
 * falta una, `cargarVapid` devuelve `{ ok: false }` y el cron responde el 503 `sin_vapid` de siempre
 * (mandar sin claves no es posible; fingir un `{avisadas:0}` sería mentir).
 *
 * `core-identity` se importa dinámico a propósito: su `index.ts` no se deja cargar desde `node --test`.
 */
export const VAPID_SUBJECT = 'mailto:hola@grupoasegura.es'

/** Un aviso que no se entregó en 48 h ya no sirve: caduca en el servicio de push en vez de llegar tarde. */
export const TTL_AVISO_SEGUNDOS = 48 * 60 * 60

export const OPCIONES_AVISO = { ttl: TTL_AVISO_SEGUNDOS, urgency: 'normal' } as const

export interface VapidCargada {
  publicKey: string
  privateKey: string
  subject: string
}

export type ResultadoVapid = { ok: true; vapid: VapidCargada } | { ok: false }

export async function cargarVapid(leer?: (nombre: string) => string): Promise<ResultadoVapid> {
  const leerSecreto = leer ?? (await import('@central/core-identity')).requireSecret
  try {
    return {
      ok: true,
      vapid: {
        publicKey: leerSecreto('NEXT_PUBLIC_VAPID_PUBLIC_KEY'),
        privateKey: leerSecreto('VAPID_PRIVATE_KEY'),
        subject: VAPID_SUBJECT,
      },
    }
  } catch {
    return { ok: false }
  }
}

/**
 * `Topic` estable de un aviso: la misma clave da siempre el mismo topic (un reintento SUSTITUYE al
 * mensaje pendiente en vez de duplicarlo) y claves distintas dan topics distintos. Hash, no la clave
 * en claro: son ids/códigos internos y el topic viaja al servicio de push. 24 caracteres base64url
 * (≤32 y solo `A-Za-z0-9_-`, lo que exige `web-push`).
 */
export function topicAviso(clave: string): string {
  return createHash('sha256').update(clave).digest('base64url').slice(0, 24)
}
