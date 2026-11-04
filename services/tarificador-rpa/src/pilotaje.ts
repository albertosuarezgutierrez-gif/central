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
//          · marcar (0.3.50) → radio/casilla con el MISMO validador (`marcar`: sin acción final ni onclick que envíe, ni campo de cuenta,
//            tarjeta o firma) y la MISMA implementación del explorador (`marcarControl`: casilla ya marcada sin pulsar; input oculto a la
//            vista → su `<label for>`, por `pulsar()`); sobre una `<label>` del inventario, actúa sobre SU casilla/radio inventariada;
//          · rellenar/seleccionar → datos FICTICIOS (clave del catálogo o literal inocuo), nunca en un campo de cuenta, tarjeta o
//            firma (`exigirCampoNoBancario` de guard.ts sobre el control VIVO antes de escribir);
//          · esperar/volver/fin.
//        Un rechazo (validador, guard, frontera) se REGISTRA como resultado y NO se ejecuta.
//   0.3.47: una petición que el guard de RED bloquea (XHR/fetch/beacon/script, y también una navegación) se ABORTA igual —nunca
//   sale— pero se REGISTRA (`bloqueosRed` del inventario de la pantalla siguiente: método + origen + ruta, sin query ni cuerpo) en
//   vez de cerrar; más de 5 navegaciones de documento principal bloqueadas en el mismo paso SÍ cierran (anti-bucle), como el resto
//   de violaciones de red (ventanas de avance/guardado), que siguen cerrando igual.
//   0.3.49 (Pelayo real 04/11/2026: «Nueva contratación» abre el wizard `apps.pelayo.com/contratacion-autos` en una PESTAÑA NUEVA y el
//   pilotaje seguía mirando la original): tras cada comando, una página NUEVA del contexto cuyo origen es https de un dominio de la
//   compañía de la ENTRADA (`DOMINIOS_PORTAL_COMPANIA` vía `origenDeCompania`) se ADOPTA como página activa (el guard es `context.route`:
//   ya la cubría desde su primera petición); una de otro origen se CIERRA sin adoptar y va a `bloqueosRed` (`[document pestana]`).
//   Topes DUROS: 60 comandos y 30 min por sesión.
//
// 🚨 TARIFICAR ≠ EMITIR: aquí no hay `.click()` ni navegación a URLs libres; ningún comando llega al portal sin el guard.
// 🔑 Ningún valor de campo sale del proceso: el resultado solo lleva códigos y motivos.

import { chromium, type Browser, type BrowserContext, type Locator, type Page } from 'playwright'
import {
  EmisionBloqueadaError,
  ENTRADAS_EXPLORACION,
  detectarParada,
  entradaConTomadorMediador,
  esEntradaExploracion,
  indiceRefs,
  lineaBloqueoRed,
  loginAsistidoDe,
  origenDeCompania,
  urlSinQuery,
  neutralizacionesOnclickDe,
  pareceDatoPersonalInventario,
  nombresCredencial,
  pistasOpcionesInventario,
  resolverDato,
  riesgoTomadorDeMediador,
  rutasAppTolerablesDe,
  validarRespuestaExplorador,
  permisosNavegacionDe,
  resumenPermisos,
  type Credenciales,
  type InventarioDom,
} from '@central/module-tarificacion'
import { cerrarPilotaje, enviarResultado, pedirComandoPilotaje, publicarEstadoPilotaje, type Config, type ResultadoComandoPilotaje, type Trabajo } from './api.ts'
import { exigirSinCaptcha } from './captcha.ts'
import { ClicNoAccionableError, cuerpoDiagnosticoClic, esTimeoutAccionabilidad, leerDiagnosticoClic, leerTagsModal, lineasTagsModal } from './diagnostico-clic.ts'
import { lineasInterceptor } from './modal-informativo.ts'
import { fallosDeRed, leerEntornoNavegador, lineasEntorno } from './entorno-navegador.ts'
import { clasificar } from './errores.ts'
import { exigirSinVerificacion } from './verificacion.ts'
import { capturarInventarioExploracion, type InventarioExploracion } from './inventario-dom.ts'
import { elegirDesplegableCustom, MOTIVO_DESPLEGABLE_CUSTOM } from './desplegable-custom.ts'
import { ATRIBUTO_MARCA, PORTALES_EXPLORACION, abrirSesionEntrada, crearCtxEntrada, elegirNxDropdown, entrarAlPortal, localizar, marcarControl, valorParaControl } from './explorador.ts'
import {
  cerrarFaseEntrada,
  exigirCampoNoBancario,
  instalarGuardEmision,
  neutralizarOnclicksEntrada,
  precioVistoEn,
  pulsar,
  cerrarModalInformativo,
  activarRegistroBloqueosPilotaje,
  vaciarBloqueosPilotaje,
  MAX_BLOQUEOS_RED_PILOTAJE,
  pulsarAccesoNseMapfre,
  pulsarEnlaceEntradaAutorizado,
  pulsarMenuOfertaNseMapfre,
  registrarPrecioVisto,
  tolerarRutasApp,
  permisosNavegacionEn,
  TIPOS_INPUT_MARCABLES,
  esTipoInputMarcable,
  type GuardEmision,
} from './guard.ts'
import { TOPES_PILOTAJE, esCampoTexto, leerComando, loteExploradorDe, motivoCampoProhibido, motivoValorLiteralProhibido, textoDiagnostico, type ComandoPilotaje } from './pilotaje-reglas.ts'
import type { Log } from './log.ts'
// Datos canónicos del mediador: el MISMO fichero puro que ya copia el Dockerfile para `privacidad-mediador.ts` (nada nuevo que copiar).
import { MEDIADOR } from '../../../packages/module-seguros/src/mediador.ts'

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

