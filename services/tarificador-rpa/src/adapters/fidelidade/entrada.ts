// Fidelidade (intranet de mediadores) — LOGIN y ENTRADA del EXPLORADOR hasta el formulario de VIVIENDA (28/10/2026, Alberto,
// capturas). SOLO exploración: sin adaptador de tarificación; el recorrido llega al formulario y ahí para (lo mapea el bucle IA).
//
// Ruta (fija, por código; la IA no interviene):
//   https://mediadores.fidelidade.es/OPI_ES_Mediadores/ → usuario + contraseña (sin 2FA)
//   → menú superior «OFICINA VIRTUAL» → submenú «PROYECTO» → «Nuevo proyecto»
//   → página «PARTICULARES - Crear nuevo proyecto» → tarjeta «Producto 4216 · Fidelidade Vivienda» → botón rojo «Simulación».
// NUNCA la tarjeta «EMPRESAS» (Producto 4215 · Gama Comercio). Los otros menús del mismo nivel («INFORMACIÓN DE GESTIÓN»,
// «PRODUCTOS», «NORMAS», «CONDICIONADOS») y «NO VIDA › Ver póliza / Ver siniestro» no se tocan.
//
// Pulsar SOLO por `ctx.pulsarEnlaceEntrada` (puerta EXACTA del guard: texto exacto, origen de Fidelidade, en orden, una vez cada
// uno y solo en la fase de entrada) y el botón de entrada del login por `ctx.pulsar` (guard genérico, sin ensancharlo). El
// formulario es LENTO: se espera con generosidad (red en reposo + primera etiqueta, hasta ~60 s) antes de llamarlo hueco.
// Varios controles de texto exacto = equivalentes (Alberto, 29/10/2026): el de la barra de navegación, o el primero. Fail-closed: lo que no aparece (0 controles) → `ErrorTarificador('portal')` con QUÉ falta; no se adivina.

import type { Frame, Locator, Page } from 'playwright'
import type { ContextoPortal } from '../../adaptador.ts'
import { ErrorTarificador } from '../../errores.ts'
import { exigirSinVerificacion } from '../../verificacion.ts'
import { exigirSinRechazoCredenciales, textoVisiblePagina } from '../../credenciales.ts'
import { pareceDatoPersonalInventario } from '@central/module-tarificacion'

/** URL pública de entrada (dada por Alberto, 28/10/2026; no es secreta). */
export const URL_INTRANET_FIDELIDADE = 'https://mediadores.fidelidade.es/OPI_ES_Mediadores/'

/** Etiquetas EXACTAS de la ruta de menú, en orden (= `ENLACES_ENTRADA_AUTORIZADOS.fidelidade` del guard, menos «Simulación»). */
export const RUTA_MENU_FIDELIDADE = Object.freeze(['Oficina Virtual', 'Proyecto', 'Nuevo proyecto'] as const)
export const BOTON_SIMULACION_FIDELIDADE = 'Simulación'
/** Producto de la tarjeta de Vivienda y los que NO se pueden pulsar nunca (EMPRESAS · Gama Comercio). */
export const PRODUCTO_VIVIENDA_FIDELIDADE = '4216'
export const RE_TARJETA_AJENA_FIDELIDADE = /4215|gama\s+comercio|empresas/i

/** Botones de entrada del login. «Aceptar» NO está (el guard lo bloquea); «Cambiar contraseña»/«¿Olvidó…?» jamás. */
export const RE_BOTON_ENTRAR_FIDELIDADE = /^\s*(acceder|entrar|iniciar\s+sesi[oó]n|log\s*in|conectar|continuar|identificarse)\s*$/i
export const RE_TEXTO_PROHIBIDO_LOGIN = /cambiar\s+(la\s+)?contrase|olvid|recuper|restablec|registr/i

export type EsperasFidelidade = { loginMs?: number; menuMs?: number; paginaMs?: number; formularioMs?: number }
const ESPERAS: Required<EsperasFidelidade> = { loginMs: 60_000, menuMs: 30_000, paginaMs: 60_000, formularioMs: 60_000 }

export type CtxEntradaFidelidade = Pick<ContextoPortal, 'credenciales' | 'pausa' | 'pulsar' | 'exigirSinCaptcha' | 'log'> & {
  /** Menú y «Simulación»: SOLO por la puerta exacta del guard (`pulsarEnlaceEntradaAutorizado`). */
  pulsarEnlaceEntrada: (boton: Locator) => Promise<void>
}

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()

/** Regex EXACTA (sin distinguir mayúsculas ni tildes del patrón) para una etiqueta: espacios flexibles, nada antes ni después. Pura. */
export function etiquetaExactaFidelidade(texto: string): RegExp {
  const partes = sinTildes(texto).split(' ').map((p) => escapar(p).replace(/a/g, '[aá]').replace(/e/g, '[eé]').replace(/i/g, '[ií]').replace(/o/g, '[oó]').replace(/u/g, '[uúü]'))
  return new RegExp(`^\\s*${partes.join('\\s+')}\\s*$`, 'i')
}

