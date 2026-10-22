// LISTA ÚNICA de ACCIONES DE PORTAL del explorador (14/10/2026). Decisión de Alberto (13-14/10/2026): «El bot tiene que
// hacer absolutamente todo. Menos la emisión, que la hace previa autorización mía. Lógicamente el presupuesto hay que
// guardarlo […] lo guardas con la referencia y ahí te descarga el presupuesto».
//
// Tres categorías, en UNA lista que consumen el PROMPT (asegura: `lineaAccionesPortalParaIA`), el VALIDADOR del explorador
// (`bloqueoAvance` / `bloqueoGuardadoPresupuesto` en explorador.ts) y el GUARD del worker (`pulsarGuardadoPresupuesto`
// en services/tarificador-rpa/src/guard.ts, que vuelve a clasificar el control VIVO):
//   · `emision`: PROHIBIDA siempre en exploración (la emisión solo va por la puerta autorizada con el token de Alberto).
//   · `prohibida`: no es emisión, pero el robot tampoco la pulsa (no se sabe qué hace, o saca de la sesión).
//     (Ya no hay ninguna de serie: «Proyecto ampliado» pasó a `guardar_presupuesto` el 14/10/2026, por Alberto.)
//   · `guardar_presupuesto`: PERMITIDA solo como `avanzar` con `efectoEsperado: 'guardar_presupuesto'`, en una pantalla de
//     RESULTADO (con importes a la vista, o tras haber guardado ya en esta exploración). Fuera de ahí, prohibida.
// Si una descripción casa con emisión Y con guardar (p. ej. «Guardar y emitir»), MANDA emisión (fail-closed).
//
// El patrón de emisión del guard de red/clic (`PATRON_EMISION` + `TEXTOS_BLOQUEADOS_ALTA` de guard-emision.ts) NO se
// relaja: sigue aplicándose ADEMÁS de esta lista. Lo único que esta lista abre es que las entradas de Archivar del guard
// (`PATRONES_GUARDADO_GUARD`) pasen con `permitirGuardarPresupuesto`, y eso SOLO lo pide `pulsarGuardadoPresupuesto`.

export type CategoriaAccionPortal = 'emision' | 'prohibida' | 'guardar_presupuesto'

export type AccionPortal = { readonly categoria: CategoriaAccionPortal; readonly nombre: string; readonly patron: RegExp }

const A = (categoria: CategoriaAccionPortal, nombre: string, patron: RegExp): AccionPortal => Object.freeze({ categoria, nombre, patron })

/**
 * La lista. Patrones sobre texto PLANO (sin tildes, minúsculas, espacios colapsados). Para añadir una acción: aquí, con su
 * categoría; el prompt, el validador y el guard la recogen solos.
 */
