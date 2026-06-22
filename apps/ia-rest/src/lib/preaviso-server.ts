// ============================================================
// lib/preaviso-server.ts — lógica de servidor del preaviso de marcha
//
// Crea un preaviso para una comanda (snapshot de platos + insert + push al
// camarero). Lo comparten el disparo MANUAL (POST /api/preaviso, cocina pulsa
// el botón) y el AUTOMÁTICO (cron /api/cron/preavisos-auto, por umbral de
// tiempo). El dedup lo garantiza el índice único uq_preavisos_comanda_enviado.
// ============================================================

import type { createServerClient } from '@/lib/supabase'
import { resumenPlatos, textoPreaviso, type PlatoLinea } from '@/lib/preaviso'
import { enviarPushACamarero } from '@/lib/push'

type SB = ReturnType<typeof createServerClient>

export interface CrearPreavisoResult {
  ok: boolean
  dedup?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  preaviso?: any
  error?: string
  status?: number
}

export async function crearPreavisoParaComanda(opts: {
  supabase: SB
  restauranteId: string
  comandaId: string
  emitidoPor: string   // rol/id de cocina, o 'auto' para el disparo por tiempo
}): Promise<CrearPreavisoResult> {
  const { supabase, restauranteId, comandaId, emitidoPor } = opts

  // 1) Cargar comanda + mesa + camarero asignado (filtrando por restaurante)
  const { data: comanda } = await supabase
    .from('comandas')
    .select('id, camarero_id, local_id, estado, mesa:mesas(codigo, nombre)')
    .eq('id', comandaId)
    .eq('local_id', restauranteId)
    .maybeSingle()
  if (!comanda) return { ok: false, error: 'Comanda no encontrada', status: 404 }

  // mesas(...) puede llegar como objeto o array según la inferencia del cliente
  const mesaRel = Array.isArray((comanda as { mesa?: unknown }).mesa)
    ? (comanda as { mesa: Array<{ codigo?: string; nombre?: string }> }).mesa[0]
    : (comanda as { mesa?: { codigo?: string; nombre?: string } }).mesa
  const mesa = String(mesaRel?.nombre ?? mesaRel?.codigo ?? '')

  // 2) Snapshot de los platos de la comanda
  const { data: items } = await supabase
    .from('comanda_items')
    .select('nombre, cantidad')
    .eq('comanda_id', comandaId)
  const platos = resumenPlatos((items ?? []) as PlatoLinea[])

  // 3) Insertar (el índice único uq_preavisos_comanda_enviado garantiza el dedup)
  const { data: preaviso, error } = await supabase
    .from('preavisos')
    .insert({
      restaurante_id: restauranteId,
      comanda_id: comandaId,
      mesa,
      platos,
      emitido_por: emitidoPor,
      estado: 'enviado',
    })
    .select()
    .single()

  if (error) {
    // 23505 = unique_violation → ya hay un preaviso activo para esta comanda
    if ((error as { code?: string }).code === '23505') return { ok: true, dedup: true }
    return { ok: false, error: error.message, status: 500 }
  }

  // 4) Push al camarero asignado (no crítico: el banner Realtime en /edge cubre el fallo)
  if (comanda.camarero_id) {
    try {
      await enviarPushACamarero({
        supabase,
        localId: restauranteId,
        camareroId: comanda.camarero_id,
        title: 'Preaviso de marcha',
        body: textoPreaviso(mesa, platos),
        data: { url: '/edge', tipo: 'preaviso', preaviso_id: preaviso.id },
      })
    } catch { /* no crítico */ }
  }

  return { ok: true, preaviso }
}
