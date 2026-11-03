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
// SOLO se escriben en un host de `HOSTS_LOGIN_PELAYO` (un SSO en otro dominio = hueco explícito, se añade tras verlo).
// Fail-closed: lo que no aparece → `ErrorTarificador('portal')` con QUÉ falta; no se adivina. Los volcados de estructura van al log
// (rótulos ≤40 car., sin nada que parezca dato personal: `pareceDatoPersonalInventario`).

import type { Frame, Locator, Page } from 'playwright'
import type { ContextoPortal } from '../../adaptador.ts'
import { ErrorTarificador } from '../../errores.ts'
import { exigirSinVerificacion } from '../../verificacion.ts'
import { exigirSinRechazoCredenciales } from '../../credenciales.ts'
import { pareceDatoPersonalInventario } from '@central/module-tarificacion'

/** URL pública de entrada (dada por Alberto, 03/11/2026; no es secreta). */
export const URL_PORTAL_PELAYO = 'https://mediadores.pelayo.com/portalmediador-pagina-inicio/'
/** Hosts EXACTOS donde se pueden escribir las credenciales. */
export const HOSTS_LOGIN_PELAYO: readonly string[] = Object.freeze(['mediadores.pelayo.com'])
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

export type EsperasPelayo = { loginMs?: number; menuMs?: number; paginaMs?: number; formularioMs?: number }
const ESPERAS: Required<EsperasPelayo> = { loginMs: 60_000, menuMs: 20_000, paginaMs: 45_000, formularioMs: 30_000 }

export type CtxEntradaPelayo = Pick<ContextoPortal, 'credenciales' | 'pausa' | 'pulsar' | 'exigirSinCaptcha' | 'log'> & {
  /** Menú, «Nuevo Presupuesto» y ramo pulsable: SOLO por la puerta exacta del guard (`pulsarEnlaceEntradaAutorizado`). */
  pulsarEnlaceEntrada: (boton: Locator) => Promise<void>
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Regex EXACTA para una etiqueta (sin distinguir mayúsculas ni tildes; espacios flexibles; nada antes ni después). Pura. */
export function etiquetaExactaPelayo(texto: string): RegExp {
  const partes = sinTildes(texto).split(' ').map((p) => escapar(p).replace(/a/g, '[aá]').replace(/e/g, '[eé]').replace(/i/g, '[ií]').replace(/o/g, '[oó]').replace(/u/g, '[uúü]'))
  return new RegExp(`^\\s*${partes.join('\\s+')}\\s*$`, 'i')
}

/** ¿El host de la URL es uno de los del login? (hostname EXACTO, https, sin credenciales en la URL). Pura. */
export function esHostLoginPelayo(url: string, hosts: readonly string[] = HOSTS_LOGIN_PELAYO): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && !u.username && !u.password && hosts.includes(u.hostname)
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
function candidatos(raiz: Page | Frame, texto: string): Locator {
  const re = etiquetaExactaPelayo(texto)
  const porRol = raiz.getByRole('menuitem', { name: re }).or(raiz.getByRole('link', { name: re })).or(raiz.getByRole('button', { name: re })).or(raiz.getByRole('tab', { name: re }))
  const porTexto = raiz.getByText(re).locator('xpath=ancestor-or-self::*[self::a or self::button or self::label or @role="menuitem" or @role="button" or @role="link" or @role="tab" or @role="option" or @onclick][1]')
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
async function exactos(page: Page, texto: string): Promise<Locator[]> {
  const out: Locator[] = []
  for (const r of raices(page)) {
    const c = candidatos(r, texto)
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

export type ResultadoRamoPelayo = { estado: 'select' | 'pulsado' | 'no_elegido'; motivo?: string }

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
  if (selects.length === 0) for (const t of rotulos) pulsables.push(...(await exactos(page, t)))
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
  if (selects.length > 1) return { estado: 'no_elegido', motivo: `${selects.length} desplegables con la opción del ramo` }
  if (selects.length === 1) {
    await ctx.pausa()
    await selects[0].sel.selectOption({ index: selects[0].indice })
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
    return { estado: 'select' }
  }
  if (pulsables.length === 0) return { estado: 'no_elegido', motivo: 'sin control del ramo' }
  if (pulsables.length > 1) return { estado: 'no_elegido', motivo: `${pulsables.length} controles del ramo` }
  await ctx.pulsarEnlaceEntrada(pulsables[0])
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
  return { estado: 'pulsado' }
}

/**
 * Home (ya con sesión) → «Contratación» › «Presupuestos» › «Nuevo Presupuesto» → ramo → primer formulario. Vuelca (al log, sin PII) la
 * pantalla de selección de ramo y la que queda tras elegirlo. Devuelve la página donde sigue la exploración (la misma, o la pestaña
 * nueva si «Nuevo Presupuesto» la abre). Nada se rellena ni se avanza aquí.
 */
export async function abrirNuevoPresupuestoPelayo(page: Page, ctx: CtxEntradaPelayo, ramo: string, esperas: EsperasPelayo = {}): Promise<Page> {
  const e = { ...ESPERAS, ...esperas }
  rotulosRamoPelayo(ramo)
  await pulsarExacto(page, ctx, RUTA_MENU_PELAYO[0], e.menuMs, 'en el menú superior')
  // Desplegable: si «Presupuestos» no se ve tras el clic, se pasa el ratón por encima de «Contratación» (hover no es un clic).
  if ((await exactos(page, RUTA_MENU_PELAYO[1])).length === 0) {
    const menu = await exactos(page, RUTA_MENU_PELAYO[0])
    if (menu[0]) await menu[0].hover().catch(() => undefined)
  }
  await pulsarExacto(page, ctx, RUTA_MENU_PELAYO[1], e.menuMs, 'en el desplegable de «Contratación»')
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
  const r = await elegirRamoPelayo(destino, ctx, ramo)
  ctx.log(`pelayo_ramo ${JSON.stringify({ ramo, ...r })}`)
  if (r.estado === 'no_elegido') return destino
  // El primer formulario: se espera a que cambie el nº de campos (o a que pase el tope); no se rellena ni se avanza.
  const fin = Date.now() + e.formularioMs
  for (;;) {
    const d = await estructuraPantallaPelayo(destino)
    if (d.campos !== antes.campos || Date.now() >= fin) break
    await destino.waitForTimeout(500)
  }
  await volcar(destino, ctx, 'formulario_ramo')
  return destino
}
