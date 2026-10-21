// apps/plataforma/lib/correo/uid-atascado.ts
//
// Un correo que IMAP lista pero no deja descargar CORTA la pasada del triaje en su UID (imap.ts, fase 2): saltarlo y
// seguir lo daría por visto sin leerlo. Pero si NUNCA se puede descargar, el buzón se quedaría atascado para siempre.
// Regla (PURA, con test): tras TOPE_PASADAS_UID_ATASCADO pasadas SEGUIDAS fallando el MISMO UID (mismo uidvalidity), se
// salta ese UID, el cursor avanza y se avisa por Telegram (`correo.no-descargable`).
//
// Persistencia SIN migración: una fila más en `correo_cursor` con `buzon = 'INBOX:no-descargable:<uid>'`,
// `last_uid` = pasadas seguidas fallando y `uidvalidity` = el del buzón cuando falló. El latido del triaje solo mira
// la fila `INBOX` (agentes-latido), así que esta fila no lo maquilla.

export const TOPE_PASADAS_UID_ATASCADO = 3
export const PREFIJO_UID_ATASCADO = 'INBOX:no-descargable:'

export type UidAtascado = { uid: number; fallos: number; uidValidity: number | null }

export type DecisionUidAtascado =
  /** Nada que apuntar: se borra el contador (si lo hubiera). */
  | { accion: 'limpiar' }
  /** Se apunta (o se sube) el contador; la pasada sigue cortada en ese UID. */
  | { accion: 'contar'; uid: number; fallos: number }
  /** Tope alcanzado: se salta el UID (el cursor llega hasta él), se borra el contador y se avisa. */
  | { accion: 'saltar'; uid: number; fallos: number }
  /** La pasada se cortó antes por tiempo: el contador no se toca (no se sabe si el UID habría vuelto a fallar). */
  | { accion: 'nada' }

/**
 * `previo`: el contador guardado (o null). `fallido`: el UID que no se pudo descargar en esta pasada (o null).
 * `diferido`: la pasada se cortó por tiempo antes de llegar al final (entonces no se cuenta ni se salta).
 */
export function decidirUidAtascado(
  previo: UidAtascado | null, fallido: number | null, uidValidity: number, diferido: boolean, tope = TOPE_PASADAS_UID_ATASCADO,
): DecisionUidAtascado {
  if (diferido) return { accion: 'nada' }
  if (fallido === null) return { accion: 'limpiar' }
  const seguidas = previo && previo.uid === fallido && previo.uidValidity === uidValidity ? previo.fallos + 1 : 1
  return seguidas >= tope ? { accion: 'saltar', uid: fallido, fallos: seguidas } : { accion: 'contar', uid: fallido, fallos: seguidas }
}

export function textoAvisoUidAtascado(uid: number, fallos: number): string {
  return `⚠️ Triaje de correo: el correo UID ${uid} no se puede descargar (${fallos} pasadas seguidas): saltado. Míralo a mano en Gmail; el triaje sigue con los siguientes.`
}
