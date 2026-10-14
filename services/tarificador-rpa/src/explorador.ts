// EXPLORADOR IA del tarificador RPA — el worker (fase B, 13/10/2026). Plan: docs/TARIFICADOR-RPA.md («Explorador IA»).
//
//   login DETERMINISTA (CRED_*, código del adaptador) → entrada CERRADA (`ENTRADAS_EXPLORACION`) → bucle por pantalla:
//     1. CAPTCHA / SMS-OTP / ventana nueva → PARAR (nunca se automatiza; `requiere_humano` y el aviso sale de asegura);
//     2. inventario SANEADO con refs (lo único que sale hacia asegura y la IA) y parada determinista local;
//     3. `POST /api/tarificador/explorador/paso` → lote de acciones de la lista blanca (memoria del mapa o IA);
//     4. el lote se REVALIDA aquí contra el inventario PROPIO (`validarRespuestaExplorador`): nada sin validar toca el portal;
//     5. cada acción re-resuelve su ref (el MISMO nodo inventariado, vivo, visible, y con tag/id/name/texto iguales:
//        anti-TOCTOU) y se ejecuta: `rellenar` con el VALOR que pone el worker (`resolverDato`: sintético / riesgo del
//        trabajo / env de contacto; nunca a la IA ni al log), `elegir` por valor exacto, `marcar` y `avanzar` SOLO por
//        `ctx.pulsar()` (guard de emisión) o, el único «avance autorizado» de exploración, por la función guardada de
//        guard.ts. Se recoge la red no-GET (origen + ruta) de cada avance para el mapa.
//     6. GUARDAR EL PRESUPUESTO (Alberto, 14/10/2026): en la pantalla de RESULTADO, un `avanzar` con efecto
//        `guardar_presupuesto` (Grabar/Guardar/Archivar/Descargar/Imprimir/PDF; lista única del módulo) va SOLO por
//        `pulsarGuardadoPresupuesto` (guard.ts): se escucha el PDF ANTES del clic (`esperarPdf`), se lee la REFERENCIA del
//        texto de la pantalla (`extraerReferenciaPresupuesto`; nunca al log) y ambos viajan en el cierre/resultado.
//     7. «GUARDAR» DE UN MODAL autorizado por entrada (Alberto, 14/10/2026; hoy solo Occident Hogar, modal «Datos de la
//        situación»): un `avanzar` sobre ese botón va SOLO por `pulsarGuardadoDialogoAutorizado` (guard.ts), que repite vivo
//        el diálogo y su título exactos y exige un único candidato; no abre ventana de red.
//   → `POST …/cierre` (asegura construye el MAPA de SUS pasos) → `POST /api/tarificador/resultado` (`explorado` o error).
//
// 🚨 TARIFICAR ≠ EMITIR: este fichero no pulsa nada por su cuenta (sin `.click()`), no navega a URLs libres, no teclea
//    Enter ni ejecuta JS del portal. 🚨 Nunca se emite (guardar el presupuesto NO es emitir: Emitir/Contratar/Pagar… siguen
//    prohibidos en el validador, en `pulsar()` y en `pulsarGuardadoPresupuesto`). 🔑 Ningún valor de campo ni credencial va al log, a asegura ni a la IA.

import { randomUUID } from 'node:crypto'
import { chromium, type Browser, type Locator, type Page } from 'playwright'
import {
  CLAVES_AUTOCOMPLETADO,
  EmisionBloqueadaError,
  ENTRADAS_EXPLORACION,
  extraerReferenciaPresupuesto,
  detectarBucle,
  descripcionesElemento,
  detectarParada,
  MOTIVO_FRONTERA_CUENTA,
  senalCuentaBancaria,
  esAvanceAutorizado,
  esGuardadoEnDialogoAutorizado,
  esEntradaExploracion,
  huellaPantalla,
  huellaRelleno,
  incidenciasLoteCortado,
  indiceRefs,
  nombresCredencial,
  normalizarRedNoGet,
  ordenarLote,
  relocalizarElemento,
  redactarHtml,
  resolverDato,
  secretosDelEntorno,
  topesExplorador,
  validarRespuestaExplorador,
  type Credenciales,
  type DetalleFinExploracion,
  type ElementoInventario,
  type EntradaExploracion,
  type IncidenciaEjecucion,
  type MarcoInventario,
  type MotivoParar,
  type MotivoSinDato,
  type PantallaGuardado,
  type PresupuestoMapa,
  type TipoError,
} from '@central/module-tarificacion'
import { cerrarExploracion, enviarResultado, pedirPaso, type Config, type CuerpoResultado, type CuerpoResultadoPresupuesto, type RespuestaPaso, type Trabajo } from './api.ts'
import { exigirSinCaptcha } from './captcha.ts'
import { ErrorTarificador, ErrorVerificacionHumana, clasificar } from './errores.ts'
import { cerrarFaseEntrada, ErrorFronteraEmision, GuardadoConDialogoError, instalarGuardEmision, pulsar, pulsarEnlaceEntradaAutorizado, pulsarExploracionAutorizada, pulsarGuardadoDialogoAutorizado, pulsarGuardadoPresupuesto, type GuardEmision } from './guard.ts'
import { esperarPdf } from './descarga-pdf.ts'
import { capturarInventarioExploracion, type InventarioExploracion } from './inventario-dom.ts'
import { modoVistaExplorador, vistaDelPaso } from './aprendizaje/vista-aria.ts'
import { ESTABILIDAD_POR_DEFECTO, esperarEstable, vigilarRed, type OpcionesEstabilidad, type VigiaRed } from './estabilidad.ts'
import { exigirSinVerificacion } from './verificacion.ts'
import { capturarEvidencia, type EvidenciaFallo } from './evidencia.ts'
import { abrirNuevaAlta, esperarMarcoApp, type PestanaEntradaAllianz } from './adapters/allianz/entrada.ts'
import { login as loginEpac } from './adapters/allianz/comunidades.ts'
import { login as loginMapfre } from './adapters/mapfre/login.ts'
import { abrirTarificacionRapidaAuto } from './adapters/mapfre/entrada.ts'
import { abrirTarificacionHogar, login as loginOccident } from './adapters/occident/hogar.ts'
import type { ContextoPortal } from './adaptador.ts'
import type { Log } from './log.ts'

/** Versión del explorador del worker (va en `bot_version`). Súbela al tocar su navegación. */
export const EXPLORADOR_VERSION = '0.2.3'

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const azar = (min: number, max: number) => min + Math.random() * (max - min)
const TOPE_PASO_MS = 30_000
/** Margen sobre el tope de tiempo del explorador para cerrar y mandar el resultado. */
const MARGEN_CIERRE_MS = 90_000
const ATRIBUTO_MARCA = 'data-explorador-ref'
/** Lotes seguidos cortados por repintado (sin completar ninguno) antes de darlo por bucle. */
const MAX_REPINTADOS_SEGUIDOS = 4
/** Tras rellenar un campo que autocompleta (CP, provincia…): margen para que el portal repinte antes de reinventariar. */
const ESPERA_REPINTADO_MS = 1_500
/** Mismos topes de evidencia que el flujo real (runner.ts). */
const MAX_BYTES_CAPTURA = 4 * 1024 * 1024
const MAX_BYTES_HTML = 2 * 1024 * 1024
/** Espera del PDF tras cada pulsación de guardado (si el portal no da PDF en ese clic, se sigue sin él). */
const TOPE_PDF_GUARDADO_MS = 15_000
/** Tope del PDF del presupuesto (el de asegura para un adjunto es 10 MB). */
const MAX_BYTES_PDF_PRESUPUESTO = 9 * 1024 * 1024

