// Generali · portal del corredor · TURISMOS (Ramo UV) — v0.1.1 (18/10/2026).
// Registrado SOLO con `GENERALI_AUTO_ACTIVO` (abajo, ENCENDIDO el 18/10/2026 por Alberto) y, además, la puerta de BD de siempre: la
// fila `seguros.companias_integracion` generali/auto activa y `rpa_autorizada` (NO se activa desde aquí).
//
// Fuente: 6 capturas de Alberto (Drive «BOT compañías › Generali», 18/10/2026); mapa en docs/generali-mapa-capturas.md.
//   1 login (access.generali.es) → 2 «Seleccionar mediador» (cascada; se elige el mediador de la correduría y «ACEPTAR») →
//   3 menú NEGOCIO › EMISIÓN › CONTRATACIÓN › AUTOMÓVILES › TURISMOS (RAMO UV) → 4 «Valoración Riesgo › Datos de Valoración»
//   (General: Mediador, Flota, F.Efectos, canal y subcanal; botón «Vehículo») → 5 «Selector de vehículos» (tipo, subtipo, marca)
//   → 6 «Datos de Valoración» (Identificación del vehículo + Roles).
// SIN CAPTURA (el bot llega hasta ahí y PARA con `ErrorMapaIncompletoGenerali` + inventario de estructura + HTML redactado, que
// es el «modo exploración» del worker): lo que sale tras elegir la marca (modelo, versión y cómo se confirma), el campo de
// verificación de la matrícula, el resto de «Datos de Valoración» (tomador, conductor, antecedentes) y «Garantías y
// Resultados» (el PRECIO).
//
// Reglas de Alberto (18/10/2026): matrícula «1234*BCD» también en su verificación (`matriculaGenerali`); el vehículo NO se
// busca por matrícula: llega confirmado de Allianz/Mapfre de la misma oportunidad (asegura lo inyecta) y se casa en los
// desplegables EXACTO → por palabra entera → uno solo (`elegirOpcionCatalogo`); 0 o varios = atasco con las opciones. Mediador
// `MEDIADOR_GENERALI`; «Canal entrada», «Subcanal entrada» y «Flota» se dejan como vienen. Solo Turismos (moto, después).
// Sesión: login con `CRED_GENERALI_MEDIADORES_USER/_PASS`; si Generali pide el SMS (cada 30 días), `ctx.trasLogin` para con
// `requiere_humano` (verificacion.ts). El relevo del código por Telegram NO está hecho (ver docs/tarificador/CONOCIMIENTO-PORTALES.md).
//
// 🚨 SEGURIDAD. Este fichero no pulsa nada del menú ni del mediador: lo hacen `ctx.entrarTurismosGenerali` y
// `ctx.confirmarMediadorGenerali` (guard.ts). Aquí solo `ctx.pulsar` («Iniciar sesión», «Vehículo») y campos tras `comprobarCampo`.
// Nunca emitir, contratar, grabar póliza ni pagar. Datos personales (matrícula, credenciales) solo en su campo: nunca en mensajes.

import type { Frame, Locator, Page } from 'playwright'
import {
  conAntecedentesFavorables,
  supuestosAuto,
  textoSupuestos,
  type CandidatoVersion,
  type FormularioAuto,
  type ResultadoAdaptador,
} from '@central/module-tarificacion'
import type { ContextoPortal } from '../../adaptador.ts'
import { ErrorTarificador } from '../../errores.ts'
import { comprobarCampo, ErrorEleccionVersion } from '../allianz/auto.ts'
import { campoConRespaldo, type ContextoFormador } from '../../formador.ts'
import {
  AVISO_MATRICULA_PROVINCIAL,
  AVISO_SIMILITUD_GENERALI,
  ETIQUETAS_VALORACION,
  MEDIADOR_GENERALI,
  buscadoEnNivel,
  elegirGarajeGenerali,
  elegirOpcionCatalogo,
  elegirUsoGenerali,
  esEtiquetaVerificacionMatricula,
  esOpcionVaciaCatalogo,
  fechaGenerali,
  matriculaGenerali,
  mensajeAtascoCatalogo,
  normalizarCatalogo,
  opcionMediadorGenerali,
  rolesGenerali,
  urlConMediador,
  vehiculoBuscadoGenerali,
  type VehiculoBuscado,
} from './reglas.ts'

