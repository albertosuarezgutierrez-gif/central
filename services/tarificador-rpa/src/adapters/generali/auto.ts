// Generali · portal del corredor · TURISMOS (Ramo UV) — v0.2.4 (19/10/2026).
// Registrado SOLO con `GENERALI_AUTO_ACTIVO` (abajo, ENCENDIDO el 18/10/2026 por Alberto) y, además, la puerta de BD de siempre: la
// fila `seguros.companias_integracion` generali/auto activa y `rpa_autorizada` (NO se activa desde aquí).
//
// Fuente: 6 capturas de Alberto (Drive «BOT compañías › Generali», 18/10/2026); mapa en docs/generali-mapa-capturas.md.
//   1 login (access.generali.es) → 2 «Seleccionar mediador» (cascada; se elige el mediador de la correduría y «ACEPTAR») →
//   3 menú NEGOCIO › EMISIÓN › CONTRATACIÓN › AUTOMÓVILES › TURISMOS (RAMO UV) → 4 «Valoración Riesgo › Datos de Valoración»
//   (General: Mediador, Flota, F.Efectos, canal y subcanal; botón «Vehículo») → 5 «Selector de vehículos» (tipo, subtipo, marca)
//   → 6 «Datos de Valoración» (Identificación del vehículo + Roles).
// SIN CAPTURA (v0.2.0: el bot AVANZA todo lo que puede y, donde no sabe seguir, PARA con `ErrorMapaIncompletoGenerali` +
// registro de la pantalla en el mensaje + inventario de estructura + HTML redactado, que es el «modo exploración» del worker):
// lo que sale tras elegir la marca (modelo, versión y cómo se confirma), el resto de «Datos de Valoración» (tomador, conductor,
// antecedentes: se recorre el scroll del panel, se registra y se rellena lo del mapa PROVISIONAL por etiqueta exacta) y
// «Garantías y Resultados» (se pulsa por la compuerta del guard y se lee el PRECIO con un lector tolerante). La verificación
// de la matrícula es OPCIONAL (la captura 6 solo tiene un campo).
//
// Reglas de Alberto (18/10/2026): matrícula «1234*BCD» también en su verificación (`matriculaGenerali`); el vehículo NO se
// busca por matrícula: llega confirmado de Allianz/Mapfre de la misma oportunidad (asegura lo inyecta) y se casa en los
// desplegables EXACTO → por palabra entera → uno solo (`elegirOpcionCatalogo`); 0 o varios = atasco con las opciones. Mediador
// `MEDIADOR_GENERALI`; «Canal entrada», «Subcanal entrada» y «Flota» se dejan como vienen. Solo Turismos (moto, después).
// Sesión: login con `CRED_GENERALI_MEDIADORES_USER/_PASS`; si Okta pide el SMS (cada 30 días por dispositivo), `ctx.trasLogin`
// corta y el runner RELEVA el código por Telegram (`codigoSms: 'okta-generali'`, relevo-sms.ts, 19/10/2026): verifica, recuerda el
// dispositivo 30 días en la bóveda y repite el intento. Sin código a tiempo → `requiere_humano`.
//
// 🚨 SEGURIDAD. Este fichero no pulsa nada del menú ni del mediador: lo hacen `ctx.entrarTurismosGenerali` y
// `ctx.confirmarMediadorGenerali` (guard.ts). Aquí solo `ctx.pulsar` («Iniciar sesión», «Vehículo»),
// `ctx.pulsarSubpestanaGenerali` (lista blanca del guard) y campos tras `comprobarCampo`. Scroll y lectura de pantalla SOLO LEEN.
// Nunca emitir, contratar, grabar póliza ni pagar. Datos personales (matrícula, credenciales) solo en su campo: nunca en mensajes.

