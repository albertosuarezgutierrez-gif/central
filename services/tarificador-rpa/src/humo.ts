// PRUEBA NOCTURNA DE HUMO del worker (15/10/2026). Detecta de madrugada que un portal ha cambiado el login o el menú,
// antes de que un comercial se encuentre el fallo. Por COMPAÑÍA (un solo inicio de sesión por credencial y noche): login →
// comprobar que el menú de entrada al tarificador existe y es VISIBLE → cerrar. Asegura encola el trabajo (modo `humo`) y avisa.
//
// 🚨 NO es una tarificación: sin riesgo, sin datos de ningún cliente, sin rellenar un solo campo. NO pulsa nada tras el login:
//    ni «Nueva Alta», ni elegir producto, ni abrir el formulario (podría crear un borrador en el portal). Solo comprueba que el
//    control de entrada está a la vista. El único clic es el del propio login, por el guard (`ctx.pulsar` = `pulsar(boton, guard)`).
//    Lo demás (opciones, avance, proyecto, PDF, enlace de entrada) está PROHIBIDO o ausente en el contexto de humo.
// ♻️ Reutiliza los login (y, en Mapfre, el localizador del menú) de los adaptadores: no duplica selectores. Cada adaptador
//    registrado EXIGE su prueba aquí (test/humo.test.ts): un bot nuevo sin humo no pasa los tests.
// 🎯 El RAMO lo elige el worker: un ramo con bot activo en ESTA imagen (el que pide asegura si lo tiene; si no, el primero). Y
//    devuelve los ramos con bot, para que asegura avise de «integración activa sin bot».
// 🔑 Credenciales de fly secrets, en memoria, sin tracing; todo lo que sale pasa por el redactor.

import { chromium, type Browser, type Page } from 'playwright'
import { claveCompania, nombresCredencial, type Credenciales, type TipoError } from '@central/module-tarificacion'
import type { ContextoPortal } from './adaptador.ts'
import { enviarResultado, type Config, type Trabajo } from './api.ts'
import { exigirSinCaptcha } from './captcha.ts'
import { ErrorCredenciales, exigirSinRechazoCredenciales, motivoCredenciales, textoVisiblePagina } from './credenciales.ts'
import { ErrorTarificador, clasificar } from './errores.ts'
import { instalarGuardEmision, pulsar } from './guard.ts'
import { exigirSinVerificacion } from './verificacion.ts'
import { adaptadores } from './adapters/index.ts'
import { allianzComunidades } from './adapters/allianz/comunidades.ts'
import { allianzAuto, allianzMoto } from './adapters/allianz/auto.ts'
import { allianzHogar } from './adapters/allianz/hogar.ts'
import { textoExacto } from './adapters/allianz/intranet/entrada.ts'
import { login as loginAllianz } from './adapters/allianz/intranet/sesion.ts'
import { login as loginMapfre } from './adapters/mapfre/login.ts'
import { PESTANA_NUEVA_PRODUCCION, localizar } from './adapters/mapfre/entrada.ts'
import { mapfreHogar } from './adapters/mapfre/hogar.ts'
import { mapfreAuto, mapfreMoto } from './adapters/mapfre/auto.ts'

export const HUMO_VERSION = '0.2.0'
const TOPE_HUMO_MS = 3 * 60_000
const TOPE_PASO_MS = 30_000
const ESPERA_MENU_MS = 20_000

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const azar = (min: number, max: number) => min + Math.random() * (max - min)

/** Contexto de la prueba: el mínimo para el login. Sin enlace de entrada, sin opciones, sin avance, sin proyecto, sin PDF. */
export type CtxHumo = ContextoPortal

export type PruebaHumo = {
  /** Clave de la credencial (fly secrets `CRED_<clave>_USER` / `_PASS`): la MISMA del adaptador. */
  credencial: string
  login: (page: Page, ctx: CtxHumo) => Promise<void>
  /** El menú de entrada al tarificador existe y es VISIBLE. SOLO LECTURA: no pulsa nada, no abre nada (podría crear un borrador). */
  menu: (page: Page, ctx: CtxHumo) => Promise<void>
}

/** ePAC: «Nueva Alta» (`#link_new_policy` o el botón de ese nombre) a la vista. NO se pulsa: pulsarlo abre el modal de altas. */
async function menuAllianz(page: Page): Promise<void> {
  const nuevaAlta = page.locator('#link_new_policy').or(page.getByRole('button', { name: textoExacto('Nueva Alta') })).filter({ visible: true }).first()
  try {
    await nuevaAlta.waitFor({ state: 'visible', timeout: ESPERA_MENU_MS })
  } catch {
    throw new ErrorTarificador('portal', 'allianz: el menú «Nueva Alta» no está visible tras el login')
  }
}

/** wmediadores: la pestaña «Nueva producción» a la vista (`localizar` solo espera visibilidad). NO se pulsa: despliega los ramos. */
async function menuMapfre(page: Page): Promise<void> {
  await localizar(page, ['tab'], PESTANA_NUEVA_PRODUCCION, 'pestaña', ESPERA_MENU_MS)
}

