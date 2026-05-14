// ============================================================
// /api/marchar — Agente MARCHAR con notificaciones configurables
// Módulo #15: Running + notificaciones owner-configurables
//
// POST { comanda_id, mesa_codigo, items: [{nombre, cantidad}] }
//
// Flujo:
//   1. buscar_receptor_marchar(comanda_id) → running o camarero + config
//   2. Actualizar comanda estado = 'lista'
//   3. Insertar marchar_log
//   4. Enviar notificaciones según notif_config del restaurante
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'
import { crearPrintJobMarchar, crearPrintJobs } from '@/lib/courier'

export const dynamic = 'force-dynamic'

// ── Tipos de canal ────────────────────────────────────────────
type Canal =
  | 'push_audio_completo'   // Push + TTS con detalle de items
  | 'push_audio_corto'      // Push + TTS corto ("Mesa X lista")
  | 'solo_visual'           // Solo push, sin audio
  | 'solo_audio'            // Audio en dispositivo si está abierto, sin push
  | 'igual_que_running'     // Mismo canal que el running
  | 'sin_notificacion'      // Nada

interface NotifConfig {
  running_canal: Canal
  camarero_con_running: Canal
  camarero_sin_running: Canal
  canal_audio: 'tts' | 'tono' | 'vibracion'
}

const DEFAULT_CONFIG: NotifConfig = {
  running_canal:         'push_audio_completo',
  camarero_con_running:  'solo_visual',
  camarero_sin_running:  'push_audio_completo',
  canal_audio:           'tts',
}

// ── Helpers de texto TTS ──────────────────────────────────────
function textoAudioCompleto(mesa: string, items: { nombre: string; cantidad: number }[]): string {
  const itemsStr = items
    .map(i => `${i.cantidad > 1 ? `${i.cantidad} ` : ''}${i.nombre}`)
    .join(', ')
  return `Saliendo. Mesa ${mesa}. ${itemsStr}.`
}

function textoAudioCorto(mesa: string): string {
  return `Mesa ${mesa}, lista para servir.`
}

function resumenItems(items: { nombre: string; cantidad: number }[]): string {
  return items.map(i => `${i.cantidad}× ${i.nombre}`).join(' · ')
}

