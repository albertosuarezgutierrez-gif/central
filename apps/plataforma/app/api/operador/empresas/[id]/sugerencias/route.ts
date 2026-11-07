import { NextResponse } from 'next/server'
import { getAdmin } from '@/lib/superadmin'
import { fichaCuenta } from '@/lib/adapters/herramientas'
import { buscarAsegura } from '@/lib/correduria-puerto'
import { relacionesAsegura } from '@/lib/relaciones-asegura'
import { sugerirMiembros, relacionesLeidas, cambioDeRelacion } from '@/lib/herramientas-relaciones'

// PUENTE (solo lectura) correduría → «Mi empresa»: busca la ficha de la SOCIEDAD por su CIF en la cartera (puerto de asegura),
// lee sus relaciones y devuelve roles SUGERIDOS + avisos de relaciones que cambiaron. No escribe nada en ningún lado:
// la copia a «Mi empresa» la hace el operador con su clic (acción dueno/acceso con `origen`).
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdmin())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const f = await fichaCuenta((await params).id)
  const cuenta = (f.json as { cuenta?: { cif?: string; miembros?: { persona_id: string; origen?: unknown }[] } } | null)?.cuenta
  if (f.status !== 200 || !cuenta?.cif) return NextResponse.json({ estado: 'sin_cuenta' }, { status: f.status === 200 ? 404 : f.status })
  const b = await buscarAsegura(cuenta.cif)
  if (b.estado !== 'ok') return NextResponse.json({ estado: 'no_se_pudo_leer', motivo: b.estado === 'error' ? b.motivo : b.estado })
  const ids = [...new Set(b.bloques.filter((x) => x.tipo === 'dni').flatMap((x) => x.hallazgos.map((h) => h.clienteId)))]
  if (ids.length !== 1) return NextResponse.json({ estado: ids.length ? 'ambiguo' : 'no_encontrado', candidatos: ids.length })
  const clienteId = ids[0]
  const r = await relacionesAsegura(clienteId)
  const o = (r.json ?? {}) as Record<string, unknown>
  const relaciones = r.status === 200 && o.estado === 'ok' ? relacionesLeidas(o.relaciones) : null
  return NextResponse.json({
    estado: relaciones === null ? 'no_se_pudo_leer' : 'ok',
    clienteId,
    sugerencias: sugerirMiembros(clienteId, relaciones),
    cambios: (cuenta.miembros ?? []).map((m) => ({ personaId: m.persona_id, cambio: cambioDeRelacion(m.origen, relaciones) })).filter((x) => x.cambio && x.cambio.estado !== 'igual'),
  })
}
