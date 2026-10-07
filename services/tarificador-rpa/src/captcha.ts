// CAPTCHA → `requiere_humano`. NUNCA se intenta resolver, saltar ni externalizar.

import type { Page } from 'playwright'
import { ErrorTarificador } from './errores.ts'

const SELECTORES_CAPTCHA = [
  'iframe[src*="recaptcha"]',
  'iframe[src*="hcaptcha"]',
  'iframe[src*="captcha" i]',
  '[class*="captcha" i]',
  '[id*="captcha" i]',
  '.g-recaptcha',
  '.cf-turnstile',
  'iframe[src*="challenges.cloudflare.com"]',
]

export async function hayCaptcha(page: Page): Promise<boolean> {
  for (const s of SELECTORES_CAPTCHA) {
    if ((await page.locator(s).count().catch(() => 0)) > 0) return true
  }
  const texto = await page.locator('body').innerText({ timeout: 2_000 }).catch(() => '')
  return /captcha|no soy un robot|i'?m not a robot|verifica que eres humano/i.test(texto)
}

/** Llamar tras cada paso que pueda presentar un reto (login, envío del formulario). */
export async function exigirSinCaptcha(page: Page): Promise<void> {
  if (await hayCaptcha(page)) throw new ErrorTarificador('captcha', 'el portal presenta un CAPTCHA: requiere una persona')
}
