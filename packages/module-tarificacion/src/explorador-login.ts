// LOGIN ASISTIDO del explorador IA (14/10/2026) — núcleo PURO. Primer uso: SSO de Occident (`ssoaut.gco.global`), cuya
// 2.ª pantalla tiene DOS variantes sin DOM grabado (elegir un usuario de una lista + contraseña, o usuario + contraseña).
//
// Reglas (Alberto + revisión, 14/10/2026; nada de esto se relaja sin él):
//   · SOLO para las compañías de `LOGIN_ASISTIDO` (lista CERRADA; hoy solo `occident`) y SOLO con la pantalla en https y
//     en el host EXACTO de su SSO. Fuera de ahí la fase no existe (validador, worker y asegura lo comprueban).
//   · La IA NUNCA ve ni escribe un valor de credencial: solo dos CLAVES (`credencial.usuario`, `credencial.contrasena`).
//     El worker las sustituye por el valor LOCAL justo antes de escribir; `credencial.contrasena` solo en input[type=password].
//   · Lo que sale hacia asegura/IA es el inventario saneado (sin `value`), con el usuario MARCADO (`marcarCredencialesInventario`:
//     su texto se sustituye por la clave, así la IA reconoce «su» fila en una lista sin ver el valor) y la contraseña quitada.
//   · Avanzar: solo un botón de SUBMIT del propio SSO (el worker repite vivo que el formulario va al mismo origen).
//   · OTP/CAPTCHA → parar con su motivo. Nunca se inventa un código.
// Las claves `credencial.*` NO están en ningún catálogo de ramo: el validador normal (`validarRespuestaExplorador`) las rechaza.

import { pareceEmision } from './guard-emision.ts'
import { clasificarAccionPortal } from './acciones-portal.ts'
import { MARCA_REDACTADO } from './redactar.ts'
import { pareceDatoPersonalInventario, redactarValoresInventario, type ElementoInventario, type InventarioDom, type MarcoInventario } from './inventario-dom.ts'
import {
  ENTRADAS_EXPLORACION,
  TIPOS_PANTALLA,
  descripcionesElemento,
  esEntradaExploracion,
  indiceRefs,
  normalizarMotivoParar,
  primerObjetoJsonExplorador,
  recortarMotivo,
  type MotivoParar,
  type RespuestaExplorador,
} from './explorador.ts'

/** Compañías con login asistido y el host EXACTO de su SSO (https). Lista CERRADA: añadir una = decisión de Alberto. */
export const LOGIN_ASISTIDO: Readonly<Record<string, Readonly<{ hostSso: string }>>> = Object.freeze({
  occident: Object.freeze({ hostSso: 'ssoaut.gco.global' }),
})

/** Pantallas del SSO que la IA puede resolver tras el paso determinista (las dos variantes caben con margen). */
export const MAX_PANTALLAS_LOGIN = 4
/** Acciones por pantalla de login (usuario + contraseña + avance, con margen). */
export const MAX_ACCIONES_LOGIN = 6

export const CLAVE_USUARIO = 'credencial.usuario'
export const CLAVE_CONTRASENA = 'credencial.contrasena'
export const CLAVES_CREDENCIAL: readonly string[] = Object.freeze([CLAVE_USUARIO, CLAVE_CONTRASENA])
export type ClaveCredencial = typeof CLAVE_USUARIO | typeof CLAVE_CONTRASENA

/** Lo que la IA ve del «catálogo» de la fase de login: dos claves y qué son. Sin valores, nunca. */
export function catalogoLoginParaIA(): { clave: string; descripcion: string }[] {
  return [
    { clave: CLAVE_USUARIO, descripcion: 'El usuario de acceso del robot. En el inventario, donde el portal ENSEÑA ese usuario (p. ej. una fila de una lista de usuarios), su texto aparece sustituido por esta misma clave.' },
    { clave: CLAVE_CONTRASENA, descripcion: 'La contraseña del robot. Solo en un campo de tipo password.' },
  ]
}

