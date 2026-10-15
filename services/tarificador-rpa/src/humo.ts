// PRUEBA NOCTURNA DE HUMO del worker (15/10/2026). Detecta de madrugada que un portal ha cambiado el login o el menú,
// antes de que un comercial se encuentre el fallo. Por pareja (compañía, ramo): login → llegar a la pantalla de INICIO del
// tarificador (el formulario, sin tocarlo) → cerrar. Asegura encola el trabajo (modo `humo`) y avisa de lo que falle.
//
// 🚨 NO es una tarificación: sin riesgo, sin datos de ningún cliente, sin rellenar un solo campo. Nunca pulsa «Tarificar»,
//    ni alta, emisión o pago: todo clic pasa por los guardas de guard.ts (`ctx.pulsar` = `pulsar(boton, guard)`; el enlace de
//    entrada de Mapfre, por la excepción exacta `pulsarEnlaceEntradaAutorizado`). Lo que no es login ni entrada (opciones,
//    avance, proyecto, PDF) está PROHIBIDO en el contexto de humo: lanza antes de tocar nada.
// ♻️ Reutiliza los login y las entradas de los adaptadores (no duplica selectores). Cada adaptador registrado EXIGE su
//    prueba aquí (test/humo.test.ts): un bot nuevo sin humo no pasa los tests.
// 🔑 Credenciales de fly secrets, en memoria, sin tracing; todo lo que sale pasa por el redactor.

import { chromium, type Browser, type Page } from 'playwright'
import { claveCompania, nombresCredencial, type Credenciales, type TipoError } from '@central/module-tarificacion'
import type { ContextoPortal } from './adaptador.ts'
import { enviarResultado, type Config, type Trabajo } from './api.ts'
import { exigirSinCaptcha } from './captcha.ts'
import { ErrorCredenciales, exigirSinRechazoCredenciales, motivoCredenciales, textoVisiblePagina } from './credenciales.ts'
import { ErrorTarificador, clasificar } from './errores.ts'
import { instalarGuardEmision, pulsar, pulsarEnlaceEntradaAutorizado } from './guard.ts'
import { exigirSinVerificacion } from './verificacion.ts'
import { adaptadores } from './adapters/index.ts'
import { abrirComunidades, allianzComunidades } from './adapters/allianz/comunidades.ts'
import { allianzAuto, allianzMoto } from './adapters/allianz/auto.ts'
import { PRODUCTO_MENU, allianzHogar } from './adapters/allianz/hogar.ts'
import { esperarMarcoApp } from './adapters/allianz/entrada.ts'
import { abrirNuevaAlta, TARJETA_AUTOS } from './adapters/allianz/intranet/entrada.ts'
import { login as loginAllianz } from './adapters/allianz/intranet/sesion.ts'
import { login as loginMapfre } from './adapters/mapfre/login.ts'
import { abrirTarificacionRapidaAuto } from './adapters/mapfre/entrada.ts'
import { abrirTarificacionRapidaHogar, mapfreHogar } from './adapters/mapfre/hogar.ts'
import { mapfreAuto, mapfreMoto } from './adapters/mapfre/auto.ts'
import { login as loginOccidentHogar, abrirTarificacionHogar, occidentHogar } from './adapters/occident/hogar.ts'
import { login as loginOccidentComunidades, abrirFormulario as abrirFormularioOccident, occidentComunidades } from './adapters/occident/comunidades.ts'

export const HUMO_VERSION = '0.1.0'
const TOPE_HUMO_MS = 3 * 60_000
const TOPE_PASO_MS = 30_000

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const azar = (min: number, max: number) => min + Math.random() * (max - min)

/** Contexto de la prueba: el de un adaptador, pero con el enlace de entrada garantizado (Mapfre) y SIN lo demás. */
export type CtxHumo = ContextoPortal & { pulsarEnlaceEntrada: NonNullable<ContextoPortal['pulsarEnlaceEntrada']> }

export type PruebaHumo = {
  /** Clave de la credencial (fly secrets `CRED_<clave>_USER` / `_PASS`): la MISMA del adaptador. */
  credencial: string
  login: (page: Page, ctx: CtxHumo) => Promise<void>
  /** Llega a la pantalla de inicio del tarificador. Sin escribir en ningún campo ni pulsar nada de alta/emisión/pago. */
  entrada: (page: Page, ctx: CtxHumo) => Promise<void>
}

const pestanaAllianz = async (page: Page, ctx: CtxHumo, destino: Parameters<typeof abrirNuevaAlta>[2]) => {
  await abrirNuevaAlta(page, ctx, destino)
  await esperarMarcoApp(page)
}

/** La prueba de cada pareja (compañía/ramo). Las claves son `claveHumo(compania, ramo)`. */
export const PRUEBAS_HUMO: Readonly<Record<string, PruebaHumo>> = Object.freeze({
  'allianz/comunidades': { credencial: allianzComunidades.credencial, login: loginAllianz, entrada: abrirComunidades },
  'allianz/auto': { credencial: allianzAuto.credencial, login: loginAllianz, entrada: (p, c) => pestanaAllianz(p, c, { pestana: 'Autos', producto: 'Turismos', selectorTarjeta: TARJETA_AUTOS.turismos }) },
  'allianz/moto': { credencial: allianzMoto.credencial, login: loginAllianz, entrada: (p, c) => pestanaAllianz(p, c, { pestana: 'Autos', producto: 'Moto', selectorTarjeta: TARJETA_AUTOS.moto }) },
  'allianz/hogar': { credencial: allianzHogar.credencial, login: loginAllianz, entrada: (p, c) => pestanaAllianz(p, c, { pestana: 'Particulares', producto: PRODUCTO_MENU }) },
  'mapfre/auto': { credencial: mapfreAuto.credencial, login: loginMapfre, entrada: entradaMapfreVehiculo },
  'mapfre/moto': { credencial: mapfreMoto.credencial, login: loginMapfre, entrada: entradaMapfreVehiculo },
  'mapfre/hogar': { credencial: mapfreHogar.credencial, login: loginMapfre, entrada: (p, c) => abrirTarificacionRapidaHogar(p, c) },
  'occident/comunidades': { credencial: occidentComunidades.credencial, login: loginOccidentComunidades, entrada: abrirFormularioOccident },
  'occident/hogar': { credencial: occidentHogar.credencial, login: loginOccidentHogar, entrada: async (p, c) => { await abrirTarificacionHogar(p, c) } },
})

