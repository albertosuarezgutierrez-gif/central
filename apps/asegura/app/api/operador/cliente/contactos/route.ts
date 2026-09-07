import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { anadirContacto, borrarContacto, cambiarContacto, listarContactos, type ResultadoContacto } from '@/lib/cartera-edicion'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Teléfonos y emails de un cliente por el puerto de operador (plataforma → asegura).
 *
 *   GET    ?id=<clienteId>                                  → { estado:'ok', telefonos, emails }
 *   POST   { clienteId, tipo, valor, etiqueta?, principal?, forzar? } → añade uno
 *   PATCH  { clienteId, id, valor?, principal?, etiqueta?, forzar? } → corrige el valor,
 *                                                            re-etiqueta o hace principal
 *   DELETE { clienteId, id }                                → borra uno
 *
 * Los escribe `lib/cartera-edicion.ts` (cifrado + índice ciego + espejo del
 * principal en `clientes`). Un 409 `conflicto` trae `coincidencias` (qué otra
 * ficha tiene ese dato) y `forzable`: un secundario repetido se puede forzar
 * (matrimonio), un principal repetido no (la columna es única).
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const id = (new URL(req.url).searchParams.get('id') ?? '').trim()
  if (id === '') return NextResponse.json({ estado: 'error', motivo: 'falta id' }, { status: 400 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' })
    const contactos = await listarContactos(correduria.id, id)
    if (contactos === null) return NextResponse.json({ estado: 'no_encontrado' }, { status: 404 })
    return NextResponse.json({ estado: 'ok', ...contactos })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/cliente/contactos', e) })
  }
}

export async function POST(req: Request) {
  return escribir(req, (correduriaId, b) =>
    anadirContacto(correduriaId, cadena(b.clienteId) ?? '', {
      tipo: b.tipo === 'email' ? 'email' : 'telefono',
      valor: b.valor,
      etiqueta: b.etiqueta,
      principal: b.principal === true,
      forzar: b.forzar === true,
      actor: cadena(b.actor) ?? 'plataforma',
    }),
  )
}

export async function PATCH(req: Request) {
  return escribir(req, (correduriaId, b) =>
    cambiarContacto(correduriaId, cadena(b.clienteId) ?? '', {
      id: cadena(b.id) ?? '',
      ...('valor' in b ? { valor: b.valor } : {}),
      ...(b.principal === true ? { principal: true } : {}),
      ...('etiqueta' in b ? { etiqueta: b.etiqueta } : {}),
      forzar: b.forzar === true,
      actor: cadena(b.actor) ?? 'plataforma',
    }),
  )
}

export async function DELETE(req: Request) {
  return escribir(req, (correduriaId, b) =>
    borrarContacto(correduriaId, cadena(b.clienteId) ?? '', { id: cadena(b.id) ?? '', actor: cadena(b.actor) ?? 'plataforma' }),
  )
}

async function escribir(
  req: Request,
  accion: (correduriaId: string, body: Record<string, unknown>) => Promise<ResultadoContacto>,
) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body.clienteId !== 'string') return NextResponse.json({ estado: 'invalido', motivo: 'falta clienteId' }, { status: 422 })
    const r = await accion(correduria.id, body)
    if (!r.ok) {
      const { ok: _ok, status, ...resto } = r
      void _ok
      return NextResponse.json(resto, { status })
    }
    return NextResponse.json({ estado: 'ok', contacto: r.contacto, contactos: r.contactos })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/cliente/contactos', e) }, { status: 500 })
  }
}

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}
