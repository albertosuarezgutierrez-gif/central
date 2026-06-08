import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'
import { serialize } from '@/lib/serialize'

const ALLOWED_KEYS = [
  'tipos_servicio_op', 'categorias_stock', 'unidades_stock', 'tipos_lenceria',
  'tipos_cliente', 'categorias_incidencia', 'niveles_urgencia', 'estados_lead', 'tipos_expediente_rrhh'
] as const

type AllowedKey = typeof ALLOWED_KEYS[number]

const DEFAULTS: Record<AllowedKey, any[]> = {
  tipos_servicio_op: [
    { id: 'rotacion',      label: 'Rotación',     emoji: '🔄', desc: 'Entre huéspedes',    activo: true },
    { id: 'profunda',      label: 'Profunda',      emoji: '🧽', desc: 'Limpieza a fondo',   activo: true },
    { id: 'comunidad',     label: 'Comunidad',     emoji: '🏢', desc: 'Zonas comunes',      activo: true },
    { id: 'obra',          label: 'Final obra',    emoji: '🏗️', desc: 'Post-construcción', activo: true },
    { id: 'mantenimiento', label: 'Mantenimiento', emoji: '🔧', desc: 'Revisión y orden',  activo: true },
    { id: 'particular',    label: 'Particular',    emoji: '🏡', desc: 'Casa o piso',        activo: true },
    { id: 'oficina',       label: 'Oficina',       emoji: '💼', desc: 'Local o empresa',   activo: true },
  ],
  categorias_stock: [
    { id: 'limpieza',    label: 'Limpieza',    emoji: '🧴', activo: true },
    { id: 'lenceria',    label: 'Lencería',    emoji: '🛏️', activo: true },
    { id: 'consumible',  label: 'Consumible',  emoji: '🧻', activo: true },
    { id: 'herramienta', label: 'Herramienta', emoji: '🧹', activo: true },
  ],
  unidades_stock: [
    { id: 'unidad', label: 'Unidad' },
    { id: 'kg',     label: 'Kg'    },
    { id: 'litro',  label: 'Litro' },
    { id: 'rollo',  label: 'Rollo' },
    { id: 'pack',   label: 'Pack'  },
    { id: 'caja',   label: 'Caja'  },
    { id: 'par',    label: 'Par'   },
  ],
  tipos_lenceria: [
    { id: 'sabanas_dobles',       label: 'Sábanas dobles',       emoji: '🛏️', activo: true },
    { id: 'sabanas_individuales', label: 'Sábanas individuales', emoji: '🛏️', activo: true },
    { id: 'fundas',               label: 'Fundas nórdicas',      emoji: '🛏️', activo: true },
    { id: 'toallas_bano',         label: 'Toallas de baño',      emoji: '🛁', activo: true },
    { id: 'toallas_mano',         label: 'Toallas de mano',      emoji: '🤝', activo: true },
    { id: 'toallas_piscina',      label: 'Toallas piscina',      emoji: '🏊', activo: true },
  ],
  tipos_cliente: [
    { id: 'apartamentos_turisticos', label: 'Aptos. turísticos', emoji: '🏠', color: '#6366f1', activo: true },
    { id: 'particular',              label: 'Casa particular',   emoji: '🏡', color: '#ec4899', activo: true },
    { id: 'comunidad',               label: 'Comunidad',         emoji: '🏢', color: '#0ea5e9', activo: true },
    { id: 'empresa',                 label: 'Empresa',           emoji: '💼', color: '#f59e0b', activo: true },
    { id: 'oficina',                 label: 'Oficina',           emoji: '🖥️', color: '#8b5cf6', activo: true },
    { id: 'hotel',                   label: 'Hotel',             emoji: '🏨', color: '#10b981', activo: true },
    { id: 'otro',                    label: 'Otro',              emoji: '📋', color: '#64748b', activo: true },
  ],
  categorias_incidencia: [
    { id: 'limpieza',      label: 'Limpieza',         emoji: '🧹', activo: true },
    { id: 'mantenimiento', label: 'Mantenimiento',    emoji: '🔧', activo: true },
    { id: 'material',      label: 'Material / Stock', emoji: '📦', activo: true },
    { id: 'acceso',        label: 'Acceso / Llaves',  emoji: '🔑', activo: true },
    { id: 'huesped',       label: 'Huésped',          emoji: '👤', activo: true },
    { id: 'otro',          label: 'Otro',             emoji: '❓', activo: true },
  ],
  niveles_urgencia: [
    { id: 'normal',  label: 'Normal',  color: '#64748b', activo: true },
    { id: 'urgente', label: 'Urgente', color: '#dc2626', activo: true },
  ],
  estados_lead: [
    { id: 'nuevo',             label: 'Nuevo',             color: '#6366f1', activo: true },
    { id: 'contactado',        label: 'Contactado',        color: '#d97706', activo: true },
    { id: 'propuesta_enviada', label: 'Propuesta enviada', color: '#7c3aed', activo: true },
    { id: 'presupuestado',     label: 'Presupuestado',     color: '#0891b2', activo: true },
    { id: 'ganado',            label: 'Ganado ✅',          color: '#16a34a', activo: true },
    { id: 'perdido',           label: 'Perdido',           color: '#dc2626', activo: true },
  ],
  tipos_expediente_rrhh: [
    { id: 'amonestacion', label: 'Amonestación', emoji: '⚠️', activo: true },
    { id: 'sancion',      label: 'Sanción',       emoji: '🔴', activo: true },
    { id: 'felicitacion', label: 'Felicitación',  emoji: '⭐', activo: true },
    { id: 'formacion',    label: 'Formación',     emoji: '📚', activo: true },
    { id: 'baja',         label: 'Baja médica',   emoji: '🏥', activo: true },
    { id: 'otro',         label: 'Otro',          emoji: '📋', activo: true },
  ],
}

