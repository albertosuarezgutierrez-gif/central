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
import { limpiarTextoAviso, pareceEmision, type IncidenciaPrecio, type ModalidadPortal, type ValoresLeidos } from '@central/module-tarificacion'
import { ErrorTarificador } from './errores.ts'
import { rutaMarco } from './evidencia.ts'

// ─── Listas CERRADAS ─────────────────────────────────────────────────────────

/** Palabras que NUNCA pueden estar en un control que el formador devuelva (además de `pareceEmision`). */
export const BLOQUEO_FORMADOR = ['emitir', 'emision', 'contratar', 'contratacion', 'formalizar', 'formalizacion', 'suplemento', 'anular', 'baja', 'archivar', 'grabar', 'firmar', 'pagar'] as const

/** Acciones que el formador puede resolver, con los ÚNICOS textos (normalizados) admitidos para cada una. */
export const ACCIONES_PERMITIDAS = {
  calcular: ['calcular', 'calcular prima', 'recalcular'],
  nueva_alta: ['nueva alta'],
  pestana_datos_basicos: ['datos basicos'],
  pestana_tarificar: ['tarificar'],
  pestana_proyecto: ['proyecto'],
  desplegar_menu: ['menu', 'mas opciones', 'desplegar'],
} as const satisfies Record<string, readonly string[]>

export type AccionPermitida = keyof typeof ACCIONES_PERMITIDAS
export type TipoClave = 'campo' | 'accion'

export function esAccionPermitida(clave: string): clave is AccionPermitida {
  return Object.prototype.hasOwnProperty.call(ACCIONES_PERMITIDAS, clave)
}

/** Tipos de `<input>` que se consideran control EDITABLE para un campo (lista blanca). */
export const TIPOS_INPUT_EDITABLES = ['', 'text', 'number', 'date', 'datetime-local', 'month', 'email', 'tel', 'search', 'checkbox'] as const
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
  formaction: string | null
  deshabilitado: boolean
  editableContenido: boolean
}

export type Validacion = { ok: true } | { ok: false; motivo: string }

function exigirUnicoVisible(d: DescripcionElemento): Validacion | null {
  if (d.coincidencias !== 1) return { ok: false, motivo: `resuelve a ${d.coincidencias} elementos (se exige exactamente 1)` }
  if (!d.visible) return { ok: false, motivo: 'no es visible' }
  if (d.deshabilitado) return { ok: false, motivo: 'está deshabilitado' }
  return null
}

export function validarAccion(d: DescripcionElemento, clave: string, textoEsperado?: string | null): Validacion {
  if (!esAccionPermitida(clave)) return { ok: false, motivo: `acción «${clave}» fuera de la lista cerrada` }
  const permitidos: readonly string[] = ACCIONES_PERMITIDAS[clave]
  if (textoEsperado !== undefined && textoEsperado !== null && !permitidos.includes(normalizarTexto(textoEsperado))) {
    return { ok: false, motivo: `texto esperado «${textoEsperado}» no está en la tabla de «${clave}»` }
  }
  const u = exigirUnicoVisible(d)
  if (u) return u
  const tag = d.tag.toLowerCase()
  const type = (d.type ?? '').toLowerCase()
  if (tag === 'select' || tag === 'textarea' || (tag === 'input' && !(TIPOS_INPUT_BOTON as readonly string[]).includes(type))) {
    return { ok: false, motivo: `<${tag}${type ? ` type=${type}` : ''}> no es un control de acción` }
  }
  const descripciones = [d.texto, d.valorBoton, d.title, d.ariaLabel, d.id, d.name, d.href, d.onclick, d.formaction]
  for (const x of descripciones) {
    if (pareceEmision(x)) return { ok: false, motivo: `casa con el patrón de emisión: «${String(x).slice(0, 80)}»` }
    const n = normalizarTexto(x)
    const prohibida = BLOQUEO_FORMADOR.find((p) => n.includes(p))
    if (prohibida) return { ok: false, motivo: `contiene una palabra bloqueada («${prohibida}»)` }
  }
  const objetivo = textoEsperado ? [normalizarTexto(textoEsperado)] : permitidos
  const visibles = [d.texto, d.valorBoton, d.title, d.ariaLabel].map(normalizarTexto).filter(Boolean)
  if (!visibles.some((v) => objetivo.includes(v))) return { ok: false, motivo: `su texto («${visibles[0] ?? ''}») no es el de «${clave}»` }
  return { ok: true }
}