import type { Frame, Locator, Page } from 'playwright'
import {
  conAntecedentesFavorables,
  datosEquivalenciaDesdeEtiqueta,
  elegirVersionAutomaticamente,
  referenciaRiesgoVersion,
  supuestosAuto,
  textoSupuestos,
  type CandidatoVersion,
  type FormularioAuto,
  type OfertaNormalizada,
  type ResultadoAdaptador,
} from '@central/module-tarificacion'
import type { ContextoPortal } from '../../adaptador.ts'
import { ErrorTarificador } from '../../errores.ts'
import { comprobarCampo, ErrorEleccionVersion } from '../allianz/auto.ts'
import { campoConRespaldo, type ContextoFormador } from '../../formador.ts'
import { esUrlOktaSmsGenerali } from '../../guard.ts'
import {
  AVISO_MATRICULA_PROVINCIAL,
  claveEtiquetaRiesgoGenerali,
  decidirVerificacionMatricula,
  leerPrecioGenerali,
  resumenPantallaGenerali,
  valorRiesgoGenerali,
  type PantallaLeida,
  AVISO_SIMILITUD_GENERALI,
  ETIQUETAS_VALORACION,
  MEDIADOR_GENERALI,
  buscadoEnNivel,
  elegirGarajeGenerali,
  elegirMarcaExactaGenerali,
  elegirModeloGenerali,
  camposNuevosSelectorGenerali,
  resumenCamposSelectorGenerali,
  type CampoSelectorGenerali,
  elegirOpcionCatalogo,
  elegirUsoGenerali,
  esEtiquetaVerificacionMatricula,
  esOpcionVaciaCatalogo,
  fechaGenerali,
  matriculaGenerali,
  mensajeAtascoCatalogo,
  normalizarCatalogo,
  opcionMediadorGenerali,
  decidirMediadorGenerali,
  inventarioMediadorGenerali,
  rutaSinQuery,
  type ControlMediador,
  type DecisionMediador,
  type MarcoMediador,
  rolesGenerali,
  urlConMediador,
  esPortalCorredorGenerali,
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

/**
 * 0.1.1 (18/10/2026): flag encendido; «conductor habitual: el tomador (supuesto)» común (`supuestoConductorTomador`).
 * 0.2.0 (19/10/2026): verificación de matrícula OPCIONAL (0 sigue · 1 rellena · >1 para; se vuelve a mirar tras salir del
 * campo); selector de vehículos sin el desplegable esperado → hueco con los desplegables y opciones LEÍDOS; tras «Roles»,
 * scroll del panel + registro de campos/botones + mapa provisional de tomador/conductor/antecedentes + «Garantías y
 * Resultados» por la compuerta del guard + lector tolerante del precio (oferta) o hueco con el registro de esa pantalla.
 * 0.2.9 (19/10/2026): la versión elegida por una persona que no casa con UNA sola opción vuelve a `ErrorEleccionVersion` (con la lista), no a hueco de mapa. Generali ya NO elegía «la primera»: solo exacta o contención única.
 * 0.2.10 (19/10/2026, decisión de Alberto: «las diferencias entre acabados no son influyentes; el cliente revisa en la emisión»): la VERSIÓN
 * con varias candidatas y sin elección de la bandeja se elige SOLA si son EQUIVALENTES (`versionGeneraliPorEquivalencia`, regla común de
 * module-tarificacion) y se declara en el aviso de supuestos; con diferencias materiales sigue siendo `ErrorEleccionVersion` con todas.
 * 0.2.1 (19/10/2026): SMS de Okta relevado por Telegram (`codigoSms`) y dispositivo recordado 30 días en la bóveda; el login ya no
 * espera 30 s en la pantalla del SMS.
 * 0.2.2 (19/10/2026, prueba real b41be722): «Seleccionar mediador» vive en un MARCO (`seleccionAmbito.do`) con 5 campos sin
 * etiqueta: se busca en TODOS los marcos el desplegable por la OPCIÓN del mediador, esperando a que el bucle CorredorInicio →
 * seleccionAmbito → Refresh se estabilice; el botón de ese marco, solo por la lista blanca del guard; 0 o varias → inventario.
 * 0.2.5 (19/10/2026, prueba real c8838c26): el overlay «¿Sabías qué…?» llega segundos DESPUÉS del portal y interceptaba el sobrevuelo de
 * NEGOCIO: el cierre espera a que aparezca; el menú cierra el aviso si sigue, sobrevuela con plazo corto y, si no se despliega, pulsa el toggle.
 * 0.2.6 (19/10/2026, prueba real): el «Selector de vehículos» (marco `selVehiculo`) es PrimeFaces: «Todas las marcas» es un SelectOneMenu
 * (`select#X_input` OCULTO + `div#X[role=combobox]`); se reconoce, la marca se elige por igualdad EXACTA normalizada (0 o varias →
 * atasco `eleccion` con las cercanas), «Placas especiales» = «No» y «Confirmar» por puertas de guard.ts; la pantalla siguiente → hueco.
 * 0.2.11 (19/10/2026, prueba real): tras la marca aparece «Modelo» (otro SelectOneMenu PrimeFaces): se espera, se elige por igualdad EXACTA
 * normalizada (varias → atasco `eleccion`; ninguna → «Otros» declarado como supuesto) por las puertas de modelo de guard.ts. Si tras el
 * modelo salen campos NUEVOS sin rellenar, NO se pulsa «Confirmar»: se baja el scroll y se PARA con hueco listando etiquetas y opciones.
 * El hueco ya no dice «SIN CAPTURA» (el runner SÍ guarda la captura/recorrido/inventario en cualquier hueco con `pideInventarioDom`).
 */
export const VERSION_GENERALI_AUTO = '0.2.11'
/** Texto EXACTO de la subpestaña del precio (captura 6). Solo se pulsa por `ctx.pulsarSubpestanaGenerali` (lista blanca del guard). */
export const SUBPESTANA_PRECIO_GENERALI = 'Garantías y Resultados'
/** Espera corta tras salir del campo «Matrícula» por si el portal pinta entonces la verificación. */
const ESPERA_VERIFICACION_MS = 1_200
/** Espera del precio tras pulsar la subpestaña. */
const ESPERA_PRECIO_MS = 25_000

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
async function elegirIndice(sel: Locator, indice: number, ctx: Pick<ContextoPortal, 'pausaAccion'>): Promise<void> {
  await ctx.pausaAccion()
  await comprobarCampo(sel)
  await sel.selectOption({ index: indice })
  await confirmarUso(sel)
}

// ───────────────────────── lectura de pantalla (v0.2.0: SOLO LEE; nunca pulsa ni escribe) ─────────────────────────
// Los extractores van como TEXTO (no como función): tsx envuelve las funciones con nombre en `__name`, que no existe en la
// página. Nunca sale el valor de un campo de texto (solo «vacío»/«con valor»); de un desplegable, el texto de la opción puesta
// salvo en etiquetas que pueden llevar datos personales.

const JS_COMUN = `
  const T = (n) => (n ? (n.innerText || n.textContent || '') : '').replace(/\\s+/g, ' ').trim();
  const VIS = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility === 'visible';
  const ETQ = (el) => {
    if (el.labels && el.labels.length) {
      const c = el.labels[0].cloneNode(true);
      c.querySelectorAll('input,select,textarea').forEach((x) => x.remove());
      const t = T(c);
      if (t) return t;
    }
    const a = el.getAttribute('aria-label') || el.getAttribute('title');
    if (a && a.trim()) return a.trim();
    let c = el;
    for (let i = 0; c && i < 4; i++) {
      let p = c.previousElementSibling;
      while (p) {
        if (!p.matches('input,select,textarea,button')) {
          const t = T(p);
          if (t && t.length <= 80) return t;
        }
        p = p.previousElementSibling;
      }
      c = c.parentElement;
    }
    return el.getAttribute('name') || el.id || '';
  };`

/** Lee campos (etiqueta, tipo, obligatorio, valor), botones y avisos VISIBLES de un marco. */
const JS_LEER_PANTALLA = `(() => {${JS_COMUN}
  const TEXTO = ['text', 'password', 'email', 'tel', 'number', 'date', 'search', 'url', ''];
  const PERSONAL = /mediador|nombre|apellido|nif|dni|documento|direcci|tel[eé]fono|correo|email|cuenta|iban|matr[ií]cula/i;
  const campos = [];
  for (const el of Array.from(document.querySelectorAll('input,select,textarea'))) {
    const ta = (el.getAttribute('type') || '').toLowerCase();
    if (el.tagName === 'INPUT' && ta === 'hidden') continue;
    if (!VIS(el)) continue;
    const etiqueta = ETQ(el).slice(0, 80);
    const tag = el.tagName.toLowerCase();
    let tipo = tag === 'input' ? (ta || 'text') : tag;
    if (el.disabled || el.readOnly) tipo += ',ro';
    const obligatorio = el.required === true || el.getAttribute('aria-required') === 'true' || /\\*\\s*$/.test(etiqueta);
    let valor;
    if (tag === 'select') {
      const o = el.selectedIndex >= 0 ? el.options[el.selectedIndex] : null;
      const t = o ? T(o) : '';
      valor = t === '' ? 'vacío' : PERSONAL.test(etiqueta) ? 'con valor' : t.slice(0, 40);
    } else if (tag === 'input' && !TEXTO.includes(ta)) {
      valor = el.checked === true ? 'marcado' : 'sin marcar';
    } else {
      valor = String(el.value || '').trim() === '' ? 'vacío' : 'con valor';
    }
    campos.push({ etiqueta, tipo, obligatorio, valor });
    if (campos.length >= 150) break;
  }
  const botones = [];
  for (const el of Array.from(document.querySelectorAll('button,input[type=button],input[type=submit],[role=button],[role=tab],a[onclick],li[onclick],td[onclick],span[onclick],div[onclick]'))) {
    if (!VIS(el)) continue;
    const t = (T(el) || el.value || el.getAttribute('aria-label') || el.getAttribute('title') || '').trim();
    if (t && t.length <= 60 && !botones.includes(t)) botones.push(t);
    if (botones.length >= 40) break;
  }
  const avisos = [];
  for (const el of Array.from(document.querySelectorAll('[role=alert],[class*=error],[class*=Error],[class*=aviso],[class*=Aviso],[class*=alert],[class*=mensaje]'))) {
    if (!VIS(el)) continue;
    const t = T(el);
    if (t.length >= 3 && t.length <= 160 && !avisos.includes(t)) avisos.push(t);
    if (avisos.length >= 10) break;
  }
  return { campos, botones, avisos };
})()`

/** Desplegables visibles con su etiqueta y sus primeras opciones (para el hueco del selector de vehículos). */
const JS_SELECTS = `(() => {${JS_COMUN}
  return Array.from(document.querySelectorAll('select')).filter(VIS).slice(0, 12).map((s) => ({
    etiqueta: ETQ(s).slice(0, 60),
    opciones: Array.from(s.options).map((o) => T(o)).filter((t) => t !== '').slice(0, 20),
    total: s.options.length,
  }));
})()`

/** Controles del selector de vehículos (solo lectura; NUNCA valores): menús de PrimeFaces (por el id de su combobox), selects visibles, campos de texto y grupos de opciones. */
const JS_CAMPOS_SELECTOR = `(() => {${JS_COMUN}
  const TEXTO = ['text', 'email', 'tel', 'number', 'date', 'search', 'url', ''];
  const out = [];
  const grupos = new Map();
  for (const el of Array.from(document.querySelectorAll('input,select,textarea'))) {
    const tag = el.tagName.toLowerCase();
    const ta = (el.getAttribute('type') || '').toLowerCase();
    if (tag === 'input' && ['hidden', 'button', 'submit', 'image', 'reset', 'password'].includes(ta)) continue;
    if (el.id && /_(focus|filter)$/.test(el.id)) continue;
    if (tag === 'select') {
      const m = /^(.*)_input$/.exec(el.id || '');
      const combo = m ? document.getElementById(m[1]) : null;
      const pf = !!combo && combo.getAttribute('role') === 'combobox';
      if (!(pf ? VIS(combo) : VIS(el))) continue;
      const etiqueta = (pf ? ETQ(combo) : ETQ(el)).slice(0, 80);
      const ops = Array.from(el.options).map((o) => T(o)).filter((t) => t !== '');
      out.push({ clave: pf ? m[1] : (el.id || 'select|' + etiqueta), etiqueta, tipo: pf ? 'desplegable' : 'select', opciones: ops.slice(0, 25), total: el.options.length });
    } else if (tag === 'input' && !TEXTO.includes(ta)) {
      const g = el.name || el.id || ta;
      let e = grupos.get(g);
      if (!e) { e = { clave: 'grupo|' + g, etiqueta: g.slice(0, 80), tipo: ta === 'checkbox' ? 'casilla' : 'grupo', opciones: [], total: 0 }; grupos.set(g, e); out.push(e); }
      const lab = el.labels && el.labels.length ? T(el.labels[0]) : '';
      e.total++;
      if (lab && e.opciones.length < 25) e.opciones.push(lab.slice(0, 60));
    } else {
      if (!VIS(el)) continue;
      const etiqueta = ETQ(el).slice(0, 80);
      out.push({ clave: el.id || 'texto|' + etiqueta, etiqueta, tipo: 'texto', opciones: [], total: 0 });
    }
    if (out.length >= 80) break;
  }
  return out;
})()`

/** Controles del selector de vehículos (solo lectura): sirve para detectar campos NUEVOS tras elegir marca/modelo. */
export async function leerCamposSelector(raiz: Raiz): Promise<CampoSelectorGenerali[]> {
  return ((await raiz.evaluate(JS_CAMPOS_SELECTOR).catch(() => [])) as CampoSelectorGenerali[] | null) ?? []
}

/** Un paso de scroll en TODOS los contenedores con scroll del marco (el formulario tiene el suyo). `true` = alguno bajó. */
const JS_SCROLL = `(() => {
  const els = Array.from(document.querySelectorAll('*')).filter((e) => {
    const cs = getComputedStyle(e);
    return /(auto|scroll)/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 10;
  });
  if (document.scrollingElement) els.push(document.scrollingElement);
  let bajo = false;
  for (const e of els) {
    const antes = e.scrollTop;
    e.scrollTop = antes + Math.max(200, Math.floor(e.clientHeight * 0.8));
    if (e.scrollTop > antes) bajo = true;
  }
  return bajo;
})()`

/** Pantalla leída de un marco (vacía si el marco no se deja leer). */
export async function leerPantalla(raiz: Raiz): Promise<PantallaLeida> {
  const r = await raiz.evaluate(JS_LEER_PANTALLA).catch(() => null)
  return (r as PantallaLeida | null) ?? { campos: [], botones: [], avisos: [] }
}

/** Pantalla leída de TODOS los marcos de la página (la vista tras la subpestaña puede estar en otro marco). */
async function leerPantallaPagina(page: Page): Promise<PantallaLeida> {
  const total: PantallaLeida = { campos: [], botones: [], avisos: [] }
  for (const f of page.frames()) {
    if (f.isDetached()) continue
    const p = await leerPantalla(f)
    total.campos.push(...p.campos)
    for (const b of p.botones) if (!total.botones.includes(b)) total.botones.push(b)
    for (const a of p.avisos) if (!total.avisos.includes(a)) total.avisos.push(a)
  }
  return total
}

/**
 * Recorre el scroll del formulario (contenedor propio, captura 6) hasta abajo, con pausas cortas por si pinta más campos al
 * bajar. Solo desplaza: no pulsa ni escribe. Devuelve cuántos pasos bajó.
 */
export async function recorrerScroll(page: Page, raiz: Raiz, maxPasos = 15): Promise<number> {
  let n = 0
  for (; n < maxPasos; n++) {
    const bajo = await raiz.evaluate(JS_SCROLL).catch(() => false)
    if (!bajo) break
    await page.waitForTimeout(250)
  }
  return n
}

/** «Etiqueta: op1 | op2 …» de los desplegables visibles del marco (catálogo, sin datos personales). */
async function describirSelects(raiz: Raiz): Promise<string> {
  const r = ((await raiz.evaluate(JS_SELECTS).catch(() => [])) as { etiqueta: string; opciones: string[]; total: number }[]) ?? []
  if (r.length === 0) return 'ningún desplegable visible'
  return r.map((s) => `«${s.etiqueta || '(sin etiqueta)'}» (${s.total}): ${s.opciones.join(' | ')}`).join(' ; ').slice(0, 1200)
}

/** Texto visible de todos los marcos (para el lector tolerante del precio). */
async function textoPagina(page: Page): Promise<string> {
  const partes: string[] = []
  for (const f of page.frames()) {
    if (f.isDetached()) continue
    partes.push(await f.locator('body').innerText({ timeout: 2_000 }).catch(() => ''))
  }
  return partes.join('\n')
}

// ───────────────────────── 1 · login ─────────────────────────

/** Login en access.generali.es (captura 1) si hace falta. El SMS de 30 días lo detecta `ctx.trasLogin` (relevo por Telegram). */
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
    // Sale de access.generali.es… o se queda en la pantalla del SMS de Okta (la decide `ctx.trasLogin`): no se esperan 30 s en vano.
    await page.waitForURL((u) => !u.toString().startsWith(ORIGEN_ACCESO_GENERALI) || esUrlOktaSmsGenerali(u.toString()), { timeout: 30_000 }).catch(() => undefined)
    await page.waitForLoadState('domcontentloaded').catch(() => undefined)
  }
  await ctx.trasLogin()
  await ctx.exigirSinCaptcha()
}

