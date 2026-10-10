// Runner del worker del tarificador RPA (05/10/2026). UNA máquina efímera de Fly = UN trabajo:
//   JOB_ID → GET trabajo → navegador + contexto limpio → adaptador → POST resultado → exit.
// Tope por intento 4 min (y nunca más allá del lease de asegura); 30 s por paso. En fallo: captura + HTML
// (redactado) al resultado.
//
// Reintento (06/10/2026): UN reintento automático en la misma máquina, solo si el fallo es TRANSITORIO del portal
// (`clasificarIntento` en errores.ts: timeout de navegación, sesión caducada, 5xx, `portal` marcado), tras 20–40 s
// aleatorios y desde un contexto NUEVO (sin cookies). Nunca datos/credenciales/captcha/emisión/guard; `infra` lo
// reintenta ya el orquestador con otra máquina. El intento queda en los avisos (ok) o en el mensaje (error).
// Sesión (src/sesion.ts): el storageState de ePAC solo en MEMORIA, TTL 10 min, invalidado ante cualquier fallo.
// Sesión MANUAL (07/10/2026, src/sesion-manual.ts; Generali, SMS en el acceso): sin credenciales; solo la sesión que
// inició Alberto, sellada AES-GCM en asegura. Sin ella o rechazada → requiere_humano y aviso; el robot nunca hace login.
//
// 🚨 TARIFICAR ≠ EMITIR (guard.ts). 🔑 Credenciales solo de fly secrets, solo en memoria, sin tracing
//    (nunca se arranca `context.tracing`) y con todo lo que sale pasado por el redactor.

import { chromium, type Browser, type BrowserContextOptions } from 'playwright'
import {
  nombresCredencial,
  redactarHtml,
  secretosDelEntorno,
  crearTraza,
  validarRiesgoComunidad,
  type Traza,
  variablesProhibidas,
  type Credenciales,
  type OfertaNormalizada,
  type PdfRef,
  type RiesgoComunidad,
} from '@central/module-tarificacion'
import { adaptadores } from './adapters/index.ts'
import { enviarResultado, leerConfig, pedirTrabajo, type Config, type CuerpoResultado } from './api.ts'
import { exigirSinCaptcha } from './captcha.ts'
import { ErrorTarificador, ErrorVerificacionHumana, MOTIVO_VERIFICACION_HUMANA, cabeReintento, clasificar, clasificarIntento, esperaReintentoMs, limiteDelTrabajo, type Clasificacion } from './errores.ts'
import { elegirOpcion, instalarGuardEmision, pulsar, pulsarAvance, pulsarProyecto } from './guard.ts'
import { crearLog } from './log.ts'
import { htmlConMarcos } from './evidencia.ts'
import { cerrarFormador, prepararFormador, type ContextoFormador } from './formador.ts'
import { enSerie, sesionEpac, type EstadoNavegador } from './sesion.ts'
import { exigirSinVerificacion } from './verificacion.ts'
import { textoAvisoSesionManual } from './aviso.ts'
import { caducidadMaximaMs, claveSesion } from './boveda-sesion.ts'
import { GestorSesionManual, almacenHttp } from './sesion-manual.ts'
import type { AdaptadorPortal, ContextoPortal } from './adaptador.ts'

const TOPE_GLOBAL_MS = 4 * 60_000
/** Techo absoluto del trabajo (dos intentos + espera), por si el lease no llega legible. */
const TOPE_TRABAJO_MS = 5 * 60_000 + 30_000
const TOPE_PASO_MS = 30_000
const PAUSA_MIN_MS = 800
const PAUSA_MAX_MS = 2_500
// Pausa corta antes de cada acción (campo o pulsación): ritmo humano.
const PAUSA_ACCION_MIN_MS = 300
const PAUSA_ACCION_MAX_MS = 1_200
const MAX_BYTES_EVIDENCIA = 4 * 1024 * 1024

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const azar = (min: number, max: number) => min + Math.random() * (max - min)

type Evidencia = { url: string; captura: Buffer | null; html: string | null }
type Intento =
  | { ok: true; ofertas: OfertaNormalizada[]; pdfs: { nombre: string; base64: string }[] }
  | { ok: false; c: Clasificacion; evidencia: Evidencia }

/**
 * De dónde sale y a dónde vuelve la sesión del navegador en un intento.
 * · ePAC (por defecto): caché en MEMORIA del proceso (sesion.ts), invalidada ante cualquier fallo.
 * · manual (Generali): la sesión que inició Alberto (sesion-manual.ts); se BORRA solo si el portal la rechaza.
 */
type FuenteSesion = {
  manual: boolean
  previa: () => EstadoNavegador | null
  alExito: (estado: EstadoNavegador) => Promise<void>
  /** `rechazada` = el portal devolvió al login o pidió código con esta sesión. */
  alFallo: (rechazada: boolean) => Promise<void>
}