/**
 * 0.3.41 (Pelayo «Datos del Tomador»): el `riesgo` con el que se RESUELVEN los datos del pilotaje. El trabajo lleva `riesgo = '{}'` (CHECK
 * `trabajo_pilotaje_riesgo_vacio`); con una entrada `tomadorMediador` el tomador se arma aquí, EN MEMORIA, desde `MEDIADOR` con el mismo
 * mapeo que asegura (`riesgoTomadorDeMediador`). 🔑 Solo lo lee `resolverDato` justo antes de escribir en el portal: nunca va a la BD, al
 * log, al inventario ni al resultado (que solo lleva códigos). Sin la marca = `{}` (lo personal sin sintético para). Pura.
 */
export function riesgoResolverPilotaje(entrada: string): Record<string, unknown> {
  return entradaConTomadorMediador(entrada) ? riesgoTomadorDeMediador(MEDIADOR.identidad) : {}
}

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

  if (c.accion === 'cerrar_modal') {
    // 0.3.38: cierre del modal INFORMATIVO visible (Escape › botón de cierre › fondo) por las puertas del guard. Con campos o términos de acción final: no se toca.
    try {
      await k.pausaAccion()
      const r = await cerrarModalInformativo(page, k.guard)
      k.guard.comprobar()
      if (r.estado === 'cerrado') {
        await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
        return hecho(`modal cerrado (${r.via})`)
      }
      if (r.estado === 'sin_modal') return hecho('sin modal visible')
      const intentos = r.estado === 'no_cerrado' ? [`intentos: ${r.intentos.join(',').slice(0, 120)}`] : []
      return rechazo(r.estado === 'no_cerrable' ? `modal_no_cerrable_${r.motivo}` : 'modal_no_cerrado', [...intentos, ...(r.modal ? lineasInterceptor(r.modal).map((x) => textoDiagnostico(x, red)) : [])].slice(0, 10))
    } catch (e) {
      if (k.guard.violacion()) throw k.guard.violacion()
      if (e instanceof EmisionBloqueadaError) return rechazo('guard', [textoDiagnostico(`${e.donde}: ${e.message}`, red)])
      return rechazo('error', [textoDiagnostico(e instanceof Error ? e.message : String(e), red)])
    }
  }

  // pulsar / rellenar / seleccionar: el ref tiene que ser de ESTE inventario.
  const inv = captura.inventario
  let hit = indiceRefs(inv).get(c.ref)
  let nodo = captura.nodos.get(c.ref)
  /** El ref que ve el validador (el de la casilla si `marcar` llegó por su etiqueta). */
  let refEfectiva = c.ref
  if (!hit || !nodo) return rechazo('ref_no_existe')
  if (c.accion === 'marcar' && hit.el.tag === 'label') {
    // 0.3.50: `marcar` sobre la ETIQUETA = sobre SU casilla/radio inventariada (mismo marco, misma identidad viva): el validador mira el input.
    const ctl = await controlDeEtiquetaInventariado(captura, hit, nodo)
    if (!ctl) return rechazo('validador', ['la etiqueta no es de una única casilla/botón de opción del inventario'])
    ;({ hit, nodo } = ctl)
    refEfectiva = ctl.ref
  }
  const el = hit.el
  if (c.accion === 'inspeccionar') {
    // 0.3.37: SOLO LECTURA. Diagnóstico de accionabilidad del control (forma cerrada, sin PII), sin pulsarlo ni desplazarlo.
    const l0 = await localizar(nodo, el)
    if (!('loc' in l0)) return rechazo('no_localizado', [l0.motivo])
    try {
      const d = await leerDiagnosticoClic(l0.loc)
      // 0.3.42: TAGS de los controles del interior del modal (forma cerrada, sin textos), justo tras `diag:` para que el tope de 10 no los corte.
      const tags = await leerTagsModal(l0.loc)
      return d ? { r: { estado: 'hecho', motivo: 'inspeccionado', detalle: [`diag: ${cuerpoDiagnosticoClic(d)}`, ...(tags ? lineasTagsModal(tags) : []), ...lineasEntorno(await leerEntornoNavegador(page), fallosDeRed(page.context())), ...(d.int ? lineasInterceptor(d.int).map((x) => textoDiagnostico(x, red)) : [])].slice(0, 10) } } : rechazo('no_localizado', ['el nodo ya no está'])
    } finally {
      await l0.loc.evaluate((n, at) => n.removeAttribute(at), ATRIBUTO_MARCA, { timeout: 2_000 }).catch(() => undefined)
    }
  }
  if (c.accion !== 'pulsar') {
    const prohibido = motivoCampoProhibido(el)
    if (prohibido) return rechazo(prohibido)
  }
  let valorLiteral: string | null = null
  /** La opción que el VALIDADOR resolvió para `seleccionar` (forma inequívoca: valor o texto exacto de UNA opción). */
  let opcionValidada: string | null = null
  const lote = loteExploradorDe(c.accion === 'marcar' ? { ...c, ref: refEfectiva } : c, el)
  if (lote !== null) {
    // EL validador del explorador, contra el inventario PROPIO: lista blanca, emisión, avance por id con precio, opciones…
    const v = validarRespuestaExplorador(lote, { inventario: inv, ramo: k.ramo, entrada: k.entrada, datosReales: null, presupuestoEnCurso: false, precioVisto: precioVistoEn(k.guard), permisos: permisosNavegacionEn(k.guard) })
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
        const d = resolverDato(c.dato, { ramo: k.ramo, tomadorMediador: entradaConTomadorMediador(k.entrada), conDatosReales: false, riesgo: riesgoResolverPilotaje(k.entrada), env: k.env, hoy: new Date() })
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
      } else if (el.desplegableCustom === true) {
        // 0.3.43: custom element de desplegable sin <select> (Pelayo `pelayo-smart-select`): disparador + opción de texto EXACTO por `k.pulsar`.
        if (opcionValidada === null) return rechazo('validador')
        const r = await elegirDesplegableCustom(nodo.marco, loc, opcionValidada, k.pulsar)
        if (r === 'no_encontrada') return rechazo('opcion_no_encontrada', [MOTIVO_DESPLEGABLE_CUSTOM[r]])
        if (r !== 'ok') return rechazo(r === 'no_aplicada' ? 'opcion_no_aplicada' : r === 'accion_final' ? 'validador' : 'no_localizado', [MOTIVO_DESPLEGABLE_CUSTOM[r]])
      } else {
        if (opcionValidada === null) return rechazo('validador')
        // 0.3.20/0.3.42: el <select> OCULTO (bootstrap-select o custom element) ya se comprobó VIVO en `localizar`: `selectOption` forzado.
        const elegidas = await loc.selectOption({ value: opcionValidada }, { timeout: 10_000, ...(el.selectpicker === true || el.selectOculto === true ? { force: true } : {}) })
        if (elegidas.length !== 1 || elegidas[0] !== opcionValidada) return rechazo('opcion_no_aplicada')
      }
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
      k.guard.comprobar()
      return hecho('seleccionado')
    }
    // marcar (y pulsar sobre un radio/casilla): la implementación del explorador (`marcarControl`): una casilla ya marcada no se vuelve a
    // pulsar (desmarcaría), un radio ya marcado re-emite su `change` y, si el input está oculto a la vista, se pulsa su `<label for>`; todo
    // por la puerta del guard (`k.pulsar`).
    const tipoCtl = (el.type ?? '').toLowerCase()
    if (c.accion === 'marcar' || (el.tag === 'input' && esTipoInputMarcable(tipoCtl))) {
      await k.pausaAccion()
      const m = await marcarControl(loc, nodo.marco, el, k.pulsar, k.guard)
      if (m.yaMarcada) return hecho('ya marcada')
      await page.waitForLoadState('domcontentloaded', { timeout: TOPE_PASO_MS }).catch(() => undefined)
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
      k.guard.comprobar()
      if (m.estado === 'marcado') return hecho(c.accion === 'marcar' ? 'marcado' : 'pulsado')
      if (m.estado === 'por_etiqueta') return hecho('marcado por su etiqueta')
      return hecho(`pulsado sin quedar marcado (${m.estado})`)
    }
    await k.pulsar(loc)
    await page.waitForLoadState('domcontentloaded', { timeout: TOPE_PASO_MS }).catch(() => undefined)
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
    k.guard.comprobar()
    return hecho('pulsado')
  } catch (e) {
    // Una violación de RED del guard (algo salió hacia emisión) cierra la sesión; el resto es un rechazo registrado.
    if (k.guard.violacion()) throw k.guard.violacion()
    if (e instanceof EmisionBloqueadaError) return rechazo('guard', [textoDiagnostico(`${e.donde}: ${e.message}`, red)])
    // 0.3.37: el clic caducó por accionabilidad. La tarjeta de ramo de Pelayo ya agotó su clic robusto (guard.ts) y trae el diagnóstico; cualquier
    // otro control se diagnostica aquí (el nodo sigue marcado). Todo en forma cerrada, sin PII.
    if (e instanceof ClicNoAccionableError) return rechazo('clic_no_accionable', [e.diagnostico ? `diag: ${cuerpoDiagnosticoClic(e.diagnostico)}` : 'sin diagnóstico', `hijo probado: ${e.hijoProbado ? 1 : 0}`])
    if (esTimeoutAccionabilidad(e)) {
      const d = await leerDiagnosticoClic(loc)
      return rechazo('clic_no_accionable', [...(d ? [`diag: ${cuerpoDiagnosticoClic(d)}`] : ['sin diagnóstico']), textoDiagnostico(e instanceof Error ? e.message : String(e), red)])
    }
    return rechazo('error', [textoDiagnostico(e instanceof Error ? e.message : String(e), red)])
  } finally {
    await loc.evaluate((n, at) => n.removeAttribute(at), ATRIBUTO_MARCA, { timeout: 2_000 }).catch(() => undefined)
  }
}

