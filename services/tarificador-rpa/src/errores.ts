// Clasificación de fallos del worker → `TipoError` de @central/module-tarificacion. El orquestador
// decide el estado (`estadoTrasError`): solo `infra` se reintenta, y UNA vez.

import { EmisionBloqueadaError, type TipoError } from '@central/module-tarificacion'

export class ErrorTarificador extends Error {
  readonly tipo: TipoError
  constructor(tipo: TipoError, mensaje: string) {
    super(mensaje)
    this.name = 'ErrorTarificador'
    this.tipo = tipo
  }
}

export function clasificar(e: unknown): { tipo: TipoError; mensaje: string } {
  if (e instanceof EmisionBloqueadaError) return { tipo: 'emision', mensaje: e.message }
  if (e instanceof ErrorTarificador) return { tipo: e.tipo, mensaje: e.message }
  const msg = e instanceof Error ? e.message : String(e)
  // Red caída / DNS / conexión: infraestructura (se reintenta una vez).
  if (/net::ERR_|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up|Target (page|browser).*closed/i.test(msg)) {
    return { tipo: 'infra', mensaje: msg }
  }
  // Un selector que no aparece (TimeoutError de Playwright) o cualquier otra cosa: el portal no es
  // como el adaptador cree. NO se reintenta: repetir es otro login con nuestra credencial.
  return { tipo: 'portal', mensaje: msg }
}
