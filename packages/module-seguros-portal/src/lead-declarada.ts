// Una póliza que el cliente sube al portal, vista DESDE EL LADO DEL CORREDOR.
//
// ── Por qué existe (07/09/2026) ─────────────────────────────────────────────
//
// Medido ese día: `seguros.portal_poliza_declarada` solo la leían los partes y
// la exportación RGPD. **Ninguna pantalla de Alberto la miraba.** O sea, el
// cliente subía la póliza que tiene con otra compañía —con su vencimiento— y el
// corredor no se enteraba nunca. Todo lo que se afinaba del extractor alimentaba
// una tabla que no leía nadie.
//
// Esto NO es «la misma lista, en otro sitio». Cambia quién decide:
//
//   · En el portal, la declarada es del CLIENTE y sirve para que la vea junta
//     con las demás (`obligacion.ts` decide si además se le avisa).
//   · Aquí es una OPORTUNIDAD del corredor, y por eso lo que manda no es el
//     vencimiento sino la fecha en la que todavía se puede hacer algo.
//
// ── Las tres decisiones que fija, y por qué ninguna es cosmética ────────────
//
//  1. **La fecha útil es un mes antes.** `DIAS_PREAVISO_TOMADOR`, que es el
//     plazo del art. 22 LCS para oponerse a la prórroga. Una lista ordenada por
//     el vencimiento se trabaja treinta días tarde: cuando se llama, la póliza
//     ya se prorrogó sola.
//  2. **Tres estados, nunca una lista plana.** Una declarada nace con
//     `confirmadaPorUsuario: false` — sus fechas las adivinó un extractor. Si
//     esa fila se ve igual que una que el cliente revisó, se llama con una
//     fecha inventada y lo descubre el cliente, no el corredor. Es la regla de
//     la casa («un `no lo sé` no puede salir vestido de dato») aplicada a una
//     lista de ventas.
//  3. **La ventana pasada se MARCA, no se tira ni se adelanta un año.** Tirarla
//     pierde al cliente; moverla al año siguiente sería inventar una fecha que
//     nadie ha dicho: no consta que esa póliza se haya prorrogado, ni que siga
//     existiendo.
//
// ⚠️ Lo que este módulo NO decide, a propósito: si la póliza ya la lleva la
// casa. Eso es una pregunta a la BD (¿hay en la cartera de ese cliente una
// póliza viva con ese número?) y entra como `yaEnCartera`. Ponerlo aquí
// obligaría a adivinarlo por el nombre de la compañía, y trabajar con Generali
// no significa que ESTA póliza de Generali sea suya.
import { DIAS_PREAVISO_TOMADOR, fechaAccionable } from './obligacion.ts'

const MS_DIA = 86_400_000

function diaUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

export type EntradaLead = {
  id: string
  compania: string | null
  numeroPoliza: string | null
  ramo: string | null
  fechaVencimiento: Date | null
  /** `false` = lo leyó una máquina y nadie lo ha mirado. NO es «está mal». */
  confirmadaPorUsuario: boolean
  /** Lo decide quien consulta la BD, no este módulo (ver cabecera). */
  yaEnCartera: boolean
}

/**
 * `sin_fecha` manda sobre `sin_confirmar`: sin fecha no hay nada que contar
 * hacia atrás, así que es el reparo que hay que arreglar primero. Es el mismo
 * orden que ya aplica `reparoDeclarada()` en el lado del cliente, y se repite
 * aquí a propósito para que las dos pantallas no puedan discrepar.
 */
export type EstadoLead = 'confirmado' | 'sin_confirmar' | 'sin_fecha'

export function estadoLead(e: Pick<EntradaLead, 'fechaVencimiento' | 'confirmadaPorUsuario'>): EstadoLead {
  if (e.fechaVencimiento === null) return 'sin_fecha'
  return e.confirmadaPorUsuario ? 'confirmado' : 'sin_confirmar'
}

export type Lead = {
  id: string
  compania: string | null
  numeroPoliza: string | null
  ramo: string | null
  estado: EstadoLead
  fechaVencimiento: Date | null
  /** `null` cuando no hay vencimiento: no se fabrica una fecha para poder ordenar. */
  fechaAccionable: Date | null
  /**
   * `null` cuando no hay fecha O cuando la ventana ya pasó. Un número negativo
   * aquí se leería como un plazo vivo al revés, y en una lista de llamadas eso
   * es exactamente el error que se paga.
   */
  diasParaAccionable: number | null
  /** La fecha útil de ESTE año ya pasó. La póliza sigue ahí; la ventana no. */
  ventanaPasada: boolean
}

/** `null` = no es una oportunidad (hoy solo por ya estar en la cartera). */
export function leadDeclarada(e: EntradaLead, hoy: Date): Lead | null {
  if (e.yaEnCartera) return null

  const estado = estadoLead(e)
  const accionable = e.fechaVencimiento === null ? null : fechaAccionable(e.fechaVencimiento)
  const faltan =
    accionable === null
      ? null
      : Math.round((diaUtc(accionable).getTime() - diaUtc(hoy).getTime()) / MS_DIA)

  return {
    id: e.id,
    compania: e.compania,
    numeroPoliza: e.numeroPoliza,
    ramo: e.ramo,
    estado,
    fechaVencimiento: e.fechaVencimiento,
    fechaAccionable: accionable,
    diasParaAccionable: faltan !== null && faltan >= 0 ? faltan : null,
    ventanaPasada: faltan !== null && faltan < 0,
  }
}

/**
 * Por fecha útil ascendente; los que no tienen fecha, al FINAL — no fuera.
 * Un lead sin fecha sigue siendo un cliente con una póliza de otra compañía, y
 * dejarlo fuera de la lista lo convierte en un dato que solo existe en la BD.
 *
 * El desempate por `id` no es adorno: sin él, dos leads sin fecha pueden salir
 * en orden distinto en cada carga y la lista «se mueve» entre visitas sin que
 * haya cambiado nada.
 */
export function ordenarLeads(leads: readonly Lead[]): Lead[] {
  return [...leads].sort((a, b) => {
    const fa = a.fechaAccionable?.getTime() ?? Number.POSITIVE_INFINITY
    const fb = b.fechaAccionable?.getTime() ?? Number.POSITIVE_INFINITY
    return fa === fb ? a.id.localeCompare(b.id) : fa - fb
  })
}

export { DIAS_PREAVISO_TOMADOR }
