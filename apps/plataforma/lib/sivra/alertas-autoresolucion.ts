// lib/sivra/alertas-autoresolucion.ts — cerrar sola la alerta cuyo problema ya no existe.
//
// POR QUÉ (04/09/2026). `pricing_alerts` no tenía ningún camino de cierre automático: `pushAlert`
// no recrea un aviso mientras siga abierto, pero NADIE lo marca `resuelta` cuando la condición
// desaparece. Resultado medido ese día: **107 alertas abiertas**, de ellas **54 de tipo
// `precio_revertido`** acumuladas desde el 10/08… y **51 de esas 54 ya cuadraban** (el precio de
// Smoobu había vuelto a coincidir con el nuestro). El Telegram enseñaba 12 rotando, casi todas
// muertas, encabezadas por un texto que además señala al sitio equivocado («alguien lo ha pisado»).
//
// Es la regla de los vigilantes del CLAUDE.md por su cara menos evidente: un aviso deja de
// distinguir el problema del comportamiento normal no solo cuando grita de más, sino cuando NO SE
// CALLA al arreglarse. Lo que entrena a ignorar el canal es la pila de avisos muertos.
//
// 🚨 LO QUE ESTE MÓDULO NO HACE, Y ES SU RAZÓN DE SER: no cierra nada por no encontrarlo. Una
// alerta se resuelve SOLO si se ha podido comprobar que su condición ya no se cumple. Que una
// fecha no aparezca hoy entre los hits significa una de dos cosas —«ya no pasa» o «no he podido
// mirarlo»— y colapsarlas cerraría en silencio avisos vivos el día que falle una lectura. Por eso
// hace falta la lista EXPLÍCITA de pisos comprobables: es la diferencia entre resolver y perder.
//
// Módulo PURO (sin BD ni `@/`), testeable con `node --test`.

/** Tipos cuya condición se re-evalúa entera en CADA pasada del guardián, fecha a fecha. */
export const TIPOS_AUTORESOLUBLES = new Set(['precio_revertido'])

export type AlertaAbierta = {
  id: string
  tipo: string
  property_id: string | null
  fecha_ref: string | null
}

export type DecisionAutoResolucion = {
  /** ids que se marcan resueltos: comprobados y sin problema hoy */
  resolver: string[]
  /** las que NO se tocan, con el motivo — un cierre mudo sería indistinguible de una pérdida */
  retenidas: { id: string; motivo: string }[]
}

export const clave = (propertyId: string, fecha: string) => `${propertyId}|${fecha}`

export function decidirAutoResolucion(i: {
  abiertas: AlertaAbierta[]
  /** `${property_id}|${fecha_ref}` que HOY siguen dando el problema */
  hitsActuales: Set<string>
  /** pisos cuyo dato de hoy SÍ se ha podido leer; el resto no se juzga */
  pisosComprobables: Set<string>
  tipos?: Set<string>
}): DecisionAutoResolucion {
  const tipos = i.tipos ?? TIPOS_AUTORESOLUBLES
  const resolver: string[] = []
  const retenidas: { id: string; motivo: string }[] = []

  for (const a of i.abiertas ?? []) {
    if (!tipos.has(a.tipo)) {
      retenidas.push({ id: a.id, motivo: `tipo ${a.tipo} no se re-evalúa entero en cada pasada` })
      continue
    }
    // Sin piso o sin fecha no hay condición que volver a comprobar: se deja a mano.
    if (!a.property_id || !a.fecha_ref) {
      retenidas.push({ id: a.id, motivo: 'sin piso o sin fecha con la que comprobarla' })
      continue
    }
    if (!i.pisosComprobables.has(a.property_id)) {
      retenidas.push({ id: a.id, motivo: 'hoy no se ha podido leer el precio vivo de ese piso' })
      continue
    }
    if (i.hitsActuales.has(clave(a.property_id, a.fecha_ref))) {
      retenidas.push({ id: a.id, motivo: 'sigue ocurriendo' })
      continue
    }
    resolver.push(a.id)
  }
  return { resolver, retenidas }
}

/**
 * Parte legible. Un cierre en masa tiene que poder distinguirse de una pasada normal sin abrir la
 * BD, y las retenidas por «no se ha podido comprobar» tienen que verse APARTE de las que siguen
 * vivas: son un hueco de lectura, no un problema del precio.
 */
export function detalleAutoResolucion(d: DecisionAutoResolucion): string | null {
  const sinComprobar = d.retenidas.filter(r => r.motivo.startsWith('hoy no se ha podido')).length
  if (d.resolver.length === 0 && sinComprobar === 0) return null
  const trozos: string[] = []
  if (d.resolver.length) trozos.push(`✅ ${d.resolver.length} alerta(s) cerrada(s) sola(s)`)
  if (sinComprobar) trozos.push(`❔ ${sinComprobar} sin poder comprobar (piso sin precio vivo hoy)`)
  return trozos.join(' · ')
}
