// ============================================================
// GET  /api/clientes-fiscales?nif=B12345&q=empresa
// POST /api/clientes-fiscales  — Crear/actualizar cliente fiscal
// Autocomplete de datos fiscales para emitir facturas completas
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId, getSession } from '@/lib/session'

export const runtime = 'nodejs'

// ── Validación NIF/NIE/CIF español ──────────────────────────
function validarNifEspanol(nif: string): boolean {
  const clean = nif.trim().toUpperCase()
  // CIF: letra + 7 dígitos + dígito/letra
  if (/^[ABCDEFGHJKLMNPQRSUVW]\d{7}[0-9A-J]$/.test(clean)) return true
  // NIF: 8 dígitos + letra
  if (/^\d{8}[TRWAGMYFPDXBNJZSQVHLCKET]$/.test(clean)) {
    const letras = 'TRWAGMYFPDXBNJZSQVHLCKET'
    return clean[8] === letras[parseInt(clean.slice(0, 8)) % 23]
  }
  // NIE: X/Y/Z + 7 dígitos + letra
  if (/^[XYZ]\d{7}[TRWAGMYFPDXBNJZSQVHLCKET]$/.test(clean)) return true
  return false
}

// ── GET — Buscar cliente por NIF o texto ─────────────────────
export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const restaurante_id = getRestauranteId(req)
  const { searchParams } = req.nextUrl

  const nif = searchParams.get('nif')?.trim().toUpperCase()
  const q   = searchParams.get('q')?.trim()

  if (!nif && !q) {
    return NextResponse.json({ clientes: [] })
  }

  let query = supabase
    .from('clientes_fiscales')
    .select('id, nif, razon_social, direccion, email')
    .eq('restaurante_id', restaurante_id)

  if (nif) {
    query = query.eq('nif', nif)
  } else if (q) {
    query = query.or(`razon_social.ilike.%${q}%,nif.ilike.%${q}%`)
  }

  const { data, error } = await query.order('razon_social').limit(10)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ clientes: data ?? [] })
}

// ── POST — Guardar cliente fiscal ────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const restaurante_id = getRestauranteId(req)
  const session = getSession(req)

  if (!session || !['owner', 'jefe_sala'].includes(session.rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  let body: { nif: string; razon_social: string; direccion?: string; email?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }

  const { nif, razon_social, direccion, email } = body

  if (!nif || !razon_social) {
    return NextResponse.json({ error: 'NIF y razón social requeridos' }, { status: 400 })
  }

  if (!validarNifEspanol(nif)) {
    return NextResponse.json({ error: 'NIF/CIF no válido' }, { status: 422 })
  }

  const { data, error } = await supabase
    .from('clientes_fiscales')
    .upsert({
      restaurante_id,
      nif: nif.toUpperCase(),
      razon_social: razon_social.trim(),
      direccion: direccion?.trim() ?? null,
      email: email?.trim() ?? null,
    }, { onConflict: 'restaurante_id,nif' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ cliente: data }, { status: 201 })
}