// ─── Portales: login y entrada, por CÓDIGO (la IA arranca después) ────────────

export type CtxEntrada = Pick<ContextoPortal, 'credenciales' | 'pausa' | 'pulsar' | 'exigirSinCaptcha' | 'log'> & {
  /** Enlace de menú autorizado de la compañía del trabajo (`pulsarEnlaceEntradaAutorizado`); solo en la ENTRADA. */
  pulsarEnlaceEntrada: (boton: Locator) => Promise<void>
}

export type PortalExploracion = {
  /** Clave de los fly secrets `CRED_<clave>_USER/_PASS`. */
  credencial: string
  /** Devuelve la página donde sigue la exploración si la entrada abrió una PESTAÑA NUEVA; sin valor = la misma `page`. */
  entrar: (page: Page, ctx: CtxEntrada, e: EntradaExploracion) => Promise<Page | void>
}

/** Lista CERRADA de portales con entrada de exploración. Otra compañía = sin portal = no se abre el navegador. */
export const PORTALES_EXPLORACION: Readonly<Record<string, PortalExploracion>> = Object.freeze({
  allianz: Object.freeze({
    credencial: 'ALLIANZ_EPAC',
    entrar: async (page: Page, ctx: CtxEntrada, e: EntradaExploracion) => {
      await loginEpac(page, ctx)
      await exigirSinVerificacion(page, 'allianz')
      await abrirNuevaAlta(page, ctx, { pestana: e.pestana as PestanaEntradaAllianz, producto: e.productoMenu })
      // El formulario vive en el iframe `appArea`: sin esperarlo, el paso 1 inventariaba la carcasa con el modal abierto.
      await esperarMarcoApp(page)
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined)
      await ctx.exigirSinCaptcha()
    },
  }),
  // Mapfre wmediadores (14/10/2026): login → menús → «Tarificación y Emisión Rápida», que abre una PESTAÑA NUEVA con el
  // formulario NSEI; `entrar` la DEVUELVE y el bucle sigue en ella (la original queda abierta y no cuenta como ventana
  // nueva). El contexto NO lleva `httpCredentials` (a propósito: el diálogo de auth básica se cancela con 401).
  mapfre: Object.freeze({
    credencial: 'MAPFRE_WMEDIADORES',
    entrar: async (page: Page, ctx: CtxEntrada, _e: EntradaExploracion): Promise<Page> => {
      await loginMapfre(page, ctx)
      await exigirSinVerificacion(page, 'mapfre')
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined)
      await ctx.exigirSinCaptcha()
      const nsei = await abrirTarificacionRapidaAuto(page, ctx)
      await exigirSinVerificacion(nsei, 'mapfre')
      await nsei.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined)
      await exigirSinCaptcha(nsei)
      return nsei
    },
  }),
  // Occident (14/10/2026): SSO → menú «Productos › Análisis de necesidades › Hogar › Tarificación» → ruta SPA de hogar, con el
  // formulario en un iframe (el inventario ya recorre los marcos, como el `appArea` de Allianz). Mismo login y entrada que
  // `occident/hogar.ts`; hosts = lista blanca de `occident/guarda.ts` (sin ampliar). La misma `page` (sin pestaña nueva).
  occident: Object.freeze({
    credencial: 'OCCIDENT_PORTAL',
    entrar: async (page: Page, ctx: CtxEntrada, _e: EntradaExploracion) => {
      await loginOccident(page, ctx)
      await exigirSinVerificacion(page, 'occident')
      await abrirTarificacionHogar(page, ctx)
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined)
      await ctx.exigirSinCaptcha()
    },
  }),
})

// ─── Reglas puras (con test) ─────────────────────────────────────────────────

export type MotivoFinExploracion = MotivoParar | 'resultado' | 'bucle' | 'tope' | 'error_portal' | 'guard_emision'
export type EfectoPortal = 'posible_proyecto_guardado' | 'presupuesto_guardado' | 'ninguno_visto'

/** Lo que dejó el guardado del presupuesto en el worker (el PDF va en bytes; al cierre solo si llegó). */
export type PresupuestoWorker = { guardado: boolean; referencia: string | null; pdf: Buffer | null; pdfIntentado: boolean }

/** Para el cierre (`mapa.presupuesto`): tres estados del PDF (`null` = no se intentó). Pura. */
export function presupuestoParaCierre(p: PresupuestoWorker): PresupuestoMapa {
  if (!p.guardado) return { guardado: false, referencia: null, pdf: null }
  return { guardado: true, referencia: p.referencia, pdf: p.pdf ? true : p.pdfIntentado ? false : null }
}

/** Para el resultado del trabajo: `null` sin guardado; si no, referencia y PDF (base64) si llegó. Pura. */
export function presupuestoParaResultado(p: PresupuestoWorker, compania: string): CuerpoResultadoPresupuesto | null {
  if (!p.guardado) return null
  return { referencia: p.referencia, pdf: p.pdf ? { nombre: `presupuesto-${compania}.pdf`, base64: p.pdf.toString('base64') } : null }
}

export type FinBucle = {
  /** `perdido` = asegura ya no reconoce la exploración (404): ni cierre ni resultado. */
  motivo: MotivoFinExploracion | 'perdido'
  error: { tipo: TipoError; mensaje: string } | null
  redNoGet: string[]
  efectos: EfectoPortal[]
  pasos: number
  acciones: number
  /** Guardado del presupuesto (14/10/2026). Ausente = nada guardado. */
  presupuesto?: PresupuestoWorker
  /** Qué comprobación del worker cortó (lista cerrada, sin valores): distingue los `ambiguo` entre sí. */
  detalle?: DetalleFinExploracion
  /** Incidencias de ejecución del ÚLTIMO lote aún sin contar a asegura (van en el cierre). Sin valores. */
  incidencias?: IncidenciaEjecucion[]
  /** Solo en los fallos de la ENTRADA cerrada (antes del primer paso): URL, captura y HTML ya redactados. */
  evidencia?: EvidenciaSaneada
}

/** Evidencia lista para salir hacia asegura: URL redactada, captura y HTML con marcos pasado por `redactarHtml`. */
export type EvidenciaSaneada = { url: string | null; capturaBase64?: string; html?: string }

/**
 * Evidencia cruda → la que sale (como el runner del flujo real): URL por el redactor, HTML por `redactarHtml` con los
 * secretos del entorno, y captura/HTML solo si caben en los topes. Pura.
 */
export function sanearEvidencia(ev: EvidenciaFallo, redactar: (t: string) => string, secretos: readonly string[]): EvidenciaSaneada {
  const html = ev.html ? redactarHtml(ev.html, secretos) : null
  return {
    url: ev.url ? redactar(ev.url).slice(0, 500) : null,
    ...(ev.captura && ev.captura.length <= MAX_BYTES_CAPTURA ? { capturaBase64: ev.captura.toString('base64') } : {}),
    ...(html && Buffer.byteLength(html) <= MAX_BYTES_HTML ? { html } : {}),
  }
}

