// MODO PILOTADO del tarificador RPA (03/11/2026) — mapear un portal rápido con una persona/agente a los mandos.
//
//   login + ENTRADA cerrada (las mismas de `PORTALES_EXPLORACION`, por código) → bucle por pantalla:
//     1. inventario SANEADO (mismo formato que los pasos del explorador) + captura PNG → `POST /api/tarificador/pilotaje/estado`
//        (asegura lo redacta otra vez y guarda la captura en un bucket privado);
//     2. espera un comando (`POST …/pilotaje/comando` cada 2 s; 10 min sin comando → cierra);
//     3. lo REVALIDA (`leerComando`) y lo ejecuta SOLO por la puerta del guard:
//          · pulsar → validador del explorador (`validarRespuestaExplorador`: avanzar/marcar, lista blanca, sin emisión, sin
//            avance por id con precio…) y el clic SOLO por `pulsar()` de guard.ts. Las puertas autorizadas del explorador
//            (`pulsarExploracionAutorizada`, `pulsarGuardadoDialogoAutorizado`) NO se usan aquí: son del explorador (cepo de
//            test/regression-tarificador-rpa.test.ts); un control que solo pasa por ellas se rechaza en el pilotaje;
//          · rellenar/seleccionar → datos FICTICIOS (clave del catálogo o literal inocuo), nunca en un campo de cuenta, tarjeta o
//            firma (`exigirCampoNoBancario` de guard.ts sobre el control VIVO antes de escribir);
//          · esperar/volver/fin.
//        Un rechazo (validador, guard, frontera) se REGISTRA como resultado y NO se ejecuta; una violación de red del guard cierra.
//   Topes DUROS: 60 comandos y 30 min por sesión.
//
// 🚨 TARIFICAR ≠ EMITIR: aquí no hay `.click()` ni navegación a URLs libres; ningún comando llega al portal sin el guard.
// 🔑 Ningún valor de campo sale del proceso: el resultado solo lleva códigos y motivos.

import { chromium, type Browser, type Locator, type Page } from 'playwright'
import {
  EmisionBloqueadaError,
  ENTRADAS_EXPLORACION,
  detectarParada,
  entradaConTomadorMediador,
  esEntradaExploracion,
  indiceRefs,
  loginAsistidoDe,
  neutralizacionesOnclickDe,
  nombresCredencial,
  pistasOpcionesInventario,
  resolverDato,
  rutasAppTolerablesDe,
  validarRespuestaExplorador,
  type Credenciales,
  type InventarioDom,
} from '@central/module-tarificacion'
import { cerrarPilotaje, enviarResultado, pedirComandoPilotaje, publicarEstadoPilotaje, type Config, type ResultadoComandoPilotaje, type Trabajo } from './api.ts'
import { exigirSinCaptcha } from './captcha.ts'
import { clasificar } from './errores.ts'
import { exigirSinVerificacion } from './verificacion.ts'
import { capturarInventarioExploracion, type InventarioExploracion } from './inventario-dom.ts'
import { ATRIBUTO_MARCA, PORTALES_EXPLORACION, abrirSesionEntrada, crearCtxEntrada, elegirNxDropdown, entrarAlPortal, localizar, valorParaControl } from './explorador.ts'
import {
  cerrarFaseEntrada,
  exigirCampoNoBancario,
  instalarGuardEmision,
  neutralizarOnclicksEntrada,
  precioVistoEn,
  pulsar,
  pulsarAccesoNseMapfre,
  pulsarEnlaceEntradaAutorizado,
  pulsarMenuOfertaNseMapfre,
  registrarPrecioVisto,
  tolerarRutasApp,
  type GuardEmision,
} from './guard.ts'
import { TOPES_PILOTAJE, esCampoTexto, leerComando, loteExploradorDe, motivoCampoProhibido, motivoValorLiteralProhibido, textoDiagnostico, type ComandoPilotaje } from './pilotaje-reglas.ts'
import type { Log } from './log.ts'

/** Versión del modo pilotado (va en `bot_version`). */
export const PILOTAJE_VERSION = '0.1.0'

