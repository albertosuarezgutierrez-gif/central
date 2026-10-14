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

// ─── Frontera de emisión POR CAMPOS (14/10/2026) ─────────────────────────────
// La compañía pide la cuenta bancaria (y normalmente la fecha de efecto) solo para EMITIR, tras la aceptación del cliente.
// Un campo bancario en pantalla = frontera: el explorador para con `cerca_de_emision` (`detectarParada`, explorador.ts, que
// usan el paso de asegura y el worker ANTES de llamar a la IA: la IA nunca recibe ni rellena ese campo). La fecha de efecto
// SOLA no para (también aparece al tarificar); cuenta solo junto a un campo bancario en la misma pantalla.
// Patrones sobre texto PLANO; sin `\b` en IBAN/SWIFT/BIC a propósito: ids tipo `txtIBAN` / `swift_bic` no tienen frontera.

export type CampoBancario = { readonly nombre: string; readonly patron: RegExp }

export const CAMPOS_BANCARIOS: readonly CampoBancario[] = Object.freeze([
  Object.freeze({ nombre: 'IBAN', patron: /iban/ }),
  Object.freeze({ nombre: 'Cuenta bancaria', patron: /cuenta[\s_.-]*(?:bancaria|corriente)|\bccc\b/ }),
  Object.freeze({ nombre: 'Número de cuenta', patron: /(?:numero|num|nro|n[ºo°]?)[\s_.-]*(?:de[\s_.-]*)?cuenta/ }),
  Object.freeze({ nombre: 'Domiciliación', patron: /domiciliacion|domiciliar/ }),
  Object.freeze({ nombre: 'Titular de la cuenta', patron: /titular[\s_.-]*(?:de[\s_.-]*)?(?:la[\s_.-]*)?cuenta/ }),
  Object.freeze({ nombre: 'Entidad bancaria', patron: /entidad[\s_.-]*(?:bancaria|financiera)/ }),
  Object.freeze({ nombre: 'SWIFT / BIC', patron: /swift|(?:^|[^a-z])bic(?![a-z])/ }),
])

export const PATRON_FECHA_EFECTO = /fecha[\s_.-]*(?:de[\s_.-]*)?efecto|efecto[\s_.-]*(?:de[\s_.-]*)?(?:la[\s_.-]*)?(?:poliza|fecha)/

export type FronteraCampos = { frontera: boolean; campoBancario: string | null; fechaEfecto: boolean }

/**
 * Descripciones (etiqueta, name, id, placeholder, aria…) de los CAMPOS de una pantalla → ¿hay frontera de emisión?
 * `frontera` ⇔ hay un campo bancario. La fecha de efecto se informa pero por sí sola NO es frontera. Pura.
 */
export function fronteraEmisionPorCampos(camposDesc: readonly (string | null | undefined)[]): FronteraCampos {
  const out: FronteraCampos = { frontera: false, campoBancario: null, fechaEfecto: false }
  for (const d of camposDesc) {
    if (typeof d !== 'string' || d === '') continue
    const t = plano(d)
    if (out.campoBancario === null) out.campoBancario = CAMPOS_BANCARIOS.find((c) => c.patron.test(t))?.nombre ?? null
    if (!out.fechaEfecto && PATRON_FECHA_EFECTO.test(t)) out.fechaEfecto = true
  }
  out.frontera = out.campoBancario !== null
  return out
}

// ─── Referencia del presupuesto ──────────────────────────────────────────────

/** Forma de una referencia de presupuesto: 4-30 caracteres alfanuméricos (con `/ . -`), empieza por letra o cifra. */
export const RE_REFERENCIA_PRESUPUESTO = /^[A-Za-z0-9][A-Za-z0-9/.-]{3,29}$/

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
