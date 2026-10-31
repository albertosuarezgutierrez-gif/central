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
// RELEVO del SMS (19/10/2026, src/relevo-sms.ts; Generali/Okta, `codigoSms`): si tras el login sale la pantalla del SMS, el
// intento se corta, el código se pide por Telegram (vía asegura, que alarga el lease), se verifica marcando «No volver a
// solicitar en este dispositivo en 30 días», el estado se guarda sellado en la bóveda (30 días) y se repite el intento UNA vez.
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
  redactarHtmlGrabacion,
  redactarTextoGrabacion,
  redactarUrl,
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
  type ResultadoAdaptador,
} from '@central/module-tarificacion'
import { adaptadores } from './adapters/index.ts'
import { enviarResultado, leerConfig, pedirTrabajo, salidaSinTrabajo, vehiculoDelResultado, type Config, type CuerpoResultado, type VehiculoDelResultado } from './api.ts'
import { exigirSinCaptcha } from './captcha.ts'
import { crearTrazaIntento } from './traza-intento.ts'
import { ErrorCodigoSmsPendiente, ErrorTarificador, ErrorVerificacionHumana, MOTIVO_VERIFICACION_HUMANA, cabeReintento, clasificar, clasificarIntento, esperaReintentoMs, limiteDelTrabajo, pideInventarioDom, type Clasificacion } from './errores.ts'
import { capturarInventarioDom, marcosDePestanas } from './inventario-dom.ts'
import { pulsarMediadorGenerali, pulsarEntrarGenerali, entrarTurismosGenerali, cerrarAvisoSabiasQueGenerali, pulsarSubpestanaGenerali, pulsarRecalcularGenerali, marcarPlacasEspecialesGenerali, pulsarConfirmarVehiculoGenerali, pulsarConfirmarDatosPersonasGenerali, pulsarSiguienteValoracionGenerali, abrirDesplegableMarcaGenerali, elegirMarcaListaGenerali, abrirDesplegableModeloGenerali, elegirModeloListaGenerali, elegirPotenciaGenerali, elegirFilaVersionGenerali, elegirCombustibleGenerali, abrirDesplegableVersionGenerali, elegirVersionListaGenerali, cerrarAvisoTomadorMapfre, cerrarClubMapfre, generarProyectoMapfre, companiaActualTurismosAllianz, localidadTurismosAllianz, marcarAntecedenteTurismosAllianz, confirmarVehiculoMapfre, elegirTomadorMapfre, elegirOpcion, pulsarContinuarMapfre, instalarGuardEmision, marcarOpcionRiesgoHogarAllianz, marcarOpcionResueltaHogarAllianz, marcarOpcionTurismosAllianz, marcarTarjetaVehiculoTurismosAllianz, polizaActualTurismosAllianz,
  guardarPresupuestoTurismosAllianz, buscarBotonDescargaProyecto, pulsarDescargaProyectoAuto, pulsar, pulsarAvance, pulsarAvancePestanaAutorizado, pulsarEnlaceEntradaAutorizado, pulsarProyecto, esUrlOktaSmsGenerali, type GuardEmision } from './guard.ts'
import { puertoCodigoHttp, relevarCodigoSmsGenerali, type Relevo } from './relevo-sms.ts'
import { crearLog } from './log.ts'
import { localizarContinuarConRespaldo, pulsarContinuarSeguro } from './continuar.ts'
import { elegirOpcionMatSelect, leerOpcionesMatSelect } from './mat-select.ts'
import { capturarEvidencia } from './evidencia.ts'
import { construirVolcado, MAX_BYTES_VOLCADO, nombreDocumentoVolcado, recogerMarcosCrudos, truncarMensajeConReferencia, vaciarValoresCampos, type MarcoCrudo } from './volcado-atasco.ts'
import { separarAria, seccionAria } from './aria-snapshot.ts'
import { atascoDeRespaldoHueco, cerrarFormador, esPeticionOpcion, prepararFormador, type ContextoFormador } from './formador.ts'
import { capturaJpegAtasco, capturaParaCable, leerOpcionesVisibles, limpiarOpciones, pideCapturaAtasco } from './opciones-atasco.ts'
import { enSerie, sesionEpac, type EstadoNavegador } from './sesion.ts'
import { exigirSinVerificacion } from './verificacion.ts'
import { textoAvisoSesionManual } from './aviso.ts'
import { ErrorCredenciales, cortocircuito, exigirSinRechazoCredenciales, motivoCredenciales, motivoDeMensaje, textoAvisoCredenciales, textoVisiblePagina } from './credenciales.ts'
import { CADUCIDAD_DISPOSITIVO_MS, caducidadMaximaMs, claveSesion, type SesionAbierta } from './boveda-sesion.ts'
import { GestorSesionManual, almacenHttp, fuenteDispositivo, motivoFalloBoveda } from './sesion-manual.ts'
import type { ContextoPortal } from './adaptador.ts'
import { prepararTrabajo, type AdaptadorRegistrado } from './ramo.ts'
import { ejecutarEmision } from './emision.ts'
import { ejecutarExploracion } from './explorador.ts'
import { ejecutarHumo } from './humo.ts'
import { crearCapturadorRecorrido, type CapturadorRecorrido } from './recorrido.ts'