/**
 * ¿Se corta el lote tras este `rellenar` para volver a inventariar? Sí si la clave suele disparar autocompletado
 * (`CLAVES_AUTOCOMPLETADO`) o si la pantalla cambió de estructura (huella o nº de elementos) tras escribir. Pura.
 */
export function cortarLoteTrasRellenar(dato: string, antes: { huella: string; elementos: number }, despues: { huella: string; elementos: number } | null): boolean {
  if (CLAVES_AUTOCOMPLETADO.has(dato)) return true
  return despues !== null && (despues.huella !== antes.huella || despues.elementos !== antes.elementos)
}

const nElementos = (inv: InventarioExploracion['inventario']) => inv.marcos.reduce((n, m) => n + m.elementos.length, 0)

/** Un dato que no se puede poner → por qué se para (fail-closed: nunca se inventa). */
export function motivoSinDato(m: MotivoSinDato): MotivoParar {
  // `dato_no_disponible` (14/10/2026): falta un dato del riesgo (año, m²…), no es un dato SENSIBLE; decirlo así despistaba.
  return m === 'clave_desconocida' ? 'ambiguo' : m === 'dato_no_disponible' ? 'dato_no_disponible' : 'dato_sensible_requerido'
}

/**
 * ¿El control quedó con el valor escrito? (14/10/2026: un datepicker Angular puede vaciar o reformatear lo que `fill` puso.)
 * Tolera el reformateo del portal: espacios, «€», separadores de fecha/miles/decimales («15/01/1980» ↔ «15-01-1980»,
 * «120000» ↔ «120.000,00»). Vacío o distinto → `false`. Pura; los valores nunca salen de aquí.
 */
export function valorAplicado(escrito: string, leido: string): boolean {
  const n = (s: string) => s.toLowerCase().replace(/\s+/g, '').replace(/€/g, '')
  const a = n(escrito)
  const b = n(leido)
  if (b === '') return a === ''
  if (a === b) return true
  const sinSep = (s: string) => s.replace(/,0+$/, '').replace(/[.,/-]/g, '')
  return sinSep(a) === sinSep(b)
}

/**
 * Qué hacer con un `rellenar` cuya clave no tiene valor (13/10/2026). Con datos REALES y una clave del riesgo ausente
 * (`dato_no_disponible`: p. ej. año o m², que el portal autocompleta del Catastro tras la dirección) y el control YA
 * relleno por el portal → `saltar` (no se toca). En cualquier otro caso, parar: nunca un valor de prueba en su lugar.
 */
export function accionSinDato(m: MotivoSinDato, conDatosReales: boolean, controlConValor: boolean): 'saltar' | MotivoParar {
  if (m === 'dato_no_disponible' && conDatosReales && controlConValor) return 'saltar'
  return motivoSinDato(m)
}

/** Lo que se lee del nodo VIVO justo antes de tocarlo. */
export type NodoVivo = { tag: string; id: string | null; name: string | null; type: string | null; texto: string }

const sinElipsis = (s: string) => (s.endsWith('…') ? s.slice(0, -1) : s)
const plano = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()

/**
 * Anti-TOCTOU: ¿el nodo vivo sigue siendo el elemento del inventario? Mismo tag; id/name/type iguales cuando el inventario
 * los tiene (si el saneado los recortó, por prefijo); y el texto visible igual (o prefijo, si se recortó). Si el inventario
 * no tiene un atributo (p. ej. lo quitó el filtro de datos personales) no se compara: lo demás tiene que casar.
 */
export function coincideConInventario(vivo: NodoVivo | null, el: ElementoInventario): boolean {
  if (!vivo || vivo.tag !== el.tag) return false
  const igual = (inv: string | undefined, v: string | null) => {
    if (inv === undefined) return true
    const base = sinElipsis(inv)
    return inv.endsWith('…') ? plano(v).startsWith(base) : plano(v) === inv
  }
  if (!igual(el.id, vivo.id) || !igual(el.name, vivo.name) || !igual(el.type, vivo.type)) return false
  return igual(el.texto, vivo.texto)
}

/** Fecha dd/mm/aaaa → aaaa-mm-dd para un `<input type=date>` (el catálogo da dd/mm/aaaa). Otra forma: tal cual. */
export function valorParaControl(valor: string, el: ElementoInventario): string {
  if (el.tag !== 'input' || (el.type ?? '').toLowerCase() !== 'date') return valor
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(valor)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : valor
}

/** Del error que cortó la exploración a su motivo de fin. Nunca lanza. */
export function finDeError(e: unknown): { motivo: MotivoFinExploracion; error: { tipo: TipoError; mensaje: string } | null; detalle?: DetalleFinExploracion } {
  if (e instanceof ErrorVerificacionHumana) return { motivo: 'otp', error: null }
  // Frontera de emisión (cuenta bancaria en pantalla): fin CORRECTO de la exploración, no un fallo del guard.
  if (e instanceof ErrorFronteraEmision) return { motivo: 'cerca_de_emision', error: null, detalle: 'frontera_cuenta_bancaria' }
  if (e instanceof EmisionBloqueadaError) return { motivo: 'guard_emision', error: { tipo: 'emision', mensaje: e.message } }
  if (e instanceof ErrorTarificador && e.tipo === 'captcha') return { motivo: 'captcha', error: null }
  const c = clasificar(e)
  return { motivo: 'error_portal', error: { tipo: c.tipo === 'emision' ? 'emision' : c.tipo, mensaje: c.mensaje } }
}

/**
 * El cuerpo del resultado que cierra el TRABAJO. OTP/SMS y CAPTCHA → `captcha` (requiere_humano: una persona; el aviso sale
 * de asegura). Guard de emisión → `emision`. Fallo del portal/infra → su tipo. Cualquier otra parada (incluido llegar al
 * precio, `cerca_de_emision`, `dato_sensible_requerido`, bucle, topes) es una exploración TERMINADA: `explorado`.
 */
export function resultadoDeFin(trabajoId: string, compania: string, fin: Pick<FinBucle, 'motivo' | 'error' | 'evidencia' | 'presupuesto'>, redactar: (t: string) => string): CuerpoResultado | null {
  const meta = { botVersion: EXPLORADOR_VERSION }
  // Evidencia de la entrada (si la hay): URL en el error; captura y HTML al lado, como en el flujo real.
  const ev = fin.evidencia
  const url = ev?.url ?? null
  const adjuntos = { ...(ev?.capturaBase64 ? { capturaBase64: ev.capturaBase64 } : {}), ...(ev?.html ? { html: ev.html } : {}) }
  if (fin.motivo === 'perdido') return null
  if (fin.motivo === 'otp') return { trabajoId, resultado: 'error', error: { tipo: 'captcha', mensaje: new ErrorVerificacionHumana(compania).message, url }, ...adjuntos, ...meta }
  if (fin.motivo === 'captcha') return { trabajoId, resultado: 'error', error: { tipo: 'captcha', mensaje: 'exploración: el portal presenta un CAPTCHA: requiere una persona', url }, ...adjuntos, ...meta }
  if (fin.motivo === 'guard_emision' || fin.motivo === 'error_portal') {
    const tipo: TipoError = fin.error?.tipo ?? (fin.motivo === 'guard_emision' ? 'emision' : 'portal')
    return { trabajoId, resultado: 'error', error: { tipo, mensaje: redactar(`exploración: ${fin.error?.mensaje ?? fin.motivo}`).slice(0, 2000), url }, ...adjuntos, ...meta }
  }
  // Presupuesto guardado: su referencia y su PDF viajan con el resultado (asegura guarda el PDF como documento del trabajo).
  const presupuesto = fin.presupuesto ? presupuestoParaResultado(fin.presupuesto, compania) : null
  return { trabajoId, resultado: 'explorado', motivoFin: fin.motivo, ...(presupuesto ? { presupuesto } : {}), ...meta }
}

