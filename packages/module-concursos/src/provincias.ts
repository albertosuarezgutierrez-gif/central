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
