/**
 * Monitor de cobertura CIMA (03/10/2026): «excluido a propósito» ≠ «sin leer».
 *
 * `medirCoberturaCampos` marca cada hoja NO leída que está en la lista de
 * exclusión de `cimaExtra` con su motivo (`RutaCampo.excluido`: «persona»,
 * «bancario»…). Aquí ese motivo se guarda en `cima_cobertura_campos.excluido_motivo`
 * (0106) para que el Monitor separe «descartado por privacidad» de «dato perdido».
 *
 * Regla: una hoja NO leída con motivo → se escribe el motivo; una hoja NO leída sin
 * motivo no se envía (conserva el anterior); una hoja LEÍDA → NULL (ya no está
 * «excluida»: p. ej. un extractor nuevo la lee). Solo nombres de ruta y motivos:
 * NUNCA valores del árbol.
 *
 * Tolera que la columna aún no exista (DDL pendiente de aplicar): entonces no
 * escribe nada y el medidor sigue contando como siempre.
 */
import type { RutaCampo } from "./field-coverage.ts";

// PORT central (fase 1, solo lógica pura): `escribirMotivosExclusion` (UPDATE sobre
// `cima_cobertura_campos` vía drizzle + `columna-opcional`) se queda en el CRM y se
// porta con la capa de BD (`src/db/`) en la fase 2. Aquí solo `motivosExclusion`.

export interface ClaveCobertura {
  correduriaId: string;
  tipoObjeto: string;
  codigoEntidad: string | null;
}

/**
 * PURA. Hojas NO leídas con motivo → `{ ruta, motivo }`; hojas LEÍDAS → `{ ruta,
 * motivo: null }` (limpia un motivo viejo). Las no leídas sin motivo no salen.
 */
export function motivosExclusion(
  rutas: readonly RutaCampo[],
): Array<{ ruta: string; motivo: string | null }> {
  const excluidas: Array<{ ruta: string; motivo: string | null }> = [];
  const leidas: Array<{ ruta: string; motivo: string | null }> = [];
  for (const r of rutas) {
    if (!r.hoja) continue;
    if (r.leido) leidas.push({ ruta: r.ruta, motivo: null });
    else if (r.excluido) excluidas.push({ ruta: r.ruta, motivo: r.excluido });
  }
  return [...excluidas, ...leidas];
}
