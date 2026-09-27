/**
 * ¿Es la misma compañía? Lo único de la póliza que guarda una oportunidad es la
 * compañía, así que es lo que distingue dos seguros del mismo ramo de un
 * cliente (dos coches: uno en MUSSAP y otro en Línea Directa). Ignora el
 * relleno («Seguros», «Mutua», «S.A.»…). Sin compañía en alguno de los dos
 * lados no se sabe (`no_se`), y quien decide trata eso como «puede ser la misma».
 */
export function mismaCompania(a: string | null, b: string | null): 'misma' | 'otra' | 'no_se' {
  const x = claveCompania(a), y = claveCompania(b)
  if (!x || !y) return 'no_se'
  return x === y ? 'misma' : 'otra'
}

const RELLENO = new Set(['seguros', 'seguro', 'mutua', 'compania', 'de', 'y', 'reaseguros', 'aseguradora', 'sa', 's', 'a', 'la', 'el', 'grupo'])

function claveCompania(s: string | null): string | null {
  const t = (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter((w) => w && !RELLENO.has(w))
  return t[0] ?? null
}
