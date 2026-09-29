// ¿Esta factura leída del Gmail es algo que Alberto tiene que PAGAR? El escaneo de facturas
// guardaba como «pendiente de pago» —con botón ✅ Pagar en Telegram— cualquier PDF con forma de
// factura. Caso fundacional (29/09/2026): una factura de 2022 al Ayuntamiento de Ayamonte, una
// certificación de obra de GLOBAL 2 de abril de 2025 (documentación de un cliente de la
// correduría), un recibo de moto de Allianz y dos «prestaciones» de Occident (un siniestro que
// se COBRA) llegaron con el botón de pagar. La ventana de 7 días es la del CORREO, no la del
// documento: un hilo reenviado hoy trae adjuntos de hace años.
//
// Módulo PURO (sin BD ni red) para que sea testeable con `node --test`.
//
// 🚨 Asimetría deliberada, la misma de `receptor.ts`: se aparta SOLO con una señal positiva. Un
// dato que falta (sin fecha, sin NIF) deja pasar la factura — un falso «no hay que pagarla» esconde
// un gasto real, que es más caro que el ruido que evita.

import { evaluaReceptor, normalizaNifReceptor, normalizaNombreReceptor, type Titular } from './receptor.ts'
import { detectarCompania, COMPANIA_OTRAS } from '../correduria.ts'

/** Más vieja que esto, la factura no se ofrece para pagar: es histórico, no una deuda de hoy. */
export const DIAS_MAX_ANTIGUEDAD = 90

export type MotivoApartar = 'antigua' | 'emitida_por_ti' | 'ajena' | 'aseguradora'

export type DecisionPago =
  | { pagar: true }
  | { pagar: false; motivo: MotivoApartar; detalle: string }

export interface DatosFactura {
  fecha?: string | null
  proveedor?: string | null
  nif_proveedor?: string | null
  cliente?: string | null
  nif_cliente?: string | null
}

function diasEntre(fechaIso: string, hoy: Date): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaIso)) return null
  const t = Date.parse(`${fechaIso}T00:00:00Z`)
  if (Number.isNaN(t)) return null
  return Math.floor((hoy.getTime() - t) / 86_400_000)
}

export function decidirAvisoPago(d: DatosFactura, titulares: Titular[], hoy: Date = new Date()): DecisionPago {
  const nifsTitulares = titulares.map((t) => normalizaNifReceptor(t.nif)).filter(Boolean)
  const nifProv = normalizaNifReceptor(d.nif_proveedor)
  const nifCli = normalizaNifReceptor(d.nif_cliente)

  // 1. La emitimos nosotros: el emisor es un titular y el destinatario, otro distinto. Solo con
  //    los DOS NIF: el extractor a veces pone el nuestro como el del proveedor (caso IONOS), y un
  //    NIF suelto no distingue ese error de una factura emitida.
  if (nifProv && nifCli && nifProv !== nifCli && nifsTitulares.includes(nifProv) && !nifsTitulares.includes(nifCli)) {
    return { pagar: false, motivo: 'emitida_por_ti', detalle: `la emitiste tú a ${d.cliente?.trim() || nifCli}: es un ingreso` }
  }

  // 2. A nombre de un tercero identificado por NIF.
  const receptor = evaluaReceptor(d, titulares)
  if (receptor.veredicto === 'ajeno') {
    return { pagar: false, motivo: 'ajena', detalle: receptor.motivo ?? 'a nombre de un tercero' }
  }

  // 3. Antigua. Una fecha ilegible o futura no aparta nada.
  const dias = d.fecha ? diasEntre(d.fecha, hoy) : null
  if (dias !== null && dias > DIAS_MAX_ANTIGUEDAD) {
    return { pagar: false, motivo: 'antigua', detalle: `fechada el ${d.fecha} (hace ${dias} días)` }
  }

  // 4. Emitida por una aseguradora y no consta a tu nombre: recibos y prestaciones de la
  //    correduría (los recibos propios van domiciliados; una prestación es dinero que ENTRA).
  const proveedor = d.proveedor?.trim() ?? ''
  if (proveedor && receptor.veredicto !== 'nuestro') {
    const compania = detectarCompania(proveedor, normalizaNombreReceptor(proveedor).toUpperCase(), '')
    if (compania !== COMPANIA_OTRAS) {
      return { pagar: false, motivo: 'aseguradora', detalle: `documento de ${compania} (correduría), no consta a tu nombre` }
    }
  }

  return { pagar: true }
}