/** El login asistido de la compañía de esta entrada, o `null` (entrada desconocida o compañía sin login asistido). */
export function loginAsistidoDe(entrada: string): Readonly<{ compania: string; hostSso: string }> | null {
  if (!esEntradaExploracion(entrada)) return null
  const compania = ENTRADAS_EXPLORACION[entrada].compania
  return Object.hasOwn(LOGIN_ASISTIDO, compania) ? { compania, hostSso: LOGIN_ASISTIDO[compania].hostSso } : null
}

/** ¿La URL es el SSO de esa compañía? https y host EXACTO (ni subdominios, ni otro puerto, ni credenciales en la URL). */
export function esUrlSsoLoginAsistido(compania: string, url: string | null | undefined): boolean {
  if (!Object.hasOwn(LOGIN_ASISTIDO, compania) || typeof url !== 'string') return false
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && u.hostname === LOGIN_ASISTIDO[compania].hostSso && u.port === '' && !u.username && !u.password
  } catch {
    return false
  }
}

// ─── Marcado del usuario y retirada de la contraseña ─────────────────────────

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** Lo que NO puede ir pegado al usuario para contar como «el usuario» (letras, cifras y . _ @ -): «ana» ≠ «ana.lopez». */
const BORDE = String.raw`[\p{L}\p{N}._@-]`

/** El texto con cada aparición DELIMITADA del usuario (sin mayúsculas) sustituida por la clave. Pura. */
export function marcarUsuarioEnTexto(texto: string, usuario: string): string {
  const u = usuario.trim()
  if (!u) return texto
  return texto.replace(new RegExp(`(^|(?!${BORDE}).)${escapar(u)}(?!${BORDE})`, 'giu'), (_m, pre: string) => `${pre}${CLAVE_USUARIO}`)
}

/** ¿Queda el usuario (delimitado) en el texto? */
export function contieneUsuario(texto: string, usuario: string): boolean {
  return marcarUsuarioEnTexto(texto, usuario) !== texto
}

const CAMPOS_TEXTO_ELEMENTO = ['id', 'name', 'ariaLabel', 'placeholder', 'formControlName', 'etiqueta', 'texto', 'onclick', 'dialogo'] as const

/**
 * El inventario que SALE en la fase de login: el usuario marcado con su clave (texto de elementos, opciones, títulos y
 * marcos) y CUALQUIER texto que contenga la contraseña, fuera (`redactarValoresInventario`). Pura; no muta la entrada.
 * Quien lo envía comprueba además `inventarioSinCredenciales` (última red: si algo quedara, no se envía).
 */
export function marcarCredencialesInventario(inv: InventarioDom, cred: { usuario: string; contrasena: string }): InventarioDom {
  const sinClave = redactarValoresInventario(inv, [cred.contrasena])
  const m = (t: string) => marcarUsuarioEnTexto(t, cred.usuario)
  const marcos = sinClave.marcos.map((mo): MarcoInventario => {
    const elementos = mo.elementos.map((e) => {
      const el: ElementoInventario = { ...e }
      for (const k of CAMPOS_TEXTO_ELEMENTO) if (typeof el[k] === 'string') el[k] = m(el[k] as string)
      if (el.opciones) el.opciones = el.opciones.map((o) => ({ valor: o.valor === null ? null : m(o.valor), texto: o.texto === null ? null : m(o.texto) }))
      return el
    })
    const out: MarcoInventario = { ...mo, url: m(mo.url), nombre: mo.nombre === null ? null : m(mo.nombre), elementos }
    if (mo.titulos) out.titulos = mo.titulos.map(m)
    if (mo.titulosPantalla) out.titulosPantalla = mo.titulosPantalla.map(m)
    if (mo.importes) out.importes = mo.importes.map((i) => (i.etiqueta === undefined ? i : { ...i, etiqueta: m(i.etiqueta) }))
    return out
  })
  return { ...sinClave, marcos }
}

