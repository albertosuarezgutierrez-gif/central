// Regularización de RC (03/11/2026): la compañía (hoy Occident) pide al asegurado la FACTURACIÓN REAL del periodo para
// calcular el suplemento. Nosotros PEDIMOS el dato al cliente por un enlace de un solo uso (`/datos/<token>` del portal,
// motivo `regularizacion_rc`), con borrador a Alberto por Telegram y ✅ Enviar / ✏️ Modificar: nada sale sin su botón.
// Responder a la compañía con la cifra es FASE 3 (no está aquí).
//
// Reglas PURAS (sin BD, sin red, sin env): las usan asegura (crear, validar, correo), el portal (formulario) y la
// fase 1 del agente de correo (`peticionRegularizacionDesdeEvento`, para disparar la petición al crear la tarea).

/** Por qué se pide un dato por enlace. `presupuesto` = la `solicitud_datos` de siempre (oportunidad). */
export const MOTIVOS_SOLICITUD = ['presupuesto', 'regularizacion_rc'] as const
export type MotivoSolicitud = (typeof MOTIVOS_SOLICITUD)[number]

/** Días que vale el enlace desde que SALE el correo (no desde el borrador). */
export const DIAS_SOLICITUD_REGULARIZACION = 30

/** Marca del enlace dentro del borrador del correo: se sustituye al ENVIAR (el token no existe antes del ✅). */
export const MARCA_ENLACE = '{{ENLACE}}'

/** Periodo a MESES (`YYYY-MM`): los dos correos de Occident lo escriben distinto (m/aaaa y dd.mm.aaaa) y es el mismo. */
export type PeriodoRegularizacion = { desde: string; hasta: string }

const RE_MES = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/

function aMes(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const m = RE_MES.exec(v.trim())
  if (!m) return null
  const mes = Number(m[2])
  if (mes < 1 || mes > 12) return null
  if (m[3] !== undefined) {
    const d = Number(m[3])
    if (d < 1 || d > 31) return null
  }
  return `${m[1]}-${m[2]}`
}

/**
 * `YYYY-MM` o `YYYY-MM-DD` (desde, hasta) → periodo en meses; también la clave `aaaa-mm_aaaa-mm` del evento de correo.
 * `null` si falta un extremo, no tiene forma o va al revés (un periodo dudoso no abre petición: se pide a mano).
 */
export function normalizarPeriodoRegularizacion(desde: unknown, hasta?: unknown): PeriodoRegularizacion | null {
  if (hasta === undefined && typeof desde === 'string' && desde.includes('_')) {
    const [a, b] = desde.split('_')
    return normalizarPeriodoRegularizacion(a, b)
  }
  const d = aMes(desde)
  const h = aMes(hasta)
  if (!d || !h || d > h) return null
  return { desde: d, hasta: h }
}

/** `2025-06`..`2026-06` → «06/2025 – 06/2026». */
export function textoPeriodo(p: PeriodoRegularizacion): string {
  const f = (m: string) => `${m.slice(5, 7)}/${m.slice(0, 4)}`
  return `${f(p.desde)} – ${f(p.hasta)}`
}

/** Nº de póliza comparable: sin espacios, puntos ni guiones y en mayúsculas. Vacío → `null`. */
export function normalizarNumeroPoliza(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const n = v.toUpperCase().replace(/[\s.\-/]/g, '')
  return /^[A-Z0-9]{4,40}$/.test(n) ? n : null
}

// ─── Lo que contesta el cliente ──────────────────────────────────────────────

/**
 * Lo que teclea una persona en España como importe → número (misma regla que `importe-es.ts` del portal).
 * «1.234,56», «1234,5», «1.234», «320 €» → número; vacío → `null` («no lo ha puesto»); otra cosa → `NaN` (nunca un 0).
 */
export function importeEspanol(texto: string): number | null {
  const limpio = texto.replace(/€/g, '').replace(/\s/g, '')
  if (limpio === '') return null
  let canonico: string
  if (limpio.includes(',')) {
    if (!/^\d{1,3}(\.\d{3})*,\d{1,2}$|^\d+,\d{1,2}$/.test(limpio)) return NaN
    canonico = limpio.replace(/\./g, '').replace(',', '.')
  } else if (/^\d{1,3}(\.\d{3})+$/.test(limpio)) {
    canonico = limpio.replace(/\./g, '')
  } else if (/^\d+(\.\d{1,2})?$/.test(limpio)) {
    canonico = limpio
  } else {
    return NaN
  }
  const n = Number(canonico)
  return Number.isFinite(n) ? n : NaN
}

