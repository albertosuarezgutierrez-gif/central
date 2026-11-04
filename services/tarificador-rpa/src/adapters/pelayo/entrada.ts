// Pelayo (portal de mediadores) — LOGIN y ENTRADA del EXPLORADOR hasta el primer formulario de datos (03/11/2026, Alberto).
// SOLO exploración: los adaptadores de tarificación (`pelayo/ramos.ts`) están sin implementar. TARIFICAR ≠ EMITIR.
//
// Ruta (fija, por código; la IA no interviene):
//   https://mediadores.pelayo.com/portalmediador-pagina-inicio/ → usuario + contraseña
//   → menú superior «Contratación» (desplegable) → «Presupuestos» (página /portalmediador-presupuestos/, título «Presupuestos»)
//   → botón «Nuevo Presupuesto» → selector de RAMO → «Auto» / «Hogar» → primer formulario de datos (NO se rellena ni se avanza:
//   la entrada es de SOLO LECTURA, `ENTRADAS_EXPLORACION[...].soloLectura`).
//
// Pulsar SOLO por `ctx.pulsarEnlaceEntrada` (puerta EXACTA del guard: texto exacto de `ENLACES_ENTRADA_AUTORIZADOS.pelayo`, origen
// https://mediadores.pelayo.com, en orden, una vez cada uno y solo en la fase de entrada) y el botón de entrada del login por `ctx.pulsar`
// (guard genérico, sin ensancharlo). El ramo, si es un <select> nativo, se elige con `selectOption` (sin clic). Usuario y contraseña
// SOLO se escriben en un host de `HOSTS_LOGIN_PELAYO` o del SSO `accesoN.pelayo.com` (otro dominio = hueco explícito, se añade tras verlo).
// Fail-closed: lo que no aparece → `ErrorTarificador('portal')` con QUÉ falta; no se adivina. Los volcados de estructura van al log
// (rótulos ≤40 car., sin nada que parezca dato personal: `pareceDatoPersonalInventario`).

import type { Frame, Locator, Page } from 'playwright'
import type { ContextoPortal } from '../../adaptador.ts'
import { ErrorTarificador } from '../../errores.ts'
import { exigirSinVerificacion } from '../../verificacion.ts'
import { exigirSinRechazoCredenciales } from '../../credenciales.ts'
import { ClicNoAccionableError, cuerpoDiagnosticoClic, notaClicPelayo, type DiagnosticoClic } from '../../diagnostico-clic.ts'
import { pareceDatoPersonalInventario } from '@central/module-tarificacion'

/** URL pública de entrada (dada por Alberto, 03/11/2026; no es secreta). */
export const URL_PORTAL_PELAYO = 'https://mediadores.pelayo.com/portalmediador-pagina-inicio/'
/**
 * Hosts EXACTOS donde se pueden escribir las credenciales. `acceso12.pelayo.com` (03/11/2026, exploración real con 0.3.28): el formulario de acceso
 * es el SSO de Pelayo, fuera de mediadores.pelayo.com; tras el login el portal vuelve a mediadores (la ruta de menús sigue limitada a ese origen).
 */
export const HOSTS_LOGIN_PELAYO: readonly string[] = Object.freeze(['mediadores.pelayo.com', 'acceso12.pelayo.com'])
/**
 * SSO de Pelayo numerado (`acceso12` hace pensar en `acceso1..N`): SOLO `accesoN.pelayo.com` (N de 1 a 3 cifras, sin cero delante), anclada, nada
 * más (ni otros subdominios ni `pelayo.com.ajeno`). Se usa además de la lista exacta y solo con https (`esHostLoginPelayo`).
 */
export const RE_HOST_SSO_PELAYO = /^acceso[1-9]\d{0,2}\.pelayo\.com$/
/** Ruta de la página de presupuestos (solo para reconocerla; no se navega por URL). */
export const RUTA_PRESUPUESTOS_PELAYO = '/portalmediador-presupuestos/'

/** Etiquetas EXACTAS de la ruta, en orden (= las tres primeras de `ENLACES_ENTRADA_AUTORIZADOS.pelayo`). */
export const RUTA_MENU_PELAYO = Object.freeze(['Contratación', 'Presupuestos', 'Nuevo Presupuesto'] as const)
/** Rótulos aceptados del ramo en el selector (lista CERRADA; = el resto de `ENLACES_ENTRADA_AUTORIZADOS.pelayo`). */
export const ROTULOS_RAMO_PELAYO: Readonly<Record<'auto' | 'hogar', readonly string[]>> = Object.freeze({
  auto: Object.freeze(['Auto', 'Autos', 'Automóvil', 'Automóviles']),
  hogar: Object.freeze(['Hogar']),
})

export const RE_BOTON_ENTRAR_PELAYO = /^\s*(acceder|entrar|iniciar\s+sesi[oó]n|log\s*in|conectar|continuar|identificarse)\s*$/i
export const RE_TEXTO_PROHIBIDO_LOGIN_PELAYO = /cambiar\s+(la\s+)?contrase|olvid|recuper|restablec|registr/i