/**
 * ¿El texto de una tarjeta es la de Vivienda y no la de EMPRESAS? Pura (la usa el test; el localizador aplica la MISMA regla en la página).
 * 0.3.17: vale con «4216» O con «vivienda» (sin tildes ni mayúsculas) y nunca con 4215/«Gama Comercio»/«EMPRESAS". Si el texto trae códigos
 * «Producto NNNN», TODOS tienen que ser 4216 (una tarjeta «Producto 4217 · … Vivienda» no es esta).
 */
export function esTarjetaViviendaFidelidade(texto: string): boolean {
  const n = sinTildes(texto)
  if (RE_TARJETA_AJENA_FIDELIDADE.test(n)) return false
  const codigos = [...n.matchAll(/producto\s*(\d{3,5})/g)].map((m) => m[1])
  if (codigos.length > 0) return codigos.every((c) => c === PRODUCTO_VIVIENDA_FIDELIDADE)
  return n.includes(PRODUCTO_VIVIENDA_FIDELIDADE) || /vivienda/.test(n)
}

const raices = (page: Page): (Page | Frame)[] => [page, ...page.frames().filter((f) => f !== page.mainFrame())]

/** Controles clicables cuyo texto/nombre accesible es EXACTAMENTE `texto`, en la página y sus marcos (solo los visibles). */
function candidatos(raiz: Page | Frame, texto: string): Locator {
  const re = etiquetaExactaFidelidade(texto)
  const porRol = raiz.getByRole('menuitem', { name: re }).or(raiz.getByRole('link', { name: re })).or(raiz.getByRole('button', { name: re }))
  const porTexto = raiz.getByText(re).locator(`xpath=ancestor-or-self::*[self::a or self::button or @role="menuitem" or @role="button" or @role="link" or @onclick][1]`)
  return porRol.or(porTexto).locator('visible=true')
}

/** Elementos HOJA cuyo texto es exactamente `texto` (el propio `<span>`/`<a>` de la etiqueta): último recurso si ningún ancestro clicable es exacto. */
function hojas(raiz: Page | Frame, texto: string): Locator {
  return raiz.getByText(etiquetaExactaFidelidade(texto)).locator('visible=true')
}

/**
 * 0.3.16 (real 29/10/2026): ¿el texto PROPIO del elemento es EXACTAMENTE la etiqueta? Un contenedor del menú entero («OFICINA VIRTUAL ·
 * PROYECTO · Nuevo proyecto · Ver proyecto · NO VIDA · …») contiene la etiqueta pero no ES la etiqueta: no es candidato. Compara el
 * `textContent` (o `value` / `aria-label` de un control) normalizado (sin tildes, mayúsculas ni espacios de más) con la etiqueta.
 * Sin funciones con nombre dentro de la lambda (tsx las envuelve en `__name`, que en la página no existe).
 */
