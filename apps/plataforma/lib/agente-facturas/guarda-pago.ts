// Guarda anti doble pago, PURA (testeable con `node --test`).
// Una factura que ya casa con un cargo bancario (o ya está pagada) NO recibe botón Pagar
// ni inicia pago. Fail-closed: si no se pudo consultar el banco (`casado === null`), NO se paga.
//
// Caso real: factura SQB 1.889,06€ pagada por transferencia (cargo al día siguiente) recibió «✅ Pagar».

export type VeredictoGuarda = 'pagar' | 'ya_pagada' | 'sin_comprobar'

/**
 * @param estado  estado actual de la factura
 * @param casado  true = hay cargo que casa · false = consultado y no lo hay · null = la consulta falló
 */
export function decidirGuardaPago(estado: string, casado: boolean | null): VeredictoGuarda {
  if (estado === 'pagada') return 'ya_pagada'
  if (casado === null) return 'sin_comprobar'
  return casado ? 'ya_pagada' : 'pagar'
}

/** `2026-11-02` (o ISO con hora) → `02/11`. Sin dato legible → null (nunca inventa fecha). */
export function fechaCorta(iso: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  return m ? `${m[3]}/${m[2]}` : null
}

export function textoYaPagada(fecha: string | null): string {
  return fecha ? `ya pagada · conciliada con el cargo del ${fecha}` : 'ya pagada · conciliada con el extracto bancario'
}