// ── Enviar push (llama al endpoint interno) ───────────────────
async function enviarPush(
  req: NextRequest,
  camareroId: string,
  titulo: string,
  cuerpo: string,
  mesa: string,
  canal: Canal,
  items: { nombre: string; cantidad: number }[],
  config: NotifConfig,
  baseUrl: string
) {
  if (canal === 'sin_notificacion') return
  if (canal === 'solo_audio') {
    // Solo se activa desde el cliente via realtime — no hay push
    return
  }

  const sendPush = async (title: string, body: string) => {
    const session = req.headers.get('x-ia-session') ?? ''
    await fetch(`${baseUrl}/api/push/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ia-session': session,
      },
      body: JSON.stringify({
        title,
        body,
        mesa,
        camarero_id: camareroId,
        data: {
          url: '/running',
          tipo: 'marchar',
          canal,
          canal_audio: config.canal_audio,
          items,
        },
      }),
    }).catch(() => {})
  }

  switch (canal) {
    case 'push_audio_completo':
      await sendPush(titulo, textoAudioCompleto(mesa, items))
      break
    case 'push_audio_corto':
      await sendPush(titulo, textoAudioCorto(mesa))
      break
    case 'solo_visual':
      await sendPush(`Mesa ${mesa} — en camino`, cuerpo)
      break
    case 'igual_que_running':
      await sendPush(titulo, textoAudioCompleto(mesa, items))
      break
  }
}

// ── Handler principal ─────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)

  const { comanda_id, mesa_codigo, items } = await req.json() as {
    comanda_id: string
    mesa_codigo: string
    items: { nombre: string; cantidad: number }[]
  }

  if (!comanda_id || !mesa_codigo) {
    return NextResponse.json({ error: 'comanda_id y mesa_codigo requeridos' }, { status: 400 })
  }

  // 1. Buscar receptor + config de notificaciones
  const { data: rpcData, error: rpcError } = await supabase
    .rpc('buscar_receptor_marchar', { p_comanda_id: comanda_id })

  if (rpcError) {
    console.error('[MARCHAR] RPC error:', rpcError)
    return NextResponse.json({ error: rpcError.message }, { status: 500 })
  }

  const receptor = rpcData as {
    hay_running: boolean
    running_id: string | null
    running_nombre: string | null
    camarero_id: string | null
    camarero_nombre: string | null
    zona_id: string | null
    zona_nombre: string | null
    restaurante_id: string
    notif_config: { marchar: NotifConfig }
  }

  const config: NotifConfig = {
    ...DEFAULT_CONFIG,
    ...(receptor.notif_config?.marchar ?? {}),
  }

  // 2. Actualizar comanda a 'lista'
  const { error: updateError } = await supabase
    .from('comandas')
    .update({ estado: 'lista' })
    .eq('id', comanda_id)
    .eq('restaurante_id', rid)

  if (updateError) {
    console.error('[MARCHAR] Error actualizando comanda:', updateError)
  }

  // 3. Actualizar mesa a 'activa'
  const { data: comanda } = await supabase
    .from('comandas')
    .select('mesa_id')
    .eq('id', comanda_id)
    .single()
  if (comanda?.mesa_id) {
    await supabase.from('mesas').update({ estado: 'activa' }).eq('id', comanda.mesa_id)
  }

  // 4. Insertar marchar_log
  const receptorFinal = receptor.hay_running ? receptor.running_id! : receptor.camarero_id!
  const { error: logError } = await supabase.from('marchar_log').insert({
    comanda_id,
    mesa_codigo,
    zona_id:       receptor.zona_id,
    zona_nombre:   receptor.zona_nombre,
    receptor_id:   receptorFinal,
    camarero_id:   receptor.camarero_id,
    items_resumen: resumenItems(items ?? []),
    items_detalle: items ?? [],
    restaurante_id: rid,
  })

  if (logError) console.error('[MARCHAR] Error insertando marchar_log:', logError)

  // 5. Enviar notificaciones
  const baseUrl = req.nextUrl.origin
  const titulo = `Saliendo · Mesa ${mesa_codigo}`

  if (receptor.hay_running && receptor.running_id) {
    // Notificación PRIMARIA → running
    await enviarPush(
      req, receptor.running_id,
      titulo, resumenItems(items ?? []),
      mesa_codigo, config.running_canal,
      items ?? [], config, baseUrl
    )

    // Notificación SECUNDARIA → camarero (según config)
    if (receptor.camarero_id && config.camarero_con_running !== 'sin_notificacion') {
      const canalCam = config.camarero_con_running === 'igual_que_running'
        ? config.running_canal
        : config.camarero_con_running
      await enviarPush(
        req, receptor.camarero_id,
        `Mesa ${mesa_codigo} — en camino`,
        `${receptor.running_nombre ?? 'Running'} lleva el pedido`,
        mesa_codigo, canalCam,
        items ?? [], config, baseUrl
      )
    }
  } else if (receptor.camarero_id) {
    // Sin running → notificación directa al camarero
    await enviarPush(
      req, receptor.camarero_id,
      titulo, resumenItems(items ?? []),
      mesa_codigo, config.camarero_sin_running,
      items ?? [], config, baseUrl
    )
  }

  // 6. Imprimir ticket de MARCHAR (salida a sala) — tipo 'marchar' para que incluya "*** MARCHAR ***"
  //    Solo si no hay ya print_jobs de marchar recientes para esta comanda (evita duplicados)
  try {
    let itemsParaPrint = items ?? []
    if (!itemsParaPrint.length) {
      const { data: ciData } = await supabase
        .from('comanda_items')
        .select('nombre, cantidad, seccion_id')
        .eq('comanda_id', comanda_id)
      itemsParaPrint = (ciData ?? []).map((ci: { nombre: string; cantidad: number; seccion_id: string | null }) => ({
        nombre: ci.nombre,
        cantidad: ci.cantidad,
        seccion_id: ci.seccion_id ?? undefined,
      }))
    }
    if (itemsParaPrint.length > 0) {
      // Verificar si ya existe un print_job de marchar reciente (últimos 30s) para evitar duplicados
      const hace30s = new Date(Date.now() - 30_000).toISOString()
      const { data: jobsRecientes } = await supabase
        .from('print_jobs')
        .select('id')
        .eq('comanda_id', comanda_id)
        .gte('created_at', hace30s)
        .limit(1)

      if (!jobsRecientes?.length) {
        await crearPrintJobs(
          {
            id:              comanda_id,
            tipo:            'marchar',   // ← 'marchar' genera el footer "*** MARCHAR ***"
            mesa_codigo,
            camarero_nombre: receptor.camarero_nombre ?? 'Sala',
            restaurante_id:  receptor.restaurante_id,
            zona_tipo:       receptor.zona_id ?? null,
          },
          itemsParaPrint
        )
      }
    }
  } catch (e) {
    console.error('[MARCHAR] Error imprimiendo ticket marchar:', e)
  }

  // 6b. Imprimir ticket de pase si hay reglas configuradas
  if (items && items.length > 0) {
    try {
      await crearPrintJobMarchar(
        {
          id:              comanda_id,
          tipo:            'marchar',
          mesa_codigo,
          camarero_nombre: receptor.camarero_nombre ?? 'Sala',
          restaurante_id:  receptor.restaurante_id,
          zona_tipo:       receptor.zona_id ?? null,
        },
        items.map(i => ({ nombre: i.nombre, cantidad: i.cantidad }))
      )
    } catch (e) {
      console.error('[MARCHAR] Error imprimiendo ticket de pase:', e)
    }
  }

  return NextResponse.json({
    ok: true,
    hay_running:    receptor.hay_running,
    receptor_id:    receptorFinal,
    receptor_nombre: receptor.hay_running
      ? receptor.running_nombre
      : receptor.camarero_nombre,
    zona: receptor.zona_nombre,
  })
}
