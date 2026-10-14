// Occident / Catalana Occidente · HOGAR — ESQUELETO (14/10/2026). APAGADO y SIN REGISTRAR en `src/adapters/index.ts`.
//
// Visto en las capturas de Alberto (14/10/2026):
//   1. SSO `ssoaut.gco.global`, paso 1: «Nombre de usuario» + «Iniciar sesión» (`#usernamegco` / `#SubmitCreds`).
//      El paso 2 (contraseña) NO está capturado → hueco: falla ANTES de tocar el portal.
//   2. Portal React/MUI: menú superior «Productos» › «Análisis de necesidades» › «Hogar» › «Tarificación» (cascada;
//      cada ítem lleva una estrella de favorito al lado: NUNCA se pulsa). «Hogar» sale en otros submenús: se busca solo
//      dentro del de «Análisis de necesidades».
//   3. «Tarificación» NAVEGA dentro del portal a `RUTA_TARIFICACION_HOGAR` (NO abre pestaña nueva; corrección del 14/10).
//      El formulario va casi seguro en `iframe.site-layout-content-iframe` (HIPÓTESIS, como Comunidades): sin iframe →
//      hueco; con `src` fuera de la lista blanca de `guarda.ts` → error tipado (la lista no se amplía a ciegas).
//   4. Formulario VISTO (paso 1 «Datos del riesgo», paso 2 «Proyecto»): etiquetas en `ETIQUETAS_HOGAR`. Los desplegables y el
//      modal «Datos de la situación» no tienen mecánica grabada → HUECO (`formulario hogar: falta grabación`); lo que viene
//      después (descuentos, recalcular, primas, imprimir) está escrito con selectores HIPÓTESIS, alcanzable solo tras el hueco.
//   5. Regla de Alberto (14/10): descuentos comerciales SIEMPRE al máximo, salvo «Descuentos ABC» («Ajuste contra comisión»),
//      que NUNCA se toca. «Imprimir» GUARDA el proyecto y descarga el PDF: es el paso final (generar proyecto está permitido).
//
// Reglas (las mismas que comunidades.ts): pulsar SOLO con `pulsarSeguro` (guarda de Occident + `ctx.pulsar`), nunca
// `locator.click()`; ni emitir, contratar, grabar… (lista en guarda.ts); credenciales solo de `ctx.credenciales`.
// 🚨 `RamoRpa` (module-tarificacion) aún no incluye 'hogar' ni hay validador de riesgo de hogar: por eso el adaptador
// tiene su tipo propio y NO es un `AdaptadorRegistrado`. Para registrarlo hará falta ese contrato + su rama en ramo.ts.

import type { Frame, Locator, Page } from 'playwright'
import type { ContextoPortal } from '../../adaptador.ts'
import { ErrorTarificador } from '../../errores.ts'
import { esperarPdf } from '../../descarga-pdf.ts'
import { importeEs, type OfertaNormalizada } from '@central/module-tarificacion'
import { comprobarDescriptorOccident } from './guarda.ts'
import {
  BOTON_IMPRIMIR_HOGAR,
  ETIQUETAS_HOGAR,
  FALTA_CONTRASENA_HOGAR,
  FALTA_FORMULARIO_HOGAR,
  MENU_PADRE_HOGAR,
  PRODUCTOS_HOGAR,
  RUTA_MENU_HOGAR,
  RUTA_TARIFICACION_HOGAR,
  SEL,
  SEL_HIPOTESIS_SSO_CONTRASENA,
  SEL_HIPOTESIS_SSO_ENVIAR,
  TITULO_PASO2_HOGAR,
  comprobarDestinoHogar,
  comprobarSrcIframeHogar,
  esEstrellaFavorito,
  esUrlSso,
  puedeEscribirContrasena,
  etiquetaExactaOccident,
  huecoHogar,
  urlEntradaPortal,
} from './mapa.ts'

/** Apagado por defecto; lo enciende Alberto con `OCCIDENT_HOGAR_ACTIVO=true` (fly secrets). Sin registrar, de momento. */
export const HOGAR_ACTIVO = process.env.OCCIDENT_HOGAR_ACTIVO === 'true'

const ESPERA_MENU_MS = 15_000
const ESPERA_IFRAME_MS = 30_000
const TOPE_PDF_MS = 45_000

export type EsperasHogar = { menuMs?: number; iframeMs?: number }
export type CtxMenuHogar = Pick<ContextoPortal, 'pulsar' | 'pausa'>

// ─────────── pulsar con guardas ───────────