// ─── El bucle (sobre una página ya dentro del portal) ────────────────────────

export type ContextoBucle = {
  trabajoId: string
  compania: string
  ramo: string
  entrada: string
  conDatosReales: boolean
  riesgo: unknown
  env: Record<string, string | undefined>
  guard: GuardEmision
  /** `ctx.pulsar` del runner: pausa + `pulsar(boton, guard)`. */
  pulsar: (boton: Locator) => Promise<void>
  /** El único avance «autorizado» de exploración (guard.ts). */
  pulsarAutorizado: (boton: Locator, el: ElementoInventario, marco: MarcoInventario) => Promise<void>
  /** El guardado de presupuesto autorizado (guard.ts, `pulsarGuardadoPresupuesto`). `trasClic` espera el PDF dentro de la ventana. */
  pulsarGuardado: (boton: Locator, el: ElementoInventario, pantalla: PantallaGuardado, trasClic: () => Promise<void>) => Promise<void>
  /** El «Guardar» de un modal autorizado por entrada (guard.ts, `pulsarGuardadoDialogoAutorizado`). */
  pulsarGuardadoDialogo: (boton: Locator, el: ElementoInventario, marco: MarcoInventario) => Promise<void>
  pausaAccion: () => Promise<void>
  /** `incidencias` (14/10/2026): lo que el lote ANTERIOR no pudo aplicar (ref + clave + causa; nunca el valor). */
  pedirPaso: (cuerpo: { trabajoId: string; inventario: InventarioExploracion['inventario']; avancesFallidos: number; incidencias?: IncidenciaEjecucion[]; vistaAria?: string }) => Promise<RespuestaPaso>
  log: Log
  ahora?: () => number
  hoy?: () => Date
  /** Espera tras rellenar un campo que autocompleta, antes de reinventariar (por defecto `ESPERA_REPINTADO_MS`). */
  esperaRepintadoMs?: number
  /** Páginas que ya existían al terminar la ENTRADA (por defecto, solo `page`): cualquier otra = ventana nueva → `sin_salida`. */
  paginasDeEntrada?: readonly Page[]
  /** Espera del PDF tras cada guardado (por defecto `TOPE_PDF_GUARDADO_MS`). */
  topePdfMs?: number
  /** Pantalla QUIETA (sin red en vuelo ni DOM cambiando) antes de inventariar y de tocar nada (`esperarEstable`). */
  estabilidad?: OpcionesEstabilidad
}

class Parar extends Error {
  constructor(readonly motivo: MotivoFinExploracion | 'perdido', readonly detalle?: DetalleFinExploracion) {
    super(`parar:${motivo}`)
  }
}

/**
 * El bucle del explorador. Nunca lanza: devuelve cómo terminó. Topes locales (los del módulo; el env solo los baja):
 * pasos, acciones y tiempo; asegura aplica además los de llamadas y €.
 */
