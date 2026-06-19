// Dietas de comensales puntuales: avisos de seguridad y mapeo dieta → alérgenos.
// Lógica PURA (sin BD/LLM). Se apoya en la detección de alérgenos de `alergenos.ts`.

import type { Alergeno } from './types.ts'
import type { EventoInput, FichaCatalogo } from './generar.ts'
import { detectarAlergenos } from './alergenos.ts'

/**
 * Alérgenos que un plato NO debe contener para cubrir una dieta dada.
 * Mapeo conservador para catering español; ampliable sin tocar la lógica.
 * (Etiqueta libre → se normaliza a minúsculas sin tildes.)
 */
export function alergenosIncompatibles(dieta: string): Alergeno[] {
  const d = dieta.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const out = new Set<Alergeno>()
  if (d.includes('gluten') || d.includes('celiac')) out.add('gluten')
  if (d.includes('lactosa') || d.includes('lacteo') || d.includes('leche')) out.add('lacteos')
  if (d.includes('huevo')) out.add('huevos')
  if (d.includes('marisco')) { out.add('crustaceos'); out.add('moluscos') }
  if (d.includes('pescado')) out.add('pescado')
  if (d.includes('frutos secos') || d.includes('frutos de cascara') || d.includes('cascara')) out.add('frutos_cascara')
  if (d.includes('cacahuete')) out.add('cacahuetes')
  if (d.includes('soja')) out.add('soja')
  if (d.includes('sesamo')) out.add('sesamo')
  if (d.includes('mostaza')) out.add('mostaza')
  if (d.includes('apio')) out.add('apio')
  if (d.includes('sulfito')) out.add('sulfitos')
  // Vegano: sin productos de origen animal → marca los alérgenos animales detectables.
  if (d.includes('vegano')) { out.add('lacteos'); out.add('huevos'); out.add('pescado'); out.add('crustaceos'); out.add('moluscos') }
  // Vegetariano: sin carne/pescado → alérgenos detectables: pescado/marisco.
  else if (d.includes('vegetarian')) { out.add('pescado'); out.add('crustaceos'); out.add('moluscos') }
  return [...out]
}

/** Un aviso de seguridad sobre un grupo de dieta de un evento. */
export interface AvisoDieta {
  tipo: 'alergeno_incompatible' | 'comensales_exceden_pax'
  evento_id: string
  receta_id: string
  dieta: string
  mensaje: string
  alergenos?: Alergeno[]   // solo en 'alergeno_incompatible'
}

/**
 * Avisos de seguridad de las dietas declaradas en los eventos:
 *  (a) el plato marcado para una dieta contiene un alérgeno incompatible
 *      (p. ej. dieta "sin gluten" pero el plato detecta `gluten`);
 *  (b) un grupo de dieta tiene más comensales que el PAX del evento.
 */
export function avisosDietas(eventos: EventoInput[], catalogo: FichaCatalogo[]): AvisoDieta[] {
  const fichaPorId = new Map(catalogo.map(f => [f.id, f]))
  const avisos: AvisoDieta[] = []
  for (const ev of eventos) {
    for (const g of ev.dietas ?? []) {
      if (g.comensales > ev.pax) {
        avisos.push({
          tipo: 'comensales_exceden_pax', evento_id: ev.id, receta_id: g.receta_id, dieta: g.dieta,
          mensaje: `«${g.dieta}»: ${g.comensales} comensales superan el PAX del evento (${ev.pax}).`,
        })
      }
      const ficha = fichaPorId.get(g.receta_id)
      if (!ficha) continue
      const presentes = new Set<Alergeno>()
      for (const a of detectarAlergenos(ficha.nombre)) presentes.add(a)
      for (const ing of ficha.ingredientes) for (const a of detectarAlergenos(ing.nombre)) presentes.add(a)
      for (const dep of ficha.depende_de ?? []) for (const a of detectarAlergenos(dep)) presentes.add(a)
      const choque = alergenosIncompatibles(g.dieta).filter(a => presentes.has(a))
      if (choque.length) {
        avisos.push({
          tipo: 'alergeno_incompatible', evento_id: ev.id, receta_id: g.receta_id, dieta: g.dieta,
          alergenos: choque,
          mensaje: `«${ficha.nombre}» marcado para «${g.dieta}» contiene: ${choque.join(', ')}.`,
        })
      }
    }
  }
  return avisos
}
