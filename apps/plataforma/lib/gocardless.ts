// Cliente de la API de GoCardless Bank Account Data (antes Nordigen) — Open Banking
// PSD2, plan gratuito. Puro fetch, sin SDK. Lee GOCARDLESS_SECRET_ID/SECRET_KEY del
// entorno; si faltan, `disponible()` es false y los endpoints degradan limpio.
//
// Flujo: token → crear requisition (consentimiento) → el dueño autoriza en su banco →
// requisition.accounts → por cuenta: details (IBAN) + balances + transactions.

const BASE = process.env.GOCARDLESS_BASE_URL?.replace(/\/$/, '') || 'https://bankaccountdata.gocardless.com/api/v2'

export function disponible(): boolean {
  return !!(process.env.GOCARDLESS_SECRET_ID && process.env.GOCARDLESS_SECRET_KEY)
}

let tokenCache: { access: string; exp: number } | null = null

async function token(): Promise<string> {
  if (tokenCache && tokenCache.exp > Date.now() + 30_000) return tokenCache.access
  const res = await fetch(`${BASE}/token/new/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ secret_id: process.env.GOCARDLESS_SECRET_ID, secret_key: process.env.GOCARDLESS_SECRET_KEY }),
  })
  if (!res.ok) throw new Error(`GoCardless token HTTP ${res.status}`)
  const j = await res.json() as { access: string; access_expires: number }
  tokenCache = { access: j.access, exp: Date.now() + (j.access_expires ?? 3600) * 1000 }
  return j.access
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json', Accept: 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`GoCardless ${path} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json() as Promise<T>
}

export type Institucion = { id: string; name: string; bic?: string; logo?: string }
export function listarInstituciones(country = 'ES'): Promise<Institucion[]> {
  return api<Institucion[]>(`/institutions/?country=${encodeURIComponent(country)}`)
}

export type Requisition = { id: string; link: string; accounts: string[]; status: string }
export function crearRequisition(institutionId: string, redirect: string, reference: string): Promise<Requisition> {
  return api<Requisition>('/requisitions/', {
    method: 'POST',
    body: JSON.stringify({ institution_id: institutionId, redirect, reference, user_language: 'ES' }),
  })
}
export function getRequisition(id: string): Promise<Requisition> {
  return api<Requisition>(`/requisitions/${id}/`)
}

export type CuentaDetalle = { account: { iban?: string; name?: string; currency?: string; ownerName?: string } }
export const getDetalleCuenta = (accountId: string) => api<CuentaDetalle>(`/accounts/${accountId}/details/`)

type Saldos = { balances: Array<{ balanceAmount: { amount: string; currency: string }; balanceType: string }> }
export async function getSaldo(accountId: string): Promise<number | null> {
  const j = await api<Saldos>(`/accounts/${accountId}/balances/`)
  const pref = j.balances.find(b => /closingBooked|interimAvailable|expected/i.test(b.balanceType)) ?? j.balances[0]
  return pref ? Number(pref.balanceAmount.amount) : null
}

export type MovGC = {
  transactionId?: string
  bookingDate?: string
  valueDate?: string
  transactionAmount: { amount: string; currency: string }
  remittanceInformationUnstructured?: string
  creditorName?: string
  debtorName?: string
}
type Transacciones = { transactions: { booked: MovGC[]; pending?: MovGC[] } }
export async function getMovimientos(accountId: string): Promise<MovGC[]> {
  const j = await api<Transacciones>(`/accounts/${accountId}/transactions/`)
  return j.transactions?.booked ?? []
}
