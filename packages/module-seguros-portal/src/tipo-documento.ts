// Qué documento ha subido el cliente — y por qué eso decide si hay prima anual.
//
// ── El caso que lo destapó (07/09/2026) ────────────────────────────────────
//
// Alberto subió un PDF de auto y el portal guardó `prima_anual = 55,85 €`. Su
// diagnóstico, que es el bueno: «es porque es un suplemento (cambio de
// vehículo)». O sea, la IA NO leyó mal el número: leyó bien un número que no es
// una prima anual y lo metió en el campo de la prima anual.
//
// Un suplemento no es una póliza: es una MODIFICACIÓN de una póliza viva, y su
// importe es la regularización del periodo que queda, no lo que se paga al año.
// Un recibo tampoco: es un cobro fraccionado. Los tres documentos se parecen —
// llevan la misma compañía, el mismo número de póliza y una cifra en euros— y
// por eso el extractor los trataba igual.
//
// 🚨 Es el fallo que el CLAUDE.md de la raíz llama «el dato que SÍ está pero se
// lee mal», y avisa de que es PEOR que un hueco: no hay nada que delate el
// error, sale un número plausible. 55,85 € al año de auto es raro y por eso se
// notó; 340 € habría pasado sin que nadie levantara la ceja, y sobre esa cifra
// se decide si un seguro está caro.
//
// ── La regla, y por qué NO es simétrica ────────────────────────────────────
//
// Se anula la prima SOLO cuando sabemos que el documento no es una póliza:
// `suplemento` y `recibo`. Con `otro` o con `null` NO se toca nada, y eso es
// deliberado: `otro` es un valor de cajón —el «no he sabido decirlo» de un
// clasificador— y `null` es que no contestó. Anular con ellos convertiría cada
// duda del modelo en una prima perdida, que es cambiar un error por otro.
//
// La asimetría tiene además la dirección buena: si el modelo se equivoca y
// llama `suplemento` a una póliza de verdad, el resultado es `null` = «no lo
// sabemos», que la pantalla pinta como «—» y la persona corrige a mano. El
// error contrario —dar por anual el importe de un suplemento— no se corrige
// porque nadie se entera.

/** Los cuatro. `otro` es el cajón: existe para que el modelo no fuerce uno de los tres. */
export const TIPOS_DOCUMENTO = ['poliza', 'suplemento', 'recibo', 'otro'] as const
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number]

/**
 * El tipo leído, o `null` si no viene o no es del vocabulario.
 *
 * Un valor fuera de la lista NO cae a `otro`: cae a `null`. Son cosas
 * distintas — «ha dicho que no sabe» y «ha dicho algo que no entendemos»— y
 * ninguna de las dos autoriza a tocar la prima.
 */
export function normalizarTipoDocumento(bruto: unknown): TipoDocumento | null {
  if (typeof bruto !== 'string') return null
  const v = bruto.trim().toLowerCase()
  return (TIPOS_DOCUMENTO as readonly string[]).includes(v) ? (v as TipoDocumento) : null
}

/**
 * ¿Puede el importe de este documento guardarse como PRIMA ANUAL?
 *
 * `true` mientras no conste lo contrario: solo un `suplemento` o un `recibo`
 * —nombrados, no adivinados— lo impiden.
 */
export function importeEsPrimaAnual(tipo: TipoDocumento | null): boolean {
  return tipo !== 'suplemento' && tipo !== 'recibo'
}

/**
 * Lo que se le dice a la persona cuando el documento no es la póliza. `null`
 * cuando no hay nada que advertir.
 *
 * Se nombra el documento y se dice qué se ha hecho con el importe: callarlo
 * dejaría un «—» en la prima justo después de subir un papel que SÍ traía una
 * cifra, y eso se lee como un fallo de lectura.
 */
export function avisoDocumentoNoPoliza(tipo: TipoDocumento | null): string | null {
  if (tipo === 'suplemento') {
    return 'Esto es un suplemento (una modificación de la póliza), no la póliza. Su importe es el ajuste del periodo que queda, así que no lo guardamos como prima anual.'
  }
  if (tipo === 'recibo') {
    return 'Esto es un recibo, no la póliza. Su importe es un cobro, así que no lo guardamos como prima anual.'
  }
  return null
}