/**
 * Flag de registro de Generali Turismos. ENCENDIDO el 18/10/2026 (Alberto lo pide). Encendido NO basta para que corra: sin la
 * fila `seguros.companias_integracion` generali/auto activa y `rpa_autorizada`, asegura no reclama ningún trabajo de Generali
 * (`reclamarSiguiente`) y el barrido cancela los pendientes («modo_no_automatizable»); el worker solo ejecuta el JOB_ID que asegura
 * le asigna. Apagado, un trabajo de generali/auto cae como `datos` («sin adaptador en esta imagen») sin abrir el navegador.
 */
export const GENERALI_AUTO_ACTIVO = true

/** 0.1.1 (18/10/2026): flag encendido; «conductor habitual: el tomador (supuesto)» común (`supuestoConductorTomador`). */
export const VERSION_GENERALI_AUTO = '0.1.1'

export const URL_INICIO_GENERALI = 'https://www.generali.es/arq_genernetPortalFormWeb/CorredorInicio.po'
export const ORIGEN_ACCESO_GENERALI = 'https://access.generali.es'

/** Hueco de mapa (pantalla sin captura): NO transitorio y pide el inventario de estructura (modo exploración del worker). */
export class ErrorMapaIncompletoGenerali extends ErrorTarificador {
  readonly pideInventarioDom: boolean
  constructor(que: string, pideInventarioDom = true) {
    super('portal', `generali/auto: mapa incompleto: faltan ${que}`)
    this.name = 'ErrorMapaIncompletoGenerali'
    this.pideInventarioDom = pideInventarioDom
  }
}

const ESPERA_PANTALLA_MS = 20_000
type Raiz = Page | Frame

// ───────────────────────── ayudas de lectura (solo leen) ─────────────────────────

/** «Aprende» de la capa común solo lo que funcionó: el `confirmar` del respaldo se llama tras escribir/elegir con éxito. */
const CONFIRMAR = new WeakMap<Locator, () => Promise<void>>()
const confirmarUso = async (l: Locator) => { await CONFIRMAR.get(l)?.().catch(() => undefined) }

/**
 * El control `tag` de la etiqueta EXACTA `etiqueta`: `getByLabel` (uno visible) → el primer control que la sigue en el DOM →
 * CAPA COMÚN (`campoConRespaldo` de formador.ts: lo aprendido y la IA, validado). `null` si nadie lo resuelve (el adaptador
 * lanza su hueco). Sin `formador` (login: campos de credenciales) no hay respaldo.
 */