/** Descriptor del elemento (texto, ids, href, onclick, y clase/testid para reconocer estrella y papelera). */
async function descriptor(boton: Locator): Promise<(string | null)[]> {
  return boton.evaluate((el) => {
    const h = el as HTMLElement & { value?: unknown; href?: unknown; name?: unknown }
    return [
      h.innerText ?? h.textContent ?? '',
      h.getAttribute('aria-label'),
      h.getAttribute('title'),
      typeof h.value === 'string' ? h.value : null,
      h.id || null,
      typeof h.name === 'string' ? h.name : null,
      typeof h.href === 'string' ? h.href : h.getAttribute('href'),
      h.getAttribute('onclick'),
      h.getAttribute('formaction'),
      h.getAttribute('data-testid'),
      typeof h.className === 'string' ? h.className : null,
    ]
  })
}

const PAPELERA = /papelera|trash|delete|eliminar|borrar|quitar/i
const plano = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Descriptor de lo que NUNCA se pulsa en Hogar: estrella de favorito, papelera, y todo lo de «Descuentos ABC». Pura. */
export function motivoNoPulsarHogar(desc: readonly (string | null | undefined)[]): string | null {
  if (esEstrellaFavorito(desc)) return 'estrella de favorito'
  if (desc.some((d) => typeof d === 'string' && PAPELERA.test(plano(d)))) return 'papelera'
  if (desc.some((d) => typeof d === 'string' && esDescuentoAbc(d))) return 'Descuentos ABC / ajuste contra comisión'
  return null
}

/** Pulsa SOLO si pasa la guarda de Occident y `motivoNoPulsarHogar`; después, `ctx.pulsar` (guarda común). */
export async function pulsarSeguro(ctx: CtxMenuHogar, boton: Locator): Promise<void> {
  const desc = await descriptor(boton)
  const motivo = motivoNoPulsarHogar(desc)
  if (motivo) throw new ErrorTarificador('portal', `occident/hogar: se iba a pulsar algo prohibido (${motivo}); no se pulsa`)
  comprobarDescriptorOccident(desc)
  await ctx.pulsar(boton)
}

// ─────────── entrada: login + menú + iframe ───────────

/** Ítem de menú visible por texto EXACTO (el TEXTO, no el contenedor: el clic no cae en la estrella). Ambiguo → hueco. */
async function itemMenu(ambito: Page | Locator, texto: string, que: string, espera: number): Promise<Locator> {
  const l = ambito.getByText(etiquetaExactaOccident(texto)).filter({ visible: true })
  try {
    await l.first().waitFor({ state: 'visible', timeout: espera })
  } catch {
    throw huecoHogar(`el elemento de menú «${texto}» (${que}) de portaloccident`)
  }
  if ((await l.count()) > 1) throw huecoHogar(`el elemento de menú «${texto}» (${que}) es ambiguo: aparece más de una vez a la vista`)
  return l.first()
}

/** `role="menu"` visible MÁS RECIENTE que contiene `hijo` y no contiene a `padre` (MUI monta al final del body; HIPÓTESIS). */
function submenuDe(page: Page, padre: string, hijo: string): Locator {
  return page
    .getByRole('menu')
    .filter({ visible: true })
    .filter({ has: page.getByText(etiquetaExactaOccident(hijo)) })
    .filter({ hasNot: page.getByText(etiquetaExactaOccident(padre)) })
    .last()
}

/**
 * Portal con sesión → «Productos › Análisis de necesidades › Hogar › Tarificación» → ruta SPA de hogar → iframe del
 * formulario. Devuelve el marco. Reutilizado por el explorador (`PORTALES_EXPLORACION.occident`).
 */
export async function abrirTarificacionHogar(page: Page, ctx: CtxMenuHogar, esperas: EsperasHogar = {}): Promise<Frame> {
  const menuMs = esperas.menuMs ?? ESPERA_MENU_MS
  const [productos, analisis, hogar, tarificacion] = RUTA_MENU_HOGAR
  if (analisis !== MENU_PADRE_HOGAR) throw huecoHogar('coherencia de la ruta de menú (Análisis de necesidades)')
  await pulsarSeguro(ctx, await itemMenu(page, productos, 'menú superior', menuMs))
  await ctx.pausa()
  await pulsarSeguro(ctx, await itemMenu(page, analisis, 'submenú de Productos', menuMs))
  await ctx.pausa()
  await pulsarSeguro(ctx, await itemMenu(submenuDe(page, analisis, hogar), hogar, `submenú de ${analisis}`, menuMs))
  await ctx.pausa()
  await pulsarSeguro(ctx, await itemMenu(submenuDe(page, hogar, tarificacion), tarificacion, `submenú de ${hogar}`, menuMs))
  try {
    await page.waitForURL((u) => u.pathname.replace(/\/+$/, '') === RUTA_TARIFICACION_HOGAR, { timeout: menuMs })
  } catch {
    throw huecoHogar(`la ruta ${RUTA_TARIFICACION_HOGAR} tras pulsar «${tarificacion}»`)
  }
  comprobarDestinoHogar(page.url())
  return marcoDelFormulario(page, esperas.iframeMs ?? ESPERA_IFRAME_MS)
}

