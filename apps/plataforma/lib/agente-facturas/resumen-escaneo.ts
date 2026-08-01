// Parte de una pasada del escaneo de facturas, en texto. Módulo PURO (sin BD ni
// IMAP) para poder testearlo con `node --test`.
//
// 🚨 Por qué existe: el latido del agente se lee como un titular, y un titular
// mal construido miente igual que un dato mal leído. «0 factura(s) nueva(s)» a
// secas se lee como «este mes no ha llegado ninguna factura», cuando puede
// significar tres cosas MUY distintas:
//   · el buzón se miró entero y no había nada        → 0 de verdad
//   · llegaron facturas y el adjunto no se pudo leer → `noLeidas`
//   · no dio tiempo a mirarlo todo                   → `pendientes`
// Las tres tienen que poder distinguirse en el parte (regla del CLAUDE.md raíz:
// dato que NO hay ≠ dato que NO se ha mirado).

export interface ResultadoEscaneo {
  nuevas: number
  /** `false` = la pasada NO se pudo completar; `nuevas` no es una conclusión. */
  ok: boolean
  error: string | null
  /**
   * Correos que quedaron SIN mirar al agotarse el presupuesto de tiempo. Se retoman
   * en la pasada siguiente (el dedupe por `gmail_uid` hace la pasada idempotente),
   * pero si esto no baja de cero nunca, hay un atasco que contar.
   */
  pendientes: number
  /**
   * Correos con adjunto que SÍ se miraron pero de los que no salió un importe
   * usable (PDF escaneado, extracción vacía, IA caída). Se encolan en Gmail bajo
   * `Facturas/PDF-pendiente`: son facturas REALES que no están en `facturas_proveedor`,
   * así que el IVA soportado del trimestre sale corto mientras no se lean a mano.
   */
  noLeidas: number
}

/** Texto del latido/respuesta de una pasada. Nunca colapsa los tres estados en «0». */
export function detalleEscaneo(r: ResultadoEscaneo): string {
  if (!r.ok) return r.error ?? 'la pasada no se completó (sin detalle)'

  const partes = [`${r.nuevas} factura(s) nueva(s)`]
  if (r.noLeidas > 0) {
    partes.push(
      `${r.noLeidas} con adjunto ilegible → cola Facturas/PDF-pendiente ` +
      '(hay factura, falta el importe: NO es «no había facturas»)',
    )
  }
  if (r.pendientes > 0) {
    partes.push(`${r.pendientes} correo(s) sin mirar por presupuesto de tiempo`)
  }
  return partes.join(' · ')
}
