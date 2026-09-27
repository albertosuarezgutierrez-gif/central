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
