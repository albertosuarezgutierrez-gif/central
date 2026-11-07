import { NextResponse } from 'next/server'
import { leerContexto } from '@/lib/contexto'
import { darAcceso, quitarAcceso } from '@/lib/db'
import { emailValido } from '@/lib/acceso'
import { esUuid } from '@/lib/rls'
import { esHerramienta, normalizarHerramientas, puede, concesionValida } from '@central/core-herramientas'
import { statusDeErrorBd } from '@/lib/operador'

// El DUEÑO da o quita acceso a otras personas en SU empresa (cuenta elegida). La BD vuelve a exigir rol dueño (dar_acceso).
// No se envía ningún correo: la persona entra en empresa.grupoasegura.es con su correo y un código.
export const dynamic = 'force-dynamic'

async function base() {
  const ctx = await leerContexto()
  if (!ctx?.cuenta) return { error: NextResponse.json({ error: 'elige_empresa' }, { status: ctx ? 409 : 401 }) }
  if (!puede(ctx.cuenta.rol, 'dar_acceso')) return { error: NextResponse.json({ error: 'solo_el_dueno_da_acceso' }, { status: 403 }) }
  return { ctx, cuenta: ctx.cuenta }
}

export async function POST(req: Request) {
  const r = await base()
  if ('error' in r) return r.error
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const email = emailValido(b?.email)
  const nombre = typeof b?.nombre === 'string' ? b.nombre.trim().slice(0, 120) : ''
  const rol = b?.rol === 'consulta' || b?.rol === 'admin' || b?.rol === 'empleado' ? b.rol : null
  const hs = rol === 'consulta' ? [] : normalizarHerramientas(b?.herramientas)
  if (!email || nombre.length < 2 || !rol || !hs) return NextResponse.json({ error: 'datos_invalidos' }, { status: 400 })
  if (hs.some((h) => !concesionValida(r.cuenta.herramientas, h))) return NextResponse.json({ error: 'herramienta_no_contratada' }, { status: 422 })
  try {
    await darAcceso(r.ctx.personaId, r.cuenta.id, email, nombre, rol, hs)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const s = statusDeErrorBd(e instanceof Error ? e.message : '')
    return NextResponse.json({ error: s.error }, { status: s.status === 500 ? 403 : s.status })
  }
}

export async function DELETE(req: Request) {
  const r = await base()
  if ('error' in r) return r.error
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!esUuid(b?.personaId)) return NextResponse.json({ error: 'datos_invalidos' }, { status: 400 })
  const h = b?.herramienta == null ? null : esHerramienta(b.herramienta) ? b.herramienta : undefined
  if (h === undefined) return NextResponse.json({ error: 'datos_invalidos' }, { status: 400 })
  try {
    await quitarAcceso(r.ctx.personaId, r.cuenta.id, (b!.personaId as string).toLowerCase(), h)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const s = statusDeErrorBd(e instanceof Error ? e.message : '')
    return NextResponse.json({ error: s.error }, { status: s.status === 500 ? 403 : s.status })
  }
}
