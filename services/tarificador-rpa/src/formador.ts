// FORMADOR con IA del worker (06/10/2026). Cuando el adaptador no encuentra un CAMPO o una ACCIÓN
// PERMITIDA, en vez de rendirse: 1º prueba lo aprendido (precargado de asegura), 2º pide a la IA que
// señale uno de los candidatos de la página, y SIEMPRE lo valida aquí de forma determinista antes de
// devolverlo. Lo que funciona se confirma a asegura y queda aprendido por compañía/ramo.
//
// Y el MODO ACOMPAÑADO: mientras la compañía/ramo no lleve N cotizaciones seguidas sin intervención
// de la IA, `acompanar()` le enseña cada paso (estructura + avisos redactados) y, si la IA o la regla
// determinista de precio ven algo BLOQUEANTE, el trabajo falla con una explicación legible para Alberto.
//
// 🚨 TARIFICAR ≠ EMITIR. Este fichero NO pulsa nada: devuelve un Locator que el adaptador pulsa con
//    `ctx.pulsar()` (guard.ts). Una acción solo se devuelve si su texto casa EXACTO con la TABLA CERRADA
//    `ACCIONES_PERMITIDAS` y `pareceEmision()` no la marca en ninguna de sus descripciones. Un campo solo
//    si es un control editable (nunca botón ni enlace). Si no valida → null y el adaptador falla como antes.
// 🔒 Lo que sale hacia asegura: estructura SIN valores de inputs ni contraseñas, avisos por el redactor.
//
// Enganche (ver README): el runner crea el contexto con `prepararFormador()` y lo pasa en
// `ctx.formador`; el adaptador llama a `resolverConFormador()` como FALLBACK en `campoPorEtiqueta` y en
// el botón Calcular, y a `acompanar()` en los puntos de `PUNTOS_ENGANCHE`; el runner cierra con
// `cerrarFormador()` antes de mandar el resultado.

import type { Frame, Locator, Page } from 'playwright'
import { MAX_CANDIDATOS_ATASCO, limpiarTextoAviso, pareceEmision, type AtascoWorker, type IncidenciaPrecio, type ModalidadPortal, type ValoresLeidos } from '@central/module-tarificacion'
import { ErrorTarificador } from './errores.ts'
import { rutaMarco } from './evidencia.ts'
import { ENLACES_ENTRADA_AUTORIZADOS } from './guard.ts'

// ─── REGLA (14/10/2026, Alberto): todo bot con IA detrás y aprendizaje ─────────
// Este fichero es la CAPA COMÚN de respaldo de TODOS los adaptadores de tarificación (docs/TARIFICADOR-RPA.md, «Regla: todo
// bot con IA detrás y aprendizaje»). Orden: selector FIJO del adaptador → lo APRENDIDO (`tarificador_conocimiento`, por
// compañía/ramo) → la IA (asegura, por la pasarela). Lo que funciona se CONFIRMA y queda aprendido. Lo aprendido y la IA
// pasan SIEMPRE por la misma validación determinista (tablas cerradas + `pareceEmision` + `BLOQUEO_FORMADOR`): nunca
// habilitan una acción fuera de ellas, y lo que se pulsa va por el guard de emisión (`ctx.pulsar` y familia).
// PLAN B: tope de consultas a la IA y de tiempo de IA por trabajo (`PRESUPUESTO_RESPALDO`); agotado o sin respuesta →
// `null` y el adaptador lanza su error ORIGINAL (el runner adjunta inventario + captura). Nunca se cuelga ni reintenta.
// Los adaptadores lo usan con `conRespaldoIA` (acciones) y `campoConRespaldo` (campos); lo vigila test/regla-respaldo-ia.test.ts.

// ─── Listas CERRADAS ─────────────────────────────────────────────────────────

/** Palabras que NUNCA pueden estar en un control que el formador devuelva (además de `pareceEmision`). */
export const BLOQUEO_FORMADOR = ['emitir', 'emision', 'contratar', 'contratacion', 'formalizar', 'formalizacion', 'suplemento', 'anular', 'baja', 'archivar', 'grabar', 'firmar', 'pagar'] as const

/**
 * Acciones que el formador puede resolver, con los ÚNICOS textos (normalizados) admitidos para cada una.
 * 🔒 (revisión de seguridad 06/10/2026) SOLO «calcular»: es la única que pide el adaptador. Ampliarla
 * (navegación, pestañas, menús) es una decisión de Alberto con su test (lo fija test/formador.test.ts).
 */
export const ACCIONES_PERMITIDAS = {
  calcular: ['calcular', 'calcular prima', 'recalcular'],
  // NAVEGACIÓN de menús (Alberto, 14/10/2026: «el botón con IA para no quedarse parado»). Textos EXACTOS de wmediadores.
  pestana_nueva_produccion: ['nueva produccion'],
  menu_automoviles: ['automoviles'],
  // «Continuar»/«Siguiente» ENTRE PANTALLAS (pieza 4, 14/10/2026): se pulsa SIEMPRE por el guard (`ctx.pulsar`) y por
  // `pulsarContinuarSeguro` (continuar.ts). Nunca «Continuar a pago», «Grabar y continuar»…: el texto casa ENTERO.
  continuar: ['continuar', 'siguiente'],
  // ELEGIR UNA OPCIÓN visible de una lista cerrada por el propio portal (etiqueta de un radio, opción de un autocompletado: madera,
  // tipo de vivienda, régimen, uso, población, vía…). GENÉRICA (Alberto, 14/10/2026): no lleva textos porque son datos del riesgo que
  // lee el portal; lo que la acota es la FORMA del elemento (`esElementoOpcion`: label/option/radio, nunca un botón ni un campo), la
  // ausencia de palabras de emisión/pago (`bloqueoPalabras`, como cualquier acción) y que se pulse SIEMPRE por una puerta guardada
  // (`ctx.marcarOpcionHogar*` o `ctx.pulsar`). La clave admite sufijo (`elegir_opcion_<slug>`) para no mezclar lo aprendido de
  // opciones distintas. Es la única fila SIN textos (la regla «texto entero de la tabla» no se aplica a ella).
  elegir_opcion: [],
} as const satisfies Record<string, readonly string[]>

/**
 * ENLACE DE ENTRADA de una compañía (Mapfre «Tarificación y Emisión Rápida»): sus textos NO están en la tabla de arriba
 * (casan con el patrón de emisión); son los de `ENLACES_ENTRADA_AUTORIZADOS` de guard.ts, y lo resuelto SOLO se pulsa por
 * `ctx.pulsarEnlaceEntrada` (que vuelve a exigir el texto exacto, una vez por trabajo y fase de entrada).
 */
export const ACCION_ENLACE_ENTRADA = 'enlace_entrada'

/** Textos de entrada autorizados de la compañía, normalizados (vacío si no tiene). */
export function textosEntradaDe(compania: string): string[] {
  if (typeof compania !== 'string' || !Object.hasOwn(ENLACES_ENTRADA_AUTORIZADOS, compania)) return []
  return ENLACES_ENTRADA_AUTORIZADOS[compania]!.map(normalizarTexto)
}

export type AccionPermitida = keyof typeof ACCIONES_PERMITIDAS
export type TipoClave = 'campo' | 'accion'

/** Fila de ACCIONES_PERMITIDAS de una clave: exacta, o `elegir_opcion_<slug>` → `elegir_opcion`. `null` = fuera de la lista. */
export function baseAccion(clave: string): AccionPermitida | null {
  if (Object.prototype.hasOwnProperty.call(ACCIONES_PERMITIDAS, clave)) return clave as AccionPermitida
  return /^elegir_opcion_[a-z0-9_]{1,40}$/.test(clave) ? 'elegir_opcion' : null
}

export function esAccionPermitida(clave: string): boolean {
  return baseAccion(clave) !== null
}

/**
 * ¿Tiene forma de OPCIÓN de una lista (la etiqueta de un radio, una `mat-option`/`[role=option]`, un `li` de autocompletado)?
 * Nunca un botón, enlace o campo. Con texto visible corto. PURA (vale para `Candidato` y `DescripcionElemento`).
 */
export function esElementoOpcion(e: { tag: string; role: string | null; texto: string | null; paraCheckbox?: boolean }): boolean {
  // Un `label` de una CASILLA (su `for` apunta a un checkbox, o envuelve uno) no es una opción de lista: marcarla cambia un dato suelto.
  if (e.paraCheckbox === true) return false
  const tag = e.tag.toLowerCase()
  const role = (e.role ?? '').toLowerCase()
  const texto = (e.texto ?? '').trim()
  if (!texto || texto.length > 120) return false
  if (tag === 'button' || tag === 'a' || tag === 'input' || tag === 'select' || tag === 'textarea' || role === 'button') return false
  return tag === 'label' || tag === 'mat-option' || tag === 'li' || /option/.test(tag) || role === 'option'
}

