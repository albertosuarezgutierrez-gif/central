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
import { createPrivateKey } from 'node:crypto'

const BASE = process.env.ENABLEBANKING_BASE_URL?.replace(/\/$/, '') || 'https://api.enablebanking.com'

export function disponible(): boolean {
  return !!(process.env.ENABLEBANKING_APP_ID && process.env.ENABLEBANKING_PRIVATE_KEY)
}

let jwtCache: { token: string; exp: number } | null = null

// Firma un JWT RS256 con la clave privada de la app. createPrivateKey acepta tanto
// PKCS#1 ("BEGIN RSA PRIVATE KEY") como PKCS#8 ("BEGIN PRIVATE KEY"). El env puede venir
// con saltos de línea escapados (\n) si se pegó en una sola línea en Vercel.
async function jwt(): Promise<string> {
  if (jwtCache && jwtCache.exp > Date.now() + 60_000) return jwtCache.token
  const appId = process.env.ENABLEBANKING_APP_ID
  const pem = (process.env.ENABLEBANKING_PRIVATE_KEY || '').replace(/\\n/g, '\n')
  if (!appId || !pem) throw new Error('Enable Banking sin configurar')
  const key = createPrivateKey(pem)
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
  if (!res.ok) throw new Error(`EnableBanking ${path} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
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
export type Sesion = { session_id: string; accounts: string[] }
export async function crearSesion(code: string): Promise<Sesion> {
  const j = await api<{ session_id: string; accounts: Array<string | { uid: string }> }>('/sessions', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
  return { session_id: j.session_id, accounts: (j.accounts ?? []).map(a => typeof a === 'string' ? a : a.uid) }
}

// Recupera una sesión ya creada (para el re-sync diario): devuelve sus cuentas (uids).
export async function getSesion(sessionId: string): Promise<Sesion> {
  const j = await api<{ accounts: Array<string | { uid: string }> }>(`/sessions/${sessionId}`)
  return { session_id: sessionId, accounts: (j.accounts ?? []).map(a => typeof a === 'string' ? a : a.uid) }
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

export async function getMovimientos(accountUid: string): Promise<MovEB[]> {
  const out: MovEB[] = []
  let cont: string | undefined
  let guard = 0
  do {
    const qs = cont ? `?continuation_key=${encodeURIComponent(cont)}` : ''
    const j: Transacciones = await api<Transacciones>(`/accounts/${accountUid}/transactions${qs}`)
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
