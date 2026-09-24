/**
 * El logo de cada compañía para la lista plegable del parte (24/09/2026).
 *
 * Los ficheros de `public/logos/` son los MISMOS que sirve la web pública
 * (`apps/asegura-web/public/logos/`, que a su vez vienen del repo `asegura`):
 * no se descarga ni se dibuja ninguno. Fidelidade y Asisa van en PNG porque es
 * lo que hay.
 *
 * El nombre de la BD no siempre es el comercial a secas («Allianz Seguros»,
 * «Reale Seguros Generales»), así que se casa por la PRIMERA palabra
 * normalizada. Sin logo → `null`, y la pantalla pinta la inicial: una compañía
 * sin logo sigue saliendo, nunca se esconde.
 */
const LOGOS: Record<string, string> = {
  allianz: '/logos/allianz.svg',
  asisa: '/logos/asisa.png',
  fidelidade: '/logos/fidelidade.png',
  generali: '/logos/generali.svg',
  mapfre: '/logos/mapfre.svg',
  occident: '/logos/occident.svg',
  reale: '/logos/reale.svg',
}

export function logoCompania(nombre: string): string | null {
  const primera = nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .split(/[\s,.]+/)[0]
  return primera ? (LOGOS[primera] ?? null) : null
}