export function validarCampo(d: DescripcionElemento): Validacion {
  const u = exigirUnicoVisible(d)
  if (u) return u
  const tag = d.tag.toLowerCase()
  const type = (d.type ?? '').toLowerCase()
  if (tag === 'a' || tag === 'button' || tag === 'nx-button') return { ok: false, motivo: `<${tag}> no es un campo editable` }
  if (tag === 'input') {
    return (TIPOS_INPUT_EDITABLES as readonly string[]).includes(type) ? { ok: true } : { ok: false, motivo: `<input type=${type}> no es un campo editable` }
  }
  if (TAGS_EDITABLES.includes(tag)) return { ok: true }
  if (d.role && ROLES_EDITABLES.includes(d.role.toLowerCase())) return { ok: true }
  if (d.editableContenido) return { ok: true }
  return { ok: false, motivo: `<${tag}> no es un campo editable` }
}

export function validarResolucion(tipo: TipoClave, clave: string, d: DescripcionElemento, textoEsperado?: string | null): Validacion {
  return tipo === 'accion' ? validarAccion(d, clave, textoEsperado) : validarCampo(d)
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
  const textoAccion = tipo === 'accion' ? recorta(raw.texto, 80) ?? (esBotonInput ? recorta(raw.valorBoton, 80) : null) : null
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
    selector,
  }
}

export function sinSelector(c: CandidatoLocal): Candidato {
  const { selector: _s, ...resto } = c
  return resto
}

export const SELECTOR_ACCIONES = 'a, button, input[type=button], input[type=submit], input[type=image], [onclick], [role=button], [role=tab], [role=menuitem], nx-button'
export const SELECTOR_CAMPOS = 'input:not([type=hidden]):not([type=password]):not([type=radio]), select, textarea, nx-dropdown, nx-datefield, [role=combobox], [role=textbox], [role=spinbutton], [contenteditable=true]'
export const MAX_CANDIDATOS = 400

/** Ruta legible del marco: «principal» o la de `rutaMarco` (nombres de iframe). */
export function nombreMarco(page: Page, f: Frame): string {
  return f === page.mainFrame() ? 'principal' : rutaMarco(f)
}

/** Recorre TODOS los marcos vivos y devuelve los candidatos visibles del tipo pedido (tope `MAX_CANDIDATOS`). */
export async function extraerCandidatos(page: Page, tipo: TipoClave, redactar: (t: string) => string = (t) => t): Promise<CandidatoLocal[]> {
  const out: CandidatoLocal[] = []
  for (const f of page.frames()) {
    if (f.isDetached() || out.length >= MAX_CANDIDATOS) continue
    const marco = nombreMarco(page, f)
    const crudos = await f
      .evaluate(
        ({ sel, esAccion, tope }) => {
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
              texto: esAccion && tag !== 'input' ? (h.innerText || h.textContent || '').slice(0, 200) : null,
              valorBoton: esAccion && esBoton ? h.getAttribute('value') : null,
              etiqueta: etiquetaDe(el),
              selector,
            })
          }
          return res
        },
        { sel: tipo === 'accion' ? SELECTOR_ACCIONES : SELECTOR_CAMPOS, esAccion: tipo === 'accion', tope: MAX_CANDIDATOS - out.length },
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
    .evaluate((el) => {
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
        formaction: h.getAttribute('formaction'),
        deshabilitado: h.disabled === true || h.getAttribute('aria-disabled') === 'true',
        editableContenido: h.isContentEditable === true,
      }
    })
    .catch(() => null)
  return d ? { ...d, coincidencias: total, visible } : null
}

