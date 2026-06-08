import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { serialize } from '@/lib/serialize'
import { requireEmpresaId, isOwner, isSuperadmin } from '@/lib/tenant'
import { hashPassword } from '@/lib/auth'

async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(pin)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function GET() {
  try {
    const empresa_id = await requireEmpresaId()
    const usuarios = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ue.id, ue.nombre, ue.email, ue.modulos, ue.activo,
             ue.ultimo_acceso, ue.created_at, ue.limpiadora_id,
             l.nombre AS limpiadora_nombre, l.color AS limpiadora_color
      FROM usuarios_empresa ue
      LEFT JOIN limpiadoras l ON l.id = ue.limpiadora_id
      WHERE ue.empresa_id = ${empresa_id}::uuid
      ORDER BY ue.created_at DESC
    `)
    return NextResponse.json(serialize({ usuarios }))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const empresa_id = await requireEmpresaId()
    if (!await isOwner() && !await isSuperadmin()) {
      return NextResponse.json({ error: 'Solo la dueña puede crear usuarios' }, { status: 403 })
    }

    const { nombre, email, password, modulos = [], pin } = await req.json()

    if (!nombre?.trim() || !email?.trim() || !password?.trim()) {
      return NextResponse.json({ error: 'Nombre, email y contraseña son obligatorios' }, { status: 400 })
    }

    const tieneModuloLimpiadora = modulos.includes('limpiadora')

    // Si tiene módulo limpiadora, el PIN es obligatorio
    if (tieneModuloLimpiadora) {
      if (!pin || pin.length < 4) {
        return NextResponse.json({ error: 'El PIN es obligatorio para el módulo limpieza (mín. 4 dígitos)' }, { status: 400 })
      }
      if (!/^\d+$/.test(pin)) {
        return NextResponse.json({ error: 'El PIN solo puede contener números' }, { status: 400 })
      }
    }

    const passwordHash = await hashPassword(password)
    let pinHashValue: string | null = null
    let limpiadoraId: string | null = null

    if (tieneModuloLimpiadora && pin) {
      pinHashValue = await hashPin(pin)

      // Verificar PIN único en la empresa (en limpiadoras Y en usuarios_empresa)
      const pinEnLimpiadoras = await prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT id FROM limpiadoras
        WHERE empresa_id = ${empresa_id}::uuid AND pin_hash = ${pinHashValue} LIMIT 1
      `)
      const pinEnUsuarios = await prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT id FROM usuarios_empresa
        WHERE empresa_id = ${empresa_id}::uuid AND pin_hash = ${pinHashValue} LIMIT 1
      `)
      if (pinEnLimpiadoras.length > 0 || pinEnUsuarios.length > 0) {
        return NextResponse.json({ error: `El PIN ${pin} ya está en uso. Elige uno diferente.` }, { status: 409 })
      }

      // Crear la limpiadora vinculada automáticamente
      const [nuevaLimp] = await prisma.$queryRaw<any[]>(Prisma.sql`
        INSERT INTO limpiadoras (empresa_id, nombre, pin_hash, activa)
        VALUES (${empresa_id}::uuid, ${nombre.trim()}, ${pinHashValue}, true)
        RETURNING id::text
      `)
      limpiadoraId = nuevaLimp.id
    }

    const result = await prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO usuarios_empresa
        (empresa_id, nombre, email, password_hash, modulos, limpiadora_id, pin_hash)
      VALUES
        (${empresa_id}::uuid, ${nombre.trim()}, ${email.toLowerCase().trim()},
         ${passwordHash}, ${modulos}, ${limpiadoraId ? limpiadoraId + '::uuid' : null},
         ${pinHashValue})
      RETURNING id, nombre, email, modulos, activo, created_at
    `)

    return NextResponse.json(serialize({ ok: true, usuario: result[0] }), { status: 201 })
  } catch (e: any) {
    if (e.message?.includes('unique') || e.message?.includes('duplicate')) {
      return NextResponse.json({ error: 'Email ya en uso' }, { status: 409 })
    }
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const empresa_id = await requireEmpresaId()
    if (!await isOwner() && !await isSuperadmin()) {
      return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
    }

    const { id, nombre, modulos, activo, password, pin } = await req.json()
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

    const tieneModuloLimpiadora = modulos?.includes('limpiadora')

    // Actualizar contraseña si se proporciona
    if (password) {
      const hash = await hashPassword(password)
      await prisma.$executeRaw(Prisma.sql`
        UPDATE usuarios_empresa SET password_hash = ${hash}, updated_at = now()
        WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
      `)
    }

    // Actualizar PIN si se proporciona y tiene módulo limpiadora
    let pinHashValue: string | null = null
    if (tieneModuloLimpiadora && pin) {
      if (pin.length < 4 || !/^\d+$/.test(pin)) {
        return NextResponse.json({ error: 'PIN inválido (mín. 4 dígitos numéricos)' }, { status: 400 })
      }
      pinHashValue = await hashPin(pin)

      // Verificar unicidad excluyendo este usuario
      const pinEnLimpiadoras = await prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT l.id FROM limpiadoras l
        LEFT JOIN usuarios_empresa ue ON ue.limpiadora_id = l.id AND ue.id = ${id}::uuid
        WHERE l.empresa_id = ${empresa_id}::uuid AND l.pin_hash = ${pinHashValue}
          AND ue.id IS NULL
        LIMIT 1
      `)
      const pinEnUsuarios = await prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT id FROM usuarios_empresa
        WHERE empresa_id = ${empresa_id}::uuid AND pin_hash = ${pinHashValue}
          AND id != ${id}::uuid LIMIT 1
      `)
      if (pinEnLimpiadoras.length > 0 || pinEnUsuarios.length > 0) {
        return NextResponse.json({ error: `PIN ${pin} ya en uso. Elige otro.` }, { status: 409 })
      }

      // Actualizar pin_hash en limpiadoras también si está vinculada
      await prisma.$executeRaw(Prisma.sql`
        UPDATE limpiadoras SET pin_hash = ${pinHashValue}
        WHERE id = (
          SELECT limpiadora_id FROM usuarios_empresa
          WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
        ) AND empresa_id = ${empresa_id}::uuid
      `)
    }

    // Si se activa módulo limpiadora y no tenía limpiadora vinculada → crear
    if (tieneModuloLimpiadora) {
      const [actual] = await prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT limpiadora_id, nombre FROM usuarios_empresa
        WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
      `)
      if (!actual.limpiadora_id && pin) {
        const ph = pinHashValue || await hashPin(pin)
        const [nuevaLimp] = await prisma.$queryRaw<any[]>(Prisma.sql`
          INSERT INTO limpiadoras (empresa_id, nombre, pin_hash, activa)
          VALUES (${empresa_id}::uuid, ${actual.nombre}, ${ph}, true)
          RETURNING id::text
        `)
        await prisma.$executeRaw(Prisma.sql`
          UPDATE usuarios_empresa SET limpiadora_id = ${nuevaLimp.id}::uuid
          WHERE id = ${id}::uuid
        `)
      }
    }

    // Si se quita módulo limpiadora → desactivar limpiadora vinculada
    if (!tieneModuloLimpiadora) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE limpiadoras SET activa = false
        WHERE id = (
          SELECT limpiadora_id FROM usuarios_empresa WHERE id = ${id}::uuid
        ) AND empresa_id = ${empresa_id}::uuid
      `)
    }

    await prisma.$executeRaw(Prisma.sql`
      UPDATE usuarios_empresa
      SET nombre  = COALESCE(${nombre ?? null}, nombre),
          modulos = COALESCE(${modulos ?? null}, modulos),
          activo  = COALESCE(${activo ?? null}, activo),
          pin_hash = CASE WHEN ${pinHashValue} IS NOT NULL THEN ${pinHashValue} ELSE pin_hash END,
          updated_at = now()
      WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
    `)

    // Revocar accesos: al desactivar el usuario o quitarle el módulo limpiadora,
    // cortar las sesiones de su limpiadora vinculada al instante.
    if (activo === false || !tieneModuloLimpiadora) {
      await prisma.$executeRaw(Prisma.sql`
        DELETE FROM limpiadora_sessions WHERE limpiadora_id = (
          SELECT limpiadora_id FROM usuarios_empresa WHERE id = ${id}::uuid
        )
      `)
    }
    // Al desactivar el usuario, rotar su jti → invalida su sesión del panel (JWT).
    if (activo === false) {
      await prisma.$executeRaw(Prisma.sql`UPDATE usuarios_empresa SET session_jti = gen_random_uuid()::text WHERE id = ${id}::uuid`)
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const empresa_id = await requireEmpresaId()
    if (!await isOwner() && !await isSuperadmin()) {
      return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
    }
    const { id } = await req.json()
    // Desactivar limpiadora vinculada antes de borrar
    await prisma.$executeRaw(Prisma.sql`
      UPDATE limpiadoras SET activa = false
      WHERE id = (SELECT limpiadora_id FROM usuarios_empresa WHERE id = ${id}::uuid)
        AND empresa_id = ${empresa_id}::uuid
    `)
    await prisma.$executeRaw(Prisma.sql`
      DELETE FROM usuarios_empresa WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
    `)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
