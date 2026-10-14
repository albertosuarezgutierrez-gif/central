// LOGIN ASISTIDO por la IA del explorador (14/10/2026). Primer uso: la 2.ª pantalla del SSO de Occident (dos variantes sin
// DOM grabado: elegir un usuario de una lista + contraseña, o usuario + contraseña). Núcleo puro: `explorador-login.ts`
// de @central/module-tarificacion.
//
// 🔑 LA IA NUNCA VE NI ESCRIBE UNA CREDENCIAL:
//   · sale hacia asegura/IA el inventario saneado (el extractor nunca lee `.value`) con el usuario MARCADO por su clave y
//     cualquier texto con la contraseña quitado; y antes de enviarlo, `inventarioSinCredenciales` (si algo quedara, no sale);
//   · la IA devuelve CLAVES (`credencial.usuario` / `credencial.contrasena`); el valor lo pone AQUÍ `valorCredencial` y va
//     directo al campo (nunca al log, ni a asegura, ni a un mensaje de error);
//   · solo con la página Y el marco del campo en https + host EXACTO del SSO de la compañía (`esUrlSsoLoginAsistido`), la
//     contraseña solo en un input VIVO de tipo password y una sola vez por trabajo (bloqueo de cuenta);
//   · avanzar: solo un submit cuyo formulario va al MISMO origen del SSO, por `pulsar` (guardas de la compañía + guard de
//     emisión), con la ventana de red del login abierta (lo que no es GET a otro origen se aborta);
//   · CAPTCHA/OTP → para (`requiere_humano`): nunca se inventa un código. Como mucho `MAX_PANTALLAS_LOGIN` pantallas.

import type { Frame, Locator, Page } from 'playwright'
import {
  CLAVE_CONTRASENA,
  CLAVE_USUARIO,
  MAX_PANTALLAS_LOGIN,
  contieneUsuario,
  esUrlSsoLoginAsistido,
  huellaPantalla,
  indiceRefs,
  inventarioSinCredenciales,
  loginAsistidoDe,
  marcarCredencialesInventario,
  marcarUsuarioEnTexto,
  validarRespuestaLogin,
  type AccionLogin,
  type Credenciales,
  type ElementoInventario,
  type InventarioDom,
  type MotivoParar,
} from '@central/module-tarificacion'
import type { RespuestaPaso } from './api.ts'
import { ErrorTarificador, ErrorVerificacionHumana } from './errores.ts'
import { abrirVentanaLogin, cerrarVentanaLogin, rechazoVentanaLogin, type GuardEmision } from './guard.ts'
import { capturarInventarioExploracion, type InventarioExploracion } from './inventario-dom.ts'
import { exigirSinVerificacion } from './verificacion.ts'
import type { Log } from './log.ts'

/** Envíos de la contraseña por trabajo: UNO (varios intentos fallidos bloquean la cuenta del SSO). */
export const MAX_ENVIOS_CONTRASENA = 1
const ATRIBUTO_MARCA = 'data-login-ref'
const ESPERA_PORTAL_INICIAL_MS = 5_000
const ESPERA_PORTAL_TRAS_AVANCE_MS = 15_000
const ESPERA_PORTAL_FINAL_MS = 25_000

export type CtxLoginAsistido = {
  /** Clave de `ENTRADAS_EXPLORACION`: decide la compañía y su SSO (`loginAsistidoDe`). */
  entrada: string
  credenciales: Credenciales
  guard: GuardEmision
  /** Pulsar con TODAS las guardas (las de la compañía y `pulsar(boton, guard)`). */
  pulsar: (boton: Locator) => Promise<void>
  pausa: () => Promise<void>
  exigirSinCaptcha: () => Promise<void>
  /** `POST /api/tarificador/explorador/paso` con `fase: 'login'`. */
  pedirPaso: (cuerpo: { inventario: InventarioDom; avancesFallidos: number }) => Promise<RespuestaPaso>
  /** ¿Se ve ya el portal (sesión abierta) en `ms`? */
  enPortal: (ms: number) => Promise<boolean>
  log: Log
}

/** El valor LOCAL de una clave de credencial. Solo lo usa el `fill` de este fichero. */
function valorCredencial(dato: typeof CLAVE_USUARIO | typeof CLAVE_CONTRASENA, c: Credenciales): string {
  return dato === CLAVE_CONTRASENA ? c.contrasena : c.usuario
}

