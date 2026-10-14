// Mapfre «Portal de Mediadores» (wmediadores) — LOGIN por código (14/10/2026). Mismo patrón que Allianz
// (`allianz/comunidades.ts#login`): entrada → `exigirSinCaptcha` → usuario y contraseña → `ctx.pulsar()` → CAPTCHA/SMS → parar.
//
// 🚨 SELECTORES GENÉRICOS: la red del entorno de desarrollo bloqueó el render del login (ERR_TUNNEL_CONNECTION_FAILED), así
// que no hay captura real. Se detecta por estructura (input[type=password] visible, el campo de texto visible anterior,
// botón por rol/texto). Fail-closed: sin campos → `ErrorMapaIncompleto`. Sustituir por selectores reales con una captura.
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

/** Texto de los botones de entrada. Nunca «¿Olvidó…?»/«Recuperar…» (no casan) y el guard bloquea esos textos igualmente. */
export const BOTON_ENTRAR = /^\s*(acceder|entrar|iniciar sesi[oó]n|continuar)\s*$/i

const ESPERA_CAMPOS_MS = 20_000
const ESPERA_RESULTADO_MS = 25_000

function campoPassword(page: Page): Locator {
  return page.locator('input[type="password"]').filter({ visible: true }).first()
}

/** El último campo de texto visible ANTES del password en orden de documento. */
function campoUsuario(page: Page): Locator {
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
    .first()
}

async function visible(l: Locator): Promise<boolean> {
  return l.isVisible().catch(() => false)
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
