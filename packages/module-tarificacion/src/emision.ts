// EMISIÓN asistida por el robot, con autorización de Alberto por Telegram (10/10/2026). PURO (sin `node:crypto`: lo importa el cliente).
// Hash/HMAC/token viven en `emision-servidor.ts` (subpath `@central/module-tarificacion/servidor`): el index llega al
// bundle del navegador de plataforma y `node:crypto` rompía el build de webpack (PR #4483).
// Diseño: docs/TARIFICADOR-EMISION-DISENO.md. Decisiones de Alberto (10/10/2026): sin tope diario; solo él solicita y
// autoriza; la solicitud vale 24 h; tolerancia de precio 0 €; precondición = presupuesto aceptado y firmado con IPID
// registrado; la anulación de la póliza sustituida es MANUAL (solo se avisa); solo Allianz Comunidades.
//
// 🚨 Por defecto TODO sigue cerrado: `guard-emision.ts` no se toca. Lo único que abre UN botón UNA vez es un
//    `PermisoEmision` que el worker solo puede construir con la respuesta de un canje de token correcto, y que queda
//    atado a (trabajo, hash de datos, botón). Cualquier otro botón, otro trabajo, otro hash o un segundo uso → bloqueado.
// 🚨 Nunca, ni con permiso: RGPD, SMS/OTP, contraseñas, Pago fraccionado (`NUNCA_CON_PERMISO`).

import { EmisionBloqueadaError } from './guard-emision.ts'
import { claveCompania } from './registro.ts'

// ─── Interruptor y lista blanca ──────────────────────────────────────────────

/** Interruptor general (servidor Y máquina). Ausente u otro valor que no sea exactamente '1' = nunca. */
export const ENV_EMISION_ACTIVA = 'TARIFICADOR_EMISION_ACTIVA'
export function emisionActiva(env: Record<string, string | undefined>): boolean {
  return env[ENV_EMISION_ACTIVA] === '1'
}

/** El ÚNICO botón que un permiso puede abrir: id exacto del elemento + texto visible exacto. */
export type BotonEmision = { readonly id: string; readonly texto: string }

/**
 * (compañía, ramo) con emisión. Fase 1: SOLO Allianz Comunidades. El botón es el pie «Aceptar» de la pestaña
 * Tarificar de ePAC «Comunidades 2020» (`div#aceptar`, docs/TARIFICADOR-RPA.md), el que la máquina de fases bloquea
 * siempre al tarificar. Lo que ePAC enseñe DESPUÉS de pulsarlo no está grabado: el worker no pulsa nada más.
 */
const LISTA_BLANCA: Readonly<Record<string, BotonEmision>> = Object.freeze({
  'allianz::comunidades': Object.freeze({ id: 'aceptar', texto: 'Aceptar' }),
})

/** Botón autorizable de (compañía, ramo). `null` = esa combinación NO emite (nunca «el de otra»). */
export function botonEmisionDe(compania: string, ramo: string): BotonEmision | null {
  return LISTA_BLANCA[`${claveCompania(compania)}::${String(ramo).trim().toLowerCase()}`] ?? null
}

export const clavesEmision = (): string[] => Object.keys(LISTA_BLANCA).sort()

/** ¿Es este EXACTAMENTE uno de los botones de la lista blanca? Un permiso solo puede abrir uno de ellos. */
export function esBotonDeListaBlanca(b: { id?: unknown; texto?: unknown } | null | undefined): boolean {
  return !!b && Object.values(LISTA_BLANCA).some((x) => x.id === b.id && x.texto === b.texto)
}

// ─── Tiempos ─────────────────────────────────────────────────────────────────

/** La solicitud espera el botón de Alberto como mucho 24 h; luego se cancela. */
export const VALIDEZ_SOLICITUD_MS = 24 * 60 * 60_000
/** El token (tras pulsar «Emitir») vale 15 min: lo que tarda una máquina en volver a la pantalla previa. */
export const VALIDEZ_TOKEN_MS = 15 * 60_000

// ─── Importes ────────────────────────────────────────────────────────────────

/** Euros → céntimos enteros. `null` si no es un importe positivo finito (nunca 0 por defecto). */
export function eurosACentimos(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.trim().replace(',', '.')) : typeof v === 'number' ? v : NaN
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100)
}

/** Tolerancia 0 €: un céntimo de diferencia ya es «distinta». `null` en cualquiera = no se puede comparar → distinta. */
export function primaCoincide(pantallaCents: number | null, aceptadaCents: number | null): boolean {
  if (!Number.isInteger(pantallaCents) || !Number.isInteger(aceptadaCents)) return false
  return (pantallaCents as number) > 0 && pantallaCents === aceptadaCents
}

