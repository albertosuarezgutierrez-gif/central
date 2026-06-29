import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { hashPassword } from '@/lib/auth'
import { operadorAutorizado } from '@/lib/operador'

// GET — lista de empresas rrhh para el god-panel (nº empleados + email del responsable).
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const empresas = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT e.id, e.nombre, e.marca_color, e.creada_at,
           COUNT(emp.id)::int AS num_empleados,
           (SELECT u.email FROM rrhh.usuarios_rrhh u WHERE u.empresa_id = e.id ORDER BY u.creada_at ASC LIMIT 1) AS responsable_email
    FROM rrhh.empresas e
    LEFT JOIN rrhh.empleados emp ON emp.empresa_id = e.id
    GROUP BY e.id
    ORDER BY e.creada_at DESC`)
  return NextResponse.json({ empresas: JSON.parse(JSON.stringify(empresas)) })
}

// POST { empresa, color?, responsable_nombre, responsable_email, password } — alta empresa+responsable.
export async function POST(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const empresa = String(b.empresa ?? '').trim()
  const color = b.color ? String(b.color).trim() : null
  const responsableNombre = String(b.responsable_nombre ?? '').trim()
  const email = String(b.responsable_email ?? '').trim().toLowerCase()
  const password = String(b.password ?? '')
  if (!empresa || !responsableNombre || !email) {
    return NextResponse.json({ error: 'Faltan datos (empresa, responsable y email)' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres' }, { status: 400 })
  }

  const dup = await prisma.$queryRaw<any[]>(Prisma.sql`SELECT 1 FROM rrhh.usuarios_rrhh WHERE email = ${email} LIMIT 1`)
  if (dup.length) return NextResponse.json({ error: 'Ya existe un usuario con ese email' }, { status: 409 })

  const pass_hash = await hashPassword(password)
  const id = await prisma.$transaction(async (tx) => {
    const er = await tx.$queryRaw<any[]>(Prisma.sql`INSERT INTO rrhh.empresas (nombre, marca_color) VALUES (${empresa}, ${color}) RETURNING id`)
    const empresaId = er[0].id as string
    await tx.$executeRaw(Prisma.sql`INSERT INTO rrhh.usuarios_rrhh (empresa_id, email, pass_hash, nombre) VALUES (${empresaId}::uuid, ${email}, ${pass_hash}, ${responsableNombre})`)
    return empresaId
  })
  return NextResponse.json({ id, responsable_email: email }, { status: 201 })
}