export type EsperasPelayo = { loginMs?: number; menuMs?: number; paginaMs?: number; formularioMs?: number; reintentoMs?: number }
const ESPERAS: Required<EsperasPelayo> = { loginMs: 60_000, menuMs: 20_000, paginaMs: 45_000, formularioMs: 30_000, reintentoMs: 8_000 }

export type CtxEntradaPelayo = Pick<ContextoPortal, 'credenciales' | 'pausa' | 'pulsar' | 'exigirSinCaptcha' | 'log'> & {
  /** Menú, «Nuevo Presupuesto» y ramo pulsable: SOLO por la puerta exacta del guard (`pulsarEnlaceEntradaAutorizado`). */
  pulsarEnlaceEntrada: (boton: Locator, opciones?: { reintento?: boolean }) => Promise<void>
  /** 0.3.33: nota de diagnóstico de la elección del ramo (forma CERRADA `RE_NOTA_ENTRADA_PELAYO`, solo contadores); el worker la lleva al mapa (huecos). */
  diagnostico?: (nota: string) => void
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Regex EXACTA para una etiqueta (sin distinguir mayúsculas ni tildes; espacios flexibles; nada antes ni después). Pura. */
export function etiquetaExactaPelayo(texto: string): RegExp {
  const partes = sinTildes(texto).split(' ').map((p) => escapar(p).replace(/a/g, '[aá]').replace(/e/g, '[eé]').replace(/i/g, '[ií]').replace(/o/g, '[oó]').replace(/u/g, '[uúü]'))
  return new RegExp(`^\\s*${partes.join('\\s+')}\\s*$`, 'i')
}

/** ¿El host de la URL es uno de los del login? (hostname EXACTO de la lista o `accesoN.pelayo.com`; https, sin credenciales ni puerto en la URL). Pura. */
export function esHostLoginPelayo(url: string, hosts: readonly string[] = HOSTS_LOGIN_PELAYO, sso: RegExp | null = RE_HOST_SSO_PELAYO): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && (hosts.includes(u.hostname) || (sso !== null && sso.test(u.hostname)))
  } catch {
    return false
  }
}

/** Ramo de la entrada → rótulos aceptados del selector. Otro ramo = sin recorrido (lanza). Pura. */
export function rotulosRamoPelayo(ramo: string): readonly string[] {
  if (ramo === 'auto' || ramo === 'hogar') return ROTULOS_RAMO_PELAYO[ramo]
  throw new ErrorTarificador('datos', `pelayo: sin recorrido de entrada de exploración para el ramo ${String(ramo).slice(0, 30)}`)
}

/**
 * Índice de la ÚNICA opción de un <select> cuyo texto es exactamente uno de `rotulos` (sin tildes ni mayúsculas). 0 o >1 → `null`
 * (no se elige nada). Pura.
 */
export function opcionRamoPelayo(opciones: readonly string[], rotulos: readonly string[]): number | null {
  const buscados = new Set(rotulos.map(sinTildes))
  const hit = opciones.map((o, i) => (buscados.has(sinTildes(o)) ? i : -1)).filter((i) => i >= 0)
  return hit.length === 1 ? hit[0] : null
}

/** Rótulos para el LOG de estructura: recortados, sin vacíos ni repetidos, y sin nada que parezca dato personal. Pura. */
export function rotulosSeguros(textos: readonly string[], max = 30): string[] {
  const out: string[] = []
  for (const t of textos) {
    const n = String(t ?? '').replace(/\s+/g, ' ').trim()
    if (!n || n.length > 40 || /\d{5,}/.test(n) || pareceDatoPersonalInventario(n) || out.includes(n)) continue
    out.push(n)
    if (out.length >= max) break
  }
  return out
}

const raices = (page: Page): (Page | Frame)[] => [page, ...page.frames().filter((f) => f !== page.mainFrame())]
const contar = (l: Locator) => l.count().catch(() => 0)

/** Controles clicables cuyo texto/nombre accesible es EXACTAMENTE `texto` (visibles), en una raíz. */
function candidatos(raiz: Page | Frame, texto: string, tarjetas = false): Locator {
  const re = etiquetaExactaPelayo(texto)
  // 0.3.32: el selector de ramo son TARJETAS (`<a class="card">` sin href ni rol; también `<div class="card">`): solo para el ramo se admite la clase `card`.
  const extra = tarjetas ? ' or contains(concat(" ", normalize-space(@class), " "), " card ")' : ''
  const porRol = raiz.getByRole('menuitem', { name: re }).or(raiz.getByRole('link', { name: re })).or(raiz.getByRole('button', { name: re })).or(raiz.getByRole('tab', { name: re }))
  const porTexto = raiz.getByText(re).locator(`xpath=ancestor-or-self::*[self::a or self::button or self::label or @role="menuitem" or @role="button" or @role="link" or @role="tab" or @role="option" or @onclick${extra}][1]`)
  return porRol.or(porTexto).locator('visible=true')
}

