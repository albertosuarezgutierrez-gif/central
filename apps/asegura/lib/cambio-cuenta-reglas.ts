// Reglas del cambio de cuenta que pide el cliente desde el portal (29/09/2026). PURO: sin red ni BD.
//
// El IBAN en claro solo sale de aquí para ir a `encryptField`: lo que se enseña o se escribe en un
// texto (historial, Telegram, cola de «Hoy») es la máscara «**** 1234».

import { ibanValido, normalizarIban } from './codeoscopic/emitir-iban.ts'
import { mascaraCuenta } from './presupuesto-cuenta.ts'

export const MOTIVO_IBAN_NO_VALIDO = 'Ese IBAN no es válido. Revísalo: en España son 24 caracteres y empieza por ES.'

export type RevisionIban =
  | { ok: true; iban: string; mascara: string }
  | { ok: false; estado: 'iban_invalido'; motivo: string }
  | { ok: false; estado: 'sin_cambios' }

/**
 * `bruto` lo teclea el cliente (no se fía); `actual` es la cuenta de su ficha descifrada (o `null`).
 * La misma cuenta que ya tiene no es un cambio: no se abre solicitud ni se molesta a nadie.
 */
export function revisarIbanNuevo(bruto: unknown, actual: string | null): RevisionIban {
  const iban = normalizarIban(bruto)
  if (!iban || iban.length > 34 || !ibanValido(iban)) return { ok: false, estado: 'iban_invalido', motivo: MOTIVO_IBAN_NO_VALIDO }
  if (actual && normalizarIban(actual) === iban) return { ok: false, estado: 'sin_cambios' }
  return { ok: true, iban, mascara: mascaraCuenta(iban)! }
}

/** Estados con los que Alberto cierra una solicitud. */
export const RESOLUCIONES_CAMBIO_CUENTA = ['hecha', 'descartada'] as const
export type ResolucionCambioCuenta = (typeof RESOLUCIONES_CAMBIO_CUENTA)[number]
