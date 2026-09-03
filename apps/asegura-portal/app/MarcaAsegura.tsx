/**
 * Monograma «AS» de Grupo Asegura, EN LÍNEA.
 *
 * Es el mismo trazo que `public/brand/marca-asegura.svg` (traído de
 * `app.grupoasegura.com/icon.svg`, la única fuente vectorial de la marca). Va
 * inline y no como `<img src="/brand/...">` por dos razones:
 *
 *  1. El `fill` es `currentColor`: así el logo toma el color del contexto (el
 *     `--brand` de `@central/brand`). Un `<img>` congelaría el color del
 *     fichero, y un data-URI obligaría a duplicar el SVG por cada tinta.
 *  2. La pantalla de entrada es lo primero que ve alguien que acaba de recibir
 *     un correo: si el logo depende de una petición más, hay un instante en el
 *     que el portal no dice de quién es. Inline no puede fallar ni llegar tarde.
 *
 * El fichero de `public/` se queda: es la fuente y sirve para favicon/OG.
 */
export function MarcaAsegura({ alto = 14 }: { alto?: number }) {
  return (
    <svg
      viewBox="0 0 130 90"
      height={alto}
      width={(alto * 130) / 90}
      role="img"
      aria-label="Grupo Asegura"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M95.98,42.62c-15.09-3.1-18.55-7.18-18.55-13.9v-.19c0-6.63,6.19-12,15.55-12,6.46,0,12,1.73,17.55,6.01.45.36,1.01.54,1.54.54,1.27,0,2.36-1.09,2.36-2.36,0-.91-.54-1.55-.99-1.91-5.82-4.36-11.72-6.55-20.27-6.55-11.83,0-20.46,7.28-20.46,16.72v.19c0,9.63,6.18,14.81,21.45,17.9,14.46,2.91,18,6.81,18,13.55v.18c0,7.27-6.55,12.64-16.09,12.64h-.69v-.03c-17.19,0-26.27-12.37-32.48-24.6l-15.7-34c-.64-1.37-1.54-2.28-3.19-2.28h-.18c-1.63,0-2.53.91-3.18,2.28l-27.18,58.91c-.26.54-.36,1.09-.36,1.45,0,1.1.99,2,2.17,2,1.09,0,1.82-.63,2.28-1.72l2.76-6.07c1.42-3.13,4.24-6.06,8.33-8.18,5.73-2.97,11.44-4.01,18.34-2.77.57.11,1.14.02,1.62-.23,1.13-.59,1.6-2.06,1.01-3.19-.42-.81-1.19-1.11-1.76-1.22-7.18-1.19-13.43-.41-21.02,3.54-.46.25-.91.5-1.36.76l18.34-40.18,9.28,20.14h-.02c.51,1.09,1.03,2.22,1.57,3.43,3.23,7.2,7.28,16.15,13.49,23.36,1.66,1.9,3.4,3.63,5.19,5.11,1.96,1.61,4.05,2.99,6.21,4.1,2.31,1.2,4.77,2.11,7.33,2.73,2.7.65,5.55.98,8.5.98v-.04h.42c12.29,0,21.1-7.09,21.1-17.36v-.18c0-9.27-6.19-14.55-20.91-17.54Z"
      />
    </svg>
  )
}