const dormirReal = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const azar = (min: number, max: number) => min + Math.random() * (max - min)
const TOPE_PASO_MS = 30_000
const MAX_BYTES_CAPTURA = 4 * 1024 * 1024

export type MotivoFinPilotaje = 'fin' | 'tope_comandos' | 'tope_tiempo' | 'sin_comando' | 'parada' | 'guard_emision' | 'error_portal' | 'perdido'

export type FinPilotaje = {
  motivo: MotivoFinPilotaje
  /** Última pantalla publicada y el resultado de su comando (si lo hubo). */
  nUltimo: number | null
  resultadoUltimo?: ResultadoComandoPilotaje
  comandos: number
  error?: { tipo: string; mensaje: string }
}

export type ContextoPilotaje = {
  trabajoId: string
  compania: string
  ramo: string
  entrada: string
  env: Record<string, string | undefined>
  guard: GuardEmision
  /** `pulsar(boton, guard)` con pausa: la ÚNICA puerta de clic del pilotaje. */
  pulsar: (boton: Locator) => Promise<void>
  pausaAccion: () => Promise<void>
  publicar: (c: { n: number; inventario: InventarioDom; capturaBase64?: string; url?: string; resultadoAnterior?: ResultadoComandoPilotaje; final?: boolean }) => Promise<'ok' | 'perdido' | 'error'>
  pedirComando: (n: number) => Promise<{ estado: 'ok'; comando: unknown | null } | { estado: 'perdido' } | { estado: 'error' }>
  log: Log
  redactar?: (t: string) => string
  ahora?: () => number
  dormir?: (ms: number) => Promise<void>
  /** Por defecto los de `TOPES_PILOTAJE` (los tests los bajan; nunca se suben por encima). */
  topes?: Partial<Record<keyof typeof TOPES_PILOTAJE, number>>
  /** Sin captura PNG (tests). */
  sinCaptura?: boolean
}

type Ejecucion = { r: ResultadoComandoPilotaje; fin?: boolean }

const rechazo = (motivo: string, detalle?: string[]): Ejecucion => ({ r: { estado: 'rechazado', motivo, ...(detalle?.length ? { detalle: detalle.slice(0, 10) } : {}) } })
const hecho = (motivo: string): Ejecucion => ({ r: { estado: 'hecho', motivo } })

/**
 * Ejecuta UN comando sobre la pantalla inventariada. Nunca lanza salvo violación de red del guard (que cierra la sesión). Todo lo
 * que toca el portal pasa por el guard; lo que no valida se devuelve como `rechazado` SIN tocar nada.
 */
