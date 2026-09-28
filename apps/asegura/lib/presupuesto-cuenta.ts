// La CUENTA de domiciliación y el texto de la casilla de autorización del presupuesto que el cliente
// firma en el portal (dictado de Alberto, 28/09/2026). PURO: sin red ni BD, para poder verlo fallar.
//
// Por qué existe: para emitir, la compañía pide IBAN (duodécimo 400 de Codeoscopic, ver
// `codeoscopic/emitir-iban.ts`). Un cliente nuevo puede no tener ninguna cuenta en su ficha, y el que
// la tiene debe VER cuál se va a usar. Tres reglas que vigilan los cepos:
//   1. Sin una cuenta válida (módulo 97) no se firma. Lo decide el servidor, no la pantalla.
//   2. El IBAN completo NO sale nunca de aquí hacia un texto: documento firmado, huella, historial y
//      Telegram llevan solo la máscara «**** 1234». El IBAN en claro solo va a `encryptField`.
//   3. Una cuenta de la ficha solo se usa si el cliente la ha elegido viéndola enmascarada.
//
// El validador es el mismo que usa la emisión (`ibanValido`): no hay un segundo módulo 97.

import { ibanValido, normalizarIban } from './codeoscopic/emitir-iban.ts'
import { TEXTO_CONFIRMACION_DATOS } from './datos-cotizados.ts'

/** Lo único que un humano (cliente, Alberto) ve de la cuenta: los 4 últimos caracteres. */
export function mascaraCuenta(v: unknown): string | null {
  const iban = normalizarIban(v)
  if (!iban || iban.length < 8) return null
  return `**** ${iban.slice(-4)}`
}

export type CuentaElegida = {
  /** EN CLARO. Solo para `encryptField`: no se concatena en ningún texto. */
  iban: string
  /** `ficha` = ya constaba (la eligió viéndola enmascarada); `nueva` = la ha tecleado al aceptar. */
  origen: 'ficha' | 'nueva'
  mascara: string
}

export type ResultadoCuenta =
  | { ok: true; cuenta: CuentaElegida }
  | { ok: false; estado: 'sin_cuenta' | 'iban_invalido'; motivo: string }

export const MOTIVO_SIN_CUENTA = 'Indica la cuenta en la que quieres domiciliar los recibos: sin ella la compañía no emite la póliza.'
export const MOTIVO_IBAN_INVALIDO = 'Ese IBAN no es válido. Revísalo: son 24 caracteres en España, empezando por ES.'

/**
 * Qué cuenta viaja con la firma. `eleccion` y `ibanNuevo` vienen del cliente (no se fían);
 * `fichaIban` lo pone el servidor (`cuentaDeFicha`). Fail-closed: todo lo que no sea una cuenta
 * válida elegida explícitamente es `sin_cuenta` o `iban_invalido`.
 */
export function resolverCuentaFirma(a: { fichaIban: string | null; eleccion: unknown; ibanNuevo: unknown }): ResultadoCuenta {
  const ficha = a.fichaIban && ibanValido(a.fichaIban) ? normalizarIban(a.fichaIban) : null
  if (a.eleccion === 'ficha') {
    if (!ficha) return { ok: false, estado: 'sin_cuenta', motivo: MOTIVO_SIN_CUENTA }
    return { ok: true, cuenta: { iban: ficha, origen: 'ficha', mascara: mascaraCuenta(ficha)! } }
  }
  if (a.eleccion === 'otra') {
    const iban = normalizarIban(a.ibanNuevo)
    if (!iban) return { ok: false, estado: 'sin_cuenta', motivo: MOTIVO_SIN_CUENTA }
    if (iban.length > 34 || !ibanValido(iban)) return { ok: false, estado: 'iban_invalido', motivo: MOTIVO_IBAN_INVALIDO }
    // La misma que ya tenía: no es una cuenta nueva y no hay nada que guardar.
    return { ok: true, cuenta: { iban, origen: iban === ficha ? 'ficha' : 'nueva', mascara: mascaraCuenta(iban)! } }
  }
  return { ok: false, estado: 'sin_cuenta', motivo: MOTIVO_SIN_CUENTA }
}

