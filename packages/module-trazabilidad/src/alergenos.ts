import type { Alergeno, Ingrediente, ElaboracionTraza } from './types.ts'

/** Nombre legible de cada alérgeno (para etiquetas/dossier). */
export const ALERGENO_NOMBRE: Record<Alergeno, string> = {
  gluten: 'Gluten',
  crustaceos: 'Crustáceos',
  huevos: 'Huevos',
  pescado: 'Pescado',
  cacahuetes: 'Cacahuetes',
  soja: 'Soja',
  lacteos: 'Lácteos',
  frutos_cascara: 'Frutos de cáscara',
  apio: 'Apio',
  mostaza: 'Mostaza',
  sesamo: 'Sésamo',
  sulfitos: 'Sulfitos',
  altramuces: 'Altramuces',
  moluscos: 'Moluscos',
}

// Reglas por palabra clave (minúsculas, sin tildes) → alérgeno.
// Pensadas para cocina española de catering; ampliables sin tocar la lógica.
const REGLAS: Array<{ alergeno: Alergeno; claves: string[] }> = [
  { alergeno: 'gluten', claves: ['trigo', 'tortilla de trigo', 'tortillas de trigo', 'harina', 'pan', 'hojaldre', 'coca', 'bao', 'canelon', 'samosa', 'croqueta', 'empanad', 'rebozad', 'cuscus', 'cebada', 'centeno', 'masa'] },
  { alergeno: 'crustaceos', claves: ['langostino', 'gamba', 'camaron', 'cangrejo', 'marisco', 'cigala', 'carabinero'] },
  { alergeno: 'huevos', claves: ['huevo', 'mayonesa', 'mahonesa', 'alioli', 'tortilla de patata', 'tortillas de patata', 'merengue'] },
  { alergeno: 'pescado', claves: ['atun', 'mojama', 'anchoa', 'pescado', 'salmon', 'bacalao', 'boqueron', 'merluza'] },
  { alergeno: 'cacahuetes', claves: ['cacahuete'] },
  { alergeno: 'soja', claves: ['soja', 'wakame'] },
  { alergeno: 'lacteos', claves: ['queso', 'nata', 'mantequilla', 'leche', 'crema', 'mozzarella', 'mozarella', 'cheddar', 'lacte', 'mahon', 'cabra', 'curado', 'parmesano', 'yogur'] },
  { alergeno: 'frutos_cascara', claves: ['nuez', 'nueces', 'almendra', 'avellana', 'pistacho', 'anacardo', 'piñon', 'pinon'] },
  { alergeno: 'apio', claves: ['apio'] },
  { alergeno: 'mostaza', claves: ['mostaza'] },
  { alergeno: 'sesamo', claves: ['sesamo', 'sesame', 'tahini'] },
  { alergeno: 'sulfitos', claves: ['sulfito', 'vino', 'vinagre'] },
  { alergeno: 'altramuces', claves: ['altramuz', 'altramuces'] },
  { alergeno: 'moluscos', claves: ['pulpo', 'calamar', 'mejillon', 'almeja', 'sepia', 'choco', 'berberecho', 'navaja'] },
]

function normalizar(s: string): string {
  // Quita tildes/diacríticos (combining marks U+0300–U+036F) y pasa a minúsculas.
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Detecta los alérgenos presentes en el texto de un ingrediente/elaboración. */
export function detectarAlergenos(texto: string): Alergeno[] {
  const n = normalizar(texto)
  const out: Alergeno[] = []
  for (const { alergeno, claves } of REGLAS) {
    if (claves.some(c => n.includes(c))) out.push(alergeno)
  }
  return out
}

/** Alérgenos de un ingrediente (por su nombre). */
export function alergenosIngrediente(ing: Ingrediente): Alergeno[] {
  return detectarAlergenos(ing.nombre)
}

/**
 * Alérgenos de una elaboración completa: une los de su nombre, sus ingredientes
 * y sus sub-elaboraciones (depende_de). Devuelve la lista única, en orden estable.
 */
export function alergenosElaboracion(elab: ElaboracionTraza): Alergeno[] {
  const set = new Set<Alergeno>()
  for (const a of detectarAlergenos(elab.nombre)) set.add(a)
  for (const ing of elab.ingredientes) for (const a of detectarAlergenos(ing.nombre)) set.add(a)
  for (const dep of elab.depende_de ?? []) for (const a of detectarAlergenos(dep)) set.add(a)
  // Orden estable según el catálogo
  return (Object.keys(ALERGENO_NOMBRE) as Alergeno[]).filter(a => set.has(a))
}
