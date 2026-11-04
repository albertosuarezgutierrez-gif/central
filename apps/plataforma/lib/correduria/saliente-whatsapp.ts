// Registro del «saliente previsto» de WhatsApp (spec 2026-11-04 §4, parte B): cada vez que Alberto pulsa un `wa.me` de
// la correduría, plataforma le dice a asegura qué se ABRIÓ (origen + recibo/oportunidad/solicitud) para que, cuando
// llegue el echo del mensaje enviado desde su móvil, se case con él y la respuesta del cliente se entienda en contexto.
//
// 🚨 Registrar NO es enviar, y NUNCA bloquea el botón: fire-and-forget, sin `await` en el clic, sin lanzar jamás.
// Va por `POST /api/correduria/whatsapp-saliente` (sesión de plataforma), que reenvía a
// `POST {asegura}/api/operador/whatsapp/saliente-previsto` con el Bearer: el navegador no ve el token.
// Sin importaciones de servidor: lo usan componentes `'use client'`.

export const ORIGENES_SALIENTE = ['recibo_devuelto', 'lead', 'recaptacion', 'solicitud_datos', 'presupuesto', 'renovacion', 'generico'] as const
export type OrigenSaliente = (typeof ORIGENES_SALIENTE)[number]

/** Qué se abre: el origen y su ancla. Lo pone quien pinta el botón; el teléfono y el texto, el propio botón. */
export type RegistroSaliente = {
  origen: OrigenSaliente
  clienteId?: string | null
  reciboId?: string | null
  oportunidadId?: string | null
  polizaId?: string | null
  solicitudId?: string | null
}

export type CuerpoSaliente = RegistroSaliente & { telefono: string; texto: string | null }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TELEFONO = /^\+?[\d\s().-]{6,25}$/
const CLAVES_ID = ['clienteId', 'reciboId', 'oportunidadId', 'polizaId', 'solicitudId'] as const

/**
 * El cuerpo para asegura, o `null` si no se puede registrar (se omite en silencio: el wa.me se abre igual).
 * Mismas reglas que `validarSalientePrevisto` de asegura; si falta el ancla que exige el origen, cae a `generico`
 * (mejor un previsto sin ancla que ninguno). PURO.
 */
export function cuerpoSaliente(r: RegistroSaliente, telefono: string | null | undefined, texto: string | null | undefined): CuerpoSaliente | null {
  const tel = (telefono ?? '').trim()
  if (!TELEFONO.test(tel)) return null
  if (!(ORIGENES_SALIENTE as readonly string[]).includes(r.origen)) return null
  const ids: Partial<Record<(typeof CLAVES_ID)[number], string>> = {}
  for (const k of CLAVES_ID) {
    const v = r[k]
    if (typeof v === 'string' && UUID.test(v)) ids[k] = v.toLowerCase()
  }
  const t = typeof texto === 'string' && texto.trim() !== '' ? texto.slice(0, 4000) : null
  let origen: OrigenSaliente = r.origen
  const faltaAncla =
    (origen === 'recibo_devuelto' && !ids.reciboId) ||
    ((origen === 'lead' || origen === 'presupuesto' || origen === 'renovacion') && !ids.oportunidadId) ||
    (origen === 'solicitud_datos' && !ids.solicitudId)
  if (faltaAncla || t === null) origen = 'generico'
  return { origen, telefono: tel, texto: t, ...ids }
}

/** Teléfono y texto de un `https://wa.me/<num>?text=…` ya construido (el de asegura o el nuestro). Sin número → `null`. PURO. */
export function deEnlaceWa(href: string | null | undefined): { telefono: string; texto: string | null } | null {
  if (!href) return null
  try {
    const u = new URL(href)
    if (u.hostname !== 'wa.me' && u.hostname !== 'api.whatsapp.com') return null
    const num = u.hostname === 'wa.me' ? u.pathname.replace(/\//g, '') : (u.searchParams.get('phone') ?? '')
    if (!/^\d{6,20}$/.test(num)) return null
    const texto = u.searchParams.get('text')
    return { telefono: `+${num}`, texto: texto && texto.trim() !== '' ? texto : null }
  } catch {
    return null
  }
}

export const RUTA_SALIENTE = '/api/correduria/whatsapp-saliente'

/**
 * Fire-and-forget desde el navegador. NUNCA lanza ni devuelve una promesa que haya que esperar: si la red, asegura o
 * la migración fallan, el wa.me ya se ha abierto y no pasa nada más. `fetchImpl` se inyecta en los tests.
 */
export function registrarSaliente(
  r: RegistroSaliente | null | undefined,
  telefono: string | null | undefined,
  texto: string | null | undefined,
  fetchImpl: typeof fetch | undefined = typeof fetch === 'function' ? fetch : undefined,
): void {
  try {
    if (!r || !fetchImpl) return
    const cuerpo = cuerpoSaliente(r, telefono, texto)
    if (!cuerpo) return
    void Promise.resolve(
      fetchImpl(RUTA_SALIENTE, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo), keepalive: true }),
    ).catch(() => {})
  } catch {
    /* registrar nunca rompe el botón */
  }
}

/** Igual que `registrarSaliente`, sacando teléfono y texto del `wa.me` ya construido (el del presupuesto). Nunca lanza. */
export function registrarSalienteDeEnlace(r: RegistroSaliente | null | undefined, href: string | null | undefined, fetchImpl?: typeof fetch): void {
  try {
    const wa = deEnlaceWa(href)
    if (wa) registrarSaliente(r, wa.telefono, wa.texto, ...(fetchImpl ? [fetchImpl] : []))
  } catch {
    /* registrar nunca rompe el botón */
  }
}
