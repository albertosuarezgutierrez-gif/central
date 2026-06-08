import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { SignJWT } from 'jose'
import { cookies } from 'next/headers'

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'ialimp-secret-2026')

export async function POST(req: Request) {
  try {
    const { nombre, email, telefono, password, primer_cliente } = await req.json()

    if (!nombre?.trim() || !email?.trim() || !password) {
      return NextResponse.json({ error: 'Nombre, email y contraseña obligatorios' }, { status: 400 })
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Contraseña mínimo 8 caracteres' }, { status: 400 })
    }

    // Verificar que no existe
    const existe = await prisma.$queryRaw<any[]>(Prisma.sql`SELECT id FROM empresas WHERE email = ${email.toLowerCase().trim()}`)
    if (existe.length) return NextResponse.json({ error: 'Este email ya está registrado' }, { status: 409 })

    const hash = await bcrypt.hash(password, 12)

    const empresa = await prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO empresas (nombre, email, password_hash, plan)
      VALUES (${nombre.trim()}, ${email.toLowerCase().trim()}, ${hash}, 'starter')
      RETURNING id, nombre, email
    `)
    const emp = empresa[0]

    // Crear primer cliente si se proporcionó
    if (primer_cliente?.nombre?.trim()) {
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO clientes (empresa_id, nombre, tipo, contacto_email, contacto_tel)
        VALUES (${emp.id}::uuid, ${primer_cliente.nombre.trim()}, 'apartamentos_turisticos', ${primer_cliente.email||null}, ${primer_cliente.telefono||null})
      `)
    }

    // Crear JWT y setear cookie
    const token = await new SignJWT({ empresa_id: emp.id, empresa_email: emp.email, empresa_nombre: emp.nombre })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('30d')
      .sign(SECRET)

    const jar = await cookies()
    jar.set('empresa_token', token, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 30, path: '/' })

    return NextResponse.json({ ok: true, empresa: { id: emp.id, nombre: emp.nombre } }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
