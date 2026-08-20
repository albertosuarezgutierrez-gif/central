// ────────────────────────────────────────────────────────────────────────────
// Código de verificación (2FA) del login del Portal de Subastas. PURO.
//
// El Portal exige un segundo factor SOLO en la vía usuario+contraseña — la
// única que puede usar un proceso automático. Manda un código de 8 caracteres
// al correo Y al móvil, y hay que devolverlo en la MISMA sesión que hizo el
// login (va atado a la cookie del intento, no al usuario).
//
// 🚨 EL PELIGRO AQUÍ ES EL CÓDIGO VIEJO. El buzón acumula códigos: el del
// intento de hace una hora, el del cambio de contraseña de esta mañana, el de
// la prueba de ayer. Todos tienen exactamente la misma pinta. Coger el
// «último que encuentre» es la versión de manual del fallo que este repo ya se
// comió con `fy`/`fp` de la SEC: un dato plausible, bien formado y de otro
// momento. Aquí además se paga caro — cada código quemado es un intento
// fallido, y el Portal bloquea cuentas.
//
// Por eso:
//   · Se exige que el correo sea POSTERIOR al instante del intento de login.
//   · Se distingue el correo de LOGIN del de CAMBIO DE CONTRASEÑA, que lleva
//     la misma frase «código de verificación» y no vale para iniciar sesión.
//   · Ante varios candidatos válidos gana el más RECIENTE, y si no hay ninguno
//     se devuelve `null` — nunca el mejor de los viejos.
// ────────────────────────────────────────────────────────────────────────────
import { decodificarHtml } from './email-boe.ts'
import { norm } from './parsing.ts'

/** Un correo del Portal, reducido a lo que hace falta para decidir. */
export interface CorreoOtp {
  asunto: string
  /** Cuerpo en texto o HTML: da igual, se limpia aquí. */
  cuerpo: string
  fecha: Date
}

/**
 * Códigos observados: 8 caracteres, mayúsculas y dígitos (`F5BFBBT7`,
 * `9A4CBF71`, `T84T2T52`). Se ancla a la frase que los introduce para no
 * confundirlos con un identificador de subasta o una referencia catastral.
 */
const TRAS_LA_FRASE = /codigo de verificacion:?\s*([a-z0-9]{8})\b/

/** ¿Este correo es el del SEGUNDO PASO DEL LOGIN, y no otro del Portal? */
export function esCorreoDeLogin(c: Pick<CorreoOtp, 'asunto' | 'cuerpo'>): boolean {
  const a = norm(c.asunto ?? '')
  const t = texto(c.cuerpo ?? '')
  // El de cambio de contraseña dice «Para establecer su nueva contraseña» y
  // lleva un código idéntico en forma. Descartarlo explícitamente evita quemar
  // un intento de login con un código que nunca iba a valer.
  if (/establecer su nueva contrasena/.test(t)) return false
  if (/cambio de contrasena/.test(a)) return false
  return /confirmar inicio de sesion/.test(a) || /intento de inicio de sesion/.test(t)
}

function texto(s: string): string {
  return norm(decodificarHtml((s ?? '').replace(/<[^>]*>/g, ' ')))
}

/** El código que lleva dentro, o `null` si no hay uno reconocible. */
export function codigoDeCorreo(c: Pick<CorreoOtp, 'asunto' | 'cuerpo'>): string | null {
  if (!esCorreoDeLogin(c)) return null
  const m = TRAS_LA_FRASE.exec(texto(c.cuerpo ?? ''))
  return m ? m[1].toUpperCase() : null
}

/**
 * El código del intento en curso, elegido entre los correos del buzón.
 *
 * @param correos  candidatos (cualquier orden).
 * @param intentoEn instante en que se lanzó el POST del login. Un correo
 *   anterior a esto es de OTRO intento, por muy reciente que parezca.
 * @param margenMs  holgura para el desfase de reloj entre Vercel y Gmail.
 *   Pequeña a propósito: cuanto más ancha, más cerca de aceptar el código
 *   anterior. Con dos intentos seguidos separados por segundos, esta ventana
 *   es lo único que los distingue.
 */
export function codigoDelIntento(
  correos: readonly CorreoOtp[],
  intentoEn: Date,
  margenMs = 30_000,
): string | null {
  const suelo = intentoEn.getTime() - margenMs
  const validos = correos
    .filter((c) => c.fecha instanceof Date && !Number.isNaN(c.fecha.getTime()))
    .filter((c) => c.fecha.getTime() >= suelo)
    .filter((c) => esCorreoDeLogin(c))
    .sort((a, b) => b.fecha.getTime() - a.fecha.getTime())

  for (const c of validos) {
    const codigo = codigoDeCorreo(c)
    if (codigo) return codigo
  }
  // Ni uno posterior al intento. NO se cae al más nuevo de los viejos: eso
  // sería mandar el código de la sesión anterior y quemar este intento.
  return null
}