/** ¿El texto propio (o value / aria-label) del elemento es EXACTAMENTE la etiqueta? Un contenedor del menú entero no lo es. */
async function esHojaExacta(l: Locator, texto: string): Promise<boolean> {
  const b = sinTildes(texto)
  return l
    .evaluate((el, buscada) => {
      const v = (el as HTMLInputElement).value
      const ts = [el.textContent, typeof v === 'string' ? v : '', el.getAttribute('aria-label')]
      return ts.map((t) => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()).some((t) => t === buscada)
    }, b)
    .catch(() => false)
}

/** Todos los controles exactos visibles de `texto` en la página y sus marcos (ya filtrados a hoja exacta). */
async function exactos(page: Page, texto: string, tarjetas = false): Promise<Locator[]> {
  const out: Locator[] = []
  for (const r of raices(page)) {
    const c = candidatos(r, texto, tarjetas)
    const n = Math.min(await contar(c), 10)
    for (let i = 0; i < n; i++) if (await esHojaExacta(c.nth(i), texto)) out.push(c.nth(i))
  }
  return out
}

async function esperarExactos(page: Page, texto: string, ms: number): Promise<Locator[]> {
  const fin = Date.now() + ms
  for (;;) {
    const hallados = await exactos(page, texto)
    if (hallados.length > 0 || Date.now() >= fin) return hallados
    await page.waitForTimeout(400)
  }
}

/** Login: contraseña visible en la página o en un marco. Devuelve la raíz. */
async function raizConPassword(page: Page, ms: number): Promise<Page | Frame> {
  const fin = Date.now() + ms
  for (;;) {
    for (const r of raices(page)) if ((await contar(r.locator('input[type="password"]').locator('visible=true'))) > 0) return r
    if (Date.now() >= fin) throw new ErrorTarificador('portal', 'pelayo/login: no aparece ningún campo de contraseña (hueco)')
    await page.waitForTimeout(500)
  }
}

/** Host de la raíz (página o marco), sin ruta ni query. */
function hostDe(raiz: Page | Frame): string {
  try {
    return new URL(raiz.url()).hostname
  } catch {
    return '?'
  }
}

/**
 * Login por código. Usuario + contraseña SOLO en `HOSTS_LOGIN_PELAYO` (página Y marco del formulario); un rechazo/bloqueo para YA
 * (`ErrorCredenciales`, sin reintentar: así se bloquea una cuenta). El botón de entrada por el `pulsar` genérico del guard.
 */
export async function loginPelayo(page: Page, ctx: CtxEntradaPelayo, esperas: EsperasPelayo = {}, url: string = URL_PORTAL_PELAYO): Promise<void> {
  const e = { ...ESPERAS, ...esperas }
  const r = await page.goto(url)
  const st = r?.status() ?? 0
  if (st >= 500) throw new ErrorTarificador('portal', `pelayo/login: el portal respondió ${st} en la entrada`, { transitorio: true })
  await ctx.exigirSinCaptcha()
  await exigirSinVerificacion(page, 'pelayo')

  const raiz = await raizConPassword(page, e.loginMs)
  if (!esHostLoginPelayo(page.url()) || !esHostLoginPelayo(raiz.url())) {
    // El host no es un dato personal: se nombra para poder añadirlo a la lista tras verlo.
    throw new ErrorTarificador('portal', `pelayo/login: el formulario de acceso está en un host fuera de la lista (${hostDe(page)} / ${hostDe(raiz)}); no se escriben credenciales (hueco)`)
  }
  const password = raiz.locator('input[type="password"]').locator('visible=true').first()
  const usuario = raiz.locator('xpath=(//input[@type="password"])[1]/preceding::input[not(@type) or @type="text" or @type="email" or @type="tel"]').locator('visible=true').last()
  if ((await contar(usuario)) !== 1) throw new ErrorTarificador('portal', 'pelayo/login: no se localiza el campo de usuario (hueco)')
  const entrar = raiz
    .getByRole('button', { name: RE_BOTON_ENTRAR_PELAYO })
    .or(raiz.locator('button[type="submit"], input[type="submit"]'))
    .locator('visible=true')
    .filter({ hasNotText: RE_TEXTO_PROHIBIDO_LOGIN_PELAYO })
  const nEntrar = await contar(entrar)
  if (nEntrar !== 1) throw new ErrorTarificador('portal', `pelayo/login: se esperaba exactamente un botón de entrada visible y hay ${nEntrar} (hueco)`)

  await usuario.fill(ctx.credenciales.usuario)
  await ctx.pausa()
  await password.fill(ctx.credenciales.contrasena)
  await ctx.pausa()
  await ctx.pulsar(entrar)

  const fin = Date.now() + e.loginMs
  for (;;) {
    await ctx.exigirSinCaptcha()
    await exigirSinVerificacion(page, 'pelayo')
    let hay = false
    for (const x of raices(page)) if ((await contar(x.locator('input[type="password"]').locator('visible=true'))) > 0) hay = true
    if (!hay) break
    await exigirSinRechazoCredenciales(page, 'pelayo')
    if (Date.now() >= fin) throw new ErrorTarificador('portal', 'pelayo/login: el formulario sigue visible tras enviar (sin mensaje de rechazo en pantalla)')
    await page.waitForTimeout(500)
  }
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined)
  await exigirSinVerificacion(page, 'pelayo')
  await ctx.exigirSinCaptcha()
  await exigirSinRechazoCredenciales(page, 'pelayo', { soloInutilizable: true })
  ctx.log('login ok')
}

