// ────────────────────────────────────────────────────────────────────────────
// Interpretación PURA de la respuesta del login del Portal de Subastas.
//
// El Portal admite tres vías de acceso (`/acceso.php`, comprobado 20/08/2026):
//   · certificado electrónico cualificado → `/id/checkCert.php`
//   · usuario (correo o teléfono) + contraseña → `/id/login.php`
//   · Cl@ve → `/claveSubastasLogin.php`
// Solo la segunda la puede usar un cron: las otras dos exigen una tarjeta o un
// móvil delante. El formulario no lleva CSRF ni captcha: `usuario`, `password`,
// `conectar`.
//
// 🚨 POR QUÉ ESTO ES UN MÓDULO PURO Y CONSERVADOR. El mensaje de error real del
// Portal ante credenciales malas es:
//
//   «ERROR: Los datos de acceso proporcionados son incorrectos, el usuario no
//    está activo o está bloqueado.»
//
// …es decir, el Portal BLOQUEA cuentas. Un reintento automático ante un fallo de
// contraseña es la forma más rápida de dejar a Alberto sin acceso a su propia
// cuenta, así que quien llama tiene que poder distinguir «me han rechazado»
// (nunca reintentar) de «no sé qué ha pasado» (fallo de red, reintentable).
//
// Y al revés: el éxito se exige POSITIVO. Si la respuesta no enseña la sesión
// abierta, esto devuelve `desconocido`, no `iniciada`. Dar por buena una sesión
// que no existe haría que el lector volviese a ver el muro documental y lo
// grabase como «esto está oculto incluso con sesión», que es una afirmación
// falsa sobre la que se decide si hace falta ir al Registro.
// ────────────────────────────────────────────────────────────────────────────
import { decodificarHtml } from './email-boe.ts'
import { norm } from './parsing.ts'

/**
 * Qué ha pasado al enviar el formulario de acceso:
 *  · `iniciada`    — la respuesta demuestra sesión abierta.
 *  · `rechazada`   — el Portal dice que los datos no valen o la cuenta no está
 *                    activa. **Nunca se reintenta**: el propio mensaje avisa de
 *                    que la cuenta puede acabar bloqueada.
 *  · `desconocido` — ni una cosa ni la otra (portal caído, rediseño, HTML que no
 *                    es el esperado). Reintentable, pero SIN afirmar que hay sesión.
 */
export type EstadoLogin = 'iniciada' | 'rechazada' | 'desconocido'

export interface ResultadoLogin {
  estado: EstadoLogin
  /** Texto del Portal cuando lo hay, para que el aviso diga la causa real. */
  motivo: string | null
}

/** El Portal escribe los acentos como entidades (`est&#xE1;`): hay que decodificar. */
function texto(html: string): string {
  return norm(decodificarHtml(html.replace(/<[^>]*>/g, ' ')))
}

/**
 * ¿Qué dice la respuesta del `POST /id/login.php`?
 *
 * @param html    cuerpo de la respuesta (siguiendo redirecciones).
 * @param cookies cookies recibidas. Se conservan por si algún día el Portal
 *                empieza a usarlas, pero NO se exigen: hoy no manda ninguna
 *                (cero `Set-Cookie` en `/id/login.php`) — el estado va en los
 *                campos ocultos del formulario.
 */
export function interpretarLogin(html: string, cookies: readonly string[] = []): ResultadoLogin {
  const t = texto(html ?? '')

  // 1) Rechazo explícito. Va PRIMERO: es el único estado que prohíbe reintentar.
  if (/datos de acceso proporcionados son incorrectos/.test(t)) {
    return {
      estado: 'rechazada',
      motivo: 'el Portal rechaza el usuario o la contraseña (o la cuenta no está activa / está bloqueada)',
    }
  }
  if (/usuario .{0,20}bloqueado|cuenta .{0,20}bloqueada/.test(t)) {
    return { estado: 'rechazada', motivo: 'el Portal dice que la cuenta está bloqueada' }
  }

  // 2) Éxito POSITIVO: la cabecera cambia «Iniciar sesión» por «Desconectar»
  // (+ «Mi Perfil») en cuanto hay sesión.
  //
  // 🚨 Aquí ponía `cerrar sesion`, que es lo que YO supuse que decía el Portal
  // —y el fixture del test lo escribí con la misma suposición, así que los
  // tests confirmaban el error en vez de cazarlo—. El Portal dice
  // «Desconectar»: lo reportaron dos observaciones distintas de la página viva
  // (Alberto y Claude en Chrome) antes de que esto se escribiera. La lección es
  // la de siempre en este repo: el fixture de un parser se copia del documento
  // real, nunca se redacta de memoria.
  //
  // Y NO se exige cookie: el Portal no manda ninguna en el login (comprobado
  // con `-D` sobre `/id/login.php`: cero `Set-Cookie`), porque lleva el estado
  // en los ocultos del propio formulario. Exigirla convertía cualquier login
  // bueno en un `desconocido`.
  if (pareceIdentificada(html)) return { estado: 'iniciada', motivo: null }

  return { estado: 'desconocido', motivo: 'la respuesta del Portal no confirma que la sesión se haya abierto' }
}

/**
 * ¿La página que acabamos de bajar sigue viniendo de una sesión abierta?
 *
 * Las sesiones del Portal caducan. Se comprueba en cada ficha porque, si ha
 * caducado a mitad de una pasada, el resto de fichas se leerían como anónimas y
 * su muro documental se grabaría como si fuera lo que ve un usuario registrado.
 */
export function pareceIdentificada(html: string): boolean {
  const t = texto(html ?? '')
  // «Desconectar» es el rótulo real; «mi perfil» es la segunda señal de la
  // misma cabecera. «Cerrar sesión» se mantiene por si el Portal lo usa en
  // alguna pantalla, pero NO es lo que enseña la barra.
  return /desconectar/.test(t) || /mi perfil/.test(t) || /cerrar sesion/.test(t)
}
