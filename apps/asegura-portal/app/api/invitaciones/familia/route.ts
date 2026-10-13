import { NextResponse } from 'next/server'

import { crearEnlaceFamiliaDeSesion, resumenFamiliaDeSesion } from '@/lib/invitar-familia-bd'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'

const ESTADO: Record<'sin_enlace' | 'limite_diario' | 'sin_vinculo', number> = {
  sin_enlace: 503, // avería nuestra: no se escribió nada
  limite_diario: 429,
  sin_vinculo: 409,
}

/** Contadores de «Invita a tu familia»: solo cifras, nunca a quién. */
export async function GET() {
  const resumen = await resumenFamiliaDeSesion()
  if (resumen === null) return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  return NextResponse.json({ ...resumen }, { headers: { 'cache-control': 'no-store' } })
}

/**
 * Crea un enlace personal. 🚨 Aquí el enlace SÍ se devuelve a quien lo crea: es lo que va a compartir. No abre
 * sesión ni datos de pólizas (solo presenta el portal). Se guarda hasheado y caduca. La identidad sale de la cookie.
 */
export async function POST() {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  // Un corredor mirando como cliente no crea enlaces (middleware ya veta POST, esto es doble cerrojo).
  if (identidad.corredor) return NextResponse.json({ error: 'modo_corredor' }, { status: 403 })
  const r = await crearEnlaceFamiliaDeSesion()
  if (r === null) return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  if (!r.ok) return NextResponse.json({ error: r.error, mensaje: r.mensaje }, { status: ESTADO[r.error] })
  return NextResponse.json({ ok: true, enlace: r.enlace }, { headers: { 'cache-control': 'no-store' } })
}
