export type NavegadorIOS = 'safari' | 'chrome' | 'otro'

/**
 * Qué navegador de iPhone/iPad es, porque cada uno esconde Compartir en un
 * sitio distinto (lo usa `InstruccionesIOS` de `app/instalacion.tsx`). Todos
 * son WebKit por dentro, pero la barra es de cada uno: Chrome (`CriOS`) lo
 * lleva en la barra de la dirección; Firefox (`FxiOS`), Edge (`EdgiOS`), Opera
 * y la app de Google (`GSA`), dentro de su menú. Safari es lo que queda.
 */
export function navegadorIOS(ua: string): NavegadorIOS {
  if (/CriOS/.test(ua)) return 'chrome'
  if (/FxiOS|EdgiOS|OPiOS|OPT\/|GSA\//.test(ua)) return 'otro'
  return 'safari'
}

/** Versión de iOS/iPadOS del user agent (`16.4` → 16.4), o `null` si no se lee. */
export function versionIOS(ua: string): number | null {
  const m = /OS (\d+)[_.](\d+)/.exec(ua)
  return m ? Number(m[1]) + Number(m[2]) / 100 : null
}

/**
 * ¿Puede ESTE navegador añadir la web a la pantalla de inicio?
 *
 * 🚨 Es la causa de «en mi iPhone con Chrome no me sale» (cliente, 06/10/2026):
 *  · Safari siempre puede.
 *  · Chrome, Firefox y Edge de iPhone solo desde iOS 16.4; antes, ni existe el
 *    gesto en su menú.
 *  · Una vista integrada (el navegador interno de Gmail, WhatsApp, Instagram…;
 *    su UA no lleva `Safari/`) NO tiene Compartir → «Añadir a pantalla de
 *    inicio». El enlace del correo cae justo ahí.
 * Si la versión no se puede leer, se asume que sí: mejor enseñar el gesto que
 * mandar a Safari a quien no hace falta.
 */
export function puedeAnadirDesdeNavegador(ua: string): boolean {
  if (!/Safari\//.test(ua)) return false
  if (navegadorIOS(ua) === 'safari') return true
  const v = versionIOS(ua)
  return v === null || v >= 16.04
}
