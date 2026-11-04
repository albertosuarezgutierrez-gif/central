// MODO PILOTADO del tarificador RPA (03/11/2026) — reglas PURAS del worker. El bucle está en `pilotaje.ts`.
//
// El operador manda comandos {accion: pulsar|marcar|rellenar|seleccionar|inspeccionar|cerrar_modal|esperar|volver|fin, ref?, valor?, dato?, efecto?, ms?} por la BD.
// Aquí se REVALIDAN enteros (asegura solo miró la forma; un comando escrito por SQL ni eso) y se traducen al lenguaje de acciones
// del explorador para pasar por SU validador (`validarRespuestaExplorador`, contra el inventario PROPIO de la pantalla). Ninguna
// regla de aquí autoriza un clic: los clics van SIEMPRE por las puertas de guard.ts (`pulsar`, `pulsarExploracionAutorizada`,
// `pulsarGuardadoDialogoAutorizado`). TARIFICAR ≠ EMITIR.

import { redactarMediador } from './privacidad-mediador.ts'
import { pareceDatoPersonalInventario, senalCuentaBancaria, descripcionesElemento, type ElementoInventario } from '@central/module-tarificacion'

/** Topes DUROS de una sesión (asegura usa los mismos: apps/asegura/lib/tarificador-pilotaje-reglas.ts). */
export const TOPES_PILOTAJE = Object.freeze({ maxComandos: 60, maxMs: 30 * 60_000, esperaComandoMs: 10 * 60_000, pollMs: 2_000 })

/** `inspeccionar` (0.3.37): diagnóstico de accionabilidad de un control SIN pulsarlo; nunca toca el portal. */
/** `cerrar_modal` (0.3.38): cierra un modal INFORMATIVO (sin campos ni términos de acción final) por Escape › botón de cierre › fondo; sin ref. */
/** `marcar` (0.3.50): radio/casilla (o su `<label for>` si el input está oculto) con el validador y la implementación del explorador; sin efecto. */
export const ACCIONES_PILOTAJE = ['pulsar', 'marcar', 'rellenar', 'seleccionar', 'inspeccionar', 'cerrar_modal', 'esperar', 'volver', 'fin'] as const
export type AccionPilotaje = (typeof ACCIONES_PILOTAJE)[number]
/** `guardar_presupuesto` NO: el guardado del presupuesto tiene su puerta y su PDF en el explorador, no se pilota. */
export const EFECTOS_PULSAR = ['siguiente_pantalla', 'calcular', 'abrir_seccion', 'ver_resultado'] as const

export type ComandoPilotaje =
  | { accion: 'pulsar'; ref: string; efecto: (typeof EFECTOS_PULSAR)[number] }
  | { accion: 'rellenar'; ref: string; valor: string }
  | { accion: 'rellenar'; ref: string; dato: string }
  | { accion: 'seleccionar'; ref: string; valor: string }
  | { accion: 'marcar'; ref: string }
  | { accion: 'inspeccionar'; ref: string }
  | { accion: 'cerrar_modal' }
  | { accion: 'esperar'; ms: number }
  | { accion: 'volver' }
  | { accion: 'fin' }

const RE_REF = /^m\d{1,2}e\d{1,4}$/
const RE_DATO = /^[a-z][a-zA-Z0-9]{0,30}(\.[a-zA-Z0-9]{1,40}){1,3}$/
const obj = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null)

