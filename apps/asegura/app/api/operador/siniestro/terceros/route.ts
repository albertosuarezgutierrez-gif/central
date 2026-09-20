import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { anadirTercero, quitarTercero, type ResultadoSiniestro } from '@/lib/cartera-siniestros'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Terceros y testigos de un siniestro, por el puerto de operador.
 *
 *   POST   { siniestroId, tipo, esConductor?, nombre?, telefono?, matricula?,
 *            marcaModelo?, companiaNombre?, numeroPoliza?, actor } → añade uno
 *   DELETE { siniestroId, intervinienteId, actor }                → lo quita
 *
 * Reglas en `@central/module-seguros` (`siniestro-intervinientes.ts`) y BD en
 * `lib/cartera-siniestros.ts`. EXCLUSIVO de siniestros `gestionado_correduria`.
 */
export async function POST(req: Request) {
  return escribir(req, (correduriaId, b) =>
    anadirTercero(correduriaId, {
      siniestroId: cadena(b.siniestroId) ?? '',
      tipo: cadena(b.tipo) ?? '',
      esConductor: typeof b.esConductor === 'boolean' ? b.esConductor : null,
      nombre: cadena(b.nombre),
      telefono: cadena(b.telefono),
      matricula: cadena(b.matricula),
      marcaModelo: cadena(b.marcaModelo),
      companiaNombre: cadena(b.companiaNombre),
      numeroPoliza: cadena(b.numeroPoliza),
      actor: cadena(b.actor) ?? 'plataforma',
    }),
  )
}

export async function DELETE(req: Request) {
  return escribir(req, (correduriaId, b) =>
    quitarTercero(correduriaId, {
      siniestroId: cadena(b.siniestroId) ?? '',
      intervinienteId: cadena(b.intervinienteId) ?? '',
      actor: cadena(b.actor) ?? 'plataforma',
    }),
  )
}

async function escribir(req: Request, accion: (correduriaId: string, body: Record<string, unknown>) => Promise<ResultadoSiniestro>) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ estado: 'invalido', motivo: 'cuerpo no válido' }, { status: 422 })
    const r = await accion(correduria.id, body)
    if (!r.ok) {
      const { ok: _ok, status, ...resto } = r
      void _ok
      return NextResponse.json(resto, { status })
    }
    return NextResponse.json({ estado: 'ok', siniestro: r.siniestro })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/siniestro/terceros', e) }, { status: 500 })
  }
}

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}