export const ACCIONES_PORTAL: readonly AccionPortal[] = Object.freeze([
  // ── EMISIÓN (sin cambios de severidad: siempre prohibida en exploración) ──
  A('emision', 'Emitir', /emit|emisi/),
  A('emision', 'Contratar', /contrat|contract/),
  A('emision', 'Formalizar', /formaliz/),
  A('emision', 'Firmar', /firm[ae]|signature/),
  A('emision', 'Pagar / Pago', /pagar|\bpagos?\b|cobrar|\bpay\b/),
  A('emision', 'Pago fraccionado', /pago[\s_+-]*fraccionado|btn[\s_+-]*fracciona/),
  A('emision', 'Tramitar póliza', /tramit/),
  A('emision', 'Confirmar contratación', /confirmar|\bconfirm\b/),
  A('emision', 'Domiciliar', /domicili|\bsepa\b|mandato/),
  A('emision', 'Suplemento', /suplement/),
  A('emision', 'Anular / Baja', /anul|\bbaja\b/),
  A('emision', 'Validar y aceptar (ePAC)', /validar[\s_+-]*aceptar|btn[\s_+-]*accept|idbtn[\s_+-]*aceptar/),
  // ── PROHIBIDA (no emite, pero no se pulsa) ──
  A('prohibida', 'Enviar', /enviar|\bsubmit[\s_-]*(order|policy)/),
  A('prohibida', 'Salir / Cerrar sesión', /\bsalir\b|cerrar[\s_+-]*sesion|desconect|logout|log[\s_-]*off/),
  // ── GUARDAR PRESUPUESTO (permitido solo en resultado y con `efectoEsperado: 'guardar_presupuesto'`) ──
  A('guardar_presupuesto', 'Grabar', /grab(ar|acion)/),
  A('guardar_presupuesto', 'Guardar (presupuesto / proyecto)', /guardar|\bsave\b/),
  A('guardar_presupuesto', 'Archivar', /archivar|^\s*store\s*$|send[\s_+-]*action[\s_+-]*event\s*\(\s*['"]?\s*store/),
  // Alberto (14/10/2026): «Proyecto ampliado» es el proyecto que hay que descargarse. Mismas condiciones que Guardar/Descargar.
  A('guardar_presupuesto', 'Proyecto ampliado', /proyecto[\s_+-]*ampliado/),
  A('guardar_presupuesto', 'Descargar', /descarg|download/),
  A('guardar_presupuesto', 'Imprimir', /imprim|\bprint\b/),
  A('guardar_presupuesto', 'Generar PDF', /generar[\s_+-]*pdf|\bpdf\b/),
  // «Generar Proyecto» (Mapfre NSEI) NO está aquí a propósito (revisión del 22/10/2026): no es un permiso general de guardado.
  // Sigue en `TEXTOS_BLOQUEADOS_ALTA` y solo lo abre la opción estrecha `permitirGenerarProyectoMapfre` (guard-emision.ts),
  // que pide ÚNICAMENTE `generarProyectoMapfre` del worker. El explorador IA lo sigue viendo como `boton_de_emision`.
])

/**
 * Entradas de `TEXTOS_BLOQUEADOS_ALTA` (guard-emision.ts) que son GUARDAR del ePAC: ARCHIVAR (td#store,
 * `sendActionEvent('store')`) y «PROYECTO AMPLIADO» (texto y pestaña td#menu4; una combinación con «emitir» la sigue
 * bloqueando `PATRON_EMISION`, y td#menu3/menu5 siguen bloqueadas).
 * Siguen bloqueadas en todo `pulsar()` y en la red; solo `permitirGuardarPresupuesto` las deja pasar (y solo lo pide la
 * puerta del guardado de presupuesto del worker). `contract` / `validar_aceptar` / emitir siguen bloqueados también ahí.
 */
export const PATRONES_GUARDADO_GUARD: readonly RegExp[] = Object.freeze([
  /archivar/i,
  /^\s*store\s*$/i,
  /send[\s_+-]*action[\s_+-]*event\s*\(\s*['"]?\s*store/i,
  /proyecto[\s_+-]*ampliado/i,
  /^\s*menu4\s*$/i,
])

const plano = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * EXCEPCIÓN ESTRECHA de Allianz ePAC (Alberto, 14/10/2026): el `td#EMISION_PROJ` «Proyecto Ampliado» lleva «emisi» en el id y
 * `PATRON_EMISION` lo bloquearía. Único sitio de la excepción. Se aplica SOLO si a la vez: id IGUAL (===, nunca patrón ni
 * prefijo) a `id` y texto visible, normalizado, IGUAL a `texto` (ninguna otra palabra). Entonces, y solo entonces, esa
 * descripción-id se quita de lo que se mira; texto, aria, onclick, name, href… se siguen mirando enteros. Quien la usa
 * (`bloqueoGuardadoPresupuesto` y `pulsarGuardadoPresupuesto`) además exige resultado + importes + efecto guardar + tope.
 */
export const EXCEPCION_PROYECTO_AMPLIADO = Object.freeze({ id: 'EMISION_PROJ', texto: 'proyecto ampliado' })

/** Quita de `descripciones` el id de la excepción (una vez) si el control la cumple; si no, las devuelve tal cual. Pura. */
export function descripcionesSinExcepcionProyecto<T extends string | null | undefined>(descripciones: readonly T[], id: string | null | undefined, texto: string | null | undefined): T[] {
  const cumple = id === EXCEPCION_PROYECTO_AMPLIADO.id && typeof texto === 'string' && plano(texto) === EXCEPCION_PROYECTO_AMPLIADO.texto
  if (!cumple) return [...descripciones]
  const i = descripciones.findIndex((d) => d === EXCEPCION_PROYECTO_AMPLIADO.id)
  return i < 0 ? [...descripciones] : descripciones.filter((_, j) => j !== i)
}

export type ClasificacionAccion = { emision: string | null; prohibida: string | null; guardar: string | null }

/**
 * Clasifica TODO lo que describe a un control (texto, aria, id, name, onclick…). Devuelve el nombre de la PRIMERA acción
 * de cada categoría que casa (o `null`). Quien decide aplica: emisión > prohibida > guardar.
 */
export function clasificarAccionPortal(descripciones: readonly (string | null | undefined)[]): ClasificacionAccion {
  const out: ClasificacionAccion = { emision: null, prohibida: null, guardar: null }
  for (const d of descripciones) {
    if (typeof d !== 'string' || d === '') continue
    const t = plano(d)
    for (const a of ACCIONES_PORTAL) {
      if (!a.patron.test(t)) continue
      if (a.categoria === 'emision') out.emision ??= a.nombre
      else if (a.categoria === 'prohibida') out.prohibida ??= a.nombre
      else out.guardar ??= a.nombre
    }
  }
  return out
}

/** Nombres de una categoría, para el prompt y la documentación. */
export function nombresAccionesPortal(categoria: CategoriaAccionPortal): string[] {
  return ACCIONES_PORTAL.filter((a) => a.categoria === categoria).map((a) => a.nombre)
}

/** Las líneas del prompt del explorador, generadas de {@link ACCIONES_PORTAL} (lo vigila el test de asegura). */
export function lineaAccionesPortalParaIA(): { emision: string; prohibidas: string; guardar: string } {
  return {
    emision: nombresAccionesPortal('emision').join(', '),
    prohibidas: nombresAccionesPortal('prohibida').join(', '),
    guardar: nombresAccionesPortal('guardar_presupuesto').join(', '),
  }
}

// ─── Frontera de emisión POR CAMPOS (14/10/2026) — FUENTE ÚNICA ──────────────
// Sin número de cuenta no se emite (Alberto, 14/10/2026, TODAS las compañías): la compañía pide la cuenta bancaria (y
// normalmente la fecha de efecto) solo para EMITIR. Un campo bancario en pantalla = frontera: el explorador para con
// `cerca_de_emision` / `frontera_cuenta_bancaria` (`detectarParada`, explorador.ts, que usan el paso de asegura y el worker
// ANTES de llamar a la IA) y el worker NUNCA lo rellena ni pulsa con él visible (`senalCuentaBancaria` en guard.ts y en la
// segunda barrera del bucle). La fecha de efecto SOLA no para (también sale al tarificar); se menciona si va con un campo bancario.
// Unifica (fusión con #4617, Mapfre): la lista de esta rama + la cobertura de la frontera de Mapfre (CCC, «cuenta cliente»,
// «Cuenta» a secas, «no. de cuenta», entidad/oficina/DC, dígito de control, camelCase y `_` separados). Cada descripción se
// mira en DOS formas (plana y con camelCase/`_` separados): casa si casa cualquiera.
// Falsos positivos excluidos (pararían el tarificar de Hogar/Auto): «Ibáñez», «Asistencia domiciliaria», «Tenga en cuenta»,
// «no cuenta con alarma», «Suzuki Swift» (SWIFT solo como etiqueta EXACTA: las descripciones nunca son valores), «entidad financiera», «Oficina de la entidad mediadora», «accc».
// Ver los negativos en acciones-portal.test.ts y explorador.test.ts.

export type CampoBancario = { readonly nombre: string; readonly patron: RegExp }

export const CAMPOS_BANCARIOS: readonly CampoBancario[] = Object.freeze([
  Object.freeze({ nombre: 'IBAN', patron: /iban(?!ez)/ }),
  Object.freeze({ nombre: 'Cuenta bancaria', patron: /cuenta[\s_.-]*(?:bancaria|corriente|cliente)|\bccc\b|^cuenta$/ }),
  Object.freeze({ nombre: 'Número de cuenta', patron: /(?:num(?:ero)?|nro|\bn\.?[º°])[\s_.º-]*(?:de[\s_.-]*)?cuenta|\bn\.?\s*(?:[º°]|o\.)\s*(?:de\s*)?cuenta\b/ }),
  Object.freeze({ nombre: 'Domiciliación', patron: /domiciliacion|domiciliar(?!i)/ }),
  Object.freeze({ nombre: 'Titular de la cuenta', patron: /titular[\s_.-]*(?:de[\s_.-]*)?(?:la[\s_.-]*)?cuenta/ }),
  Object.freeze({ nombre: 'Entidad bancaria', patron: /entidad[\s_.-]*bancaria/ }),
  Object.freeze({ nombre: 'Entidad / oficina / DC', patron: /entidad[^a-z]{0,20}oficina|oficina[^a-z]{0,20}entidad|digito[\s_-]*de[\s_-]*control/ }),
  Object.freeze({ nombre: 'SWIFT / BIC', patron: /swift[\s_.-]*(?:bic|code|codigo)|(?:code|codigo)[\s_.-]*swift|(?:^|[^a-z])bic(?![a-z])|^swift$/ }),
  Object.freeze({ nombre: 'Datos bancarios', patron: /datos[\s_.-]*bancari/ }),
])

/** Todas las alternativas de {@link CAMPOS_BANCARIOS} en un regex (DERIVADO, no se edita a mano). Sobre texto plano. */
export const RE_CAMPO_CUENTA_BANCARIA = new RegExp(CAMPOS_BANCARIOS.map((c) => `(?:${c.patron.source})`).join('|'))

/** Motivo legible de la frontera (va al log, a la señal de `detectarParada` y al error del flujo determinista). */
export const MOTIVO_FRONTERA_CUENTA = 'frontera de emisión: el portal pide cuenta bancaria'

export const PATRON_FECHA_EFECTO = /fecha[\s_.-]*(?:de[\s_.-]*)?efecto|efecto[\s_.-]*(?:de[\s_.-]*)?(?:la[\s_.-]*)?(?:poliza|fecha)/

export type FronteraCampos = { frontera: boolean; campoBancario: string | null; etiqueta: string | null; fechaEfecto: boolean }

/** Las dos formas en que se mira una descripción: plana, y con camelCase y `_` separados (`numCCC` → `num ccc`). */
const formasCampo = (d: string): string[] => [plano(d), plano(d.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' '))]

/** El {@link CampoBancario} con el que casa UNA descripción, o `null`. */
function campoBancarioDe(d: string): CampoBancario | null {
  const formas = formasCampo(d)
  return CAMPOS_BANCARIOS.find((c) => formas.some((t) => c.patron.test(t))) ?? null
}

/**
 * Descripciones (etiqueta, name, id, placeholder, aria…) de los CAMPOS de una pantalla → ¿hay frontera de emisión?
 * `frontera` ⇔ hay un campo bancario; `campoBancario` = su nombre canónico y `etiqueta` = la descripción que casó (tal
 * cual, recortada a 80; nunca el valor). La fecha de efecto se informa pero por sí sola NO es frontera. Pura.
 */
export function fronteraEmisionPorCampos(camposDesc: readonly (string | null | undefined)[]): FronteraCampos {
  const out: FronteraCampos = { frontera: false, campoBancario: null, etiqueta: null, fechaEfecto: false }
  for (const d of camposDesc) {
    if (typeof d !== 'string' || d === '') continue
    if (out.campoBancario === null) {
      const c = campoBancarioDe(d)
      if (c !== null) {
        out.campoBancario = c.nombre
        out.etiqueta = d.replace(/\s+/g, ' ').trim().slice(0, 80)
      }
    }
    if (!out.fechaEfecto && formasCampo(d).some((t) => PATRON_FECHA_EFECTO.test(t))) out.fechaEfecto = true
  }
  out.frontera = out.campoBancario !== null
  return out
}

/** La primera descripción de un control que es campo bancario (tal cual, recortada), o `null`. Pura. La usa el worker. */
export function senalCuentaBancaria(descripciones: readonly (string | null | undefined)[]): string | null {
  return fronteraEmisionPorCampos(descripciones).etiqueta
}

// ─── Referencia del presupuesto ──────────────────────────────────────────────

/** Forma de una referencia de presupuesto: 4-30 caracteres alfanuméricos (con `/ . -`), empieza por letra o cifra. */
export const RE_REFERENCIA_PRESUPUESTO = /^[A-Za-z0-9][A-Za-z0-9/.-]{3,29}$/

/** Forma de FECHA: nunca es una referencia de presupuesto ni un nº de proyecto. */
const RE_FECHA_REFERENCIA = /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/

/**
 * ¿Se puede guardar/enseñar esta referencia? Forma de {@link RE_REFERENCIA_PRESUPUESTO}, al menos una cifra, y NADA con forma
 * de identificador de persona o de cobro: NIF/NIE/CIF, móvil/fijo español de 9 cifras, IBAN, tarjeta. (No se usa
 * `pareceDatoPersonalInventario`: marca CUALQUIER tira larga de cifras y casi toda referencia de compañía es numérica.)
 */
export function referenciaPresupuestoValida(c: unknown): c is string {
  if (typeof c !== 'string' || !RE_REFERENCIA_PRESUPUESTO.test(c) || !/\d/.test(c)) return false
  const x = c.replace(/[/.-]/g, '').toUpperCase()
  if (/^\d{8}[A-Z]$/.test(x) || /^[XYZ]\d{7}[A-Z]$/.test(x) || /^[A-HJNP-SUVW]\d{7}[0-9A-J]$/.test(x)) return false
  if (/^(?:34)?[6789]\d{8}$/.test(x)) return false
  if (/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(x)) return false
  if (/^\d{13,19}$/.test(x)) return false
  // Una FECHA («22/10/2026», «1.2.26») no es una referencia ni un nº de proyecto (revisión del 22/10/2026).
  if (RE_FECHA_REFERENCIA.test(c)) return false
  return true
}

/**
 * Texto visible tras guardar → la REFERENCIA del presupuesto que da el portal, o `null` (no se vio: «no se sabe», nunca
 * «no hay»). Solo con una etiqueta explícita delante (referencia / nº de presupuesto / proyecto / propuesta / oferta /
 * cotización) y que pase {@link referenciaPresupuestoValida}. Pura.
 */
export function extraerReferenciaPresupuesto(texto: string | null | undefined): string | null {
  if (typeof texto !== 'string' || texto === '') return null
  const t = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').slice(0, 20_000)
  const objeto = '(?:presupuesto|proyecto|propuesta|cotizacion|oferta|simulacion)'
  const re = new RegExp(
    `(?:\\breferencia(?:\\s+del?\\s+${objeto})?|\\b(?:n[ºo°]|num(?:ero)?)\\.?\\s*(?:de(?:l)?\\s+)?${objeto}|\\b${objeto}\\s+(?:n[ºo°]|num(?:ero)?)\\.?|\\bref\\.)\\s*[:#.]?\\s*([A-Za-z0-9][A-Za-z0-9/.-]{3,29})`,
    'gi',
  )
  for (const m of t.matchAll(re)) {
    const c = m[1].replace(/[.-]+$/, '')
    if (referenciaPresupuestoValida(c)) return c
  }
  return null
}

// ─── Aviso del guardado en el portal (22/10/2026) ───────────────────────────
/**
 * Prefijos FIJOS del aviso que deja cada bot sobre el guardado del presupuesto/proyecto en el portal (guardado con su nº, o por
 * qué NO se guardó). Son textos del bot (motivo = etiquetas del portal, nunca valores del cliente): asegura los deja cruzar a
 * plataforma con {@link avisoGuardadoPortalDeAvisos}.
 */
export const RE_AVISO_GUARDADO_PORTAL = /^(?:(?:Presupuesto|Proyecto) (?:NO )?guardado en |Se pulsó «(?:Guardar presupuesto|Generar Proyecto)»)/
export const MAX_AVISO_GUARDADO_PORTAL = 300

/** Identificador que el bot de Allianz pone al presupuesto («GA-AAAAMMDD-<≤8 del trabajo>», sin datos personales). */
export const RE_IDENTIFICADOR_BOT_PRESUPUESTO = /^GA-\d{8}-[0-9A-Z]{1,8}$/

/**
 * ¿Se puede enseñar esta `referenciaPortal` de un bot? El identificador del bot (que {@link referenciaPresupuestoValida} tomaría
 * por un IBAN: «GA» + 2 cifras + resto) o una referencia del portal válida. PURA.
 */
export function referenciaPortalValida(c: unknown): c is string {
  return (typeof c === 'string' && RE_IDENTIFICADOR_BOT_PRESUPUESTO.test(c)) || referenciaPresupuestoValida(c)
}

/** El aviso de guardado en el portal de una oferta (`avisos[]` del worker), o `null`. Lectura defensiva. PURA. */
export function avisoGuardadoPortalDeAvisos(avisos: unknown): string | null {
  if (!Array.isArray(avisos)) return null
  const a = avisos.find((x): x is string => typeof x === 'string' && RE_AVISO_GUARDADO_PORTAL.test(x))
  return a ? a.replace(/\s+/g, ' ').trim().slice(0, MAX_AVISO_GUARDADO_PORTAL) : null
}
