// Lógica pura de trazabilidad pesquera: importe por peso, stock por partida, la regla de
// "qué canal lleva lote", la construcción de la etiqueta (HEREDANDO el lote de origen) y las validaciones.
import type {
  Canal,
  Partida,
  Envasado,
  PartidaInput,
  EnvasadoInput,
  EtiquetaPayload,
} from './types.ts'

/** Redondeo a 2 decimales sin errores de coma flotante (céntimos). */
export const redondear2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100

/** Importe de un envase = peso (kg) × precio (€/kg), a céntimos. */
export const importe = (pesoKg: number, precioKg: number): number =>
  redondear2((pesoKg || 0) * (precioKg || 0))

/** Suma del peso ya envasado de una lista de envasados. */
export const pesoEnvasadoTotalKg = (envasados: Pick<Envasado, 'pesoKg'>[]): number =>
  redondear2(envasados.reduce((acc, e) => acc + (e.pesoKg || 0), 0))

/** Kg que quedan sin envasar de una partida (nunca negativo). */
export const stockRestanteKg = (
  partida: Pick<Partida, 'pesoRecibidoKg'>,
  envasados: Pick<Envasado, 'pesoKg'>[],
): number => redondear2(Math.max(0, (partida.pesoRecibidoKg || 0) - pesoEnvasadoTotalKg(envasados)))

/**
 * LA regla de la reunión: ¿la etiqueta de este canal lleva el nº de lote?
 * Catering / bares / hotel (va en factura) SÍ; mostrador (ticket corriente) NO.
 */
export const canalLlevaLote = (canal: Canal): boolean => canal === 'catering' || canal === 'hotel'

/** Etiqueta legible en español del canal. */
export const CANAL_NOMBRE: Record<Canal, string> = {
  mostrador: 'Mostrador',
  catering: 'Catering / bares',
  hotel: 'Hotel',
}

/**
 * Construye el payload de la etiqueta de un envasado a partir de SU partida.
 * Puntos clave:
 *  - El `lote` es SIEMPRE el `loteOrigen` de la partida (nunca se genera uno nuevo), y solo se
 *    rellena si el canal lo exige (en mostrador va null → la etiqueta no lo imprime).
 *  - La info pesquera obligatoria al consumidor (nombre científico, método, zona, arte) va siempre.
 */
export function construirEtiqueta(partida: Partida, envasado: Envasado): EtiquetaPayload {
  const llevaLote = canalLlevaLote(envasado.canal)
  return {
    producto: partida.producto,
    nombreCientifico: partida.nombreCientifico ?? null,
    canal: envasado.canal,
    lote: llevaLote ? partida.loteOrigen : null,
    metodoProduccion: partida.metodoProduccion ?? null,
    zonaCaptura: partida.zonaCaptura ?? null,
    artePesca: partida.artePesca ?? null,
    calibre: partida.calibre ?? null,
    pesoKg: envasado.pesoKg,
    precioKg: envasado.precioKg,
    importe: importe(envasado.pesoKg, envasado.precioKg),
    fechaEnvasado: envasado.fechaEnvasado,
    fechaCaducidad: envasado.fechaCaducidad ?? partida.fechaCaducidad ?? null,
    cliente: envasado.cliente ?? null,
    codigo: envasado.codigo ?? null,
    trazabilidad: {
      proveedor: partida.proveedor ?? null,
      barco: partida.barco ?? null,
      marea: partida.marea ?? null,
      albaran: partida.albaran ?? null,
      fechaCaptura: partida.fechaCaptura ?? null,
    },
  }
}

/** Valida los datos de una recepción de partida. Devuelve la lista de errores (vacía = OK). */
export function validarPartida(input: Partial<PartidaInput>): string[] {
  const errores: string[] = []
  if (!input.producto || !input.producto.trim()) errores.push('El producto es obligatorio.')
  if (!input.loteOrigen || !input.loteOrigen.trim())
    errores.push('El lote de origen es obligatorio (es el que se conserva hasta la venta).')
  if (input.pesoRecibidoKg == null || !(input.pesoRecibidoKg > 0))
    errores.push('El peso recibido debe ser mayor que 0 kg.')
  if (input.precioCompraKg != null && input.precioCompraKg < 0)
    errores.push('El precio de compra no puede ser negativo.')
  if (input.precioVentaKg != null && input.precioVentaKg < 0)
    errores.push('El precio de venta no puede ser negativo.')
  return errores
}

/**
 * Valida un envasado contra su partida y lo ya envasado: el peso debe ser > 0 y no superar el
 * stock que queda en cámara.
 */
export function validarEnvasado(
  partida: Pick<Partida, 'pesoRecibidoKg'>,
  yaEnvasados: Pick<Envasado, 'pesoKg'>[],
  input: Partial<EnvasadoInput>,
): string[] {
  const errores: string[] = []
  if (input.pesoKg == null || !(input.pesoKg > 0)) {
    errores.push('El peso del envase debe ser mayor que 0 kg.')
  } else {
    const restante = stockRestanteKg(partida, yaEnvasados)
    if (input.pesoKg > restante)
      errores.push(`No hay stock: quedan ${restante} kg en cámara de esta partida.`)
  }
  if (input.precioKg == null || input.precioKg < 0)
    errores.push('El precio por kg es obligatorio y no puede ser negativo.')
  return errores
}