// ─── Contexto y llamadas a asegura ───────────────────────────────────────────

export type EntradaConocimiento = { clave: string; tipo: TipoClave; selector: string; marco: string | null; origen: string; confirmaciones: number }

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
  redactar: (t: string) => string
  log: (m: string, datos?: Record<string, unknown>) => void
  fetchImpl?: typeof fetch
}

const TIMEOUT_CORTO_MS = 8_000
/** La IA puede tardar: el endpoint corta a 20 s. */
const TIMEOUT_IA_MS = 25_000

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
}

async function validarSelector(page: Page, p: PeticionResolver, selector: string, marco: string | null): Promise<{ locator: Locator } | { motivo: string }> {
  const { locator, total } = await localizar(page, selector, marco)
  if (!locator) return { motivo: 'no resuelve a ningún elemento' }
  const d = await describirElemento(locator, total)
  if (!d) return { motivo: 'no se pudo describir el elemento' }
  const v = validarResolucion(p.tipo, p.clave, d, p.textoEsperado)
  return v.ok ? { locator: locator.first() } : { motivo: v.motivo }
}

/**
 * FALLBACK del adaptador. Devuelve un Locator VALIDADO o `null` (y el adaptador falla como antes).
 * Una acción fuera de `ACCIONES_PERMITIDAS` ni se intenta. No pulsa: quien llama usa `ctx.pulsar()`.
 */
export async function resolverConFormador(page: Page, ctx: ContextoFormador | undefined, p: PeticionResolver): Promise<ResolucionFormador | null> {
  if (!ctx?.activo) return null
  if (p.tipo === 'accion' && !esAccionPermitida(p.clave)) {
    ctx.log('formador_accion_no_permitida', { clave: p.clave })
    return null
  }
  const confirmarCon = (selector: string, marco: string | null, origen: 'ia' | 'codigo') => async () => {
    await llamar(ctx, 'confirmar', {
      metodo: 'POST',
      timeoutMs: TIMEOUT_CORTO_MS,
      cuerpo: { trabajoId: ctx.trabajoId, compania: ctx.compania, ramo: ctx.ramo, clave: p.clave, tipo: p.tipo, selector, marco, origen },
    })
  }

  // 1º Lo aprendido (más confirmado primero).
  const previos = ctx.conocimiento.filter((c) => c.clave === p.clave && c.tipo === p.tipo).sort((a, b) => b.confirmaciones - a.confirmaciones)
  for (const c of previos) {
    const v = await validarSelector(page, p, c.selector, c.marco)
    if ('locator' in v) {
      ctx.log('formador_conocimiento', { clave: p.clave })
      return { locator: v.locator, selector: c.selector, marco: c.marco, origen: 'conocimiento', confirmar: confirmarCon(c.selector, c.marco, c.origen === 'ia' ? 'ia' : 'codigo') }
    }
  }

  // 2º La IA señala; aquí se valida.
  const candidatos = await extraerCandidatos(page, p.tipo, ctx.redactar)
  if (!candidatos.length) return null
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
  const i = r?.indice
  if (typeof i !== 'number' || !Number.isInteger(i) || i < 0 || i >= candidatos.length) {
    ctx.log('formador_sin_sugerencia', { clave: p.clave, motivo: r?.motivo ?? 'sin_respuesta' })
    return null
  }
  const elegido = candidatos[i]
  const v = await validarSelector(page, p, elegido.selector, elegido.marco)
  if (!('locator' in v)) {
    ctx.log('formador_sugerencia_rechazada', { clave: p.clave, motivo: v.motivo })
    return null
  }
  ctx.log('formador_sugerencia_valida', { clave: p.clave })
  return { locator: v.locator, selector: elegido.selector, marco: elegido.marco, origen: 'ia', confirmar: confirmarCon(elegido.selector, elegido.marco, 'ia') }
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
  await llamar(ctx, 'cierre', { metodo: 'POST', timeoutMs: TIMEOUT_CORTO_MS, cuerpo: { trabajoId: ctx.trabajoId, resultado } })
}