/**
 * Tipos de `<input>` que se consideran control EDITABLE para un campo (lista BLANCA). Sin casillas (checkbox
 * ni la de opción única): un control que viene de la IA o de lo aprendido nunca se marca (`setChecked` no
 * pasa por el guard). La de opción única no se nombra en src/ (guardián): queda fuera por ser lista blanca.
 */
export const TIPOS_INPUT_EDITABLES = ['', 'text', 'number', 'date', 'datetime-local', 'month', 'email', 'tel', 'search'] as const
/** Tipos de `<input>` que son un BOTÓN (su `value` es su etiqueta visible: lo único que se lee de un value). */
export const TIPOS_INPUT_BOTON = ['button', 'submit', 'image', 'reset'] as const
const ROLES_EDITABLES = ['textbox', 'combobox', 'spinbutton', 'listbox', 'searchbox']
const TAGS_EDITABLES = ['select', 'textarea', 'nx-dropdown', 'nx-datefield', 'nx-formfield']

/** Sin mayúsculas, sin tildes, sin «>», «»», «›», «:», «*», espacios colapsados. */
export function normalizarTexto(t: string | null | undefined): string {
  if (typeof t !== 'string') return ''
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[>»›<«‹:*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Clave de un CAMPO para asegura: slug `^[a-z0-9_]{1,60}$` (lo exige el servidor y el CHECK del SQL).
 * Sin tildes, minúsculas, todo lo que no sea `[a-z0-9]` → `_`, recortada; el control N-ésimo de la fila
 * lleva el sufijo `__N`. La etiqueta real viaja aparte (en la descripción). «DNI/NIF/NIE/CIF» #1 →
 * `dni_nif_nie_cif__1`.
 */
export function claveCampo(etiqueta: string, indice = 0): string {
  const sufijo = indice > 0 ? `__${indice}` : ''
  const base = etiqueta
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  const recortada = base.slice(0, 60 - sufijo.length).replace(/_+$/g, '') || 'campo'
  return `${recortada}${sufijo}`
}

/** Palabras (≥3 letras) de una etiqueta normalizada: lo que se contrasta con la fila del elemento. */
export function palabrasEtiqueta(t: string | null | undefined): string[] {
  return [...new Set(normalizarTexto(t).split(/[^a-z0-9]+/).filter((w) => /^[a-z]{3,}$/.test(w)))]
}

/**
 * ¿La etiqueta de la fila del elemento (label/aria/celda anterior) es la del campo pedido? Las palabras de
 * ≥3 letras de `etiqueta` tienen que estar en `etiquetaFila`: el 100 % si son ≤2, el 50 % si son más.
 * Sin etiqueta, sin palabras contrastables o sin etiqueta de fila → NO (conservador).
 */
export function contrastarEtiqueta(etiqueta: string | null | undefined, etiquetaFila: string | null | undefined): Validacion {
  const buscadas = palabrasEtiqueta(etiqueta)
  if (!buscadas.length) return { ok: false, motivo: 'la etiqueta pedida no tiene palabras contrastables' }
  const fila = new Set(palabrasEtiqueta(etiquetaFila))
  if (!fila.size) return { ok: false, motivo: 'el elemento no tiene etiqueta en su fila' }
  const casan = buscadas.filter((w) => fila.has(w)).length
  const exigidas = buscadas.length <= 2 ? buscadas.length : Math.ceil(buscadas.length / 2)
  return casan >= exigidas ? { ok: true } : { ok: false, motivo: `su etiqueta de fila no es la del campo (${casan}/${buscadas.length} palabras)` }
}

// ─── Validación DETERMINISTA (pura) ──────────────────────────────────────────

/** Lo que se sabe del elemento al que resuelve un selector (nunca su valor, salvo la etiqueta de un input-botón). */
export type DescripcionElemento = {
  coincidencias: number
  visible: boolean
  tag: string
  type: string | null
  role: string | null
  texto: string | null
  valorBoton: string | null
  title: string | null
  ariaLabel: string | null
  id: string | null
  name: string | null
  href: string | null
  onclick: string | null
  onchange: string | null
  formaction: string | null
  /** Texto de su label[for]/label envolvente/aria-label(ledby)/celda anterior de su fila. Solo local: no viaja. */
  etiquetaFila: string | null
  deshabilitado: boolean
  editableContenido: boolean
  /** Solo `label`: su `for` apunta a un checkbox o envuelve uno (no es una opción de lista). Opcional. */
  paraCheckbox?: boolean
  /** Manejador AngularJS (`ng-click`/`data-ng-click`): cuenta como un onclick. Opcional (descripciones antiguas). */
  ngClick?: string | null
  /** `mattooltip` (Angular Material). Opcional: cuenta para el bloqueo y, en la lupa, como etiqueta. */
  tooltip?: string | null
  /** Icono del control (ligadura de `mat-icon`, `fonticon`/`svgicon`, clases): informativo. */
  icono?: string | null
  /** Texto visible SIN la ligadura de los `mat-icon` («search»). Ausente = `texto`. */
  textoSinIcono?: string | null
}

export type Validacion = { ok: true } | { ok: false; motivo: string }

function exigirUnicoVisible(d: DescripcionElemento): Validacion | null {
  if (d.coincidencias !== 1) return { ok: false, motivo: `resuelve a ${d.coincidencias} elementos (se exige exactamente 1)` }
  if (!d.visible) return { ok: false, motivo: 'no es visible' }
  if (d.deshabilitado) return { ok: false, motivo: 'está deshabilitado' }
  return null
}

/**
 * Bloqueo de palabras (patrón de emisión del guard + `BLOQUEO_FORMADOR`) sobre los atributos dados. El
 * `motivo` nombra SOLO el atributo que casó, nunca su valor (un href/onclick puede llevar datos).
 */
function bloqueoPalabras(atributos: [string, string | null][]): Validacion | null {
  for (const [nombre, x] of atributos) {
    if (pareceEmision(x)) return { ok: false, motivo: `el atributo «${nombre}» casa con el patrón de emisión` }
    const n = normalizarTexto(x)
    const prohibida = BLOQUEO_FORMADOR.find((p) => n.includes(p))
    if (prohibida) return { ok: false, motivo: `el atributo «${nombre}» contiene una palabra bloqueada («${prohibida}»)` }
  }
  return null
}

export function validarAccion(d: DescripcionElemento, clave: string, textoEsperado?: string | null): Validacion {
  const base = baseAccion(clave)
  if (!base) return { ok: false, motivo: `acción «${clave}» fuera de la lista cerrada` }
  const permitidos: readonly string[] = ACCIONES_PERMITIDAS[base]
  if (base !== 'elegir_opcion' && textoEsperado !== undefined && textoEsperado !== null && !permitidos.includes(normalizarTexto(textoEsperado))) {
    return { ok: false, motivo: `texto esperado «${textoEsperado}» no está en la tabla de «${clave}»` }
  }
  const u = exigirUnicoVisible(d)
  if (u) return u
  const tag = d.tag.toLowerCase()
  const type = (d.type ?? '').toLowerCase()
  if (tag === 'select' || tag === 'textarea' || (tag === 'input' && !(TIPOS_INPUT_BOTON as readonly string[]).includes(type))) {
    return { ok: false, motivo: `<${tag}${type ? ` type=${type}` : ''}> no es un control de acción` }
  }
  const bloqueo = bloqueoPalabras([
    ['texto', d.texto], ['value', d.valorBoton], ['title', d.title], ['aria-label', d.ariaLabel], ['id', d.id],
    ['name', d.name], ['href', d.href], ['onclick', d.onclick], ['onchange', d.onchange], ['formaction', d.formaction], ['ng-click', d.ngClick ?? null],
    ['mattooltip', d.tooltip ?? null],
  ])
  if (bloqueo) return bloqueo
  if (base === 'elegir_opcion') return esElementoOpcion(d) ? { ok: true } : { ok: false, motivo: 'no tiene forma de opción de una lista (label/option con texto)' }
  const objetivo = textoEsperado ? [normalizarTexto(textoEsperado)] : permitidos
  const visibles = [d.texto, d.valorBoton, d.title, d.ariaLabel].map(normalizarTexto).filter(Boolean)
  if (!visibles.some((v) => objetivo.includes(v))) return { ok: false, motivo: `su texto («${visibles[0] ?? ''}») no es el de «${clave}»` }
  return { ok: true }
}

/**
 * Campo resuelto por el FORMADOR (IA o aprendido; la vía determinista del adaptador no pasa por aquí):
 * control editable único y visible, sin casillas (listas blancas de type/tag/role), sin palabras de emisión en sus
 * atributos y con la etiqueta de su fila contrastada con la pedida (`contrastarEtiqueta`).
 */
export function validarCampo(d: DescripcionElemento, etiqueta: string | null | undefined, opciones: { humano?: boolean } = {}): Validacion {
  const u = exigirUnicoVisible(d)
  if (u) return u
  const tag = d.tag.toLowerCase()
  const type = (d.type ?? '').toLowerCase()
  const role = (d.role ?? '').toLowerCase()
  if (tag === 'a' || tag === 'button' || tag === 'nx-button') return { ok: false, motivo: `<${tag}> no es un campo editable` }
  // Casillas: fuera por LISTA BLANCA (type de input, tag y role); un role que no sea de edición, también.
  if (type === 'checkbox' || (role !== '' && !ROLES_EDITABLES.includes(role)) || !/^[a-z][a-z0-9-]*$/.test(tag)) {
    return { ok: false, motivo: 'una casilla o un control sin rol de edición no se resuelve por el formador' }
  }
  const bloqueo = bloqueoPalabras([['id', d.id], ['name', d.name], ['title', d.title], ['aria-label', d.ariaLabel], ['onclick', d.onclick], ['onchange', d.onchange]])
  if (bloqueo) return bloqueo
  const editable =
    tag === 'input'
      ? (TIPOS_INPUT_EDITABLES as readonly string[]).includes(type)
      : TAGS_EDITABLES.includes(tag) || ROLES_EDITABLES.includes(role) || d.editableContenido
  if (!editable) return { ok: false, motivo: tag === 'input' ? `<input type=${type}> no es un campo editable` : `<${tag}> no es un campo editable` }
  // ELEGIDO POR ALBERTO (F2, atasco): lo señaló una persona viendo la captura; el contraste de etiqueta (que protege de una
  // IA que alucina) no se exige. Todo lo demás de arriba (único, visible, editable, sin casillas ni palabras bloqueadas), sí.
  if (opciones.humano === true) return { ok: true }
  return contrastarEtiqueta(etiqueta, d.etiquetaFila)
}

/**
 * El ENLACE DE ENTRADA (`ACCION_ENLACE_ENTRADA`): como `validarAccion`, pero los textos son los de guard.ts para ESA compañía
 * y el texto visible tiene que ser EXACTAMENTE el esperado. Solo ese texto exacto se exime del bloqueo de palabras (es
 * «Emisión» de un nombre de menú); id, href, onclick, ng-click, title… que no sean exactamente él se siguen mirando.
 */
export function validarAccionEntrada(d: DescripcionElemento, compania: string, textoEsperado: string | null | undefined): Validacion {
  const esperado = normalizarTexto(textoEsperado)
  if (!esperado || !textosEntradaDe(compania).includes(esperado)) return { ok: false, motivo: 'enlace de entrada fuera de la lista del guard para esta compañía' }
  const u = exigirUnicoVisible(d)
  if (u) return u
  const tag = d.tag.toLowerCase()
  const type = (d.type ?? '').toLowerCase()
  if (tag === 'select' || tag === 'textarea' || (tag === 'input' && !(TIPOS_INPUT_BOTON as readonly string[]).includes(type))) {
    return { ok: false, motivo: `<${tag}${type ? ` type=${type}` : ''}> no es un control de acción` }
  }
  const exento = (x: string | null) => x !== null && normalizarTexto(x) === esperado
  const bloqueo = bloqueoPalabras(([
    ['texto', d.texto], ['value', d.valorBoton], ['title', d.title], ['aria-label', d.ariaLabel], ['id', d.id],
    ['name', d.name], ['href', d.href], ['onclick', d.onclick], ['onchange', d.onchange], ['formaction', d.formaction], ['ng-click', d.ngClick ?? null],
  ] as [string, string | null][]).filter(([, x]) => !exento(x)))
  if (bloqueo) return bloqueo
  if (normalizarTexto(d.texto) !== esperado) return { ok: false, motivo: 'su texto visible no es exactamente el del enlace de entrada' }
  return { ok: true }
}

/** `humano` (F2): solo relaja el contraste de etiqueta de un CAMPO elegido por Alberto; una acción sigue la tabla cerrada igual. */
export function validarResolucion(p: Pick<PeticionResolver, 'tipo' | 'clave' | 'textoEsperado' | 'etiqueta'>, d: DescripcionElemento, compania = '', opciones: { humano?: boolean } = {}): Validacion {
  if (p.tipo === 'accion' && p.clave === ACCION_ENLACE_ENTRADA) return validarAccionEntrada(d, compania, p.textoEsperado)
  return p.tipo === 'accion' ? validarAccion(d, p.clave, p.textoEsperado) : validarCampo(d, p.etiqueta, opciones)
}

// ─── Candidatos (estructura compacta, SIN valores) ───────────────────────────

/** Lo que viaja a asegura por candidato. Sin `value`, sin selector. */
export type Candidato = {
  tag: string
  id: string | null
  name: string | null
  type: string | null
  role: string | null
  clases: string | null
  texto: string | null
  etiqueta: string | null
  marco: string | null
  /** Solo `label`: su `for` apunta a un checkbox o envuelve uno. Solo local (`sinSelector` lo quita: no viaja). */
  paraCheckbox?: boolean
}
/** Candidato con lo que el worker se guarda para volver a encontrarlo (el selector no sale). */
export type CandidatoLocal = Candidato & { selector: string }

const recorta = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim()
  return t ? t.slice(0, max) : null
}

/**
 * Proyección PURA de lo leído del DOM a la lista blanca. Para un campo no viaja texto (un `textarea` o un
 * `select` lo traerían); para una acción, el texto visible y, si es un input-botón, su `value` (= su
 * etiqueta). Cualquier otra clave (`value`, `password`…) se descarta. Etiqueta y texto pasan por
 * `limpiarTextoAviso` (credenciales + datos personales).
 */
export function proyectarCandidato(raw: Record<string, unknown>, tipo: TipoClave, redactar: (t: string) => string = (t) => t): CandidatoLocal | null {
  const tag = recorta(raw.tag, 30)?.toLowerCase() ?? null
  const selector = recorta(raw.selector, 2000)
  if (!tag || !selector) return null
  const type = recorta(raw.type, 20)?.toLowerCase() ?? null
  if (tag === 'input' && type === 'password') return null
  const esBotonInput = tag === 'input' && type !== null && (TIPOS_INPUT_BOTON as readonly string[]).includes(type)
  // Sin texto visible (botón de solo icono): su nombre accesible .
  const textoAccion = tipo === 'accion'
    ? recorta(raw.texto, 80) ?? (esBotonInput ? recorta(raw.valorBoton, 80) : null) ?? recorta(raw.accesible, 80)
    : null
  return {
    tag,
    id: recorta(raw.id, 80),
    name: recorta(raw.name, 80),
    type,
    role: recorta(raw.role, 30),
    clases: recorta(raw.clases, 120),
    texto: textoAccion ? limpiarTextoAviso(textoAccion, redactar, 80) : null,
    etiqueta: limpiarTextoAviso(recorta(raw.etiqueta, 120), redactar, 120),
    marco: recorta(raw.marco, 120),
    ...(raw.paraCheckbox === true ? { paraCheckbox: true } : {}),
    selector,
  }
}

export function sinSelector(c: CandidatoLocal): Candidato {
  const { selector: _s, paraCheckbox: _p, ...resto } = c
  return resto
}

/** Incluye el `mat-icon` SUELTO (Angular enlaza su `(click)` sin atributo: una lupa puede ser solo el icono); el de dentro de un botón/enlace no (sería el mismo control). */
export const SELECTOR_ACCIONES = 'a, button, input[type=button], input[type=submit], input[type=image], [onclick], [ng-click], [data-ng-click], [role=button], [role=tab], [role=menuitem], nx-button, mat-icon:not(a mat-icon):not(button mat-icon):not([role=button] mat-icon)'
/** Solo para la acción `elegir_opcion`: la etiqueta de un radio y las opciones de un autocompletado. NO entra en `SELECTOR_ACCIONES`. */
export const SELECTOR_OPCIONES = 'label[for], mat-option, [role=option]'
export const SELECTOR_CAMPOS = 'input:not([type=hidden]):not([type=password]):not([type=radio]), select, textarea, nx-dropdown, nx-datefield, [role=combobox], [role=textbox], [role=spinbutton], [contenteditable=true]'
export const MAX_CANDIDATOS = 400

/**
 * Función que se ejecuta EN EL NAVEGADOR. tsx/esbuild (keepNames) envuelve las funciones con nombre que
 * lleve dentro en `__name(…)`, que no existe en la página («ReferenceError: __name is not defined»: el
 * `.catch` lo tragaba y no salía ningún candidato). Se reconstruye desde su TEXTO con un `__name` neutro
 * (mismo truco que `FUENTE_RESOLVER` del adaptador ePAC).
 */
export function enPagina<F extends (...args: never[]) => unknown>(fn: F): F {
  return new Function('x', 'y', `var __name = (f) => f; return (${fn.toString()})(x, y)`) as F
}

/** Ruta legible del marco: «principal» o la de `rutaMarco` (nombres de iframe). */
export function nombreMarco(page: Page, f: Frame): string {
  return f === page.mainFrame() ? 'principal' : rutaMarco(f)
}

/** ¿La petición es de la acción `elegir_opcion` (la única que ve labels y opciones)? Pura. */
export function esPeticionOpcion(p: Pick<PeticionResolver, 'tipo' | 'clave'>): boolean {
  return p.tipo === 'accion' && baseAccion(p.clave) === 'elegir_opcion'
}

/** Recorre TODOS los marcos vivos y devuelve los candidatos visibles del tipo pedido (tope `MAX_CANDIDATOS`). */
export async function extraerCandidatos(page: Page, tipo: TipoClave, redactar: (t: string) => string = (t) => t, opciones = false): Promise<CandidatoLocal[]> {
  const out: CandidatoLocal[] = []
  for (const f of page.frames()) {
    if (f.isDetached() || out.length >= MAX_CANDIDATOS) continue
    const marco = nombreMarco(page, f)
    const crudos = await f
      .evaluate(
        enPagina(({ sel, esAccion, tope }: { sel: string; esAccion: boolean; tope: number }) => {
          const visible = (el: Element) => {
            const r = (el as HTMLElement).getClientRects()
            const cs = getComputedStyle(el)
            return r.length > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'
          }
          const unico = (css: string) => {
            try {
              return document.querySelectorAll(css).length === 1
            } catch {
              return false
            }
          }
          const xpath = (el: Element): string => {
            const partes: string[] = []
            let n: Element | null = el
            while (n && n.nodeType === 1 && n !== document.documentElement) {
              const tag: string = n.tagName.toLowerCase()
              let i = 1
              let h = n.previousElementSibling
              while (h) {
                if (h.tagName === n.tagName) i++
                h = h.previousElementSibling
              }
              partes.unshift(`${tag.includes('-') ? `*[local-name()="${tag}"]` : tag}[${i}]`)
              n = n.parentElement
            }
            return `xpath=/html/${partes.join('/')}`
          }
          const etiquetaDe = (el: Element): string | null => {
            const h = el as HTMLElement
            if (h.id) {
              const l = document.querySelector(`label[for="${CSS.escape(h.id)}"]`)
              if (l?.textContent) return l.textContent
            }
            const envuelve = h.closest('label')
            if (envuelve?.textContent) return envuelve.textContent
            const al = h.getAttribute('aria-label')
            if (al) return al
            const lb = h.getAttribute('aria-labelledby')
            if (lb) {
              const t = lb.split(/\s+/).map((i) => document.getElementById(i)?.textContent ?? '').join(' ').trim()
              if (t) return t
            }
            const ph = h.getAttribute('placeholder')
            if (ph) return ph
            const celda = h.closest('td')?.previousElementSibling
            return celda?.textContent ?? null
          }
          // `label` cuyo `for` apunta a un checkbox (o que envuelve uno): una casilla, no una opción de lista.
          const esDeCasilla = (l: HTMLElement): boolean => {
            const para = l.getAttribute('for')
            const dest = para ? document.getElementById(para) : l.querySelector('input')
            const casilla = (x: Element | null) => !!x && ((x as HTMLInputElement).type === 'checkbox' || x.getAttribute('role') === 'checkbox')
            return casilla(dest) || !!l.querySelector('input[type=checkbox], [role=checkbox]')
          }
          const res: Record<string, unknown>[] = []
          for (const el of Array.from(document.querySelectorAll(sel))) {
            if (res.length >= tope) break
            if (!visible(el)) continue
            const h = el as HTMLElement
            const tag = h.tagName.toLowerCase()
            const type = (h.getAttribute('type') ?? '').toLowerCase()
            const esBoton = tag === 'input' && ['button', 'submit', 'image', 'reset'].includes(type)
            const name = h.getAttribute('name')
            const selector = h.id && unico(`#${CSS.escape(h.id)}`)
              ? `#${CSS.escape(h.id)}`
              : name && unico(`${tag}[name="${CSS.escape(name)}"]`)
                ? `${tag}[name="${CSS.escape(name)}"]`
                : xpath(el)
            res.push({
              tag,
              id: h.id || null,
              name,
              type: type || null,
              role: h.getAttribute('role'),
              clases: typeof h.className === 'string' ? h.className.split(/\s+/).slice(0, 4).join(' ') : null,
              // Un [ng-click] que no es <a>/<button>/rol (fila, tarjeta…) puede envolver nombres: texto CORTO (80). Luego pasa por
              // el redactor (`limpiarTextoAviso`) en `proyectarCandidato`, como todos.
              texto: esAccion && tag !== 'input' ? (h.innerText || h.textContent || '').slice(0, h.matches('a, button, [role]') ? 200 : 80) : null,
              // Control de SOLO icono (sin texto): su nombre accesible, para la IA y para que pueda salir en un atasco.
              accesible: esAccion ? h.getAttribute('aria-label') || h.getAttribute('title') || h.getAttribute('mattooltip') : null,
              icono: esAccion
                ? Array.from(h.matches('mat-icon, i[class], svg') ? [h] : h.querySelectorAll('mat-icon, [data-mat-icon-name], [fonticon], [svgicon], i[class], svg'))
                  .map((i) => [i.tagName === 'MAT-ICON' ? i.textContent : '', i.getAttribute('data-mat-icon-name'), i.getAttribute('fonticon'), i.getAttribute('svgicon'), i.getAttribute('class')].filter(Boolean).join(' '))
                  .join(' ').slice(0, 200)
                : null,
              valorBoton: esAccion && esBoton ? h.getAttribute('value') : null,
              etiqueta: etiquetaDe(el),
              paraCheckbox: tag === 'label' && esDeCasilla(h),
              selector,
            })
          }
          return res
        }),
        { sel: tipo === 'accion' ? (opciones ? `${SELECTOR_ACCIONES}, ${SELECTOR_OPCIONES}` : SELECTOR_ACCIONES) : SELECTOR_CAMPOS, esAccion: tipo === 'accion', tope: MAX_CANDIDATOS - out.length },
      )
      .catch(() => [] as Record<string, unknown>[])
    for (const r of crudos) {
      const c = proyectarCandidato({ ...r, marco }, tipo, redactar)
      if (c) out.push(c)
    }
  }
  return out
}

/** Locator de un selector en su marco (o en todos si `marco` es null o ya no existe). Devuelve también el total. */
async function localizar(page: Page, selector: string, marco: string | null): Promise<{ locator: Locator | null; total: number }> {
  let total = 0
  let locator: Locator | null = null
  for (const f of page.frames()) {
    if (f.isDetached()) continue
    if (marco && nombreMarco(page, f) !== marco) continue
    const l = f.locator(selector)
    const n = await l.count().catch(() => 0)
    if (n > 0) {
      total += n
      locator ??= l
    }
  }
  if (!locator && marco) return localizar(page, selector, null)
  return { locator, total }
}

/** Descripción del elemento para `validarResolucion`. Nunca lee el valor de un campo. */
export async function describirElemento(l: Locator, total: number): Promise<DescripcionElemento | null> {
  const primero = l.first()
  const visible = await primero.isVisible().catch(() => false)
  const d = await primero
    .evaluate(enPagina((el: Element) => {
      const h = el as HTMLElement & { disabled?: unknown }
      const tag = h.tagName.toLowerCase()
      const type = (h.getAttribute('type') ?? '').toLowerCase()
      const esBoton = tag === 'input' && ['button', 'submit', 'image', 'reset'].includes(type)
      return {
        tag,
        type: type || null,
        role: h.getAttribute('role'),
        texto: tag === 'input' || tag === 'textarea' || tag === 'select' ? null : (h.innerText || h.textContent || '').slice(0, 200),
        valorBoton: esBoton ? h.getAttribute('value') : null,
        title: h.getAttribute('title'),
        ariaLabel: h.getAttribute('aria-label'),
        id: h.id || null,
        name: h.getAttribute('name'),
        href: h.getAttribute('href'),
        onclick: h.getAttribute('onclick'),
        onchange: h.getAttribute('onchange'),
        formaction: h.getAttribute('formaction'),
        ngClick: h.getAttribute('ng-click') ?? h.getAttribute('data-ng-click'),
        tooltip: h.getAttribute('mattooltip'),
        icono: iconoDe(h),
        textoSinIcono: tag === 'input' || tag === 'textarea' || tag === 'select' ? null : textoSinIconos(h),
        etiquetaFila: etiquetaFila(h),
        deshabilitado: h.disabled === true || h.getAttribute('aria-disabled') === 'true',
        editableContenido: h.isContentEditable === true,
        paraCheckbox: tag === 'label' && labelDeCasilla(h),
      }

      // `label` cuyo `for` apunta a un checkbox (o que envuelve uno): una casilla, no una opción de lista.
      function labelDeCasilla(l: HTMLElement): boolean {
        const para = l.getAttribute('for')
        const dest = para ? document.getElementById(para) : l.querySelector('input')
        const casilla = (x: Element | null) => !!x && ((x as HTMLInputElement).type === 'checkbox' || x.getAttribute('role') === 'checkbox')
        return casilla(dest) || !!l.querySelector('input[type=checkbox], [role=checkbox]')
      }

      // Icono del control (él mismo o sus descendientes): ligadura de mat-icon, fonticon/svgicon/data-mat-icon-name y clases.
      function iconoDe(x: HTMLElement): string | null {
        const sel = 'mat-icon, [data-mat-icon-name], [fonticon], [svgicon], i[class], svg'
        const l = x.matches(sel) ? [x] : Array.from(x.querySelectorAll(sel))
        const t = l
          .map((i) => [i.tagName === 'MAT-ICON' ? i.textContent : '', i.getAttribute('data-mat-icon-name'), i.getAttribute('fonticon'), i.getAttribute('svgicon'), i.getAttribute('class')].filter(Boolean).join(' '))
          .join(' ').replace(/\s+/g, ' ').trim().slice(0, 200)
        return t || null
      }
      // Texto del control SIN la ligadura de sus mat-icon («search»): lo que una persona lee.
      function textoSinIconos(x: HTMLElement): string {
        if (x.tagName === 'MAT-ICON') return ''
        const c = x.cloneNode(true) as HTMLElement
        c.querySelectorAll('mat-icon').forEach((m) => m.remove())
        return (c.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)
      }
      // Texto visible de un nodo SIN lo de dentro de controles (las opciones de un select no son etiqueta).
      function textoSinControles(n: Element): string {
        const w = document.createTreeWalker(n, 4 /* TEXT */)
        const partes: string[] = []
        let t: Node | null
        while ((t = w.nextNode())) {
          if (t.parentElement?.closest('select, option, textarea, script, style, button')) continue
          partes.push(t.nodeValue ?? '')
        }
        return partes.join(' ').replace(/\s+/g, ' ').trim()
      }
      // label[for] + label envolvente + aria-label/aria-labelledby + la celda con texto más cercana ANTES
      // de la suya en su fila (subiendo hasta 3 filas si la tabla está anidada). Solo para contrastar en local.
      function etiquetaFila(x: HTMLElement): string | null {
        const partes: string[] = []
        if (x.id) {
          for (const l of Array.from(document.querySelectorAll(`label[for="${CSS.escape(x.id)}"]`))) partes.push(textoSinControles(l))
        }
        const envuelve = x.closest('label')
        if (envuelve) partes.push(textoSinControles(envuelve))
        const al = x.getAttribute('aria-label')
        if (al) partes.push(al)
        const lb = x.getAttribute('aria-labelledby')
        if (lb) for (const i of lb.split(/\s+/)) { const r = document.getElementById(i); if (r) partes.push(textoSinControles(r)) }
        let celda: Element | null = x.closest('td, th')
        for (let nivel = 0; celda && nivel < 3; nivel++) {
          let previa = celda.previousElementSibling
          let hallada = ''
          while (previa && !hallada) {
            hallada = textoSinControles(previa)
            previa = previa.previousElementSibling
          }
          if (hallada) {
            partes.push(hallada)
            break
          }
          celda = celda.parentElement?.closest('td, th') ?? null
        }
        const t = partes.filter(Boolean).join(' | ').slice(0, 400)
        return t || null
      }
    }))
    .catch(() => null)
  return d ? { ...d, coincidencias: total, visible } : null
}

// ─── Contexto y llamadas a asegura ───────────────────────────────────────────

/** `consolidado` (F2): ≥3 éxitos o elegido por Alberto. Ausente (asegura anterior) = no consta → provisional. */
export type EntradaConocimiento = { clave: string; tipo: TipoClave; selector: string; marco: string | null; origen: string; confirmaciones: number; consolidado?: boolean }

/** Uso de una entrada APRENDIDA en este trabajo (F2): para avisar a asegura de lo que falló al cerrar. */
export type UsoAprendido = { clave: string; tipo: TipoClave; selector: string; marco: string | null; confirmado: boolean; rechazado: boolean }

export type ContextoFormador = {
  trabajoId: string
  compania: string
  ramo: string
  apiUrl: string
  secreto: string
  /** Kill-switch: lo decide asegura (`TARIFICADOR_FORMADOR_ACTIVO`). Apagado = no se hace NADA. */
  activo: boolean
  /** Modo acompañado para esta compañía/ramo. */
  acompanado: boolean
  conocimiento: EntradaConocimiento[]
  /** Selectores (marco + selector) ya resueltos en ESTE trabajo → su clave: uno no vale para dos claves. */
  resueltos: Map<string, string>
  redactar: (t: string) => string
  log: (m: string, datos?: Record<string, unknown>) => void
  fetchImpl?: typeof fetch
  /** PLAN B: consumo del respaldo IA en ESTE trabajo (se crea al primer uso). Ver `PRESUPUESTO_RESPALDO`. */
  usoIA?: { consultas: number; ms: number }
  /** F2: lo aprendido que se probó en este trabajo (clave+selector+marco → uso). */
  usosAprendido?: Map<string, UsoAprendido>
  /** F2: el ÚLTIMO paso que nadie resolvió (checkpoint del atasco). Se borra en cuanto otro paso avanza. */
  atasco?: AtascoWorker | null
}

/**
 * PLAN B (14/10/2026): por trabajo, como mucho estas consultas a la IA del respaldo y este tiempo acumulado esperándola.
 * Agotado → `null` sin preguntar (el adaptador lanza su error original con inventario). El tope de llamadas y de gasto de
 * asegura (`TARIFICADOR_FORMADOR_MAX_LLAMADAS`, `ai_usos`) sigue mandando además de este.
 */
export const PRESUPUESTO_RESPALDO = { consultas: 10, msIA: 150_000 } as const

/** ¿Queda presupuesto de IA en este trabajo? Pura. */
export function quedaPresupuestoIA(uso: { consultas: number; ms: number } | undefined): boolean {
  const u = uso ?? { consultas: 0, ms: 0 }
  return u.consultas < PRESUPUESTO_RESPALDO.consultas && u.ms < PRESUPUESTO_RESPALDO.msIA
}

const TIMEOUT_CORTO_MS = 8_000
/** La IA puede tardar: el endpoint escala de modelo (2 × 15 s) dentro de su transacción; margen de red encima. */
const TIMEOUT_IA_MS = 45_000

async function llamar<T>(ctx: Pick<ContextoFormador, 'apiUrl' | 'secreto' | 'fetchImpl'>, ruta: string, init: { metodo: 'GET' | 'POST'; cuerpo?: unknown; timeoutMs: number }): Promise<T | null> {
  try {
    const res = await (ctx.fetchImpl ?? fetch)(`${ctx.apiUrl}/api/tarificador/formador/${ruta}`, {
      method: init.metodo,
      headers: { Authorization: `Bearer ${ctx.secreto}`, ...(init.cuerpo ? { 'Content-Type': 'application/json' } : {}) },
      ...(init.cuerpo ? { body: JSON.stringify(init.cuerpo) } : {}),
      signal: AbortSignal.timeout(init.timeoutMs),
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

/** Precarga (una vez por trabajo). Cualquier fallo → formador apagado para este trabajo (fail-closed). */
export async function prepararFormador(base: {
  trabajoId: string
  compania: string
  ramo: string
  apiUrl: string
  secreto: string
  redactar: (t: string) => string
  log: ContextoFormador['log']
  fetchImpl?: typeof fetch
}): Promise<ContextoFormador> {
  const q = `conocimiento?trabajo_id=${encodeURIComponent(base.trabajoId)}&compania=${encodeURIComponent(base.compania)}&ramo=${encodeURIComponent(base.ramo)}`
  const r = await llamar<{ formadorActivo?: boolean; conocimiento?: EntradaConocimiento[]; acompanamiento?: { activo?: boolean } }>(base, q, { metodo: 'GET', timeoutMs: TIMEOUT_CORTO_MS })
  const activo = r?.formadorActivo === true
  const ctx: ContextoFormador = {
    ...base,
    activo,
    acompanado: activo && r?.acompanamiento?.activo === true,
    conocimiento: activo && Array.isArray(r?.conocimiento) ? r!.conocimiento! : [],
    resueltos: new Map(),
  }
  base.log('formador', { activo: ctx.activo, acompanado: ctx.acompanado, aprendido: ctx.conocimiento.length })
  return ctx
}

export type ResolucionFormador = {
  locator: Locator
  selector: string
  marco: string | null
  origen: 'conocimiento' | 'ia'
  /** Llamar SOLO tras usarlo sin error: lo deja aprendido (o suma una confirmación). */
  confirmar: () => Promise<void>
}

export type PeticionResolver = {
  clave: string
  tipo: TipoClave
  /** Para la IA: qué es (p. ej. «Superficie construida en m²», «botón Calcular de Datos Básicos»). */
  descripcion: string
  /** Solo acciones: uno de los textos de `ACCIONES_PERMITIDAS[clave]` (si no, se acepta cualquiera de la tabla). */
  textoEsperado?: string | null
  /** Solo campos: la etiqueta REAL del formulario; se contrasta con la de la fila del elemento. Sin ella, no hay campo. */
  etiqueta?: string | null
}

const claveSelector = (selector: string, marco: string | null) => `${marco ?? '*'}\u0000${selector}`

/** Un selector ya usado en este trabajo para OTRA clave no vale (la IA no puede mandar dos datos al mismo control). */
export function selectorYaUsado(resueltos: Map<string, string>, clave: string, selector: string, marco: string | null): Validacion {
  const previa = resueltos.get(claveSelector(selector, marco))
  return previa !== undefined && previa !== clave ? { ok: false, motivo: `ese elemento ya se resolvió para «${previa}» en este trabajo` } : { ok: true }
}

async function validarSelector(page: Page, ctx: ContextoFormador, p: PeticionResolver, selector: string, marco: string | null, humano = false): Promise<{ locator: Locator } | { motivo: string; yaUsado?: true }> {
  const usado = selectorYaUsado(ctx.resueltos, p.clave, selector, marco)
  if (!usado.ok) return { motivo: usado.motivo, yaUsado: true }
  const { locator, total } = await localizar(page, selector, marco)
  if (!locator) return { motivo: 'no resuelve a ningún elemento' }
  const d = await describirElemento(locator, total)
  if (!d) return { motivo: 'no se pudo describir el elemento' }
  const v = validarResolucion(p, d, ctx.compania)
  // Elegido por Alberto (origen `humano`): solo un CAMPO puede pasar sin el contraste de etiqueta; el resto de reglas, iguales.
  const final = !v.ok && humano && p.tipo === 'campo' ? validarResolucion(p, d, ctx.compania, { humano: true }) : v
  if (!final.ok) return { motivo: final.motivo }
  ctx.resueltos.set(claveSelector(selector, marco), p.clave)
  return { locator: locator.first() }
}

const claveUso = (clave: string, selector: string, marco: string | null) => `${clave}\u0000${marco ?? '*'}\u0000${selector}`

/** Anota el uso de una entrada aprendida (F2). `rechazado` = no resolvió o no validó. */
function anotarUso(ctx: ContextoFormador, c: Pick<EntradaConocimiento, 'clave' | 'tipo' | 'selector' | 'marco'>, cambio: Partial<Pick<UsoAprendido, 'confirmado' | 'rechazado'>>): void {
  ctx.usosAprendido ??= new Map()
  const k = claveUso(c.clave, c.selector, c.marco)
  const previo = ctx.usosAprendido.get(k) ?? { clave: c.clave, tipo: c.tipo, selector: c.selector, marco: c.marco, confirmado: false, rechazado: false }
  ctx.usosAprendido.set(k, { ...previo, ...cambio })
}

/** Orden de lo aprendido: consolidado primero, luego más confirmado. Puro. */
export function ordenarAprendido<T extends Pick<EntradaConocimiento, 'consolidado' | 'confirmaciones'>>(l: readonly T[]): T[] {
  return [...l].sort((a, b) => Number(b.consolidado === true) - Number(a.consolidado === true) || b.confirmaciones - a.confirmaciones)
}

/**
 * Lo aprendido que FALLÓ en este trabajo (F2), para que asegura le sume un fallo (2 seguidos = descartado). Falla lo que no
 * resolvió o no validó y nunca llegó a confirmarse, y, si el trabajo acabó en error, lo usado sin confirmar. Puro.
 */
export function aprendidoFallido(usos: ReadonlyMap<string, UsoAprendido> | undefined, resultado: 'ok' | 'error'): Pick<UsoAprendido, 'clave' | 'tipo' | 'selector' | 'marco'>[] {
  if (!usos) return []
  return [...usos.values()]
    .filter((u) => !u.confirmado && (u.rechazado || resultado === 'error'))
    .slice(0, 50)
    .map(({ clave, tipo, selector, marco }) => ({ clave, tipo, selector, marco }))
}

/**
 * FALLBACK del adaptador. Devuelve un Locator VALIDADO o `null` (y el adaptador falla como antes).
 * Una acción fuera de `ACCIONES_PERMITIDAS` ni se intenta. No pulsa: quien llama usa `ctx.pulsar()`.
 */
export async function resolverConFormador(page: Page, ctx: ContextoFormador | undefined, p: PeticionResolver): Promise<ResolucionFormador | null> {
  if (!ctx?.activo) return null
  if (p.tipo === 'accion' && !esAccionPermitida(p.clave) && !(p.clave === ACCION_ENLACE_ENTRADA && textosEntradaDe(ctx.compania).length > 0)) {
    ctx.log('formador_accion_no_permitida', { clave: p.clave })
    return null
  }
  const confirmarCon = (selector: string, marco: string | null, origen: 'ia' | 'codigo' | 'humano') => async () => {
    anotarUso(ctx, { clave: p.clave, tipo: p.tipo, selector, marco }, { confirmado: true })
    await llamar(ctx, 'confirmar', {
      metodo: 'POST',
      timeoutMs: TIMEOUT_CORTO_MS,
      cuerpo: { trabajoId: ctx.trabajoId, compania: ctx.compania, ramo: ctx.ramo, clave: p.clave, tipo: p.tipo, selector, marco, origen },
    })
  }

  // 1º Lo aprendido (consolidado primero, luego más confirmado). Lo elegido por Alberto (`humano`) pasa la misma validación.
  const previos = ordenarAprendido(ctx.conocimiento.filter((c) => c.clave === p.clave && c.tipo === p.tipo))
  for (const c of previos) {
    const v = await validarSelector(page, ctx, p, c.selector, c.marco, c.origen === 'humano')
    if (!('locator' in v)) {
      ctx.log('formador_conocimiento_rechazado', { clave: p.clave, motivo: v.motivo })
      if (!v.yaUsado) anotarUso(ctx, c, { rechazado: true })
    }
    if ('locator' in v) {
      ctx.log('formador_conocimiento', { clave: p.clave })
      anotarUso(ctx, c, {})
      const origen = c.origen === 'ia' ? 'ia' : c.origen === 'humano' ? 'humano' : 'codigo'
      return { locator: v.locator, selector: c.selector, marco: c.marco, origen: 'conocimiento', confirmar: confirmarCon(c.selector, c.marco, origen) }
    }
  }

  // 2º La IA señala; aquí se valida. PLAN B: sin presupuesto en este trabajo, no se pregunta.
  if (!quedaPresupuestoIA(ctx.usoIA)) {
    ctx.log('formador_sin_presupuesto', { clave: p.clave })
    return null
  }
  const candidatos = await extraerCandidatos(page, p.tipo, ctx.redactar, esPeticionOpcion(p))
  if (!candidatos.length) return null
  ctx.usoIA ??= { consultas: 0, ms: 0 }
  ctx.usoIA.consultas++
  const t0 = Date.now()
  const r = await llamar<{ indice?: number | null; motivo?: string }>(ctx, 'sugerir', {
    metodo: 'POST',
    timeoutMs: TIMEOUT_IA_MS,
    cuerpo: {
      trabajoId: ctx.trabajoId,
      compania: ctx.compania,
      ramo: ctx.ramo,
      clave: p.clave,
      tipo: p.tipo,
      descripcion: limpiarTextoAviso(p.descripcion, ctx.redactar, 300) ?? '',
      estructura: candidatos.map(sinSelector),
    },
  })
  ctx.usoIA.ms += Date.now() - t0
  const i = r?.indice
  if (typeof i !== 'number' || !Number.isInteger(i) || i < 0 || i >= candidatos.length) {
    ctx.log('formador_sin_sugerencia', { clave: p.clave, motivo: r?.motivo ?? 'sin_respuesta' })
    return null
  }
  const elegido = candidatos[i]
  const v = await validarSelector(page, ctx, p, elegido.selector, elegido.marco)
  if (!('locator' in v)) {
    ctx.log('formador_sugerencia_rechazada', { clave: p.clave, motivo: v.motivo })
    return null
  }
  ctx.log('formador_sugerencia_valida', { clave: p.clave })
  return { locator: v.locator, selector: elegido.selector, marco: elegido.marco, origen: 'ia', confirmar: confirmarCon(elegido.selector, elegido.marco, 'ia') }
}

// ─── CAPA COMÚN para los adaptadores (Regla «todo bot con IA detrás») ─────────

/** ¿El error es un «no encuentro el control» (lo que el respaldo puede resolver)? `portal` sí; datos, credenciales, emisión… no. */
export function esHuecoDeSelector(e: unknown): boolean {
  return e instanceof ErrorTarificador && e.tipo === 'portal'
}

/**
 * ACCIÓN con respaldo: `fijo()` (selector del adaptador) → si lanza un hueco de selector, lo aprendido y la IA
 * (`resolverConFormador`, validado aquí). Sin formador, sin presupuesto o sin candidato válido → relanza el error ORIGINAL.
 * Devuelve el locator (NO pulsa: el adaptador lo pulsa por el MISMO camino guardado que el fijo) y `confirmar`, que el
 * adaptador llama cuando la acción tuvo efecto (así se aprende solo lo que funcionó; en el fijo no hace nada).
 */
export async function conRespaldoIA(
  page: Page,
  formador: ContextoFormador | undefined,
  fijo: () => Promise<Locator>,
  p: PeticionResolver,
): Promise<{ locator: Locator; origen: 'fijo' | 'conocimiento' | 'ia'; confirmar: () => Promise<void> }> {
  try {
    const locator = await fijo()
    avanzaPaso(formador)
    return { locator, origen: 'fijo', confirmar: async () => undefined }
  } catch (e) {
    if (!esHuecoDeSelector(e)) throw e
    const r = await resolverConFormador(page, formador, p).catch(() => null)
    // PLAN B (F2): nadie lo resolvió → checkpoint de ATASCO (candidatos numerados) para que elija Alberto; el error, el ORIGINAL.
    if (!r) await registrarAtasco(page, formador, p).catch(() => undefined)
    if (!r) throw e
    avanzaPaso(formador)
    formador?.log(`respaldo: «${p.clave}» resuelto por ${r.origen}`)
    return { locator: r.locator, origen: r.origen, confirmar: r.confirmar }
  }
}

/**
 * CAMPO con respaldo: `raiz.locator(sel)` → si no existe, lo aprendido y la IA (campo editable, etiqueta de su fila
 * contrastada con `etiqueta`, sin palabras de emisión). `null` = ni fijo ni respaldo (el adaptador lanza su error). NO
 * escribe: devuelve el control (el adaptador hace `comprobarCampo` + escribe + relee) y `confirmar` para tras la relectura.
 */
export async function campoConRespaldo(
  raiz: Pick<Frame, 'locator'>,
  sel: string,
  r: { page: Page | null; formador: ContextoFormador | undefined; etiqueta: string; descripcion?: string },
): Promise<{ campo: Locator; origen: 'fijo' | 'conocimiento' | 'ia'; confirmar: () => Promise<void> } | null> {
  const fijo = raiz.locator(sel).first()
  if ((await fijo.count().catch(() => 0)) > 0) {
    avanzaPaso(r.formador)
    return { campo: fijo, origen: 'fijo', confirmar: async () => undefined }
  }
  if (!r.page) return null
  const peticion: PeticionResolver = {
    clave: claveCampo(r.etiqueta),
    tipo: 'campo',
    descripcion: r.descripcion ?? `Campo editable del formulario «${r.etiqueta}»`,
    etiqueta: r.etiqueta,
  }
  const res = await resolverConFormador(r.page, r.formador, { ...peticion }).catch(() => null)
  if (!res) {
    await registrarAtasco(r.page, r.formador, peticion).catch(() => undefined)
    return null
  }
  avanzaPaso(r.formador)
  r.formador?.log(`respaldo: campo «${r.etiqueta}» resuelto por ${res.origen}`)
  return { campo: res.locator, origen: res.origen, confirmar: res.confirmar }
}

/**
 * OPCIÓN de una lista desplegable (mat-select…) con respaldo de IA: `opciones` son los textos que ya leyó el helper del
 * overlay (catálogo del portal, nunca datos del cliente). La IA solo devuelve un ÍNDICE; aquí se valida que sea de la lista y
 * que la opción no lleve palabras de emisión/pago. Misma contabilidad que `resolverConFormador` (presupuesto del trabajo,
 * topes de asegura). `null` = sin formador, sin presupuesto, sin respuesta o respuesta inválida. NO pulsa nada.
 */
export async function sugerirOpcion(ctx: ContextoFormador | undefined, p: { clave: string; descripcion: string; opciones: readonly string[] }): Promise<number | null> {
  if (!ctx?.activo || !CLAVE_ATASCO.test(p.clave) || !p.opciones.length) return null
  if (!quedaPresupuestoIA(ctx.usoIA)) {
    ctx.log('formador_sin_presupuesto', { clave: p.clave })
    return null
  }
  const elegibles = p.opciones.map((t, i) => ({ t, i })).filter(({ t }) => opcionPermitida(t))
  if (!elegibles.length) return null
  ctx.usoIA ??= { consultas: 0, ms: 0 }
  ctx.usoIA.consultas++
  const t0 = Date.now()
  const r = await llamar<{ indice?: number | null; motivo?: string }>(ctx, 'sugerir', {
    metodo: 'POST',
    timeoutMs: TIMEOUT_IA_MS,
    cuerpo: {
      trabajoId: ctx.trabajoId,
      compania: ctx.compania,
      ramo: ctx.ramo,
      clave: p.clave,
      tipo: 'campo',
      descripcion: limpiarTextoAviso(p.descripcion, ctx.redactar, 300) ?? '',
      estructura: elegibles.map(({ t }): Candidato => ({ tag: 'mat-option', id: null, name: null, type: null, role: 'option', clases: null, texto: null, etiqueta: limpiarTextoAviso(t, ctx.redactar, 120), marco: null })),
    },
  })
  ctx.usoIA.ms += Date.now() - t0
  const i = r?.indice
  if (typeof i !== 'number' || !Number.isInteger(i) || i < 0 || i >= elegibles.length) {
    ctx.log('formador_sin_sugerencia', { clave: p.clave, motivo: r?.motivo ?? 'sin_respuesta' })
    return null
  }
  ctx.log('formador_sugerencia_valida', { clave: p.clave })
  return elegibles[i]!.i
}

/** ¿Puede una OPCIÓN de lista ser la elegida? Sin patrón de emisión ni palabras de `BLOQUEO_FORMADOR`. PURA. */
export function opcionPermitida(texto: string | null | undefined): boolean {
  if (typeof texto !== 'string' || normalizarTexto(texto) === '') return false
  if (pareceEmision(texto)) return false
  const n = normalizarTexto(texto)
  // Por PALABRA entera (el patrón del guard, arriba, ya es el conservador por subcadena).
  const palabras = new Set(n.split(' '))
  return !BLOQUEO_FORMADOR.some((b) => palabras.has(b))
}

// ─── ATASCO (F2): checkpoint para que elija Alberto ──────────────────────────

/** Un paso posterior avanzó: el atasco anotado antes ya no es el que va a parar el trabajo. */
function avanzaPaso(ctx: ContextoFormador | undefined): void {
  if (ctx?.atasco) ctx.atasco = null
}

const CLAVE_ATASCO = /^[a-z0-9_]{1,60}$/

/**
 * ¿Puede este candidato ser la respuesta de Alberto a este paso? PURO. Lo mismo que exigirá `validarResolucion` al repetir
 * el camino (sin lo que solo se sabe con el DOM vivo: unicidad, visibilidad, etiqueta de la fila): una ACCIÓN, solo con un
 * texto de su fila de la tabla cerrada; un CAMPO, solo un control editable sin casillas. Nunca palabras de emisión/pago.
 */
export function candidatoElegibleAtasco(c: Candidato, p: Pick<PeticionResolver, 'clave' | 'tipo' | 'textoEsperado'>): boolean {
  const tag = c.tag.toLowerCase()
  const type = (c.type ?? '').toLowerCase()
  const role = (c.role ?? '').toLowerCase()
  if (bloqueoPalabras([['texto', c.texto], ['id', c.id], ['name', c.name]])) return false
  if (p.tipo === 'accion') {
    const base = baseAccion(p.clave)
    if (!base) return false
    if (base === 'elegir_opcion') return esElementoOpcion(c)
    if (tag === 'select' || tag === 'textarea' || (tag === 'input' && !(TIPOS_INPUT_BOTON as readonly string[]).includes(type))) return false
    const permitidos: readonly string[] = p.textoEsperado ? [normalizarTexto(p.textoEsperado)] : ACCIONES_PERMITIDAS[base]
    return permitidos.includes(normalizarTexto(c.texto))
  }
  if (tag === 'a' || tag === 'button' || tag === 'nx-button' || type === 'checkbox') return false
  if (role !== '' && !ROLES_EDITABLES.includes(role)) return false
  return tag === 'input' ? (TIPOS_INPUT_EDITABLES as readonly string[]).includes(type) : TAGS_EDITABLES.includes(tag) || ROLES_EDITABLES.includes(role)
}

/** Los candidatos de un atasco, con los de etiqueta más parecida a la pedida primero (orden estable). Puro. */
export function ordenarParaAtasco<T extends Candidato>(l: readonly T[], etiqueta: string | null | undefined): T[] {
  const buscadas = palabrasEtiqueta(etiqueta)
  if (!buscadas.length) return [...l]
  const puntos = (c: T) => { const f = new Set(palabrasEtiqueta(c.etiqueta)); return buscadas.filter((w) => f.has(w)).length }
  return l.map((c, i) => ({ c, i, s: puntos(c) })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.c)
}

/**
 * Prepara el checkpoint del ATASCO cuando ni el fijo, ni lo aprendido, ni la IA resolvieron `p`: los candidatos ELEGIBLES de
 * la pantalla (redactados, numerados 1..N, tope `MAX_CANDIDATOS_ATASCO`) quedan en `ctx.atasco`; el runner los manda con el
 * error y asegura deja el trabajo `atascado`. Sin formador, sin clave de slug, con el enlace de entrada (su puerta es otra) o
 * sin ningún candidato elegible → nada (el trabajo falla como antes). NO pulsa ni escribe.
 */
export async function registrarAtasco(page: Page | null, ctx: ContextoFormador | undefined, p: PeticionResolver): Promise<void> {
  if (!ctx?.activo || !page || !CLAVE_ATASCO.test(p.clave)) return
  if (p.tipo === 'accion' && !esAccionPermitida(p.clave)) return
  const todos = await extraerCandidatos(page, p.tipo, ctx.redactar, esPeticionOpcion(p))
  const elegibles = ordenarParaAtasco(todos.filter((c) => candidatoElegibleAtasco(c, p)), p.etiqueta).slice(0, MAX_CANDIDATOS_ATASCO)
  if (!elegibles.length) {
    ctx.log('atasco_sin_candidatos', { clave: p.clave })
    return
  }
  ctx.atasco = {
    clave: p.clave,
    tipo: p.tipo,
    descripcion: limpiarTextoAviso(p.descripcion, ctx.redactar, 300) ?? p.clave,
    etiqueta: p.tipo === 'campo' ? limpiarTextoAviso(p.etiqueta ?? null, ctx.redactar, 120) : null,
    textoEsperado: p.tipo === 'accion' ? (p.textoEsperado ?? null) : null,
    candidatos: elegibles.map((c, i) => ({ n: i + 1, tag: c.tag, id: c.id, name: c.name, type: c.type, role: c.role, texto: c.texto, etiqueta: c.etiqueta, marco: c.marco, selector: c.selector })),
  }
  ctx.log('atasco_preparado', { clave: p.clave, candidatos: elegibles.length })
}

// ─── Modo acompañado ─────────────────────────────────────────────────────────

export type PasoAcompanado = 'login' | 'formulario' | 'tras_calcular' | 'resultado' | 'proyecto'

/** Puntos de enganche del adaptador → paso que se revisa. */
export const PUNTOS_ENGANCHE = {
  tras_login: 'login',
  tras_rellenar: 'formulario',
  tras_calcular: 'tras_calcular',
  tras_leer_ofertas: 'resultado',
  tras_pdf: 'proyecto',
} as const satisfies Record<string, PasoAcompanado>

export const SELECTOR_AVISOS = '[role=alert], [role=alertdialog], [role=dialog], .alert, .error, .errores, .warning, .aviso, .mensaje, .modal.show, .ui-dialog, nx-message, nx-notification, nx-modal-container, .toast'

/** Textos visibles de alertas/errores/modales de TODOS los marcos, ya por el redactor y sin datos personales. */
export async function textosDeAviso(page: Page, redactar: (t: string) => string): Promise<string[]> {
  const out = new Set<string>()
  for (const f of page.frames()) {
    if (f.isDetached()) continue
    const textos = await f
      .evaluate((sel) => {
        return Array.from(document.querySelectorAll(sel))
          .filter((el) => (el as HTMLElement).getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden')
          .map((el) => ((el as HTMLElement).innerText || '').slice(0, 600))
          .slice(0, 30)
      }, SELECTOR_AVISOS)
      .catch(() => [] as string[])
    for (const t of textos) {
      const l = limpiarTextoAviso(t, redactar)
      if (l) out.add(l)
    }
  }
  return [...out].slice(0, 30)
}

export type AvisoInterpretado = { texto: string; interpretacion: string; bloqueante: boolean }
export type RevisionPaso = { revisadoPorIA: boolean; enPantallaEsperada: boolean | null; avisos: AvisoInterpretado[]; sugerencias: string[]; incidencias: IncidenciaPrecio[] }

/** Mensaje para Alberto (no el error técnico) a partir de lo bloqueante de una revisión. `null` si nada bloquea. */
export function mensajeBloqueo(compania: string, paso: PasoAcompanado, r: RevisionPaso): string | null {
  const partes: string[] = []
  for (const a of r.avisos) if (a.bloqueante === true) partes.push(`el portal de ${compania} avisa «${a.texto}»: ${a.interpretacion}`)
  for (const i of r.incidencias) if (i.bloqueante === true) partes.push(i.mensaje)
  return partes.length ? `Cotización detenida en el paso «${paso}»: ${partes.join(' · ')}`.slice(0, 1500) : null
}

/**
 * Si el modo acompañado está activo, enseña el paso a asegura (estructura de campos y acciones SIN
 * valores + avisos redactados [+ importes leídos en `resultado`]). Lo bloqueante (de la IA o de la
 * regla determinista de precio) → `ErrorTarificador('portal', <explicación legible>)`. Si el endpoint
 * falla, `null` y se sigue: el acompañante nunca tumba una cotización por ruido. NO pulsa nada.
 */
export async function acompanar(
  page: Page,
  ctx: ContextoFormador | undefined,
  paso: PasoAcompanado,
  opciones: { pantallaEsperada: string; valoresLeidos?: ValoresLeidos | null; modalidadPedida?: ModalidadPortal | null },
): Promise<RevisionPaso | null> {
  if (!ctx?.activo || !ctx.acompanado) return null
  const [acciones, campos, textosAviso] = await Promise.all([
    extraerCandidatos(page, 'accion', ctx.redactar),
    extraerCandidatos(page, 'campo', ctx.redactar),
    textosDeAviso(page, ctx.redactar),
  ])
  const estructura = [...acciones, ...campos].slice(0, MAX_CANDIDATOS).map(sinSelector)
  const r = await llamar<RevisionPaso>(ctx, 'revisar-paso', {
    metodo: 'POST',
    timeoutMs: TIMEOUT_IA_MS,
    cuerpo: {
      trabajoId: ctx.trabajoId,
      compania: ctx.compania,
      ramo: ctx.ramo,
      paso,
      pantallaEsperada: opciones.pantallaEsperada,
      estructura,
      textosAviso,
      valoresLeidos: opciones.valoresLeidos ?? null,
      modalidadPedida: opciones.modalidadPedida ?? null,
    },
  })
  if (!r || !Array.isArray(r.avisos) || !Array.isArray(r.incidencias)) {
    ctx.log('acompanar_sin_respuesta', { paso })
    return null
  }
  const bloqueo = mensajeBloqueo(ctx.compania, paso, r)
  ctx.log('acompanar', { paso, revisadoPorIA: r.revisadoPorIA, avisos: r.avisos.length, incidencias: r.incidencias.length, bloquea: bloqueo !== null })
  if (bloqueo) throw new ErrorTarificador('portal', bloqueo)
  return r
}

/** Para el contador del modo acompañado. Lo llama el runner ANTES de mandar el resultado. Nunca lanza. */
export async function cerrarFormador(ctx: ContextoFormador | undefined, resultado: 'ok' | 'error'): Promise<void> {
  if (!ctx?.activo) return
  // F2: lo aprendido que falló en este trabajo (asegura le suma un fallo; un asegura anterior ignora el campo).
  const fallidos = aprendidoFallido(ctx.usosAprendido, resultado)
  await llamar(ctx, 'cierre', { metodo: 'POST', timeoutMs: TIMEOUT_CORTO_MS, cuerpo: { trabajoId: ctx.trabajoId, resultado, ...(fallidos.length ? { aprendidoFallido: fallidos } : {}) } })
}