/**
 * 0.3.50: la casilla/radio de una `<label>` del inventario: su `control` (input checkbox/radio con id, ÚNICA etiqueta y `for` = ese id),
 * inventariado en el MISMO marco con ese id y tipo, y el MISMO nodo vivo que `label.control`. Si no casa todo: `null` (fail-closed).
 */
async function controlDeEtiquetaInventariado(
  captura: InventarioExploracion,
  hit: NonNullable<ReturnType<ReturnType<typeof indiceRefs>['get']>>,
  nodo: NonNullable<ReturnType<InventarioExploracion['nodos']['get']>>,
): Promise<{ hit: typeof hit; nodo: typeof nodo; ref: string } | null> {
  const ctl = await nodo.handle
    .evaluate((n, tipos) => {
      const l = n as HTMLLabelElement
      if (l.tagName !== 'LABEL') return null
      const c = l.control as HTMLInputElement | null
      if (!c || c.tagName !== 'INPUT' || !c.id || l.htmlFor !== c.id || !c.labels || c.labels.length !== 1) return null
      const tipo = String(c.type).toLowerCase()
      return tipos.includes(tipo) ? { id: c.id, tipo } : null
    }, [...TIPOS_INPUT_MARCABLES])
    .catch(() => null)
  if (!ctl) return null
  const candidatos = hit.marco.elementos.filter((e) => e.tag === 'input' && e.id === ctl.id && (e.type ?? '').toLowerCase() === ctl.tipo && typeof e.ref === 'string')
  if (candidatos.length !== 1) return null
  const ref = candidatos[0].ref!
  const hit2 = indiceRefs(captura.inventario).get(ref)
  const nodo2 = captura.nodos.get(ref)
  if (!hit2 || !nodo2 || hit2.marco !== hit.marco) return null
  const mismo = await nodo.handle.evaluate((l, i) => (l as HTMLLabelElement).control === i, nodo2.handle).catch(() => false)
  return mismo ? { hit: hit2, nodo: nodo2, ref } : null
}