/**
 * Última red antes de mandar nada: ni la contraseña (literal, ni escapada en JSON) ni el usuario DELIMITADO pueden aparecer
 * en lo serializado. `false` = no se envía. Pura.
 */
export function inventarioSinCredenciales(inv: unknown, cred: { usuario: string; contrasena: string }): boolean {
  const crudo = JSON.stringify(inv) ?? ''
  // SIN delimitar y sin mayúsculas (revisión 14/10/2026): «x.usuario», «usuario@…», «usuario_2» también cuentan como fuga.
  // La clave marcada se quita antes (un usuario que fuera «usuario» casaría con ella).
  const s = crudo.split(CLAVE_USUARIO).join(' ').toLowerCase()
  const formas = (v: string) => {
    const t = v.trim()
    const enc = encodeURIComponent(t)
    return [...new Set([t, JSON.stringify(t).slice(1, -1), enc, enc.replace(/%20/g, '+')].map((x) => x.toLowerCase()).filter(Boolean))]
  }
  for (const v of [cred.contrasena, cred.usuario]) {
    if (!v || !v.trim()) continue
    if (formas(v).some((f) => s.includes(f))) return false
    // Recortado por el saneado («…»): un prefijo ≥4 del valor justo antes de la elipsis también es fuga.
    const lv = v.trim().toLowerCase()
    for (let i = s.indexOf('…'); i >= 0; i = s.indexOf('…', i + 1)) {
      const antes = s.slice(Math.max(0, i - lv.length), i)
      for (let k = 4; k < lv.length; k++) if (antes.endsWith(lv.slice(0, k))) return false
    }
  }
  return true
}

// ─── Respuesta de la IA en la fase de login ──────────────────────────────────

export type AccionLogin =
  | { accion: 'rellenar'; ref: string; dato: ClaveCredencial }
  /** Elegir el usuario PROPIO de una lista (select, radio o fila pulsable): el worker lo casa en LOCAL con su usuario. */
  | { accion: 'elegir'; ref: string; dato: typeof CLAVE_USUARIO }
  | { accion: 'avanzar'; ref: string; efectoEsperado: 'siguiente_pantalla'; confianza: 'alta' | 'media' }
  | { accion: 'parar'; motivo: MotivoParar }

/**
 * Respuesta VALIDADA de la fase de login. `fase: 'login'` la distingue en BD: el validador normal la rechaza (clave
 * desconocida), así que un paso de login nunca entra en las pantallas del mapa ni en su memoria. `mapeo` siempre vacío.
 */
export type RespuestaLogin = {
  version: 1
  fase: 'login'
  pantalla: RespuestaExplorador['pantalla']
  acciones: AccionLogin[]
  mapeo: []
  motivo: string | null
}

export type ValidacionLogin = { ok: true; respuesta: RespuestaLogin } | { ok: false; errores: string[] }

const obj = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
const limpio = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()
const tipoDe = (el: ElementoInventario) => (el.type ?? '').toLowerCase()
const TIPOS_USUARIO = new Set(['', 'text', 'email'])
/** Elementos que pueden ser la FILA de un usuario en una lista (además de un <select> o un radio). */
const ROLES_FILA = new Set(['button', 'option', 'radio', 'link', 'menuitem', 'tab'])

/** ¿El elemento enseña la clave del usuario (y solo como token delimitado)? */
function muestraUsuario(el: ElementoInventario): boolean {
  const re = new RegExp(`(^|(?!${BORDE}).)${escapar(CLAVE_USUARIO)}(?!${BORDE})`, 'u')
  return [el.texto, el.etiqueta, el.ariaLabel].some((t) => typeof t === 'string' && re.test(t))
}

