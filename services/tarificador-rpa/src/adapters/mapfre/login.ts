// Mapfre «Portal de Mediadores» (wmediadores) — LOGIN por código (14/10/2026). Mismo patrón que Allianz
// (`allianz/comunidades.ts#login`): entrada → `exigirSinCaptcha` → usuario y contraseña → `ctx.pulsar()` → CAPTCHA/SMS → parar.
//
// PANTALLA REAL (captura de Alberto, 14/10/2026): bloque «Acceso»; «Código de usuario (NUUMA)» (texto); «Contraseña:»
// (password); botón «Entrar» DESHABILITADO hasta que ambos campos tienen valor (formulario Angular); enlace «Cambiar
// contraseña» (JAMÁS se pulsa). Se localiza primero por etiqueta; la detección genérica por estructura queda de respaldo.
// Fail-closed: sin campos o con «Entrar» que no se habilita → `ErrorMapaIncompleto`.
//
// Reglas: pulsar SOLO con `ctx.pulsar()`; NUNCA automatizar un código SMS/OTP (→ `ErrorVerificacionHumana`, requiere_humano);
// un login rechazado NO se reintenta (así se bloquea una cuenta). Ni usuario ni contraseña van al log.

import type { Locator, Page } from 'playwright'
import { ErrorTarificador } from '../../errores.ts'
import { exigirSinVerificacion } from '../../verificacion.ts'
import type { ContextoPortal } from '../../adaptador.ts'
import { ErrorMapaIncompleto } from './auto.ts'

/** URL pública de entrada (dada por Alberto, 14/10/2026; no es secreta). */
export const URL_LOGIN_MAPFRE = 'https://wmediadores.mapfre.com/PortalMediadores_fe-web/#/login'

export type CtxLoginMapfre = Pick<ContextoPortal, 'credenciales' | 'pausa' | 'pulsar' | 'exigirSinCaptcha' | 'log'>

/** Texto de los botones de entrada. Nunca «¿Olvidó…?»/«Recuperar…»/«Cambiar contraseña» (no casan) y el guard bloquea esos textos igualmente. */
export const BOTON_ENTRAR = /^\s*(acceder|entrar|iniciar sesi[oó]n|continuar)\s*$/i
/** Textos que JAMÁS pueden ser el objetivo del clic de entrada. */
export const TEXTO_PROHIBIDO = /cambiar\s+(la\s+)?contrase|olvid|recuper|restablec|registr/i

const ESPERA_HABILITADO_MS = 5_000

const ESPERA_CAMPOS_MS = 20_000
const ESPERA_RESULTADO_MS = 25_000

const ETIQ_USUARIO = /c[oó]digo de usuario/i
const ETIQ_CLAVE = /^\s*contrase[ñn]a\s*:?\s*$/i

/** Campo asociado a una etiqueta: `for`/aria (getByLabel) o, en Angular sin asociar, el primer input tras el texto. */
function porEtiqueta(page: Page, re: RegExp, tipo: 'text' | 'password'): Locator {
  const filtroTipo = tipo === 'password' ? '[@type="password"]' : '[not(@type) or @type="text"]'
  return page
    .getByLabel(re)
    .and(page.locator(tipo === 'password' ? 'input[type="password"]' : 'input:not([type="password"])'))
    .or(page.locator(`xpath=//label[contains(translate(normalize-space(.),"CÓDIGOUSARIN","códigousarin"),"${tipo === 'password' ? 'contraseña' : 'código de usuario'}")]/following::input${filtroTipo}[1]`))
    .filter({ visible: true })
    .first()
}

function campoPassword(page: Page): Locator {
  return porEtiqueta(page, ETIQ_CLAVE, 'password').or(page.locator('input[type="password"]')).filter({ visible: true }).first()
}

/** El último campo de texto visible ANTES del password en orden de documento. */
function campoUsuario(page: Page): Locator {
  return porEtiqueta(page, ETIQ_USUARIO, 'text').or(campoUsuarioGenerico(page)).filter({ visible: true }).first()
}