/** Espera a que una pestaña recién abierta tenga URL real (un `window.open()` empieza en about:blank) y cargue. Nunca lanza. */
async function esperarPestanaNueva(p: Page): Promise<void> {
  await p.waitForLoadState('domcontentloaded', { timeout: TOPE_PASO_MS }).catch(() => undefined)
  if (!/^https?:/.test(p.url())) await p.waitForURL((u) => u.protocol === 'https:' || u.protocol === 'http:', { timeout: 10_000, waitUntil: 'domcontentloaded' }).catch(() => undefined)
  await p.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
}

/** ¿La URL es https de un dominio de la compañía (host exacto o subdominio; sin puerto ni credenciales)? Fail-closed. PURA. */
export function urlDePortalCompania(url: string, compania: string): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.protocol !== 'https:' || u.port !== '' || u.username !== '' || u.password !== '') return false
  return origenDeCompania(u.origin, compania)
}

export type PestanasNuevas = {
  /** La página adoptada (la ÚLTIMA nueva del portal de la compañía), o `null`. */
  adoptada: Page | null
  /** Línea para `resultado.detalle` («pestaña nueva adoptada: origen+ruta», sin query). */
  detalle: string[]
  /** Líneas `bloqueosRed` de las pestañas ajenas cerradas, y las que no tienen forma de línea (no http). */
  bloqueos: string[]
  omitidas: number
}