export async function bucleExploracion(page: Page, k: ContextoBucle): Promise<FinBucle> {
  const ahora = k.ahora ?? Date.now
  const inicio = ahora()
  const topes = topesExplorador(k.env)
  const modoVista = modoVistaExplorador(k.env)
  const red = new Set<string>()
  const efectos = new Set<EfectoPortal>()
  const huellas: string[] = []
  const deEntrada = new Set<Page>(k.paginasDeEntrada ?? [page])
  /** Huella de RELLENO de cada pantalla de `huellas` (alineadas): misma huella con más campos rellenos no es bucle. */
  const rellenos: (string | null)[] = []
  let pasos = 0
  let acciones = 0
  let avancesFallidos = 0
  let huellaAntesDeAvanzar: string | null = null
  let captura: InventarioExploracion | null = null
  /** El lote anterior se CORTÓ porque la pantalla se repintó (no terminó): esta pantalla no cuenta para el bucle. */
  let trasRepintado = false
  let repintadosSeguidos = 0
  /** Guardado del presupuesto: se rellena al pulsar un guardar_presupuesto (y habilita el 2.º y el `terminar` sin importes). */
  const presupuesto: PresupuestoWorker = { guardado: false, referencia: null, pdf: null, pdfIntentado: false }
  const estabilidad = k.estabilidad ?? ESTABILIDAD_POR_DEFECTO
  /** La red se vigila durante TODO el bucle: así cuenta la validación que salió al quitar el foco de un `rellenar`. */
  const vigia = vigilarRed(page)
  /** Espera a pantalla quieta; si se agota el tope se sigue (y queda en el log local, sin valores). */
  const asentar = async (donde: string) => {
    if ((await esperarEstable(page, estabilidad, vigia)) === 'tope') k.log('exploracion_espera', { n: pasos, donde, estado: 'tope' })
  }
  /** Incidencias del lote en curso: salen con el SIGUIENTE paso (o con el cierre). */
  let incidencias: IncidenciaEjecucion[] = []
  const fin = (motivo: FinBucle['motivo'], error: FinBucle['error'] = null, detalle?: DetalleFinExploracion): FinBucle => ({
    motivo, error, redNoGet: [...red].slice(0, 50), efectos: efectos.size ? [...efectos] : ['ninguno_visto'], pasos, acciones,
    ...(detalle ? { detalle } : {}),
    ...(incidencias.length ? { incidencias: [...incidencias] } : {}),
    ...(presupuesto.guardado ? { presupuesto: { ...presupuesto } } : {}),
  })
  try {
    for (;;) {
      if (pasos >= topes.maxPasos || ahora() - inicio >= topes.maxMs) throw new Parar('tope')
      k.guard.comprobar()
      await exigirSinCaptcha(page)
      await exigirSinVerificacion(page, k.compania)
      // Una ventana nueva (popup) abierta DURANTE el bucle no se sigue en v1: hueco. Las de la entrada no cuentan.
      if (page.context().pages().some((p) => !deEntrada.has(p))) throw new Parar('sin_salida')
      await captura?.liberar()
      // Pantalla QUIETA antes de inventariar (14/10/2026, 8d0676f9: tras rellenar el número de la vía, la validación
      // asíncrona repintó la sección DESPUÉS de inventariar y el nodo del año quedó obsoleto).
      await asentar('inventario')
      captura = await capturarInventarioExploracion(page)
      if (!captura) throw new Error('no se pudo leer el inventario de la pantalla')
      const inv = captura.inventario
      const parada = detectarParada(inv)
      if (parada) {
        // La señal (p. ej. la ETIQUETA del campo de cuenta bancaria; nunca un valor) va al log local; al cierre, el código.
        if (parada.detalle) k.log('exploracion_parada', { motivo: parada.motivo, detalle: parada.detalle, senal: parada.senal })
        throw new Parar(parada.motivo, parada.detalle)
      }
      const huella = huellaPantalla(inv)
      if (huellaAntesDeAvanzar !== null) avancesFallidos = huella === huellaAntesDeAvanzar ? avancesFallidos + 1 : 0
      huellaAntesDeAvanzar = null
      // Un lote cortado por repintado no es un intento fallido de avanzar: la pantalla que sigue no cuenta para el bucle
      // (lo acotan los repintados seguidos y los topes de acciones/pasos/tiempo).
      if (trasRepintado) {
        if (++repintadosSeguidos > MAX_REPINTADOS_SEGUIDOS) throw new Parar('bucle', 'repintados_seguidos')
      } else {
        repintadosSeguidos = 0
        const relleno = huellaRelleno(inv)
        if (detectarBucle(huellas, huella, avancesFallidos, { anteriores: rellenos, actual: relleno })) throw new Parar('bucle')
        huellas.push(huella)
        rellenos.push(relleno)
      }
      trasRepintado = false

      // Vista aria opcional (TARIFICADOR_EXPLORADOR_VISTA; defecto `dom` = nada cambia). Mide tamaños dom vs aria, sin datos.
      const vista = await vistaDelPaso(page, modoVista, JSON.stringify(inv).length)
      k.log('exploracion_vista', { n: pasos + 1, ...vista.metrica })
      const r = await k.pedirPaso({ trabajoId: k.trabajoId, inventario: inv, avancesFallidos, ...(incidencias.length ? { incidencias } : {}), ...(vista.vistaAria ? { vistaAria: vista.vistaAria } : {}) })
      incidencias = []
      pasos++
      if (r.estado === 'perdido') throw new Parar('perdido')
      // REVALIDACIÓN contra el inventario PROPIO (el que se mandó): lo que no valida aquí no toca el portal.
      const v = validarRespuestaExplorador(r.respuesta, { inventario: inv, ramo: k.ramo, entrada: k.entrada, datosReales: k.conDatosReales ? { riesgo: k.riesgo } : null, presupuestoEnCurso: presupuesto.guardado })
      if (!v.ok) throw new Parar('ambiguo', 'lote_no_valido')
      if (r.estado !== 'ok') {
        const p = v.respuesta.acciones[0]
        throw p?.accion === 'parar' ? new Parar(p.motivo) : new Parar('ambiguo', 'paso_no_ok')
      }
      const refs = indiceRefs(inv)
      // ORDEN (14/10/2026, 8d0676f9): todo en el orden de la IA salvo los rellenar que REPINTAN (CP, combobox…), que pasan
      // al final, antes del avance: así año y m² se escriben ANTES de que el CP o la vía repinten y corten el lote.
      const lote = ordenarLote(v.respuesta.acciones, inv)
      k.log('exploracion_paso', {
        n: pasos,
        pantalla: v.respuesta.pantalla.tipo,
        acciones: lote.map((a) => (a.accion === 'rellenar' ? `rellenar ${a.ref}=${a.dato}` : 'ref' in a ? `${a.accion} ${a.ref}` : a.accion)),
      })

      const antes = { huella, elementos: nElementos(inv) }
      /** Acciones de ESTE lote que ya tocaron el portal: con alguna hecha, un nodo que ya no está = repintado, no ambigüedad. */
      let hechas = 0
      /** Corta el lote: las acciones que quedan SIN ejecutar viajan como incidencias `lote_cortado` (ref + clave; sin valor). */
      const cortarLote = (desde: number, causa: string) => {
        const pendientes = incidenciasLoteCortado(lote.slice(desde))
        incidencias.push(...pendientes)
        trasRepintado = true
        k.log('exploracion_lote_cortado', { n: pasos, causa, hechas, pendientes: pendientes.length })
      }
      lote: for (let i = 0; i < lote.length; i++) {
        const a = lote[i]
        if (a.accion === 'parar') throw new Parar(a.motivo)
        if (a.accion === 'terminar') throw new Parar('resultado')
        if (++acciones > topes.maxAcciones) throw new Parar('tope')
        let hit = refs.get(a.ref)
        const nodo = captura.nodos.get(a.ref)
        if (!hit || !nodo) throw new Parar('ambiguo', 'ref_fuera_de_captura')
        // Frontera de emisión: un campo de cuenta bancaria NUNCA se rellena, elige ni marca (segunda barrera tras detectarParada).
        const exigirSinCuenta = (el: ElementoInventario) => {
          // Descripciones COMPLETAS (texto, aria-label, etiqueta, id, name, onclick, placeholder, formControlName).
          const cuenta = senalCuentaBancaria(descripcionesElemento(el))
          if (cuenta === null) return
          k.log('exploracion_parada', { motivo: 'cerca_de_emision', detalle: 'frontera_cuenta_bancaria', senal: `${MOTIVO_FRONTERA_CUENTA} («${cuenta}»)` })
          throw new Parar('cerca_de_emision', 'frontera_cuenta_bancaria')
        }
        exigirSinCuenta(hit.el)
        // Antes del PRIMER rellenar del lote: pantalla quieta (un repintado a medias dejaría el nodo a punto de caducar).
        if (i === 0 && a.accion === 'rellenar') await asentar('primer_rellenar')
        let loc = await localizar(nodo, hit.el)
        // `rellenar` como PRIMERA acción con el nodo repintado (14/10/2026, Allianz Hogar: Angular re-renderiza el formulario
        // entre el inventario y el lote): se re-inventaría UNA vez y se busca el MISMO control por su identidad.
        if (!loc && hechas === 0 && a.accion === 'rellenar') {
          // Solo en la MISMA pantalla que se validó (`huella` de este paso): si cambió, no se relocaliza (fail-closed).
          const re = await relocalizar(page, hit.el, hit.marco, huella, k.esperaRepintadoMs ?? ESPERA_REPINTADO_MS, estabilidad, vigia)
          k.log('exploracion_relocalizacion', { n: pasos, ref: a.ref, estado: re ? 'ok' : 'no_encontrado' })
          if (re) {
            ({ loc, hit } = re)
            // La frontera se repite sobre el control RELOCALIZADO antes de escribir (revisión PR #4648).
            try {
              exigirSinCuenta(hit.el)
            } catch (err) {
              await loc.evaluate((n, at) => n.removeAttribute(at), ATRIBUTO_MARCA).catch(() => undefined)
              throw err
            }
          } else {
            incidencias.push({ accion: 'rellenar', ref: a.ref, dato: a.dato, causa: 'nodo_no_relocalizado' })
            throw new Parar('ambiguo', 'nodo_no_relocalizado')
          }
        }
        if (!loc) {
          // Lo ya hecho en este lote pudo repintar la pantalla (autocompletado): se corta aquí y se reinventaría; la IA ve
          // la pantalla nueva. Sin nada hecho, el nodo cambió sin que lo tocásemos: anti-TOCTOU, se para.
          if (hechas > 0) {
            acciones--
            cortarLote(i, 'nodo_no_localizado')
            break lote
          }
          throw new Parar('ambiguo', 'nodo_no_localizado')
        }
        let cortar = false
        try {
          if (a.accion === 'rellenar') {
            const d = resolverDato(a.dato, { ramo: k.ramo, conDatosReales: k.conDatosReales, riesgo: k.riesgo, env: k.env, hoy: (k.hoy ?? (() => new Date()))() })
            if (!d.ok) {
              const conValor = d.motivo === 'dato_no_disponible' && k.conDatosReales
                ? await loc.inputValue({ timeout: 5_000 }).then((v) => v.trim() !== '').catch(() => false)
                : false
              const que = accionSinDato(d.motivo, k.conDatosReales, conValor)
              if (que === 'saltar') continue
              throw new Parar(que, d.motivo === 'clave_desconocida' ? 'clave_desconocida' : undefined)
            }
            await k.pausaAccion()
            // 🔑 El valor no se loguea ni sale del proceso: va directo al campo.
            const escrito = valorParaControl(d.valor, hit.el)
            await loc.fill(escrito, { timeout: 10_000 })
            hechas++
            const quedan = i < lote.length - 1
            if (CLAVES_AUTOCOMPLETADO.has(a.dato)) {
              // El autocompletado suele colgar del `change`, que sale al perder el foco: se le quita (sin clic ni Enter) y se
              // deja repintar ANTES de seguir, aunque fuera la última acción (la próxima captura ya ve la pantalla nueva).
              await loc.blur({ timeout: 5_000 }).catch(() => undefined)
              await dormir(k.esperaRepintadoMs ?? ESPERA_REPINTADO_MS)
              await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
              cortar = quedan
            } else {
              const fijado = await fijarValor(loc, escrito)
              if (fijado !== 'ok') k.log('exploracion_valor', { n: pasos, ref: a.ref, estado: fijado })
              // Ni con el reintento tecleando: queda como error del paso en asegura (ref + clave; nunca el valor).
              if (fijado === 'no_aplicado') incidencias.push({ accion: 'rellenar', ref: a.ref, dato: a.dato, causa: 'valor_no_aplicado' })
              if (quedan) {
                // ¿Cambió la estructura al escribir? Solo importa si quedan acciones (si no, el bucle reinventaría igualmente).
                const sonda = await capturarInventarioExploracion(page).catch(() => null)
                const despues = sonda ? { huella: huellaPantalla(sonda.inventario), elementos: nElementos(sonda.inventario) } : null
                await sonda?.liberar()
                cortar = cortarLoteTrasRellenar(a.dato, antes, despues)
              }
            }
          } else if (a.accion === 'elegir') {
            await k.pausaAccion()
            const elegidas = await loc.selectOption({ value: a.opcion.valor }, { timeout: 10_000 })
            if (elegidas.length !== 1 || elegidas[0] !== a.opcion.valor) throw new Parar('ambiguo', 'opcion_no_aplicada')
            hechas++
          } else if (a.accion === 'marcar') {
            await k.pulsar(loc)
            hechas++
          } else {
            const alPedir = (q: { method(): string; url(): string }) => {
              if (q.method() === 'GET') return
              const n = normalizarRedNoGet(q.url())
              if (n) red.add(n)
            }
            page.on('request', alPedir)
            try {
              if (a.efectoEsperado === 'guardar_presupuesto') {
                // GUARDAR PRESUPUESTO: por su puerta (guard.ts), con el PDF escuchado ANTES del clic.
                const pantalla: PantallaGuardado = { tipoPantalla: v.respuesta.pantalla.tipo, hayImportes: inv.marcos.some((m) => (m.importes?.length ?? 0) > 0), presupuestoEnCurso: presupuesto.guardado }
                const espera = presupuesto.pdf ? null : esperarPdf(page, k.topePdfMs ?? TOPE_PDF_GUARDADO_MS)
                try {
                  await k.pulsarGuardado(loc, hit.el, pantalla, async () => {
                    const pdf = espera ? await espera.promesa : null
                    if (pdf && pdf.bytes.length <= MAX_BYTES_PDF_PRESUPUESTO) presupuesto.pdf = pdf.bytes
                  })
                } finally {
                  espera?.cancelar()
                }
                presupuesto.guardado = true
                presupuesto.pdfIntentado ||= espera !== null
                efectos.add('presupuesto_guardado')
                await page.waitForLoadState('domcontentloaded', { timeout: TOPE_PASO_MS }).catch(() => undefined)
                await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
                // La REFERENCIA, del texto visible de la pantalla tras guardar (no se loguea; solo si se vio).
                presupuesto.referencia ??= await referenciaVisible(page)
                k.log('exploracion_presupuesto', { n: pasos, pdf: presupuesto.pdf ? 'si' : 'no', referencia: presupuesto.referencia ? 'si' : 'no' })
              } else if (esAvanceAutorizado(k.entrada, hit.el, hit.marco)) {
                efectos.add('posible_proyecto_guardado')
                await k.pulsarAutorizado(loc, hit.el, hit.marco)
              } else if (esGuardadoEnDialogoAutorizado(k.entrada, hit.el)) {
                // «Guardar» de un modal autorizado por entrada (Occident, «Datos de la situación»): por SU puerta, que lo
                // repite vivo (diálogo y título exactos, un solo candidato). No se sabe si el portal persiste algo: se anota.
                efectos.add('posible_proyecto_guardado')
                await k.pulsarGuardadoDialogo(loc, hit.el, hit.marco)
              } else {
                await k.pulsar(loc)
              }
              await page.waitForLoadState('domcontentloaded', { timeout: TOPE_PASO_MS }).catch(() => undefined)
              await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
            } finally {
              page.off('request', alPedir)
            }
            k.guard.comprobar()
            huellaAntesDeAvanzar = huella
          }
        } finally {
          await loc.evaluate((n, at) => n.removeAttribute(at), ATRIBUTO_MARCA).catch(() => undefined)
        }
        if (cortar) {
          cortarLote(i + 1, 'repintado_tras_rellenar')
          break lote
        }
      }
    }
  } catch (e) {
    if (e instanceof Parar) return fin(e.motivo, null, e.detalle)
    // Un diálogo al guardar (confirm/alert): el robot no confirma; se para con su detalle (no es un fallo del guard).
    if (e instanceof GuardadoConDialogoError && !k.guard.violacion()) return fin('ambiguo', null, 'guardado_con_dialogo')
    // Una violación del guard en segundo plano manda sobre el error con el que se cortó.
    const f = finDeError(k.guard.violacion() ?? e)
    return fin(f.motivo, f.error, f.detalle)
  } finally {
    vigia.soltar()
    await captura?.liberar()
  }
}