// ───────────────────────── 2 · mediador ─────────────────────────

/** Lee los controles VISIBLES de formulario de un marco: estructura y opciones (nunca lo tecleado). SOLO LEE. */
const JS_CONTROLES_MEDIADOR = `(() => {
  const VIS = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility === 'visible';
  const T = (n) => (n ? (n.textContent || '') : '').replace(/\\s+/g, ' ').trim();
  const selects = Array.from(document.querySelectorAll('select'));
  const out = [];
  for (const el of Array.from(document.querySelectorAll('select, input, textarea, [role=combobox], [role=listbox]'))) {
    const ta = (el.getAttribute('type') || '').toLowerCase();
    if (el.tagName === 'INPUT' && ['hidden', 'button', 'submit', 'image', 'reset'].includes(ta)) continue;
    if (!VIS(el)) continue;
    const nativo = el.tagName === 'SELECT';
    const role = el.getAttribute('role') || '';
    let opciones = [];
    let seleccionada = null;
    if (nativo) {
      opciones = Array.from(el.options).map((o) => ({ valor: o.value || '', texto: T(o) }));
      const o = el.selectedIndex >= 0 ? el.options[el.selectedIndex] : null;
      seleccionada = o ? { valor: o.value || '', texto: T(o) } : null;
    } else if (role) {
      const lista = el.getAttribute('aria-controls') ? document.getElementById(el.getAttribute('aria-controls')) : el;
      opciones = Array.from((lista || el).querySelectorAll('[role=option]')).map((o) => ({ valor: o.getAttribute('data-value') || '', texto: T(o) }));
      if (opciones.length === 0) opciones = [{ valor: '', texto: T(el) }];
    }
    const tipo = nativo ? 'select' : role ? role : el.tagName.toLowerCase() + (ta ? ':' + ta : '');
    out.push({ tipo, name: el.getAttribute('name') || '', id: el.id || '', nativo, indiceSelect: nativo ? selects.indexOf(el) : -1, opciones: opciones.slice(0, 400), seleccionada });
    if (out.length >= 40) break;
  }
  return out;
})()`

type EscaneoMediador = { marcos: (MarcoMediador & { frame: Frame })[] }

/** Controles de TODOS los marcos vivos (la cascada de «Seleccionar mediador» vive en el marco `seleccionAmbito.do`). */
async function escanearMediador(page: Page): Promise<EscaneoMediador> {
  const marcos: EscaneoMediador['marcos'] = []
  for (const f of page.frames()) {
    if (f.isDetached()) continue
    const controles = ((await f.evaluate(JS_CONTROLES_MEDIADOR).catch(() => null)) as ControlMediador[] | null) ?? []
    marcos.push({ frame: f, ruta: rutaSinQuery(f.url()), controles })
  }
  return { marcos }
}

