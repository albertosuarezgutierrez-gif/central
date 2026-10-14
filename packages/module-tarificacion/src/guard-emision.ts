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
const VERBOS_PROHIBIDOS = '(?:(?<!con)firmar|firma[\\s_+-]*digital|pagar|pago[\\s_+-]*con[\\s_+-]*tarjeta|realizar[\\s_+-]*(?:el[\\s_+-]*)?pago|domiciliar)(?![a-z])'
export const PATRON_EMISION = new RegExp(`emit|emisi|contrat|formaliz|suplement|anul|baja|${VERBOS_PROHIBIDOS}`, 'i')

// Textos de Allianz ePAC (capturas del 05/10/2026) que el bot NUNCA debe pulsar, sea cual sea la fase:
// el radio «ELIJA UNA OPCIÓN» (por texto; la elección legítima va por la máquina de fases), «RECUPERACIÓN
// DE CONTRASEÑA» (toca las credenciales), y las pestañas «Archivar» y «Proyecto Ampliado» (guardar: solo con
// `permitirGuardarPresupuesto`; más «Emitir», que ya casa con PATRON_EMISION). Se comparan sin tildes y tolerando separadores.
// «NUEVA ALTA» NO está aquí a propósito (Alberto, 05/10/2026): es la NAVEGACIÓN para cotizar.
// «Archivar» (texto, td#store, `sendActionEvent('store')`) viene de `PATRONES_GUARDADO_GUARD` (acciones-portal.ts, lista
// única del 14/10/2026): sigue BLOQUEADO aquí; solo `permitirGuardarPresupuesto` lo deja pasar (ver `pareceEmision`).
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
}

// Sin «parameter properties» (`constructor(readonly x)`): `node --test` solo QUITA tipos y no las admite.
export class EmisionBloqueadaError extends Error {
  readonly tipo = 'emision' as const
  readonly donde: 'url' | 'boton' | 'fase'
  readonly texto: string
  constructor(donde: 'url' | 'boton' | 'fase', texto: string) {
    super(
      donde === 'fase'
        ? `guard_emision: fase bloqueada: ${texto.slice(0, 200)}`
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
  const bloqueos = opciones.permitirGuardarPresupuesto ? TEXTOS_BLOQUEADOS_ALTA.filter((r) => !PATRONES_GUARDADO_GUARD.includes(r)) : TEXTOS_BLOQUEADOS_ALTA
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