/** Estructura de la pantalla (SIN PII): títulos, rótulos de botones/enlaces, nº de campos y opciones de cada <select> visible. */
export type EstructuraPelayo = { ruta: string; titulos: string[]; acciones: string[]; campos: number; selects: { etiqueta: string; opciones: string[] }[] }

// Script en TEXTO (no función): tsx envuelve las funciones con nombre en `__name`, que en la página no existe.
const SCRIPT_ESTRUCTURA = `(() => {
  const vis = (el) => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const b = el.getBoundingClientRect(); return b.width > 0 || b.height > 0; };
  const txt = (el) => String((el && (el.textContent || el.value || el.getAttribute('aria-label'))) || '').replace(/\\s+/g, ' ').trim();
  const t = Array.from(document.querySelectorAll('h1,h2,h3,legend')).filter(vis).slice(0, 10).map(txt);
  const a = Array.from(document.querySelectorAll('button,a,[role=button],[role=tab],[role=menuitem],input[type=submit],input[type=button]')).filter(vis).slice(0, 80).map(txt);
  const c = Array.from(document.querySelectorAll('input:not([type=hidden]),select,textarea')).filter(vis).length;
  const s = Array.from(document.querySelectorAll('select')).filter(vis).slice(0, 10).map((sel) => {
    const lab = sel.id ? document.querySelector('label[for="' + CSS.escape(sel.id) + '"]') : sel.closest('label');
    return { etiqueta: txt(lab) || sel.getAttribute('name') || '', opciones: Array.from(sel.options).slice(0, 40).map((o) => String(o.textContent || '').replace(/\\s+/g, ' ').trim()) };
  });
  return { t, a, c, s };
})()`

type EstructuraCruda = { t: string[]; a: string[]; c: number; s: { etiqueta: string; opciones: string[] }[] }

export async function estructuraPantallaPelayo(page: Page): Promise<EstructuraPelayo> {
  const titulos: string[] = []
  const acciones: string[] = []
  const selects: { etiqueta: string; opciones: string[] }[] = []
  let campos = 0
  for (const r of raices(page)) {
    const d = ((await r.evaluate(SCRIPT_ESTRUCTURA).catch(() => null)) as EstructuraCruda | null) ?? { t: [], a: [], c: 0, s: [] }
    titulos.push(...d.t)
    acciones.push(...d.a)
    campos += d.c
    for (const x of d.s) selects.push({ etiqueta: rotulosSeguros([x.etiqueta], 1)[0] ?? '', opciones: rotulosSeguros(x.opciones, 40) })
  }
  let ruta = ''
  try {
    ruta = new URL(page.url()).pathname.slice(0, 80)
  } catch { /* sin ruta */ }
  return { ruta: rotulosSeguros([ruta], 1)[0] ?? '', titulos: rotulosSeguros(titulos, 10), acciones: rotulosSeguros(acciones, 30), campos, selects }
}

/** 0.3.32: huella de la pantalla (ruta + títulos + acciones + nº de campos + desplegables) para saber si el clic del ramo la CAMBIÓ. Sin valores. Pura. */
export function huellaPantallaPelayo(e: EstructuraPelayo): string {
  return JSON.stringify([e.ruta, e.titulos, e.acciones, e.campos, e.selects.map((x) => [x.etiqueta, x.opciones.length])])
}

/** 0.3.32: ¿la pantalla de después es otra que la de antes? (otra ruta, otros títulos/acciones, otro nº de campos o de desplegables). Pura. */
export function cambioPantallaPelayo(antes: EstructuraPelayo, despues: EstructuraPelayo): boolean {
  return huellaPantallaPelayo(antes) !== huellaPantallaPelayo(despues)
}

/** 0.3.33: lo que se observó al elegir el ramo (solo contadores y 0/1; nunca texto del portal). */
export type DiagnosticoRamoPelayo = { tarjetas: number; clic: boolean; cambio: boolean; pestana: boolean; dialogo: number; modal: number; reintento: boolean }

/** 0.3.33: forma CERRADA de la nota de diagnóstico (la misma que acepta asegura en `notaFin`). */
export const RE_NOTA_ENTRADA_PELAYO = /^entrada pelayo: tarjetas=\d{1,2} clic=[01] cambio=[01] pestana=[01] dialogo=\d{1,2} modal=\d{1,2} reintento=[01]$/

/** 0.3.33: la nota de diagnóstico (tarjeta encontrada, clic dado, cambio detectado, pestaña nueva, diálogo, modal, reintento). Pura. */
export function notaDiagnosticoRamoPelayo(d: DiagnosticoRamoPelayo): string {
  const n = (x: number) => Math.max(0, Math.min(99, Math.trunc(x) || 0))
  const b = (x: boolean) => (x ? 1 : 0)
  return `entrada pelayo: tarjetas=${n(d.tarjetas)} clic=${b(d.clic)} cambio=${b(d.cambio)} pestana=${b(d.pestana)} dialogo=${n(d.dialogo)} modal=${n(d.modal)} reintento=${b(d.reintento)}`
}

