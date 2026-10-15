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

import { chromium, type Browser, type BrowserContextOptions, type Page } from 'playwright'
import {
  MAX_OPCIONES_POBLACION_CABLE,
  MAX_OPCIONES_VERSION_CABLE,
  nombresCredencial,
  crearRedactor,
  redactarHtml,
  secretosDelEntorno,
  secretosDelRiesgo,
  crearTraza,
  type Traza,
  variablesProhibidas,
  type Credenciales,
  type OfertaNormalizada,
  type PdfRef,
  type InventarioDom,
  type AtascoWorker,
  type MotivoCaptura,
  type Recorrido,
  valoresSensiblesDeRiesgo,
} from '@central/module-tarificacion'
import { adaptadores } from './adapters/index.ts'
import { enviarResultado, leerConfig, pedirTrabajo, salidaSinTrabajo, type Config, type CuerpoResultado } from './api.ts'
import { exigirSinCaptcha } from './captcha.ts'
import { crearTrazaIntento } from './traza-intento.ts'
import { ErrorTarificador, ErrorVerificacionHumana, MOTIVO_VERIFICACION_HUMANA, cabeReintento, clasificar, clasificarIntento, esperaReintentoMs, limiteDelTrabajo, pideInventarioDom, type Clasificacion } from './errores.ts'
import { capturarInventarioDom, marcosDePestanas } from './inventario-dom.ts'
import { cerrarAvisoTomadorMapfre, cerrarClubMapfre, confirmarVehiculoMapfre, elegirTomadorMapfre, elegirOpcion, pulsarContinuarMapfre, instalarGuardEmision, marcarOpcionRiesgoHogarAllianz, marcarOpcionResueltaHogarAllianz, pulsar, pulsarAvance, pulsarAvancePestanaAutorizado, pulsarEnlaceEntradaAutorizado, pulsarProyecto } from './guard.ts'
import { crearLog } from './log.ts'
import { localizarContinuarConRespaldo, pulsarContinuarSeguro } from './continuar.ts'
import { elegirOpcionMatSelect } from './mat-select.ts'
import { capturarEvidencia } from './evidencia.ts'
import { atascoDeRespaldoHueco, cerrarFormador, prepararFormador, type ContextoFormador } from './formador.ts'
import { enSerie, sesionEpac, type EstadoNavegador } from './sesion.ts'
import { exigirSinVerificacion } from './verificacion.ts'
import { textoAvisoSesionManual } from './aviso.ts'
import { caducidadMaximaMs, claveSesion } from './boveda-sesion.ts'
import { GestorSesionManual, almacenHttp } from './sesion-manual.ts'
import type { ContextoPortal } from './adaptador.ts'
import { prepararTrabajo, type AdaptadorRegistrado } from './ramo.ts'
import { ejecutarEmision } from './emision.ts'
import { ejecutarExploracion } from './explorador.ts'
import { crearCapturadorRecorrido, type CapturadorRecorrido } from './recorrido.ts'

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

