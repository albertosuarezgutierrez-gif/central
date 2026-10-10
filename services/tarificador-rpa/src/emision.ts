// EMISIÓN asistida del worker (10/10/2026). Diseño: docs/TARIFICADOR-EMISION-DISENO.md.
//
//   fase `preparar`: login → pantalla PREVIA (sin pulsar nada que emita) → prima + captura → `pre_emision` → exit.
//   fase `ejecutar`: (Alberto ya autorizó por Telegram) login → pantalla previa → relee la prima → canjea el token
//                    (asegura recalcula el hash con ESA prima: un céntimo de diferencia = no) → con el permiso de un solo
//                    uso, `pulsarEmisionAutorizada` pulsa UN botón UNA vez → lee el nº de póliza → `emitida`/`incierto`.
//
// 🚨 Fail-closed en todo: interruptor de la MÁQUINA (`TARIFICADOR_EMISION_ACTIVA=1`, fly secret) además del de asegura;
//    adaptador sin `emision` o fuera de la lista blanca del módulo → no; prima ilegible → no; canje no OK → no; botón del
//    canje ≠ botón de la lista blanca local → no. Un fallo ANTES del clic = `no_emitida`; DESPUÉS = `incierto` (nunca se
//    reintenta: una persona mira el portal).
// 🔑 El token no va a ningún log ni mensaje (`sinTokens` sobre todo lo que sale). Sin tracing. Contexto limpio.

import { chromium, type Browser } from 'playwright'
import {
  EmisionBloqueadaError,
  botonEmisionDe,
  crearPermisoEmision,
  emisionActiva,
  sinTokens,
  type Credenciales,
  type RiesgoComunidad,
  type Traza,
} from '@central/module-tarificacion'
import type { AdaptadorPortal, ContextoPortal } from './adaptador.ts'
import { canjearToken, enviarResultadoEmision, type Config, type CuerpoEmision, type Trabajo } from './api.ts'
import { exigirSinCaptcha } from './captcha.ts'
import { clasificar } from './errores.ts'
import { elegirOpcion, instalarGuardEmision, pulsar, pulsarAvance, pulsarEmisionAutorizada, pulsarProyecto } from './guard.ts'
import { exigirSinVerificacion } from './verificacion.ts'

const TOPE_MS = 4 * 60_000
const TOPE_PASO_MS = 30_000
/** Tras el clic: cuánto se espera a que ePAC pinte la respuesta antes de leerla. */
const ESPERA_TRAS_CLIC_MS = 8_000
const MAX_BYTES_CAPTURA = 4 * 1024 * 1024

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const azar = (min: number, max: number) => min + Math.random() * (max - min)

export type DepsEmision = {
  cfg: Config
  trabajo: Trabajo
  adaptador: AdaptadorPortal
  riesgo: RiesgoComunidad
  credenciales: Credenciales
  env: Record<string, string | undefined>
  traza: Traza
  log: (m: string, d?: Record<string, unknown>) => void
  redactar: (t: string) => string
}

/** Motivo por el que este trabajo de emisión NO puede ni empezar. `null` = puede. PURO (lo vigila el test). */
export function motivoParaNoEmitir(t: Pick<Trabajo, 'compania' | 'ramo' | 'emision'>, adaptador: Pick<AdaptadorPortal, 'emision' | 'sesion'> | null, env: Record<string, string | undefined>): string | null {
  if (!emisionActiva(env)) return 'emisión apagada en la máquina (TARIFICADOR_EMISION_ACTIVA)'
  if (!t.emision || (t.emision.fase !== 'preparar' && t.emision.fase !== 'ejecutar')) return 'trabajo de emisión sin fase'
  if (!adaptador?.emision) return `el adaptador de ${t.compania}/${t.ramo} no emite`
  if (adaptador.sesion === 'manual') return 'un portal de sesión manual no emite'
  if (!botonEmisionDe(t.compania, t.ramo)) return `emisión no habilitada para ${t.compania}/${t.ramo}`
  return null
}

/** ¿El botón que devuelve el canje es EXACTAMENTE el de la lista blanca local? (asegura no puede abrir otro). PURO. */
export function botonDelCanjeValido(compania: string, ramo: string, boton: { id: string; texto: string }): boolean {
  const local = botonEmisionDe(compania, ramo)
  return !!local && local.id === boton.id && local.texto === boton.texto
}