/** Iframe del formulario: debe aparecer (si no, hueco) y su `src` pasar la lista blanca ANTES de tocar su contenido. */
export async function marcoDelFormulario(page: Page, esperaMs: number): Promise<Frame> {
  const iframe = page.locator(SEL.iframeFormulario).first()
  try {
    await iframe.waitFor({ state: 'attached', timeout: esperaMs })
  } catch {
    throw huecoHogar(`el iframe del formulario (${SEL.iframeFormulario}) en ${RUTA_TARIFICACION_HOGAR}`)
  }
  comprobarSrcIframeHogar(await iframe.getAttribute('src'), page.url())
  const marco = await (await iframe.elementHandle())?.contentFrame()
  if (!marco) throw huecoHogar('el contenido del iframe del formulario (sin marco)')
  comprobarSrcIframeHogar(marco.url() === 'about:blank' ? await iframe.getAttribute('src') : marco.url(), page.url())
  return marco
}

/** Login SSO en dos pasos. El paso 2 usa selectores HIPÓTESIS genéricos (contraseña visible + submit del mismo formulario). */
export type CtxLoginHogar = Pick<ContextoPortal, 'credenciales' | 'pausa' | 'pulsar' | 'exigirSinCaptcha' | 'log'>
/**
 * Paso 1 del SSO (GRABADO): portal → SSO → «Nombre de usuario» + «Iniciar sesión». Devuelve si se quedó en el SSO (la 2.ª
 * pantalla, sin grabar: la resuelve `login` con la hipótesis o el explorador con el login asistido). Reutilizado por ambos.
 */
export async function loginPaso1(page: Page, ctx: CtxLoginHogar, plazos: { carreraMs?: number; usuarioMs?: number; asentamientoMs?: number } = {}): Promise<boolean> {
  const url = urlEntradaPortal('/')
  const r = await page.goto(url, { waitUntil: 'domcontentloaded' })
  if ((r?.status() ?? 0) >= 500) throw new ErrorTarificador('portal', `occident/hogar: el portal respondió ${r?.status()}`, { transitorio: true })
  await ctx.exigirSinCaptcha()
  // El portal redirige al SSO DESPUÉS del `goto` (302 en cadena / JS): carrera entre «la URL pasa al host SSO» y «se ve la
  // cabecera del portal» (sesión abierta). Mirar `page.url()` justo después del goto daba un falso «ya hay sesión».
  const carreraMs = plazos.carreraMs ?? 20_000
  const sso = page.waitForURL((u) => esUrlSso(u.toString()), { timeout: carreraMs, waitUntil: 'commit' }).then(() => 'sso' as const)
  const cabecera = cabeceraPortalVisible(page, carreraMs).then((v) => (v ? ('cabecera' as const) : Promise.reject(new Error('sin cabecera'))))
  const primero = await Promise.any([sso, cabecera]).catch(() => null)
  // La cabecera (`header.MuiAppBar-root`, genérica de MUI) puede verse un instante en la página de entrada del portal ANTES de
  // que el JS redirija al SSO: se da un plazo de asentamiento; si en él la URL pasa al SSO, se sigue por la rama SSO.
  if (primero === 'cabecera') {
    const cambiaASso = await page.waitForURL((u) => esUrlSso(u.toString()), { timeout: plazos.asentamientoMs ?? 3_000, waitUntil: 'commit' }).then(() => true, () => false)
    if (!cambiaASso) return false
  }
  // Sin SSO ni cabecera: página desconocida. NO transitorio (no se reintenta el login con credenciales).
  if (primero === null) throw new ErrorTarificador('portal', `occident/hogar: el portal no llegó ni al SSO ni a la cabecera en ${Math.round(carreraMs / 1000)} s`)
  // La página del SSO aún no se ha comprobado.
  await page.waitForLoadState('domcontentloaded').catch(() => undefined)
  await ctx.exigirSinCaptcha()
  // Dos variantes del SSO: (a) pide el usuario; (b) usuario preseleccionado (solo contraseña u otra pantalla). En (b) no se
  // rellena nada: la 2.ª fase la resuelve el login asistido (explorador) o `login()` (hipótesis).
  const campo = page.locator(SEL.ssoUsuario)
  const hayUsuario = await campo.waitFor({ state: 'visible', timeout: plazos.usuarioMs ?? 10_000 }).then(() => true, () => false)
  // Sin campo de usuario: si se ve la cabecera es un rebote SSO→portal con la sesión viva; si no, 2.ª fase del SSO.
  if (!hayUsuario) return !(await cabeceraPortalVisible(page, 3_000))
  await campo.fill(ctx.credenciales.usuario)
  await ctx.pausa()
  await pulsarSeguro(ctx, page.locator(SEL.ssoEnviarUsuario))
  await page.waitForLoadState('domcontentloaded').catch(() => undefined)
  await ctx.exigirSinCaptcha()
  return true
}