async function esHojaExacta(l: Locator, texto: string): Promise<boolean> {
  const buscada = sinTildes(texto)
  return l
    .evaluate((el, b) => {
      const v = (el as HTMLInputElement).value
      const textos = [el.textContent, typeof v === 'string' ? v : '', el.getAttribute('aria-label')]
      return textos.map((t) => String(t == null ? '' : t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()).some((t) => t === b)
    }, buscada)
    .catch(() => false)
}

async function soloHojasExactas(hallados: Locator[], texto: string): Promise<Locator[]> {
  const out: Locator[] = []
  for (const h of hallados) if (await esHojaExacta(h, texto)) out.push(h)
  return out
}

async function contar(l: Locator): Promise<number> {
  return l.count().catch(() => 0)
}

/** Lo que se sabe de un candidato para decidir entre varios con el MISMO texto exacto. Sin PII: nada de query ni de textos. */
export type InfoCandidatoFidelidade = {
  tag: string
  /** `href` resuelto sin `#hash` (solo para comparar equivalencia); `null` si no hay o es `#`/`javascript:` vacío. */
  href: string | null
  /** Ruta del href SIN query ni origen (solo para describir en el error). */
  hrefRuta: string | null
  /** `onclick` normalizado (espacios fuera) o `null`. Solo para comparar; en el error solo sale «sí/no». */
  onclick: string | null
  /** Dentro de la barra de navegación principal (nav, header, role=menubar/navigation/menu, id/clase «menu»/«nav») y no en footer/aside. */
  enNav: boolean
  /** Descripción corta del ancestro de menú: `tag#id.clase` (≤40 car., sin números largos). */
  ancestro: string
}

export type DecisionCandidatos = { tipo: 'uno'; indice: number; motivo: 'unico' | 'en_navegacion' | 'primero' } | { tipo: 'ninguno' }

/**
 * Elección DETERMINISTA entre candidatos de texto EXACTO ya filtrados (visibles, clicables). Decisión de Alberto (29/10/2026): los
 * repetidos son equivalentes (p. ej. tres «Oficina Virtual»), da igual cuál: se prefiere el que actúa como pestaña/menú (dentro de
 * la barra de navegación) y, si no se distingue, el primero visible. Sin ninguno → `ninguno` (quien llama da el error descriptivo).
 * Solo se elige entre controles de texto exacto; el pulsado sigue pasando por la puerta exacta del guard (texto, origen, orden, una vez).
 */
export function elegirCandidatoFidelidade(cs: InfoCandidatoFidelidade[]): DecisionCandidatos {
  if (cs.length === 0) return { tipo: 'ninguno' }
  if (cs.length === 1) return { tipo: 'uno', indice: 0, motivo: 'unico' }
  const nav = cs.findIndex((c) => c.enNav)
  return nav >= 0 ? { tipo: 'uno', indice: nav, motivo: 'en_navegacion' } : { tipo: 'uno', indice: 0, motivo: 'primero' }
}

/** Lee del navegador lo que distingue a un candidato. Sin funciones con nombre dentro de la lambda: tsx las envuelve en `__name`, que en la página no existe. */
async function leerCandidato(l: Locator): Promise<InfoCandidatoFidelidade> {
  const x = (await l
    .evaluate((el) => {
      const a = el.tagName === 'A' ? el : el.closest('a')
      let href: string | null = null
      let ruta: string | null = null
      if (a && a.getAttribute('href') !== null) {
        const raw = String(a.getAttribute('href')).trim()
        if (!/^(#|javascript:\s*(void\(0\))?;?)?$/i.test(raw)) {
          try {
            const u = new URL((a as HTMLAnchorElement).href)
            const js = /^javascript:/i.test(raw)
            ruta = js ? null : u.pathname
            u.hash = ''
            href = js ? raw.replace(/\s+/g, '') : u.href
          } catch {
            href = null
          }
        }
      }
      const oc = String(el.getAttribute('onclick') || (a && a.getAttribute('onclick')) || '').replace(/\s+/g, '')
      const fuera = el.closest('footer, aside')
      const nav = el.closest('nav, header, [role="menubar"], [role="navigation"], [role="menu"], [id*="menu" i], [class*="menu" i], [id*="nav" i], [class*="nav" i]')
      let anc = ''
      if (nav) {
        const cl = String(nav.getAttribute('class') || '').split(/\s+/).filter(Boolean)[0] || ''
        anc = nav.tagName.toLowerCase() + (nav.id ? '#' + nav.id.replace(/\d{5,}/g, '#').slice(0, 40) : '') + (cl ? '.' + cl.replace(/\d{5,}/g, '#').slice(0, 40) : '')
      }
      return { tag: el.tagName.toLowerCase(), href, hrefRuta: ruta, onclick: oc || null, enNav: !!nav && !fuera, ancestro: anc }
    })
    .catch(() => null)) as Partial<InfoCandidatoFidelidade> | null
  return {
    tag: typeof x?.tag === 'string' ? x.tag : '?',
    href: typeof x?.href === 'string' ? x.href : null,
    hrefRuta: typeof x?.hrefRuta === 'string' ? x.hrefRuta : null,
    onclick: typeof x?.onclick === 'string' ? x.onclick : null,
    enNav: x?.enNav === true,
    ancestro: typeof x?.ancestro === 'string' ? x.ancestro : '',
  }
}

/** Elige UNO de los locators de texto exacto (ver {@link elegirCandidatoFidelidade}). */
async function elegirUno(hallados: Locator[]): Promise<Locator> {
  const infos: InfoCandidatoFidelidade[] = []
  for (const h of hallados) infos.push(await leerCandidato(h))
  const d = elegirCandidatoFidelidade(infos)
  return d.tipo === 'uno' ? hallados[d.indice] : hallados[0]
}

/** El control visible con ese texto exacto en todos los marcos; `null` si no hay; varios → elección determinista o error descriptivo. */
async function unicoVisible(page: Page, texto: string): Promise<Locator | null> {
  let hallados: Locator[] = []
  for (const r of raices(page)) {
    const l = candidatos(r, texto)
    const n = await contar(l)
    for (let i = 0; i < n; i++) hallados.push(l.nth(i))
  }
  // 0.3.16: solo HOJAS exactas (nunca el contenedor del menú que contiene la etiqueta); si ningún clicable lo es, la hoja de texto.
  hallados = await soloHojasExactas(hallados, texto)
  if (hallados.length === 0) {
    for (const r of raices(page)) {
      const l = hojas(r, texto)
      const n = await contar(l)
      for (let i = 0; i < n; i++) hallados.push(l.nth(i))
    }
    hallados = await soloHojasExactas(hallados, texto)
  }
  if (hallados.length === 0) return null
  return hallados.length === 1 ? hallados[0] : elegirUno(hallados)
}

/** Espera al control exacto; si no aparece y hay un control PREVIO del menú, lo sobrevuela (hover no es un clic) por si el submenú es de ratón. */
async function esperarUnico(page: Page, texto: string, ms: number, previo?: Locator | null): Promise<Locator> {
  const fin = Date.now() + ms
  let intentosHover = 0
  for (;;) {
    const l = await unicoVisible(page, texto)
    if (l) return l
    if (previo && intentosHover < 3 && Date.now() + 1_500 < fin) {
      intentosHover++
      await previo.hover({ timeout: 2_000 }).catch(() => undefined)
    }
    if (Date.now() >= fin) throw new ErrorTarificador('portal', `fidelidade: no aparece «${texto}» (control exacto visible) en ${Math.round(ms / 1000)} s (hueco)`)
    await page.waitForTimeout(400)
  }
}

async function esperarCarga(page: Page, ms: number): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: ms }).catch(() => undefined)
}

