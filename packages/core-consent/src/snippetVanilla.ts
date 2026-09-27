// housesevillana sirve su HTML entero como un template literal (app/route.ts) — no hay
// árbol de componentes React ahí. Esta función devuelve el bloque <script> como STRING,
// para interpolarlo en ese template exactamente como hoy se interpolan los scripts sueltos
// de GA4 y Meta Pixel. Sin comillas invertidas: rompería el template literal que lo aloja
// (ver apps/housesevillana/CLAUDE.md).
import { configBanner } from './banner.ts'

export function montarBannerHtml(idioma: 'es' | 'en' | 'it'): string {
  const config = JSON.stringify(configBanner(idioma))
  return [
    '<script src="https://cdn.jsdelivr.net/gh/orestbida/cookieconsent@3/dist/cookieconsent.umd.js"></script>',
    '<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orestbida/cookieconsent@3/dist/cookieconsent.css">',
    '<script>',
    `window.CookieConsent.run(${config});`,
    '</script>',
  ].join('\n')
}