const SCRIPT_MODALES = `(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  return Array.from(document.querySelectorAll('[role="dialog"],[role="alertdialog"],[aria-modal="true"],.modal.show,.modal.in,.modal-dialog,.swal2-popup,.ui-dialog,.lfr-alert-modal')).filter(vis).length;
})()`

/** 0.3.33: nº de diálogos/modales VISIBLES (página y marcos). Solo cuenta. */
export async function contarModalesPelayo(page: Page): Promise<number> {
  let n = 0
  for (const r of raices(page)) n += Number((await r.evaluate(SCRIPT_MODALES).catch(() => 0)) || 0)
  return n
}

/** 0.3.33: el elemento INTERIOR con el texto exacto del ramo (el más profundo que casa: p. ej. el título dentro de la tarjeta), visible, hoja exacta. */
async function interioresRamo(page: Page, rotulos: readonly string[]): Promise<Locator[]> {
  const out: Locator[] = []
  for (const r of raices(page)) {
    for (const t of rotulos) {
      const c = r.getByText(etiquetaExactaPelayo(t)).locator('visible=true')
      const n = Math.min(await contar(c), 10)
      for (let i = 0; i < n; i++) if (await esHojaExacta(c.nth(i), t)) out.push(c.nth(i))
    }
  }
  return out
}

async function volcar(page: Page, ctx: CtxEntradaPelayo, que: string): Promise<EstructuraPelayo> {
  const e = await estructuraPantallaPelayo(page)
  ctx.log(`pelayo_estructura ${que} ${JSON.stringify(e)}`)
  return e
}

/** Pulsa por la puerta del guard el control exacto `texto` (si hay varios equivalentes, el primero visible). 0 → hueco. */
async function pulsarExacto(page: Page, ctx: CtxEntradaPelayo, texto: string, ms: number, donde: string): Promise<void> {
  const hallados = await esperarExactos(page, texto, ms)
  if (hallados.length === 0) throw new ErrorTarificador('portal', `pelayo/entrada: no se localiza «${texto}» ${donde} (hueco)`)
  await ctx.pulsarEnlaceEntrada(hallados[0])
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
}

/** 0.3.31: ¿`href` (ya absoluto) es EXACTAMENTE la página de presupuestos (https://mediadores.pelayo.com + ruta, con o sin barra final; sin credenciales ni puerto)? Pura. */
export function esUrlPresupuestosPelayo(href: string | null | undefined): boolean {
  try {
    const u = new URL(String(href ?? ''))
    const ruta = u.pathname.replace(/\/+$/, '/')
    return u.protocol === 'https:' && u.hostname === 'mediadores.pelayo.com' && !u.username && !u.password && !u.port && (ruta === RUTA_PRESUPUESTOS_PELAYO || `${ruta}/` === RUTA_PRESUPUESTOS_PELAYO)
  } catch {
    return false
  }
}

/** 0.3.31: lo que se sabe de un control con rótulo exacto «Presupuestos» del mega-menú (sin valores; solo estructura). */
export type ControlMenuPelayo = { href: string | null; visible: boolean; enlace: boolean }

/**
 * 0.3.31 (exploración real 03/11/2026 con 0.3.29: «no se localiza «Presupuestos» en el desplegable de «Contratación»»): el desplegable es un MEGA-MENÚ con
 * una columna cuyo ENCABEZADO en negrita es «Presupuestos» y debajo el ENLACE «Presupuestos» (destino `/portalmediador-presupuestos/`). Elige qué pulsar:
 * 1) el enlace visible con el href EXACTO de la página de presupuestos (el primero; todos llevan al mismo sitio); 2) si NO hay ninguno con ese href en el
 * DOM, el primer control visible que sea de verdad pulsable (`enlace`: href real u onclick o rol/botón), nunca un encabezado; 3) si el enlace con ese href
 * está en el DOM pero oculto, nada (`esperar`: el panel aún no se abrió). La puerta del guard (texto exacto + origen + orden + una vez) decide igual. Pura.
 */
export function elegirControlPresupuestosPelayo(cs: readonly ControlMenuPelayo[]): { indice: number } | { esperar: string } {
  const exacto = cs.findIndex((c) => c.visible && esUrlPresupuestosPelayo(c.href))
  if (exacto >= 0) return { indice: exacto }
  const enDom = cs.filter((c) => esUrlPresupuestosPelayo(c.href)).length
  if (enDom > 0) return { esperar: `${enDom} enlace(s) a ${RUTA_PRESUPUESTOS_PELAYO} en el DOM, ninguno visible (panel cerrado)` }
  const otro = cs.findIndex((c) => c.visible && c.enlace)
  if (otro >= 0) return { indice: otro }
  const vis = cs.filter((c) => c.visible).length
  return { esperar: `${vis} rótulo(s) «${RUTA_MENU_PELAYO[1]}» visibles sin enlace (encabezado de columna) y ninguno a ${RUTA_PRESUPUESTOS_PELAYO}` }
}

