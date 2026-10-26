// P17 (26/10/2026) — el INQUILINO que entra por un ENLACE que le pasa el propietario. Reglas PURAS (sin BD, sin reloj, sin
// sesión): el adaptador con BD está en `apps/asegura-portal/lib/inquilino/*`.
//
// Reparto (patrón de las invitaciones): el TOKEN del enlace dice QUÉ contrato e inquilino; el CÓDIGO de un solo uso al canal
// de la persona dice QUIÉN es. El token NO abre sesión. El portal NO envía nada: el propietario copia o comparte el enlace
// él mismo (CLAUDE.md: nada saliente sin OK de Alberto para ese envío; aquí ni siquiera sale del portal).
//
// 🚨 Un enlace es de UN USO: el primer canje (con sesión) lo gasta y deja un ACCESO ligado a esa identidad. Anulado, gastado
// o caducado = muerto, y los tres se cuentan igual por fuera (no hay oráculo de tokens).
// 🚨 Revocable por AMBOS lados: `revocadoEn` + `revocadoPor`. Un acceso revocado no abre nada; para volver a entrar el
// propietario genera otro enlace.
// 🚨 El inquilino NUNCA es lead sin su propio consentimiento: `puedeRecibirOfertasInquilino` es la ÚNICA puerta, y sin un
// consentimiento VIGENTE (concedido, de la versión actual del texto, no retirado) devuelve false. Ninguna ruta que lea
// inquilinos para ofertas puede saltársela (cepo `test/regression-portal-inquilino-acceso.test.ts`).
// 🚨 La vista se CONSTRUYE campo a campo (`CAMPOS_VISTA_CONTRATO_INQUILINO`): nada de `...contrato`. No sale la fianza, los
// gastos, la rentabilidad, otros inmuebles ni otros inquilinos; del propietario, SOLO el nombre de contacto que él escribió.
import { esFecha, type Fecha } from './fechas.ts'

/** Un enlace sin gastar vive 14 días: es para pasarlo por WhatsApp hoy, no para dejarlo suelto en un chat. */
export const DIAS_VALIDEZ_ENLACE_INQUILINO = 14
/** 32 bytes de `randomBytes` = 256 bits; en hex, 64 caracteres. */
export const BYTES_TOKEN_ENLACE_INQUILINO = 32
/** Tope de enlaces que un propietario puede crear por día (freno de abuso, no cuota). */
export const MAX_ENLACES_INQUILINO_DIA = 20

const TOKEN = /^[0-9a-f]{64}$/

/** `null` = eso no es un token. Se valida la FORMA antes de tocar la BD. */
export function normalizarTokenEnlaceInquilino(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim().toLowerCase()
  return TOKEN.test(t) ? t : null
}

export function caducidadEnlaceInquilino(creadoEn: Date): Date {
  return new Date(creadoEn.getTime() + DIAS_VALIDEZ_ENLACE_INQUILINO * 24 * 60 * 60 * 1000)
}

export type EstadoEnlaceDeAcceso = 'vigente' | 'anulado' | 'usado' | 'caducado'

export interface EnlaceParaAcceso {
  anuladoEn: Date | null
  /** `null` en un enlace antiguo sin fecha: se trata como caducado (no se abre a ciegas). */
  caducaEn: Date | null
  /** Hay un acceso nacido de este enlace. */
  usado: boolean
}

/** Orden: anulado → usado → caducado. Solo `vigente` se puede canjear. */
export function estadoEnlaceDeAcceso(e: EnlaceParaAcceso, ahora: Date): EstadoEnlaceDeAcceso {
  if (e.anuladoEn !== null) return 'anulado'
  if (e.usado) return 'usado'
  if (e.caducaEn === null || Number.isNaN(e.caducaEn.getTime()) || Number.isNaN(ahora.getTime())) return 'caducado'
  return ahora.getTime() >= e.caducaEn.getTime() ? 'caducado' : 'vigente'
}