const hostDe = (url: string) => {
  try {
    return new URL(url).host
  } catch {
    return '(url ilegible)'
  }
}

/** La parada de la IA (o de asegura) → el error con el que muere la entrada. OTP/CAPTCHA = una persona. */
function errorDeParada(motivo: MotivoParar, compania: string): Error {
  if (motivo === 'otp') return new ErrorVerificacionHumana(compania)
  if (motivo === 'captcha') return new ErrorTarificador('captcha', 'login asistido: el SSO presenta un CAPTCHA: requiere una persona')
  return new ErrorTarificador('portal', `login asistido: la IA paró en el SSO (${motivo}); ver «login asistido» en los huecos del mapa`)
}

/**
 * Tras el paso 1 determinista: resuelve el SSO con la IA hasta llegar al portal. Lanza si no llega (la entrada muere con su
 * evidencia; los inventarios de cada pantalla quedan en los pasos de la exploración y en `mapa.huecos`).
 */
export async function loginAsistido(page: Page, k: CtxLoginAsistido): Promise<void> {
  const la = loginAsistidoDe(k.entrada)
  if (!la) throw new ErrorTarificador('portal', 'login asistido no autorizado para esta entrada')
  const origen = `https://${la.hostSso}`
  let avancesFallidos = 0
  let huellaAntes: string | null = null
  let enviosContrasena = 0
  let espera = ESPERA_PORTAL_INICIAL_MS
  for (let n = 1; ; n++) {
    await page.waitForLoadState('domcontentloaded').catch(() => undefined)
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
    if (await k.enPortal(espera)) {
      k.log('login_asistido_ok', { pantallas: n - 1 })
      return
    }
    if (!esUrlSsoLoginAsistido(la.compania, page.url())) throw new ErrorTarificador('portal', `login asistido: la página salió del SSO sin llegar al portal (${hostDe(page.url())})`)
    if (n > MAX_PANTALLAS_LOGIN) {
      if (await k.enPortal(ESPERA_PORTAL_FINAL_MS)) return
      throw new ErrorTarificador('credenciales', `login asistido: ${MAX_PANTALLAS_LOGIN} pantallas del SSO sin llegar al portal`)
    }
    await k.exigirSinCaptcha()
    await exigirSinVerificacion(page, la.compania)
    const captura = await capturarInventarioExploracion(page)
    if (!captura) throw new ErrorTarificador('portal', 'login asistido: no se pudo leer la pantalla del SSO')
    try {
      // Lo ÚNICO que sale: usuario marcado, contraseña fuera y la última red antes de enviarlo.
      const inv = marcarCredencialesInventario(captura.inventario, k.credenciales)
      if (!inventarioSinCredenciales(inv, k.credenciales)) throw new ErrorTarificador('portal', 'login asistido: el inventario llevaría una credencial; no se envía')
      const huella = huellaPantalla(inv)
      if (huellaAntes !== null) avancesFallidos = huella === huellaAntes ? avancesFallidos + 1 : 0
      const r = await k.pedirPaso({ inventario: inv, avancesFallidos })
      if (r.estado === 'perdido') throw new ErrorTarificador('portal', 'login asistido: asegura ya no reconoce la exploración')
      // REVALIDACIÓN contra el inventario PROPIO (el que se mandó): lo que no valida aquí no toca el SSO.
      const v = validarRespuestaLogin(r.respuesta, { inventario: inv, entrada: k.entrada })
      if (!v.ok) throw new ErrorTarificador('portal', 'login asistido: respuesta no válida para el login (no se toca nada)')
      const acciones = v.respuesta.acciones
      if (r.estado !== 'ok') throw errorDeParada(acciones[0]?.accion === 'parar' ? acciones[0].motivo : 'ambiguo', la.compania)
      // Al log: refs y CLAVES, nunca valores.
      k.log('login_asistido_paso', { n, acciones: acciones.map((a) => (a.accion === 'parar' ? `parar ${a.motivo}` : a.accion === 'avanzar' ? `avanzar ${a.ref}` : `${a.accion} ${a.ref}=${a.dato}`)) })
      espera = ESPERA_PORTAL_INICIAL_MS
      for (const a of acciones) {
        if (a.accion === 'parar') throw errorDeParada(a.motivo, la.compania)
        if (a.accion === 'rellenar' && a.dato === CLAVE_CONTRASENA && ++enviosContrasena > MAX_ENVIOS_CONTRASENA) {
          throw new ErrorTarificador('credenciales', 'login asistido: la contraseña ya se envió una vez en este trabajo (no se reintenta: bloquearía la cuenta)')
        }
        await ejecutar(page, captura, inv, a, k, la.compania, origen)
        if (a.accion === 'avanzar') espera = ESPERA_PORTAL_TRAS_AVANCE_MS
      }
      huellaAntes = huella
    } finally {
      await captura.liberar()
    }
  }
}

