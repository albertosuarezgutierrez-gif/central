import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { anotarCambio, auditado } from '@/lib/auditoria'
import { ponerRamosContacto } from '@/lib/consulta-compania-bd'
import { correduriaDeLaPeticion } from '@/lib/consulta-compania-ruta'
import { leerRamosContacto } from '@central/module-seguros'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/**
 * `PATCH /api/operador/compania-contactos/[id]` { correduriaId?, ramos: string[] | null } (15/10/2026)
 *
 * Los ramos que lleva un contacto de compañía. Tres estados: `null` = sin clasificar (NUNCA «todos»), `[]` = revisado
 * y sin ramos, lista = esos ramos (del enum `tipo_seguro`; uno desconocido → 400). El directorio de compañías es una
 * tabla de REFERENCIA sin `correduria_id` (como `GET /api/operador/companias`): el `correduriaId`, si viene, se coteja.
 * No hay ficha de cliente a la que colgarlo: queda en `auditoria` (no en `historial_interno`). Sin el SQL → 503.
 */
export const PATCH = auditado(async (req: Request, ctx: Ctx) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b || !('ramos' in b)) return NextResponse.json({ estado: 'invalido', motivo: 'falta ramos (lista o null)' }, { status: 400 })
  const r = leerRamosContacto(b.ramos)
  if (!r.ok) return NextResponse.json({ estado: 'invalido', motivo: 'ramos no válidos', desconocidos: r.desconocidos }, { status: 400 })
  try {
    const c = await correduriaDeLaPeticion(b.correduriaId)
    if (!c.ok) return c.res
    const res = await ponerRamosContacto(id, r.ramos)
    if (!res.ok) return NextResponse.json({ estado: res.estado, motivo: res.motivo }, { status: res.status })
    anotarCambio({ entidad: 'compania_contacto', id, campo: 'ramos', despues: r.ramos === null ? null : r.ramos.join(',') })
    const k = res.contacto
    return NextResponse.json({ estado: 'ok', contacto: { id: k.id, nombre: k.nombre, cargo: k.cargo, area: k.area, email: k.email, ramos: k.ramos } })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/compania-contactos', e) }, { status: 500 })
  }
})