/**
 * 0.3.49: las páginas del contexto que no estaban `antes` del comando. La última abierta cuyo origen es del portal de la compañía se
 * ADOPTA (el bucle la inventaría y publica); las de otro origen se CIERRAN y se registran. Las nuevas de la compañía que no se adoptan
 * se dejan. Sin query ni fragmento en nada de lo que sale.
 */
export async function revisarPestanasNuevas(context: BrowserContext, antes: ReadonlySet<Page>, compania: string, redactar: (t: string) => string = (t) => t): Promise<PestanasNuevas> {
  const r: PestanasNuevas = { adoptada: null, detalle: [], bloqueos: [], omitidas: 0 }
  const nuevas = context.pages().filter((p) => !antes.has(p) && !p.isClosed())
  for (const p of nuevas) await esperarPestanaNueva(p)
  for (const p of nuevas) {
    if (p.isClosed()) continue
    const url = p.url()
    if (urlDePortalCompania(url, compania)) {
      r.adoptada = p
      continue
    }
    const linea = lineaBloqueoRed('GET', url, 'document', 'pestana')
    if (linea) r.bloqueos.push(linea)
    else r.omitidas++
    await p.close({ runBeforeUnload: false }).catch(() => undefined)
  }
  if (r.adoptada) {
    r.adoptada.setDefaultTimeout(TOPE_PASO_MS)
    r.adoptada.setDefaultNavigationTimeout(TOPE_PASO_MS)
    r.detalle.push(textoDiagnostico(`pestaña nueva adoptada: ${urlSinQuery(r.adoptada.url())}`, redactar))
  }
  return r
}