/** Revalida un comando CRUDO. Fail-closed: clave desconocida, acción fuera de lista o forma rara → rechazo. PURA. */
export function leerComando(v: unknown): { ok: true; c: ComandoPilotaje } | { ok: false; errores: string[] } {
  const c = obj(v)
  if (!c) return { ok: false, errores: ['comando no es un objeto'] }
  const accion = ACCIONES_PILOTAJE.find((a) => a === c.accion)
  if (!accion) return { ok: false, errores: ['accion fuera de lista'] }
  const permitidas: Record<AccionPilotaje, string[]> = {
    pulsar: ['accion', 'ref', 'efecto'], marcar: ['accion', 'ref'], rellenar: ['accion', 'ref', 'valor', 'dato'], seleccionar: ['accion', 'ref', 'valor'], inspeccionar: ['accion', 'ref'], cerrar_modal: ['accion'],
    esperar: ['accion', 'ms'], volver: ['accion'], fin: ['accion'],
  }
  const errores: string[] = []
  for (const k of Object.keys(c)) if (!permitidas[accion].includes(k)) errores.push(`clave «${k.slice(0, 30)}» no se admite en ${accion}`)
  const ref = typeof c.ref === 'string' && RE_REF.test(c.ref) ? c.ref : null
  const texto = (x: unknown) => (typeof x === 'string' && x.length >= 1 && x.length <= 80 ? x : null)
  if (errores.length) return { ok: false, errores }
  switch (accion) {
    case 'fin':
    case 'volver':
    case 'cerrar_modal':
      return { ok: true, c: { accion } }
    case 'esperar': {
      if (c.ms === undefined) return { ok: true, c: { accion, ms: 2_000 } }
      if (typeof c.ms !== 'number' || !Number.isInteger(c.ms) || c.ms < 0 || c.ms > 15_000) return { ok: false, errores: ['ms tiene que ser un entero 0-15000'] }
      return { ok: true, c: { accion, ms: c.ms } }
    }
    case 'pulsar': {
      if (!ref) return { ok: false, errores: ['ref no válido'] }
      const efecto = c.efecto === undefined ? 'siguiente_pantalla' : EFECTOS_PULSAR.find((e) => e === c.efecto)
      if (!efecto) return { ok: false, errores: ['efecto fuera de lista'] }
      return { ok: true, c: { accion, ref, efecto } }
    }
    case 'marcar':
    case 'inspeccionar': {
      if (!ref) return { ok: false, errores: ['ref no válido'] }
      return { ok: true, c: { accion, ref } }
    }
    case 'seleccionar': {
      const valor = texto(c.valor)
      if (!ref || !valor) return { ok: false, errores: ['seleccionar lleva ref y valor (1-80 car.)'] }
      return { ok: true, c: { accion, ref, valor } }
    }
    case 'rellenar': {
      if (!ref) return { ok: false, errores: ['ref no válido'] }
      if ((c.valor === undefined) === (c.dato === undefined)) return { ok: false, errores: ['rellenar lleva valor o dato, uno de los dos'] }
      if (c.dato !== undefined) {
        if (typeof c.dato !== 'string' || !RE_DATO.test(c.dato) || c.dato.startsWith('credencial.')) return { ok: false, errores: ['dato tiene que ser una clave del catálogo'] }
        return { ok: true, c: { accion, ref, dato: c.dato } }
      }
      const valor = texto(c.valor)
      if (!valor) return { ok: false, errores: ['valor tiene que ser un texto de 1 a 80 caracteres'] }
      return { ok: true, c: { accion, ref, valor } }
    }
  }
}

/** Algoritmo de Luhn sobre una tira de cifras (tarjetas). PURA. */
export function pasaLuhn(cifras: string): boolean {
  if (!/^\d{12,19}$/.test(cifras)) return false
  let suma = 0
  for (let i = 0; i < cifras.length; i++) {
    let d = cifras.charCodeAt(cifras.length - 1 - i) - 48
    if (i % 2 === 1) {
      d *= 2
      if (d > 9) d -= 9
    }
    suma += d
  }
  return suma % 10 === 0
}

const RE_IBAN = /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,4})?\b/i

/**
 * ¿Se puede escribir este texto LITERAL? Solo datos FICTICIOS de forma inocua: nunca algo con forma de dato personal (NIF, IBAN,
 * correo, teléfono… `pareceDatoPersonalInventario`), ni de cuenta (IBAN) ni de tarjeta (tira de ≥12 cifras). Para un NIF, un
 * correo o un teléfono de prueba se usa `dato` (clave del catálogo: el valor sintético lo pone el worker). `null` = sí. PURA.
 */
