/**
 * GET /api/demo — estado del restaurante demo (sin autenticación)
 * Devuelve si existe y las instrucciones de uso.
 */
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET() {
  const supabase = createServerClient()
  const { data } = await supabase
    .from('restaurantes')
    .select('id, nombre, plan, activo, created_at')
    .eq('slug', 'demo')
    .maybeSingle()

  if (!data) {
    return NextResponse.json({
      existe: false,
      instruccion: 'Llama a POST /api/demo/seed con { secret: "<DEMO_SEED_SECRET>" } para inicializar.',
    })
  }

  return NextResponse.json({
    existe: true,
    restaurante: { id: data.id, nombre: data.nombre, plan: data.plan, activo: data.activo },
    credenciales: {
      codigo_restaurante: 'DEMO',
      personal: [
        { nombre: 'Alberto (Admin)', pin: '1234', rol: 'jefe_sala'  },
        { nombre: 'María',           pin: '2222', rol: 'camarero'   },
        { nombre: 'Carlos',          pin: '3333', rol: 'camarero'   },
        { nombre: 'Cocina',          pin: '4444', rol: 'cocina'     },
      ],
    },
    login: 'POST /api/auth  { pin: "1234", restaurante_code: "DEMO" }',
  })
}
