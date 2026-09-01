// lib/telegram/regla.ts — la REGLA del interruptor del panel /telegram, PURA.
//
// Vive aparte de `preferencias.ts` a propósito: ese módulo importa `@/lib/db` (Prisma) y el
// alias `@/` no lo resuelve `node --test`, así que la regla no se podría probar desde ahí.
// Mismo patrón que el resto del repo: la decisión en un módulo puro y testeado, el acceso a
// BD en el que la consume.
import { esCritico } from './catalogo.ts'

/**
 * ¿Sale este aviso?
 * - `prefs === null` = no se pudieron leer las preferencias ⇒ **fail-open**: el aviso SALE.
 *   Un fallo de red o una migración sin aplicar no puede convertirse en silencio.
 * - Sin fila para el id = activo (un aviso nuevo llega hasta que se decida callarlo).
 * - Un aviso crítico sale SIEMPRE, aunque exista una fila que lo silencie.
 */
export function resolverActivo(id: string, prefs: ReadonlyMap<string, boolean> | null): boolean {
  if (esCritico(id)) return true
  if (!prefs) return true
  return prefs.get(id) ?? true
}
