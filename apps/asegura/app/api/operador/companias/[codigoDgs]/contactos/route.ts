import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { anotarCambio, auditado } from '@/lib/auditoria'
import { altaContacto } from '@/lib/consulta-compania-bd'
import { correduriaDeLaPeticion } from '@/lib/consulta-compania-ruta'
import { telefonoContacto } from '@/lib/compania-contacto-telefono'
import { areaContacto, leerRamosContacto } from '@central/module-seguros'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ codigoDgs: string }> }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * `POST /api/operador/companias/[codigoDgs]/contactos` (15/10/2026) — alta INLINE de un contacto desde el panel
 * «Consultar a compañías».
 *   { correduriaId?, nombre, email, cargo?, area?, telefono?, ramos?: string[] | null }
 * `email` obligatorio (el contacto existe para escribirle). `ramos` ausente o `null` = sin clasificar. Directorio de
 * REFERENCIA sin `correduria_id`: queda en `auditoria`. → `{ estado: 'ok', contacto }` (201).
 */
export const POST = auditado(async (req: Request, ctx: Ctx) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { codigoDgs } = await ctx.params
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b) return NextResponse.json({ estado: 'invalido', motivo: 'cuerpo JSON requerido' }, { status: 400 })
  const nombre = typeof b.nombre === 'string' ? b.nombre.trim() : ''
  if (nombre === '' || nombre.length > 120) return NextResponse.json({ estado: 'invalido', motivo: 'nombre obligatorio (máx. 120)' }, { status: 400 })
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : ''
  if (!EMAIL.test(email) || email.length > 200) return NextResponse.json({ estado: 'invalido', motivo: 'email no válido' }, { status: 400 })
  const cargo = typeof b.cargo === 'string' && b.cargo.trim() !== '' ? b.cargo.trim().slice(0, 120) : null
  let area: string | null = null
  if (b.area !== undefined && b.area !== null && b.area !== '') {
    area = areaContacto(b.area)
    if (area === null) return NextResponse.json({ estado: 'invalido', motivo: 'área no válida' }, { status: 400 })
  }
  const tel = b.telefono === undefined ? { ok: true as const, telefono: null } : telefonoContacto(b.telefono)
  if (!tel.ok) return NextResponse.json({ estado: 'invalido', motivo: 'teléfono no válido' }, { status: 400 })
  let ramos: string[] | null | undefined = undefined
  if (b.ramos !== undefined) {
    const r = leerRamosContacto(b.ramos)
    if (!r.ok) return NextResponse.json({ estado: 'invalido', motivo: 'ramos no válidos', desconocidos: r.desconocidos }, { status: 400 })
    ramos = r.ramos
  }
  try {
    const c = await correduriaDeLaPeticion(b.correduriaId)
    if (!c.ok) return c.res
    const res = await altaContacto(codigoDgs, { nombre, cargo, area, email, telefono: tel.telefono, ramos })
    if (!res.ok) return NextResponse.json({ estado: res.estado, motivo: res.motivo }, { status: res.status })
    const k = res.contacto
    anotarCambio({ entidad: 'compania_contacto', id: k.id, campo: 'alta', despues: codigoDgs })
    return NextResponse.json(
      { estado: 'ok', contacto: { id: k.id, nombre: k.nombre, cargo: k.cargo, area: k.area, email: k.email, ramos: k.ramos } },
      { status: 201 },
    )
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/companias/contactos', e) }, { status: 500 })
  }
})