function campoUsuarioGenerico(page: Page): Locator {
  return page
    .locator('xpath=(//input[@type="password"])[1]/preceding::input[not(@type) or @type="text" or @type="email" or @type="tel"]')
    .filter({ visible: true })
    .last()
}

function botonEntrar(page: Page): Locator {
  return page
    .getByRole('button', { name: BOTON_ENTRAR })
    .or(page.locator('button[type="submit"], input[type="submit"]'))
    .filter({ visible: true })
    .filter({ hasNotText: TEXTO_PROHIBIDO })
    .first()
}

async function visible(l: Locator): Promise<boolean> {
  return l.isVisible().catch(() => false)
}

async function habilitado(l: Locator): Promise<boolean> {
  return l.isEnabled().catch(() => false)
}

async function esperarHabilitado(l: Locator): Promise<boolean> {
  const fin = Date.now() + ESPERA_HABILITADO_MS
  for (;;) {
    if (await habilitado(l)) return true
    if (Date.now() >= fin) return false
    await l.page().waitForTimeout(150)
  }
}

export async function login(page: Page, ctx: CtxLoginMapfre, urlLogin: string = URL_LOGIN_MAPFRE): Promise<void> {
  const r = await page.goto(urlLogin)
  const st = r?.status() ?? 0
  if (st >= 500) throw new ErrorTarificador('portal', `mapfre/login: wmediadores respondió ${st} en la entrada`, { transitorio: true })
  await ctx.exigirSinCaptcha()

  // SPA Angular: el formulario se pinta tras cargar. Sin password visible en el plazo → mapa incompleto (no se adivina).
  const password = campoPassword(page)
  try {
    await password.waitFor({ state: 'visible', timeout: ESPERA_CAMPOS_MS })
  } catch {
    throw new ErrorMapaIncompleto('los selectores del login de wmediadores (no aparece ningún campo de contraseña)')
  }
  const usuario = campoUsuario(page)
  if (!(await visible(usuario))) throw new ErrorMapaIncompleto('el selector del campo de usuario del login de wmediadores')
  const entrar = botonEntrar(page)
  if (!(await visible(entrar))) throw new ErrorMapaIncompleto('el selector del botón de entrada del login de wmediadores')

  await usuario.fill(ctx.credenciales.usuario)
  await ctx.pausa()
  await password.fill(ctx.credenciales.contrasena)
  await ctx.pausa()
  // Angular: «Entrar» sigue deshabilitado hasta que ve valor en ambos campos. Si `fill` no bastó, se despachan input/change/blur.
  if (!(await habilitado(entrar))) {
    for (const c of [usuario, password]) {
      await c.evaluate((el) => {
        for (const ev of ['input', 'change', 'blur']) el.dispatchEvent(new Event(ev, { bubbles: true }))
      }).catch(() => undefined)
    }
  }
  if (!(await esperarHabilitado(entrar))) {
    throw new ErrorMapaIncompleto('que el botón «Entrar» de wmediadores se habilite al rellenar usuario y contraseña (sigue deshabilitado; no se pulsa)')
  }
  await ctx.pulsar(entrar)

  // Resultado: SMS/OTP o CAPTCHA → PARAR; contraseña que desaparece → dentro; si no, credenciales (sin reintentar).
  const fin = Date.now() + ESPERA_RESULTADO_MS
  for (;;) {
    await ctx.exigirSinCaptcha()
    await exigirSinVerificacion(page, 'mapfre')
    if (!(await visible(campoPassword(page)))) break
    if (Date.now() >= fin) {
      throw new ErrorTarificador('credenciales', 'mapfre/login: el formulario de acceso sigue visible tras enviar (credenciales rechazadas o portal distinto)')
    }
    await page.waitForTimeout(500)
  }
  // Una verificación puede pintarse justo al irse el formulario: segunda mirada con la pantalla ya cambiada.
  await page.waitForTimeout(1_000)
  await exigirSinVerificacion(page, 'mapfre')
  await ctx.exigirSinCaptcha()
  ctx.log('login ok')
}
