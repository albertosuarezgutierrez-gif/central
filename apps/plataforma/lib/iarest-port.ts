// Puerto HTTP plataforma → ia-rest (god-panel). ia-rest no comparte BD con plataforma:
// sus datos vivos se leen en vivo por HTTP, autenticando con `Authorization: Bearer
// OPERADOR_SHARED_SECRET` (el MISMO valor debe existir en los proyectos Vercel
// `plataforma` e `ia-rest`).
//
// Este módulo consolida el helper que antes estaba duplicado en cada ruta de
// `app/api/admin/iarest/**`. El mapeo de errores (puro, testeable) vive en
// `iarest-port-core.ts`; aquí solo se envuelve en NextResponse.
import { NextResponse } from 'next/server'
import { iarestErrorPayload } from './iarest-port-core'

const base = () => (process.env.IAREST_URL ?? '').replace(/\/$/, '')
const secret = () => process.env.OPERADOR_SHARED_SECRET ?? ''

// Llama a ia-rest con el Bearer del puerto. Devuelve la Response, o `null` si falta
// la configuración en plataforma (IAREST_URL / OPERADOR_SHARED_SECRET) o la red falla.
export async function fetchIarest(path: string, init?: RequestInit): Promise<Response | null> {
  const b = base()
  const s = secret()
  if (!b || !s) return null
  try {
    return await fetch(`${b}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${s}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    })
  } catch {
    return null
  }
}

// Normaliza el fallo del puerto a un 502 con mensaje accionable. NUNCA devuelve 401.
export async function iarestError(res: Response | null): Promise<NextResponse> {
  const { status, error } = await iarestErrorPayload(res)
  return NextResponse.json({ error }, { status })
}