/**
 * Fila de usuario que se puede PULSAR sin enviar el formulario: un radio, un <button type="button">, un enlace, celda,
 * etiqueta o elemento con rol. NUNCA un submit (un <button> sin type o `type=submit` ENVÍA el formulario: doble envío o
 * envío con la contraseña vacía → bloqueo de cuenta). Si la fila solo es pulsable como submit, el validador la rechaza.
 */
function esFilaUsuario(el: ElementoInventario): boolean {
  if (el.tag === 'input') return tipoDe(el) === 'radio'
  if (el.tag === 'button') return tipoDe(el) === 'button'
  if (['a', 'td', 'label', 'li'].includes(el.tag)) return true
  return ROLES_FILA.has((el.role ?? '').toLowerCase())
}

function esSubmit(el: ElementoInventario): boolean {
  if (el.tag === 'button') return ['', 'submit'].includes(tipoDe(el))
  return el.tag === 'input' && tipoDe(el) === 'submit'
}

/**
 * Valida la respuesta de la IA para UNA pantalla de login de `entrada`. Fail-closed: entrada sin login asistido, marco fuera
 * del SSO, clave que no es de credencial, contraseña fuera de un password, avance que no es un submit del SSO, `terminar`,
 * cualquier clave desconocida… → `{ ok: false }` (quien llama PARA). Pura.
 */