/** Tope de cordura: 100.000 millones de €. Por encima es un error de tecleo, no una facturación. */
const TOPE_EUR = 100_000_000_000
const TOPE_EMPLEADOS = 1_000_000

export type RespuestaRegularizacion = {
  /** Facturación del periodo en CÉNTIMOS. `0` es un valor (declaró no facturar), no «no lo sé». */
  facturacionCent: number
  /** `null` = no lo ha puesto (opcional), nunca 0. */
  empleados: number | null
  masaSalarialCent: number | null
}

export type ValidacionRegularizacion =
  | { ok: true; respuesta: RespuestaRegularizacion }
  | { ok: false; errores: Partial<Record<'facturacion' | 'empleados' | 'masaSalarial', string>> }

const aCent = (n: number) => Math.round(n * 100)

/** Valida lo que manda el formulario (texto tal cual lo teclea el cliente). PURA. */
export function validarRespuestaRegularizacion(entrada: unknown): ValidacionRegularizacion {
  const o = entrada !== null && typeof entrada === 'object' && !Array.isArray(entrada) ? (entrada as Record<string, unknown>) : {}
  const txt = (k: string) => (typeof o[k] === 'string' ? (o[k] as string) : typeof o[k] === 'number' ? String(o[k]).replace('.', ',') : '')
  const errores: Partial<Record<'facturacion' | 'empleados' | 'masaSalarial', string>> = {}

  const fact = importeEspanol(txt('facturacion'))
  if (fact === null) errores.facturacion = 'Pon la facturación del periodo (sin IVA).'
  else if (Number.isNaN(fact) || fact < 0 || fact > TOPE_EUR) errores.facturacion = 'No entendemos esa cifra. Escríbela así: 125.000,00'

  const empTxt = txt('empleados').replace(/\s/g, '')
  let empleados: number | null = null
  if (empTxt !== '') {
    if (!/^\d{1,7}$/.test(empTxt) || Number(empTxt) > TOPE_EMPLEADOS) errores.empleados = 'Pon un número entero de personas (o déjalo en blanco).'
    else empleados = Number(empTxt)
  }

  const masa = importeEspanol(txt('masaSalarial'))
  if (masa !== null && (Number.isNaN(masa) || masa < 0 || masa > TOPE_EUR)) errores.masaSalarial = 'No entendemos esa cifra. Escríbela así: 48.000,00 (o déjalo en blanco).'

  if (Object.keys(errores).length > 0 || fact === null || Number.isNaN(fact)) return { ok: false, errores }
  return { ok: true, respuesta: { facturacionCent: aCent(fact), empleados, masaSalarialCent: masa === null ? null : aCent(masa) } }
}

