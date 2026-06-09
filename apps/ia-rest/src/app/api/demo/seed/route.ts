/**
 * POST /api/demo/seed
 *
 * Crea (o verifica) el restaurante demo "Bar Demo" con datos de prueba.
 * Protegido por DEMO_SEED_SECRET — sin esa env var, responde 403.
 * Idempotente: si el restaurante ya existe (slug='demo'), devuelve sus datos.
 *
 * Uso:
 *   curl -X POST https://<host>/api/demo/seed \
 *        -H "Content-Type: application/json" \
 *        -d '{"secret":"<DEMO_SEED_SECRET>"}'
 */
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

const DEMO_SLUG = 'demo'
const DEMO_CODE = 'DEMO'

export async function POST(req: NextRequest) {
  // Protección
  const secret = process.env.DEMO_SEED_SECRET
  if (!secret) return NextResponse.json({ error: 'DEMO_SEED_SECRET no configurado' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  if (body.secret !== secret) {
    return NextResponse.json({ error: 'Secret incorrecto' }, { status: 403 })
  }

  const supabase = createServerClient()

  // ── 1. Restaurante (idempotente por slug) ─────────────────────────────────
  let restauranteId: string

  const { data: existing } = await supabase
    .from('restaurantes')
    .select('id')
    .eq('slug', DEMO_SLUG)
    .maybeSingle()

  if (existing?.id) {
    restauranteId = existing.id
  } else {
    const { data: rest, error: restErr } = await supabase
      .from('restaurantes')
      .insert({
        nombre:          'Bar Demo ia.rest',
        slug:            DEMO_SLUG,
        codigo_acceso:   DEMO_CODE,
        plan:            'starter',
        plan_status:     'active',
        activo:          true,
        ciudad:          'Sevilla',
        modulos_activos: [
          'voz','mesas','comandas','cobro','impresion','turnos',
          'kds','supervisor','qr','storefront','contabilidad','analytics',
        ],
        configuracion: { demo: true, maitre_ia: { activo: true } },
      })
      .select('id')
      .single()

    if (restErr || !rest?.id) {
      return NextResponse.json({ error: restErr?.message ?? 'Error creando restaurante' }, { status: 500 })
    }
    restauranteId = rest.id
  }

  // ── 2. Personal (4 perfiles demo) ─────────────────────────────────────────
  const personal = [
    { nombre: 'Alberto (Admin)',  pin: '1234', rol: 'jefe_sala',  activo: true },
    { nombre: 'María',            pin: '2222', rol: 'camarero',   activo: true },
    { nombre: 'Carlos',           pin: '3333', rol: 'camarero',   activo: true },
    { nombre: 'Cocina',           pin: '4444', rol: 'cocina',     activo: true },
  ]

  for (const p of personal) {
    const { data: existe } = await supabase
      .from('personal')
      .select('id')
      .eq('local_id', restauranteId)
      .eq('pin', p.pin)
      .maybeSingle()

    if (!existe) {
      await supabase.from('personal').insert({ ...p, local_id: restauranteId })
    }
  }

  // ── 3. Mesas ──────────────────────────────────────────────────────────────
  const { count: mesasCount } = await supabase
    .from('mesas')
    .select('id', { count: 'exact', head: true })
    .eq('local_id', restauranteId)

  if (!mesasCount) {
    const mesas = Array.from({ length: 8 }, (_, i) => ({
      nombre:    `Mesa ${i + 1}`,
      local_id:  restauranteId,
      capacidad: i < 6 ? 4 : 6,
      zona:      i < 4 ? 'Interior' : 'Terraza',
      activa:    true,
    }))
    await supabase.from('mesas').insert(mesas)
  }

  // ── 4. Carta (productos demo) ─────────────────────────────────────────────
  const { count: prodCount } = await supabase
    .from('productos')
    .select('id', { count: 'exact', head: true })
    .eq('local_id', restauranteId)

  if (!prodCount) {
    const productos = [
      // Entrantes
      { nombre: 'Ensalada César',       categoria: 'Entrantes',   precio: 9.50  },
      { nombre: 'Jamón Ibérico 5J',     categoria: 'Entrantes',   precio: 18.00 },
      { nombre: 'Croquetas (6 uds)',    categoria: 'Entrantes',   precio: 7.50  },
      { nombre: 'Gazpacho andaluz',     categoria: 'Entrantes',   precio: 6.00  },
      // Principales
      { nombre: 'Hamburguesa Ibérica',  categoria: 'Principales', precio: 15.00 },
      { nombre: 'Lubina a la sal',      categoria: 'Principales', precio: 22.00 },
      { nombre: 'Solomillo de ternera', categoria: 'Principales', precio: 24.50 },
      { nombre: 'Pasta carbonara',      categoria: 'Principales', precio: 13.00 },
      { nombre: 'Rabo de toro',         categoria: 'Principales', precio: 19.00 },
      // Postres
      { nombre: 'Tiramisú casero',      categoria: 'Postres',     precio: 6.50  },
      { nombre: 'Flan de la abuela',    categoria: 'Postres',     precio: 5.00  },
      { nombre: 'Coulant de chocolate', categoria: 'Postres',     precio: 7.00  },
      // Bebidas
      { nombre: 'Agua mineral 0,5L',    categoria: 'Bebidas',     precio: 1.80  },
      { nombre: 'Cerveza Cruzcampo',    categoria: 'Bebidas',     precio: 2.50  },
      { nombre: 'Vino tinto D.O. Ribera', categoria: 'Bebidas',   precio: 4.00  },
      { nombre: 'Refresco',             categoria: 'Bebidas',     precio: 2.20  },
      { nombre: 'Café solo',            categoria: 'Bebidas',     precio: 1.50  },
    ]
    await supabase.from('productos').insert(
      productos.map((p, i) => ({ ...p, orden: i, activo: true, local_id: restauranteId }))
    )
  }

  // ── 5. Turno activo ───────────────────────────────────────────────────────
  const { data: turnoActivo } = await supabase
    .from('turnos')
    .select('id')
    .eq('local_id', restauranteId)
    .eq('estado', 'activo')
    .maybeSingle()

  if (!turnoActivo) {
    await supabase.from('turnos').insert({
      nombre:   'Turno Demo',
      local_id: restauranteId,
      estado:   'activo',
    })
  }

  // ── Respuesta ─────────────────────────────────────────────────────────────
  return NextResponse.json({
    ok: true,
    restaurante_id: restauranteId,
    credenciales: {
      codigo_restaurante: DEMO_CODE,
      personal: [
        { nombre: 'Alberto (Admin)', pin: '1234', rol: 'jefe_sala' },
        { nombre: 'María',           pin: '2222', rol: 'camarero'  },
        { nombre: 'Carlos',          pin: '3333', rol: 'camarero'  },
        { nombre: 'Cocina',          pin: '4444', rol: 'cocina'    },
      ],
    },
    instrucciones: {
      login:    'POST /api/auth  { pin: "1234", restaurante_code: "DEMO" }',
      mensajes: 'GET/POST /api/mensajes  (con header x-ia-session del token de login)',
      carta:    'GET /api/owner/carta    (con header x-ia-session)',
      comanda:  'POST /api/comanda       (con header x-ia-session)',
    },
  })
}