/** La prueba de cada pareja (compañía/ramo). Las claves son `claveHumo(compania, ramo)`. */
export const PRUEBAS_HUMO: Readonly<Record<string, PruebaHumo>> = Object.freeze({
  'allianz/comunidades': { credencial: allianzComunidades.credencial, login: loginAllianz, menu: menuAllianz },
  'allianz/auto': { credencial: allianzAuto.credencial, login: loginAllianz, menu: menuAllianz },
  'allianz/moto': { credencial: allianzMoto.credencial, login: loginAllianz, menu: menuAllianz },
  'allianz/hogar': { credencial: allianzHogar.credencial, login: loginAllianz, menu: menuAllianz },
  'mapfre/auto': { credencial: mapfreAuto.credencial, login: loginMapfre, menu: menuMapfre },
  'mapfre/moto': { credencial: mapfreMoto.credencial, login: loginMapfre, menu: menuMapfre },
  'mapfre/hogar': { credencial: mapfreHogar.credencial, login: loginMapfre, menu: menuMapfre },
})

/** Clave de la tabla: compañía normalizada + ramo. PURO. */
export function claveHumo(compania: string, ramo: string): string {
  return `${claveCompania(compania)}/${String(ramo).trim().toLowerCase()}`
}

export function pruebaDeHumo(compania: string, ramo: string): PruebaHumo | null {
  const k = claveHumo(compania, ramo)
  return Object.hasOwn(PRUEBAS_HUMO, k) ? PRUEBAS_HUMO[k] : null
}

/** Ramos de `compania` con adaptador REGISTRADO en esta imagen (claves `compania::ramo` del registro) y con prueba. Orden estable. PURO. */
export function ramosConBotDe(compania: string, clavesRegistro: readonly string[], pruebas: Readonly<Record<string, PruebaHumo>> = PRUEBAS_HUMO): string[] {
  const c = claveCompania(compania)
  return clavesRegistro
    .map((k) => k.split('::'))
    .filter(([comp, ramo]) => comp === c && !!ramo && Object.hasOwn(pruebas, `${comp}/${ramo}`))
    .map(([, ramo]) => ramo!)
    .sort()
}

/** Compañías con algún adaptador REGISTRADO (realmente activo) en esta imagen. */
export const HUMO_COMPANIAS_SOPORTADAS: ReadonlySet<string> = new Set(adaptadores.claves().map((k) => k.split('::')[0]))

export type DecisionHumo =
  | { accion: 'probar'; ramo: string; ramosConBot: string[] }
  | { accion: 'omitir'; motivo: string; ramosConBot: string[] }

/**
 * Qué hacer con un humo recibido. PURO. El worker elige el ramo: el pedido por asegura si tiene bot activo en la imagen; si no, el
 * primero que lo tenga. Compañía sin ningún bot activo → OMITIR (asegura lo cuenta como «integración activa sin bot»).
 */
export function decidirHumo(compania: string, ramoPedido: string, clavesRegistro: readonly string[], companiasSoportadas: ReadonlySet<string> = HUMO_COMPANIAS_SOPORTADAS, pruebas: Readonly<Record<string, PruebaHumo>> = PRUEBAS_HUMO): DecisionHumo {
  const ramosConBot = ramosConBotDe(compania, clavesRegistro, pruebas)
  if (!companiasSoportadas.has(claveCompania(compania)) || ramosConBot.length === 0) {
    return { accion: 'omitir', motivo: `${claveCompania(compania)} no tiene bot activo en esta imagen`, ramosConBot: [] }
  }
  const pedido = String(ramoPedido).trim().toLowerCase()
  return { accion: 'probar', ramo: ramosConBot.includes(pedido) ? pedido : ramosConBot[0]!, ramosConBot }
}

export type FaseHumo = 'login' | 'menú'

/** Mensaje corto (≤300) del fallo: la fase que cambió y el motivo ya redactado. PURO. */
export function mensajeFalloHumo(fase: FaseHumo, mensaje: string, redactar: (t: string) => string = (t) => t): string {
  const limpio = redactar(mensaje).replace(/\s+/g, ' ').trim()
  return `humo (${fase}): ${limpio}`.slice(0, 300)
}

const prohibido = (nombre: string) => (): never => {
  throw new ErrorTarificador('datos', `humo: «${nombre}» no está permitido en la prueba de humo (solo login y ver el menú)`)
}

export type DepsHumo = {
  cfg: Config
  trabajo: Trabajo
  env: Record<string, string | undefined>
  log: (m: string, d?: Record<string, unknown>) => void
  redactar: (t: string) => string
}

