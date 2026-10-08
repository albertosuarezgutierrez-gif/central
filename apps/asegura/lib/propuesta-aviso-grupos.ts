// Lo PURO del aviso de una propuesta de escenarios por TOMADOR (07/10/2026): qué grupos ya salieron, qué
// escenarios confirma cada botón de WhatsApp y qué estado tiene el conjunto. Sin BD, para que `node --test`
// lo pruebe de verdad (`propuesta-escenarios.ts` importa Prisma y no se puede cargar en un cepo).

type ConTomador = { presupuestoId: string; numero: number; tomador: { clienteId: string } }

/** Los escenarios de UN tomador (identidad = su ficha). `[]` = ese tomador no está en la propuesta. */
export function escenariosDelTomador<T extends ConTomador>(es: readonly T[], clienteId: string): T[] {
  return es.filter((x) => x.tomador.clienteId === clienteId)
}

/**
 * Separa los grupos cuyo correo YA salió en un envío anterior (todos sus escenarios tienen el sello de esta
 * propuesta) de los que faltan. Al que ya salió no se le reenvía ni se le rota la llave.
 */
export function separarYaEnviados<G extends { escenarios: ReadonlyArray<{ presupuestoId: string }> }>(
  grupos: readonly G[], enviados: ReadonlySet<string>,
): { pendientes: G[]; yaEnviados: G[] } {
  const pendientes: G[] = []
  const yaEnviados: G[] = []
  for (const g of grupos) {
    const salio = g.escenarios.length > 0 && g.escenarios.every((x) => enviados.has(x.presupuestoId))
    ;(salio ? yaEnviados : pendientes).push(g)
  }
  return { pendientes, yaEnviados }
}

/**
 * Estado del aviso del lote a partir de sus grupos. `avisado_at` del lote se escribe SOLO cuando han salido
 * TODOS los grupos: con uno a medias, la propuesta no se pinta como avisada.
 */
export function estadoDelLote(grupos: ReadonlyArray<{ estado: 'enviado' | 'enlace' | 'error' }>): { estado: 'ok' | 'parcial' | 'error'; marcarAvisado: boolean } {
  const bien = grupos.filter((g) => g.estado !== 'error').length
  const todos = grupos.length > 0 && bien === grupos.length
  return { estado: todos ? 'ok' : bien === 0 ? 'error' : 'parcial', marcarAvisado: todos }
}