// ─── Login ───────────────────────────────────────────────────────────────────

async function marcoConPassword(page: Page, ms: number): Promise<Page | Frame> {
  const fin = Date.now() + ms
  for (;;) {
    for (const r of raices(page)) if ((await contar(r.locator('input[type="password"]').locator('visible=true'))) > 0) return r
    if (Date.now() >= fin) throw new ErrorTarificador('portal', `fidelidade/login: no aparece ningún campo de contraseña en ${Math.round(ms / 1000)} s (hueco)`)
    await page.waitForTimeout(500)
  }
}

/** 0.3.13: botones que cierran el diálogo de cookies/RGPD (texto normalizado EXACTO; lista cerrada). El portal EXIGE cookies: «No acepto cookies» lleva a SemCookies.aspx y el login no existe, así que se cierra con «Sí, acepto cookies» (consentimiento de cookies; no compromete nada contractual). Nunca «Aceptar», «Continuar» genéricos ni el texto vacío. */
export const BOTONES_CERRAR_RGPD_FIDELIDADE = Object.freeze(['cerrar', '×', 'x', 'entendido', 'si, acepto cookies'] as const)
/** Origen en el que se admite el cierre del diálogo de cookies. */
export const ORIGEN_RGPD_FIDELIDADE = 'https://mediadores.fidelidade.es'
const RE_SEM_COOKIES = /SemCookies\.aspx/i
const urlSemCookies = (page: Page): boolean => [page.url(), ...page.frames().map((f) => f.url())].some((u) => RE_SEM_COOKIES.test(u))
const origenPagina = (page: Page): string => {
  try {
    return new URL(page.url()).origin
  } catch {
    return ''
  }
}
const SEL_DIALOGO_RGPD = 'os-internal-ui-dialog, .os-internal-ui-dialog'
const SEL_BOTONES_DIALOGO = 'button, [role="button"], a, input[type="button"], input[type="submit"]'

/** Texto de un botón normalizado (minúsculas, sin tildes, espacios colapsados). Pura. */
export const textoBotonRgpd = (t: string): string => sinTildes(t)

/**
 * 0.3.11 (real 28/10/2026): un diálogo modal de OutSystems (`os-internal-ui-dialog` con `iframe[src*="RGPD.aspx"]`) intercepta los clics de
 * «Entrar». Se detecta en cualquier marco; si tiene un botón de la lista cerrada se pulsa con `ctx.pulsar` (guard) y se espera a que
 * desaparezca. Si sigue ahí: `ErrorTarificador('portal')` con SOLO los textos de los botones (≤8 de ≤40 car.). Nada más se pulsa.
 */
