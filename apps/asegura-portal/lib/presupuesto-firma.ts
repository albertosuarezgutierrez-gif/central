/**
 * «Aceptar opción» (ASegura OS): el cliente elige una opción de su presupuesto
 * y la FIRMA con un código a su correo.
 *
 * El portal no escribe en la cartera: pide, manda el código y firma por el
 * puente estrecho de asegura (`/api/portal/presupuesto`), que resuelve la ficha
 * por `portal_vinculo`, prepara el consentimiento y guarda la aceptación.
 *
 * Las respuestas se interpretan en funciones PURAS (probadas sin red). Lo que
 * no se puede permitir: que un 401 por un secreto mal puesto o un corte se
 * pinte como «aceptada» — la persona creería que su póliza se va a emitir y
 * nadie lo habría registrado.
 */
import { MENSAJE_SOLO_CONSULTA, MENSAJE_VARIAS_FICHAS } from './mensajes-ficha.ts'
import { PORTAL_PUENTE_TIEMPO_MS } from './puente-config.ts'

/**
 * Con qué llama el portal al puente: la identidad de la SESIÓN, o —si entró con el código del
 * WhatsApp (07/10/2026)— el token del enlace de ESE presupuesto, sacado de su cookie de acceso
 * (`accesoPuenteDe` de `lib/presupuesto.ts`). Nunca del cuerpo de la petición.
 */
export type AccesoPuente = { identidadId: string } | { tokenWhatsapp: string }

export type ResultadoCodigo =
  | { estado: 'codigo_enviado'; email: string; minutos: number }
  | { estado: 'espera'; segundos: number }
  | { estado: 'no_disponible'; motivo: string }
  /** No se sabe si salió (corte, 5xx, puente sin configurar). */
  | { estado: 'error' }

export type ResultadoFirma =
  /** `aviso`: el texto que compone asegura para Telegram (a Alberto). `null` si no vino. */
  | { estado: 'aceptado'; aceptadoEl: string; aviso: string | null }
  | { estado: 'reintentar'; motivo: string }
  | { estado: 'no_disponible'; motivo: string }
  /** No se sabe si se firmó: que lo mire antes de volver a intentarlo. */
  | { estado: 'error' }

const FECHA = /^\d{4}-\d{2}-\d{2}$/

function obj(j: unknown): Record<string, unknown> {
  return (typeof j === 'object' && j !== null ? j : {}) as Record<string, unknown>
}

const NO_ENCONTRADO = 'Este presupuesto ya no está disponible. Recarga la página.'
const NO_ADMITE = 'Esta opción no se puede aceptar. Escríbeme y te la preparo otra.'

export function interpretarCodigo(status: number, j: unknown): ResultadoCodigo {
  const o = obj(j)
  if (status === 200 && o.estado === 'codigo_enviado' && typeof o.email === 'string' && typeof o.minutos === 'number') {
    return { estado: 'codigo_enviado', email: o.email, minutos: o.minutos }
  }
  if (o.estado === 'espera' && typeof o.segundos === 'number') return { estado: 'espera', segundos: o.segundos }
  if (o.estado === 'limite_codigos') {
    return { estado: 'no_disponible', motivo: 'Hoy ya te hemos mandado varios códigos. Inténtalo mañana o llámanos y lo tramitamos contigo.' }
  }
  if (o.estado === 'varias_fichas') return { estado: 'no_disponible', motivo: MENSAJE_VARIAS_FICHAS }
  if (o.estado === 'sin_permiso') return { estado: 'no_disponible', motivo: MENSAJE_SOLO_CONSULTA }
  if (o.estado === 'no_encontrado' || o.estado === 'sin_ficha') return { estado: 'no_disponible', motivo: NO_ENCONTRADO }
  if (o.estado === 'no_admite') {
    return { estado: 'no_disponible', motivo: typeof o.motivo === 'string' ? o.motivo : NO_ADMITE }
  }
  if (o.estado === 'sin_email') {
    return { estado: 'no_disponible', motivo: 'No tenemos un correo tuyo al que mandarte el código. Llámanos y lo tramitamos contigo.' }
  }
  // `sin_correo_configurado`, `fallo_envio`, 401, corte: el código no ha salido, pero no por algo suyo.
  return { estado: 'error' }
}