const fuenteEpac: FuenteSesion = {
  manual: false,
  previa: () => sesionEpac.obtener(),
  alExito: async (e) => sesionEpac.guardar(e),
  alFallo: async () => sesionEpac.invalidar(),
}

type Comun = {
  sesion: FuenteSesion
  trabajoId: string
  compania: string
  adaptador: AdaptadorPortal
  riesgo: RiesgoComunidad
  credenciales: Credenciales
  formador: ContextoFormador | undefined
  traza: Traza
  log: (m: string, d?: Record<string, unknown>) => void
}

/** Un intento completo en un contexto NUEVO del navegador. Nunca lanza: devuelve ok o el fallo clasificado. */
async function intentar(browser: Browser, k: Comun, topeMs: number): Promise<Intento> {
  const { log } = k
  const pdfs: { nombre: string; base64: string }[] = []
  const previa = k.sesion.previa()
  // Contexto LIMPIO por intento; solo lleva cookies si hay una sesión viva en memoria (nunca de disco).
  const context = await browser.newContext({
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    acceptDownloads: true,
    ...(previa ? { storageState: previa as BrowserContextOptions['storageState'] } : {}),
  })
  let logueado = false
  let ultimo5xx: number | null = null
  try {
    const guard = await instalarGuardEmision(context)
    const page = await context.newPage()
    page.setDefaultTimeout(TOPE_PASO_MS)
    page.setDefaultNavigationTimeout(TOPE_PASO_MS)
    page.on('response', (r) => {
      if (r.status() >= 500 && r.request().isNavigationRequest()) ultimo5xx = r.status()
    })

    const ctx: ContextoPortal = {
      trabajoId: k.trabajoId,
      credenciales: k.credenciales,
      log: (m) => log(m),
      pausa: () => dormir(azar(PAUSA_MIN_MS, PAUSA_MAX_MS)),
      pausaAccion: () => dormir(azar(PAUSA_ACCION_MIN_MS, PAUSA_ACCION_MAX_MS)),
      sesionReutilizada: previa !== null,
      sesionManual: k.sesion.manual,
      trasLogin: async () => {
        logueado = true
        log('tras_login')
        // ¿Pide un código (SMS/OTP)? Entonces NO se sigue ni se rellena nada: requiere_humano (verificacion.ts).
        await exigirSinVerificacion(page, k.compania)
      },
      adjuntarPdf: (nombre: string, contenido: Uint8Array): PdfRef => {
        pdfs.push({ nombre, base64: Buffer.from(contenido).toString('base64') })
        return { indice: pdfs.length - 1, nombre }
      },
      pulsar: async (boton) => {
        await ctx.pausaAccion()
        await pulsar(boton, guard)
      },
      elegirOpcion: (m) => elegirOpcion(page, guard, m),
      avanzarATarificar: () => pulsarAvance(page, guard),
      abrirProyecto: (pestana) => pulsarProyecto(page, pestana, guard),
      exigirSinCaptcha: () => exigirSinCaptcha(page),
      formador: k.formador,
      paso: k.traza.paso,
    }

    let resultado: { ofertas: OfertaNormalizada[] } | null = null
    let error: unknown = null
    let tope: ReturnType<typeof setTimeout> | undefined
    try {
      resultado = await Promise.race([
        k.adaptador.tarificar(page, k.riesgo, ctx),
        new Promise<never>((_, rechazar) => {
          tope = setTimeout(() => rechazar(new ErrorTarificador('infra', `tope del intento de ${Math.round(topeMs / 1000)} s superado`)), topeMs)
        }),
      ])
      guard.comprobar() // una navegación de emisión abortada en segundo plano también invalida el resultado
    } catch (e) {
      error = guard.violacion() ?? e
    } finally {
      clearTimeout(tope)
    }

    if (resultado && !error) {
      // Sesión buena: se guarda EN MEMORIA (sin `path`: nunca a disco) para el siguiente trabajo de este proceso.
      const estado = await context.storageState().catch(() => null)
      if (estado) await k.sesion.alExito(estado).catch(() => log('sesion_no_guardada'))
      return { ok: true, ofertas: resultado.ofertas, pdfs }
    }

    const loginVisible = await page
      .locator('input[type="password"]')
      .filter({ visible: true })
      .count()
      .then((n) => n > 0, () => false)
    // Una pantalla de código/SMS manda sobre cualquier otra clasificación (un timeout de selector, p. ej.): no se reintenta.
    if (clasificar(error).tipo === 'portal') {
      await exigirSinVerificacion(page, k.compania).catch((e: unknown) => { error = e })
    }
    // Sesión manual que el portal rechaza (vuelta al login o pantalla de código): se borra y requiere_humano. El robot
    // nunca reintenta ni hace login aquí: eso pediría otro SMS.
    const rechazada = k.sesion.manual && (loginVisible || error instanceof ErrorVerificacionHumana)
    if (rechazada) error = new ErrorVerificacionHumana(k.compania, textoAvisoSesionManual(k.compania))
    await k.sesion.alFallo(rechazada).catch(() => log('sesion_no_borrada'))
    const c = clasificarIntento(error, { logueado, loginVisible, ultimo5xx })
    const captura = await page.screenshot({ type: 'png', fullPage: false, timeout: 10_000 }).catch(() => null)
    // Con el HTML de los marcos: el formulario de ePAC vive en el iframe `appArea`.
    const html = await htmlConMarcos(page, 2 * 1024 * 1024).catch(() => null)
    return { ok: false, c, evidencia: { url: page.url(), captura, html } }
  } catch (e) {
    await k.sesion.alFallo(false).catch(() => undefined)
    throw e
  } finally {
    await context.close().catch(() => undefined)
  }
}

