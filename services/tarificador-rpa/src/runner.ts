// Runner del worker del tarificador RPA (05/10/2026). UNA máquina efímera de Fly = UN trabajo:
//   JOB_ID → GET trabajo → navegador nuevo + contexto limpio → adaptador → POST resultado → exit.
// Tope global 4 min; 30 s por paso. En fallo: captura + HTML (redactado) al resultado.
//
// 🚨 TARIFICAR ≠ EMITIR (guard.ts). 🔑 Credenciales solo de fly secrets, solo en memoria, sin tracing
//    (nunca se arranca `context.tracing`) y con todo lo que sale pasado por el redactor.

import { chromium, type Browser } from 'playwright'
import {
  nombresCredencial,
  redactarHtml,
  secretosDelEntorno,
  validarRiesgoComunidad,
  variablesProhibidas,
  type Credenciales,
  type OfertaNormalizada,
  type PdfRef,
} from '@central/module-tarificacion'
import { adaptadores } from './adapters/index.ts'
import { enviarResultado, leerConfig, pedirTrabajo, type Config, type CuerpoResultado } from './api.ts'
import { exigirSinCaptcha } from './captcha.ts'
import { ErrorTarificador, clasificar } from './errores.ts'
import { elegirOpcion, instalarGuardEmision, pulsar, pulsarAvance, pulsarProyecto } from './guard.ts'
import { crearLog } from './log.ts'
import { htmlConMarcos } from './evidencia.ts'
import { cerrarFormador, prepararFormador } from './formador.ts'
import type { ContextoPortal } from './adaptador.ts'

const TOPE_GLOBAL_MS = 4 * 60_000
const TOPE_PASO_MS = 30_000
const PAUSA_MIN_MS = 800
const PAUSA_MAX_MS = 2_500
const MAX_BYTES_EVIDENCIA = 4 * 1024 * 1024

