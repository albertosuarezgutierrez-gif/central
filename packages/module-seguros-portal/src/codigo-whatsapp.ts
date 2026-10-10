// El CÓDIGO DE ACCESO del presupuesto que Alberto manda a mano por WhatsApp (07/10/2026).
//
// Por qué existe: el presupuesto se abre y se firma con un código, y el de siempre va SOLO al
// correo. Sin correo en la ficha no había puerta. Este código lo genera asegura al abrir el
// WhatsApp, viaja DENTRO del mensaje y vale hasta `vence_el` del presupuesto.
//
// Reglas, todas puras (sin BD ni red) para que el cepo las vea fallar:
//   1. Se guarda HASHEADO y el hash va ATADO AL TOKEN del enlace:
//      `SHA-256("presupuesto-whatsapp:<token>:<código>")`. El token (256 bits) no se guarda en
//      claro en ningún sitio, así que quien lea la BD no puede sacar los 6 dígitos con un bucle
//      de 10^6 (con un SHA-256 pelado del código, sí). Y de regalo:
//        · el código de OTRO presupuesto no abre este (su hash lleva otro token);
//        · regenerar el enlace rota el token y el hash: el código anterior deja de valer.
//   2. Orden de las comprobaciones (el de `estadoCodigo`): sin código → bloqueado → caducado →
//      acierto. Comparar antes de mirar el bloqueo haría decorativo el tope de intentos.
//   3. Comparación en tiempo constante (`igualEnTiempoConstante`, el del OTP de la casa).
//   4. NO es de un solo uso: abre la carátula y firma, hasta que vence o se regenera. El tope
//      es de intentos FALLIDOS seguidos (`MAX_INTENTOS`, el mismo del OTP); un acierto lo pone a
//      cero. Lo cuenta asegura reservando el intento ANTES de comparar.

import { MAX_INTENTOS, esHashCodigo, igualEnTiempoConstante } from './codigo.ts'
import { hashTokenVista } from './vista-corredor.ts'

/** Fallos seguidos antes de bloquear. El MISMO tope que el código de un solo uso del portal. */
export const MAX_INTENTOS_WHATSAPP = MAX_INTENTOS

const SEIS_DIGITOS = /^\d{6}$/

export function formatoCodigoWhatsapp(codigo: unknown): codigo is string {
  return typeof codigo === 'string' && SEIS_DIGITOS.test(codigo)
}

/** El hash que se guarda (y con el que se compara). Atado al token del enlace: ver la cabecera. */
export async function hashCodigoWhatsapp(token: string, codigo: string): Promise<string> {
  return hashTokenVista(`presupuesto-whatsapp:${token}:${codigo}`)
}

export type EstadoCodigoWhatsapp = 'valido' | 'incorrecto' | 'caducado' | 'bloqueado' | 'sin_codigo'

export type CodigoWhatsappGuardado = {
  /** `null` = este enlace no salió por WhatsApp (o se avisó después por correo): no hay código. */
  codigoHash: string | null
  /** Fallos seguidos ANTES de este intento. */
  intentos: number
  /** Hasta cuándo vale: el `vence_el` del presupuesto. */
  venceEl: Date
  retirado: boolean
}

/**
 * El desenlace de un intento. `entradaHash` = `hashCodigoWhatsapp(token, lo tecleado)`.
 *
 * 🚨 `sin_codigo` NO es «incorrecto»: no hay nada con qué comparar, y un hash nulo o con forma
 * rara jamás puede dar `valido`.
 */
export function estadoCodigoWhatsapp(g: CodigoWhatsappGuardado, entradaHash: string, ahora: Date): EstadoCodigoWhatsapp {
  if (g.retirado || g.codigoHash === null || !esHashCodigo(g.codigoHash)) return 'sin_codigo'
  if (g.intentos >= MAX_INTENTOS_WHATSAPP) return 'bloqueado'
  if (ahora.getTime() > g.venceEl.getTime()) return 'caducado'
  return igualEnTiempoConstante(entradaHash, g.codigoHash) ? 'valido' : 'incorrecto'
}

/** Los intentos que le quedan tras un fallo (para el texto «te quedan N»). */
export function intentosQuedan(intentosTrasFallo: number): number {
  return Math.max(0, MAX_INTENTOS_WHATSAPP - intentosTrasFallo)
}
