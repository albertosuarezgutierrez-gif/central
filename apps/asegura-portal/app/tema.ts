// Tema claro/oscuro del portal. Mecanismo copiado del de `app.grupoasegura.com`
// (`src/components/theme/theme-store.ts`), no inventado.
//
// 🚨 EL DEFAULT ES CLARO, Y ESO NO ES UN DESCUIDO. La app de Manuel arranca en
// oscuro SOLO en el backoffice: su `BACKOFFICE_DARK_PREFIXES` lista las 14
// rutas del corredor (`dashboard`, `clientes`, `polizas`, `siniestros`…) y deja
// en claro todo lo demás — landing y portal del cliente incluidos. El oscuro es
// la marca de la trastienda, no la del producto que ve el asegurado.
//
// 📌 Y no se mira `prefers-color-scheme` a propósito, también como él: quien
// abre el portal desde el enlace de un correo espera el aspecto de la carta que
// acaba de leer. Quien prefiera oscuro lo pulsa una vez y se le recuerda.

export const CLAVE_TEMA = 'asegura-portal:tema'

export type Tema = 'claro' | 'oscuro'

/**
 * Script que corre ANTES de pintar, en el `<head>`.
 *
 * Sin esto, el portal de alguien que eligió oscuro carga en blanco y salta a
 * negro cuando React hidrata: el parpadeo blanco a pantalla completa que todo
 * el mundo reconoce como «esta web está mal hecha». Es síncrono a propósito.
 *
 * Escribe el atributo Y la clase porque `@central/brand` emite los dos
 * selectores (`[data-theme="dark"]` y `.dark`).
 */
export const SCRIPT_TEMA = `
try {
  var t = localStorage.getItem(${JSON.stringify(CLAVE_TEMA)});
  if (t === 'oscuro') {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.classList.add('dark');
  }
} catch (e) {}
`.trim()

/**
 * Lee el tema de la PANTALLA, no de `localStorage`.
 *
 * Parece un rodeo y es lo contrario: si el botón se dibujara desde lo guardado,
 * en la primera carga sin preferencia diría «claro» mientras el `<html>` ya
 * pudiera estar en otra cosa, y el usuario vería un interruptor que miente
 * sobre lo que tiene delante. La verdad es el DOM.
 */
export function temaEnPantalla(): Tema {
  if (typeof document === 'undefined') return 'claro'
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'oscuro' : 'claro'
}

export function aplicarTema(tema: Tema): void {
  if (typeof document === 'undefined') return
  const raiz = document.documentElement
  if (tema === 'oscuro') {
    raiz.setAttribute('data-theme', 'dark')
    raiz.classList.add('dark')
  } else {
    raiz.removeAttribute('data-theme')
    raiz.classList.remove('dark')
  }
  // El guardado va DESPUÉS de aplicar y en su propio try: en navegación
  // privada `localStorage` lanza al escribir, y si se guardase primero el
  // botón no haría nada visible. Preferimos que cambie y no se recuerde a que
  // no cambie.
  try {
    localStorage.setItem(CLAVE_TEMA, tema)
  } catch {
    /* modo privado o almacenamiento bloqueado: el tema vale para esta visita */
  }
}
