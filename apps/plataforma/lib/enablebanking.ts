// Cliente de la API de Enable Banking — Open Banking PSD2, tier gratuito que SÍ admite
// altas (a diferencia de GoCardless, cuyos registros están cerrados). Puro fetch, sin SDK.
//
// Auth: JWT RS256 firmado con la clave privada de la aplicación (no hay endpoint de token).
// Header { typ:'JWT', alg:'RS256', kid: APP_ID }, payload { iss:'enablebanking.com',
// aud:'api.enablebanking.com', iat, exp }. Lee ENABLEBANKING_APP_ID y
// ENABLEBANKING_PRIVATE_KEY del entorno; si faltan, `disponible()` es false y los
// endpoints degradan limpio.
//
// Flujo: /aspsps (bancos) → POST /auth (consentimiento, devuelve url) → el dueño autoriza
// en su banco → callback con ?code → POST /sessions (canjea code por session_id + cuentas)
// → por cuenta: /details (IBAN) + /balances + /transactions.

import { SignJWT } from 'jose'
import { createPrivateKey, type KeyObject } from 'node:crypto'

const BASE = process.env.ENABLEBANKING_BASE_URL?.replace(/\/$/, '') || 'https://api.enablebanking.com'

export function disponible(): boolean {
  return !!(process.env.ENABLEBANKING_APP_ID && process.env.ENABLEBANKING_PRIVATE_KEY)
}

let jwtCache: { token: string; exp: number } | null = null

// Carga la clave privada desde el valor pegado en la env var de Vercel, tolerando los
// estropicios típicos del copia-pega y devolviendo un KeyObject listo para firmar:
//  - comillas envolventes y saltos escapados (\n / \r\n);
//  - PEM en una sola línea (se reconstruye cabecera/pie + cuerpo base64 a 64);
//  - SIN cabecera PEM: cuerpo base64 suelto → se trata como DER (pkcs8/pkcs1/sec1), o como
//    un PEM re-codificado en base64. Este último es el caso real de Enable Banking cuando
//    se pega solo el cuerpo de la clave sin las líneas -----BEGIN/END-----.
function cargarClavePrivada(raw: string): KeyObject {
  let s = raw.trim()
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) s = s.slice(1, -1)
  s = s.replace(/\\r/g, '').replace(/\\n/g, '\n').trim()

  // Caso A: trae armadura PEM (-----BEGIN ... -----).
  if (s.includes('-----BEGIN')) {
    if (!s.includes('\n')) {
      const m = s.match(/-----BEGIN ([A-Z0-9 ]+?)-----\s*([\s\S]*?)\s*-----END \1-----/)
      if (m) {
        const body = (m[2].replace(/\s+/g, '').match(/.{1,64}/g) ?? []).join('\n')
        s = `-----BEGIN ${m[1].trim()}-----\n${body}\n-----END ${m[1].trim()}-----\n`
      }
    }
    return createPrivateKey(s)
  }

  // Caso B: sin armadura → cuerpo base64 suelto.
  const compact = s.replace(/\s+/g, '')
  const der = Buffer.from(compact, 'base64')
  // (1) ¿es base64 de un PEM completo? Al decodificar aparecerían las líneas -----BEGIN-----.
  const comoTexto = der.toString('utf8')
  if (comoTexto.includes('-----BEGIN')) return createPrivateKey(comoTexto)
  // (2) DER crudo: probar los tres formatos habituales.
  for (const type of ['pkcs8', 'pkcs1', 'sec1'] as const) {
    try { return createPrivateKey({ key: der, format: 'der', type }) } catch { /* siguiente */ }
  }
  // (3) Último intento: envolver el cuerpo como PKCS#8 PEM y dejar que OpenSSL lo intente.
  const pem = `-----BEGIN PRIVATE KEY-----\n${(compact.match(/.{1,64}/g) ?? []).join('\n')}\n-----END PRIVATE KEY-----\n`
  return createPrivateKey(pem)
}