async function entradaMapfreVehiculo(page: Page, ctx: CtxHumo): Promise<void> {
  await abrirTarificacionRapidaAuto(page, { pulsar: ctx.pulsar, pausa: ctx.pausa, pulsarEnlaceEntrada: ctx.pulsarEnlaceEntrada, credenciales: ctx.credenciales })
}

/** Clave de la tabla: compañía normalizada + ramo. PURO. */
export function claveHumo(compania: string, ramo: string): string {
  return `${claveCompania(compania)}/${String(ramo).trim().toLowerCase()}`
}

export function pruebaDeHumo(compania: string, ramo: string): PruebaHumo | null {
  const k = claveHumo(compania, ramo)
  return Object.hasOwn(PRUEBAS_HUMO, k) ? PRUEBAS_HUMO[k] : null
}

/** Compañías con algún adaptador REGISTRADO (realmente activo) en esta imagen. Solo ellas se prueban; el resto se OMITE. */
export const HUMO_COMPANIAS_SOPORTADAS: ReadonlySet<string> = new Set(adaptadores.claves().map((k) => k.split('::')[0]))

export type DecisionHumo = { accion: 'probar' } | { accion: 'omitir'; motivo: string } | { accion: 'error'; motivo: string }

/**
 * Qué hacer con un humo recibido. PURO. Compañía sin adaptador registrado, o pareja sin adaptador (flag apagado): OMITIDO, no
 * fallo (no se prueba un portal con un bot que esta imagen no usa). Adaptador sin prueba: error (lo vigila un test).
 */
export function decidirHumo(compania: string, ramo: string, companiasSoportadas: ReadonlySet<string>, hayAdaptador: boolean, prueba: PruebaHumo | null): DecisionHumo {
  if (!companiasSoportadas.has(claveCompania(compania))) return { accion: 'omitir', motivo: `${claveCompania(compania)} no tiene adaptador activo en esta imagen` }
  if (!hayAdaptador) return { accion: 'omitir', motivo: `${claveHumo(compania, ramo)} no tiene adaptador activo en esta imagen` }
  if (!prueba) return { accion: 'error', motivo: `sin prueba de humo para ${claveHumo(compania, ramo)}` }
  return { accion: 'probar' }
}

export type FaseHumo = 'login' | 'menú'

/** Mensaje corto (≤300) del fallo: la fase que cambió y el motivo ya redactado. PURO. */
export function mensajeFalloHumo(fase: FaseHumo, mensaje: string, redactar: (t: string) => string = (t) => t): string {
  const limpio = redactar(mensaje).replace(/\s+/g, ' ').trim()
  return `humo (${fase}): ${limpio}`.slice(0, 300)
}

const prohibido = (nombre: string) => (): never => {
  throw new ErrorTarificador('datos', `humo: «${nombre}» no está permitido en la prueba de humo (solo login y entrada)`)
}

export type DepsHumo = {
  cfg: Config
  trabajo: Trabajo
  env: Record<string, string | undefined>
  log: (m: string, d?: Record<string, unknown>) => void
  redactar: (t: string) => string
}

/** Un trabajo de humo de principio a fin. Devuelve el código de salida del proceso (0 = la prueba pasó). */
export async function ejecutarHumo(d: DepsHumo): Promise<number> {
  const { cfg, trabajo, env, log, redactar } = d
  const error = async (tipo: TipoError, mensaje: string): Promise<number> => {
    const st = await enviarResultado(cfg, { trabajoId: trabajo.id, resultado: 'error', error: { tipo, mensaje: redactar(mensaje).slice(0, 2000), url: null }, botVersion: HUMO_VERSION })
    log('humo_error_enviado', { status: st, tipo })
    return 1
  }

  const prueba = pruebaDeHumo(trabajo.compania, trabajo.ramo)
  const dec = decidirHumo(trabajo.compania, trabajo.ramo, HUMO_COMPANIAS_SOPORTADAS, adaptadores.obtener(trabajo.compania, trabajo.ramo) !== null, prueba)
  if (dec.accion === 'omitir') {
    const st = await enviarResultado(cfg, { trabajoId: trabajo.id, resultado: 'humo', omitido: dec.motivo, botVersion: HUMO_VERSION })
    log('humo_omitido_enviado', { status: st })
    return st >= 200 && st < 300 ? 0 : 1
  }
  if (dec.accion === 'error' || !prueba) return error('datos', dec.accion === 'error' ? dec.motivo : 'sin prueba de humo')

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
      pulsarEnlaceEntrada: (boton) => pulsarEnlaceEntradaAutorizado(boton, guard, trabajo.compania),
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
          await prueba.entrada(page, ctx)
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
  const st = await enviarResultado(cfg, { trabajoId: trabajo.id, resultado: 'humo', botVersion: HUMO_VERSION })
  log('humo_ok_enviado', { status: st })
  return st >= 200 && st < 300 ? 0 : 1
}
