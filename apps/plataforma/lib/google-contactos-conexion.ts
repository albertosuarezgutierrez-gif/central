/**
 * Piezas PURAS de la conexión con Google Contacts en `/correduria/google-contactos` (05/10/2026).
 * Sin imports: las usa el componente cliente y la ruta de servidor. Test: `google-contactos-conexion.test.ts`.
 */

/**
 * La URL que devuelve asegura para arrancar el OAuth. Solo se manda ahí el navegador si es https
 * (http solo en localhost), va a `/api/google-contactos/conectar` y lleva `ticket`, sin credenciales
 * en la URL ni nada más. Cualquier otra cosa → `null` (no se navega).
 */
export function urlConectarValida(valor: unknown): string | null {
  if (typeof valor !== 'string' || valor.length > 2048) return null
  let u: URL
  try {
    u = new URL(valor)
  } catch {
    return null
  }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1'
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) return null
  if (u.username || u.password || u.hash) return null
  if (u.pathname !== '/api/google-contactos/conectar') return null
  const claves = [...u.searchParams.keys()]
  if (claves.length !== 1 || claves[0] !== 'ticket' || !u.searchParams.get('ticket')) return null
  return u.toString()
}

/** Texto para el `motivo` con el que vuelve el callback (código cerrado de asegura). */
export function textoMotivoGoogle(motivo: string | null): string {
  const m = motivo ?? ''
  if (m === 'cancelado') return 'Cancelaste el permiso en Google. No se ha guardado nada.'
  if (m === 'ticket_caducado') return 'El enlace de conexión caducó (dura 2 minutos). Vuelve a pulsar «Conectar Google».'
  if (m === 'ticket_usado') return 'Ese enlace de conexión ya se había usado. Vuelve a pulsar «Conectar Google».'
  if (m === 'ticket_bd') return 'asegura no pudo registrar el enlace de conexión (¿falta la migración 2026-10-05c?). No se ha conectado.'
  if (m.startsWith('ticket_')) return 'El enlace de conexión no es válido. Vuelve a pulsar «Conectar Google».'
  if (m.startsWith('state_')) return 'La vuelta de Google no se pudo verificar (¿otro navegador o pasaron más de 10 minutos?). Empieza de nuevo.'
  if (m === 'sin_configurar') return 'Faltan las variables GOOGLE_CONTACTOS_* en asegura.'
  if (m === 'canje') return 'Google dio el permiso pero no se pudo guardar la conexión. No se ha guardado nada; inténtalo de nuevo.'
  if (m === 'sesion') return 'Tu sesión de asegura no tiene acceso a la cartera.'
  return 'No se ha podido conectar con Google. No se ha guardado nada.'
}

/** Resumen corto de `ultimo_error` para la tarjeta (el completo, en el `title`). */
export function resumenError(e: string | null | undefined, max = 140): string | null {
  if (!e) return null
  const t = e.replace(/\s+/g, ' ').trim()
  if (!t) return null
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}