export async function ejecutarComando(page: Page, captura: InventarioExploracion, crudo: unknown, k: ContextoPilotaje): Promise<Ejecucion> {
  const red = k.redactar ?? ((t: string) => t)
  const l = leerComando(crudo)
  if (!l.ok) return rechazo('comando_no_valido', l.errores)
  const c: ComandoPilotaje = l.c
  if (c.accion === 'fin') return { ...hecho('fin'), fin: true }
  if (c.accion === 'esperar') {
    await (k.dormir ?? dormirReal)(c.ms)
    return hecho(`esperado ${c.ms} ms`)
  }
  if (c.accion === 'volver') {
    const antes = new URL(page.url()).origin
    try {
      k.guard.comprobar()
      // Historial del propio navegador (nada de URLs libres); la red que provoque pasa por el guard de contexto.
      await page.goBack({ waitUntil: 'domcontentloaded', timeout: TOPE_PASO_MS })
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
      k.guard.comprobar()
    } catch (e) {
      if (k.guard.violacion()) throw k.guard.violacion()
      return rechazo('volver_fallido', [textoDiagnostico(e instanceof Error ? e.message : String(e), red)])
    }
    // Fuera del origen del portal no se sigue: se cierra la sesión.
    if (new URL(page.url()).origin !== antes) return { r: { estado: 'hecho', motivo: 'volver: salió del origen del portal; se cierra' }, fin: true }
    return hecho('volver')
  }

  // pulsar / rellenar / seleccionar: el ref tiene que ser de ESTE inventario.
  const inv = captura.inventario
  const hit = indiceRefs(inv).get(c.ref)
  const nodo = captura.nodos.get(c.ref)
  if (!hit || !nodo) return rechazo('ref_no_existe')
  const el = hit.el
  if (c.accion !== 'pulsar') {
    const prohibido = motivoCampoProhibido(el)
    if (prohibido) return rechazo(prohibido)
  }
  let valorLiteral: string | null = null
  /** La opción que el VALIDADOR resolvió para `seleccionar` (forma inequívoca: valor o texto exacto de UNA opción). */
  let opcionValidada: string | null = null
  const lote = loteExploradorDe(c, el)
  if (lote !== null) {
    // EL validador del explorador, contra el inventario PROPIO: lista blanca, emisión, avance por id con precio, opciones…
    const v = validarRespuestaExplorador(lote, { inventario: inv, ramo: k.ramo, entrada: k.entrada, datosReales: null, presupuestoEnCurso: false, precioVisto: precioVistoEn(k.guard) })
    // 🚨 Barrera NECESARIA, no redundante (medido 03/11/2026): `pulsar()` de guard.ts deja pasar un «Confirmar» genérico (solo
    //    bloquea el de Generali); quien lo para es la categoría EMISIÓN de este validador. No se quita ni se salta.
    if (!v.ok) return rechazo('validador', (v.errores ?? []).map((e) => textoDiagnostico(e, red)))
    if (v.respuesta.acciones.length !== 1) return rechazo('validador', ['lote sin acción ejecutable'])
    const a = v.respuesta.acciones[0]
    if (a.accion === 'elegir') opcionValidada = a.opcion.valor
  } else if (c.accion === 'rellenar' && 'valor' in c) {
    if (el.deshabilitado) return rechazo('validador', ['el elemento está deshabilitado'])
    if (!esCampoTexto(el)) return rechazo('validador', ['rellenar solo en input de texto/número/fecha o textarea'])
    const m = motivoValorLiteralProhibido(c.valor)
    if (m) return rechazo('valor_no_ficticio', [m])
    valorLiteral = c.valor
  } else {
    return rechazo('comando_no_valido')
  }

  const localizado = await localizar(nodo, el)
  if (!('loc' in localizado)) return rechazo('no_localizado', [localizado.motivo])
  const loc = localizado.loc
  try {
    if (c.accion === 'rellenar') {
      let valor = valorLiteral
      if (valor === null && 'dato' in c) {
        const d = resolverDato(c.dato, { ramo: k.ramo, tomadorMediador: entradaConTomadorMediador(k.entrada), conDatosReales: false, riesgo: {}, env: k.env, hoy: new Date() })
        if (!d.ok) return rechazo('sin_dato', [d.motivo])
        valor = d.valor
      }
      // Frontera de emisión sobre el control VIVO (guard.ts): etiqueta/name/id/aria de cuenta bancaria → no se escribe.
      await exigirCampoNoBancario(loc)
      await k.pausaAccion()
      // 🔑 El valor va directo al campo: ni al log ni al resultado.
      await loc.fill(valorParaControl(valor!, el), { timeout: 10_000 })
      await loc.blur({ timeout: 5_000 }).catch(() => undefined)
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
      k.guard.comprobar()
      return hecho('rellenado')
    }
    if (c.accion === 'seleccionar') {
      await exigirCampoNoBancario(loc)
      await k.pausaAccion()
      if (el.tag === 'nx-dropdown') {
        // Abrir y pulsar la opción de texto exacto: ambas por `k.pulsar` (guard).
        const r = await elegirNxDropdown(nodo.marco, loc, opcionValidada ?? c.valor, k.pulsar)
        if (r === 'no_encontrada') return rechazo('opcion_no_encontrada')
      } else {
        if (opcionValidada === null) return rechazo('validador')
        const elegidas = await loc.selectOption({ value: opcionValidada }, { timeout: 10_000, ...(el.selectpicker === true ? { force: true } : {}) })
        if (elegidas.length !== 1 || elegidas[0] !== opcionValidada) return rechazo('opcion_no_aplicada')
      }
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
      k.guard.comprobar()
      return hecho('seleccionado')
    }
    // pulsar: una casilla ya marcada no se vuelve a pulsar (desmarcaría); lo demás, por la puerta del guard.
    if (el.tag === 'input' && (el.type ?? '').toLowerCase() === 'checkbox' && (await loc.isChecked({ timeout: 5_000 }))) return hecho('ya marcada')
    await k.pulsar(loc)
    await page.waitForLoadState('domcontentloaded', { timeout: TOPE_PASO_MS }).catch(() => undefined)
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
    k.guard.comprobar()
    return hecho('pulsado')
  } catch (e) {
    // Una violación de RED del guard (algo salió hacia emisión) cierra la sesión; el resto es un rechazo registrado.
    if (k.guard.violacion()) throw k.guard.violacion()
    if (e instanceof EmisionBloqueadaError) return rechazo('guard', [textoDiagnostico(`${e.donde}: ${e.message}`, red)])
    return rechazo('error', [textoDiagnostico(e instanceof Error ? e.message : String(e), red)])
  } finally {
    await loc.evaluate((n, at) => n.removeAttribute(at), ATRIBUTO_MARCA, { timeout: 2_000 }).catch(() => undefined)
  }
}

