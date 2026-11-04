// TARIFICAR ≠ EMITIR (05/10/2026). El bot entra en portales donde, a dos clics de la cotización,
// está el botón que CONTRATA una póliza de verdad a nombre de un cliente. Este guard es la
// barrera: si la URL a la que se navega o el botón que se va a pulsar casa con el patrón, el
// trabajo se aborta como `error_definitivo` y NO se reintenta.
//
// Es deliberadamente bruto: «planta baja» o «datos del contratante» en un BOTÓN también lo
// disparan. Mejor un falso positivo (el adaptador rellena esos campos con `fill`/`selectOption`/
// `check`, no pulsando botones) que una póliza emitida por un bot.

// El patrón pedido (/emit|contrat|formaliz|suplement|anul|baja/i) NO casa con «emisión»/«emision»
// (no contiene «emit»): visto en rojo el 05/10/2026. Se añade `emisi` (una «remisión» también lo
// dispara: falso positivo aceptado).
import { PATRONES_GUARDADO_GUARD } from './acciones-portal.ts'

// Verbos de botón que Alberto prohíbe sin su OK (14/10/2026): firmar, pagar, domiciliar. SOLO como palabra completa
// (sin `\b`: `btn_pagar` y `btnPagar` cuentan; «confirmar» se salva con `(?<!con)`) para no tocar etiquetas de formulario: «Forma de pago»,
// «Fraccionamiento de pago», «Domicilio», «Confirmar».
const VERBOS_PROHIBIDOS = '(?:(?<!con)firmar|firma[\\s_+-]*digital|pagar|pago[\\s_+-]*con[\\s_+-]*tarjeta|realizar[\\s_+-]*(?:el[\\s_+-]*)?pago|domiciliar|grabar[\\s_+-]*poliza)(?![a-z])'
export const PATRON_EMISION = new RegExp(`emit|emisi|contrat|formaliz|suplement|anul|baja|${VERBOS_PROHIBIDOS}`, 'i')

// Textos de Allianz ePAC (capturas del 05/10/2026) que el bot NUNCA debe pulsar, sea cual sea la fase:
// el radio «ELIJA UNA OPCIÓN» (por texto; la elección legítima va por la máquina de fases), «RECUPERACIÓN
// DE CONTRASEÑA» (toca las credenciales), y las pestañas «Archivar» y «Proyecto Ampliado» (guardar: solo con
// `permitirGuardarPresupuesto`; más «Emitir», que ya casa con PATRON_EMISION). Se comparan sin tildes y tolerando separadores.
// «NUEVA ALTA» NO está aquí a propósito (Alberto, 05/10/2026): es la NAVEGACIÓN para cotizar.
// «Archivar» (texto, td#store, `sendActionEvent('store')`) viene de `PATRONES_GUARDADO_GUARD` (acciones-portal.ts, lista
// única del 14/10/2026): sigue BLOQUEADO aquí; solo `permitirGuardarPresupuesto` lo deja pasar (ver `pareceEmision`).
/** «Generar Proyecto» de Mapfre NSEI. Bloqueado siempre salvo con `permitirGenerarProyectoMapfre` (ver `OpcionesGuard`). */
export const PATRON_GENERAR_PROYECTO_MAPFRE = /generar[\s_+-]*proyecto/i
/** «Ir a generar proyecto» de Mapfre NSEI (navega al paso donde vive «Generar Proyecto»). Bloqueado siempre salvo con `permitirIrAGenerarProyectoMapfre` Y texto ENTERO exacto. */
export const PATRON_IR_A_GENERAR_MAPFRE = /ir[\s_+-]*a[\s_+-]*generar/i
/** Texto ENTERO (sin tildes, minúsculas, espacios colapsados) del único control que abre `permitirIrAGenerarProyectoMapfre`. */
const TEXTO_IR_A_GENERAR_PROYECTO_MAPFRE = 'ir a generar proyecto'

export const TEXTOS_BLOQUEADOS_ALTA: readonly RegExp[] = [
  /elij[ae][\s_+-]*una[\s_+-]*opcion/i,
  /recuperacion[\s_+-]*de[\s_+-]*contrasena/i,
  ...PATRONES_GUARDADO_GUARD,
  // (`proyecto ampliado` y td#menu4 → `PATRONES_GUARDADO_GUARD`, arriba: pasan solo con `permitirGuardarPresupuesto`.)
  // Allianz «RC PYME» (app 1430, 07/10/2026): pestañas td#menu3 Archivar · menu4 Proyecto ampliado (guardar) · menu5 Datos
  // emisión (id EXACTO: las descripciones se miran una a una), div#btnAccept «Aceptar» (llama a emision_ipid) y
  // div#btnFracciona «Pago fraccionado». «Datos emisión» ya casa con PATRON_EMISION (`emisi`).
  /^\s*menu[35]\s*$/i,
  /btn[\s_+-]*accept/i,
  /btn[\s_+-]*fracciona/i,
  /pago[\s_+-]*fraccionado/i,
  // Allianz «Negocio» (app 2038, 07/10/2026): #idbtnAceptar «Siguiente» (onclick botonSiguienteOk()) avanza a «5. Revisión»,
  // que puede persistir el tomador real; también los enlaces del stepper con el mismo handler. Bloqueado aunque se permita «Aceptar».
  /idbtn[\s_+-]*aceptar/i,
  /boton[\s_+-]*siguiente[\s_+-]*ok/i,
  // Allianz ePAC Autos/Moto («Motos-online», grabación del 09/10/2026): pestañas td#store «Archivar»
  // (onclick sendActionEvent('store')) y td#contract «Emitir» (onclick validar_aceptar()); el «Aceptar» del pie de la
  // pestaña Tarificar (div#o_N, onclick validar_aceptar()) también contrata. Bloqueados por id/handler aunque se
  // permita «Aceptar»: «contract» (inglés) NO casa con `contrat`. «Datos básicos», «Riesgo municipio», «Tarificar»
  // (td#rate) e «IPID» (documentoIPID) son navegación/lectura y pasan.
  // (td#store y `sendActionEvent('store')` → `PATRONES_GUARDADO_GUARD`, arriba.)
  /^\s*contract\s*$/i,
  // `contract` suelto se aplica también a URL de navegación y POST. Cotejado (10/10/2026) con las URL de las grabaciones
  // de Allianz (auto, moto, comercio, comunidades: `/drpc82/main/control.do`, `/drrg01|drrg21/SEAServlet?action=start…`,
  // `/ngx-azs-epac/private/home|application`): ninguna lo contiene → sin falso positivo conocido. NO se acota: acotarlo
  // sería debilitar la barrera (un `doContract`, `contractAction` o `/contract.do` pasarían). Si un día una ruta legítima
  // lo lleva, el trabajo muere como `error_definitivo` (fail-closed) y se revisa con la grabación; lo vigila
  // guardianes.test.ts («contract en URL»).
  /contract/i,
  /validar[\s_+-]*aceptar/i,
  // Mapfre NSEI, diálogo «Selección de vehículo» (14/10/2026): el bot NUNCA dice que el vehículo no es el suyo ni lo da de
  // alta fuera de catálogo; si la fila no casa, PARA. Bloqueados en todo `pulsar()` y también en la función guardada
  // del diálogo (guard.ts), aunque esta permita «Aceptar».
  /no[\s_+-]*es[\s_+-]*el[\s_+-]*vehiculo/i,
  /vehiculo[\s_+-]*no[\s_+-]*catalogado/i,
  // Mapfre NSEI, paso «Coberturas» (grabación de Alberto del 15/10/2026): «Ir a generar» y «Generar Proyecto» crean un nº de
  // proyecto REAL en Mapfre y su documentación. Bloqueados en todo `pulsar()`, en el explorador IA y con `permitirGuardarPresupuesto`.
  // «Generar Proyecto» (22/10/2026, Alberto: un proyecto no es póliza) SOLO pasa con la opción estrecha
  // `permitirGenerarProyectoMapfre`, que pide únicamente `generarProyectoMapfre` (guard.ts del worker) para su botón y su ventana de red.
  PATRON_IR_A_GENERAR_MAPFRE,
  PATRON_GENERAR_PROYECTO_MAPFRE,
]