const TOPE_GLOBAL_MS = 4 * 60_000
/** Techo absoluto del trabajo (dos intentos + espera), por si el lease no llega legible. */
const TOPE_TRABAJO_MS = 5 * 60_000 + 30_000
const TOPE_PASO_MS = 30_000
/** v0.6.31: tope de cada lectura de la página tras el timeout del intento (login visible, evidencia). */
const TOPE_REPORTE_MS = 10_000
function topeReporte<T>(p: Promise<T>, defecto: T, ms = TOPE_REPORTE_MS): Promise<T> {
  let reloj: ReturnType<typeof setTimeout> | undefined
  return Promise.race([p, new Promise<T>((r) => { reloj = setTimeout(() => r(defecto), ms) })]).finally(() => clearTimeout(reloj))
}
const PAUSA_MIN_MS = 800
const PAUSA_MAX_MS = 2_500
// Pausa corta antes de cada acción (campo o pulsación): ritmo humano.
const PAUSA_ACCION_MIN_MS = 300
const PAUSA_ACCION_MAX_MS = 1_200
const MAX_BYTES_EVIDENCIA = 4 * 1024 * 1024

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const azar = (min: number, max: number) => min + Math.random() * (max - min)

type Evidencia = { url: string; captura: Buffer | null; html: string | null; inventarioDom: InventarioDom | null; capturaAtasco: Buffer | null; opcionesAtasco: string[] | null; volcado: MarcoCrudo[] | null }
type Intento =
  | { ok: true; ofertas: OfertaNormalizada[]; pdfs: { nombre: string; base64: string }[]; vehiculo: VehiculoDelResultado }
  | { ok: false; c: Clasificacion; evidencia: Evidencia; atasco: AtascoWorker | null }
/** El intento se cortó en la pantalla del SMS y el relevo la VERIFICÓ: hay que repetir el intento (ya con el dispositivo). */
type Verificado = { verificado: true }

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
  /** Tras verificar el SMS (relevo): el estado NUEVO, con su caducidad completa. Ausente = no se recuerda nada. */
  alVerificar?: (estado: EstadoNavegador) => Promise<void>
  /** Por qué el dispositivo verificado NO quedó en la bóveda (sin datos sensibles); `null` = nada que contar. */
  notaBoveda?: () => string | null
}

const fuenteEpac: FuenteSesion = {
  manual: false,
  previa: () => sesionEpac.obtener(),
  alExito: async (e) => sesionEpac.guardar(e),
  alFallo: async () => sesionEpac.invalidar(),
}

// Fuente del DISPOSITIVO DE CONFIANZA (Generali/Okta): `fuenteDispositivo` de sesion-manual.ts (guarda justo tras el SMS).

type Comun = {
  sesion: FuenteSesion
  trabajoId: string
  compania: string
  adaptador: AdaptadorRegistrado
  /** Tarifica con el riesgo ya validado por el validador del ramo (ramo.ts). */
  tarificar: (page: Page, ctx: ContextoPortal) => Promise<ResultadoAdaptador>
  credenciales: Credenciales
  formador: ContextoFormador | undefined
  traza: Traza
  /** Recorrido del trabajo (15/10/2026): capturas ligeras de cada pantalla/paso/diálogo, de los dos intentos. */
  recorrido: CapturadorRecorrido
  log: (m: string, d?: Record<string, unknown>) => void
  /** Relevo del código SMS por Telegram (adaptador con `codigoSms`). UNO por trabajo: `usado` lo apaga tras el primero. */
  relevoSms?: { usado: boolean; relevar: (page: Page, guard: GuardEmision) => Promise<Relevo> }
}