/** ¿Se ve la cabecera del portal (sesión abierta) en `ms`? Solo lee. */
export async function cabeceraPortalVisible(page: Page, ms: number): Promise<boolean> {
  return page.locator(SEL.portalCabecera).first().waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false)
}

/**
 * Tras un `loginPaso1` en false: carrera de `ms` entre «la URL pasa al SSO» y «cabecera visible». Si gana la cabecera se
 * recomprueba a los ~2 s (puede ser fugaz y acabar en el SSO). `'sso'` | `'portal'` | `null` (ninguna). Solo lee.
 */
export async function esperarPortalOSso(page: Page, ms: number): Promise<'sso' | 'portal' | null> {
  if (esUrlSso(page.url())) return 'sso'
  const sso = page.waitForURL((u) => esUrlSso(u.toString()), { timeout: ms, waitUntil: 'commit' }).then(() => 'sso' as const)
  const cabecera = cabeceraPortalVisible(page, ms).then((v) => (v ? ('portal' as const) : Promise.reject(new Error('sin cabecera'))))
  const primero = await Promise.any([sso, cabecera]).catch(() => null)
  if (primero !== 'portal') return primero
  await page.waitForTimeout(2_000)
  if (esUrlSso(page.url())) return 'sso'
  return (await cabeceraPortalVisible(page, 1_000)) ? 'portal' : null
}

export async function login(page: Page, ctx: CtxLoginHogar): Promise<void> {
  let enSso = await loginPaso1(page, ctx)
  if (!enSso && (await esperarPortalOSso(page, 25_000)) === 'sso') enSso = true
  if (enSso) {
    const clave = page.locator(SEL_HIPOTESIS_SSO_CONTRASENA).filter({ visible: true }).first()
    try {
      await clave.waitFor({ state: 'visible', timeout: 15_000 })
    } catch {
      throw huecoHogar(FALTA_CONTRASENA_HOGAR)
    }
    if (!puedeEscribirContrasena(page.url())) throw new ErrorTarificador('portal', 'occident/hogar: la contraseña solo se escribe en https://ssoaut.gco.global')
    await clave.fill(ctx.credenciales.contrasena)
    await ctx.pausa()
    await pulsarSeguro(ctx, page.locator(SEL_HIPOTESIS_SSO_ENVIAR).filter({ visible: true }).first())
    await ctx.exigirSinCaptcha()
  }
  try {
    await page.locator(SEL.portalCabecera).first().waitFor({ state: 'visible', timeout: 25_000 })
  } catch {
    throw new ErrorTarificador('credenciales', `occident/hogar: no se llegó al portal tras el login (${(await page.locator(SEL.ssoMensajeError).count().catch(() => 0)) > 0 ? 'el SSO rechazó los datos' : 'sin cabecera del portal'})`)
  }
  ctx.log('login ok')
}

// ─────────── formulario (paso 1): plan puro + hueco ───────────

export type OperacionHogar = {
  seccion: string
  etiqueta: string
  tipo: 'eleccion' | 'desplegable' | 'texto' | 'modal-texto'
  valor: string
}

const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})

/**
 * Riesgo de hogar (`{ tomador, inmueble, hogar }`, riesgo-oportunidad.ts) → operaciones del paso 1 con las etiquetas VISTAS.
 * Falta un dato obligatorio → `ErrorTarificador('datos')` (nunca se inventa). «Código del agente» y «Fecha de efecto» NO se
 * tocan (vienen rellenos). Persona: solo «Física» (Jurídica sin ver). Pura.
 */