/** Espera de «Seleccionar mediador»: tolera el bucle CorredorInicio → seleccionAmbito → seleccionAmbitoRefresh (prueba real). */
export const ESPERA_MEDIADOR_MS = 45_000
/** Tras elegir el mediador, el marco puede recargarse (`seleccionAmbitoRefresh.do`): lo que se espera a que vuelva estable. */
const ESPERA_REFRESCO_MEDIADOR_MS = 15_000
const PAUSA_MEDIADOR_MS = 700

type CandidatoMediador = { escaneo: EscaneoMediador; d: Extract<DecisionMediador, { tipo: 'unica' }> }

/**
 * Escanea hasta que la pantalla se ESTABILIZA (dos lecturas seguidas iguales: rutas de los marcos, nº de controles y la
 * decisión). `null` = el portal ya está con el mediador correcto. Una sola candidata estable → esa; varias estables → PARA
 * con inventario; ninguna hasta el tope → PARA con inventario. Nunca elige a ciegas.
 */
async function candidatoMediadorEstable(page: Page, esperaMs: number, pausaMs: number): Promise<CandidatoMediador | null> {
  const fin = Date.now() + esperaMs
  let firmaAnterior: string | null = null
  let ultimo: EscaneoMediador = { marcos: [] }
  for (;;) {
    const conMediador = urlConMediador(page.url())
    if (conMediador === true) return null
    if (conMediador === false) throw new ErrorMapaIncompletoGenerali('el portal entró con OTRO mediador (no se cambia a ciegas)', false)
    const escaneo = await escanearMediador(page)
    const d = decidirMediadorGenerali(escaneo.marcos)
    const firma = JSON.stringify([escaneo.marcos.map((m) => [m.ruta, m.controles.length]), d])
    if (firma === firmaAnterior) {
      if (d.tipo === 'unica') {
        if (!d.nativo) throw new ErrorMapaIncompletoGenerali(`el desplegable «Mediador» (captura 2): el código de la correduría está en un control que no es un desplegable nativo (sin mapa para elegirlo). Campos: ${inventarioMediadorGenerali(escaneo.marcos)}`)
        return { escaneo, d }
      }
      // Las opciones llevan nombres de mediadores: el inventario solo lleva códigos y marcadores (opcionSinDatosGenerali).
      if (d.tipo === 'varias') throw new ErrorMapaIncompletoGenerali(`el desplegable «Mediador» (captura 2): ${d.n} opciones/desplegables casan con el mediador de la correduría; no se elige ninguno. Campos: ${inventarioMediadorGenerali(escaneo.marcos)}`)
    }
    firmaAnterior = firma
    ultimo = escaneo
    if (Date.now() >= fin) {
      throw new ErrorMapaIncompletoGenerali(`el desplegable «Mediador» (captura 2): el mediador de la correduría no aparece en ningún desplegable de ningún marco tras esperar a que la pantalla se estabilice; no se elige otro. Página: ${rutaSinQuery(page.url())}. Campos: ${inventarioMediadorGenerali(ultimo.marcos)}`)
    }
    await page.waitForTimeout(pausaMs)
  }
}

/** El `<select>` de la candidata en SU marco: por id, por name o por posición; siempre UNO y con la opción del mediador. */
async function selectDeCandidato(c: CandidatoMediador): Promise<Locator> {
  const m = c.escaneo.marcos[c.d.marco]!
  const ctl = m.controles[c.d.control]!
  const opciones: Locator[] = []
  if (ctl.id) opciones.push(m.frame.locator(`select[id="${ctl.id.replace(/["\\]/g, '')}"]`))
  if (ctl.name) opciones.push(m.frame.locator(`select[name="${ctl.name.replace(/["\\]/g, '')}"]`))
  if (ctl.indiceSelect >= 0) opciones.push(m.frame.locator('select').nth(ctl.indiceSelect))
  for (const l of opciones) {
    if ((await l.count().catch(() => 0)) !== 1) continue
    const r = opcionMediadorGenerali(await opcionesSelect(l).catch(() => []), MEDIADOR_GENERALI)
    if (r.tipo === 'unica' && r.indice === c.d.indice) return l
  }
  throw new ErrorMapaIncompletoGenerali(`el desplegable «Mediador» (captura 2): la candidata no se deja localizar de forma única en su marco (${m.ruta})`)
}

/**
 * ¿Hay un «NEGOCIO» en algún marco? (el menú del portal del corredor). Prueba real 31e76085: en `CorredorPortal.po` es un
 * enlace `<a>` SIN href con ese texto exacto (junto a COMPAÑÍA · FORMACIÓN · NORMAS · … · CERRAR) que puede estar plegado y no
 * contar como «visible»: aquí basta con que esté en el DOM (solo lee; el sobrevuelo lo hace la puerta del guard).
 */
async function menuNegocioVisible(page: Page): Promise<boolean> {
  for (const f of page.frames()) {
    if (!f.isDetached() && (await f.getByText(/^\s*NEGOCIO\s*$/).count().catch(() => 0)) >= 1) return true
  }
  return false
}

/** ¿Ya estamos en el portal del corredor? Ruta EXACTA `CorredorPortal.po` de www.generali.es (con o sin `mediatorCode`) o el menú NEGOCIO. */
async function llegadoAlPortal(page: Page): Promise<boolean> {
  if (urlConMediador(page.url()) === true || esPortalCorredorGenerali(page.url())) return true
  return rutaSinQuery(page.url()).startsWith('https://www.generali.es/') && (await menuNegocioVisible(page))
}

/** Tras «ENTRAR»: espera a la llegada a `CorredorPortal.po` (ruta exacta) o al menú NEGOCIO. */
async function esperarMenuNegocio(page: Page, esperaMs: number, pausaMs: number): Promise<boolean> {
  const fin = Date.now() + esperaMs
  while (Date.now() < fin) {
    if (await llegadoAlPortal(page)) return true
    await page.waitForTimeout(pausaMs)
  }
  return llegadoAlPortal(page)
}

/** Tras confirmar el mediador: espera a la URL con `mediatorCode`, al menú NEGOCIO o a que CorredorInicio.po ofrezca «ENTRAR». */
async function esperarPortalOEntrar(page: Page, esperaMs: number, pausaMs: number): Promise<void> {
  const fin = Date.now() + esperaMs
  while (Date.now() < fin) {
    if (await llegadoAlPortal(page)) return
    if (rutaSinQuery(page.url()).endsWith('/CorredorInicio.po')) {
      for (const f of page.frames()) {
        if (!f.isDetached() && (await f.getByText(/^\s*ENTRAR\s*$/).filter({ visible: true }).count().catch(() => 0)) >= 1) return
      }
    }
    await page.waitForTimeout(pausaMs)
  }
}

/**
 * «Seleccionar mediador» (captura 2 + prueba real b41be722, v0.2.2): la cascada vive en un MARCO (`seleccionAmbito.do`) con
 * 5 campos SIN etiqueta. Se busca en TODOS los marcos el único desplegable con la opción del mediador de la correduría
 * (`MEDIADOR_GENERALI`), esperando a que el bucle CorredorInicio → seleccionAmbito → Refresh se estabilice; se elige (el marco
 * puede recargarse: se vuelve a leer hasta verla puesta) y el botón de ESE marco lo pulsa SOLO la puerta del guard
 * (`ctx.confirmarMediadorGenerali`, lista blanca exacta). 0 o varias → PARA con inventario (tipo, name/id, nº de opciones y
 * textos sin datos personales). Si el portal ya entra con ese mediador, nada; con otro, PARA.
 */