/** Un intento completo en un contexto NUEVO del navegador. Nunca lanza: devuelve ok, el fallo clasificado o `verificado`. */
async function intentar(browser: Browser, k: Comun, topeMs: number): Promise<Intento | Verificado> {
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
        // SMS de Okta con relevo disponible: se corta el adaptador aquí (sin rellenar nada) y el runner releva el código.
        if (k.relevoSms && !k.relevoSms.usado && esUrlOktaSmsGenerali(page.url())) throw new ErrorCodigoSmsPendiente(k.compania)
        // ¿Pide un código (SMS/OTP)? Entonces NO se sigue ni se rellena nada: requiere_humano (verificacion.ts).
        await exigirSinVerificacion(page, k.compania)
        // ¿Entró pero el portal dice cuenta bloqueada / contraseña caducada? Tampoco se sigue (ni se reintenta el login).
        await exigirSinRechazoCredenciales(page, k.compania, { soloInutilizable: true })
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
      generarProyectoMapfre: async (pagina, completar) => {
        if (pagina.context() !== context) throw new ErrorTarificador('portal', 'mapfre: la pestaña de «Generar Proyecto» no es de este trabajo')
        await ctx.pausaAccion()
        return generarProyectoMapfre(pagina, guard, undefined, undefined, completar)
      },
      buscarDescargaProyectoAuto: async (pagina, compania, guardado) => {
        if (pagina.context() !== context) throw new ErrorTarificador('portal', 'descarga del proyecto: la pestaña no es de este trabajo')
        return buscarBotonDescargaProyecto(pagina, guard, compania, guardado)
      },
      pulsarDescargaProyectoAuto: async (pagina, boton, compania, guardado) => {
        if (pagina.context() !== context) throw new ErrorTarificador('portal', 'descarga del proyecto: la pestaña no es de este trabajo')
        await ctx.pausaAccion()
        await pulsarDescargaProyectoAuto(pagina, guard, boton, compania, guardado)
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
      leerOpcionesMatSelect: async (select) => {
        if (select.page().context() !== context) return null
        return leerOpcionesMatSelect(select, { pulsar: ctx.pulsar })
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
      marcarOpcionTurismos: async (marco, etiqueta) => {
        if (marco.page() !== page) throw new ErrorTarificador('portal', 'allianz/auto: el marco no es de este trabajo')
        await ctx.pausaAccion()
        return marcarOpcionTurismosAllianz(marco, guard, etiqueta)
      },
      marcarTarjetaVehiculoTurismos: async (marco, indice, etiqueta) => {
        if (marco.page() !== page) throw new ErrorTarificador('portal', 'allianz/auto: el marco no es de este trabajo')
        await ctx.pausaAccion()
        return marcarTarjetaVehiculoTurismosAllianz(marco, guard, indice, etiqueta)
      },
      companiaActualTurismos: async (marco, buscada) => {
        if (marco.page() !== page) throw new ErrorTarificador('portal', 'allianz/auto: el marco no es de este trabajo')
        await ctx.pausaAccion()
        return companiaActualTurismosAllianz(marco, guard, buscada)
      },
      localidadTurismos: async (marco, busquedas, elegir) => {
        if (marco.page() !== page) throw new ErrorTarificador('portal', 'allianz/auto: el marco no es de este trabajo')
        await ctx.pausaAccion()
        return localidadTurismosAllianz(marco, guard, busquedas, elegir)
      },
      marcarAntecedenteTurismos: async (marco, clave, dato) => {
        if (marco.page() !== page) throw new ErrorTarificador('portal', 'allianz/auto: el marco no es de este trabajo')
        await ctx.pausaAccion()
        return marcarAntecedenteTurismosAllianz(marco, guard, clave, dato)
      },
      polizaActualTurismos: async (marco, ultimos5) => {
        if (marco.page() !== page) throw new ErrorTarificador('portal', 'allianz/auto: el marco no es de este trabajo')
        await ctx.pausaAccion()
        return polizaActualTurismosAllianz(marco, guard, ultimos5)
      },
      guardarPresupuestoTurismos: async (marco, identificador, contacto) => {
        if (marco.page() !== page) throw new ErrorTarificador('portal', 'allianz/auto: el marco no es de este trabajo')
        await ctx.pausaAccion()
        return guardarPresupuestoTurismosAllianz(marco, guard, identificador, undefined, undefined, contacto ?? null)
      },
      confirmarMediadorGenerali: async (selectMediador) => {
        if (selectMediador.page() !== page) throw new ErrorTarificador('portal', 'generali: el desplegable del mediador no es de este trabajo')
        await ctx.pausaAccion()
        await pulsarMediadorGenerali(page, guard, selectMediador)
      },
      entrarPortalGenerali: async () => {
        await ctx.pausaAccion()
        await pulsarEntrarGenerali(page, guard)
        await capturar('avance')
      },
      cerrarAvisoSabiasQueGenerali: async () => {
        const r = await cerrarAvisoSabiasQueGenerali(page, guard)
        if (r === 'cerrado') await capturar('avance')
        return r
      },
      entrarTurismosGenerali: async () => {
        await ctx.pausaAccion()
        await entrarTurismosGenerali(page, guard)
        await capturar('avance')
      },
      pulsarSubpestanaGenerali: async (texto) => {
        await ctx.pausaAccion()
        const marco = await pulsarSubpestanaGenerali(page, guard, texto)
        await capturar('avance')
        return marco
      },
      marcarPlacasEspecialesGenerali: async () => {
        await ctx.pausaAccion()
        await marcarPlacasEspecialesGenerali(page, guard, 'No')
      },
      abrirDesplegableMarcaGenerali: async (base) => {
        await ctx.pausaAccion()
        await abrirDesplegableMarcaGenerali(page, guard, base)
      },
      elegirMarcaListaGenerali: async (base, texto) => {
        await elegirMarcaListaGenerali(page, guard, base, texto)
      },
      abrirDesplegableModeloGenerali: async (base) => {
        await ctx.pausaAccion()
        await abrirDesplegableModeloGenerali(page, guard, base)
      },
      elegirModeloListaGenerali: async (base, texto) => {
        await elegirModeloListaGenerali(page, guard, base, texto)
        await capturar('avance')
      },
      elegirPotenciaGenerali: async (grupo, texto) => {
        await ctx.pausaAccion()
        await elegirPotenciaGenerali(page, guard, grupo, texto)
        await capturar('avance')
      },
      elegirFilaVersionGenerali: async (codigo, version) => {
        await ctx.pausaAccion()
        await elegirFilaVersionGenerali(page, guard, codigo, version)
        await capturar('avance')
      },
      elegirCombustibleGenerali: async (grupo, texto) => {
        await ctx.pausaAccion()
        await elegirCombustibleGenerali(page, guard, grupo, texto)
        await capturar('avance')
      },
      abrirDesplegableVersionGenerali: async (base) => {
        await ctx.pausaAccion()
        await abrirDesplegableVersionGenerali(page, guard, base)
      },
      elegirVersionListaGenerali: async (base, texto) => {
        await elegirVersionListaGenerali(page, guard, base, texto)
        await capturar('avance')
      },
      confirmarVehiculoGenerali: async () => {
        await ctx.pausaAccion()
        await pulsarConfirmarVehiculoGenerali(page, guard)
        await capturar('avance')
      },
      confirmarDatosPersonasGenerali: async () => {
        await ctx.pausaAccion()
        const r = await pulsarConfirmarDatosPersonasGenerali(page, guard)
        await capturar('avance')
        return r
      },
      pulsarRecalcularGenerali: async () => {
        await ctx.pausaAccion()
        const r = await pulsarRecalcularGenerali(page, guard)
        await capturar('avance')
        return r
      },
      pulsarSiguienteGenerali: async () => {
        await ctx.pausaAccion()
        const r = await pulsarSiguienteValoracionGenerali(page, guard)
        await capturar('avance')
        return r
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

    let resultado: ResultadoAdaptador | null = null
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
      return { ok: true, ofertas: resultado.ofertas, pdfs, vehiculo: vehiculoDelResultado(resultado) }
    }

    // RELEVO del SMS (19/10/2026): el adaptador se cortó en la pantalla del SMS de Okta (lo lanzó `trasLogin`, nunca un tope)
    // y el guard está limpio → se pide el código por Telegram y se verifica en ESTA página. Bien → se guarda el dispositivo y
    // el runner repite el intento; mal → el error claro del relevo (requiere_humano), con el campo del código ya vacío.
    if (error instanceof ErrorCodigoSmsPendiente && k.relevoSms && !k.relevoSms.usado && !guard.violacion()) {
      k.relevoSms.usado = true
      const rv: Relevo = await k.relevoSms.relevar(page, guard).catch((e: unknown) => ({ ok: false as const, error: e as ErrorTarificador }))
      if (rv.ok) {
        const estado = await context.storageState().catch(() => null)
        // Se guarda AQUÍ (justo tras pasar el SMS), no al terminar: el dispositivo vale aunque luego el mapa falle.
        if (!estado) log('dispositivo_no_guardado', { motivo: 'sin_estado_navegador' })
        else if (k.sesion.alVerificar) await k.sesion.alVerificar(estado).catch(() => log('dispositivo_no_guardado', { motivo: 'desconocido' }))
        ti.cubrir({ ok: false, codigo: 'captcha' })
        return { verificado: true }
      }
      error = guard.violacion() ?? rv.error
    }

    // v0.6.31: cada lectura posterior al timeout lleva su tope (10 s): el reporte SIEMPRE sale aunque la página esté colgada.
    const loginVisible = await topeReporte(
      page
        .locator('input[type="password"]')
        .filter({ visible: true })
        .count()
        .then((n) => n > 0, () => false),
      false,
    )
    // Una pantalla de código/SMS manda sobre cualquier otra clasificación (un timeout de selector, p. ej.): no se reintenta.
    if (clasificar(error).tipo === 'portal') {
      await exigirSinVerificacion(page, k.compania).catch((e: unknown) => { error = e })
    }
    // RED de credenciales (15/10/2026): fallo «del portal» con el formulario de acceso a la vista y un mensaje de rechazo /
    // bloqueo / caducada → es de credenciales (NO reintentable; evita el reintento de «sesión caducada» con otro login).
    if (!k.sesion.manual && loginVisible && clasificar(error).tipo === 'portal') {
      const m = motivoCredenciales(await textoVisiblePagina(page))
      if (m) error = new ErrorCredenciales(k.compania, m)
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
    const { captura, html } = await topeReporte((async () => await capturarEvidencia(actual))().catch(() => ({ url: '', captura: null, html: null })), { url: '', captura: null, html: null })
    // Hueco de mapa (`ErrorMapaIncompleto`): inventario de ESTRUCTURA de todos los marcos de TODAS las pestañas (la más
    // reciente primero, por el tope de tamaño), incluidos los de otro origen (solo lectura, saneado y ≤60 KB;
    // inventario-dom.ts). Nunca para el envío del resultado: si falla, `null`.
    const inventarioDom = pideInventarioDom(error) ? await capturarInventarioDom(marcosDePestanas(abiertas, page)) : null
    // RED de la capa común (15/10/2026): un hueco de mapa sin checkpoint propio deja el suyo (candidatos de la pantalla donde
    // se paró): un trabajo real nunca muere `error_definitivo` sin pasar por el atasco.
    if (c.tipo === 'portal' && !c.transitorio) await atascoDeRespaldoHueco(actual, k.formador, error)
    // ATASCO (F2): solo un hueco del PORTAL no transitorio con checkpoint (nadie resolvió el paso). Lo decide asegura.
    const atasco = c.tipo === 'portal' && !c.transitorio ? (k.formador?.atasco ?? null) : null
    // ATASCO / HUECO (21/10/2026, opciones-atasco.ts): pantallazo JPEG para que Alberto VEA dónde paró (viaja aunque el riesgo
    // lleve datos personales, marcado `capturaConDatos`) y, si el atasco es de elegir una opción de lista, sus textos visibles.
    const capturaAtasco = pideCapturaAtasco({ hayAtasco: atasco !== null, huecoMapa: pideInventarioDom(error) }) ? await capturaJpegAtasco(actual) : null
    const opcionesAtasco = atasco && esPeticionOpcion(atasco) ? await leerOpcionesVisibles(actual).catch(() => null) : null
    // VOLCADO (27/10/2026, volcado-atasco.ts): hueco de mapa o atasco → TODOS los marcos de TODAS las pestañas (HTML + resumen de
    // pantalla), crudos; se sanean al enviar (ahí está el redactor del trabajo). Si falla, queda el HTML de evidencia de siempre.
    const volcado = pideInventarioDom(error) || atasco !== null ? await topeReporte(recogerMarcosCrudos(abiertas).catch(() => null), null, 25_000) : null
    return { ok: false, c, evidencia: { url: actual.url(), captura, html, inventarioDom, capturaAtasco, opcionesAtasco, volcado }, atasco }
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

  // PRUEBA DE HUMO nocturna (15/10/2026, src/humo.ts): login + pantalla de inicio del tarificador, sin riesgo ni datos de nadie.
  // Otro flujo: sin adaptador de tarificación (usa sus login y entradas), sin formador ni reintento. Un trabajo de humo nunca se tarifica.
  if (trabajo.modo === 'humo') return ejecutarHumo({ cfg, trabajo, env, log, redactar })

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

  // DISPOSITIVO DE CONFIANZA + RELEVO del SMS (19/10/2026, adaptador con `codigoSms`): el estado guardado tras la última
  // verificación (bóveda, 30 días) arranca el contexto; si Okta pide el SMS igual, se releva por Telegram. Sin la clave de la
  // bóveda (`TARIFICADOR_SESION_KEY`) o con el almacén caído se releva igual, pero no se recuerda (NULL ≠ «no hay»: no se borra nada).
  let relevoSms: Comun['relevoSms']
  // Prórroga del lease que da asegura al pedir/entregar el código: la recoge el límite del trabajo y el tope duro (abajo).
  let leaseActual = trabajo.leaseHasta
  let alProrrogar: () => void = () => undefined
  if (adaptador.codigoSms === 'okta-generali' && !fuente.manual) {
    let gestor: GestorSesionManual | null = null
    let motivoSinBoveda: string | undefined
    try {
      gestor = new GestorSesionManual(almacenHttp(cfg), { clave: claveSesion(env), maxMs: CADUCIDAD_DISPOSITIVO_MS })
    } catch (e) {
      motivoSinBoveda = motivoFalloBoveda(e)
      log('dispositivo_sin_boveda', { motivo: motivoSinBoveda })
    }
    let inicial: SesionAbierta | null = null
    if (gestor) {
      let motivoCarga: string | undefined
      const c = await gestor.cargar(trabajo.compania).catch((e: unknown) => { motivoCarga = motivoFalloBoveda(e); return null })
      if (c?.estado === 'ok') inicial = c.sesion
      log('dispositivo_cargado', { estado: c === null ? 'ilegible' : c.estado === 'ok' ? 'ok' : c.motivo, ...(motivoCarga ? { motivo: motivoCarga } : {}) })
    }
    fuente = fuenteDispositivo(gestor, trabajo.compania, inicial, { log, motivoSinBoveda })
    relevoSms = {
      usado: false,
      relevar: (page, guard) =>
        relevarCodigoSmsGenerali(page, guard, {
          compania: trabajo.compania,
          trabajoId: trabajo.id,
          puerto: puertoCodigoHttp(cfg, trabajo.id),
          prorrogar: (l) => {
            if (l && Number.isFinite(Date.parse(l))) leaseActual = l
            alProrrogar()
          },
          log,
        }),
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

  // CORTOCIRCUITO por credencial (15/10/2026): si esta credencial ya fue rechazada (en este proceso), NO se abre el portal:
  // otro login fallido puede bloquear el usuario que usan las personas. Aviso con el fly secret a corregir.
  if (!fuente.manual) {
    const previo = cortocircuito.motivo(adaptador.credencial)
    if (previo) {
      const mensaje = textoAvisoCredenciales(trabajo.compania, previo, nombresCredencial(adaptador.credencial).contrasena)
      log('credenciales_cortocircuito', { compania: trabajo.compania, motivo: previo })
      await enviarResultado(cfg, { trabajoId: trabajo.id, resultado: 'error', error: { tipo: 'credenciales', mensaje, url: null }, botVersion: adaptador.version })
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
  let limite = limiteDelTrabajo(inicio, trabajo.leaseHasta, TOPE_GLOBAL_MS, TOPE_TRABAJO_MS)
  let browser: Browser | null = null
  // Respaldo duro: si algo se cuelga por encima del límite (incluido el cierre del navegador), se sale.
  const armarRespaldo = () => {
    const t = setTimeout(() => {
      log('tope_duro_superado: salida forzada')
      process.exit(2)
    }, Math.max(limite - Date.now(), 60_000) + 45_000)
    t.unref()
    return t
  }
  let respaldo = armarRespaldo()
  // Relevo del SMS: asegura alarga el lease mientras se espera el código; el límite y el tope duro se recalculan desde AHORA
  // con el lease nuevo (nunca más de un trabajo completo por delante: `TOPE_TRABAJO_MS`).
  alProrrogar = () => {
    limite = limiteDelTrabajo(Date.now(), leaseActual, TOPE_GLOBAL_MS, TOPE_TRABAJO_MS)
    clearTimeout(respaldo)
    respaldo = armarRespaldo()
  }

  // Traza del trabajo (pasos con tiempos y código de error, sin datos): acumula los dos intentos y viaja en el POST del resultado.
  const traza = crearTraza((e) => clasificar(e).tipo)
  const meta = () => ({ pasos: traza.pasos(), botVersion: adaptador.version })
  // Recorrido del trabajo (15/10/2026): mismo redactor que el resto de lo que sale + los valores del riesgo; tope ~60 KB.
  const recorrido = crearCapturadorRecorrido({ redactar: redactarTrabajo, valores: valoresSensiblesDeRiesgo(trabajo.riesgo), log })
  const k: Comun = { sesion: fuente, trabajoId: trabajo.id, compania: trabajo.compania, adaptador, tarificar: v.tarificar, credenciales, formador, traza, recorrido, log, relevoSms }

  // Un intento y, si se cortó en el SMS y el relevo lo verificó, OTRO (ya con el dispositivo) con el límite recalculado.
  const intentarConRelevo = async (b: Browser, topeMs: number): Promise<Intento> => {
    const r = await intentar(b, k, topeMs)
    if (!('verificado' in r)) return r
    const r2 = await intentar(b, k, Math.max(60_000, Math.min(TOPE_GLOBAL_MS, limite - Date.now())))
    // Imposible (el relevo es de un solo uso): por si acaso, es infraestructura, nunca un «ok».
    if ('verificado' in r2) throw new ErrorTarificador('infra', 'relevo del SMS: segunda verificación en el mismo trabajo')
    return r2
  }

  // Un trabajo a la vez por proceso (hoy la máquina solo hace uno; si atiende varios, siguen en serie).
  return enSerie(async () => {
    try {
      browser = await chromium.launch({ headless: true })
      let r = await intentarConRelevo(browser, Math.max(60_000, Math.min(TOPE_GLOBAL_MS, limite - Date.now())))
      let primerFallo: Clasificacion | null = null
      if (!r.ok && r.c.transitorio) {
        const espera = esperaReintentoMs()
        if (cabeReintento(Date.now(), limite, espera)) {
          primerFallo = r.c
          log('reintento_programado', { motivo: r.c.transitorio, tipo: r.c.tipo, esperaMs: espera })
          await dormir(espera)
          r = await intentarConRelevo(browser, Math.min(TOPE_GLOBAL_MS, limite - Date.now()))
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
        // Vehículo de catálogo confirmado (18/10/2026): asegura lo encadena al bot de Generali de la misma oportunidad.
        const st = await enviarResultado(cfg, { trabajoId: trabajo.id, resultado: 'ok', ofertas, pdfs: r.pdfs, ...r.vehiculo, ...meta() })
        log('resultado_ok_enviado', { status: st, ...(fuente.notaBoveda?.() ? { boveda: fuente.notaBoveda() } : {}), ofertas: ofertas.length, intentos: primerFallo ? 2 : 1, recorridoCapturas: recorrido.recorrido().capturas.length, recorridoBytes: recorrido.colector.bytes() })
        return st >= 200 && st < 300 ? 0 : 1
      }

      const { evidencia } = r
      let c = r.c
      if (c.tipo === 'credenciales' && !fuente.manual) {
        // Aviso claro (solo nombres de variables, nunca valores) y cortocircuito para los siguientes trabajos de la credencial.
        const motivo = motivoDeMensaje(c.mensaje)
        cortocircuito.bloquear(adaptador.credencial, motivo)
        if (!/fly secrets/.test(c.mensaje)) c = { ...c, mensaje: textoAvisoCredenciales(trabajo.compania, motivo, nombresCredencial(adaptador.credencial).contrasena) }
        log('credenciales_rechazadas', { compania: trabajo.compania, motivo })
      }
      const recorridoDelTrabajo: Recorrido = recorrido.recorrido()
      const secretos = [...secretosDelEntorno(env), ...secretosRiesgo]
      // VOLCADO (hueco/atasco): un HTML por marco + resumen de pantalla, por el saneador MÁS ESTRICTO (`redactarHtmlGrabacion`) + valores
      // de campos vaciados + redactor del trabajo; recorta por marco si pasa del tope. La sección de accesibilidad (ya redactada) va al final.
      let volcadoHtml: { html: string; recortes: string[] } | null = null
      if (evidencia.volcado && evidencia.volcado.length > 0) {
        try {
          const aria = evidencia.html ? separarAria(evidencia.html).aria : null
          const seccion = aria ? seccionAria(aria) : ''
          const v = construirVolcado(evidencia.volcado, {
            html: (h) => redactarHtml(vaciarValoresCampos(redactarHtmlGrabacion(h)), secretos),
            texto: (t) => redactarTrabajo(redactarTextoGrabacion(t)),
            url: (u) => redactarTrabajo(redactarUrl(u)),
          }, MAX_BYTES_VOLCADO - Buffer.byteLength(seccion))
          volcadoHtml = { html: v.html + seccion, recortes: v.recortes }
        } catch {
          log('volcado_fallido')
        }
      }
      const htmlRedactado = volcadoHtml ? redactarHtml(volcadoHtml.html, secretos) : evidencia.html ? redactarHtml(evidencia.html, secretos) : null
      const htmlViaja = htmlRedactado !== null && Buffer.byteLength(htmlRedactado) <= 2 * 1024 * 1024
      // Dispositivo verificado pero NO guardado en la bóveda: que se vea en el resultado (el stdout de Fly se pierde).
      // Va al FINAL (asegura reconoce `[nota] requiere_verificacion_humana:` con UNA sola nota delante) y cabe siempre en el tope.
      const notaBoveda = fuente.notaBoveda?.() ?? null
      const colaBoveda = notaBoveda ? ` [${notaBoveda}]` : ''
      const mensaje = (nota ? `[${nota}] ` : '') + c.mensaje
      const cuerpo: CuerpoResultado = {
        trabajoId: trabajo.id,
        resultado: 'error',
        error: {
          tipo: c.tipo,
          // Cabeza + cola del mensaje y, al final, la referencia al documento del volcado (nunca un corte a ciegas).
          mensaje: truncarMensajeConReferencia(redactarTrabajo(mensaje), { max: 2000, referencia: htmlViaja ? nombreDocumentoVolcado(trabajo.id) : null, recortes: volcadoHtml?.recortes, cola: colaBoveda }),
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
          // Opciones visibles de la lista (solo texto, por el redactor del trabajo): `[]` = se miró y no había ninguna.
          ...(r.atasco ? { atasco: { ...r.atasco, ...(evidencia.opcionesAtasco ? { opciones: limpiarOpciones(evidencia.opcionesAtasco, redactarTrabajo) } : {}) } } : {}),
        },
        // Captura: el JPEG del atasco/hueco (también con datos personales, marcado) o, si no, el PNG de siempre SOLO sin ellos
        // (`evidencia.captura && secretosRiesgo.length === 0 &&` vive en `capturaParaCable`).
        ...(() => {
          const cap = capturaParaCable({ png: evidencia.captura, jpegAtasco: evidencia.capturaAtasco, hayDatosPersonales: secretosRiesgo.length > 0, maxBytes: MAX_BYTES_EVIDENCIA })
          return cap ? { capturaBase64: cap.base64, ...(cap.conDatos ? { capturaConDatos: true as const } : {}) } : {}
        })(),
        ...(htmlViaja ? { html: htmlRedactado } : {}),
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
        ...(volcadoHtml ? { volcadoMarcos: evidencia.volcado?.length ?? 0, volcadoBytes: Buffer.byteLength(volcadoHtml.html), volcadoRecortes: volcadoHtml.recortes.length } : {}),
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
