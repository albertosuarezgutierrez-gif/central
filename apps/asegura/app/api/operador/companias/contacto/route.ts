import { NextResponse } from 'next/server'
import { areaContacto } from '@central/module-seguros'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada, prismaAsegura } from '@/lib/asegura-db'
import { anotarCambio, auditado } from '@/lib/auditoria'

export const dynamic = 'force-dynamic'

const RE_EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/
const texto = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, max) : null)

/**
 * POST /api/operador/companias/contacto — da de alta UN contacto en el Directorio de compañías
 * (`seguros.compania_contactos`). Lo dispara el botón «✅ Añadir al directorio» del aviso de Telegram
 * «Posible contacto nuevo de aseguradora» (19/10/2026). Cuerpo: `{ companiaCodigoDgs, nombre, email, cargo?, area?, notas? }`.
 *
 * Idempotente por EMAIL (sin mayúsculas, entre los contactos activos de CUALQUIER compañía): si ya existe →
 * `{ estado: 'existia', compania }` y no escribe nada. La compañía tiene que existir y estar activa: esta ruta
 * NUNCA crea compañías. `area` fuera de la lista cerrada → `null` (no se adivina).
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const codigo = texto(b?.companiaCodigoDgs, 16)
    const nombre = texto(b?.nombre, 200)
    const email = texto(b?.email, 254)?.toLowerCase() ?? null
    if (!codigo || !nombre || !email || !RE_EMAIL.test(email)) {
      return NextResponse.json({ estado: 'invalido', error: 'Faltan compañía, nombre o un email válido' }, { status: 400 })
    }
    const db = prismaAsegura()
    const compania = await db.companiaDgs.findFirst({ where: { codigoDgs: codigo, activa: true }, select: { codigoDgs: true, nombreComun: true } })
    if (!compania) return NextResponse.json({ estado: 'compania_desconocida' }, { status: 404 })
    const ya = await db.companiaContacto.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, activo: true },
      select: { id: true, compania: { select: { nombreComun: true } } },
    })
    if (ya) return NextResponse.json({ estado: 'existia', id: ya.id, compania: ya.compania.nombreComun })
    const ultimo = await db.companiaContacto.aggregate({ where: { companiaCodigoDgs: codigo }, _max: { orden: true } })
    const creado = await db.companiaContacto.create({
      data: {
        companiaCodigoDgs: codigo, nombre, email,
        cargo: texto(b?.cargo, 200), area: areaContacto(b?.area), notas: texto(b?.notas, 1000),
        orden: (ultimo._max.orden ?? -1) + 1,
      },
      select: { id: true },
    })
    anotarCambio({ entidad: 'compania_contacto', id: creado.id, campo: 'alta', despues: codigo })
    return NextResponse.json({ estado: 'creado', id: creado.id, compania: compania.nombreComun })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/companias/contacto', e) })
  }
})
