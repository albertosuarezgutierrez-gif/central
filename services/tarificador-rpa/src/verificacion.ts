// Verificación humana (SMS / OTP / segundo factor) y sesión que no se puede recuperar sin persona (07/10/2026).
//
// Si el portal pide un código que llega al móvil de alguien, el bot NO puede seguir: ni inventa, ni busca el código,
// ni lo pide, ni lo guarda, ni rellena nada. El trabajo termina como `requiere_humano` (nunca se reintenta) con el
// aviso «<Compañía> pide verificación: entra en su portal, valida y pulsa Reintentar». Sin red, sin BD: `node --test`.
// 🔑 Esto SOLO LEE la pantalla (campos y texto visibles); jamás escribe en ella ni registra su contenido.

import type { Page } from 'playwright'
import { ErrorVerificacionHumana } from './errores.ts'

export { nombreCompania, textoAvisoVerificacion } from './aviso.ts'

/** Campos de un código de un solo uso. Genéricos: el nombre/id/autocomplete que usan casi todos los portales. */
export const SELECTORES_OTP = [
  'input[autocomplete="one-time-code"]',
  'input[name*="otp" i]',
  'input[id*="otp" i]',
  'input[name*="sms" i]',
  'input[id*="sms" i]',
  'input[name*="segundoFactor" i]',
  'input[id*="segundoFactor" i]',
  'input[name*="2fa" i]',
  'input[id*="2fa" i]',
  'input[name*="codigoVerificacion" i]',
  'input[id*="codigoVerificacion" i]',
]

// Texto que, por sí solo, es una petición de segundo factor.
const TEXTO_FUERTE =
  /c[oó]digo de verificaci[oó]n|segundo factor|doble factor|verificaci[oó]n en (dos|2) (pasos|factores)|autenticaci[oó]n en dos|two[- ]factor|\b2fa\b|one[- ]time (code|password)|c[oó]digo de un solo uso|c[oó]digo (de seguridad )?(que )?(te )?(hemos |se ha )?(enviado|recibido)|(enviado|enviamos|recibido)[^.\n]{0,30}c[oó]digo/i
// «SMS» a secas aparece en pies de página y avisos legales: solo cuenta junto a la palabra «código»/«code».
const TEXTO_SMS = /\bsms\b/i
const TEXTO_CODIGO = /c[oó]digo|\bcode\b/i

/** Pura: ¿esta pantalla (campos + texto visible) es una petición de verificación? */
export function esPantallaVerificacion(p: { hayCampoOtp: boolean; texto: string }): boolean {
  if (p.hayCampoOtp) return true
  const t = p.texto
  if (TEXTO_FUERTE.test(t)) return true
  return TEXTO_SMS.test(t) && TEXTO_CODIGO.test(t)
}

/** Lee la pantalla (página y marcos) sin tocarla. Un fallo de lectura = «no se ve»: no inventa una verificación. */
export async function leerPantalla(page: Page): Promise<{ hayCampoOtp: boolean; texto: string }> {
  let hayCampoOtp = false
  const textos: string[] = []
  for (const marco of page.frames()) {
    for (const s of SELECTORES_OTP) {
      if (hayCampoOtp) break
      hayCampoOtp = await marco.locator(s).filter({ visible: true }).count().then((n) => n > 0, () => false)
    }
    textos.push(await marco.locator('body').innerText({ timeout: 2_000 }).catch(() => ''))
  }
  return { hayCampoOtp, texto: textos.join('\n').slice(0, 20_000) }
}

/** Tras el login (y ante un fallo): si el portal pide verificación, lanza el error clasificado. No rellena nada. */
export async function exigirSinVerificacion(page: Page, compania: string): Promise<void> {
  if (esPantallaVerificacion(await leerPantalla(page))) throw new ErrorVerificacionHumana(compania)
}