export async function elegirMediadorGenerali(page: Page, ctx: Pick<ContextoPortal, 'pausaAccion' | 'confirmarMediadorGenerali' | 'entrarPortalGenerali'>, o: { esperaMs?: number; pausaMs?: number } = {}): Promise<void> {
  const espera = o.esperaMs ?? ESPERA_MEDIADOR_MS
  const pausa = o.pausaMs ?? PAUSA_MEDIADOR_MS
  if (!ctx.confirmarMediadorGenerali) throw new ErrorMapaIncompletoGenerali('la puerta guardada del mediador en el contexto del runner', false)
  let elegidas = 0
  for (let esperaEsta = espera; ; esperaEsta = Math.min(espera, ESPERA_REFRESCO_MEDIADOR_MS)) {
    const c = await candidatoMediadorEstable(page, esperaEsta, pausa)
    if (!c) return
    const sel = await selectDeCandidato(c)
    if (!c.d.puesto) {
      // Elegir dispara el `onchange` de la cascada (recarga el marco): se vuelve a leer hasta verla puesta y estable.
      if (elegidas >= 2) throw new ErrorMapaIncompletoGenerali('el desplegable «Mediador» (captura 2): el mediador de la correduría no se queda elegido tras recargarse el marco')
      elegidas++
      await elegirIndice(sel, c.d.indice, ctx)
      await page.waitForTimeout(pausa)
      continue
    }
    await ctx.confirmarMediadorGenerali(sel)
    await esperarPortalOEntrar(page, o.esperaMs ?? ESPERA_PANTALLA_MS, pausa)
    if (await llegadoAlPortal(page)) return
    // Prueba real 351f946b (v0.2.3): aceptado el mediador, CorredorInicio.po se queda con «ENTRAR»: se pulsa por la puerta del guard.
    if (ctx.entrarPortalGenerali && rutaSinQuery(page.url()).endsWith('/CorredorInicio.po')) {
      await ctx.entrarPortalGenerali()
      if (await esperarMenuNegocio(page, o.esperaMs ?? ESPERA_PANTALLA_MS, pausa)) return
    }
    throw new ErrorMapaIncompletoGenerali(`la llegada al portal del corredor con el mediador elegido (página: ${rutaSinQuery(page.url())})`)
  }
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

type FormVersionGenerali = Pick<FormularioAuto, 'eleccionVersion' | 'vehiculoConfirmado' | 'seleccionVehiculo' | 'fechaMatriculacion'>

/**
 * Versión de Generali por EQUIVALENCIA (v0.2.10, 19/10/2026). `candidatas` = textos de las opciones (las que siguen en juego); devuelve
 * el índice dentro de `candidatas` y el supuesto a declarar, o lanza `ErrorEleccionVersion` con `candidatas` si difieren de forma
 * material (combustible, CV/cc fuera de tolerancia) o ninguna es compatible con el riesgo. Datos leídos de la etiqueta. PURA salvo el lanzamiento.
 */
export function versionGeneraliPorEquivalencia(candidatas: readonly string[], form: FormVersionGenerali): { indice: number; supuesto: string | null } {
  const r = elegirVersionAutomaticamente(
    candidatas.map((o) => ({ etiqueta: o, codigo: null, datos: datosEquivalenciaDesdeEtiqueta(o) })),
    { riesgo: referenciaRiesgoVersion(form) },
  )
  if (r.tipo === 'automatica' || r.tipo === 'unica') return { indice: r.indice, supuesto: r.supuesto }
  throw new ErrorEleccionVersion(candidatas.map((o): CandidatoVersion => ({ etiqueta: o, codigo: null })))
}

/** Un nivel del selector (marca/modelo/versión) en un `<select>` nativo, casado por la regla de Alberto. Devuelve si fue por similitud. `avisos` recoge el supuesto de una versión elegida sola. */
async function elegirNivel(sel: Locator, nivel: 'marca' | 'modelo' | 'version', v: VehiculoBuscado, form: FormVersionGenerali, ctx: ContextoPortal, avisos?: string[]): Promise<boolean> {
  const opciones = (await opcionesSelect(sel)).map((o) => o.texto)
  // Versión: la elección de una PERSONA (bandeja) manda; texto EXACTO de la opción.
  const persona = nivel === 'version' ? form.eleccionVersion?.etiqueta?.trim() : undefined
  if (persona) {
    const ix = opciones.flatMap((o, i) => (normalizarCatalogo(o) === normalizarCatalogo(persona) ? [i] : []))
    // v0.2.9: una elección que no casa con UNA sola opción se vuelve a preguntar con la lista (nunca se elige otra ni se para sin opciones).
    if (ix.length !== 1) throw new ErrorEleccionVersion(opciones.filter((o) => !esOpcionVaciaCatalogo(o)).map((o): CandidatoVersion => ({ etiqueta: o, codigo: null })))
    await elegirIndice(sel, ix[0]!, ctx)
    return false
  }
  const b = buscadoEnNivel(v, nivel)
  const validas = opciones.filter((o) => !esOpcionVaciaCatalogo(o))
  if (!b) {
    // Sin versión confirmada: una sola versión → esa; varias → la equivalente (declarada) o, si difieren de forma material, elige una persona.
    if (validas.length === 1) {
      await elegirIndice(sel, opciones.indexOf(validas[0]!), ctx)
      return false
    }
    const a = nivel === 'version' ? versionGeneraliPorEquivalencia(validas, form) : null
    if (!a) throw new ErrorEleccionVersion(validas.map((o): CandidatoVersion => ({ etiqueta: o, codigo: null })))
    if (a.supuesto) avisos?.push(a.supuesto)
    await elegirIndice(sel, opciones.indexOf(validas[a.indice]!), ctx)
    return false
  }
  const e = elegirOpcionCatalogo(opciones, b.texto, b.modo)
  if (e.tipo !== 'unica') {
    if (nivel === 'version' && e.tipo === 'varias') {
      const entre = e.indices.map((i) => opciones[i]!)
      const a = versionGeneraliPorEquivalencia(entre, form)
      if (a.supuesto) avisos?.push(a.supuesto)
      await elegirIndice(sel, e.indices[a.indice]!, ctx)
      return false
    }
    if (nivel === 'version') throw new ErrorEleccionVersion(validas.map((o): CandidatoVersion => ({ etiqueta: o, codigo: null })))
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

// ───────────────────────── selector de vehículos PrimeFaces (v0.2.6) ─────────────────────────

/** SelectOneMenu de PrimeFaces: `select` OCULTO `<base>_input` (las opciones y el valor) y su `div#<base>[role=combobox]` visible. */
export type MenuPrimeFaces = { select: Locator; base: string }

/**
 * Reconoce un SelectOneMenu de PrimeFaces SIN exigir que el `<select>` sea visible (PrimeFaces lo oculta): el primer `<select>`
 * que sigue a la etiqueta EXACTA `etiqueta` o, si no hay etiqueta, el único `select[id$="_input"]` de la marca; vale solo si su id
 * acaba en `_input` y existe `div#<base>` con role=combobox. `null` si nadie lo es (el llamador sigue con el `<select>` nativo).
 */
export async function menuPrimeFaces(raiz: Raiz, etiqueta: string, fragmentoId = 'marca'): Promise<MenuPrimeFaces | null> {
  const lit = etiqueta.replace(/"/g, '')
  let cand = raiz.locator(`xpath=//*[normalize-space(text())="${lit}"]/following::select[1]`)
  if ((await cand.count().catch(() => 0)) !== 1) cand = raiz.locator(`select[id$="_input"][id*="${fragmentoId.replace(/[^a-z]/gi, '')}" i]`)
  if ((await cand.count().catch(() => 0)) !== 1) return null
  const base = await cand.first().evaluate((el) => {
    const id = el.id
    if (!id.endsWith('_input')) return null
    const b = id.slice(0, -'_input'.length)
    const c = document.getElementById(b)
    return c && c.getAttribute('role') === 'combobox' ? b : null
  }).catch(() => null)
  return base ? { select: cand.first(), base } : null
}

/**
 * Elige la marca en el SelectOneMenu. Vía: abrir el desplegable por su disparador (puerta del guard) y pulsar el `li` de `data-label` exacto (la vía propia de PrimeFaces:
 * actualiza etiqueta, valor y dispara su change/ajax); si eso falla (no por el guard), `selectOption` en el select oculto + change.
 * Solo igualdad EXACTA normalizada: 0 o varias → `ErrorEleccionVersion` (tipo `eleccion`) con las cercanas, sin tocar nada.
 */
export async function elegirMarcaPrimeFaces(raiz: Raiz, menu: MenuPrimeFaces, v: VehiculoBuscado, ctx: ContextoPortal): Promise<void> {
  const b = buscadoEnNivel(v, 'marca')
  if (!b) throw new ErrorMapaIncompletoGenerali('la marca del vehículo de la oportunidad (el selector de Generali la exige)', false)
  const opciones = await opcionesSelect(menu.select)
  const e = elegirMarcaExactaGenerali(opciones.map((o) => o.texto), b.texto)
  if (e.tipo !== 'unica') {
    if (e.cercanas.length > 0) throw new ErrorEleccionVersion(e.cercanas.map((o): CandidatoVersion => ({ etiqueta: o, codigo: null })))
    throw new ErrorMapaIncompletoGenerali(mensajeAtascoCatalogo('marca', b.texto, opciones.map((o) => o.texto), { tipo: 'ninguna' }))
  }
  await ponerOpcionPrimeFaces(raiz, menu, opciones[e.indice]!, e.indice, ctx.abrirDesplegableMarcaGenerali, ctx.elegirMarcaListaGenerali, ctx, 'la marca elegida en «Todas las marcas»')
}

/**
 * Pone una opción ya decidida en un SelectOneMenu de PrimeFaces: abre por su disparador (puerta del guard), pulsa el `li` de `data-label`
 * exacto (puerta del guard) y, si el navegador agota el plazo, cae a `selectOption` en el select oculto + change. Comprueba que quedó puesta.
 */
async function ponerOpcionPrimeFaces(
  raiz: Raiz,
  menu: MenuPrimeFaces,
  elegida: { valor: string; texto: string },
  indice: number,
  abrir: ((base: string) => Promise<void>) | undefined,
  elegir: ((base: string, texto: string) => Promise<void>) | undefined,
  ctx: Pick<ContextoPortal, 'pausaAccion'>,
  que: string,
): Promise<void> {
  const puesta = async () => (await menu.select.inputValue().catch(() => '')) === elegida.valor
  if (!abrir || !elegir) throw new ErrorMapaIncompletoGenerali(`las puertas guardadas del desplegable de ${que} (disparador y \`li\`) en el contexto del runner`, false)
  await ctx.pausaAccion()
  try {
    // v0.2.7: se abre pulsando el disparador propio de PrimeFaces (sin las opciones dentro), no el `div` que las contiene.
    await abrir(menu.base)
    const etq = elegida.texto.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    const item = raiz.locator(`[id="${menu.base}_panel"] li[data-label="${etq}"]`)
    if ((await item.count()) === 1) {
      await elegir(menu.base, elegida.texto)
      for (let i = 0; i < 10 && !(await puesta()); i++) await new Promise((r) => setTimeout(r, 300))
    }
  } catch (err) {
    // Solo un plazo agotado del navegador cae a la vía de reserva; un bloqueo del guard (u otro error) sube tal cual.
    if (!(err instanceof Error && err.name === 'TimeoutError')) throw err
  }
  if (!(await puesta())) {
    await comprobarCampo(menu.select)
    await menu.select.selectOption({ index: indice }, { force: true })
    await menu.select.dispatchEvent('change')
  }
  if (!(await puesta())) throw new ErrorMapaIncompletoGenerali(`${que} no quedó puesta en el selector (PrimeFaces)`)
}

const ESPERA_MODELO_MS = 12_000
const PAUSA_CAMPOS_NUEVOS_MS = 1_500

/** Espera (hasta `esperaMs`) al desplegable «Modelo» de PrimeFaces, distinto del de marcas y con alguna opción real. `null` si no sale. */
export async function esperarMenuModelo(page: Page, selector: Raiz, baseMarca: string, esperaMs = ESPERA_MODELO_MS): Promise<MenuPrimeFaces | null> {
  const fin = Date.now() + esperaMs
  for (;;) {
    const m = await menuPrimeFaces(selector, 'Modelo', 'model')
    if (m && m.base !== baseMarca) {
      const ops = await opcionesSelect(m.select).catch(() => [])
      if (ops.some((o) => !esOpcionVaciaCatalogo(o.texto))) return m
    }
    if (Date.now() >= fin) return null
    await page.waitForTimeout(400)
  }
}

/**
 * Elige el modelo en su SelectOneMenu con el criterio de la marca (igualdad EXACTA normalizada). Varias → atasco `eleccion`; ninguna →
 * «Otros» si hay UNA (se declara en `avisos` como supuesto); sin «Otros» → atasco `eleccion` con las cercanas o todas, sin tocar nada.
 */
export async function elegirModeloPrimeFaces(raiz: Raiz, menu: MenuPrimeFaces, v: VehiculoBuscado, ctx: ContextoPortal, avisos?: string[]): Promise<void> {
  const b = buscadoEnNivel(v, 'modelo')
  if (!b) throw new ErrorMapaIncompletoGenerali('el modelo del vehículo de la oportunidad (el selector de Generali lo exige)', false)
  const opciones = await opcionesSelect(menu.select)
  const textos = opciones.map((o) => o.texto)
  const e = elegirModeloGenerali(textos, b.texto, b.modo)
  if (e.tipo === 'varias' || e.tipo === 'ninguna') {
    const lista = e.cercanas.length > 0 ? e.cercanas : e.tipo === 'ninguna' ? textos.filter((o) => !esOpcionVaciaCatalogo(o)).slice(0, 25) : []
    if (lista.length > 0) throw new ErrorEleccionVersion(lista.map((o): CandidatoVersion => ({ etiqueta: o, codigo: null })))
    throw new ErrorMapaIncompletoGenerali(mensajeAtascoCatalogo('modelo', b.texto, textos, { tipo: 'ninguna' }))
  }
  if (e.tipo === 'otros') avisos?.push(e.supuesto)
  await ponerOpcionPrimeFaces(raiz, menu, opciones[e.indice]!, e.indice, ctx.abrirDesplegableModeloGenerali, ctx.elegirModeloListaGenerali, ctx, 'el modelo elegido en «Modelo»')
}

/**
 * Selector PrimeFaces: «Placas especiales» = «No», marca exacta, «Confirmar» (solo confirma el vehículo) y se PARA con hueco
 * `hueco_mapa` si la pantalla siguiente no es «Identificación del vehículo»: su inventario lo captura el modo exploración.
 */
async function seleccionarVehiculoPrimeFaces(page: Page, selector: Raiz, menu: MenuPrimeFaces, v: VehiculoBuscado, ctx: ContextoPortal, avisos?: string[]): Promise<boolean> {
  if (!ctx.marcarPlacasEspecialesGenerali || !ctx.confirmarVehiculoGenerali || !ctx.abrirDesplegableMarcaGenerali || !ctx.elegirMarcaListaGenerali) throw new ErrorMapaIncompletoGenerali('las puertas guardadas del selector de vehículos (placas especiales, desplegable de marcas y «Confirmar») en el contexto del runner', false)
  if (!ctx.abrirDesplegableModeloGenerali || !ctx.elegirModeloListaGenerali) throw new ErrorMapaIncompletoGenerali('las puertas guardadas del desplegable de modelos (disparador y `li`) en el contexto del runner', false)
  await ctx.marcarPlacasEspecialesGenerali()
  // Lo que hay ANTES de elegir marca: lo que aparezca después y no sea el menú de modelos es campo NUEVO.
  const antes = (await leerCamposSelector(selector)).map((c) => c.clave)
  await elegirMarcaPrimeFaces(selector, menu, v, ctx)
  const modelo = await esperarMenuModelo(page, selector, menu.base)
  if (!modelo) throw new ErrorMapaIncompletoGenerali(`el desplegable «Modelo» del selector de vehículos tras elegir la marca (no apareció en ${Math.round(ESPERA_MODELO_MS / 1000)} s). Campos vistos: ${resumenCamposSelectorGenerali(await leerCamposSelector(selector))}`)
  await elegirModeloPrimeFaces(selector, modelo, v, ctx, avisos)
  await page.waitForTimeout(PAUSA_CAMPOS_NUEVOS_MS)
  const nuevos = camposNuevosSelectorGenerali(antes, await leerCamposSelector(selector), [menu.base, modelo.base])
  if (nuevos.length > 0) {
    // NO se pulsa «Confirmar»: campos que el bot no conoce. Se baja el scroll del selector (la evidencia del runner sale de ahí) y se PARA.
    await recorrerScroll(page, selector)
    const p = await leerPantalla(selector)
    throw new ErrorMapaIncompletoGenerali(`los campos nuevos que salen en el selector de vehículos tras elegir marca y modelo (no se pulsa «Confirmar»): ${resumenCamposSelectorGenerali(nuevos)}. Botones vistos: ${p.botones.join(' · ').slice(0, 400) || '(ninguno)'}`)
  }
  await ctx.confirmarVehiculoGenerali()
  const valoracion = await marcoConTexto(page, 'Identificación del vehículo', 10_000)
  if (valoracion) return false
  const botones: string[] = []
  for (const f of page.frames()) if (!f.isDetached()) botones.push(...(await leerPantalla(f).catch(() => ({ botones: [] as string[] }))).botones)
  // La captura, el recorrido y el inventario de esta pantalla los guarda el runner al parar con un hueco de mapa.
  throw new ErrorMapaIncompletoGenerali(`la pantalla que sigue a «Confirmar» en el selector de vehículos (no es «Identificación del vehículo»; su captura y su inventario los deja el runner). Botones vistos: ${[...new Set(botones)].join(' · ').slice(0, 600) || '(ninguno)'}`)
}

/**
 * «Vehículo» → «Selector de vehículos» (captura 5): tipo «Turismo» y subtipo «Turismos» vienen marcados; la marca, en «Todas
 * las marcas». Modelo y versión: SIN captura; se buscan como desplegables etiquetados «Modelo»/«Versión» y, si no están así,
 * PARA con inventario. Devuelve si alguna elección fue por similitud.
 */
export async function seleccionarVehiculoGenerali(page: Page, marco: Raiz, form: FormularioAuto, ctx: ContextoPortal, avisos?: string[]): Promise<boolean> {
  const v = vehiculoBuscadoGenerali(form)
  if (!v) throw new ErrorTarificador('datos', 'generali/auto: falta el vehículo confirmado por Allianz o Mapfre (Generali no busca por matrícula; asegura lo pone desde la oportunidad)')
  const boton = marco.getByRole('button', { name: 'Vehículo', exact: true }).filter({ visible: true })
  if ((await boton.count()) !== 1) throw new ErrorMapaIncompletoGenerali('el botón «Vehículo» de «Características del vehículo» (captura 4)')
  await ctx.pulsar(boton.first())
  const selector = await marcoConTexto(page, 'Selector de vehículos')
  if (!selector) throw new ErrorMapaIncompletoGenerali('la pantalla «Selector de vehículos» tras pulsar «Vehículo» (captura 5)')
  // v0.2.6: el selector real es PrimeFaces (select oculto + div combobox): ese camino NO busca modelo/versión (sin captura).
  const menuMarcas = await menuPrimeFaces(selector, 'Todas las marcas')
  if (menuMarcas) return seleccionarVehiculoPrimeFaces(page, selector, menuMarcas, v, ctx, avisos)
  const marcas = await controlJuntoA(selector, 'Todas las marcas', 'select', ctx.formador)
  if (!marcas || !(await esSelectNativo(marcas))) throw new ErrorMapaIncompletoGenerali(`el desplegable «Todas las marcas» del selector (captura 5; ¿no es un <select> nativo?). Desplegables vistos: ${await describirSelects(selector)}`)
  let similitud = await elegirNivel(marcas, 'marca', v, form, ctx)
  await page.waitForTimeout(1_500)
  const modelo = await selectPorEtiqueta(selector, /^\s*modelos?\s*:?\s*$/i)
  if (!modelo) throw new ErrorMapaIncompletoGenerali(`la pantalla del selector tras elegir la marca (modelo y versión): SIN CAPTURA; no hay un desplegable «Modelo». Desplegables vistos: ${await describirSelects(selector)}`)
  similitud = (await elegirNivel(modelo, 'modelo', v, form, ctx)) || similitud
  await page.waitForTimeout(1_500)
  const version = await selectPorEtiqueta(selector, /^\s*versi[oó]n(es)?\s*:?\s*$/i)
  if (!version) throw new ErrorMapaIncompletoGenerali(`el desplegable de versión del selector tras elegir el modelo: SIN CAPTURA; no hay un desplegable «Versión». Desplegables vistos: ${await describirSelects(selector)}`)
  similitud = (await elegirNivel(version, 'version', v, form, ctx, avisos)) || similitud
  const valoracion = await marcoConTexto(page, 'Identificación del vehículo', 10_000)
  if (!valoracion) {
    const p = await leerPantalla(selector)
    throw new ErrorMapaIncompletoGenerali(`cómo se confirma el vehículo elegido en el selector (sin captura del paso que lleva a «Identificación del vehículo»). Botones vistos: ${p.botones.join(' · ').slice(0, 600) || '(ninguno)'}`)
  }
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
  // Verificación (Alberto): si el portal la pide, la MISMA matrícula otra vez. La captura 6 tiene UN solo campo: es OPCIONAL
  // (0 → se sigue; 1 → se rellena; >1 → para). Si no está, se vuelve a mirar tras una espera corta (puede pintarse al salir).
  const buscarVerificacion = async (): Promise<Locator[]> => {
    const textos = marco.getByText(/matr[ií]cula/i).filter({ visible: true })
    const out: Locator[] = []
    for (let i = 0; i < (await textos.count().catch(() => 0)); i++) {
      const t = (await textos.nth(i).innerText().catch(() => '')).trim()
      if (esEtiquetaVerificacionMatricula(t)) out.push(textos.nth(i).locator("xpath=following::input[not(@type='hidden')][1]"))
    }
    return out
  }
  let verif = await buscarVerificacion()
  if (verif.length === 0) {
    await page.waitForTimeout(ESPERA_VERIFICACION_MS)
    verif = await buscarVerificacion()
  }
  const dv = decidirVerificacionMatricula(verif.length)
  if (dv.tipo === 'parar') throw new ErrorMapaIncompletoGenerali(dv.motivo)
  if (dv.tipo === 'rellenar') await escribir(verif[0]!, m.valor, ctx)

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

// ───────────────────────── 7 · resto de «Datos de Valoración» + «Garantías y Resultados» (v0.2.0) ─────────────────────────

const TIPOS_TEXTO = new Set(['text', 'tel', 'number', 'date', 'search', ''])

/**
 * Mapa PROVISIONAL de tomador/conductor/antecedentes (`ETIQUETAS_RIESGO_GENERALI`): para cada campo de TEXTO registrado cuya
 * etiqueta casa EXACTA con una clave, VACÍO, editable y único para esa clave, teclea el dato del riesgo (antecedentes: dato o
 * supuesto favorable ya declarado). Sin respaldo de IA (no se adivina un campo sin captura). Devuelve las claves rellenadas.
 */
export async function rellenarMapaProvisionalGenerali(
  marco: Raiz,
  pantalla: PantallaLeida,
  form: Parameters<typeof valorRiesgoGenerali>[1],
  ctx: ContextoPortal,
): Promise<string[]> {
  const porClave = new Map<string, { etiqueta: string; editable: boolean; vacio: boolean }[]>()
  for (const c of pantalla.campos) {
    const k = claveEtiquetaRiesgoGenerali(c.etiqueta)
    if (!k) continue
    const tipo = c.tipo.split(',')[0]!
    const lista = porClave.get(k) ?? []
    lista.push({ etiqueta: c.etiqueta, editable: TIPOS_TEXTO.has(tipo) && !c.tipo.includes(',ro'), vacio: c.valor === 'vacío' })
    porClave.set(k, lista)
  }
  const hechos: string[] = []
  for (const [k, lista] of porClave) {
    if (lista.length !== 1 || !lista[0]!.editable || !lista[0]!.vacio) continue
    const valor = valorRiesgoGenerali(k as Parameters<typeof valorRiesgoGenerali>[0], form)
    if (valor === null) continue
    const campo = await controlJuntoA(marco, lista[0]!.etiqueta, 'input')
    if (!campo) continue
    if ((await campo.inputValue().catch(() => 'x')).trim() !== '') continue
    await escribir(campo, valor, ctx)
    hechos.push(k)
  }
  return hechos
}

/** Oferta de Generali con el importe del lector tolerante: avisos claros de lo que NO se sabe y de lo SUPUESTO. */
export function ofertaGenerali(eur: number, supuestos: string | null): OfertaNormalizada {
  return {
    compania: 'generali',
    producto: 'Auto · Turismos (Ramo UV)',
    primaAnualEur: eur,
    primaNetaEur: null,
    fraccionamiento: null,
    importeReciboEur: null,
    coberturas: [],
    franquicias: [],
    validaHasta: null,
    referenciaPortal: null,
    pdf: null,
    desglose: null,
    avisos: [
      'Importe leído de «Garantías y Resultados» con un lector tolerante (bot 0.2.0, sin captura de esa pantalla): compruébalo en el portal; no consta la modalidad ni si es anual.',
      ...(supuestos ? [supuestos] : []),
    ],
  }
}

/** Espera el precio tras la subpestaña: un único importe, estable en dos lecturas; si no, la última lectura. */
async function esperarPrecioGenerali(page: Page, ignorar: readonly number[], ms = ESPERA_PRECIO_MS): Promise<ReturnType<typeof leerPrecioGenerali>> {
  const fin = Date.now() + ms
  let ultima: ReturnType<typeof leerPrecioGenerali> = { tipo: 'ninguno' }
  for (;;) {
    ultima = leerPrecioGenerali(await textoPagina(page), ignorar)
    if (ultima.tipo === 'unico') {
      await page.waitForTimeout(1_000)
      const otra = leerPrecioGenerali(await textoPagina(page), ignorar)
      if (otra.tipo === 'unico' && otra.eur === ultima.eur) return otra
      ultima = otra
    }
    if (Date.now() >= fin) return ultima
    await page.waitForTimeout(800)
  }
}

/**
 * Tras «Roles»: scroll del panel, registro de la pantalla, mapa provisional, «Garantías y Resultados» por la compuerta del
 * guard y lectura del precio. Devuelve la oferta o PARA (`ErrorMapaIncompletoGenerali`) con el registro de donde se quedó; el
 * runner guarda además el HTML redactado, el inventario de estructura y el recorrido.
 */
export async function hastaPrecioGenerali(page: Page, form: FormularioAuto, supuestos: string[], ctx: ContextoPortal, opciones: { esperaPrecioMs?: number } = {}): Promise<ResultadoAdaptador> {
  const paso = <T>(n: Parameters<ContextoPortal['paso']>[0], fn: () => Promise<T>): Promise<T> => (typeof ctx.paso === 'function' ? ctx.paso(n, fn) : fn())
  const ant = conAntecedentesFavorables(form)
  for (const x of ant.supuestos) if (!supuestos.includes(x)) supuestos.push(x)
  const texto = textoSupuestos(supuestos)
  const marco = (await marcoConTexto(page, 'Identificación del vehículo', 5_000)) ?? page
  const { pantalla, hechos } = await paso('formulario', async () => {
    await recorrerScroll(page, marco)
    const antes = await leerPantalla(marco)
    const hechos = await rellenarMapaProvisionalGenerali(marco, antes, ant.formulario, ctx)
    // Tras rellenar, se relee (el portal puede pintar campos nuevos al salir de uno).
    if (hechos.length > 0) await recorrerScroll(page, marco)
    return { pantalla: hechos.length > 0 ? await leerPantalla(marco) : antes, hechos }
  })
  ctx.log?.(`generali/auto: Datos de Valoración: ${pantalla.campos.length} campos, ${pantalla.botones.length} botones, mapa provisional: ${hechos.join(',') || 'nada'}`)
  const datos = `Datos de Valoración: ${resumenPantallaGenerali(pantalla, 700)}`
  if (!ctx.pulsarSubpestanaGenerali) throw new ErrorMapaIncompletoGenerali(`la puerta guardada de «${SUBPESTANA_PRECIO_GENERALI}» en el contexto del runner; ${datos}`)
  // Importes que YA estaban antes del clic no son el precio (la lectura de después los ignora).
  const lAntes = leerPrecioGenerali(await textoPagina(page))
  const ignorar = lAntes.tipo === 'unico' ? [lAntes.eur] : lAntes.tipo === 'varios' ? lAntes.candidatos.map((c) => c.eur) : []
  await paso('tarificar', () => ctx.pulsarSubpestanaGenerali!(SUBPESTANA_PRECIO_GENERALI))
  const lectura = await paso('lectura_primas', () => esperarPrecioGenerali(page, ignorar, opciones.esperaPrecioMs ?? ESPERA_PRECIO_MS))
  if (lectura.tipo === 'unico') return { ofertas: [ofertaGenerali(lectura.eur, texto)] }
  const despues = await leerPantallaPagina(page)
  const que = lectura.tipo === 'varios'
    ? `${lectura.candidatos.length} importes candidatos y no se elige uno a ciegas: ${lectura.candidatos.map((c) => `${c.eur} € («${c.linea.slice(0, 60)}»)`).join(' · ')}`
    : 'ningún importe legible con «prima/precio/importe/total»'
  throw new ErrorMapaIncompletoGenerali(`el PRECIO de «${SUBPESTANA_PRECIO_GENERALI}» (${que}). Pantalla: ${resumenPantallaGenerali(despues, 900)}. Mapa provisional: ${hechos.join(',') || 'nada'}${texto ? `; ${texto}` : ''}`)
}

/**
 * Adaptador de Generali Turismos (v0.2.0). Llega a «Datos de Valoración» (captura 6), recorre y registra el resto del panel,
 * pulsa «Garantías y Resultados» por la compuerta del guard y devuelve la oferta si lee un precio; donde no sabe seguir, PARA
 * con `ErrorMapaIncompletoGenerali` + registro de la pantalla + inventario + HTML, para mapearlo sin pedir capturas.
 */
export const generaliAuto = {
  compania: 'generali',
  ramo: 'auto',
  credencial: 'GENERALI_MEDIADORES',
  version: VERSION_GENERALI_AUTO,
  // SMS de Okta (cada 30 días por dispositivo): el runner releva el código por Telegram y recuerda el dispositivo (relevo-sms.ts).
  codigoSms: 'okta-generali',
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
    // v0.2.4: el modal «¿Sabías qué…?» tapa el portal al llegar; si está, se cierra por la compuerta del guard (si no, nada).
    await ctx.cerrarAvisoSabiasQueGenerali?.()
    await ctx.entrarTurismosGenerali()
    const marco = await marcoConTexto(page, 'Datos de Valoración')
    if (!marco) throw new ErrorMapaIncompletoGenerali('el formulario «Valoración Riesgo › Datos de Valoración» tras el menú de Turismos (captura 4)')
    await mediadorDelFormulario(marco, ctx)
    const avisosVersion: string[] = []
    const similitud = await seleccionarVehiculoGenerali(page, marco, form, ctx, avisosVersion)
    const supuestos = await rellenarValoracionGenerali(page, form, ctx, hoy)
    // v0.2.10: la versión elegida SOLA (equivalentes) va delante, declarada («revisar en la emisión»).
    supuestos.unshift(...avisosVersion)
    if (similitud) supuestos.unshift(AVISO_SIMILITUD_GENERALI)
    // Antecedentes (regla 3): sin dato, supuesto FAVORABLE declarado (lo añade `hastaPrecioGenerali`, que también los teclea
    // si el formulario tiene esos campos con etiqueta del mapa provisional).
    return hastaPrecioGenerali(page, form, supuestos, ctx)
  },
} as const