export function planFormularioHogar(riesgo: unknown): OperacionHogar[] {
  const r = obj(riesgo)
  const t = obj(r.tomador)
  const i = obj(r.inmueble)
  const h = obj(r.hogar)
  const nif = txt(t.nif)
  const nac = txt(t.fechaNacimiento) ?? txt(t.fecha_nacimiento)
  const cp = txt(i.codigoPostal) ?? txt(i.codigo_postal)
  const via = txt(i.nombreVia) ?? txt(i.nombre_via)
  const tipo = txt(h.tipoVivienda) ?? txt(h.tipo_vivienda)
  const faltan = [['tomador.nif', nif], ['tomador.fechaNacimiento', nac], ['inmueble.codigoPostal', cp], ['inmueble.nombreVia', via], ['hogar.tipoVivienda', tipo]].filter(([, v]) => !v).map(([k]) => k)
  if (faltan.length) throw new ErrorTarificador('datos', `occident/hogar: faltan datos del riesgo: ${faltan.join(', ')}`)
  const E = ETIQUETAS_HOGAR
  const ops: OperacionHogar[] = [
    { seccion: 'Datos del tomador', etiqueta: E.persona, tipo: 'eleccion', valor: E.personaFisica },
    { seccion: 'Datos del tomador', etiqueta: E.documento, tipo: 'desplegable', valor: E.tipoDocumento },
    { seccion: 'Datos del tomador', etiqueta: E.documento, tipo: 'texto', valor: nif! },
    { seccion: 'Datos del tomador', etiqueta: E.fechaNacimiento, tipo: 'texto', valor: nac! },
    { seccion: 'Tipología', etiqueta: E.tipoVivienda, tipo: 'desplegable', valor: tipo! },
    { seccion: 'Situación', etiqueta: E.busquedaDireccion, tipo: 'eleccion', valor: E.busquedaDireccion },
    { seccion: 'Situación', etiqueta: E.codigoPostalSituacion, tipo: 'modal-texto', valor: cp! },
    { seccion: 'Situación', etiqueta: E.nombreVia, tipo: 'modal-texto', valor: via! },
  ]
  const num = txt(i.numero)
  if (num) ops.push({ seccion: 'Situación', etiqueta: E.numero, tipo: 'modal-texto', valor: num })
  return ops
}

/** HUECO: rellenar el paso 1 (desplegables sin mecánica grabada y modal «Datos de la situación»). Valida el riesgo antes. */
export function rellenarDatosRiesgoHogar(riesgo: unknown): never {
  const plan = planFormularioHogar(riesgo)
  const sinMecanica = plan.filter((o) => o.tipo === 'desplegable' || o.tipo === 'modal-texto').length
  throw huecoHogar(`${FALTA_FORMULARIO_HOGAR} (${plan.length} operaciones previstas, ${sinMecanica} sin mecánica de desplegable/modal grabada)`)
}

/** Compatibilidad con el hueco original (sin riesgo). */
export function rellenarYLeerPrimaHogar(): never {
  throw huecoHogar(FALTA_FORMULARIO_HOGAR)
}

// ─────────── paso 2 «Proyecto» (VISTO en captura; selectores = HIPÓTESIS) ───────────

/**
 * Avance CONFIRMADO por Alberto (14/10): «Datos del riesgo» → «Proyecto» es la flecha «siguiente ›» (2ª de los 4 iconos de la
 * barra superior derecha: ‹ anterior, › siguiente, imprimir, guardar). El selector concreto sin DOM: por rol/title «Siguiente».
 * Fail-closed si tras pulsar no aparece «Opciones de cotización». No necesita permiso de avance del explorador (no es «Aceptar»).
 */
export async function avanzarAPaso2(marco: Frame, ctx: CtxMenuHogar, esperaMs = 20_000): Promise<void> {
  const siguiente = marco.getByRole('button', { name: etiquetaExactaOccident('Siguiente') }).or(marco.getByTitle(etiquetaExactaOccident('Siguiente'))).filter({ visible: true }).first()
  try {
    await siguiente.waitFor({ state: 'visible', timeout: 5_000 })
  } catch {
    throw huecoHogar('el icono «Siguiente ›» de la barra superior derecha que avanza al paso 2 (sin DOM)')
  }
  await pulsarSeguro(ctx, siguiente)
  try {
    await marco.getByText(etiquetaExactaOccident(TITULO_PASO2_HOGAR)).first().waitFor({ state: 'visible', timeout: esperaMs })
  } catch {
    throw huecoHogar(`el paso 2 «${TITULO_PASO2_HOGAR}» tras avanzar`)
  }
}

