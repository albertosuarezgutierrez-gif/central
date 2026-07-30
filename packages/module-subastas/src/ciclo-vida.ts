// ────────────────────────────────────────────────────────────────────────────
// CICLO DE VIDA de una subasta. PURO.
//
// Alberto (30/07/2026): «las subastas ya pasadas, borrarlas y no tenerlas en
// cuenta… lo que comentaste de que hay subastas que salen varias veces, ¿no?».
// La segunda parte de la frase es la clave, y por eso NO se borran:
//
//   · Una finca que quedó DESIERTA vuelve a subasta con el tipo rebajado. Si se
//     borra la convocatoria vieja, `detectarReapariciones` no tiene con qué
//     comparar y se pierde la mejor señal del canal (un inmueble ya estudiado un
//     30% más abajo).
//   · Los resultados de las concluidas son la ÚNICA fuente de calibración real
//     (a qué % del tipo se remata de verdad, y si el mercado castiga las cargas).
//     Borrarlas es borrar la memoria del agente.
//
// Así que se distingue MOLESTAR de RECORDAR:
//   · `vigente`   → puede pujarse; sale en la lista y puede avisar.
//   · `cerrada`   → ya pasó su fecha, pero aún se le puede capturar el resultado.
//   · `archivada` → pasó y ya se sabe (o nunca se sabrá) qué ocurrió. Fuera de la
//                   vista y del radar, DENTRO de la base como histórico.
//
// Lo que sí se borra es la fila de la BANDEJA de avisos (`subastas_radar`): esa
// es efímera por naturaleza, no es el histórico.
// ────────────────────────────────────────────────────────────────────────────

export type EstadoCiclo = 'vigente' | 'cerrada' | 'archivada'

export interface EntradaCiclo {
  /** Fecha de conclusión; `null` = sin fecha conocida. */
  fechaFin: string | null
  /** Resultado capturado de la ficha («adjudicada», «desierta»…). */
  resultado: string | null
  /** Referencia para calcular «ahora» (inyectable para poder testear). */
  ahora?: Date
}

/**
 * Cuántos días se sigue intentando capturar el resultado de una subasta cerrada
 * antes de archivarla sin él. El portal tarda en publicar la adjudicación, pero
 * pasado un par de meses ya no va a aparecer.
 */
export const DIAS_PARA_ARCHIVAR = 60

/**
 * Una subasta sin fecha de conclusión NO se archiva por tiempo: puede ser un lote
 * de adquisición directa de la Junta, que no tiene plazo de cierre publicado.
 */
export function estadoCiclo(e: EntradaCiclo): EstadoCiclo {
  const ahora = e.ahora ?? new Date()
  if (!e.fechaFin) return 'vigente'

  const fin = new Date(e.fechaFin)
  if (Number.isNaN(fin.getTime())) return 'vigente'
  if (fin.getTime() > ahora.getTime()) return 'vigente'

  // Ya pasó: con resultado conocido no hay nada más que esperar.
  if (e.resultado) return 'archivada'

  const dias = (ahora.getTime() - fin.getTime()) / 86_400_000
  return dias > DIAS_PARA_ARCHIVAR ? 'archivada' : 'cerrada'
}

/** ¿Debe salir en la lista y poder avisar? */
export function esVigente(e: EntradaCiclo): boolean {
  return estadoCiclo(e) === 'vigente'
}

/**
 * ¿Se conserva para el aprendizaje? SIEMPRE. Está aquí como función explícita
 * para que quede escrito en el código: si alguna vez se añade una limpieza de
 * histórico, tiene que romper este test.
 */
export function seConservaParaAprender(_e: EntradaCiclo): boolean {
  return true
}
