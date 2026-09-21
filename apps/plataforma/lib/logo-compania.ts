/**
 * Logo de una aseguradora para las tablas de precios de la correduría
 * (retarificación y presupuestos nuevos). Los SVG/PNG vienen del mismo
 * repo de Alberto que ya los sirve en `apps/asegura-web/public/logos/`
 * (`public/logos/insurers/` allí) — se copiaron tal cual a
 * `apps/plataforma/public/logos/insurers/`, sin descargar nada de las
 * webs de cada compañía.
 *
 * `null` cuando no tenemos el logo: la pantalla cae a un badge con las
 * iniciales, nunca a un logo aproximado o redibujado a mano.
 */

type LogoInfo = { archivo: string; escala?: number }

const LOGOS: Record<string, LogoInfo> = {
  mapfre: { archivo: 'mapfre.svg', escala: 1.2 },
  allianz: { archivo: 'allianz.svg' },
  occident: { archivo: 'occident.svg' },
  reale: { archivo: 'reale.svg' },
  generali: { archivo: 'generali.svg', escala: 1.6 },
  fidelidade: { archivo: 'fidelidade.png', escala: 0.7 },
  asisa: { archivo: 'asisa.png' },
}

function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/** `null` = no tenemos el logo de esa compañía (o no se sabe qué compañía es). */
export function logoCompania(nombre: string | null | undefined): { src: string; escala: number } | null {
  if (!nombre) return null
  const clave = normalizar(nombre)
  const entrada = Object.entries(LOGOS).find(([k]) => clave.includes(k))
  if (!entrada) return null
  return { src: `/logos/insurers/${entrada[1].archivo}`, escala: entrada[1].escala ?? 1 }
}

/**
 * El nombre del producto SIN repetir el de la compañía delante («Mapfre
 * Autos» → «Autos» cuando la compañía es «Mapfre»). El dato no cambia,
 * solo se deja de pintar dos veces lo mismo en la misma fila.
 */
export function nombreProductoSinCia(compania: string | null | undefined, producto: string | null | undefined): string | null {
  if (!producto) return producto ?? null
  if (!compania) return producto
  const c = normalizar(compania)
  const p = normalizar(producto)
  if (c && p.startsWith(c)) {
    const resto = producto.slice(compania.length).trim()
    return resto || producto
  }
  return producto
}