// ─── Hash de datos ───────────────────────────────────────────────────────────

// (`hashDatosEmision` está en `emision-servidor.ts`.)
export type DatosEmision = {
  compania: string
  ramo: string
  presupuestoId: string
  opcionId: string
  primaCents: number
  /** NIF/CIF del tomador tal como va en el riesgo. `null` = no consta (entra como null, no como «»). */
  tomadorDocumento: string | null
  riesgo: unknown
  boton: BotonEmision
}

// ─── Token de un solo uso
// (`generarTokenEmision`/`hashTokenEmision` están en `emision-servidor.ts`.) ────────────────────────────────────────────────────

export const pareceTokenEmision = (t: unknown): t is string => typeof t === 'string' && /^[A-Za-z0-9_-]{43}$/.test(t)

// ─── Precondiciones (presupuesto aceptado) ───────────────────────────────────

export type PresupuestoParaEmitir = {
  origen: string | null
  aceptadoAt: Date | null
  firmaId: string | null
  opcionElegidaId: string | null
  ipidHuella: string | null
  venceEl: Date | null
  retiradoAt: Date | null
  emitidoAt: Date | null
}
export type OpcionParaEmitir = { id: string; compania: string; primaEur: unknown }

/** ¿Consta el IPID en la aceptación? Una sola regla para la precondición de emitir y para avisar ANTES de pedir. */
export function ipidConstaEnAceptacion(ipidHuella: string | null | undefined): boolean {
  return typeof ipidHuella === 'string' && ipidHuella.trim() !== ''
}

export type Precondicion = { ok: true; primaCents: number } | { ok: false; motivo: string }

/**
 * ¿Se puede PEDIR emitir esta opción de este presupuesto en (compañía, ramo)? Fail-closed: cualquier dato que falte
 * es «no». El IPID que falta se dice como «no consta», nunca como «no aplica».
 */
export function precondicionesEmision(p: PresupuestoParaEmitir, o: OpcionParaEmitir, ramo: string, ahora: Date): Precondicion {
  if (!botonEmisionDe(o.compania, ramo)) return { ok: false, motivo: `emisión no habilitada para ${claveCompania(o.compania)}/${ramo}` }
  if (p.origen !== 'ofertas') return { ok: false, motivo: 'solo se emite por el robot un presupuesto de ofertas de compañía' }
  if (!p.aceptadoAt || !p.firmaId || !p.opcionElegidaId) return { ok: false, motivo: 'el cliente no ha aceptado y firmado el presupuesto' }
  if (p.opcionElegidaId !== o.id) return { ok: false, motivo: 'la opción no es la que aceptó el cliente' }
  if (!ipidConstaEnAceptacion(p.ipidHuella)) return { ok: false, motivo: 'IPID no consta en la aceptación: no se emite' }
  if (p.retiradoAt) return { ok: false, motivo: 'presupuesto retirado' }
  if (p.emitidoAt) return { ok: false, motivo: 'presupuesto ya emitido' }
  if (!p.venceEl || p.venceEl.getTime() <= ahora.getTime()) return { ok: false, motivo: 'presupuesto caducado' }
  const primaCents = eurosACentimos(o.primaEur)
  if (primaCents === null) return { ok: false, motivo: 'la opción aceptada no tiene prima legible' }
  return { ok: true, primaCents }
}

// ─── Autorización (botón de Telegram) ────────────────────────────────────────

export type DecisionAutorizar = { ok: true } | { ok: false; motivo: string }

/**
 * ¿Vale esta pulsación? Solo la persona autorizada (id de Telegram EXACTO, configurado), sobre un trabajo que espera
 * autorización, dentro de las 24 h desde que se pidió. Sin autorizador configurado → nadie.
 */
export function decidirAutorizacion(e: {
  autorizadoPor: string | null | undefined
  autorizador: string | null | undefined
  estado: string | null | undefined
  pedidaAt: Date | null | undefined
  ahora: Date
}): DecisionAutorizar {
  const quien = String(e.autorizadoPor ?? '').trim()
  const esperado = String(e.autorizador ?? '').trim()
  if (!esperado) return { ok: false, motivo: 'autorizador sin configurar' }
  if (!quien || quien !== esperado) return { ok: false, motivo: 'no autorizado' }
  if (e.estado !== 'pendiente_autorizacion_emision') return { ok: false, motivo: `el trabajo no espera autorización (${e.estado ?? 'desconocido'})` }
  if (!e.pedidaAt || e.ahora.getTime() - e.pedidaAt.getTime() >= VALIDEZ_SOLICITUD_MS) return { ok: false, motivo: 'solicitud caducada (24 h)' }
  return { ok: true }
}