async function main(): Promise<number> {
  const env = process.env
  const { log, redactar } = crearLog(env, env.JOB_ID ?? null)

  // Un entorno con la cartera o con Codeoscopic NO arranca: ni siquiera habla con asegura.
  const prohibidas = variablesProhibidas(env)
  if (prohibidas.length) {
    log('entorno_prohibido: el worker no puede tener estas variables; se sale sin hacer nada', { variables: prohibidas })
    return 3
  }

  let cfg: Config
  try {
    cfg = leerConfig(env)
  } catch (e) {
    log('config_invalida', { error: e instanceof Error ? e.message : String(e) })
    return 3
  }

  const t = await pedirTrabajo(cfg).catch((e: unknown) => ({ estado: 'no_disponible' as const, status: 0, e }))
  if (t.estado !== 'ok') {
    // 404 = ya no está en curso (lease vencido/cancelado); 503 = canal apagado. Nada que hacer.
    log('trabajo_no_disponible', { status: t.status })
    return 0
  }
  const { trabajo } = t

  const fallo = (tipo: 'datos' | 'credenciales', mensaje: string) =>
    enviarResultado(cfg, { trabajoId: trabajo.id, resultado: 'error', error: { tipo, mensaje, url: null } })

  const adaptador = adaptadores.obtener(trabajo.compania, trabajo.ramo)
  if (!adaptador) {
    await fallo('datos', `sin adaptador para ${trabajo.compania}/${trabajo.ramo} en esta imagen`)
    return 1
  }
  const v = validarRiesgoComunidad(trabajo.riesgo)
  if (!v.ok) {
    await fallo('datos', `riesgo inválido: ${v.errores.join('; ')}`)
    return 1
  }
  let credenciales: Credenciales
  try {
    const n = nombresCredencial(adaptador.credencial)
    const usuario = env[n.usuario] ?? ''
    const contrasena = env[n.contrasena] ?? ''
    if (!usuario || !contrasena) throw new Error(`faltan los fly secrets ${n.usuario} / ${n.contrasena}`)
    credenciales = { usuario, contrasena }
  } catch (e) {
    await fallo('credenciales', e instanceof Error ? e.message : String(e))
    return 1
  }

  // Formador con IA: lo enciende asegura (`TARIFICADOR_FORMADOR_ACTIVO`); si no responde, apagado.
  const formador = await prepararFormador({
    trabajoId: trabajo.id, compania: trabajo.compania, ramo: trabajo.ramo, apiUrl: cfg.apiUrl, secreto: cfg.secreto,
    redactar, log: (m, d) => log(m, d),
  })

  const pdfs: { nombre: string; base64: string }[] = []
  let browser: Browser | null = null
  // Respaldo duro: si algo se cuelga por encima del tope (incluido el cierre del navegador), se sale.
  const respaldo = setTimeout(() => {
    log('tope_duro_superado: salida forzada')
    process.exit(2)
  }, TOPE_GLOBAL_MS + 45_000)
  respaldo.unref()

  try {
    browser = await chromium.launch({ headless: true })
    // Contexto LIMPIO por trabajo: sin estado guardado, sin cookies de otra ejecución.
    const context = await browser.newContext({ locale: 'es-ES', timezoneId: 'Europe/Madrid', acceptDownloads: true })
    const guard = await instalarGuardEmision(context)
    const page = await context.newPage()
    page.setDefaultTimeout(TOPE_PASO_MS)
    page.setDefaultNavigationTimeout(TOPE_PASO_MS)

    const ctx: ContextoPortal = {
      trabajoId: trabajo.id,
      credenciales,
      log: (m) => log(m),
      pausa: () => new Promise((r) => setTimeout(r, PAUSA_MIN_MS + Math.random() * (PAUSA_MAX_MS - PAUSA_MIN_MS))),
      trasLogin: async () => log('tras_login'),
      adjuntarPdf: (nombre: string, contenido: Uint8Array): PdfRef => {
        pdfs.push({ nombre, base64: Buffer.from(contenido).toString('base64') })
        return { indice: pdfs.length - 1, nombre }
      },
      pulsar: (boton) => pulsar(boton, guard),
      elegirOpcion: (m) => elegirOpcion(page, guard, m),
      avanzarATarificar: () => pulsarAvance(page, guard),
      abrirProyecto: (pestana) => pulsarProyecto(page, pestana, guard),
      exigirSinCaptcha: () => exigirSinCaptcha(page),
      formador,
    }

    let resultado: { ofertas: OfertaNormalizada[] } | null = null
    let error: unknown = null
    let tope: ReturnType<typeof setTimeout> | undefined
    try {
      resultado = await Promise.race([
        adaptador.tarificar(page, v.riesgo, ctx),
        new Promise<never>((_, rechazar) => {
          tope = setTimeout(() => rechazar(new ErrorTarificador('infra', `tope global de ${TOPE_GLOBAL_MS / 1000} s superado`)), TOPE_GLOBAL_MS)
        }),
      ])
      guard.comprobar() // una navegación de emisión abortada en segundo plano también invalida el resultado
    } catch (e) {
      error = guard.violacion() ?? e
    } finally {
      clearTimeout(tope)
    }

    await cerrarFormador(formador, resultado && !error ? 'ok' : 'error')
    if (resultado && !error) {
      const st = await enviarResultado(cfg, { trabajoId: trabajo.id, resultado: 'ok', ofertas: resultado.ofertas, pdfs })
      log('resultado_ok_enviado', { status: st, ofertas: resultado.ofertas.length })
      return st >= 200 && st < 300 ? 0 : 1
    }

    const c = clasificar(error)
    const secretos = secretosDelEntorno(env)
    const captura = await page.screenshot({ type: 'png', fullPage: false, timeout: 10_000 }).catch(() => null)
    // Con el HTML de los marcos: el formulario de ePAC vive en el iframe `appArea`.
    const html = await htmlConMarcos(page, 2 * 1024 * 1024).catch(() => null)
    const htmlRedactado = html ? redactarHtml(html, secretos) : null
    const cuerpo: CuerpoResultado = {
      trabajoId: trabajo.id,
      resultado: 'error',
      error: { tipo: c.tipo, mensaje: redactar(c.mensaje).slice(0, 2000), url: redactar(page.url()).slice(0, 500) },
      ...(captura && captura.length <= MAX_BYTES_EVIDENCIA ? { capturaBase64: captura.toString('base64') } : {}),
      ...(htmlRedactado && Buffer.byteLength(htmlRedactado) <= 2 * 1024 * 1024 ? { html: htmlRedactado } : {}),
    }
    const st = await enviarResultado(cfg, cuerpo)
    log('resultado_error_enviado', { status: st, tipo: c.tipo, mensaje: c.mensaje.slice(0, 300) })
    return 1
  } catch (e) {
    // Fallo del propio navegador (no arrancó, se cayó): infraestructura.
    const c = clasificar(e)
    const tipo = c.tipo === 'portal' ? 'infra' : c.tipo
    await cerrarFormador(formador, 'error')
    await enviarResultado(cfg, { trabajoId: trabajo.id, resultado: 'error', error: { tipo, mensaje: redactar(c.mensaje).slice(0, 2000), url: null } })
    log('fallo_navegador', { mensaje: c.mensaje.slice(0, 300) })
    return 1
  } finally {
    await browser?.close().catch(() => undefined)
  }
}

main()
  .then((codigo) => process.exit(codigo))
  .catch((e: unknown) => {
    // Último recurso: sin secretos (el redactor no está a mano aquí: solo el tipo del error).
    process.stdout.write(JSON.stringify({ msg: 'fallo_inesperado', tipo: e instanceof Error ? e.name : typeof e }) + '\n')
    process.exit(1)
  })