const MOTIVO: Record<NonNullable<Clasificacion['transitorio']>, string> = {
  timeout_navegacion: 'timeout de navegación',
  sesion_caducada: 'sesión caducada (vuelta al login)',
  portal_5xx: 'error 5xx del portal',
  portal_transitorio: 'fallo pasajero del portal',
}

async function main(): Promise<number> {
  const env = process.env
  const inicio = Date.now()
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
  // Portal de sesión MANUAL (SMS en el acceso): sin credenciales, solo la sesión sellada que inició Alberto. Sin ella,
  // requiere_humano SIN abrir el navegador (intentar entrar pediría otro SMS).
  let fuente: FuenteSesion = fuenteEpac
  if (adaptador.sesion === 'manual') {
    let gestor: GestorSesionManual
    try {
      gestor = new GestorSesionManual(almacenHttp(cfg), { clave: claveSesion(env), maxMs: caducidadMaximaMs(env) })
    } catch (e) {
      await fallo('credenciales', e instanceof Error ? e.message : String(e))
      return 1
    }
    const carga = await gestor.cargar(trabajo.compania).catch((e: unknown) => ({ estado: 'error' as const, e }))
    if (carga.estado === 'error') {
      // Almacén caído ≠ «no hay sesión»: infraestructura (el orquestador lo reintenta), no un aviso a Alberto.
      const c = clasificar(carga.e)
      await enviarResultado(cfg, { trabajoId: trabajo.id, resultado: 'error', error: { tipo: c.tipo === 'portal' ? 'infra' : c.tipo, mensaje: redactar(c.mensaje).slice(0, 2000), url: null } })
      return 1
    }
    if (carga.estado === 'falta') {
      const e = new ErrorVerificacionHumana(trabajo.compania, textoAvisoSesionManual(trabajo.compania))
      log('requiere_verificacion_humana', { compania: trabajo.compania, sesion: carga.motivo })
      await enviarResultado(cfg, { trabajoId: trabajo.id, resultado: 'error', error: { tipo: e.tipo, mensaje: e.message, url: null } })
      return 1
    }
    const sesion = carga.sesion
    fuente = {
      manual: true,
      previa: () => sesion.valor,
      alExito: (estado) => gestor.refrescar(trabajo.compania, estado, sesion.caduca),
      alFallo: async (rechazada) => { if (rechazada) await gestor.invalidar(trabajo.compania) },
    }
  }

  let credenciales: Credenciales = { usuario: '', contrasena: '' }
  if (!fuente.manual) {
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
  }

  // Formador con IA: lo enciende asegura (`TARIFICADOR_FORMADOR_ACTIVO`); si no responde, apagado.
  const formador = await prepararFormador({
    trabajoId: trabajo.id, compania: trabajo.compania, ramo: trabajo.ramo, apiUrl: cfg.apiUrl, secreto: cfg.secreto,
    redactar, log: (m, d) => log(m, d),
  })

  // Hasta cuándo acepta asegura el resultado (lease − margen): los dos intentos y la espera caben ahí o no hay reintento.
  const limite = limiteDelTrabajo(inicio, trabajo.leaseHasta, TOPE_GLOBAL_MS, TOPE_TRABAJO_MS)
  let browser: Browser | null = null
  // Respaldo duro: si algo se cuelga por encima del límite (incluido el cierre del navegador), se sale.
  const respaldo = setTimeout(() => {
    log('tope_duro_superado: salida forzada')
    process.exit(2)
  }, Math.max(limite - Date.now(), 60_000) + 45_000)
  respaldo.unref()

  // Traza del trabajo (pasos con tiempos y código de error, sin datos): acumula los dos intentos y viaja en el POST del resultado.
  const traza = crearTraza((e) => clasificar(e).tipo)
  const meta = () => ({ pasos: traza.pasos(), botVersion: adaptador.version })
  const k: Comun = { sesion: fuente, trabajoId: trabajo.id, compania: trabajo.compania, adaptador, riesgo: v.riesgo, credenciales, formador, traza, log }

  // Un trabajo a la vez por proceso (hoy la máquina solo hace uno; si atiende varios, siguen en serie).
  return enSerie(async () => {
    try {
      browser = await chromium.launch({ headless: true })
      let r = await intentar(browser, k, Math.max(60_000, Math.min(TOPE_GLOBAL_MS, limite - Date.now())))
      let primerFallo: Clasificacion | null = null
      if (!r.ok && r.c.transitorio) {
        const espera = esperaReintentoMs()
        if (cabeReintento(Date.now(), limite, espera)) {
          primerFallo = r.c
          log('reintento_programado', { motivo: r.c.transitorio, tipo: r.c.tipo, esperaMs: espera })
          await dormir(espera)
          r = await intentar(browser, k, Math.min(TOPE_GLOBAL_MS, limite - Date.now()))
        } else {
          log('reintento_descartado_sin_tiempo', { motivo: r.c.transitorio })
        }
      }
      const nota = primerFallo
        ? `2.º intento (el 1.º falló por ${MOTIVO[primerFallo.transitorio!]}: ${redactar(primerFallo.mensaje).slice(0, 200)})`
        : null

      await cerrarFormador(formador, r.ok ? 'ok' : 'error')
      if (r.ok) {
        const ofertas = nota ? r.ofertas.map((o) => ({ ...o, avisos: [...o.avisos, `Cotizado al ${nota}`] })) : r.ofertas
        const st = await enviarResultado(cfg, { trabajoId: trabajo.id, resultado: 'ok', ofertas, pdfs: r.pdfs, ...meta() })
        log('resultado_ok_enviado', { status: st, ofertas: ofertas.length, intentos: primerFallo ? 2 : 1 })
        return st >= 200 && st < 300 ? 0 : 1
      }

      const { c, evidencia } = r
      const secretos = secretosDelEntorno(env)
      const htmlRedactado = evidencia.html ? redactarHtml(evidencia.html, secretos) : null
      const mensaje = (nota ? `[${nota}] ` : '') + c.mensaje
      const cuerpo: CuerpoResultado = {
        trabajoId: trabajo.id,
        resultado: 'error',
        error: { tipo: c.tipo, mensaje: redactar(mensaje).slice(0, 2000), url: redactar(evidencia.url).slice(0, 500) },
        ...(evidencia.captura && evidencia.captura.length <= MAX_BYTES_EVIDENCIA ? { capturaBase64: evidencia.captura.toString('base64') } : {}),
        ...(htmlRedactado && Buffer.byteLength(htmlRedactado) <= 2 * 1024 * 1024 ? { html: htmlRedactado } : {}),
        ...meta(),
      }
      // El worker no tiene canal de avisos (ni Telegram ni BD: variables prohibidas): el aviso a Alberto sale de
      // asegura/plataforma al leer este resultado (`requiere_humano` + mensaje «<Compañía> pide verificación…»).
      if (c.mensaje.startsWith(`${MOTIVO_VERIFICACION_HUMANA}:`)) log('requiere_verificacion_humana', { compania: trabajo.compania })
      const st = await enviarResultado(cfg, cuerpo)
      log('resultado_error_enviado', { status: st, tipo: c.tipo, transitorio: c.transitorio, intentos: primerFallo ? 2 : 1, mensaje: redactar(c.mensaje).slice(0, 300) })
      return 1
    } catch (e) {
      // Fallo del propio navegador (no arrancó, se cayó): infraestructura.
      sesionEpac.invalidar()
      const c = clasificar(e)
      const tipo = c.tipo === 'portal' ? 'infra' : c.tipo
      await cerrarFormador(formador, 'error')
      await enviarResultado(cfg, { trabajoId: trabajo.id, resultado: 'error', error: { tipo, mensaje: redactar(c.mensaje).slice(0, 2000), url: null }, ...meta() })
      log('fallo_navegador', { mensaje: redactar(c.mensaje).slice(0, 300) })
      return 1
    } finally {
      await (browser as Browser | null)?.close().catch(() => undefined)
    }
  })
}

main()
  .then((codigo) => process.exit(codigo))
  .catch((e: unknown) => {
    // Último recurso: sin secretos (el redactor no está a mano aquí: solo el tipo del error).
    process.stdout.write(JSON.stringify({ msg: 'fallo_inesperado', tipo: e instanceof Error ? e.name : typeof e }) + '\n')
    process.exit(1)
  })