type NodoLogin = InventarioExploracion['nodos'] extends Map<string, infer N> ? N : never

async function ejecutar(page: Page, captura: InventarioExploracion, inv: InventarioDom, a: Exclude<AccionLogin, { accion: 'parar' }>, k: CtxLoginAsistido, compania: string, origen: string): Promise<void> {
  const hit = indiceRefs(inv).get(a.ref)
  const nodo = captura.nodos.get(a.ref)
  if (!hit || !nodo) throw new ErrorTarificador('portal', 'login asistido: ref fuera de la captura')
  const enSso = () => esUrlSsoLoginAsistido(compania, page.url()) && esUrlSsoLoginAsistido(compania, nodo.marco.url())
  if (!enSso()) throw new ErrorTarificador('portal', 'login asistido: el campo no está en el SSO: no se toca')
  const loc = await localizar(nodo, hit.el, k.credenciales.usuario)
  if (!loc) throw new ErrorTarificador('portal', 'login asistido: el control ya no es el del inventario (no se toca)')
  try {
    if (a.accion === 'rellenar') {
      const tipo = await loc.evaluate((n) => ((n as HTMLInputElement).type ?? '').toLowerCase())
      if (a.dato === CLAVE_CONTRASENA && tipo !== 'password') throw new ErrorTarificador('portal', 'login asistido: la contraseña solo en un campo de tipo password')
      if (a.dato === CLAVE_USUARIO && tipo === 'password') throw new ErrorTarificador('portal', 'login asistido: el usuario nunca en un campo password')
      await k.pausa()
      // Justo antes de escribir, otra vez: página y marco en el SSO (la pausa pudo dejar navegar).
      if (!enSso()) throw new ErrorTarificador('portal', 'login asistido: el campo no está en el SSO: no se escribe')
      // 🔑 El valor no se loguea ni sale del proceso: va directo al campo.
      await loc.fill(valorCredencial(a.dato, k.credenciales), { timeout: 10_000 })
    } else if (a.accion === 'elegir') {
      await elegirUsuario(loc, hit.el, k)
    } else {
      // Solo un SUBMIT cuyo envío EFECTIVO (formAction/formMethod del botón, que mandan sobre los del form) es un POST al
      // MISMO origen del SSO, con la página también en él.
      const d = await loc.evaluate((n) => {
        const e = n as HTMLButtonElement | HTMLInputElement
        const f = e.form
        return { tipo: String(e.type ?? '').toLowerCase(), hayForm: f !== null, accion: f ? e.formAction : null, metodo: f ? (e.formMethod || f.method || '').toLowerCase() : '', pagina: e.ownerDocument.location.href }
      })
      let mismoOrigen = false
      try {
        mismoOrigen = d.hayForm && d.accion !== null && new URL(d.accion).origin === origen && new URL(d.pagina).origin === origen
      } catch {
        mismoOrigen = false
      }
      if (d.tipo !== 'submit' || d.metodo !== 'post' || !mismoOrigen) throw new ErrorTarificador('portal', 'login asistido: el avance no es un envío del formulario del SSO (no se pulsa)')
      abrirVentanaLogin(k.guard, origen)
      try {
        await k.pulsar(loc)
        await page.waitForLoadState('domcontentloaded', { timeout: 30_000 }).catch(() => undefined)
        await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
      } finally {
        cerrarVentanaLogin(k.guard)
      }
      const rechazo = rechazoVentanaLogin(k.guard)
      if (rechazo) throw new ErrorTarificador('portal', `login asistido: el SSO intentó enviar datos a otro origen (${rechazo}); bloqueado`)
      k.guard.comprobar()
    }
  } finally {
    await loc.evaluate((n, at) => (n as HTMLElement).removeAttribute(at), ATRIBUTO_MARCA).catch(() => undefined)
  }
}

