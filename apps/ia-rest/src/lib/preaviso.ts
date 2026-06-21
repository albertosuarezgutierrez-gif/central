// lib/preaviso.ts — lógica pura del preaviso de marcha (sin I/O → testeable)

export type PlatoLinea = { nombre: string; cantidad: number }

/** Agrupa items por nombre y suma cantidades, conservando el orden de aparición.
 *  Ignora items sin nombre (o vacíos tras trim). */
export function resumenPlatos(items: PlatoLinea[]): PlatoLinea[] {
  const orden: string[] = []
  const acc = new Map<string, number>()
  for (const it of items ?? []) {
    const nombre = (it?.nombre ?? '').trim()
    if (!nombre) continue
    if (!acc.has(nombre)) orden.push(nombre)
    acc.set(nombre, (acc.get(nombre) ?? 0) + (it?.cantidad ?? 0))
  }
  return orden.map((nombre) => ({ nombre, cantidad: acc.get(nombre)! }))
}

/** Texto humano del aviso. Si no hay platos, mensaje genérico. */
export function textoPreaviso(mesa: string, platos: PlatoLinea[]): string {
  if (!platos || platos.length === 0) return `Mesa ${mesa}: va a salir comida, prepárate`
  const lista = platos.map((p) => `${p.cantidad} ${p.nombre}`).join(', ')
  return `Mesa ${mesa}: salen ${lista}`
}
