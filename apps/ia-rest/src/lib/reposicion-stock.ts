// Reposición de stock (lógica PURA, testeable con `node --test`).
// Sin red ni BD: la E/S (Supabase, Telegram) vive en el endpoint del cron.

export type MaterialBajo = {
  nombre: string
  cantidad_disponible: number
  stock_minimo: number
  proveedor_nombre?: string | null
  coste_reposicion?: number | null
}

/** Unidades que faltan para llegar al mínimo (nunca negativo). */
export function faltante(m: Pick<MaterialBajo, 'cantidad_disponible' | 'stock_minimo'>): number {
  return Math.max(0, m.stock_minimo - m.cantidad_disponible)
}

/** Coste estimado de reponer hasta el mínimo (Σ faltante × coste_reposicion). */
export function costeReposicion(materiales: MaterialBajo[]): number {
  return materiales.reduce((s, m) => s + faltante(m) * (m.coste_reposicion ?? 0), 0)
}

function fmtEur(n: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n)
}

/** Mensaje de aviso (Telegram) con los materiales bajo mínimo. */
export function formatAvisoStock(materiales: MaterialBajo[]): string {
  const lineas = materiales
    .slice()
    .sort((a, b) => faltante(b) - faltante(a))
    .map(m => {
      const prov = m.proveedor_nombre ? ` · pedir a ${m.proveedor_nombre}` : ''
      return `• ${m.nombre}: ${m.cantidad_disponible}/${m.stock_minimo} (faltan ${faltante(m)})${prov}`
    })
  const coste = costeReposicion(materiales)
  const cabecera = `📦 Stock bajo mínimo: ${materiales.length} material(es)`
  const pie = coste > 0 ? `\n\nReposición estimada: ${fmtEur(coste)}` : ''
  return `${cabecera}\n\n${lineas.join('\n')}${pie}`
}