/**
 * Elegir el usuario PROPIO: en un <select>, la ÚNICA opción cuyo texto o valor es el usuario (por índice: el valor no sale
 * de la página); en un radio o una fila, solo si SU texto/etiqueta vivo es el usuario, y se pulsa con las guardas.
 */
async function elegirUsuario(loc: Locator, el: ElementoInventario, k: CtxLoginAsistido): Promise<void> {
  const u = k.credenciales.usuario
  if (el.tag === 'select') {
    const opciones = await loc.evaluate((n) => Array.from((n as HTMLSelectElement).options).map((o) => [o.value, o.textContent ?? '']))
    const idx = opciones.flatMap(([v, t], i) => (contieneUsuario(v, u) || contieneUsuario(t, u) ? [i] : []))
    if (idx.length !== 1) throw new ErrorTarificador('portal', `login asistido: el desplegable no tiene exactamente una opción del usuario propio (${idx.length})`)
    await k.pausa()
    await loc.selectOption({ index: idx[0] }, { timeout: 10_000 })
    const elegida = await loc.evaluate((n) => (n as HTMLSelectElement).selectedIndex)
    if (elegida !== idx[0]) throw new ErrorTarificador('portal', 'login asistido: el desplegable no quedó en el usuario propio')
    return
  }
  // Una fila que ENVÍA el formulario (submit efectivo o con formaction) no se pulsa: doble envío / contraseña vacía.
  const envia = await loc.evaluate((n) => {
    const e = n as HTMLElement & { type?: unknown }
    return String(e.type ?? '').toLowerCase() === 'submit' || e.hasAttribute('formaction') || e.closest('button[type="submit"], button:not([type]), input[type="submit"]') !== null
  })
  if (envia) throw new ErrorTarificador('portal', 'login asistido: la fila del usuario envía el formulario (submit): no se pulsa (ambiguo)')
  const textos = await loc.evaluate((n) => {
    const e = n as HTMLInputElement
    const lab = e.labels && e.labels.length ? Array.from(e.labels).map((l) => l.textContent ?? '').join(' ') : ''
    return [e.innerText || e.textContent || '', lab, e.getAttribute('aria-label') ?? '']
  })
  if (!textos.some((t) => contieneUsuario(t, u))) throw new ErrorTarificador('portal', 'login asistido: la fila elegida no es la del usuario propio (no se pulsa)')
  await k.pulsar(loc)
}

const sinElipsis = (s: string) => (s.endsWith('…') ? s.slice(0, -1) : s)
const plano = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()

/**
 * Anti-TOCTOU (como `localizar` del explorador): el MISMO nodo inventariado, conectado, visible y con tag/id/name/type/texto
 * iguales; el texto vivo se compara MARCADO (el inventario lleva la clave del usuario donde el portal lo enseña).
 */
async function localizar(nodo: NodoLogin, el: ElementoInventario, usuario: string): Promise<Locator | null> {
  const vivo = await nodo.handle
    .evaluate((n) => {
      const e = n as HTMLElement
      if (!e.isConnected || typeof e.getAttribute !== 'function') return null
      return { tag: e.tagName.toLowerCase(), id: e.id || null, name: e.getAttribute('name'), type: e.getAttribute('type'), texto: (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim() }
    })
    .catch(() => null)
  if (!vivo || vivo.tag !== el.tag) return null
  const igual = (inv: string | undefined, v: string | null) => {
    if (inv === undefined) return true
    const viva = marcarUsuarioEnTexto(plano(v), usuario)
    return inv.endsWith('…') ? viva.startsWith(sinElipsis(inv)) : viva === inv
  }
  if (!igual(el.id, vivo.id) || !igual(el.name, vivo.name) || !igual(el.type, vivo.type) || !igual(el.texto, vivo.texto)) return null
  if (!(await nodo.handle.isVisible().catch(() => false))) return null
  const marca = Math.random().toString(36).slice(2, 14)
  const ok = await nodo.handle.evaluate((n, [at, m]) => { (n as HTMLElement).setAttribute(at, m); return true }, [ATRIBUTO_MARCA, marca] as const).catch(() => false)
  if (!ok) return null
  const loc = (nodo.marco as Frame).locator(`[${ATRIBUTO_MARCA}="${marca}"]`)
  return (await loc.count().catch(() => 0)) === 1 ? loc : null
}
