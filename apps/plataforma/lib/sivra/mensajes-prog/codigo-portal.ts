// lib/sivra/mensajes-prog/codigo-portal.ts — QUÉ código del portal recibe el huésped.
//
// Hallazgo del 31/08/2026 (lo señaló Alberto): los teclados de Socorro y Bustos Tavera NO son
// cacharros sueltos, son cerraduras Tuya conectadas a la plataforma, y `domotica_acceso_pin` ya
// guarda un PIN POR RESERVA con la ventana exacta de la estancia, creado por el cron
// `domotica/acceso/programador` e idempotente por bookingId.
//
// Por eso este módulo existe: mandar el código MAESTRO de `sivra_codigos_acceso` cuando la reserva
// tiene su propio PIN es repartir una llave permanente teniendo una temporal hecha a medida — y es
// justo lo contrario de lo que se pedía el primer día («si cancela o hace checkout, se le quita el
// acceso»). Con el PIN por reserva eso pasa SOLO, sin tarea manual de rotación.
//
// Orden: PIN de la reserva > maestro > declarar el hueco. El maestro NO se retira: es el respaldo
// legítimo de los pisos sin cerradura conectada (Dúplex = caja física) y de los que la tienen pero
// hoy no pueden emitir PIN (Bustos Tavera, con el trial de IoT Core caducado desde agosto).
//
// Puro: sin BD ni red.

export type OrigenCodigo = 'reserva' | 'maestro' | 'ninguno'

export type CodigoPortal = {
  codigo: string | null
  origen: OrigenCodigo
  /** Frase que acompaña al código. Vacía cuando no hay código que explicar. */
  nota: string
}

/**
 * Elige el código del portal para UNA reserva.
 *
 * `pinReserva` solo debe traer el PIN cuando está VIVO para esa estancia (el cargador filtra por
 * estado). Un PIN en error o borrado es un «no hay», nunca un código a medias: mandar un código que
 * la cerradura no reconoce deja al huésped en la puerta creyendo que se ha equivocado él.
 */
export function elegirCodigoPortal(args: { pinReserva?: string | null; maestro?: string | null }): CodigoPortal {
  const pin = (args.pinReserva || '').trim()
  if (pin) {
    return {
      codigo: pin,
      origen: 'reserva',
      nota: 'Este código es SOLO vuestro: se ha creado para esta reserva y deja de funcionar cuando termina la estancia.',
    }
  }
  const maestro = (args.maestro || '').trim()
  if (maestro) return { codigo: maestro, origen: 'maestro', nota: '' }
  return { codigo: null, origen: 'ninguno', nota: '' }
}

/** Una fila viva de `domotica_acceso_pin` reducida a lo que decide el código del huésped. */
export type PinFila = { reservaRef: string; pin: string | null }

/**
 * Agrupa los PIN vivos por reserva y devuelve el que se le puede mandar al huésped.
 *
 * El índice único de `domotica_acceso_pin` es `(dispositivo_id, reserva_ref)`: una MISMA reserva
 * puede tener PIN en varias cerraduras. Con dos códigos distintos vivos no hay forma honesta de
 * rellenar el hueco `{PORTAL}` del texto —es UN código— así que esa reserva se queda SIN PIN y cae
 * al maestro: mandar uno de los dos a ciegas es mandar el de la puerta equivocada la mitad de las
 * veces. Si todas las cerraduras coinciden en el mismo código, no hay ambigüedad y se manda.
 */
export function pinsPorReserva(filas: PinFila[]): Map<string, string> {
  const porRef = new Map<string, Set<string>>()
  for (const f of filas) {
    const pin = (f.pin || '').trim()
    if (!f.reservaRef || !pin) continue
    if (!porRef.has(f.reservaRef)) porRef.set(f.reservaRef, new Set())
    porRef.get(f.reservaRef)!.add(pin)
  }
  const out = new Map<string, string>()
  for (const [ref, pins] of porRef) if (pins.size === 1) out.set(ref, [...pins][0])
  return out
}
