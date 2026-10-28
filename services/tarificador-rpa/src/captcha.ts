// CAPTCHA → `requiere_humano`. NUNCA se intenta resolver, saltar ni externalizar.

import type { Page } from 'playwright'
import { ErrorTarificador } from './errores.ts'

/**
 * Señales de un reto. 0.3.10 (real 28/10/2026, Fidelidade hogar: `requiere_humano`/captcha en la URL de login): antes bastaba con que
 * el selector CASARA, aunque el elemento estuviera oculto — el badge invisible de reCAPTCHA v3 (`.grecaptcha-badge`) y su iframe
 * `recaptcha/api2/anchor` paraban el trabajo sin reto alguno. Ahora el elemento debe estar VISIBLE y no ser ese badge/anchor.
 * Un reto visible (`bframe`, `.g-recaptcha`, `.cf-turnstile`, hcaptcha, cloudflare, o el texto) sigue parando.
 */
export const SELECTORES_CAPTCHA = [
  'iframe[src*="recaptcha/api2/bframe"]',
  'iframe[src*="recaptcha"]',
  'iframe[src*="hcaptcha"]',
  'iframe[src*="captcha" i]',
  '.g-recaptcha',
  '.cf-turnstile',
  'iframe[src*="challenges.cloudflare.com"]',
  '[class*="captcha" i]',
  '[id*="captcha" i]',
]
export const RE_TEXTO_CAPTCHA = /captcha|no soy un robot|i'?m not a robot|verifica que eres humano/i

/** Cuenta los elementos VISIBLES que casan con `selector` y no son el badge invisible (v3) ni su iframe `anchor`. */
async function visiblesDeReto(page: Page, selector: string): Promise<number> {
  return page
    .locator(selector)
    .filter({ visible: true })
    .evaluateAll((ns) =>
      ns.filter((n) => {
        if (n.closest('.grecaptcha-badge')) return false
        if (n.tagName === 'IFRAME' && /recaptcha\/(?:api2|enterprise)\/anchor/i.test(n.getAttribute('src') ?? '') && /[?&]size=invisible\b/i.test(n.getAttribute('src') ?? '')) return false
        return true
      }).length,
    )
    .catch(() => 0)
}

/** QUÉ casó (el selector o la palabra del texto; nunca un valor de la página), o `null` si no hay reto visible. */
export async function motivoCaptcha(page: Page): Promise<string | null> {
  for (const s of SELECTORES_CAPTCHA) {
    if ((await visiblesDeReto(page, s)) > 0) return `selector ${s}`
  }
  const texto = await page.locator('body').innerText({ timeout: 2_000 }).catch(() => '')
  const m = RE_TEXTO_CAPTCHA.exec(texto)
  return m ? `texto «${m[0].toLowerCase()}»` : null
}

export async function hayCaptcha(page: Page): Promise<boolean> {
  return (await motivoCaptcha(page)) !== null
}

/** Llamar tras cada paso que pueda presentar un reto (login, envío del formulario). */
export async function exigirSinCaptcha(page: Page): Promise<void> {
  const motivo = await motivoCaptcha(page)
  if (motivo) throw new ErrorTarificador('captcha', `el portal presenta un CAPTCHA: requiere una persona (coincide: ${motivo})`)
}