export type TarjetaPrima = { producto: string; primaAnualEur: number }

/** Primer importe español «246,59 €» de un texto (decimales obligatorios: «Solicitud automática» no es importe). Pura. */
export function primaDeTexto(texto: string | null | undefined): number | null {
  const m = /(\d{1,3}(?:\.\d{3})*,\d{2})\s*€/.exec(texto ?? '')
  return m ? importeEs(m[1]!) : null
}

/** Tarjetas de producto desde (nombre, texto de la tarjeta). Solo nombres EXACTOS conocidos; sin importe legible → falla. Pura. */
export function tarjetasDesdeTextos(textos: ReadonlyArray<{ nombre: string; texto: string }>): TarjetaPrima[] {
  const out: TarjetaPrima[] = []
  for (const nombre of PRODUCTOS_HOGAR) {
    const t = textos.find((x) => etiquetaExactaOccident(nombre).test(x.nombre))
    if (!t) continue
    const prima = primaDeTexto(t.texto)
    if (prima === null) throw new ErrorTarificador('portal', `occident/hogar: la tarjeta «${nombre}» no trae una prima legible`)
    out.push({ producto: nombre, primaAnualEur: prima })
  }
  if (out.length === 0) throw new ErrorTarificador('portal', 'occident/hogar: no se leyó ninguna tarjeta de producto del paso 2')
  return out
}

/** Lee las tarjetas del paso 2 (texto del contenedor más cercano de cada nombre: HIPÓTESIS de DOM). */
export async function leerTarjetasPrima(marco: Frame): Promise<TarjetaPrima[]> {
  const textos: { nombre: string; texto: string }[] = []
  for (const nombre of PRODUCTOS_HOGAR) {
    const n = marco.getByText(etiquetaExactaOccident(nombre)).filter({ visible: true })
    if ((await n.count()) !== 1) continue
    const texto = await n.first().locator('xpath=ancestor::*[contains(normalize-space(.),"€")][1]').innerText().catch(() => '')
    textos.push({ nombre, texto })
  }
  return tarjetasDesdeTextos(textos)
}

export function ofertasDesdeTarjetas(tarjetas: readonly TarjetaPrima[], extra: { referencia: string | null; pdf: OfertaNormalizada['pdf']; descuentos: readonly DescuentoAplicado[] }): OfertaNormalizada[] {
  const aviso = extra.descuentos.length ? `Descuentos comerciales aplicados al máximo: ${extra.descuentos.map((d) => `${d.nombre} ${d.texto}`).join('; ')}.` : 'No se aplicó ningún descuento comercial.'
  return tarjetas.map((t) => ({
    compania: 'occident',
    producto: t.producto,
    primaAnualEur: t.primaAnualEur,
    primaNetaEur: null,
    fraccionamiento: 'anual' as const,
    importeReciboEur: t.primaAnualEur,
    coberturas: [],
    franquicias: [],
    validaHasta: null,
    referenciaPortal: extra.referencia,
    pdf: extra.pdf,
    avisos: [aviso, 'Prima anual de la tarjeta del paso 2 (forma de pago «Anual»).'],
  }))
}

// ─────────── descuentos comerciales: SIEMPRE al máximo, salvo ABC (Alberto, 14/10/2026) ───────────

/** Únicas secciones del modal «Ajustes comerciales» donde se aplican descuentos (por nombre exacto). Lo demás se ignora. */
export const SECCIONES_DESCUENTO_PERMITIDAS = ['Descuentos cliente', 'Descuentos por perfil/actividad'] as const

/** «Descuentos ABC» / «Ajuste contra comisión»: rebajan la comisión de la correduría. NUNCA se tocan. */
export function esDescuentoAbc(texto: string | null | undefined): boolean {
  return typeof texto === 'string' && /\babc\b|ajuste\s+contra\s+comision|contra\s+comision/i.test(plano(texto))
}

export function seccionDescuentoPermitida(nombre: string): boolean {
  return !esDescuentoAbc(nombre) && SECCIONES_DESCUENTO_PERMITIDAS.some((s) => etiquetaExactaOccident(s).test(nombre))
}

/** Porcentaje de descuento de una opción («-15,00%», «15 %», «Descuento 12,5%») en valor absoluto, o `null`. Pura. */
export function porcentajeDeOpcion(texto: string): number | null {
  const m = /(-?\d+(?:,\d+)?)\s*%/.exec(texto)
  const n = m ? importeEs(m[1]!) : null
  return n === null ? null : Math.abs(n)
}

