// lib/sivra/facturas/emisor.ts — EMISOR fijo de las facturas a huéspedes de los pisos turísticos.
//
// Nombre y NIF son los de Alberto, los mismos que `MEDIADOR.identidad` de `@central/module-seguros`. Se DUPLICAN aquí
// a propósito (una factura de alojamiento no es un documento de la correduría y no debe cambiar si cambia la
// correduría); el test `emisor.test.ts` exige que coincidan, así que una divergencia salta en CI.
//
// 🚨 El domicilio del emisor es Calle Socorro 24, 41003 Sevilla (House Sevillana). NO es Bustos Tavera 22 (esos son
// otros dos pisos) ni el domicilio profesional de la correduría (San Juan de La Palma 28).

import { resolverCuentaBuzon, type CuentaBuzon } from '../../agente-facturas/cuenta-buzon.ts'

export type Emisor = {
  nombre: string
  nif: string
  domicilio: string
  cp: string
  municipio: string
  provincia: string
  pais: string
}

export const EMISOR_FACTURAS_HUESPED: Readonly<Emisor> = Object.freeze({
  nombre: 'Alberto Suárez Gutiérrez',
  nif: '28823484E',
  domicilio: 'Calle Socorro 24',
  cp: '41003',
  municipio: 'Sevilla',
  provincia: 'Sevilla',
  pais: 'España',
})

/** Las líneas del emisor tal y como van en el PDF. */
export function lineasEmisor(e: Emisor = EMISOR_FACTURAS_HUESPED): string[] {
  return [e.nombre, `NIF ${e.nif}`, e.domicilio, `${e.cp} ${e.municipio} (${e.provincia})`, e.pais]
}

/**
 * El emisor es SIEMPRE Alberto, pero serie y factura van por `cuenta_id`: solo la cuenta de Alberto puede facturar
 * (si no, otra cuenta emitiría facturas con el NIF de Alberto). La cuenta de Alberto se resuelve con el MISMO criterio
 * que el libro de gastos (`resolverCuentaBuzon`: env FACTURAS_CUENTA_ID → cuenta cuyo email == GMAIL_USER → la única
 * real). Fail-closed: si no se puede determinar, nadie factura.
 */
export function cuentaPuedeFacturar(cuentaId: string, cuentas: CuentaBuzon[], opts: { facturaCuentaId?: string; gmailUser?: string }): boolean {
  const deAlberto = resolverCuentaBuzon(cuentas, opts)
  return !!deAlberto && deAlberto === cuentaId
}