/** Céntimos → «2.162,49€» (puntos de miles también en 4 cifras). `null` → «—», nunca «0,00€». */
export function eurDeCentimos(cent: number | null | undefined): string {
  if (cent === null || cent === undefined || !Number.isFinite(cent)) return '—'
  return (cent / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' }) + '€'
}

// ─── El borrador del correo al cliente ───────────────────────────────────────

/** Nombre de la compañía para el texto (solo las que sabemos que piden regularización). */
export function nombreCompania(compania: string | null | undefined): string {
  return /occident/i.test(compania ?? '') ? 'Occident' : 'tu aseguradora'
}

/**
 * Borrador del correo que Alberto aprueba en Telegram. Corto y sin datos sensibles: sin nº de póliza, sin importes ni DNI
 * (el buzón puede ser compartido). Lleva `MARCA_ENLACE` donde irá el enlace (el token se crea al pulsar ✅).
 */
export function borradorCorreoRegularizacion(a: { pila: string | null; compania: string | null; periodo: PeriodoRegularizacion; firmante: string }): { asunto: string; texto: string } {
  const quien = nombreCompania(a.compania)
  const periodo = textoPeriodo(a.periodo)
  const saludo = a.pila?.trim() ? `Hola, ${a.pila.trim()}:` : 'Hola:'
  return {
    asunto: `Regularización de tu seguro de Responsabilidad Civil (${periodo})`,
    texto: [
      saludo,
      '',
      `${quien === 'tu aseguradora' ? 'Tu aseguradora' : quien} nos pide la facturación real de tu actividad en el periodo ${periodo} para regularizar la prima de tu seguro de Responsabilidad Civil.`,
      '',
      `Puedes indicárnosla aquí, te lleva un minuto: ${MARCA_ENLACE}`,
      '',
      'Si lo tienes a mano, puedes adjuntar el resumen anual de IVA (modelo 390) o las cuentas del periodo. Cualquier duda, contesta a este correo.',
      '',
      'Un saludo,',
      a.firmante,
    ].join('\n'),
  }
}

/**
 * El texto definitivo con el enlace. Si Alberto, al modificarlo, borró la marca, el enlace se añade al final: un correo
 * de regularización sin enlace no sirve para nada. El enlace solo puede ser https.
 */
export function textoConEnlace(texto: string, url: string): string {
  if (!/^https:\/\/\S+$/.test(url)) throw new Error('enlace_no_https')
  return texto.includes(MARCA_ENLACE) ? texto.split(MARCA_ENLACE).join(url) : `${texto.trimEnd()}\n\n${url}`
}

/** Texto editado que llega por Telegram → borrador válido, o `null` (vacío, «ok», demasiado largo). */
export function borradorEditadoRegularizacion(texto: string | null | undefined): string | null {
  const t = (texto ?? '').trim()
  if (t.length < 20 || t.length > 4000) return null
  return t
}

// ─── Disparo desde la fase 1 (agente de correo) ──────────────────────────────

/** Forma mínima del evento de suplemento (estructural: no acopla este fichero al lector de correos). */
export type EventoRegularizacionMinimo = {
  compania?: string | null
  tipo?: string
  subtipo?: string | null
  numeroPoliza?: string | null
  periodoDesde?: string | null
  periodoHasta?: string | null
  periodo?: string | null
}

export type PeticionRegularizacion = { numeroPoliza: string; periodoDesde: string; periodoHasta: string; compania: string }

/**
 * Del evento de correo de la compañía al cuerpo de `POST /api/operador/regularizacion-rc` (accion `crear`). `null` = no es
 * una regularización de RC que sepamos pedir (otra compañía, otro suplemento, o sin póliza/periodo legible: se pide a
 * mano). La creación es idempotente por póliza + periodo: un recordatorio del mismo periodo no abre otra petición.
 */
export function peticionRegularizacionDesdeEvento(ev: EventoRegularizacionMinimo | null | undefined): PeticionRegularizacion | null {
  if (!ev || ev.tipo !== 'suplemento' || ev.subtipo !== 'regularizacion_rc') return null
  if (!/occident/i.test(ev.compania ?? '')) return null
  const numero = normalizarNumeroPoliza(ev.numeroPoliza)
  const p = normalizarPeriodoRegularizacion(ev.periodoDesde ?? null, ev.periodoHasta ?? null) ?? (ev.periodo ? normalizarPeriodoRegularizacion(ev.periodo) : null)
  if (!numero || !p) return null
  return { numeroPoliza: numero, periodoDesde: p.desde, periodoHasta: p.hasta, compania: 'occident' }
}

// ─── Estados (los comparte asegura con su CHECK de BD) ──────────────────────

/**
 * `borrador` (correo propuesto en Telegram, SIN token) → `enviando` (reclamada por ✅, con token) → `pendiente` (correo
 * salido, esperando al cliente) → `completada`. `anulada` desde cualquiera salvo completada (❌ o caducada al recrear).
 */
export const ESTADOS_REGULARIZACION = ['borrador', 'enviando', 'pendiente', 'completada', 'anulada'] as const
export type EstadoRegularizacion = (typeof ESTADOS_REGULARIZACION)[number]

// ─── Fase 3: responder a la COMPAÑÍA con la cifra (03/11/2026) ───────────────
//
// Cuando el cliente ha contestado (`completada`), se prepara el BORRADOR de la respuesta a la compañía y va a Alberto por
// Telegram con ✅ Enviar / ✏️ Modificar / 🏁 Resuelta. 🚨 NUNCA se elige el buzón de la compañía solo: Occident escribe
// desde `occidentinforma.com` (avisos sin buzón de respuesta) y su canal oficial es «ingresar el suplemento» en su portal
// de mediadores. Sin buzón elegido por Alberto (de los contactos ACTIVOS de esa compañía en el Directorio) el borrador
// queda con destinatario PENDIENTE y el ✅ no aparece.

/** `null` = aún no se ha preparado respuesta a la compañía. */
export const ESTADOS_RESPUESTA_COMPANIA = ['borrador', 'enviando', 'enviada'] as const
export type EstadoRespuestaCompania = (typeof ESTADOS_RESPUESTA_COMPANIA)[number]

/**
 * Borrador del correo a la compañía con el dato real. La cifra en formato español (`2.162,49€`). Empleados y masa salarial
 * solo si el cliente los puso (`null` = no lo indicó: no se escribe ni «0»). Sin DNI ni contacto del cliente.
 */
export function borradorRespuestaCompania(a: {
  compania: string | null
  numeroPoliza: string | null
  tomador: string | null
  periodo: PeriodoRegularizacion
  respuesta: RespuestaRegularizacion
  conDocumento: boolean
  claveMediador: string | null
  firmante: string
}): { asunto: string; texto: string } {
  const periodo = textoPeriodo(a.periodo)
  const poliza = a.numeroPoliza?.trim() || null
  const tomador = a.tomador?.trim() || null
  const r = a.respuesta
  const datos = [
    `· Facturación del periodo (sin IVA): ${eurDeCentimos(r.facturacionCent)}`,
    ...(r.empleados === null ? [] : [`· Nº de empleados: ${r.empleados}`]),
    ...(r.masaSalarialCent === null ? [] : [`· Masa salarial: ${eurDeCentimos(r.masaSalarialCent)}`]),
  ]
  return {
    asunto: `Regularización RC${poliza ? ` · póliza ${poliza}` : ''}${tomador ? ` · ${tomador}` : ''} · periodo ${periodo}`.slice(0, 200),
    texto: [
      'Buenos días:',
      '',
      `En relación con la regularización de la póliza de Responsabilidad Civil${poliza ? ` nº ${poliza}` : ''}${tomador ? ` (tomador: ${tomador})` : ''}, periodo ${periodo}, os comunicamos el dato real declarado por el asegurado:`,
      '',
      ...datos,
      '',
      ...(a.conDocumento ? ['Adjuntamos la documentación aportada por el asegurado.', ''] : []),
      'Quedamos a la espera del suplemento de regularización. Cualquier duda, contestad a este correo.',
      '',
      'Un saludo,',
      a.firmante,
      ...(a.claveMediador?.trim() ? [`Mediador ${a.claveMediador.trim()}`] : []),
    ].join('\n'),
  }
}

export type EdicionRespuestaCompania = {
  /** `undefined` = no ha puesto «Para:» (se queda el que hubiera); string = el correo que ha escrito (sin validar aún). */
  para: string | undefined
  /** `null` = solo ha cambiado el destinatario (el texto se queda). */
  texto: string | null
}

const RE_PARA = /^\s*para\s*:\s*(\S+)\s*$/i
const RE_EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/i

/**
 * Lo que contesta Alberto al ✏️ de la respuesta a la compañía. Primera línea opcional «Para: correo»; el resto, el texto
 * nuevo (o nada, si solo cambia el destinatario). `null` = no vale (vacío, «Para:» sin correo, texto corto o enorme).
 */
export function leerEdicionRespuestaCompania(entrada: string | null | undefined): EdicionRespuestaCompania | null {
  const t = (entrada ?? '').trim()
  if (!t) return null
  const [primera, ...resto] = t.split(/\r?\n/)
  const m = RE_PARA.exec(primera)
  if (/^\s*para\s*:/i.test(primera) && !m) return null
  const para = m ? m[1].replace(/^<|>$/g, '').toLowerCase() : undefined
  if (para !== undefined && !RE_EMAIL.test(para)) return null
  const cuerpo = (m ? resto.join('\n') : t).trim()
  if (!cuerpo) return para === undefined ? null : { para, texto: null }
  const texto = borradorEditadoRegularizacion(cuerpo)
  if (!texto) return null
  return { para, texto }
}

export type BuzonCompaniaRegularizacion = { id: string; nombre: string; email: string | null; activo: boolean }

/**
 * El buzón que ha escrito Alberto, SOLO si es un contacto ACTIVO de esa compañía en el Directorio (comparación exacta del
 * correo, sin mayúsculas). Un correo tecleado que no está ahí → `null`: no se manda la cifra a una dirección sin verificar.
 */
export function buzonElegido(buzones: readonly BuzonCompaniaRegularizacion[], para: string): BuzonCompaniaRegularizacion | null {
  const objetivo = para.trim().toLowerCase()
  if (!objetivo) return null
  return buzones.find((b) => b.activo && (b.email ?? '').trim().toLowerCase() === objetivo) ?? null
}