export async function cerrarDialogoRgpdFidelidade(page: Page, ctx: Pick<CtxEntradaFidelidade, 'pulsar' | 'pausa'>, ms: number): Promise<void> {
  // Un marco que aún no está listo no puede colgar la detección: cada cuenta tiene tope propio (0 = no se ve).
  const contar = (l: Locator): Promise<number> => Promise.race([l.count().catch(() => 0), new Promise<number>((ok) => setTimeout(() => ok(0), 1_500))])
  const dialogo = async () => {
    for (const r of raices(page)) {
      const d = r.locator(SEL_DIALOGO_RGPD).locator('visible=true')
      if ((await contar(d)) > 0) return { r, d }
    }
    return null
  }
  const botonesDe = async (): Promise<{ loc: Locator; texto: string }[]> => {
    const hallados: { loc: Locator; texto: string }[] = []
    for (const r of raices(page)) {
      const dentro = r.locator(SEL_DIALOGO_RGPD).locator(SEL_BOTONES_DIALOGO).locator('visible=true')
      const enMarco = r !== page && /RGPD\.aspx/i.test((r as Frame).url()) ? r.locator(SEL_BOTONES_DIALOGO).locator('visible=true') : null
      for (const grupo of enMarco ? [dentro, enMarco] : [dentro]) {
        const n = Math.min(await contar(grupo), 20)
        for (let i = 0; i < n; i++) {
          const loc = grupo.nth(i)
          const texto = ((await loc.innerText({ timeout: 1_000 }).catch(() => '')) || (await loc.getAttribute('value').catch(() => '')) || (await loc.getAttribute('aria-label').catch(() => '')) || '').replace(/\s+/g, ' ').trim()
          hallados.push({ loc, texto })
        }
      }
    }
    return hallados
  }
  const inicial = await dialogo()
  if (!inicial) {
    if (urlSemCookies(page)) throw new ErrorTarificador('portal', 'fidelidade: portal en SemCookies (cookies rechazadas)')
    return
  }
  // Solo en el origen del portal de mediadores se pulsa algo del diálogo; en cualquier otro, ningún botón (sale el error con los textos).
  const botones = await botonesDe()
  const origenOk = origenPagina(page) === ORIGEN_RGPD_FIDELIDADE
  const permitidos = new Set<string>(BOTONES_CERRAR_RGPD_FIDELIDADE)
  const cierre = !origenOk ? undefined : botones.find((b) => permitidos.has(textoBotonRgpd(b.texto)))
  if (cierre) {
    await ctx.pulsar(cierre.loc)
    const fin = Date.now() + Math.min(ms, 10_000)
    while ((await dialogo()) && Date.now() < fin) await page.waitForTimeout(250)
    if (!(await dialogo())) {
      await page.waitForTimeout(500)
      if (urlSemCookies(page)) throw new ErrorTarificador('portal', 'fidelidade: portal en SemCookies (cookies rechazadas)')
      return
    }
  }
  const textos = (cierre ? await botonesDe() : botones).slice(0, 8).map((b) => b.texto.slice(0, 40))
  throw new ErrorTarificador('portal', `fidelidade/login: diálogo de cookies/RGPD tapa el login; botones: [${textos.map((t) => `«${t}»`).join(', ')}]`)
}

export async function loginFidelidade(page: Page, ctx: CtxEntradaFidelidade, esperas: EsperasFidelidade = {}, url: string = URL_INTRANET_FIDELIDADE): Promise<void> {
  const e = { ...ESPERAS, ...esperas }
  const r = await page.goto(url)
  const st = r?.status() ?? 0
  if (st >= 500) throw new ErrorTarificador('portal', `fidelidade/login: la intranet respondió ${st} en la entrada`, { transitorio: true })
  await ctx.exigirSinCaptcha()

  const raiz = await marcoConPassword(page, e.loginMs)
  await cerrarDialogoRgpdFidelidade(page, ctx, e.loginMs)
  const password = raiz.locator('input[type="password"]').locator('visible=true').first()
  // Usuario = el último campo de texto visible ANTES de la contraseña en orden de documento.
  const usuario = raiz.locator('xpath=(//input[@type="password"])[1]/preceding::input[not(@type) or @type="text" or @type="email" or @type="tel"]').locator('visible=true').last()
  if ((await contar(usuario)) !== 1) throw new ErrorTarificador('portal', 'fidelidade/login: no se localiza el campo de usuario (hueco)')
  const entrar = raiz
    .getByRole('button', { name: RE_BOTON_ENTRAR_FIDELIDADE })
    .or(raiz.locator('button[type="submit"], input[type="submit"], input[type="image"]'))
    .locator('visible=true')
    .filter({ hasNotText: RE_TEXTO_PROHIBIDO_LOGIN })
  if ((await contar(entrar)) !== 1) throw new ErrorTarificador('portal', `fidelidade/login: se esperaba exactamente un botón de entrada visible y hay ${await contar(entrar)} (hueco)`)

  await usuario.fill(ctx.credenciales.usuario)
  await ctx.pausa()
  await password.fill(ctx.credenciales.contrasena)
  await ctx.pausa()
  await ctx.pulsar(entrar)

  // Resultado: la contraseña desaparece → dentro; un mensaje de rechazo/bloqueo → se para YA (sin reintentar: así se bloquea una cuenta).
  const fin = Date.now() + e.loginMs
  for (;;) {
    await ctx.exigirSinCaptcha()
    await exigirSinVerificacion(page, 'fidelidade')
    let hay = false
    for (const x of raices(page)) if ((await contar(x.locator('input[type="password"]').locator('visible=true'))) > 0) hay = true
    if (!hay) break
    await exigirSinRechazoCredenciales(page, 'fidelidade')
    if (Date.now() >= fin) throw new ErrorTarificador('portal', 'fidelidade/login: el formulario sigue visible tras enviar (sin mensaje de rechazo en pantalla)')
    await page.waitForTimeout(500)
  }
  await page.waitForTimeout(1_000)
  await exigirSinVerificacion(page, 'fidelidade')
  await ctx.exigirSinCaptcha()
  await exigirSinRechazoCredenciales(page, 'fidelidade', { soloInutilizable: true })
  ctx.log('login ok')
}

