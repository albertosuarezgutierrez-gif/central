// Parte de una pasada del escaneo de facturas — el texto que acaba en
// `agente_latidos.detalle` y, cuando el vigía avisa, en el Telegram de Alberto.
//
// 🚨 Por qué existe: «0 factura(s) nueva(s)» era la MISMA frase para dos cosas
// distintas (02/08/2026). El escaneo descartaba en silencio los correos cuya
// extracción por IA fallaba (`if (!importe) continue`), así que un buzón con dos
// facturas que la IA no supo leer daba exactamente el mismo parte que un buzón
// vacío. Es la regla de la casa un nivel más abajo: un dato que NO se ha podido
// mirar no puede contarse como «mirado y no hay».
//
// Módulo PURO (sin '@/' ni IO) → testeable con `node --test`.

export interface ConteoEscaneo {
  /** Facturas nuevas insertadas en esta pasada. */
  nuevas: number
  /** Candidatos que NO se pudieron leer (fallo técnico de extracción o del PDF). */
  sinLeer: number
  /** Candidatos leídos y descartados con criterio (no eran factura / sin importe). */
  descartados: number
  /** Correos que no dio tiempo a mirar (presupuesto agotado); se retoman mañana. */
  pendientes: number
}

const plural = (n: number, sing: string, plur: string) => `${n} ${n === 1 ? sing : plur}`

/**
 * Devuelve el parte legible de la pasada. Si algo quedó sin leer, el parte lo dice
 * DELANTE y con aviso: es lo que impide leer el «0 nuevas» como «no hay facturas».
 */
export function detalleEscaneo(c: ConteoEscaneo): string {
  const partes: string[] = [plural(c.nuevas, 'factura nueva', 'facturas nuevas')]

  if (c.sinLeer > 0) {
    partes.push(
      `⚠️ ${plural(c.sinLeer, 'correo sin poder leer', 'correos sin poder leer')} ` +
      '(extracción fallida; etiquetados en Gmail para reintentar) — ' +
      'el recuento de arriba NO es «no hay facturas»',
    )
  }
  if (c.descartados > 0) {
    partes.push(`${plural(c.descartados, 'descartado', 'descartados')} (leídos, no eran factura)`)
  }
  if (c.pendientes > 0) {
    partes.push(`${plural(c.pendientes, 'correo', 'correos')} sin mirar por presupuesto de tiempo`)
  }

  return partes.join(' · ')
}

/**
 * ¿Se puede afirmar «no hay facturas nuevas» a partir de esta pasada? Solo si de
 * verdad se miró todo: nada sin leer y nada sin mirar. Lo consumen el parte y
 * cualquier pantalla que quiera hablar en nombre del escaneo.
 */
export function recuentoFiable(c: ConteoEscaneo): boolean {
  return c.sinLeer === 0 && c.pendientes === 0
}