/**
 * Opción de MAYOR descuento. Ignora opciones sin porcentaje (placeholders) y toda opción de ABC. Sin ninguna válida →
 * `null` (el llamante falla cerrado: no se aplica nada a ciegas). Empate: la primera. Pura.
 */
export function elegirMaximoDescuento(opciones: readonly string[]): { indice: number; texto: string; porcentaje: number } | null {
  let mejor: { indice: number; texto: string; porcentaje: number } | null = null
  opciones.forEach((texto, indice) => {
    if (esDescuentoAbc(texto)) return
    const porcentaje = porcentajeDeOpcion(texto)
    if (porcentaje === null) return
    if (!mejor || porcentaje > mejor.porcentaje) mejor = { indice, texto: texto.trim(), porcentaje }
  })
  return mejor
}

export type DescuentoAplicado = { seccion: string; nombre: string; texto: string }

/**
 * Modal «Ajustes comerciales» (abierto con «Modificar» de SU caja, no la de «Datos principales del riesgo»): por cada fila
 * de las secciones permitidas, lápiz → selector → opción de máximo descuento. HIPÓTESIS de DOM: filas `tr`, lápiz con nombre
 * accesible «Editar», opciones `role=option`. La PAPELERA no se referencia (y `pulsarSeguro` la bloquea). El botón de
 * guardar/aplicar del selector NO está visto → hueco tras elegir.
 */
export async function aplicarDescuentosMaximos(marco: Frame, ctx: CtxMenuHogar): Promise<DescuentoAplicado[]> {
  const aplicados: DescuentoAplicado[] = []
  for (const seccion of SECCIONES_DESCUENTO_PERMITIDAS) {
    if (!seccionDescuentoPermitida(seccion)) throw huecoHogar(`sección de descuentos no permitida (${seccion})`)
    const cabecera = marco.getByText(etiquetaExactaOccident(seccion)).filter({ visible: true }).first()
    if ((await cabecera.count()) === 0) throw huecoHogar(`la sección «${seccion}» del modal de ajustes comerciales`)
    const filas = cabecera.locator('xpath=following::table[1]//tr[td]')
    for (let k = 0; k < (await filas.count()); k++) {
      const fila = filas.nth(k)
      const nombre = ((await fila.locator('td').first().innerText()) ?? '').trim()
      if (esDescuentoAbc(nombre)) continue
      await pulsarSeguro(ctx, fila.getByRole('button', { name: etiquetaExactaOccident('Editar') }))
      const opciones = marco.getByRole('option').filter({ visible: true })
      const textos = await opciones.allInnerTexts()
      const mejor = elegirMaximoDescuento(textos)
      if (!mejor) throw huecoHogar(`opciones de descuento legibles para «${nombre}» (no se aplica nada a ciegas)`)
      await pulsarSeguro(ctx, opciones.nth(mejor.indice))
      aplicados.push({ seccion, nombre, texto: mejor.texto })
    }
  }
  if (aplicados.length) throw huecoHogar('el botón de guardar/aplicar de los ajustes comerciales (selector desplegado sin ver)')
  return aplicados
}

// ─────────── «Imprimir» = guardar proyecto + descargar PDF (paso final) ───────────

/**
 * Pulsa «Imprimir» (icono de la cabecera, HIPÓTESIS: nombre accesible «Imprimir») y captura el PDF en todo el contexto
 * (`esperarPdf`). El disquete de guardar NO se usa. Referencia de proyecto: selector desconocido → `null` (hueco, no se
 * adivina). Sin PDF → error `portal`.
 */
export async function imprimirProyecto(page: Page, marco: Frame, ctx: ContextoPortal, nombre: string): Promise<{ pdf: NonNullable<OfertaNormalizada['pdf']>; referencia: string | null }> {
  const boton = marco.getByRole('button', { name: etiquetaExactaOccident(BOTON_IMPRIMIR_HOGAR) }).or(marco.getByTitle(etiquetaExactaOccident(BOTON_IMPRIMIR_HOGAR))).filter({ visible: true })
  if ((await boton.count()) !== 1) throw huecoHogar('el botón «Imprimir» de la cabecera (no resuelve a un único elemento)')
  const espera = esperarPdf(page, TOPE_PDF_MS)
  try {
    await pulsarSeguro(ctx, boton.first())
  } catch (e) {
    espera.cancelar()
    throw e
  }
  const r = await espera.promesa
  if (!r) throw new ErrorTarificador('portal', `occident/hogar: «Imprimir» no produjo ningún PDF en ${TOPE_PDF_MS / 1000} s`)
  ctx.log(`pdf: proyecto capturado por ${r.origen} (${r.bytes.length} bytes)`)
  return { pdf: ctx.adjuntarPdf(nombre, r.bytes), referencia: null }
}