/** 0.3.31: controles con rótulo EXACTO «Presupuestos» (visibles u ocultos) y los `a[href]` a la página de presupuestos, en la página y sus marcos. Solo lee. */
async function controlesPresupuestosPelayo(page: Page): Promise<{ l: Locator; c: ControlMenuPelayo }[]> {
  const out: { l: Locator; c: ControlMenuPelayo }[] = []
  const texto = RUTA_MENU_PELAYO[1]
  for (const r of raices(page)) {
    const porHref = r.locator(`a[href*="${RUTA_PRESUPUESTOS_PELAYO.replace(/\//g, '')}"]`)
    const porTexto = r.getByText(etiquetaExactaPelayo(texto)).locator('xpath=ancestor-or-self::*[self::a or self::button or @role="menuitem" or @role="button" or @role="link" or @onclick][1]')
    const todos = porHref.or(porTexto)
    const n = Math.min(await contar(todos), 20)
    for (let i = 0; i < n; i++) {
      const l = todos.nth(i)
      if (!(await esHojaExacta(l, texto))) continue
      const d = (await l
        .evaluate((el) => {
          const a = el as HTMLAnchorElement
          const crudo = el.getAttribute('href')
          const href = el.tagName === 'A' && crudo ? a.href : null
          const real = !!crudo && crudo.trim() !== '#' && !/^javascript:\s*(void\s*\(?\s*0?\s*\)?\s*;?)?$/i.test(crudo.trim())
          const enlace = real || el.hasAttribute('onclick') || el.tagName === 'BUTTON' || ['menuitem', 'button', 'link'].includes(el.getAttribute('role') || '')
          return { href, enlace }
        })
        .catch(() => null)) as { href: string | null; enlace: boolean } | null
      if (!d) continue
      out.push({ l, c: { ...d, visible: await l.isVisible().catch(() => false) } })
    }
  }
  return out
}

/**
 * 0.3.31: «Contratación» › «Presupuestos». Tras el clic en «Contratación» (puerta del guard) se ESPERA a que el panel muestre el enlace; si no se ve, se
 * aparta el ratón y se vuelve a pasar por encima de «Contratación» (un clic sobre un menú de hover lo cierra; un hover no es un clic), cada ~1,5 s. Se pulsa
 * el ENLACE «Presupuestos» (href exacto `/portalmediador-presupuestos/` si existe), nunca el encabezado de la columna. Sin él → hueco con lo visto (recuentos).
 */
export async function abrirPresupuestosPelayo(page: Page, ctx: CtxEntradaPelayo, esperas: EsperasPelayo = {}): Promise<void> {
  const e = { ...ESPERAS, ...esperas }
  await pulsarExacto(page, ctx, RUTA_MENU_PELAYO[0], e.menuMs, 'en el menú superior')
  const fin = Date.now() + e.menuMs
  // Sin ningún enlace a la página de presupuestos en el DOM, el control pulsable de rótulo exacto vale tras una espera corta (portales sin href).
  const gracia = Date.now() + Math.min(1_500, e.menuMs)
  let ultimoHover = Date.now()
  let motivo = 'sin controles'
  for (;;) {
    const cs = await controlesPresupuestosPelayo(page)
    const d = elegirControlPresupuestosPelayo(cs.map((x) => x.c))
    const hayHref = cs.some((x) => esUrlPresupuestosPelayo(x.c.href))
    if ('indice' in d && (hayHref || Date.now() >= gracia)) {
      await ctx.pulsarEnlaceEntrada(cs[d.indice]!.l)
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
      return
    }
    motivo = 'esperar' in d ? d.esperar : motivo
    if (Date.now() >= fin) break
    if (!('indice' in d) && Date.now() - ultimoHover >= 1_500) {
      const menu = await exactos(page, RUTA_MENU_PELAYO[0])
      if (menu[0]) {
        await page.mouse.move(0, 0).catch(() => undefined)
        await page.waitForTimeout(150)
        await menu[0].hover({ timeout: 2_000 }).catch(() => undefined)
      }
      ultimoHover = Date.now()
    }
    await page.waitForTimeout(300)
  }
  throw new ErrorTarificador('portal', `pelayo/entrada: no se localiza el enlace «${RUTA_MENU_PELAYO[1]}» en el desplegable de «${RUTA_MENU_PELAYO[0]}» (${motivo}) (hueco)`)
}

export type ResultadoRamoPelayo = {
  estado: 'select' | 'pulsado' | 'no_elegido'
  motivo?: string
  /** 0.3.33: controles (tarjetas o desplegables) del ramo que se vieron. */
  controles?: number
  /** 0.3.37: la tarjeta NO fue accionable (clic robusto agotado): su diagnóstico cerrado (sin PII) y si se probó el hijo de texto exacto. */
  clicNoAccionable?: { diagnostico: DiagnosticoClic | null; hijoProbado: boolean }
}