// «Aceptar» es CONTEXTUAL (ver fases.ts): en Datos Básicos solo avanza a «Tarificar»; en Tarificar avanza
// a EMITIR. Bloqueado por texto en todo `pulsar()` genérico; solo la función guardada por fase (guard.ts)
// lo permite, con `permitirAceptar`. «Aceptar cookies» también cae: falso positivo aceptado (fail-closed).
export const PATRON_ACEPTAR = /aceptar/i

export type OpcionesGuard = {
  permitirAceptar?: boolean
  /**
   * GUARDAR PRESUPUESTO (14/10/2026): deja pasar SOLO las entradas de Archivar (`PATRONES_GUARDADO_GUARD`) y la acción `store`
   * en parámetros. `PATRON_EMISION`, `contract`, `validar_aceptar`, pago fraccionado… siguen bloqueados. «Proyecto ampliado» es GUARDAR (como Archivar);
   su único id con «emisi» (`td#EMISION_PROJ`) pasa por la excepción estrecha `EXCEPCION_PROYECTO_AMPLIADO` (acciones-portal.ts).
   * Solo lo pide `pulsarGuardadoPresupuesto` (worker) y la red durante SU ventana.
   */
  permitirGuardarPresupuesto?: boolean
  /**
   * «GENERAR PROYECTO» DE MAPFRE NSEI (22/10/2026, Alberto: un proyecto no es póliza). Excepción ESTRECHA: quita de los bloqueos
   * SOLO `PATRON_GENERAR_PROYECTO_MAPFRE`; no abre Archivar/store, «Aceptar», «Ir a generar» ni nada de `PATRON_EMISION`.
   * Solo la pide `generarProyectoMapfre` (guard.ts del worker), para su botón y para la red durante SU ventana. El explorador IA
   * (`bloqueoGuardadoPresupuesto`) NUNCA la usa: para él «Generar proyecto» sigue siendo `boton_de_emision`.
   */
  permitirGenerarProyectoMapfre?: boolean
  /**
   * «IR A GENERAR PROYECTO» DE MAPFRE NSEI (22/10/2026): excepción ESTRECHA y por TEXTO ENTERO. Solo una descripción cuyo texto
   * completo (sin tildes, mayúsculas ni espacios de más) sea «Ir a generar proyecto» deja de casar con `PATRON_IR_A_GENERAR_MAPFRE` y
   * `PATRON_GENERAR_PROYECTO_MAPFRE`; cualquier otra cosa (id, href, «Contratar», «Ir a generar proyecto y contratar») sigue
   * bloqueada, y `PATRON_EMISION` nunca se relaja. Solo la pide `generarProyectoMapfre` (guard.ts del worker), UNA vez, para navegar.
   */
  permitirIrAGenerarProyectoMapfre?: boolean
}

// Sin «parameter properties» (`constructor(readonly x)`): `node --test` solo QUITA tipos y no las admite.
/** 0.3.23: tope del detalle del cuerpo en el mensaje del guard (el error viaja recortado a 2000 car. con su prefijo y la URL). */
export const MAX_DETALLE_CUERPO_MENSAJE = 1500

export class EmisionBloqueadaError extends Error {
  readonly tipo = 'emision' as const
  readonly donde: 'url' | 'boton' | 'fase'
  readonly texto: string
  /**
   * 0.3.23: `detalleCuerpo` = lo que casó en el CUERPO (solo NOMBRES de parámetro y clase de valor, nunca valores: `textoDetalleCuerpo`).
   * Va DELANTE y sin el recorte de 200 del texto (antes, con la URL de NSE detrás, la lista se cortaba): su propio tope,
   * {@link MAX_DETALLE_CUERPO_MENSAJE}, por debajo de los 2000 car. con que viaja el error.
   */
  constructor(donde: 'url' | 'boton' | 'fase', texto: string, detalleCuerpo?: string) {
    const det = detalleCuerpo ? `[acción en el cuerpo de la petición: ${detalleCuerpo.slice(0, MAX_DETALLE_CUERPO_MENSAJE)}] ` : ''
    super(
      donde === 'fase'
        ? `guard_emision: fase bloqueada: ${texto.slice(0, 500)}`
        : `guard_emision: ${donde} bloqueada (casa con el patrón de emisión): «${det}${texto.slice(0, 200)}»`,
    )
    this.name = 'EmisionBloqueadaError'
    this.donde = donde
    this.texto = `${det}${texto}`
  }
}