export function interpretarFirma(status: number, j: unknown): ResultadoFirma {
  const o = obj(j)
  if (status === 200 && o.estado === 'aceptado' && typeof o.aceptadoEl === 'string' && FECHA.test(o.aceptadoEl)) {
    return { estado: 'aceptado', aceptadoEl: o.aceptadoEl, aviso: typeof o.aviso === 'string' && o.aviso.trim() ? o.aviso : null }
  }
  if (o.estado === 'codigo_incorrecto') {
    const quedan = typeof o.quedan === 'number' ? o.quedan : null
    return {
      estado: 'reintentar',
      motivo: quedan === 0 ? 'Código incorrecto. Pide uno nuevo.' : `Código incorrecto.${quedan === null ? '' : ` Te quedan ${quedan} intento${quedan === 1 ? '' : 's'}.`}`,
    }
  }
  if (o.estado === 'nombre_no_coincide') return { estado: 'reintentar', motivo: 'Escribe tu nombre y apellidos tal como figuran en el documento.' }
  if (o.estado === 'documento_cambiado') return { estado: 'no_disponible', motivo: 'El documento ha cambiado desde que lo abriste. Recarga la página y léelo de nuevo antes de firmar.' }
  if (o.estado === 'codigo_caducado') return { estado: 'reintentar', motivo: 'El código ha caducado. Pide uno nuevo.' }
  if (o.estado === 'sin_codigo' || o.estado === 'demasiados_intentos') return { estado: 'reintentar', motivo: 'Pide un código nuevo para firmar.' }
  if (o.estado === 'invalido') return { estado: 'reintentar', motivo: 'Revisa el código (6 cifras) y tu nombre.' }
  if (o.estado === 'varias_fichas') return { estado: 'no_disponible', motivo: MENSAJE_VARIAS_FICHAS }
  if (o.estado === 'sin_permiso') return { estado: 'no_disponible', motivo: MENSAJE_SOLO_CONSULTA }
  if (o.estado === 'no_encontrado' || o.estado === 'sin_ficha') return { estado: 'no_disponible', motivo: NO_ENCONTRADO }
  if (o.estado === 'no_admite') {
    return { estado: 'no_disponible', motivo: typeof o.motivo === 'string' ? o.motivo : NO_ADMITE }
  }
  if (o.estado === 'sin_precio') return { estado: 'no_disponible', motivo: 'La opción no tiene precio. Escríbeme para revisarla.' }
  // La cuenta la exige el SERVIDOR: sin una válida no se firma, y se le dice qué corregir.
  if (o.estado === 'sin_cuenta' || o.estado === 'iban_invalido') {
    return { estado: 'reintentar', motivo: typeof o.motivo === 'string' && o.motivo.trim() ? o.motivo : MOTIVO_SIN_CUENTA }
  }
  if (o.estado === 'sin_cifrado') {
    return { estado: 'no_disponible', motivo: 'Ahora mismo no podemos guardar tu cuenta de forma segura. Inténtalo más tarde o llámanos.' }
  }
  // La casilla la exige el SERVIDOR: si llega sin marcar, se le pide que la marque.
  if (o.estado === 'sin_confirmar_datos') return { estado: 'reintentar', motivo: MOTIVO_SIN_CASILLA }
  // Fail-closed: datos ilegibles o avisados como incorrectos → no se autoriza nada desde aquí.
  if (o.estado === 'sin_datos') return { estado: 'no_disponible', motivo: typeof o.motivo === 'string' ? o.motivo : MOTIVO_SIN_DATOS }
  if (o.estado === 'datos_en_revision') return { estado: 'no_disponible', motivo: typeof o.motivo === 'string' ? o.motivo : MOTIVO_EN_REVISION }
  return { estado: 'error' }
}

export const MOTIVO_SIN_CUENTA = 'Indica la cuenta en la que quieres domiciliar los recibos: sin ella la compañía no emite la póliza.'
export const MOTIVO_SIN_CASILLA = 'Marca la casilla confirmando que has revisado tus datos: sin ella no se puede aceptar.'
export const MOTIVO_SIN_DATOS =
  'No hemos podido leer los datos con los que se calculó tu precio. Llámanos y lo revisamos contigo: no se emite nada hasta entonces.'
export const MOTIVO_EN_REVISION = 'Te llamamos para corregirlo; no se emite nada hasta entonces.'

