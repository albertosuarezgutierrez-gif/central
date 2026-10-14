// LISTA ÚNICA de ACCIONES DE PORTAL del explorador (14/10/2026). Decisión de Alberto (13-14/10/2026): «El bot tiene que
// hacer absolutamente todo. Menos la emisión, que la hace previa autorización mía. Lógicamente el presupuesto hay que
// guardarlo […] lo guardas con la referencia y ahí te descarga el presupuesto».
//
// Tres categorías, en UNA lista que consumen el PROMPT (asegura: `lineaAccionesPortalParaIA`), el VALIDADOR del explorador
// (`bloqueoAvance` / `bloqueoGuardadoPresupuesto` en explorador.ts) y el GUARD del worker (`pulsarGuardadoPresupuesto`
// en services/tarificador-rpa/src/guard.ts, que vuelve a clasificar el control VIVO):
//   · `emision`: PROHIBIDA siempre en exploración (la emisión solo va por la puerta autorizada con el token de Alberto).
//   · `prohibida`: no es emisión, pero el robot tampoco la pulsa (no se sabe qué hace, o saca de la sesión).
//     «Proyecto ampliado» está AQUÍ: no hay certeza de que solo enseñe/descargue (ePAC lo pone junto a Archivar/Emitir).
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
  A('prohibida', 'Proyecto ampliado', /proyecto[\s_+-]*ampliado/),
  A('prohibida', 'Enviar', /enviar|\bsubmit[\s_-]*(order|policy)/),
  A('prohibida', 'Salir / Cerrar sesión', /\bsalir\b|cerrar[\s_+-]*sesion|desconect|logout|log[\s_-]*off/),
  // ── GUARDAR PRESUPUESTO (permitido solo en resultado y con `efectoEsperado: 'guardar_presupuesto'`) ──
  A('guardar_presupuesto', 'Grabar', /grab(ar|acion)/),
  A('guardar_presupuesto', 'Guardar (presupuesto / proyecto)', /guardar|\bsave\b/),
  A('guardar_presupuesto', 'Archivar', /archivar|^\s*store\s*$|send[\s_+-]*action[\s_+-]*event\s*\(\s*['"]?\s*store/),
  A('guardar_presupuesto', 'Descargar', /descarg|download/),
  A('guardar_presupuesto', 'Imprimir', /imprim|\bprint\b/),
  A('guardar_presupuesto', 'Generar PDF', /generar[\s_+-]*pdf|\bpdf\b/),
])

/**
 * Entradas de `TEXTOS_BLOQUEADOS_ALTA` (guard-emision.ts) que son ARCHIVAR del ePAC (td#store, `sendActionEvent('store')`).
 * Siguen bloqueadas en todo `pulsar()` y en la red; solo `permitirGuardarPresupuesto` las deja pasar (y solo lo pide la
 * puerta del guardado de presupuesto del worker). `contract` / `validar_aceptar` / emitir siguen bloqueados también ahí.
 */
export const PATRONES_GUARDADO_GUARD: readonly RegExp[] = Object.freeze([
  /archivar/i,
  /^\s*store\s*$/i,
  /send[\s_+-]*action[\s_+-]*event\s*\(\s*['"]?\s*store/i,
])

const plano = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

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
