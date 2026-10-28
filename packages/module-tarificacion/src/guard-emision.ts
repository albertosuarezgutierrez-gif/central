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
export class EmisionBloqueadaError extends Error {
  readonly tipo = 'emision' as const
  readonly donde: 'url' | 'boton' | 'fase'
  readonly texto: string
  constructor(donde: 'url' | 'boton' | 'fase', texto: string) {
    super(
      donde === 'fase'
        ? `guard_emision: fase bloqueada: ${texto.slice(0, 500)}`
        : `guard_emision: ${donde} bloqueada (casa con el patrón de emisión): «${texto.slice(0, 200)}»`,
    )
    this.name = 'EmisionBloqueadaError'
    this.donde = donde
    this.texto = texto
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

/** Lanza si la URL casa con el patrón. */
export function comprobarUrl(url: string, opciones: OpcionesGuard = {}): void {
  if (pareceEmision(url, opciones)) throw new EmisionBloqueadaError('url', url)
}

/**
 * Lanza si el botón a pulsar casa con el patrón. Se mira TODO lo que lo describe (texto visible,
 * `aria-label`, `title`, `value`, `id`, `name`, `href`): un botón con icono y `id="btnEmitir"`
 * también es emitir.
 */
export function comprobarBoton(descripciones: readonly (string | null | undefined)[], opciones: OpcionesGuard = {}): void {
  for (const d of descripciones) {
    if (pareceEmision(d, opciones) || esTextoBotonProhibido(d)) throw new EmisionBloqueadaError('boton', String(d))
  }
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
export type RutaTolerable = { origen: string; prefijo: string }
const RE_ACCION_REAL_TRAS_PREFIJO = /emit|contrat|confirm|firm|pago|pagar|formaliz|grab|suplement|anul|baja|domicili|tarjeta|iban/i
/** Sustituto del prefijo neutralizado (no casa con ningún patrón del guard). */
const PREFIJO_NEUTRO = '/__ruta_app__/'
/**
 * Cuerpo (form-urlencoded) de una petición a una ruta TOLERADA: ¿nombra una acción de emisión real? Mira el NOMBRE de cada parámetro
 * (`formEmision:btnEmitir=…`) y el VALOR de `javax.faces.source` / `javax.faces.partial.execute` / `javax.faces.partial.render` (el
 * botón JSF que se pulsó) contra la misma lista que el resto de la ruta (`RE_ACCION_REAL_TRAS_PREFIJO`), no contra el patrón genérico
 * (los formularios NSE se llaman `formEmision…`). PURA.
 */
export function cuerpoToleradoConAccionReal(cuerpo: string | null | undefined): boolean {
  if (typeof cuerpo !== 'string' || cuerpo === '') return false
  const dec = (x: string) => plano(decodificarUrlTolerante(x.replace(/\+/g, ' ')))
  for (const par of cuerpo.split('&')) {
    const i = par.indexOf('=')
    const k = dec(i < 0 ? par : par.slice(0, i))
    const v = i < 0 ? '' : dec(par.slice(i + 1))
    if (RE_ACCION_REAL_TRAS_PREFIJO.test(k)) return true
    if (/^javax\.faces\.(?:source|partial\.execute|partial\.render)$/i.test(k.trim()) && RE_ACCION_REAL_TRAS_PREFIJO.test(v)) return true
  }
  return false
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
      if (!ruta.toLowerCase().startsWith(r.prefijo.toLowerCase())) continue
      resto = ruta.slice(r.prefijo.length) + plano(decodificarUrlTolerante(u.search + u.hash))
    } else if (t.startsWith('/') && !t.startsWith('//')) {
      // Ruta sola (el `hrefRuta` del inventario, que solo lleva la ruta si el enlace es del MISMO origen que la ventana): solo si la
      // ventana es EXACTAMENTE del origen de la regla.
      if (origenPagina !== r.origen) continue
      const ruta = plano(decodificarUrlTolerante(t))
      if (!ruta.toLowerCase().startsWith(r.prefijo.toLowerCase())) continue
      resto = ruta.slice(r.prefijo.length)
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