/** El bucle del modo pilotado sobre una página ya dentro del portal. Nunca lanza: devuelve cómo terminó. */
export async function buclePilotaje(page: Page, k: ContextoPilotaje): Promise<FinPilotaje> {
  const ahora = k.ahora ?? Date.now
  const dormir = k.dormir ?? dormirReal
  // Los topes del test solo BAJAN los de la sesión.
  const t = {
    maxComandos: Math.min(k.topes?.maxComandos ?? TOPES_PILOTAJE.maxComandos, TOPES_PILOTAJE.maxComandos),
    maxMs: Math.min(k.topes?.maxMs ?? TOPES_PILOTAJE.maxMs, TOPES_PILOTAJE.maxMs),
    esperaComandoMs: Math.min(k.topes?.esperaComandoMs ?? TOPES_PILOTAJE.esperaComandoMs, TOPES_PILOTAJE.esperaComandoMs),
    pollMs: k.topes?.pollMs ?? TOPES_PILOTAJE.pollMs,
  }
  const inicio = ahora()
  const pistas = pistasOpcionesInventario(k.ramo)
  let n = 0
  let comandos = 0
  let resultado: ResultadoComandoPilotaje | undefined
  let captura: InventarioExploracion | null = null
  /** `nUltimo` = la pantalla publicada cuyo comando está pendiente de informar. */
  const fin = (motivo: MotivoFinPilotaje, extra: Partial<FinPilotaje> = {}): FinPilotaje => ({ motivo, nUltimo: n > 0 ? n : null, comandos, ...(resultado ? { resultadoUltimo: resultado } : {}), ...extra })
  try {
    for (;;) {
      if (ahora() - inicio >= t.maxMs) return fin('tope_tiempo')
      k.guard.comprobar()
      await exigirSinCaptcha(page)
      await exigirSinVerificacion(page, k.compania)
      await captura?.liberar()
      captura = await capturarInventarioExploracion(page, undefined, undefined, undefined, pistas)
      if (!captura) return fin('error_portal', { error: { tipo: 'portal', mensaje: 'no se pudo leer el inventario de la pantalla' } })
      const inv = captura.inventario
      if (inv.marcos.some((m) => (m.importes?.length ?? 0) > 0)) registrarPrecioVisto(k.guard)
      // OTP/CAPTCHA/pantalla de emisión o de cuenta bancaria: se publica (para el mapa) y se cierra; no admite comando.
      const parada = detectarParada(inv)
      const png = k.sinCaptura ? null : await page.screenshot({ type: 'png', timeout: 10_000 }).catch(() => null)
      n++
      const pub = await k.publicar({
        n, inventario: inv, url: page.url(),
        ...(png && png.length <= MAX_BYTES_CAPTURA ? { capturaBase64: png.toString('base64') } : {}),
        ...(resultado ? { resultadoAnterior: resultado } : {}),
        ...(parada ? { final: true } : {}),
      })
      resultado = undefined
      if (pub === 'perdido') return fin('perdido')
      if (pub === 'error') return fin('error_portal', { error: { tipo: 'infra', mensaje: 'no se pudo publicar el estado de la pantalla' } })
      if (parada) {
        k.log('pilotaje_parada', { n, motivo: parada.motivo })
        return { ...fin('parada'), nUltimo: null }
      }
      // Espera del comando (sondeo); la espera también cuenta para el tope de 30 min.
      const desde = ahora()
      let crudo: unknown = null
      for (;;) {
        const r = await k.pedirComando(n)
        if (r.estado === 'perdido') return fin('perdido')
        if (r.estado === 'ok' && r.comando !== null) {
          crudo = r.comando
          break
        }
        if (ahora() - desde >= t.esperaComandoMs) return fin('sin_comando')
        if (ahora() - inicio >= t.maxMs) return fin('tope_tiempo')
        await dormir(t.pollMs)
      }
      if (++comandos > t.maxComandos) {
        resultado = { estado: 'rechazado', motivo: 'tope_comandos' }
        return fin('tope_comandos')
      }
      const ej = await ejecutarComando(page, captura, crudo, k)
      resultado = ej.r
      k.log('pilotaje_comando', { n, estado: ej.r.estado, motivo: ej.r.motivo })
      if (ej.fin) return fin('fin')
    }
  } catch (e) {
    const v = k.guard.violacion()
    if (v || e instanceof EmisionBloqueadaError) return fin('guard_emision', { error: { tipo: 'emision', mensaje: textoDiagnostico((v ?? (e as Error)).message, k.redactar) } })
    const c = clasificar(e)
    return fin(c.tipo === 'captcha' ? 'parada' : 'error_portal', { error: { tipo: c.tipo, mensaje: textoDiagnostico(c.mensaje, k.redactar) } })
  } finally {
    await captura?.liberar()
  }
}