type Evidencia = { url: string; captura: Buffer | null; html: string | null; inventarioDom: InventarioDom | null }
type Intento =
  | { ok: true; ofertas: OfertaNormalizada[]; pdfs: { nombre: string; base64: string }[] }
  | { ok: false; c: Clasificacion; evidencia: Evidencia; atasco: AtascoWorker | null }

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
  adaptador: AdaptadorRegistrado
  /** Tarifica con el riesgo ya validado por el validador del ramo (ramo.ts). */
  tarificar: (page: Page, ctx: ContextoPortal) => Promise<{ ofertas: OfertaNormalizada[] }>
  credenciales: Credenciales
  formador: ContextoFormador | undefined
  traza: Traza
  /** Recorrido del trabajo (15/10/2026): capturas ligeras de cada pantalla/paso/diálogo, de los dos intentos. */
  recorrido: CapturadorRecorrido
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
  const ti = crearTrazaIntento(k.traza)
  // RECORRIDO (15/10/2026): binding + observador de diálogos en TODOS los marcos, ANTES de abrir ninguna página; una captura por
  // cada carga de página (también las pestañas nuevas de Mapfre). Sin bloquear al adaptador: si ya hay una en vuelo, se omite.
  await k.recorrido.instalar(context)
  // Contador de capturas en vuelo (un boolean se pisaba: la primera en acabar apagaba la marca de la segunda).
  let capturando = 0
  let msCapturas = 0 // total de ms gastados en capturas de ESTE intento (se registra al cerrarlo)
  const capturar = async (motivo: MotivoCaptura, paso?: string): Promise<void> => {
    if (capturando > 0 && motivo === 'navegacion') return
    capturando++
    const t0 = Date.now()
    try { await k.recorrido.capturar(context, motivo, paso) } finally { capturando--; msCapturas += Date.now() - t0 }
  }
  context.on('page', (p) => { p.on('domcontentloaded', () => { void capturar('navegacion') }) })
  // ATASCO (F2): el checkpoint es de ESTE intento (un reintento empieza de cero).
  if (k.formador) k.formador.atasco = null
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
        ti.marcarLogin()
        log('tras_login')
        await capturar('login')
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
      avanzarPestanaAutorizada: (selector) => pulsarAvancePestanaAutorizado(page, guard, selector),
      pulsarEnlaceEntrada: (boton) => pulsarEnlaceEntradaAutorizado(boton, guard, k.compania),
      confirmarVehiculoMapfre: async (pagina, matricula, indice, denominacion) => {
        // La pestaña de NSEI la abre la entrada; solo vale una página de ESTE contexto (el que tiene el guard de red).
        if (pagina.context() !== context) throw new ErrorTarificador('portal', 'mapfre: la pestaña del diálogo no es de este trabajo')
        await confirmarVehiculoMapfre(pagina, guard, matricula, indice, denominacion)
      },
      cerrarClubMapfre: async (pagina) => {
        if (pagina.context() !== context) throw new ErrorTarificador('portal', 'mapfre: la pestaña del diálogo «Club MAPFRE» no es de este trabajo')
        return cerrarClubMapfre(pagina, guard)
      },
      elegirTomadorMapfre: async (pagina, nif) => {
        if (pagina.context() !== context) throw new ErrorTarificador('portal', 'mapfre: la pestaña del diálogo del tomador no es de este trabajo')
        return elegirTomadorMapfre(pagina, guard, nif)
      },
      cerrarAvisoTomadorMapfre: async (pagina) => {
        if (pagina.context() !== context) throw new ErrorTarificador('portal', 'mapfre: la pestaña del aviso del tomador no es de este trabajo')
        return cerrarAvisoTomadorMapfre(pagina, guard)
      },
      continuarMapfre: async (pagina, paso) => {
        if (pagina.context() !== context) throw new ErrorTarificador('portal', 'mapfre: la pestaña del stepper no es de este trabajo')
        await pulsarContinuarMapfre(pagina, guard, paso, (p) => localizarContinuarConRespaldo(p, k.formador))
      },
      continuar: async (pagina, o) => {
        const destino = pagina ?? page
        if (destino.context() !== context) throw new ErrorTarificador('portal', 'continuar: la pestaña no es de este trabajo')
        await pulsarContinuarSeguro(destino, { pulsar: ctx.pulsar, formador: k.formador, ...o })
        await capturar('avance')
      },
      elegirMatSelect: (select, valores, o) => {
        if (select.page().context() !== context) throw new ErrorTarificador('portal', 'mat-select: la pestaña no es de este trabajo')
        return elegirOpcionMatSelect(select, valores, { ...o, formador: k.formador, pulsar: ctx.pulsar })
      },
      abrirProyecto: (pestana) => pulsarProyecto(page, pestana, guard),
      marcarOpcionHogar: async (marco, etiqueta) => {
        // Solo un marco de ESTA página (la del guard de red del trabajo).
        if (marco.page() !== page) throw new ErrorTarificador('portal', 'allianz/hogar: el marco no es de este trabajo')
        await ctx.pausaAccion()
        return marcarOpcionRiesgoHogarAllianz(marco, guard, etiqueta)
      },
      marcarOpcionHogarResuelta: async (marco, etiqueta) => {
        if (marco.page() !== page) throw new ErrorTarificador('portal', 'allianz/hogar: el marco no es de este trabajo')
        await ctx.pausaAccion()
        return marcarOpcionResueltaHogarAllianz(marco, guard, etiqueta)
      },
      exigirSinCaptcha: () => exigirSinCaptcha(page),
      formador: k.formador,
      // Cada paso de la traza deja una captura al entrar y otra al salir (ok o fallo): el recorrido documenta la transición.
      paso: async (nombre, fn) => {
        await capturar('paso', nombre)
        try {
          return await ti.paso(nombre, fn)
        } finally {
          await capturar('paso_fin', nombre)
        }
      },
    }

    let resultado: { ofertas: OfertaNormalizada[] } | null = null
    let error: unknown = null
    let tope: ReturnType<typeof setTimeout> | undefined
    // Traza (14/10/2026): los adaptadores de Moto/Auto/Mapfre no llaman a `ctx.paso`; sin esto su traza salía VACÍA. Si el
    // adaptador no deja ningún paso, se anotan `login` (hasta `ctx.trasLogin`) + `formulario` (el resto) con el código FINAL
    // del intento (traza-intento.ts). Tras el timeout el adaptador sigue en segundo plano: su `ctx.paso` tardío ya no anota.
    try {
      resultado = await Promise.race([
        k.tarificar(page, ctx),
        new Promise<never>((_, rechazar) => {
          tope = setTimeout(() => rechazar(new ErrorTarificador('infra', `tope del intento de ${Math.round(topeMs / 1000)} s superado`)), topeMs)
        }),
      ])
      guard.comprobar() // una navegación de emisión abortada en segundo plano también invalida el resultado
    } catch (e) {
      error = guard.violacion() ?? e
    } finally {
      clearTimeout(tope)
      ti.cerrar()
    }

    if (resultado && !error) {
      ti.cubrir({ ok: true })
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
    ti.cubrir({ ok: false, codigo: c.tipo }) // el MISMO código que el runner reporta para el intento
    // Mapfre abre el formulario en una PESTAÑA NUEVA (14/10/2026): la evidencia sale de la pestaña abierta MÁS RECIENTE
    // (con una sola pestaña, la de siempre).
    const abiertas = context.pages().filter((p) => !p.isClosed())
    const actual = abiertas.at(-1) ?? page
    // Recorrido: la pantalla donde se paró (hueco de mapa → «pantalla_no_reconocida», con su diálogo si lo hay), antes de la evidencia.
    await capturar(pideInventarioDom(error) ? 'pantalla_no_reconocida' : 'fallo')
    const { captura, html } = await capturarEvidencia(actual)
    // Hueco de mapa (`ErrorMapaIncompleto`): inventario de ESTRUCTURA de todos los marcos de TODAS las pestañas (la más
    // reciente primero, por el tope de tamaño), incluidos los de otro origen (solo lectura, saneado y ≤60 KB;
    // inventario-dom.ts). Nunca para el envío del resultado: si falla, `null`.
    const inventarioDom = pideInventarioDom(error) ? await capturarInventarioDom(marcosDePestanas(abiertas, page)) : null
    // RED de la capa común (15/10/2026): un hueco de mapa sin checkpoint propio deja el suyo (candidatos de la pantalla donde
    // se paró): un trabajo real nunca muere `error_definitivo` sin pasar por el atasco.
    if (c.tipo === 'portal' && !c.transitorio) await atascoDeRespaldoHueco(actual, k.formador, error)
    // ATASCO (F2): solo un hueco del PORTAL no transitorio con checkpoint (nadie resolvió el paso). Lo decide asegura.
    const atasco = c.tipo === 'portal' && !c.transitorio ? (k.formador?.atasco ?? null) : null
    return { ok: false, c, evidencia: { url: actual.url(), captura, html, inventarioDom }, atasco }
  } catch (e) {
    ti.cubrir({ ok: false, codigo: 'desconocido' })
    await k.sesion.alFallo(false).catch(() => undefined)
    throw e
  } finally {
    log('recorrido_ms_capturas', { ms: msCapturas })
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
    // 404 = ya no está en curso (lease vencido/cancelado); 503 = canal apagado: salida 0. Red agotada = infra: salida 1.
    return salidaSinTrabajo(cfg, t, log, redactar)
  }
  const { trabajo } = t

  // EXPLORADOR IA (13/10/2026, src/explorador.ts): otro flujo (login + entrada cerrada + bucle con asegura), sin adaptador
  // de tarificación, sin formador ni reintento. asegura solo lo sirve a una imagen que declara el modo (api.ts).
  if (trabajo.modo === 'exploracion') return ejecutarExploracion({ cfg, trabajo, env, log, redactar })

  // Documento del tomador (Mapfre: lo pone asegura desde la ficha, 14/10/2026): SECRETO DEL TRABAJO. Fuera de mensajes,
  // URL y HTML de evidencia, y sin captura de pantalla (una imagen no se redacta). Nunca se loguea.
  const secretosRiesgo = secretosDelRiesgo(trabajo.riesgo)
  const redactarTrabajo = secretosRiesgo.length ? crearRedactor([...secretosDelEntorno(env), ...secretosRiesgo]) : redactar

  const fallo = (tipo: 'datos' | 'credenciales', mensaje: string) =>
    enviarResultado(cfg, { trabajoId: trabajo.id, resultado: 'error', error: { tipo, mensaje, url: null } })

  const adaptador = adaptadores.obtener(trabajo.compania, trabajo.ramo)
  if (!adaptador) {
    await fallo('datos', `sin adaptador para ${trabajo.compania}/${trabajo.ramo} en esta imagen`)
    return 1
  }
  // Riesgo validado con el validador DEL RAMO del adaptador (comunidades → riesgo de comunidad; auto/moto → FormularioAuto).
  const v = prepararTrabajo(adaptador, trabajo.riesgo)
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
      await enviarResultado(cfg, { trabajoId: trabajo.id, resultado: 'error', error: { tipo: c.tipo === 'portal' ? 'infra' : c.tipo, mensaje: redactarTrabajo(c.mensaje).slice(0, 2000), url: null }, botVersion: adaptador.version })
      return 1
    }
    if (carga.estado === 'falta') {
      const e = new ErrorVerificacionHumana(trabajo.compania, textoAvisoSesionManual(trabajo.compania))
      log('requiere_verificacion_humana', { compania: trabajo.compania, sesion: carga.motivo })
      await enviarResultado(cfg, { trabajoId: trabajo.id, resultado: 'error', error: { tipo: e.tipo, mensaje: e.message, url: null }, botVersion: adaptador.version })
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

  // EMISIÓN asistida (10/10/2026, src/emision.ts): otro flujo, con su propio navegador y sin formador ni reintento.
  // Sin la fase o con el interruptor de la máquina apagado, `ejecutarEmision` responde `no_emitida` sin abrir el portal.
  if (trabajo.modo === 'emision') {
    // La emisión asistida solo existe para Comunidades (RiesgoComunidad); un ramo de vehículo no emite.
    if (!v.comunidad) {
      await fallo('datos', `el ramo ${trabajo.ramo} no tiene emisión asistida`)
      return 1
    }
    return ejecutarEmision({ cfg, trabajo, adaptador: v.comunidad.adaptador, riesgo: v.comunidad.riesgo, credenciales, env, traza: crearTraza((e) => clasificar(e).tipo), log, redactar })
  }

  // Formador con IA: lo enciende asegura (`TARIFICADOR_FORMADOR_ACTIVO`); si no responde, apagado.
  const formador = await prepararFormador({
    trabajoId: trabajo.id, compania: trabajo.compania, ramo: trabajo.ramo, apiUrl: cfg.apiUrl, secreto: cfg.secreto,
    redactar: redactarTrabajo, log: (m, d) => log(m, d),
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
  // Recorrido del trabajo (15/10/2026): mismo redactor que el resto de lo que sale + los valores del riesgo; tope ~60 KB.
  const recorrido = crearCapturadorRecorrido({ redactar: redactarTrabajo, valores: valoresSensiblesDeRiesgo(trabajo.riesgo), log })
  const k: Comun = { sesion: fuente, trabajoId: trabajo.id, compania: trabajo.compania, adaptador, tarificar: v.tarificar, credenciales, formador, traza, recorrido, log }

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
        ? `2.º intento (el 1.º falló por ${MOTIVO[primerFallo.transitorio!]}: ${redactarTrabajo(primerFallo.mensaje).slice(0, 200)})`
        : null

      await cerrarFormador(formador, r.ok ? 'ok' : 'error')
      if (r.ok) {
        const ofertas = nota ? r.ofertas.map((o) => ({ ...o, avisos: [...o.avisos, `Cotizado al ${nota}`] })) : r.ofertas
        const st = await enviarResultado(cfg, { trabajoId: trabajo.id, resultado: 'ok', ofertas, pdfs: r.pdfs, ...meta() })
        log('resultado_ok_enviado', { status: st, ofertas: ofertas.length, intentos: primerFallo ? 2 : 1, recorridoCapturas: recorrido.recorrido().capturas.length, recorridoBytes: recorrido.colector.bytes() })
        return st >= 200 && st < 300 ? 0 : 1
      }

      const { c, evidencia } = r
      const recorridoDelTrabajo: Recorrido = recorrido.recorrido()
      const secretos = [...secretosDelEntorno(env), ...secretosRiesgo]
      const htmlRedactado = evidencia.html ? redactarHtml(evidencia.html, secretos) : null
      const mensaje = (nota ? `[${nota}] ` : '') + c.mensaje
      const cuerpo: CuerpoResultado = {
        trabajoId: trabajo.id,
        resultado: 'error',
        error: {
          tipo: c.tipo,
          mensaje: redactarTrabajo(mensaje).slice(0, 2000),
          url: redactarTrabajo(evidencia.url).slice(0, 500),
          // Lista COMPLETA de versiones (solo catálogo), sin pasar por el redactor: asegura la valida y la usa por código.
          ...(c.opcionesVersion ? { opcionesVersion: c.opcionesVersion.slice(0, MAX_OPCIONES_VERSION_CABLE) } : {}),
          // Lista de poblaciones del CP (nombres de localidad; `codigo` = texto exacto de la celda). Asegura la valida.
          ...(c.opcionesPoblacion ? { opcionesPoblacion: c.opcionesPoblacion.slice(0, MAX_OPCIONES_POBLACION_CABLE) } : {}),
          // Estructura de la pantalla (ya saneada, sin valores de campos): NO pasa por el log, solo su cuenta.
          ...(evidencia.inventarioDom ? { inventarioDom: evidencia.inventarioDom } : {}),
          // Recorrido del trabajo (15/10/2026): capturas ligeras de TODAS las pantallas/pasos/diálogos (sin valores ni datos
          // personales, ≤60 KB). Va en el `error` jsonb existente: sin migración. Un `ok` no tiene dónde guardarlo (ver informe).
          ...(recorridoDelTrabajo.capturas.length > 0 ? { recorrido: recorridoDelTrabajo } : {}),
          // Checkpoint del ATASCO (F2): candidatos ya redactados y numerados; asegura los re-sanea y decide si se atasca.
          ...(r.atasco ? { atasco: r.atasco } : {}),
        },
        ...(evidencia.captura && secretosRiesgo.length === 0 && evidencia.captura.length <= MAX_BYTES_EVIDENCIA ? { capturaBase64: evidencia.captura.toString('base64') } : {}),
        ...(htmlRedactado && Buffer.byteLength(htmlRedactado) <= 2 * 1024 * 1024 ? { html: htmlRedactado } : {}),
        ...meta(),
      }
      // El worker no tiene canal de avisos (ni Telegram ni BD: variables prohibidas): el aviso a Alberto sale de
      // asegura/plataforma al leer este resultado (`requiere_humano` + mensaje «<Compañía> pide verificación…»).
      if (c.mensaje.startsWith(`${MOTIVO_VERIFICACION_HUMANA}:`)) log('requiere_verificacion_humana', { compania: trabajo.compania })
      const st = await enviarResultado(cfg, cuerpo)
      log('resultado_error_enviado', {
        status: st,
        tipo: c.tipo,
        transitorio: c.transitorio,
        intentos: primerFallo ? 2 : 1,
        mensaje: redactarTrabajo(c.mensaje).slice(0, 300),
        ...(evidencia.inventarioDom ? { inventarioElementos: evidencia.inventarioDom.totalElementos, inventarioMarcos: evidencia.inventarioDom.marcos.length } : {}),
        recorridoCapturas: recorridoDelTrabajo.capturas.length,
        ...(r.atasco ? { atasco: r.atasco.clave, atascoCandidatos: r.atasco.candidatos.length } : {}),
      })
      return 1
    } catch (e) {
      // Fallo del propio navegador (no arrancó, se cayó): infraestructura.
      sesionEpac.invalidar()
      const c = clasificar(e)
      const tipo = c.tipo === 'portal' ? 'infra' : c.tipo
      await cerrarFormador(formador, 'error')
      await enviarResultado(cfg, { trabajoId: trabajo.id, resultado: 'error', error: { tipo, mensaje: redactarTrabajo(c.mensaje).slice(0, 2000), url: null }, ...meta() })
      log('fallo_navegador', { mensaje: redactarTrabajo(c.mensaje).slice(0, 300) })
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