// ─── Firma del botón (factor independiente del puerto de operador) ───────────

/**
 * Secreto que SOLO tienen el webhook de Telegram de plataforma y asegura (revisión de seguridad 10/10/2026): el Bearer
 * `ASEGURA_OPERADOR_SECRET` lo tienen más piezas, y con él solo NO se puede autorizar una emisión. Plataforma firma con
 * HMAC-SHA256 (trabajo, decisión, hash corto de la pantalla previa, from.id, timestamp) y asegura lo verifica en tiempo
 * constante. Sin secreto (o de menos de 32 caracteres) → nadie autoriza.
 */
export const ENV_FIRMA_AUTORIZACION = 'TARIFICADOR_EMISION_WEBHOOK_SECRET'
/** Antigüedad máxima de una firma (s). La pulsación se reenvía en `after()`, al instante. */
export const VENTANA_FIRMA_S = 90
/** Reloj adelantado tolerado (s). */
export const FUTURO_FIRMA_S = 30
/** Caracteres del hash de datos que viajan en el `callback_data` (≤ 64 bytes): `emi_ok:<uuid>:<16 hex>` = 60. */
export const LARGO_HASH_CORTO = 16
export const hashCortoEmision = (hashDatos: string): string => String(hashDatos).slice(0, LARGO_HASH_CORTO).toLowerCase()

export type CamposFirmaAutorizacion = { trabajoId: string; decision: 'ok' | 'no'; hashCorto: string; autorizadoPor: string; ts: number }

const UUID_FIRMA = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const secretoFirmaValido = (s: unknown): s is string => typeof s === 'string' && s.length >= 32

/** Campos bien formados o `null` (nada se firma ni se verifica a medias). */
export function camposFirmaAutorizacion(o: unknown): CamposFirmaAutorizacion | null {
  const r = (typeof o === 'object' && o !== null ? o : {}) as Record<string, unknown>
  const trabajoId = typeof r.trabajoId === 'string' && UUID_FIRMA.test(r.trabajoId) ? r.trabajoId.toLowerCase() : null
  const decision = r.decision === 'ok' || r.decision === 'no' ? r.decision : null
  const hashCorto = typeof r.hashCorto === 'string' && new RegExp(`^[0-9a-f]{${LARGO_HASH_CORTO}}$`).test(r.hashCorto) ? r.hashCorto : null
  const autorizadoPor = typeof r.autorizadoPor === 'string' && /^\d{3,20}$/.test(r.autorizadoPor) ? r.autorizadoPor : null
  const ts = typeof r.ts === 'number' && Number.isSafeInteger(r.ts) && r.ts > 0 ? r.ts : null
  if (!trabajoId || !decision || !hashCorto || !autorizadoPor || ts === null) return null
  return { trabajoId, decision, hashCorto, autorizadoPor, ts }
}

/** Texto canónico que se firma (lo usa `emision-servidor.ts`). */
export const canonicoFirma = (c: CamposFirmaAutorizacion): string =>
  ['emi-aut-v1', c.trabajoId.toLowerCase(), c.decision, c.hashCorto, c.autorizadoPor, String(c.ts)].join('\n')

// (`firmarAutorizacionEmision`/`verificarFirmaAutorizacionEmision` están en `emision-servidor.ts`.)
export type VerificacionFirma = { ok: true; campos: CamposFirmaAutorizacion } | { ok: false; motivo: 'sin_secreto' | 'campos' | 'sin_firma' | 'firma_distinta' | 'caducada' | 'futura' }

// ─── Canje (espejo puro del UPDATE atómico de asegura) ───────────────────────

export type FilaAutorizacion = {
  trabajoId: string
  tokenHash: string | null
  hashDatos: string
  expiraAt: Date
  consumidoAt: Date | null
}

export type DecisionCanje = { ok: true } | { ok: false; motivo: 'sin_token' | 'otro_trabajo' | 'token_distinto' | 'ya_usado' | 'caducado' | 'hash_distinto' }

// (`decidirCanje` está en `emision-servidor.ts`: compara el SHA-256 del token.)

// ─── Permiso de UN botón, UNA vez (lo usa el guard del worker) ───────────────

