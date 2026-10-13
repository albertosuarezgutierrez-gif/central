// Cuenta, por ficha relacionada, las pólizas VIVAS de OTRO tomador donde figura como
// interviniente (propietaria, conductora…). Figurar NO la convierte en cliente: es un
// dato aparte de `polizasVivas` (las que ella toma) y no entra en `esCarteraEnVigor`.
// Pura y sin BD: `cartera-relaciones.ts` le pasa lo ya leído en dos consultas por lote.

export function contarFiguras(args: {
  /** Filas de `poliza_intervinientes` de las fichas relacionadas. */
  filas: readonly { polizaId: string; clienteId: string | null }[]
  /** Pólizas vivas y sin fusionar (id → tomador). Las que no estén aquí no cuentan. */
  polizasVivas: readonly { id: string; clienteId: string }[]
}): Map<string, number> {
  const tomadorDe = new Map(args.polizasVivas.map((p) => [p.id, p.clienteId]))
  const porFicha = new Map<string, Set<string>>()
  for (const f of args.filas) {
    if (f.clienteId === null) continue
    const tomador = tomadorDe.get(f.polizaId)
    // Sin póliza viva, o ella misma es la tomadora: no es «figura en otra».
    if (tomador === undefined || tomador === f.clienteId) continue
    const s = porFicha.get(f.clienteId) ?? new Set<string>()
    s.add(f.polizaId)
    porFicha.set(f.clienteId, s)
  }
  return new Map([...porFicha].map(([id, s]) => [id, s.size]))
}
