// Clasificación de fallos del worker → `TipoError` de @central/module-tarificacion. El orquestador
// decide el estado (`estadoTrasError`): solo `infra` se reintenta, y UNA vez.

import { EmisionBloqueadaError, type TipoError } from '@central/module-tarificacion'
import { textoAvisoVerificacion } from './aviso.ts'

export class ErrorTarificador extends Error {
  readonly tipo: TipoError
  /** Solo `portal`: fallo pasajero del portal (5xx, sesión caducada…) que el runner puede reintentar UNA vez. */
  readonly transitorio: boolean
  constructor(tipo: TipoError, mensaje: string, opciones: { transitorio?: boolean } = {}) {
    super(mensaje)
    this.name = 'ErrorTarificador'
    this.tipo = tipo
    this.transitorio = tipo === 'portal' && opciones.transitorio === true
  }
}

/** Motivo clasificado de «hace falta una persona en el portal» (segundo factor / SMS / sesión no recuperable). */
export const MOTIVO_VERIFICACION_HUMANA = 'requiere_verificacion_humana'

/**
 * El portal pide un código (SMS/OTP/segundo factor) o la sesión no se recupera sin persona. NO reintentable.
 * En el cable viaja como `tipo: 'captcha'`: `TipoError` vive en @central/module-tarificacion (contrato con asegura,
 * que rechaza tipos que no conoce) y `captcha` ya significa «requiere una persona» → `requiere_humano`. El motivo
 * fino va al principio del mensaje (`requiere_verificacion_humana: …`) para que el panel lo distinga.
 */
export class ErrorVerificacionHumana extends ErrorTarificador {
  readonly motivo = MOTIVO_VERIFICACION_HUMANA
  /** `texto`: aviso alternativo (p. ej. `textoAvisoSesionManual`); el prefijo del motivo no cambia (lo lee asegura). */
  constructor(compania: string, texto: string = textoAvisoVerificacion(compania)) {
    super('captcha', `${MOTIVO_VERIFICACION_HUMANA}: ${texto}`)
    this.name = 'ErrorVerificacionHumana'
  }
}

export function clasificar(e: unknown): { tipo: TipoError; mensaje: string } {
  if (e instanceof EmisionBloqueadaError) return { tipo: 'emision', mensaje: e.message }
  if (e instanceof ErrorTarificador) return { tipo: e.tipo, mensaje: e.message }
  const msg = e instanceof Error ? e.message : String(e)
  // Red caída / DNS / conexión: infraestructura (se reintenta una vez).
  if (/net::ERR_|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up|Target (page|browser).*closed/i.test(msg)) {
    return { tipo: 'infra', mensaje: msg }
  }
  // Un selector que no aparece (TimeoutError de Playwright) o cualquier otra cosa: el portal no es
  // como el adaptador cree. NO se reintenta: repetir es otro login con nuestra credencial.
  return { tipo: 'portal', mensaje: msg }
}

// ───────────────────────── reintento en el worker (06/10/2026) ─────────────────────────
//
// El orquestador ya reintenta `infra` UNA vez con otra máquina (red caída, navegador muerto). El runner añade UN
// reintento propio, en la misma máquina y desde un contexto LIMPIO, solo para lo que es pasajero DEL PORTAL:
//   · timeout de NAVEGACIÓN (goto/waitForURL), no de un selector (eso es «el portal no es como creemos»);
//   · sesión caducada: ya logueados y el portal nos devuelve a la pantalla de login;
//   · 5xx del portal en un documento durante el intento;
//   · `ErrorTarificador('portal', …, { transitorio: true })` que marque el adaptador.
// NUNCA: datos, credenciales, captcha, emisión/guard ni `infra` (este último ya lo reintenta el orquestador:
// reintentarlo aquí también serían dos logins de más).

/** Lo que el runner observó durante el intento (sin secretos: dos banderas y un código HTTP). */
export type PistasIntento = {
  /** ¿El adaptador llegó a pasar el login (`ctx.trasLogin`)? */
  logueado: boolean
  /** ¿Al fallar se ve un campo de contraseña (el portal nos ha devuelto al login)? */
  loginVisible: boolean
  /** Último status ≥ 500 de un DOCUMENTO del portal durante el intento (`null` = ninguno). */
  ultimo5xx: number | null
}

export type MotivoTransitorio = 'timeout_navegacion' | 'sesion_caducada' | 'portal_5xx' | 'portal_transitorio'

export type Clasificacion = { tipo: TipoError; mensaje: string; transitorio: MotivoTransitorio | null }

const TIMEOUT_NAVEGACION = /\b(page|frame)\.(goto|reload|waitForNavigation|waitForURL|goBack|goForward): Timeout \d+ms exceeded|Navigation timeout of \d+ ?ms exceeded/i

/**
 * Clasifica el fallo de un intento y decide si es TRANSITORIO (se puede reintentar una vez en el worker).
 * Pura: el runner le pasa el error y lo que observó.
 */
export function clasificarIntento(e: unknown, pistas: PistasIntento): Clasificacion {
  const c = clasificar(e)
  // Definitivos SIEMPRE: emisión/guard, datos, credenciales, captcha. `infra` lo reintenta el orquestador.
  if (c.tipo !== 'portal') return { ...c, transitorio: null }
  if (e instanceof ErrorTarificador && e.transitorio) return { ...c, transitorio: 'portal_transitorio' }
  if (TIMEOUT_NAVEGACION.test(c.mensaje)) return { ...c, transitorio: 'timeout_navegacion' }
  // No por URL: la home logueada de ePAC también cuelga de `/public/`. Por el formulario de login a la vista.
  if (pistas.logueado && pistas.loginVisible) return { ...c, transitorio: 'sesion_caducada' }
  if (pistas.ultimo5xx !== null && pistas.ultimo5xx >= 500 && pistas.ultimo5xx <= 599) return { ...c, transitorio: 'portal_5xx' }
  return { ...c, transitorio: null }
}

/** Espera antes del reintento: 20–40 s aleatorios (ritmo humano; `aleatorio` inyectable para los tests). */
export function esperaReintentoMs(aleatorio: () => number = Math.random): number {
  return Math.round(20_000 + aleatorio() * 20_000)
}

/** Margen antes del fin del lease (enviar el resultado + evidencias). */
export const MARGEN_LEASE_MS = 30_000
/** Un reintento solo merece la pena si le quedan al menos estos ms (un trabajo bueno tarda ~2 min). */
export const MIN_INTENTO_MS = 150_000

/**
 * Hora límite del trabajo: el lease de asegura menos el margen; sin lease legible, `inicio + topeSinLease`.
 * Nunca más allá de `inicio + topeMax`.
 */
export function limiteDelTrabajo(inicio: number, leaseHasta: string | undefined, topeSinLease: number, topeMax: number): number {
  const lease = leaseHasta ? Date.parse(leaseHasta) : NaN
  const porLease = Number.isFinite(lease) ? lease - MARGEN_LEASE_MS : inicio + topeSinLease
  return Math.min(porLease, inicio + topeMax)
}

/** ¿Cabe un reintento que empieza tras `esperaMs`? */
export function cabeReintento(ahora: number, limite: number, esperaMs: number): boolean {
  return limite - (ahora + esperaMs) >= MIN_INTENTO_MS
}
