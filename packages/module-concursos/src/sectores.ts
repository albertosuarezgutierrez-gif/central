// ────────────────────────────────────────────────────────────────────────────
// Catálogo de sectores (CPV) — PURO. Traduce "sectores" con nombre claro en
// español a prefijos de código CPV (Vocabulario Común de Contratos Públicos),
// para que el usuario busque "su sector" sin saberse los códigos. Determinista.
//
// Cada sector apunta a una o varias divisiones CPV (los 2 primeros dígitos),
// que el filtro del buscador/radar usa por prefijo (`cpv LIKE '90%'`).
// ────────────────────────────────────────────────────────────────────────────

export interface Sector {
  id: string        // identificador estable (no traducir)
  nombre: string    // etiqueta para la UI (es-ES)
  cpv: string[]     // prefijos CPV (divisiones de 2 dígitos) que cubre
}

/**
 * Sectores curados orientados a PYME (los más habituales en licitación), con su
 * mapeo a divisiones CPV. No es exhaustivo del CPV completo: agrupa de forma
 * útil. Un sector puede cubrir varias divisiones.
 */
export const SECTORES: Sector[] = [
  { id: 'limpieza',        nombre: 'Limpieza y residuos',                 cpv: ['90'] },
  { id: 'mantenimiento',   nombre: 'Mantenimiento y reparaciones',        cpv: ['50'] },
  { id: 'obras',           nombre: 'Obras y construcción',                cpv: ['45'] },
  { id: 'fontaneria',      nombre: 'Fontanería',                          cpv: ['4533'] },
  { id: 'materiales',      nombre: 'Materiales de construcción',          cpv: ['44'] },
  { id: 'jardineria',      nombre: 'Jardinería y agricultura',            cpv: ['77', '03'] },
  { id: 'catering',        nombre: 'Catering y hostelería',               cpv: ['55'] },
  { id: 'alimentacion',    nombre: 'Alimentación y bebidas',              cpv: ['15'] },
  { id: 'seguridad',       nombre: 'Seguridad y vigilancia',              cpv: ['797'] },
  { id: 'informatica',     nombre: 'Informática y software',              cpv: ['72', '48'] },
  { id: 'electronica',     nombre: 'Equipos informáticos y electrónicos', cpv: ['30', '32'] },
  { id: 'telecom',         nombre: 'Telecomunicaciones',                  cpv: ['64'] },
  { id: 'ingenieria',      nombre: 'Ingeniería y arquitectura',           cpv: ['71'] },
  { id: 'consultoria',     nombre: 'Consultoría y servicios empresariales', cpv: ['79'] },
  { id: 'formacion',       nombre: 'Educación y formación',               cpv: ['80'] },
  { id: 'sanidad',         nombre: 'Salud y servicios sociales',          cpv: ['85'] },
  { id: 'material_medico', nombre: 'Material sanitario y farmacéutico',   cpv: ['33'] },
  { id: 'transporte',      nombre: 'Transporte y logística',              cpv: ['60', '63'] },
  { id: 'vehiculos',       nombre: 'Vehículos y automoción',              cpv: ['34'] },
  { id: 'energia',         nombre: 'Energía y combustibles',              cpv: ['09'] },
  { id: 'agua',            nombre: 'Agua y suministros públicos',         cpv: ['41', '65'] },
  { id: 'mobiliario',      nombre: 'Mobiliario y equipamiento',           cpv: ['39'] },
  { id: 'textil',          nombre: 'Textil, ropa y calzado',              cpv: ['18'] },
  { id: 'imprenta',        nombre: 'Imprenta y publicaciones',            cpv: ['22'] },
  { id: 'publicidad',      nombre: 'Publicidad y comunicación',           cpv: ['7934', '924'] },
  { id: 'eventos_cultura', nombre: 'Cultura, ocio y deporte',             cpv: ['92', '374'] },
  { id: 'maquinaria',      nombre: 'Maquinaria y equipos industriales',   cpv: ['42', '43'] },
  { id: 'laboratorio',     nombre: 'Equipos de laboratorio y ópticos',    cpv: ['38'] },
  { id: 'quimicos',        nombre: 'Productos químicos',                  cpv: ['24'] },
  { id: 'financiero',      nombre: 'Servicios financieros y seguros',     cpv: ['66'] },
  { id: 'inmobiliario',    nombre: 'Servicios inmobiliarios',             cpv: ['70'] },
  { id: 'idi',             nombre: 'Investigación y desarrollo (I+D)',    cpv: ['73'] },
  { id: 'instalaciones',   nombre: 'Instalaciones y montajes',            cpv: ['51'] },
]

/** Índice id→sector para acceso rápido. */
const POR_ID: Record<string, Sector> = Object.fromEntries(SECTORES.map(s => [s.id, s]))

/**
 * Devuelve los prefijos CPV de los sectores indicados (por id), sin duplicados.
 * Ignora ids desconocidos. Ej.: `cpvDeSectores(['limpieza','jardineria'])` →
 * `['90','77','03']`.
 */
export function cpvDeSectores(ids: string[]): string[] {
  const out: string[] = []
  for (const id of ids) {
    const s = POR_ID[id]
    if (!s) continue
    for (const p of s.cpv) if (!out.includes(p)) out.push(p)
  }
  return out
}