function puente(): { base: string; secret: string } | null {
  const base = process.env.ASEGURA_PUENTE_URL
  const secret = process.env.ASEGURA_PORTAL_PUENTE_SECRET
  if (!base || !secret) return null
  return { base: base.replace(/\/+$/, ''), secret }
}

async function llamar(ruta: string, init: RequestInit): Promise<{ status: number; json: unknown } | null> {
  const p = puente()
  if (!p) return null
  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), PORTAL_PUENTE_TIEMPO_MS)
  try {
    const res = await fetch(`${p.base}${ruta}`, {
      ...init,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${p.secret}` },
      cache: 'no-store',
      signal: control.signal,
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch (e) {
    console.error(`[portal/presupuesto] el puente no respondió (${ruta}):`, e instanceof Error ? e.message : e)
    return null
  } finally {
    clearTimeout(reloj)
  }
}

/** Lo que el portal sabe de la cuenta de la ficha: SOLO la máscara («**** 1234»), nunca el IBAN. */
export type CuentaFichaPortal = { mascara: string | null; aviso: 'ilegible' | 'invalida' | 'no_comprobada' | null }
/** Lo que el cliente elige: la de su ficha, u otra que teclea (va al servidor en claro, y solo allí). */
export type EntradaCuenta = { eleccion: 'ficha' } | { eleccion: 'otra'; iban: string }

export type PreparadoAceptacion = {
  estado: 'ok'
  consentimiento: string
  /** La cuenta que va en el documento, enmascarada. */
  cuenta: { origen: 'ficha' | 'nueva'; mascara: string }
  cuentaFicha: CuentaFichaPortal
  /** El texto de la casilla «He revisado mis datos…», el mismo que queda en el documento firmado. */
  confirmacionDatos: string
  documento: string
  documentoHash: string
  anulacion: { compania: string; numeroPoliza: string; fechaEfecto: string; carta: string; advertencia: string | null } | null
  sinAnulacion: string | null
} | {
  /** Aún no ha elegido cuenta (o la que dio no vale): se le enseña la de su ficha enmascarada, o se le pide una. */
  estado: 'elegir_cuenta' | 'sin_cuenta' | 'iban_invalido'
  cuentaFicha: CuentaFichaPortal
  motivo?: string
} | {
  estado: 'no_encontrado' | 'no_admite' | 'sin_precio' | 'sin_ficha' | 'varias_fichas' | 'sin_permiso' | 'sin_datos' | 'datos_en_revision' | 'error'
  motivo?: string
}

const MASCARA = /^\*\*\*\* [A-Z0-9]{4}$/
const AVISOS_CUENTA = ['ilegible', 'invalida', 'no_comprobada'] as const

/** `null` = forma rara. Una máscara que no es «**** XXXX» NO se pinta: podría ser el IBAN entero. */
function leerCuentaFicha(v: unknown): CuentaFichaPortal | null {
  const c = obj(v)
  const mascara = c.mascara === null || c.mascara === undefined ? null : typeof c.mascara === 'string' && MASCARA.test(c.mascara) ? c.mascara : undefined
  if (mascara === undefined) return null
  const aviso = (AVISOS_CUENTA as readonly unknown[]).includes(c.aviso) ? (c.aviso as CuentaFichaPortal['aviso']) : null
  return { mascara, aviso }
}

export function interpretarPreparar(status: number, j: unknown): PreparadoAceptacion | null {
  const o = obj(j)
  if (status === 200 && o.estado === 'ok') {
    // Sin el texto de la casilla no se enseña para firmar: la firma exige confirmarlo.
    if (typeof o.confirmacionDatos !== 'string' || !o.confirmacionDatos.trim()) return null
    if (typeof o.consentimiento !== 'string' || typeof o.documento !== 'string' || !o.documento.trim()
      || typeof o.documentoHash !== 'string' || !/^[0-9a-f]{64}$/.test(o.documentoHash)) return null
    let anulacion: Extract<PreparadoAceptacion, { estado: 'ok' }>['anulacion'] = null
    if (o.anulacion !== null && o.anulacion !== undefined) {
      const a = obj(o.anulacion)
      // Una carta a medias no se enseña para firmar: la huella la cubre y lo firmado tiene que ser lo leído.
      if (typeof a.compania !== 'string' || typeof a.numeroPoliza !== 'string' || typeof a.carta !== 'string' || !a.carta.trim()
        || typeof a.fechaEfecto !== 'string' || !FECHA.test(a.fechaEfecto)) return null
      anulacion = { compania: a.compania, numeroPoliza: a.numeroPoliza, fechaEfecto: a.fechaEfecto, carta: a.carta,
        advertencia: typeof a.advertencia === 'string' ? a.advertencia : null }
    }
    // Sin la cuenta enmascarada no se enseña para firmar: el documento la cita y el servidor la exige.
    const cu = obj(o.cuenta)
    if ((cu.origen !== 'ficha' && cu.origen !== 'nueva') || typeof cu.mascara !== 'string' || !MASCARA.test(cu.mascara)) return null
    const cuentaFicha = leerCuentaFicha(o.cuentaFicha)
    if (!cuentaFicha) return null
    return { estado: 'ok', consentimiento: o.consentimiento, confirmacionDatos: o.confirmacionDatos, documento: o.documento, documentoHash: o.documentoHash, anulacion,
      sinAnulacion: typeof o.sinAnulacion === 'string' ? o.sinAnulacion : null,
      cuenta: { origen: cu.origen, mascara: cu.mascara }, cuentaFicha }
  }
  if (o.estado === 'elegir_cuenta' || o.estado === 'sin_cuenta' || o.estado === 'iban_invalido') {
    const cuentaFicha = leerCuentaFicha(o.cuentaFicha)
    if (!cuentaFicha) return null
    return { estado: o.estado, cuentaFicha, motivo: typeof o.motivo === 'string' ? o.motivo : undefined }
  }
  // Vinculada pero de solo consulta: texto propio (la pantalla pinta `motivo`), no «ya no está disponible».
  if (o.estado === 'sin_permiso') return { estado: 'sin_permiso', motivo: MENSAJE_SOLO_CONSULTA }
  if (o.estado === 'no_encontrado' || o.estado === 'sin_ficha' || o.estado === 'varias_fichas' || o.estado === 'no_admite' || o.estado === 'sin_precio'
    || o.estado === 'sin_datos' || o.estado === 'datos_en_revision') {
    return { estado: o.estado, motivo: typeof o.motivo === 'string' ? o.motivo : undefined }
  }
  // 401, 5xx, corte o forma rara: no se ha podido leer.
  return null
}

export async function prepararAceptacion(
  acceso: AccesoPuente, presupuestoId: string, opcionId: string, cuenta: EntradaCuenta | null = null,
): Promise<PreparadoAceptacion | null> {
  const r = await llamar('/api/portal/presupuesto', {
    method: 'POST', body: JSON.stringify({ accion: 'preparar', ...acceso, presupuestoId, opcionId, ...(cuenta ? { cuenta } : {}) }),
  })
  return r ? interpretarPreparar(r.status, r.json) : null
}

export async function pedirCodigoAceptacion(acceso: AccesoPuente, presupuestoId: string, opcionId: string): Promise<ResultadoCodigo> {
  const r = await llamar('/api/portal/presupuesto', { method: 'POST', body: JSON.stringify({ accion: 'codigo', ...acceso, presupuestoId, opcionId }) })
  if (!r) return { estado: 'error' }
  const res = interpretarCodigo(r.status, r.json)
  if (res.estado === 'error') console.warn('[portal/presupuesto] el código no salió:', r.status, obj(r.json).estado)
  return res
}

export async function firmarAceptacion(
  acceso: AccesoPuente,
  presupuestoId: string,
  opcionId: string,
  datos: {
    codigo: string; nombre: string; documentoHash: string; ip: string | null; userAgent: string | null; datosConfirmados: boolean
    cuenta: EntradaCuenta
    /** El código del correo (por defecto) o el de acceso del WhatsApp. */
    via: 'correo' | 'whatsapp'
  },
): Promise<ResultadoFirma> {
  const r = await llamar('/api/portal/presupuesto', {
    method: 'POST',
    body: JSON.stringify({ accion: 'firmar', ...acceso, presupuestoId, opcionId, ...datos }),
  })
  if (!r) return { estado: 'error' }
  const res = interpretarFirma(r.status, r.json)
  if (res.estado === 'error') console.warn('[portal/presupuesto] respuesta no esperada al firmar:', r.status, obj(r.json).estado)
  return res
}

/**
 * La cuenta que manda el navegador, sin fiarse de nada. `null` = no hay una elección legible. El IBAN
 * se recorta de tamaño y se pasa tal cual: lo valida asegura (módulo 97), que es quien decide.
 */
export function leerEntradaCuenta(v: unknown): EntradaCuenta | null {
  const c = obj(v)
  if (c.eleccion === 'ficha') return { eleccion: 'ficha' }
  if (c.eleccion === 'otra' && typeof c.iban === 'string' && c.iban.trim()) return { eleccion: 'otra', iban: c.iban.trim().slice(0, 64) }
  return null
}

// ─── «Revisa tus datos» ──────────────────────────────────────────────────────
//
// Los datos con los que se CALCULÓ el precio (la petición a la compañía), leídos por asegura. El
// DNI ya llega enmascarado: aquí no se vuelve a tocar. Y la regla que vigila el cepo: si no se han
// podido leer, `listos` es false y la aceptación no se ofrece — el cliente no puede autorizar la
// emisión sobre unos datos que no ha visto.

export type FilaDatoCotizado = { etiqueta: string; valor: string }
export type GrupoDatosCotizados = { titulo: string; filas: FilaDatoCotizado[] }

export type DatosCotizados =
  | { estado: 'ok'; grupos: GrupoDatosCotizados[]; confirmacion: string; enRevision: boolean }
  | { estado: 'sin_datos'; motivo: string; enRevision: boolean }

/** `null` = no se ha podido leer (401, 5xx, corte o forma rara). Se trata igual que `sin_datos`. */
export function interpretarDatosCotizados(status: number, j: unknown): DatosCotizados | null {
  const o = obj(j)
  const enRevision = o.enRevision === true
  if (status === 200 && o.estado === 'sin_datos') {
    return { estado: 'sin_datos', motivo: typeof o.motivo === 'string' && o.motivo.trim() ? o.motivo : MOTIVO_SIN_DATOS, enRevision }
  }
  if (status !== 200 || o.estado !== 'ok' || !Array.isArray(o.datos) || typeof o.confirmacionDatos !== 'string') return null
  const grupos: GrupoDatosCotizados[] = []
  for (const g of o.datos as unknown[]) {
    const x = obj(g)
    if (typeof x.titulo !== 'string' || !Array.isArray(x.filas)) return null
    const filas: FilaDatoCotizado[] = []
    for (const f of x.filas as unknown[]) {
      const y = obj(f)
      if (typeof y.etiqueta !== 'string' || typeof y.valor !== 'string') return null
      filas.push({ etiqueta: y.etiqueta, valor: y.valor })
    }
    if (filas.length > 0) grupos.push({ titulo: x.titulo, filas })
  }
  // Un «ok» sin un solo dato no es algo que se pueda confirmar.
  if (grupos.length === 0) return null
  return { estado: 'ok', grupos, confirmacion: o.confirmacionDatos, enRevision }
}

/** ¿Se puede ofrecer aceptar? Solo con los datos leídos y sin un aviso de error pendiente. */
export function datosListosParaAceptar(d: DatosCotizados | null): boolean {
  return d !== null && d.estado === 'ok' && !d.enRevision
}

export async function datosCotizados(acceso: AccesoPuente, presupuestoId: string): Promise<DatosCotizados | null> {
  const r = await llamar('/api/portal/presupuesto', { method: 'POST', body: JSON.stringify({ accion: 'datos', ...acceso, presupuestoId }) })
  if (!r) return null
  const res = interpretarDatosCotizados(r.status, r.json)
  if (!res) console.warn('[portal/presupuesto] los datos cotizados no se han podido leer:', r.status, obj(r.json).estado)
  return res
}

export type ResultadoReporte =
  /** `aviso`: el Telegram para Alberto que compone asegura. */
  | { estado: 'ok'; aviso: string | null }
  | { estado: 'reintentar'; motivo: string }
  | { estado: 'no_disponible'; motivo: string }
  | { estado: 'error' }

export function interpretarReporte(status: number, j: unknown): ResultadoReporte {
  const o = obj(j)
  if (status === 200 && o.estado === 'ok') return { estado: 'ok', aviso: typeof o.aviso === 'string' && o.aviso.trim() ? o.aviso : null }
  if (o.estado === 'invalido') return { estado: 'reintentar', motivo: 'Cuéntanos en unas palabras qué dato no es correcto.' }
  if (o.estado === 'limite') return { estado: 'no_disponible', motivo: 'Ya nos lo has dicho hoy varias veces: te llamamos. Si es urgente, llámanos tú.' }
  if (o.estado === 'no_admite') return { estado: 'no_disponible', motivo: typeof o.motivo === 'string' ? o.motivo : NO_ADMITE }
  if (o.estado === 'varias_fichas') return { estado: 'no_disponible', motivo: MENSAJE_VARIAS_FICHAS }
  if (o.estado === 'sin_permiso') return { estado: 'no_disponible', motivo: MENSAJE_SOLO_CONSULTA }
  if (o.estado === 'no_encontrado' || o.estado === 'sin_ficha') return { estado: 'no_disponible', motivo: NO_ENCONTRADO }
  return { estado: 'error' }
}

export async function reportarDatosIncorrectos(acceso: AccesoPuente, presupuestoId: string, texto: string): Promise<ResultadoReporte> {
  const r = await llamar('/api/portal/presupuesto', {
    method: 'POST',
    body: JSON.stringify({ accion: 'datos_incorrectos', ...acceso, presupuestoId, texto }),
  })
  if (!r) return { estado: 'error' }
  const res = interpretarReporte(r.status, r.json)
  if (res.estado === 'error') console.warn('[portal/presupuesto] respuesta no esperada al avisar de un dato:', r.status, obj(r.json).estado)
  return res
}

// ─── El código del WHATSAPP en la carátula (07/10/2026) ──────────────────────
//
// El portal no puede comprobarlo él: el rol no tiene GRANT sobre el hash (su única escritura
// concedida es `visto_at`) y el intento hay que reservarlo con una escritura. Lo hace asegura por
// el puente (`acceso_whatsapp`). Aquí solo se interpreta la respuesta, PURO.

export type ResultadoAccesoWhatsapp =
  | { estado: 'valido'; presupuestoId: string }
  | { estado: 'incorrecto'; quedan: number | null }
  | { estado: 'bloqueado' }
  | { estado: 'caducado' }
  /** El enlace no salió por WhatsApp (o se avisó después por correo): que entre con su correo. */
  | { estado: 'sin_codigo' }
  /** El token ya no es de ningún presupuesto vivo (regenerado, retirado o inventado). */
  | { estado: 'no_encontrado' }
  /** Puente sin configurar: 503 `canal_no_disponible`, no «ha fallado». */
  | { estado: 'canal_no_disponible' }
  /** No se sabe qué ha pasado (corte, 5xx, forma rara): 502. */
  | { estado: 'error' }

const UUID_PUENTE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** 🚨 Solo un 200 con `valido` y un id con forma de uuid abre: un 401, un 5xx o un corte NO. */
export function interpretarAccesoWhatsapp(status: number, j: unknown): ResultadoAccesoWhatsapp {
  const o = obj(j)
  if (status === 200 && o.estado === 'valido') {
    return typeof o.presupuestoId === 'string' && UUID_PUENTE.test(o.presupuestoId) ? { estado: 'valido', presupuestoId: o.presupuestoId } : { estado: 'error' }
  }
  if (o.estado === 'incorrecto') return { estado: 'incorrecto', quedan: typeof o.quedan === 'number' ? o.quedan : null }
  if (o.estado === 'bloqueado' || o.estado === 'caducado' || o.estado === 'sin_codigo' || o.estado === 'no_encontrado') return { estado: o.estado }
  return { estado: 'error' }
}

export async function comprobarCodigoWhatsapp(tokenWhatsapp: string, codigo: string): Promise<ResultadoAccesoWhatsapp> {
  if (!puente()) return { estado: 'canal_no_disponible' }
  const r = await llamar('/api/portal/presupuesto', { method: 'POST', body: JSON.stringify({ accion: 'acceso_whatsapp', tokenWhatsapp, codigo }) })
  if (!r) return { estado: 'error' }
  const res = interpretarAccesoWhatsapp(r.status, r.json)
  if (res.estado === 'error') console.warn('[portal/presupuesto] respuesta no esperada al comprobar el código del WhatsApp:', r.status, obj(r.json).estado)
  return res
}