/** Un trabajo de humo de principio a fin. Devuelve el código de salida del proceso (0 = la prueba pasó o se omitió). */
export async function ejecutarHumo(d: DepsHumo): Promise<number> {
  const { cfg, trabajo, env, log, redactar } = d
  const error = async (tipo: TipoError, mensaje: string): Promise<number> => {
    const st = await enviarResultado(cfg, { trabajoId: trabajo.id, resultado: 'error', error: { tipo, mensaje: redactar(mensaje).slice(0, 2000), url: null }, botVersion: HUMO_VERSION })
    log('humo_error_enviado', { status: st, tipo })
    return 1
  }

  const dec = decidirHumo(trabajo.compania, trabajo.ramo, adaptadores.claves())
  if (dec.accion === 'omitir') {
    const st = await enviarResultado(cfg, { trabajoId: trabajo.id, resultado: 'humo', omitido: dec.motivo, ramosConBot: dec.ramosConBot, botVersion: HUMO_VERSION })
    log('humo_omitido_enviado', { status: st })
    return st >= 200 && st < 300 ? 0 : 1
  }
  const prueba = pruebaDeHumo(trabajo.compania, dec.ramo)
  if (!prueba) return error('datos', `sin prueba de humo para ${claveHumo(trabajo.compania, dec.ramo)}`)

  const n = nombresCredencial(prueba.credencial)
  const usuario = env[n.usuario] ?? ''
  const contrasena = env[n.contrasena] ?? ''
  if (!usuario || !contrasena) return error('credenciales', `faltan los fly secrets ${n.usuario} / ${n.contrasena}`)
  const credenciales: Credenciales = { usuario, contrasena }

  const respaldo = setTimeout(() => {
    log('tope_duro_superado: salida forzada')
    process.exit(2)
  }, TOPE_HUMO_MS + 60_000)
  respaldo.unref()

  let browser: Browser | null = null
  let fase: FaseHumo = 'login'
  let fallo: unknown = null
  let actual: Page | null = null
  try {
    browser = await chromium.launch({ headless: true })
    // Contexto LIMPIO: sin cookies, sin sesión previa, sin descargas. Sin tracing (las credenciales irían al trace).
    const context = await browser.newContext({ locale: 'es-ES', timezoneId: 'Europe/Madrid', acceptDownloads: false })
    const guard = await instalarGuardEmision(context)
    const page = await context.newPage()
    actual = page
    page.setDefaultTimeout(TOPE_PASO_MS)
    page.setDefaultNavigationTimeout(TOPE_PASO_MS)
    const ctx: CtxHumo = {
      trabajoId: trabajo.id,
      credenciales,
      log: (m) => log(m),
      pausa: () => dormir(azar(800, 2_500)),
      pausaAccion: () => dormir(azar(300, 1_200)),
      sesionReutilizada: false,
      sesionManual: false,
      trasLogin: async () => {
        // ¿Pide un código (SMS/OTP)? O ¿la cuenta está bloqueada / caducada? Entonces se para: es un hallazgo, no se sigue.
        await exigirSinVerificacion(page, trabajo.compania)
        await exigirSinRechazoCredenciales(page, trabajo.compania, { soloInutilizable: true })
      },
      adjuntarPdf: prohibido('adjuntarPdf'),
      pulsar: async (boton) => {
        await ctx.pausaAccion()
        await pulsar(boton, guard)
      },
      elegirOpcion: prohibido('elegirOpcion'),
      avanzarATarificar: prohibido('avanzarATarificar'),
      abrirProyecto: prohibido('abrirProyecto'),
      exigirSinCaptcha: () => exigirSinCaptcha(page),
      paso: (_nombre, fn) => fn(),
    }
    let tope: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        (async () => {
          await prueba.login(page, ctx)
          await ctx.trasLogin()
          fase = 'menú'
          await prueba.menu(page, ctx)
          guard.comprobar()
        })(),
        new Promise<never>((_, rechazar) => {
          tope = setTimeout(() => rechazar(new ErrorTarificador('infra', `tope de la prueba de ${Math.round(TOPE_HUMO_MS / 1000)} s superado`)), TOPE_HUMO_MS)
        }),
      ])
    } catch (e) {
      fallo = guard.violacion() ?? e
    } finally {
      clearTimeout(tope)
    }

    // Un fallo «del portal» con el formulario de acceso a la vista y un mensaje de rechazo/bloqueo → es de CREDENCIALES.
    if (fallo && clasificar(fallo).tipo === 'portal') {
      const loginVisible = await page.locator('input[type="password"]').filter({ visible: true }).count().then((c) => c > 0, () => false)
      if (loginVisible) {
        const m = motivoCredenciales(await textoVisiblePagina(page))
        if (m) fallo = new ErrorCredenciales(trabajo.compania, m)
      }
    }
  } catch (e) {
    // El propio navegador no arrancó o se cayó: infraestructura.
    fallo = e
    fase = 'login'
  } finally {
    await actual?.context().close().catch(() => undefined)
    await browser?.close().catch(() => undefined)
    clearTimeout(respaldo)
  }

  if (fallo) {
    const c = clasificar(fallo)
    return error(c.tipo === 'portal' && !actual ? 'infra' : c.tipo, mensajeFalloHumo(fase, c.mensaje, redactar))
  }
  const st = await enviarResultado(cfg, { trabajoId: trabajo.id, resultado: 'humo', ramoProbado: dec.ramo, ramosConBot: dec.ramosConBot, botVersion: HUMO_VERSION })
  log('humo_ok_enviado', { status: st })
  return st >= 200 && st < 300 ? 0 : 1
}
