// ia.rest · TheFork POS API v1 — Webhook receptor
//
// TheFork llama a este endpoint (POST) cuando un cliente llega al restaurante
// con estado ARRIVED o SEATED. ia.rest abre la mesa automáticamente e importa
// las alergias del cliente.
//
// Docs: https://docs.thefork.io/POS-API/Flow/create-order
// Auth: TheFork envía Authorization: Bearer {oauthClientSecret}
//       y CustomerId: {restaurante UUID en TheFork}

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Mapeo de alergias TheFork → nombres EU 1169/2011 que usa ia.rest
const ALLERGY_MAP: Record<string, string> = {
  'Lactose Intolerant': 'Lactosa',
  'Lactose':            'Lactosa',
  'Gluten':             'Gluten',
  'Gluten Free':        'Gluten',
  'Dairy Free':         'Lactosa',
  'Nuts':               'Frutos secos',
  'Tree Nuts':          'Frutos secos',
  'Peanuts':            'Cacahuetes',
  'Shellfish':          'Crustáceos',
  'Seafood':            'Moluscos',
  'Fish':               'Pescado',
  'Eggs':               'Huevos',
  'Soy':                'Soja',
  'Wheat':              'Gluten',
  'Sesame':             'Sésamo',
  'Sulfites':           'Sulfitos',
  'Mustard':            'Mostaza',
  'Celery':             'Apio',
  'Lupin':              'Altramuces',
  'Molluscs':           'Moluscos',
}

function mapAlergias(raw: string[]): string[] {
  const result = new Set<string>()
  for (const a of raw) {
    const mapped = ALLERGY_MAP[a] || ALLERGY_MAP[a.trim()]
    if (mapped) result.add(mapped)
    else result.add(a) // Mantener original si no hay mapeo
  }
  return [...result]
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()

  // TheFork identifica el restaurante con el header CustomerId
  const customerId = req.headers.get('CustomerId') || req.headers.get('customerid')
  const auth = req.headers.get('authorization')

  if (!customerId) {
    return NextResponse.json({ error: 'Missing CustomerId header' }, { status: 400 })
  }

  // Buscar restaurante por thefork_customer_id
  const { data: restaurante } = await supabase
    .from('restaurantes')
    .select('id, thefork_secret')
    .eq('thefork_customer_id', customerId)
    .single()

  if (!restaurante) {
    console.warn('[TheFork] customerId no registrado:', customerId)
    // Responder 204 para que TheFork no reintente (evitar bucle)
    return new Response(null, { status: 204 })
  }

  // Validar Bearer token si el restaurante tiene secret configurado
  if (restaurante.thefork_secret) {
    const expectedToken = `Bearer ${restaurante.thefork_secret}`
    if (auth !== expectedToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const rid = restaurante.id

  let body: {
    orderId?: string
    mealStatus?: string
    customer?: {
      firstName?: string
      lastName?: string
      allergies?: string[]
      dietaryRestrictions?: string[]
      note?: string
    }
    pax?: number
    startTime?: string
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { orderId, mealStatus, customer, pax } = body

  // Solo procesar llegadas / sentados
  const estadosActivos = ['ARRIVED', 'SEATED', 'PARTIALLY_SEATED']
  if (!mealStatus || !estadosActivos.includes(mealStatus)) {
    // Otros estados (LEFT, etc.) → 204 sin acción
    return new Response(null, { status: 204 })
  }

  // Calcular alérgenos del cliente
  const alergiasRaw = [
    ...(customer?.allergies ?? []),
    ...(customer?.dietaryRestrictions ?? []),
  ]
  const alergenosMesa = mapAlergias(alergiasRaw)

  // Buscar una mesa disponible o la primera libre
  // TheFork no siempre envía número de mesa — usamos la primera libre del restaurante
  // TODO: cuando TheFork envíe tableNumber en el body, mapear por mesa.codigo
  const { data: mesa } = await supabase
    .from('mesas')
    .select('id, codigo')
    .eq('restaurante_id', rid)
    .in('estado', ['libre', 'disponible'])
    .order('codigo', { ascending: true })
    .limit(1)
    .single()

  if (!mesa) {
    console.warn('[TheFork] Sin mesa disponible para restaurante', rid)
    return new Response(null, { status: 204 })
  }

  // Abrir la mesa: estado → ocupada, guardar alergenos y thefork_order_id
  const nota = [
    customer?.firstName ? `${customer.firstName} ${customer.lastName ?? ''}`.trim() : null,
    customer?.note || null,
    alergenosMesa.length > 0 ? `Alergias TheFork: ${alergenosMesa.join(', ')}` : null,
  ].filter(Boolean).join(' · ')

  await supabase.from('mesas').update({
    estado: 'ocupada',
    ocupada_desde: new Date().toISOString(),
    ultima_comanda: new Date().toISOString(),
    comensales_actuales: pax ?? null,
    alergenos_mesa: alergenosMesa,
    thefork_order_id: orderId ?? null,
  }).eq('id', mesa.id)

  // Log en transcripciones para trazabilidad
  await supabase.from('transcripciones').insert({
    camarero_id: null,
    turno_id: 'thefork-import',
    texto_original: `[TheFork ARRIVED] ${customer?.firstName ?? ''} ${customer?.lastName ?? ''} · ${pax ?? '?'} pax · ${alergenosMesa.join(', ') || 'sin alergias'}`,
    texto_brain: { source: 'thefork', orderId, mealStatus, nota },
    latencia_ms: 0,
    restaurante_id: rid,
  })

  console.log('[TheFork] Mesa abierta:', mesa.codigo, '| TheFork order:', orderId, '| Alergenos:', alergenosMesa)

  // TheFork espera 204 en respuesta exitosa
  return new Response(null, { status: 204 })
}

// TheFork puede hacer GET para verificar que el endpoint está vivo
export async function GET() {
  return NextResponse.json({ ok: true, service: 'ia.rest TheFork POS API v1' })
}