export function enlaceCanjeable(e: EnlaceParaAcceso, ahora: Date): boolean {
  return estadoEnlaceDeAcceso(e, ahora) === 'vigente'
}

// ─── El acceso: quién (identidad) ve qué (contrato) ──────────────────────────────────────────────────────────────

export type RevocadoPor = 'propietario' | 'inquilino'

export interface AccesoInquilino {
  id: string
  contratoId: string
  inquilinoId: string
  identidadId: string
  revocadoEn: Date | null
}

/** Los accesos VIVOS de ESTA identidad. Ajeno o revocado no cuenta. */
export function accesosVivosDe(accesos: readonly AccesoInquilino[], identidadId: string): AccesoInquilino[] {
  return accesos.filter((a) => a.identidadId === identidadId && a.revocadoEn === null)
}

/**
 * 🚨 LA frontera del inquilino. El contrato que llega en la URL es una PETICIÓN: se busca DENTRO de los accesos vivos de la
 * identidad de la sesión. No está (otro contrato, revocado, de otra persona) = `null` = la misma 404 de siempre.
 */
export function accesoParaContrato(
  accesos: readonly AccesoInquilino[],
  identidadId: string,
  contratoPedido: unknown,
): AccesoInquilino | null {
  if (typeof contratoPedido !== 'string' || contratoPedido === '') return null
  return accesosVivosDe(accesos, identidadId).find((a) => a.contratoId === contratoPedido) ?? null
}

// ─── Consentimiento propio (comercial) ───────────────────────────────────────────────────────────────────────────

/** BORRADOR hasta revisión legal: sube con CADA cambio del texto (un «sí» a una versión vieja no vale para la nueva). */
export const VERSION_CONSENTIMIENTO_INQUILINO = '2026-10-26-borrador-1'

/** Texto en BORRADOR (sin revisar por un jurista). Sin casilla premarcada; la pantalla lo ofrece, nunca lo exige. */
export const TEXTO_CONSENTIMIENTO_INQUILINO =
  'Quiero que Grupo ASegura, correduría de seguros, me haga llegar por este portal ofertas de seguros que puedan ' +
  'interesarme como inquilino (por ejemplo, un seguro de hogar). Es opcional: puedes usar esta página sin aceptar, y ' +
  'puedes retirarlo cuando quieras desde aquí mismo. Tu propietario no sabrá si lo aceptas o no. Mientras no lo aceptes ' +
  'no te mostraremos ninguna oferta.'

export interface ConsentimientoInquilino {
  concedido: boolean
  versionTexto: string
  creadoEn: Date
}

export type EstadoConsentimiento = 'concedido' | 'retirado' | 'version_antigua' | 'sin_decidir'

/**
 * El último gesto manda (append-only): concedido de la versión actual → `concedido`; concedido de una versión vieja →
 * `version_antigua` (cuenta como NO); último gesto = retirar → `retirado`; ninguno → `sin_decidir`.
 */
export function estadoConsentimiento(
  filas: readonly ConsentimientoInquilino[],
  versionActual: string = VERSION_CONSENTIMIENTO_INQUILINO,
): EstadoConsentimiento {
  if (filas.length === 0) return 'sin_decidir'
  const ultima = filas.reduce((a, b) => (b.creadoEn.getTime() >= a.creadoEn.getTime() ? b : a))
  if (!ultima.concedido) return 'retirado'
  return ultima.versionTexto === versionActual ? 'concedido' : 'version_antigua'
}

/** 🚨 La ÚNICA puerta de las ofertas al inquilino: acceso vivo Y consentimiento vigente. Cualquier otra cosa, false. */
export function puedeRecibirOfertasInquilino(x: {
  acceso: Pick<AccesoInquilino, 'revocadoEn'> | null
  consentimientos: readonly ConsentimientoInquilino[]
  versionActual?: string
}): boolean {
  if (x.acceso === null || x.acceso.revocadoEn !== null) return false
  return estadoConsentimiento(x.consentimientos, x.versionActual ?? VERSION_CONSENTIMIENTO_INQUILINO) === 'concedido'
}

