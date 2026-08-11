// apps/plataforma/lib/reescritura-guardia.ts
// Guardia PURA de la reescritura que devuelve el coder BARATO del ejecutor (/api/ai/ejecutar).
// Un modelo barato a veces TRUNCA el archivo o BORRA código existente (caso real: qwen-2.5-coder
// borró la función eur() y dejó el fichero cortado en "// (2."). Estas comprobaciones cazan esos
// estropicios OBVIOS para NO aplicarlos (y que el ejecutor reintente con un modelo mejor). NO
// garantizan que el código sea CORRECTO — eso es la revisión humana; solo evitan lo destructivo.
//
// Módulo puro (sin BD ni '@/'), testeable con node --test.

export type ChequeoReescritura = { ok: boolean; motivo?: string }

/**
 * Nombres exportados de nivel superior de un archivo TS/JS. Cubre:
 *   export function NAME / export async function NAME
 *   export const|let|var NAME
 *   export class|type|interface|enum NAME
 *   export default function NAME
 * (No cubre `export { a, b }`, que se contempla aparte por el conjunto de identificadores.)
 */
export function exportsDe(codigo: string): string[] {
  const out = new Set<string>()
  const re = /\bexport\s+(?:default\s+)?(?:async\s+)?(?:function|const|let|var|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(codigo)) !== null) out.add(m[1])
  // export { a, b as c } → nombres EXPUESTOS (el alias tras 'as', si lo hay).
  const reLlaves = /\bexport\s*\{([^}]*)\}/g
  while ((m = reLlaves.exec(codigo)) !== null) {
    for (const trozo of m[1].split(',')) {
      const t = trozo.trim()
      if (!t) continue
      const asM = t.match(/\bas\s+([A-Za-z_$][\w$]*)/)
      const nombre = asM ? asM[1] : t.split(/\s+/)[0]
      if (/^[A-Za-z_$][\w$]*$/.test(nombre)) out.add(nombre)
    }
  }
  return [...out]
}

/**
 * ¿Es válida la reescritura `nuevo` de `original`? Rechaza lo destructivo:
 *  1. salida vacía;
 *  2. truncamiento catastrófico (mucho más corta que el original);
 *  3. DESAPARICIÓN de exports que existían (el coder debía añadir/modificar, no borrar la API pública).
 *
 * Nota: una tarea legítima de BORRAR un export daría un falso rechazo — por diseño, el ejecutor es
 * para trabajo mecánico/aditivo; los borrados de API se hacen a mano. Fallar cerrado es lo seguro:
 * nunca aplica un diff que se cargó código.
 */
export function validarReescritura(original: string, nuevo: string): ChequeoReescritura {
  const orig = (original ?? '').trim()
  const n = (nuevo ?? '').trim()
  if (!n) return { ok: false, motivo: 'salida vacía' }
  if (orig.length > 0 && n.length < orig.length * 0.5) {
    return { ok: false, motivo: `salida demasiado corta (${n.length} vs ${orig.length} chars): posible truncamiento` }
  }
  const antes = exportsDe(orig)
  const despues = new Set(exportsDe(n))
  const perdidos = antes.filter(e => !despues.has(e))
  if (perdidos.length) {
    return { ok: false, motivo: `desaparecen exports existentes: ${perdidos.join(', ')}` }
  }
  return { ok: true }
}