export function validarRespuestaLogin(entrada: unknown, ctx: { inventario: InventarioDom; entrada: string }): ValidacionLogin {
  const la = loginAsistidoDe(ctx.entrada)
  if (!la) return { ok: false, errores: ['login asistido no autorizado para esta entrada'] }
  const errores: string[] = []
  const r = typeof entrada === 'string' ? primerObjetoJsonExplorador(entrada) : obj(entrada)
  if (!r) return { ok: false, errores: ['la respuesta no es un objeto JSON'] }
  for (const k of Object.keys(r)) if (!['version', 'fase', 'pantalla', 'acciones', 'mapeo', 'motivo'].includes(k)) errores.push(`clave desconocida «${k.slice(0, 30)}»`)
  if (r.version !== 1) errores.push('version tiene que ser 1')
  if (r.fase !== undefined && r.fase !== 'login') errores.push('fase tiene que ser «login»')
  if (r.mapeo !== undefined && !(Array.isArray(r.mapeo) && r.mapeo.length === 0)) errores.push('mapeo tiene que ir vacío en el login')

  const p = obj(r.pantalla)
  let pantalla: RespuestaLogin['pantalla'] = { nombre: null, tipo: 'otro' }
  if (!p) errores.push('falta pantalla')
  else {
    for (const k of Object.keys(p)) if (!['nombre', 'tipo'].includes(k)) errores.push(`pantalla.${k.slice(0, 30)} no se admite`)
    const tipo = TIPOS_PANTALLA.find((t) => t === p.tipo)
    if (!tipo) errores.push('pantalla.tipo fuera de lista')
    const nombre = typeof p.nombre === 'string' ? limpio(p.nombre).slice(0, 60) || null : null
    if (p.nombre !== undefined && p.nombre !== null && typeof p.nombre !== 'string') errores.push('pantalla.nombre tiene que ser texto')
    if (nombre && pareceDatoPersonalInventario(nombre)) errores.push('pantalla.nombre tiene forma de dato personal')
    pantalla = { nombre, tipo: tipo ?? 'otro' }
  }
  let motivo: string | null = null
  if (r.motivo !== undefined && r.motivo !== null) {
    if (typeof r.motivo !== 'string') errores.push('motivo tiene que ser texto')
    else if (pareceDatoPersonalInventario(r.motivo)) errores.push('motivo tiene forma de dato personal')
    else motivo = recortarMotivo(limpio(r.motivo) || null)
  }

  const refs = indiceRefs(ctx.inventario)
  const acciones: AccionLogin[] = []
  const lista = Array.isArray(r.acciones) ? (r.acciones as unknown[]) : null
  if (!lista || lista.length === 0) errores.push('acciones tiene que ser una lista no vacía')
  else if (lista.length > MAX_ACCIONES_LOGIN) errores.push(`más de ${MAX_ACCIONES_LOGIN} acciones`)
  else {
    const tocados = new Set<string>()
    const claves = new Set<string>()
    lista.forEach((a0, i) => {
      const a = obj(a0)
      const donde = `acciones[${i}]`
      if (!a) return void errores.push(`${donde} no es un objeto`)
      const permitidas: Record<string, string[]> = {
        rellenar: ['accion', 'ref', 'dato'], elegir: ['accion', 'ref', 'dato'], avanzar: ['accion', 'ref', 'efectoEsperado', 'confianza'], parar: ['accion', 'motivo'],
      }
      const tipo = typeof a.accion === 'string' && Object.hasOwn(permitidas, a.accion) ? a.accion : null
      if (!tipo) return void errores.push(`${donde}: acción fuera de la lista del login`)
      for (const k of Object.keys(a)) if (!permitidas[tipo].includes(k)) errores.push(`${donde}: clave «${k.slice(0, 30)}» no se admite en ${tipo}`)
      if (tipo === 'parar') {
        if (lista.length !== 1) errores.push(`${donde}: parar va SOLO`)
        const m = normalizarMotivoParar(a.motivo)
        if (!m) return void errores.push(`${donde}: motivo de parada fuera de lista`)
        acciones.push({ accion: 'parar', motivo: m })
        return
      }
      const ref = typeof a.ref === 'string' ? a.ref : ''
      const hit = refs.get(ref)
      if (!hit) return void errores.push(`${donde}: ref «${ref.slice(0, 20)}» no existe en el inventario`)
      const { el, marco } = hit
      if (!esUrlSsoLoginAsistido(la.compania, marco.url)) return void errores.push(`${donde}: el elemento no está en el SSO (https://${la.hostSso})`)
      if (el.deshabilitado) return void errores.push(`${donde}: el elemento está deshabilitado`)
      if (tocados.has(ref)) return void errores.push(`${donde}: ref repetida`)
      tocados.add(ref)
      if (tipo === 'rellenar') {
        const dato = a.dato
        if (dato !== CLAVE_USUARIO && dato !== CLAVE_CONTRASENA) return void errores.push(`${donde}: dato fuera de las claves del login`)
        if (claves.has(dato)) return void errores.push(`${donde}: ${dato} una sola vez por pantalla`)
        claves.add(dato)
        if (el.tag !== 'input') return void errores.push(`${donde}: rellenar solo en input`)
        if (dato === CLAVE_CONTRASENA && tipoDe(el) !== 'password') return void errores.push(`${donde}: la contraseña solo en un input de tipo password`)
        if (dato === CLAVE_USUARIO && !TIPOS_USUARIO.has(tipoDe(el))) return void errores.push(`${donde}: el usuario solo en un input de texto/email`)
        acciones.push({ accion: 'rellenar', ref, dato })
      } else if (tipo === 'elegir') {
        if (a.dato !== CLAVE_USUARIO) return void errores.push(`${donde}: elegir solo el usuario propio (${CLAVE_USUARIO})`)
        if (claves.has(CLAVE_USUARIO)) return void errores.push(`${donde}: ${CLAVE_USUARIO} una sola vez por pantalla`)
        claves.add(CLAVE_USUARIO)
        if (el.tag === 'select') {
          if (!(el.opciones ?? []).some((o) => o.valor === CLAVE_USUARIO || limpio(o.texto) === CLAVE_USUARIO || (o.texto !== null && new RegExp(`(^|(?!${BORDE}).)${escapar(CLAVE_USUARIO)}(?!${BORDE})`, 'u').test(o.texto)))) {
            return void errores.push(`${donde}: el desplegable no tiene la opción del usuario propio`)
          }
        } else if (!esFilaUsuario(el) || !muestraUsuario(el)) {
          return void errores.push(`${donde}: elegir solo un <select>, radio o fila que ENSEÑE ${CLAVE_USUARIO}`)
        }
        if (descripcionesElemento(el).some((d) => pareceEmision(d) || clasificarAccionPortal([d]).emision || clasificarAccionPortal([d]).prohibida)) return void errores.push(`${donde}: control prohibido`)
        acciones.push({ accion: 'elegir', ref, dato: CLAVE_USUARIO })
      } else {
        if (i !== lista.length - 1) return void errores.push(`${donde}: avanzar va el ÚLTIMO (y solo uno)`)
        if (!esSubmit(el)) return void errores.push(`${donde}: en el login solo se avanza con un botón de envío (submit)`)
        if (a.efectoEsperado !== 'siguiente_pantalla') return void errores.push(`${donde}: efectoEsperado tiene que ser siguiente_pantalla`)
        if (a.confianza !== 'alta' && a.confianza !== 'media') return void errores.push(`${donde}: avanzar exige confianza alta o media`)
        const desc = descripcionesElemento(el)
        if (![el.texto, el.ariaLabel].some((d) => typeof d === 'string' && d.trim() !== '' && !d.endsWith('…')) && !el.id) return void errores.push(`${donde}: sin descripción completa`)
        const cat = clasificarAccionPortal(desc)
        if (desc.some((d) => pareceEmision(d)) || cat.emision || cat.prohibida || cat.guardar) return void errores.push(`${donde}: botón prohibido`)
        acciones.push({ accion: 'avanzar', ref, efectoEsperado: 'siguiente_pantalla', confianza: a.confianza })
      }
    })
  }
  if (errores.length) return { ok: false, errores: errores.slice(0, 20) }
  return { ok: true, respuesta: { version: 1, fase: 'login', pantalla, acciones, mapeo: [], motivo } }
}