async function controlJuntoA(raiz: Raiz, etiqueta: string, tag: 'input' | 'select', formador?: ContextoFormador): Promise<Locator | null> {
  const porLabel = raiz.getByLabel(etiqueta, { exact: true }).filter({ visible: true })
  if ((await porLabel.count().catch(() => 0)) === 1) return porLabel.first()
  const lit = etiqueta.replace(/"/g, '')
  const tipo = tag === 'input' ? "input[not(@type='hidden') and not(@type='checkbox') and not(@type='button') and not(@type='submit')]" : 'select'
  const sel = `xpath=//*[normalize-space(text())="${lit}"]/following::${tipo}[1]`
  const cand = raiz.locator(sel).filter({ visible: true })
  if ((await cand.count().catch(() => 0)) === 1) return cand.first()
  if (!formador) return null
  const page = 'mainFrame' in raiz ? raiz : raiz.page()
  const r = await campoConRespaldo(raiz, `${sel}[not(ancestor-or-self::*[@hidden])]`, { page, formador, etiqueta, descripcion: `Control «${etiqueta}» del formulario de Turismos de Generali` }).catch(() => null)
  if (!r) return null
  CONFIRMAR.set(r.campo, r.confirmar)
  return r.campo
}

async function opcionesSelect(sel: Locator): Promise<{ valor: string; texto: string }[]> {
  return sel.evaluate((el) => Array.from((el as HTMLSelectElement).options).map((o) => ({ valor: o.value ?? '', texto: (o.textContent ?? '').trim() })))
}

async function esSelectNativo(l: Locator): Promise<boolean> {
  return l.evaluate((el) => el.tagName === 'SELECT').catch(() => false)
}

/** El marco (o la página) donde aparece el texto EXACTO `texto` visible; espera hasta `ms`. */
async function marcoConTexto(page: Page, texto: string, ms = ESPERA_PANTALLA_MS): Promise<Raiz | null> {
  const fin = Date.now() + ms
  for (;;) {
    for (const f of page.frames()) {
      if (f.isDetached()) continue
      if ((await f.getByText(texto, { exact: true }).filter({ visible: true }).count().catch(() => 0)) > 0) return f === page.mainFrame() ? page : f
    }
    if (Date.now() >= fin) return null
    await page.waitForTimeout(400)
  }
}

/** Escribe en un campo de texto: guard del campo → `fill` → salir del campo (el portal valida al salir). */
async function escribir(campo: Locator, valor: string, ctx: ContextoPortal): Promise<void> {
  await ctx.pausaAccion()
  await comprobarCampo(campo)
  await campo.fill(valor)
  await campo.blur().catch(() => undefined)
  await confirmarUso(campo)
}

/** Elige la opción nº `indice` de un `<select>` nativo (guard del campo antes). */
async function elegirIndice(sel: Locator, indice: number, ctx: ContextoPortal): Promise<void> {
  await ctx.pausaAccion()
  await comprobarCampo(sel)
  await sel.selectOption({ index: indice })
  await confirmarUso(sel)
}

// ───────────────────────── 1 · login ─────────────────────────

/** Login en access.generali.es (captura 1) si hace falta. El SMS de 30 días lo detecta `ctx.trasLogin` (requiere_humano). */
export async function loginGenerali(page: Page, ctx: ContextoPortal): Promise<void> {
  await page.goto(URL_INICIO_GENERALI, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined)
  await ctx.exigirSinCaptcha()
  const enAcceso = page.url().startsWith(ORIGEN_ACCESO_GENERALI)
  const password = page.locator('input[type="password"]').filter({ visible: true })
  if (enAcceso || (await password.count()) > 0) {
    if (ctx.sesionManual) throw new ErrorTarificador('portal', 'generali: la sesión guardada no sirve (el portal pide login)')
    const usuario = await controlJuntoA(page, 'Nombre de usuario', 'input')
    const clave = (await password.count()) === 1 ? password.first() : null
    if (!usuario || !clave) throw new ErrorMapaIncompletoGenerali('los campos «Nombre de usuario» y «Contraseña» del acceso (captura 1)')
    await escribir(usuario, ctx.credenciales.usuario, ctx)
    await escribir(clave, ctx.credenciales.contrasena, ctx)
    const boton = page.getByRole('button', { name: 'Iniciar sesión', exact: true }).filter({ visible: true })
    if ((await boton.count()) !== 1) throw new ErrorMapaIncompletoGenerali('el botón «Iniciar sesión» del acceso (captura 1)')
    await ctx.pulsar(boton.first())
    await page.waitForURL((u) => !u.toString().startsWith(ORIGEN_ACCESO_GENERALI), { timeout: 30_000 }).catch(() => undefined)
    await page.waitForLoadState('domcontentloaded').catch(() => undefined)
  }
  await ctx.trasLogin()
  await ctx.exigirSinCaptcha()
}

// ───────────────────────── 2 · mediador ─────────────────────────

/**
 * «Seleccionar mediador» (captura 2): Territorial/Sucursal/Centro/Comercial vienen puestos; se elige en «Mediador» el de la
 * correduría (`MEDIADOR_GENERALI`, exacto) y «ACEPTAR» por el guard. Si el portal ya entra con ese mediador, nada; con otro, PARA.
 */
export async function elegirMediadorGenerali(page: Page, ctx: ContextoPortal): Promise<void> {
  const fin = Date.now() + ESPERA_PANTALLA_MS
  for (;;) {
    const conMediador = urlConMediador(page.url())
    if (conMediador === true) return
    if (conMediador === false) throw new ErrorMapaIncompletoGenerali('el portal entró con OTRO mediador (no se cambia a ciegas)', false)
    if (/CorredorInicio\.po/.test(page.url())) break
    if (Date.now() >= fin) throw new ErrorMapaIncompletoGenerali('la pantalla «Seleccionar mediador» o el portal del corredor tras el login')
    await page.waitForTimeout(500)
  }
  if (!ctx.confirmarMediadorGenerali) throw new ErrorMapaIncompletoGenerali('la puerta guardada del mediador en el contexto del runner', false)
  const sel = await controlJuntoA(page, 'Mediador', 'select', ctx.formador)
  if (!sel || !(await esSelectNativo(sel))) throw new ErrorMapaIncompletoGenerali('el desplegable «Mediador» (captura 2)')
  const r = opcionMediadorGenerali(await opcionesSelect(sel), MEDIADOR_GENERALI)
  // Las opciones llevan nombres de mediadores: solo se cuentan, nunca se copian al mensaje.
  if (r.tipo !== 'unica') throw new ErrorMapaIncompletoGenerali(`el mediador de la correduría en «Mediador» (${r.tipo === 'varias' ? `${r.n} opciones casan` : 'no aparece'}; no se elige otro)`)
  await elegirIndice(sel, r.indice, ctx)
  await page.waitForTimeout(500)
  await ctx.confirmarMediadorGenerali(sel)
  await page.waitForURL((u) => urlConMediador(u.toString()) === true, { timeout: ESPERA_PANTALLA_MS }).catch(() => undefined)
  if (urlConMediador(page.url()) !== true) throw new ErrorMapaIncompletoGenerali('la llegada al portal del corredor con el mediador elegido')
}

// ───────────────────────── 4-5 · General + selector de vehículos ─────────────────────────

/** «Mediador» del bloque General (captura 4): viene «00000»; si está vacío o a ceros se teclea el de la correduría. Otro → PARA. */
async function mediadorDelFormulario(marco: Raiz, ctx: ContextoPortal): Promise<void> {
  const campo = await controlJuntoA(marco, 'Mediador', 'input', ctx.formador)
  if (!campo) throw new ErrorMapaIncompletoGenerali('el campo «Mediador» del bloque General (captura 4)')
  const actual = (await campo.inputValue().catch(() => '')).trim()
  if (actual === MEDIADOR_GENERALI) return
  if (actual !== '' && !/^0+$/.test(actual)) throw new ErrorMapaIncompletoGenerali('el «Mediador» del formulario viene con otro código (no se cambia a ciegas)', false)
  await escribir(campo, MEDIADOR_GENERALI, ctx)
}

/** Un nivel del selector (marca/modelo/versión) en un `<select>` nativo, casado por la regla de Alberto. Devuelve si fue por similitud. */
async function elegirNivel(sel: Locator, nivel: 'marca' | 'modelo' | 'version', v: VehiculoBuscado, form: Pick<FormularioAuto, 'eleccionVersion'>, ctx: ContextoPortal): Promise<boolean> {
  const opciones = (await opcionesSelect(sel)).map((o) => o.texto)
  // Versión: la elección de una PERSONA (bandeja) manda; texto EXACTO de la opción.
  const persona = nivel === 'version' ? form.eleccionVersion?.etiqueta?.trim() : undefined
  if (persona) {
    const ix = opciones.flatMap((o, i) => (normalizarCatalogo(o) === normalizarCatalogo(persona) ? [i] : []))
    if (ix.length !== 1) throw new ErrorMapaIncompletoGenerali(`la versión elegida por la persona en la lista de Generali (${ix.length} coincidencias)`)
    await elegirIndice(sel, ix[0]!, ctx)
    return false
  }
  const b = buscadoEnNivel(v, nivel)
  const validas = opciones.filter((o) => !esOpcionVaciaCatalogo(o))
  if (!b) {
    // Sin versión confirmada: una sola versión → esa; varias → elige una persona (bandeja), nunca la primera.
    if (validas.length === 1) {
      await elegirIndice(sel, opciones.indexOf(validas[0]!), ctx)
      return false
    }
    throw new ErrorEleccionVersion(validas.map((o): CandidatoVersion => ({ etiqueta: o, codigo: null })))
  }
  const e = elegirOpcionCatalogo(opciones, b.texto, b.modo)
  if (e.tipo !== 'unica') {
    if (nivel === 'version') throw new ErrorEleccionVersion((e.tipo === 'varias' ? e.indices.map((i) => opciones[i]!) : validas).map((o): CandidatoVersion => ({ etiqueta: o, codigo: null })))
    throw new ErrorMapaIncompletoGenerali(mensajeAtascoCatalogo(nivel, b.texto, opciones, e))
  }
  await elegirIndice(sel, e.indice, ctx)
  return e.porSimilitud
}

/** Un `<select>` nativo visible cuya etiqueta casa con `re` (selector de vehículos, niveles sin captura). */
async function selectPorEtiqueta(raiz: Raiz, re: RegExp): Promise<Locator | null> {
  const etiquetas = raiz.getByText(re).filter({ visible: true })
  const n = await etiquetas.count().catch(() => 0)
  const hallados: Locator[] = []
  for (let i = 0; i < n; i++) {
    const s = etiquetas.nth(i).locator('xpath=following::select[1]')
    if ((await s.count().catch(() => 0)) === 1 && (await s.isVisible().catch(() => false))) hallados.push(s)
  }
  return hallados.length === 1 ? hallados[0]! : null
}

/**
 * «Vehículo» → «Selector de vehículos» (captura 5): tipo «Turismo» y subtipo «Turismos» vienen marcados; la marca, en «Todas
 * las marcas». Modelo y versión: SIN captura; se buscan como desplegables etiquetados «Modelo»/«Versión» y, si no están así,
 * PARA con inventario. Devuelve si alguna elección fue por similitud.
 */
export async function seleccionarVehiculoGenerali(page: Page, marco: Raiz, form: FormularioAuto, ctx: ContextoPortal): Promise<boolean> {
  const v = vehiculoBuscadoGenerali(form)
  if (!v) throw new ErrorTarificador('datos', 'generali/auto: falta el vehículo confirmado por Allianz o Mapfre (Generali no busca por matrícula; asegura lo pone desde la oportunidad)')
  const boton = marco.getByRole('button', { name: 'Vehículo', exact: true }).filter({ visible: true })
  if ((await boton.count()) !== 1) throw new ErrorMapaIncompletoGenerali('el botón «Vehículo» de «Características del vehículo» (captura 4)')
  await ctx.pulsar(boton.first())
  const selector = await marcoConTexto(page, 'Selector de vehículos')
  if (!selector) throw new ErrorMapaIncompletoGenerali('la pantalla «Selector de vehículos» tras pulsar «Vehículo» (captura 5)')
  const marcas = await controlJuntoA(selector, 'Todas las marcas', 'select', ctx.formador)
  if (!marcas || !(await esSelectNativo(marcas))) throw new ErrorMapaIncompletoGenerali('el desplegable «Todas las marcas» del selector (captura 5; ¿no es un <select> nativo?)')
  let similitud = await elegirNivel(marcas, 'marca', v, form, ctx)
  await page.waitForTimeout(1_500)
  const modelo = await selectPorEtiqueta(selector, /^\s*modelos?\s*:?\s*$/i)
  if (!modelo) throw new ErrorMapaIncompletoGenerali('la pantalla del selector tras elegir la marca (modelo y versión): SIN CAPTURA')
  similitud = (await elegirNivel(modelo, 'modelo', v, form, ctx)) || similitud
  await page.waitForTimeout(1_500)
  const version = await selectPorEtiqueta(selector, /^\s*versi[oó]n(es)?\s*:?\s*$/i)
  if (!version) throw new ErrorMapaIncompletoGenerali('el desplegable de versión del selector tras elegir el modelo: SIN CAPTURA')
  similitud = (await elegirNivel(version, 'version', v, form, ctx)) || similitud
  const valoracion = await marcoConTexto(page, 'Identificación del vehículo', 10_000)
  if (!valoracion) throw new ErrorMapaIncompletoGenerali('cómo se confirma el vehículo elegido en el selector (sin captura del paso que lleva a «Identificación del vehículo»)')
  return similitud
}

// ───────────────────────── 6 · Datos de Valoración ─────────────────────────

/** Rellena «Identificación del vehículo» y comprueba «Roles» (captura 6). Devuelve las etiquetas de lo SUPUESTO. */
export async function rellenarValoracionGenerali(page: Page, form: FormularioAuto, ctx: ContextoPortal, hoy: Date): Promise<string[]> {
  const marco = await marcoConTexto(page, 'Identificación del vehículo')
  if (!marco) throw new ErrorMapaIncompletoGenerali('la sección «Identificación del vehículo» (captura 6)')
  const supuestos: string[] = []
  const m = matriculaGenerali(form.matricula)
  if (!m.ok) throw new ErrorTarificador('datos', m.motivo)
  if (m.formato === 'provincial') supuestos.push(AVISO_MATRICULA_PROVINCIAL)
  const campoMat = await controlJuntoA(marco, ETIQUETAS_VALORACION.matricula, 'input', ctx.formador)
  if (!campoMat) throw new ErrorMapaIncompletoGenerali(`el campo «${ETIQUETAS_VALORACION.matricula}» (captura 6)`)
  await escribir(campoMat, m.valor, ctx)
  // Verificación (Alberto): un segundo campo que se rellena IGUAL. No sale en la captura 6: se busca por su etiqueta.
  const textos = marco.getByText(/matr[ií]cula/i).filter({ visible: true })
  const verif: Locator[] = []
  for (let i = 0; i < (await textos.count()); i++) {
    const t = (await textos.nth(i).innerText().catch(() => '')).trim()
    if (esEtiquetaVerificacionMatricula(t)) verif.push(textos.nth(i).locator("xpath=following::input[not(@type='hidden')][1]"))
  }
  if (verif.length !== 1) throw new ErrorMapaIncompletoGenerali(`el campo de VERIFICACIÓN de la matrícula (${verif.length} candidatos; no sale en la captura 6)`)
  await escribir(verif[0]!, m.valor, ctx)

  const uso = await controlJuntoA(marco, ETIQUETAS_VALORACION.uso, 'select', ctx.formador)
  if (!uso) throw new ErrorMapaIncompletoGenerali(`el desplegable «${ETIQUETAS_VALORACION.uso}» (captura 6)`)
  const opUso = (await opcionesSelect(uso)).map((o) => o.texto)
  const eUso = elegirUsoGenerali(opUso, form.usoVehiculo)
  if (eUso.tipo !== 'unica') throw new ErrorMapaIncompletoGenerali(`la opción de «${ETIQUETAS_VALORACION.uso}» para el uso particular (${eUso.tipo === 'varias' ? `${eUso.indices.length} casan` : 'ninguna casa'}): ${opUso.filter((o) => !esOpcionVaciaCatalogo(o)).join(' | ').slice(0, 600)}`)
  await elegirIndice(uso, eUso.indice, ctx)

  const s = supuestosAuto(form, hoy)
  const garaje = await controlJuntoA(marco, ETIQUETAS_VALORACION.garaje, 'select', ctx.formador)
  if (!garaje) throw new ErrorMapaIncompletoGenerali(`el desplegable «${ETIQUETAS_VALORACION.garaje}» (captura 6)`)
  const opGaraje = (await opcionesSelect(garaje)).map((o) => o.texto)
  const eGaraje = elegirGarajeGenerali(opGaraje, s.garaje.valor ?? 'colectivo')
  if (eGaraje.tipo !== 'unica') throw new ErrorMapaIncompletoGenerali(`la opción de «${ETIQUETAS_VALORACION.garaje}» para «${s.garaje.valor}»: ${opGaraje.join(' | ').slice(0, 600)}`)
  await elegirIndice(garaje, eGaraje.indice, ctx)
  if (s.garaje.supuesto && s.garaje.etiqueta) supuestos.push(s.garaje.etiqueta)

  const fecha = await controlJuntoA(marco, ETIQUETAS_VALORACION.fechaPrimeraMatriculacion, 'input', ctx.formador)
  if (!fecha) throw new ErrorMapaIncompletoGenerali(`el campo «${ETIQUETAS_VALORACION.fechaPrimeraMatriculacion}» (captura 6)`)
  const fm = fechaGenerali(form.fechaMatriculacion ?? null)
  if (fm) await escribir(fecha, fm, ctx)
  else if ((await fecha.inputValue().catch(() => '')).trim() === '') throw new ErrorTarificador('datos', 'generali/auto: Generali pide la fecha de 1ª matriculación y el riesgo no la trae')

  const roles = rolesGenerali(form)
  if (!roles.ok) throw new ErrorMapaIncompletoGenerali(roles.hueco, false)
  supuestos.push(...roles.supuestos)
  return supuestos
}

/**
 * Adaptador de Generali Turismos. Hoy llega hasta «Datos de Valoración» (captura 6) y PARA con el hueco del resto (tomador,
 * conductor, antecedentes, «Garantías y Resultados»): `ErrorMapaIncompletoGenerali` + inventario + HTML, para mapearlo.
 */
export const generaliAuto = {
  compania: 'generali',
  ramo: 'auto',
  credencial: 'GENERALI_MEDIADORES',
  version: VERSION_GENERALI_AUTO,
  async tarificar(page: Page, form: FormularioAuto, ctx: ContextoPortal): Promise<ResultadoAdaptador> {
    if (form?.ramo !== 'auto') throw new ErrorTarificador('datos', 'generali/auto: solo turismos (moto, después)')
    // Lo que se sabe sin portal, ANTES de abrirlo: matrícula con asterisco y vehículo confirmado.
    const m = matriculaGenerali(form.matricula)
    if (!m.ok) throw new ErrorTarificador('datos', m.motivo)
    if (!vehiculoBuscadoGenerali(form)) throw new ErrorTarificador('datos', 'generali/auto: falta el vehículo confirmado por Allianz o Mapfre (Generali no busca por matrícula; asegura lo pone desde la oportunidad)')
    if (!ctx.confirmarMediadorGenerali || !ctx.entrarTurismosGenerali) throw new ErrorMapaIncompletoGenerali('las puertas guardadas de Generali (mediador y menú) en el contexto del runner', false)
    const hoy = new Date()
    await loginGenerali(page, ctx)
    await elegirMediadorGenerali(page, ctx)
    await ctx.entrarTurismosGenerali()
    const marco = await marcoConTexto(page, 'Datos de Valoración')
    if (!marco) throw new ErrorMapaIncompletoGenerali('el formulario «Valoración Riesgo › Datos de Valoración» tras el menú de Turismos (captura 4)')
    await mediadorDelFormulario(marco, ctx)
    const similitud = await seleccionarVehiculoGenerali(page, marco, form, ctx)
    const supuestos = await rellenarValoracionGenerali(page, form, ctx, hoy)
    if (similitud) supuestos.unshift(AVISO_SIMILITUD_GENERALI)
    // Antecedentes (regla 3): sin dato, supuesto FAVORABLE declarado. Se calculan ya para declararlos; su pantalla no tiene captura.
    supuestos.push(...conAntecedentesFavorables(form).supuestos)
    const texto = textoSupuestos(supuestos)
    throw new ErrorMapaIncompletoGenerali(`el resto de «Datos de Valoración» (tomador, conductor, antecedentes) y «Garantías y Resultados» (el PRECIO): SIN CAPTURA${texto ? `; ${texto}` : ''}`)
  },
} as const
