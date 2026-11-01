// Barrera de EMISIÓN en el navegador (05/10/2026). TARIFICAR ≠ EMITIR.
//   1. Toda navegación (y toda petición que no sea GET) a una URL que casa con el patrón se ABORTA
//      antes de salir, y el trabajo queda marcado → `error_definitivo`. También si la ACCIÓN viaja en los
//      parámetros: la query de la URL o, en las que no son GET, el CUERPO (`action=store` del framework
//      legado de ePAC: la URL es siempre la misma y la acción va en el POST).
//   2. Los adaptadores NO hacen `.click()`: usan `pulsar()`, que mira el texto, aria-label, title,
//      value, id, name y href del elemento y se niega a pulsar si casa con el patrón. (Lo vigila
//      `test/regression-tarificador-rpa.test.ts` en la raíz.)

import type { BrowserContext, Dialog, Frame, Locator, Page, Request } from 'playwright'
import { ErrorTarificador } from './errores.ts'
import { indiceOpcionGenerica, indicesCompaniaActualCompuesta } from './compania-actual.ts'
import {
  BLOQUEO,
  CONCEPTOS_ACCION,
  RE_EXCLUIR_DESCARGA,
  RE_OBJETO_DESCARGA,
  RE_OBJETO_PROPUESTA,
  RE_VERBO_DESCARGA,
  RE_VERBO_DESCARGA_CON_OBJETO,
  regexBloqueoRotulo,
  regexPalabras,
  regexRotuloConAdornos,
  rotuloMayus,
  terminoPropio,
  type Termino,
} from './vocabulario.ts'
import {
  ID_CONFIRMAR_DATOS_PERSONAS_GENERALI,
  MEDIADOR_GENERALI,
  PREFIJO_ID_DATOS_PERSONAS_GENERALI,
  esPantallaGarantiasCapitalesGenerali,
  leerPrecioGenerali,
  mensajesValidacionGenerali,
  opcionMediadorGenerali,
  pestanaDatosPersonasActivaGenerali,
  tipoPestanaPersonasGenerali,
  urlDatosPersonasGenerali,
  type PestanaPersonasLeida,
} from './adapters/generali/reglas.ts'
import {
  EmisionBloqueadaError,
  MaquinaFases,
  bloqueoAvance,
  bloqueoGuardadoPresupuesto,
  casaGuardadoEnDialogo,
  clasificarAccionPortal,
  esGuardadoEnDialogoAutorizado,
  MAX_GUARDADOS_DIALOGO,
  descripcionesSinExcepcionProyecto,
  comprobarBoton,
  esAvanceAutorizado,
  avancePorIdAutorizado,
  avanceSinTextoAutorizado,
  RE_NAME_ACCION_FINAL_SIN_TEXTO,
  rotuloNeutroSinTexto,
  type AvanceSinTexto,
  onclickCasaFormaSinTexto,
  onclickNeutralizado,
  type NeutralizacionOnclick,
  rutaCasaAvancePorId,
  onclickNormalizado,
  rutaDeMarco,
  esLanzadorAplicacionNseMapfre,
  neutralizarRutaTolerable,
  detalleCuerpoToleradoConAccionReal,
  textoDetalleCuerpo,
  RE_ACCION_REAL_TRAS_PREFIJO,
  type RutaTolerable,
  TEXTO_ACCESO_NSE_MAPFRE,
  esMatriculaEspanola,
  normalizarMatricula,
  esBotonDeListaBlanca,
  MOTIVO_FRONTERA_CUENTA,
  parametrosParecenEmision,
  cuerpoLlevaAccionFinal,
  senalCuentaBancaria,
  pareceEmision,
  redactarDatosPersonales,
  extraerReferenciaPresupuesto,
  referenciaPresupuestoValida,
  usarPermisoEmision,
  type ModalidadPortal,
  type PermisoEmision,
  type PestanaActiva,
  type ElementoInventario,
  type MarcoInventario,
  type PantallaGuardado,
} from '@central/module-tarificacion'

/**
 * El «Aceptar» de Datos básicos del SERVLET de Allianz (`<div id="aceptar" onclick="btnAceptar();">`, no un button) que el
 * inventario de EXPLORACIÓN recoge (solo LEER: `inventario-dom.ts`). Vive aquí porque solo guard.ts nombra «Aceptar»; pulsarlo
 * sigue siendo solo `pulsarExploracionAutorizada` (y el módulo solo lo deja avanzar si es el «Aceptar» autorizado).
 */
export const SELECTOR_AVANCE_SERVLET = 'div#aceptar[onclick]'

/**
 * Ventana de RED de la emisión autorizada (10/10/2026): se abre SOLO dentro de `pulsarEmisionAutorizada`, después de
 * gastar el permiso de un solo uso y justo antes de su único clic, para que las peticiones que ESE clic provoca (que casan
 * con el patrón de emisión) no se aborten. Dura como mucho `VENTANA_RED_EMISION_MS` y el runner la cierra en cuanto lee
 * el resultado. Mientras está abierta el robot no pulsa nada más (`pulsar()` sigue cerrado: comprueba el patrón igual).
 */
export const VENTANA_RED_EMISION_MS = 90_000
export type VentanaRed = { abierta(): boolean; cerrar(): void }

export type GuardEmision = {
  violacion(): EmisionBloqueadaError | null
  comprobar(): void
  fases: MaquinaFases
  ventana: VentanaRed
  /** Ventana de red del AVANCE DE PESTAÑA autorizado (Moto, 13/10/2026). Solo la abre `pulsarAvancePestanaAutorizado`. */
  avance: VentanaRed
  /** Ventana de red del GUARDADO DE PRESUPUESTO (14/10/2026). Solo la abren `pulsarGuardadoPresupuesto` y, en modo estrecho, `pulsarGenerarProyectoMapfre`. */
  guardado: VentanaRed
}

/**
 * AVANCE DE PESTAÑA AUTORIZADO — Allianz ePAC Moto («Motos-online»). Autorización EXPRESA de Alberto (13/10/2026, «no hay
 * problema con aceptar»): el robot puede pasar de «Riesgo municipio» a «Datos básicos» (`td#datosBasicos`) y de «Datos
 * básicos» a «Tarificar» (`td#rate`) aunque esas pestañas ejecuten el manejador «Aceptar» del portal. Riesgo ACEPTADO: puede
 * quedar un PROYECTO guardado en Allianz (no una póliza). En Tarificar solo se abre la pestaña y se leen primas.
 *
 * LISTA BLANCA CERRADA (cualquier otro selector → `EmisionBloqueadaError` sin pulsar). Por cada selector, del DOM de la
 * grabación del 13/10: id, texto y `onclick` EXACTOS del `td`; el `action` del `form#formulari` de la pantalla de ORIGEN (es
 * lo que el clic envía) y el de la de DESTINO (así se confirma la llegada); y los ÚNICOS destinos (origen + ruta, sin query)
 * a los que puede ir una petición que no sea GET mientras la ventana está abierta. La grabación NO registra la red: los
 * destinos son el `action` del formulario que envía `aceptar_onclick()`; si en real el portal manda otro POST, el trabajo
 * muere (fail-closed) y se añade aquí tras verlo. Lo vigila `test/regression-tarificador-rpa.test.ts` (romperla → rojo).
 *
 * `ajaxValidacion` (20/10/2026, Moto 0.7.7): POST de VALIDACIÓN del propio formulario que el portal dispara al perder el foco
 * un campo justo cuando se pulsa la pestaña. Solo pasan por la capa (b), nunca relajan la (a) («aceptar» sigue bloqueado en
 * ellos), y solo si casan EXACTOS: método POST, origen + ruta, `resource` y el resto de parámetros de la query, y las claves
 * del cuerpo (`ajaxValidacionAvancePermitida`).
 */
export type AjaxValidacionAvance = Readonly<{
  /** Origen + ruta exactos. */
  endpoint: string
  /** Valor EXACTO del parámetro `resource` (la clase Java que atiende la llamada). */
  resource: string
  /** Únicos parámetros de la query además de `resource` (tokens de la sesión del framework), cada uno una vez. */
  parametros: readonly string[]
  /** Parámetros de query que PUEDEN venir además (p. ej. tokens que añade el framework), cada uno como mucho una vez. */
  parametrosOpcionales?: readonly string[]
  /** Únicas claves del cuerpo (urlencoded), cada una una vez, y la forma de su valor. */
  cuerpo: readonly string[]
  valorCuerpo: RegExp
  /** 0.3.25: forma propia de UNA clave del cuerpo (manda sobre `valorCuerpo` para esa clave). Sin la clave = `valorCuerpo` para todas. */
  valorCuerpoPorClave?: Readonly<Record<string, RegExp>>
  /**
   * 0.3.19: ningún valor del cuerpo (ni la query entera) puede nombrar una acción final ni un dato bancario
   * (`RE_ACCION_REAL_TRAS_PREFIJO`) y el cuerpo tiene que pasar `cuerpoLlevaAccionFinal`. Sin la clave = solo la forma (`valorCuerpo`).
   */
  estricto?: true
}>

/**
 * Comprobación de la LISTA NEGRA del NIF del tomador de ePAC (`validarNifAjaxidNifTaker()` del widget IdentificationNumber
 * de «Riesgo municipio», captura del 20/10/2026): el `onchange` de `#idNifTaker_doc` hace
 * `AjaxRequest('/drpc18/AJAXServlet?resource=pt.allianz.clientes.negocio.BlackListOperationsAjax&…thread=…&…synch=…',
 * 'idNumberBL=<NIF>')` y pinta el texto devuelto como error del campo (vacío = NIF correcto). Es una CONSULTA: no lleva
 * acción del formulario. El adaptador ya la dispara fuera de cualquier ventana (dispatchEvent('change')) y el guard la deja
 * pasar; al pulsar `td#datosBasicos` el campo pierde el foco, el navegador repite el `change` y la misma consulta cae dentro
 * de la ventana del avance (incidente 0.7.6). Esto la admite ahí, y SOLO ahí.
 */
export const AJAX_LISTA_NEGRA_NIF_ALLIANZ: AjaxValidacionAvance = Object.freeze({
  endpoint: 'https://www.e-pacallianz.com/drpc18/AJAXServlet',
  resource: 'pt.allianz.clientes.negocio.BlackListOperationsAjax',
  parametros: Object.freeze(['com.ats.webbeans.struts.thread', 'com.ats.webbeans.struts.synch']),
  cuerpo: Object.freeze(['idNumberBL']),
  valorCuerpo: /^[A-Za-z0-9]{0,20}$/,
})

/**
 * Ayuda contextual de ePAC (`AyudaAplicacionesAjax`, captura del 20/10/2026, incidente 0.7.7): en el `ready` de CADA pantalla del
 * portal, `AjaxRequest('/drpc18/AJAXServlet?resource=com.ats.sea.visuals.util.AyudaAplicacionesAjax', 'pageId=<PAGEID>&codCia=<cia>')`
 * pregunta si hay ayuda para esa pantalla y solo muestra u oculta el botón de ayuda (`ret.ayuda`). Es SOLO LECTURA. Se dispara
 * al cargar la pantalla de destino del avance, es decir DENTRO de la ventana (td#datosBasicos y td#rate).
 */
export const AJAX_AYUDA_APLICACIONES_ALLIANZ: AjaxValidacionAvance = Object.freeze({
  endpoint: 'https://www.e-pacallianz.com/drpc18/AJAXServlet',
  resource: 'com.ats.sea.visuals.util.AyudaAplicacionesAjax',
  parametros: Object.freeze([] as string[]),
  parametrosOpcionales: Object.freeze(['com.ats.webbeans.struts.thread', 'com.ats.webbeans.struts.synch']),
  cuerpo: Object.freeze(['pageId', 'codCia']),
  valorCuerpo: /^[A-Za-z0-9_.:$-]{0,64}$/,
})

/**
 * 0.3.25 (Allianz patinete real 30/10/2026, 6255c5e7…, «Figuras Intervinientes»): la ayuda de drvp00 llegó con un `pageId` de longitud 26,
 * letras+dígitos+símbolos y un símbolo FUERA de `_.:$-` (el diagnóstico no decía cuál: ahora lo dice, ver `formaValor`). Alfabeto CERRADO solo
 * para `pageId` de drvp00: letras ASCII y latinas con tilde/cedilla (ePAC es de Allianz Portugal), dígitos y la puntuación de un id de
 * página/recurso (`_ . : $ - / # , | ( ) [ ] ~ ! *`), de 1 a 64. Fuera, siempre: espacio, `& = % + ; ' " < > \ @ { } ?` (estructura de
 * urlencoded/JS/HTML o forma de correo). El `estricto` de la regla sigue mirando acción final y dato bancario en cada valor.
 */
export const RE_PAGEID_AYUDA_DRVP00 = /^[A-Za-z0-9\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF_.:$\/#,|()[\]~!*-]{1,64}$/
/** 0.3.25: `codCia` de la misma ayuda: código corto alfanumérico (el de drpc18 compartía la forma del pageId; aquí se estrecha). */
export const RE_CODCIA_AYUDA_DRVP00 = /^[A-Za-z0-9]{1,8}$/

/**
 * LISTA BLANCA de recursos AJAX de SOLO LECTURA (consulta/ayuda/validación) admitidos durante un avance de pestaña. Cada
 * entrada fija endpoint, `resource`, query y cuerpo. Todo lo demás (Emitir/Grabar/Contratar/Guardar/Pago/Firma…) sigue abortado.
 */
/**
 * 0.3.19 (regresión real 29/10/2026, Allianz patinete, «Figuras Intervinientes»): la MISMA ayuda contextual, en la aplicación `drvp00`
 * (`/drvp00/AJAXServlet`). Se dispara en el `ready` de la pantalla de destino del avance de paso por id: si carga antes de que el robot vea
 * desaparecer el «Aceptar» (sondeo de 250 ms), cae DENTRO de la ventana y la capa (b) la abortaba. Solo para los avances por id de drvp00,
 * con el cuerpo ESTRICTO (sin acción final ni dato bancario en ningún valor).
 */
export const AJAX_AYUDA_APLICACIONES_ALLIANZ_DRVP00: AjaxValidacionAvance = Object.freeze({
  ...AJAX_AYUDA_APLICACIONES_ALLIANZ,
  endpoint: 'https://www.e-pacallianz.com/drvp00/AJAXServlet',
  estricto: true as const,
  valorCuerpoPorClave: Object.freeze({ pageId: RE_PAGEID_AYUDA_DRVP00, codCia: RE_CODCIA_AYUDA_DRVP00 }),
})

export const AJAX_LECTURA_ALLIANZ: readonly AjaxValidacionAvance[] = Object.freeze([AJAX_AYUDA_APLICACIONES_ALLIANZ])

/** Claves que la regla declara (se pueden nombrar en un mensaje); cualquier otra podría ser un dato (NIF, nombre) y NUNCA se imprime. */
const declaradasDe = (r: AjaxValidacionAvance): ReadonlySet<string> =>
  new Set(['resource', ...r.parametros, ...(r.parametrosOpcionales ?? []), ...r.cuerpo])
/** Nombra las claves declaradas y cuenta (sin nombrar) las no declaradas. */
const listaClaves = (ks: readonly string[], decl: ReadonlySet<string>): string => {
  const unicas = [...new Set(ks)]
  const nombradas = unicas.filter((k) => decl.has(k))
  const n = unicas.length - nombradas.length
  return [...nombradas, ...(n ? [`${n} clave(s) no declarada(s)`] : [])].join(',')
}

/**
 * Forma de un valor SIN revelarlo: longitud y categorías de caracteres presentes (nunca el texto; puede llevar un NIF). 0.3.25: los
 * símbolos ASCII de puntuación se NOMBRAN (`símbolos «/#»`, sin repetir y en orden; ni letras ni cifras: no identifican a nadie) y lo que no es
 * ASCII se cuenta como categoría `no-ASCII` sin decir cuál (una letra con tilde puede ser de un nombre). Exportada para su cepo.
 */
export function formaValor(v: string): string {
  const cat: string[] = []
  if (/[A-Za-z]/.test(v)) cat.push('letras')
  if (/[0-9]/.test(v)) cat.push('dígitos')
  if (/\s/.test(v)) cat.push('espacios')
  const simbolos = [...new Set(v.match(/[!-/:-@[-`{-~]/g) ?? [])].sort().join('')
  if (simbolos) cat.push(`símbolos «${simbolos}»`)
  if (/[^\x00-\x7F]/.test(v)) cat.push('no-ASCII')
  return `longitud ${v.length}, ${cat.join('+') || 'vacío'}`
}

const VALOR_QUERY = /^[A-Za-z0-9_.-]{0,64}$/

/** Por qué `r` rechaza la petición (solo nombres de claves y categorías, NUNCA valores), o `null` si la admite. */
function motivoRechazoRegla(r: AjaxValidacionAvance, u: URL, cuerpo: string | null): string | null {
  const opc = r.parametrosOpcionales ?? []
  const decl = declaradasDe(r)
  const qk = [...u.searchParams.keys()]
  if (new Set(qk).size !== qk.length) return `clave de query repetida: ${listaClaves(qk.filter((k, i) => qk.indexOf(k) !== i), decl)}`
  const sobran = qk.filter((k) => k !== 'resource' && !r.parametros.includes(k) && !opc.includes(k))
  if (sobran.length) return `clave de query no permitida: ${listaClaves(sobran, decl)}`
  const faltan = r.parametros.filter((k) => !qk.includes(k))
  if (faltan.length) return `falta clave de query: ${listaClaves(faltan, decl)}`
  for (const p of [...r.parametros, ...opc].filter((k) => qk.includes(k))) {
    if (!VALOR_QUERY.test(u.searchParams.get(p) ?? '\u0000')) return `forma de valor de query no permitida en «${p}» (${formaValor(u.searchParams.get(p) ?? '')})`
  }
  const texto = cuerpo ?? ''
  if (texto === '') return 'cuerpo vacío o ilegible (se esperaban claves urlencoded)'
  if (/^\s*[{[]/.test(texto) || texto.startsWith('--')) return 'cuerpo no urlencoded (JSON o multipart)'
  const cp = new URLSearchParams(texto)
  const ck = [...cp.keys()]
  if (new Set(ck).size !== ck.length) return `clave de cuerpo repetida: ${listaClaves(ck.filter((k, i) => ck.indexOf(k) !== i), decl)}`
  const extra = ck.filter((k) => !r.cuerpo.includes(k))
  if (extra.length) return `clave de cuerpo no permitida: ${listaClaves(extra, decl)}`
  const falta = r.cuerpo.filter((k) => !ck.includes(k))
  if (falta.length) return `falta clave de cuerpo: ${listaClaves(falta, decl)}`
  for (const k of r.cuerpo) {
    if (!(r.valorCuerpoPorClave?.[k] ?? r.valorCuerpo).test(cp.get(k) ?? '\u0000')) return `forma de valor de cuerpo no permitida en «${k}» (${formaValor(cp.get(k) ?? '')})`
  }
  if (r.estricto === true) {
    for (const k of r.cuerpo) if (RE_ACCION_REAL_TRAS_PREFIJO.test(cp.get(k) ?? '')) return `valor de cuerpo con acción final o dato bancario en «${k}»`
    if ([...u.searchParams.entries()].some(([k, v]) => k !== 'resource' && RE_ACCION_REAL_TRAS_PREFIJO.test(`${k}=${v}`))) return 'query con acción final o dato bancario'
    if (cuerpoLlevaAccionFinal(texto)) return 'cuerpo con acción final (inspección estricta)'
  }
  return null
}

/**
 * Por qué NO es admisible esta petición como `ajaxValidacion` del avance (o `null` si lo es). PURA. Solo nombres de claves y
 * categorías: ni valores del cuerpo ni de la query (pueden llevar un NIF). Primero lo grueso (método, esquema, host, ruta,
 * `resource`) y, si el `resource` casa con una regla, el primer detalle de query/cuerpo que no cuadra con ESA regla.
 */
export function motivoAjaxRechazado(metodo: string, url: string, cuerpo: string | null, reglas: readonly AjaxValidacionAvance[]): string | null {
  if (metodo !== 'POST') return `método ${metodo} (se exige POST)`
  if (reglas.length === 0) return 'este avance no declara ninguna validación AJAX'
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return 'URL ilegible'
  }
  if (u.protocol !== 'https:') return 'protocolo distinto de https'
  if (u.username || u.password) return 'URL con credenciales'
  if (u.hash) return 'URL con fragmento'
  const porRuta = reglas.filter((r) => `${u.origin}${u.pathname}` === r.endpoint)
  if (porRuta.length === 0) {
    const e = reglas.map((r) => { try { return new URL(r.endpoint) } catch { return null } }).find((x): x is URL => x !== null)
    if (e && u.host !== e.host) return `host distinto del esperado (${u.host === `www.${e.host}` || `www.${u.host}` === e.host ? 'difiere solo en «www.»' : 'otro dominio'})`
    return 'ruta distinta de la esperada'
  }
  const resource = u.searchParams.get('resource')
  if (resource === null) return 'la query no trae «resource»'
  const rr = porRuta.filter((r) => r.resource === resource)
  if (rr.length === 0) return 'resource fuera de la lista blanca de lecturas'
  let primero: string | null = null
  for (const r of rr) {
    const m = motivoRechazoRegla(r, u, cuerpo)
    if (m === null) return null
    primero ??= m
  }
  return primero
}

/**
 * ¿Es esta petición una de las `ajaxValidacion` del avance vigente? PURA. Exige método POST; https sin credenciales ni
 * fragmento; origen + ruta exactos; query = `resource` (valor exacto) + los `parametros` declarados (cada uno una vez, valor
 * de token corto alfanumérico); cuerpo urlencoded con EXACTAMENTE las claves de `cuerpo` y valor de la forma declarada.
 * Cualquier otra cosa → `false` (y la capa (b) aborta). El porqué de un `false` lo da `motivoAjaxRechazado`.
 */
export function ajaxValidacionAvancePermitida(metodo: string, url: string, cuerpo: string | null, reglas: readonly AjaxValidacionAvance[]): boolean {
  return motivoAjaxRechazado(metodo, url, cuerpo, reglas) === null
}

export const AVANCES_PESTANA_AUTORIZADOS = Object.freeze({
  'td#datosBasicos': Object.freeze({
    id: 'datosBasicos',
    texto: 'Datos básicos',
    formOrigen: '/drpc18/riesgoMunicipio/control.do',
    formDestino: '/drpc18/datosBasicos/control.do',
    endpoints: Object.freeze(['https://www.e-pacallianz.com/drpc18/riesgoMunicipio/control.do']),
    ajaxValidacion: Object.freeze([AJAX_LISTA_NEGRA_NIF_ALLIANZ, ...AJAX_LECTURA_ALLIANZ]),
  }),
  'td#rate': Object.freeze({
    id: 'rate',
    texto: 'Tarificar',
    formOrigen: '/drpc18/datosBasicos/control.do',
    formDestino: '/drpc18/tarifa/control.do',
    endpoints: Object.freeze(['https://www.e-pacallianz.com/drpc18/datosBasicos/control.do']),
    ajaxValidacion: Object.freeze([...AJAX_LECTURA_ALLIANZ]),
  }),
})
export type SelectorAvancePestana = keyof typeof AVANCES_PESTANA_AUTORIZADOS

/**
 * EXCEPCIÓN EXACTA (Alberto, 20/10/2026, trabajo real 08abe9d5): el ÚNICO confirm() que NO tumba un avance. Al pasar de Riesgo
 * municipio a Datos básicos de Allianz moto, el portal pone por su cuenta un primer periodo de menos de 355 días y pregunta si lo
 * alarga 1 mes. Decisión de Alberto: se responde SIEMPRE «No» (dismiss; nunca se alarga) y el avance sigue, con un AVISO visible en
 * el presupuesto (la prima no es anual). Solo ese texto (normalizado), solo en `td#datosBasicos`, una vez por trabajo. Cualquier otro
 * confirm, o este mismo una segunda vez, sigue tumbando el avance.
 */
export const CONFIRMS_AVANCE_ACEPTABLES: Readonly<Partial<Record<SelectorAvancePestana, Readonly<{ texto: string; supuesto: string }>>>> = Object.freeze({
  'td#datosBasicos': Object.freeze({
    texto: 'Primer periodo inferior a 355 días. ¿Desea alargar el término 1 mes más?',
    supuesto: 'Allianz: primer periodo inferior a un año (menos de 355 días; el portal no da la duración exacta); la prima no es anual y no es directamente comparable',
  }),
})

/** Texto de un diálogo para compararlo: sin `<br>`, NFC, espacios colapsados. Puro. */
export function normalizarTextoDialogo(bruto: string): string {
  return bruto.replace(/<br\s*\/?>/gi, ' ').normalize('NFC').replace(/\s+/g, ' ').trim()
}

/** ¿Es ESTE diálogo la excepción exacta del avance `selector`? Puro: solo `confirm`, texto normalizado IGUAL y no visto antes en el trabajo. */
export function confirmAvanceAceptable(selector: string, tipo: string, mensaje: string, yaAceptado: boolean): boolean {
  if (yaAceptado || tipo !== 'confirm' || !Object.hasOwn(CONFIRMS_AVANCE_ACEPTABLES, selector)) return false
  const regla = CONFIRMS_AVANCE_ACEPTABLES[selector as SelectorAvancePestana]
  return regla !== undefined && normalizarTextoDialogo(mensaje) === regla.texto
}

const CONFIRMS_ACEPTADOS = new WeakMap<GuardEmision, Set<string>>()
const SUPUESTOS_AVANCE = new WeakMap<Page, string[]>()

/** Avisos que dejó la excepción exacta (confirm respondido «No») para el presupuesto. */
export function supuestosAvanceAceptados(page: Page): readonly string[] {
  return [...(SUPUESTOS_AVANCE.get(page) ?? [])]
}
/** Tope de la ventana de red del avance: el clic + la carga de la pestaña destino. Se cierra antes en cuanto se llega (finally). */
export const VENTANA_RED_AVANCE_MS = 20_000

/**
 * ¿Puede ir a `url` una petición que no es GET durante la ventana del avance? Solo si su origen + ruta es EXACTAMENTE uno de
 * `endpoints`, sin query (salvo el cache-buster `?_ts=<cifras>` solo, 0.3.27), fragmento ni credenciales (un `;jsessionid=` en la ruta
 * tampoco casa: fail-closed). Pura.
 */
/**
 * 0.3.22: NOMBRES de clave de la query para un mensaje del guard (nunca valores). Solo una clave con forma de identificador (empieza por
 * letra, ≤40, sin tiras de ≥4 cifras: un NIF/NIE o un id largo puesto como clave no sale); el resto, «?». Como mucho 6, sin repetir.
 * 0.3.26 (explorador, Fidelidade real 24fd7252 del 31/10/2026: «claves ?» no dejaba decidir): también los nombres de framework con 1-2 guiones
 * bajos delante (`_ts`, `__EVENTTARGET`); la clave oculta dice solo su FORMA, sin longitud ni contenido: «?(cifras)», «?(vacía)» u «?(otra)».
 * Solo diagnóstico: NO abre nada (la red sigue admitiendo solo destinos exactos sin query).
 */
export function clavesQueryDiagnostico(u: URL): string {
  const forma = (k: string) => (k === '' ? '?(vacía)' : /^\d+$/.test(k) ? '?(cifras)' : '?(otra)')
  return [...new Set([...u.searchParams.keys()].map((k) => (/^_{0,2}[A-Za-z][A-Za-z0-9_]{0,39}$/.test(k) && !/\d{4,}/.test(k) ? k : forma(k))))].slice(0, 6).join(',')
}

export function destinoAvancePermitido(url: string, endpoints: readonly string[]): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.username || u.password || u.hash) return false
  if (u.search && !esQuerySoloCacheBuster(u.search)) return false
  return endpoints.includes(`${u.origin}${u.pathname}`)
}

/**
 * 0.3.27 (explorador, Fidelidade Vivienda real 31/10/2026: «POST … /OPI_ES_Vivienda/ClientData.aspx [ruta en la lista, pero con query: claves
 * _ts]»): la query cuyo ÚNICO parámetro es el cache-buster `_ts` con valor de SOLO cifras (1-17) no impide casar la ruta exacta de la lista.
 * Cualquier otra clave, `_ts` repetido, vacío o no numérico, o con `=` codificado, sigue fuera (fail-closed). La ruta sigue teniendo que ser
 * EXACTA de la lista y el cuerpo se inspecciona igual. Pura.
 */
export function esQuerySoloCacheBuster(search: string): boolean {
  return /^\?_ts=\d{1,17}$/.test(search)
}

export async function instalarGuardEmision(context: BrowserContext): Promise<GuardEmision> {
  let violacion: EmisionBloqueadaError | null = null
  const fases = new MaquinaFases()
  let ventanaHasta = 0
  // Ventana del avance de pestaña autorizado: hasta cuándo y a qué destinos (no GET) se puede ir. `null` = cerrada.
  let avance: { hasta: number; endpoints: readonly string[]; ajax: readonly AjaxValidacionAvance[] } | null = null
  const avanceVigente = () => (avance && Date.now() < avance.hasta ? avance : null)
  // Ventana del guardado de presupuesto: hasta cuándo y desde qué ORIGEN (el del marco del botón). `null` = cerrada.
  // `proyectoMapfre`: la ventana es la de «Generar Proyecto» de Mapfre (abre SOLO `permitirGenerarProyectoMapfre`, no Archivar).
  let guardado: { hasta: number; origen: string; proyectoMapfre: boolean } | null = null
  const guardadoVigente = () => (guardado && Date.now() < guardado.hasta ? guardado : null)
  // Ventana del LOGIN ASISTIDO (14/10/2026): mientras está abierta, lo que no es GET SOLO puede ir al origen del SSO.
  let login: { hasta: number; origen: string } | null = null
  const loginVigente = () => (login && Date.now() < login.hasta ? login : null)
  let rechazoLogin: string | null = null
  // Ventana de la NAVEGACIÓN a «TURISMOS (RAMO UV)» de Generali (18/10/2026, autorizada por Alberto). Solo la abre
  // `entrarTurismosGenerali`: mientras dura, una navegación GET a www.generali.es cuyo ÚNICO motivo de bloqueo sean los
  // sustantivos «emisión»/«contratación» del menú pasa (`urlTurismosGeneraliPermitida`). Nada más se relaja.
  let turismosGenerali = 0
  // Rutas de APLICACIÓN tolerables de la entrada (Mapfre NSE `/EVT21_NSE_FWEB/app/emision/`, decisión de Alberto 28/10/2026): solo
  // las fija `tolerarRutasApp`; su prefijo no cuenta como emisión en la URL (query y cuerpo se miran igual).
  let tolerables: readonly RutaTolerable[] = []
  // La ventana se cierra en cuanto el MARCO PRINCIPAL navega a otro origen (el SSO redirige al portal tras el login: el
  // portal ya no está en la fase de login). `request` también salta en cada salto de una redirección (route no lo ve).
  context.on('request', (req) => {
    const lg = loginVigente()
    if (!lg || !req.isNavigationRequest()) return
    let principal = false
    try {
      principal = req.frame().parentFrame() === null
    } catch {
      principal = false
    }
    // Solo una navegación GET (la redirección al portal): un POST/307 a otro origen sigue en la ventana y se aborta.
    if (principal && req.method() === 'GET' && origenDe(req.url()) !== lg.origen) login = null
  })
  await context.route('**/*', async (route) => {
    const req = route.request()
    const url = req.url()
    const noGet = req.method() !== 'GET'
    if (req.isNavigationRequest() || noGet) {
      const av = avanceVigente()
      // Capa (a) del avance: el manejador «Aceptar» está autorizado SOLO para las peticiones a un destino de la lista blanca
      // del avance vigente (origen + ruta exactos, sin query). Cualquier otra (GET incluida) se mira como siempre: con
      // «aceptar» bloqueado. store/contract/validar_aceptar/emitir/contratar… abortan siempre, también en la lista.
      const enLista = av !== null && destinoAvancePermitido(url, av.endpoints)
      // Guardado de presupuesto: SOLO Archivar (`store`) y Proyecto ampliado se abren, y SOLO hacia el origen del marco del botón. «Aceptar»,
      // emitir, contract, validar_aceptar… siguen abortando (`permitirGuardarPresupuesto` no los toca).
      const gv = guardadoVigente()
      const enGuardado = gv !== null && origenDe(url) === gv.origen
      // «Generar Proyecto» de Mapfre (22/10/2026): su ventana abre SOLO su patrón (`permitirGenerarProyectoMapfre`), no Archivar/store.
      const enProyectoMapfre = enGuardado && gv.proyectoMapfre
      const op = { permitirAceptar: fases.aceptarEnVuelo() || enLista, permitirGuardarPresupuesto: enGuardado && !enProyectoMapfre, permitirGenerarProyectoMapfre: enProyectoMapfre }
      const neutra = neutralizarRutaTolerable(url, tolerables) ?? url
      const porUrl = pareceEmision(neutra, op) || parametrosParecenEmision(url, op)
      // Ruta TOLERADA (Mapfre NSE): además, los NOMBRES de parámetro y el botón JSF del cuerpo no pueden nombrar una acción real.
      const porCuerpoGeneral = !porUrl && noGet && parametrosParecenEmision(cuerpoDe(req), op)
      const detalleTolerado = !porUrl && !porCuerpoGeneral && noGet && neutra !== url ? detalleCuerpoToleradoConAccionReal(cuerpoDe(req), url) : null
      // 0.3.13: destinos POST EXTRA del avance (índice ≥ 1, p. ej. /drvp00/main/control.do): inspección estricta del cuerpo (también
      // confirmar/firmar/pagar/IBAN en claves de acción o nombres financieros). El destino primario conserva el criterio de siempre.
      // Revisión 0.3.17: un destino que es A LA VEZ primario y extra (el «Aceptar» sin id de drvp00 en el marco `control.do`) también
      // pasa la inspección estricta: estar en la lista de extras basta.
      const enExtraAvance = av !== null && enLista && noGet && destinoAvancePermitido(url, av.endpoints.slice(1))
      const porCuerpoExtra = !porUrl && enExtraAvance && cuerpoLlevaAccionFinal(cuerpoDe(req), op)
      const porCuerpo = !porUrl && noGet && parametrosParecenEmision(cuerpoDe(req), op) || detalleTolerado !== null || porCuerpoExtra
      if (porUrl && !porCuerpo && !noGet && Date.now() < turismosGenerali && av === null && gv === null && Date.now() >= ventanaHasta && urlTurismosGeneraliPermitida(url)) {
        // Navegación del ÚNICO clic de «TURISMOS (RAMO UV)» (ventana abierta por entrarTurismosGenerali): GET a Generali con
        // «emisión»/«contratación» como sustantivo de menú y nada más que case con el patrón. Un POST, otro origen o cualquier
        // otro verbo (emitir, contratar, grabar, pagar, aceptar…) sigue abortando abajo.
        await route.continue()
        return
      }
      if ((porUrl || porCuerpo) && Date.now() < ventanaHasta && av === null && gv === null) {
        // Consecuencia del ÚNICO clic autorizado (ventana abierta por pulsarEmisionAutorizada): pasa.
        await route.continue()
        return
      }
      if (porUrl || porCuerpo) {
        // El cuerpo NO va al mensaje (lleva datos del formulario): solo la URL y que fue por el cuerpo.
        // En la ruta TOLERADA (Mapfre NSE) se dice QUÉ parámetro casó y con qué palabra de la lista (nunca su valor).
        // 0.3.22: TODOS los nombres que casan (solo nombres, nunca valores), para no ir parámetro a parámetro ronda a ronda.
        // 0.3.23 (real 30/10/2026: la lista salía cortada): cada nombre con la CLASE de su valor (vacío/false/true/num/otro) y el detalle
        // va DELANTE y FUERA del recorte de 200 del texto (tercer argumento): solo la URL se recorta.
        const que = detalleTolerado ? textoDetalleCuerpo(detalleTolerado) : ''
        violacion ??= que ? new EmisionBloqueadaError('url', url, que) : new EmisionBloqueadaError('url', porCuerpo ? `${url} [acción en el cuerpo de la petición]` : url)
        await route.abort('blockedbyclient')
        return
      }
      const lg = loginVigente()
      if (lg && noGet && origenDe(url) !== lg.origen) {
        // Login asistido: un POST/PUT/… a otro origen mientras se envía el formulario del SSO. Se aborta y se anota (solo el
        // origen); quien abrió la ventana lo convierte en error del login. No es una violación de EMISIÓN.
        rechazoLogin ??= origenDe(url) ?? '(url ilegible)'
        await route.abort('blockedbyclient')
        return
      }
      if (gv && noGet && !enGuardado) {
        // Un POST/PUT/… a otro origen mientras se guarda: fuera (al mensaje solo el origen).
        violacion ??= new EmisionBloqueadaError('fase', `guardado de presupuesto: ${req.method()} a otro origen: ${origenDe(url) ?? '(url ilegible)'}`)
        await route.abort('blockedbyclient')
        return
      }
      // Validación AJAX declarada del avance (p. ej. la lista negra del NIF): solo capa (b); la (a) ya la miró sin «aceptar».
      const enAjaxValidacion = av !== null && noGet && ajaxValidacionAvancePermitida(req.method(), url, cuerpoDe(req), av.ajax)
      if (av && noGet && !enLista && !enAjaxValidacion) {
        // Capa (b) del avance: lista blanca de destinos. Un POST/PUT/… a cualquier otro sitio se aborta y el trabajo cae.
        // Al mensaje solo va origen + ruta (la query de ePAC lleva identificadores de la sesión y del agente) y, si lo hay,
        // el `resource` (nombre de clase del servlet AJAX, sin datos) para saber QUÉ llamada fue.
        let destino = '(url ilegible)'
        try {
          const u = new URL(url)
          const resource = u.searchParams.get('resource')
          destino = `${u.origin}${u.pathname}${resource && /^[A-Za-z0-9_.]{1,120}$/.test(resource) ? ` (resource=${resource})` : ''}`
          // 0.3.22 (Fidelidade real, 530656a4…: el destino ERA el del formulario y cayó igual): si origen+ruta están en la lista, lo que sobra
          // es la query (o credenciales): se dice, solo con los NOMBRES de clave (nunca valores).
          if (!resource && av.endpoints.includes(`${u.origin}${u.pathname}`)) {
            const claves = clavesQueryDiagnostico(u)
            destino += u.search ? ` [ruta en la lista, pero con query: claves ${claves || '?'}]` : ' [ruta en la lista, pero con credenciales]'
          }
        } catch {}
        // Diagnóstico de un AJAX rechazado (0.7.9): QUÉ no cuadró, solo con nombres de claves y categorías, nunca valores.
        const motivo = destino.includes('AJAXServlet') ? motivoAjaxRechazado(req.method(), url, cuerpoDe(req), av.ajax) : null
        let pestana = ''
        try { pestana = ` [pestaña de origen: ${new URL(av.endpoints[0] ?? '').pathname}]` } catch {}
        violacion ??= new EmisionBloqueadaError('fase', `avance de pestaña: ${req.method()} a un destino fuera de la lista blanca: ${destino}${motivo ? ` [motivo: ${motivo}]` : ''}${pestana}`)
        await route.abort('blockedbyclient')
        return
      }
    }
    await route.continue()
  })
  const g: GuardEmision = {
    fases,
    ventana: {
      abierta: () => Date.now() < ventanaHasta,
      cerrar: () => { ventanaHasta = 0 },
    },
    avance: {
      abierta: () => avanceVigente() !== null,
      cerrar: () => { avance = null },
    },
    guardado: {
      abierta: () => guardadoVigente() !== null,
      cerrar: () => { guardado = null },
    },
    violacion: () => violacion,
    comprobar() {
      if (violacion) throw violacion
    },
  }
  FIJAR_TOLERABLES.set(g, (r) => { tolerables = r })
  ABRIR_VENTANA.set(g, (ms) => { ventanaHasta = Date.now() + Math.min(ms, VENTANA_RED_EMISION_MS) })
  ABRIR_AVANCE.set(g, (hasta, endpoints, ajax = []) => { avance = { hasta: Math.min(hasta, Date.now() + VENTANA_RED_AVANCE_MS), endpoints, ajax } })
  ABRIR_GUARDADO.set(g, (origen, proyectoMapfre = false) => { guardado = { hasta: Date.now() + VENTANA_RED_GUARDADO_MS, origen, proyectoMapfre } })
  ABRIR_TURISMOS_GENERALI.set(g, { abrir: (ms) => { turismosGenerali = Date.now() + Math.min(ms, VENTANA_RED_TURISMOS_GENERALI_MS) }, cerrar: () => { turismosGenerali = 0 }, abierta: () => Date.now() < turismosGenerali })
  VENTANA_LOGIN.set(g, {
    abrir: (origen) => { login = { hasta: Date.now() + VENTANA_RED_LOGIN_MS, origen }; rechazoLogin = null },
    cerrar: () => { login = null },
    abierta: () => loginVigente() !== null,
    rechazo: () => rechazoLogin,
  })
  return g
}

const FIJAR_TOLERABLES = new WeakMap<GuardEmision, (r: readonly RutaTolerable[]) => void>()
const RUTAS_TOLERABLES = new WeakMap<GuardEmision, readonly RutaTolerable[]>()

/**
 * RUTAS DE APLICACIÓN TOLERABLES del trabajo (las de su entrada de exploración, `rutasAppTolerablesDe`). Solo origen https sin ruta
 * y prefijo de ruta absoluto acabado en «/». Desde ese momento, en ESTE guard, el prefijo exacto deja de contar como emisión en la
 * URL de red y en los href de los botones (`neutralizarRutaTolerable`); textos, onclick, query y cuerpos se miran como siempre.
 */
export function tolerarRutasApp(guard: GuardEmision, reglas: readonly RutaTolerable[]): void {
  const fijar = FIJAR_TOLERABLES.get(guard)
  if (!fijar) throw new EmisionBloqueadaError('fase', 'guard sin rutas tolerables')
  for (const r of reglas) {
    if (!/^https:\/\/[a-z0-9.-]+$/.test(r.origen) || !/^\/[\w./-]+\/$/.test(r.prefijo)) throw new EmisionBloqueadaError('fase', 'ruta tolerable no válida')
  }
  const copia = Object.freeze(reglas.map((r) => Object.freeze({ origen: r.origen, prefijo: r.prefijo })))
  RUTAS_TOLERABLES.set(guard, copia)
  fijar(copia)
}
/**
 * Posiciones de `descripcion()` que son URL (href del control, formaction y href de los <a> ancestros): las ÚNICAS que se neutralizan.
 * Texto, aria, title, value, id, name, onclick, ng-click… nunca (aunque contengan una URL). Lo vigila un test contra `descripcion`.
 */
export const INDICES_URL_DESCRIPCION: readonly number[] = Object.freeze([6, 8, 15, 19, 23])
const conRutasTolerables = (guard: GuardEmision, desc: readonly (string | null)[]): (string | null)[] => {
  const reglas = RUTAS_TOLERABLES.get(guard) ?? []
  if (reglas.length === 0) return [...desc]
  // 0.3.6: si el TEXTO/atributos del control (lo que no es URL) nombran una acción real (emitir, contratar, confirmar, firma, pago,
  // formalizar, grabar, IBAN…), no se tolera NADA: la URL se mira entera. Una excepción por texto exacto (menú «Oferta / Contratación»)
  // la quita el llamante poniendo ese descriptor a `null` (sin mover posiciones).
  const plano = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (desc.some((d, i) => !INDICES_URL_DESCRIPCION.includes(i) && typeof d === 'string' && RE_ACCION_REAL_TRAS_PREFIJO.test(plano(d)))) return [...desc]
  return desc.map((d, i) => (INDICES_URL_DESCRIPCION.includes(i) ? neutralizarRutaTolerable(d, reglas) ?? null : d))
}
/** Solo para tests: la descripción que ve el guard de un control. */
export const descripcionParaTest = (boton: Locator) => descripcion(boton)

const NEUTRALIZACIONES_ONCLICK = new WeakMap<GuardEmision, readonly NeutralizacionOnclick[]>()
/**
 * 0.3.19: reglas de NEUTRALIZACIÓN de onclick de la entrada del trabajo (`neutralizacionesOnclickDe`, Mapfre NSE «Siguiente >>»). Solo
 * origen https sin ruta, prefijo de ruta absoluto acabado en «/» y subcadena con forma de identificador. Desde ese momento, en `pulsar()`,
 * si el control VIVO es EXACTAMENTE el de una regla (origen, ruta, tag, id, name, texto), su onclick se mira sin esa subcadena
 * (`onclickNeutralizado`, la MISMA función que el validador); el resto de la descripción y la red se miran igual.
 */
export function neutralizarOnclicksEntrada(guard: GuardEmision, reglas: readonly NeutralizacionOnclick[]): void {
  for (const r of reglas) {
    if (!/^https:\/\/[a-z0-9.-]+$/.test(r.origen) || !/^\/[\w./-]+\/$/.test(r.prefijoRuta) || r.prefijoRuta.includes('..') || !/^[A-Za-z_$][\w$]{5,100}$/.test(r.subcadena)) {
      throw new EmisionBloqueadaError('fase', 'neutralización de onclick no válida')
    }
  }
  NEUTRALIZACIONES_ONCLICK.set(guard, Object.freeze(reglas.map((r) => Object.freeze({ ...r }))))
}
/** `desc` con el onclick PROPIO del control (índice 7) neutralizado si el control vivo es el de una regla; si no, tal cual. Solo lee. */
async function conOnclickNeutralizado(guard: GuardEmision, boton: Locator, desc: readonly (string | null)[]): Promise<(string | null)[]> {
  const reglas = NEUTRALIZACIONES_ONCLICK.get(guard) ?? []
  if (reglas.length === 0 || typeof desc[7] !== 'string') return [...desc]
  const vivo = await boton
    .evaluate((el) => ({ tag: el.tagName.toLowerCase(), id: el.getAttribute('id'), name: el.getAttribute('name'), origen: el.ownerDocument.location.origin, ruta: el.ownerDocument.location.pathname }))
    .catch(() => null)
  if (!vivo) return [...desc]
  const neutro = onclickNeutralizado(reglas, { ...vivo, texto: desc[0], onclick: desc[7] })
  return neutro === null ? [...desc] : desc.map((d, i) => (i === 7 ? neutro : d))
}

/** Tope de la ventana de red del LOGIN ASISTIDO: un envío del formulario del SSO y su carga. */
export const VENTANA_RED_LOGIN_MS = 30_000
type VentanaLogin = { abrir(origen: string): void; cerrar(): void; abierta(): boolean; rechazo(): string | null }
const VENTANA_LOGIN = new WeakMap<GuardEmision, VentanaLogin>()

/**
 * LOGIN ASISTIDO (14/10/2026): abre la ventana de red del envío del formulario del SSO. Mientras está abierta, toda petición
 * que no sea GET a un origen distinto de `origen` se ABORTA (y queda en `rechazoVentanaLogin`). Solo un origen https sin ruta.
 * No relaja NADA del guard de emisión (patrones en URL y cuerpo siguen abortando antes).
 */
export function abrirVentanaLogin(guard: GuardEmision, origen: string): void {
  const v = VENTANA_LOGIN.get(guard)
  if (!v) throw new EmisionBloqueadaError('fase', 'guard sin ventana de login')
  if (!/^https:\/\/[a-z0-9.-]+$/.test(origen)) throw new EmisionBloqueadaError('fase', 'ventana de login: origen no válido')
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', 'ventana de login con otra ventana de red abierta')
  v.abrir(origen)
}
export function cerrarVentanaLogin(guard: GuardEmision): void {
  VENTANA_LOGIN.get(guard)?.cerrar()
}
export function ventanaLoginAbierta(guard: GuardEmision): boolean {
  return VENTANA_LOGIN.get(guard)?.abierta() === true
}
/** Origen al que el SSO intentó enviar algo (no GET) fuera de su origen durante la última ventana; `null` = nada. */
export function rechazoVentanaLogin(guard: GuardEmision): string | null {
  return VENTANA_LOGIN.get(guard)?.rechazo() ?? null
}

/** Origen (`https://host:puerto`) de una URL http(s), o `null`. */
function origenDe(url: string): string | null {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.origin : null
  } catch {
    return null
  }
}

/** Solo `entrarTurismosGenerali` (este fichero) puede abrir la ventana de la navegación de Turismos de Generali. */
const ABRIR_TURISMOS_GENERALI = new WeakMap<GuardEmision, { abrir(ms: number): void; cerrar(): void; abierta(): boolean }>()
/** Tope de esa ventana: el clic + la carga del formulario de Turismos. Se cierra antes en cuanto aparece (finally). */
export const VENTANA_RED_TURISMOS_GENERALI_MS = 15_000

/** Sustantivos de MENÚ de Generali que casan con `emisi`/`contrat` («NEGOCIO › EMISIÓN › CONTRATACIÓN»). Solo estas dos palabras. */
const RE_SUSTANTIVOS_MENU_GENERALI = /emision|contratacion/gi
const sinTildesNi = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

/** El texto sin los sustantivos «emisión»/«contratación» (decodificado y sin tildes), para volver a pasarle el patrón entero. PURA. */
export function sinSustantivosMenuGenerali(texto: string): string {
  let t = texto
  try {
    t = decodeURIComponent(texto)
  } catch {}
  return sinTildesNi(t).replace(RE_SUSTANTIVOS_MENU_GENERALI, ' ')
}

/**
 * EXCEPCIÓN de red de Turismos (Ramo UV) de Generali (Alberto, 18/10/2026). ¿Puede pasar esta NAVEGACIÓN GET durante la ventana
 * del clic de «TURISMOS (RAMO UV)»? Solo si: origen EXACTO `https://www.generali.es` (sin credenciales en la URL) y, quitando
 * los sustantivos «emisión»/«contratación», NADA más de la URL (ruta, query, fragmento) casa con el patrón de emisión ni con las
 * acciones en parámetros (emitir, contratar, formalizar, grabar póliza, pagar, firmar, aceptar, `action=…`). PURA.
 */
export function urlTurismosGeneraliPermitida(url: string): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.origin !== ORIGEN_PORTAL_GENERALI || u.username || u.password) return false
  const resto = sinSustantivosMenuGenerali(url)
  return !pareceEmision(resto) && !parametrosParecenEmision(resto)
}

/** Solo `pulsarGuardadoPresupuesto` y `pulsarGenerarProyectoMapfre` (este fichero) pueden abrir la ventana del guardado. */
const ABRIR_GUARDADO = new WeakMap<GuardEmision, (origen: string, proyectoMapfre?: boolean) => void>()

/** Solo `pulsarAvancePestanaAutorizado` (este fichero) puede abrir la ventana del avance. */
const ABRIR_AVANCE = new WeakMap<GuardEmision, (hasta: number, endpoints: readonly string[], ajax?: readonly AjaxValidacionAvance[]) => void>()
/** Cada avance autorizado, UNA vez por trabajo (contexto): no hay segundo «Aceptar» de la misma pestaña. */
const AVANCES_USADOS = new WeakMap<GuardEmision, Set<string>>()

/** Solo `pulsarEmisionAutorizada` (este fichero) puede abrir la ventana: no hay `abrir` en el objeto público. */
const ABRIR_VENTANA = new WeakMap<GuardEmision, (ms: number) => void>()

/** Cuerpo de la petición como texto (`null` si no tiene). Si no se puede leer como texto, sus bytes en UTF-8. */
function cuerpoDe(req: Request): string | null {
  try {
    return req.postData()
  } catch {
    return req.postDataBuffer()?.toString('utf8') ?? null
  }
}

/**
 * FRONTERA DE EMISIÓN (Alberto, 14/10/2026, TODAS las compañías): sin número de cuenta no se emite. Un control de cuenta
 * bancaria visible = el portal ya está en la fase de emisión: se PARA sin pulsar nada más. Hereda de
 * `EmisionBloqueadaError` (el flujo determinista lo trata como bloqueo de emisión); el explorador lo cierra como
 * `cerca_de_emision` / `frontera_cuenta_bancaria` (fin correcto, no fallo). El mensaje lleva la etiqueta del CAMPO, nunca su valor.
 */
export class ErrorFronteraEmision extends EmisionBloqueadaError {
  readonly etiqueta: string
  constructor(etiqueta: string) {
    super('fase', `${MOTIVO_FRONTERA_CUENTA} («${etiqueta}»)`)
    this.name = 'ErrorFronteraEmision'
    this.etiqueta = etiqueta
  }
}

/**
 * Controles que la frontera de cuenta bancaria mira: nativos y NO nativos (Angular Material, combobox/textbox ARIA,
 * contenteditable). Los `input[type=hidden]` se descartan aparte. Del no nativo solo atributos (nunca su texto: es el valor).
 */
export const SELECTOR_CONTROLES_FRONTERA = 'input, select, textarea, [role=combobox], [role=textbox], [contenteditable=true], mat-select'

/** Descripción de los controles de formulario VISIBLES de cada marco (atributos y etiqueta; nunca el valor). Solo lectura. */
async function descripcionesControles(page: Page): Promise<string[][]> {
  const out: string[][] = []
  for (const f of marcosVivos(page)) {
    // Sin funciones con nombre dentro de `evaluate` (tsx les mete `__name`, que no existe en la página).
    const d = await f
      .evaluate((SEL_CONTROLES) =>
        Array.from(document.querySelectorAll(SEL_CONTROLES))
          .filter((n) => !(n.tagName === 'INPUT' && (n as HTMLInputElement).type === 'hidden'))
          .filter((n) => (n as HTMLElement).getClientRects().length > 0)
          // Mapfre NSEI (prueba real 15/10/2026, trabajo f46682c2): los 6 pasos del stepper viven a la vez en el DOM y el IBAN de
          // «Contratación» (paso NO activo) tiene caja pero `visibility: hidden` (calculado en el propio campo). No es un campo que el
          // portal muestre: no cuenta. Se mira SOLO la visibilidad del campo (no `aria-expanded` del panel: un panel marcado inactivo
          // con el campo visible SÍ bloquea, fail-closed).
          // (A propósito NO se ignora `aria-hidden`: CDK lo pone en el fondo cuando abre un diálogo, y ese fondo sí se ve.)
          .filter((n) => getComputedStyle(n).visibility === 'visible')
          .map((n) => {
            const e = n as HTMLInputElement
            // Texto PROPIO de la etiqueta: sin los controles que envuelve (las opciones de un select no son etiqueta:
            // «Forma de pago ▸ Domiciliación» pararía cada pulsación de Allianz/Occident).
            const lab = e.labels && e.labels.length > 0 ? (e.labels[0].cloneNode(true) as HTMLElement) : null
            if (lab) lab.querySelectorAll(SEL_CONTROLES).forEach((x) => x.remove())
            const etq = lab ? (lab.textContent ?? '').replace(/\s+/g, ' ').trim() || null : null
            return [etq, e.getAttribute('name'), e.id || null, e.getAttribute('formcontrolname'), e.getAttribute('aria-label'), e.getAttribute('placeholder'), e.getAttribute('title')].filter((x): x is string => typeof x === 'string' && x !== '')
          }), SELECTOR_CONTROLES_FRONTERA,
      )
      .catch(() => [] as string[][])
    out.push(...d)
  }
  return out
}

/** Lanza `ErrorFronteraEmision` si la página muestra algún control de cuenta bancaria. */
export async function exigirSinCuentaBancaria(page: Page): Promise<void> {
  for (const d of await descripcionesControles(page)) {
    const s = senalCuentaBancaria(d)
    if (s !== null) throw new ErrorFronteraEmision(s)
  }
}

/** Antes de ESCRIBIR o ELEGIR en un campo: si es de cuenta bancaria, `ErrorFronteraEmision` (nunca se rellena). */
export async function exigirCampoNoBancario(campo: Locator): Promise<void> {
  const d = await campo.evaluate((n, SEL_CONTROLES) => {
    const e = n as HTMLInputElement
    const lab = e.labels && e.labels.length > 0 ? (e.labels[0].cloneNode(true) as HTMLElement) : null
    if (lab) lab.querySelectorAll(SEL_CONTROLES).forEach((x) => x.remove())
    const etq = lab ? (lab.textContent ?? '').replace(/\s+/g, ' ').trim() || null : null
    return [etq, e.getAttribute('name'), e.id || null, e.getAttribute('formcontrolname'), e.getAttribute('aria-label'), e.getAttribute('placeholder'), e.getAttribute('title')]
  }, SELECTOR_CONTROLES_FRONTERA)
  const s = senalCuentaBancaria(d)
  if (s !== null) throw new ErrorFronteraEmision(s)
}

/** El ÚNICO modo de pulsar algo en un portal. Lanza `EmisionBloqueadaError` antes de pulsar. */
export async function pulsar(boton: Locator, guard: GuardEmision): Promise<void> {
  guard.comprobar()
  await exigirSinCuentaBancaria(boton.page())
  // La MISMA descripción que el resto de puertas: control + ng-click + manejadores de sus ancestros cercanos.
  const desc = await descripcion(boton)
  // 0.3.19: la subcadena exacta del onclick de UN control exacto de la entrada (Mapfre NSE), antes de mirar nada (ver `neutralizarOnclicksEntrada`).
  comprobarBoton(conRutasTolerables(guard, await conOnclickNeutralizado(guard, boton, desc)))
  // Generali (26/10/2026): un «Confirmar» de www.generali.es NUNCA por la vía genérica; solo por sus puertas acotadas
  // (`pulsarConfirmarVehiculoGenerali`, `pulsarConfirmarDatosPersonasGenerali`).
  if (confirmarDeGenerali(desc, await boton.evaluate(() => location.href).catch(() => ''))) throw new EmisionBloqueadaError('boton', 'Confirmar (Generali: solo por su puerta del guard)')
  await boton.click()
  guard.comprobar()
}

/**
 * 0.3.25 (Fidelidade real 30/10/2026, 56b4b52c…, «Datos Cliente - Nombre y régimen»): el mapa marcó PROPIETARIO ANTES de que la IA rellenara el
 * nombre; el portal (OutSystems) calcula si habilita el avance en el `change` del radio, así que el botón se quedó deshabilitado, y volver a
 * pulsar un radio ya marcado no emite `change`. Tras el clic del explorador POR `pulsar` (que ya pasó este nodo por el guard), aquí se repite la
 * MISMA barrera sobre el nodo vivo (fase, frontera bancaria, descripción completa con `comprobarBoton`) y solo entonces se emiten `input`+`change`
 * burbujeantes, SOLO si es un `<input type=radio>` conectado, marcado y no deshabilitado. Nunca `click`/`submit`/teclado. La red que provoque
 * pasa por el guard de contexto de siempre. Devuelve `cambio` | `no_aplica` | `desaparecido` (al log, sin valores); una violación LANZA.
 */
export async function redispararCambioMarcado(control: Locator, guard: GuardEmision): Promise<'cambio' | 'no_aplica' | 'desaparecido'> {
  if ((await control.count().catch(() => 0)) === 0) return 'desaparecido'
  guard.comprobar()
  await exigirSinCuentaBancaria(control.page())
  const desc = await descripcion(control)
  comprobarBoton(conRutasTolerables(guard, await conOnclickNeutralizado(guard, control, desc)))
  // Revisión de seguridad (30/10/2026): `input`/`change` BURBUJEAN y `descripcion` solo ve onclick/ng-click/href (3 ancestros). Aquí se leen
  // `onchange`/`oninput` del radio y de TODOS sus ancestros (atravesando shadow hosts) y del <form> (también el de `form=`); cualquiera con acción
  // final LANZA, y un <form> con onchange/oninput/onsubmit LANZA siempre. El mensaje nunca lleva el texto del manejador (podría tener datos).
  const man = await control
    .evaluate((n) => {
      // Sin funciones con nombre dentro de `evaluate` (tsx/esbuild inyecta `__name`, que no existe en la página).
      const out: { tag: string; ev: string; v: string }[] = []
      const f = (n as HTMLInputElement).form ?? n.closest('form')
      const nodos: Element[] = []
      for (let p: Element | null = n; p; p = p.parentElement ?? ((p.getRootNode() as ShadowRoot).host ?? null)) nodos.push(p)
      if (f) nodos.push(f)
      for (const e of nodos) {
        for (const ev of ['onchange', 'oninput']) {
          const v = e.getAttribute(ev)
          if (v !== null) out.push({ tag: e.tagName.toLowerCase(), ev, v })
        }
      }
      return { manejadores: out, formConManejador: !!f && ['onchange', 'oninput', 'onsubmit'].some((a) => f.hasAttribute(a)) }
    }, undefined, { timeout: 2_000 })
    .catch(() => null)
  if (man === null) return 'desaparecido'
  // `pareceEmision` además: RE_ACCION_REAL_TRAS_PREFIJO no casa «emision()» (no contiene «emit»).
  const malo = man.manejadores.find((m) => RE_ACCION_REAL_TRAS_PREFIJO.test(m.v.normalize('NFD').replace(/[̀-ͯ]/g, '')) || pareceEmision(m.v))
  if (malo) throw new EmisionBloqueadaError('boton', `redisparo de cambio: ${malo.ev} de <${malo.tag}> con acción final`)
  if (man.formConManejador) throw new EmisionBloqueadaError('fase', 'redisparo de cambio: el <form> del radio tiene onchange/oninput/onsubmit (no se redispara)')
  const r = await control
    .evaluate((n) => {
      const c = n as HTMLInputElement
      if (!c.isConnected || c.tagName !== 'INPUT' || (c.type || '').toLowerCase() !== 'radio' || !c.checked || c.disabled) return 'no_aplica' as const
      c.dispatchEvent(new Event('input', { bubbles: true }))
      c.dispatchEvent(new Event('change', { bubbles: true }))
      return 'cambio' as const
    }, undefined, { timeout: 2_000 })
    .catch(() => 'desaparecido' as const)
  guard.comprobar()
  return r
}

/** ¿Es un «Confirmar» (texto/valor/aria/title EXACTO, sin mayúsculas/tildes) de un marco de www.generali.es? PURA. */
export function confirmarDeGenerali(desc: readonly (string | null)[], url: string): boolean {
  let origen = ''
  try {
    origen = new URL(url).origin
  } catch {
    origen = ''
  }
  if (origen !== 'https://www.generali.es') return false
  return [desc[0], desc[1], desc[2], desc[3]].some((x) => String(x ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase() === 'confirmar')
}

// ─────────── Controles CONTEXTUALES de ePAC «Comunidades 2020» (guardados por fase) ───────────
// «Aceptar» y el radio de opción solo existen aquí: el adaptador no los nombra (lo vigila el test de la raíz).

/**
 * Pestaña activa según el DOM, por CONTENIDO (no por clases CSS): «Idioma Proyecto PDF» solo existe
 * en Tarificar; «COSTE ANUAL DEL SEG.» solo en Datos Básicos (la fila está ya ANTES de calcular, vacía).
 * Cualquier otra cosa → `null` (y la máquina de fases bloquea). DOM real de Datos Básicos (06/10/2026): las
 * pestañas son `td#DATOSBASICOS`/`td#TARIFICAR` sin `aria-selected`; la seleccionada lleva una clase
 * `…Selected` que el `onmouseover` también pone, así que NO sirve. TODO(capturas): el DOM de Tarificar.
 */
export async function pestanaActiva(page: Page): Promise<PestanaActiva> {
  // El formulario vive en un iframe (`appArea`, 06/10/2026): se mira en TODOS los marcos de la página.
  const visible = async (t: string) => {
    for (const f of marcosVivos(page)) {
      if (await f.getByText(t, { exact: false }).first().isVisible().catch(() => false)) return true
    }
    return false
  }
  const tarificar = await visible('Idioma Proyecto PDF')
  const datos = await visible('COSTE ANUAL DEL SEG.')
  if (tarificar && !datos) return 'tarificar'
  if (datos && !tarificar) return 'datos_basicos'
  return null
}

/** Marcos no desconectados de la página (la carcasa de ePAC + el iframe de la aplicación y sus hijos). */
function marcosVivos(page: Page): Frame[] {
  return page.frames().filter((f) => !f.isDetached())
}

/**
 * Cuenta lo que casa con `buscar` en TODOS los marcos: `total` (suma), `marcos` (cuántos tienen
 * alguno) y el locator del primero que lo tiene. Quien llama exige el `total` exacto que espera.
 */
async function enMarcos(page: Page, buscar: (f: Frame) => Locator): Promise<{ total: number; locator: Locator | null; marcos: number }> {
  let total = 0
  let marcos = 0
  let locator: Locator | null = null
  for (const f of marcosVivos(page)) {
    const l = buscar(f)
    const n = await l.count().catch(() => 0)
    if (n > 0) {
      total += n
      marcos++
      locator ??= l
    }
  }
  return { total, locator, marcos }
}

async function descripcion(boton: Locator, alContenedor = false): Promise<(string | null)[]> {
  return boton.evaluate((el, subir) => {
    // `subir`: si el control es un hijo (p. ej. `mat-icon`) de un botón/enlace/ng-click, la decisión es sobre ESE contenedor.
    const base = subir ? (el.closest('button,a,[role=button],[role=menuitem],[role=tab],nx-button,[ng-click],[onclick],[\\(click\\)]') ?? el) : el
    const h = base as HTMLElement & { value?: unknown; href?: unknown; name?: unknown }
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
      // AngularJS (14/10/2026, wmediadores: las tarjetas son `div[ng-click]`): su manejador cuenta como un onclick.
      h.getAttribute('ng-click'),
      h.getAttribute('data-ng-click'),
      // Tooltip de Angular Material (14/10/2026, lupa de Mapfre): un botón de solo icono se nombra por él. Solo AÑADE bloqueo.
      h.getAttribute('mattooltip'),
      // ANCESTROS cercanos (revisión 14/10/2026): un clic BURBUJEA; el manejador del padre (onclick/ng-click) o el href del
      // <a> que envuelve al control también se ejecutan. Hasta 3 niveles (atravesando el host de un shadow DOM).
      ...(() => {
        const out: (string | null)[] = []
        let p: Element | null = h.parentElement ?? ((h.getRootNode() as ShadowRoot).host ?? null)
        for (let i = 0; p && i < 3; i++) {
          out.push(p.getAttribute('onclick'), p.getAttribute('ng-click'), p.getAttribute('data-ng-click'), p.tagName === 'A' ? p.getAttribute('href') : null)
          p = p.parentElement ?? ((p.getRootNode() as ShadowRoot).host ?? null)
        }
        return out
      })(),
      // LABEL (revisión de seguridad 28/10/2026): pulsar una etiqueta ACTIVA su control (el radio oculto de ePAC, por `for` o por
      // `<x>_label` → `#<x>`): el id/name/value/onclick/onchange de ESE control también se ejecutan y el patrón los tiene que ver.
      // `value` solo de casillas/opciones (catálogo): el de un campo de texto podría ser un dato y la descripción llega a mensajes.
      ...(() => {
        if (h.tagName !== 'LABEL') return [] as (string | null)[]
        const l = base as HTMLLabelElement
        let c: Element | null = l.control ?? null
        if (!c && l.id && /_label$/.test(l.id)) c = l.ownerDocument.getElementById(l.id.slice(0, -'_label'.length))
        if (!c) return [] as (string | null)[]
        const tipo = (c.getAttribute('type') ?? '').toLowerCase()
        const conValor = c.tagName === 'INPUT' && ['checkbox', 'radio'].includes(tipo)
        return [c.id || null, c.getAttribute('name'), conValor ? c.getAttribute('value') : null, c.getAttribute('onclick'), c.getAttribute('onchange')]
      })(),
    ]
  }, alContenedor)
}

/** Elige la modalidad (radio bajo la fila de opción): Datos Básicos, una vez, pestaña verificada. */
export async function elegirOpcion(page: Page, guard: GuardEmision, modalidad: ModalidadPortal): Promise<void> {
  guard.comprobar()
  guard.fases.autorizarOpcion(await pestanaActiva(page))
  const r = await enMarcos(page, (f) => f.locator('xpath=//tr[td[contains(translate(normalize-space(.),"elijaunopcó","ELIJAUNOPCÓ"),"ELIJA UNA OPCI")]]//input[@type="radio"]'))
  if (r.total !== 2 || r.marcos !== 1 || !r.locator) throw new Error('allianz/comunidades: se esperaban exactamente 2 radios de modalidad, en un solo marco')
  const radios = r.locator
  await radios.nth(modalidad === 'personalizado' ? 1 : 0).check()
  guard.comprobar()
}

/**
 * El «Aceptar» de Datos Básicos (SOLO avanza a «Tarificar»). Pasa por la máquina de fases: una vez,
 * tras elegir opción, con la pestaña verificada. Debe haber EXACTAMENTE un candidato visible. Tras el
 * clic exige que la pestaña activa sea «Tarificar»; si no, aborta.
 */
export async function pulsarAvance(page: Page, guard: GuardEmision): Promise<void> {
  guard.comprobar()
  guard.fases.autorizarAceptar(await pestanaActiva(page))
  // DOM real (06/10/2026): es un «footer button» del servlet, `<div id="aceptar" onclick="btnAceptar();">`, no un
  // a/button/input. Por id Y texto exacto. (La pestaña `td#TARIFICAR` dispara lo mismo y NO se usa.)
  const c = await enMarcos(page, (f) =>
    f
      .locator('#aceptar')
      .filter({ hasText: /^\s*Aceptar\s*$/i })
      .locator('visible=true'),
  )
  if (c.total !== 1 || !c.locator) throw new Error('allianz/comunidades: no hay exactamente un control visible de avance en Datos Básicos')
  const boton = c.locator.first()
  comprobarBoton(await descripcion(boton), { permitirAceptar: true })
  await boton.click()
  for (let i = 0; i < 60; i++) {
    guard.comprobar()
    const p = await pestanaActiva(page)
    if (p === 'tarificar') {
      guard.fases.confirmarTarificar(p)
      return
    }
    await page.waitForTimeout(500)
  }
  throw new Error('allianz/comunidades: tras el avance no apareció la pestaña Tarificar')
}

/**
 * Pestaña «Proyecto» (genera el PDF sin grabar nada, confirmado por Alberto): solo desde Tarificar.
 * El control lo da el adaptador; se pulsa con las comprobaciones de siempre (nada de emitir/archivar).
 */
export async function pulsarProyecto(page: Page, boton: Locator, guard: GuardEmision): Promise<void> {
  guard.comprobar()
  guard.fases.autorizarProyecto(await pestanaActiva(page))
  const desc = await descripcion(boton)
  comprobarBoton(desc)
  await boton.click()
  guard.comprobar()
}

/**
 * EMISIÓN AUTORIZADA (10/10/2026): el ÚNICO camino del worker para pulsar un botón de emisión, y una sola vez. Exige, en
 * este orden y sin atajos:
 *   1. el guard de siempre limpio (`guard.comprobar()`);
 *   2. la máquina de fases: solo desde Tarificar, con la pestaña verificada en el DOM, una vez (`autorizarEmision`);
 *   3. EXACTAMENTE un control visible con el id y el texto del permiso, en un solo marco;
 *   4. `usarPermisoEmision`: un permiso creado tras canjear el token de Alberto, de ESTE trabajo y ESTE hash, sin usar,
 *      y que ese control sea su botón (nada de RGPD, SMS/OTP, contraseñas, pago fraccionado ni anulaciones).
 * Solo entonces abre la ventana de red y pulsa. Cualquier fallo lanza `EmisionBloqueadaError` (o un error) SIN pulsar.
 */
export async function pulsarEmisionAutorizada(page: Page, guard: GuardEmision, permiso: PermisoEmision, vinculo: { trabajoId: string; hashDatos: string }): Promise<void> {
  guard.comprobar()
  if (guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', 'emisión con la ventana de guardado abierta')
  if (!permiso || typeof permiso !== 'object' || !esBotonDeListaBlanca(permiso.boton)) throw new EmisionBloqueadaError('fase', 'emisión sin permiso válido')
  guard.fases.autorizarEmision(await pestanaActiva(page))
  const { id, texto } = permiso.boton
  if (!/^[A-Za-z][\w-]{0,63}$/.test(id)) throw new EmisionBloqueadaError('boton', `id de botón no válido en el permiso: ${id.slice(0, 40)}`)
  const c = await enMarcos(page, (f) =>
    f
      .locator(`#${id}`)
      .filter({ hasText: new RegExp(`^\\s*${texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`) })
      .locator('visible=true'),
  )
  if (c.total !== 1 || c.marcos !== 1 || !c.locator) throw new EmisionBloqueadaError('boton', `no hay exactamente un control visible «${texto}» (#${id})`)
  const boton = c.locator.first()
  usarPermisoEmision(permiso, vinculo, await descripcion(boton))
  const abrir = ABRIR_VENTANA.get(guard)
  if (!abrir) throw new EmisionBloqueadaError('fase', 'guard sin ventana de emisión')
  abrir(VENTANA_RED_EMISION_MS)
  try {
    await boton.click()
  } catch (e) {
    // El clic falló (o no se sabe si salió): la ventana de red se cierra YA, antes de que el runner haga nada más.
    guard.ventana.cerrar()
    throw e
  }
}

/**
 * AVANCE DE PESTAÑA AUTORIZADO (Moto, Alberto 13/10/2026; ver `AVANCES_PESTANA_AUTORIZADOS`). El ÚNICO camino para pulsar
 * `td#datosBasicos` / `td#rate`, que ejecutan el manejador «Aceptar» del portal. Exige, en este orden y sin atajos:
 *   1. el guard de siempre limpio y la ventana de EMISIÓN cerrada;
 *   2. selector en la lista blanca EXACTA (cualquier otro → rechazo sin pulsar) y no usado antes en este trabajo;
 *   3. EXACTAMENTE un control visible, en un solo marco, con id, texto y `onclick` exactos, y que pase `comprobarBoton`
 *      (con «Aceptar» permitido: «Emitir», `validar_aceptar`, `store`, `contract`… siguen bloqueados);
 *   4. que ese marco sea la pantalla de ORIGEN (`form#formulari` con el `action` esperado).
 * Solo entonces abre la ventana de red (capa a: `parametrosParecenEmision` en query y cuerpo; capa b: destinos no GET en lista
 * blanca), pulsa UNA vez y espera la pantalla de DESTINO. La ventana se cierra SIEMPRE (finally), también en error.
 */
export async function pulsarAvancePestanaAutorizado(page: Page, guard: GuardEmision, selector: SelectorAvancePestana): Promise<Frame> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', 'avance de pestaña con la ventana de emisión o de guardado abierta')
  if (typeof selector !== 'string' || !Object.hasOwn(AVANCES_PESTANA_AUTORIZADOS, selector)) {
    throw new EmisionBloqueadaError('boton', `avance de pestaña no autorizado: ${String(selector).slice(0, 60)}`)
  }
  const regla = AVANCES_PESTANA_AUTORIZADOS[selector]
  const usados = AVANCES_USADOS.get(guard) ?? new Set<string>()
  if (usados.has(selector)) throw new EmisionBloqueadaError('fase', `avance de pestaña ${selector} ya usado en este trabajo`)
  const onclickEsperado = new RegExp(`^\\s*goSelected\\('${regla.id}'\\);\\s*aceptar_onclick\\(\\);?\\s*$`)
  // Un solo control visible con ese id y texto exacto, en un solo marco; ese marco tiene que ser la pantalla de origen.
  let marco: Frame | null = null
  let total = 0
  for (const f of marcosVivos(page)) {
    const n = await f.locator(selector).filter({ hasText: new RegExp(`^\\s*${regla.texto}\\s*$`) }).locator('visible=true').count().catch(() => 0)
    if (n > 0) {
      total += n
      if (marco) throw new EmisionBloqueadaError('boton', `avance de pestaña ${selector}: el control aparece en más de un marco`)
      marco = f
    }
  }
  if (total !== 1 || !marco) throw new EmisionBloqueadaError('boton', `avance de pestaña ${selector}: no hay exactamente un control visible «${regla.texto}»`)
  const boton = marco.locator(selector).filter({ hasText: new RegExp(`^\\s*${regla.texto}\\s*$`) }).locator('visible=true').first()
  const desc = await descripcion(boton)
  const [texto, , , , id, , , onclick] = desc
  const tag = await boton.evaluate((el) => el.tagName)
  if (tag !== 'TD' || id !== regla.id || (texto ?? '').trim() !== regla.texto || !onclickEsperado.test(onclick ?? '')) {
    throw new EmisionBloqueadaError('boton', `avance de pestaña ${selector}: el control no es la pestaña grabada`)
  }
  comprobarBoton(desc, { permitirAceptar: true })
  const origen = await accionFormulario(marco)
  if (origen !== regla.formOrigen) throw new EmisionBloqueadaError('fase', `avance de pestaña ${selector}: la pantalla actual no es la de origen`)
  const abrir = ABRIR_AVANCE.get(guard)
  if (!abrir) throw new EmisionBloqueadaError('fase', 'guard sin ventana de avance')
  usados.add(selector)
  AVANCES_USADOS.set(guard, usados)
  // UN plazo para todo: la ventana de red y la espera de la pantalla de destino vencen en el MISMO instante (`hasta`), y la
  // ventana se cierra antes en cuanto se llega (finally).
  const hasta = Date.now() + VENTANA_RED_AVANCE_MS
  // Un diálogo del portal (confirm/alert) durante el avance NUNCA se acepta: se descarta y el trabajo cae (salvo la excepción exacta, que se responde «No» y sigue).
  let dialogo: { tipo: string; mensaje: string } | null = null
  const alDialogo = (d: Dialog) => {
    // Excepción EXACTA (`CONFIRMS_AVANCE_ACEPTABLES`): solo antes de cualquier otro diálogo y una vez por trabajo.
    const aceptados = CONFIRMS_ACEPTADOS.get(guard) ?? new Set<string>()
    if (dialogo === null && confirmAvanceAceptable(selector, d.type(), d.message(), aceptados.has(selector))) {
      aceptados.add(selector)
      CONFIRMS_ACEPTADOS.set(guard, aceptados)
      SUPUESTOS_AVANCE.set(page, [...(SUPUESTOS_AVANCE.get(page) ?? []), CONFIRMS_AVANCE_ACEPTABLES[selector]!.supuesto])
      d.dismiss().catch(() => {}) // «No»: nunca se alarga el término (decisión de Alberto)
      return
    }
    dialogo ??= { tipo: d.type(), mensaje: textoDialogoPortalSeguro(d.message()) }
    d.dismiss().catch(() => {})
  }
  page.on('dialog', alDialogo)
  abrir(hasta, regla.endpoints, regla.ajaxValidacion)
  try {
    await boton.click()
    for (;;) {
      guard.comprobar()
      const dlg = dialogo as { tipo: string; mensaje: string } | null // lo escribe el manejador del diálogo (TS no lo ve)
      if (dlg) {
        if (dlg.tipo === 'alert') throw new ErrorTarificador('datos', `allianz: el portal avisó al avanzar a ${regla.texto}: ${dlg.mensaje}`)
        throw new EmisionBloqueadaError('fase', `avance de pestaña ${selector}: el portal pidió confirmación («${dlg.tipo}»: «${dlg.mensaje}») y el robot no confirma`)
      }
      for (const f of marcosVivos(page)) if ((await accionFormulario(f)) === regla.formDestino) {
        guard.comprobar()
        return f
      }
      // ¿El portal rechazó el avance? (filas de error de su «INFORME DE AVISO E INCIDENCIAS»): no se espera al tope.
      const conError = []
      for (const f of marcosVivos(page)) if ((await f.locator(SEL_ERROR_EPAC).count().catch(() => 0)) > 0) conError.push(f)
      if (conError.length > 0) throw new ErrorAvanceSinLlegar(selector, [...new Set([marco, ...conError].filter((f) => !f.isDetached()))], true)
      if (Date.now() >= hasta) throw new ErrorAvanceSinLlegar(selector, marco.isDetached() ? marcosVivos(page) : [marco], false)
      await page.waitForTimeout(250)
    }
  } finally {
    page.off('dialog', alDialogo)
    guard.avance.cerrar()
  }
}

/**
 * Texto de un diálogo nativo del portal (confirm/alert) apto para un error: el portal puede nombrar a la persona («Juan Pérez García
 * ya tiene…»), y `redactarDatosPersonales` solo tapa trozos con cifras o @. Antes se tapan las secuencias de 2+ palabras
 * Capitalizadas (o en MAYÚSCULAS) seguidas, con partículas «de/del/la/los/las/y» entre ellas, como posible nombre propio → «[nombre]».
 * Las frases normales («La fecha de expedición del carné es anterior…») no tienen dos capitalizadas seguidas y se conservan. Tope 200.
 */
export function textoDialogoPortalSeguro(bruto: string): string {
  const palabra = "\\p{Lu}[\\p{L}'’-]+"
  const nombre = new RegExp(`${palabra}(?:\\s+(?:(?:de|del|la|las|los|y)\\s+)?${palabra})+`, 'gu')
  const limpio = bruto.replace(/\s+/g, ' ').trim().replace(nombre, '[nombre]')
  return redactarDatosPersonales(limpio).slice(0, 200)
}

/** Filas de ERROR del informe de incidencias del framework legado de ePAC (las de aviso no paran). */
export const SEL_ERROR_EPAC = '#dataErrorSection tr.rowAppErrorTextBlock'

/**
 * El avance no llegó a la pantalla de destino. `marcos`: dónde leer las incidencias del portal (el de ORIGEN y los que
 * tengan filas de error). El adaptador las lee y, si las hay, lanza `datos` con el mensaje del portal; si no, este error
 * (`portal`, no transitorio) se propaga tal cual.
 */
export class ErrorAvanceSinLlegar extends ErrorTarificador {
  readonly marcos: Frame[]
  constructor(selector: string, marcos: Frame[], conIncidencias: boolean) {
    super('portal', `avance de pestaña ${selector}: ${conIncidencias ? 'el portal lo rechazó (informe de incidencias)' : 'no apareció la pantalla de destino'}`)
    this.name = 'ErrorAvanceSinLlegar'
    this.marcos = marcos
  }
}

/** `action` (atributo literal) del `form#formulari` del marco, o `null`. Solo lectura. */
async function accionFormulario(f: Frame): Promise<string | null> {
  const form = f.locator('form#formulari')
  if ((await form.count().catch(() => 0)) !== 1) return null
  return form.getAttribute('action').catch(() => null)
}

/**
 * ENLACE DE ENTRADA AUTORIZADO (Mapfre wmediadores, OK de Alberto 14/10/2026). «Tarificación y Emisión Rápida» es la
 * NAVEGACIÓN al formulario de tarificación de Auto (abre una pestaña nueva), pero casa con `emisi`. Excepción EXACTA y
 * CERRADA, por compañía: solo pasa el elemento cuyo texto visible normalizado (espacios colapsados, sin distinguir
 * mayúsculas) es IGUAL a una etiqueta de esta lista; con sufijo, prefijo u otra redacción → bloqueado. El regex general NO se toca:
 * id, href, onclick, title… que no sean exactamente ese texto siguen pasando por `comprobarBoton`, y la red (navegación
 * de la pestaña nueva incluida) sigue con el guard de siempre.
 */
export const ENLACES_ENTRADA_AUTORIZADOS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  // Etiquetas de MENÚ de Mapfre donde «Emisión» es sustantivo (decisión de Alberto, 14/10/2026). Lista exacta, no regex.
  mapfre: Object.freeze([
    'Tarificación y Emisión Rápida',
    'Tarificación y Emisión (General)',
    'Tarificación y Emisión (Otros Acuerdos)',
    'Tarificación y Emisión (Acuerdos)',
    'Tarificación y Emisión',
  ]),
  // Fidelidade (intranet de mediadores, Alberto 28/10/2026): ruta fija hasta el formulario de Vivienda. Ninguna de estas etiquetas casa con
  // el patrón de emisión hoy; se listan igual para que el recorrido sea EXACTO, ordenado (`PREVIOS_ENTRADA`) y solo en su origen
  // (`ORIGEN_ENTRADA`). «Simulación» es el botón rojo de la tarjeta «Fidelidade Vivienda» (simula = tarifica; no emite).
  fidelidade: Object.freeze(['Oficina Virtual', 'Proyecto', 'Nuevo proyecto', 'Simulación']),
})

/** Origen EXACTO (https) en el que vale el enlace de entrada de una compañía; sin entrada aquí = sin restricción de origen (Mapfre). */
export const ORIGEN_ENTRADA: Readonly<Record<string, string>> = Object.freeze({ fidelidade: 'https://mediadores.fidelidade.es' })

/** Orden obligatorio de los enlaces de entrada de una compañía: cada clave solo se pulsa tras su valor (etiquetas normalizadas). */
export const PREVIOS_ENTRADA: Readonly<Record<string, Readonly<Record<string, string>>>> = Object.freeze({
  fidelidade: Object.freeze({ proyecto: 'oficina virtual', 'nuevo proyecto': 'proyecto', 'simulación': 'nuevo proyecto' }),
})

const textoEntrada = (t: string | null | undefined) => (t ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('es')

/** Guards cuya fase de ENTRADA ya terminó (el bucle IA empezó): el enlace de entrada deja de existir para ellos. */
const ENTRADA_CERRADA = new WeakSet<GuardEmision>()

/** Cierra la fase de entrada de este trabajo: a partir de aquí `pulsarEnlaceEntradaAutorizado` siempre rechaza. */
export function cerrarFaseEntrada(guard: GuardEmision): void {
  ENTRADA_CERRADA.add(guard)
}

/**
 * El ÚNICO camino para pulsar el enlace de entrada autorizado de `compania` (ver `ENLACES_ENTRADA_AUTORIZADOS`). Exige, en
 * este orden: guard limpio y ventana de emisión cerrada; fase de entrada abierta (`cerrarFaseEntrada` no llamado); compañía
 * en la lista; EXACTAMENTE un control, con el texto visible normalizado igual a una etiqueta autorizada; cada etiqueta una vez
 * por trabajo; y
 * `comprobarBoton` sobre el resto de su descripción. Solo entonces pulsa UNA vez. No lo recibe el bucle IA.
 */
export async function pulsarEnlaceEntradaAutorizado(boton: Locator, guard: GuardEmision, compania: string): Promise<void> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', 'enlace de entrada con la ventana de emisión, de avance o de guardado abierta')
  if (ENTRADA_CERRADA.has(guard)) throw new EmisionBloqueadaError('fase', 'enlace de entrada fuera de la fase de entrada')
  await exigirSinCuentaBancaria(boton.page())
  if (typeof compania !== 'string' || !Object.hasOwn(ENLACES_ENTRADA_AUTORIZADOS, compania)) {
    throw new EmisionBloqueadaError('boton', `enlace de entrada no autorizado para ${String(compania).slice(0, 40)}`)
  }
  if ((await boton.count()) !== 1) throw new EmisionBloqueadaError('boton', 'enlace de entrada: no hay exactamente un control')
  const desc = await descripcion(boton)
  // 0.3.17: un botón `<input value=…>` o una imagen con `aria-label`/`title` no tiene texto propio: la etiqueta es la primera no vacía (value, aria-label, title).
  // El texto EXACTO sigue siendo la única puerta; el resto de descripciones pasa por `comprobarBoton` como siempre.
  const etiquetaVisible = (desc[0] ?? '').trim() !== '' ? desc[0] : [desc[3], desc[1], desc[2]].find((x) => (x ?? '').trim() !== '') ?? desc[0]
  const autorizado = textoEntrada(etiquetaVisible)
  // El mensaje lleva el TEXTO EXACTO del elemento rechazado (llega a plataforma redactado): se desbloquea uno a uno.
  if (!ENLACES_ENTRADA_AUTORIZADOS[compania].some((t) => textoEntrada(t) === autorizado)) throw new EmisionBloqueadaError('boton', String(etiquetaVisible ?? ''))
  if (Object.hasOwn(ORIGEN_ENTRADA, compania)) {
    let origen = ''
    try {
      const u = new URL(boton.page().url())
      origen = u.username || u.password ? '' : u.origin
      // Y el marco DEL BOTÓN (un iframe de otro origen con la misma etiqueta no vale aunque la página de arriba sea la buena).
      const h = await boton.elementHandle({ timeout: 2_000 })
      const marco = h ? await h.ownerFrame() : null
      const m = marco ? new URL(marco.url()) : null
      if (!m || m.username || m.password || m.origin !== origen) origen = ''
    } catch { origen = '' }
    if (origen !== ORIGEN_ENTRADA[compania]) throw new EmisionBloqueadaError('boton', `enlace de entrada de ${compania} fuera de ${ORIGEN_ENTRADA[compania]}`)
  }
  const usados = AVANCES_USADOS.get(guard) ?? new Set<string>()
  const clave = `entrada:${autorizado}`
  if (usados.has(clave)) throw new EmisionBloqueadaError('fase', `el enlace de entrada «${String(desc[0] ?? '').trim()}» ya se usó en este trabajo`)
  const previo = PREVIOS_ENTRADA[compania]?.[autorizado]
  if (previo !== undefined && !usados.has(`entrada:${previo}`)) throw new EmisionBloqueadaError('fase', `el enlace de entrada «${String(desc[0] ?? '').trim()}» va después de «${previo}»`)
  comprobarBoton(desc.filter((d) => textoEntrada(d) !== autorizado))
  usados.add(clave)
  AVANCES_USADOS.set(guard, usados)
  await boton.click()
  guard.comprobar()
}

/**
 * «ACCESO A NSE» DE MAPFRE (28/10/2026, patinete): la página intermedia de la tarjeta «Patinetes» solo tiene ese enlace, con
 * `href="javascript:abrirAplicacion('inicio.jsp', 'NUEVO SISTEMA DE EMISI%C3%93N');"` (abre la APLICACIÓN NSE, donde se tarifica;
 * no emite). El ÚNICO camino para pulsarlo. Exige, en este orden: guard limpio y ventanas de red cerradas; fase de ENTRADA
 * abierta; compañía `mapfre`; EXACTAMENTE un control; texto visible EXACTO «Acceso a NSE»; una vez por trabajo; y
 * `comprobarBoton` sobre TODAS sus descripciones salvo la que sea EXACTAMENTE esa llamada (`esLanzadorAplicacionNseMapfre`):
 * cualquier otro href/onclick/id con emisión, «Aceptar», «Contratar»… sigue bloqueando. La red sigue con el guard de siempre.
 */
export async function pulsarAccesoNseMapfre(boton: Locator, guard: GuardEmision, compania: string): Promise<void> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', 'acceso a NSE con la ventana de emisión, de avance o de guardado abierta')
  if (ENTRADA_CERRADA.has(guard)) throw new EmisionBloqueadaError('fase', 'acceso a NSE fuera de la fase de entrada')
  await exigirSinCuentaBancaria(boton.page())
  if (compania !== 'mapfre') throw new EmisionBloqueadaError('boton', `acceso a NSE no autorizado para ${String(compania).slice(0, 40)}`)
  if ((await boton.count()) !== 1) throw new EmisionBloqueadaError('boton', 'acceso a NSE: no hay exactamente un control')
  const desc = await descripcion(boton)
  if (textoEntrada(desc[0]) !== textoEntrada(TEXTO_ACCESO_NSE_MAPFRE)) throw new EmisionBloqueadaError('boton', String(desc[0] ?? ''))
  const usados = AVANCES_USADOS.get(guard) ?? new Set<string>()
  if (usados.has('entrada:acceso_nse')) throw new EmisionBloqueadaError('fase', 'el acceso a NSE ya se usó en este trabajo')
  comprobarBoton(desc.filter((d) => !esLanzadorAplicacionNseMapfre(d)))
  usados.add('entrada:acceso_nse')
  AVANCES_USADOS.set(guard, usados)
  await boton.click()
  guard.comprobar()
}

/** Entrada de menú de la aplicación NSE de Mapfre que lleva a las ofertas (MásPatín). Texto EXACTO. */
export const TEXTO_MENU_OFERTA_NSE_MAPFRE = 'Oferta / Contratación'
/** Ruta (prefijo) de la aplicación NSE de Mapfre (real 28/10/2026: `/EVT21_NSE_FWEB/inicio.jsp`). */
const RUTA_APP_NSE_MAPFRE = '/EVT21_NSE_FWEB/'

/**
 * «OFERTA / CONTRATACIÓN» DEL MENÚ DE LA APLICACIÓN NSE DE MAPFRE (real 28/10/2026, patinete: primera pantalla tras «Acceso a NSE»).
 * Su texto contiene «contrat» y el guard lo bloquea; es la entrada de menú a la OFERTA (donde se elige MásPatín), no un contrato.
 * El ÚNICO camino para pulsarla. Exige: guard limpio y ventanas de red cerradas; fase de ENTRADA abierta; compañía `mapfre`; el
 * control VIVO dentro de la aplicación NSE (ruta `/EVT21_NSE_FWEB/…` de SU documento); EXACTAMENTE un control; texto visible EXACTO
 * «Oferta / Contratación»; una vez por trabajo; y `comprobarBoton` sobre todas sus descripciones salvo las que son EXACTAMENTE ese
 * texto (un href/onclick/id con «contrat», emitir, pagar… sigue bloqueando). La red sigue con el guard de siempre.
 */
export async function pulsarMenuOfertaNseMapfre(boton: Locator, guard: GuardEmision, compania: string): Promise<void> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', 'menú NSE con la ventana de emisión, de avance o de guardado abierta')
  if (ENTRADA_CERRADA.has(guard)) throw new EmisionBloqueadaError('fase', 'menú NSE fuera de la fase de entrada')
  await exigirSinCuentaBancaria(boton.page())
  if (compania !== 'mapfre') throw new EmisionBloqueadaError('boton', `menú NSE no autorizado para ${String(compania).slice(0, 40)}`)
  if ((await boton.count()) !== 1) throw new EmisionBloqueadaError('boton', 'menú NSE: no hay exactamente un control')
  const ruta = await boton.evaluate((el) => el.ownerDocument.location.pathname).catch(() => '')
  if (!ruta.toUpperCase().startsWith(RUTA_APP_NSE_MAPFRE)) throw new EmisionBloqueadaError('boton', 'menú NSE: el control no está en la aplicación NSE')
  const desc = await descripcion(boton)
  const exacto = textoEntrada(TEXTO_MENU_OFERTA_NSE_MAPFRE)
  if (textoEntrada(desc[0]) !== exacto) throw new EmisionBloqueadaError('boton', String(desc[0] ?? ''))
  const usados = AVANCES_USADOS.get(guard) ?? new Set<string>()
  if (usados.has('entrada:menu_oferta_nse')) throw new EmisionBloqueadaError('fase', 'el menú «Oferta / Contratación» ya se usó en este trabajo')
  // Posiciones INTACTAS (0.3.6, real 15:19): con `filter` el href se desplazaba de la posición 6 a la 5 y la tolerancia no lo veía.
  comprobarBoton(conRutasTolerables(guard, desc.map((d) => (textoEntrada(d) === exacto ? null : d))))
  usados.add('entrada:menu_oferta_nse')
  AVANCES_USADOS.set(guard, usados)
  await boton.click()
  guard.comprobar()
}

// ─────────── Mapfre NSEI · diálogo «Selección de vehículo» (Alberto, 14/10/2026) ───────────

/** El diálogo de Mapfre tras teclear la matrícula (grabación 13/10/2026). Solo lo nombra este fichero para PULSAR. */
export const SEL_DIALOGO_VEHICULO_MAPFRE = 'app-matricula-dialog'
/** Columna «Matrícula» (posición 1; la 0 es la del radio). Se lee AQUÍ y solo para compararla: nunca sale de esta función. */
const COLUMNA_MATRICULA_MAPFRE = 1
/** Columna «Denominación comercial» (catálogo, no dato personal): la celda que se pulsa si la fila no trae radio. */
const COLUMNA_DENOMINACION_MAPFRE = 3
/** Control de elección de la fila: el primer selector con EXACTAMENTE un control en la fila (Angular Material o nativo). */
const SELECTORES_RADIO_FILA = ['mat-radio-button', 'input[type="radio"]', '[role="radio"]'] as const
const ESPERA_HABILITADO_MAPFRE_MS = 5_000
const ESPERA_CIERRE_DIALOGO_MAPFRE_MS = 10_000

const sinTildesMayus = (t: string | null | undefined) => (t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase()

/**
 * CONFIRMAR EL VEHÍCULO en el diálogo «Selección de vehículo» de Mapfre NSEI. El ÚNICO camino para marcar la fila y pulsar
 * su «Aceptar» (el adaptador no los nombra). Exige, en este orden y sin atajos:
 *   1. guard limpio, todas las ventanas de red cerradas, sin campo de cuenta bancaria y una sola vez por trabajo;
 *   2. EXACTAMENTE un diálogo visible; 0 filas → `datos`. Se toma la fila `indice` (antes, la PRIMERA: decisión de Alberto,
 *      14/10/2026: antes era requiere_humano); las demás no se miran ni se marcan;
 *   3. la MATRÍCULA de esa fila igual (normalizada) a la del riesgo; si no casa → `datos` (nunca se prueba otra
 *      fila). La comparación se hace aquí y la matrícula NO sale: ni a logs, ni a mensajes de error, ni a la IA, ni al
 *      resultado (el radio se describe sin su `value`);
 *   4. EXACTAMENTE un control de elección en la fila, que pase `comprobarBoton`; se marca;
 *   5. EXACTAMENTE un «Aceptar» visible DENTRO del diálogo, texto exacto, que se habilite y pase `comprobarBoton` con
 *      «Aceptar» permitido (emitir, contratar, «No es el vehículo», «Vehículo NO catalogado», `validar_aceptar`… siguen
 *      bloqueados); un diálogo nativo del navegador se descarta y el trabajo cae;
 *   6. que el diálogo se cierre. No abre ninguna ventana de red: si el «Aceptar» pidiera algo que casa con el patrón de
 *      emisión, la red lo aborta (fail-closed) y se revisa con la primera prueba real.
 * `indice` (v0.8.0, grabación de Alberto del 15/10/2026): la fila que el ADAPTADOR eligió por regla fija (una sola fila, o la
 * única que casa con los datos del riesgo; `indiceFilaVehiculoMapfre`). Por defecto la primera. Se compara la matrícula de
 * ESA fila. Sin radio en la fila (la grabación pulsa la celda: la fila de la tabla CDK es la que se elige), se pulsa una celda
 * de CATÁLOGO de esa fila (nunca la de matrícula ni la de bastidor) tras `comprobarBoton` sobre los atributos técnicos de la fila.
 * `denominacion`: texto de catálogo (no personal) de la fila que el adaptador leyó; si llega, la fila `nth(indice)` tiene que
 * tener esa misma denominación (normalizada) antes de marcarla: si la tabla se re-ordenó entre la lectura y el clic, no pulsa y lanza.
 */
export async function confirmarVehiculoMapfre(page: Page, guard: GuardEmision, matriculaRiesgo: string, indice = 0, denominacion?: string): Promise<void> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', 'selección de vehículo con una ventana de red abierta')
  const usados = AVANCES_USADOS.get(guard) ?? new Set<string>()
  if (usados.has('mapfre:seleccion_vehiculo')) throw new EmisionBloqueadaError('fase', 'la selección de vehículo de Mapfre ya se usó en este trabajo')
  if (typeof matriculaRiesgo !== 'string' || !esMatriculaEspanola(matriculaRiesgo)) throw new ErrorTarificador('datos', 'mapfre: la matrícula del riesgo no tiene formato de matrícula española')
  if (!Number.isInteger(indice) || indice < 0) throw new EmisionBloqueadaError('fase', 'selección de vehículo: índice de fila no válido')
  await exigirSinCuentaBancaria(page)
  const dialogos = page.locator(SEL_DIALOGO_VEHICULO_MAPFRE).locator('visible=true')
  if ((await dialogos.count()) !== 1) throw new ErrorTarificador('portal', 'mapfre: no hay exactamente un diálogo «Selección de vehículo» visible')
  const dialogo = dialogos.first()
  const filas = dialogo.locator('table tbody tr')
  const n = await filas.count()
  if (n === 0) throw new ErrorTarificador('datos', 'mapfre: «Selección de vehículo» no trae ningún vehículo para la matrícula del riesgo')
  if (indice >= n) throw new ErrorTarificador('portal', 'mapfre: la fila elegida de «Selección de vehículo» ya no está en el diálogo')
  // Solo se compara y se marca la fila ELEGIDA (`indice`); nunca se busca otra que case.
  // Si hay cabecera, la columna tiene que llamarse «Matrícula» (si el portal reordena, se para en vez de comparar otra cosa).
  const cabecera = await dialogo.locator('table thead th').evaluateAll((els) => els.map((e) => e.textContent ?? ''))
  if (cabecera.length > 0 && sinTildesMayus(cabecera[COLUMNA_MATRICULA_MAPFRE]) !== 'MATRICULA') {
    throw new ErrorTarificador('portal', 'mapfre: las columnas de «Selección de vehículo» no son las grabadas (no se compara la matrícula)')
  }
  const fila = filas.nth(indice)
  const enFila = await fila.locator('td').nth(COLUMNA_MATRICULA_MAPFRE).textContent({ timeout: 1_000 }).catch(() => null)
  if (enFila === null) throw new ErrorTarificador('portal', 'mapfre: no se pudo leer la columna «Matrícula» de «Selección de vehículo»')
  if (normalizarMatricula(enFila.trim()) !== normalizarMatricula(matriculaRiesgo)) {
    throw new ErrorTarificador('datos', 'mapfre: el vehículo elegido de «Selección de vehículo» no tiene la matrícula del riesgo')
  }
  if (denominacion !== undefined) {
    const denFila = await fila.locator('td').nth(COLUMNA_DENOMINACION_MAPFRE).textContent({ timeout: 1_000 }).catch(() => null)
    if (denFila === null || sinTildesMayus(denFila) !== sinTildesMayus(denominacion)) {
      throw new ErrorTarificador('portal', 'mapfre: la fila elegida de «Selección de vehículo» ya no es la leída (la tabla cambió); no se marca')
    }
  }
  let radio: Locator | null = null
  for (const sel of SELECTORES_RADIO_FILA) {
    const l = fila.locator(sel)
    if ((await l.count()) === 1) {
      radio = l
      break
    }
  }
  if (!radio) {
    // Grabación 15/10/2026: la fila (tabla CDK) se elige pulsando una celda. Solo una celda de CATÁLOGO (denominación).
    const celdas = await fila.locator('td').count()
    if (celdas <= COLUMNA_DENOMINACION_MAPFRE) throw new ErrorTarificador('portal', 'mapfre: la fila de «Selección de vehículo» no tiene exactamente un control para elegirla')
    radio = fila.locator('td').nth(COLUMNA_DENOMINACION_MAPFRE)
  }
  // Sin `value` ni textos (pueden llevar la matrícula o el bastidor, y un EmisionBloqueadaError copiaría el texto): solo
  // atributos técnicos del control Y de la fila (sus manejadores de clic se ejecutan al burbujear).
  const descRadio = await radio.evaluate((el) => {
    const h = el as HTMLElement & { name?: unknown }
    const tr = h.closest('tr')
    return [h.tagName === 'TD' ? (h.innerText ?? h.textContent ?? '') : null, h.getAttribute('aria-label'), h.id || null, typeof h.name === 'string' ? h.name : null, h.getAttribute('onclick'), h.getAttribute('ng-click'),
      tr?.getAttribute('onclick') ?? null, tr?.getAttribute('ng-click') ?? null, tr?.id || null]
  })
  comprobarBoton(descRadio)
  const aceptar = dialogo.locator('button, [role="button"], input[type="button"], input[type="submit"]').filter({ hasText: /^\s*Aceptar\s*$/i }).locator('visible=true')
  if ((await aceptar.count()) !== 1) throw new ErrorTarificador('portal', 'mapfre: «Selección de vehículo» no tiene exactamente un «Aceptar» visible')
  usados.add('mapfre:seleccion_vehiculo')
  AVANCES_USADOS.set(guard, usados)
  await radio.click()
  guard.comprobar()
  const fin = Date.now() + ESPERA_HABILITADO_MAPFRE_MS
  while (!(await aceptar.isEnabled().catch(() => false))) {
    if (Date.now() >= fin) throw new ErrorTarificador('portal', 'mapfre: «Aceptar» de «Selección de vehículo» no se habilitó al elegir la fila')
    await page.waitForTimeout(150)
  }
  await exigirSinCuentaBancaria(page)
  const desc = await descripcion(aceptar)
  if (sinTildesMayus(desc[0]) !== 'ACEPTAR') throw new EmisionBloqueadaError('boton', String(desc[0] ?? ''))
  comprobarBoton(desc, { permitirAceptar: true })
  let dialogoNativo: string | null = null
  const alDialogo = (d: Dialog) => {
    dialogoNativo ??= d.type()
    d.dismiss().catch(() => {})
  }
  page.on('dialog', alDialogo)
  try {
    await aceptar.click()
    const hasta = Date.now() + ESPERA_CIERRE_DIALOGO_MAPFRE_MS
    for (;;) {
      guard.comprobar()
      if (dialogoNativo) throw new EmisionBloqueadaError('fase', `selección de vehículo: el portal abrió un diálogo («${dialogoNativo}») y el robot no confirma`)
      if ((await page.locator(SEL_DIALOGO_VEHICULO_MAPFRE).locator('visible=true').count()) === 0) return
      if (Date.now() >= hasta) throw new ErrorTarificador('portal', 'mapfre: «Selección de vehículo» no se cerró tras confirmar')
      await page.waitForTimeout(200)
    }
  } finally {
    page.off('dialog', alDialogo)
  }
}

// ─────────── Mapfre NSEI · diálogos de la búsqueda del tomador (Alberto, 14/10/2026) ───────────

const SEL_DIALOGO_TOMADOR_MAPFRE = 'mat-dialog-container, [role="dialog"], [role="alertdialog"]'
/** Avisos informativos cuyo cierre está AUTORIZADO: texto EXACTO (sin tildes, mayúsculas, sin punto final). Se amplía uno a uno. */
export const AVISOS_TOMADOR_MAPFRE = Object.freeze([
  'NO EXISTE NINGUN REGISTRO PARA ESA CONDICION DE BUSQUEDA',
  'NO SE HA ENCONTRADO',
  'NO SE HAN ENCONTRADO',
  'SIN RESULTADOS',
] as const)
/** Selector (solo lectura, para CONTAR) de las filas/controles de elección del diálogo de personas del tomador. Nunca se pulsa desde fuera. */
export const SEL_FILAS_DIALOGO_PERSONAS = 'table tbody tr, mat-row, mat-list-option, mat-radio-button, [role="radio"], input[type="radio"]'
const FILAS_TOMADOR = 'table tbody tr, mat-row, mat-list-option'
const normalizarDocumento = (t: string | null | undefined) => (t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^0-9A-Za-z]/g, '').toUpperCase()

/**
 * ELEGIR PERSONA en el diálogo de selección del tomador. Regla FIJA, sin IA: la fila cuyo NIF normalizado (alguna celda,
 * igualdad EXACTA) es el del riesgo. 0 coincidencias → `ninguna`; más de una → `varias`; sin un control (radio) único en la
 * fila → `sin_control`: en los tres casos NO se pulsa nada. El NIF nunca sale de aquí. Exige un diálogo visible, una vez por
 * trabajo, `comprobarBoton` en el control y en el «Aceptar» (solo ese texto exacto, si existe); el diálogo debe cerrarse.
 */
export async function elegirTomadorMapfre(page: Page, guard: GuardEmision, nifRiesgo: string): Promise<'elegido' | 'ninguna' | 'varias' | 'sin_control'> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', 'selección de tomador con una ventana de red abierta')
  const usados = AVANCES_USADOS.get(guard) ?? new Set<string>()
  if (usados.has('mapfre:eleccion_tomador')) throw new EmisionBloqueadaError('fase', 'la selección de tomador de Mapfre ya se usó en este trabajo')
  const nif = normalizarDocumento(nifRiesgo)
  if (nif === '') throw new ErrorTarificador('datos', 'mapfre: falta el NIF/CIF del tomador')
  await exigirSinCuentaBancaria(page)
  const dialogos = page.locator(SEL_DIALOGO_TOMADOR_MAPFRE).locator('visible=true')
  if ((await dialogos.count()) !== 1) throw new ErrorTarificador('portal', 'mapfre: no hay exactamente un diálogo de selección de tomador visible')
  const dialogo = dialogos.first()
  const filas = dialogo.locator(FILAS_TOMADOR)
  const n = await filas.count()
  const coinciden: number[] = []
  for (let i = 0; i < n; i++) {
    const celdas = await filas.nth(i).locator('td, mat-cell, [role="cell"], [role="gridcell"]').evaluateAll((els) => els.map((e) => e.textContent ?? ''))
    if (celdas.some((c) => normalizarDocumento(c) === nif)) coinciden.push(i)
  }
  if (coinciden.length === 0) return 'ninguna'
  if (coinciden.length > 1) return 'varias'
  const fila = filas.nth(coinciden[0])
  let radio: Locator | null = null
  for (const sel of SELECTORES_RADIO_FILA) {
    const l = fila.locator(sel)
    if ((await l.count()) === 1) {
      radio = l
      break
    }
  }
  if (!radio) return 'sin_control'
  // Sin `value` ni texto/aria-label/title: pueden llevar el NIF o el nombre de la persona y un EmisionBloqueadaError copiaría el texto.
  // Solo atributos técnicos (id, name, manejadores de clic): bastan para bloquear una acción de emisión.
  const descRadio = await radio.evaluate((el) => {
    const h = el as HTMLElement & { name?: unknown }
    return [h.id || null, typeof h.name === 'string' ? h.name : null, h.getAttribute('onclick'), h.getAttribute('ng-click'), h.getAttribute('data-ng-click')]
  })
  comprobarBoton(descRadio)
  const aceptar = dialogo.locator('button, [role="button"], input[type="button"], input[type="submit"]').filter({ hasText: /^\s*Aceptar\s*$/i }).locator('visible=true')
  const nAceptar = await aceptar.count()
  if (nAceptar > 1) throw new ErrorTarificador('portal', 'mapfre: la selección de tomador tiene más de un «Aceptar» visible')
  usados.add('mapfre:eleccion_tomador')
  AVANCES_USADOS.set(guard, usados)
  await radio.click()
  guard.comprobar()
  if (nAceptar === 1) {
    const fin = Date.now() + ESPERA_HABILITADO_MAPFRE_MS
    while (!(await aceptar.isEnabled().catch(() => false))) {
      if (Date.now() >= fin) throw new ErrorTarificador('portal', 'mapfre: «Aceptar» de la selección de tomador no se habilitó al elegir la fila')
      await page.waitForTimeout(150)
    }
    await exigirSinCuentaBancaria(page)
    const desc = await descripcion(aceptar)
    if (sinTildesMayus(desc[0]) !== 'ACEPTAR') throw new EmisionBloqueadaError('boton', String(desc[0] ?? ''))
    comprobarBoton(desc, { permitirAceptar: true })
    await clicSinDialogoNativo(page, guard, aceptar, 'selección de tomador')
  }
  await esperarCierreDialogoTomador(page, guard)
  return 'elegido'
}

/**
 * CERRAR el aviso informativo «no existe ningún registro» del tomador: SOLO si el texto del diálogo (sin sus botones) es uno
 * de `AVISOS_TOMADOR_MAPFRE`, no tiene filas y tiene EXACTAMENTE un botón «Aceptar»/«Cerrar» (texto exacto, `comprobarBoton`
 * con «Aceptar» permitido). Una vez por trabajo. Cualquier otro texto → `portal`, sin pulsar.
 */
export async function cerrarAvisoTomadorMapfre(page: Page, guard: GuardEmision): Promise<'sin_registro'> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', 'aviso del tomador con una ventana de red abierta')
  const usados = AVANCES_USADOS.get(guard) ?? new Set<string>()
  if (usados.has('mapfre:aviso_tomador')) throw new EmisionBloqueadaError('fase', 'el aviso del tomador de Mapfre ya se cerró en este trabajo')
  const dialogos = page.locator(SEL_DIALOGO_TOMADOR_MAPFRE).locator('visible=true')
  if ((await dialogos.count()) !== 1) throw new ErrorTarificador('portal', 'mapfre: no hay exactamente un aviso del tomador visible')
  const dialogo = dialogos.first()
  if ((await dialogo.locator(FILAS_TOMADOR).count()) > 0) throw new ErrorTarificador('portal', 'mapfre: el diálogo del tomador trae filas, no es un aviso')
  const botones = dialogo.locator('button, [role="button"], input[type="button"], input[type="submit"]').locator('visible=true')
  const textosBoton = await botones.evaluateAll((els) => els.map((e) => ((e as HTMLElement).innerText ?? e.textContent ?? '').trim()))
  let texto = await dialogo.evaluate((e) => (e as HTMLElement).innerText ?? e.textContent ?? '')
  for (const t of textosBoton) if (t) texto = texto.replace(t, ' ')
  const plano = sinTildesMayus(texto).replace(/[.\s]+$/, '')
  if (!AVISOS_TOMADOR_MAPFRE.some((a) => a === plano)) throw new ErrorTarificador('portal', 'mapfre: el aviso del tomador no es uno de los textos validados (no se cierra)')
  const cierre = botones.filter({ hasText: /^\s*(Aceptar|Cerrar)\s*$/i })
  if ((await cierre.count()) !== 1) throw new ErrorTarificador('portal', 'mapfre: el aviso del tomador no tiene exactamente un botón «Aceptar»/«Cerrar»')
  const desc = await descripcion(cierre)
  if (!['ACEPTAR', 'CERRAR'].includes(sinTildesMayus(desc[0]))) throw new EmisionBloqueadaError('boton', String(desc[0] ?? ''))
  comprobarBoton(desc, { permitirAceptar: true })
  usados.add('mapfre:aviso_tomador')
  AVANCES_USADOS.set(guard, usados)
  await clicSinDialogoNativo(page, guard, cierre, 'aviso del tomador')
  await esperarCierreDialogoTomador(page, guard)
  return 'sin_registro'
}

/** Clic con los diálogos NATIVOS del navegador descartados: si el portal abre uno, el trabajo cae (el robot no confirma). */
async function clicSinDialogoNativo(page: Page, guard: GuardEmision, boton: Locator, que: string): Promise<void> {
  let nativo: string | null = null
  const alDialogo = (d: Dialog) => {
    nativo ??= d.type()
    d.dismiss().catch(() => {})
  }
  page.on('dialog', alDialogo)
  try {
    await boton.click()
    await page.waitForTimeout(100)
    guard.comprobar()
    if (nativo) throw new EmisionBloqueadaError('fase', `${que}: el portal abrió un diálogo («${nativo}») y el robot no confirma`)
  } finally {
    page.off('dialog', alDialogo)
  }
}

async function esperarCierreDialogoTomador(page: Page, guard: GuardEmision): Promise<void> {
  const hasta = Date.now() + ESPERA_CIERRE_DIALOGO_MAPFRE_MS
  for (;;) {
    guard.comprobar()
    if ((await page.locator(SEL_DIALOGO_TOMADOR_MAPFRE).locator('visible=true').count()) === 0) return
    if (Date.now() >= hasta) throw new ErrorTarificador('portal', 'mapfre: el diálogo del tomador no se cerró')
    await page.waitForTimeout(200)
  }
}

// ─────────── Mapfre NSEI · «Continuar» del stepper (Alberto, 14/10/2026) ───────────

/**
 * «Continuar» AUTORIZADO de Mapfre NSEI, por paso de ORIGEN. Lista CERRADA: el pie del stepper avanza 1 → 2 → 3 → 4.
 * El del paso 3 («Figuras») lanza «Verificando controles técnicos» + «Calculando las primas» y lleva a PRECIO: PERMITIDO
 * por decisión de Alberto (14/10/2026). No hay «Continuar» autorizado desde Coberturas (4), Proyectos (5) ni hacia
 * Contratación (6): emitir/contratar/formalizar/grabar siguen bloqueados por `comprobarBoton` y por la red.
 * `previos`: lo que tiene que haber pasado ANTES en este trabajo (orden del flujo; el vehículo confirmado antes del paso 2).
 */
export const PASOS_CONTINUAR_MAPFRE = Object.freeze({
  datosBasicos: Object.freeze({ origen: 'Datos básicos', destino: 'Objeto asegurado', previos: Object.freeze([] as string[]), esperaMs: 20_000 }),
  objetoAsegurado: Object.freeze({ origen: 'Objeto asegurado', destino: 'Figuras', previos: Object.freeze(['mapfre:continuar:datosBasicos', 'mapfre:seleccion_vehiculo']), esperaMs: 20_000 }),
  figuras: Object.freeze({ origen: 'Figuras', destino: 'Coberturas', previos: Object.freeze(['mapfre:continuar:objetoAsegurado']), esperaMs: 90_000, dialogoLlegada: 'app-club-mapfre' }),
})
export type PasoContinuarMapfre = keyof typeof PASOS_CONTINUAR_MAPFRE

/** Cabecera del paso ACTIVO del stepper de Angular Material (`mat-step-header`, role=tab, `aria-selected`). */
export const SEL_PASO_ACTIVO_MAPFRE = 'mat-step-header[aria-selected="true"]'
const SEL_DIALOGO_ABIERTO_MAPFRE = 'mat-dialog-container, [role="dialog"], app-matricula-dialog'

/** Hueco de mapa detectado por el guard (stepper o botón no reconocibles): para SIN pulsar y pide el inventario de estructura. */
export class ErrorMapaGuardMapfre extends ErrorTarificador {
  readonly pideInventarioDom = true
  constructor(que: string) {
    super('portal', `mapfre: mapa incompleto: faltan ${que}`)
    this.name = 'ErrorMapaGuardMapfre'
  }
}

/** Texto de la cabecera del paso activo de NSEI (sin tildes, mayúsculas), o `null` si no hay EXACTAMENTE una visible. */
export async function pasoActivoMapfre(page: Page): Promise<string | null> {
  const h = page.locator(SEL_PASO_ACTIVO_MAPFRE).locator('visible=true')
  if ((await h.count().catch(() => 0)) !== 1) return null
  const t = await h.first().textContent({ timeout: 1_000 }).catch(() => null)
  return t === null ? null : sinTildesMayus(t)
}

/**
 * El ÚNICO camino para pulsar «Continuar» en Mapfre NSEI. Exige, en este orden y sin atajos:
 *   1. guard limpio, todas las ventanas de red cerradas, `paso` de la lista cerrada, una vez por paso y trabajo, y lo
 *      `previos` ya hecho en este trabajo (orden 1 → 2 → 3; el vehículo confirmado antes de salir del paso 2);
 *   2. sin campo de cuenta bancaria visible y sin diálogo abierto;
 *   3. el paso ACTIVO del stepper (exactamente una cabecera seleccionada) es el de ORIGEN; si no se reconoce → hueco con
 *      inventario (sin pulsar);
 *   4. EXACTAMENTE un botón visible de texto exacto «Continuar», fuera de diálogos, que pase `comprobarBoton` (sin
 *      «Aceptar» permitido);
 *   5. tras el clic, llega al paso DESTINO; un diálogo nativo se descarta y el trabajo cae; «Contratación» → bloqueo de
 *      emisión; no llega a tiempo → hueco con inventario (¿un obligatorio sin rellenar?).
 * No abre ninguna ventana de red: lo que el clic pida que case con el patrón de emisión se aborta (fail-closed).
 */
export async function pulsarContinuarMapfre(
  page: Page,
  guard: GuardEmision,
  paso: PasoContinuarMapfre,
  /**
   * RESPALDO (pieza 4): si NO hay exactamente un botón «Continuar» exacto, el runner pasa la localización de la capa común
   * (aprendido → IA; continuar.ts). Lo que devuelva pasa por las MISMAS comprobaciones de abajo (fuera de diálogos, texto
   * «Continuar»/«Siguiente», `comprobarBoton`, paso activo, destino); `confirmar` se llama solo tras llegar al destino.
   */
  respaldo?: (page: Page) => Promise<{ locator: Locator; confirmar: () => Promise<void> }>,
): Promise<void> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', '«Continuar» de Mapfre con una ventana de red abierta')
  if (typeof paso !== 'string' || !Object.hasOwn(PASOS_CONTINUAR_MAPFRE, paso)) throw new EmisionBloqueadaError('boton', `«Continuar» de Mapfre no autorizado desde «${String(paso).slice(0, 40)}»`)
  const regla = PASOS_CONTINUAR_MAPFRE[paso]
  const usados = AVANCES_USADOS.get(guard) ?? new Set<string>()
  const clave = `mapfre:continuar:${paso}`
  if (usados.has(clave)) throw new EmisionBloqueadaError('fase', `«Continuar» de Mapfre desde «${regla.origen}» ya se usó en este trabajo`)
  if (regla.previos.some((x) => !usados.has(x))) throw new EmisionBloqueadaError('fase', `«Continuar» de Mapfre desde «${regla.origen}» fuera de orden`)
  await exigirSinCuentaBancaria(page)
  if ((await page.locator(SEL_DIALOGO_ABIERTO_MAPFRE).locator('visible=true').count()) > 0) throw new ErrorTarificador('portal', `mapfre: «Continuar» desde «${regla.origen}» con un diálogo abierto`)
  const activo = await pasoActivoMapfre(page)
  if (activo === null) throw new ErrorMapaGuardMapfre(`el paso activo del stepper de NSEI (no hay exactamente una cabecera «${SEL_PASO_ACTIVO_MAPFRE}» visible)`)
  if (activo.includes('CONTRATACION')) throw new EmisionBloqueadaError('fase', 'Mapfre: el paso activo es «Contratación»')
  if (!activo.includes(sinTildesMayus(regla.origen))) throw new EmisionBloqueadaError('fase', `«Continuar» de Mapfre: el paso activo no es «${regla.origen}»`)
  const botones = page.locator('button, [role="button"]').filter({ hasText: /^\s*Continuar\s*$/i }).locator('visible=true')
  let boton: Locator
  let confirmarRespaldo: (() => Promise<void>) | null = null
  if ((await botones.count()) === 1) boton = botones.first()
  else {
    const hueco = new ErrorMapaGuardMapfre(`el botón «Continuar» del paso «${regla.origen}» (no hay exactamente uno visible)`)
    if (!respaldo) throw hueco
    const r = await respaldo(page).catch(() => null)
    if (!r) throw hueco
    boton = r.locator
    confirmarRespaldo = r.confirmar
  }
  if (await boton.evaluate((el) => el.closest('mat-dialog-container, [role="dialog"], app-matricula-dialog') !== null)) throw new EmisionBloqueadaError('boton', '«Continuar» de Mapfre dentro de un diálogo')
  const desc = await descripcion(boton)
  if (!['CONTINUAR', 'SIGUIENTE'].includes(sinTildesMayus(desc[0]))) throw new EmisionBloqueadaError('boton', String(desc[0] ?? ''))
  comprobarBoton(desc)
  usados.add(clave)
  AVANCES_USADOS.set(guard, usados)
  let dialogoNativo: string | null = null
  const alDialogo = (d: Dialog) => {
    dialogoNativo ??= d.type()
    d.dismiss().catch(() => {})
  }
  page.on('dialog', alDialogo)
  try {
    await boton.click()
    const destino = sinTildesMayus(regla.destino)
    const hasta = Date.now() + regla.esperaMs
    for (;;) {
      guard.comprobar()
      if (dialogoNativo) throw new EmisionBloqueadaError('fase', `«Continuar» de Mapfre: el portal abrió un diálogo («${dialogoNativo}») y el robot no confirma`)
      const ahora = await pasoActivoMapfre(page)
      if (ahora?.includes('CONTRATACION')) throw new EmisionBloqueadaError('fase', 'Mapfre: tras «Continuar» el paso activo es «Contratación»')
      // Grabación 15/10/2026: tras «Continuar» desde Figuras, Mapfre abre ANTES el diálogo «Club MAPFRE» sobre Coberturas. Cuenta
      // como llegada (no se pulsa nada aquí): lo cierra `cerrarClubMapfre` y el adaptador comprueba después que el paso es Coberturas.
      const llegadaPorDialogo = 'dialogoLlegada' in regla ? regla.dialogoLlegada : null
      if (ahora?.includes(destino) || (llegadaPorDialogo && (await page.locator(llegadaPorDialogo).locator('visible=true').count().catch(() => 0)) > 0)) {
        await confirmarRespaldo?.().catch(() => undefined)
        return
      }
      if (Date.now() >= hasta) throw new ErrorMapaGuardMapfre(`la llegada a «${regla.destino}» tras «Continuar» desde «${regla.origen}» (¿un campo obligatorio sin rellenar o un control sin mapear?)`)
      await page.waitForTimeout(250)
    }
  } finally {
    page.off('dialog', alDialogo)
  }
}

// ─────────── Mapfre NSEI · diálogo «Club MAPFRE» tras calcular (grabación de Alberto, 15/10/2026) ───────────

/** El diálogo que Mapfre abre sobre Coberturas tras «Continuar» desde Figuras. Solo lo nombra este fichero para PULSAR. */
export const SEL_CLUB_MAPFRE = 'app-club-mapfre'
/**
 * Textos AUTORIZADOS del botón de la IZQUIERDA (no adherirse / cerrar), comparados ENTEROS sin tildes, mayúsculas ni signos.
 * La grabación no trae el texto (solo `div.left button`): si el real es otro, el trabajo para con hueco (inventario y el texto
 * redactado) y se añade aquí, uno a uno. Nunca un texto de adhesión, contratación, aceptación o salida.
 */
export const TEXTOS_CIERRE_CLUB_MAPFRE = Object.freeze([
  'NO',
  'NO GRACIAS',
  'AHORA NO',
  'CERRAR',
  'CANCELAR',
  'OMITIR',
  'NO ME INTERESA',
  'NO ADHERIR',
  'NO ADHERIRSE',
  'NO DESEO ADHERIRME',
  'CONTINUAR SIN ADHERIRSE',
] as const)
const textoClub = (t: string | null | undefined) => sinTildesMayus(t).replace(/[.,;:!¡?¿]/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * CERRAR el diálogo «Club MAPFRE» por su botón de la IZQUIERDA (no adherirse). Exige, en este orden y sin atajos: guard
 * limpio y ventanas de red cerradas; una vez por trabajo y SOLO después del «Continuar» desde Figuras; sin cuenta bancaria;
 * EXACTAMENTE un diálogo visible y EXACTAMENTE un botón visible en su bloque `div.left`; texto ENTERO en
 * `TEXTOS_CIERRE_CLUB_MAPFRE` (si no, hueco con inventario, sin pulsar); `comprobarBoton` SIN «Aceptar» permitido. Un diálogo
 * nativo se descarta y el trabajo cae. El diálogo tiene que cerrarse. El botón de la derecha (adherirse) no se toca jamás.
 */
export async function cerrarClubMapfre(page: Page, guard: GuardEmision): Promise<'cerrado'> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', '«Club MAPFRE» con una ventana de red abierta')
  const usados = AVANCES_USADOS.get(guard) ?? new Set<string>()
  if (usados.has('mapfre:club')) throw new EmisionBloqueadaError('fase', 'el diálogo «Club MAPFRE» ya se cerró en este trabajo')
  if (!usados.has('mapfre:continuar:figuras')) throw new EmisionBloqueadaError('fase', '«Club MAPFRE» fuera de orden (antes de calcular las primas)')
  await exigirSinCuentaBancaria(page)
  const dialogos = page.locator(SEL_CLUB_MAPFRE).locator('visible=true')
  if ((await dialogos.count()) !== 1) throw new ErrorTarificador('portal', 'mapfre: no hay exactamente un diálogo «Club MAPFRE» visible')
  const izquierda = dialogos.first().locator('div.left').locator('button, [role="button"]').locator('visible=true')
  if ((await izquierda.count()) !== 1) throw new ErrorMapaGuardMapfre('el botón de la izquierda del diálogo «Club MAPFRE» (no hay exactamente uno visible)')
  const boton = izquierda.first()
  const desc = await descripcion(boton)
  const texto = textoClub(desc[0])
  if (!(TEXTOS_CIERRE_CLUB_MAPFRE as readonly string[]).includes(texto)) {
    throw new ErrorMapaGuardMapfre(`el texto del botón izquierdo de «Club MAPFRE» («${redactarDatosPersonales(String(desc[0] ?? '').replace(/\s+/g, ' ').trim()).slice(0, 40)}», sin validar en guard.ts)`)
  }
  comprobarBoton(desc)
  usados.add('mapfre:club')
  AVANCES_USADOS.set(guard, usados)
  await clicSinDialogoNativo(page, guard, boton, '«Club MAPFRE»')
  const hasta = Date.now() + ESPERA_CIERRE_DIALOGO_MAPFRE_MS
  for (;;) {
    guard.comprobar()
    if ((await page.locator(SEL_CLUB_MAPFRE).locator('visible=true').count()) === 0) return 'cerrado'
    if (Date.now() >= hasta) throw new ErrorTarificador('portal', 'mapfre: el diálogo «Club MAPFRE» no se cerró')
    await page.waitForTimeout(200)
  }
}

// ─────────── Diagnóstico de pantalla SIN datos personales (Mapfre 0.8.15 / Allianz Turismos 0.6.21, 22/10/2026) ───────────
// Los guardados fallaban con «no aparece el botón» sin HTML guardado. Cuando no se encuentra el control, el motivo (benigno, el
// precio no se toca) lleva ahora una lista corta de las ETIQUETAS de botones/enlaces a la vista, para saber qué hay en la pantalla.
// Solo etiquetas ≤40 caracteres; fuera todo lo que tenga secuencias de 5+ cifras, @, forma de teléfono/NIF o parezca un nombre de persona.

export const MAX_ETIQUETAS_DIAGNOSTICO = 10
const MAX_LARGO_ETIQUETA_DIAGNOSTICO = 40
/** Etiquetas que nos interesan primero (guardar/proyecto/presupuesto/descargar…): salen delante si hay más de 10. */
const RE_ETIQUETA_INTERESANTE = /guard|generar|proyecto|presupuesto|imprim|descarg|pdf|archiv|grabar|ampli|desplieg|expand|mostrar|detalle|resumen|opcion/i
/** Vocabulario de interfaz: un rótulo de 2-4 palabras Capitalizadas que NO case aquí se descarta por si es un nombre propio. */
const RE_VOCABULARIO_INTERFAZ = new RegExp(`${RE_ETIQUETA_INTERESANTE.source}|continu|volver|siguiente|anterior|atras|inicio|menu|ayuda|salir|cerrar|buscar|nuev|cancel|acept|edit|\\bver\\b|ajuste|calcul|tarific|cobertura|garant|paquete|precio|prima|vehiculo|seguro|contrat|enviar|comparar|recalcul`, 'i')

/** Etiquetas de botones/enlaces aptas para el aviso (sin datos personales), únicas, las interesantes primero, como mucho `max`. PURA. */
export function etiquetasControlesSaneadas(crudas: readonly (string | null | undefined)[], max = MAX_ETIQUETAS_DIAGNOSTICO): string[] {
  const vistas = new Set<string>()
  const buenas: string[] = []
  for (const cruda of crudas) {
    const t = (cruda ?? '').replace(/\s+/g, ' ').trim()
    if (t === '' || t.length > MAX_LARGO_ETIQUETA_DIAGNOSTICO) continue
    if (/\d{5,}/.test(t) || /@/.test(t) || /\d[\d\s.\-]{6,}\d/.test(t)) continue
    if (redactarDatosPersonales(t) !== t) continue
    const sinTildes = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    const palabras = sinTildes.split(' ')
    const pareceNombre = palabras.length >= 2 && palabras.length <= 4 && palabras.every((w) => /^[A-Z][A-Za-z.'-]*$/.test(w)) && !RE_VOCABULARIO_INTERFAZ.test(sinTildes)
    if (pareceNombre) continue
    const clave = sinTildes.toLowerCase()
    if (vistas.has(clave)) continue
    vistas.add(clave)
    buenas.push(t)
  }
  const primero = buenas.filter((t) => RE_ETIQUETA_INTERESANTE.test(t))
  const resto = buenas.filter((t) => !RE_ETIQUETA_INTERESANTE.test(t))
  return [...primero, ...resto].slice(0, max)
}

/** Cola del motivo: «; controles a la vista: «A», «B»» (ya saneados con `etiquetasControlesSaneadas`), o cadena vacía. PURA. */
export function sufijoControlesVisibles(etiquetas: readonly string[] | undefined): string {
  return etiquetas && etiquetas.length > 0 ? `; controles a la vista: ${etiquetas.map((t) => `«${t}»`).join(', ')}` : ''
}

// ─────────── Descarga del PDF del proyecto/presupuesto guardado en AUTO (26/10/2026: Allianz 0.6.28, Mapfre 0.8.23, Generali 0.2.33) ───────────
// Alberto confirma que todas las compañías dejan descargar el presupuesto ANTES de emitir. Pantalla real de auto NO capturada: buscador
// CONSERVADOR. Solo botones/enlaces cuyo texto/aria/title/tooltip casan con imprimir|descargar|pdf|documento + proyecto|presupuesto|oferta, o
// imprimir/descargar/pdf a secas si el proyecto ya está guardado (y la compañía lo admite). NUNCA emitir/contratar/grabar póliza/pagar/firmar/
// formalizar/enviar (al cliente, por email…). El clic va por `pulsarDescargaProyectoAuto` (guard, comprobarBoton, frontera bancaria); nada más.

export type CompaniaDescargaProyecto = 'allianz' | 'mapfre' | 'generali'

/** Regla propia de cada compañía. `soloConObjeto`: aun con el proyecto guardado se exige «proyecto/presupuesto/oferta» en el rótulo (Generali aún no guarda). */
export const REGLAS_DESCARGA_PROYECTO: Readonly<Record<CompaniaDescargaProyecto, { readonly soloConObjeto: boolean }>> = {
  allianz: { soloConObjeto: false },
  mapfre: { soloConObjeto: false },
  generali: { soloConObjeto: true },
}

// 26/10/2026: los términos (verbos, objetos, documentos ajenos y la lista negra) viven en `vocabulario.ts`, por concepto y con su origen.
// Aquí solo se añaden los que ESTE fichero es el único autorizado a nombrar (guardián de la raíz) y se aplica la regla de cada compañía.
/** Términos de la lista negra que solo puede nombrar `guard.ts`. El guard los suma a `BLOQUEO` de `vocabulario.ts` (script de candidatos y test los leen de aquí). */
export const TERMINOS_BLOQUEO_SOLO_GUARD: readonly Termino[] = Object.freeze([terminoPropio('aceptar', 'allianz+mapfre+generali', '26/10/2026', 'rótulo de descarga: nunca un control de aceptación')])

const RE_PROHIBIDO_ROTULO_DESCARGA = regexBloqueoRotulo(TERMINOS_BLOQUEO_SOLO_GUARD)
/** Raíces de la lista negra de atributos internos (en minúsculas, sin tildes). v0.6.32: se casan por TOKEN (ver `palabraBloqueadaEnAtributo`), no por subcadena. */
const RAICES_ATRIBUTO_DESCARGA: readonly string[] = Object.freeze(BLOQUEO.atributo_interno.map((x) => x.texto.toLowerCase()))

/** v0.6.32: ¿esta tira alfanumérica seguida parece un blob (base64/hex/hash) y no una palabra? Largo >24, mezcla dígito-letra repetida o mayúsculas/minúsculas a saltos. PURA. */
function esBlobAlfanumerico(run: string): boolean {
  if (run.length > 24) return true
  const t = (re: RegExp): number => (run.match(re) ?? []).length
  if (run.length >= 10 && t(/[0-9][a-zA-Z]|[a-zA-Z][0-9]/g) >= 2) return true
  return run.length >= 12 && t(/[a-z][A-Z]|[A-Z][a-z]/g) >= 6
}

/** v0.6.33: segmento de ruta/consulta de una URL que parece CODIFICADO (≥12 con letras y dígitos mezclados, o con % o +; el = de consulta/relleno separa) y no una palabra legible. PURA. */
function esSegmentoUrlCodificado(seg: string): boolean {
  if (/[%+]/.test(seg)) return true
  return seg.length >= 12 && /[0-9]/.test(seg) && /[A-Za-z]/.test(seg)
}

/** v0.6.33: ¿la `raiz` casa en el token `w` (minúsculas)? Igual, EMPIEZA por ella (emitirpoliza) o la lleva tras un prefijo corto (≤4: btnemitir, doemit; ≤6 pronunciable si acaba en ella: lanzarsms): nunca tras un prefijo largo de token opaco (nrzldmqexemit). PURA. */
function raizCasaEnToken(w: string, r: string): boolean {
  if (w.startsWith(r)) return true
  for (let i = w.indexOf(r, 1); i > 0; i = w.indexOf(r, i + 1)) {
    const pre = w.slice(0, i)
    if (/[0-9]/.test(pre)) continue
    if (pre.length <= 4) return true
    if (pre.length <= 6 && w.endsWith(r) && !/[^aeiou]{3,}/.test(pre)) return true
  }
  return false
}

/**
 * v0.6.32: palabra de la lista negra de atributos que casa en `valor` por TOKENS (troceado por no alfanuméricos y por camelCase/snake; minúsculas, sin
 * tildes): un token igual a una raíz, que EMPIEZA por ella (enviarsms) o que ACABA en ella con prefijo corto (v0.6.33: ≤6 y pronunciable; lanzarsms, btnemitir). Las tiras largas/mezcladas de blob (base64, hex) no cuentan: «sms» dentro de texto
 * aleatorio no es un envío. v0.6.33: en valores tipo URL (http, blob:, /ruta) se saltan los segmentos de ruta/consulta codificados. Solo para ATRIBUTOS internos; el rótulo visible se sigue mirando con sus reglas de siempre. PURA.
 */
export function palabraBloqueadaEnAtributo(valor: string | null | undefined): string | null {
  const base = String(valor ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  const esUrl = /^(?:https?:|blob:|\/|\.\.?\/)/i.test(base.trim())
  const segmentos = esUrl ? base.split(/[\/?&#=]/).filter((sg) => !esSegmentoUrlCodificado(sg)) : [base]
  for (const run of segmentos.flatMap((sg) => sg.split(/[^A-Za-z0-9]+/))) {
    if (run === '' || esBlobAlfanumerico(run)) continue
    const tokens = run.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').split(' ')
    for (const tk of tokens) {
      const w = tk.toLowerCase()
      const raiz = RAICES_ATRIBUTO_DESCARGA.find((r) => raizCasaEnToken(w, r))
      if (raiz !== undefined) return raiz
    }
  }
  return null
}
const RE_AJENO_DESCARGA = RE_EXCLUIR_DESCARGA
const RE_VERBO_SUELTO_DESCARGA = RE_VERBO_DESCARGA
const RE_VERBO_CON_OBJETO_DESCARGA = RE_VERBO_DESCARGA_CON_OBJETO
/** v0.6.29 (Allianz: «Descargar propuesta», tras «Guardar presupuesto»): «propuesta» SOLO junto a imprimir/descargar/pdf (nunca con «documento» suelto); la lista negra sigue mandando. */
const RE_OBJETO_PROPUESTA_DESCARGA = RE_OBJETO_PROPUESTA

function sinTildesDescarga(x: string | null | undefined): string {
  return String(x ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
}

/**
 * ¿Este control (descripción de `descripcion`: 0 texto, 1 aria-label, 2 title, 3 value, 4 id, 5 name, 6 href, 7 onclick, 8 formaction, 9 ng-click,
 * 10 data-ng-click, 11 tooltip, resto = ancestros) es el botón de descargar/imprimir el proyecto/presupuesto? Rótulos = texto/aria/title/value/tooltip
 * (el icono `print`/`picture_as_pdf` cuenta); lo prohibido se mira en TODO, incluidos id y manejadores. PURA.
 */
export function esBotonDescargaProyecto(desc: readonly (string | null | undefined)[], compania: CompaniaDescargaProyecto, guardado: boolean): boolean {
  return puntuarBotonDescargaProyecto(desc, compania, guardado) > 0
}

/** 0 = no es · 1 = imprimir/descargar/pdf a secas (con el proyecto guardado) · 2 = verbo + proyecto/presupuesto/oferta. PURA. */
export function puntuarBotonDescargaProyecto(desc: readonly (string | null | undefined)[], compania: CompaniaDescargaProyecto, guardado: boolean): 0 | 1 | 2 {
  const rotulos = [desc[0], desc[1], desc[2], desc[3], desc[11]].map(sinTildesDescarga).filter((t) => t !== '' && t.length <= 120)
  if (rotulos.length === 0) return 0
  const junto = rotulos.join(' | ')
  if (RE_PROHIBIDO_ROTULO_DESCARGA.test(junto) || RE_AJENO_DESCARGA.test(junto)) return 0
  if (desc.slice(4).some((x) => palabraBloqueadaEnAtributo(x) !== null)) return 0
  if (RE_VERBO_CON_OBJETO_DESCARGA.test(junto) && RE_OBJETO_DESCARGA.test(junto)) return 2
  if (RE_VERBO_SUELTO_DESCARGA.test(junto) && RE_OBJETO_PROPUESTA_DESCARGA.test(junto)) return 2
  if (guardado && !REGLAS_DESCARGA_PROYECTO[compania].soloConObjeto && RE_VERBO_SUELTO_DESCARGA.test(junto)) return 1
  return 0
}

/**
 * v0.6.29: ¿el RÓTULO de este control pasaría la lista blanca pero un atributo interno (id, name, href, manejadores, ancestros) casa con la lista negra?
 * Devuelve SOLO la palabra de la lista negra que casó (nunca el valor del atributo) o `null`. Es diagnóstico: no autoriza nada. PURA.
 */
export function rechazoOcultoDescargaProyecto(desc: readonly (string | null | undefined)[], compania: CompaniaDescargaProyecto, guardado: boolean): string | null {
  if (puntuarBotonDescargaProyecto(desc, compania, guardado) > 0) return null
  const sinOcultos = [desc[0], desc[1], desc[2], desc[3], desc[11]]
  if (puntuarBotonDescargaProyecto(sinOcultos, compania, guardado) === 0) return null
  for (const x of desc.slice(4)) {
    const w = palabraBloqueadaEnAtributo(x)
    if (w !== null) return w
  }
  return null
}

/** `attrs`: class, aria-controls, aria-haspopup, aria-expanded y data-* del control (solo para diagnóstico y para reconocer un disparador de menú). */
export type ControlDescargaProyecto = { desc: (string | null)[]; visible: boolean; habilitado: boolean; attrs?: Readonly<Record<string, string>>; enDialogo?: boolean }

const NOMBRES_ATRIBUTO_DESCARGA = ['texto', 'aria-label', 'title', 'value', 'id', 'name', 'href', 'onclick', 'formaction', 'ng-click', 'data-ng-click', 'mattooltip']
const NOMBRES_ATRIBUTO_ANCESTRO = ['onclick', 'ng-click', 'data-ng-click', 'href']

/** Nombre del atributo que ocupa el índice `i` de la descripción de un control de descarga (los ancestros llevan «ancestro N»). PURA. */
export function nombreAtributoDescarga(i: number): string {
  if (i < NOMBRES_ATRIBUTO_DESCARGA.length) return NOMBRES_ATRIBUTO_DESCARGA[i]!
  const k = i - NOMBRES_ATRIBUTO_DESCARGA.length
  return `ancestro ${Math.floor(k / 4) + 1} ${NOMBRES_ATRIBUTO_ANCESTRO[k % 4]!}`
}

const normalizarOcultoDescarga = (x: string | null | undefined): string => String(x ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Quita de un texto lo que parece dato personal (emails, cifras largas) y colapsa espacios. PURA. */
export function sanearTextoDiagnosticoDescarga(x: string): string {
  // v0.6.31: sin cuantificadores abiertos (`[^…]*@[^…]*` era cuadrático sobre JS minificado sin espacios y colgaba el hilo): ≤64 a cada lado del «@»,
  // y el texto se recorta a una ventana pequeña ANTES (nunca se sanea un atributo entero).
  return x.slice(0, 400).replace(/[^\s"'<>()]{0,64}@[^\s"'<>()]{0,64}/g, '@').replace(/\d{4,}/g, '#').replace(/\s+/g, ' ').trim()
}

/** Extracto de ±40 caracteres alrededor de la palabra `palabra` dentro de `valor`. v0.6.31: se RECORTA primero (la ventana) y solo ella se sanea; si la palabra desaparece al sanear, solo «…». PURA. */
export function extractoSaneadoDescarga(valor: string, palabra: string): string {
  const v = normalizarOcultoDescarga(valor)
  const i = v.indexOf(palabra)
  if (i < 0) return '…'
  const ini = Math.max(0, i - 40)
  const fin = Math.min(v.length, i + palabra.length + 40)
  const ventana = sanearTextoDiagnosticoDescarga(v.slice(ini, fin))
  if (!ventana.includes(palabra)) return '…'
  return `${ini > 0 ? '…' : ''}${ventana.slice(0, 200)}${fin < v.length ? '…' : ''}`
}

/** ¿Es un disparador de menú/desplegable (aria-haspopup, aria-expanded, dropdown, mat-menu-trigger)? PURA. */
export function esDisparadorMenuDescarga(attrs: Readonly<Record<string, string>> | undefined): boolean {
  if (!attrs) return false
  const hp = attrs['aria-haspopup']
  if (hp !== undefined && hp !== 'false') return true
  if (attrs['aria-expanded'] !== undefined) return true
  const resto = Object.entries(attrs).filter(([k]) => k === 'class' || k === 'data-toggle' || k === 'data-bs-toggle' || k === 'matmenutriggerfor').map(([, v]) => v.toLowerCase()).join(' ')
  return /dropdown|mat-menu-trigger|menu-trigger/.test(resto) || 'matmenutriggerfor' in attrs
}

/** v0.6.30: palabra de la lista negra que casa en class/aria-controls/data-*… del control (no en aria-haspopup/aria-expanded, que son true/false), con su atributo; `null` si ninguna. PURA. */
export function bloqueoEnAtributosExtraDescarga(attrs: Readonly<Record<string, string>> | undefined): { palabra: string; atributo: string; valor: string } | null {
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (k === 'aria-haspopup' || k === 'aria-expanded') continue
    const w = palabraBloqueadaEnAtributo(v)
    if (w !== null) return { palabra: w, atributo: k, valor: v }
  }
  return null
}

/**
 * v0.6.30: diagnóstico de UN control con rótulo de descarga descartado por un atributo interno: qué palabra de la lista negra, en qué atributo
 * (nombre) y un extracto saneado de ±30 caracteres, más si es disparador de menú. `null` si no es ese caso. No autoriza nada. PURA.
 */
export function detalleRechazoOcultoDescarga(c: ControlDescargaProyecto, compania: CompaniaDescargaProyecto, guardado: boolean): string | null {
  if (puntuarBotonDescargaProyecto([c.desc[0], c.desc[1], c.desc[2], c.desc[3], c.desc[11]], compania, guardado) === 0) return null
  const menu = esDisparadorMenuDescarga(c.attrs) ? ' [disparador de menú]' : ''
  for (let i = 4; i < c.desc.length; i++) {
    const v = c.desc[i]
    if (!v) continue
    const w = palabraBloqueadaEnAtributo(v)
    if (w !== null) return `«${w}» en ${nombreAtributoDescarga(i)} («${extractoSaneadoDescarga(v, w)}»)${menu}`
  }
  const e = bloqueoEnAtributosExtraDescarga(c.attrs)
  return e ? `«${e.palabra}» en ${e.atributo} («${extractoSaneadoDescarga(e.valor, e.palabra)}»)${menu}` : null
}

/** v0.6.30: ¿pasa la lista blanca Y ni class/aria-controls/data-* casan la lista negra? Es lo que se pulsa como descarga. PURA. */
export function esControlDescargableProyecto(c: ControlDescargaProyecto, compania: CompaniaDescargaProyecto, guardado: boolean): boolean {
  return puntuarBotonDescargaProyecto(c.desc, compania, guardado) > 0 && bloqueoEnAtributosExtraDescarga(c.attrs) === null
}

/** Ligaduras de iconos de menú tal y como las deja `sinTildesDescarga` (el `_` ya es espacio). */
const ICONOS_MENU_DESCARGA = /\b(arrow drop down|arrow drop up|expand more|expand less|keyboard arrow down|keyboard arrow up|more vert|more horiz)\b/g

/**
 * v0.6.30: ¿es este control un DISPARADOR DE MENÚ cuyo rótulo es «Descargar propuesta» y que solo se puede ABRIR (un clic) sin riesgo?
 * Exige: visible, habilitado, disparador de menú (aria-haspopup/aria-expanded/dropdown), rótulo entero «Descargar propuesta» (iconos aparte) sin
 * nada de bloqueo en NINGÚN rótulo, y que la lista negra de atributos solo case en id/name (o en class/aria-controls/data-*, que no van aquí):
 * un href, onclick, formaction, ng-click o manejador de un ancestro con «sms»/«enviar»… lo descarta (pulsarlo podría enviar). PURA.
 */
export function puedeAbrirMenuDescarga(c: ControlDescargaProyecto, compania: CompaniaDescargaProyecto, guardado: boolean): boolean {
  if (!c.visible || !c.habilitado || !esDisparadorMenuDescarga(c.attrs)) return false
  const rotulo = [c.desc[0], c.desc[1], c.desc[2], c.desc[3]].map((x) => sinTildesDescarga(x).replace(ICONOS_MENU_DESCARGA, ' ').replace(/\s+/g, ' ').trim()).find((t) => t !== '')
  if (rotulo !== 'descargar propuesta') return false
  if (puntuarBotonDescargaProyecto([c.desc[0], c.desc[1], c.desc[2], c.desc[3], c.desc[11]], compania, guardado) === 0) return false
  // Criterio de seguridad (coordinador, 26/10/2026): NINGÚN atributo (id, name, class, aria-controls, data-*, manejadores, href, ancestros) casa bloqueo.
  for (let i = 4; i < c.desc.length; i++) {
    if (i === 11) continue
    if (palabraBloqueadaEnAtributo(c.desc[i]) !== null) return false
  }
  return bloqueoEnAtributosExtraDescarga(c.attrs) === null
}

/** Qué control pulsar (el de mejor puntuación; a igualdad, el primero en pantalla) o por qué ninguno (+ `abrirMenu`: índice de un disparador de menú «Descargar propuesta» que se puede abrir). Visible y habilitado. PURA. */
export function decidirBotonDescargaProyecto(controles: readonly ControlDescargaProyecto[], compania: CompaniaDescargaProyecto, guardado: boolean): { indice: number } | { motivo: string; definitivo: boolean; abrirMenu?: number } {
  const cand = controles.map((c, i) => ({ c, i, p: esControlDescargableProyecto(c, compania, guardado) ? puntuarBotonDescargaProyecto(c.desc, compania, guardado) : 0 })).filter((x) => x.p > 0)
  const bloqueados = [...new Set(controles.map((c) => detalleRechazoOcultoDescarga(c, compania, guardado)).filter((x): x is string => x !== null))]
  const nota = bloqueados.length > 0 ? ` (hay ${bloqueados.length} control(es) con rótulo de descarga que NO se pulsan porque un atributo interno casa con la lista negra: ${bloqueados.join('; ')})` : ''
  const abrir = controles.findIndex((c) => puedeAbrirMenuDescarga(c, compania, guardado))
  const conMenu = abrir >= 0 ? { abrirMenu: abrir } : {}
  if (cand.length === 0) return { motivo: `no aparece ningún botón de imprimir/descargar el presupuesto o proyecto${nota}`, definitivo: false, ...conMenu }
  const visibles = cand.filter((x) => x.c.visible)
  if (visibles.length === 0) return { motivo: `hay ${cand.length} botón(es) de descarga pero OCULTO(s) (puede estar plegado)${nota}`, definitivo: false, ...conMenu }
  const habilitados0 = visibles.filter((x) => x.c.habilitado)
  if (habilitados0.length === 0) return { motivo: `el botón de descarga está deshabilitado${nota}`, definitivo: false }
  // v0.8.35 (Mapfre, 28/10/2026): con un diálogo abierto encima, el de DENTRO del diálogo manda (el de debajo lo tapa la capa).
  const enDialogo = habilitados0.filter((x) => x.c.enDialogo === true)
  const habilitados = enDialogo.length > 0 ? enDialogo : habilitados0
  const mejor = Math.max(...habilitados.map((x) => x.p))
  return { indice: habilitados.find((x) => x.p === mejor)!.i }
}

const SEL_CONTROLES_DESCARGA = 'button, a, [role="button"], [role="menuitem"], nx-button, input[type="button"], input[type="submit"], [ng-click], [data-ng-click], [onclick]'

/** Lee los botones/enlaces de TODOS los marcos, marca cada uno con `data-rpa-dl` y devuelve sus datos (+ marco). Solo lectura (salvo la marca). */
async function escanearControlesDescargaProyecto(page: Page): Promise<(ControlDescargaProyecto & { marco: Frame; marca: number })[]> {
  const salida: (ControlDescargaProyecto & { marco: Frame; marca: number })[] = []
  for (const marco of marcosVivos(page)) {
    // Sin funciones con nombre dentro de `evaluate` (tsx les mete `__name`, que no existe en la página).
    const l = await marco
      .evaluate((sel) => {
        document.querySelectorAll('[data-rpa-dl]').forEach((n) => n.removeAttribute('data-rpa-dl'))
        const out: { desc: (string | null)[]; visible: boolean; habilitado: boolean; marca: number; attrs: Record<string, string>; enDialogo: boolean }[] = []
        for (const n of Array.from(document.querySelectorAll(sel))) {
          if (out.length >= 300) break
          if (n.querySelector('button, a, [role="button"], input[type="button"], input[type="submit"]')) continue
          const h = n as HTMLElement & { value?: unknown; href?: unknown; name?: unknown; disabled?: boolean }
          const r = h.getBoundingClientRect()
          const cs = getComputedStyle(h)
          const visible = r.width > 0 && r.height > 0 && cs.visibility === 'visible' && cs.display !== 'none'
          const anc: (string | null)[] = []
          let p: Element | null = h.parentElement
          for (let i = 0; p && i < 3; i++) {
            anc.push(p.getAttribute('onclick'), p.getAttribute('ng-click'), p.getAttribute('data-ng-click'), p.tagName === 'A' ? p.getAttribute('href') : null)
            p = p.parentElement
          }
          const attrs: Record<string, string> = {}
          for (const a of Array.from(h.attributes)) {
            if (a.name === 'class' || a.name === 'aria-controls' || a.name === 'aria-haspopup' || a.name === 'aria-expanded' || a.name === 'matmenutriggerfor' || (a.name.startsWith('data-') && a.name !== 'data-rpa-dl')) attrs[a.name] = a.value.slice(0, 200)
          }
          const marca = out.length
          h.setAttribute('data-rpa-dl', String(marca))
          out.push({
            desc: [
              h.innerText ?? h.textContent ?? '', h.getAttribute('aria-label'), h.getAttribute('title'), typeof h.value === 'string' ? h.value : null,
              h.id || null, typeof h.name === 'string' ? h.name : null, typeof h.href === 'string' ? h.href : h.getAttribute('href'),
              h.getAttribute('onclick'), h.getAttribute('formaction'), h.getAttribute('ng-click'), h.getAttribute('data-ng-click'), h.getAttribute('mattooltip'), ...anc,
            ],
            visible,
            habilitado: !(h.disabled === true || h.hasAttribute('disabled') || h.getAttribute('aria-disabled') === 'true' || /\bmat(?:-mdc)?-button-disabled\b/.test(h.className?.toString?.() ?? '')),
            marca,
            attrs,
            enDialogo: h.closest('mat-dialog-container, [role="dialog"], [role="alertdialog"]') !== null,
          })
        }
        return out
      }, SEL_CONTROLES_DESCARGA)
      .catch(() => [])
    for (const x of l) salida.push({ ...x, marco })
  }
  return salida
}

export type BusquedaDescargaProyecto = { boton: Locator; etiqueta: string } | { motivo: string; menu?: { boton: Locator; etiqueta: string } }

/**
 * Busca (SIN pulsar) el botón de descargar el proyecto/presupuesto hasta `esperaMs`. Sin él → `motivo` con las etiquetas saneadas de lo que hay
 * a la vista (sin datos personales) y, si hay un disparador de menú «Descargar propuesta» que solo se puede abrir (`puedeAbrirMenuDescarga`), `menu`.
 * Nunca lanza salvo una violación del guard (`guard.comprobar()`).
 */
export async function buscarBotonDescargaProyecto(page: Page, guard: GuardEmision, compania: CompaniaDescargaProyecto, guardado: boolean, esperaMs = 6_000): Promise<BusquedaDescargaProyecto> {
  const hasta = Date.now() + esperaMs
  for (;;) {
    guard.comprobar()
    const controles = await escanearControlesDescargaProyecto(page)
    const d = decidirBotonDescargaProyecto(controles, compania, guardado)
    if ('indice' in d) {
      const c = controles[d.indice]!
      const boton = c.marco.locator(`[data-rpa-dl="${c.marca}"]`)
      if ((await boton.count().catch(() => 0)) === 1) return { boton, etiqueta: etiquetaEfectivaControl({ texto: c.desc[0], aria: c.desc[1], title: c.desc[2], valor: c.desc[3] }) }
      return { motivo: 'el botón de descarga cambió de sitio antes de pulsarlo' }
    }
    if (Date.now() >= hasta) {
      const vis = etiquetasControlesSaneadas(controles.filter((c) => c.visible).map((c) => etiquetaEfectivaControl({ texto: c.desc[0], aria: c.desc[1], title: c.desc[2], valor: c.desc[3] })))
      const motivo = `${d.motivo}${sufijoControlesVisibles(vis)}`
      if (d.abrirMenu !== undefined) {
        const m = controles[d.abrirMenu]!
        const boton = m.marco.locator(`[data-rpa-dl="${m.marca}"]`)
        if ((await boton.count().catch(() => 0)) === 1) return { motivo, menu: { boton, etiqueta: etiquetaEfectivaControl({ texto: m.desc[0], aria: m.desc[1], title: m.desc[2], valor: m.desc[3] }) } }
      }
      return { motivo }
    }
    await page.waitForTimeout(500)
  }
}

/** Lee en VIVO los atributos de menú del control (misma lista que el escáner). Solo lectura. */
async function atributosMenuVivos(boton: Locator): Promise<Record<string, string>> {
  return boton
    .evaluate((el) => {
      const attrs: Record<string, string> = {}
      for (const a of Array.from(el.attributes)) {
        if (a.name === 'class' || a.name === 'aria-controls' || a.name === 'aria-haspopup' || a.name === 'aria-expanded' || a.name === 'matmenutriggerfor' || (a.name.startsWith('data-') && a.name !== 'data-rpa-dl')) attrs[a.name] = a.value.slice(0, 200)
      }
      return attrs
    })
    .catch(() => ({}))
}

/**
 * El clic de descargar el proyecto/presupuesto (ÚNICA puerta). Guard limpio, sin otra ventana de red abierta, frontera bancaria, UN control,
 * `comprobarBoton` + la lista de arriba sobre la descripción VIVA. No abre ventana de red de guardado: aquí no se guarda nada.
 */
export async function pulsarDescargaProyectoAuto(page: Page, guard: GuardEmision, boton: Locator, compania: CompaniaDescargaProyecto, guardado: boolean): Promise<void> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', 'descarga del proyecto con otra ventana de red abierta')
  await exigirSinCuentaBancaria(page)
  const n = await boton.count()
  // v0.8.34: CERO = el portal re-pintó el control y la marca se perdió (no se pulsa nada; quien llama re-escanea). Más de uno sigue siendo bloqueo.
  if (n === 0) throw new DescargaNoPulsadaError('desaparecido', '')
  if (n !== 1) throw new EmisionBloqueadaError('boton', 'descarga del proyecto: no hay exactamente un control')
  const desc = await descripcion(boton)
  comprobarBoton(desc)
  const vivo = { desc, visible: true, habilitado: true, attrs: await atributosMenuVivos(boton) }
  if (!esControlDescargableProyecto(vivo, compania, guardado)) {
    // v0.6.30: único otro clic posible = ABRIR el menú «Descargar propuesta» (disparador de menú, sin bloqueo en rótulo ni en manejadores/href).
    if (!puedeAbrirMenuDescarga(vivo, compania, guardado)) throw new EmisionBloqueadaError('boton', 'descarga del proyecto: el control vivo no pasa la lista blanca')
  }
  // v0.8.34 (Mapfre, prueba real 27/10/2026: «locator.click: Timeout 8000ms exceeded … waiting for locator('[data-rpa-dl="41"]')»): se trae a la vista
  // antes y, si Playwright no llega a pulsar (tapado por una capa, oculto, en animación, re-pintado), se lanza `DescargaNoPulsadaError` con la CAUSA
  // leída de su traza: no se pulsó nada y quien llama decide (Escape a una capa y un único reintento). Nunca `force` ni clic por coordenadas.
  await boton.scrollIntoViewIfNeeded({ timeout: 2_000 }).catch(() => undefined)
  try {
    await boton.click({ timeout: MS_CLIC_DESCARGA_PROYECTO })
  } catch (e) {
    guard.comprobar()
    const msg = e instanceof Error ? e.message : String(e)
    if (/timeout|intercepts pointer|not visible|not stable|not enabled|detached|outside of the viewport/i.test(msg)) {
      const c = causaClicNoPulsado(msg)
      if (c.causa !== 'tapado') throw new DescargaNoPulsadaError(c.causa, c.detalle)
      // v0.8.35: un diálogo encima. Informativo → se cierra (puerta de arriba) y UN clic más al mismo control; si no, su descripción va al aviso.
      const cierre = await cerrarDialogoInformativoDescarga(page, guard)
      if (!cierre.cerrado) throw new DescargaNoPulsadaError('tapado', `${c.detalle}; ${cierre.descripcion}`.slice(0, 400))
      if ((await boton.count()) !== 1) throw new DescargaNoPulsadaError('desaparecido', 'tras cerrar el diálogo informativo')
      try {
        await boton.click({ timeout: MS_CLIC_DESCARGA_PROYECTO })
      } catch (e2) {
        guard.comprobar()
        const c2 = causaClicNoPulsado(e2 instanceof Error ? e2.message : String(e2))
        throw new DescargaNoPulsadaError(c2.causa, `${c2.detalle ? `${c2.detalle}; ` : ''}tras cerrar un diálogo informativo`)
      }
      guard.comprobar()
      return
    }
    throw e
  }
  guard.comprobar()
}

// ─────────── v0.8.35 (Mapfre, 28/10/2026): diálogo de Material que tapa la descarga y Escape no cierra ───────────
// Prueba real con 0.8.34: «otro elemento (capa/diálogo) lo tapa (tapa: <div.cdk-overlay-backdrop…>) (también tras Escape y un reintento)». Si el diálogo
// es INFORMATIVO (sin campos, sin texto de emitir/contratar/enviar/firmar/pagar, y TODOS sus controles son de cerrar: icono de cerrar, «Cerrar»,
// «Aceptar», «OK»), se cierra con UN clic de texto EXACTO aquí (única puerta con «aceptar» para esto) y se reintenta. Si no, el aviso lleva su texto
// saneado y sus botones, para mapearlo en la siguiente ejecución. Nunca se pulsa otra cosa del diálogo.

/** Rótulos EXACTOS (sin tildes, minúsculas) que cierran un diálogo informativo. Los de cruz/icono primero (se prefieren a «aceptar»). */
export const ROTULOS_CIERRE_DIALOGO_DESCARGA: readonly string[] = Object.freeze(['close', 'clear', 'cerrar', 'x', '×', 'aceptar', 'ok'])
/** Texto de un diálogo que hace NO tocarlo (sobre texto sin tildes y en minúsculas). */
const RE_DIALOGO_NO_CERRAR_DESCARGA = /emit|emisi|contrat|formaliz|firm|pagar|\bpago\b|grabar poliza|domicili|iban|envi|sms|e-?mail|correo|whatsapp/

export type DialogoDescarga = { texto: string; botones: readonly string[]; campos: number }

/** ¿Se puede cerrar este diálogo y con qué botón (índice)? Si no, por qué. PURA. */
export function decidirCierreDialogoDescarga(d: DialogoDescarga): { indice: number } | { motivo: string } {
  const texto = sinTildesDescarga(d.texto)
  if (d.campos > 0) return { motivo: 'el diálogo tiene campos' }
  const m = texto.match(RE_DIALOGO_NO_CERRAR_DESCARGA)
  if (m) return { motivo: `el diálogo menciona «${m[0]}»` }
  if (d.botones.length === 0) return { motivo: 'el diálogo no tiene botones' }
  const norm = d.botones.map((b) => sinTildesDescarga(b))
  const ajeno = norm.findIndex((b) => !ROTULOS_CIERRE_DIALOGO_DESCARGA.includes(b))
  if (ajeno >= 0) return { motivo: `el diálogo tiene un control que no es de cerrar («${d.botones[ajeno]!.slice(0, 30)}»)` }
  for (const r of ROTULOS_CIERRE_DIALOGO_DESCARGA) {
    const i = norm.indexOf(r)
    if (i >= 0) return { indice: i }
  }
  return { motivo: 'sin control de cerrar' }
}

/** Descripción saneada del diálogo para el aviso (texto sin datos personales + botones). PURA. */
export function describirDialogoDescarga(d: DialogoDescarga): string {
  const t = textoDialogoPortalSeguro(sanearTextoDiagnosticoDescarga(d.texto)).slice(0, 160)
  const b = etiquetasControlesSaneadas(d.botones, 8)
  return `diálogo: «${t || '(sin texto)'}»; botones: ${b.length ? b.map((x) => `«${x}»`).join(', ') : '(ninguno)'}${d.campos > 0 ? `; ${d.campos} campo(s)` : ''}`
}

const SEL_DIALOGO_DESCARGA = 'mat-dialog-container, [role="dialog"], [role="alertdialog"]'

/**
 * Cierra el ÚNICO diálogo abierto si es informativo (ver arriba) con su control de cerrar de rótulo EXACTO, por `comprobarBoton` con «Aceptar»
 * permitido SOLO aquí, guard limpio y frontera bancaria. Devuelve `{ cerrado: true }` o `{ cerrado: false, descripcion }` (sin pulsar nada).
 */
export async function cerrarDialogoInformativoDescarga(page: Page, guard: GuardEmision): Promise<{ cerrado: true } | { cerrado: false; descripcion: string }> {
  guard.comprobar()
  const dialogos = page.locator(SEL_DIALOGO_DESCARGA).filter({ visible: true })
  const n = await dialogos.count().catch(() => 0)
  if (n !== 1) return { cerrado: false, descripcion: n === 0 ? 'no hay ningún diálogo a la vista (la capa es otra cosa)' : `hay ${n} diálogos a la vista` }
  const dlg = dialogos.first()
  const d = (await dlg
    .evaluate((el, sel) => {
      // Sin funciones con nombre dentro de `evaluate` (tsx les mete `__name`, que no existe en la página).
      el.querySelectorAll('[data-rpa-dlg]').forEach((x) => x.removeAttribute('data-rpa-dlg'))
      const botones: string[] = []
      for (const b of Array.from(el.querySelectorAll(sel))) {
        const rb = (b as HTMLElement).getBoundingClientRect()
        const cb = getComputedStyle(b)
        if (!(rb.width > 0 && rb.height > 0 && cb.visibility === 'visible' && cb.display !== 'none') || b.querySelector('button, a, [role="button"]')) continue
        const h = b as HTMLElement & { value?: unknown }
        h.setAttribute('data-rpa-dlg', String(botones.length))
        botones.push(((h.innerText || h.textContent || '').replace(/\s+/g, ' ').trim() || h.getAttribute('aria-label') || h.getAttribute('title') || (typeof h.value === 'string' ? h.value : '') || '').slice(0, 60))
      }
      const campos = Array.from(el.querySelectorAll('input:not([type="hidden"]):not([type="button"]):not([type="submit"]), select, textarea')).filter((x) => { const r = (x as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(x).visibility === 'visible' }).length
      return { texto: ((el as HTMLElement).innerText || '').slice(0, 1500), botones, campos }
    }, SEL_CONTROLES_DESCARGA)
    .catch(() => null)) as DialogoDescarga | null
  if (!d) return { cerrado: false, descripcion: 'el diálogo no se pudo leer' }
  const dec = decidirCierreDialogoDescarga(d)
  if ('motivo' in dec) return { cerrado: false, descripcion: `${dec.motivo} (no se pulsa); ${describirDialogoDescarga(d)}` }
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', 'cerrar diálogo de la descarga con otra ventana de red abierta')
  await exigirSinCuentaBancaria(page)
  const boton = dlg.locator(`[data-rpa-dlg="${dec.indice}"]`)
  if ((await boton.count()) !== 1) return { cerrado: false, descripcion: `el control de cerrar cambió antes de pulsarlo; ${describirDialogoDescarga(d)}` }
  const desc = await descripcion(boton)
  // Vivo: rótulo EXACTO de la lista (el «aceptar» solo pasa aquí y solo así).
  if (!ROTULOS_CIERRE_DIALOGO_DESCARGA.includes(sinTildesDescarga(etiquetaEfectivaControl({ texto: desc[0], aria: desc[1], title: desc[2], valor: desc[3] })))) {
    return { cerrado: false, descripcion: `el control vivo no es de cerrar; ${describirDialogoDescarga(d)}` }
  }
  comprobarBoton(desc, { permitirAceptar: true })
  await boton.click({ timeout: 4_000 })
  guard.comprobar()
  await dlg.waitFor({ state: 'hidden', timeout: 4_000 }).catch(() => undefined)
  if ((await page.locator(SEL_DIALOGO_DESCARGA).filter({ visible: true }).count().catch(() => 0)) > 0) return { cerrado: false, descripcion: `se pulsó «${d.botones[dec.indice]!.slice(0, 20)}» pero el diálogo sigue; ${describirDialogoDescarga(d)}` }
  return { cerrado: true }
}

/** v0.8.34: tope del clic de descarga (Playwright reintenta dentro: visible, estable, sin capa encima). */
export const MS_CLIC_DESCARGA_PROYECTO = 6_000

export type CausaClicNoPulsado = 'tapado' | 'oculto' | 'inestable' | 'deshabilitado' | 'fuera_de_vista' | 'desaparecido' | 'desconocida'

/** v0.8.34: el clic de descarga NO llegó a darse (Playwright agotó su espera de accionabilidad). No se pulsó nada. */
export class DescargaNoPulsadaError extends Error {
  constructor(readonly causa: CausaClicNoPulsado, readonly detalle: string) {
    super(`el control de descarga no se pudo pulsar: ${textoCausaClicNoPulsado(causa)}${detalle ? ` (${detalle})` : ''}`)
    this.name = 'DescargaNoPulsadaError'
  }
}

/** Texto legible de la causa. PURA. */
export function textoCausaClicNoPulsado(c: CausaClicNoPulsado): string {
  return {
    tapado: 'otro elemento (capa/diálogo) lo tapa',
    oculto: 'no está visible',
    inestable: 'se está moviendo (animación)',
    deshabilitado: 'está deshabilitado',
    fuera_de_vista: 'queda fuera de la vista y no se puede desplazar',
    desaparecido: 'el portal lo volvió a pintar (la marca ya no está)',
    desconocida: 'causa no reconocida en la traza del navegador',
  }[c]
}

/**
 * v0.8.34: causa por la que Playwright no pulsó, leída de la traza de `locator.click` (la ÚLTIMA línea de estado manda; si nunca resolvió el
 * localizador, el control desapareció). `detalle` = solo etiqueta y clases del elemento que tapa (sin texto ni atributos con datos). PURA.
 */
export function causaClicNoPulsado(msg: string): { causa: CausaClicNoPulsado; detalle: string } {
  const lineas = String(msg ?? '').split('\n').map((l) => l.trim()).filter((l) => l !== '')
  let causa: CausaClicNoPulsado = 'desconocida'
  let detalle = ''
  for (const l of lineas) {
    if (/intercepts pointer events/i.test(l)) {
      causa = 'tapado'
      const m = l.match(/<([a-z][a-z0-9-]*)\b[^>]*?\bclass="([^"]*)"/i) ?? l.match(/<([a-z][a-z0-9-]*)\b/i)
      const clases = (m?.[2] ?? '').split(/\s+/).filter((c) => /^[A-Za-z_-][\w-]{0,40}$/.test(c)).slice(0, 4).join('.')
      detalle = m ? `tapa: <${m[1]!.toLowerCase()}${clases ? `.${clases}` : ''}>` : ''
    } else if (/element is not visible|not visible/i.test(l)) { causa = 'oculto'; detalle = '' }
    else if (/not stable/i.test(l)) { causa = 'inestable'; detalle = '' }
    else if (/not enabled|disabled/i.test(l)) { causa = 'deshabilitado'; detalle = '' }
    else if (/outside of the viewport/i.test(l)) { causa = 'fuera_de_vista'; detalle = '' }
    else if (/detached from the dom|element is detached/i.test(l)) { causa = 'desaparecido'; detalle = '' }
  }
  if (causa === 'desconocida' && /timeout/i.test(msg) && !lineas.some((l) => /locator resolved to|resolved to </i.test(l))) causa = 'desaparecido'
  return { causa, detalle: detalle.slice(0, 120) }
}

// ─────────── Mapfre NSEI «Generar Proyecto» (v0.8.14, endurecido en 0.8.15; 22/10/2026, AUTORIZADO por Alberto: un proyecto no es póliza) ───────────
// Tras LEER las primas en «Coberturas», el bot pulsa «Generar Proyecto» (crea un nº de proyecto en Mapfre para rescatarlo si el
// cliente acepta) y lee ese nº («Proyectos», paso 5 de la grabación del 15/10/2026). NUNCA «Ir a generar», «Contratar» ni nada del
// paso 6. Reglas: (1) solo en «Coberturas», con primas a la vista, sin diálogos abiertos, una vez por trabajo y tras calcular;
// (2) EXACTAMENTE un botón visible de `app-coberturas` con texto ENTERO «Generar Proyecto» que pase `comprobarBoton` con la opción
// ESTRECHA `permitirGenerarProyectoMapfre` (revisión 22/10/2026: NO es un permiso general de guardado; el explorador IA lo sigue
// viendo como emisión) y que la lista única no clasifique como emisión ni prohibida; (3) el clic va por `pulsarGenerarProyectoMapfre`
// (ventana de red SOLO hacia el origen del botón y SOLO con esa opción; diálogos nativos rechazados); (4) tras el clic no se pulsa
// NADA más: si sale un diálogo que hable de emitir/contratar/firmar/pagar, se para. Lo que falle (también un error del portal:
// desconexión, timeout) → motivo legible; el precio ya leído NO se toca. Solo una violación REAL de la red de emisión (la que
// lanza `guard.comprobar()`) se relanza: fail-closed, el trabajo cae entero.

/** Texto EXACTO (sin tildes, mayúsculas, espacios colapsados) del único botón que se pulsa. */
export const TEXTO_GENERAR_PROYECTO_MAPFRE = rotuloMayus(CONCEPTOS_ACCION.generar_proyecto, 'rotulos', 'generar proyecto')
/** Cuánto se espera a leer el nº de proyecto tras el clic (modal «Generando proyecto» incluido). */
export const MS_PROYECTO_MAPFRE = 45_000
const SEL_DIALOGOS_MAPFRE = 'mat-dialog-container, [role="dialog"], [role="alertdialog"]'
/** Palabras que, en un diálogo tras el clic, hacen PARAR (sin tocar nada). Sobre texto sin tildes y en minúsculas. */
const RE_DIALOGO_PELIGROSO_MAPFRE = /emit|emisi|contrat|formaliz|firmar|firma digital|pagar|\bpago\b|grabar poliza|domicili|iban/

export type ResultadoProyectoMapfre =
  | { estado: 'generado'; numero: string }
  | { estado: 'sin_numero'; motivo: string }
  | { estado: 'no_generado'; motivo: string }

/** ¿Este control es «Generar Proyecto» y nada más? Texto ENTERO exacto + `comprobarBoton` con SOLO `permitirGenerarProyectoMapfre` + lista única: nunca emisión ni prohibida. PURA. */
export function esBotonGenerarProyectoMapfre(descripciones: readonly (string | null | undefined)[], conGuardar = false): boolean {
  if (!esEtiquetaFinalProyectoMapfre(descripciones[0], conGuardar)) return false
  try {
    comprobarBoton(descripciones, { permitirGenerarProyectoMapfre: true })
  } catch {
    return false
  }
  const cat = clasificarAccionPortal(descripciones.filter((d): d is string => typeof d === 'string'))
  return !cat.emision && !cat.prohibida
}

/** v0.8.17: texto EXACTO del botón final alternativo de la pantalla/diálogo que abre «Ir a generar proyecto» (solo allí, nunca en «Coberturas»). */
export const TEXTO_GUARDAR_PROYECTO_MAPFRE = rotuloMayus(CONCEPTOS_ACCION.guardar_proyecto, 'rotulos', 'guardar proyecto')

/** ¿Es el texto de un botón final permitido? «Generar Proyecto» siempre; «Guardar proyecto» solo con `conGuardar` (pantalla tras «Ir a generar proyecto»). Sin tildes/mayúsculas. PURA. */
export function esEtiquetaFinalProyectoMapfre(etiqueta: string | null | undefined, conGuardar = false): boolean {
  const t = sinTildesMayus(etiqueta)
  return t === TEXTO_GENERAR_PROYECTO_MAPFRE || (conGuardar && t === TEXTO_GUARDAR_PROYECTO_MAPFRE)
}

/** v0.8.16: texto EXACTO del único control de navegación que se pulsa si «Generar Proyecto» no está en «Coberturas». */
export const TEXTO_IR_A_GENERAR_PROYECTO_MAPFRE = rotuloMayus(CONCEPTOS_ACCION.ir_a_generar_proyecto, 'rotulos', 'ir a generar proyecto')

/**
 * v0.8.16 (22/10/2026, run real: en «Coberturas» solo había «Ir a generar proyecto», que lleva a la vista del botón «Generar Proyecto»).
 * ¿Este control es «Ir a generar proyecto» y nada más? Texto ENTERO exacto (nunca «Contratar» ni «Ir a generar proyecto y contratar»)
 * + `comprobarBoton` con SOLO `permitirIrAGenerarProyectoMapfre` (que además exige texto entero exacto en cada descripción que lo
 * contenga) + lista única: nunca emisión ni prohibida. PURA.
 */
export function esBotonIrAGenerarProyectoMapfre(descripciones: readonly (string | null | undefined)[]): boolean {
  if (sinTildesMayus(descripciones[0]) !== TEXTO_IR_A_GENERAR_PROYECTO_MAPFRE) return false
  try {
    comprobarBoton(descripciones, { permitirIrAGenerarProyectoMapfre: true })
  } catch {
    return false
  }
  const cat = clasificarAccionPortal(descripciones.filter((d): d is string => typeof d === 'string'))
  return !cat.emision && !cat.prohibida
}

/** v0.8.15: cuánto se espera (desplazando la pantalla) a que aparezca el botón «Generar Proyecto» antes de rendirse. */
export const MS_BUSCA_BOTON_PROYECTO_MAPFRE = 10_000
const SEL_CONTROLES_PROYECTO_MAPFRE = 'button, a, [role="button"], [role="menuitem"], input[type="button"], input[type="submit"], [mat-button], [mat-raised-button], [mat-flat-button], [mat-stroked-button], [mat-menu-item], [class*="btn"], [class*="button"]'

/** Un control de la pantalla de Coberturas tal y como lo ve el escáner (solo lectura). */
export type ControlProyectoMapfre = {
  /** Texto propio del control SIN iconos (mat-icon/svg); si no tiene, su aria-label, title o value. */
  etiqueta: string
  visible: boolean
  habilitado: boolean
  enCoberturas: boolean
}

/** ¿Esta etiqueta es EXACTAMENTE «Generar Proyecto» (sin tildes, mayúsculas ni espacios de más)? PURA. */
export function esEtiquetaGenerarProyectoMapfre(etiqueta: string | null | undefined): boolean {
  return sinTildesMayus(etiqueta) === TEXTO_GENERAR_PROYECTO_MAPFRE
}

/** Etiqueta efectiva de un control: su texto sin iconos y, si no tiene (botón de solo icono), aria-label → title → value. PURA. */
export function etiquetaEfectivaControl(c: { texto?: string | null; aria?: string | null; title?: string | null; valor?: string | null }): string {
  for (const x of [c.texto, c.aria, c.title, c.valor]) {
    const t = (x ?? '').replace(/\s+/g, ' ').trim()
    if (t !== '') return t
  }
  return ''
}

/**
 * Qué botón «Generar Proyecto» pulsar (v0.8.15). El texto ha de ser EXACTO; el control puede estar en cualquier sitio de la pantalla
 * (pie del paso incluido, no solo `app-coberturas`) y ser `<button>`, `<a>`, `[role=button]`… Con varios visibles gana el ÚNICO de
 * `app-coberturas`; si sigue habiendo varios → ambiguo (no se pulsa ninguno, definitivo). Deshabilitado → se espera. PURA.
 */
export function decidirBotonGenerarProyectoMapfre(controles: readonly ControlProyectoMapfre[], conGuardar = false): { indice: number } | { motivo: string; definitivo: boolean } {
  const casan = controles.map((c, i) => ({ c, i })).filter((x) => esEtiquetaFinalProyectoMapfre(x.c.etiqueta, conGuardar))
  const visibles = casan.filter((x) => x.c.visible)
  const ocultos = casan.length - visibles.length
  if (visibles.length === 0) return { motivo: `no aparece el botón «Generar Proyecto»${conGuardar ? ' ni «Guardar proyecto»' : ' en «Coberturas»'}${ocultos > 0 ? ` (hay ${ocultos} con ese texto pero OCULTO: puede estar plegado)` : ''}`, definitivo: false }
  let elegidos = visibles
  if (elegidos.length > 1) {
    const en = elegidos.filter((x) => x.c.enCoberturas)
    if (en.length === 1) elegidos = en
  }
  // v0.8.18: el portal real repite el MISMO botón (duplicado del DOM). Si todos los candidatos tienen exactamente el mismo texto, se pulsa uno determinista:
  // el único habilitado; con varios, el único de `app-coberturas` (no hay otra noción de «producto elegido» en el DOM) o, si no, el primero visible y habilitado.
  // Textos distintos (p. ej. «Generar Proyecto» y «Guardar proyecto» a la vez) siguen siendo ambiguos.
  if (elegidos.length > 1 && elegidos.every((x) => sinTildesMayus(x.c.etiqueta) === sinTildesMayus(elegidos[0]!.c.etiqueta))) {
    const hab = elegidos.filter((x) => x.c.habilitado)
    if (hab.length > 0) elegidos = [hab[0]!]
    else elegidos = [elegidos[0]!]
  }
  if (elegidos.length > 1) return { motivo: `hay ${elegidos.length} botones finales de proyecto (ambiguo: no se pulsa ninguno)`, definitivo: true }
  const unico = elegidos[0]!
  if (!unico.c.habilitado) return { motivo: 'el botón «Generar Proyecto» está deshabilitado', definitivo: false }
  return { indice: unico.i }
}

/** ¿Esta etiqueta es EXACTAMENTE «Ir a generar proyecto»? PURA. */
export function esEtiquetaIrAGenerarProyectoMapfre(etiqueta: string | null | undefined): boolean {
  return sinTildesMayus(etiqueta) === TEXTO_IR_A_GENERAR_PROYECTO_MAPFRE
}

/**
 * Qué «Ir a generar proyecto» pulsar (v0.8.17: el portal real lo repite, uno por producto, y la versión anterior no pulsaba ninguno).
 * Visibles y habilitados con el texto entero exacto (sin tildes/mayúsculas): uno → ese; varios → el ÚNICO de `app-coberturas` o,
 * si no, el primero (todos son la misma navegación, que además pasa la lista blanca viva en el clic). Ninguno → null. PURA.
 */
export function decidirBotonIrAGenerarProyectoMapfre(controles: readonly ControlProyectoMapfre[]): { indice: number } | null {
  const validos = controles.map((c, i) => ({ c, i })).filter((x) => x.c.visible && x.c.habilitado && esEtiquetaIrAGenerarProyectoMapfre(x.c.etiqueta))
  if (validos.length === 0) return null
  const en = validos.filter((x) => x.c.enCoberturas)
  return { indice: (en.length === 1 ? en[0]! : validos[0]!).i }
}

/**
 * Descripción de un control para `esBotonGenerarProyectoMapfre`: como `descripcion` pero con la ETIQUETA sin iconos (un `mat-icon` con
 * su ligadura dentro del botón rompía la igualdad exacta) y, en botones de solo icono, el aria-label/title/value. El resto de campos
 * (id, onclick, ancestros…) quedan como están: siguen pudiendo bloquear. PURA.
 */
export function descripcionGenerarProyecto(desc: readonly (string | null)[], etiquetaSinIconos: string): (string | null)[] {
  const efectiva = etiquetaEfectivaControl({ texto: etiquetaSinIconos, aria: desc[1], title: desc[2], valor: desc[3] })
  return [efectiva, ...desc.slice(1)]
}

async function descripcionVivaGenerarProyecto(boton: Locator): Promise<(string | null)[]> {
  const sinIconos = await boton
    .evaluate((el) => {
      const c = el.cloneNode(true) as HTMLElement
      c.querySelectorAll('mat-icon, .mat-icon, .material-icons, svg').forEach((x) => x.remove())
      return (c.textContent ?? '').replace(/\s+/g, ' ').trim()
    })
    .catch(() => '')
  return descripcionGenerarProyecto(await descripcion(boton), sinIconos)
}

/** Desplaza las zonas con scroll de la pantalla (sin clics) por si el control está fuera de la vista o se pinta al llegar. */
async function desplazarPantallaMapfre(page: Page, alFinal: boolean): Promise<void> {
  await page
    .evaluate((fin) => {
      const alto = (e: Element) => (e as HTMLElement).scrollHeight
      window.scrollTo(0, fin ? alto(document.documentElement) : 0)
      document.querySelectorAll('mat-sidenav-content, mat-drawer-content, main, app-coberturas, mat-stepper, .mat-stepper-content, [class*="scroll"]').forEach((e) => {
        const h = e as HTMLElement
        if (h.scrollHeight > h.clientHeight) h.scrollTop = fin ? h.scrollHeight : 0
      })
    }, alFinal)
    .catch(() => {})
}

/** Lee TODOS los botones/enlaces de la pantalla (fuera de diálogos), marca cada uno con `data-rpa-ctl` y devuelve sus datos. Solo lectura. */
async function escanearControlesProyectoMapfre(page: Page, incluirDialogos = false): Promise<ControlProyectoMapfre[]> {
  return page
    .evaluate(
      ({ sel, dialogos, conDialogos }) => {
        document.querySelectorAll('[data-rpa-ctl]').forEach((n) => n.removeAttribute('data-rpa-ctl'))
        const salida: { texto: string; aria: string | null; title: string | null; valor: string | null; visible: boolean; habilitado: boolean; enCoberturas: boolean }[] = []
        const nodos = Array.from(document.querySelectorAll(sel))
        for (const n of nodos) {
          if (salida.length >= 300) break
          if (!conDialogos && n.closest(dialogos)) continue
          // Un envoltorio (`div.btn…`) con un botón dentro no cuenta: cuenta el botón.
          if (n.querySelector('button, a, [role="button"], input[type="button"], input[type="submit"]')) continue
          const h = n as HTMLElement & { value?: unknown; disabled?: boolean }
          const r = h.getBoundingClientRect()
          const cs = getComputedStyle(h)
          const visible = r.width > 0 && r.height > 0 && cs.visibility === 'visible' && cs.display !== 'none'
          const c = h.cloneNode(true) as HTMLElement
          c.querySelectorAll('mat-icon, .mat-icon, .material-icons, svg').forEach((x) => x.remove())
          h.setAttribute('data-rpa-ctl', String(salida.length))
          salida.push({
            texto: (c.textContent ?? '').replace(/\s+/g, ' ').trim(),
            aria: h.getAttribute('aria-label'),
            title: h.getAttribute('title'),
            valor: typeof h.value === 'string' ? h.value : null,
            visible,
            // v0.8.21: el nodo escaneado puede ser el <span> de texto de un mat-button: manda el <button>/<a> más cercano (Playwright lo hace igual).
            habilitado: (() => {
              const m = h.closest('button, a, [role="button"], [mat-button], [mat-raised-button], [mat-flat-button], [mat-stroked-button]') as (HTMLElement & { disabled?: boolean }) | null
              return !([h, m].some((x) => x !== null && (x.disabled === true || x.hasAttribute('disabled') || x.getAttribute('aria-disabled') === 'true' || /\bmat(?:-mdc)?-button-disabled\b/.test(x.className?.toString?.() ?? ''))))
            })(),
            enCoberturas: h.closest('app-coberturas') !== null,
          })
        }
        return salida
      },
      { sel: SEL_CONTROLES_PROYECTO_MAPFRE, dialogos: SEL_DIALOGOS_MAPFRE, conDialogos: incluirDialogos },
    )
    .then((l) => l.map((x) => ({ etiqueta: etiquetaEfectivaControl(x), visible: x.visible, habilitado: x.habilitado, enCoberturas: x.enCoberturas })))
    .catch(() => [])
}

/**
 * Busca el botón «Generar Proyecto» esperando (y desplazando la pantalla, sin clics) hasta `esperaMs`. Devuelve el control o el
 * motivo legible, con la lista saneada de botones/enlaces a la vista para saber qué hay en pantalla. Solo lectura.
 */
async function buscarBotonGenerarProyectoMapfre(page: Page, guard: GuardEmision, esperaMs: number, conIr = false, pantallaFinal = false, completar?: CompletarProyectoMapfre): Promise<{ boton: Locator } | { ir: Locator } | { estado: 'no_generado'; motivo: string }> {
  const hasta = Date.now() + esperaMs
  let controles: ControlProyectoMapfre[] = []
  let completado = false
  let decision: ReturnType<typeof decidirBotonGenerarProyectoMapfre>
  for (let vuelta = 0; ; vuelta++) {
    guard.comprobar()
    // v0.8.17: en la pantalla final (tras «Ir a generar proyecto») el botón puede estar en un diálogo y puede llamarse «Guardar proyecto».
    controles = await escanearControlesProyectoMapfre(page, pantallaFinal)
    decision = decidirBotonGenerarProyectoMapfre(controles, pantallaFinal)
    // v0.8.22: el botón está ahí pero DESHABILITADO → el adaptador completa/valida el formulario del proyecto (UNA vez) y se vuelve a mirar.
    // Un aviso (falta un dato del tomador…) → no se pulsa nada. Sin `completar`, el comportamiento es el de siempre.
    if (completar && !completado && 'motivo' in decision && /deshabilitado/.test(decision.motivo)) {
      completado = true
      const aviso = await completar(page)
      guard.comprobar()
      if (aviso !== null) return { estado: 'no_generado', motivo: aviso }
      await page.waitForTimeout(400)
      continue
    }
    if ('indice' in decision) break
    // v0.8.16: sin «Generar Proyecto» pero con «Ir a generar proyecto» a la vista (tras una vuelta de gracia, o en la última) → ese es el camino.
    if (conIr && (vuelta >= 1 || Date.now() >= hasta)) {
      const ir = decidirBotonIrAGenerarProyectoMapfre(controles)
      if (ir) {
        const loc = page.locator(`[data-rpa-ctl="${ir.indice}"]`)
        if ((await loc.count().catch(() => 0)) === 1) return { ir: loc }
      }
    }
    if (decision.definitivo || Date.now() >= hasta) break
    await desplazarPantallaMapfre(page, vuelta % 2 === 0)
    await page.waitForTimeout(500)
  }
  if ('indice' in decision) {
    const boton = page.locator(`[data-rpa-ctl="${decision.indice}"]`)
    if ((await boton.count().catch(() => 0)) === 1) return { boton }
    return { estado: 'no_generado', motivo: 'el botón final de proyecto cambió de sitio antes de pulsarlo' }
  }
  const visibles = etiquetasControlesSaneadas(controles.filter((c) => c.visible).map((c) => c.etiqueta))
  // v0.8.20: si lo único que impide pulsar es que está deshabilitado, el aviso nombra los campos obligatorios que faltan (sin valores).
  const campos = /deshabilitado/.test(decision.motivo) ? `; campos obligatorios vacíos o inválidos: ${describirCamposObligatoriosMapfre(await leerCamposObligatoriosMapfre(page))}` : ''
  return { estado: 'no_generado', motivo: `${decision.motivo}${campos}${sufijoControlesVisibles(visibles)}` }
}

/**
 * El clic de «Generar Proyecto» (solo desde `generarProyectoMapfre`). Como `pulsarGuardadoPresupuesto` pero ESTRECHO: sin
 * inventario del explorador, `comprobarBoton` y la ventana de red con SOLO `permitirGenerarProyectoMapfre` (no Archivar/store).
 * Frontera bancaria, un único control, origen http(s), diálogos nativos rechazados y ventana cerrada SIEMPRE.
 */
async function pulsarGenerarProyectoMapfre(page: Page, guard: GuardEmision, boton: Locator, trasClic: () => Promise<void>, cual: 'generar' | 'ir' = 'generar', conGuardar = false): Promise<void> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', '«Generar Proyecto» con otra ventana de red abierta')
  await exigirSinCuentaBancaria(page)
  if ((await boton.count()) !== 1) throw new EmisionBloqueadaError('boton', '«Generar Proyecto»: no hay exactamente un control')
  const desc = await descripcionVivaGenerarProyecto(boton)
  // v0.8.16: ÚNICA puerta de la ventana estrecha; `cual` elige la lista blanca: «Generar Proyecto» o (una vez, solo navega) «Ir a generar proyecto».
  if (!(cual === 'ir' ? esBotonIrAGenerarProyectoMapfre(desc) : esBotonGenerarProyectoMapfre(desc, conGuardar))) throw new EmisionBloqueadaError('boton', `«${cual === 'ir' ? 'Ir a generar proyecto' : 'Generar Proyecto'}»: el control vivo no pasa la lista blanca`)
  const origen = await boton.evaluate((el) => el.ownerDocument.location.origin).catch(() => null)
  if (!origen || !/^https?:\/\//.test(origen)) throw new EmisionBloqueadaError('fase', '«Generar Proyecto»: sin origen http(s) conocido')
  // v0.8.20: deshabilitado → no se espera 30 s al clic: se lee qué campos obligatorios faltan (solo lectura, sin valores) y se avisa.
  if (cual === 'generar' && (await botonDeshabilitadoMapfre(boton))) throw new BotonProyectoDeshabilitadoError(describirCamposObligatoriosMapfre(await leerCamposObligatoriosMapfre(page)))
  const abrir = ABRIR_GUARDADO.get(guard)
  if (!abrir) throw new EmisionBloqueadaError('fase', 'guard sin ventana de guardado')
  let dialogo: string | null = null
  const alDialogo = (d: Dialog) => {
    dialogo ??= d.type()
    d.dismiss().catch(() => {})
  }
  page.on('dialog', alDialogo)
  abrir(origen, true)
  try {
    // v0.8.21: timeout corto (no los 30 s por defecto): un botón que no se deja pulsar se diagnostica enseguida.
    await boton.click({ timeout: 8_000 })
    await trasClic()
    guard.comprobar()
    if (dialogo) throw new GuardadoConDialogoError(dialogo)
  } finally {
    page.off('dialog', alDialogo)
    guard.guardado.cerrar()
  }
}

const RE_PROYECTO_SUELTO = /\bproyecto\s*[:#]?\s*(\d[\d/.-]{4,29})(?![A-Za-z0-9])/gi

/** Todas las referencias de proyecto de un texto (con etiqueta: «Nº proyecto…», «Proyecto nº…», «Proyecto 123456…»), en orden. PURA. */
function referenciasProyectoMapfre(texto: string): string[] {
  const out: string[] = []
  let t = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ')
  for (let i = 0; i < 10; i++) {
    const r = extraerReferenciaPresupuesto(t)
    if (!r) break
    out.push(r)
    t = t.replace(r, ' ')
  }
  for (const m of t.matchAll(RE_PROYECTO_SUELTO)) {
    const c = m[1]!.replace(/[.-]+$/, '')
    if (referenciaPresupuestoValida(c)) out.push(c)
  }
  return out
}

/**
 * Nº de proyecto NUEVO tras «Generar Proyecto»: la primera referencia de proyecto que aparece en `despues` y NO estaba en `antes`
 * (una que ya estaba en pantalla puede ser de otro proyecto). Sin forma de NIF/teléfono/IBAN/tarjeta (`referenciaPresupuestoValida`).
 * `null` = no se vio («no se sabe», nunca «no hay»). PURA.
 */
export function numeroProyectoMapfreNuevo(antes: string, despues: string): string | null {
  const previas = new Set(referenciasProyectoMapfre(antes).map((r) => r.toUpperCase()))
  return referenciasProyectoMapfre(despues).find((r) => !previas.has(r.toUpperCase())) ?? null
}

/** Texto de la pantalla + «etiqueta: valor» SOLO de los campos cuya etiqueta habla de «proyecto» (el nº suele ir en un input de solo lectura). Solo lectura. */
async function textoProyectoMapfre(page: Page): Promise<string> {
  return page
    .evaluate(() => {
      const partes: string[] = [document.body ? document.body.innerText || '' : '']
      for (const n of Array.from(document.querySelectorAll('input, textarea'))) {
        const el = n as HTMLInputElement
        if (el.type === 'hidden' || el.type === 'password' || !el.value) continue
        const ff = el.closest('mat-form-field')
        const lf = ff ? ff.querySelector('mat-label, label') : null
        const lab = ((el.labels && el.labels[0] ? el.labels[0].textContent : '') || (lf ? lf.textContent : '') || el.getAttribute('placeholder') || el.getAttribute('aria-label') || el.getAttribute('formcontrolname') || el.getAttribute('name') || '').replace(/\s+/g, ' ').trim()
        if (/proyecto/i.test(lab)) partes.push(`Nº proyecto: ${el.value}`)
      }
      return partes.join('\n')
    })
    .catch(() => '')
}

// ─────────── Diagnóstico del «Generar Proyecto» de Mapfre (v0.8.19, 26/10/2026) ───────────
// Solo lectura y SIN datos personales: textos de diálogos/mensajes por `textoDialogoPortalSeguro` (nombres → [nombre], cifras tapadas),
// las líneas que hablan de «proyecto» con las cifras sustituidas por su FORMA (9999999999, 2026/AA99) y etiquetas de controles saneadas.

export type DiagnosticoProyectoMapfre = { dialogos: string[]; mensajes: string[]; proyecto: string[]; controles: string[] }

/** Forma de una referencia sin su valor: cada dígito → 9, cada letra → A («2026/000123» → «9999/999999»). PURA. */
export function formaReferenciaProyecto(texto: string): string {
  return texto.replace(/[A-Za-z0-9][A-Za-z0-9/.-]*/g, (t) => ((t.match(/\d/g) ?? []).length >= 4 ? t.replace(/\d/g, '9').replace(/[A-Za-z]/g, 'A') : t))
}

/** Primera(s) línea(s) de un error del navegador (Playwright: «locator.click: Timeout… / <div> intercepts pointer events»), saneadas y cortas. PURA. */
export function errorPortalSaneado(e: unknown): string {
  const bruto = e instanceof Error ? e.message : String(e)
  const lineas = bruto.split('\n').map((l) => l.trim()).filter((l) => l !== '')
  const elegidas = lineas.filter((l, i) => i < 2 || /intercept|not enabled|not visible|detached|outside|closed|navigat|destroyed/i.test(l)).slice(0, 4)
  return elegidas.map((l) => textoDialogoPortalSeguro(l.slice(0, 160))).join(' | ').slice(0, 400) || 'sin detalle'
}

/** Cola del motivo con lo que mostraba el portal (vacía si no hay nada). PURA. */
export function sufijoDiagnosticoProyectoMapfre(d: DiagnosticoProyectoMapfre | null | undefined): string {
  if (!d) return ''
  const trozos: string[] = []
  if (d.dialogos.length > 0) trozos.push(`diálogos: ${d.dialogos.map((t) => `«${t}»`).join(', ')}`)
  if (d.mensajes.length > 0) trozos.push(`mensajes del portal: ${d.mensajes.map((t) => `«${t}»`).join(', ')}`)
  if (d.proyecto.length > 0) trozos.push(`texto con «proyecto» (cifras como 9): ${d.proyecto.map((t) => `«${t}»`).join(', ')}`)
  const ctl = sufijoControlesVisibles(d.controles).replace(/^; /, '')
  if (ctl) trozos.push(ctl)
  return trozos.length > 0 ? `; ${trozos.join('; ')}` : ''
}

const SEL_MENSAJES_MAPFRE = 'mat-error, [role="alert"], [role="status"], mat-snack-bar-container, simple-snack-bar, .mat-snack-bar-container, .mat-mdc-snack-bar-container, .toast, .alert, .mat-error, .error-message'

/** Lee (sin pulsar nada) lo que el portal muestra ahora. Nunca lanza. */
export async function diagnosticoPantallaProyectoMapfre(page: Page): Promise<DiagnosticoProyectoMapfre> {
  const limpiar = (ts: string[], max: number) => [...new Set(ts.map((t) => formaReferenciaProyecto(textoDialogoPortalSeguro(t)).slice(0, 160)).filter((t) => t !== ''))].slice(0, max)
  const dialogos = limpiar(await page.locator(SEL_DIALOGOS_MAPFRE).locator('visible=true').allInnerTexts().catch(() => [] as string[]), 3)
  const mensajes = limpiar(await page.locator(SEL_MENSAJES_MAPFRE).locator('visible=true').allInnerTexts().catch(() => [] as string[]), 4)
  const texto = await textoProyectoMapfre(page)
  const proyecto = [...new Set(texto.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l !== '' && l.length <= 120 && /proyecto/i.test(l) && !/objeto asegurado/i.test(l) && !/\b(?:sr|sra|don|doña|cliente|tomador|asegurado|titular)\b/i.test(l)).map((l) => redactarDatosPersonales(formaReferenciaProyecto(l)).slice(0, 100)))].slice(0, 4)
  const etiquetas = await page
    .evaluate(() => Array.from(document.querySelectorAll('button, a, [role="button"]')).filter((n) => { const r = (n as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0 }).map((n) => ((n as HTMLElement).innerText || n.getAttribute('aria-label') || '').trim()))
    .catch(() => [] as string[])
  return { dialogos, mensajes, proyecto, controles: etiquetasControlesSaneadas(etiquetas) }
}

// ─────────── v0.8.20 (26/10/2026): «Generar Proyecto» DESHABILITADO → diagnóstico de campos obligatorios, sin esperar 30 s ───────────
// Solo lectura. NUNCA se copia el VALOR de un campo (datos personales): solo etiqueta, tipo, id/formcontrolname, si está vacío y el mat-error.

export type CampoObligatorioMapfre = { etiqueta: string; tipo: string; id: string; calendario: boolean; vacio: boolean; error: string; control?: string; pista?: string }

/** Texto corto y saneado (sin datos personales) para el aviso. PURA. */
function cortoSaneado(t: string | null | undefined, max: number): string {
  return textoDialogoPortalSeguro((t ?? '').replace(/\s+/g, ' ').trim()).slice(0, max)
}

/** Cola legible de los campos obligatorios/ inválidos (máx. 8; los vacíos primero). Sin valores. PURA. */
export function describirCamposObligatoriosMapfre(campos: readonly CampoObligatorioMapfre[]): string {
  if (campos.length === 0) return 'no se identificó ningún campo obligatorio vacío o inválido en el formulario visible'
  const orden = [...campos].sort((a, b) => Number(b.vacio) - Number(a.vacio)).slice(0, 12)
  const trozos = orden.map((c) => {
    // v0.8.22: un campo SIN etiqueta (ids mat-input-N dinámicos) se nombra por su formcontrolname y por el texto del label/placeholder más cercano.
    const control = cortoSaneado(c.control, 40)
    const pista = cortoSaneado(c.pista, 40)
    const partes = [c.tipo || 'campo', c.id ? `id ${cortoSaneado(c.id, 40)}` : '', control && control !== cortoSaneado(c.id, 40) ? `control ${control}` : '', pista ? `cerca: «${pista}»` : '', c.vacio ? 'vacío' : 'con valor no válido', c.calendario ? 'con selector de fecha' : ''].filter((x) => x !== '')
    return `«${cortoSaneado(c.etiqueta, 40) || 'sin etiqueta'}» (${partes.join(', ')}${c.error ? `; mat-error: «${cortoSaneado(c.error, 60)}»` : ''})`
  })
  return `${campos.length > orden.length ? `${campos.length} campos (se citan ${orden.length})` : `${campos.length} campo${campos.length === 1 ? '' : 's'}`}: ${trozos.join(', ')}`
}

/** Lee (sin escribir ni pulsar) los campos obligatorios vacíos o inválidos del formulario visible. Nunca lanza ni devuelve valores. */
export async function leerCamposObligatoriosMapfre(page: Page): Promise<CampoObligatorioMapfre[]> {
  const bruto: CampoObligatorioMapfre[] = []
  // v0.8.21: TODOS los frames (el formulario puede vivir en un iframe).
  for (const marco of page.frames()) {
    const parte = await marco
    .evaluate(() => {
      const out: { etiqueta: string; tipo: string; id: string; calendario: boolean; vacio: boolean; error: string; control: string; pista: string }[] = []
      // (sin funciones auxiliares con nombre: el empaquetador inyectaría `__name`, que no existe en la página)
      for (const n of Array.from(document.querySelectorAll('input, select, mat-select, textarea'))) {
        const h = n as HTMLInputElement
        const tipoAttr = (h.getAttribute('type') ?? '').toLowerCase()
        if (tipoAttr === 'hidden') continue
        const campo = h.closest('mat-form-field')
        const r = h.getBoundingClientRect()
        const cs = getComputedStyle(h)
        if (!(r.width > 0 && r.height > 0) || cs.visibility !== 'visible' || cs.display === 'none') continue
        const cl = h.classList
        const obligatorio = h.hasAttribute('required') || h.getAttribute('aria-required') === 'true'
        const invalido = h.getAttribute('aria-invalid') === 'true' || cl.contains('ng-invalid') || (campo?.classList.contains('mat-form-field-invalid') ?? false) || (campo?.classList.contains('mat-mdc-form-field-invalid') ?? false) || (campo?.classList.contains('ng-invalid') ?? false) || (campo?.querySelector('.ng-invalid, mat-error') ?? null) !== null
        if (!obligatorio && !invalido) continue
        const esSelect = n.tagName === 'MAT-SELECT' || n.tagName === 'SELECT'
        const vacio = n.tagName === 'MAT-SELECT'
          ? cl.contains('mat-select-empty') || cl.contains('mat-mdc-select-empty') || n.querySelector('.mat-select-placeholder, .mat-mdc-select-placeholder') !== null
          : (h.value ?? '') === ''
        const id = h.getAttribute('formcontrolname') || h.id || h.getAttribute('name') || ''
        const idLabel = h.id ? document.querySelector(`label[for="${h.id}"]`) : null
        const etiqueta = [campo?.querySelector('mat-label'), idLabel, campo?.querySelector('label')].map((x) => (x?.textContent ?? '').replace(/\s+/g, ' ').trim()).find((x) => x !== '') || h.getAttribute('aria-label') || h.getAttribute('placeholder') || ''
        const error = Array.from((campo ?? document.createElement('div')).querySelectorAll('mat-error, .mat-error')).map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim()).filter((t) => t !== '').join(' / ')
        const calendario = campo !== null && (campo.querySelector('mat-datepicker-toggle, [aria-label="Open calendar"]') !== null || h.hasAttribute('matdatepicker') || h.hasAttribute('ng-reflect-mat-datepicker'))
        // v0.8.22: sin etiqueta → formcontrolname/name y el texto del label más cercano (label/mat-label/legend de un ancestro próximo) o placeholder/aria-label. NUNCA el valor.
        const control = h.getAttribute('formcontrolname') || h.getAttribute('ng-reflect-name') || h.getAttribute('ng-reflect-form-control-name') || h.getAttribute('name') || ''
        let pista = h.getAttribute('placeholder') || h.getAttribute('aria-label') || ''
        if (pista === '' && etiqueta === '') {
          let anc: Element | null = h.parentElement
          for (let i = 0; i < 5 && anc !== null && pista === ''; i++, anc = anc.parentElement) {
            // Solo ancestros con ESTE control como único (si no, el label sería el de otro campo).
            if (anc.querySelectorAll('input, mat-select, select, textarea').length > 1) break
            const l = anc.querySelector('label, mat-label, legend')
            pista = (l?.textContent ?? '').replace(/\s+/g, ' ').trim()
            if (pista === '' && anc.previousElementSibling && !/^(INPUT|MAT-SELECT|SELECT|MAT-FORM-FIELD)$/.test(anc.previousElementSibling.tagName) && anc.previousElementSibling.querySelector('input, mat-select, select, textarea') === null) { const t = (anc.previousElementSibling.textContent ?? '').replace(/\s+/g, ' ').trim(); if (t.length <= 30 && !/[\d@]/.test(t)) pista = t }
          }
        }
        out.push({ etiqueta, tipo: n.tagName === 'MAT-SELECT' ? 'mat-select' : esSelect ? 'select' : n.tagName === 'TEXTAREA' ? 'textarea' : tipoAttr || 'input', id, calendario, vacio, error, control, pista })
      }
      return out
    })
    .catch(() => [] as CampoObligatorioMapfre[])
    bruto.push(...parte)
    if (bruto.length >= 40) break
  }
  return bruto.slice(0, 40)
}

/** ¿El control está deshabilitado? Playwright `isEnabled()` + el estado del <button>/<a> más cercano (el locator puede ser su <span>) + atributos/clases. Solo lectura. */
async function botonDeshabilitadoMapfre(boton: Locator): Promise<boolean> {
  if (!(await boton.isEnabled({ timeout: 1_000 }).catch(() => true))) return true
  return boton
    .evaluate((el) => {
      const m = el.closest('button, a, [role="button"], [mat-button], [mat-raised-button], [mat-flat-button], [mat-stroked-button]') as (HTMLElement & { disabled?: boolean }) | null
      return [el as HTMLElement & { disabled?: boolean }, m].some((x) => x !== null && (x.disabled === true || x.hasAttribute('disabled') || x.getAttribute('aria-disabled') === 'true' || /\bmat(?:-mdc)?-button-disabled\b/.test(x.className?.toString?.() ?? '')))
    })
    .catch(() => false)
}

/** v0.8.22 · Función del adaptador que completa el formulario del proyecto ANTES del clic. `null` = listo; texto = aviso (no se pulsa). */
export type CompletarProyectoMapfre = (page: Page) => Promise<string | null>

/** «Generar Proyecto» estaba deshabilitado: no se pulsa. Lleva el diagnóstico de campos (sin valores). */
export class BotonProyectoDeshabilitadoError extends Error {
  constructor(readonly campos: string) {
    super('boton_proyecto_deshabilitado')
    this.name = 'BotonProyectoDeshabilitadoError'
  }
}

/** Comprobaciones previas al clic (solo lectura). Devuelve el botón elegido o el motivo de no pulsar. Puede lanzar por errores del portal. */
async function prepararGenerarProyectoMapfre(page: Page, guard: GuardEmision, esperaBotonMs: number, completar?: CompletarProyectoMapfre): Promise<{ boton: Locator; conGuardar: boolean } | { estado: 'no_generado'; motivo: string }> {
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) return { estado: 'no_generado', motivo: 'otra ventana de red abierta' }
  const usados = AVANCES_USADOS.get(guard) ?? new Set<string>()
  if (usados.has('mapfre:proyecto')) return { estado: 'no_generado', motivo: '«Generar Proyecto» ya se pulsó en este trabajo' }
  if (!usados.has('mapfre:continuar:figuras')) return { estado: 'no_generado', motivo: '«Generar Proyecto» fuera de orden (antes de calcular las primas)' }
  const paso = await pasoActivoMapfre(page)
  if (!paso?.includes('COBERTURAS')) return { estado: 'no_generado', motivo: 'el paso activo no es «Coberturas»' }
  if ((await page.locator(SEL_DIALOGOS_MAPFRE).locator('visible=true').count().catch(() => 0)) > 0) return { estado: 'no_generado', motivo: 'hay un diálogo abierto sobre «Coberturas»' }
  const conPrima = await page.locator('app-coberturas prima-producto').filter({ hasText: /\d\s*€/ }).count().catch(() => 0)
  if (conPrima === 0) return { estado: 'no_generado', motivo: 'no hay primas a la vista en «Coberturas»' }
  // v0.8.15: el botón puede estar en el pie del paso (fuera de `app-coberturas`), ser <a>/[role=button]/solo icono o pintarse tarde.
  const buscado = await buscarBotonGenerarProyectoMapfre(page, guard, esperaBotonMs, !usados.has('mapfre:ir-generar'), false, completar)
  if ('estado' in buscado) return buscado
  let boton: Locator
  let conGuardar = false
  if ('ir' in buscado) {
    // v0.8.16: el control real de «Coberturas» es «Ir a generar proyecto»: se pulsa UNA vez (navega, no crea nada) y se espera a que
    // en la vista siguiente aparezca «Generar Proyecto». Si no aparece → motivo benigno con las etiquetas a la vista (saneadas).
    usados.add('mapfre:ir-generar')
    AVANCES_USADOS.set(guard, usados)
    let navegado = false
    try {
      await pulsarGenerarProyectoMapfre(page, guard, buscado.ir, async () => {
        navegado = true
        await page.waitForTimeout(500)
      }, 'ir')
    } catch (e) {
      guard.comprobar()
      if (e instanceof ErrorFronteraEmision) throw e
      return { estado: 'no_generado', motivo: `${navegado ? 'se pulsó «Ir a generar proyecto» pero el portal no respondió' : 'no se pudo pulsar «Ir a generar proyecto»'}` }
    }
    // v0.8.17: la vista/diálogo siguiente puede traer «Generar Proyecto» o «Guardar proyecto» (lista blanca estricta, solo esos dos textos
    // enteros); se escanea también dentro de diálogos. Si un diálogo visible habla de emitir/contratar/firmar/pagar, no se pulsa nada.
    const tras = await buscarBotonGenerarProyectoMapfre(page, guard, esperaBotonMs, false, true, completar)
    if ('estado' in tras) return { estado: 'no_generado', motivo: `se pulsó «Ir a generar proyecto» y ${tras.motivo.replace(/^no aparece el botón «Generar Proyecto» ni «Guardar proyecto»/, 'sigue sin aparecer el botón «Generar Proyecto» ni «Guardar proyecto»')}` }
    if (!('boton' in tras)) return { estado: 'no_generado', motivo: 'se pulsó «Ir a generar proyecto» y no se localizó el botón final' }
    // Texto del diálogo SIN sus botones/enlaces (un «Contratar» que no se pulsa no debe impedir el guardado; sí un texto que hable de pagar/emitir).
    const dialogos = await page
      .evaluate((sel) => Array.from(document.querySelectorAll(sel)).map((d) => { const c = d.cloneNode(true) as HTMLElement; c.querySelectorAll('button, a, [role="button"], input').forEach((x) => x.remove()); return c.textContent ?? '' }), SEL_DIALOGOS_MAPFRE)
      .catch(() => [] as string[])
    if (dialogos.some((t) => RE_DIALOGO_PELIGROSO_MAPFRE.test(t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()))) return { estado: 'no_generado', motivo: 'se pulsó «Ir a generar proyecto» y el diálogo siguiente menciona emitir/contratar/firmar/pagar: no se pulsa nada más' }
    boton = tras.boton
    conGuardar = true
  } else {
    boton = buscado.boton
  }
  if (!esBotonGenerarProyectoMapfre(await descripcionVivaGenerarProyecto(boton), conGuardar)) return { estado: 'no_generado', motivo: 'el botón «Generar Proyecto» no pasa la lista blanca (menciona emitir/contratar/firmar/pagar u otra acción): no se pulsa' }
  return { boton, conGuardar }
}

/**
 * «Generar Proyecto» de Mapfre NSEI con las reglas de arriba. Nunca lanza por «no se pudo» (tampoco por un error del portal antes
 * o después del clic: desconexión, timeout…): lo devuelve. Solo relanza la violación REAL del guard (`guard.comprobar()`).
 */
export async function generarProyectoMapfre(page: Page, guard: GuardEmision, esperaMs = MS_PROYECTO_MAPFRE, esperaBotonMs = Math.min(MS_BUSCA_BOTON_PROYECTO_MAPFRE, esperaMs), completar?: CompletarProyectoMapfre): Promise<ResultadoProyectoMapfre> {
  guard.comprobar()
  let boton: Locator
  let conGuardar = false
  let antes: string
  try {
    const prep = await prepararGenerarProyectoMapfre(page, guard, esperaBotonMs, completar)
    if ('estado' in prep) return prep
    boton = prep.boton
    conGuardar = prep.conGuardar
    antes = await textoProyectoMapfre(page)
  } catch {
    guard.comprobar()
    return { estado: 'no_generado', motivo: 'el portal no respondió al preparar «Generar Proyecto»' }
  }
  const usados = AVANCES_USADOS.get(guard) ?? new Set<string>()
  usados.add('mapfre:proyecto')
  AVANCES_USADOS.set(guard, usados)
  let pulsado = false
  let numero: string | null = null
  let peligro: string | null = null
  try {
    await pulsarGenerarProyectoMapfre(page, guard, boton, async () => {
      pulsado = true
      const fin = Date.now() + esperaMs
      while (Date.now() < fin) {
        guard.comprobar()
        // Tras el clic NO se pulsa nada: un diálogo que hable de emitir/contratar/firmar/pagar → se para aquí.
        const dialogos = await page.locator(SEL_DIALOGOS_MAPFRE).locator('visible=true').allInnerTexts().catch(() => [] as string[])
        const malo = dialogos.map((t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()).find((t) => RE_DIALOGO_PELIGROSO_MAPFRE.test(t))
        if (malo !== undefined) {
          peligro = (malo.match(RE_DIALOGO_PELIGROSO_MAPFRE) ?? [''])[0]
          return
        }
        numero = numeroProyectoMapfreNuevo(antes, await textoProyectoMapfre(page))
        if (numero) return
        await page.waitForTimeout(400)
      }
    }, 'generar', conGuardar)
  } catch (e) {
    guard.comprobar()
    // v0.8.19: el motivo genérico no decía NADA (dos runs reales). Ahora lleva la causa: error del navegador saneado, si el clic llegó a darse,
    // y lo que el portal muestra (diálogos/mensajes de validación, líneas de «proyecto» con la FORMA del nº, controles a la vista).
    const generico = !(e instanceof ErrorFronteraEmision || e instanceof GuardadoConDialogoError || e instanceof EmisionBloqueadaError || e instanceof BotonProyectoDeshabilitadoError)
    // v0.8.21: «not enabled» (o botón deshabilitado ahora) → SIEMPRE el diagnóstico de campos obligatorios, aunque el clic fallara por otro camino.
    const deshab = generico && !pulsado && (/not enabled/i.test(e instanceof Error ? e.message : String(e)) || (await botonDeshabilitadoMapfre(boton).catch(() => false)))
    const camposDeshab = deshab ? describirCamposObligatoriosMapfre(await leerCamposObligatoriosMapfre(page)) : ''
    const base = deshab ? 'el botón «Generar Proyecto» está deshabilitado (no se pulsó)' : e instanceof ErrorFronteraEmision ? 'hay un campo de cuenta bancaria a la vista' : e instanceof GuardadoConDialogoError ? 'el portal abrió un diálogo del navegador (no se acepta)' : e instanceof EmisionBloqueadaError ? 'el guard no autorizó el control' : e instanceof BotonProyectoDeshabilitadoError ? 'el botón «Generar Proyecto» está deshabilitado (no se pulsó)' : 'el portal no dejó completar el proyecto'
    const causa = e instanceof BotonProyectoDeshabilitadoError ? ` [campos obligatorios vacíos o inválidos: ${e.campos}]` : deshab ? ` [campos obligatorios vacíos o inválidos: ${camposDeshab}; error: ${errorPortalSaneado(e)}]` : generico ? ` [${pulsado ? 'tras el clic' : 'el clic no llegó a darse'}; error: ${errorPortalSaneado(e)}]` : ''
    const motivo = `${base}${causa}${sufijoDiagnosticoProyectoMapfre(await diagnosticoPantallaProyectoMapfre(page))}`
    return pulsado ? { estado: 'sin_numero', motivo } : { estado: 'no_generado', motivo }
  }
  if (numero) return { estado: 'generado', numero }
  if (peligro !== null) return { estado: 'sin_numero', motivo: `tras pulsar salió un diálogo que menciona «${peligro}»: el bot no toca nada más` }
  return { estado: 'sin_numero', motivo: `no se leyó el nº de proyecto en ${Math.round(esperaMs / 1000)} s${sufijoDiagnosticoProyectoMapfre(await diagnosticoPantallaProyectoMapfre(page))}` }
}

/** Trabajos (guards) en los que ya se vio un IMPORTE en algún marco: ningún avance por id más (precio pegajoso, 28/10/2026). */
const PRECIO_VISTO = new WeakSet<GuardEmision>()
export function registrarPrecioVisto(guard: GuardEmision): void {
  PRECIO_VISTO.add(guard)
}
export function precioVistoEn(guard: GuardEmision): boolean {
  return PRECIO_VISTO.has(guard)
}

/** Cuerpo de `vigilanciaVivaAvancePorId` que corre EN EL MARCO (texto: sin `__name`). */
const VIGILANCIA_AVANCE_ID = `function (fuenteTitulo) {
  var reTitulo = new RegExp(fuenteTitulo);
  var RE = /^(?:€\\s*)?-?\\d[\\d.,]{0,14}\\s*(?:€|eur(?:os)?)?$/i;
  var esImporte = function (t) { return t.length <= 30 && RE.test(t) && (/€|eur/i.test(t) || /,\\d{1,2}$/.test(t)); };
  var visible = function (n) { return n.getClientRects().length > 0 && getComputedStyle(n).visibility !== 'hidden'; };
  var txt = function (n) { return String(n.innerText || n.textContent || '').replace(/\\s+/g, ' ').trim(); };
  var plano = function (t) { return t.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase(); };
  var p = false, t = false, i, n, v;
  var nodos = document.querySelectorAll('td,th,span,strong,b,div,p,dd,li,label,output,em,small,font');
  for (i = 0; i < nodos.length && !p; i++) { n = nodos[i]; if (visible(n)) { v = txt(n); if (v !== '' && esImporte(v)) p = true; } }
  var campos = document.querySelectorAll('input[readonly],input[disabled],output');
  for (i = 0; i < campos.length && !p; i++) { n = campos[i]; v = String(n.value == null ? '' : n.value).replace(/\\s+/g, ' ').trim(); if (v !== '' && visible(n) && esImporte(v)) p = true; }
  var hs = document.querySelectorAll('h1,h2,h3,h4,h5,h6,legend,th,caption,[role=heading]');
  for (i = 0; i < hs.length && !t; i++) { n = hs[i]; if (visible(n) && reTitulo.test(plano(txt(n)))) t = true; }
  return { p: p, t: t };
}`

/**
 * VIVO, en TODOS los marcos de la página (revisión de seguridad 28/10/2026), justo antes del clic de un avance por id:
 *   · `precio`: algún importe visible (texto de un nodo, hoja o no: «123,45 <span>€</span>» cuenta; o el valor de un input/output
 *     de solo lectura con forma de importe);
 *   · `titulo`: algún encabezado visible (h1-h6, legend, th, caption, role=heading) que case con `nuncaConTitulo` (texto plano).
 * Un marco que no se puede leer cuenta como las dos cosas (fail-closed). Solo lee: nunca sale ningún texto ni valor.
 */
async function vigilanciaVivaAvancePorId(page: Page, nuncaConTitulo: RegExp): Promise<{ precio: boolean; titulo: boolean }> {
  let precio = false
  let titulo = false
  for (const f of marcosVivos(page)) {
    // Como TEXTO (no función): tsx envuelve las funciones con nombre en `__name`, que no existe en la página.
    const r = await (f.evaluate(`(${VIGILANCIA_AVANCE_ID})(${JSON.stringify(nuncaConTitulo.source)})`) as Promise<{ p: boolean; t: boolean }>)
      .then((x) => (x && typeof x.p === 'boolean' && typeof x.t === 'boolean' ? x : { p: true, t: true }))
      .catch(() => ({ p: true, t: true }))
    precio ||= r.p
    titulo ||= r.t
  }
  return { precio, titulo }
}

/**
 * 0.3.17: VIVO, ¿es `boton` el ÚNICO control del marco cuyo texto (o aria-label/value) normalizado casa con `fuente` (el patrón de la regla,
 * sobre texto plano: sin tildes, minúsculas)? Cuenta hojas (un contenedor que solo envuelve a otro con el mismo texto no suma) y también
 * los ocultos (fail-closed). Solo lee; como TEXTO (tsx envuelve las funciones con nombre en `__name`, que no existe en la página).
 */
async function esUnicoPorTextoVivo(boton: Locator, fuente: string): Promise<boolean> {
  return boton
    .evaluate(
      (el, src) => {
        const re = new RegExp(src)
        const todos = Array.from(el.ownerDocument.querySelectorAll('a,button,input,td,th,div,span,li,label,p,[role=button],[role=link],[role=menuitem],[onclick]'))
        const casan = todos.filter((n) =>
          (n.tagName === 'INPUT' ? [(n as HTMLInputElement).value, n.getAttribute('aria-label')] : [n.textContent, n.getAttribute('aria-label')]).some((x) =>
            re.test(String(x == null ? '' : x).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()),
          ),
        )
        const hojas = casan.filter((n) => !casan.some((m) => m !== n && n.contains(m)))
        return hojas.length === 1 && (hojas[0] === el || el.contains(hojas[0]) || hojas[0].contains(el))
      },
      fuente,
    )
    .catch(() => false)
}

/**
 * 0.3.18: VIVO, todo lo que el inventario afirmó del `<input type=submit>` sin rótulo (regla {@link AvanceSinTexto}) y que aquí se repite sobre
 * el DOM de verdad: es un input submit sin value/aria-label/title/texto/alt (0.3.20: o con un rótulo de avance NEUTRO exacto,
 * `rotuloNeutroSinTexto`), sin onclick/formaction/ng-click, con `name` y clases de la regla
 * (el `name` entero, no el recortado del inventario), en el ORIGEN exacto y con la ruta de la regla, y es el ÚNICO así de su documento.
 * Devuelve la causa (sin valores del portal) o `null`. Solo lee. Evalúa con funciones ANÓNIMAS (tsx envuelve las con nombre en `__name`).
 */
async function causaNoEsAvanceSinTextoVivo(boton: Locator, a: AvanceSinTexto): Promise<string | null> {
  const r = await boton
    .evaluate(
      (el, cfg) => {
        const d = el.ownerDocument
        const submit = el.tagName === 'INPUT' && (el.getAttribute('type') ?? '').toLowerCase() === 'submit'
        const rotulos = [(el as HTMLInputElement).value, (el.getAttribute('aria-label') ?? ''), (el.getAttribute('title') ?? ''), (el.getAttribute('alt') ?? ''), (el as HTMLElement).innerText, el.textContent]
        // 0.3.19: el onclick va APARTE (solo vale el de la forma cerrada de la regla, comprobado fuera con `onclickCasaFormaSinTexto`).
        const manejadores = [(el.getAttribute('formaction') ?? ''), (el.getAttribute('ng-click') ?? ''), (el.getAttribute('data-ng-click') ?? ''), (el.getAttribute('onmousedown') ?? ''), (el.getAttribute('onmouseup') ?? ''),
          (el.getAttribute('onpointerdown') ?? ''), (el.getAttribute('onpointerup') ?? ''),
          // Revisión adversarial: `form`/`formmethod`/`formtarget`/`formenctype` desvían el envío a OTRO formulario o lo cambian (el destino
          // abierto en la red es el del `closest('form')`): fuera. 0.3.19: también `formnovalidate` (presencia, aunque vacío).
          (el.getAttribute('form') ?? ''), (el.getAttribute('formmethod') ?? ''), (el.getAttribute('formtarget') ?? ''), (el.getAttribute('formenctype') ?? ''), el.hasAttribute('formnovalidate') ? 'x' : '']
        const name = (el.getAttribute('name') ?? '')
        const id = el.id ?? ''
        const clases = (el.getAttribute('class') ?? '').split(/\s+/)
        const iguales = Array.from(d.querySelectorAll('input')).filter(
          (n) => (n.getAttribute('type') ?? '').toLowerCase() === 'submit' && (n.getAttribute('name') ?? '').startsWith(cfg.prefijoName) && (n.getAttribute('name') ?? '').includes(cfg.contieneName) && cfg.clase.every((t) => (n.getAttribute('class') ?? '').split(/\s+/).includes(t)),
        ).length
        return {
          submit,
          // 0.3.20: los rótulos vivos salen (solo para decidir aquí, en Node; nunca a un mensaje): vale vacío o uno NEUTRO de la lista cerrada.
          rotulos: rotulos.map((x) => String(x ?? '')),
          conManejador: manejadores.some((x) => x.trim() !== ''),
          onclick: el.getAttribute('onclick') ?? '',
          name,
          id,
          clase: cfg.clase.every((t) => clases.includes(t)),
          origen: d.location.origin,
          ruta: d.location.pathname,
          iguales,
        }
      },
      { prefijoName: a.prefijoName, contieneName: a.contieneName, clase: [...a.clase] },
    )
    .catch(() => null)
  if (!r) return 'no_se_pudo_leer'
  if (!r.submit) return 'no_es_input_submit'
  // 0.3.20 (Fidelidade real, e0e482d1…): el `value` vivo («Siguiente»…) que el inventario no ve. Cualquier rótulo fuera de la lista cerrada
  // de avance neutro (o que case una acción final) sigue siendo `con_rotulo`.
  if (!Array.isArray(r.rotulos) || !r.rotulos.every((x) => rotuloNeutroSinTexto(x, a.textoAccionFinal))) return 'con_rotulo'
  if (r.conManejador) return 'con_manejador'
  if (!/^[A-Za-z0-9_$.:-]{1,300}$/.test(r.name) || !r.name.startsWith(a.prefijoName) || !r.name.includes(a.contieneName)) return 'name_distinto'
  // 0.3.19: un onclick VIVO solo con la forma cerrada de la regla y con B === el name VIVO ENTERO; sin `onclickForma`, ninguno (0.3.18).
  if (r.onclick.trim() !== '' && (a.onclickForma === undefined || !onclickCasaFormaSinTexto(a, r.onclick, r.name, { nameExacto: true }))) return a.onclickForma === undefined ? 'con_manejador' : 'onclick_fuera_de_forma'
  if (!r.clase) return 'clase_distinta'
  // OutSystems pone el nombre del widget al final del name/id (`…$wtBtnContratar`): la MISMA expresión que el módulo, sobre lo VIVO.
  if ([r.name, r.id].some((v) => typeof v === 'string' && RE_NAME_ACCION_FINAL_SIN_TEXTO.test(v.toLowerCase()))) return 'name_de_accion_final'
  if (r.origen !== a.origen) return 'origen_distinto'
  // 0.3.22: ruta EXACTA de la lista cerrada de pantallas de la simulación (antes, una subcadena).
  if (!a.rutas.includes(r.ruta)) return 'ruta_distinta'
  if (r.iguales !== 1) return 'no_unico'
  return null
}

/** Cuerpo de {@link hayTextoAccionFinalVivo} que corre EN EL MARCO (texto: sin `__name`). */
const TEXTO_ACCION_FINAL_VIVO = `function (fuente) {
  var re = new RegExp(fuente);
  var plano = function (t) { return String(t == null ? '' : t).normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/\\s+/g, ' ').trim().toLowerCase(); };
  var partes = [document.body ? document.body.innerText : ''];
  var cs = document.querySelectorAll('input[type=submit],input[type=button],input[type=image],button,a,[role=button],[aria-label],[title]');
  for (var i = 0; i < cs.length; i++) { var n = cs[i]; partes.push(n.value, n.getAttribute('aria-label'), n.getAttribute('title'), n.getAttribute('alt')); }
  for (var j = 0; j < partes.length; j++) { if (re.test(plano(partes[j]))) return true; }
  return false;
}`

/**
 * 0.3.18: VIVO, en TODOS los marcos, ¿hay texto visible (cuerpo, valores/aria/title de controles) de acción final o dato bancario
 * (`textoAccionFinal`: emitir, contratar, confirmar, firmar, pagar, formaliz, IBAN, cuenta…)? Un marco que no se puede leer cuenta como sí (fail-closed).
 */
async function hayTextoAccionFinalVivo(page: Page, fuente: RegExp): Promise<boolean> {
  for (const f of marcosVivos(page)) {
    const r = await (f.evaluate(`(${TEXTO_ACCION_FINAL_VIVO})(${JSON.stringify(fuente.source)})`) as Promise<unknown>).catch(() => true)
    if (r !== false) return true
  }
  return false
}

/**
 * 0.3.18: VIVO, el «Aceptar» sin id con `onclickExacto` (ePAC `eventoSiguienteDialog()`) no lleva NADA más que pueda ejecutar o desviar un
 * envío: es `type=button` (o un control que no envía), sin `formaction`/`form`/`formmethod`/`formtarget`/`formenctype`/`formnovalidate`,
 * sin `onmousedown`/`onmouseup`/`onpointerdown`/`onpointerup`/`ondblclick`/`onkeydown`/`onkeyup`/`onkeypress`/`ng-click`/`data-ng-click`.
 * Solo lee; función ANÓNIMA (tsx envuelve las con nombre en `__name`). Fallo de lectura = no (fail-closed).
 */
async function sinOtrosManejadoresVivo(boton: Locator): Promise<boolean> {
  return boton
    .evaluate((el) => {
      const tag = el.tagName
      const tipo = (el.getAttribute('type') ?? '').toLowerCase()
      if (tag === 'BUTTON' && tipo !== 'button') return false
      if (tag === 'INPUT' && tipo !== 'button') return false
      const attrs = ['formaction', 'form', 'formmethod', 'formtarget', 'formenctype', 'formnovalidate', 'onmousedown', 'onmouseup', 'onpointerdown', 'onpointerup', 'ondblclick', 'onkeydown', 'onkeyup', 'onkeypress', 'ng-click', 'data-ng-click']
      return attrs.every((a) => !el.hasAttribute(a))
    })
    .catch(() => false)
}

/** Tope de avances de PASO por identidad exacta (`AvancePorId`) por trabajo (3, revisión de seguridad 28/10/2026). */
export const MAX_AVANCES_POR_ID = 3

/**
 * AVANCE AUTORIZADO DEL EXPLORADOR IA (Alberto, 13/10/2026: «Aceptar» de Datos básicos → Tarificar, SOLO en exploración;
 * puede quedar un proyecto en ePAC, nunca una póliza). El ÚNICO camino del explorador para pulsar un control que el guard
 * de siempre bloquea por «aceptar». Exige, en este orden y sin atajos:
 *   1. el guard limpio, la ventana de EMISIÓN cerrada y que no se haya usado antes en este trabajo (una vez);
 *   2. que el módulo lo autorice sobre el INVENTARIO del worker (`esAvanceAutorizado`: entrada cerrada, texto exacto, título
 *      de pantalla h1-h6/legend «Datos básicos» y ningún título de tarificación/emisión) y que no tenga otro bloqueo
 *      (`bloqueoAvance`: emitir, contratar, `validar_aceptar`, onclick recortado…);
 *   3. EXACTAMENTE un control vivo, cuyo texto visible sea el del inventario, y que pase `comprobarBoton` con «Aceptar»
 *      permitido (todo lo demás de emisión sigue bloqueado);
 *   4. un formulario de envío conocido (el del control, o el único del marco) del MISMO origen que el marco.
 * Solo entonces abre la ventana de red con ESE único destino (capa a: `parametrosParecenEmision` en query y cuerpo; capa b:
 * todo no-GET a otro sitio se aborta), pulsa UNA vez y espera a que la pantalla cambie. Diálogos: se descartan y cae.
 */
export async function pulsarExploracionAutorizada(
  page: Page,
  guard: GuardEmision,
  boton: Locator,
  aut: { entrada: string; el: ElementoInventario; marco: MarcoInventario },
): Promise<void> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', 'avance de exploración con la ventana de emisión o de guardado abierta')
  const usados = AVANCES_USADOS.get(guard) ?? new Set<string>()
  // Avance por IDENTIDAD EXACTA (28/10/2026, ePAC `#btnAceptar` + `eventoSiguiente()` en `/drvp00/SEAServlet`): es el avance de
  // PASO del asistente, con su propio contador (≤ `MAX_AVANCES_POR_ID`). El «Aceptar» por título sigue siendo UNA vez por trabajo.
  const porId = avancePorIdAutorizado(aut.entrada, aut.el, aut.marco)
  // 0.3.18: el `<input type=submit>` sin rótulo de la simulación de Fidelidade (regla estrecha): mismo tope que el avance por id.
  const sinTexto = porId ? null : avanceSinTextoAutorizado(aut.entrada, aut.el, aut.marco)
  const prefijoId = porId ? `exploracion:id:${porId.id}#` : sinTexto ? 'exploracion:sintexto#' : null
  const usadosPorId = prefijoId ? [...usados].filter((u) => u.startsWith(prefijoId)).length : 0
  if (!porId && !sinTexto && usados.has('exploracion')) throw new EmisionBloqueadaError('fase', 'el avance autorizado de exploración ya se usó en este trabajo')
  if ((porId || sinTexto) && usadosPorId >= MAX_AVANCES_POR_ID) throw new EmisionBloqueadaError('fase', `el avance de paso autorizado de exploración ya se usó ${usadosPorId} veces en este trabajo`)
  await exigirSinCuentaBancaria(page)
  if (!esAvanceAutorizado(aut.entrada, aut.el, aut.marco) || bloqueoAvance(aut.entrada, aut.el, aut.marco) !== null) {
    throw new EmisionBloqueadaError('boton', 'avance de exploración no autorizado para esta entrada y esta pantalla')
  }
  if ((await boton.count()) !== 1) throw new EmisionBloqueadaError('boton', 'avance de exploración: no hay exactamente un control')
  const desc = await descripcion(boton)
  const plano = (t: string | null) => (t ?? '').replace(/\s+/g, ' ').trim()
  if (plano(desc[0]) !== plano(aut.el.texto ?? null)) throw new EmisionBloqueadaError('boton', 'avance de exploración: el control vivo no es el del inventario')
  if (porId) {
    // VIVO: id, onclick y ruta del marco EXACTOS (lo que dijo el inventario puede haber cambiado antes del clic).
    const ruta = rutaDeMarco(await boton.evaluate((el) => el.ownerDocument.location.href).catch(() => null))
    if (porId.sinIdentidad === true) {
      // 0.3.17: sin id ni onclick (ni ng-click) VIVOS, ruta de marco VIVA entre las de la regla y ÚNICO «Aceptar» vivo del marco.
      const vacio = (v: string | null | undefined) => (v ?? '').trim() === ''
      // 0.3.18: con `onclickExacto`, el onclick VIVO tiene que ser exactamente ese (tras trim); sin él, ninguno (0.3.17).
      const onclickVivoOk = porId.onclickExacto === undefined ? onclickNormalizado(desc[7]) === '' : (desc[7] ?? '').trim() === porId.onclickExacto
      if (!vacio(desc[4]) || !onclickVivoOk || !vacio(desc[9]) || !vacio(desc[10]) || !rutaCasaAvancePorId(porId, ruta)) {
        throw new EmisionBloqueadaError('boton', 'avance de exploración: el control vivo no es el avance de paso autorizado (sin id/onclick/marco)')
      }
      if (porId.onclickExacto !== undefined && !(await sinOtrosManejadoresVivo(boton))) {
        throw new EmisionBloqueadaError('boton', 'avance de exploración: el control vivo tiene otros manejadores, atributos form* o envía el formulario (no es el avance de paso autorizado)')
      }
      if (!(await esUnicoPorTextoVivo(boton, porId.texto.source))) {
        throw new EmisionBloqueadaError('boton', 'avance de exploración: el control vivo no es el único con ese texto en el marco')
      }
    } else if (desc[4] !== porId.id || onclickNormalizado(desc[7]) !== porId.onclick || ruta !== porId.rutaMarco) {
      throw new EmisionBloqueadaError('boton', 'avance de exploración: el control vivo no es el avance de paso autorizado (id/onclick/marco)')
    }
    // PRECIO PEGAJOSO + VIVO en TODOS los marcos: un importe visto antes en el trabajo, o a la vista ahora, cierra el avance por id.
    if (PRECIO_VISTO.has(guard)) throw new EmisionBloqueadaError('boton', 'avance de exploración: ya se vio un precio en este trabajo (no se avanza por id)')
    const vivo = await vigilanciaVivaAvancePorId(page, porId.nuncaConTitulo)
    if (vivo.precio) {
      PRECIO_VISTO.add(guard)
      throw new EmisionBloqueadaError('boton', 'avance de exploración: la página ya muestra un precio (no se avanza por id)')
    }
    // Títulos VIVOS de todos los marcos: tarificar, revisión, emisión, contratar, pago, firma, IBAN… → no.
    if (vivo.titulo) throw new EmisionBloqueadaError('boton', 'avance de exploración: un título vivo de la página es de tarificación/emisión (no se avanza por id)')
  } else if (sinTexto) {
    // 0.3.18: VIVO, el control sin rótulo es el de la regla (input submit, name/clase, origen y ruta exactos, sin manejadores, único)…
    const causa = await causaNoEsAvanceSinTextoVivo(boton, sinTexto)
    if (causa) throw new EmisionBloqueadaError('boton', `avance de exploración sin texto: el control vivo no es el autorizado (${causa})`)
    // …sin precio (pegajoso y vivo), sin títulos de emisión/contratación… y sin texto de acción final ni dato bancario en NINGÚN marco.
    if (PRECIO_VISTO.has(guard)) throw new EmisionBloqueadaError('boton', 'avance de exploración: ya se vio un precio en este trabajo (no se avanza sin texto)')
    const vivo = await vigilanciaVivaAvancePorId(page, sinTexto.nuncaConTitulo)
    if (vivo.precio) {
      PRECIO_VISTO.add(guard)
      throw new EmisionBloqueadaError('boton', 'avance de exploración: la página ya muestra un precio (no se avanza sin texto)')
    }
    if (vivo.titulo) throw new EmisionBloqueadaError('boton', 'avance de exploración: un título vivo de la página es de emisión/contratación (no se avanza sin texto)')
    if (await hayTextoAccionFinalVivo(page, sinTexto.textoAccionFinal)) throw new EmisionBloqueadaError('boton', 'avance de exploración: la página muestra texto de acción final o datos bancarios (no se avanza sin texto)')
    comprobarBoton(desc)
  }
  comprobarBoton(desc, { permitirAceptar: true })
  const destino = await boton.evaluate((el) => {
    const d = el.ownerDocument
    const f = el.closest('form') ?? (d.forms.length === 1 ? d.forms[0] : null)
    return f ? { accion: f.action, pagina: d.location.href } : null
  })
  let endpoint: string | null = null
  let extras: string[] = []
  try {
    if (destino) {
      const a = new URL(destino.accion)
      const p = new URL(destino.pagina)
      if ((a.protocol === 'https:' || a.protocol === 'http:') && a.origin === p.origin && !a.username && !a.password) endpoint = `${a.origin}${a.pathname}`
    }
  } catch {
    endpoint = null
  }
  // Avance de PASO por id (real 28/10/2026, ePAC drvp00): `eventoSiguiente()` envía el formulario del servlet, pero el botón no está
  // dentro de un <form> y el marco tiene varios. Su ÚNICO destino conocido es el propio servlet del marco: MISMO origen que el marco
  // (leído vivo) + la ruta EXACTA de la regla (`rutaMarco`, ya comprobada arriba). Nada más se abre; la capa de parámetros sigue.
  if (porId) {
    try {
      const p = new URL(await boton.evaluate((el) => el.ownerDocument.location.href))
      // 0.3.17: en `sinIdentidad` el destino es la ruta VIVA del marco (ya comprobada contra las de la regla).
      const rutaDestino = porId.sinIdentidad === true ? rutaDeMarco(p.href) : porId.rutaMarco
      endpoint = (p.protocol === 'https:' || p.protocol === 'http:') && !p.username && !p.password && rutaDestino && rutaCasaAvancePorId(porId, rutaDestino) ? `${p.origin}${rutaDestino}` : null
      // 0.3.13: destinos POST declarados de la regla (mismo origen, ruta exacta). Sigue la capa de contenido (URL y cuerpo).
      if (endpoint) extras = (porId.destinosPost ?? []).filter((r) => /^\/[A-Za-z0-9_./-]{1,120}$/.test(r) && !r.includes('..')).map((r) => `${p.origin}${r}`)
    } catch {
      endpoint = null
    }
  }
  // 0.3.19: el avance sin texto con onclick (OsAjax de OutSystems hace un POST al propio formulario): su ÚNICO destino (el del formulario, mismo
  // origen y ruta) pasa además la inspección ESTRICTA del cuerpo (`cuerpoLlevaAccionFinal`: acción final, IBAN/cuenta/tarjeta) como extra.
  if (sinTexto && sinTexto.onclickForma !== undefined && endpoint) extras = [endpoint]
  // 0.3.22 (Fidelidade real 29/10/2026, 530656a4…): el formulario de la simulación envía a OTRA pantalla del flujo («Datos Cliente»,
  // `ClientData.aspx`). El destino del avance sin texto tiene que ser una de las rutas de la LISTA CERRADA de la regla (antes: cualquier ruta
  // del mismo origen) y SIN query (la red solo admite destinos exactos sin query: con ella el POST caería después, a medias). Se para ANTES
  // del clic, diciendo solo NOMBRES de clave de la query (nunca valores). Las rutas de la lista entran todas como destinos con inspección
  // ESTRICTA del cuerpo (la respuesta de la simulación lleva a la siguiente pantalla de la lista, que repinta con su propio POST).
  if (sinTexto) {
    let accion: URL | null = null
    try { accion = destino ? new URL(destino.accion) : null } catch { accion = null }
    if (!endpoint || !accion) throw new EmisionBloqueadaError('fase', 'avance de exploración sin texto: sin formulario de envío conocido del mismo origen')
    if (!sinTexto.rutas.includes(accion.pathname)) throw new EmisionBloqueadaError('boton', 'avance de exploración sin texto: el formulario envía a una pantalla fuera de la lista de la simulación')
    if (accion.search !== '') {
      const claves = clavesQueryDiagnostico(accion)
      throw new EmisionBloqueadaError('boton', `avance de exploración sin texto: el formulario envía con query (claves: ${claves || '?'}); solo destinos exactos sin query`)
    }
    const origen = accion.origin
    extras = [...new Set([endpoint, ...sinTexto.rutas.map((r) => `${origen}${r}`)])]
  }
  if (!endpoint) throw new EmisionBloqueadaError('fase', 'avance de exploración: sin formulario de envío conocido del mismo origen')
  // 0.3.19: la ayuda contextual de drvp00 (solo lectura) que la pantalla de destino pide al cargar; SOLO en los avances por id de drvp00.
  const ajaxAvance: readonly AjaxValidacionAvance[] = porId && porId.rutaMarco.startsWith('/drvp00/') ? [AJAX_AYUDA_APLICACIONES_ALLIANZ_DRVP00] : []
  const abrir = ABRIR_AVANCE.get(guard)
  if (!abrir) throw new EmisionBloqueadaError('fase', 'guard sin ventana de avance')
  usados.add(prefijoId ? `${prefijoId}${usadosPorId + 1}` : 'exploracion')
  AVANCES_USADOS.set(guard, usados)
  const hasta = Date.now() + VENTANA_RED_AVANCE_MS
  let dialogo: string | null = null
  const alDialogo = (d: Dialog) => {
    dialogo ??= d.type()
    d.dismiss().catch(() => {})
  }
  page.on('dialog', alDialogo)
  abrir(hasta, [endpoint, ...extras], ajaxAvance)
  try {
    await boton.click()
    // La pantalla cambió cuando el control ya no está (navegación, recarga del marco o re-pintado).
    for (;;) {
      guard.comprobar()
      if (dialogo) throw new EmisionBloqueadaError('fase', `avance de exploración: el portal abrió un diálogo («${dialogo}») y el robot no confirma`)
      if ((await boton.count().catch(() => 0)) === 0) return
      if (Date.now() >= hasta) return
      await page.waitForTimeout(250)
    }
  } finally {
    page.off('dialog', alDialogo)
    guard.avance.cerrar()
  }
}

// ─────────── GUARDAR PRESUPUESTO (explorador, Alberto 13-14/10/2026) ───────────

/** Tope de la ventana de red del guardado: el clic + lo que el portal tarde en guardar y dar el PDF. */
export const VENTANA_RED_GUARDADO_MS = 25_000
/** Pulsaciones de guardado por trabajo: guardar + descargar/imprimir (con margen). */
export const MAX_GUARDADOS_PRESUPUESTO = 3

/** El portal abrió un diálogo (confirm/alert) al guardar: el robot NO confirma. El explorador para (`guardado_con_dialogo`). */
export class GuardadoConDialogoError extends Error {
  readonly tipoDialogo: string
  constructor(tipo: string) {
    super(`guardado de presupuesto: el portal abrió un diálogo («${tipo}») y el robot no confirma`)
    this.name = 'GuardadoConDialogoError'
    this.tipoDialogo = tipo
  }
}

/**
 * GUARDADO DE PRESUPUESTO AUTORIZADO (explorador). El ÚNICO camino para pulsar Grabar/Guardar/Archivar/Descargar/Imprimir/
 * Generar PDF (categoría «guardar presupuesto» de la lista única, acciones-portal.ts). Exige, en este orden y sin atajos:
 *   1. el guard limpio y las ventanas de EMISIÓN y de AVANCE cerradas; como mucho `MAX_GUARDADOS_PRESUPUESTO` por trabajo;
 *   2. que el módulo lo autorice sobre el INVENTARIO (`bloqueoGuardadoPresupuesto`: categoría guardar, NADA de emisión ni
 *      prohibida, pantalla de RESULTADO con importes o tras un guardado previo);
 *   3. EXACTAMENTE un control vivo, con el texto del inventario, que pase `comprobarBoton` con SOLO Archivar abierto
 *      (`permitirGuardarPresupuesto`: emitir, contract, validar_aceptar, «Aceptar», fraccionado… siguen bloqueados)
 *      y que, VIVO, siga clasificando como guardar y no como emisión/prohibida (todo: texto, title, value, href, onclick…);
 * Solo entonces abre la ventana de red (Archivar permitido SOLO hacia el origen del marco del botón; todo no-GET a otro
 * origen se aborta), pulsa UNA vez, espera a `trasClic` (el PDF) y cierra la ventana SIEMPRE. Un diálogo → no se acepta y
 * lanza `GuardadoConDialogoError`. Cualquier otro fallo de las comprobaciones → `EmisionBloqueadaError` SIN pulsar.
 */
export async function pulsarGuardadoPresupuesto(
  page: Page,
  guard: GuardEmision,
  boton: Locator,
  aut: { el: ElementoInventario; pantalla: PantallaGuardado },
  trasClic: () => Promise<void> = async () => undefined,
): Promise<void> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.avance.abierta()) throw new EmisionBloqueadaError('fase', 'guardado de presupuesto con otra ventana de red abierta')
  // Frontera de emisión (14/10/2026): con un campo de cuenta bancaria en pantalla no se pulsa nada, tampoco guardar.
  await exigirSinCuentaBancaria(page)
  const usados = AVANCES_USADOS.get(guard) ?? new Set<string>()
  const n = [...usados].filter((u) => u.startsWith('guardado:')).length
  if (n >= MAX_GUARDADOS_PRESUPUESTO) throw new EmisionBloqueadaError('fase', `guardado de presupuesto: ya se pulsó ${n} veces en este trabajo`)
  const motivo = bloqueoGuardadoPresupuesto(aut.el, aut.pantalla)
  if (motivo) throw new EmisionBloqueadaError('boton', `guardado de presupuesto no autorizado: ${motivo}`)
  if ((await boton.count()) !== 1) throw new EmisionBloqueadaError('boton', 'guardado de presupuesto: no hay exactamente un control')
  const descViva = await descripcion(boton)
  const plano = (t: string | null) => (t ?? '').replace(/\s+/g, ' ').trim()
  if (plano(descViva[0]) !== plano(aut.el.texto ?? null)) throw new EmisionBloqueadaError('boton', 'guardado de presupuesto: el control vivo no es el del inventario')
  // Excepción estrecha de «Proyecto ampliado» (id EMISION_PROJ exacto + texto exacto), sobre el control VIVO (índices: 0 texto, 4 id).
  const desc = descripcionesSinExcepcionProyecto(descViva, descViva[4], descViva[0])
  comprobarBoton(desc, { permitirGuardarPresupuesto: true })
  const cat = clasificarAccionPortal(desc)
  if (cat.emision || cat.prohibida || !cat.guardar) throw new EmisionBloqueadaError('boton', `guardado de presupuesto: el control vivo no es de guardar (${cat.emision ?? cat.prohibida ?? 'otro'})`)
  const origen = await boton.evaluate((el) => el.ownerDocument.location.origin).catch(() => null)
  if (!origen || !/^https?:\/\//.test(origen)) throw new EmisionBloqueadaError('fase', 'guardado de presupuesto: sin origen http(s) conocido')
  const abrir = ABRIR_GUARDADO.get(guard)
  if (!abrir) throw new EmisionBloqueadaError('fase', 'guard sin ventana de guardado')
  usados.add(`guardado:${n + 1}`)
  AVANCES_USADOS.set(guard, usados)
  let dialogo: string | null = null
  const alDialogo = (d: Dialog) => {
    dialogo ??= d.type()
    d.dismiss().catch(() => {})
  }
  page.on('dialog', alDialogo)
  abrir(origen)
  try {
    await boton.click()
    await trasClic()
    guard.comprobar()
    if (dialogo) throw new GuardadoConDialogoError(dialogo)
  } finally {
    page.off('dialog', alDialogo)
    guard.guardado.cerrar()
  }
}

// ─────────── «GUARDAR» DE UN MODAL AUTORIZADO (explorador, Alberto 14/10/2026) ───────────

/**
 * Contenedores de DIÁLOGO/MODAL. El MÁS CERCANO al control (`closest`) es el que da el título; lo usan igual el inventario de
 * exploración (`inventario-dom.ts`, solo LEER) y `pulsarGuardadoDialogoAutorizado` (VIVO). Ampliarlo no abre nada por sí
 * solo: el título del diálogo tiene que ser EXACTAMENTE el de la regla de la entrada.
 */
export const SELECTOR_DIALOGO = 'dialog,[role=dialog],[aria-modal=true],mat-dialog-container,.modal-dialog,.modal'
/** Controles pulsables que se cuentan como CANDIDATOS dentro de un diálogo (los del inventario que tienen texto). */
const SELECTOR_PULSABLES_DIALOGO = 'button,a[role=button],[role=button],[role=tab],td[onclick]'

/** Tope de cierres del diálogo «Atención» del término (ePAC) por trabajo. */
export const MAX_CIERRES_DIALOGO_TERMINO = 3
/** Texto (plano) del diálogo «Atención» de ePAC que propone ALARGAR/AMPLIAR el término (Movilidad Personal, 28/10/2026). */
export const RE_DIALOGO_TERMINO = /(alarg|ampli|prorrog)[a-z]*\b.*\btermino\b/

/**
 * CIERRE DETERMINISTA del diálogo «Atención» de ePAC que pregunta si alargar el término (real 28/10/2026, explorador de Movilidad
 * Personal: la IA quiso pulsar su «Aceptar» `#buttonOkPopup` → `aceptar_no_autorizado`; con «Cancelar» el flujo sigue). Busca en
 * TODOS los marcos un control VISIBLE de texto EXACTO «Cancelar» (o, si no hay ninguno, «×») dentro de un diálogo cuyo título
 * vivo es EXACTAMENTE «Atención» y cuyo texto casa con `RE_DIALOGO_TERMINO`. Exactamente uno; lo pulsa por `pulsar()` (el guard de
 * siempre: nunca un «Aceptar», que además ni se busca). Como mucho `MAX_CIERRES_DIALOGO_TERMINO` por trabajo. `false` = no había.
 */
export async function cerrarDialogoTerminoEpac(page: Page, guard: GuardEmision): Promise<boolean> {
  guard.comprobar()
  const usados = AVANCES_USADOS.get(guard) ?? new Set<string>()
  const hechos = [...usados].filter((u) => u.startsWith('dialogo_termino#')).length
  if (hechos >= MAX_CIERRES_DIALOGO_TERMINO) return false
  const plano = (t: string | null | undefined) => (t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
  for (const exacto of ['cancelar', '×']) {
    const candidatos: Locator[] = []
    for (const f of marcosVivos(page)) {
      const l = f.locator('button,[role=button],a,input[type=button]')
      const n = await l.count().catch(() => 0)
      for (let i = 0; i < n; i++) {
        const c = l.nth(i)
        if (!(await c.isVisible().catch(() => false))) continue
        const d = await c.evaluate((e) => ({ t: (e as HTMLElement).innerText || (e as HTMLInputElement).value || e.textContent || '', a: e.getAttribute('aria-label') })).catch(() => null)
        if (!d || plano(d.t) !== exacto) continue
        const titulo = await c.evaluate(tituloDialogoVivo, SELECTOR_DIALOGO).catch(() => null)
        if (plano(titulo) !== 'atencion') continue
        const texto = await c.evaluate((e, sel) => { const dl = e.closest(sel) as HTMLElement | null; return dl ? (dl.innerText || dl.textContent || '') : '' }, SELECTOR_DIALOGO).catch(() => '')
        if (!RE_DIALOGO_TERMINO.test(plano(texto))) continue
        candidatos.push(c)
      }
    }
    if (candidatos.length === 0) continue
    if (candidatos.length > 1) throw new EmisionBloqueadaError('boton', `diálogo «Atención» del término: ${candidatos.length} controles «${exacto}» (ambiguo, no se pulsa)`)
    usados.add(`dialogo_termino#${hechos + 1}`)
    AVANCES_USADOS.set(guard, usados)
    await pulsar(candidatos[0]!, guard)
    return true
  }
  return false
}

/**
 * RADIO OCULTO DE UNA ETIQUETA (`controlOcultoDeEtiqueta`; vive aquí porque solo guard.ts nombra radios: lo usan el inventario de
 * exploración y la relectura VIVA del explorador). Detalle (28/10/2026, Allianz ePAC `/drvp00/SEAServlet`, «Figuras Intervinientes»): los radios «Es el
 * Propietario: Si/No» son `<input type=radio>` OCULTOS (estilizados) y lo que se ve es su `<label>` (id `<x>_label`). El input no
 * sale en el inventario (oculto) y la etiqueta salía como `label`, que `marcar` rechaza. Esta función, PURA de DOM y sin funciones
 * con nombre dentro (va a la página con `toString()`, como `tituloDialogoVivo`), resuelve el input asociado: por `for`
 * (`label.control`) o, si no, por el id `<x>_label` → `#<x>`. Solo si es un RADIO y NO se inventaría por sí mismo (oculto: si se
 * ve, ya sale como input y no se duplica). Un checkbox → `null` (su etiqueta sigue siendo `label` y `marcar` la rechaza). Solo
 * lee (nunca `.value`; `marcado` es el booleano `checked`).
 */
export const controlOcultoDeEtiqueta = (el: Element): { id: string | null; name: string | null; type: string; ariaLabel: string | null; formControlName: string | null; requerido: boolean; deshabilitado: boolean; marcado: boolean } | null => {
  if (el.tagName !== 'LABEL') return null
  const l = el as HTMLLabelElement
  let c: Element | null = l.control ?? null
  if (!c && l.id && /_label$/.test(l.id)) c = l.ownerDocument.getElementById(l.id.slice(0, -'_label'.length))
  if (!c || c.tagName !== 'INPUT' || String((c as HTMLInputElement).type).toLowerCase() !== 'radio') return null
  const r = c as HTMLInputElement
  const cs = getComputedStyle(r)
  const b = r.getBoundingClientRect()
  const oculto = cs.display === 'none' || cs.visibility === 'hidden' || (b.width === 0 && b.height === 0 && !(r.labels && r.labels.length > 0))
  if (!oculto) return null
  return {
    id: r.id || null,
    name: r.getAttribute('name'),
    type: 'radio',
    ariaLabel: r.getAttribute('aria-label'),
    formControlName: r.getAttribute('formcontrolname'),
    requerido: r.hasAttribute('required') || r.getAttribute('aria-required') === 'true',
    deshabilitado: r.disabled === true || r.getAttribute('aria-disabled') === 'true',
    marcado: r.checked === true,
  }
}

/**
 * Título accesible del diálogo más cercano que contiene a `el` (aria-labelledby → aria-label → primer encabezado del
 * diálogo), o `null` si no está en ninguno o no tiene título. Corre EN LA PÁGINA: sin funciones con nombre dentro (tsx les
 * mete `__name`) ni variables de fuera (el selector va por argumento). El inventario la incrusta por su `toString()`.
 */
export const tituloDialogoVivo = (el: Element, sel: string): string | null => {
  const c = el.closest(sel) as HTMLElement | null
  if (!c) return null
  let t: string | null = null
  const ids = (c.getAttribute('aria-labelledby') || '').split(/\s+/).filter((x) => x !== '')
  if (ids.length > 0) {
    t = ids.map((id) => {
      const x = c.ownerDocument.getElementById(id) as HTMLElement | null
      return x ? (x.innerText || x.textContent || '') : ''
    }).join(' ')
  }
  if (!t || !t.trim()) t = c.getAttribute('aria-label')
  if (!t || !t.trim()) {
    const h = c.querySelector('h1,h2,h3,h4,h5,h6,[role=heading],.modal-title,[mat-dialog-title],.mat-dialog-title,.mat-mdc-dialog-title') as HTMLElement | null
    t = h ? (h.innerText || h.textContent || '') : null
  }
  if (!t) return null
  const limpio = String(t).replace(/\s+/g, ' ').trim().slice(0, 200)
  return limpio || null
}

/** Por qué no se pulsó un «Guardar» de modal (sin pulsar: fail-closed; el explorador lo cierra como `guard_emision`). */
export type MotivoGuardadoDialogo =
  | 'ventana_abierta'
  | 'tope'
  | 'no_autorizado'
  | 'no_unico'
  | 'no_visible'
  | 'no_es_el_del_inventario'
  | 'fuera_de_dialogo'
  | 'titulo_no_casa'
  | 'candidatos'
  | 'emision'
  | 'dialogo_del_portal'

export class GuardadoDialogoBloqueadoError extends EmisionBloqueadaError {
  readonly motivo: MotivoGuardadoDialogo
  constructor(motivo: MotivoGuardadoDialogo, detalle = '') {
    super('fase', `guardado en diálogo: ${motivo}${detalle ? ` (${detalle})` : ''}`)
    this.name = 'GuardadoDialogoBloqueadoError'
    this.motivo = motivo
  }
}

/**
 * «GUARDAR» DE UN MODAL AUTORIZADO POR ENTRADA (explorador; hoy solo Occident Hogar, modal «Datos de la situación», que
 * guarda la dirección del riesgo y NO emite). El ÚNICO camino para pulsar un botón de la categoría «guardar» FUERA de la
 * pantalla de resultado. Exige, en este orden y sin atajos:
 *   1. el guard limpio y TODAS las ventanas de red cerradas (emisión, avance, guardado); como mucho `MAX_GUARDADOS_DIALOGO`;
 *   2. ningún campo de cuenta bancaria en pantalla (frontera de emisión);
 *   3. que el módulo lo autorice sobre el INVENTARIO (`esGuardadoEnDialogoAutorizado`: entrada con la regla, texto y título
 *      del diálogo EXACTOS, nada de emisión/prohibida) y que `bloqueoAvance` no tenga otro motivo;
 *   4. EXACTAMENTE un control vivo, visible, con el texto del inventario, DENTRO de un diálogo cuyo título VIVO casa con la
 *      regla; y en TODOS los marcos, exactamente UN candidato así (ni 0 ni 2);
 *   5. `comprobarBoton` SIN permisos (ni «Aceptar» ni Archivar/store) y la lista única sin emisión ni prohibida.
 * NO abre ninguna ventana de red: el guard sigue abortando cualquier navegación/POST con forma de emisión. Pulsa UNA vez y
 * espera a que el control desaparezca (el modal se cierra). Un diálogo del navegador (confirm/alert) → se descarta y cae.
 */
export async function pulsarGuardadoDialogoAutorizado(
  page: Page,
  guard: GuardEmision,
  boton: Locator,
  aut: { entrada: string; el: ElementoInventario; marco: MarcoInventario },
): Promise<void> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new GuardadoDialogoBloqueadoError('ventana_abierta')
  const usados = AVANCES_USADOS.get(guard) ?? new Set<string>()
  const n = [...usados].filter((u) => u.startsWith('dialogo:')).length
  if (n >= MAX_GUARDADOS_DIALOGO) throw new GuardadoDialogoBloqueadoError('tope', `${n} pulsaciones`)
  await exigirSinCuentaBancaria(page)
  if (!esGuardadoEnDialogoAutorizado(aut.entrada, aut.el) || bloqueoAvance(aut.entrada, aut.el, aut.marco) !== null) {
    throw new GuardadoDialogoBloqueadoError('no_autorizado')
  }
  if ((await boton.count()) !== 1) throw new GuardadoDialogoBloqueadoError('no_unico')
  if (!(await boton.isVisible())) throw new GuardadoDialogoBloqueadoError('no_visible')
  const desc = await descripcion(boton)
  const plano = (t: string | null | undefined) => (t ?? '').replace(/\s+/g, ' ').trim()
  if (plano(desc[0]) !== plano(aut.el.texto)) throw new GuardadoDialogoBloqueadoError('no_es_el_del_inventario')
  const titulo = await boton.evaluate(tituloDialogoVivo, SELECTOR_DIALOGO)
  if (titulo === null) throw new GuardadoDialogoBloqueadoError('fuera_de_dialogo')
  if (!casaGuardadoEnDialogo(aut.entrada, desc[0], titulo)) throw new GuardadoDialogoBloqueadoError('titulo_no_casa')
  if (typeof desc[1] === 'string' && desc[1].trim() !== '' && !casaGuardadoEnDialogo(aut.entrada, desc[1], titulo)) throw new GuardadoDialogoBloqueadoError('no_es_el_del_inventario', 'aria-label')
  // Candidatos en TODOS los marcos: controles visibles dentro de un diálogo, con texto y título que casan con la regla.
  let candidatos = 0
  for (const f of marcosVivos(page)) {
    const l = f.locator(`:is(${SELECTOR_DIALOGO}) :is(${SELECTOR_PULSABLES_DIALOGO})`)
    const total = await l.count().catch(() => 0)
    for (let i = 0; i < total; i++) {
      const c = l.nth(i)
      if (!(await c.isVisible().catch(() => false))) continue
      const texto = await c.evaluate((e) => (e as HTMLElement).innerText ?? e.textContent ?? '').catch(() => null)
      const t = await c.evaluate(tituloDialogoVivo, SELECTOR_DIALOGO).catch(() => null)
      if (casaGuardadoEnDialogo(aut.entrada, texto, t)) candidatos++
    }
  }
  if (candidatos !== 1) throw new GuardadoDialogoBloqueadoError('candidatos', String(candidatos))
  // Sin permisos: «Aceptar», Archivar/store, emitir, contract, validar_aceptar… siguen bloqueados en TODA la descripción viva.
  comprobarBoton(desc)
  const cat = clasificarAccionPortal(desc)
  if (cat.emision || cat.prohibida) throw new GuardadoDialogoBloqueadoError('emision', cat.emision ?? cat.prohibida ?? '')
  usados.add(`dialogo:${n + 1}`)
  AVANCES_USADOS.set(guard, usados)
  let dialogo: string | null = null
  const alDialogo = (d: Dialog) => {
    dialogo ??= d.type()
    d.dismiss().catch(() => {})
  }
  page.on('dialog', alDialogo)
  const hasta = Date.now() + 10_000
  try {
    await boton.click()
    for (;;) {
      guard.comprobar()
      if (dialogo) throw new GuardadoDialogoBloqueadoError('dialogo_del_portal', dialogo)
      if ((await boton.count().catch(() => 0)) === 0 || !(await boton.isVisible().catch(() => false))) return
      if (Date.now() >= hasta) return
      await page.waitForTimeout(250)
    }
  } finally {
    page.off('dialog', alDialogo)
  }
}

// ─────────── OPCIONES DEL RIESGO de Allianz HOGAR (adaptador de tarificación, 14/10/2026) ───────────

/**
 * Etiquetas EXACTAS de los radios de la pantalla 1 «Vivienda» de Allianz HOGAR (exploraciones IA del 13-14/10/2026): madera,
 * tipo de vivienda, régimen y uso. Son DATOS DEL RIESGO, no modalidades ni avances: marcarlos no tarifica, no guarda ni emite.
 * LISTA CERRADA: una etiqueta fuera de aquí no se marca nunca. La de planta baja llegó recortada en el inventario («…del sue…»)
 * y se completa con «suelo»: si en real no casa EXACTA, el robot para (hueco), no elige «la más parecida».
 */
export const OPCIONES_RIESGO_HOGAR_ALLIANZ: readonly string[] = Object.freeze([
  'Sin madera', 'Con madera',
  'Piso en alto', 'Unifamiliar Adosada / Pareada', 'Planta Baja o piso con ventanas a menos de 3 metros del suelo', 'Ático', 'Unifamiliar Independiente',
  'Propietario', 'Inquilino',
  'Habitual', 'Alquiler', 'Secundaria', 'Turístico o vacacional',
])
/** Origen y ruta de la app Angular de Allianz HOGAR en el iframe `appArea` (vistos en las exploraciones). */
export const ORIGEN_APP_HOGAR_ALLIANZ = 'https://cloud.e-pacallianz.com'
const RE_RUTA_APP_HOGAR_ALLIANZ = /^\/ngx-allianzhogar\d*\//

/** Sin mayúsculas, tildes ni espacios sobrantes. Pura. */
function planoOpcion(t: string | null | undefined): string {
  return (t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

/**
 * ¿La etiqueta leída es EXACTAMENTE la esperada? Solo tolera mayúsculas/tildes/espacios y la etiqueta DUPLICADA de los toggles
 * de ePAC («Propietario Propietario»: icono + texto). Nunca «contiene». Pura.
 */
export function etiquetaOpcionHogarCasa(leida: string | null | undefined, esperada: string): boolean {
  const l = planoOpcion(leida)
  const e = planoOpcion(esperada)
  return l !== '' && (l === e || l === `${e} ${e}`)
}

/** ¿Es `url` la app de Allianz HOGAR? Origen EXACTO + ruta `/ngx-allianzhogar…/`. Pura. */
export function esAppHogarAllianz(url: string): boolean {
  try {
    const u = new URL(url)
    return u.origin === ORIGEN_APP_HOGAR_ALLIANZ && RE_RUTA_APP_HOGAR_ALLIANZ.test(u.pathname)
  } catch {
    return false
  }
}

/** Resultado de marcar una opción del riesgo. `no_unica`/`no_quedo` son HUECOS de mapa (el adaptador para con inventario). */
export type ResultadoOpcionHogar = { estado: 'ya_marcada' | 'marcada' } | { estado: 'no_unica'; coincidencias: number } | { estado: 'no_quedo'; caja?: string }


/**
 * Marca UNA opción del riesgo de Allianz HOGAR (el ÚNICO camino del adaptador para tocar un radio). Exige, en orden:
 *   1. guard limpio y TODAS las ventanas de red cerradas; la etiqueta en `OPCIONES_RIESGO_HOGAR_ALLIANZ` (lista cerrada);
 *   2. el marco vivo y de la app de Hogar (`esAppHogarAllianz`); ningún campo de cuenta bancaria en pantalla;
 *   3. EXACTAMENTE un radio del marco cuya etiqueta casa EXACTA (si ya está marcado, no se pulsa nada);
 *   4. su `<label for>` único; `comprobarBoton` sobre el control y sobre la etiqueta (sin permisos: nada de Aceptar,
 *      Archivar, emitir…) ANTES del único clic; después, que quede marcado.
 * No abre ventanas de red: cualquier navegación/POST con forma de emisión sigue abortando.
 */
export async function marcarOpcionRiesgoHogarAllianz(marco: Frame, guard: GuardEmision, etiqueta: string): Promise<ResultadoOpcionHogar> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', 'opción del riesgo de hogar con una ventana de red abierta')
  if (!OPCIONES_RIESGO_HOGAR_ALLIANZ.includes(etiqueta)) throw new EmisionBloqueadaError('boton', `opción del riesgo de hogar fuera de la lista cerrada: «${etiqueta.slice(0, 80)}»`)
  if (marco.isDetached() || !esAppHogarAllianz(marco.url())) throw new EmisionBloqueadaError('fase', 'opción del riesgo de hogar fuera de la app de Allianz HOGAR')
  await exigirSinCuentaBancaria(marco.page())
  const todos = await marco.locator('input[type=radio]').evaluateAll((els) =>
    els.map((el) => {
      const h = el as HTMLInputElement
      return { id: h.id || null, etiqueta: h.labels && h.labels.length ? Array.from(h.labels).map((l) => l.innerText || l.textContent || '').join(' ') : '' }
    }),
  )
  const hits = todos.filter((r) => etiquetaOpcionHogarCasa(r.etiqueta, etiqueta))
  if (hits.length !== 1 || !hits[0].id) return { estado: 'no_unica', coincidencias: hits.length }
  const id = hits[0].id.replace(/["\\]/g, '')
  const control = marco.locator(`input[type=radio][id="${id}"]`)
  if ((await control.count()) !== 1) return { estado: 'no_unica', coincidencias: await control.count() }
  if (await control.isChecked()) return { estado: 'ya_marcada' }
  const label = marco.locator(`label[for="${id}"]`)
  if ((await label.count()) !== 1) return { estado: 'no_unica', coincidencias: await label.count() }
  const descControl = await control.evaluate((el) => {
    const h = el as HTMLInputElement
    return [h.id || null, h.name || null, h.getAttribute('onclick'), h.getAttribute('onchange'), h.getAttribute('aria-label'), h.getAttribute('formaction')]
  })
  comprobarBoton(descControl)
  const desc = await descripcion(label)
  comprobarBoton(desc)
  // 0.1.4: el label puede no ser clicable (vio «not visible» 30 s): PLAN B sobre el MISMO input radio ya resuelto y comprobado.
  try {
    await label.scrollIntoViewIfNeeded({ timeout: 2_000 }).catch(() => undefined)
    await label.click({ timeout: 5_000 })
  } catch {
    await control.check({ force: true, timeout: 5_000 }).catch(() => undefined)
    if (!(await control.isChecked().catch(() => false))) await control.evaluate((el) => (el as HTMLInputElement).click()).catch(() => undefined)
  }
  guard.comprobar()
  if (await control.isChecked().catch(() => false)) return { estado: 'marcada' }
  const bb = await label.boundingBox({ timeout: 1_000 }).catch(() => null)
  return { estado: 'no_quedo', caja: bb ? `boundingBox label x=${Math.round(bb.x)} y=${Math.round(bb.y)} w=${Math.round(bb.width)} h=${Math.round(bb.height)}` : 'boundingBox label: null (sin caja visible)' }
}

/**
 * Marca un radio de Allianz HOGAR a partir de su ETIQUETA ya resuelta por la capa común (aprendido, IA o elección humana en un
 * atasco) cuando la etiqueta exacta de `OPCIONES_RIESGO_HOGAR_ALLIANZ` no casó. Mismas exigencias que
 * `marcarOpcionRiesgoHogarAllianz` salvo la lista cerrada de textos, que aquí la sustituye lo estructural: la etiqueta es un
 * `<label for>` ÚNICO de ESTE marco (app de Hogar), su control es un `input[type=radio]` único (nunca una casilla ni un botón),
 * `comprobarBoton` sobre ambos antes del único clic (sin permisos: nada de Aceptar, Archivar, emitir…) y que quede marcado.
 */
export async function marcarOpcionResueltaHogarAllianz(marco: Frame, guard: GuardEmision, etiqueta: Locator): Promise<ResultadoOpcionHogar> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', 'opción del riesgo de hogar con una ventana de red abierta')
  if (marco.isDetached() || !esAppHogarAllianz(marco.url())) throw new EmisionBloqueadaError('fase', 'opción del riesgo de hogar fuera de la app de Allianz HOGAR')
  await exigirSinCuentaBancaria(marco.page())
  const n = await etiqueta.count()
  if (n !== 1) return { estado: 'no_unica', coincidencias: n }
  const h = await etiqueta.elementHandle()
  if (!h || (await h.ownerFrame()) !== marco) throw new EmisionBloqueadaError('fase', 'opción del riesgo de hogar: la etiqueta no es de este marco')
  const leida = await etiqueta.evaluate((el) => ({ tag: el.tagName, para: el.getAttribute('for') }))
  if (leida.tag !== 'LABEL' || !leida.para) return { estado: 'no_unica', coincidencias: 0 }
  const id = leida.para.replace(/["\\]/g, '')
  const control = marco.locator(`input[type=radio][id="${id}"]`)
  const nc = await control.count()
  if (nc !== 1) return { estado: 'no_unica', coincidencias: nc }
  if (await control.isChecked()) return { estado: 'ya_marcada' }
  comprobarBoton(await control.evaluate((el) => {
    const r = el as HTMLInputElement
    return [r.id || null, r.name || null, r.getAttribute('onclick'), r.getAttribute('onchange'), r.getAttribute('aria-label'), r.getAttribute('formaction')]
  }))
  comprobarBoton(await descripcion(etiqueta))
  // 0.1.4: el label puede no ser clicable (vio «not visible» 30 s): PLAN B sobre el MISMO input radio ya resuelto y comprobado.
  try {
    await etiqueta.scrollIntoViewIfNeeded({ timeout: 2_000 }).catch(() => undefined)
    await etiqueta.click({ timeout: 5_000 })
  } catch {
    await control.check({ force: true, timeout: 5_000 }).catch(() => undefined)
    if (!(await control.isChecked().catch(() => false))) await control.evaluate((el) => (el as HTMLInputElement).click()).catch(() => undefined)
  }
  guard.comprobar()
  if (await control.isChecked().catch(() => false)) return { estado: 'marcada' }
  const bb = await etiqueta.boundingBox({ timeout: 1_000 }).catch(() => null)
  return { estado: 'no_quedo', caja: bb ? `boundingBox label x=${Math.round(bb.x)} y=${Math.round(bb.y)} w=${Math.round(bb.width)} h=${Math.round(bb.height)}` : 'boundingBox label: null (sin caja visible)' }
}

/**
 * 0.1.9 «Valoración de bienes» de Allianz HOGAR: LECTURA de un grupo de opciones (NDBX `nx-radio-group`, Si/No) por el texto EXACTO de
 * su pregunta (`[nxheadline]`) dentro de `ambito`. Solo localiza y lee (el adaptador no puede nombrar radios: guardián de la raíz);
 * marcar sigue siendo SOLO `marcarOpcionResueltaHogarAllianz` (comprobarBoton + label for único + que quede marcado).
 */
export function grupoOpcionesHogarAllianz(marco: Frame, ambito: string, pregunta: string): Locator {
  const exacto = new RegExp(`^\\s*${pregunta.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\\s*$`, 'i')
  return marco.locator(`${ambito} nx-radio-group:visible`).filter({ has: marco.locator('[nxheadline]', { hasText: exacto }) })
}

/** Textos de las opciones MARCADAS del grupo: `checked` o el punto `.nx-radio__dot` de NDBX (el input real no lleva `checked`). Solo lectura. */
export async function opcionesMarcadasHogarAllianz(grupo: Locator): Promise<string[]> {
  return grupo.locator('input[type=radio]').evaluateAll((els) =>
    els
      .filter((el) => {
        const r = el as HTMLInputElement
        const lab = r.labels && r.labels[0]
        return r.checked || !!(lab && lab.querySelector('.nx-radio__dot'))
      })
      .map((el) => {
        const lab = (el as HTMLInputElement).labels?.[0]
        return ((lab && (lab.innerText || lab.textContent)) || '').replace(/\s+/g, ' ').trim()
      }),
  )
}

/** La `<label for>` del grupo cuyo texto es EXACTAMENTE `texto` (para `marcarOpcionResueltaHogarAllianz`). Solo localiza. */
export function etiquetaEnGrupoHogarAllianz(grupo: Locator, texto: string): Locator {
  const exacto = new RegExp(`^\\s*${texto.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\\s*$`, 'i')
  return grupo.locator('label[for]').filter({ hasText: exacto })
}

// ─────────── OPCIONES de Allianz AUTOS Turismos (app Angular `ngx-motor-azs`, 15/10/2026; v0.6.1 del bot) ───────────

/**
 * Opción marcable del asistente de Turismos. `clave` = lo que el adaptador pide (por `ctx.marcarOpcionTurismos`); la puerta la
 * traduce aquí a su ANCLA: `paso` (la pestaña que debe estar seleccionada: otra → bloqueo), `pregunta` (nombre accesible del grupo,
 * etiqueta inmediatamente anterior o, v0.6.5, el `text` del `nx-x-common-header` de SU formulario; `null` = el inventario no da la
 * pregunta) + `grupo`, el conjunto EXACTO y COMPLETO de opciones del grupo. Un grupo con otras opciones (de más o de menos) no es el
 * de la clave → hueco, nunca «el parecido». `interruptor` (v0.6.5): la clave NO es un grupo de opciones sino un interruptor
 * (`role=switch`) con esa etiqueta que debe quedar APAGADO; la puerta solo lo LEE y jamás lo pulsa.
 */
export type OpcionTurismosAllianz = {
  readonly clave: string
  readonly paso: string
  readonly pregunta: string | null
  readonly opcion: string
  readonly grupo: readonly string[]
  readonly interruptor?: true
}

/** Pasos del asistente de Turismos donde la puerta marca algo (HTML real del trabajo 590a330e, 17/10/2026: un `tabpanel` por paso). */
export const PASOS_OPCIONES_TURISMOS_ALLIANZ = Object.freeze({ vehiculo: 'Datos del vehículo', personales: 'Datos personales' } as const)

const opcionTurismos = (clave: string, paso: string, pregunta: string | null, opcion: string, grupo: readonly string[]): OpcionTurismosAllianz =>
  Object.freeze({ clave, paso, pregunta, opcion, grupo: Object.freeze([...grupo]) })
const interruptorApagadoTurismos = (clave: string, paso: string, etiqueta: string): OpcionTurismosAllianz =>
  Object.freeze({ clave, paso, pregunta: null, opcion: etiqueta, grupo: Object.freeze([]), interruptor: true as const })

const GRUPO_SI_NO = ['Sí', 'No']
const GRUPO_GARAJE = ['En la calle', 'En un garaje colectivo', 'En un garaje individual']
const GRUPO_TIPO_TOMADOR = ['Individual', 'Empresa']
const GRUPO_COMPRA = ['Sí, lo he comprado nuevo', 'No, ya lo tenía y quiero cambiar de seguro', 'Sí, lo he comprado de 2ª mano a un particular', 'Sí, lo he comprado de 2ª mano a un concesionario']
const GRUPO_USO = ['Ocasional (fines de semana, vacaciones, etc)', 'A diario y fines de semana', 'Actividad laboral']
const P_VEH = PASOS_OPCIONES_TURISMOS_ALLIANZ.vehiculo
const P_PER = PASOS_OPCIONES_TURISMOS_ALLIANZ.personales

/**
 * LISTA CERRADA de lo que el robot marca en el asistente de Turismos. v0.6.1: consultar por matrícula; garaje «En la calle»;
 * tomador Individual/Empresa. v0.6.2 (15/10/2026, decisión de Alberto: valores «no determinantes» DECLARADOS junto al precio,
 * `supuestosAuto` de module-tarificacion): compra (nuevo / ya lo tenía; la 2ª mano NO: ningún dato la pide), uso, garaje colectivo/individual y segundo
 * conductor «No». v0.6.5 (HTML real del trabajo 590a330e, 17/10/2026): el tomador, «¿Es el tomador de la póliza el propietario?»,
 * «El tomador ¿también conduce el vehículo?» y el «Segundo conductor» NO están en «Datos del vehículo» sino en «Datos personales»
 * (otro `tabpanel`, oculto hasta pulsar «Siguiente»); el segundo conductor es un INTERRUPTOR (`role=switch`, apagado por defecto)
 * que solo se lee. Propietario/conductor: solo «Sí» (el «No» abre los datos de OTRA persona, sin mapa). Todas son preguntas de
 * TARIFICACIÓN (ninguna emite, guarda ni paga). Mismo anclaje que el resto (grupo con el conjunto EXACTO de opciones).
 */
export const OPCIONES_TURISMOS_ALLIANZ: readonly OpcionTurismosAllianz[] = Object.freeze([
  opcionTurismos('conoce_matricula:si', P_VEH, '¿Conoces la matrícula del vehículo?', 'Sí', GRUPO_SI_NO),
  opcionTurismos('garaje:calle', P_VEH, null, 'En la calle', GRUPO_GARAJE),
  opcionTurismos('garaje:colectivo', P_VEH, null, 'En un garaje colectivo', GRUPO_GARAJE),
  opcionTurismos('garaje:individual', P_VEH, null, 'En un garaje individual', GRUPO_GARAJE),
  opcionTurismos('tomador:individual', P_PER, '¿Quién es el tomador?', 'Individual', GRUPO_TIPO_TOMADOR),
  opcionTurismos('tomador:empresa', P_PER, '¿Quién es el tomador?', 'Empresa', GRUPO_TIPO_TOMADOR),
  opcionTurismos('compra:nuevo', P_VEH, null, 'Sí, lo he comprado nuevo', GRUPO_COMPRA),
  opcionTurismos('compra:ya_lo_tenia', P_VEH, null, 'No, ya lo tenía y quiero cambiar de seguro', GRUPO_COMPRA),
  opcionTurismos('uso:ocasional', P_VEH, null, 'Ocasional (fines de semana, vacaciones, etc)', GRUPO_USO),
  opcionTurismos('uso:diario', P_VEH, null, 'A diario y fines de semana', GRUPO_USO),
  opcionTurismos('uso:laboral', P_VEH, null, 'Actividad laboral', GRUPO_USO),
  interruptorApagadoTurismos('segundo_conductor:no', P_PER, 'Segundo conductor'),
  opcionTurismos('tomador_propietario:si', P_PER, '¿Es el tomador de la póliza el propietario?', 'Sí', GRUPO_SI_NO),
  opcionTurismos('tomador_conduce:si', P_PER, 'El tomador ¿también conduce el vehículo?', 'Sí', GRUPO_SI_NO),
])
export const PASO_TURISMOS_ALLIANZ = 'Datos del vehículo'
export const GRUPO_TURISMOS_ALLIANZ = '¿Conoces la matrícula del vehículo?'
/** Origen y ruta de la app Angular de Allianz AUTOS Turismos en el iframe `appArea`. */
export const ORIGEN_APP_TURISMOS_ALLIANZ = 'https://cloud.e-pacallianz.com'
const RE_RUTA_APP_TURISMOS_ALLIANZ = /^\/ngx-motor-azs\//

/**
 * Zona de trabajo de Turismos DENTRO del marco del motor (v0.6.1, prueba real del 15/10/2026: «Matrícula» casaba 2 veces porque la
 * CABECERA de ePac —desplegable de colaborador y buscador «Buscar Aquí...»— también cuenta). El contenedor `#appArea` si el marco lo
 * trae; si no (el marco ES el iframe `appArea`), su `body`. Toda búsqueda por etiqueta/rol del adaptador y las opciones de esta
 * puerta se hacen aquí dentro.
 */
export const SEL_ZONA_APP_TURISMOS = '#appArea:not(iframe):not(frame), body:not(:has(#appArea:not(iframe):not(frame)))'
/** Y además fuera de cualquier cabecera (por si el contenedor no existe y la cabecera vive en el mismo documento). */
export const SEL_FUERA_CABECERA_TURISMOS = ':not(header *):not(nx-header *):not([role=banner] *)'

/** ¿Es `url` la app de Turismos? Origen EXACTO + ruta `/ngx-motor-azs/`. Pura. */
export function esAppTurismosAllianz(url: string): boolean {
  try {
    const u = new URL(url)
    return u.origin === ORIGEN_APP_TURISMOS_ALLIANZ && RE_RUTA_APP_TURISMOS_ALLIANZ.test(u.pathname)
  } catch {
    return false
  }
}

/**
 * ¿Las opciones LEÍDAS de un grupo son EXACTAMENTE las esperadas (mismo número, cada una casa con una distinta; tolera la etiqueta
 * duplicada de los toggles «Individual Individual»)? Pura.
 */
export function grupoOpcionesTurismosCasa(leidas: readonly string[], esperadas: readonly string[]): boolean {
  if (leidas.length !== esperadas.length) return false
  const libres = [...esperadas]
  for (const l of leidas) {
    const i = libres.findIndex((e) => etiquetaOpcionHogarCasa(l, e))
    if (i < 0) return false
    libres.splice(i, 1)
  }
  return true
}

/**
 * v0.6.5: estado de un INTERRUPTOR (`input[type=checkbox][role=switch]`) de Turismos por su etiqueta EXACTA, en la zona `appArea` y
 * fuera de la cabecera. SOLO LECTURA: nunca se pulsa. Uno y apagado → `ya_marcada` (queda en «No»); encendido → `no_quedo` (hueco:
 * no se apaga a ciegas); ninguno o varios → `no_unica`. Solo la llama `marcarOpcionTurismosAllianz` tras sus comprobaciones.
 */
async function leerInterruptorApagadoTurismos(marco: Frame, etiqueta: string): Promise<ResultadoOpcionHogar> {
  const leidos = await marco
    .locator(SEL_ZONA_APP_TURISMOS)
    .locator('input[type=checkbox][role=switch]')
    .and(marco.locator(SEL_FUERA_CABECERA_TURISMOS))
    .evaluateAll((els) =>
      els.map((el) => {
        const h = el as HTMLInputElement
        return { etiqueta: h.labels && h.labels.length ? Array.from(h.labels).map((l) => l.innerText || l.textContent || '').join(' ') : '', encendido: h.checked || h.getAttribute('aria-checked') === 'true' }
      }),
    )
  const hits = leidos.filter((r) => etiquetaOpcionHogarCasa(r.etiqueta, etiqueta))
  if (hits.length !== 1) return { estado: 'no_unica', coincidencias: hits.length }
  return hits[0].encendido ? { estado: 'no_quedo' } : { estado: 'ya_marcada' }
}

/** v0.6.16: nº de opciones marcables (casillas de opción) en el DOM del marco. SOLO LECTURA: no pulsa nada. Fallo de lectura → 0. */
export async function contarOpcionesMarcablesTurismos(marco: Pick<Frame, 'locator'>): Promise<number> {
  return marco.locator('input[type=radio], [role=radio]').count().catch(() => 0)
}

/** Radios de la zona `appArea` (fuera de la cabecera) con su grupo, su etiqueta, las de sus hermanas (orden del DOM) y si están marcados. Solo lectura. */
type RadioTurismosLeido = { id: string | null; marcada: boolean; grupo: string; etiqueta: string; hermanas: string[] }
async function leerRadiosTurismos(marco: Frame): Promise<RadioTurismosLeido[]> {
  return marco
    .locator(SEL_ZONA_APP_TURISMOS)
    .locator('input[type=radio]')
    .and(marco.locator(SEL_FUERA_CABECERA_TURISMOS))
    .evaluateAll((els) =>
      els.map((el) => {
        const h = el as HTMLInputElement
        // Sin funciones con nombre dentro de `evaluate` (tsx les mete `__name`, que no existe en la página).
        const g = h.closest('[role=radiogroup],fieldset,nx-radio-toggle,nx-radio-group')
        const ids = (g?.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean)
        const leg = g?.querySelector('legend') as HTMLElement | null | undefined
        let grupo = [g?.getAttribute('aria-label') ?? '', ...ids.map((i) => { const n = document.getElementById(i); return n ? n.innerText || n.textContent || '' : '' }), leg ? leg.innerText || leg.textContent || '' : ''].join(' ')
        // Sin nombre accesible: la etiqueta INMEDIATAMENTE anterior al grupo (`<label>`/`nx-label`), y nada más lejos.
        const prev = g?.previousElementSibling as HTMLElement | null | undefined
        if (grupo.trim() === '' && prev && /^(LABEL|NX-LABEL)$/.test(prev.tagName)) grupo = prev.innerText || prev.textContent || ''
        // v0.6.5 (HTML real 590a330e): sin nada de lo anterior, la cabecera `nx-x-common-header` HIJA DIRECTA de SU formulario (su `text`).
        if (grupo.trim() === '') {
          const f = g?.closest('form')
          const cab = f ? Array.from(f.children).find((c) => c.tagName === 'NX-X-COMMON-HEADER') : undefined
          if (cab) grupo = cab.getAttribute('text') || (cab as HTMLElement).innerText || cab.textContent || ''
        }
        // Hermanos: los del mismo `name`; sin `name`, los del contenedor de grupo más cercano; sin ninguno de los dos, solo él (no casará).
        const hermanas = (h.name
          ? Array.from(document.querySelectorAll('input[type=radio]')).filter((x) => (x as HTMLInputElement).name === h.name)
          : g
            ? Array.from(g.querySelectorAll('input[type=radio]'))
            : [h]) as HTMLInputElement[]
        return {
          id: h.id || null,
          marcada: h.checked,
          grupo,
          etiqueta: h.labels && h.labels.length ? Array.from(h.labels).map((l) => l.innerText || l.textContent || '').join(' ') : '',
          hermanas: hermanas.map((x) => (x.labels && x.labels.length ? Array.from(x.labels).map((l) => l.innerText || l.textContent || '').join(' ') : '')),
        }
      }),
    )
}

/** Pulsa (por su `<label for>`) el radio de Turismos con ese id: ya marcado → no se toca; `comprobarBoton` sobre control y etiqueta ANTES del único clic. */
async function pulsarRadioTurismos(marco: Frame, guard: GuardEmision, idCrudo: string): Promise<ResultadoOpcionHogar> {
  const id = idCrudo.replace(/["\\]/g, '')
  const control = marco.locator(`input[type=radio][id="${id}"]`)
  if ((await control.count()) !== 1) return { estado: 'no_unica', coincidencias: await control.count() }
  if (await control.isChecked()) return { estado: 'ya_marcada' }
  const label = marco.locator(`label[for="${id}"]`)
  if ((await label.count()) !== 1) return { estado: 'no_unica', coincidencias: await label.count() }
  comprobarBoton(await control.evaluate((el) => {
    const h = el as HTMLInputElement
    return [h.id || null, h.name || null, h.getAttribute('onclick'), h.getAttribute('onchange'), h.getAttribute('aria-label'), h.getAttribute('formaction')]
  }))
  comprobarBoton(await descripcion(label))
  await label.click()
  guard.comprobar()
  return (await control.isChecked()) ? { estado: 'marcada' } : { estado: 'no_quedo' }
}

/**
 * Marca UNA opción del asistente de Turismos (el ÚNICO camino del adaptador para tocar una opción de este tipo).
 * Mismas exigencias que `marcarOpcionRiesgoHogarAllianz`: guard limpio y sin ventanas de red abiertas; `clave` en la lista
 * cerrada; marco vivo y de la app de Turismos; sin campos de cuenta bancaria; pestaña seleccionada = el paso de la clave (todo eso, bloqueo);
 * dentro de la zona `appArea` y fuera de la cabecera, EXACTAMENTE un control cuya etiqueta casa EXACTA, de un grupo con la
 * pregunta de la clave (si la tiene) y con el conjunto COMPLETO de opciones de la clave (si ya está marcado no se pulsa nada);
 * `comprobarBoton` sobre control y etiqueta ANTES del único clic; después, que quede marcado. Grupo no encontrado o ambiguo →
 * `no_unica` (hueco), nunca un bloqueo.
 */
export async function marcarOpcionTurismosAllianz(marco: Frame, guard: GuardEmision, clave: string): Promise<ResultadoOpcionHogar> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', 'opción de Turismos con una ventana de red abierta')
  const op = OPCIONES_TURISMOS_ALLIANZ.find((o) => o.clave === clave)
  if (!op) throw new EmisionBloqueadaError('boton', `opción de Turismos fuera de la lista cerrada: «${clave.slice(0, 80)}»`)
  if (marco.isDetached() || !esAppTurismosAllianz(marco.url())) throw new EmisionBloqueadaError('fase', 'opción de Turismos fuera de la app de Allianz AUTOS')
  await exigirSinCuentaBancaria(marco.page())
  // Anclaje (revisión 15/10/2026; v0.6.5 por clave): pestaña seleccionada = el paso DE LA CLAVE y la opción es de SU grupo. Otro paso → bloqueo.
  const pestanas = marco.getByRole('tab', { selected: true })
  const activa = (await pestanas.count()) === 1 ? (await pestanas.first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim() : ''
  if (activa !== op.paso) throw new EmisionBloqueadaError('fase', `opción de Turismos fuera del paso «${op.paso}»`)
  if (op.interruptor) return leerInterruptorApagadoTurismos(marco, op.opcion)
  const todos = await leerRadiosTurismos(marco)
  const deSuPregunta = (r: { grupo: string }) => op.pregunta === null || planoOpcion(r.grupo) === planoOpcion(op.pregunta)
  const hits = todos.filter((r) => etiquetaOpcionHogarCasa(r.etiqueta, op.opcion) && deSuPregunta(r) && grupoOpcionesTurismosCasa(r.hermanas, op.grupo))
  // Sin su grupo (pregunta u opciones distintas a las del inventario) o con varios candidatos → `no_unica` (hueco de mapa, sin pulsar).
  // `EmisionBloqueadaError` queda para lo prohibido de verdad (clave fuera de la lista, otra app, otro paso, ventana de red abierta).
  if (hits.length !== 1 || !hits[0].id) return { estado: 'no_unica', coincidencias: hits.length }
  return pulsarRadioTurismos(marco, guard, hits[0].id)
}

// ─────────── Preguntas de «Antecedentes» de Allianz AUTOS Turismos (v0.6.10 del bot, 18/10/2026) ───────────
// HTML real del trabajo fdabd09c: tres grupos de opciones que bloquean «SIGUIENTE» si no se contestan:
//   «¿Cuánto tiempo llevas en tu compañía?»: Menos de 1 año | 1 año | 2 años | 3 años | 4 años | 5 años o más
//   «¿Has declarado algún parte culpable con contrario en los últimos 5 años?»: No he declarado ningún parte | 1 parte | 2 partes | 3 partes o más
//   «¿Cuánto tiempo llevas como titular de un seguro de vehículo?»: Menos de 1 año | 1-2 años | 3-4 años | 5-6 años | 7-8 años | 9-10 años o más
// Decisión de Alberto («supuesto favorable»): sin dato del riesgo se elige la opción MÁXIMA (por texto; si no casa, la última del grupo)
// y el adaptador la DECLARA. Con dato, la que casa por texto (si no casa → `no_unica`, hueco: nunca la última). Grupo ausente → no se hace nada.

export const PASO_ANTECEDENTES_TURISMOS = 'Antecedentes'
export type ClaveAntecedenteTurismos = 'compania_tiempo' | 'partes_culpables' | 'titular_tiempo'
type DefAntecedenteTurismos = { readonly pregunta: RegExp; readonly maxima: RegExp; readonly porDato: (n: number) => RegExp | null }
const DEF_ANTECEDENTES_TURISMOS: Readonly<Record<ClaveAntecedenteTurismos, DefAntecedenteTurismos>> = Object.freeze({
  compania_tiempo: {
    pregunta: /tiempo llevas en tu compania/,
    maxima: /^5 anos o mas$/,
    porDato: (n) => (n < 1 ? /^menos de 1 ano$/ : n === 1 ? /^1 ano$/ : n < 5 ? new RegExp(`^${n} anos$`) : /^5 anos o mas$/),
  },
  partes_culpables: {
    pregunta: /parte culpable/,
    maxima: /^no he declarado ningun parte$/,
    porDato: (n) => (n < 1 ? /^no he declarado ningun parte$/ : n === 1 ? /^1 parte$/ : n === 2 ? /^2 partes$/ : /^3 partes o mas$/),
  },
  titular_tiempo: {
    pregunta: /titular de un seguro/,
    maxima: /^9-10 anos o mas$/,
    porDato: () => null,
  },
})
export type ResultadoAntecedenteTurismos =
  /** `ultima`: sin dato y sin casar el texto de la máxima, se pulsó la ÚLTIMA del grupo (`elegida` es su etiqueta REAL). */
  | { estado: 'marcada' | 'ya_marcada'; elegida: string; ultima?: true }
  /** El grupo no está en la pantalla (o no es identificable): no se hace nada. */
  | { estado: 'sin_grupo' }
  /** El portal ya trae una opción marcada en el grupo: no se toca. `marcada` = su etiqueta REAL; `coincide` = hay dato y es esa. */
  | { estado: 'con_valor'; marcada: string; coincide: boolean }
  | { estado: 'no_unica'; motivo: string }
  | { estado: 'no_quedo' }

/**
 * Contesta UNA pregunta de «Antecedentes» de Turismos (el ÚNICO camino para tocarla). Mismas exigencias que `marcarOpcionTurismosAllianz`
 * (guard limpio, sin ventanas de red, marco de la app de Turismos, sin cuenta bancaria, pestaña «Antecedentes»: todo eso, bloqueo) y
 * `comprobarBoton` sobre control y etiqueta ANTES del único clic. El grupo es el de radios hermanos cuyo nombre contiene la pregunta o
 * que trae la opción máxima; `dato` null → la máxima (por texto, si no la última); con `dato` → la que casa por texto.
 */
export async function marcarAntecedenteTurismosAllianz(marco: Frame, guard: GuardEmision, clave: ClaveAntecedenteTurismos, dato: number | null): Promise<ResultadoAntecedenteTurismos> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', 'antecedente de Turismos con una ventana de red abierta')
  const def = DEF_ANTECEDENTES_TURISMOS[clave]
  if (!def) throw new EmisionBloqueadaError('boton', 'antecedente de Turismos fuera de la lista cerrada')
  if (dato !== null && !(Number.isInteger(dato) && dato >= 0)) throw new EmisionBloqueadaError('boton', 'antecedente de Turismos: dato no válido')
  if (marco.isDetached() || !esAppTurismosAllianz(marco.url())) throw new EmisionBloqueadaError('fase', 'antecedente de Turismos fuera de la app de Allianz AUTOS')
  await exigirSinCuentaBancaria(marco.page())
  const pestanas = marco.getByRole('tab', { selected: true })
  const activa = (await pestanas.count()) === 1 ? (await pestanas.first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim() : ''
  if (activa !== PASO_ANTECEDENTES_TURISMOS) throw new EmisionBloqueadaError('fase', `antecedente de Turismos fuera del paso «${PASO_ANTECEDENTES_TURISMOS}»`)
  const todos = await leerRadiosTurismos(marco)
  const clavesGrupo = new Set<string>()
  for (const r of todos) {
    if (r.hermanas.length < 2) continue
    if (def.pregunta.test(planoOpcion(r.grupo)) || r.hermanas.some((h) => def.maxima.test(planoOpcion(h)))) clavesGrupo.add(JSON.stringify(r.hermanas))
  }
  if (clavesGrupo.size === 0) return { estado: 'sin_grupo' }
  if (clavesGrupo.size > 1) return { estado: 'no_unica', motivo: `${clavesGrupo.size} grupos candidatos` }
  const grupo = todos.filter((r) => JSON.stringify(r.hermanas) === [...clavesGrupo][0])
  if (grupo.length < 2 || grupo.some((r) => !r.id)) return { estado: 'no_unica', motivo: 'grupo sin ids' }
  const yaMarcadas = grupo.filter((r) => r.marcada)
  if (yaMarcadas.length > 0) {
    const reDato = dato === null ? null : def.porDato(dato)
    const coincide = reDato !== null && yaMarcadas.length === 1 && reDato.test(planoOpcion(yaMarcadas[0]!.etiqueta))
    return { estado: 'con_valor', marcada: yaMarcadas.map((r) => r.etiqueta.replace(/\s+/g, ' ').trim()).join(' / '), coincide }
  }
  let elegido: RadioTurismosLeido | undefined
  let ultima = false
  if (dato === null) {
    const porTexto = grupo.filter((r) => def.maxima.test(planoOpcion(r.etiqueta)))
    ultima = porTexto.length === 0
    elegido = porTexto.length === 1 ? porTexto[0] : ultima ? grupo[grupo.length - 1] : undefined
  } else {
    const re = def.porDato(dato)
    const porTexto = re ? grupo.filter((r) => re.test(planoOpcion(r.etiqueta))) : []
    elegido = porTexto.length === 1 ? porTexto[0] : undefined
  }
  if (!elegido) return { estado: 'no_unica', motivo: 'ninguna opción casa' }
  const texto = elegido.etiqueta.replace(/\s+/g, ' ').trim()
  comprobarBoton([texto])
  const banco = senalCuentaBancaria([texto])
  if (banco !== null) throw new ErrorFronteraEmision(banco)
  const r = await pulsarRadioTurismos(marco, guard, elegido.id as string)
  if (r.estado === 'marcada' || r.estado === 'ya_marcada') return ultima ? { estado: r.estado, elegida: texto, ultima: true } : { estado: r.estado, elegida: texto }
  return r.estado === 'no_unica' ? { estado: 'no_unica', motivo: `${r.coincidencias} coincidencias` } : { estado: 'no_quedo' }
}

// ─────────── «Cinco últimos dígitos de la póliza actual» de Allianz AUTOS Turismos (v0.6.11 del bot, 19/10/2026) ───────────
// Trabajo real: «Antecedentes» no habilita «SIGUIENTE» porque este `<input nxinput maxlength="5" required>` (aparece cuando hay compañía
// actual) queda vacío. Esta puerta es el ÚNICO camino del adaptador para escribirlo. Dato sensible: ni el valor ni el error de Playwright
// (que lo lleva) salen de aquí.

export const ETIQUETA_POLIZA_ACTUAL_TURISMOS = 'Cinco últimos dígitos de la póliza actual'
const RE_ETIQUETA_POLIZA_ACTUAL_TURISMOS = /^\s*cinco\s+[úu]ltimos\s+d[íi]gitos\s+de\s+la\s+p[óo]liza\s+actual\s*\*?\s*$/i
const MS_APARECE_POLIZA_ACTUAL = 1_200
const MS_TECLEO_POLIZA_ACTUAL = 3_000

export type ResultadoPolizaActualTurismos =
  /** El campo no está en la pantalla (sin compañía actual no se pinta): no se hace nada. */
  | { estado: 'ausente' }
  /** Escrito y releído igual. */
  | { estado: 'escrita' }
  /** El portal ya trae un valor: no se toca (el adaptador lo declara «fijado por Allianz»). */
  | { estado: 'con_valor' }
  /** Hay campo vacío pero no hay dato: nunca se inventa. */
  | { estado: 'sin_dato' }
  | { estado: 'no_unica'; motivo: string }
  | { estado: 'no_quedo' }

/**
 * Escribe los 5 últimos dígitos de la póliza actual en «Antecedentes». Mismas exigencias que el resto de puertas (guard limpio, sin
 * ventanas de red, marco de la app de Turismos, sin cuenta bancaria, pestaña «Antecedentes»: todo eso, bloqueo) y `comprobarBoton`
 * + frontera bancaria sobre el control ANTES de escribir. `ultimos5` debe ser EXACTAMENTE 5 cifras (o `null` = no consta).
 */
export async function polizaActualTurismosAllianz(marco: Frame, guard: GuardEmision, ultimos5: string | null): Promise<ResultadoPolizaActualTurismos> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', 'póliza actual de Turismos con una ventana de red abierta')
  if (ultimos5 !== null && !/^\d{5}$/.test(ultimos5)) throw new EmisionBloqueadaError('boton', 'póliza actual de Turismos: dato no válido')
  if (marco.isDetached() || !esAppTurismosAllianz(marco.url())) throw new EmisionBloqueadaError('fase', 'póliza actual de Turismos fuera de la app de Allianz AUTOS')
  await exigirSinCuentaBancaria(marco.page())
  const pestanas = marco.getByRole('tab', { selected: true })
  const activa = (await pestanas.count()) === 1 ? (await pestanas.first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim() : ''
  if (activa !== PASO_ANTECEDENTES_TURISMOS) throw new EmisionBloqueadaError('fase', `póliza actual de Turismos fuera del paso «${PASO_ANTECEDENTES_TURISMOS}»`)
  // HTML real (4ec62749): `<nx-label><label for="null">…</label></nx-label>` y el input en un HERMANO posterior (`div[nxrow] > div[nxcol] >
  // nx-formfield > input[maxlength=5]`): `getByLabel` no lo ve. Se localiza por ESTRUCTURA: el contenedor con un `nx-label` hijo directo
  // cuyo texto casa, y dentro el `input[maxlength="5"]`. `getByLabel` queda como segundo camino (misma etiqueta con `for` válido).
  // (regex sin barras: `.` = espacio/tilde; un texto que EMPIEZA así y no más largo que la etiqueta real)
  const porEstructura = marco.locator(SEL_ZONA_APP_TURISMOS).locator('*:is(:has(> nx-label:text-matches("^ *cinco.+ltimos.+d.gitos.+de.+la.+p.liza.+actual[ *]*$", "i")), :has(> nx-label *:text-matches("^ *cinco.+ltimos.+d.gitos.+de.+la.+p.liza.+actual[ *]*$", "i"))) input[maxlength="5"]')
  const porEtiqueta = marco.locator(SEL_ZONA_APP_TURISMOS).getByLabel(RE_ETIQUETA_POLIZA_ACTUAL_TURISMOS).and(marco.locator('input'))
  const control = porEstructura
    .or(porEtiqueta)
    .and(marco.locator(SEL_FUERA_CABECERA_TURISMOS))
    .filter({ visible: true })
  // Aparece al elegir la compañía actual: se espera un momento a que Angular lo pinte.
  const fin = Date.now() + MS_APARECE_POLIZA_ACTUAL
  while ((await control.count().catch(() => 0)) === 0 && Date.now() < fin) await marco.page().waitForTimeout(150)
  const n = await control.count().catch(() => 0)
  if (n === 0) return { estado: 'ausente' }
  if (n !== 1) return { estado: 'no_unica', motivo: `${n} campos` }
  comprobarBoton(await descripcion(control))
  await exigirCampoNoBancario(control)
  if ((await control.inputValue().catch(() => '')).trim() !== '') return { estado: 'con_valor' }
  if (ultimos5 === null) return { estado: 'sin_dato' }
  if (!(await control.isEditable().catch(() => false))) return { estado: 'no_unica', motivo: 'campo no editable' }
  try {
    await control.fill(ultimos5, { timeout: MS_TECLEO_POLIZA_ACTUAL })
  } catch {
    return { estado: 'no_quedo' }
  }
  guard.comprobar()
  await control.blur().catch(() => undefined)
  return (await control.inputValue().catch(() => '')).trim() === ultimos5 ? { estado: 'escrita' } : { estado: 'no_quedo' }
}

// ─────────── «Compañía actual del vehículo» de Allianz AUTOS Turismos (v0.6.5 del bot, 17/10/2026) ───────────
// HTML real del trabajo 590a330e: en «Antecedentes», un `nx-dropdown` (role=combobox, `aria-controls` → su panel de opciones) SIN
// etiqueta de texto, dentro del `<form>` cuya cabecera `nx-x-common-header` dice «Compañía actual del vehículo». Las opciones solo
// existen al abrirlo. Esta puerta es el ÚNICO camino del adaptador para abrirlo, leer sus opciones y, como mucho, elegir UNA.

export const PASO_COMPANIA_ACTUAL_TURISMOS = 'Antecedentes'
export const CABECERA_COMPANIA_ACTUAL_TURISMOS = 'Compañía actual del vehículo'
// v0.6.8 (HTML real del trabajo 324ff9db): la cabecera ya NO lleva el atributo `text` ni es hija directa del `<form>` (va dentro de un
// `div[nxlayout=grid]`); su título es el `<h*><span>` interior. Se aceptan las DOS formas; el control sigue siendo EXACTAMENTE uno.
export const SEL_COMPANIA_ACTUAL_TURISMOS = `form:has(> nx-x-common-header[text="${CABECERA_COMPANIA_ACTUAL_TURISMOS}"]) nx-dropdown[role=combobox], form:has(nx-x-common-header :text-is("${CABECERA_COMPANIA_ACTUAL_TURISMOS}")) nx-dropdown[role=combobox]`
const MS_PANEL_COMPANIA = 3_000
const MAX_OPCIONES_COMPANIA = 200

export type ResultadoCompaniaActualTurismos =
  /** Elegida la ÚNICA opción que casa con `buscada`. */
  | { estado: 'elegida'; opciones: string[]; elegida: string; /** La declarada no estaba: se marcó la ÚNICA opción genérica («OTRAS»…); quien llama lo DECLARA. */ generica?: true }
  /** Sin `buscada` (no consta): se abrió, se leyó y se cerró sin elegir. */
  | { estado: 'sin_elegir'; opciones: string[] }
  /** `buscada` no casa con ninguna opción: se cerró sin elegir. */
  | { estado: 'no_casa'; opciones: string[] }
  /** `buscada` casa con VARIAS: nunca se adivina; se cerró sin elegir. */
  | { estado: 'ambigua'; opciones: string[]; coincidencias: number; candidatas: string[] }
  /** El portal ya enseña un valor: no se toca. */
  | { estado: 'con_valor'; opciones: string[] }
  /** Control ausente/repetido, panel que no abre o elección que no quedó. */
  | { estado: 'no_unica'; opciones: string[]; motivo: string }

/**
 * Índices de las opciones que casan con `buscada` (v0.6.9). Primero por clave normalizada IGUAL; si ninguna, por CONTENCIÓN de la clave
 * de la ficha en la de la opción (palabras completas: «DIVINA PASTORA» en «DIVINA PASTORA SEGUROS GENERALES, M.P.S.»). Quien llama solo
 * elige si devuelve EXACTAMENTE un índice; 0 o varios → no se elige. Vacía si `buscada` normaliza a nada. Puro.
 */
export function casarCompaniaActualTurismos(opciones: readonly string[], buscada: string): number[] {
  return indicesCompaniaActualCompuesta(opciones, buscada)
}

/**
 * Abre «Compañía actual del vehículo», LEE sus opciones y elige como mucho UNA (la única que casa con `buscada`), o ninguna.
 * Exige: guard limpio y sin ventanas de red; marco de la app de Turismos; sin campos bancarios; pestaña «Antecedentes» (todo eso,
 * bloqueo); EXACTAMENTE un control bajo esa cabecera, en `appArea` y fuera de la cabecera de ePac; `comprobarBoton` sobre el
 * control y sobre la opción ANTES de pulsarlos. Las opciones son las `[role=option]` del panel de SU `aria-controls` y nada más.
 * Sin elegir → se cierra con Escape. Solo nombres de compañías: ningún dato personal sale de aquí.
 */
export async function companiaActualTurismosAllianz(marco: Frame, guard: GuardEmision, buscada: string | null): Promise<ResultadoCompaniaActualTurismos> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', 'compañía actual de Turismos con una ventana de red abierta')
  if (marco.isDetached() || !esAppTurismosAllianz(marco.url())) throw new EmisionBloqueadaError('fase', 'compañía actual de Turismos fuera de la app de Allianz AUTOS')
  await exigirSinCuentaBancaria(marco.page())
  const pestanas = marco.getByRole('tab', { selected: true })
  const activa = (await pestanas.count()) === 1 ? (await pestanas.first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim() : ''
  if (activa !== PASO_COMPANIA_ACTUAL_TURISMOS) throw new EmisionBloqueadaError('fase', `compañía actual de Turismos fuera del paso «${PASO_COMPANIA_ACTUAL_TURISMOS}»`)
  const control = marco.locator(SEL_ZONA_APP_TURISMOS).locator(SEL_COMPANIA_ACTUAL_TURISMOS).and(marco.locator(SEL_FUERA_CABECERA_TURISMOS)).filter({ visible: true })
  const n = await control.count()
  if (n !== 1) return { estado: 'no_unica', opciones: [], motivo: `${n} desplegables` }
  comprobarBoton(await descripcion(control))
  const mostrado = (await control.innerText().catch(() => '')).replace(/\s+/g, ' ').trim()
  const panelId = ((await control.getAttribute('aria-controls')) ?? '').replace(/["\\]/g, '')
  if (!panelId) return { estado: 'no_unica', opciones: [], motivo: 'sin aria-controls' }
  const panel = marco.locator(`[id="${panelId}"]`)
  await control.click()
  guard.comprobar()
  const fin = Date.now() + MS_PANEL_COMPANIA
  while ((await panel.locator('[role=option]').count().catch(() => 0)) === 0 && Date.now() < fin) await marco.page().waitForTimeout(150)
  const items = panel.locator('[role=option]')
  const opciones = (await items.evaluateAll((els) => els.map((e) => ((e as HTMLElement).innerText || e.textContent || '').replace(/\s+/g, ' ').trim()))).slice(0, MAX_OPCIONES_COMPANIA)
  const cerrar = async () => {
    await marco.page().keyboard.press('Escape').catch(() => undefined)
    guard.comprobar()
  }
  if (opciones.length === 0) {
    await cerrar()
    return { estado: 'no_unica', opciones, motivo: 'el panel no mostró opciones' }
  }
  if (mostrado !== '') {
    await cerrar()
    return { estado: 'con_valor', opciones }
  }
  if (buscada === null || buscada.trim() === '') {
    await cerrar()
    return { estado: 'sin_elegir', opciones }
  }
  let hits = casarCompaniaActualTurismos(opciones, buscada)
  let generica = false
  if (hits.length === 0) {
    const g = indiceOpcionGenerica(opciones)
    if (g >= 0) {
      hits = [g]
      generica = true
    }
  }
  if (hits.length !== 1) {
    await cerrar()
    return hits.length === 0 ? { estado: 'no_casa', opciones } : { estado: 'ambigua', opciones, coincidencias: hits.length, candidatas: hits.map((i) => opciones[i]) }
  }
  const item = items.nth(hits[0])
  comprobarBoton(await descripcion(item))
  await item.click()
  guard.comprobar()
  const ahora = (await control.innerText().catch(() => '')).replace(/\s+/g, ' ').trim()
  if (planoOpcion(ahora) !== planoOpcion(opciones[hits[0]])) return { estado: 'no_unica', opciones, motivo: 'la opción no quedó elegida' }
  return { estado: 'elegida', opciones, elegida: opciones[hits[0]], ...(generica ? { generica: true as const } : {}) }
}

// ─────────── «Localidad» del tomador de Allianz AUTOS Turismos (v0.6.37 del bot, 31/10/2026) ───────────
// HTML real del trabajo dbb6d451 (solo estructura): en «Datos personales», bloque «¿Quién es el tomador?», `nx-formfield label="Localidad"`
// con un `<input role=combobox aria-autocomplete=list maxlength=50>` (autocompletado NDBX `nxAutocomplete`) y su `<nx-autocomplete>` vacío:
// las opciones solo existen con el panel abierto (overlay, `[role=option]` del listbox al que apunta `aria-owns`/`aria-controls`). El
// portal NO la propuso sola tras el CP. Esta puerta es el ÚNICO camino del adaptador para abrirlo, teclear la búsqueda, leer las opciones y,
// como mucho, elegir UNA (la que decide `elegir`, función PURA del adaptador). Nunca se fuerza un clic ni se elige con Enter.

export const PASO_LOCALIDAD_TURISMOS = 'Datos personales'
export const ETIQUETA_LOCALIDAD_TURISMOS = 'Localidad'
const SEL_BLOQUE_TOMADOR_LOCALIDAD_TURISMOS = 'nx-mt-person-information:has(nx-x-common-header[text="¿Quién es el tomador?"])'
const MS_PANEL_LOCALIDAD = 3_000
const MS_TECLEO_LOCALIDAD = 5_000
const MAX_OPCIONES_LOCALIDAD = 100

export type ResultadoLocalidadTurismos =
  /** Elegida la opción que decidió `elegir`; `mostrado` = valor del campo tras elegir (quien llama lo relee y compara). */
  | { estado: 'elegida'; elegida: string; mostrado: string }
  /** El campo ya trae un valor: no se toca. */
  | { estado: 'con_valor'; mostrado: string }
  /** Ni al abrir ni tras teclear salió ninguna opción. */
  | { estado: 'sin_opciones' }
  /** Hubo opciones pero `elegir` no decidió UNA (ninguna o varias casan): se cerró sin elegir. */
  | { estado: 'sin_eleccion'; opciones: string[] }
  /** Control ausente/repetido/no editable, sin panel declarado o elección que no quedó. */
  | { estado: 'no_unica'; motivo: string }

/**
 * Rellena «Localidad» (autocompletado) del bloque del TOMADOR de Turismos. Exige, como `companiaActualTurismosAllianz`: guard limpio y sin
 * ventanas de red; marco de la app de Turismos; sin campos bancarios; pestaña «Datos personales» (todo eso, bloqueo). EXACTAMENTE un
 * `input[role=combobox][aria-autocomplete=list]` visible con etiqueta EXACTA «Localidad» en el bloque del tomador, en `appArea` y fuera de
 * la cabecera; `comprobarBoton` y frontera bancaria sobre él ANTES de tocarlo. Primero lo enfoca (clic) por si el portal ofrece ya las del
 * CP; si no salen, teclea cada `busquedas` (≤50 car.) hasta que salgan. Las opciones son las `[role=option]` del panel de SU
 * `aria-owns`/`aria-controls` y nada más; `comprobarBoton` sobre la opción antes del único clic. Sin elegir → Escape. Solo nombres de
 * municipios: ni valores ni opciones salen en los motivos.
 */
export async function localidadTurismosAllianz(
  marco: Frame,
  guard: GuardEmision,
  busquedas: readonly string[],
  elegir: (opciones: readonly string[]) => number | null,
): Promise<ResultadoLocalidadTurismos> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', 'localidad de Turismos con una ventana de red abierta')
  if (marco.isDetached() || !esAppTurismosAllianz(marco.url())) throw new EmisionBloqueadaError('fase', 'localidad de Turismos fuera de la app de Allianz AUTOS')
  await exigirSinCuentaBancaria(marco.page())
  const pestanas = marco.getByRole('tab', { selected: true })
  const activa = (await pestanas.count()) === 1 ? (await pestanas.first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim() : ''
  if (activa !== PASO_LOCALIDAD_TURISMOS) throw new EmisionBloqueadaError('fase', `localidad de Turismos fuera del paso «${PASO_LOCALIDAD_TURISMOS}»`)
  const control = marco
    .locator(SEL_ZONA_APP_TURISMOS)
    .locator(SEL_BLOQUE_TOMADOR_LOCALIDAD_TURISMOS)
    .getByLabel(ETIQUETA_LOCALIDAD_TURISMOS, { exact: true })
    .and(marco.locator('input[role=combobox][aria-autocomplete=list]'))
    .and(marco.locator(SEL_FUERA_CABECERA_TURISMOS))
    .filter({ visible: true })
  const n = await control.count()
  if (n !== 1) return { estado: 'no_unica', motivo: `${n} campos` }
  comprobarBoton(await descripcion(control))
  await exigirCampoNoBancario(control)
  if (!(await control.isEditable().catch(() => false))) return { estado: 'no_unica', motivo: 'campo no editable' }
  const valor = async () => (await control.inputValue().catch(() => '')).replace(/\s+/g, ' ').trim()
  const actual = await valor()
  if (actual !== '') return { estado: 'con_valor', mostrado: actual }
  const cerrar = async () => {
    await marco.page().keyboard.press('Escape').catch(() => undefined)
    guard.comprobar()
  }
  // Panel declarado por el propio input (NDBX pone `aria-owns` con el panel abierto); sin él no se mira nada más (fail-closed).
  const leerOpciones = async (): Promise<{ items: Locator; opciones: string[] } | null> => {
    const fin = Date.now() + MS_PANEL_LOCALIDAD
    for (;;) {
      const panelId = ((await control.getAttribute('aria-owns').catch(() => null)) || (await control.getAttribute('aria-controls').catch(() => null)) || '').replace(/["\\]/g, '').trim()
      if (panelId) {
        const items = marco.locator(`[id="${panelId}"]`).locator('[role=option]').filter({ visible: true })
        const k = await items.count().catch(() => 0)
        if (k > 0) {
          const opciones = (await items.evaluateAll((els) => els.map((e) => ((e as HTMLElement).innerText || e.textContent || '').replace(/\s+/g, ' ').trim()))).slice(0, MAX_OPCIONES_LOCALIDAD)
          return { items, opciones }
        }
      }
      if (Date.now() >= fin) return null
      await marco.page().waitForTimeout(150)
    }
  }
  await control.click()
  guard.comprobar()
  let leidas = await leerOpciones()
  for (const b of busquedas) {
    if (leidas) break
    const texto = b.replace(/\s+/g, ' ').trim().slice(0, 50)
    if (texto === '') continue
    try {
      await control.fill(texto, { timeout: MS_TECLEO_LOCALIDAD })
    } catch {
      // El error de Playwright lleva el valor tecleado: nunca sube.
      await cerrar()
      return { estado: 'no_unica', motivo: 'el portal no dejó escribir en el campo a tiempo' }
    }
    guard.comprobar()
    leidas = await leerOpciones()
  }
  if (!leidas) {
    await cerrar()
    await control.fill('', { timeout: MS_TECLEO_LOCALIDAD }).catch(() => undefined)
    return { estado: 'sin_opciones' }
  }
  const i = elegir(leidas.opciones)
  if (i === null || !Number.isInteger(i) || i < 0 || i >= leidas.opciones.length) {
    await cerrar()
    await control.fill('', { timeout: MS_TECLEO_LOCALIDAD }).catch(() => undefined)
    return { estado: 'sin_eleccion', opciones: leidas.opciones }
  }
  const item = leidas.items.nth(i)
  if (((await item.innerText().catch(() => '')).replace(/\s+/g, ' ').trim()) !== leidas.opciones[i]) {
    await cerrar()
    return { estado: 'no_unica', motivo: 'la lista cambió antes de elegir' }
  }
  comprobarBoton(await descripcion(item))
  await item.click()
  guard.comprobar()
  await control.blur().catch(() => undefined)
  const mostrado = await valor()
  if (mostrado === '') return { estado: 'no_unica', motivo: 'la opción no quedó elegida' }
  return { estado: 'elegida', elegida: leidas.opciones[i], mostrado }
}

// ─────────── TARJETAS DE VEHÍCULO de Allianz AUTOS Turismos (v0.6.4 del bot, 17/10/2026) ───────────
// Inventario real del trabajo ebe2bb1e: tras «Encuentra mi vehículo» el motor `ngx-motor-azs` pinta, DENTRO de `appArea` y bajo el
// encabezado «Detalles del vehículo», una TARJETA SELECCIONABLE por vehículo (`nx-selectable-card`): un radio con id dinámico
// `ng-…-nx-selectable-card-N`, sin `name`, y su `<label for>` hermano «Marca del vehículo … Modelo … Tipo de combustible …». Es un
// radio: solo esta puerta lo lee y lo marca (el adaptador decide QUÉ tarjeta por su posición y su etiqueta).

export const ENCABEZADO_TARJETAS_VEHICULO_TURISMOS = 'Detalles del vehículo'
export const SEL_TARJETA_VEHICULO_TURISMOS = 'input[type=radio][id*="-nx-selectable-card-"]'
/** Tarjeta tal como la ve el adaptador: su etiqueta de catálogo (texto visible de la tarjeta, nunca un valor tecleado) y si está elegida. */
export type TarjetaVehiculoTurismos = { readonly etiqueta: string; readonly marcada: boolean }
type TarjetaLeida = TarjetaVehiculoTurismos & { readonly id: string }

/**
 * Tarjetas VÁLIDAS en el orden del portal: en la zona `appArea` y fuera de la cabecera, habilitadas, con `<label>` VISIBLE (el radio
 * nativo va oculto a la vista) y cuyo encabezado visible inmediatamente anterior es EXACTAMENTE «Detalles del vehículo». Solo lectura.
 */
async function tarjetasVehiculoTurismos(marco: Frame): Promise<TarjetaLeida[]> {
  return marco
    .locator(SEL_ZONA_APP_TURISMOS)
    .locator(SEL_TARJETA_VEHICULO_TURISMOS)
    .and(marco.locator(SEL_FUERA_CABECERA_TURISMOS))
    .evaluateAll((els, encabezado) => {
      // Sin funciones con nombre dentro de `evaluate` (tsx les mete `__name`, que no existe en la página).
      const titulos = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role=heading]')).filter((t) => {
        const cs = getComputedStyle(t)
        return cs.display !== 'none' && cs.visibility !== 'hidden' && t.getClientRects().length > 0
      })
      return els.flatMap((el) => {
        const h = el as HTMLInputElement
        const previos = titulos.filter((t) => !t.contains(h) && (t.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0)
        const anterior = previos.length ? previos[previos.length - 1] : null
        const bajo = anterior ? ((anterior as HTMLElement).innerText || anterior.textContent || '').replace(/\s+/g, ' ').trim() === encabezado : false
        const labs = (h.labels ? Array.from(h.labels) : []).filter((l) => {
          const cs = getComputedStyle(l)
          return cs.display !== 'none' && cs.visibility !== 'hidden' && l.getClientRects().length > 0
        })
        if (!h.id || h.disabled || !bajo || labs.length === 0) return []
        return [{ id: h.id, etiqueta: labs.map((l) => l.innerText || l.textContent || '').join(' ').replace(/\s+/g, ' ').trim(), marcada: h.checked }]
      })
    }, ENCABEZADO_TARJETAS_VEHICULO_TURISMOS)
    .catch(() => [] as TarjetaLeida[])
}

/** Lectura para el adaptador (sin ids): marco de otra app → ninguna. Solo lectura. */
export async function leerTarjetasVehiculoTurismosAllianz(marco: Frame): Promise<TarjetaVehiculoTurismos[]> {
  if (marco.isDetached() || !esAppTurismosAllianz(marco.url())) return []
  return (await tarjetasVehiculoTurismos(marco)).map(({ etiqueta, marcada }) => ({ etiqueta, marcada }))
}

// ─────────── Lector de «Selección de paquete» de Allianz AUTOS Turismos (v0.6.12 del bot, 20/10/2026) ───────────
/** Un paquete (columna) de la tabla comparativa tal como se ve: textos crudos, sin interpretar. */
export type PaqueteLeidoTurismos = { nombre: string; primerRecibo: string; anualidad: string; mejorOpcion: boolean; conAviso: boolean }
/** Celda de un paquete en una fila de cobertura: icono (check/minus) y/o texto (valor de un desplegable). */
export type CeldaLeidaTurismos = { icono: string | null; texto: string }
/** Opción de una fila de elección única que abarca todos los paquetes (límite, nivel o incluido/no); `marcada` = la que trae el portal. */
export type OpcionLeidaTurismos = { texto: string; marcada: boolean; adicional: string }
export type FilaPaqueteLeidaTurismos = { descripcion: string; celdas: CeldaLeidaTurismos[]; opciones: OpcionLeidaTurismos[]; comunes: string[] }
export type LecturaPaquetesTurismos = { paquetes: PaqueteLeidoTurismos[]; filas: FilaPaqueteLeidaTurismos[] }

/**
 * SOLO LECTURA de la tabla comparativa de precios (`app-price` → `nx-comparison-table`) de «Selección de paquete»: por paquete,
 * nombre, «primer recibo» y «la anualidad»; por fila, la cobertura con el icono/valor de cada paquete, las opciones de elección
 * única (con la marcada y su suplemento) o la lista «Todos los paquetes incluyen». No pulsa nada (ni «Seleccionar», ni los
 * desplegables, ni las opciones): las coberturas ya están pintadas. Marco de otra app, sin `app-price` o sin tabla → `null`.
 */
export async function leerPaquetesTurismosAllianz(marco: Frame): Promise<LecturaPaquetesTurismos | null> {
  if (marco.isDetached() || !esAppTurismosAllianz(marco.url())) return null
  // Fuente JS como TEXTO (no como función): el transpilador (tsx/esbuild) envuelve las funciones con nombre en `__name(…)`, que no existe en la página.
  return (marco.evaluate(SCRIPT_LEER_PAQUETES_TURISMOS) as Promise<LecturaPaquetesTurismos | null>).catch(() => null)
}
const SCRIPT_LEER_PAQUETES_TURISMOS = `(() => {
  const txt = (e) => ((e && (e.innerText || e.textContent)) || '').replace(/[\\s\\u00a0]+/g, ' ').trim();
  const visible = (e) => getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0;
  const tabla = Array.from(document.querySelectorAll('app-price nx-comparison-table')).find(visible);
  if (!tabla) return null;
  const paquetes = Array.from(tabla.querySelectorAll('.is-header-row .nx-comparison-table__header-cell')).map((c) => ({
    nombre: txt(c.querySelector('.product-title-wrap .has-popover > p')),
    primerRecibo: txt(c.querySelector('.price-first')),
    anualidad: txt(c.querySelector('.price-regular')),
    mejorOpcion: c.querySelector('.product-title-wrap.best-option') !== null,
    conAviso: c.querySelector('.has-popover nx-icon[name*="exclamation"]') !== null,
  }));
  const filas = Array.from(tabla.querySelectorAll('.is-content-row')).map((f) => ({
    descripcion: txt(f.querySelector('.nx-comparison-table__description-cell')),
    celdas: Array.from(f.querySelectorAll('.nx-comparison-table__cell')).map((c) => ({
      icono: c.querySelector('nx-icon[name="check"]') ? 'check' : c.querySelector('nx-icon[name="minus"]') ? 'minus' : null,
      texto: txt(c.querySelector('.nx-dropdown__rendered')),
    })),
    opciones: Array.from(f.querySelectorAll('.nx-comparison-table__intersection-cell nx-radio')).map((o) => ({
      texto: txt(o.querySelector('.nx-radio__label--text > span:first-child')),
      marcada: o.querySelector('.nx-radio__dot') !== null || (o.querySelector('input') !== null && o.querySelector('input').checked === true),
      adicional: txt(o.querySelector('.option-additional-text')),
    })),
    comunes: Array.from(f.querySelectorAll('.common-coverages li')).map((li) => txt(li.querySelector('span'))),
  }));
  return { paquetes, filas };
})()`

/**
 * Elige UNA tarjeta de vehículo de Turismos (el ÚNICO camino para tocarla). Exige, como `marcarOpcionTurismosAllianz`: guard limpio y
 * sin ventanas de red abiertas, marco vivo de la app de Turismos, sin campos de cuenta bancaria y pestaña seleccionada «Datos del
 * vehículo» (si no, bloqueo). La etiqueta pedida NO puede parecer emisión/contratación/pago (`comprobarBoton`/`pareceEmision`) ni
 * cuenta bancaria (`senalCuentaBancaria`): bloqueo antes de mirar nada. Luego la tarjeta nº `indice` de las VÁLIDAS (appArea, bajo
 * «Detalles del vehículo») tiene que tener EXACTAMENTE esa etiqueta y un único `<label for>` visible; si no → `no_unica` (hueco). Ya
 * elegida → no se pulsa. `comprobarBoton` sobre radio y etiqueta ANTES del único clic; después, que quede marcada (`no_quedo` si no).
 */
export async function marcarTarjetaVehiculoTurismosAllianz(marco: Frame, guard: GuardEmision, indice: number, etiqueta: string): Promise<ResultadoOpcionHogar> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', 'tarjeta de vehículo de Turismos con una ventana de red abierta')
  comprobarBoton([etiqueta])
  const banco = senalCuentaBancaria([etiqueta])
  if (banco !== null) throw new ErrorFronteraEmision(banco)
  if (!Number.isInteger(indice) || indice < 0) throw new EmisionBloqueadaError('boton', 'tarjeta de vehículo de Turismos: índice no válido')
  if (marco.isDetached() || !esAppTurismosAllianz(marco.url())) throw new EmisionBloqueadaError('fase', 'tarjeta de vehículo fuera de la app de Allianz AUTOS')
  await exigirSinCuentaBancaria(marco.page())
  const pestanas = marco.getByRole('tab', { selected: true })
  const activa = (await pestanas.count()) === 1 ? (await pestanas.first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim() : ''
  if (activa !== PASO_TURISMOS_ALLIANZ) throw new EmisionBloqueadaError('fase', 'tarjeta de vehículo fuera del paso «Datos del vehículo»')
  const tarjetas = await tarjetasVehiculoTurismos(marco)
  const t = tarjetas[indice]
  if (!t || t.etiqueta !== etiqueta.replace(/\s+/g, ' ').trim()) return { estado: 'no_unica', coincidencias: tarjetas.filter((x) => x.etiqueta === etiqueta).length }
  const id = t.id.replace(/["\\]/g, '')
  const zona = marco.locator(SEL_ZONA_APP_TURISMOS)
  const control = zona.locator(`${SEL_TARJETA_VEHICULO_TURISMOS}[id="${id}"]`)
  if ((await control.count()) !== 1) return { estado: 'no_unica', coincidencias: await control.count() }
  if (await control.isChecked()) return { estado: 'ya_marcada' }
  const label = zona.locator(`label[for="${id}"]`).filter({ visible: true })
  if ((await label.count()) !== 1) return { estado: 'no_unica', coincidencias: await label.count() }
  comprobarBoton(await control.evaluate((el) => {
    const h = el as HTMLInputElement
    return [h.id || null, h.name || null, h.getAttribute('onclick'), h.getAttribute('onchange'), h.getAttribute('aria-label'), h.getAttribute('formaction')]
  }))
  comprobarBoton(await descripcion(label))
  await label.click()
  guard.comprobar()
  return (await control.isChecked()) ? { estado: 'marcada' } : { estado: 'no_quedo' }
}

// ─────────── Generali · portal del corredor (18/10/2026, capturas de Alberto en Drive «BOT compañías › Generali») ───────────
// Dos controles que el adaptador NO nombra: el «ACEPTAR» de «Seleccionar mediador» (casa con `aceptar`) y el camino de menú
// NEGOCIO › EMISIÓN › CONTRATACIÓN › AUTOMÓVILES › TURISMOS (RAMO UV) (casa con `emisi`/`contrat`). Alberto fija ese camino
// (18/10/2026: el de las capturas, NO «Cálculo rápido»). Los cuatro primeros niveles solo se SOBREVUELAN (hover: abren el
// desplegable, no envían nada); el único clic es «TURISMOS (RAMO UV)», con texto exacto y `comprobarBoton` sobre todo lo demás
// (href, onclick, ancestros). EXCEPCIÓN (Alberto, 18/10/2026, v0.1.1): «emisión»/«contratación» como SUSTANTIVOS del menú se
// perdonan SOLO en el enlace de TURISMOS (RAMO UV) y en las navegaciones GET a www.generali.es durante la ventana de ESE clic
// (`urlTurismosGeneraliPermitida`); emitir/contratar/grabar/pagar/aceptar, POST, otro origen o fuera de la ventana: bloqueado. «EMISIÓN (NUEVO)», «ALTA DE PÓLIZA», «CÁLCULO RÁPIDO DE PRIMAS»… no están en la lista: no se tocan.

/** Hueco de mapa visto por el guard de Generali: para SIN pulsar y pide el inventario de estructura. */
export class ErrorMapaGuardGenerali extends ErrorTarificador {
  readonly pideInventarioDom = true
  constructor(que: string) {
    super('portal', `generali: mapa incompleto: faltan ${que}`)
    this.name = 'ErrorMapaGuardGenerali'
  }
}

export const ORIGEN_PORTAL_GENERALI = 'https://www.generali.es'
export const RUTA_INICIO_GENERALI = '/arq_genernetPortalFormWeb/CorredorInicio.po'
export const RUTA_PORTAL_GENERALI = '/arq_genernetPortalFormWeb/CorredorPortal.po'
/** Texto EXACTO del botón de «Seleccionar mediador» (captura 2). */
export const BOTON_MEDIADOR_GENERALI = 'ACEPTAR'
/** Camino de menú hasta Turismos (captura 3). Los cuatro primeros se sobrevuelan; el último es el único clic. */
export const MENU_TURISMOS_GENERALI = Object.freeze(['NEGOCIO', 'EMISIÓN', 'CONTRATACIÓN', 'AUTOMÓVILES', 'TURISMOS (RAMO UV)'] as const)

const textoMenu = (t: string | null | undefined) => (t ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleUpperCase('es')

function enRutaGenerali(page: Page, ruta: string): boolean {
  try {
    const u = new URL(page.url())
    return u.origin === ORIGEN_PORTAL_GENERALI && u.pathname === ruta
  } catch {
    return false
  }
}

/** El ÚNICO control VISIBLE cuyo texto normalizado es EXACTAMENTE `texto` (si hay varios, los de la barra de menú). */
async function unicoPorTextoGenerali(page: Page, texto: string): Promise<Locator | null> {
  const re = new RegExp(`^\\s*${texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i')
  const todos = page.getByText(re).filter({ visible: true })
  const n = await todos.count()
  if (n === 1) return todos.first()
  if (n === 0) return null
  const enMenu = page.locator('nav, [role=navigation], [role=menu], [role=menubar], ul').getByText(re).filter({ visible: true })
  return (await enMenu.count()) === 1 ? enMenu.first() : null
}

/** Como `unicoPorTextoGenerali`, esperando hasta `esperaMs` a que el menú (plegado o aún cargando) lo deje ver. Solo lee. */
async function esperarUnicoGenerali(page: Page, texto: string, esperaMs = 8_000): Promise<Locator | null> {
  const fin = Date.now() + esperaMs
  for (;;) {
    const l = await unicoPorTextoGenerali(page, texto)
    if (l || Date.now() >= fin) return l
    await page.waitForTimeout(300)
  }
}

/**
 * Pantalla «Seleccionar mediador» (prueba real b41be722, 19/10/2026): la carcasa es `CorredorInicio.po` («PORTAL DEL CORREDOR»)
 * y la cascada vive en un MARCO de Genernet (`seleccionAmbito.do`, que se recarga como `seleccionAmbitoRefresh.do` al cambiar
 * un desplegable). Rutas EXACTAS de www.generali.es en las que puede estar la página o el marco del desplegable.
 */
export const RUTAS_MEDIADOR_GENERALI = Object.freeze([
  RUTA_INICIO_GENERALI,
  '/age3k/red_agendaComercialFormWeb/mediador/seleccionAmbito.do',
  '/age3k/red_agendaComercialFormWeb/mediador/seleccionAmbitoRefresh.do',
] as const)
/**
 * Botón de «Seleccionar mediador» que el robot puede pulsar: LISTA BLANCA CERRADA de textos EXACTOS (sin tildes ni mayúsculas
 * que cuenten). La captura 2 enseña «ACEPTAR»; el marco de Genernet no está capturado y puede decir «Continuar».
 */
export const BOTONES_MEDIADOR_GENERALI = Object.freeze([BOTON_MEDIADOR_GENERALI, 'CONTINUAR'] as const)
/** Lo que NUNCA puede llevar ese botón aunque alguien lo añada a la lista («aceptar» va aparte: es el de la captura). */
const RE_BOTON_MEDIADOR_PELIGROSO = /emit|emisi|contrat|grab|firm|pag|poliza|formaliz|suplement|anul|tarif|guard/i

/** ¿Puede el robot pulsar el botón de «Seleccionar mediador» con ESTE texto? Exacto en la lista y sin nada peligroso. PURA. */
export function botonMediadorGeneraliPermitido(texto: string | null | undefined): boolean {
  const t = textoMenu(texto)
  if (t === '' || RE_BOTON_MEDIADOR_PELIGROSO.test(sinTildesNi(t))) return false
  return (BOTONES_MEDIADOR_GENERALI as readonly string[]).includes(t)
}

/** ¿`url` es de www.generali.es y su ruta EXACTA es una de `RUTAS_MEDIADOR_GENERALI`? PURA. */
export function rutaMediadorGenerali(url: string): boolean {
  try {
    const u = new URL(url)
    return u.origin === ORIGEN_PORTAL_GENERALI && !u.username && !u.password && (RUTAS_MEDIADOR_GENERALI as readonly string[]).includes(u.pathname)
  } catch {
    return false
  }
}

/** Texto visible de un control para la lista blanca: su texto, o el `value`/`alt`/`title`/`aria-label` de un input/imagen. */
const textoControl = (d: (string | null)[]) => [d[0], d[3], d[1], d[2]].map((x) => (x ?? '').trim()).find((x) => x !== '') ?? ''

/**
 * Botón de «Seleccionar mediador» (captura 2 + prueba real b41be722), UNA vez por trabajo y solo si: guard limpio y sin
 * ventanas abiertas; la página Y el marco del desplegable están en `RUTAS_MEDIADOR_GENERALI` de www.generali.es; el desplegable
 * del mediador (`selectMediador`, lo localiza el adaptador en el marco que sea) tiene puesto EXACTAMENTE el mediador de la
 * correduría (`opcionMediadorGenerali`); y en ESE MARCO hay un único control visible (button, input de botón/imagen, enlace,
 * role=button) cuyo texto es uno de `BOTONES_MEDIADOR_GENERALI` (exacto). `comprobarBoton` (con «aceptar» permitido SOLO
 * aquí) mira el resto de su descripción (onclick, href, formaction, ancestros) antes del clic. Nada de emitir/contratar/
 * grabar/firmar/pagar.
 */
export async function pulsarMediadorGenerali(page: Page, guard: GuardEmision, selectMediador: Locator): Promise<void> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', 'mediador de Generali con una ventana de red abierta')
  if (!rutaMediadorGenerali(page.url())) throw new ErrorMapaGuardGenerali('la pantalla «Seleccionar mediador» (CorredorInicio.po / seleccionAmbito.do)')
  const usados = AVANCES_USADOS.get(guard) ?? new Set<string>()
  if (usados.has('generali:mediador')) throw new EmisionBloqueadaError('fase', 'el mediador de Generali ya se aceptó en este trabajo')
  if ((await selectMediador.count()) !== 1) throw new ErrorMapaGuardGenerali('el desplegable «Mediador» (no hay exactamente uno)')
  const handle = await selectMediador.elementHandle()
  const marco = handle ? await handle.ownerFrame() : null
  await handle?.dispose()
  if (!marco || marco.page() !== page || marco.isDetached()) throw new ErrorMapaGuardGenerali('el marco del desplegable «Mediador»')
  if (!rutaMediadorGenerali(marco.url())) throw new ErrorMapaGuardGenerali('el marco de «Seleccionar mediador» (ruta fuera de la lista de Generali)')
  const puesta = await selectMediador.evaluate((el) => {
    const s = el as HTMLSelectElement
    if (s.tagName !== 'SELECT') return null
    const o = s.selectedIndex >= 0 ? s.options[s.selectedIndex] : null
    return o ? { valor: o.value ?? '', texto: (o.textContent ?? '').trim() } : null
  })
  if (!puesta || opcionMediadorGenerali([puesta], MEDIADOR_GENERALI).tipo !== 'unica') throw new EmisionBloqueadaError('fase', 'el mediador elegido no es el de la correduría: no se acepta')
  await exigirSinCuentaBancaria(page)
  const candidatos = marco.locator('button, input[type=button], input[type=submit], input[type=image], a, [role=button]').filter({ visible: true })
  const n = await candidatos.count()
  // Fail-closed: la unicidad solo vale si se miraron TODOS. Más de 200 candidatos, o uno cuya lectura falla, no se pulsa.
  if (n > 200) throw new ErrorMapaGuardGenerali(`el botón de «Seleccionar mediador» (${n} controles visibles en su marco; más de 200, no se puede asegurar que sea único)`)
  const validos: { control: Locator; desc: (string | null)[] }[] = []
  for (let i = 0; i < n; i++) {
    const c = candidatos.nth(i)
    let d: (string | null)[]
    try {
      d = await descripcion(c)
    } catch {
      throw new ErrorMapaGuardGenerali(`el botón de «Seleccionar mediador» (no se pudo leer el control ${i + 1} de ${n}; sin leerlos todos no se asegura que sea único)`)
    }
    if (botonMediadorGeneraliPermitido(textoControl(d))) validos.push({ control: c, desc: d })
  }
  if (validos.length !== 1) throw new ErrorMapaGuardGenerali(`el botón de «Seleccionar mediador» (${validos.length} visibles en su marco con texto ${BOTONES_MEDIADOR_GENERALI.join('/')}; hace falta exactamente uno)`)
  const { control, desc } = validos[0]!
  if (!botonMediadorGeneraliPermitido(textoControl(desc))) throw new EmisionBloqueadaError('boton', textoControl(desc).slice(0, 80))
  comprobarBoton(desc, { permitirAceptar: true })
  usados.add('generali:mediador')
  AVANCES_USADOS.set(guard, usados)
  await control.click()
  guard.comprobar()
}

/** Texto EXACTO del enlace que lleva de `CorredorInicio.po` (ya con mediador) al portal con el menú (prueba real 351f946b, v0.2.3). */
export const ENLACE_ENTRAR_GENERALI = 'ENTRAR'

/** ¿Puede el robot pulsar el enlace de entrada al portal con ESTE texto? Solo «ENTRAR» exacto. PURA. */
export function enlaceEntrarGeneraliPermitido(texto: string | null | undefined): boolean {
  return textoMenu(texto) === ENLACE_ENTRAR_GENERALI
}

/**
 * «ENTRAR» de `CorredorInicio.po` (prueba real 351f946b, 19/10/2026): tras aceptar el mediador la carcasa se queda en
 * «PORTAL DEL CORREDOR» con «Cerrar sesión» y «ENTRAR». UNA vez por trabajo y solo si: guard limpio y sin ventanas abiertas;
 * la página está en la ruta EXACTA `CorredorInicio.po` de www.generali.es; y, entre TODOS los marcos vivos de www.generali.es,
 * hay exactamente un control visible (enlace, botón, input de botón/imagen, role=button) con texto «ENTRAR» exacto. Fail-closed:
 * un control que no se deja leer, o más de 200 por marco, no se pulsa. `comprobarBoton` mira el resto de su descripción.
 */
export async function pulsarEntrarGenerali(page: Page, guard: GuardEmision): Promise<void> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', 'ENTRAR de Generali con una ventana de red abierta')
  if (!enRutaGenerali(page, RUTA_INICIO_GENERALI)) throw new ErrorMapaGuardGenerali('la pantalla CorredorInicio.po antes de «ENTRAR»')
  const usados = AVANCES_USADOS.get(guard) ?? new Set<string>()
  if (usados.has('generali:entrar')) throw new EmisionBloqueadaError('fase', '«ENTRAR» de Generali ya se pulsó en este trabajo')
  await exigirSinCuentaBancaria(page)
  const validos: { control: Locator; desc: (string | null)[] }[] = []
  for (const marco of page.frames()) {
    if (marco.isDetached()) continue
    let origen = ''
    try {
      origen = new URL(marco.url()).origin
    } catch {
      continue
    }
    if (origen !== ORIGEN_PORTAL_GENERALI) continue
    const candidatos = marco.locator('button, input[type=button], input[type=submit], input[type=image], a, [role=button]').filter({ visible: true })
    const n = await candidatos.count()
    if (n > 200) throw new ErrorMapaGuardGenerali(`«ENTRAR» (${n} controles visibles en un marco; más de 200, no se puede asegurar que sea único)`)
    for (let i = 0; i < n; i++) {
      const c = candidatos.nth(i)
      let d: (string | null)[]
      try {
        d = await descripcion(c)
      } catch {
        throw new ErrorMapaGuardGenerali(`«ENTRAR» (no se pudo leer el control ${i + 1} de ${n}; sin leerlos todos no se asegura que sea único)`)
      }
      if (enlaceEntrarGeneraliPermitido(textoControl(d))) validos.push({ control: c, desc: d })
    }
  }
  if (validos.length !== 1) throw new ErrorMapaGuardGenerali(`el enlace «ENTRAR» de CorredorInicio.po (${validos.length} visibles con ese texto; hace falta exactamente uno)`)
  const { control, desc } = validos[0]!
  comprobarBoton(desc)
  usados.add('generali:entrar')
  AVANCES_USADOS.set(guard, usados)
  await control.click()
  guard.comprobar()
}

/** Cuánto se espera (solo lectura) a que aparezca el aviso «¿Sabías qué…?» tras llegar al portal (prueba real c8838c26: tarda segundos). */
export const ESPERA_AVISO_SABIAS_QUE_GENERALI_MS = 8_000
/** Id EXACTO del «×» del modal «¿Sabías qué…?» de CorredorPortal.po (inventario real, prueba 31e76085). */
export const ID_CIERRE_SABIAS_QUE_GENERALI = 'closeModalSabiasQueIntro'
/** Textos que puede tener ese control para ser un CIERRE (tras `textoMenu`): la aspa o nada. Nunca aceptar/contratar/etc. */
const TEXTOS_CIERRE_SABIAS_QUE_GENERALI: readonly string[] = Object.freeze(['×', '✕', 'X', ''])

/**
 * Modal «¿Sabías qué…?» que tapa `CorredorPortal.po` al llegar (prueba real 31e76085). Solo si la página es EXACTAMENTE el portal
 * del corredor de www.generali.es: el ÚNICO control visible con id `closeModalSabiasQueIntro` (o, si no está, el único «×» de un
 * modal/diálogo cuyo texto contiene «Sabías qué»), con texto «×»/vacío (aria «Cerrar» como mucho), que pase `comprobarBoton`.
 * Sin modal → `'sin_aviso'` (no es error, no se pulsa nada). UNA vez por trabajo. Más de uno o un control que no es un cierre →
 * hueco (no se pulsa).
 */
export async function cerrarAvisoSabiasQueGenerali(page: Page, guard: GuardEmision, esperaMs = ESPERA_AVISO_SABIAS_QUE_GENERALI_MS): Promise<'cerrado' | 'sin_aviso'> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', 'aviso «¿Sabías qué…?» con una ventana de red abierta')
  if (!esPortalCorredorGeneraliGuard(page)) return 'sin_aviso'
  const usados = AVANCES_USADOS.get(guard) ?? new Set<string>()
  if (usados.has('generali:sabias-que')) return 'sin_aviso'
  // Prueba real c8838c26 (v0.2.5): el overlay `div.modalOverlay#modalSabiasQueIntro` aparece UNOS SEGUNDOS DESPUÉS de llegar al
  // portal (mientras cargan sus marcos y los vídeos); mirar una sola vez daba «sin aviso» y el overlay tapaba el menú. Se espera
  // (solo lectura) hasta `esperaMs` a que aparezca el «×»; sin él en ese plazo → `'sin_aviso'`.
  const limite = Date.now() + Math.max(0, esperaMs)
  let porId: Locator[] = []
  let porModal: Locator[] = []
  for (;;) {
    guard.comprobar()
    porId = []
    porModal = []
    for (const marco of marcosVivos(page)) {
      let origen = ''
      try {
        origen = new URL(marco.url()).origin
      } catch {
        continue
      }
      if (origen !== ORIGEN_PORTAL_GENERALI) continue
      const ids = marco.locator(`[id="${ID_CIERRE_SABIAS_QUE_GENERALI}"]`).filter({ visible: true })
      for (let i = 0, n = await ids.count().catch(() => 0); i < n; i++) porId.push(ids.nth(i))
      const cierres = marco.locator('.modal, .modalOverlay, [role=dialog]').filter({ hasText: /sab[ií]as\s+qu[eé]/i }).filter({ visible: true }).locator('button, [role=button], a, .close').filter({ visible: true })
      for (let i = 0, n = await cierres.count().catch(() => 0); i < n; i++) {
        const c = cierres.nth(i)
        if (textoMenu(await c.innerText().catch(() => 'no')) === '×') porModal.push(c)
      }
    }
    if (porId.length > 0 || porModal.length > 0 || Date.now() >= limite) break
    await page.waitForTimeout(250)
  }
  const candidatos = porId.length > 0 ? porId : porModal
  if (candidatos.length === 0) return 'sin_aviso'
  if (candidatos.length !== 1) throw new ErrorMapaGuardGenerali(`el «×» del aviso «¿Sabías qué…?» (${candidatos.length} visibles; hace falta exactamente uno)`)
  const control = candidatos[0]!
  await exigirSinCuentaBancaria(page)
  const desc = await descripcion(control)
  const aria = textoMenu(desc[1])
  if (!TEXTOS_CIERRE_SABIAS_QUE_GENERALI.includes(textoMenu(desc[0])) || (aria !== '' && aria !== 'CERRAR')) {
    throw new ErrorMapaGuardGenerali(`el cierre del aviso «¿Sabías qué…?» (el control no es una aspa de cierre: «${String(desc[0] ?? '').replace(/\s+/g, ' ').trim().slice(0, 20)}»)`)
  }
  comprobarBoton(desc)
  usados.add('generali:sabias-que')
  AVANCES_USADOS.set(guard, usados)
  await clicSinDialogoNativo(page, guard, control, 'aviso «¿Sabías qué…?»')
  const hastaCierre = Date.now() + 3_000
  while (Date.now() < hastaCierre) {
    guard.comprobar()
    let visibles = 0
    for (const f of marcosVivos(page)) visibles += await f.locator(`[id="${ID_CIERRE_SABIAS_QUE_GENERALI}"]`).filter({ visible: true }).count().catch(() => 0)
    if (visibles === 0) break
    await page.waitForTimeout(150)
  }
  return 'cerrado'
}

function esPortalCorredorGeneraliGuard(page: Page): boolean {
  return enRutaGenerali(page, RUTA_PORTAL_GENERALI)
}

/** Plazo corto del sobrevuelo/clic de cada nivel del menú de Generali (el de Playwright por defecto, 30 s, tapaba el fallo real). */
const PLAZO_MENU_GENERALI_MS = 5_000

/**
 * Entrada a «Turismos (Ramo UV)» por el menú (captura 3), UNA vez por trabajo, solo desde `CorredorPortal.po`: sobrevuela
 * NEGOCIO › EMISIÓN › CONTRATACIÓN › AUTOMÓVILES (cada uno el ÚNICO visible con ese texto exacto) y pulsa «TURISMOS (RAMO UV)»
 * tras `comprobarBoton` sobre su descripción sin el texto autorizado. Un nivel que no aparece → hueco con inventario.
 */
export async function entrarTurismosGenerali(page: Page, guard: GuardEmision, esperaMs = VENTANA_RED_TURISMOS_GENERALI_MS): Promise<void> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', 'menú de Generali con una ventana de red abierta')
  if (!enRutaGenerali(page, RUTA_PORTAL_GENERALI)) throw new ErrorMapaGuardGenerali('el portal del corredor (CorredorPortal.po) antes del menú')
  const usados = AVANCES_USADOS.get(guard) ?? new Set<string>()
  if (usados.has('generali:turismos')) throw new EmisionBloqueadaError('fase', 'el menú de Turismos de Generali ya se usó en este trabajo')
  await exigirSinCuentaBancaria(page)
  // v0.2.5 (prueba real c8838c26): un overlay encima intercepta el sobrevuelo. Si el aviso sigue ahí se cierra por SU compuerta
  // (sin espera: ya tuvo su plazo en el adaptador); sin aviso, no hace nada.
  await cerrarAvisoSabiasQueGenerali(page, guard, 0)
  const niveles = MENU_TURISMOS_GENERALI.slice(0, -1)
  let actual = await esperarUnicoGenerali(page, niveles[0]!)
  for (let i = 0; i < niveles.length; i++) {
    const texto = niveles[i]!
    const sig = MENU_TURISMOS_GENERALI[i + 1]!
    if (!actual) throw new ErrorMapaGuardGenerali(`el nivel «${texto}» del menú (no hay exactamente uno visible tras sobrevolar el anterior)`)
    // 1) Sobrevuelo con plazo corto (el menú Bootstrap con `data-hover` se abre así). Si falla, no es fatal: se prueba el clic.
    await actual.hover({ timeout: PLAZO_MENU_GENERALI_MS }).catch(() => undefined)
    await page.waitForTimeout(400)
    let siguiente = await esperarUnicoGenerali(page, sig, 2_500)
    if (!siguiente) {
      // 2) Alternativa: pulsar el toggle de ESE nivel (solo los textos de MENU_TURISMOS_GENERALI; el mismo control, nunca otro).
      // La descripción (texto, href, onclick, ancestros) pasa por la lista única, con la excepción de los sustantivos del camino.
      await cerrarAvisoSabiasQueGenerali(page, guard, 0)
      const dn = await descripcion(actual, true)
      if (textoMenu(dn[0]) !== textoMenu(texto)) throw new EmisionBloqueadaError('boton', String(dn[0] ?? '').slice(0, 120))
      for (const d of dn) {
        if (typeof d === 'string' && /^\s*https?:/i.test(d) && !d.trim().toLowerCase().startsWith(`${ORIGEN_PORTAL_GENERALI}/`)) throw new EmisionBloqueadaError('boton', `«${texto}» apunta fuera de ${ORIGEN_PORTAL_GENERALI}`)
      }
      comprobarBoton(dn.filter((d) => textoMenu(d) !== textoMenu(texto)).map((d) => (typeof d === 'string' ? sinSustantivosMenuGenerali(d) : d)))
      try {
        await actual.click({ timeout: PLAZO_MENU_GENERALI_MS })
      } catch {
        throw new ErrorMapaGuardGenerali(`el nivel «${texto}» del menú (ni el sobrevuelo ni el clic lo despliegan o algo lo tapa)`)
      }
      guard.comprobar()
      await page.waitForTimeout(400)
      siguiente = await esperarUnicoGenerali(page, sig, 5_000)
    }
    actual = siguiente
  }
  const final = MENU_TURISMOS_GENERALI[MENU_TURISMOS_GENERALI.length - 1]!
  const destino = actual
  if (!destino) throw new ErrorMapaGuardGenerali(`la opción «${final}» del menú (no hay exactamente una visible)`)
  const desc = await descripcion(destino, true)
  if (textoMenu(desc[0]) !== final) throw new EmisionBloqueadaError('boton', String(desc[0] ?? ''))
  // Excepción mínima (Alberto, 18/10/2026): en el href/onclick del enlace de TURISMOS solo se perdonan los sustantivos
  // «emisión»/«contratación» del camino del menú; un href a otro origen o cualquier otro verbo de emisión sigue bloqueando.
  const resto = desc.filter((d) => textoMenu(d) !== final)
  for (const d of resto) {
    if (typeof d === 'string' && /^\s*https?:/i.test(d) && !d.trim().toLowerCase().startsWith(`${ORIGEN_PORTAL_GENERALI}/`)) throw new EmisionBloqueadaError('boton', `TURISMOS (RAMO UV) apunta fuera de ${ORIGEN_PORTAL_GENERALI}`)
  }
  comprobarBoton(resto.map((d) => (typeof d === 'string' ? sinSustantivosMenuGenerali(d) : d)))
  const ventana = ABRIR_TURISMOS_GENERALI.get(guard)
  if (!ventana) throw new EmisionBloqueadaError('fase', 'guard sin ventana de Turismos de Generali')
  usados.add('generali:turismos')
  AVANCES_USADOS.set(guard, usados)
  ventana.abrir(esperaMs)
  try {
    await destino.click()
    // La ventana dura lo que tarda en aparecer el formulario («Datos de Valoración», captura 4) o su tope; luego se cierra.
    const fin = Date.now() + Math.min(esperaMs, VENTANA_RED_TURISMOS_GENERALI_MS)
    while (Date.now() < fin && ventana.abierta()) {
      guard.comprobar()
      let llego = false
      for (const f of page.frames()) {
        if (!f.isDetached() && (await f.getByText('Datos de Valoración', { exact: true }).filter({ visible: true }).count().catch(() => 0)) > 0) llego = true
      }
      if (llego) break
      await page.waitForTimeout(300)
    }
  } finally {
    ventana.cerrar()
  }
  guard.comprobar()
}

/**
 * Subpestañas de «Valoración Riesgo» de Generali que el robot puede pulsar (v0.2.0 del bot, 19/10/2026). LISTA BLANCA CERRADA
 * de textos EXACTOS (captura 6: «Datos de Valoración» activa · «Garantías y Resultados»). Pulsar una subpestaña solo cambia la
 * vista del formulario; NO relaja el guard de red: si ese clic manda una petición que casa con el patrón de emisión, se aborta
 * y el trabajo cae (fail-closed) con el HTML de la pantalla para mapearlo.
 */
export const SUBPESTANAS_GENERALI = Object.freeze(['Garantías y Resultados', 'Historial Siniestral'] as const)
/** Lo que NUNCA puede llevar el texto de una subpestaña pulsable, aunque alguien la añada a la lista (sin tildes, sin mayúsculas). */
const RE_SUBPESTANA_PELIGROSA_GENERALI = /emit|emisi|contrat|grab|firm|pag|acept|poliza|formaliz|suplement|anul/i

/** ¿Puede el robot pulsar la subpestaña de Generali con ESTE texto? Exacto (salvo espacios) en la lista y sin nada peligroso. PURA. */
export function subpestanaGeneraliPermitida(texto: string): boolean {
  const t = (texto ?? '').normalize('NFC').replace(/\s+/g, ' ').trim()
  if (t === '' || RE_SUBPESTANA_PELIGROSA_GENERALI.test(sinTildesNi(t))) return false
  return (SUBPESTANAS_GENERALI as readonly string[]).includes(t)
}

/**
 * Subpestaña «Garantías y Resultados» de Generali (y solo las de `SUBPESTANAS_GENERALI`), UNA vez por subpestaña y trabajo:
 * guard limpio y sin ventanas de red; página `CorredorPortal.po` de www.generali.es; texto en la lista blanca y sin palabras
 * de emisión; el ÚNICO control visible de todos los marcos con ese texto exacto; su descripción (contenedor clicable incluido:
 * href, onclick, ancestros) pasa `comprobarBoton`. Devuelve el marco donde estaba. Un hueco (0 o varios) → inventario, sin pulsar.
 */
export async function pulsarSubpestanaGenerali(page: Page, guard: GuardEmision, texto: string): Promise<Frame> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', 'subpestaña de Generali con una ventana de red abierta')
  if (!subpestanaGeneraliPermitida(texto)) throw new EmisionBloqueadaError('boton', String(texto ?? '').slice(0, 80))
  if (!enRutaGenerali(page, RUTA_PORTAL_GENERALI)) throw new ErrorMapaGuardGenerali('el portal del corredor (CorredorPortal.po) para la subpestaña')
  const clave = `generali:subpestana:${texto}`
  const usados = AVANCES_USADOS.get(guard) ?? new Set<string>()
  if (usados.has(clave)) throw new EmisionBloqueadaError('fase', `la subpestaña «${texto}» de Generali ya se pulsó en este trabajo`)
  await exigirSinCuentaBancaria(page)
  const re = new RegExp(`^\\s*${texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`)
  const hallados: { marco: Frame; control: Locator }[] = []
  for (const f of marcosVivos(page)) {
    const l = f.getByText(re).filter({ visible: true })
    const n = await l.count().catch(() => 0)
    for (let i = 0; i < n; i++) hallados.push({ marco: f, control: l.nth(i) })
  }
  if (hallados.length !== 1) throw new ErrorMapaGuardGenerali(`la subpestaña «${texto}» (${hallados.length} controles visibles con ese texto; hace falta exactamente uno)`)
  const { marco, control } = hallados[0]!
  const desc = await descripcion(control, true)
  if (textoMenu(desc[0]) !== textoMenu(texto)) throw new EmisionBloqueadaError('boton', String(desc[0] ?? '').slice(0, 120))
  comprobarBoton(desc)
  usados.add(clave)
  AVANCES_USADOS.set(guard, usados)
  await control.click()
  guard.comprobar()
  return marco
}

// ─────────── «Selector de vehículos» de Generali (v0.2.6 del bot, 19/10/2026; PrimeFaces, marco `mainFrame`) ───────────
// Inventario real: radios `placaesp:0` (Sí) y `placaesp:1` (No) de «Placas especiales» y botón submit `#confirmar` («Confirmar»,
// PrimeFaces.onPost()). Aquí «Confirmar» SOLO confirma el vehículo elegido: no emite, no contrata, no graba póliza. Lista blanca
// cerrada de texto EXACTO y URL del marco `selVehiculo`; cualquier otro texto u otra URL no se pulsa.

/** Ruta EXACTA (sin `;jsessionid`) del marco del selector de vehículos de www.generali.es. */
export const RUTA_SELECTOR_VEHICULOS_GENERALI = '/mot_motorWeb/mvc/selVehiculo'
/** Botones del selector que el robot puede pulsar: textos EXACTOS. */
export const BOTONES_SELECTOR_VEHICULOS_GENERALI = Object.freeze(['Confirmar', 'Siguiente'] as const)
/** Id del radio «No» de «Placas especiales» (el «Sí» es `placaesp:0` y nunca se marca). */
const ID_PLACAS_NO_GENERALI = 'placaesp:1'

/** ¿`url` es la del marco del selector de vehículos de www.generali.es? Origen y ruta exactos. PURA. */
export function urlSelectorVehiculosGenerali(url: string): boolean {
  try {
    const u = new URL(url)
    return u.origin === ORIGEN_PORTAL_GENERALI && !u.username && !u.password && u.pathname.split(';')[0] === RUTA_SELECTOR_VEHICULOS_GENERALI
  } catch {
    return false
  }
}

/** ¿Puede el robot pulsar, en el selector de vehículos, un botón con ESTE texto? Solo igualdad EXACTA con la lista (el resto de la descripción lo mira `comprobarBoton`). PURA. */
export function botonSelectorVehiculosGeneraliPermitido(texto: string | null | undefined): boolean {
  const t = textoMenu(texto)
  if (t === '') return false
  return (BOTONES_SELECTOR_VEHICULOS_GENERALI as readonly string[]).some((b) => textoMenu(b) === t)
}

/** El ÚNICO marco vivo cuya URL es la del selector de vehículos; 0 o varios → hueco con inventario. */
function marcoSelectorVehiculosGenerali(page: Page): Frame {
  const marcos = marcosVivos(page).filter((f) => urlSelectorVehiculosGenerali(f.url()))
  if (marcos.length !== 1) throw new ErrorMapaGuardGenerali(`el marco «selVehiculo» del selector de vehículos (${marcos.length} marcos con esa URL; hace falta exactamente uno)`)
  return marcos[0]!
}

/** Tope del clic normal de «Confirmar» antes de caer al clic por DOM (0.2.8). */
const MS_CLIC_NORMAL_CONFIRMAR_GENERALI = 5_000

/**
 * «Confirmar» del selector de vehículos, UNA vez por trabajo: guard limpio y sin ventanas de red; marco `selVehiculo` único;
 * en él, exactamente un botón/submit visible cuyo texto es EXACTAMENTE «Confirmar» (`botonSelectorVehiculosGeneraliPermitido`);
 * su descripción completa (onclick, formaction, ancestros) pasa `comprobarBoton`. Un hueco o un texto distinto → no se pulsa.
 */
export async function pulsarConfirmarVehiculoGenerali(page: Page, guard: GuardEmision): Promise<void> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', '«Confirmar» del selector de Generali con una ventana de red abierta')
  const marco = marcoSelectorVehiculosGenerali(page)
  const usados = AVANCES_USADOS.get(guard) ?? new Set<string>()
  if (usados.has('generali:confirmar-vehiculo')) throw new EmisionBloqueadaError('fase', '«Confirmar» del selector de Generali ya se pulsó en este trabajo')
  await exigirSinCuentaBancaria(page)
  const candidatos = marco.locator('button, input[type=submit], input[type=button], input[type=image], a, [role=button]').filter({ visible: true })
  const n = await candidatos.count()
  if (n > 200) throw new ErrorMapaGuardGenerali(`«Confirmar» del selector de vehículos (${n} controles visibles; más de 200, no se puede asegurar que sea único)`)
  const validos: { control: Locator; desc: (string | null)[] }[] = []
  for (let i = 0; i < n; i++) {
    const c = candidatos.nth(i)
    let d: (string | null)[]
    try {
      d = await descripcion(c)
    } catch {
      throw new ErrorMapaGuardGenerali(`«Confirmar» del selector de vehículos (no se pudo leer el control ${i + 1} de ${n})`)
    }
    if (botonSelectorVehiculosGeneraliPermitido(textoControl(d))) validos.push({ control: c, desc: d })
  }
  if (validos.length !== 1) throw new ErrorMapaGuardGenerali(`el botón «Confirmar» del selector de vehículos (${validos.length} visibles con ese texto; hace falta exactamente uno)`)
  const { control, desc } = validos[0]!
  comprobarBoton(desc)
  usados.add('generali:confirmar-vehiculo')
  AVANCES_USADOS.set(guard, usados)
  // 0.2.8: capas de la página padre (chatbot, toolbar) tapan el botón dentro del iframe y el clic por coordenadas agota el tiempo.
  // Clic normal con tope corto; si Playwright agota por intercepción, clic por DOM sobre el MISMO control ya validado (dispara el
  // onclick de PrimeFaces y el submit). Sin `force`, sin ocultar nada de la página.
  try {
    await control.click({ timeout: MS_CLIC_NORMAL_CONFIRMAR_GENERALI })
  } catch (e) {
    if ((e as { name?: string } | null)?.name !== 'TimeoutError') throw e
    guard.comprobar()
    await control.evaluate((el) => (el as HTMLElement).click())
  }
  guard.comprobar()
}

/**
 * «Placas especiales» del selector de vehículos: SOLO «No» (el riesgo no tiene dato de placas especiales; el bot no marca «Sí»).
 * Mismo marco `selVehiculo` único; un solo radio `placaesp:1` cuya etiqueta es «No». Ya marcado → no se toca. Se pulsa su etiqueta.
 */
export async function marcarPlacasEspecialesGenerali(page: Page, guard: GuardEmision, valor: 'No'): Promise<void> {
  guard.comprobar()
  if (valor !== 'No') throw new EmisionBloqueadaError('boton', String(valor).slice(0, 80))
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', 'placas especiales de Generali con una ventana de red abierta')
  const marco = marcoSelectorVehiculosGenerali(page)
  await exigirSinCuentaBancaria(page)
  const radio = marco.locator(`input[type=radio][id="${ID_PLACAS_NO_GENERALI}"]`)
  if ((await radio.count()) !== 1) throw new ErrorMapaGuardGenerali('el radio «No» de «Placas especiales» (no hay exactamente uno)')
  if (await radio.isChecked().catch(() => false)) return
  const etiqueta = marco.locator(`label[for="${ID_PLACAS_NO_GENERALI}"]`).filter({ visible: true })
  if ((await etiqueta.count()) !== 1) throw new ErrorMapaGuardGenerali('la etiqueta «No» de «Placas especiales» (no hay exactamente una visible)')
  const desc = await descripcion(etiqueta)
  if (textoMenu(desc[0]) !== 'NO') throw new EmisionBloqueadaError('boton', String(desc[0] ?? '').slice(0, 120))
  comprobarBoton(desc)
  await etiqueta.click()
  guard.comprobar()
}

// ─────────── v0.2.25: «Confirmar» de «Interesado / Tomador › Datos personas» de Generali (Alberto, 26/10/2026) ───────────
// Alberto AUTORIZA que el bot rellene los datos del tomador y pulse «Confirmar» en ESA pantalla (marco `emiAutosGenB028.do`, pestaña
// «Datos personas»). Puerta acotada: solo `#confirmar`, solo en ese marco (único), solo con la pestaña «Datos personas» activa y el NIF
// relleno, una vez por trabajo, texto EXACTO «Confirmar» y `comprobarBoton`. Un diálogo nativo que salga se CANCELA (nunca se acepta) y
// se devuelve saneado. Cualquier otro «Confirmar» de Generali sigue prohibido (`pulsar` lo rechaza).

/** Lee las pestañas «Datos personas» / «Selección personas…» VISIBLES del marco (la más interna) y si llevan marca de activa. Solo lee. */
const JS_PESTANAS_PERSONAS_GENERALI = `(() => {
  const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[.:]+$/g, '').replace(/\\s+/g, ' ').trim();
  const vis = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  const RE = /^(datos personas|seleccion personas( que intervienen)?)$/;
  const out = [];
  document.querySelectorAll('a,li,td,th,span,div,button,input[type=button],input[type=submit],[role=tab]').forEach((e) => {
    if (!vis(e)) return;
    const t = norm(e.tagName === 'INPUT' ? e.value : e.textContent);
    if (!RE.test(t)) return;
    for (const c of Array.from(e.children)) if (norm(c.tagName === 'INPUT' ? c.value : c.textContent) === t) return;
    let activa = false;
    for (let x = e, n = 0; x && n < 3 && !activa; x = x.parentElement, n++) {
      if (x.getAttribute('aria-selected') === 'true' || x.getAttribute('aria-current') === 'page' || x.getAttribute('aria-current') === 'true') activa = true;
      const cl = typeof x.className === 'string' ? x.className : '';
      if (cl.split(/\\s+/).some((k) => !/inactiv|noactiv|desactiv|unselect|nosel/i.test(k) && (/activ|selected|seleccionad|current/i.test(k) || /^(on|sel)$/i.test(k)))) activa = true;
    }
    out.push({ texto: t, activa: activa });
  });
  return out.slice(0, 12);
})()`

/** Pestañas de personas del marco, ya clasificadas. Solo lee. */
export async function leerPestanasPersonasGenerali(marco: Frame): Promise<PestanaPersonasLeida[]> {
  const crudas = ((await marco.evaluate(JS_PESTANAS_PERSONAS_GENERALI).catch(() => [])) as { texto: string; activa: boolean }[]) ?? []
  const out: PestanaPersonasLeida[] = []
  for (const c of crudas) {
    const tipo = tipoPestanaPersonasGenerali(c.texto)
    if (tipo) out.push({ tipo, activa: !!c.activa })
  }
  return out
}

/** Espera tras «Confirmar» de «Datos personas» por si el portal abre un diálogo nativo (validación). */
export const ESPERA_DIALOGO_DATOS_PERSONAS_GENERALI_MS = 1_500

/**
 * «Confirmar» de «Interesado / Tomador › Datos personas» de Generali, UNA vez por trabajo (autorizado por Alberto el 26/10/2026):
 * guard limpio y sin ventanas de red; marco `emiAutosGenB028.do` de www.generali.es ÚNICO; en él el NIF del tomador visible y RELLENO;
 * pestaña activa «Datos personas» (`pestanaDatosPersonasActivaGenerali`); exactamente un `#confirmar` visible, botón nativo, texto
 * EXACTO «Confirmar»; `comprobarBoton` sobre su descripción completa. Devuelve el diálogo nativo que saliera (tipo + texto SANEADO),
 * que se CANCELA. Cualquier hueco → no se pulsa.
 */
export async function pulsarConfirmarDatosPersonasGenerali(page: Page, guard: GuardEmision, esperaDialogoMs = ESPERA_DIALOGO_DATOS_PERSONAS_GENERALI_MS): Promise<{ dialogo: string | null }> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', '«Confirmar» de «Datos personas» de Generali con una ventana de red abierta')
  const marcos = marcosVivos(page).filter((f) => urlDatosPersonasGenerali(f.url()))
  if (marcos.length !== 1) throw new EmisionBloqueadaError('fase', `«Confirmar» de Generali fuera de «Interesado / Tomador» (${marcos.length} marcos emiAutosGenB028.do; hace falta exactamente uno)`)
  const marco = marcos[0]!
  const usados = AVANCES_USADOS.get(guard) ?? new Set<string>()
  if (usados.has('generali:confirmar-datos-personas')) throw new EmisionBloqueadaError('fase', '«Confirmar» de «Datos personas» de Generali ya se pulsó en este trabajo')
  await exigirSinCuentaBancaria(page)
  const nif = marco.locator(`[id="${PREFIJO_ID_DATOS_PERSONAS_GENERALI}nifcif"]`).filter({ visible: true })
  if ((await nif.count()) !== 1) throw new EmisionBloqueadaError('fase', '«Confirmar» de Generali sin el NIF de «Datos personas» visible (no es esa pestaña)')
  if ((await nif.inputValue().catch(() => '')).trim() === '') throw new EmisionBloqueadaError('fase', '«Confirmar» de «Datos personas» de Generali con el NIF vacío')
  const p = pestanaDatosPersonasActivaGenerali(await leerPestanasPersonasGenerali(marco), true)
  if (!p.ok) throw new EmisionBloqueadaError('fase', `«Confirmar» de Generali fuera de la pestaña «Datos personas» (${p.motivo})`)
  const boton = marco.locator(`[id="${ID_CONFIRMAR_DATOS_PERSONAS_GENERALI}"]`).filter({ visible: true })
  if ((await boton.count()) !== 1) throw new ErrorMapaGuardGenerali('el botón #confirmar de «Datos personas» (no hay exactamente uno visible)')
  const clase = await boton.evaluate((e) => `${e.tagName.toLowerCase()}:${(e.getAttribute('type') ?? '').toLowerCase()}`)
  if (!['input:button', 'input:submit', 'button:', 'button:button', 'button:submit'].includes(clase)) throw new EmisionBloqueadaError('boton', `#confirmar no es un botón (${clase})`)
  const desc = await descripcion(boton)
  if (textoMenu(textoControl(desc)) !== textoMenu('Confirmar')) throw new EmisionBloqueadaError('boton', textoControl(desc).slice(0, 80))
  comprobarBoton(desc)
  usados.add('generali:confirmar-datos-personas')
  AVANCES_USADOS.set(guard, usados)
  let dialogo: string | null = null
  const alDialogo = (d: Dialog) => {
    dialogo ??= `${d.type()}: ${mensajesValidacionGenerali([d.message()])[0] ?? '(sin texto)'}`
    d.dismiss().catch(() => {})
  }
  page.on('dialog', alDialogo)
  try {
    try {
      await boton.click({ timeout: MS_CLIC_NORMAL_CONFIRMAR_GENERALI })
    } catch (e) {
      if ((e as { name?: string } | null)?.name !== 'TimeoutError') throw e
      guard.comprobar()
      await boton.evaluate((el) => (el as HTMLElement).click())
    }
    guard.comprobar()
    const fin = Date.now() + esperaDialogoMs
    while (dialogo === null && Date.now() < fin) await page.waitForTimeout(150)
  } finally {
    page.off('dialog', alDialogo)
  }
  guard.comprobar()
  return { dialogo }
}

// ─────────── v0.2.27: «Siguiente» de «Valoración Riesgo» de Generali (hacia «Garantías y Resultados») ───────────
// La pestaña «Garantías y Resultados» no cambió la pantalla (prueba real con 0.2.26): el avance real es el botón «Siguiente» (#siguiente) del
// marco `emiAutosGenB028.do`. Puerta acotada: solo ese marco (único), solo con el formulario de valoración (tomador `reg1063A_personas_interesado_nifcif`
// RELLENO, sin `#confirmar` de «Datos personas» visible, pestaña «Datos de Valoración»/«Valoración Riesgo» visible), exactamente un `#siguiente`
// visible, botón nativo de texto EXACTO «Siguiente», `comprobarBoton`, y NUNCA si la página o un diálogo muestran emitir/contratar/grabar póliza/
// pagar/firmar. Máximo `MAX_SIGUIENTE_VALORACION_GENERALI` veces por trabajo. «Paso con datos incompletos» no se pulsa. Un diálogo nativo se CANCELA.

/** Veces máximas por trabajo que se puede pulsar «Siguiente» de la valoración de Generali. */
export const MAX_SIGUIENTE_VALORACION_GENERALI = 3
/** Id del botón «Siguiente» del formulario de valoración (inventario real del trabajo 0.2.26). */
export const ID_SIGUIENTE_VALORACION_GENERALI = 'siguiente'
/** Textos de emisión que, visibles en la página o en un diálogo, impiden pulsar «Siguiente». PURA. */
export function textoEmisionGenerali(texto: string): boolean {
  return casaEmisionGenerali(texto) !== null
}

const RE_EMISION_GENERALI = regexPalabras(BLOQUEO.emision_pagina)
const sinTildesMinus = (x: string) => String(x ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/**
 * v0.2.32: lo que casó del patrón de emisión, para el motivo del bloqueo: la palabra y un contexto corto (±60 caracteres dentro de su línea, espacios colapsados,
 * cifras largas enmascaradas: sin datos personales). `null` = no casa. PURA.
 */
export function casaEmisionGenerali(texto: string): string | null {
  const t = sinTildesMinus(texto)
  const m = RE_EMISION_GENERALI.exec(t)
  if (!m) return null
  // v0.2.34: el contexto no cruza el salto de línea (la LÍNEA de la página donde está la palabra) y llega a ±60 caracteres: con ±25 no se veía de qué texto era.
  const ini = Math.max(t.lastIndexOf('\n', m.index) + 1, m.index - 60)
  const finLinea = t.indexOf('\n', m.index)
  const fin = Math.min(finLinea < 0 ? t.length : finLinea, m.index + m[0].length + 60)
  const ctx = t.slice(ini, fin).replace(/\s+/g, ' ').replace(/\d{4,}/g, '#').trim()
  return `«${m[0]}» en «…${ctx}…»`
}

/** Líneas que cierran la sección «Envío Documentación Precontractual» (encabezados y botones del marco de garantías). */
const RE_FIN_SECCION_PRECONTRACTUAL = /^(garantias y capitales opcionales|bonus-malus|modalidades de seguro|historial siniestral|comparar|volver|(« ?)?inicio|(‹ ?)?anterior|siguiente)\b/

/** v0.2.32: palabras de contexto de la prosa de la sección precontractual (documentación/envío al cliente); sin ellas una línea con verbo de emisión sigue a la vista. */
const RE_PROSA_PRECONTRACTUAL = /documentacion|precontractual|informacion|enviar|envio|cliente|tomador|correo|email|e-mail/

/** Línea que `JS_TEXTOS_AVISO_GENERALI` pone antes del texto de los diálogos/modales visibles: la sección precontractual termina ahí. */
const MARCA_DIALOGO_GENERALI = '[[DIALOGO]]'

/** Verbos de emisión que, como núcleo de una PREGUNTA, nunca son prosa informativa. */
const RE_VERBO_PREGUNTA_EMISION = /\b(emit|contrat|pag|firm|formaliz)\w*/

/**
 * v0.2.32: quita del texto de «Garantías y Capitales opcionales» la sección «Envío Documentación Precontractual» (desde su encabezado hasta el
 * siguiente encabezado/botón conocido) y la frase «documentación precontractual». Dentro de la sección solo se excusa PROSA (más de 4 palabras que habla de documentación/envío/cliente): una línea corta
 * o sin ese contexto con verbo de emisión («Emitir póliza», «Pulse para emitir la póliza») sigue a la vista y bloquea. PURA.
 */
export function sinSeccionPrecontractualGenerali(texto: string): string {
  const lineas = String(texto ?? '').split(/\r?\n/)
  const fuera: string[] = []
  let dentro = false
  for (const l of lineas) {
    const n = sinTildesMinus(l).replace(/\s+/g, ' ').trim()
    if (!dentro && /^envio documentacion precontractual\b/.test(n)) { dentro = true; continue }
    if (dentro && (RE_FIN_SECCION_PRECONTRACTUAL.test(n) || n.startsWith(MARCA_DIALOGO_GENERALI.toLowerCase()))) dentro = false
    // Prosa excusable: >4 palabras con contexto de documentación/envío, SIN «póliza» y que no sea una PREGUNTA con verbo de emisión («¿Desea emitir…?»).
    const prosa = n.split(' ').length > 4 && RE_PROSA_PRECONTRACTUAL.test(n) && !/poliza/.test(n) && !(/[¿?]/.test(n) && RE_VERBO_PREGUNTA_EMISION.test(n))
    if (dentro && !(casaEmisionGenerali(l) !== null && !prosa)) continue
    fuera.push(l)
  }
  return fuera.join('\n').replace(/documentaci[oó]n precontractual/gi, '')
}

/**
 * v0.2.41: rótulo INFORMATIVO de «Garantías y Resultados» de Generali (elegir la forma de pago del recibo; prueba real con 0.2.40: bloqueó «Recalcular» por «contratar»).
 * Se excusa SOLO esta frase exacta (sin tildes, mayúsculas ni espacios de más); cualquier otro «contratar»/«emitir»/«pagar» sigue casando. Mismo mecanismo que
 * `sinSeccionPrecontractualGenerali` (texto de la página antes de `casaEmisionGenerali`). PURA.
 */
export function sinRotulosInformativosGenerali(texto: string): string {
  return String(texto ?? '').replace(/forma\s+de\s+pago\s+a\s+contratar(?![\p{L}\p{N}])/giu, '')
}

/** 26/10/2026: el término «siguiente» sale de `vocabulario.ts` (concepto `avanzar`); aquí solo los adornos admitidos al final (`›`, `>`, `»`, espacios, NBSP). */
const RE_SIGUIENTE_GENERALI = regexRotuloConAdornos(CONCEPTOS_ACCION.avanzar.grupos.siguiente[0]!)

/**
 * v0.2.29: texto del botón «Siguiente» tal como lo pinta Generali: «Siguiente ›» (prueba real con 0.2.28). Tras normalizar, la palabra EXACTA
 * «Siguiente» seguida solo de adornos al final (`›`, `>`, `»`, espacios, incl. NBSP). Nada antes, nada de otras palabras. PURA.
 */
export function esTextoSiguienteGenerali(texto: string): boolean {
  return RE_SIGUIENTE_GENERALI.test(textoMenu(String(texto ?? '').replace(/ /g, ' ')))
}

/** Prefijo de los ids del bloque «Interesado / Tomador» del formulario de valoración. */
const PREFIJO_ID_INTERESADO_VALORACION_GENERALI = 'reg1063A_personas_interesado_'

const JS_TEXTOS_AVISO_GENERALI = `(() => {
  const vis = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  const cuerpo = document.body ? document.body.innerText || '' : '';
  const dlg = Array.from(document.querySelectorAll('[role=dialog],[role=alertdialog],.modal,.ui-dialog,.ui-dialog-content')).filter(vis).map((e) => e.innerText || '').join('\\n');
  return dlg ? cuerpo + '\\n[[DIALOGO]]\\n' + dlg : cuerpo + '\\n';
})()`

export async function pulsarSiguienteValoracionGenerali(page: Page, guard: GuardEmision, esperaDialogoMs = 1_500): Promise<{ dialogo: string | null }> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', '«Siguiente» de Generali con una ventana de red abierta')
  const marcos = marcosVivos(page).filter((f) => urlDatosPersonasGenerali(f.url()))
  if (marcos.length !== 1) throw new EmisionBloqueadaError('fase', `«Siguiente» de Generali fuera de emiAutosGenB028.do (${marcos.length} marcos; hace falta exactamente uno)`)
  const marco = marcos[0]!
  const usados = AVANCES_USADOS.get(guard) ?? new Set<string>()
  let n = 0
  while (usados.has(`generali:siguiente-valoracion:${n + 1}`)) n++
  if (n >= MAX_SIGUIENTE_VALORACION_GENERALI) throw new EmisionBloqueadaError('fase', `«Siguiente» de la valoración de Generali ya se pulsó ${n} veces en este trabajo`)
  await exigirSinCuentaBancaria(page)
  const nif = marco.locator(`[id="${PREFIJO_ID_INTERESADO_VALORACION_GENERALI}nifcif"]`).filter({ visible: true })
  // v0.2.30: segunda pantalla del mismo marco, «Garantías y Capitales opcionales» (sin el formulario de valoración): «Siguiente» solo SIN precio legible
  // y con el tomador ya confirmado en este trabajo. Sigue exigiendo el resto (marco único, un #siguiente nativo, sin textos de emisión, máx. 3).
  if ((await nif.count()) === 1) {
    if ((await nif.inputValue().catch(() => '')).trim() === '') throw new EmisionBloqueadaError('fase', '«Siguiente» de Generali con el tomador sin confirmar (NIF vacío)')
    if ((await marco.locator(`[id="${ID_CONFIRMAR_DATOS_PERSONAS_GENERALI}"]`).filter({ visible: true }).count()) > 0) throw new EmisionBloqueadaError('fase', '«Siguiente» de Generali con «Datos personas» abierto (no es la valoración)')
    const pest = marco.getByText(/^\s*(Datos de Valoración|Valoración Riesgo)\s*$/).filter({ visible: true })
    if ((await pest.count()) < 1) throw new EmisionBloqueadaError('fase', '«Siguiente» de Generali fuera de «Valoración Riesgo»/«Datos de Valoración»')
  } else {
    const textoMarco = (await marco.evaluate(JS_TEXTOS_AVISO_GENERALI).catch(() => '')) as string
    if ((await nif.count()) !== 0 || !esPantallaGarantiasCapitalesGenerali(textoMarco)) throw new EmisionBloqueadaError('fase', '«Siguiente» de Generali sin el formulario de valoración (no hay tomador visible)')
    if (!usados.has('generali:confirmar-datos-personas')) throw new EmisionBloqueadaError('fase', '«Siguiente» de Generali en «Garantías y Capitales opcionales» sin el tomador confirmado en este trabajo')
    if ((await marco.locator(`[id="${ID_CONFIRMAR_DATOS_PERSONAS_GENERALI}"]`).filter({ visible: true }).count()) > 0) throw new EmisionBloqueadaError('fase', '«Siguiente» de Generali con «Datos personas» abierto (no es la valoración)')
    if (leerPrecioGenerali(textoMarco).tipo !== 'ninguno') throw new EmisionBloqueadaError('fase', '«Siguiente» de Generali en «Garantías y Capitales opcionales» con un precio ya legible (no hace falta avanzar)')
  }
  for (const f of marcosVivos(page)) {
    const t0 = (await f.evaluate(JS_TEXTOS_AVISO_GENERALI).catch(() => '')) as string
    // v0.2.32: en «Garantías y Capitales opcionales» (marco B028) la sección «Envío Documentación Precontractual» no cuenta como emisión.
    const t = f === marco && esPantallaGarantiasCapitalesGenerali(t0) ? sinSeccionPrecontractualGenerali(t0) : t0
    const casa = casaEmisionGenerali(t)
    if (casa !== null) throw new EmisionBloqueadaError('fase', `«Siguiente» de Generali: casó ${casa.slice(0, 200)} (textos de emisión/contratación/pago/firma en la página o en un diálogo)`)
  }
  const boton = marco.locator(`[id="${ID_SIGUIENTE_VALORACION_GENERALI}"]`).filter({ visible: true })
  if ((await boton.count()) !== 1) throw new ErrorMapaGuardGenerali('el botón #siguiente de la valoración (no hay exactamente uno visible)')
  const clase = await boton.evaluate((e) => `${e.tagName.toLowerCase()}:${(e.getAttribute('type') ?? '').toLowerCase()}`)
  if (!['input:button', 'input:submit', 'button:', 'button:button', 'button:submit'].includes(clase)) throw new EmisionBloqueadaError('boton', `#siguiente no es un botón (${clase})`)
  const desc = await descripcion(boton)
  if (!esTextoSiguienteGenerali(textoControl(desc))) throw new EmisionBloqueadaError('boton', textoControl(desc).slice(0, 80))
  comprobarBoton(desc)
  usados.add(`generali:siguiente-valoracion:${n + 1}`)
  AVANCES_USADOS.set(guard, usados)
  let dialogo: string | null = null
  const alDialogo = (d: Dialog) => {
    dialogo ??= `${d.type()}: ${mensajesValidacionGenerali([d.message()])[0] ?? '(sin texto)'}`
    d.dismiss().catch(() => {})
  }
  page.on('dialog', alDialogo)
  try {
    try {
      await boton.click({ timeout: MS_CLIC_NORMAL_CONFIRMAR_GENERALI })
    } catch (e) {
      if ((e as { name?: string } | null)?.name !== 'TimeoutError') throw e
      guard.comprobar()
      await boton.evaluate((el) => (el as HTMLElement).click())
    }
    guard.comprobar()
    const fin = Date.now() + esperaDialogoMs
    while (dialogo === null && Date.now() < fin) await page.waitForTimeout(150)
  } finally {
    page.off('dialog', alDialogo)
  }
  guard.comprobar()
  return { dialogo }
}

// ─────────── v0.2.39: «Recalcular» de la botonera «Acciones» de Generali (calcula la tabla «Modalidades de Seguro») ───────────
// Prueba real con 0.2.38: «Garantías y Resultados» llega con la tabla de modalidades VACÍA (el portal no ha calculado). La botonera inferior de
// `emiAutosGenB028.do` trae «Acciones › Recalcular» (`link('calcular')`) junto a «Guardar Cálculo» (`grabarCalcRap`): ese SÍ guarda y NUNCA se pulsa.
// Puerta acotada: texto EXACTO «Recalcular», marco `emiAutosGenB028.do` único, UNA vez por trabajo, sin textos de emisión en la página, `comprobarBoton`,
// y rechazo explícito si el texto o el `onclick` del control o de su contenedor hablan de guardar/grabar/emitir/contratar/pagar/firmar.

/** Texto EXACTO de la acción que calcula las modalidades. */
export const TEXTO_RECALCULAR_GENERALI = 'Recalcular'
/** Lo que nunca puede llevar el texto ni el `onclick` de la acción pulsable (sin tildes, sin mayúsculas). */
const RE_RECALCULAR_PELIGROSO_GENERALI = /guard|grab|emit|emisi|contrat|firm|pag(a|o|ar)|acept|formaliz|suplement|anul|calcrap/i

/** ¿Puede el robot pulsar la acción de la botonera con ESTE texto? Solo «Recalcular» exacto (salvo espacios y mayúsculas) y sin nada peligroso. PURA. */
export function recalcularGeneraliPermitido(texto: string | null | undefined): boolean {
  const t = textoMenu(texto)
  if (t === '' || RE_RECALCULAR_PELIGROSO_GENERALI.test(sinTildesNi(t))) return false
  return t === textoMenu(TEXTO_RECALCULAR_GENERALI)
}

export async function pulsarRecalcularGenerali(page: Page, guard: GuardEmision): Promise<{ dialogo: string | null }> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', '«Recalcular» de Generali con una ventana de red abierta')
  const marcos = marcosVivos(page).filter((f) => urlDatosPersonasGenerali(f.url()))
  if (marcos.length !== 1) throw new EmisionBloqueadaError('fase', `«Recalcular» de Generali fuera de emiAutosGenB028.do (${marcos.length} marcos; hace falta exactamente uno)`)
  const marco = marcos[0]!
  const usados = AVANCES_USADOS.get(guard) ?? new Set<string>()
  if (usados.has('generali:recalcular')) throw new EmisionBloqueadaError('fase', '«Recalcular» de Generali ya se pulsó en este trabajo')
  await exigirSinCuentaBancaria(page)
  for (const f of marcosVivos(page)) {
    const casa = casaEmisionGenerali(sinRotulosInformativosGenerali(sinSeccionPrecontractualGenerali((await f.evaluate(JS_TEXTOS_AVISO_GENERALI).catch(() => '')) as string)))
    if (casa !== null) throw new EmisionBloqueadaError('fase', `«Recalcular» de Generali: casó ${casa.slice(0, 200)} (textos de emisión/contratación/pago/firma en la página o en un diálogo)`)
  }
  const control = marco.getByText(new RegExp(`^\\s*${TEXTO_RECALCULAR_GENERALI}\\s*$`)).filter({ visible: true })
  let n = await control.count()
  // v0.2.40: la botonera es un menú «Acciones» (`ul.dropdown`): si el enlace no está a la vista se SOBREVUELA el rótulo «Acciones» (un hover no pulsa nada) y se vuelve a contar.
  if (n === 0) {
    const titulo = marco.getByText(/^\s*Acciones\s*$/).filter({ visible: true })
    if ((await titulo.count()) === 1) {
      await titulo.hover({ timeout: 1_500 }).catch(() => undefined)
      await page.waitForTimeout(400)
      n = await control.count()
    }
  }
  if (n !== 1) throw new ErrorMapaGuardGenerali(`la acción «${TEXTO_RECALCULAR_GENERALI}» (${n} controles visibles con ese texto; hace falta exactamente uno)`)
  const desc = await descripcion(control, true)
  if (!recalcularGeneraliPermitido(textoControl(desc))) throw new EmisionBloqueadaError('boton', textoControl(desc).slice(0, 80))
  if (desc.some((d) => d !== null && RE_RECALCULAR_PELIGROSO_GENERALI.test(sinTildesNi(d)))) throw new EmisionBloqueadaError('boton', desc.filter(Boolean).join(' | ').slice(0, 120))
  comprobarBoton(desc)
  usados.add('generali:recalcular')
  AVANCES_USADOS.set(guard, usados)
  let dialogo: string | null = null
  const alDialogo = (d: Dialog) => {
    dialogo ??= `${d.type()}: ${mensajesValidacionGenerali([d.message()])[0] ?? '(sin texto)'}`
    d.dismiss().catch(() => {})
  }
  page.on('dialog', alDialogo)
  try {
    await control.click({ timeout: MS_CLIC_NORMAL_CONFIRMAR_GENERALI })
    guard.comprobar()
    const fin = Date.now() + 1_500
    while (dialogo === null && Date.now() < fin) await page.waitForTimeout(150)
    // v0.2.40: «link('calcular')» recarga el marco; se espera (acotado) a que termine antes de releer la tabla.
    await marco.waitForLoadState('load', { timeout: 10_000 }).catch(() => undefined)
  } finally {
    page.off('dialog', alDialogo)
  }
  guard.comprobar()
  return { dialogo }
}

// ─────────── v0.2.14: potencia y fila de versión del selector de vehículos ───────────
// Tras el modelo el selector enseña «Potencia» (grupo de opciones «116.0 CV»…), «Versión» y una tabla Código | Modelo | Versión. Dos puertas
// nuevas, ambas con marco `selVehiculo` único, una vez por trabajo y `comprobarBoton` sobre el control: la potencia (SOLO un grupo que no es
// «Placas especiales» y cuya etiqueta es «NNN CV») y la fila de la tabla (texto EXACTO de la celda «Versión», y del «Código» si lo hay).
// Avanzar (pasar a «Datos de Valoración») es `pulsarConfirmarVehiculoGenerali`: botón de texto exacto «Siguiente» o «Confirmar».

/** Etiqueta de una opción de potencia: «116.0 CV», «131 CV». Nada más. */
const RE_POTENCIA_GENERALI = /^\d{2,4}(?:[.,]\d+)?\s*CV$/i
/** Nombre de un grupo de opciones del selector que NO es «Placas especiales» (id/name simple de PrimeFaces, con `:`). */
const esGrupoPotenciaGenerali = (g: string) => /^[A-Za-z][A-Za-z0-9_:.-]{0,60}$/.test(g) && !/^placaesp/i.test(g)
/** v0.2.17: el grupo de combustible además tiene que llamarse combustible/carburante. */
const esGrupoCombustibleGenerali = (g: string) => esGrupoPotenciaGenerali(g) && /combust|carbur/i.test(g)
/** Mayúsculas sin tildes ni espacios dobles (solo para las listas blancas de texto de los grupos del selector). */
const sinTildesGenerali = (t: string) => textoMenu(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
/** v0.2.17: «No lo sé» de los grupos del selector (potencia y combustible). */
const esNoLoSeGenerali = (t: string) => sinTildesGenerali(t) === 'NO LO SE'
/** v0.2.17: textos EXACTOS que la puerta de combustible puede marcar. Nada más. */
const COMBUSTIBLES_SELECTOR_GENERALI = Object.freeze(['DIESEL', 'GASOLINA', 'ELECTRICO', 'HIBRIDO', 'HIBRIDO ENCHUFABLE', 'GLP', 'GNC', 'HIDROGENO', 'NO LO SE'])

/** Literal XPath seguro para un texto (con comillas dobles, simples o ambas). */
function literalXpath(t: string): string {
  if (!t.includes('"')) return `"${t}"`
  if (!t.includes("'")) return `'${t}'`
  return 'concat(' + t.split('"').map((x) => `"${x}"`).join(`, '"', `) + ')'
}

/**
 * Marca la opción de texto EXACTO `t` del grupo `grupo` del selector (marco `selVehiculo` único), UNA vez por `clave`: exactamente una
 * opción con ese texto, su etiqueta visible y su descripción pasan `comprobarBoton`. Ya marcada → no se toca (y no gasta la puerta).
 */
async function marcarOpcionGrupoGenerali(page: Page, guard: GuardEmision, grupo: string, t: string, clave: string, que: string): Promise<void> {
  const marco = marcoSelectorVehiculosGenerali(page)
  const usados = AVANCES_USADOS.get(guard) ?? new Set<string>()
  if (usados.has(clave)) throw new EmisionBloqueadaError('fase', `${que} del selector de Generali ya se eligió en este trabajo`)
  await exigirSinCuentaBancaria(page)
  const radios = marco.locator(`input[type=radio][name="${grupo.replace(/"/g, '')}"]`)
  const n = await radios.count()
  if (n === 0 || n > 40) throw new ErrorMapaGuardGenerali(`el grupo de ${que} «${grupo.slice(0, 60)}» (${n} opciones; hace falta entre 1 y 40)`)
  const casan: { id: string; marcada: boolean }[] = []
  for (let i = 0; i < n; i++) {
    const r = radios.nth(i)
    const id = (await r.getAttribute('id').catch(() => null)) ?? ''
    if (id === '') continue
    const lab = marco.locator(`label[for="${id.replace(/"/g, '')}"]`)
    const et = ((await lab.first().innerText().catch(() => '')) ?? '').normalize('NFC').replace(/\s+/g, ' ').trim()
    if (et === t) casan.push({ id, marcada: await r.isChecked().catch(() => false) })
  }
  if (casan.length !== 1) throw new ErrorMapaGuardGenerali(`${que} «${t}» del grupo «${grupo.slice(0, 60)}» (${casan.length} opciones con ese texto exacto; hace falta exactamente una)`)
  if (casan[0]!.marcada) return
  const etiqueta = marco.locator(`label[for="${casan[0]!.id.replace(/"/g, '')}"]`).filter({ visible: true })
  if ((await etiqueta.count()) !== 1) throw new ErrorMapaGuardGenerali(`la etiqueta visible de ${que} «${t}»`)
  const desc = await descripcion(etiqueta)
  if (textoMenu(desc[0]) !== textoMenu(t)) throw new EmisionBloqueadaError('boton', String(desc[0] ?? '').slice(0, 120))
  comprobarBoton(desc)
  usados.add(clave)
  AVANCES_USADOS.set(guard, usados)
  await etiqueta.click()
  guard.comprobar()
}

/** Marca la potencia `texto` («116.0 CV» o, v0.2.17, «No lo sé») del grupo `grupo`, UNA vez por trabajo. Ya marcada → no se toca (y no gasta la puerta). */
export async function elegirPotenciaGenerali(page: Page, guard: GuardEmision, grupo: string, texto: string): Promise<void> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', 'la potencia del selector de Generali con una ventana de red abierta')
  const t = (texto ?? '').normalize('NFC').replace(/\s+/g, ' ').trim()
  if (typeof grupo !== 'string' || !esGrupoPotenciaGenerali(grupo)) throw new EmisionBloqueadaError('boton', String(grupo ?? '').slice(0, 80))
  if (!RE_POTENCIA_GENERALI.test(t) && !esNoLoSeGenerali(t)) throw new EmisionBloqueadaError('boton', t.slice(0, 80))
  await marcarOpcionGrupoGenerali(page, guard, grupo, t, 'generali:elegir-potencia', 'la potencia')
}

/**
 * v0.2.17: marca el combustible `texto` (lista blanca cerrada: Diésel, Gasolina… o «No lo sé») del grupo `grupo` (que se llama
 * combustible/carburante y no es «Placas especiales»), UNA vez por trabajo. Mismo marco y mismas comprobaciones que la potencia.
 */
export async function elegirCombustibleGenerali(page: Page, guard: GuardEmision, grupo: string, texto: string): Promise<void> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', 'el combustible del selector de Generali con una ventana de red abierta')
  const t = (texto ?? '').normalize('NFC').replace(/\s+/g, ' ').trim()
  if (typeof grupo !== 'string' || !esGrupoCombustibleGenerali(grupo)) throw new EmisionBloqueadaError('boton', String(grupo ?? '').slice(0, 80))
  if (!COMBUSTIBLES_SELECTOR_GENERALI.includes(sinTildesGenerali(t))) throw new EmisionBloqueadaError('boton', t.slice(0, 80))
  await marcarOpcionGrupoGenerali(page, guard, grupo, t, 'generali:elegir-combustible', 'el combustible')
}

/**
 * Pulsa la fila de la tabla Código | Modelo | Versión cuya celda «Versión» es EXACTAMENTE `version` (y la de «Código» `codigo`, si se da),
 * UNA vez por trabajo. Exactamente una fila visible; el texto de la fila y sus atributos pasan `comprobarBoton`. Ya resaltada → no se toca.
 */
export async function elegirFilaVersionGenerali(page: Page, guard: GuardEmision, codigo: string | null, version: string): Promise<void> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', 'la fila de versión del selector de Generali con una ventana de red abierta')
  const v = (version ?? '').normalize('NFC').replace(/\s+/g, ' ').trim()
  const c = (codigo ?? '').normalize('NFC').replace(/\s+/g, ' ').trim()
  if (v === '' || v.length > 200 || c.length > 40) throw new EmisionBloqueadaError('boton', v.slice(0, 80))
  const marco = marcoSelectorVehiculosGenerali(page)
  const usados = AVANCES_USADOS.get(guard) ?? new Set<string>()
  if (usados.has('generali:elegir-version')) throw new EmisionBloqueadaError('fase', 'la fila de versión del selector de Generali ya se eligió en este trabajo')
  await exigirSinCuentaBancaria(page)
  const xp = `xpath=//tr[td[normalize-space(.)=${literalXpath(v)}]${c !== '' ? `][td[normalize-space(.)=${literalXpath(c)}]` : ''}]`
  const fila = marco.locator(xp).filter({ visible: true })
  const n = await fila.count()
  if (n !== 1) throw new ErrorMapaGuardGenerali(`la fila de la versión «${v.slice(0, 60)}» (${n} filas visibles con ese texto exacto; hace falta exactamente una)`)
  const seleccionada = await fila.evaluate((el) => el.classList.contains('ui-state-highlight') || el.getAttribute('aria-selected') === 'true').catch(() => false)
  if (seleccionada) return
  const desc = await descripcion(fila)
  comprobarBoton(desc)
  usados.add('generali:elegir-version')
  AVANCES_USADOS.set(guard, usados)
  try {
    await fila.click({ timeout: MS_CLIC_NORMAL_CONFIRMAR_GENERALI })
  } catch (e) {
    if ((e as { name?: string } | null)?.name !== 'TimeoutError') throw e
    guard.comprobar()
    await fila.evaluate((el) => (el as HTMLElement).click())
  }
  guard.comprobar()
}

/** Avanza el selector de vehículos (a «Datos de Valoración»): el botón exacto «Siguiente» o «Confirmar» del marco `selVehiculo`, una vez. */
export const pulsarAvanzarSelectorVehiculosGenerali = (page: Page, guard: GuardEmision): Promise<void> => pulsarConfirmarVehiculoGenerali(page, guard)

// ─────────── Desplegable «Todas las marcas» del selector de vehículos (v0.2.7, 19/10/2026) ───────────
// Fallo real de la 0.2.6: el bot pulsó `div#buscamarca` por `pulsar()`; su descripción llevaba el innerText de las 630 opciones del
// `<select>` oculto que contiene, y alguna marca casó con el patrón de emisión (el guard bloqueó, con razón). Ahora el clic de
// apertura va SOLO al disparador propio de PrimeFaces (sin opciones dentro) y el de la marca, al `li` de texto exacto; ambos por
// puerta, con URL `selVehiculo`, id EXACTO `buscamarca` y una vez por trabajo. El patrón de emisión NO se relaja.

/** Único id de SelectOneMenu cuyo desplegable puede abrir el robot en el selector de vehículos. */
export const ID_MENU_MARCAS_GENERALI = 'buscamarca'
/** Una descripción de disparador más larga que esto no es un disparador (arrastra el texto de las opciones): no se pulsa. */
const MAX_TEXTO_DISPARADOR_GENERALI = 80

/** Preámbulo común de las puertas de los desplegables del selector: guard limpio, sin ventanas, id permitido, marco único y una vez. */
async function prepararPuertaMenuGenerali(page: Page, guard: GuardEmision, base: string, idValido: (b: string) => boolean, clave: string, que: string): Promise<{ marco: Frame; usados: Set<string> }> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', `${que} de Generali con una ventana de red abierta`)
  if (typeof base !== 'string' || !idValido(base)) throw new EmisionBloqueadaError('boton', String(base ?? '').slice(0, 80))
  const marco = marcoSelectorVehiculosGenerali(page)
  const usados = AVANCES_USADOS.get(guard) ?? new Set<string>()
  if (usados.has(clave)) throw new EmisionBloqueadaError('fase', `${que} de Generali ya se hizo en este trabajo`)
  await exigirSinCuentaBancaria(page)
  return { marco, usados }
}

/**
 * v0.2.16: la puerta de modelo admite UNA segunda ronda (abrir + elegir) SOLO si la primera elección fue «Otros…» (fallo real de la 0.2.15:
 * «Otros modelos ...» recarga la lista y el modelo hay que elegirlo en la lista nueva). La segunda ronda usa su propia clave (`<clave>:2`),
 * también una vez, y nunca vuelve a elegir «Otros». Devuelve la clave a gastar.
 */
const CLAVE_MODELO_OTROS_GENERALI = 'generali:modelo-otros'
function claveRondaModeloGenerali(guard: GuardEmision, clave: string): string {
  const usados = AVANCES_USADOS.get(guard) ?? new Set<string>()
  return usados.has(clave) && usados.has(CLAVE_MODELO_OTROS_GENERALI) ? `${clave}:2` : clave
}
const esTextoOtrosGenerali = (t: string) => /^OTROS\b/.test(textoMenu(t))

const esIdMarcasGenerali = (b: string) => b === ID_MENU_MARCAS_GENERALI
/** Id de un SelectOneMenu de PrimeFaces distinto del de marcas y que no sea uno de sus elementos internos (`_input`, `_panel`, `_label`…). */
const esIdModeloGenerali = (b: string) => /^[A-Za-z][A-Za-z0-9_-]{0,40}$/.test(b) && b !== ID_MENU_MARCAS_GENERALI && !/_(input|panel|label|items|focus|filter)$/i.test(b)

/** Abre un SelectOneMenu pulsando SOLO su disparador propio (sin opciones dentro). Una vez por `clave`. */
async function abrirMenuGenerali(page: Page, guard: GuardEmision, base: string, idValido: (b: string) => boolean, clave: string, que: string): Promise<void> {
  const { marco, usados } = await prepararPuertaMenuGenerali(page, guard, base, idValido, clave, que)
  const menu = marco.locator(`[id="${base}"]`)
  if ((await menu.count()) !== 1) throw new ErrorMapaGuardGenerali(`el desplegable «#${base}» del selector de vehículos (no hay exactamente uno)`)
  let disparador = marco.locator(`[id="${base}"] .ui-selectonemenu-trigger`).filter({ visible: true })
  if ((await disparador.count()) !== 1) disparador = marco.locator(`[id="${base}_label"]`).filter({ visible: true })
  const n = await disparador.count()
  if (n !== 1) throw new ErrorMapaGuardGenerali(`el disparador del desplegable «#${base}» (ni «.ui-selectonemenu-trigger» ni «#${base}_label» visibles y únicos; hay ${n})`)
  const desc = await descripcion(disparador)
  if (String(desc[0] ?? '').length > MAX_TEXTO_DISPARADOR_GENERALI) throw new ErrorMapaGuardGenerali(`el disparador del desplegable «#${base}» (su descripción arrastra ${String(desc[0]).length} caracteres: no es un disparador sin opciones)`)
  comprobarBoton(desc)
  usados.add(clave)
  AVANCES_USADOS.set(guard, usados)
  await disparador.click()
  guard.comprobar()
}

/** Pulsa el `li` de `data-label` EXACTO del panel `#<base>_panel`. Exactamente uno; su texto y atributos pasan `comprobarBoton`. Una vez por `clave`. */
async function elegirItemMenuGenerali(page: Page, guard: GuardEmision, base: string, texto: string, idValido: (b: string) => boolean, clave: string, que: string, primeraDeIguales = false): Promise<void> {
  const { marco, usados } = await prepararPuertaMenuGenerali(page, guard, base, idValido, clave, que)
  const t = (texto ?? '').normalize('NFC').replace(/\s+/g, ' ').trim()
  if (t === '') throw new EmisionBloqueadaError('boton', '')
  const etq = texto.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const todos = marco.locator(`[id="${base}_panel"] li[data-label="${etq}"]`)
  const n = await todos.count()
  // v0.2.17: la versión puede venir REPETIDA con el mismo texto exacto (prueba real): solo ahí se admite la PRIMERA de las idénticas (tope 40).
  if (primeraDeIguales ? n < 1 || n > 40 : n !== 1) throw new ErrorMapaGuardGenerali(`la opción «${t.slice(0, 60)}» en el panel «#${base}_panel» (${n} elementos con ese texto exacto; hace falta ${primeraDeIguales ? 'al menos uno' : 'exactamente uno'})`)
  const item = todos.first()
  const desc = await descripcion(item)
  if (textoMenu(desc[0]) !== textoMenu(t)) throw new EmisionBloqueadaError('boton', String(desc[0] ?? '').slice(0, 120))
  comprobarBoton(desc)
  usados.add(clave)
  AVANCES_USADOS.set(guard, usados)
  await item.click()
  guard.comprobar()
}

/**
 * Abre el desplegable «Todas las marcas» (`#buscamarca`), UNA vez por trabajo, pulsando SOLO su disparador propio:
 * `.ui-selectonemenu-trigger` o, en su defecto, `#buscamarca_label` (ninguno contiene las opciones). Debe haber exactamente un
 * `#buscamarca` y exactamente un disparador visible; si no, hueco con inventario sin pulsar. `comprobarBoton` sobre la
 * descripción del DISPARADOR (nunca la del `div#buscamarca`, que contiene el `<select>` con todas las marcas).
 */
export async function abrirDesplegableMarcaGenerali(page: Page, guard: GuardEmision, base: string): Promise<void> {
  await abrirMenuGenerali(page, guard, base, esIdMarcasGenerali, 'generali:abrir-marcas', 'el desplegable de marcas')
}

/**
 * Pulsa el `li` de la marca elegida (`data-label` EXACTO) del panel `#buscamarca_panel`, UNA vez por trabajo. Exactamente un `li`;
 * su texto visible es el de la marca y, junto con sus atributos y ancestros, pasa `comprobarBoton`: si la marca casa con el patrón
 * de emisión se BLOQUEA (fail-closed, correcto).
 */
export async function elegirMarcaListaGenerali(page: Page, guard: GuardEmision, base: string, texto: string): Promise<void> {
  await elegirItemMenuGenerali(page, guard, base, texto, esIdMarcasGenerali, 'generali:elegir-marca', 'la marca de la lista')
}

// v0.2.11 (19/10/2026): tras la marca aparece «Modelo» (otro SelectOneMenu de PrimeFaces, id que descubre el adaptador). Mismas reglas que
// la marca: id de menú válido (no el de marcas ni sus elementos internos), solo el disparador propio, `li` de texto exacto (también «Otros»)
// por `comprobarBoton`, URL `selVehiculo` y una vez por trabajo cada puerta.

/** v0.2.17: ids de menú usados como «Modelo» en cada trabajo (la puerta de versión nunca abre ni elige en el menú de modelos). */
const BASES_MODELO_GENERALI = new WeakMap<GuardEmision, Set<string>>()
function anotarBaseModeloGenerali(guard: GuardEmision, base: string): void {
  const s = BASES_MODELO_GENERALI.get(guard) ?? new Set<string>()
  s.add(base)
  BASES_MODELO_GENERALI.set(guard, s)
}

/** Abre el desplegable «Modelo» por su disparador propio, UNA vez por trabajo. */
export async function abrirDesplegableModeloGenerali(page: Page, guard: GuardEmision, base: string): Promise<void> {
  if (typeof base === 'string' && esIdModeloGenerali(base)) anotarBaseModeloGenerali(guard, base)
  await abrirMenuGenerali(page, guard, base, esIdModeloGenerali, claveRondaModeloGenerali(guard, 'generali:abrir-modelo'), 'el desplegable de modelos')
}

/** Pulsa el `li` del modelo elegido (o «Otros») del panel `#<base>_panel`, UNA vez por trabajo; el texto pasa `comprobarBoton` (fail-closed). */
export async function elegirModeloListaGenerali(page: Page, guard: GuardEmision, base: string, texto: string): Promise<void> {
  const clave = claveRondaModeloGenerali(guard, 'generali:elegir-modelo')
  const otros = esTextoOtrosGenerali(texto ?? '')
  if (otros && clave !== 'generali:elegir-modelo') throw new EmisionBloqueadaError('fase', '«Otros» en el desplegable de modelos de Generali ya se eligió en este trabajo')
  if (typeof base === 'string' && esIdModeloGenerali(base)) anotarBaseModeloGenerali(guard, base)
  await elegirItemMenuGenerali(page, guard, base, texto, esIdModeloGenerali, clave, 'el modelo de la lista')
  if (otros) AVANCES_USADOS.get(guard)?.add(CLAVE_MODELO_OTROS_GENERALI)
}

// v0.2.17 (22/10/2026, prueba real): tras combustible y potencia, «Versión» es otro SelectOneMenu de PrimeFaces con textos REPETIDOS
// («2.9 CRDI 163 FULL» dos veces). Mismas reglas que el modelo (disparador propio, `li` de `data-label` exacto por `comprobarBoton`, URL
// `selVehiculo`, una vez por trabajo cada puerta) y además: el id no puede ser el del menú de marcas NI el de modelos de este trabajo; si el
// texto está repetido se pulsa el PRIMERO de los idénticos (el adaptador lo declara como supuesto).
const esIdVersionGenerali = (guard: GuardEmision) => (b: string) => esIdModeloGenerali(b) && !(BASES_MODELO_GENERALI.get(guard)?.has(b) ?? false)

/** Abre el desplegable «Versión» por su disparador propio, UNA vez por trabajo (nunca el de marcas ni el de modelos). */
export async function abrirDesplegableVersionGenerali(page: Page, guard: GuardEmision, base: string): Promise<void> {
  await abrirMenuGenerali(page, guard, base, esIdVersionGenerali(guard), 'generali:abrir-version', 'el desplegable de versiones')
}

/** Pulsa el `li` de la versión elegida (`data-label` exacto; repetido → el primero) del panel `#<base>_panel`, UNA vez por trabajo; el texto pasa `comprobarBoton`. */
export async function elegirVersionListaGenerali(page: Page, guard: GuardEmision, base: string, texto: string): Promise<void> {
  await elegirItemMenuGenerali(page, guard, base, texto, esIdVersionGenerali(guard), 'generali:elegir-version-lista', 'la versión de la lista', true)
}

// ─────────── «Guardar presupuesto» de Allianz AUTOS Turismos (v0.6.13 del bot, 18/10/2026, autorizado por Alberto) ───────────
// HTML real (trabajo d675077b, pantalla «Selección de paquete»): bajo la tabla de precios vive el formulario `nx-mt-save-proposal`
// («Guardar el presupuesto»): «Identificador presupuesto» (obligatorio, ≤30), tipo/nº de documento, nombre y apellidos del tomador
// (obligatorios; el portal los trae de los pasos anteriores), casillas «Envío a cliente», «Envío a agente», «Mostrar presupuesto en
// eCliente» (MARCADA por defecto), «Selección de productos» (los paquetes y «Todos los paquetes») y el botón «Guardar presupuesto».
// NO vinculante. Reglas: (1) solo un botón cuyo texto ENTERO casa con la lista blanca y que pase `comprobarBoton` + la lista única
// (guardar, nunca emisión ni prohibido); (2) NADA sale al cliente: «Envío a cliente», «Envío a agente» y «Mostrar en eCliente»
// tienen que quedar DESMARCADAS antes de pulsar (si no quedan, no se pulsa); (3) el bot solo escribe el identificador (sin datos
// personales); un obligatorio vacío (nombre, documento…) = no se pulsa y se dice cuál; (4) el clic va por `pulsarGuardadoPresupuesto`
// (ventana de red de guardado, tope por trabajo, diálogos rechazados). Si algo no casa → `no_guardado` con motivo: no es error del precio.

/** Textos EXACTOS (tras normalizar espacios) del botón que se puede pulsar. Nada más: ni «Emitir», ni «Contratar», ni «Confirmar». */
export const BOTONES_GUARDAR_PRESUPUESTO_TURISMOS: readonly string[] = Object.freeze(['Guardar presupuesto', 'Guardar proyecto'])
export const SEL_FORM_GUARDAR_PRESUPUESTO_TURISMOS = 'nx-mt-save-proposal form'
export const ETIQUETA_IDENTIFICADOR_PRESUPUESTO_TURISMOS = 'Identificador presupuesto'
/** Estado OBLIGATORIO de cada casilla antes de pulsar: nada se envía ni se publica al cliente; se guardan todos los paquetes. */
export const CASILLAS_GUARDAR_PRESUPUESTO_TURISMOS: Readonly<Record<string, boolean>> = Object.freeze({
  'Envío a cliente': false,
  'Envío a agente': false,
  'Mostrar presupuesto en eCliente': false,
  'Todos los paquetes': true,
})
/** v0.6.34 (27/10/2026): 15 s se quedaron cortos (segundo guardado del día: precios sí, confirmación no); el sondeo para en cuanto aparece la señal. */
export const MS_CONFIRMA_GUARDADO_TURISMOS = 30_000

const planoTurismos = (t: string | null | undefined) => (t ?? '').replace(/\s+/g, ' ').trim()
/**
 * v0.6.24 (22/10/2026): clave de comparación de la lista blanca = sin mayúsculas ni tildes. `innerText` aplica `text-transform`
 * del CSS («GUARDAR PRESUPUESTO») mientras que `textContent` (lo que enseña el diagnóstico) no: con la comparación exacta el
 * «Guardar presupuesto» de la barra se veía en el inventario y NUNCA se pulsaba. Sigue siendo texto ENTERO (no «contiene»).
 */
const claveGuardarTurismos = (t: string | null | undefined) => planoTurismos(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const CLAVES_GUARDAR_PRESUPUESTO_TURISMOS: readonly string[] = Object.freeze(BOTONES_GUARDAR_PRESUPUESTO_TURISMOS.map(claveGuardarTurismos))
const esTextoGuardarTurismos = (t: string | null | undefined) => CLAVES_GUARDAR_PRESUPUESTO_TURISMOS.includes(claveGuardarTurismos(t))

/** ¿Este botón se puede pulsar para GUARDAR el presupuesto? Texto entero en la lista blanca Y la lista única lo ve como guardar. PURA. */
export function esBotonGuardarPresupuestoTurismos(descripciones: readonly (string | null | undefined)[]): boolean {
  if (!esTextoGuardarTurismos(descripciones[0])) return false
  try {
    comprobarBoton(descripciones, { permitirGuardarPresupuesto: true })
  } catch {
    return false
  }
  const cat = clasificarAccionPortal(descripciones.filter((d): d is string => typeof d === 'string'))
  return !cat.emision && !cat.prohibida && !!cat.guardar
}

/** Identificador que el bot pone al presupuesto: SIN datos personales, ≤30 («GA-AAAAMMDD-<8 del trabajo>»). PURA. */
export function identificadorPresupuestoTurismos(trabajoId: string, hoy: Date = new Date()): string {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(hoy).replace(/-/g, '')
  return `GA-${f}-${trabajoId.replace(/[^0-9a-z]/gi, '').slice(0, 8).toUpperCase()}`.slice(0, 30)
}

const RE_REFERENCIA_PRESUPUESTO = /(?:n(?:[ºo°]|úm(?:ero)?)\.?\s*(?:de\s*)?(?:presupuesto|proyecto)|(?:presupuesto|proyecto)\s*(?:n(?:[ºo°]|úm(?:ero)?)\.?|número))\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\/]{4,29})/gi
const RE_FRASE_GUARDADO = /presupuesto[^.]{0,40}(?:guardad|grabad|almacenad)|se ha guardado/gi

/** Todas las referencias «Nº presupuesto …» de un texto, en orden y en mayúsculas. PURA. */
function referenciasPresupuestoDeTexto(texto: string): string[] {
  return [...planoTurismos(texto).matchAll(RE_REFERENCIA_PRESUPUESTO)].map((m) => m[1]!.toUpperCase())
}

/** Número/referencia que el portal enseña tras guardar, de un texto de la pantalla. `null` = no se ve. PURA. */
export function referenciaPresupuestoDeTexto(texto: string): string | null {
  return referenciasPresupuestoDeTexto(texto)[0] ?? null
}

/**
 * ¿El texto de DESPUÉS del clic confirma un guardado NUEVO respecto del de ANTES? (v0.6.14, revisión de seguridad.) Solo cuenta lo
 * que APARECE tras el clic: una referencia «Nº presupuesto …» que antes no estaba (→ esa es la referencia) o más frases «presupuesto
 * … guardado» que antes (→ confirmado, pero SIN referencia: la que ya estaba en pantalla puede ser de otro presupuesto). Lo que ya
 * estaba antes del clic no confirma nada. PURA.
 */
export function confirmacionGuardadoNueva(antes: string, despues: string): { confirmado: boolean; referencia: string | null } {
  const previas = new Set(referenciasPresupuestoDeTexto(antes))
  const referencia = referenciasPresupuestoDeTexto(despues).find((r) => !previas.has(r)) ?? null
  const frases = (t: string) => [...planoTurismos(t).matchAll(RE_FRASE_GUARDADO)].length
  return { confirmado: referencia !== null || frases(despues) > frases(antes), referencia }
}

/** v0.6.34: ¿tras el clic APARECIÓ un «Descargar propuesta» que antes no estaba? (señal tardía de que el portal guardó.) Compara sin tildes/mayúsculas. PURA. */
export function descargaPropuestaNueva(antes: string, despues: string): boolean {
  const cuenta = (t: string) => [...claveGuardarTurismos(t).matchAll(/descargar propuesta/g)].length
  return cuenta(despues) > cuenta(antes)
}

const MAX_DIAGNOSTICO_SIN_CONFIRMAR = 300
/** v0.6.34: texto del portal apto para el aviso: fuera correos, NIF/NIE/CIF, matrículas, teléfonos y toda secuencia de 5+ cifras; luego el saneador común de diálogos. PURA. */
export function limpiarMensajePortalDiagnostico(bruto: string): string {
  const t = bruto
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160)
    .replace(/[^\s@]+@[^\s@]+/g, '')
    .replace(/\b[A-Za-z]?\d{7,8}[A-Za-z]\b/g, '')
    .replace(/\b\d{4}\s?-?\s?[BCDFGHJKLMNPRSTVWXYZ]{3}\b/gi, '')
    .replace(/\+?\d[\d\s.\-]{6,}\d/g, '')
    .replace(/\d{5,}/g, '')
  return textoDialogoPortalSeguro(t).replace(/\s+/g, ' ').trim()
}

/** v0.6.34: diagnóstico (≤300) de por qué «Guardar presupuesto» no se confirmó: mensajes del portal ya saneados, estado del formulario y etiquetas de campos vacíos. PURA. */
export function diagnosticoSinConfirmarTurismos(e: { mensajes: readonly string[]; formularioVisible: boolean; botonHabilitado: boolean | null; pendientes: readonly string[] }): string {
  const mensajes = [...new Set(e.mensajes.map(limpiarMensajePortalDiagnostico).filter((m) => m !== ''))].slice(0, 4)
  const partes = [
    `formulario ${e.formularioVisible ? 'aún a la vista' : 'ya no se ve'}`,
    `botón ${e.botonHabilitado === null ? 'sin determinar' : e.botonHabilitado ? 'habilitado' : 'deshabilitado'}`,
    mensajes.length ? `mensajes del portal: ${mensajes.map((m) => `«${m}»`).join(' · ')}` : 'sin mensajes del portal a la vista',
    e.pendientes.length ? `campos vacíos: ${e.pendientes.map((p) => `«${limpiarMensajePortalDiagnostico(p)}»`).join(', ')}` : '',
  ].filter(Boolean)
  const s = partes.join('; ')
  return s.length > MAX_DIAGNOSTICO_SIN_CONFIRMAR ? `${s.slice(0, MAX_DIAGNOSTICO_SIN_CONFIRMAR - 1)}…` : s
}

export type ResultadoGuardarPresupuestoTurismos =
  | { estado: 'guardado'; identificador: string; referencia: string | null }
  | { estado: 'sin_confirmar'; identificador: string; diagnostico?: string }
  | { estado: 'no_guardado'; motivo: string }

/** Guarda el presupuesto en la pantalla de precios de Turismos con las reglas de arriba. Nunca lanza por «no se pudo»: lo devuelve. */
/** Host del bloque «Guardar el presupuesto» bajo la tabla de precios. */
export const SEL_HOST_GUARDAR_PRESUPUESTO_TURISMOS = 'nx-mt-save-proposal'
/** v0.6.20: cuánto se espera (desplazando la pantalla) a que el formulario «Guardar el presupuesto» tenga su botón a la vista. */
export const MS_APARECE_FORM_GUARDAR_TURISMOS = 12_000

/** Lo que hay en el marco del bloque de guardado: hosts, formularios, formularios con botón de la lista blanca VISIBLE, y botones de la lista blanca visibles FUERA del bloque. */
export type EstadoFormularioGuardarTurismos = {
  hosts: number
  formularios: number
  conBotonVisible: number
  botonesGuardarFuera: number
  /** Textos de los botones VISIBLES dentro del bloque (para el diagnóstico cuando ninguno es de la lista blanca). */
  otrosBotones: string[]
  /** v0.6.21: etiquetas SANEADAS (≤10, sin datos personales) de los botones/enlaces a la vista en TODA la pantalla, para el motivo. */
  controlesVisibles?: string[]
  /** v0.6.21: cuántos paneles plegados se desplegaron (clic de despliegue) para llegar al formulario. */
  desplegados?: number
  /** v0.6.22: veces que se pulsó el «Guardar presupuesto» de la barra para abrir el formulario. */
  abiertos?: number
  /** v0.6.24: por qué NO se pulsó el «Guardar presupuesto» de la pantalla para abrir el formulario (sin datos personales). */
  abridor?: string
}

/** Solo lectura del DOM del marco (no pulsa nada). Sin funciones con nombre dentro de `evaluate` (tsx les mete `__name`). */
async function estadoFormularioGuardarTurismos(marco: Frame): Promise<EstadoFormularioGuardarTurismos> {
  return marco
    .evaluate(({ host, textos }) => {
      // `textos` ya viene normalizado (minúsculas, sin tildes): se compara contra el texto de pantalla normalizado igual.
      const hosts = document.querySelectorAll(host).length
      const forms = Array.from(document.querySelectorAll(`${host} form`))
      let conBotonVisible = 0
      const otrosBotones: string[] = []
      for (const f of forms) {
        let hay = false
        for (const b of Array.from(f.querySelectorAll('button'))) {
          const r = b.getBoundingClientRect()
          const cs = getComputedStyle(b)
          if (!(r.width > 0 && r.height > 0 && cs.visibility !== 'hidden')) continue
          const t = (b.innerText || '').replace(/\s+/g, ' ').trim()
          if (textos.includes((t).replace(/\s+/g, ' ').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase())) hay = true
          else if (t !== '') otrosBotones.push(t.slice(0, 40))
        }
        if (hay) conBotonVisible++
      }
      let botonesGuardarFuera = 0
      for (const b of Array.from(document.querySelectorAll('button'))) {
        if (b.closest(host)) continue
        const r = b.getBoundingClientRect()
        const cs = getComputedStyle(b)
        if (r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && textos.includes((b.innerText || '').replace(/\s+/g, ' ').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase())) botonesGuardarFuera++
      }
      // v0.6.21: etiquetas de TODOS los botones/enlaces a la vista (iconos aparte; solo-icono → aria-label/title), en crudo: se sanean fuera.
      const controles: string[] = []
      for (const b of Array.from(document.querySelectorAll('button, a, [role="button"], [role="tab"], input[type="button"], input[type="submit"]'))) {
        if (controles.length >= 120) break
        const r = b.getBoundingClientRect()
        const cs = getComputedStyle(b)
        if (!(r.width > 0 && r.height > 0 && cs.visibility !== 'hidden')) continue
        const c = b.cloneNode(true) as HTMLElement
        c.querySelectorAll('nx-icon, svg, i, .nx-icon').forEach((x) => x.remove())
        const t = (c.textContent || '').replace(/\s+/g, ' ').trim() || (b.getAttribute('aria-label') || b.getAttribute('title') || (b as HTMLInputElement).value || '')
        if (t) controles.push(String(t))
      }
      return { hosts, formularios: forms.length, conBotonVisible, botonesGuardarFuera, otrosBotones: otrosBotones.slice(0, 3), controles }
    }, { host: SEL_HOST_GUARDAR_PRESUPUESTO_TURISMOS, textos: [...CLAVES_GUARDAR_PRESUPUESTO_TURISMOS] })
    .then(({ controles, ...resto }) => ({ ...resto, controlesVisibles: etiquetasControlesSaneadas(controles) }))
    .catch(() => ({ hosts: 0, formularios: 0, conBotonVisible: 0, botonesGuardarFuera: 0, otrosBotones: [], controlesVisibles: [] as string[] }))
}

/**
 * v0.6.20: por qué NO se puede usar el formulario «Guardar el presupuesto» (`null` = hay exactamente uno con su botón a la vista).
 * El motivo va TAL CUAL al aviso de la oferta (lo ve Alberto junto al precio): legible y sin datos del cliente. PURA.
 */
export function motivoFormularioGuardarTurismos(e: EstadoFormularioGuardarTurismos): string | null {
  if (e.conBotonVisible === 1) return null
  if (e.conBotonVisible > 1) return `hay ${e.conBotonVisible} formularios «Guardar el presupuesto» con botón a la vista (ambiguo: no se pulsa ninguno)`
  const fuera = e.botonesGuardarFuera > 0 ? `; hay ${e.botonesGuardarFuera} botón(es) «Guardar presupuesto» FUERA del formulario (sin mapear: el bot no lo pulsa)` : ''
  const desplegados = (e.desplegados ? `; se desplegó ${e.desplegados} panel(es) plegado(s) sin que apareciera` : '') + (e.abiertos ? `; se pulsó el «Guardar presupuesto» de la pantalla para abrirlo y siguió sin verse` : e.abridor ? `; no se pulsó el «Guardar presupuesto» de la pantalla: ${e.abridor}` : '')
  // v0.6.21: qué hay en pantalla (etiquetas de botones/enlaces, sin datos personales) para ver dónde está de verdad el guardado.
  const cola = `${fuera}${desplegados}${sufijoControlesVisibles(e.controlesVisibles)}`
  if (e.hosts === 0) return `el bloque «Guardar el presupuesto» no aparece en la pantalla de precios (esperado y desplazada la pantalla)${cola}`
  if (e.formularios === 0) return `el bloque «Guardar el presupuesto» está en la pantalla pero sin formulario dentro${cola}`
  if (e.otrosBotones.length > 0) return `no aparece el botón «Guardar presupuesto» en el formulario (botones a la vista: ${e.otrosBotones.map((t) => `«${redactarDatosPersonales(t)}»`).join(', ')})${cola}`
  return `el formulario «Guardar el presupuesto» está en la pantalla pero OCULTO (su botón no se ve; puede estar plegado)${cola}`
}

// v0.6.21 (22/10/2026): en los runs reales de las 3 modalidades el bloque estaba en pantalla pero OCULTO. Si cuelga de un panel
// plegado (acordeón/pestaña/<details>), SOLO se despliega ese panel: un control con `aria-expanded="false"` (o pestaña no seleccionada
// / <summary>) que CONTIENE el bloque o lo gobierna (`aria-controls`) — nunca otro. El clic pasa `comprobarBoton` con la opción de
// guardar presupuesto y la lista única (no emisión ni prohibido), no puede ser el botón de guardar ni un `submit`, y se hace a lo más
// MAX_DESPLIEGUES_GUARDAR_TURISMOS veces por trabajo. Desplegar un panel no envía nada: la ventana de red de guardado NO se abre.

/** Cuántos paneles plegados se pueden desplegar por trabajo (anidados). */
export const MAX_DESPLIEGUES_GUARDAR_TURISMOS = 2
const SEL_PANEL_PLEGABLE = 'nx-expansion-panel, nx-accordion-item, mat-expansion-panel, details, nx-tab-group, [class*="expansion-panel"], [class*="accordion-item"]'

/** ¿Este control plegable se puede pulsar para DESPLEGAR el bloque de guardado? Etiqueta ≤40, no es el botón de guardar y pasa la guardia. PURA. */
export function esExpansorGuardarTurismosPermitido(descripciones: readonly (string | null | undefined)[]): boolean {
  const etiqueta = planoTurismos(etiquetaEfectivaControl({ texto: descripciones[0], aria: descripciones[1], title: descripciones[2], valor: descripciones[3] }))
  if (etiqueta.length > 40) return false
  if (esTextoGuardarTurismos(etiqueta)) return false
  try {
    comprobarBoton(descripciones, { permitirGuardarPresupuesto: true })
  } catch {
    return false
  }
  const cat = clasificarAccionPortal(descripciones.filter((d): d is string => typeof d === 'string' && d !== ''))
  return !cat.emision && !cat.prohibida
}

/** Marca (`data-rpa-exp`) los controles plegados que gobiernan el bloque y devuelve cuántos son. Solo lectura. */
async function marcarExpansoresGuardarTurismos(marco: Frame): Promise<number> {
  return marco
    .evaluate(({ host, panel }) => {
      document.querySelectorAll('[data-rpa-exp]').forEach((n) => n.removeAttribute('data-rpa-exp'))
      const bloque = document.querySelector(host)
      if (!bloque) return 0
      let n = 0
      for (const e of Array.from(document.querySelectorAll('[aria-expanded="false"], [role="tab"][aria-selected="false"], summary'))) {
        if (/^(INPUT|SELECT|TEXTAREA|LABEL)$/.test(e.tagName) || (e as HTMLButtonElement).type === 'submit') continue
        const r = e.getBoundingClientRect()
        if (!(r.width > 0 && r.height > 0) || getComputedStyle(e).visibility === 'hidden') continue
        const ctrl = e.getAttribute('aria-controls')
        const destino = ctrl ? document.getElementById(ctrl) : null
        const caja = e.closest(panel)
        const gobierna = bloque.contains(e) || (destino !== null && destino.contains(bloque)) || (caja !== null && caja.contains(bloque) && !e.contains(bloque)) || (e.tagName === 'SUMMARY' && e.parentElement !== null && e.parentElement.contains(bloque))
        if (!gobierna) continue
        e.setAttribute('data-rpa-exp', String(n++))
        if (n >= 5) break
      }
      return n
    }, { host: SEL_HOST_GUARDAR_PRESUPUESTO_TURISMOS, panel: SEL_PANEL_PLEGABLE })
    .catch(() => 0)
}

/**
 * Despliega UN panel plegado que gobierna el bloque «Guardar el presupuesto» (ver reglas arriba). `true` = se pulsó uno.
 * Nunca lanza por «no se pudo»; solo relanza la violación REAL del guard (`guard.comprobar()`).
 */
async function desplegarBloqueGuardarTurismos(marco: Frame, guard: GuardEmision): Promise<boolean> {
  guard.comprobar()
  const page = marco.page()
  const usados = AVANCES_USADOS.get(guard) ?? new Set<string>()
  let hechos = 0
  for (let i = 1; i <= MAX_DESPLIEGUES_GUARDAR_TURISMOS; i++) if (usados.has(`allianz:desplegar-guardar:${i}`)) hechos++
  if (hechos >= MAX_DESPLIEGUES_GUARDAR_TURISMOS) return false
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) return false
  try {
    await exigirSinCuentaBancaria(page)
    const n = await marcarExpansoresGuardarTurismos(marco)
    for (let i = 0; i < n; i++) {
      const el = marco.locator(`[data-rpa-exp="${i}"]`)
      if ((await el.count()) !== 1) continue
      const desc = await descripcion(el)
      if (!esExpansorGuardarTurismosPermitido(desc)) continue
      usados.add(`allianz:desplegar-guardar:${hechos + 1}`)
      AVANCES_USADOS.set(guard, usados)
      const alDialogo = (d: Dialog) => {
        d.dismiss().catch(() => {})
      }
      page.on('dialog', alDialogo)
      try {
        await el.click({ timeout: 3_000 })
      } finally {
        page.off('dialog', alDialogo)
      }
      guard.comprobar()
      await page.waitForTimeout(500)
      return true
    }
  } catch {
    guard.comprobar()
  }
  return false
}

// v0.6.22 (22/10/2026): run real con 3 precios: el formulario seguía OCULTO y entre los controles a la vista había un «Guardar presupuesto»
// (barra de herramientas) que lo abre. Si el bloque está oculto y hay UN control visible con ese texto EXACTO (lista blanca de guardado,
// misma familia de permiso), se pulsa UNA vez por trabajo (clic de apertura, SIN ventana de red de guardado: si disparase una petición de
// emisión, el guard la aborta) y se espera a que el formulario se vea (en línea o en diálogo). Nunca el paso Revisión/Pago/Confirmación.
export const MAX_APERTURAS_GUARDAR_TURISMOS = 1

/**
 * Marca (`data-rpa-abrir`) el ÚNICO control visible y habilitado con el texto exacto de la lista blanca (sin mayúsculas ni tildes).
 * Devuelve cuántos candidatos hay y, de los controles con ese texto que quedaron FUERA, cuántos por cada motivo (para el aviso). Solo lectura.
 */
async function marcarAbridorGuardarTurismos(marco: Frame): Promise<{ hojas: number; excluidos: { submit: number; deshabilitado: number; enBloque: number; oculto: number } }> {
  return marco
    .evaluate(({ textos, host }) => {
      document.querySelectorAll('[data-rpa-abrir]').forEach((n) => n.removeAttribute('data-rpa-abrir'))
      const cand: Element[] = []
      const excluidos = { submit: 0, deshabilitado: 0, enBloque: 0, oculto: 0 }
      // v0.6.23: MISMO conjunto y MISMA visibilidad que el listado de controles del diagnóstico (`estadoFormularioGuardarTurismos`) + `nx-button`.
      // Sin la exclusión general de `closest('form')`: Allianz envuelve toda la pantalla en un <form> y el «Guardar presupuesto» de la barra
      // vive dentro (un <button> sin `type` es «submit» en el DOM; en la barra no envía el formulario del bloque, y el guard vigila la red).
      for (const b of Array.from(document.querySelectorAll('button, a, [role="button"], [role="tab"], input[type="button"], input[type="submit"], nx-button'))) {
        const c = b.cloneNode(true) as HTMLElement
        c.querySelectorAll('nx-icon, svg, i, .nx-icon').forEach((x) => x.remove())
        const t = (c.textContent || '').replace(/\s+/g, ' ').trim() || b.getAttribute('aria-label') || b.getAttribute('title') || (b as HTMLInputElement).value || ''
        if (!textos.includes((String(t)).replace(/\s+/g, ' ').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase())) continue
        // Fuera: deshabilitados, los submit EXPLÍCITOS (type="submit"/input submit) y todo lo que viva DENTRO del propio bloque de guardado.
        if (b.getAttribute('type') === 'submit') { excluidos.submit++; continue }
        if ((b as HTMLButtonElement).disabled || b.getAttribute('aria-disabled') === 'true') { excluidos.deshabilitado++; continue }
        if (b.closest(host)) { excluidos.enBloque++; continue }
        const r = b.getBoundingClientRect()
        if (!(r.width > 0 && r.height > 0) || getComputedStyle(b).visibility === 'hidden') { excluidos.oculto++; continue }
        cand.push(b)
      }
      const hojas = cand.filter((e) => !cand.some((o) => o !== e && e.contains(o)))
      if (hojas.length === 1) hojas[0]!.setAttribute('data-rpa-abrir', '1')
      return { hojas: hojas.length, excluidos }
    }, { textos: [...CLAVES_GUARDAR_PRESUPUESTO_TURISMOS], host: SEL_HOST_GUARDAR_PRESUPUESTO_TURISMOS })
    .catch(() => ({ hojas: 0, excluidos: { submit: 0, deshabilitado: 0, enBloque: 0, oculto: 0 } }))
}

/** Texto corto y SIN datos personales de por qué el abridor no se pulsó (va al aviso). PURA. */
export function notaAbridorGuardarTurismos(hojas: number, ex: { submit: number; deshabilitado: number; enBloque: number; oculto: number }): string {
  const partes = [ex.submit ? `${ex.submit} de tipo «submit»` : '', ex.deshabilitado ? `${ex.deshabilitado} deshabilitado(s)` : '', ex.enBloque ? `${ex.enBloque} dentro del propio bloque` : '', ex.oculto ? `${ex.oculto} sin verse` : ''].filter(Boolean)
  const fuera = partes.length ? ` (fuera: ${partes.join(', ')})` : ''
  if (hojas === 0) return `no hay ningún control «Guardar presupuesto» pulsable en la pantalla${fuera}`
  if (hojas > 1) return `hay ${hojas} controles «Guardar presupuesto» pulsables (ambiguo: no se pulsa ninguno)${fuera}`
  return `el control «Guardar presupuesto» no pasó la guardia`
}

/** Pulsa UNA vez (por trabajo) el control «Guardar presupuesto» que abre el formulario oculto. `pulsado` = se pulsó; si no, `nota` dice por qué. Solo relanza la violación REAL del guard. */
async function abrirFormularioGuardarTurismos(marco: Frame, guard: GuardEmision): Promise<{ pulsado: boolean; nota: string | null }> {
  guard.comprobar()
  const page = marco.page()
  const usados = AVANCES_USADOS.get(guard) ?? new Set<string>()
  let hechos = 0
  for (let i = 1; i <= MAX_APERTURAS_GUARDAR_TURISMOS; i++) if (usados.has(`allianz:abrir-guardar:${i}`)) hechos++
  if (hechos >= MAX_APERTURAS_GUARDAR_TURISMOS) return { pulsado: false, nota: null }
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) return { pulsado: false, nota: null }
  let nota: string | null = null
  try {
    await exigirSinCuentaBancaria(page)
    const m = await marcarAbridorGuardarTurismos(marco)
    if (m.hojas !== 1) return { pulsado: false, nota: notaAbridorGuardarTurismos(m.hojas, m.excluidos) }
    const el = marco.locator('[data-rpa-abrir="1"]')
    if ((await el.count()) !== 1) return { pulsado: false, nota: 'el control marcado dejó de existir' }
    const desc = await descripcion(el)
    if (!esBotonGuardarPresupuestoTurismos(desc)) return { pulsado: false, nota: 'el control «Guardar presupuesto» no pasó la guardia (texto o atributos)' }
    usados.add(`allianz:abrir-guardar:${hechos + 1}`)
    AVANCES_USADOS.set(guard, usados)
    const alDialogo = (d: Dialog) => {
      d.dismiss().catch(() => {})
    }
    page.on('dialog', alDialogo)
    try {
      await el.click({ timeout: 3_000 })
    } finally {
      page.off('dialog', alDialogo)
    }
    guard.comprobar()
    await page.waitForTimeout(500)
    return { pulsado: true, nota: null }
  } catch (e) {
    if (e instanceof ErrorFronteraEmision) throw e
    guard.comprobar()
    nota = 'el clic en «Guardar presupuesto» falló (el portal no lo dejó pulsar)'
  }
  return { pulsado: false, nota }
}

export const MS_HABILITA_GUARDAR_TURISMOS = 5_000
/** Correo/teléfono del tomador, SOLO en tiempo de ejecución y solo si el riesgo los trae (nunca literales en el código). */
export type ContactoGuardarTurismos = { email?: string | null; telefono?: string | null }
const sinTildesGuardar = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
/** Qué dato del bot encaja con la etiqueta de un campo vacío. PURA. Personales/bancarios/consentimiento → null (no se teclean). */
export function datoParaCampoGuardarTurismos(etiqueta: string): 'texto' | 'email' | 'telefono' | null {
  const t = sinTildesGuardar(etiqueta).replace(/\s+/g, ' ').trim()
  if (/iban|bic|cuenta|banc|nif|dni|nie|cif|documento|apellid|matricul|direccion|fecha|nacimiento/.test(t)) return null
  if (/e-?mail|correo/.test(t)) return 'email'
  if (/telefono|movil|celular|\btlf\b/.test(t)) return 'telefono'
  if (/descripci|referencia|observaci|comentario|asunto|titulo|nombre (del )?(presupuesto|proyecto)|nombre presupuesto/.test(t)) return 'texto'
  return null
}
const SEL_CAMPOS_TEXTO_GUARDAR = 'input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=button]):not([type=submit]), textarea'
async function etiquetaDeCampoGuardar(c: Locator): Promise<string> {
  return c.evaluate((n) => {
    const e = n as HTMLInputElement
    return (e.labels?.[0]?.textContent ?? n.getAttribute('aria-label') ?? n.getAttribute('placeholder') ?? '').replace(/\s+/g, ' ').replace(/\*/g, '').trim()
  }).catch(() => '')
}
/** Autorizado por el titular (Alberto) el 25/10/2026, SOLO en el formulario «Guardar el presupuesto» de Allianz Turismos: la casilla informativa
 *  «Obtenga información sobre nuestra política de privacidad». Rótulo normalizado (sin tildes, minúsculas) con TODAS estas piezas. Cualquier otra
 *  casilla de consentimiento (comercial, cesión a terceros, publicidad…) sigue sin marcarse. */
export const CASILLA_PRIVACIDAD_INFORMATIVA_GUARDAR_TURISMOS: readonly string[] = Object.freeze(['politica de privacidad', 'informacion'])
export const esCasillaPrivacidadInformativaGuardarTurismos = (rotulo: string): boolean => {
  const n = rotulo.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ')
  return CASILLA_PRIVACIDAD_INFORMATIVA_GUARDAR_TURISMOS.every((p) => n.includes(p))
}
/** Marca (vía el guard) la casilla de privacidad informativa DENTRO de `form`; exactamente una coincidencia, si no, no toca nada. */
async function marcarCasillaPrivacidadGuardarTurismos(form: Locator, guard: GuardEmision): Promise<void> {
  const cajas = form.locator('nx-checkbox')
  const idx: number[] = []
  for (let i = 0; i < (await cajas.count()); i++) {
    if (esCasillaPrivacidadInformativaGuardarTurismos(await cajas.nth(i).locator('label').first().innerText().catch(() => ''))) idx.push(i)
  }
  if (idx.length !== 1) return
  const caja = cajas.nth(idx[0]!)
  const input = caja.locator('input[type=checkbox]')
  if ((await input.count()) !== 1 || (await input.isChecked().catch(() => true))) return
  const label = caja.locator('label').first()
  comprobarBoton(await descripcion(label))
  await label.click({ timeout: 5_000 })
  guard.comprobar()
}
async function rellenarObligatoriosGuardarTurismos(form: Locator, marco: Frame, identificador: string, contacto: ContactoGuardarTurismos | null): Promise<void> {
  const campos = form.locator(SEL_CAMPOS_TEXTO_GUARDAR).filter({ visible: true })
  const n = await campos.count()
  for (let i = 0; i < n; i++) {
    const c = campos.nth(i)
    if (!(await c.isEnabled().catch(() => false)) || !(await c.isEditable().catch(() => false))) continue
    if (planoTurismos(await c.inputValue().catch(() => 'x')) !== '') continue
    const dato = datoParaCampoGuardarTurismos(await etiquetaDeCampoGuardar(c))
    const valor = dato === 'texto' ? identificador : dato === 'email' ? contacto?.email : dato === 'telefono' ? contacto?.telefono : null
    if (!dato || !valor || planoTurismos(valor) === '') continue
    await exigirCampoNoBancario(c)
    await c.fill(valor, { timeout: 5_000 })
  }
  void marco
}
/** Etiquetas SANEADAS (sin valores) de lo que el formulario aún pide: campos vacíos y casillas obligatorias/de consentimiento sin marcar. */
async function etiquetasPendientesGuardarTurismos(form: Locator): Promise<string[]> {
  const crudas = await form.evaluate((f) => {
    const out: string[] = []
    // Sin funciones con nombre dentro de `evaluate` (tsx les mete `__name`, que no existe en la página): todo en línea.
    for (const n of Array.from(f.querySelectorAll('input, textarea, select'))) {
      const e = n as HTMLInputElement
      const t = (e.type ?? '').toLowerCase()
      if (['hidden', 'button', 'submit', 'radio'].includes(t) || e.disabled) continue
      const st = getComputedStyle(e)
      if (st.display === 'none' || st.visibility === 'hidden') continue
      const l = (e.labels?.[0]?.textContent ?? e.getAttribute('aria-label') ?? e.getAttribute('placeholder') ?? '').replace(/\s+/g, ' ').replace(/\*/g, '').trim()
      if (t === 'checkbox') {
        const obligatoria = e.required || e.getAttribute('aria-required') === 'true' || /acept|consent|lopd|proteccion de datos|protección de datos|privacidad|condiciones|autoriz|conforme/i.test(l)
        if (!e.checked && obligatoria && l !== '') out.push(`${l} (casilla de consentimiento: no se marca)`)
      } else if (e.value.trim() === '' && l !== '') out.push(l)
    }
    return out
  }).catch(() => [] as string[])
  // Casillas (su etiqueta puede ser larga): se saneán aparte; el resto, con el saneador común.
  const sufijo = ' (casilla de consentimiento: no se marca)'
  const casillas = crudas.filter((c) => c.endsWith(sufijo)).map((c) => c.slice(0, -sufijo.length)).filter((l) => l.length <= 120 && redactarDatosPersonales(l) === l && !/@|\d{5,}/.test(l)).map((l) => l + sufijo)
  const campos = etiquetasControlesSaneadas(crudas.filter((c) => !c.endsWith(sufijo)), 12)
  return [...campos, ...casillas].slice(0, 12)
}

/** v0.6.34 · SOLO LECTURA (no pulsa ni escribe): mensajes visibles (diálogo/alerta/aviso/error del formulario), estado del formulario y campos vacíos. Nunca lanza. */
async function diagnosticoTrasGuardarSinConfirmar(form: Locator, boton: Locator): Promise<string> {
  try {
    const marco = form.page().frames().find((f) => esAppTurismosAllianz(f.url()))
    // Sin funciones con nombre dentro de `evaluate` (tsx les mete `__name`): todo en línea.
    const mensajes = marco
      ? await marco.evaluate(() => {
          const out: string[] = []
          const globales = '[role=dialog],[role=alertdialog],[role=alert],[role=status],nx-message,nx-error,nx-toast,.nx-toast,.nx-message,mat-snack-bar-container'
          const enForm = '[class*=error],[class*=invalid],nx-error,mat-error'
          const forms = Array.from(document.querySelectorAll('nx-mt-save-proposal form, nx-mt-save-proposal'))
          const nodos = Array.from(document.querySelectorAll(globales))
          for (const f of forms) nodos.push(...Array.from(f.querySelectorAll(enForm)))
          for (const n of nodos) {
            const st = getComputedStyle(n)
            if (st.display === 'none' || st.visibility === 'hidden') continue
            const t = (n.textContent ?? '').replace(/\s+/g, ' ').trim()
            if (t !== '') out.push(t.slice(0, 200))
          }
          return out
        }).catch(() => [] as string[])
      : []
    const formularioVisible = (await boton.isVisible().catch(() => false)) || (await form.isVisible().catch(() => false))
    const botonHabilitado = await boton.isEnabled().then((v) => v, () => null)
    const pendientes = await etiquetasPendientesGuardarTurismos(form).catch(() => [] as string[])
    return diagnosticoSinConfirmarTurismos({ mensajes, formularioVisible, botonHabilitado, pendientes })
  } catch {
    return 'diagnóstico no disponible'
  }
}

export async function guardarPresupuestoTurismosAllianz(marco: Frame, guard: GuardEmision, identificador: string, esperaMs = MS_CONFIRMA_GUARDADO_TURISMOS, esperaFormMs = MS_APARECE_FORM_GUARDAR_TURISMOS, contacto: ContactoGuardarTurismos | null = null, esperaHabilitaMs = MS_HABILITA_GUARDAR_TURISMOS): Promise<ResultadoGuardarPresupuestoTurismos> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) return { estado: 'no_guardado', motivo: 'otra ventana de red abierta' }
  if (marco.isDetached() || !esAppTurismosAllianz(marco.url())) return { estado: 'no_guardado', motivo: 'fuera de la app de Allianz AUTOS' }
  if (!/^[A-Z0-9-]{1,30}$/.test(identificador)) return { estado: 'no_guardado', motivo: 'identificador no válido' }
  const page = marco.page()
  // v0.6.20 (22/10/2026): los runs reales del 19 y 22/10 dejaron «el formulario no está a la vista» (referencia NULL). Se espera
  // a que el bloque aparezca (se pinta tras la tabla), se DESPLAZA la pantalla hasta él (scroll, no clic) y el formulario se da
  // por visible por su BOTÓN (un `<form>` de alto 0 con hijos visibles no es «visible» para Playwright). Si no, motivo legible.
  const forms = marco.locator(SEL_FORM_GUARDAR_PRESUPUESTO_TURISMOS)
  const hasta = Date.now() + esperaFormMs
  let estadoForm = await estadoFormularioGuardarTurismos(marco)
  let desplegados = 0
  let abiertos = 0
  let notaAbridor: string | null = null
  for (let vuelta = 0; estadoForm.conBotonVisible !== 1 && Date.now() < hasta; vuelta++) {
    guard.comprobar()
    if (estadoForm.hosts > 0) await marco.locator(SEL_HOST_GUARDAR_PRESUPUESTO_TURISMOS).first().scrollIntoViewIfNeeded({ timeout: 1_000 }).catch(() => {})
    else await marco.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {})
    await page.waitForTimeout(400)
    estadoForm = await estadoFormularioGuardarTurismos(marco)
    // v0.6.21: tras dar una vuelta sin verlo, si el bloque cuelga de un panel PLEGADO se despliega (solo ese; ver arriba).
    if (estadoForm.conBotonVisible !== 1 && estadoForm.hosts > 0 && vuelta >= 1 && (await desplegarBloqueGuardarTurismos(marco, guard))) {
      desplegados++
      estadoForm = await estadoFormularioGuardarTurismos(marco)
    }
    // v0.6.22: sigue oculto tras desplegar → el «Guardar presupuesto» visible de la pantalla lo abre (una vez; en línea o en diálogo).
    if (estadoForm.conBotonVisible !== 1 && estadoForm.hosts > 0 && estadoForm.formularios > 0 && vuelta >= 2 && abiertos === 0) {
      const ap = await abrirFormularioGuardarTurismos(marco, guard)
      notaAbridor = ap.pulsado ? null : (ap.nota ?? notaAbridor)
      if (ap.pulsado) {
        abiertos++
        for (let k = 0; k < 6 && estadoForm.conBotonVisible !== 1; k++) {
          await page.waitForTimeout(400)
          estadoForm = await estadoFormularioGuardarTurismos(marco)
        }
      }
    }
  }
  estadoForm = { ...estadoForm, desplegados, abiertos, abridor: notaAbridor ?? undefined }
  const motivoForm = motivoFormularioGuardarTurismos(estadoForm)
  if (motivoForm) return { estado: 'no_guardado', motivo: motivoForm }
  let form: Locator | null = null
  for (let i = 0; i < (await forms.count()); i++) {
    const botonesForm = forms.nth(i).locator('button').filter({ visible: true })
    for (let j = 0; j < (await botonesForm.count()); j++) {
      if (esTextoGuardarTurismos(await botonesForm.nth(j).innerText().catch(() => ''))) form = forms.nth(i)
    }
  }
  if (!form) return { estado: 'no_guardado', motivo: 'el formulario «Guardar el presupuesto» desapareció antes de usarlo' }
  // Botón: exactamente uno con texto de la lista blanca DENTRO del formulario.
  const botones = form.locator('button').filter({ visible: true })
  const candidatos: Locator[] = []
  for (let i = 0; i < (await botones.count()); i++) {
    const b = botones.nth(i)
    if (esTextoGuardarTurismos(await b.innerText().catch(() => ''))) candidatos.push(b)
  }
  if (candidatos.length !== 1) return { estado: 'no_guardado', motivo: candidatos.length === 0 ? 'no aparece el botón «Guardar presupuesto»' : 'más de un botón de guardar' }
  const boton = candidatos[0]!
  const desc = await descripcion(boton)
  if (!esBotonGuardarPresupuestoTurismos(desc)) return { estado: 'no_guardado', motivo: 'el texto del botón no casa con la lista blanca' }
  try {
    await exigirSinCuentaBancaria(page)
    // Identificador (sin datos personales): solo si el campo está vacío o ya es el nuestro.
    const id = form.getByLabel(ETIQUETA_IDENTIFICADOR_PRESUPUESTO_TURISMOS, { exact: true }).and(marco.locator('input')).filter({ visible: true })
    if ((await id.count()) !== 1) return { estado: 'no_guardado', motivo: `no aparece «${ETIQUETA_IDENTIFICADOR_PRESUPUESTO_TURISMOS}»` }
    await exigirCampoNoBancario(id)
    const actual = planoTurismos(await id.inputValue().catch(() => ''))
    if (actual !== '' && actual !== identificador) return { estado: 'no_guardado', motivo: `«${ETIQUETA_IDENTIFICADOR_PRESUPUESTO_TURISMOS}» ya trae otro valor` }
    if (actual === '') await id.fill(identificador, { timeout: 5_000 })
    // Casillas: cada una, EXACTAMENTE una, al estado obligatorio; se relee. Ninguna sin quedar → no se pulsa.
    const cajaDe = (etiqueta: string) => form.locator('nx-checkbox').filter({ has: marco.locator('label', { hasText: new RegExp(`^\\s*${etiqueta.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`) }) })
    for (const [etiqueta, quiero] of Object.entries(CASILLAS_GUARDAR_PRESUPUESTO_TURISMOS)) {
      const caja = cajaDe(etiqueta)
      if ((await caja.count()) !== 1) return { estado: 'no_guardado', motivo: `no aparece la casilla «${etiqueta}»` }
      const input = caja.locator('input[type=checkbox]')
      if ((await input.isChecked()) !== quiero) {
        const label = caja.locator('label').first()
        comprobarBoton(await descripcion(label))
        await label.click({ timeout: 5_000 })
        guard.comprobar()
      }
      if ((await input.isChecked()) !== quiero) return { estado: 'no_guardado', motivo: `la casilla «${etiqueta}» no quedó ${quiero ? 'marcada' : 'desmarcada'}` }
    }
    // v0.6.26 (25/10/2026, trabajo real e3c52938: el formulario abría pero «Guardar presupuesto» seguía deshabilitado): se rellenan los
    // obligatorios VACÍOS con lo que el bot ya tiene (nombre/descripción del presupuesto = el identificador; correo/teléfono del tomador
    // solo si el riesgo los trae). Nombres de persona, documentos, cuentas y casillas de consentimiento NUNCA. Se espera a que se habilite.
    await rellenarObligatoriosGuardarTurismos(form, marco, identificador, contacto)
    // v0.6.27 (25/10/2026, decisión del titular): la casilla informativa de privacidad sí se marca (lista blanca estrecha); las demás, nunca.
    await marcarCasillaPrivacidadGuardarTurismos(form, guard)
    const hastaHabilita = Date.now() + esperaHabilitaMs
    while (!(await boton.isEnabled().catch(() => false)) && Date.now() < hastaHabilita) await page.waitForTimeout(250)
    if (!(await boton.isEnabled().catch(() => false))) {
      const pendientes = await etiquetasPendientesGuardarTurismos(form)
      return { estado: 'no_guardado', motivo: pendientes.length ? `el botón «Guardar presupuesto» está deshabilitado: el formulario aún pide ${pendientes.map((v) => `«${v}»`).join(', ')} (el bot no los rellena)` : 'el botón «Guardar presupuesto» está deshabilitado y no se ve qué campo falta' }
    }
    // v0.6.14 (revisión de seguridad): RELECTURA de las 4 casillas justo antes del clic. Angular puede volver a marcar «Envío a
    // cliente/agente» o «Mostrar en eCliente» al cambiar otra (p. ej. «Todos los paquetes»): si alguna no está en su estado
    // obligatorio AHORA, no se pulsa. Sin esto, el bucle de arriba solo garantiza el estado de cada casilla en SU momento.
    for (const [etiqueta, quiero] of Object.entries(CASILLAS_GUARDAR_PRESUPUESTO_TURISMOS)) {
      const input = cajaDe(etiqueta).locator('input[type=checkbox]')
      if ((await input.count()) !== 1) return { estado: 'no_guardado', motivo: `la casilla «${etiqueta}» desapareció antes de guardar` }
      if ((await input.isChecked()) !== quiero) return { estado: 'no_guardado', motivo: `la casilla «${etiqueta}» volvió a quedar ${quiero ? 'desmarcada' : 'marcada'} antes de guardar (el portal la cambió): no se pulsa` }
    }
    // Confirmación: solo lo que APARECE tras el clic (`confirmacionGuardadoNueva`); un «Nº presupuesto» que ya estaba no vale.
    const textoAntes = await marco.locator('body').innerText().catch(() => '')
    let confirmado = false
    let referencia: string | null = null
    await pulsarGuardadoPresupuesto(page, guard, boton, { el: { tag: 'button', texto: planoTurismos(desc[0]) }, pantalla: { tipoPantalla: 'resultado', hayImportes: true, presupuestoEnCurso: false } }, async () => {
      const fin = Date.now() + esperaMs
      while (Date.now() < fin) {
        const textoAhora = await marco.locator('body').innerText().catch(() => '')
        const c = confirmacionGuardadoNueva(textoAntes, textoAhora)
        // v0.6.34: la señal puede llegar tarde y sin frase/número: un «Descargar propuesta» nuevo también confirma (referencia: la que haya, si no null).
        if (c.confirmado || descargaPropuestaNueva(textoAntes, textoAhora)) {
          confirmado = true
          referencia = c.referencia
          return
        }
        await page.waitForTimeout(300)
      }
    })
    if (confirmado) return { estado: 'guardado', identificador, referencia }
    return { estado: 'sin_confirmar', identificador, diagnostico: await diagnosticoTrasGuardarSinConfirmar(form, boton) }
  } catch (e) {
    // Una violación del guard (red de emisión) NO se traga: `comprobar` la relanza. Lo demás (campo bancario a la vista, casilla
    // sospechosa, diálogo, timeout) = no se guardó, sin tocar el precio ya leído.
    guard.comprobar()
    const motivo = e instanceof ErrorFronteraEmision ? 'hay un campo de cuenta bancaria a la vista' : e instanceof GuardadoConDialogoError ? 'el portal abrió un diálogo (no se acepta)' : e instanceof EmisionBloqueadaError ? 'el guard no autorizó el control' : 'el portal no dejó completar el guardado'
    return { estado: 'no_guardado', motivo }
  }
}

// ─────────── Datos que Allianz Turismos USÓ para calcular (18/10/2026, decisión de Alberto) · SOLO LECTURA ───────────
// HTML real (d675077b): todos los pasos viven en el DOM. CP y localidad, los del bloque «¿Quién es el tomador?» de «Datos personales»
// (Allianz los fija desde su fichero tras el documento); vehículo, la tarjeta marcada de «Datos del vehículo» (`nx-data-display`
// «Marca del vehículo», «Modelo», «Versión»; una sola tarjeta sin radio también vale). El resumen final (`app-review`) aún está vacío
// en la pantalla de precios: no se usa. Lo que no se lea → null (nunca la ficha). No pulsa ni escribe nada.
export const SEL_BLOQUE_TOMADOR_TURISMOS = 'nx-mt-person-information:has(nx-x-common-header[text="¿Quién es el tomador?"])'

export async function leerDatosUsadosTurismosAllianz(marco: Frame): Promise<{ codigoPostal: string | null; localidad: string | null; vehiculo: { marca: string | null; modelo: string | null; version: string | null } }> {
  const bloque = marco.locator(SEL_BLOQUE_TOMADOR_TURISMOS)
  const valorDe = async (etiqueta: string): Promise<string | null> => {
    const l = bloque.getByLabel(etiqueta, { exact: true })
    if ((await l.count().catch(() => 0)) !== 1) return null
    const v = await l.first().evaluate((n) => ((n as HTMLInputElement).value ?? n.textContent ?? '').replace(/\s+/g, ' ').trim()).catch(() => '')
    return v === '' ? null : v
  }
  // Sin funciones con nombre dentro de `evaluate` (tsx les mete `__name`, que no existe en la página): todo en línea.
  const vehiculo = await marco.evaluate((etiquetas) => {
    const marcada = Array.from(document.querySelectorAll('input[type=radio][id*="-nx-selectable-card-"]')).find((r) => (r as HTMLInputElement).checked)
    let raiz: Element | null = marcada ? (marcada.closest('nx-selectable-card') ?? null) : null
    if (!raiz) {
      const grupos = Array.from(document.querySelectorAll('nx-data-display[label="Marca del vehículo"]')).filter((n) => !n.closest('app-review'))
      raiz = grupos.length === 1 ? (grupos[0]!.parentElement?.closest(':has(nx-data-display[label="Versión"])') ?? null) : null
    }
    const out: (string | null)[] = []
    for (const et of etiquetas) {
      const d = raiz ? raiz.querySelector(`nx-data-display[label="${et}"]`) : null
      const div = d ? (Array.from(d.children).find((c) => c.tagName !== 'NX-DATA-DISPLAY-LABEL') as HTMLElement | undefined) : undefined
      const t = (div?.textContent ?? '').replace(/\s+/g, ' ').trim()
      out.push(t === '' ? null : t)
    }
    return { marca: out[0] ?? null, modelo: out[1] ?? null, version: out[2] ?? null }
  }, ['Marca del vehículo', 'Modelo', 'Versión']).catch(() => ({ marca: null, modelo: null, version: null }))
  return { codigoPostal: await valorDe('Código postal'), localidad: await valorDe('Localidad'), vehiculo }
}

// ─────────── Generali · Okta «Autenticación por SMS» (19/10/2026, decisión de Alberto) ───────────
// Tras «Iniciar sesión», access.generali.es (Okta) puede pedir el SMS (cada 30 días por dispositivo). Alberto decide que el bot
// pida el código por Telegram (relevo-sms.ts), lo escriba, marque «No volver a solicitar en este dispositivo en 30 días» y pulse
// «Verificar». Tres controles, y SOLO en esa pantalla (origen y ruta EXACTOS): «Enviar» (lista blanca exacta), la casilla de 30
// días (etiqueta exacta) y «Verificar» (texto exacto). Cada uno UNA vez por trabajo, con el guard limpio y sin ventanas de red.
// El valor del código solo va a SU campo (etiqueta exacta «Introducir código»); nunca a mensajes, errores ni logs.

export const ORIGEN_ACCESO_OKTA_GENERALI = 'https://access.generali.es'
export const RUTA_OKTA_SMS_GENERALI = '/signin/verify/okta/sms'
/** Textos EXACTOS del control que manda el SMS (el enlace «Enviar» de la pantalla). */
export const TEXTOS_ENVIAR_SMS_GENERALI = Object.freeze(['Enviar', 'Enviar código'] as const)
export const BOTON_VERIFICAR_SMS_GENERALI = 'Verificar'
export const ETIQUETA_CODIGO_SMS_GENERALI = 'Introducir código'
export const ETIQUETA_RECORDAR_DISPOSITIVO_GENERALI = 'No volver a solicitar en este dispositivo en 30 días'

const normalOkta = (t: string | null | undefined) => (t ?? '').normalize('NFC').replace(/\s+/g, ' ').trim()

/** ¿Es la pantalla de SMS de Okta de Generali? Origen EXACTO `https://access.generali.es` y ruta exacta (sin credenciales). PURA. */
export function esUrlOktaSmsGenerali(url: string): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.origin !== ORIGEN_ACCESO_OKTA_GENERALI || u.username || u.password) return false
  return u.pathname.replace(/\/+$/, '') === RUTA_OKTA_SMS_GENERALI
}

function exigirPantallaOkta(page: Page, guard: GuardEmision, que: string): void {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', `${que} de Okta con una ventana de red abierta`)
  if (!esUrlOktaSmsGenerali(page.url())) throw new ErrorMapaGuardGenerali(`la pantalla «Autenticación por SMS» de Okta (${que})`)
}

function marcarUsoOkta(guard: GuardEmision, clave: string): void {
  const usados = AVANCES_USADOS.get(guard) ?? new Set<string>()
  if (usados.has(clave)) throw new EmisionBloqueadaError('fase', `${clave} ya se usó en este trabajo`)
  usados.add(clave)
  AVANCES_USADOS.set(guard, usados)
}

/** Un href absoluto a otro origen que no sea el de Okta de Generali: no se pulsa. */
function hrefFueraDeOkta(desc: readonly (string | null)[]): boolean {
  return desc.some((d) => typeof d === 'string' && /^\s*https?:/i.test(d) && !d.trim().toLowerCase().startsWith(`${ORIGEN_ACCESO_OKTA_GENERALI}/`))
}

/**
 * «Enviar» del SMS, SI HACE FALTA: si no hay ningún control visible con un texto de `TEXTOS_ENVIAR_SMS_GENERALI` → `false` (el
 * portal ya lo mandó; no se pulsa nada). Uno → se pulsa UNA vez por trabajo tras `comprobarBoton`. Varios → hueco, sin pulsar.
 */
export async function pulsarEnviarSmsGenerali(page: Page, guard: GuardEmision): Promise<boolean> {
  exigirPantallaOkta(page, guard, '«Enviar» del SMS')
  const hallados: Locator[] = []
  for (const rol of ['link', 'button'] as const) {
    for (const texto of TEXTOS_ENVIAR_SMS_GENERALI) {
      const l = page.getByRole(rol, { name: texto, exact: true }).filter({ visible: true })
      const n = await l.count().catch(() => 0)
      for (let i = 0; i < n; i++) hallados.push(l.nth(i))
    }
  }
  if (hallados.length === 0) return false
  if (hallados.length !== 1) throw new ErrorMapaGuardGenerali(`el control «Enviar» del SMS (${hallados.length} visibles; hace falta exactamente uno)`)
  const control = hallados[0]!
  const desc = await descripcion(control)
  if (!(TEXTOS_ENVIAR_SMS_GENERALI as readonly string[]).includes(normalOkta(desc[0]))) throw new EmisionBloqueadaError('boton', normalOkta(desc[0]).slice(0, 80))
  if (hrefFueraDeOkta(desc)) throw new EmisionBloqueadaError('boton', '«Enviar» del SMS apunta fuera de Okta')
  comprobarBoton(desc)
  marcarUsoOkta(guard, 'generali:okta:enviar')
  await control.click()
  guard.comprobar()
  return true
}

/** El campo del código: etiqueta EXACTA «Introducir código»; si no la hay, los nombres de Okta (classic `answer`, OIE `credentials.passcode`). */
async function campoCodigoOkta(page: Page): Promise<Locator> {
  const porEtiqueta = page.getByLabel(ETIQUETA_CODIGO_SMS_GENERALI, { exact: true }).filter({ visible: true })
  if ((await porEtiqueta.count().catch(() => 0)) === 1) return porEtiqueta.first()
  const porNombre = page.locator('input[name="answer"], input[name="credentials.passcode"]').filter({ visible: true })
  if ((await porNombre.count().catch(() => 0)) === 1) return porNombre.first()
  throw new ErrorMapaGuardGenerali('el campo «Introducir código» del SMS (no hay exactamente uno visible)')
}

/**
 * Escribe el código (4-8 dígitos), marca «No volver a solicitar en este dispositivo en 30 días» (si la casilla existe) y pulsa
 * «Verificar», UNA vez por trabajo. Devuelve si la casilla quedó marcada. No espera al resultado: eso lo mira relevo-sms.ts.
 */
export async function verificarCodigoSmsGenerali(page: Page, guard: GuardEmision, codigo: string): Promise<{ recordado: boolean }> {
  exigirPantallaOkta(page, guard, '«Verificar» del SMS')
  if (!/^\d{4,8}$/.test(codigo)) throw new ErrorTarificador('datos', 'generali: el código SMS no tiene forma de código (4-8 dígitos)')
  marcarUsoOkta(guard, 'generali:okta:verificar')
  await exigirSinCuentaBancaria(page)
  const campo = await campoCodigoOkta(page)
  await exigirCampoNoBancario(campo)
  // Casilla de 30 días: etiqueta EXACTA. Una sola; si no existe se sigue (el código vale igual, pero el dispositivo no se recuerda).
  let recordado = false
  const casilla = page.getByLabel(ETIQUETA_RECORDAR_DISPOSITIVO_GENERALI, { exact: true })
  const nCasillas = await casilla.count().catch(() => 0)
  if (nCasillas > 1) throw new ErrorMapaGuardGenerali('la casilla «No volver a solicitar en este dispositivo en 30 días» (hay varias)')
  if (nCasillas === 1) {
    const c = casilla.first()
    const tipo = await c.getAttribute('type').catch(() => null)
    if (tipo !== 'checkbox') throw new ErrorMapaGuardGenerali('la casilla de 30 días (no es un checkbox)')
    // Marcar también es pulsar: la casilla (atributos, onclick, ancestros) pasa `comprobarBoton` antes.
    comprobarBoton(await descripcion(c))
    if (!(await c.isChecked().catch(() => false))) {
      await c.check({ timeout: 5_000 }).catch(async () => {
        // Okta pinta su propia casilla encima del input: se pulsa la ETIQUETA exacta (texto completo, sin manejadores de emisión).
        const lab = page.locator('label').filter({ hasText: ETIQUETA_RECORDAR_DISPOSITIVO_GENERALI }).filter({ visible: true })
        if ((await lab.count().catch(() => 0)) !== 1) return
        const desc = await descripcion(lab.first())
        if (normalOkta(desc[0]) !== ETIQUETA_RECORDAR_DISPOSITIVO_GENERALI) return
        comprobarBoton(desc)
        await lab.first().click()
      })
    }
    recordado = await c.isChecked().catch(() => false)
  }
  const boton = page.getByRole('button', { name: BOTON_VERIFICAR_SMS_GENERALI, exact: true }).filter({ visible: true })
  if ((await boton.count().catch(() => 0)) !== 1) throw new ErrorMapaGuardGenerali('el botón «Verificar» del SMS (no hay exactamente uno visible)')
  const desc = await descripcion(boton.first())
  const texto = normalOkta(desc[0]) || normalOkta(desc[3])
  if (texto !== BOTON_VERIFICAR_SMS_GENERALI) throw new EmisionBloqueadaError('boton', texto.slice(0, 80))
  if (hrefFueraDeOkta(desc)) throw new EmisionBloqueadaError('boton', '«Verificar» apunta fuera de Okta')
  comprobarBoton(desc)
  await campo.fill(codigo, { timeout: 5_000 })
  await boton.first().click()
  guard.comprobar()
  return { recordado }
}

/** Vacía el campo del código si la pantalla sigue ahí (para que ni la captura ni el HTML de evidencia lo lleven). */
export async function vaciarCodigoSmsGenerali(page: Page): Promise<void> {
  if (!esUrlOktaSmsGenerali(page.url())) return
  const campos = page.locator('input[name="answer"], input[name="credentials.passcode"]')
  const n = await campos.count().catch(() => 0)
  for (let i = 0; i < n; i++) await campos.nth(i).fill('', { timeout: 2_000 }).catch(() => undefined)
  const porEtiqueta = page.getByLabel(ETIQUETA_CODIGO_SMS_GENERALI, { exact: true })
  if ((await porEtiqueta.count().catch(() => 0)) === 1) await porEtiqueta.first().fill('', { timeout: 2_000 }).catch(() => undefined)
}

/**
 * Mapfre (21/10/2026): pulsa Escape para cerrar un AVISO MODAL del portal que tapa la home (nunca compromete nada: solo
 * cierra un diálogo; no hay foco en ningún formulario ni campo de emisión). El teclado vive SOLO en este fichero.
 */
export async function pulsarEscapeAvisoModal(page: Page): Promise<void> {
  await page.keyboard.press('Escape').catch(() => undefined)
}

// ─────────── v0.2.52 del bot Generali · fase de pruebas de «Tipo de vehículo»: el OTRO botón «Vehículo» (`lnkVehi`) ───────────
// Puerta EXACTA (decisión de Alberto, 28/10/2026: «que lo pruebe el bot»): solo el control de id `reg1063A_vehiculo_caracVehiculo_lnkVehi` cuyo
// texto/valor es EXACTAMENTE «Vehículo», en un marco de www.generali.es. El clic va además por `pulsar` (guard genérico). Nunca emitir/contratar/
// grabar/calcular/confirmar: cualquier otro id o texto, aunque se parezca, no pasa.

/** Id EXACTO del segundo botón «Vehículo» de «Características del vehículo» (Genernet). */
export const ID_OTRO_VEHICULO_GENERALI = 'reg1063A_vehiculo_caracVehiculo_lnkVehi'

/** ¿Puede la fase de pruebas pulsar este control? Origen www.generali.es, id EXACTO y texto/valor EXACTO «Vehículo». PURA. */
export function otroVehiculoGeneraliPermitido(c: { id: string | null | undefined; texto: string | null | undefined; url: string | null | undefined }): boolean {
  let origen = ''
  try {
    origen = new URL(String(c.url ?? '')).origin
  } catch {
    origen = ''
  }
  if (origen !== ORIGEN_PORTAL_GENERALI) return false
  if (String(c.id ?? '') !== ID_OTRO_VEHICULO_GENERALI) return false
  return String(c.texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase() === 'vehiculo'
}

/**
 * v0.2.52 · Opciones de «Tipo de placa» de «Características del vehículo» (Genernet, name EXACTO). Solo LOCALIZA: el adaptador no puede nombrar
 * radios (cepo de la raíz) y el clic va por `pulsar` (guard genérico + comprobarBoton). La opción (ordinaria/nacional, rótulo exacto) la elige el adaptador.
 */
export function opcionesTipoPlacaGenerali(raiz: Page | Frame): Locator {
  return raiz.locator('input[type="radio"][name="reg1063A.vehiculo.caracVehiculo.yplaca"]')
}
