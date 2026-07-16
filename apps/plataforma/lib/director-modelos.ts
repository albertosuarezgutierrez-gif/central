// Núcleo PURO del Agente Director: el tipo del catálogo + el filtro que reduce el juego de
// modelos que el Director puede elegir según señales de la petición. Sin `@/` ni prisma → se
// testea con `node --test` (lib/director-modelos.test.ts). La lógica de COSTE vive en código
// (determinista y auditable), no en el LLM: el Director sigue eligiendo la mejor opción POR
// TAREA, pero solo dentro del subconjunto que este filtro permite.

export type CatalogoModelo = {
  id: string
  precio_in?: number   // USD por millón de tokens de entrada
  precio_out?: number  // USD por millón de tokens de salida
  contexto?: number    // ventana de contexto en tokens
  tags?: string[]
  eu?: boolean          // proveedor con hosting en la UE (RGPD)
}

export type FiltroModelos = {
  /** Gasto de hoy / límite diario (máximo entre global/app/cliente). 0 = sin presión. */
  ratioPresupuesto?: number
  /** Umbral blando: al superarlo, solo modelos baratos (default 0.8). */
  umbral?: number
  /** Techo de precio_out (USD/M) para considerar un modelo "barato" bajo presión (default 1.0). */
  precioOutMax?: number
  /** Contexto mínimo requerido por la petición (tokens estimados). 0 = sin requisito. */
  contextoMin?: number
  /** Exigir proveedor UE (datos sensibles). Solo se aplica si el catálogo ofrece alguno. */
  soloEu?: boolean
}

const precioOut = (m: CatalogoModelo) => m.precio_out ?? Infinity

/**
 * Elige del catálogo el modelo etiquetado con `tag` (p. ej. 'codigo' para el ejecutor de código,
 * 'plan' para el planificador). El cron `ia-director-refresh` etiqueta cada modelo con los tags de
 * su(s) categoría(s). Devuelve el primero que casa, o null si el catálogo no ofrece esa categoría.
 * Puro (sin BD/`@/`) → testeable con node --test; lo consume `ia-director.ts::elegirPorCategoria`.
 */
export function modeloPorTag(modelos: CatalogoModelo[], tag: string): CatalogoModelo | null {
  return modelos.find(m => (m.tags ?? []).includes(tag)) ?? null
}

/**
 * Reduce el catálogo a los modelos permitidos para esta petición, aplicando en cascada:
 *   F1 presupuesto → si ratio ≥ umbral, solo `precio_out ≤ precioOutMax`.
 *   F2 contexto    → si `contextoMin > 0`, solo modelos con ventana suficiente.
 *   F2 RGPD        → si `soloEu` y el catálogo TIENE modelos `eu`, solo esos (si no, no-op:
 *                    no se puede forzar lo que el catálogo no ofrece; la privacidad real la
 *                    garantiza el flag `privacidad` a nivel de proveedor en openrouterChatEx).
 * Cada filtro que dejaría el conjunto VACÍO se ignora (mejor un modelo subóptimo que ninguno).
 * Garantía final: nunca devuelve []; si todo falla, el más barato por `precio_out`.
 */
export function modelosPermitidos(modelos: CatalogoModelo[], filtro: FiltroModelos = {}): CatalogoModelo[] {
  if (!modelos.length) return modelos
  const {
    ratioPresupuesto = 0, umbral = 0.8, precioOutMax = 1.0, contextoMin = 0, soloEu = false,
  } = filtro

  let cand = modelos

  if (ratioPresupuesto >= umbral) {
    const baratos = cand.filter(m => precioOut(m) <= precioOutMax)
    if (baratos.length) cand = baratos
  }

  if (contextoMin > 0) {
    const grandes = cand.filter(m => (m.contexto ?? 0) >= contextoMin)
    if (grandes.length) cand = grandes
  }

  if (soloEu && cand.some(m => m.eu === true)) {
    cand = cand.filter(m => m.eu === true)
  }

  if (!cand.length) {
    const barato = [...modelos].sort((a, b) => precioOut(a) - precioOut(b))[0]
    return [barato]
  }
  return cand
}
