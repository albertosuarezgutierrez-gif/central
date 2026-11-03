// Sesión de Allianz ePAC (login y sesión reutilizada) — capa de intranet común a todos los ramos. Movido de comunidades.ts
// (14/10/2026, Fase 2 de docs/TARIFICADOR-OPTIMIZACION-AUDITORIA.md). Las reglas de pulsar/CAPTCHA del fichero original siguen vigentes:
// pulsar SIEMPRE con `ctx.pulsar`, nunca `locator.click()`; tras el login `ctx.exigirSinCaptcha()`.

import type { Page } from 'playwright'
import type { ContextoPortal } from '../../../adaptador.ts'
import { ErrorTarificador } from '../../../errores.ts'
import { exigirSinRechazoCredenciales } from '../../../credenciales.ts'

/**
 * Selectores del LOGIN y de la ruta de menú. `null` = PENDIENTE DE CAPTURAS: el adaptador falla en
 * ese paso con `portal` (error_definitivo, no se reintenta) en vez de adivinar.
 * El formulario en sí NO usa selectores: va por etiqueta (ver `campoPorEtiqueta`).
 */
/** URL pública de entrada de ePAC (dada por Alberto, 05/10/2026; no es secreta). */
export const URL_LOGIN_EPAC = 'https://www.e-pacallianz.com/ngx-azs-epac/public/home'
/** Origen de ePAC (el de la entrada): el único en el que se recarga el home (`entrada.ts`). */
export const ORIGEN_EPAC = new URL(URL_LOGIN_EPAC).origin

const SEL = {
  urlLogin: URL_LOGIN_EPAC as string | null,
}

function sel(clave: keyof typeof SEL): string {
  const s = SEL[clave]
  if (!s) throw new ErrorTarificador('portal', `allianz/intranet: selector «${clave}» pendiente de capturas`)
  return s
}

/** Abre la entrada de ePAC. Un 5xx del portal es pasajero: `portal` TRANSITORIO (el runner reintenta una vez). */
async function abrirEntrada(page: Page): Promise<void> {
  const r = await page.goto(sel('urlLogin'))
  const st = r?.status() ?? 0
  if (st >= 500) throw new ErrorTarificador('portal', `allianz/intranet: ePAC respondió ${st} en la entrada`, { transitorio: true })
}

/**
 * Sesión reutilizada (src/sesion.ts): con las cookies de un trabajo anterior (en memoria, TTL 10 min) se abre la
 * entrada y, si aparece la cabecera logueada, NO se hace login. Si no aparece, `false`: login normal.
 */
export async function sesionSirve(page: Page, ctx: Pick<ContextoPortal, 'exigirSinCaptcha' | 'log'>): Promise<boolean> {
  await abrirEntrada(page)
  await ctx.exigirSinCaptcha()
  const ok = await page.getByText('Mediador principal').first().waitFor({ state: 'visible', timeout: 10_000 }).then(() => true, () => false)
  ctx.log(ok ? 'sesión reutilizada: sin login' : 'sesión guardada no válida: login normal')
  return ok
}

export async function login(page: Page, ctx: Pick<ContextoPortal, 'credenciales' | 'pausa' | 'pulsar' | 'exigirSinCaptcha' | 'log'>): Promise<void> {
  await abrirEntrada(page)
  await ctx.exigirSinCaptcha()
  // Login por etiqueta/rol (captura del 05/10/2026). Tracing apagado: lo vigila el guardián de la raíz.
  const usuario = page.getByLabel('Usuario', { exact: true })
  await usuario.fill(ctx.credenciales.usuario)
  await ctx.pausa()
  // Por la etiqueta salen DOS inputs (06/10/2026, strict mode violation): el campo es el
  // input[type=password] VISIBLE. exact: «Contraseña sensible a mayúsculas…» no es la etiqueta.
  await page
    .getByLabel('Contraseña', { exact: true })
    .and(page.locator('input[type="password"]'))
    .filter({ visible: true })
    .first()
    .fill(ctx.credenciales.contrasena)
  await ctx.pausa()
  // NUNCA «Recuperación de contraseña» (el guard la bloquea).
  await ctx.pulsar(page.getByRole('button', { name: 'INICIAR SESIÓN' }))
  await ctx.exigirSinCaptcha()
  // Logueado = aparece «Mediador principal» en la cabecera. Si no aparece, no se reintenta el login
  // (repetir un login rechazado es como se bloquea una cuenta).
  try {
    await page.getByText('Mediador principal').first().waitFor({ state: 'visible', timeout: 25_000 })
  } catch {
    await exigirSinRechazoCredenciales(page, 'allianz')
    throw new ErrorTarificador('portal', 'allianz/sesion: no aparece «Mediador principal» tras el login (sin mensaje de rechazo en pantalla)') // sin texto afirmativo de rechazo no es `credenciales`: fallo normal
  }
  await exigirSinRechazoCredenciales(page, 'allianz', { soloInutilizable: true })
  ctx.log('login ok')
}