/** Texto visible de todos los marcos (acotado) → referencia del presupuesto, o `null`. El texto no sale de aquí. */
async function referenciaVisible(page: Page): Promise<string | null> {
  for (const f of page.frames()) {
    if (f.isDetached()) continue
    const t = await f.evaluate(() => (document.body?.innerText ?? '').slice(0, 20_000)).catch(() => '')
    const r = extraerReferenciaPresupuesto(t)
    if (r) return r
  }
  return null
}

/**
 * Tras el `fill` de un campo SIN autocompletado (14/10/2026): se le quita el foco (sin clic ni Enter) y se RELEE. Si el
 * portal lo dejó vacío o distinto (datepicker Angular), UN reintento tecleando carácter a carácter (`pressSequentially`,
 * solo el valor: nunca Enter ni Tab). Nunca lanza; el valor no sale de aquí (ni al log). `desconocido` = el nodo ya no se
 * puede leer (repintado): lo verá el siguiente inventario (`conValor`/`invalido`).
 */
async function fijarValor(loc: Locator, valor: string): Promise<'ok' | 'reintentado' | 'no_aplicado' | 'desconocido'> {
  const leer = () => loc.inputValue({ timeout: 5_000 }).catch(() => null)
  await loc.blur({ timeout: 5_000 }).catch(() => undefined)
  const v1 = await leer()
  if (v1 === null) return 'desconocido'
  if (valorAplicado(valor, v1)) return 'ok'
  try {
    await loc.clear({ timeout: 5_000 })
    await loc.pressSequentially(valor, { delay: 60, timeout: 15_000 })
    await loc.blur({ timeout: 5_000 }).catch(() => undefined)
  } catch {
    return 'no_aplicado'
  }
  const v2 = await leer()
  return v2 !== null && valorAplicado(valor, v2) ? 'reintentado' : 'no_aplicado'
}