// ─── Entrada: OFICINA VIRTUAL › PROYECTO › Nuevo proyecto › tarjeta Vivienda › Simulación ───────────────────

async function esperarTextoPagina(page: Page, re: RegExp, ms: number): Promise<boolean> {
  const fin = Date.now() + ms
  for (;;) {
    if (re.test(await textoVisiblePagina(page))) return true
    if (Date.now() >= fin) return false
    await page.waitForTimeout(500)
  }
}

/**
 * 0.3.17 (real 29/10/2026: «no se localiza la tarjeta … con su botón «Simulación»»): se busca EN LA PÁGINA, en cada marco, con TEXTO (no
 * función: tsx envuelve las funciones con nombre en `__name`). Pasos: (1) HOJAS cuya etiqueta (texto propio, `value`, aria-label, title o
 * alt) normalizada es EXACTAMENTE «simulacion» (ningún contenedor que solo las envuelve); (2) de cada hoja se sube hasta el ancestro MÁS
 * ALTO cuyo texto NO menciona 4215/«Gama Comercio»/«EMPRESAS» (la tarjeta, sin arrastrar a las vecinas); (3) esa tarjeta es la de Vivienda
 * si (sus códigos «Producto NNNN» son todos 4216) o, sin códigos, contiene «4216» o «vivienda» ({@link esTarjetaViviendaFidelidade});
 * (4) se prefieren las que contienen «4216» y, entre las equivalentes, la primera visible. Marca el control clicable (o la hoja) con un atributo y devuelve QUÉ
 * hay (sin PII): nº de tarjetas candidatas, textos normalizados de botones/enlaces visibles (≤30 de ≤40 car.; no los de cabecera/usuario; en el error solo los de navegación)
 * y si aparece «4216»/«vivienda» en el marco.
 */
const ATRIBUTO_SIMULACION = 'data-rpa-simulacion-fidelidade';
const SCRIPT_SIMULACION = `(() => {
  const ATR = ${JSON.stringify(ATRIBUTO_SIMULACION)};
  const norm = (t) => String(t == null ? '' : t).normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/\\s+/g, ' ').trim().toLowerCase();
  const visible = (el) => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const r = el.getBoundingClientRect(); return !(r.width === 0 && r.height === 0); };
  const etiquetas = (el) => [el.tagName === 'INPUT' ? el.value : el.textContent, el.getAttribute('aria-label'), el.getAttribute('title'), el.getAttribute('alt')].map(norm).filter(Boolean);
  const AJENA = /4215|gama\\s+comercio|empresas/;
  const tarjetaVivienda = (n) => {
    if (AJENA.test(n)) return false;
    const cods = Array.from(n.matchAll(/producto\\s*(\\d{3,5})/g)).map((m) => m[1]);
    if (cods.length > 0) return cods.every((c) => c === '4216');
    return n.includes('4216') || /vivienda/.test(n);
  };
  const USUARIO = /usuario|user|perfil|mediador|sesion|bienvenid|login|cabecera|header/i;
  for (const x of Array.from(document.querySelectorAll('[' + ATR + ']'))) x.removeAttribute(ATR);
  const todos = Array.from(document.querySelectorAll('a,button,input,img,span,div,td,li,p,label,h1,h2,h3,h4,h5,h6,[role=button],[role=link],[onclick]'));
  const exactos = todos.filter((el) => etiquetas(el).some((t) => t === 'simulacion'));
  const hojas = exactos.filter((el) => !exactos.some((o) => o !== el && el.contains(o)));
  const cuerpo = norm(document.body ? document.body.textContent : '');
  const cand = [];
  for (const h of hojas) {
    let tarjeta = null;
    for (let a = h.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      if (AJENA.test(norm(a.textContent))) break;
      tarjeta = a;
    }
    if (!tarjeta) continue;
    const t = norm(tarjeta.textContent);
    if (tarjetaVivienda(t)) cand.push({ h: h, con4216: t.includes('4216') });
  }
  const con = cand.filter((c) => c.con4216);
  const lista = (con.length > 0 ? con : cand).filter((c) => visible(c.h));
  // Se pulsa el control clicable que ES la etiqueta (el a o button cuyo único texto es Simulación), y si no, la propia hoja.
  if (lista.length > 0) { const c = lista[0].h.closest('a,button,[role=button],[role=link],[onclick],input'); (c && etiquetas(c).some((t) => t === 'simulacion') ? c : lista[0].h).setAttribute(ATR, '1'); }
  const botones = [];
  for (const el of Array.from(document.querySelectorAll('a,button,input[type=button],input[type=submit],input[type=image],[role=button],[role=link],[onclick]'))) {
    if (botones.length >= 30) break;
    if (!visible(el)) continue;
    let usr = false;
    for (let a = el; a && a !== document.body; a = a.parentElement) { if (USUARIO.test((a.id || '') + ' ' + String(a.getAttribute('class') || '')) || a.tagName === 'HEADER') { usr = true; break; } }
    if (usr) continue;
    const t = (etiquetas(el)[0] || '').slice(0, 40);
    if (t && botones.indexOf(t) < 0) botones.push(t);
  }
  return { marcado: lista.length, tarjetas: cand.length, botones: botones, v4216: cuerpo.includes('4216'), vivienda: /vivienda/.test(cuerpo) };
})()`

