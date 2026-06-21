// ────────────────────────────────────────────────────────────────────────────
// Mapa provincia → comunidad autónoma (CCAA) y utilidades PURAS, para filtrar
// licitaciones por zona. El nombre de provincia se compara por substring (ILIKE)
// contra el campo libre `provincia` que PLACSP rellena con el nombre oficial de
// la provincia, por eso usamos los nombres oficiales (con acentos). Determinista,
// sin red ni BD.
// ────────────────────────────────────────────────────────────────────────────

export interface Comunidad {
  id: string          // identificador estable (no traducir)
  nombre: string      // etiqueta es-ES para la UI
  provincias: string[]
}

/** Las 17 CCAA + Ceuta y Melilla, con sus provincias (nombres oficiales). */
export const COMUNIDADES: Comunidad[] = [
  { id: 'andalucia',            nombre: 'Andalucía',             provincias: ['Almería','Cádiz','Córdoba','Granada','Huelva','Jaén','Málaga','Sevilla'] },
  { id: 'aragon',               nombre: 'Aragón',                provincias: ['Huesca','Teruel','Zaragoza'] },
  { id: 'asturias',             nombre: 'Asturias',              provincias: ['Asturias'] },
  { id: 'baleares',             nombre: 'Illes Balears',         provincias: ['Balears','Baleares'] },
  { id: 'canarias',             nombre: 'Canarias',              provincias: ['Las Palmas','Santa Cruz de Tenerife'] },
  { id: 'cantabria',            nombre: 'Cantabria',             provincias: ['Cantabria'] },
  { id: 'castilla_la_mancha',   nombre: 'Castilla-La Mancha',    provincias: ['Albacete','Ciudad Real','Cuenca','Guadalajara','Toledo'] },
  { id: 'castilla_y_leon',      nombre: 'Castilla y León',       provincias: ['Ávila','Burgos','León','Palencia','Salamanca','Segovia','Soria','Valladolid','Zamora'] },
  { id: 'cataluna',             nombre: 'Cataluña',              provincias: ['Barcelona','Girona','Lleida','Tarragona'] },
  { id: 'comunidad_valenciana', nombre: 'Comunidad Valenciana',  provincias: ['Alicante','Castellón','Valencia'] },
  { id: 'extremadura',          nombre: 'Extremadura',           provincias: ['Badajoz','Cáceres'] },
  { id: 'galicia',              nombre: 'Galicia',               provincias: ['A Coruña','Lugo','Ourense','Pontevedra'] },
  { id: 'madrid',               nombre: 'Comunidad de Madrid',   provincias: ['Madrid'] },
  { id: 'murcia',               nombre: 'Región de Murcia',      provincias: ['Murcia'] },
  { id: 'navarra',              nombre: 'Navarra',               provincias: ['Navarra'] },
  { id: 'pais_vasco',           nombre: 'País Vasco',            provincias: ['Araba','Álava','Gipuzkoa','Guipúzcoa','Bizkaia','Vizcaya'] },
  { id: 'la_rioja',             nombre: 'La Rioja',              provincias: ['Rioja'] },
  { id: 'ceuta',                nombre: 'Ceuta',                 provincias: ['Ceuta'] },
  { id: 'melilla',              nombre: 'Melilla',               provincias: ['Melilla'] },
]

/** Normaliza para comparar sin acentos ni mayúsculas. */
const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()

const PROV_A_CCAA: Record<string, string> = (() => {
  const m: Record<string, string> = {}
  for (const c of COMUNIDADES) for (const p of c.provincias) m[norm(p)] = c.id
  return m
})()

/** Provincias (nombres oficiales) de una comunidad por id. `[]` si la id no existe. */
export function provinciasDeComunidad(ccaaId: string): string[] {
  return COMUNIDADES.find(c => c.id === ccaaId)?.provincias ?? []
}

/** CCAA (id) a la que pertenece una provincia; tolerante a acentos/mayúsculas. `undefined` si no se reconoce. */
export function comunidadDeProvincia(provincia: string): string | undefined {
  if (!provincia) return undefined
  return PROV_A_CCAA[norm(provincia)]
}

const TODAS_PROVINCIAS: string[] = COMUNIDADES.flatMap(c => c.provincias)

// Mapa CÓDIGO POSTAL (2 primeros dígitos) → provincia (nombre oficial del catálogo).
// Determinista y exhaustivo (52 provincias): la vía MÁS fiable para ubicar una
// licitación, porque el órgano de contratación SIEMPRE trae su dirección postal.
const CP_A_PROVINCIA: Record<string, string> = {
  '01':'Álava','02':'Albacete','03':'Alicante','04':'Almería','05':'Ávila','06':'Badajoz',
  '07':'Balears','08':'Barcelona','09':'Burgos','10':'Cáceres','11':'Cádiz','12':'Castellón',
  '13':'Ciudad Real','14':'Córdoba','15':'A Coruña','16':'Cuenca','17':'Girona','18':'Granada',
  '19':'Guadalajara','20':'Gipuzkoa','21':'Huelva','22':'Huesca','23':'Jaén','24':'León',
  '25':'Lleida','26':'Rioja','27':'Lugo','28':'Madrid','29':'Málaga','30':'Murcia','31':'Navarra',
  '32':'Ourense','33':'Asturias','34':'Palencia','35':'Las Palmas','36':'Pontevedra','37':'Salamanca',
  '38':'Santa Cruz de Tenerife','39':'Cantabria','40':'Segovia','41':'Sevilla','42':'Soria',
  '43':'Tarragona','44':'Teruel','45':'Toledo','46':'Valencia','47':'Valladolid','48':'Bizkaia',
  '49':'Zamora','50':'Zaragoza','51':'Ceuta','52':'Melilla',
}

/** Provincia a partir de un código postal español (acepta CP de 4-5 dígitos). `undefined` si no es válido. */
export function provinciaDeCP(cp: string | number | null | undefined): string | undefined {
  if (cp == null) return undefined
  const d = String(cp).replace(/\D/g, '').padStart(5, '0')
  if (d.length < 4) return undefined
  return CP_A_PROVINCIA[d.slice(0, 2)]
}

/**
 * Deduce la provincia (nombre oficial) mencionada en un texto libre — típicamente
 * el nombre del ÓRGANO de contratación ("Autoridad Portuaria de Sevilla",
 * "Ayuntamiento de Cádiz"). Útil cuando el feed PLACSP no trae la ubicación
 * estructurada. Compara por palabra completa, tolerante a acentos/mayúsculas.
 * `undefined` si no se reconoce ninguna.
 */
export function provinciaDeTexto(texto: string | null | undefined): string | undefined {
  if (!texto) return undefined
  const t = norm(texto)
  for (const p of TODAS_PROVINCIAS) {
    const np = norm(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp(`(^|[^a-z])${np}([^a-z]|$)`).test(t)) return p
  }
  return undefined
}
