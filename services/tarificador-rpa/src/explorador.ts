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
//   → `POST …/cierre` (asegura construye el MAPA de SUS pasos) → `POST /api/tarificador/resultado` (`explorado` o error).
//
// 🚨 TARIFICAR ≠ EMITIR: este fichero no pulsa nada por su cuenta (sin `.click()`), no navega a URLs libres, no teclea
//    Enter ni ejecuta JS del portal. 🚨 Nunca se emite. 🔑 Ningún valor de campo ni credencial va al log, a asegura ni a la IA.

import { randomUUID } from 'node:crypto'
import { chromium, type Browser, type Locator, type Page } from 'playwright'
import {
  EmisionBloqueadaError,
  ENTRADAS_EXPLORACION,
  detectarBucle,
  detectarParada,
  esAvanceAutorizado,
  esEntradaExploracion,
  huellaPantalla,
  indiceRefs,
  nombresCredencial,
  normalizarRedNoGet,
  redactarHtml,
  resolverDato,
  secretosDelEntorno,
  topesExplorador,
  validarRespuestaExplorador,
  type Credenciales,
  type ElementoInventario,
  type EntradaExploracion,
  type MarcoInventario,
  type MotivoParar,
  type MotivoSinDato,
  type TipoError,
} from '@central/module-tarificacion'
import { cerrarExploracion, enviarResultado, pedirPaso, type Config, type CuerpoResultado, type RespuestaPaso, type Trabajo } from './api.ts'
import { exigirSinCaptcha } from './captcha.ts'
import { ErrorTarificador, ErrorVerificacionHumana, clasificar } from './errores.ts'
import { instalarGuardEmision, pulsar, pulsarExploracionAutorizada, type GuardEmision } from './guard.ts'
import { capturarInventarioExploracion, type InventarioExploracion } from './inventario-dom.ts'
import { exigirSinVerificacion } from './verificacion.ts'
import { capturarEvidencia, type EvidenciaFallo } from './evidencia.ts'
import { abrirNuevaAlta, type PestanaEntradaAllianz } from './adapters/allianz/entrada.ts'
import { login as loginEpac } from './adapters/allianz/comunidades.ts'
import type { ContextoPortal } from './adaptador.ts'
import type { Log } from './log.ts'

/** Versión del explorador del worker (va en `bot_version`). Súbela al tocar su navegación. */
export const EXPLORADOR_VERSION = '0.1.1'

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const azar = (min: number, max: number) => min + Math.random() * (max - min)
const TOPE_PASO_MS = 30_000
/** Margen sobre el tope de tiempo del explorador para cerrar y mandar el resultado. */
const MARGEN_CIERRE_MS = 90_000
const ATRIBUTO_MARCA = 'data-explorador-ref'
/** Mismos topes de evidencia que el flujo real (runner.ts). */
const MAX_BYTES_CAPTURA = 4 * 1024 * 1024
const MAX_BYTES_HTML = 2 * 1024 * 1024

// ─── Portales: login y entrada, por CÓDIGO (la IA arranca después) ────────────

export type CtxEntrada = Pick<ContextoPortal, 'credenciales' | 'pausa' | 'pulsar' | 'exigirSinCaptcha' | 'log'>

export type PortalExploracion = {
  /** Clave de los fly secrets `CRED_<clave>_USER/_PASS`. */
  credencial: string
  entrar: (page: Page, ctx: CtxEntrada, e: EntradaExploracion) => Promise<void>
}

/** Lista CERRADA de portales con entrada de exploración. Otra compañía = sin portal = no se abre el navegador. */
export const PORTALES_EXPLORACION: Readonly<Record<string, PortalExploracion>> = Object.freeze({
  allianz: Object.freeze({
    credencial: 'ALLIANZ_EPAC',
    entrar: async (page: Page, ctx: CtxEntrada, e: EntradaExploracion) => {
      await loginEpac(page, ctx)
      await exigirSinVerificacion(page, 'allianz')
      await abrirNuevaAlta(page, ctx, { pestana: e.pestana as PestanaEntradaAllianz, producto: e.productoMenu })
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined)
      await ctx.exigirSinCaptcha()
    },
  }),
})

// ─── Reglas puras (con test) ─────────────────────────────────────────────────

export type MotivoFinExploracion = MotivoParar | 'resultado' | 'bucle' | 'tope' | 'error_portal' | 'guard_emision'
export type EfectoPortal = 'posible_proyecto_guardado' | 'ninguno_visto'