/** El gesto de consentir solo se admite con la versión ACTUAL del texto (no se sella un «sí» a un texto que ya no es). */
export function consentimientoAdmisible(versionVista: unknown, versionActual: string = VERSION_CONSENTIMIENTO_INQUILINO): boolean {
  return typeof versionVista === 'string' && versionVista === versionActual
}

// ─── Lo que ve el inquilino ──────────────────────────────────────────────────────────────────────────────────────

/** Lo ÚNICO que ve del contrato. Cambiar esta lista es una decisión (y la cubre un test). */
export const CAMPOS_VISTA_CONTRATO_INQUILINO = [
  'contacto',
  'inmueble',
  'inicio',
  'fin',
  'terminadoEn',
  'rentaMensualCent',
  'seguro',
  'recibos',
] as const

export interface ReciboCompartido {
  id: string
  nombre: string
  creadoEn: string
}

export interface VistaContratoInquilino {
  /** El nombre que el propietario escribió al crear el enlace. NADA más del propietario. */
  contacto: string
  /** Dirección; si no consta, el alias. `null` = no hay ninguno. */
  inmueble: string | null
  inicio: Fecha
  fin: Fecha | null
  terminadoEn: Fecha | null
  /** `null` = no consta. Nunca 0. */
  rentaMensualCent: number | null
  seguro: { exigido: boolean | null; venceRecibo: Fecha | null } | null
  recibos: ReciboCompartido[]
}

export function vistaContratoParaInquilino(x: {
  contacto: string
  direccion: string | null
  alias: string | null
  inicio: Fecha
  fin: Fecha | null
  terminadoEn: Fecha | null
  rentaMensualCent: number | null
  seguroExigido: boolean | null
  seguroVence: Fecha | null
  recibos: readonly ReciboCompartido[]
}): VistaContratoInquilino {
  const direccion = x.direccion?.trim() || null
  const alias = x.alias?.trim() || null
  const renta = x.rentaMensualCent !== null && Number.isFinite(x.rentaMensualCent) && x.rentaMensualCent > 0 ? x.rentaMensualCent : null
  const dice = x.seguroExigido !== null || x.seguroVence !== null
  return {
    contacto: x.contacto.trim(),
    inmueble: direccion ?? alias,
    inicio: x.inicio,
    fin: x.fin,
    terminadoEn: x.terminadoEn,
    rentaMensualCent: renta,
    seguro: dice ? { exigido: x.seguroExigido, venceRecibo: x.seguroVence } : null,
    recibos: x.recibos.map((r) => ({ id: r.id, nombre: r.nombre, creadoEn: r.creadoEn })),
  }
}

/**
 * La renta que el inquilino puede ver: la inicial, o la de la última actualización YA NOTIFICADA con `desde` ≤ hoy. Una
 * subida aplicada pero no notificada no se le puede exigir (LAU): no se la enseñamos como vigente.
 */
export function rentaParaInquilino(
  inicialCent: number,
  actualizaciones: ReadonlyArray<{ desde: Fecha; rentaMensualCent: number; notificada: boolean }>,
  hoy: Fecha,
): number | null {
  if (!esFecha(hoy) || !Number.isFinite(inicialCent) || inicialCent <= 0) return null
  let renta = inicialCent
  let desde: Fecha | null = null
  for (const a of actualizaciones) {
    if (!a.notificada || !esFecha(a.desde) || a.desde > hoy) continue
    if (desde === null || a.desde >= desde) {
      renta = a.rentaMensualCent
      desde = a.desde
    }
  }
  return renta
}

/** Nombre de contacto del propietario: 1–80 caracteres, sin control ni bidi ni `<>`. `null` = no vale. */
export function normalizarContactoPropietario(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v
    .replace(/\s+/g, " ")
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}<>]/gu, "")
    .trim()
  const n = Array.from(t).length
  return n >= 1 && n <= 80 ? t : null
}