export type EntradaPilotaje = { cfg: Config; trabajo: Trabajo; env: Record<string, string | undefined>; log: Log; redactar: (t: string) => string }

/** ¿Es un trabajo pilotable por esta imagen? `null` = sí. PURA. */
export function problemaTrabajoPilotaje(t: Trabajo): string | null {
  const e = t.pilotaje?.entrada
  if (typeof e !== 'string' || !esEntradaExploracion(e)) return 'pilotaje sin entrada de la lista cerrada'
  const def = ENTRADAS_EXPLORACION[e]
  if (def.compania !== t.compania || def.ramo !== t.ramo) return 'la entrada no casa con la compañía/ramo del trabajo'
  if (loginAsistidoDe(e)) return 'entrada con login asistido: no se pilota'
  if (!Object.hasOwn(PORTALES_EXPLORACION, t.compania)) return `sin portal de entrada para ${t.compania}`
  return null
}

/** Ejecuta un trabajo `modo = 'pilotaje'` de punta a punta. Devuelve el código de salida del proceso. */
export async function ejecutarPilotaje(p: EntradaPilotaje): Promise<number> {
  const { cfg, trabajo, env, log, redactar } = p
  const problema = problemaTrabajoPilotaje(trabajo)
  if (problema) {
    await enviarResultado(cfg, { trabajoId: trabajo.id, resultado: 'error', error: { tipo: 'datos', mensaje: problema, url: null }, botVersion: PILOTAJE_VERSION })
    return 1
  }
  const entradaClave = trabajo.pilotaje!.entrada
  const entrada = ENTRADAS_EXPLORACION[entradaClave as keyof typeof ENTRADAS_EXPLORACION]
  const portal = PORTALES_EXPLORACION[trabajo.compania]
  let credenciales: Credenciales
  try {
    const nc = nombresCredencial(portal.credencial)
    const usuario = env[nc.usuario] ?? ''
    const contrasena = env[nc.contrasena] ?? ''
    if (!usuario || !contrasena) throw new Error(`faltan los fly secrets ${nc.usuario} / ${nc.contrasena}`)
    credenciales = { usuario, contrasena }
  } catch (e) {
    await enviarResultado(cfg, { trabajoId: trabajo.id, resultado: 'error', error: { tipo: 'credenciales', mensaje: e instanceof Error ? e.message : String(e), url: null }, botVersion: PILOTAJE_VERSION })
    return 1
  }
  // Respaldo duro: 30 min + margen; si algo se cuelga, se sale (asegura vence el lease y el trabajo no se reintenta).
  const respaldo = setTimeout(() => {
    log('tope_duro_superado: salida forzada (pilotaje)')
    process.exit(2)
  }, TOPES_PILOTAJE.maxMs + 3 * 60_000)
  respaldo.unref()

  let browser: Browser | null = null
  let finP: FinPilotaje
  try {
    browser = await chromium.launch({ headless: true })
    // MISMO camino que el explorador (04/11/2026): sesión, ctx de entrada y login + entrada son las funciones del explorador, sin copia.
    const { guard, page } = await abrirSesionEntrada(browser, entradaClave)
    const ctxEntrada = crearCtxEntrada({ page, guard, compania: trabajo.compania, credenciales, log, dormir: dormirReal })
    let pagina = page
    try {
      pagina = await entrarAlPortal(page, portal, ctxEntrada, entrada, guard)
      log('pilotaje_entrada_ok', { entrada: entradaClave })
    } catch (e) {
      const c = clasificar(guard.violacion() ?? e)
      finP = { motivo: guard.violacion() ? 'guard_emision' : 'error_portal', nUltimo: null, comandos: 0, error: { tipo: c.tipo, mensaje: textoDiagnostico(c.mensaje, redactar) } }
      throw finP
    }
    const pg = pagina
    finP = await buclePilotaje(pg, {
      trabajoId: trabajo.id, compania: trabajo.compania, ramo: trabajo.ramo, entrada: entradaClave, env, guard, redactar, log,
      pulsar: ctxEntrada.pulsar,
      pausaAccion: () => dormirReal(azar(300, 1_200)),
      publicar: (c) => publicarEstadoPilotaje(cfg, { trabajoId: trabajo.id, ...c }),
      pedirComando: (n) => pedirComandoPilotaje(cfg, trabajo.id, n),
    })
  } catch (e) {
    if (e && typeof e === 'object' && 'motivo' in e && 'comandos' in e) finP = e as FinPilotaje
    else {
      const c = clasificar(e)
      finP = { motivo: 'error_portal', nUltimo: null, comandos: 0, error: { tipo: c.tipo === 'portal' ? 'infra' : c.tipo, mensaje: textoDiagnostico(c.mensaje, redactar) } }
    }
  } finally {
    await (browser as Browser | null)?.close().catch(() => undefined)
  }

  log('pilotaje_fin', { motivo: finP.motivo, comandos: finP.comandos, nUltimo: finP.nUltimo })
  if (finP.motivo === 'perdido') {
    clearTimeout(respaldo)
    return 0
  }
  // Un fallo antes del primer paso (login/entrada) o una violación del guard terminan con error; lo demás, `ok`.
  const conError = finP.motivo === 'guard_emision' || finP.motivo === 'error_portal'
  const st = await cerrarPilotaje(cfg, {
    trabajoId: trabajo.id, motivoFin: finP.motivo, botVersion: PILOTAJE_VERSION,
    ...(finP.nUltimo !== null ? { nUltimo: finP.nUltimo } : {}),
    ...(finP.resultadoUltimo ? { resultadoUltimo: finP.resultadoUltimo } : {}),
    ...(conError && finP.error ? { error: finP.error } : {}),
  })
  log('pilotaje_cierre', { status: st })
  clearTimeout(respaldo)
  return st >= 200 && st < 300 && !conError ? 0 : 1
}