type RamoLocalizado = { selects: { sel: Locator; indice: number }[]; pulsables: Locator[] }

/** Dónde está el ramo en la pantalla: <select> visibles con UNA opción exacta del ramo, y controles pulsables de texto exacto. */
async function localizarRamo(page: Page, rotulos: readonly string[]): Promise<RamoLocalizado> {
  const selects: { sel: Locator; indice: number }[] = []
  for (const r of raices(page)) {
    const sels = r.locator('select').locator('visible=true')
    const n = Math.min(await contar(sels), 10)
    for (let i = 0; i < n; i++) {
      const textos = await sels.nth(i).evaluate((s) => Array.from((s as HTMLSelectElement).options).slice(0, 60).map((o) => String(o.textContent || ''))).catch(() => [] as string[])
      const k = opcionRamoPelayo(textos, rotulos)
      if (k !== null) selects.push({ sel: sels.nth(i), indice: k })
    }
  }
  const pulsables: Locator[] = []
  if (selects.length === 0) for (const t of rotulos) pulsables.push(...(await exactos(page, t, true)))
  return { selects, pulsables }
}

async function esperarRamo(page: Page, rotulos: readonly string[], ms: number): Promise<RamoLocalizado> {
  const fin = Date.now() + ms
  for (;;) {
    const l = await localizarRamo(page, rotulos)
    if (l.selects.length > 0 || l.pulsables.length > 0 || Date.now() >= fin) return l
    await page.waitForTimeout(400)
  }
}

/**
 * Elige el ramo en la pantalla de «Nuevo Presupuesto». Primero un <select> nativo visible con UNA opción exacta (selectOption, sin clic);
 * si no, UN control pulsable de texto exacto (por la puerta del guard). Ninguno, o más de uno → no se elige nada (`no_elegido`):
 * la exploración vuelca la pantalla de selección tal cual.
 */
export async function elegirRamoPelayo(page: Page, ctx: CtxEntradaPelayo, ramo: string, ms = 0): Promise<ResultadoRamoPelayo> {
  const { selects, pulsables } = await esperarRamo(page, rotulosRamoPelayo(ramo), ms)
  if (selects.length > 1) return { estado: 'no_elegido', motivo: `${selects.length} desplegables con la opción del ramo`, controles: selects.length }
  if (selects.length === 1) {
    await ctx.pausa()
    await selects[0].sel.selectOption({ index: selects[0].indice })
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
    return { estado: 'select', controles: 1 }
  }
  if (pulsables.length === 0) return { estado: 'no_elegido', motivo: 'sin control del ramo', controles: 0 }
  if (pulsables.length > 1) return { estado: 'no_elegido', motivo: `${pulsables.length} controles del ramo`, controles: pulsables.length }
  try {
    await ctx.pulsarEnlaceEntrada(pulsables[0])
  } catch (e) {
    // 0.3.37: la tarjeta no se dejó pulsar (invisible, inestable, tapada, pointer-events…) tras el clic robusto del guard: no es un error del
    // trabajo; se vuelca la pantalla de selección tal cual (como `no_elegido`) y el diagnóstico viaja a la nota. Una violación del guard NO se atrapa.
    if (!(e instanceof ClicNoAccionableError)) throw e
    return { estado: 'no_elegido', motivo: 'tarjeta no accionable', controles: 1, clicNoAccionable: { diagnostico: e.diagnostico, hijoProbado: e.hijoProbado } }
  }
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
  return { estado: 'pulsado', controles: 1 }
}

/**
 * Home (ya con sesión) → «Contratación» › «Presupuestos» › «Nuevo Presupuesto» → ramo → primer formulario. Vuelca (al log, sin PII) la
 * pantalla de selección de ramo y la que queda tras elegirlo. Devuelve la página donde sigue la exploración (la misma, o la pestaña
 * nueva si «Nuevo Presupuesto» la abre). Nada se rellena ni se avanza aquí.
 */