/**
 * Tras un repintado: espera a que el portal se asiente, RE-INVENTARÍA una vez y busca el mismo control por su identidad
 * (`relocalizarElemento`, pura) SOLO si la pantalla nueva tiene la huella validada del paso. Devuelve su Locator y su entrada del inventario NUEVO, o `null`. Nunca lanza; libera la captura.
 */
async function relocalizar(page: Page, el: ElementoInventario, marco: MarcoInventario, huellaValidada: string, esperaMs: number, estabilidad: OpcionesEstabilidad, vigia: VigiaRed): Promise<{ loc: Locator; hit: { el: ElementoInventario; marco: MarcoInventario } } | null> {
  await dormir(esperaMs)
  // `networkidle` no sirve en una SPA (resuelve al instante tras la carga): se espera a la pantalla QUIETA de verdad.
  await esperarEstable(page, estabilidad, vigia)
  const nueva = await capturarInventarioExploracion(page).catch(() => null)
  if (!nueva) return null
  try {
    const ref = relocalizarElemento(el, marco.url, nueva.inventario, huellaValidada)
    const hit = ref ? indiceRefs(nueva.inventario).get(ref) : undefined
    const nodo = ref ? nueva.nodos.get(ref) : undefined
    if (!hit || !nodo) return null
    const loc = await localizar(nodo, hit.el)
    return loc ? { loc, hit } : null
  } catch {
    // Revisión: «nunca lanza» de verdad. Un fallo aquí = no se relocaliza (fail-closed: el bucle para «nodo_no_relocalizado»).
    return null
  } finally {
    await nueva.liberar()
  }
}

/**
 * Re-resuelve la ref: el MISMO nodo inventariado, aún conectado y visible, con tag/id/name/type/texto iguales. Devuelve un
 * Locator único (marca temporal en el nodo) para pasar por `ctx.pulsar()`/`fill`/`selectOption`. `null` = ya no es él.
 */
