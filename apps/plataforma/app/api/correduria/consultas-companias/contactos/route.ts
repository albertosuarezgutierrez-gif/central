import { NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { altaContactoAsegura, editarRamosContactoAsegura } from '@/lib/correduria/consultas-companias-asegura'

export const dynamic = 'force-dynamic'

const txt = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

/** POST { codigoDgs, nombre, cargo?, area?, email, ramos? } → alta inline de un contacto de compañía. */
export async function POST(req: Request) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const c = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const codigoDgs = txt(c?.codigoDgs)
  if (!c || !codigoDgs || !txt(c.nombre) || !txt(c.email)) return NextResponse.json({ estado: 'error', motivo: 'datos_invalidos' }, { status: 400 })
  const cuerpo = {
    nombre: txt(c.nombre), cargo: txt(c.cargo), area: txt(c.area), email: txt(c.email),
    ramos: Array.isArray(c.ramos) ? c.ramos.filter((x) => typeof x === 'string') : null,
  }
  const r = await altaContactoAsegura(codigoDgs, cuerpo, guarda.acceso.correduriaId)
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}

/** PATCH { contactoId, ramos: string[] | null } → los ramos que lleva el contacto (`[]` = revisado, sin ramos; `null` = sin clasificar). */
export async function PATCH(req: Request) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const c = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const contactoId = txt(c?.contactoId)
  if (!c || !contactoId || !(c.ramos === null || Array.isArray(c.ramos))) return NextResponse.json({ estado: 'error', motivo: 'datos_invalidos' }, { status: 400 })
  const ramos = c.ramos === null ? null : (c.ramos as unknown[]).filter((x): x is string => typeof x === 'string')
  const r = await editarRamosContactoAsegura(contactoId, ramos, guarda.acceso.correduriaId)
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