/** El bucle del modo pilotado sobre una página ya dentro del portal. Nunca lanza: devuelve cómo terminó. */
export async function buclePilotaje(paginaInicial: Page, k: ContextoPilotaje): Promise<FinPilotaje> {
  /** 0.3.49: la página ACTIVA (cambia si un comando abre una pestaña nueva del portal de la compañía). */
  let page = paginaInicial
  const contexto = paginaInicial.context()
  const companiaEntrada = esEntradaExploracion(k.entrada) && ENTRADAS_EXPLORACION[k.entrada].compania === k.compania ? k.compania : null
  /** Pestañas ajenas cerradas en el comando anterior: van al `bloqueosRed` de la pantalla siguiente. */
  let pestanasBloq: { lineas: string[]; omitidas: number } = { lineas: [], omitidas: 0 }
  // Ningún diálogo de una pestaña nueva se acepta (como en `abrirSesionEntrada`), desde su primer instante.
  const alAbrir = (p: Page) => { p.on('dialog', (d) => { d.dismiss().catch(() => {}) }) }
  contexto.on('page', alAbrir)
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
  const red = k.redactar ?? ((x: string) => x)
  try {
    // 0.3.47: desde aquí, lo que el guard de red bloquee se aborta y se REGISTRA (no cierra salvo el tope de navegaciones del paso).
    activarRegistroBloqueosPilotaje(k.guard)
    for (;;) {
      if (ahora() - inicio >= t.maxMs) return fin('tope_tiempo')
      k.guard.comprobar()
      await exigirSinCaptcha(page)
      await exigirSinVerificacion(page, k.compania)
      await captura?.liberar()
      captura = await capturarInventarioExploracion(page, undefined, undefined, undefined, pistas)
      if (!captura) return fin('error_portal', { error: { tipo: 'portal', mensaje: 'no se pudo leer el inventario de la pantalla' } })
      // 0.3.47: lo bloqueado desde la pantalla anterior (y su comando) va en ESTE inventario; vaciar empieza paso (tope de navegaciones).
      // Una línea que la redacción del worker cambiaría no se publica a medias: se cuenta como omitida (asegura redacta otra vez).
      const bloq0 = vaciarBloqueosPilotaje(k.guard)
      // 0.3.49: + las pestañas ajenas cerradas (deduplicadas, mismo tope por paso).
      const todas = [...new Set([...bloq0.lineas, ...pestanasBloq.lineas])]
      const bloq = { lineas: todas.slice(0, MAX_BLOQUEOS_RED_PILOTAJE), omitidas: bloq0.omitidas + pestanasBloq.omitidas + Math.max(0, todas.length - MAX_BLOQUEOS_RED_PILOTAJE) }
      pestanasBloq = { lineas: [], omitidas: 0 }
      const lineas = bloq.lineas.filter((x) => red(x) === x && !pareceDatoPersonalInventario(x))
      const omitidas = bloq.omitidas + bloq.lineas.length - lineas.length
      const inv: InventarioDom = lineas.length > 0 || omitidas > 0
        ? { ...captura.inventario, ...(lineas.length > 0 ? { bloqueosRed: lineas } : {}), ...(omitidas > 0 ? { bloqueosRedOmitidos: omitidas } : {}) }
        : captura.inventario
      if (lineas.length > 0 || omitidas > 0) k.log('pilotaje_bloqueos_red', { n: n + 1, lineas: lineas.length, omitidas })
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
      const antes = new Set(contexto.pages())
      const ej = await ejecutarComando(page, captura, crudo, k)
      resultado = ej.r
      if (!ej.fin) {
        const pn = await revisarPestanasNuevas(contexto, antes, companiaEntrada ?? '', red)
        // El guard es de CONTEXTO: lo que la pestaña nueva haya pedido ya pasó por él; una violación cierra igual que en la original.
        k.guard.comprobar()
        pestanasBloq = { lineas: pn.bloqueos, omitidas: pn.omitidas }
        if (pn.adoptada) {
          page = pn.adoptada
          resultado = { ...ej.r, detalle: [...pn.detalle, ...(ej.r.detalle ?? [])].slice(0, 10) }
          k.log('pilotaje_pestana_adoptada', { n })
        }
        if (pn.bloqueos.length > 0 || pn.omitidas > 0) k.log('pilotaje_pestana_cerrada', { n, cerradas: pn.bloqueos.length + pn.omitidas })
      }
      k.log('pilotaje_comando', { n, estado: ej.r.estado, motivo: ej.r.motivo })
      if (ej.fin) return fin('fin')
    }
  } catch (e) {
    const v = k.guard.violacion()
    if (v || e instanceof EmisionBloqueadaError) return fin('guard_emision', { error: { tipo: 'emision', mensaje: textoDiagnostico((v ?? (e as Error)).message, k.redactar) } })
    const c = clasificar(e)
    return fin(c.tipo === 'captcha' ? 'parada' : 'error_portal', { error: { tipo: c.tipo, mensaje: textoDiagnostico(c.mensaje, k.redactar) } })
  } finally {
    contexto.off('page', alAbrir)
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
    // 0.3.46: permisos de BD de la entrada, REVALIDADOS (rutas GET/href; un avance de BD pasa el validador pero el pilotaje solo pulsa por
    // `pulsar()`, que sigue bloqueando «aceptar»: el avance de BD es del explorador). Sin valores en el log.
    const rp = permisosNavegacionDe(entradaClave, trabajo.permisosNavegacion)
    if (rp.ignorados.length > 0 || rp.permisos.rutas.length > 0 || rp.permisos.avances.length > 0) log('permisos_navegacion', resumenPermisos(rp))
    const { guard, page } = await abrirSesionEntrada(browser, entradaClave, rp.permisos)
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