export async function GET() {
  try {
    const empresa_id = await requireEmpresaId()
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT tipos_servicio_op, categorias_stock, unidades_stock, tipos_lenceria,
             tipos_cliente, categorias_incidencia, niveles_urgencia, estados_lead, tipos_expediente_rrhh
      FROM cotizador_config
      WHERE empresa_id = ${empresa_id}::uuid
      LIMIT 1
    `)

    // Si no hay config o está vacía, crear con defaults
    if (!rows.length || !rows[0].tipos_servicio_op?.length) {
      for (const key of ALLOWED_KEYS) {
        const val = JSON.stringify(DEFAULTS[key])
        await prisma.$executeRaw(Prisma.sql`
          INSERT INTO cotizador_config (empresa_id)
          VALUES (${empresa_id}::uuid)
          ON CONFLICT (empresa_id) DO NOTHING
        `)
        // Actualizar solo si está vacío
        await prisma.$executeRaw(
          Prisma.sql`UPDATE cotizador_config
            SET updated_at = now()
            WHERE empresa_id = ${empresa_id}::uuid
              AND (${Prisma.raw(key)} IS NULL OR ${Prisma.raw(key)} = '[]'::jsonb)`
        )
      }
      return NextResponse.json(serialize({ catalogos: DEFAULTS }))
    }

    // Rellenar los que estén vacíos con defaults
    const catalogos: any = {}
    for (const key of ALLOWED_KEYS) {
      catalogos[key] = rows[0][key]?.length ? rows[0][key] : DEFAULTS[key]
    }

    return NextResponse.json(serialize({ catalogos }))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PATCH — actualizar un catálogo específico
// Recibe { key: AllowedKey, data: any[] }
// O puede recibir múltiples keys directamente en el body
export async function PATCH(req: NextRequest) {
  try {
    const empresa_id = await requireEmpresaId()
    const body = await req.json()

    // Asegurar que existe la fila
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO cotizador_config (empresa_id)
      VALUES (${empresa_id}::uuid)
      ON CONFLICT (empresa_id) DO NOTHING
    `)

    // Actualizar cada campo permitido que venga en el body
    for (const key of ALLOWED_KEYS) {
      if (body[key] !== undefined) {
        const val = JSON.stringify(body[key])
        // Usamos queries individuales por campo para evitar SQL dinámico
        if (key === 'tipos_servicio_op') {
          await prisma.$executeRaw(Prisma.sql`UPDATE cotizador_config SET tipos_servicio_op = ${val}::jsonb, updated_at = now() WHERE empresa_id = ${empresa_id}::uuid`)
        } else if (key === 'categorias_stock') {
          await prisma.$executeRaw(Prisma.sql`UPDATE cotizador_config SET categorias_stock = ${val}::jsonb, updated_at = now() WHERE empresa_id = ${empresa_id}::uuid`)
        } else if (key === 'unidades_stock') {
          await prisma.$executeRaw(Prisma.sql`UPDATE cotizador_config SET unidades_stock = ${val}::jsonb, updated_at = now() WHERE empresa_id = ${empresa_id}::uuid`)
        } else if (key === 'tipos_lenceria') {
          await prisma.$executeRaw(Prisma.sql`UPDATE cotizador_config SET tipos_lenceria = ${val}::jsonb, updated_at = now() WHERE empresa_id = ${empresa_id}::uuid`)
        } else if (key === 'tipos_cliente') {
          await prisma.$executeRaw(Prisma.sql`UPDATE cotizador_config SET tipos_cliente = ${val}::jsonb, updated_at = now() WHERE empresa_id = ${empresa_id}::uuid`)
        } else if (key === 'categorias_incidencia') {
          await prisma.$executeRaw(Prisma.sql`UPDATE cotizador_config SET categorias_incidencia = ${val}::jsonb, updated_at = now() WHERE empresa_id = ${empresa_id}::uuid`)
        } else if (key === 'niveles_urgencia') {
          await prisma.$executeRaw(Prisma.sql`UPDATE cotizador_config SET niveles_urgencia = ${val}::jsonb, updated_at = now() WHERE empresa_id = ${empresa_id}::uuid`)
        } else if (key === 'estados_lead') {
          await prisma.$executeRaw(Prisma.sql`UPDATE cotizador_config SET estados_lead = ${val}::jsonb, updated_at = now() WHERE empresa_id = ${empresa_id}::uuid`)
        } else if (key === 'tipos_expediente_rrhh') {
          await prisma.$executeRaw(Prisma.sql`UPDATE cotizador_config SET tipos_expediente_rrhh = ${val}::jsonb, updated_at = now() WHERE empresa_id = ${empresa_id}::uuid`)
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