/** `parar` de la fase de login (con la marca de fase, para que en BD se distinga de una pantalla del portal). */
export function respuestaPararLogin(motivo: MotivoParar, detalle: string | null = null): RespuestaLogin {
  return { version: 1, fase: 'login', pantalla: { nombre: null, tipo: 'otro' }, acciones: [{ accion: 'parar', motivo }], mapeo: [], motivo: detalle ? detalle.slice(0, 200) : null }
}

/** ¿Es (en BD) la respuesta de un paso de la fase de login? */
export function esRespuestaLogin(v: unknown): boolean {
  return obj(v)?.fase === 'login'
}

/**
 * EVIDENCIA para el mapa (el HTML de una exploración no se guarda como documento): los elementos de una pantalla de login,
 * SIN valores (el inventario no los lleva; el usuario ya va marcado). Una línea para `mapa.huecos`, acotada. Pura.
 */
export function resumenLoginParaMapa(n: number, inv: InventarioDom, maxElementos = 25): string {
  const partes: string[] = []
  for (const m of inv.marcos) {
    for (const el of m.elementos) {
      if (partes.length >= maxElementos) break
      const tipo = el.type ? `[type=${tipoDe(el)}]` : ''
      const id = el.id ? `#${el.id}` : ''
      const nombre = el.name ? `[name=${el.name}]` : ''
      const etq = limpio(el.etiqueta ?? el.ariaLabel ?? el.texto ?? el.placeholder ?? '').slice(0, 40)
      partes.push(`${el.tag}${tipo}${id}${nombre}${etq ? ` «${etq}»` : ''}${el.deshabilitado ? ' (deshabilitado)' : ''}`)
    }
  }
  const titulos = inv.marcos.flatMap((m) => m.titulos ?? []).slice(0, 3).map((t) => limpio(t).slice(0, 40))
  const linea = `login asistido, pantalla ${n}${titulos.length ? ` («${titulos.join(' / ')}»)` : ''}: ${partes.join('; ') || '(sin elementos)'}`
  return linea.replace(new RegExp(escapar(MARCA_REDACTADO), 'g'), '[…]').slice(0, 900)
}