export function motivoValorLiteralProhibido(valor: string): string | null {
  if (/[\u0000-\u001f\u007f]/.test(valor)) return 'valor con caracteres de control'
  if (pareceDatoPersonalInventario(valor)) return 'valor con forma de dato personal (usa `dato` con una clave del catálogo)'
  if (RE_IBAN.test(valor.replace(/[-.]/g, ' '))) return 'valor con forma de IBAN'
  const cifras = valor.replace(/[\s.-]/g, '')
  if (/\d{12,}/.test(cifras)) return pasaLuhn(cifras.match(/\d{12,19}/)?.[0] ?? '') ? 'valor con forma de tarjeta' : 'valor con una tira larga de cifras'
  return null
}

const RE_CAMPO_PAGO_FIRMA = /\b(iban|swift|bic|cuenta|ccc|tarjeta|card|cvv|cvc|caducidad|titular|firma|firmar|sign|signature|pin|otp)\b/i

/**
 * Campos donde NUNCA se escribe nada desde el pilotaje (ni literal ni del catálogo): cuenta bancaria (`senalCuentaBancaria`, la
 * frontera de emisión del explorador), tarjeta, firma o código de verificación. `null` = se puede. PURA.
 */
export function motivoCampoProhibido(el: ElementoInventario): string | null {
  const desc = descripcionesElemento(el)
  const cuenta = senalCuentaBancaria(desc)
  if (cuenta !== null) return 'frontera_bancaria'
  const plano = desc.filter((d): d is string => typeof d === 'string').map((d) => d.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' '))
  if (plano.some((d) => RE_CAMPO_PAGO_FIRMA.test(d))) return 'campo_de_pago_o_firma'
  return null
}

const TIPOS_TEXTO = new Set(['', 'text', 'number', 'tel', 'email', 'date', 'search', 'url'])
export function esCampoTexto(el: ElementoInventario): boolean {
  if (el.tag === 'textarea') return true
  return el.tag === 'input' && TIPOS_TEXTO.has((el.type ?? '').toLowerCase())
}

/**
 * Traduce un comando al lote de UNA acción del explorador, para pasarlo por `validarRespuestaExplorador`. `rellenar` con `valor`
 * literal no tiene equivalente (el explorador solo escribe claves del catálogo): `null`, y lo cubren `motivoCampoProhibido` +
 * `motivoValorLiteralProhibido` + `esCampoTexto`. PURA.
 */
export function loteExploradorDe(c: ComandoPilotaje, el: ElementoInventario): unknown | null {
  const envolver = (accion: unknown) => ({ version: 1, pantalla: { nombre: null, tipo: 'formulario' }, acciones: [accion], mapeo: [], motivo: null })
  if (c.accion === 'pulsar') {
    // Un <input> que no es botón (submit/button/image/reset) solo se «pulsa» si el validador lo admite como marcable (opción o casilla).
    const tipo = (el.type ?? '').toLowerCase()
    if (el.tag === 'input' && !['submit', 'button', 'image', 'reset'].includes(tipo)) return envolver({ accion: 'marcar', ref: c.ref })
    return envolver({ accion: 'avanzar', ref: c.ref, efectoEsperado: c.efecto, confianza: 'alta' })
  }
  // 0.3.50: `marcar` es SIEMPRE la acción `marcar` del explorador (el validador exige radio/casilla sin acción final ni onclick que envíe).
  if (c.accion === 'marcar') return envolver({ accion: 'marcar', ref: c.ref })
  if (c.accion === 'seleccionar') return envolver({ accion: 'elegir', ref: c.ref, opcion: c.valor })
  if (c.accion === 'rellenar' && 'dato' in c) return envolver({ accion: 'rellenar', ref: c.ref, dato: c.dato })
  return null
}

/** Texto de diagnóstico corto y sin forma de dato personal (asegura lo vuelve a redactar). PURA. */
export function textoDiagnostico(t: string, redactar: (t: string) => string = (x) => x): string {
  const s = redactarMediador(redactar(t)).replace(/\s+/g, ' ').trim().slice(0, 160)
  return pareceDatoPersonalInventario(s) ? '(texto redactado)' : s
}