async function localizar(nodo: InventarioExploracion['nodos'] extends Map<string, infer N> ? N : never, el: ElementoInventario): Promise<Locator | null> {
  const vivo = await nodo.handle
    .evaluate((n) => {
      const e = n as HTMLElement
      if (!e.isConnected || typeof e.getAttribute !== 'function') return null
      return { tag: e.tagName.toLowerCase(), id: e.id || null, name: e.getAttribute('name'), type: e.getAttribute('type'), texto: (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim() }
    })
    .catch(() => null)
  if (!coincideConInventario(vivo, el)) return null
  if (!(await nodo.handle.isVisible().catch(() => false))) return null
  const marca = randomUUID().slice(0, 12)
  const ok = await nodo.handle.evaluate((n, [at, m]) => { (n as HTMLElement).setAttribute(at, m); return true }, [ATRIBUTO_MARCA, marca] as const).catch(() => false)
  if (!ok) return null
  const loc = nodo.marco.locator(`[${ATRIBUTO_MARCA}="${marca}"]`)
  return (await loc.count().catch(() => 0)) === 1 ? loc : null
}

// ─── El trabajo completo ─────────────────────────────────────────────────────

/**
 * Fin de una exploración que murió en la ENTRADA cerrada (antes del primer paso): su motivo/error y la evidencia de la
 * pantalla en la que se quedó (la del flujo real: URL, captura y HTML con marcos, redactados). Nunca lanza.
 */
export async function finDeEntrada(e: unknown, page: Page, redactar: (t: string) => string, env: Record<string, string | undefined>): Promise<FinBucle> {
  const f = finDeError(e)
  // La evidencia es un extra: si sanearla fallara, el fin conserva su motivo/error en vez de caer al catch genérico.
  const evidencia = await capturarEvidencia(page).then((ev) => sanearEvidencia(ev, redactar, secretosDelEntorno(env))).catch(() => undefined)
  return { motivo: f.motivo, error: f.error, redNoGet: [], efectos: ['ninguno_visto'], pasos: 0, acciones: 0, ...(f.detalle ? { detalle: f.detalle } : {}), ...(evidencia ? { evidencia } : {}) }
}

/**
 * La ENTRADA cerrada y el bucle, sobre la página donde terminó la entrada (la que `entrar` devuelve si abrió una pestaña
 * nueva; si no, la misma `page`). Cierra la fase de entrada del guard antes del primer paso. Nunca lanza: un fallo de la
 * entrada sale por `finDeEntrada` con la evidencia de esa página.
 */
export async function entrarYExplorar(
  page: Page,
  portal: PortalExploracion,
  ctx: CtxEntrada,
  e: EntradaExploracion,
  d: {
    guard: GuardEmision
    redactar: (t: string) => string
    env: Record<string, string | undefined>
    alEntrar?: () => void
    contextoBucle: (pagina: Page) => ContextoBucle
  },
): Promise<FinBucle> {
  let pagina = page
  try {
    const devuelta = await portal.entrar(page, ctx, e)
    if (devuelta && devuelta !== page) {
      pagina = devuelta
      pagina.setDefaultTimeout(TOPE_PASO_MS)
      pagina.setDefaultNavigationTimeout(TOPE_PASO_MS)
      pagina.on('dialog', (dlg) => { dlg.dismiss().catch(() => {}) })
    }
    cerrarFaseEntrada(d.guard)
    d.alEntrar?.()
    return await bucleExploracion(pagina, { ...d.contextoBucle(pagina), paginasDeEntrada: pagina === page ? [page] : [page, pagina] })
  } catch (err) {
    // Fallo de la ENTRADA cerrada (login, menús, producto): antes del primer paso. Con la evidencia del flujo real.
    return finDeEntrada(d.guard.violacion() ?? err, pagina, d.redactar, d.env)
  }
}

export type EntradaEjecucion = {
  cfg: Config
  trabajo: Trabajo
  env: Record<string, string | undefined>
  log: Log
  redactar: (t: string) => string
}

/** Valida que el trabajo es una exploración ejecutable por esta imagen. `null` = sí; si no, por qué. */
export function problemaTrabajoExploracion(t: Trabajo): string | null {
  const e = t.exploracion
  if (!e || typeof e.entrada !== 'string' || typeof e.conDatosReales !== 'boolean') return 'exploración sin entrada'
  if (!esEntradaExploracion(e.entrada)) return `entrada de exploración desconocida: ${String(e.entrada).slice(0, 60)}`
  const def = ENTRADAS_EXPLORACION[e.entrada]
  if (def.compania !== t.compania || def.ramo !== t.ramo) return 'la entrada no casa con la compañía/ramo del trabajo'
  if (!Object.hasOwn(PORTALES_EXPLORACION, t.compania)) return `sin portal de exploración para ${t.compania}`
  return null
}

/**
 * ¿Quedó cerrada la cabecera? 2xx, o 409 (`exploracion_cerrada`: un intento anterior ya la cerró). `cerrarExploracion`
 * devuelve 0 si tras los reintentos el servidor seguía ocupado o inalcanzable.
 */
export function cierreCorrecto(status: number): boolean {
  return (status >= 200 && status < 300) || status === 409
}

/**
 * El cuerpo que cierra el TRABAJO, sabiendo cómo fue el cierre de la cabecera. Si la cabecera NO se cerró, nunca se informa
 * `explorado` (el mapa no está guardado y la pantalla la vería abierta): se informa un fallo de infra.
 */
export function cuerpoTrasCierre(trabajoId: string, compania: string, fin: Pick<FinBucle, 'motivo' | 'error' | 'evidencia' | 'presupuesto'>, stCierre: number, redactar: (t: string) => string): CuerpoResultado | null {
  const cuerpo = resultadoDeFin(trabajoId, compania, fin, redactar)
  if (cuerpo?.resultado === 'explorado' && !cierreCorrecto(stCierre)) {
    return { trabajoId, resultado: 'error', error: { tipo: 'infra', mensaje: `exploración: no se pudo cerrar la cabecera (estado ${stCierre})`, url: null }, botVersion: EXPLORADOR_VERSION }
  }
  return cuerpo
}

/** Ejecuta un trabajo `modo = 'exploracion'` de punta a punta. Devuelve el código de salida del proceso. */
export async function ejecutarExploracion(p: EntradaEjecucion): Promise<number> {
  const { cfg, trabajo, env, log, redactar } = p
  const problema = problemaTrabajoExploracion(trabajo)
  if (problema) {
    await enviarResultado(cfg, { trabajoId: trabajo.id, resultado: 'error', error: { tipo: 'datos', mensaje: problema, url: null }, botVersion: EXPLORADOR_VERSION })
    return 1
  }
  const exp = trabajo.exploracion!
  const entrada = ENTRADAS_EXPLORACION[exp.entrada]
  const portal = PORTALES_EXPLORACION[trabajo.compania]
  let credenciales: Credenciales
  try {
    const n = nombresCredencial(portal.credencial)
    const usuario = env[n.usuario] ?? ''
    const contrasena = env[n.contrasena] ?? ''
    if (!usuario || !contrasena) throw new Error(`faltan los fly secrets ${n.usuario} / ${n.contrasena}`)
    credenciales = { usuario, contrasena }
  } catch (e) {
    await enviarResultado(cfg, { trabajoId: trabajo.id, resultado: 'error', error: { tipo: 'credenciales', mensaje: e instanceof Error ? e.message : String(e), url: null }, botVersion: EXPLORADOR_VERSION })
    return 1
  }

  const topes = topesExplorador(env)
  // Respaldo duro: el explorador tiene SU tope (15 min); si algo se cuelga por encima, se sale (asegura vence el lease).
  const respaldo = setTimeout(() => {
    log('tope_duro_superado: salida forzada (exploración)')
    process.exit(2)
  }, topes.maxMs + MARGEN_CIERRE_MS + 60_000)
  respaldo.unref()

  let browser: Browser | null = null
  let finExp: FinBucle
  try {
    browser = await chromium.launch({ headless: true })
    // Descargas ACEPTADAS (14/10/2026): el PDF del presupuesto guardado llega como descarga; solo lo lee `esperarPdf` en memoria.
    const context = await browser.newContext({ locale: 'es-ES', timezoneId: 'Europe/Madrid', acceptDownloads: true })
    const guard = await instalarGuardEmision(context)
    const page = await context.newPage()
    page.setDefaultTimeout(TOPE_PASO_MS)
    page.setDefaultNavigationTimeout(TOPE_PASO_MS)
    // Ningún diálogo del portal se acepta.
    page.on('dialog', (d) => { d.dismiss().catch(() => {}) })
    const ctxEntrada: CtxEntrada = {
      credenciales,
      log: (m) => log(m),
      pausa: () => dormir(azar(800, 2_500)),
      pulsar: async (boton) => {
        await dormir(azar(300, 1_200))
        await pulsar(boton, guard)
      },
      exigirSinCaptcha: () => exigirSinCaptcha(page),
      pulsarEnlaceEntrada: async (boton) => {
        await dormir(azar(300, 1_200))
        await pulsarEnlaceEntradaAutorizado(boton, guard, trabajo.compania)
      },
    }
    finExp = await entrarYExplorar(page, portal, ctxEntrada, entrada, {
      guard, redactar, env,
      alEntrar: () => log('exploracion_entrada_ok', { entrada: exp.entrada }),
      contextoBucle: (pagina) => ({
        trabajoId: trabajo.id, compania: trabajo.compania, ramo: trabajo.ramo, entrada: exp.entrada, conDatosReales: exp.conDatosReales,
        riesgo: trabajo.riesgo, env, guard,
        pulsar: ctxEntrada.pulsar,
        pulsarAutorizado: async (boton, el, marco) => {
          await dormir(azar(300, 1_200))
          await pulsarExploracionAutorizada(pagina, guard, boton, { entrada: exp.entrada, el, marco })
        },
        pulsarGuardado: async (boton, el, pantalla, trasClic) => {
          await dormir(azar(300, 1_200))
          await pulsarGuardadoPresupuesto(pagina, guard, boton, { el, pantalla }, trasClic)
        },
        pulsarGuardadoDialogo: async (boton, el, marco) => {
          await dormir(azar(300, 1_200))
          await pulsarGuardadoDialogoAutorizado(pagina, guard, boton, { entrada: exp.entrada, el, marco })
        },
        pausaAccion: () => dormir(azar(300, 1_200)),
        pedirPaso: (cuerpo) => pedirPaso(cfg, cuerpo),
        log,
      }),
    })
  } catch (e) {
    const c = clasificar(e)
    finExp = { motivo: 'error_portal', error: { tipo: c.tipo === 'portal' ? 'infra' : c.tipo, mensaje: c.mensaje }, redNoGet: [], efectos: ['ninguno_visto'], pasos: 0, acciones: 0 }
  } finally {
    await (browser as Browser | null)?.close().catch(() => undefined)
  }

  log('exploracion_fin', { motivo: finExp.motivo, ...(finExp.detalle ? { detalle: finExp.detalle } : {}), pasos: finExp.pasos, acciones: finExp.acciones, red: finExp.redNoGet.length, ...(finExp.error ? { tipo: finExp.error.tipo, mensaje: redactar(finExp.error.mensaje).slice(0, 300) } : {}) })
  if (finExp.motivo === 'perdido') {
    clearTimeout(respaldo)
    return 0
  }
  const stCierre = await cerrarExploracion(cfg, {
    trabajoId: trabajo.id, motivoFin: finExp.motivo, ...(finExp.detalle ? { detalleFin: finExp.detalle } : {}), ...(finExp.incidencias?.length ? { incidencias: finExp.incidencias } : {}), redNoGet: finExp.redNoGet, efectosEnPortal: finExp.efectos,
    presupuesto: presupuestoParaCierre(finExp.presupuesto ?? { guardado: false, referencia: null, pdf: null, pdfIntentado: false }),
  })
  log('exploracion_cierre', { status: stCierre })
  const cuerpo = cuerpoTrasCierre(trabajo.id, trabajo.compania, finExp, stCierre, redactar)
  const st = cuerpo ? await enviarResultado(cfg, cuerpo) : 0
  log('exploracion_resultado_enviado', { status: st, resultado: cuerpo?.resultado ?? null })
  clearTimeout(respaldo)
  return cuerpo?.resultado === 'explorado' && st >= 200 && st < 300 ? 0 : 1
}