export async function abrirNuevoPresupuestoPelayo(page: Page, ctx: CtxEntradaPelayo, ramo: string, esperas: EsperasPelayo = {}): Promise<Page> {
  const e = { ...ESPERAS, ...esperas }
  rotulosRamoPelayo(ramo)
  // 0.3.31: mega-menú de «Contratación» (encabezado «Presupuestos» + enlace «Presupuestos»): espera al panel (hover/clic) y pulsa el ENLACE.
  await abrirPresupuestosPelayo(page, ctx, esperas)
  // Página de presupuestos: el botón «Nuevo Presupuesto» (lento: se espera con generosidad).
  const nueva = page.context().waitForEvent('page', { timeout: 5_000 }).catch(() => null)
  await pulsarExacto(page, ctx, RUTA_MENU_PELAYO[2], e.paginaMs, `en la página de presupuestos (${RUTA_PRESUPUESTOS_PELAYO})`)
  const otra = await nueva
  const destino = otra ?? page
  if (otra) await otra.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => undefined)
  await exigirSinVerificacion(destino, 'pelayo')
  await ctx.exigirSinCaptcha()
  await destino.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined)

  // La pantalla de ramo llega lenta: se espera a ver el control del ramo (o se agota el tope) ANTES de volcarla.
  await esperarRamo(destino, rotulosRamoPelayo(ramo), e.paginaMs)
  const antes = await volcar(destino, ctx, 'seleccion_ramo')
  const contexto = destino.context()
  const abiertas: Page[] = []
  const alAbrir = (p: Page) => { abiertas.push(p) }
  contexto.on('page', alAbrir)
  // 0.3.33: solo se CUENTAN los diálogos nativos (alert/confirm); no se aceptan ni se descartan aquí (lo hace el worker, que los descarta).
  let dialogos = 0
  const alDialogo = () => { dialogos++ }
  destino.on('dialog', alDialogo)
  const r = await elegirRamoPelayo(destino, ctx, ramo)
  ctx.log(`pelayo_ramo ${JSON.stringify({ ramo, ...r })}`)
  const diag: DiagnosticoRamoPelayo = { tarjetas: r.controles ?? 0, clic: r.estado !== 'no_elegido', cambio: false, pestana: false, dialogo: 0, modal: 0, reintento: false }
  const cierra = async (actual: Page): Promise<void> => {
    contexto.off('page', alAbrir)
    destino.off('dialog', alDialogo)
    diag.dialogo = dialogos
    diag.pestana = abiertas.some((p) => p !== destino)
    diag.modal = await contarModalesPelayo(actual)
    diag.cambio = actual !== destino || cambioPantallaPelayo(antes, await estructuraPantallaPelayo(actual))
    const nota = notaDiagnosticoRamoPelayo(diag)
    ctx.log(`pelayo_diagnostico_ramo ${nota}`)
    // Solo se lleva al mapa cuando algo no fue como se esperaba (sin clic, o sin cambio de pantalla ni pestaña nueva).
    if (!diag.clic || (!diag.cambio && !diag.pestana)) ctx.diagnostico?.(nota)
  }
  if (r.estado === 'no_elegido') {
    await cierra(destino)
    if (r.clicNoAccionable) {
      // 0.3.37: el diagnóstico del clic (forma cerrada, sin PII) sustituye a la nota de contadores: es más específico (una sola nota viaja en `notaFin`).
      const { diagnostico, hijoProbado } = r.clicNoAccionable
      ctx.log(`pelayo_clic_no_accionable ${diagnostico ? cuerpoDiagnosticoClic(diagnostico) : 'sin_diagnostico'}`)
      if (diagnostico) ctx.diagnostico?.(notaClicPelayo(diagnostico, hijoProbado))
    }
    return destino
  }
  // El primer formulario (0.3.32): la tarjeta del ramo puede abrir una PESTAÑA nueva (sin href: `window.open`) o repintar la misma página (incl. iframe).
  // Se espera a una pestaña nueva o a que la pantalla CAMBIE (no solo el nº de campos), se deja asentar y se vuelca. No se rellena ni se avanza.
  // 0.3.33: si pasada la primera espera NO ha cambiado nada (ni pestaña, ni pantalla), UN reintento sobre el elemento interior de texto exacto
  // (el manejador de la tarjeta puede colgar de un hijo, o no estar enlazado aún al primer clic), por la misma puerta del guard.
  const fin = Date.now() + e.formularioMs
  const finPrimera = Date.now() + Math.min(e.reintentoMs, e.formularioMs)
  let actual: Page = destino
  for (;;) {
    const nuevaPestana = abiertas.find((p) => p !== destino && !p.isClosed())
    if (nuevaPestana) {
      actual = nuevaPestana
      await actual.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => undefined)
      await exigirSinVerificacion(actual, 'pelayo')
      await ctx.exigirSinCaptcha()
      break
    }
    if (cambioPantallaPelayo(antes, await estructuraPantallaPelayo(destino)) || Date.now() >= fin) break
    if (!diag.reintento && r.estado === 'pulsado' && Date.now() >= finPrimera && (await contarModalesPelayo(destino)) === 0 && dialogos === 0) {
      diag.reintento = true
      await destino.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined)
      const interior = (await interioresRamo(destino, rotulosRamoPelayo(ramo)))[0]
      if (interior) {
        await ctx.pulsarEnlaceEntrada(interior, { reintento: true }).catch((err) => ctx.log(`pelayo_reintento_ramo_rechazado ${String((err as Error)?.constructor?.name ?? 'Error').slice(0, 40)}`))
        await destino.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
      }
      continue
    }
    await destino.waitForTimeout(500)
  }
  await actual.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
  // Asentar: el formulario se pinta por trozos; se espera a dos lecturas seguidas iguales (tope ~5 s).
  let previa = huellaPantallaPelayo(await estructuraPantallaPelayo(actual))
  for (let i = 0; i < 10; i++) {
    await actual.waitForTimeout(500)
    const h = huellaPantallaPelayo(await estructuraPantallaPelayo(actual))
    if (h === previa) break
    previa = h
  }
  await cierra(actual)
  await volcar(actual, ctx, 'formulario_ramo')
  return actual
}