const PERMISOS = new WeakSet<object>()

/** Objeto opaco: no se puede fabricar con un literal (solo `crearPermisoEmision` lo registra). */
export type PermisoEmision = { readonly trabajoId: string; readonly hashDatos: string; readonly boton: BotonEmision; readonly __permiso: true }

const usados = new WeakSet<object>()

/**
 * Lo crea el runner del worker SOLO con la respuesta OK del canje (`{hashDatos, boton}` de asegura). Un permiso por
 * canje: si se pide dos veces con lo mismo, son dos objetos, pero el token ya está consumido en asegura.
 */
export function crearPermisoEmision(p: { trabajoId: string; hashDatos: string; boton: BotonEmision }): PermisoEmision {
  if (!/^[0-9a-f-]{36}$/i.test(p.trabajoId) || !/^[0-9a-f]{64}$/.test(p.hashDatos) || !esBotonDeListaBlanca(p.boton)) {
    throw new EmisionBloqueadaError('fase', 'permiso de emisión mal formado')
  }
  const permiso = Object.freeze({ trabajoId: p.trabajoId, hashDatos: p.hashDatos, boton: Object.freeze({ id: p.boton.id, texto: p.boton.texto }), __permiso: true as const })
  PERMISOS.add(permiso)
  return permiso
}

/** Nunca se pulsa, ni con permiso: consentimientos RGPD, códigos SMS/OTP, contraseñas, pago fraccionado, anular. */
export const NUNCA_CON_PERMISO: readonly RegExp[] = [/rgpd|consentim|promocion|perfilad/i, /otp|sms|verificaci/i, /contrase|password|recuperaci/i, /fracciona/i, /anul|baja|suplement/i]

const plano = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * Consume el permiso para pulsar el elemento descrito por `descripciones` (texto, aria-label, title, value, id, name,
 * href, onclick, formaction: el mismo orden que `pulsar()` del worker). Lanza `EmisionBloqueadaError` si:
 *   · no hay permiso o no es uno creado por `crearPermisoEmision`;   · ya se usó;
 *   · es de otro trabajo u otro hash;   · el elemento no es EXACTAMENTE el botón del permiso (id y texto);
 *   · algo del elemento casa con `NUNCA_CON_PERMISO`.
 * Se marca USADO antes de devolver (fail-closed: si el clic falla, no hay segundo).
 */
export function usarPermisoEmision(
  permiso: PermisoEmision | null | undefined,
  vinculo: { trabajoId: string; hashDatos: string },
  descripciones: readonly (string | null | undefined)[],
): void {
  if (!permiso || typeof permiso !== 'object' || !PERMISOS.has(permiso)) throw new EmisionBloqueadaError('fase', 'emisión sin permiso')
  if (usados.has(permiso)) throw new EmisionBloqueadaError('fase', 'permiso de emisión ya usado')
  if (permiso.trabajoId !== vinculo.trabajoId || permiso.hashDatos !== vinculo.hashDatos) throw new EmisionBloqueadaError('fase', 'permiso de emisión de otro trabajo o con otros datos')
  const [texto, , , , id] = descripciones
  if ((id ?? '') !== permiso.boton.id || String(texto ?? '').trim() !== permiso.boton.texto) {
    throw new EmisionBloqueadaError('boton', `el permiso no abre este botón (${String(id ?? '').slice(0, 40)})`)
  }
  for (const d of descripciones) {
    if (typeof d === 'string' && NUNCA_CON_PERMISO.some((r) => r.test(plano(d)))) throw new EmisionBloqueadaError('boton', d)
  }
  usados.add(permiso)
}

// ─── Estados de fallo ────────────────────────────────────────────────────────

/**
 * Un trabajo de EMISIÓN que falla nunca se reintenta solo (ni infra: tras el clic el estado real en la compañía es
 * incierto). Siempre `requiere_humano`; la persona mira el portal y, si procede, pide una emisión NUEVA.
 */
export function estadoTrasErrorEmision(): 'requiere_humano' {
  return 'requiere_humano'
}

/** Quita un token (o cualquier cadena con su forma) de un texto que va a salir (log, error, Telegram). */
export function sinTokens(texto: string, tokens: readonly string[] = []): string {
  let t = String(texto)
  for (const k of tokens) if (k && k.length >= 16) t = t.split(k).join('[TOKEN]')
  return t.replace(/\b[A-Za-z0-9_-]{43}\b/g, (m) => (/[0-9]/.test(m) && /[A-Za-z]/.test(m) ? '[TOKEN]' : m))
}