type SondaSimulacion = { marcado: number; tarjetas: number; botones: string[]; v4216: boolean; vivienda: boolean }

/**
 * Revisión de seguridad 0.3.17: VOCABULARIO de navegación de la intranet. Un texto de botón/enlace solo sale en el error si TODAS
 * sus palabras están aquí (o son números de ≤4 cifras, como «4216»). El filtro de forma (correo, NIF, teléfono…) no basta: el
 * nombre del mediador, el de un cliente de «proyectos recientes» o un nº de póliza con letras no tienen forma de dato y se colarían.
 * Lo demás solo se CUENTA. Ampliar = añadir palabras genéricas de menú, nunca nombres propios.
 */
const VOCABULARIO_NAVEGACION_FIDELIDADE = new Set(
  ('simulacion simular simulador proyecto proyectos nuevo nueva nuevos oficina virtual vivienda hogar producto productos fidelidade ' +
    'empresas empresa gama comercio comercios particulares autos auto vida salud decesos accidentes hogares inicio menu volver atras ' +
    'siguiente anterior cancelar cerrar buscar busqueda consultar consulta consultas mis mi de del la el los las y o en a al ' +
    'por para con sin ver mas detalle detalles cotizar cotizacion tarificar tarificador presupuesto presupuestos polizas poliza ' +
    'salir ayuda documentacion documentos herramientas comunicaciones campanas siniestros recibos clientes cartera informes ' +
    'formacion noticias contacto datos seleccionar continuar guardar editar abrir descargar imprimir ok si no ir acceder entrar area ' +
    'privada mediadores gestion solicitudes pendientes alta todos todas filtrar limpiar opciones configuracion idioma es pt en')
    .split(/\s+/),
)
const esTextoDeNavegacion = (t: string): boolean => {
  const palabras = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9ñ]+/).filter(Boolean)
  return palabras.length > 0 && palabras.every((p) => VOCABULARIO_NAVEGACION_FIDELIDADE.has(p) || /^\d{1,4}$/.test(p))
}

/**
 * Resumen SIN PII de lo que hay en la página cuando no se encuentra la tarjeta (nº de marcos, textos de botones/enlaces, «4216»/«vivienda»).
 * Solo salen textos de NAVEGACIÓN ({@link VOCABULARIO_NAVEGACION_FIDELIDADE}); el resto se cuenta («otros=N»). Pura.
 */
export function describirSondaSimulacion(marcos: number, sondas: readonly (Partial<SondaSimulacion> | null)[]): string {
  const botones: string[] = []
  let otros = 0
  for (const s of sondas) {
    for (const b of Array.isArray(s?.botones) ? s!.botones : []) {
      const t = String(b).replace(/\s+/g, ' ').trim().slice(0, 40)
      if (!t || botones.includes(t)) continue
      // Nunca un texto fuera del vocabulario de navegación ni con forma de dato personal (correo, teléfono, NIF, cuentas…).
      if (!esTextoDeNavegacion(t) || pareceDatoPersonalInventario(t) || /\d{5,}|@/.test(t)) otros++
      else if (botones.length < 30) botones.push(t)
    }
  }
  const si = (k: 'v4216' | 'vivienda') => (sondas.some((s) => s?.[k] === true) ? 'sí' : 'no')
  const ilegibles = sondas.filter((s) => !s).length
  return `marcos=${marcos}${ilegibles ? ` (${ilegibles} ilegibles)` : ''}; «4216» ${si('v4216')}; «vivienda» ${si('vivienda')}; tarjetas con «Simulación»=${sondas.reduce((n, s) => n + (s?.tarjetas ?? 0), 0)}; botones/enlaces visibles [${botones.map((b) => `«${b}»`).join(', ')}]; otros=${otros}`
}

