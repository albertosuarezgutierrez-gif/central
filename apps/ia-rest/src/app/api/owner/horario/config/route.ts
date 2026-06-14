export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { LIMITES_DEFECTO } from '@central/module-horario'

const DEFECTOS = {
  ...LIMITES_DEFECTO,
  firma_empleado: false,
  avisos_descanso: true,
  aviso_horas_extra: true,
  fichaje_qr: false,
  validar_ip_local: false,
  autocierre_turnos: false,
  recordatorios_push: true,
  coste_personal: false,
  festivos_activo: false,
  ips_local: [] as string[],
  autocierre_horas: 14,
}

// Campos editables (whitelist) → no dejamos colar columnas ajenas.
const NUMERICOS = [
  'jornada_max_diaria', 'jornada_max_semanal', 'descanso_min_entre_jornadas',
  'descanso_semanal_horas', 'tope_extra_anual', 'autocierre_horas',
] as const
const BOOLEANOS = [
  'firma_empleado', 'avisos_descanso', 'aviso_horas_extra', 'fichaje_qr',
  'validar_ip_local', 'autocierre_turnos', 'recordatorios_push', 'coste_personal',
  'festivos_activo',
] as const

// GET /api/owner/horario/config → config del local (con defaults legales si no hay fila).
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const { data } = await supabase.from('config_horario').select('*').eq('local_id', rid).maybeSingle()
  return NextResponse.json({ ok: true, config: { ...DEFECTOS, ...(data ?? {}) } })
}

// POST /api/owner/horario/config → upsert de la config (solo campos whitelisted).
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const body = await req.json().catch(() => ({}))
  const patch: Record<string, unknown> = { local_id: rid, updated_at: new Date().toISOString() }
  for (const k of NUMERICOS) if (body[k] != null && Number.isFinite(Number(body[k]))) patch[k] = Number(body[k])
  for (const k of BOOLEANOS) if (typeof body[k] === 'boolean') patch[k] = body[k]
  if (Array.isArray(body.ips_local)) patch.ips_local = body.ips_local.map((s: unknown) => String(s).trim()).filter(Boolean)

  const { error } = await supabase.from('config_horario').upsert(patch, { onConflict: 'local_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