// ─────────── adaptador (tipo propio: aún no registrable) ───────────

/** Tipo propio: `RamoRpa` aún no tiene 'hogar' ni hay validador de riesgo; no es un `AdaptadorRegistrado`. */
export type AdaptadorOccidentHogar = {
  readonly compania: 'occident'
  readonly ramo: 'hogar'
  readonly credencial: string
  readonly version: string
  tarificar(page: Page, riesgo: unknown, ctx: ContextoPortal): Promise<never>
}

export const occidentHogar: AdaptadorOccidentHogar = {
  compania: 'occident',
  ramo: 'hogar',
  credencial: 'OCCIDENT_PORTAL',
  version: '0.1.0',
  async tarificar(page, riesgo, ctx) {
    await ctx.paso('login', async () => {
      await login(page, ctx)
      await ctx.trasLogin()
    })
    await ctx.paso('navegacion', () => abrirTarificacionHogar(page, ctx))
    // Orden previsto tras el hueco: avanzarAPaso2 → (Ajustes comerciales) aplicarDescuentosMaximos → «Recalcular» →
    // leerTarjetasPrima → imprimirProyecto → ofertasDesdeTarjetas. Nada de eso se alcanza hasta grabar el paso 1.
    return ctx.paso('formulario', async () => rellenarDatosRiesgoHogar(riesgo))
  },
}

// ─────────── canónico de hogar → formulario de Occident (HIPÓTESIS: la página nueva no está capturada) ───────────
// Fuente de las claves: `riesgo-oportunidad.ts` (`{ tomador, inmueble, hogar }`) y CONOCIMIENTO-PORTALES § Hogar.
// Ninguna etiqueta del portal se conoce (`etiquetaPortal: null`): no se rellena nada con esto, solo documenta el plan.
export type CampoHogarMapeado = {
  canonico: string
  uso: 'seguro' | 'probable' | 'dudoso'
  etiquetaPortal: string | null
  nota: string
}

export const CAMPOS_OCCIDENT_HOGAR: readonly CampoHogarMapeado[] = [
  { canonico: 'tomador.nif', uso: 'probable', etiquetaPortal: null, nota: 'tomador; el portal puede pedir tipo de documento aparte' },
  { canonico: 'tomador.fecha_nacimiento', uso: 'probable', etiquetaPortal: null, nota: '' },
  { canonico: 'inmueble.codigo_postal', uso: 'seguro', etiquetaPortal: null, nota: 'puede disparar autocompletado: reinventariar tras rellenar' },
  { canonico: 'inmueble.provincia', uso: 'probable', etiquetaPortal: null, nota: '' },
  { canonico: 'inmueble.municipio', uso: 'probable', etiquetaPortal: null, nota: 'población ambigua → elección explícita, nunca la IA' },
  { canonico: 'inmueble.tipo_via', uso: 'dudoso', etiquetaPortal: null, nota: '' },
  { canonico: 'inmueble.nombre_via', uso: 'probable', etiquetaPortal: null, nota: '' },
  { canonico: 'inmueble.numero', uso: 'probable', etiquetaPortal: null, nota: '' },
  { canonico: 'inmueble.planta', uso: 'dudoso', etiquetaPortal: null, nota: '' },
  { canonico: 'inmueble.superficie_m2', uso: 'seguro', etiquetaPortal: null, nota: 'null = no se sabe (nunca 0 por defecto)' },
  { canonico: 'inmueble.anio_construccion', uso: 'seguro', etiquetaPortal: null, nota: 'idem' },
  { canonico: 'hogar.uso', uso: 'seguro', etiquetaPortal: null, nota: 'explícito, sin valor por defecto (habitual/secundaria/alquiler/turístico)' },
  { canonico: 'hogar.regimen', uso: 'seguro', etiquetaPortal: null, nota: 'explícito (propietario/inquilino)' },
  { canonico: 'hogar.tipo_vivienda', uso: 'probable', etiquetaPortal: null, nota: '' },
  { canonico: 'hogar.capital_continente', uso: 'probable', etiquetaPortal: null, nota: '' },
  { canonico: 'hogar.capital_contenido', uso: 'probable', etiquetaPortal: null, nota: '' },
  { canonico: 'efecto.fecha', uso: 'probable', etiquetaPortal: null, nota: 'fecha de efecto' },
]