/** Quita tildes para que «Emisión» o «Formalización» no se escapen por un acento. */
function plano(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

const SECUENCIA_PCT = /%[0-7][0-9a-f]|%[cd][0-9a-f]%[89ab][0-9a-f]|%e[0-9a-f](?:%[89ab][0-9a-f]){2}|%f[0-7](?:%[89ab][0-9a-f]){3}/gi

/** Decodifica %-secuencias UTF-8 válidas UNA A UNA: una secuencia mal formada (`%E0%A4%A`) no apaga la decodificación del resto (fail-closed). */
export function decodificarUrlTolerante(s: string): string {
  return s.replace(SECUENCIA_PCT, (m) => {
    try {
      return decodeURIComponent(m)
    } catch {
      return m
    }
  })
}

export function pareceEmision(texto: string | null | undefined, opciones: OpcionesGuard = {}): boolean {
  if (typeof texto !== 'string' || texto === '') return false
  let t = plano(texto)
  // Las URL pueden venir codificadas (`%C3%A9mitir`, `contrat%61r`): se decodifica si se puede.
  t = plano(decodificarUrlTolerante(t))
  if (PATRON_EMISION.test(t)) return true
  const irAGenerarExacto = opciones.permitirIrAGenerarProyectoMapfre === true && t.toLowerCase().replace(/\s+/g, ' ').trim() === TEXTO_IR_A_GENERAR_PROYECTO_MAPFRE
  const bloqueos = TEXTOS_BLOQUEADOS_ALTA.filter(
    (r) =>
      !(opciones.permitirGuardarPresupuesto && PATRONES_GUARDADO_GUARD.includes(r)) &&
      !(opciones.permitirGenerarProyectoMapfre && r === PATRON_GENERAR_PROYECTO_MAPFRE) &&
      !(irAGenerarExacto && (r === PATRON_IR_A_GENERAR_MAPFRE || r === PATRON_GENERAR_PROYECTO_MAPFRE)),
  )
  if (bloqueos.some((r) => r.test(t))) return true
  return !opciones.permitirAceptar && PATRON_ACEPTAR.test(t)
}

/**
 * Claves de parámetro que llevan la ACCIÓN de un framework legado (`action=store`, `"evento":"contract"`,
 * `sendActionEvent('store')` serializado…). Se mira la clave por su FINAL (`pfAction`, `accion`, `event_name` no).
 */
const CLAVE_ACCION = /(?:action|accion|event|evento|operation|operacion|command|comando|cmd|metodo|method)$/i
/** Pares `clave=valor` (formulario/URL) y `"clave": "valor"` (JSON). Lineal: clases sin solapes, un cuantificador por trozo. */
const PAR_CLAVE_VALOR = /["']?([A-Za-z_][\w.-]{0,63})["']?\s*[:=]\s*["']?([^&?#="',;}\]\r\n]{0,200})/g

/**
 * ¿El CUERPO de una petición (o la query de una URL) pide una acción de emisión? Además de `pareceEmision` sobre la
 * URL, el guard de red mira esto en las peticiones que no son GET: en el framework antiguo de ePAC la acción viaja en
 * el cuerpo del POST (`action=store` → Archivar, `contract` → Emitir) y la URL es siempre la misma. Se comprueba:
 *   · las llamadas serializadas `sendActionEvent('store')` / `validar_aceptar()` en cualquier parte;
 *   · el VALOR de cada parámetro con clave de acción (`action`, `accion`, `event`, `operation`, `cmd`…): `store`,
 *     `contract` o cualquier cosa que case con `pareceEmision`.
 * El resto del cuerpo (datos del riesgo: «planta baja», direcciones…) NO se mira con el patrón general: daría falsos
 * positivos en cada envío de formulario.
 */
export function parametrosParecenEmision(cuerpo: string | null | undefined, opciones: OpcionesGuard = {}): boolean {
  if (typeof cuerpo !== 'string' || cuerpo === '') return false
  const t = plano(decodificarUrlTolerante(cuerpo.replace(/\+/g, ' ')))
  // `store` (Archivar) solo pasa con `permitirGuardarPresupuesto`; `contract` nunca.
  const accionesDuras = opciones.permitirGuardarPresupuesto ? 'contract' : 'store|contract'
  if (new RegExp(`send[\\s_+-]*action[\\s_+-]*event\\s*\\(\\s*['"]?\\s*(${accionesDuras})`, 'i').test(t) || /validar[\s_+-]*aceptar/i.test(t)) return true
  for (const m of t.matchAll(PAR_CLAVE_VALOR)) {
    if (!CLAVE_ACCION.test(m[1])) continue
    const v = m[2].trim()
    if (new RegExp(`^(${accionesDuras})$`, 'i').test(v) || pareceEmision(v, opciones)) return true
  }
  return false
}

/** Claves de campo que nombran IBAN/cuenta/tarjeta (hard cap: nunca viajan en un POST de exploración). */
const CLAVE_DATO_FINANCIERO = /iban|cvv|cvc|tarjeta|card[\s_.-]*(?:no|num)|numero[\s_.-]*cuenta|cuenta[\s_.-]*bancaria|ccc/i

/**
 * 0.3.13 — Inspección ESTRICTA del cuerpo para los destinos POST extra de un avance (p. ej. `/drvp00/main/control.do`). Además de
 * `parametrosParecenEmision`, rechaza el cuerpo si el VALOR de una clave de acción (`action`, `accion`, `evento`…) nombra una acción
 * final real (emitir, contratar, CONFIRMAR, firmar, pagar, formalizar, grabar…) o si hay un campo de IBAN/cuenta/tarjeta.
 * Sin falsos positivos con los datos del riesgo: solo se miran claves de acción y nombres financieros. PURA.
 */
export function cuerpoLlevaAccionFinal(cuerpo: string | null | undefined, opciones: OpcionesGuard = {}): boolean {
  if (typeof cuerpo !== 'string' || cuerpo === '') return false
  if (parametrosParecenEmision(cuerpo, opciones)) return true
  const t = plano(decodificarUrlTolerante(cuerpo.replace(/\+/g, ' ')))
  for (const m of t.matchAll(PAR_CLAVE_VALOR)) {
    if (CLAVE_DATO_FINANCIERO.test(m[1])) return true
    if (CLAVE_ACCION.test(m[1]) && RE_ACCION_REAL_TRAS_PREFIJO.test(m[2])) return true
  }
  // Revisión 0.3.13: la acción puede ir en una clave que NO acaba en action/evento (`op=emitir`, `_eventId=contratar`, `tarea=EMITIR`,
  // `paso=emision`) o en el NOMBRE del botón enviado (`btnEmitir=1`), también en multipart. Se mira el NOMBRE de cada parámetro y el
  // COMIENZO de su valor contra verbos de acción final (no contra el patrón general: «planta baja», «Domicilio», «contratante» o
  // «pagador» no casan). Fail-closed: una dirección que EMPIECE por «Emitir…» abortaría el avance, no emitiría.
  for (const [k, v] of paresDelCuerpo(cuerpo)) {
    if (CLAVE_DATO_FINANCIERO.test(k) || NOMBRE_ACCION_FINAL.test(k) || VALOR_ACCION_FINAL.test(v)) return true
    // Revisión adversarial 0.3.19: en ASP.NET/OutSystems (`__doPostBack`, `OsAjax`) el control pulsado viaja como VALOR de `__EVENTTARGET`
    // (`…$wtBtnContratar`), no al principio del valor ni en una clave de acción: se mira el valor ENTERO contra nombres de acción final.
    if (/^__event(?:target|argument)$/i.test(k.trim()) && WIDGET_ACCION_FINAL.test(v)) return true
  }
  return false
}

/** Nombre de widget de acción final DENTRO de `__EVENTTARGET`/`__EVENTARGUMENT` (mismo criterio que `RE_NAME_ACCION_FINAL_SIN_TEXTO`, más grabar/anular/suplemento). */
const WIDGET_ACCION_FINAL = /emit|emis|contrat(?!ante)|contract|confirm|firm|pagar|pago|payment|formaliz|grabar|suplement|anula|iban|tarjet/i

/** Verbo de acción final en el NOMBRE de un parámetro (`btnEmitir`, `formEmision:aceptar`, `doContratar`). «contratante» no. */
const NOMBRE_ACCION_FINAL = /emitir|emision|contrat(?!ante)|confirmar|firmar|pagar|formaliz|grabar|suplement|anular/i
/** VALOR que EMPIEZA por un verbo/sustantivo de acción final (`EMITIR`, `contratar_poliza`, `Confirmar`, `pago`). */
const VALOR_ACCION_FINAL = /^\s*(?:emit|emision|contrat(?!ante)|contract|confirm|firmar|pag(?:ar|o)(?![a-z])|formaliz|grabar|suplement|anula)/i

/** Pares (nombre, valor) de un cuerpo form-urlencoded o multipart/form-data, ya decodificados y sin tildes. PURA. */
function paresDelCuerpo(cuerpo: string): [string, string][] {
  const dec = (x: string) => plano(decodificarUrlTolerante(x.replace(/\+/g, ' ')))
  const pares: [string, string][] = []
  if (/content-disposition\s*:\s*form-data/i.test(cuerpo)) {
    for (const m of cuerpo.matchAll(/name="([^"\r\n]{0,128})"[^\r\n]*\r?\n(?:[^\r\n]+\r?\n)*\r?\n([^\r\n]{0,200})/gi)) pares.push([plano(m[1]), plano(m[2])])
    return pares
  }
  for (const par of cuerpo.split('&')) {
    const i = par.indexOf('=')
    pares.push([dec(i < 0 ? par : par.slice(0, i)), i < 0 ? '' : dec(par.slice(i + 1))])
  }
  return pares
}

/** Lanza si la URL casa con el patrón. */
export function comprobarUrl(url: string, opciones: OpcionesGuard = {}): void {
  if (pareceEmision(url, opciones)) throw new EmisionBloqueadaError('url', urlParaMensaje(url))
}

/**
 * 0.3.44 (privacidad; Pelayo real: el error guardado en `tarificacion_trabajos.error` llevaba la query base64 del wizard, con
 * identificadores del agente/petición): la URL que va a un MENSAJE de bloqueo, SIN query ni fragmento (origen + ruta). Ilegible como URL
 * absoluta = se corta en el primer «?» o «#». PURA.
 */
export function urlParaMensaje(url: string | null | undefined): string {
  if (typeof url !== 'string') return ''
  if (/^https?:\/\//i.test(url.trim())) {
    try {
      const u = new URL(url.trim())
      return `${u.origin}${u.pathname}`
    } catch {
      // cae al recorte
    }
  }
  return url.split(/[?#]/)[0] ?? ''
}

/**
 * Lanza si el botón a pulsar casa con el patrón. Se mira TODO lo que lo describe (texto visible,
 * `aria-label`, `title`, `value`, `id`, `name`, `href`): un botón con icono y `id="btnEmitir"`
 * también es emitir.
 */
export function comprobarBoton(descripciones: readonly (string | null | undefined)[], opciones: OpcionesGuard = {}): void {
  for (const d of descripciones) {
    if (pareceEmision(d, opciones) || esTextoBotonProhibido(d)) throw new EmisionBloqueadaError('boton', String(d))
    // 0.3.36 (2.ª revisión adversarial): la MISMA normalización fuerte que la navegación libre (ancho completo, invisibles, confundibles,
    // letras sueltas «C o n t r a t a r»). Solo AÑADE bloqueo: lo que casaba en bruto sigue casando.
    if (typeof d !== 'string' || d === '') continue
    for (const f of formasFuertes(d)) {
      if (f !== d && (pareceEmision(f, opciones) || esTextoBotonProhibido(f))) throw new EmisionBloqueadaError('boton', String(d))
    }
  }
}

/**
 * Letras que se hacen pasar por latinas (cirílico/griego) → su latina. NFKC no las une. Solo minúsculas (tras `toLowerCase`).
 */
const CONFUSABLES: Readonly<Record<string, string>> = Object.freeze({
  а: 'a', в: 'b', е: 'e', ё: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', у: 'y', х: 'x', і: 'i', ї: 'i', ј: 'j', ѕ: 's', ԁ: 'd', ӏ: 'l',
  α: 'a', β: 'b', ε: 'e', η: 'n', ι: 'i', κ: 'k', ν: 'v', ο: 'o', ρ: 'p', τ: 't', υ: 'u', χ: 'x', ω: 'w',
})
const RE_CONFUSABLES = new RegExp(`[${Object.keys(CONFUSABLES).join('')}]`, 'gu')
/** Invisibles y de formato: `\p{Cf}` (U+00AD, U+200B-U+200F, U+2060-U+2064, U+FEFF, U+180E…), rellenos Hangul y U+034F. */
const RE_INVISIBLES = /[\p{Cf}͏ᅟᅠㅤﾠ]/gu

/**
 * Normalización FUERTE de un rótulo (revisión adversarial 03/11/2026): decodifica `%xx`, NFKC (ancho completo → ASCII), minúsculas,
 * sin diacríticos (ñ → n), sin invisibles/formato, confundibles → latinas, `_` → espacio, espacios colapsados. Pura.
 */
export function normalizarFuerte(x: string | null | undefined): string {
  return decodificarUrlTolerante(String(x ?? ''))
    .normalize('NFKC')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(RE_INVISIBLES, '')
    .replace(RE_CONFUSABLES, (ch) => CONFUSABLES[ch] ?? ch)
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Une las TIRADAS de 3 o más letras/cifras SUELTAS separadas por espacios o signos en una palabra («c o n t r a t a r», «e.m.i.t.i.r»,
 * «E-M-I-T-I-R» → «contratar», «emitir»). Las palabras de 2+ letras no se tocan. Sobre texto `normalizarFuerte`. Pura.
 */
export function unirDeletreo(p: string): string {
  return p.replace(/(?<![a-z0-9])[a-z0-9](?:[^a-z0-9]+[a-z0-9](?![a-z0-9])){2,}/g, (m) => m.replace(/[^a-z0-9]+/g, ''))
}

/**
 * Las formas FUERTES de un texto que miran `comprobarBoton`, `pulsar()` y la navegación libre (módulo y worker): `normalizarFuerte` y,
 * además, la misma con las letras sueltas unidas (`unirDeletreo`). Sin repetidos. Pura.
 */
export function formasFuertes(x: string | null | undefined): string[] {
  const p = normalizarFuerte(x)
  const d = unirDeletreo(p)
  return d === p ? [p] : [p, d]
}

/**
 * Regla FAIL-CLOSED de homoglifos (2.ª revisión adversarial 03/11/2026): tras `%xx`, NFKC, minúsculas, sin diacríticos (la ñ queda «n») y
 * sin invisibles, ¿queda alguna LETRA (`\p{L}`) fuera de a-z? «Emıtir» (ı sin punto), «ɑ», «ᴇ», cirílico o griego (aunque estén en
 * `CONFUSABLES`) → sí. Signos, cifras, flechas, emojis e iconos de fuente (uso privado) no son letras. Solo para RÓTULOS. Pura.
 */
export function tieneLetraAjena(x: string | null | undefined): boolean {
  const s = decodificarUrlTolerante(String(x ?? '')).normalize('NFKC').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(RE_INVISIBLES, '')
  return /[^\P{L}a-z]/u.test(s)
}

/**
 * Verbos que `pulsar()` genérico NO pulsa nunca en un RÓTULO (2.ª revisión adversarial 03/11/2026; ES + EN, palabra entera sobre las formas
 * fuertes): enviar, solicitar, eliminar/borrar, cobrar, autorizar, guardar/save, y los de acción sobre terceros que la navegación libre
 * también bloquea (transferir, traspasar, reservar, liquidar, ejecutar, procesar, renovar). «Cancelar» NO está: lo pulsa la puerta del
 * diálogo «Atención» de ePAC (`cerrarDialogoTerminoEpac`, por `pulsar()`, texto exacto). Las puertas estrechas por compañía que comparan
 * texto exacto no pasan por aquí.
 */
export const RE_ROTULO_PULSAR_PROHIBIDO = new RegExp(
  '\\b(?:' + [
    'enviar', 'envia', 'envie', 'reenviar', 'send\\w*', 'solicit\\w*', 'request', 'eliminar', 'elimina', 'borrar', 'borra', 'delete\\w*', 'remove',
    'cobrar', 'cobra', 'charge', 'autoriz\\w*', 'authori[sz]\\w*', 'guardar', 'guarda', 'save', 'transferir', 'transfer\\w*', 'traspas\\w*',
    'reservar', 'reserva', 'reserve', 'book', 'liquidar', 'liquida', 'settle\\w*', 'ejecutar', 'ejecuta', 'execute', 'procesar', 'procesa',
    'process', 'renovar', 'renueva', 'renew\\w*',
  ].join('|') + ')\\b',
)
/** Lo inequívoco de `RE_ROTULO_PULSAR_PROHIBIDO` sobre la forma COMPACTA (sin espacios ni signos) de un rótulo CORTO. */
const RE_ROTULO_PULSAR_COMPACTO = /enviar|solicit|eliminar|borrar|cobrar|autoriz|guardar|transfer|traspas|reservar|liquidar|ejecutar|procesar|renovar/
/** Rótulos más largos que esto no se miran en forma compacta (unir palabras de un texto largo inventa términos: «José Mit…» → «emit»). */
export const MAX_ROTULO_COMPACTO = 30

/**
 * 2.ª revisión adversarial (03/11/2026): ¿el RÓTULO (texto, aria-label, title, value o nombre accesible: aria-labelledby, alt) nombra algo
 * que `pulsar()` genérico no pulsa? Mira, sobre las formas fuertes: acción final (`rotuloNombraAccionFinal`), el patrón de emisión,
 * `RE_ROTULO_PULSAR_PROHIBIDO`, la forma compacta si es corto, y la regla de homoglifos (`tieneLetraAjena`). Devuelve el motivo (sin el
 * texto) o `null`. Pura.
 */
export function motivoRotuloPulsar(texto: string | null | undefined): 'letra_ajena' | 'accion_final' | 'emision' | 'verbo_prohibido' | null {
  if (typeof texto !== 'string' || texto.trim() === '') return null
  if (tieneLetraAjena(texto)) return 'letra_ajena'
  if (rotuloNombraAccionFinal(texto)) return 'accion_final'
  const formas = formasFuertes(texto)
  if (formas.some((f) => pareceEmision(f) || esTextoBotonProhibido(f))) return 'emision'
  if (formas.some((f) => RE_ROTULO_PULSAR_PROHIBIDO.test(f))) return 'verbo_prohibido'
  const p = formas[0]!
  if (p.length <= MAX_ROTULO_COMPACTO) {
    const k = p.replace(/[^a-z0-9]+/g, '')
    if (k !== '' && (PATRON_EMISION.test(k) || RE_ROTULO_PULSAR_COMPACTO.test(k))) return 'emision'
  }
  return null
}

/**
 * Lanza si algún RÓTULO de `pulsar()` casa `motivoRotuloPulsar`. `nombres`: el nombre de cada posición para el mensaje (el mensaje NUNCA
 * lleva el rótulo: un aria-label/alt/aria-labelledby puede traer datos). Pura.
 */
export function comprobarRotulosPulsar(rotulos: readonly (string | null | undefined)[], nombres: readonly string[] = []): void {
  rotulos.forEach((d, i) => {
    const m = motivoRotuloPulsar(d)
    if (m !== null) throw new EmisionBloqueadaError('boton', `rótulo no pulsable por pulsar() (${nombres[i] ?? `posición ${i}`}: ${m})`)
  })
}

/**
 * ACCIÓN FINAL en el RÓTULO de un control (texto, aria-label, title, value), ES + EN, palabra entera sobre `normalizarFuerte`
 * (revisión adversarial 03/11/2026: `pulsar()` dejaba pasar «Confirmar», «Finalizar», «Comprar», «Submit»…). «Continuar», «Siguiente»,
 * «Calcular», «Comprobar», «Buscar» no casan. `RE_ROTULO_ACCION_FINAL_COMPACTO`: lo inequívoco, sobre la forma sin espacios ni signos.
 */
export const RE_ROTULO_ACCION_FINAL = new RegExp(
  '\\b(?:' + [
    'confirm\\w*', 'finaliz\\w*', 'terminar', 'complet(?:ar|e)', 'compr(?:ar|a)', 'adquiri\\w*', 'adquisicion', 'suscrib\\w*', 'suscripcion\\w*',
    'registrar(?:se)?', 'activar', 'aprobar', 'validar', 'realizar (?:el )?pedido', 'abonar', 'presentar', 'cursar', 'efectuar', 'tramitar', 'ok', 'hecho',
    'submit\\w*', 'buy', 'purchase\\w*', 'finish\\w*', 'complete\\w*', 'apply', 'place (?:the )?order', 'subscribe\\w*', 'register\\w*', 'activate\\w*',
    'approve\\w*', 'validate\\w*', 'done', 'proceed', 'pay(?: now)?', 'checkout', 'check out',
  ].join('|') + ')\\b',
)
const RE_ROTULO_ACCION_FINAL_COMPACTO = /confirm|finaliz|submit|purchase|checkout|suscrib|adquiri|tramitar/

/** ¿El rótulo nombra una acción final (ver `RE_ROTULO_ACCION_FINAL`)? `permitirConfirmarExacto`: el texto ENTERO «Confirmar» no cuenta. Pura. */
export function rotuloNombraAccionFinal(texto: string | null | undefined, opciones: { permitirConfirmarExacto?: boolean } = {}): boolean {
  if (typeof texto !== 'string' || texto.trim() === '') return false
  const p = normalizarFuerte(texto)
  if (opciones.permitirConfirmarExacto === true && p.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '') === 'confirmar') return false
  if (RE_ROTULO_ACCION_FINAL.test(p)) return true
  return RE_ROTULO_ACCION_FINAL_COMPACTO.test(p.replace(/[^a-z0-9]+/g, ''))
}

/**
 * Lanza si algún RÓTULO de la descripción (posiciones 0-3 de `descripcion()` del worker: texto, aria-label, title, value) nombra una
 * acción final. Solo los rótulos: ids, href y manejadores los sigue mirando `comprobarBoton`. Pura.
 */
export function comprobarRotulosAccionFinal(descripciones: readonly (string | null | undefined)[], opciones: { permitirConfirmarExacto?: boolean } = {}): void {
  // El mensaje NO lleva el rótulo (un aria-label/title puede traer datos): solo QUÉ posición casó.
  const posiciones = ['texto', 'aria-label', 'title', 'value']
  descripciones.slice(0, 4).forEach((d, i) => {
    if (rotuloNombraAccionFinal(d, opciones)) throw new EmisionBloqueadaError('boton', `rótulo de acción final (${posiciones[i]})`)
  })
}

/**
 * «ACCESO A NSE» DE MAPFRE WMEDIADORES (28/10/2026, patinete «MásPatín»). La página intermedia de la tarjeta «Patinetes» solo
 * tiene el enlace «Acceso a NSE», cuyo href es `javascript:abrirAplicacion('inicio.jsp', 'NUEVO SISTEMA DE EMISI%C3%93N');`: ABRE
 * la aplicación «Nuevo Sistema de Emisión» (donde se tarifica), no emite nada. Excepción ESTRECHA: solo deja fuera de
 * `comprobarBoton` la descripción que sea EXACTAMENTE esa llamada (decodificada o no, sin tildes; `javascript:` y `;` final
 * opcionales). Cualquier otra aplicación, otro jsp, un sufijo o «Emitir…» siguen bloqueados; la usa SOLO la puerta
 * `pulsarAccesoNseMapfre` del worker (guard.ts), junto con el texto visible EXACTO «Acceso a NSE».
 */
export const TEXTO_ACCESO_NSE_MAPFRE = 'Acceso a NSE'
const RE_LANZADOR_NSE_MAPFRE = /^(?:javascript:\s*)?abrirAplicacion\(\s*'inicio\.jsp'\s*,\s*'NUEVO SISTEMA DE EMISION'\s*\)\s*;?$/
export function esLanzadorAplicacionNseMapfre(d: string | null | undefined): boolean {
  if (typeof d !== 'string' || d === '' || d.length > 200) return false
  const t = plano(decodificarUrlTolerante(d)).replace(/\s+/g, ' ').trim()
  return RE_LANZADOR_NSE_MAPFRE.test(t)
}

/**
 * RUTA DE APLICACIÓN TOLERABLE (28/10/2026, decisión EXPLÍCITA de Alberto; Mapfre NSE = «Nuevo Sistema de Emisión»: todas sus pantallas,
 * también las de TARIFICAR, viven bajo `/EVT21_NSE_FWEB/app/emision/…`). Solo el PREFIJO EXACTO de esa ruta, en ese ORIGEN exacto,
 * deja de casar con el patrón de emisión; el resto de la URL (segmentos que siguen, query, fragmento) se sigue mirando. Si lo que sigue
 * al prefijo nombra una acción de emisión real (emitir, contratar, confirmar, firma, pago, formalizar, grabar…), NO se neutraliza nada.
 * La declara cada entrada de exploración (`rutasAppTolerables`); sin regla, todo igual.
 */
export type RutaTolerable = {
  origen: string
  prefijo: string
  /**
   * 0.3.41 (Pelayo, wizard `apps.pelayo.com/contratacion-autos/`): si está, SOLO se neutraliza el prefijo cuando lo que sigue (la RUTA, sin
   * query ni fragmento, sin «/» final, en minúsculas) es EXACTAMENTE uno de estos restos. Otro resto = no se neutraliza = el prefijo
   * («contratacion») sigue bloqueando. Fail-closed: un paso del wizard que no está en la lista no se navega. Sin la clave = cualquier resto.
   */
  rutasExactas?: readonly string[]
}
export const RE_ACCION_REAL_TRAS_PREFIJO = /emit|emiss|contrat|confirm|firm|assina|pago|pagar|pagam|formaliz|grab|suplement|anul|baja|domicili|tarjeta|iban/i
/** Estado (abierto/cerrado) de un panel JSF de la pantalla de productos de NSE: no es una acción. ANCLADO. */
export const RE_ESTADO_PANEL_JSF = /^formProductos:panelConfirm[A-Z]{1,4}OpenedState$/
/** Sustituto del prefijo neutralizado (no casa con ningún patrón del guard). */
const PREFIJO_NEUTRO = '/__ruta_app__/'
/**
 * Cuerpo (form-urlencoded) de una petición a una ruta TOLERADA: ¿nombra una acción de emisión real? Mira el NOMBRE de cada parámetro
 * (`formEmision:btnEmitir=…`) y el VALOR de `javax.faces.source` / `javax.faces.partial.execute` / `javax.faces.partial.render` (el
 * botón JSF que se pulsó) contra la misma lista que el resto de la ruta (`RE_ACCION_REAL_TRAS_PREFIJO`), no contra el patrón genérico
 * (los formularios NSE se llaman `formEmision…`). PURA.
 */
export function cuerpoToleradoConAccionReal(cuerpo: string | null | undefined, url?: string | null): boolean {
  return detalleCuerpoToleradoConAccionReal(cuerpo, url) !== null
}

/**
 * 0.3.20: último segmento (tras «:») de un campo de FECHA de firma del calendario RichFaces de Mapfre NSE. ANCLADO, sin mayúsculas.
 * 0.3.21 (Mapfre NSE real 29/10/2026, e6b08ea8…: tras la fecha bloqueó `formDG:localidadFirma`): lista CERRADA de DATOS sobre la firma
 * (fecha, hora, lugar) con los sufijos de componente JSF/RichFaces/PrimeFaces conocidos. Nada de «firmar», «btnFirma…», «firmaPoliza».
 */
export const RE_SEGMENTO_FECHA_FIRMA = /^(fecha|localidad|lugar|provincia|municipio|poblacion|hora|pais)firma(?:inputdate|inputcurrentdate|inputhidden|input|combo|_input|_hinput)?$/
/** Valor de un campo de fecha: vacío o cifras con separadores (dd/mm/aaaa, mm/aaaa, aaaa-mm-dd, con hora opcional). Sin letras. */
const RE_VALOR_FECHA = /^(?:|\d{1,4}(?:[/.-]\d{1,4}){1,2}(?: \d{1,2}:\d{2}(?::\d{2})?)?)$/
/** 0.3.21: valor de un campo de hora: vacío o hh:mm(:ss). Sin letras. */
const RE_VALOR_HORA = /^(?:|\d{1,2}:\d{2}(?::\d{2})?)$/
/** 0.3.21: palabras de ACCIÓN FINAL que un valor de lugar no puede llevar (además de `RE_ACCION_REAL_TRAS_PREFIJO`). */
const RE_VALOR_LUGAR_ACCION = /firm|emit|emis|contrat|confirm|pag|formaliz|acept|grab/
/** 0.3.21: texto de lugar YA plano (sin tildes, minúsculas): letras, cifras, espacio y ' . , / -; nada de «:», «;», «(», «=», «&». Sin `\\p{L}` (asegura compila con target ES2017). */
const RE_VALOR_LUGAR = /^[a-z\d '.,/-]{0,60}$/

/**
 * 0.3.20 (Mapfre NSE real 29/10/2026, POST a `…/informacionGeneral/datosGenerales.jsf`): el parámetro `formDG:fechaFirmaInputDate` (la FECHA
 * de firma, un dato del formulario) casaba con «firm» y abortaba el paso. 0.3.21: también la HORA y el LUGAR de firma (`formDG:localidadFirma`,
 * lugar/provincia/municipio/población/país). Excepción ESTRECHA: el nombre (ya decodificado) tiene forma de id JSF, su ÚLTIMO segmento casa
 * {@link RE_SEGMENTO_FECHA_FIRMA}, los segmentos anteriores no nombran ninguna acción real (`RE_ACCION_REAL_TRAS_PREFIJO`) y el VALOR es un
 * dato: fecha/hora vacía o sin letras; lugar vacío o texto de ≤60 car. sin «:»/«;»/«(», sin palabra de acción final, sin datos bancarios
 * (sin tiradas de ≥6 cifras). «btnFirmar», «firmarPoliza», «firma», `fechaFirma=Firmar`, `localidadFirma=Firmar`, `btnFirmar:localidadFirma`,
 * `btnCargaLocalidadFirmaSuscriptor` siguen bloqueando. Solo lo usa la inspección del cuerpo en rutas TOLERADAS (Mapfre NSE). PURA.
 */
export function esCampoFechaDeAccion(nombre: string, valor: string): boolean {
  const n = nombre.trim()
  if (!/^[\w.:$-]{1,120}$/.test(n)) return false
  const segs = n.split(':')
  const ultimo = (segs.pop() ?? '').toLowerCase()
  const m = RE_SEGMENTO_FECHA_FIRMA.exec(ultimo)
  if (!m) return false
  if (segs.some((s) => RE_ACCION_REAL_TRAS_PREFIJO.test(s))) return false
  const v = valor.trim()
  if (m[1] === 'fecha' || m[1] === 'hora') return RE_VALOR_FECHA.test(v) || RE_VALOR_HORA.test(v)
  if (v === '') return true
  const p = v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  return RE_VALOR_LUGAR.test(p) && !RE_VALOR_LUGAR_ACCION.test(p) && !RE_ACCION_REAL_TRAS_PREFIJO.test(p) && !/\d{6,}/.test(p.replace(/[\s.,/-]/g, ''))
}
/** 0.3.21: nombre explícito del mismo predicado (dato sobre la firma: fecha, hora o lugar). */
export const esCampoDatoDeFirma = esCampoFechaDeAccion

/**
 * 0.3.22 (Mapfre NSE real 29/10/2026, dbf8ef0e…, POST a `…/informacionGeneral/datosGenerales.jsf`): `formDG:panelConfirmCTOpenedState` es el
 * ESTADO abierto/cerrado de un modal RichFaces (`<id>OpenedState`), no una acción. Generaliza `RE_ESTADO_PANEL_JSF` (solo `formProductos`):
 * el nombre (ya decodificado) tiene forma de id JSF, su ÚLTIMO segmento termina EXACTAMENTE en `OpenedState` (con mayúsculas) y, quitando
 * «confirm», no nombra otra acción final (emitir, firmar, pagar…: `panelConfirmEmitirOpenedState` sigue parando, 0.3.10), los segmentos
 * ANTERIORES no nombran ninguna acción real (`RE_ACCION_REAL_TRAS_PREFIJO`) y el VALOR es vacío, `true` o `false` (sin mayúsculas). Solo ese
 * parámetro deja de contar POR SU NOMBRE; los demás (el botón pulsado, `javax.faces.source/partial.*`) se siguen mirando. Solo lo usa la
 * inspección del cuerpo en rutas TOLERADAS (Mapfre NSE). PURA.
 */
export function esEstadoModalJsf(nombre: string, valor: string): boolean {
  const n = nombre.trim()
  if (!/^[\w.:$-]{1,120}$/.test(n)) return false
  const segs = n.split(':')
  const ultimo = segs.pop() ?? ''
  // Con el id del FORMULARIO delante (`formDG:…`): un `panelConfirmCTOpenedState` suelto sigue parando (0.3.10).
  if (segs.length === 0 || segs.some((x) => x === '')) return false
  if (!/^[A-Za-z][A-Za-z\d_]{0,80}OpenedState$/.test(ultimo)) return false
  // El nombre del modal no puede nombrar OTRA acción final (0.3.10: `panelConfirmEmitirOpenedState` sigue parando): «confirm» es lo único
  // que se descuenta (es el «panelConfirm…» de RichFaces); emitir, firmar, pagar, contratar, grabar… en el nombre siguen bloqueando.
  const modal = ultimo.slice(0, -'OpenedState'.length)
  if (RE_ACCION_REAL_TRAS_PREFIJO.test(modal.replace(/confirm/gi, ''))) return false
  if (segs.some((s) => RE_ACCION_REAL_TRAS_PREFIJO.test(s))) return false
  // Revisión adversarial 0.3.22: un modal de CONFIRMACIÓN ABIERTO ('true') significa que el envío puede ser precisamente su confirmación:
  // solo se exime CERRADO ('' o 'false', lo visto en real). Un modal sin «confirm» en el nombre sí puede ir abierto.
  if (/confirm/i.test(modal)) return valor === '' || valor === 'false'
  return valor === '' || valor === 'true' || valor === 'false'
}

/**
 * 0.3.23 (Mapfre NSE real 30/10/2026, «Datos del vehículo (patinete)»): el POST a `…/infObjetoAsegurado/infObjetoAseguradoAutos.jsf` lleva
 * `formObjAseg:confirmarGuardado` (confirmar el GUARDADO de los datos del objeto asegurado, antes de tarificar) y casaba con «confirm».
 * Ruta EXACTA (origen + pathname, `;jsessionid` opcional) de la pantalla del objeto asegurado de NSE; nada más del flujo.
 */
const ORIGEN_NSE_MAPFRE = 'https://wmediadores.mapfre.com'
const RE_RUTA_OBJETO_ASEGURADO_NSE = /^\/EVT21_NSE_FWEB\/app\/emision\/infObjetoAsegurado\/infObjetoAsegurado[A-Za-z]{0,30}\.jsf(?:;jsessionid=[A-Za-z0-9._!-]{1,200})?$/
/** 0.3.23: el VALOR del campo: una ficha simple (≤20, letras/cifras/_/-) o vacío; nunca un nombre de control ni un rótulo con espacios. */
const RE_VALOR_FICHA_SIMPLE = /^[A-Za-z0-9_-]{0,20}$/
/** 0.3.23: lo que el valor de `confirmarGuardado` no puede nombrar (además de las listas de acción final): aceptar. */
const RE_VALOR_ACEPTAR = /acept/i

/**
 * 0.3.23: ¿es `formObjAseg:confirmarGuardado` (o `<form>:confirmarGuardado`) en el POST de la pantalla del OBJETO ASEGURADO de Mapfre NSE?
 * Excepción ESTRECHA, todo a la vez:
 *   · `url`: origen EXACTO `https://wmediadores.mapfre.com` y pathname EXACTO {@link RE_RUTA_OBJETO_ASEGURADO_NSE} (sin URL → no);
 *   · nombre con forma de id JSF, con formulario delante (≥2 segmentos, ninguno vacío), ÚLTIMO segmento EXACTAMENTE `confirmarGuardado`
 *     (con mayúsculas) y los anteriores sin acción real (`RE_ACCION_REAL_TRAS_PREFIJO`);
 *   · el VALOR no es un nombre/rótulo de acción: ficha simple (≤20, sin «:», espacios ni signos) que no casa con ninguna lista de acción
 *     final (`RE_ACCION_REAL_TRAS_PREFIJO`, `NOMBRE_ACCION_FINAL`, `VALOR_ACCION_FINAL`, `WIDGET_ACCION_FINAL`) ni con «acept». El botón
 *     JSF pulsado (`formObjAseg:confirmarGuardado=formObjAseg:confirmarGuardado`, name == value) sigue bloqueando.
 * Solo deja de contar ESE parámetro por su nombre; `javax.faces.source`/`partial.*`, `__EVENTTARGET` y cualquier otro «confirm» se siguen
 * mirando. Solo lo usa la inspección del cuerpo en rutas TOLERADAS (Mapfre NSE). PURA.
 */
export function esConfirmarGuardadoObjetoAsegurado(nombre: string, valor: string, url: string | null | undefined): boolean {
  if (typeof url !== 'string' || url === '') return false
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.username || u.password || u.origin !== ORIGEN_NSE_MAPFRE || !RE_RUTA_OBJETO_ASEGURADO_NSE.test(u.pathname)) return false
  const n = nombre.trim()
  if (!/^[\w.:$-]{1,120}$/.test(n)) return false
  const segs = n.split(':')
  const ultimo = segs.pop() ?? ''
  if (ultimo !== 'confirmarGuardado' || segs.length === 0 || segs.some((x) => x === '' || RE_ACCION_REAL_TRAS_PREFIJO.test(x))) return false
  const v = valor.trim()
  if (!RE_VALOR_FICHA_SIMPLE.test(v)) return false
  return ![RE_ACCION_REAL_TRAS_PREFIJO, NOMBRE_ACCION_FINAL, VALOR_ACCION_FINAL, WIDGET_ACCION_FINAL, RE_VALOR_ACEPTAR].some((r) => r.test(v))
}

/** 0.3.23: clase SANEADA del valor de un parámetro para el diagnóstico (nunca el valor). */
export type ClaseValorDiagnostico = 'vacío' | 'false' | 'true' | 'num' | 'otro'
export function claseValorDiagnostico(valor: string | null | undefined): ClaseValorDiagnostico {
  const v = (valor ?? '').trim()
  if (v === '') return 'vacío'
  if (v === 'false') return 'false'
  if (v === 'true') return 'true'
  if (/^-?\d{1,30}(?:[.,]\d{1,10})?$/.test(v)) return 'num'
  return 'otro'
}

/** Lo que casó en el cuerpo de una ruta tolerada: NOMBRE del parámetro, palabra de la lista y (0.3.23) clase de su valor. */
export type HalladoCuerpo = { parametro: string; patron: string; valor?: ClaseValorDiagnostico }

/**
 * Como `cuerpoToleradoConAccionReal`, pero diciendo QUÉ casó (0.3.8, real 28/10/2026 18:33: el guard paró `busquedaProductos.jsf` y no
 * se sabía por qué): el NOMBRE del parámetro (o `javax.faces.*`) y la palabra de la lista que casó. NUNCA el valor. `null` = nada.
 * 0.3.22: además `parametros` = TODOS los nombres que casan (sin repetir, cifras largas enmascaradas, nunca valores), para ver de una vez
 * todo lo que bloquearía en vez de ir parámetro a parámetro. `parametro`/`patron` siguen siendo el PRIMERO.
 * 0.3.23: cada hallazgo lleva la CLASE de su valor (`claseValorDiagnostico`: vacío/false/true/num/otro) y `url` (la de la petición) habilita
 * la exención estrecha {@link esConfirmarGuardadoObjetoAsegurado}; sin `url`, como antes.
 */
export function detalleCuerpoToleradoConAccionReal(cuerpo: string | null | undefined, url?: string | null): { parametro: string; patron: string; parametros: HalladoCuerpo[] } | null {
  if (typeof cuerpo !== 'string' || cuerpo === '') return null
  const dec = (x: string) => plano(decodificarUrlTolerante(x.replace(/\+/g, ' ')))
  const hallados: HalladoCuerpo[] = []
  const anotar = (parametro: string, patron: string, valor: ClaseValorDiagnostico) => {
    if (!hallados.some((h) => h.parametro === parametro && h.patron === patron && h.valor === valor)) hallados.push({ parametro, patron, valor })
  }
  for (const par of cuerpo.split('&')) {
    const i = par.indexOf('=')
    const k = dec(i < 0 ? par : par.slice(0, i))
    // 0.3.10 (real 28/10/2026, Mapfre patinete `busquedaProduct`): `formProductos:panelConfirmCTOpenedState` es el ESTADO abierto/cerrado
    // de un panel JSF, no una acción. Solo ese nombre ANCLADO se salta (su valor ni se lee); «confirm» en cualquier otro sitio sigue parando.
    if (RE_ESTADO_PANEL_JSF.test(k.trim())) continue
    const v = i < 0 ? '' : dec(par.slice(i + 1))
    // 0.3.20 (real 29/10/2026, Mapfre NSE `datosGenerales.jsf`): `formDG:fechaFirmaInputDate` es la FECHA de firma (un dato), no firmar.
    if (i >= 0 && esCampoFechaDeAccion(k, v)) continue
    // 0.3.22 (real 29/10/2026, Mapfre NSE `datosGenerales.jsf`): `formDG:panelConfirmCTOpenedState=` es el estado de un modal, no confirmar.
    if (i >= 0 && esEstadoModalJsf(k, v.trim())) continue
    // 0.3.23 (real 30/10/2026, Mapfre NSE `infObjetoAseguradoAutos.jsf`): confirmar el GUARDADO de los datos del objeto asegurado, no emitir.
    if (i >= 0 && esConfirmarGuardadoObjetoAsegurado(k, v, url)) continue
    const enNombre = RE_ACCION_REAL_TRAS_PREFIJO.exec(k)
    // Revisión de seguridad 0.3.8: un trozo SIN «=» (cuerpo JSON o texto) no es un nombre de parámetro y puede llevar datos
    // ({"nif":"…"}): solo se nombra un id de formulario con forma de id; cifras largas, enmascaradas.
    if (enNombre) {
      const n = k.trim()
      const forma = /^[\w.:$\-[\]]{1,80}$/.test(n)
      anotar(forma ? n.replace(/\d{5,}/g, '#') : '(cuerpo no form-urlencoded)', enNombre[0].toLowerCase(), i < 0 ? 'otro' : claseValorDiagnostico(v))
      continue
    }
    if (/^javax\.faces\.(?:source|partial\.execute|partial\.render)$/i.test(k.trim())) {
      const enValor = RE_ACCION_REAL_TRAS_PREFIJO.exec(v)
      if (enValor) anotar(k.trim(), enValor[0].toLowerCase(), claseValorDiagnostico(v))
    }
  }
  if (hallados.length === 0) return null
  return { parametro: hallados[0].parametro, patron: hallados[0].patron, parametros: hallados }
}

/**
 * 0.3.22: el trozo del mensaje del guard con lo que casó en el cuerpo. Solo NOMBRES (y, 0.3.23, la clase del valor).
 * 0.3.23 (real 30/10/2026: la lista salía cortada): uno: `parámetro «X» [valor: vacío] casa con «p»`; varios: `parámetros (N): «X» [valor: …]
 * casa con «p», …` ENTEROS. Solo con más de `max` car. (por defecto {@link MAX_DETALLE_CUERPO_MENSAJE}, cuerpo patológico) se dice
 * `(+M más)`; nunca a mitad de un nombre. Un hallazgo sin `valor` (llamadas antiguas) sale sin la clase. PURA.
 */
export function textoDetalleCuerpo(d: { parametro: string; patron: string; parametros?: readonly HalladoCuerpo[] }, max: number = MAX_DETALLE_CUERPO_MENSAJE): string {
  const lista: readonly HalladoCuerpo[] = d.parametros && d.parametros.length > 0 ? d.parametros : [{ parametro: d.parametro, patron: d.patron }]
  const uno = (h: HalladoCuerpo) => `«${h.parametro}»${h.valor ? ` [valor: ${h.valor}]` : ''} casa con «${h.patron}»`
  if (lista.length === 1) return `parámetro ${uno(lista[0])}`
  const cab = `parámetros (${lista.length}): `
  let cuerpo = ''
  let n = 0
  for (const h of lista) {
    const trozo = `${n ? ', ' : ''}${uno(h)}`
    const resto = lista.length - n - 1
    if (n > 0 && (cab + cuerpo + trozo + (resto ? ` (+${resto} más)` : '')).length > max) break
    cuerpo += trozo
    n++
  }
  return `${cab}${cuerpo}${n < lista.length ? ` (+${lista.length - n} más)` : ''}`
}

/**
 * 0.3.44 (Pelayo real 04/11/2026: «Nueva contratación» navegó a `https://apps.pelayo.com/contratacion-autos?<query base64>`, SIN «/» final
 * y CON query, y la ruta no casaba con el prefijo `/contratacion-autos/` → bloqueada por «contratacion»). Regla con `rutasExactas`: se
 * compara SOLO la RUTA (sin query ni fragmento), con o sin «/» final: la ruta es la BASE del prefijo (sin su «/» final) o base + «/» +
 * resto, y el resto (sin «/» finales, en minúsculas) tiene que ser EXACTAMENTE uno de la lista. Devuelve el resto o `null`. PURA.
 */
function restoExactoDeRuta(r: RutaTolerable & { rutasExactas: readonly string[] }, rutaSinQuery: string): string | null {
  const base = r.prefijo.toLowerCase().replace(/\/+$/, '')
  const ruta = rutaSinQuery.toLowerCase()
  let resto: string
  if (ruta === base) resto = ''
  else if (ruta.startsWith(`${base}/`)) resto = ruta.slice(base.length + 1).replace(/\/+$/, '')
  else return null
  return r.rutasExactas.some((x) => x.toLowerCase() === resto) ? resto : null
}

/**
 * `origenPagina`: origen de la ventana/marco donde está la ruta. Una ruta RELATIVA (`/…`) solo se tolera si es EXACTAMENTE el de la
 * regla; sin él, nunca (fail-closed). Una URL absoluta lleva su propio origen.
 */
export function neutralizarRutaTolerable(texto: string | null | undefined, reglas: readonly RutaTolerable[], origenPagina?: string | null): string | null | undefined {
  if (typeof texto !== 'string' || texto === '' || reglas.length === 0) return texto
  const t = texto.trim()
  for (const r of reglas) {
    let origen = ''
    let resto: string | null = null
    if (/^https?:\/\//i.test(t)) {
      let u: URL
      try {
        u = new URL(t)
      } catch {
        continue
      }
      if (u.username || u.password) continue
      origen = u.origin
      if (origen !== r.origen) continue
      const ruta = plano(decodificarUrlTolerante(u.pathname))
      if (r.rutasExactas !== undefined) {
        // 0.3.44: lista EXACTA de restos = solo cuenta la RUTA; la query y el fragmento no viajan a la URL neutralizada (los NOMBRES de
        // parámetro de acción de la query los sigue mirando `parametrosParecenEmision` en la red). Otro resto = no se neutraliza.
        const exacto = restoExactoDeRuta({ ...r, rutasExactas: r.rutasExactas }, ruta)
        if (exacto === null) continue
        resto = exacto
      } else {
        if (!ruta.toLowerCase().startsWith(r.prefijo.toLowerCase())) continue
        resto = ruta.slice(r.prefijo.length) + plano(decodificarUrlTolerante(u.search + u.hash))
      }
    } else if (t.startsWith('/') && !t.startsWith('//')) {
      // Ruta sola (el `hrefRuta` del inventario, que solo lleva la ruta si el enlace es del MISMO origen que la ventana): solo si la
      // ventana es EXACTAMENTE del origen de la regla.
      if (origenPagina !== r.origen) continue
      const ruta = plano(decodificarUrlTolerante(t))
      if (r.rutasExactas !== undefined) {
        // La ruta sola del inventario puede traer query/fragmento: la lista exacta se mira sobre la RUTA (0.3.44: con o sin «/» final).
        const exacto = restoExactoDeRuta({ ...r, rutasExactas: r.rutasExactas }, ruta.split(/[?#]/)[0] ?? '')
        if (exacto === null) continue
        resto = exacto
      } else {
        if (!ruta.toLowerCase().startsWith(r.prefijo.toLowerCase())) continue
        resto = ruta.slice(r.prefijo.length)
      }
    } else {
      continue
    }
    if (resto === null || RE_ACCION_REAL_TRAS_PREFIJO.test(resto)) return texto
    return `${origen}${PREFIJO_NEUTRO}${resto}`
  }
  return texto
}

/**
 * Textos de BOTÓN prohibidos solo como texto ENTERO (Alberto, 14/10/2026): «Pago», «Ir al pago», «Confirmar pago»,
 * «Firma», «Firmar», «Domiciliación (bancaria)». Anclado y FUERA de `PATRON_EMISION` (que también mira URLs y cuerpos):
 * «Forma de pago», «Fraccionamiento de pago» o «Confirmar» siguen pasando. Se ignoran signos/flechas en los extremos.
 */
const RE_TEXTO_BOTON_PROHIBIDO = /^(?:pago|ir al pago|confirmar (?:el )?pago|firma|firmar|domiciliacion(?: bancaria)?)$/
export function esTextoBotonProhibido(texto: string | null | undefined): boolean {
  if (typeof texto !== 'string' || texto === '') return false
  const t = plano(texto).toLowerCase().replace(/\s+/g, ' ').replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '')
  return RE_TEXTO_BOTON_PROHIBIDO.test(t)
}


/** Tipo de documento de identidad por su FORMA (0.3.8): NIF/DNI (8 cifras + letra), NIE (X/Y/Z + 7 cifras + letra), CIF. PURA. */
export type TipoDocumento = 'NIF' | 'NIE' | 'CIF'
export function tipoDocumentoDe(documento: string | null | undefined): TipoDocumento | null {
  if (typeof documento !== 'string') return null
  const d = documento.toUpperCase().replace(/[\s.\-/]/g, '')
  if (/^\d{8}[A-Z]$/.test(d)) return 'NIF'
  if (/^[XYZ]\d{7}[A-Z]$/.test(d)) return 'NIE'
  if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(d)) return 'CIF'
  return null
}

/**
 * La opción de un desplegable de «Tipo de documento» que corresponde a `tipo`, por su TEXTO (sin tildes, mayúsculas ni signos): NIF →
 * «NIF», «DNI», «DNI/NIF», «NIF/DNI», «N.I.F.», «DNI/NIF/NIE/CIF» (0.3.12, también para NIE y CIF); NIE → empieza por «NIE»; CIF → empieza por «CIF». EXACTAMENTE una; si no, `null`. PURA.
 */
export function opcionTipoDocumento(tipo: TipoDocumento, opciones: readonly { valor: string | null; texto: string | null }[]): string | null {
  const norm = (t: string | null) => plano(t ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  const casa = (t: string) => (tipo === 'NIF' ? ['NIF', 'DNI', 'DNINIF', 'NIFDNI', 'DNINIFNIECIF'].includes(t) : t === 'DNINIFNIECIF' || t.startsWith(tipo))
  const hits = opciones.filter((o) => typeof o.valor === 'string' && o.valor !== '' && casa(norm(o.texto)))
  return hits.length === 1 ? hits[0]!.valor : null
}