// Firma un JWT RS256 con la clave privada de la app. createPrivateKey acepta tanto
// PKCS#1 ("BEGIN RSA PRIVATE KEY") como PKCS#8 ("BEGIN PRIVATE KEY").
async function jwt(): Promise<string> {
  if (jwtCache && jwtCache.exp > Date.now() + 60_000) return jwtCache.token
  const appId = process.env.ENABLEBANKING_APP_ID
  const raw = process.env.ENABLEBANKING_PRIVATE_KEY || ''
  if (!appId || !raw) throw new Error('Enable Banking sin configurar')
  const key = cargarClavePrivada(raw)
  const iat = Math.floor(Date.now() / 1000)
  const exp = iat + 3600
  const token = await new SignJWT({})
    .setProtectedHeader({ typ: 'JWT', alg: 'RS256', kid: appId })
    .setIssuer('enablebanking.com')
    .setAudience('api.enablebanking.com')
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(key)
  jwtCache = { token, exp: exp * 1000 }
  return token
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await jwt()}`, 'Content-Type': 'application/json', Accept: 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
  })
  // Estado y motivo PRIMERO y la ruta SIN query string al final: los avisos aguas abajo
  // recortan a 160 chars (lib/psd2.ts) y una URL con continuation_key se come el hueco —
  // el aviso del 16/08/2026 llegó sin el código HTTP, que es justo lo que diagnostica.
  if (!res.ok) throw new Error(`EnableBanking HTTP ${res.status}: ${(await res.text()).slice(0, 200)} (${path.split('?')[0]})`)
  return res.json() as Promise<T>
}

// Bancos disponibles en un país. Enable Banking identifica el ASPSP por su `name`
// (no por un id opaco), así que ese `name` es lo que usamos como "institution_id".
export type Aspsp = { name: string; country: string; logo?: string }
export async function listarAspsps(country = 'ES'): Promise<Aspsp[]> {
  const j = await api<{ aspsps: Aspsp[] }>(`/aspsps?country=${encodeURIComponent(country)}`)
  return j.aspsps ?? []
}

// Inicia el consentimiento. Devuelve la url a la que redirigir al dueño (su banco) y un
// authorization_id de referencia. El consentimiento PSD2 caduca (~90 días).
export type AuthInit = { url: string; authorization_id: string }
export function iniciarAuth(aspspName: string, country: string, redirect: string, state: string): Promise<AuthInit> {
  const validUntil = new Date(Date.now() + 89 * 24 * 3600 * 1000).toISOString()
  return api<AuthInit>('/auth', {
    method: 'POST',
    body: JSON.stringify({
      access: { valid_until: validUntil },
      aspsp: { name: aspspName, country },
      state,
      redirect_url: redirect,
      psu_type: 'personal',
    }),
  })
}

// Canjea el `code` del callback por una sesión autenticada con la lista de cuentas (uids).
// `status` es el estado de la sesión según Enable Banking (AUTHORIZED cuando está viva;
// CLOSED/EXPIRED/REVOKED cuando el banco o una re-vinculación la ha invalidado).
export type Sesion = { session_id: string; accounts: string[]; aspsp?: string; status?: string }
export async function crearSesion(code: string): Promise<Sesion> {
  const j = await api<Record<string, unknown>>('/sessions', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
  return { session_id: String(j.session_id ?? ''), accounts: extraerUids(j), aspsp: nombreAspsp(j), status: estadoSesion(j) }
}

// Recupera una sesión ya creada (para el re-sync diario): devuelve sus cuentas (uids).
// Enable Banking devuelve `accounts` como lista de objetos cuenta (con `uid`) o de uids
// string según el endpoint; aceptamos varias formas para no perder ninguna cuenta.
export async function getSesion(sessionId: string): Promise<Sesion> {
  const j = await api<Record<string, unknown>>(`/sessions/${sessionId}`)
  return { session_id: sessionId, accounts: extraerUids(j), aspsp: nombreAspsp(j), status: estadoSesion(j) }
}

function estadoSesion(j: Record<string, unknown>): string | undefined {
  return typeof j.status === 'string' ? j.status : undefined
}

function nombreAspsp(j: Record<string, unknown>): string | undefined {
  const a = j.aspsp as Record<string, unknown> | undefined
  return typeof a?.name === 'string' ? a.name : undefined
}

// Extrae los uid de cuenta de una respuesta de sesión, tolerando las variantes de la API:
// accounts: [uid] | [{uid}] | [{account:{uid}}]; o accounts_data: [{uid}]; o accounts: [{id}].
function extraerUids(j: Record<string, unknown>): string[] {
  const fuentes = [j.accounts, (j as Record<string, unknown>).accounts_data].filter(Array.isArray) as unknown[][]
  const uids: string[] = []
  for (const arr of fuentes) {
    for (const a of arr) {
      if (typeof a === 'string') { uids.push(a); continue }
      if (a && typeof a === 'object') {
        const o = a as Record<string, unknown>
        const uid = o.uid ?? o.id ?? (o.account as Record<string, unknown> | undefined)?.uid
        if (typeof uid === 'string') uids.push(uid)
      }
    }
  }
  return [...new Set(uids)]
}

export type CuentaDetalle = { iban?: string; nombre?: string; divisa?: string }
export async function getDetalleCuenta(accountUid: string): Promise<CuentaDetalle> {
  const j = await api<{ account_id?: { iban?: string }; name?: string; product?: string; currency?: string }>(`/accounts/${accountUid}/details`)
  return { iban: j.account_id?.iban, nombre: j.name || j.product, divisa: j.currency }
}

// Saldo. Enable Banking usa códigos ISO de balance_type: CLBD (closing booked),
// ITAV (interim available), XPCD (expected). Preferimos disponible/cierre.
type Saldos = { balances: Array<{ balance_amount: { amount: string; currency: string }; balance_type: string }> }
export async function getSaldo(accountUid: string): Promise<number | null> {
  const j = await api<Saldos>(`/accounts/${accountUid}/balances`)
  const pref = j.balances?.find(b => /CLBD|ITAV|XPCD|CLAV/i.test(b.balance_type)) ?? j.balances?.[0]
  return pref ? Number(pref.balance_amount.amount) : null
}

// Movimiento ya normalizado: importe con signo (DBIT = negativo) y concepto legible.
export type MovEB = {
  entryReference?: string
  bookingDate?: string
  valueDate?: string
  importe: number
  concepto: string
  contraparte: string
}
type MovRaw = {
  entry_reference?: string
  booking_date?: string
  value_date?: string
  transaction_date?: string
  transaction_amount: { amount: string; currency: string }
  credit_debit_indicator?: 'CRDT' | 'DBIT'
  remittance_information?: string[]
  creditor?: { name?: string }
  debtor?: { name?: string }
}
type Transacciones = { transactions: MovRaw[]; continuation_key?: string }

// ── PIS (Payment Initiation Services) ────────────────────────────────────────
// Activado mediante la env flag EB_PIS_ENABLED=true en Vercel.
// Los pagos requieren SCA: el dueño debe autorizar en su banco vía `auth_url`.
// El mismo JWT RS256 de AIS vale para PIS — sin credenciales adicionales.

export function disponiblePis(): boolean {
  return disponible() && process.env.EB_PIS_ENABLED === 'true'
}

export type PagoEB = {
  payment_id: string
  auth_url: string
}

export async function iniciarPago(params: {
  debtorIban: string
  creditorName: string
  creditorIban: string
  importe: number
  concepto: string
  redirectUrl: string
}): Promise<PagoEB> {
  const j = await api<{ payment_id?: string; payment_request_id?: string; links?: { href?: string }[] }>('/v3/payments', {
    method: 'POST',
    body: JSON.stringify({
      payment_product: 'sepa-credit-transfers',
      debtor_account: { iban: params.debtorIban.replace(/\s/g, '') },
      creditor_account: { iban: params.creditorIban.replace(/\s/g, '') },
      creditor_name: params.creditorName,
      instructed_amount: { amount: params.importe.toFixed(2), currency: 'EUR' },
      remittance_information_unstructured: params.concepto.slice(0, 140),
      redirect_url: params.redirectUrl,
    }),
  })
  const paymentId = String(j.payment_id ?? j.payment_request_id ?? '')
  const authUrl = j.links?.find((l: any) => l.href)?.href ?? ''
  if (!paymentId || !authUrl) throw new Error('Enable Banking PIS: respuesta inesperada')
  return { payment_id: paymentId, auth_url: authUrl }
}

export type EstadoPagoEB = 'RCVD' | 'PDNG' | 'ACSC' | 'RJCT' | string

export async function estadoPago(paymentId: string): Promise<EstadoPagoEB> {
  const j = await api<{ transaction_status?: string; status?: string }>(`/v3/payments/${paymentId}`)
  return (j.transaction_status ?? j.status ?? 'DESCONOCIDO') as EstadoPagoEB
}

export async function getMovimientos(accountUid: string, dateFromOverride?: string): Promise<MovEB[]> {
  const out: MovEB[] = []
  // Enable Banking exige un rango de fechas para las transacciones; sin date_from devuelve
  // vacío. Por defecto ~89 días para el sync diario. Pasa dateFromOverride para importar
  // histórico desde una fecha concreta (p. ej. "2026-01-01").
  const dateFrom = dateFromOverride ?? new Date(Date.now() - 89 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  let cont: string | undefined
  let guard = 0
  do {
    const p = new URLSearchParams({ date_from: dateFrom })
    if (cont) p.set('continuation_key', cont)
    const j: Transacciones = await api<Transacciones>(`/accounts/${accountUid}/transactions?${p.toString()}`)
    for (const m of j.transactions ?? []) {
      const abs = Math.abs(Number(m.transaction_amount.amount))
      if (!Number.isFinite(abs)) continue
      const importe = m.credit_debit_indicator === 'DBIT' ? -abs : abs
      const contraparte = (m.creditor?.name || m.debtor?.name || '').trim()
      const concepto = ((m.remittance_information ?? []).join(' ').trim() || contraparte)
      out.push({
        entryReference: m.entry_reference,
        bookingDate: m.booking_date || m.transaction_date,
        valueDate: m.value_date || m.booking_date,
        importe,
        concepto,
        contraparte,
      })
    }
    cont = j.continuation_key
  } while (cont && ++guard < 20)
  return out
}
