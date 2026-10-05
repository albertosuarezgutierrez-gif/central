import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada, prismaAsegura } from '@/lib/asegura-db'
import { anotarCambio, auditado } from '@/lib/auditoria'
import { telefonoContacto } from '@/lib/compania-contacto-telefono'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/**
 * PATCH /api/operador/companias/contacto/[id] — marca `ultimo_contacto_en`
 * a AHORA. Lo dispara plataforma cuando Alberto pulsa el botón de WhatsApp
 * o de correo sobre un contacto (best-effort: si esto falla, el botón de
 * WhatsApp/mail igual se ha abierto — no bloquea nada).
 *
 * `{ accion: 'telefono', telefono: string | null }` (05/10/2026) — pone o quita el teléfono del
 * contacto, validado y guardado en E.164 (`lib/compania-contacto-telefono.ts`). Texto que no es un
 * teléfono → 400 y no se toca nada. Es el teléfono de los contactos 🔵 de Google Contacts.
 */
export const PATCH = auditado(async (req: Request, ctx: Ctx) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (body?.accion === 'telefono') {
      const t = telefonoContacto(body.telefono)
      if (!t.ok) return NextResponse.json({ estado: 'invalido', motivo: t.motivo, error: 'Teléfono no válido' }, { status: 400 })
      const r = await prismaAsegura().companiaContacto.updateMany({
        where: { id },
        data: { telefono: t.telefono, updatedAt: new Date() },
      })
      if (r.count === 0) return NextResponse.json({ estado: 'no_encontrado' }, { status: 404 })
      // Teléfono de una persona: no está en CAMPOS_CON_VALOR, así que consta como «tocado» sin valor.
      anotarCambio({ entidad: 'compania_contacto', id, campo: 'telefono', despues: t.telefono })
      return NextResponse.json({ estado: 'ok', telefono: t.telefono })
    }
    if (body?.accion !== 'contactado') {
      return NextResponse.json({ error: 'acción desconocida' }, { status: 400 })
    }
    await prismaAsegura().companiaContacto.update({
      where: { id },
      data: { ultimoContactoEn: new Date() },
    })
    return NextResponse.json({ estado: 'ok' })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/companias/contacto', e) })
  }
})