/** La línea del documento firmado (entra en la huella). Solo la máscara. */
export function lineaCuentaDocumento(c: Pick<CuentaElegida, 'origen' | 'mascara'>): string {
  return `Cuenta en la que domicilio los recibos: ${c.mascara} ` +
    `(${c.origen === 'ficha' ? 'la que ya constaba en mi ficha' : 'la he indicado yo al aceptar'}).`
}

/** La línea del Telegram a Alberto. Solo la máscara. */
export function lineaCuentaAviso(c: Pick<CuentaElegida, 'origen' | 'mascara'>): string {
  return `cuenta: ${c.mascara} (${c.origen === 'ficha' ? 'la de su ficha' : 'nueva, la ha dado el cliente'})`
}

/** La frase del historial interno de la ficha. Solo la máscara. */
export function lineaCuentaHistorial(c: Pick<CuentaElegida, 'origen' | 'mascara'>): string {
  return `Cuenta de domiciliación ${c.mascara} ` +
    `(${c.origen === 'ficha' ? 'la de su ficha' : 'nueva, la dio al aceptar y queda guardada cifrada en su ficha'}).`
}

/** El texto de la casilla cuando el cliente TIENE la ficha IPID de la opción elegida (RDL 3/2020). */
export const TEXTO_CONFIRMACION_CON_IPID =
  'He revisado mis datos, son correctos, autorizo la emisión de la póliza y he recibido la información previa del producto.'

/**
 * El texto de la casilla. Solo afirma que recibió la información previa si había IPID de esa opción:
 * hacerle declarar algo que no se le dio sería fabricar la prueba.
 */
export function textoAutorizacion(conIpid: boolean): string {
  return conIpid ? TEXTO_CONFIRMACION_CON_IPID : TEXTO_CONFIRMACION_DATOS
}

/**
 * 🚨 La póliza cuyas cuentas van primero al emitir. Si el cliente firmó una cuenta
 * NUEVA en el portal, esa se guardó en `clientes.cuenta_bancaria` (3.º en el orden):
 * con la póliza vieja delante, se domiciliaría en la cuenta que acaba de cambiar.
 * Sin póliza, la ficha del cliente gana.
 */
export function polizaParaCuenta(polizaOrigenId: string | null, origenAceptado: 'nueva' | 'ficha' | null): string | null {
  return origenAceptado === 'nueva' ? null : polizaOrigenId
}

/**
 * 🚨 La cuenta que se va a mandar a la compañía ¿es la que firmó? Solo se compara la máscara
 * (el evento no guarda el IBAN). `true` = NO coincide y no se puede ofrecer sin más: el
 * cliente firmó otra. Sin máscara firmada o sin cuenta en ficha, no hay nada que comparar.
 */
export function cuentaDistintaDeLaFirmada(ibanFicha: string | null, mascaraFirmada: string | null | undefined): boolean {
  if (!mascaraFirmada || !ibanFicha) return false
  return mascaraCuenta(ibanFicha) !== mascaraFirmada
}

function normalizarCompania(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Margen para la prima: céntimos de redondeo, nunca otra opción. */
export const TOLERANCIA_PRIMA = 0.02

/**
 * 🚨 ¿Lo que se va a emitir es la opción que el cliente FIRMÓ en el portal? Se emite desde la fila
 * que pincha Alberto en la parrilla; sin esto, nada impide mandar otra compañía u otra prima.
 * `null` = coincide; texto = el motivo para no emitir (también si falta la prima: fail-closed).
 */
export function discrepanciaConElegida(e: {
  companiaProyecto: string
  companiaElegida: string
  primaEnviada: number | null
  primaElegida: number
}): string | null {
  if (normalizarCompania(e.companiaProyecto) !== normalizarCompania(e.companiaElegida)) {
    return `el cliente firmó ${e.companiaElegida} y este proyecto es de ${e.companiaProyecto}`
  }
  // Sin prima no se puede comprobar lo firmado: fail-closed, no «no hay nada que comparar».
  if (e.primaEnviada === null) return 'no llega la prima con la que se va a emitir, así que no se puede comprobar contra la firmada'
  if (e.primaElegida > 0 && Math.abs(e.primaEnviada - e.primaElegida) / e.primaElegida > TOLERANCIA_PRIMA) {
    return `el cliente firmó una prima de ${e.primaElegida.toFixed(2)} € y se va a emitir con ${e.primaEnviada.toFixed(2)} €`
  }
  return null
}
