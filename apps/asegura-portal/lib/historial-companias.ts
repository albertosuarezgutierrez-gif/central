// El historial de un seguro cuando el cliente se cambia de compañía (Mapfre → Reale…): la cadena
// `sustituyeAId` recorrida en los dos sentidos, de la más antigua a la actual.
//
// 🚨 Se recorre SOLO sobre lo que este lector ve (`porId` sale de `titular()`), igual que
// `sustituyeA`: un eslabón que no ve corta la cadena ahí, no se salta ni se rellena.
//
// 🚨 La fecha del cambio es el INICIO de la nueva, no el vencimiento de la vieja: en el caso
// real (José Suárez, 09/2026) Reale empezó el 22/09 y Mapfre vencía el 24/09. `null` = la
// compañía no nos ha dado la fecha de efecto, y se dice así; no se rellena con el vencimiento.

export type EslabonHistorial = {
  id: string
  compania: string
  numeroPoliza: string | null
  /** Inicio de esta póliza. */
  desde: Date | null
  /** Día del cambio a la siguiente (inicio de la siguiente). `null` en la última o si no se sabe. */
  hasta: Date | null
}

type Nodo = { id: string; compania: string; numeroPoliza: string | null; fechaInicio: Date | null; sustituyeAId: string | null }

/** Cadena completa en la que está `id`, de la más antigua a la más reciente. `[]` = no hay cambio. */
export function historialCompanias(id: string, polizas: readonly Nodo[]): EslabonHistorial[] {
  const porId = new Map(polizas.map((p) => [p.id, p]))
  const sucesora = new Map<string, Nodo>()
  for (const p of polizas) {
    // Una vieja solo tiene UNA sustituta (guardián de `emision.ts`); si llegaran dos, la primera.
    if (p.sustituyeAId !== null && porId.has(p.sustituyeAId) && !sucesora.has(p.sustituyeAId)) sucesora.set(p.sustituyeAId, p)
  }
  const inicio = porId.get(id)
  if (inicio === undefined) return []

  // Hacia atrás hasta la primera; `vistos` corta un ciclo (dato corrupto) en vez de colgar la página.
  const vistos = new Set<string>([inicio.id])
  let primera = inicio
  for (let a = primera.sustituyeAId === null ? undefined : porId.get(primera.sustituyeAId); a && !vistos.has(a.id); ) {
    vistos.add(a.id)
    primera = a
    a = a.sustituyeAId === null ? undefined : porId.get(a.sustituyeAId)
  }

  const cadena: Nodo[] = []
  const enCadena = new Set<string>()
  for (let n: Nodo | undefined = primera; n && !enCadena.has(n.id); n = sucesora.get(n.id)) {
    enCadena.add(n.id)
    cadena.push(n)
  }
  if (cadena.length < 2) return []

  return cadena.map((n, i) => ({
    id: n.id,
    compania: n.compania,
    numeroPoliza: n.numeroPoliza,
    desde: n.fechaInicio,
    hasta: cadena[i + 1]?.fechaInicio ?? null,
  }))
}
