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
// Fail-closed: lo que no aparece o es ambiguo (0 o >1 controles) → `ErrorTarificador('portal')` con QUÉ falta; no se adivina.

import type { Frame, Locator, Page } from 'playwright'
import type { ContextoPortal } from '../../adaptador.ts'
import { ErrorTarificador } from '../../errores.ts'
import { exigirSinVerificacion } from '../../verificacion.ts'
import { exigirSinRechazoCredenciales, textoVisiblePagina } from '../../credenciales.ts'

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

/** ¿El texto de una tarjeta es la de Vivienda y no la de EMPRESAS? Pura (la usa el localizador y el test). */
export function esTarjetaViviendaFidelidade(texto: string): boolean {
  return texto.includes(PRODUCTO_VIVIENDA_FIDELIDADE) && !RE_TARJETA_AJENA_FIDELIDADE.test(texto) && /vivienda/i.test(texto)
}

const SEL_CLICABLE = 'a, button, [role="menuitem"], [role="button"], [role="link"], [onclick], input[type="button"], input[type="submit"]'
const raices = (page: Page): (Page | Frame)[] => [page, ...page.frames().filter((f) => f !== page.mainFrame())]

/** Controles clicables cuyo texto/nombre accesible es EXACTAMENTE `texto`, en la página y sus marcos (solo los visibles). */
function candidatos(raiz: Page | Frame, texto: string): Locator {
  const re = etiquetaExactaFidelidade(texto)
  const porRol = raiz.getByRole('menuitem', { name: re }).or(raiz.getByRole('link', { name: re })).or(raiz.getByRole('button', { name: re }))
  const porTexto = raiz.getByText(re).locator(`xpath=ancestor-or-self::*[self::a or self::button or @role="menuitem" or @role="button" or @role="link" or @onclick][1]`)
  return porRol.or(porTexto).locator('visible=true')
}

async function contar(l: Locator): Promise<number> {
  return l.count().catch(() => 0)
}

/** El ÚNICO control visible con ese texto exacto en todos los marcos; `null` si no hay; ambiguo (>1) → error (no se elige uno). */
async function unicoVisible(page: Page, texto: string): Promise<Locator | null> {
  const hallados: Locator[] = []
  for (const r of raices(page)) {
    const l = candidatos(r, texto)
    const n = await contar(l)
    for (let i = 0; i < n; i++) hallados.push(l.nth(i))
  }
  if (hallados.length > 1) throw new ErrorTarificador('portal', `fidelidade: «${texto}» aparece ${hallados.length} veces visible; no se adivina cuál (hueco)`)
  return hallados[0] ?? null
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

/** 0.3.12: botones que cierran el diálogo de cookies/RGPD (texto normalizado EXACTO; lista cerrada). «No acepto cookies» RECHAZA el consentimiento. Nunca «Aceptar», «Sí, acepto cookies» ni el texto vacío. */
export const BOTONES_CERRAR_RGPD_FIDELIDADE = Object.freeze(['cerrar', '×', 'x', 'entendido', 'no acepto cookies'] as const)
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
  if (!inicial) return
  const botones = await botonesDe()
  const permitidos = new Set<string>(BOTONES_CERRAR_RGPD_FIDELIDADE)
  const cierre = botones.find((b) => permitidos.has(textoBotonRgpd(b.texto)))
  if (cierre) {
    await ctx.pulsar(cierre.loc)
    const fin = Date.now() + Math.min(ms, 10_000)
    while ((await dialogo()) && Date.now() < fin) await page.waitForTimeout(250)
    if (!(await dialogo())) return
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

/** La tarjeta de Vivienda (Producto 4216) y, dentro, su botón «Simulación» ÚNICO. La de EMPRESAS (4215) no puede ser candidata. */
async function botonSimulacionVivienda(page: Page, ms: number): Promise<Locator> {
  const fin = Date.now() + ms
  const re = etiquetaExactaFidelidade(BOTON_SIMULACION_FIDELIDADE)
  for (;;) {
    const hallados: Locator[] = []
    for (const r of raices(page)) {
      const boton = r.getByRole('button', { name: re }).or(r.getByRole('link', { name: re })).or(r.locator('input[type="button"], input[type="submit"]').and(r.getByRole('button', { name: re })))
      const tarjetas = r
        .locator('div, li, article, section, td, tr, form')
        .filter({ hasText: new RegExp(PRODUCTO_VIVIENDA_FIDELIDADE) })
        .filter({ hasNotText: RE_TARJETA_AJENA_FIDELIDADE })
        .filter({ has: boton })
      const n = await contar(tarjetas)
      if (n === 0) continue
      // En orden de documento, los envoltorios de la MISMA tarjeta van antes que ella: la más profunda es la última.
      const tarjeta = tarjetas.last()
      const texto = await tarjeta.innerText().catch(() => '')
      if (!esTarjetaViviendaFidelidade(texto)) continue
      const b = tarjeta.locator(SEL_CLICABLE).filter({ has: r.getByText(re) }).or(tarjeta.getByRole('button', { name: re })).locator('visible=true')
      const nb = await contar(b)
      for (let i = 0; i < nb; i++) hallados.push(b.nth(i))
    }
    if (hallados.length === 1) return hallados[0]
    if (hallados.length > 1) throw new ErrorTarificador('portal', `fidelidade: la tarjeta de Vivienda (Producto ${PRODUCTO_VIVIENDA_FIDELIDADE}) tiene ${hallados.length} botones «${BOTON_SIMULACION_FIDELIDADE}»; no se adivina (hueco)`)
    if (Date.now() >= fin) throw new ErrorTarificador('portal', `fidelidade: no se localiza la tarjeta «Producto ${PRODUCTO_VIVIENDA_FIDELIDADE} · Fidelidade Vivienda» con su botón «${BOTON_SIMULACION_FIDELIDADE}» en ${Math.round(ms / 1000)} s (hueco)`)
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