export async function ejecutarEmision(d: DepsEmision): Promise<number> {
  const { cfg, trabajo, log } = d
  const token = trabajo.emision?.fase === 'ejecutar' ? trabajo.emision.token : null
  const limpio = (t: string) => sinTokens(d.redactar(t), token ? [token] : []).slice(0, 500)
  const enviar = async (cuerpo: CuerpoEmision) => {
    const st = await enviarResultadoEmision(cfg, cuerpo)
    log('emision_resultado_enviado', { status: st, resultado: cuerpo.resultado })
    return cuerpo.resultado === 'pre_emision' || cuerpo.resultado === 'emitida' ? (st >= 200 && st < 300 ? 0 : 1) : 1
  }

  const no = motivoParaNoEmitir(trabajo, d.adaptador, d.env)
  if (no) {
    log('emision_no_permitida', { motivo: no })
    return enviar({ trabajoId: trabajo.id, resultado: 'no_emitida', motivo: no })
  }
  const emision = d.adaptador.emision!
  const fase = trabajo.emision!.fase

  let browser: Browser | null = null
  let pulsado = false
  let tope: ReturnType<typeof setTimeout> | undefined
  try {
    browser = await chromium.launch({ headless: true })
    // Contexto LIMPIO (sin sesión en memoria ni de disco): la emisión siempre entra con login propio.
    const context = await browser.newContext({ locale: 'es-ES', timezoneId: 'Europe/Madrid', acceptDownloads: false })
    const guard = await instalarGuardEmision(context)
    const page = await context.newPage()
    page.setDefaultTimeout(TOPE_PASO_MS)
    page.setDefaultNavigationTimeout(TOPE_PASO_MS)
    const captura = async (): Promise<string | undefined> => {
      const b = await page.screenshot({ type: 'png', fullPage: false, timeout: 10_000 }).catch(() => null)
      return b && b.length <= MAX_BYTES_CAPTURA ? b.toString('base64') : undefined
    }

    const ctx: ContextoPortal = {
      trabajoId: trabajo.id,
      credenciales: d.credenciales,
      log: (m) => log(limpio(m)),
      pausa: () => dormir(azar(800, 2_500)),
      pausaAccion: () => dormir(azar(300, 1_200)),
      sesionReutilizada: false,
      sesionManual: false,
      trasLogin: async () => {
        log('tras_login')
        await exigirSinVerificacion(page, trabajo.compania)
      },
      // La emisión no descarga nada: un PDF aquí sería un error de flujo.
      adjuntarPdf: () => { throw new Error('emision: no se adjuntan PDF') },
      pulsar: async (boton) => {
        await ctx.pausaAccion()
        await pulsar(boton, guard)
      },
      elegirOpcion: (m) => elegirOpcion(page, guard, m),
      avanzarATarificar: () => pulsarAvance(page, guard),
      abrirProyecto: (pestana) => pulsarProyecto(page, pestana, guard),
      exigirSinCaptcha: () => exigirSinCaptcha(page),
      formador: undefined,
      paso: d.traza.paso,
    }

    const flujo = async (): Promise<number> => {
      const { primaCents } = await emision.hastaPantallaPrevia(page, d.riesgo, ctx)
      guard.comprobar()
      if (primaCents === null) {
        return enviar({ trabajoId: trabajo.id, resultado: 'no_emitida', motivo: 'no se pudo leer la prima de la pantalla previa', capturaBase64: await captura() })
      }
      if (fase === 'preparar') {
        // NO se pulsa nada más: se devuelve la prima y la captura; asegura decide si se pide el botón a Alberto.
        return enviar({ trabajoId: trabajo.id, resultado: 'pre_emision', primaCents, capturaBase64: await captura() })
      }
      // ── ejecutar ──
      const canje = await canjearToken(cfg, { trabajoId: trabajo.id, token: token!, primaCents })
      if (!canje.ok) {
        log('emision_canje_rechazado', { motivo: canje.motivo })
        return enviar({ trabajoId: trabajo.id, resultado: 'no_emitida', motivo: `canje rechazado: ${canje.motivo}`, capturaBase64: await captura() })
      }
      if (!botonDelCanjeValido(trabajo.compania, trabajo.ramo, canje.boton)) {
        return enviar({ trabajoId: trabajo.id, resultado: 'no_emitida', motivo: 'el botón del canje no es el de la lista blanca', capturaBase64: await captura() })
      }
      const permiso = crearPermisoEmision({ trabajoId: trabajo.id, hashDatos: canje.hashDatos, boton: canje.boton })
      if (!ctx.pulsarEmision) ctx.pulsarEmision = (p, v) => pulsarEmisionAutorizada(page, guard, p, v)
      // El guard rechaza ANTES de pulsar con `EmisionBloqueadaError` (fase, DOM, permiso): eso es «no emitida». Cualquier
      // otro fallo desde aquí es «incierto» (el clic pudo salir).
      pulsado = true
      try {
        await ctx.pulsarEmision(permiso, { trabajoId: trabajo.id, hashDatos: canje.hashDatos })
      } catch (e) {
        if (e instanceof EmisionBloqueadaError) pulsado = false
        throw e
      }
      log('emision_pulsada')
      await dormir(ESPERA_TRAS_CLIC_MS)
      const numeroPoliza = await emision.leerNumeroPoliza(page).catch(() => null)
      const imagen = await captura()
      guard.ventana.cerrar()
      if (numeroPoliza) return enviar({ trabajoId: trabajo.id, resultado: 'emitida', numeroPoliza, capturaBase64: imagen })
      return enviar({ trabajoId: trabajo.id, resultado: 'incierto', motivo: 'tras pulsar no se leyó un nº de póliza inequívoco', capturaBase64: imagen })
    }

    return await Promise.race([
      flujo(),
      new Promise<never>((_, rechazar) => {
        tope = setTimeout(() => rechazar(new Error(`tope de ${TOPE_MS / 1000} s superado`)), TOPE_MS)
      }),
    ])
  } catch (e) {
    const c = clasificar(e)
    const motivo = limpio(`${c.tipo}: ${c.mensaje}`)
    log('emision_fallo', { pulsado, motivo })
    return enviar({ trabajoId: trabajo.id, resultado: pulsado ? 'incierto' : 'no_emitida', motivo })
  } finally {
    clearTimeout(tope)
    await browser?.close().catch(() => undefined)
  }
}