export type FinBucle = {
  /** `perdido` = asegura ya no reconoce la exploración (404): ni cierre ni resultado. */
  motivo: MotivoFinExploracion | 'perdido'
  error: { tipo: TipoError; mensaje: string } | null
  redNoGet: string[]
  efectos: EfectoPortal[]
  pasos: number
  acciones: number
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

/** Un dato que no se puede poner → por qué se para (fail-closed: nunca se inventa). */
export function motivoSinDato(m: MotivoSinDato): MotivoParar {
  return m === 'clave_desconocida' ? 'ambiguo' : 'dato_sensible_requerido'
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
export function finDeError(e: unknown): { motivo: MotivoFinExploracion; error: { tipo: TipoError; mensaje: string } | null } {
  if (e instanceof ErrorVerificacionHumana) return { motivo: 'otp', error: null }
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
export function resultadoDeFin(trabajoId: string, compania: string, fin: Pick<FinBucle, 'motivo' | 'error' | 'evidencia'>, redactar: (t: string) => string): CuerpoResultado | null {
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
  return { trabajoId, resultado: 'explorado', motivoFin: fin.motivo, ...meta }
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
  pausaAccion: () => Promise<void>
  pedirPaso: (cuerpo: { trabajoId: string; inventario: InventarioExploracion['inventario']; avancesFallidos: number }) => Promise<RespuestaPaso>
  log: Log
  ahora?: () => number
  hoy?: () => Date
}

class Parar extends Error {
  constructor(readonly motivo: MotivoFinExploracion | 'perdido') {
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
  const red = new Set<string>()
  const efectos = new Set<EfectoPortal>()
  const huellas: string[] = []
  let pasos = 0
  let acciones = 0
  let avancesFallidos = 0
  let huellaAntesDeAvanzar: string | null = null
  let captura: InventarioExploracion | null = null
  const fin = (motivo: FinBucle['motivo'], error: FinBucle['error'] = null): FinBucle => ({
    motivo, error, redNoGet: [...red].slice(0, 50), efectos: efectos.size ? [...efectos] : ['ninguno_visto'], pasos, acciones,
  })
  try {
    for (;;) {
      if (pasos >= topes.maxPasos || ahora() - inicio >= topes.maxMs) throw new Parar('tope')
      k.guard.comprobar()
      await exigirSinCaptcha(page)
      await exigirSinVerificacion(page, k.compania)
      // Una ventana nueva (popup) no se sigue en v1: hueco.
      if (page.context().pages().length > 1) throw new Parar('sin_salida')
      await captura?.liberar()
      captura = await capturarInventarioExploracion(page)
      if (!captura) throw new Error('no se pudo leer el inventario de la pantalla')
      const inv = captura.inventario
      const parada = detectarParada(inv)
      if (parada) throw new Parar(parada.motivo)
      const huella = huellaPantalla(inv)
      if (huellaAntesDeAvanzar !== null) avancesFallidos = huella === huellaAntesDeAvanzar ? avancesFallidos + 1 : 0
      huellaAntesDeAvanzar = null
      if (detectarBucle(huellas, huella, avancesFallidos)) throw new Parar('bucle')
      huellas.push(huella)

      const r = await k.pedirPaso({ trabajoId: k.trabajoId, inventario: inv, avancesFallidos })
      pasos++
      if (r.estado === 'perdido') throw new Parar('perdido')
      // REVALIDACIÓN contra el inventario PROPIO (el que se mandó): lo que no valida aquí no toca el portal.
      const v = validarRespuestaExplorador(r.respuesta, { inventario: inv, ramo: k.ramo, entrada: k.entrada })
      if (!v.ok) throw new Parar('ambiguo')
      if (r.estado !== 'ok') {
        const p = v.respuesta.acciones[0]
        throw new Parar(p?.accion === 'parar' ? p.motivo : 'ambiguo')
      }
      const refs = indiceRefs(inv)
      k.log('exploracion_paso', {
        n: pasos,
        pantalla: v.respuesta.pantalla.tipo,
        acciones: v.respuesta.acciones.map((a) => (a.accion === 'rellenar' ? `rellenar ${a.ref}=${a.dato}` : 'ref' in a ? `${a.accion} ${a.ref}` : a.accion)),
      })

      for (const a of v.respuesta.acciones) {
        if (a.accion === 'parar') throw new Parar(a.motivo)
        if (a.accion === 'terminar') throw new Parar('resultado')
        if (++acciones > topes.maxAcciones) throw new Parar('tope')
        const hit = refs.get(a.ref)
        const nodo = captura.nodos.get(a.ref)
        if (!hit || !nodo) throw new Parar('ambiguo')
        const loc = await localizar(nodo, hit.el)
        if (!loc) throw new Parar('ambiguo')
        try {
          if (a.accion === 'rellenar') {
            const d = resolverDato(a.dato, { ramo: k.ramo, conDatosReales: k.conDatosReales, riesgo: k.riesgo, env: k.env, hoy: (k.hoy ?? (() => new Date()))() })
            if (!d.ok) throw new Parar(motivoSinDato(d.motivo))
            await k.pausaAccion()
            // 🔑 El valor no se loguea ni sale del proceso: va directo al campo.
            await loc.fill(valorParaControl(d.valor, hit.el), { timeout: 10_000 })
          } else if (a.accion === 'elegir') {
            await k.pausaAccion()
            const elegidas = await loc.selectOption({ value: a.opcion.valor }, { timeout: 10_000 })
            if (elegidas.length !== 1 || elegidas[0] !== a.opcion.valor) throw new Parar('ambiguo')
          } else if (a.accion === 'marcar') {
            await k.pulsar(loc)
          } else {
            const alPedir = (q: { method(): string; url(): string }) => {
              if (q.method() === 'GET') return
              const n = normalizarRedNoGet(q.url())
              if (n) red.add(n)
            }
            page.on('request', alPedir)
            try {
              if (esAvanceAutorizado(k.entrada, hit.el, hit.marco)) {
                efectos.add('posible_proyecto_guardado')
                await k.pulsarAutorizado(loc, hit.el, hit.marco)
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
      }
    }
  } catch (e) {
    if (e instanceof Parar) return fin(e.motivo)
    // Una violación del guard en segundo plano manda sobre el error con el que se cortó.
    const f = finDeError(k.guard.violacion() ?? e)
    return fin(f.motivo, f.error)
  } finally {
    await captura?.liberar()
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
  return { motivo: f.motivo, error: f.error, redNoGet: [], efectos: ['ninguno_visto'], pasos: 0, acciones: 0, ...(evidencia ? { evidencia } : {}) }
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
export function cuerpoTrasCierre(trabajoId: string, compania: string, fin: Pick<FinBucle, 'motivo' | 'error' | 'evidencia'>, stCierre: number, redactar: (t: string) => string): CuerpoResultado | null {
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
    const context = await browser.newContext({ locale: 'es-ES', timezoneId: 'Europe/Madrid', acceptDownloads: false })
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
    }
    try {
      await portal.entrar(page, ctxEntrada, entrada)
      log('exploracion_entrada_ok', { entrada: exp.entrada })
      finExp = await bucleExploracion(page, {
        trabajoId: trabajo.id, compania: trabajo.compania, ramo: trabajo.ramo, entrada: exp.entrada, conDatosReales: exp.conDatosReales,
        riesgo: trabajo.riesgo, env, guard,
        pulsar: ctxEntrada.pulsar,
        pulsarAutorizado: async (boton, el, marco) => {
          await dormir(azar(300, 1_200))
          await pulsarExploracionAutorizada(page, guard, boton, { entrada: exp.entrada, el, marco })
        },
        pausaAccion: () => dormir(azar(300, 1_200)),
        pedirPaso: (cuerpo) => pedirPaso(cfg, cuerpo),
        log,
      })
    } catch (e) {
      // Fallo de la ENTRADA cerrada (login, «Nueva Alta», producto): antes del primer paso. Con la evidencia del flujo
      // real (URL, captura y HTML con marcos, redactados) para ver la pantalla en la que se quedó.
      finExp = await finDeEntrada(guard.violacion() ?? e, page, redactar, env)
    }
  } catch (e) {
    const c = clasificar(e)
    finExp = { motivo: 'error_portal', error: { tipo: c.tipo === 'portal' ? 'infra' : c.tipo, mensaje: c.mensaje }, redNoGet: [], efectos: ['ninguno_visto'], pasos: 0, acciones: 0 }
  } finally {
    await (browser as Browser | null)?.close().catch(() => undefined)
  }

  log('exploracion_fin', { motivo: finExp.motivo, pasos: finExp.pasos, acciones: finExp.acciones, red: finExp.redNoGet.length, ...(finExp.error ? { tipo: finExp.error.tipo, mensaje: redactar(finExp.error.mensaje).slice(0, 300) } : {}) })
  if (finExp.motivo === 'perdido') {
    clearTimeout(respaldo)
    return 0
  }
  const stCierre = await cerrarExploracion(cfg, { trabajoId: trabajo.id, motivoFin: finExp.motivo, redNoGet: finExp.redNoGet, efectosEnPortal: finExp.efectos })
  log('exploracion_cierre', { status: stCierre })
  const cuerpo = cuerpoTrasCierre(trabajo.id, trabajo.compania, finExp, stCierre, redactar)
  const st = cuerpo ? await enviarResultado(cfg, cuerpo) : 0
  log('exploracion_resultado_enviado', { status: st, resultado: cuerpo?.resultado ?? null })
  clearTimeout(respaldo)
  return cuerpo?.resultado === 'explorado' && st >= 200 && st < 300 ? 0 : 1
}