/** La tarjeta de Vivienda (4216 / «vivienda», nunca EMPRESAS) y, dentro, su botón «Simulación». Busca en TODOS los marcos. Si no lo halla, el error dice qué hay. */
async function botonSimulacionVivienda(page: Page, ms: number): Promise<Locator> {
  const fin = Date.now() + ms
  let sondas: (Partial<SondaSimulacion> | null)[] = []
  let marcos = 1
  for (;;) {
    const rs = raices(page)
    marcos = rs.length
    sondas = []
    const marcados: Locator[] = []
    for (const r of rs) {
      const sonda = await Promise.race([
        (r.evaluate(SCRIPT_SIMULACION) as Promise<SondaSimulacion>).catch(() => null),
        new Promise<null>((ok) => setTimeout(() => ok(null), 4_000)),
      ])
      sondas.push(sonda)
      if (sonda && sonda.marcado > 0) marcados.push(r.locator(`[${ATRIBUTO_SIMULACION}="1"]`))
    }
    // El primero en orden de documento (página, luego marcos): las tarjetas equivalentes dan igual; la de EMPRESAS no puede estar marcada.
    for (const l of marcados) if ((await contar(l)) === 1) return l
    if (Date.now() >= fin) {
      throw new ErrorTarificador('portal', `fidelidade: no se localiza la tarjeta «Producto ${PRODUCTO_VIVIENDA_FIDELIDADE} · Fidelidade Vivienda» con su botón «${BOTON_SIMULACION_FIDELIDADE}» en ${Math.round(ms / 1000)} s (hueco) — ${describirSondaSimulacion(marcos, sondas)}`)
    }
    await page.waitForTimeout(500)
  }
}

/** Nº de etiquetas `<label>` visibles en la página y sus marcos (la primera del formulario marca que ya pintó). */
async function etiquetasVisibles(page: Page): Promise<number> {
  let n = 0
  for (const r of raices(page)) n += await contar(r.locator('label').locator('visible=true'))
  return n
}

/**
 * Recorre el menú hasta el formulario de Vivienda. Devuelve la página donde sigue la exploración (la misma, o la pestaña nueva si
 * «Simulación» abre una). No pulsa nada fuera de la ruta; el formulario se da por cargado con la red en reposo y su primera etiqueta.
 */
export async function abrirFormularioViviendaFidelidade(page: Page, ctx: CtxEntradaFidelidade, esperas: EsperasFidelidade = {}): Promise<Page> {
  const e = { ...ESPERAS, ...esperas }
  await esperarCarga(page, e.paginaMs)
  let previo: Locator | null = null
  for (const etiqueta of RUTA_MENU_FIDELIDADE) {
    const c = await esperarUnico(page, etiqueta, e.menuMs, previo)
    await ctx.pulsarEnlaceEntrada(c)
    await esperarCarga(page, e.paginaMs)
    await ctx.exigirSinCaptcha()
    previo = c
  }
  if (!(await esperarTextoPagina(page, /particulares\s*[-–—]\s*crear\s+nuevo\s+proyecto/i, e.paginaMs))) {
    throw new ErrorTarificador('portal', 'fidelidade: no aparece la página «PARTICULARES - Crear nuevo proyecto» (hueco; no se sigue por otra)')
  }
  const simulacion = await botonSimulacionVivienda(page, e.paginaMs)
  // El formulario puede abrirse en una pestaña nueva del mismo contexto: se escucha ANTES del clic.
  const nueva = page.context().waitForEvent('page', { timeout: 8_000 }).catch(() => null)
  const etiquetasAntes = await etiquetasVisibles(page)
  await ctx.pulsarEnlaceEntrada(simulacion)
  const abierta = await nueva
  const destino = abierta ?? page
  if (abierta) await abierta.waitForLoadState('domcontentloaded', { timeout: e.formularioMs }).catch(() => undefined)
  await esperarCarga(destino, e.formularioMs)
  await ctx.exigirSinCaptcha()
  await exigirSinVerificacion(destino, 'fidelidade')
  const fin = Date.now() + e.formularioMs
  // En la MISMA página, una etiqueta que ya estaba antes del clic no cuenta: tiene que aparecer una más.
  while ((await etiquetasVisibles(destino)) <= (abierta ? 0 : etiquetasAntes)) {
    if (Date.now() >= fin) throw new ErrorTarificador('portal', `fidelidade: el formulario de Vivienda no mostró ninguna etiqueta en ${Math.round(e.formularioMs / 1000)} s tras «${BOTON_SIMULACION_FIDELIDADE}» (hueco)`)
    await destino.waitForTimeout(500)
  }
  await esperarCarga(destino, 15_000)
  ctx.log('fidelidade: formulario de Vivienda cargado')
  return destino
}
