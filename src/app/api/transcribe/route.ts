import { NextRequest, NextResponse } from 'next/server'
import { transcribir } from '@/lib/ear'
import { parsearComanda } from '@/lib/brain'
import { createServerClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const start = Date.now()

  try {
    const formData = await req.formData()
    const audio = formData.get('audio') as Blob
    const camareroId = formData.get('camarero_id') as string
    const turnoId = formData.get('turno_id') as string

    if (!audio || !camareroId || !turnoId) {
      return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })
    }

    const supabase = createServerClient()

    // 0. Load active carta so BRAIN knows the real menu
    const { data: cartaData } = await supabase
      .from('productos')
      .select('id, nombre, precio, categoria')
      .eq('activo', true)
      .order('categoria')
      .order('nombre')
    const carta = cartaData ?? []

    // 1. EAR: Whisper transcribes audio
    const { texto, latencia_ms: latenciaEar } = await transcribir(audio)

    // 2. BRAIN: Claude Haiku parses with real menu context
    const brainResult = await parsearComanda(texto, carta)

    // 3. COURIER: Find the table by code
    const { data: mesa } = await supabase
      .from('mesas')
      .select('id, codigo, estado')
      .eq('codigo', brainResult.mesa)
      .single()

    let comandaId: string | null = null

    if (mesa) {
      // 4. Create comanda
      const { data: comanda, error: comandaError } = await supabase
        .from('comandas')
        .insert({
          mesa_id: mesa.id,
          camarero_id: camareroId,
          turno_id: turnoId,
          tipo: brainResult.tipo,
          estado: brainResult.tipo === 'cuenta' ? 'nueva' : 'en_cocina',
        })
        .select()
        .single()

      if (comandaError) throw comandaError
      comandaId = comanda.id

      // 5. Insert items — with producto_id + precio_unitario if BRAIN found them
      if (brainResult.items.length > 0) {
        await supabase.from('comanda_items').insert(
          brainResult.items.map((item) => ({
            comanda_id: comanda.id,
            nombre: item.nombre,
            cantidad: item.cantidad,
            notas: item.notas || null,
            producto_id: item.producto_id ?? null,
            precio_unitario: item.precio_unitario ?? null,
          }))
        )
      }

      // 6. Update table status
      const nuevoEstado = {
        comanda: 'activa',
        marchar: 'marchar',
        '86': mesa.estado,
        cuenta: 'cuenta',
        aviso: 'aviso',
      }[brainResult.tipo] as string

      await supabase
        .from('mesas')
        .update({
          estado: nuevoEstado,
          ultima_comanda: new Date().toISOString(),
          camarero_id: camareroId,
        })
        .eq('id', mesa.id)

      // 7. If 86 — log to productos_86
      if (brainResult.tipo === '86') {
        await supabase.from('productos_86').insert(
          brainResult.items.map((item) => ({
            nombre: item.nombre,
            turno_id: turnoId,
          }))
        )
      }
    }

    // 8. Save transcription log
    const latenciaTotal = Date.now() - start
    await supabase.from('transcripciones').insert({
      camarero_id: camareroId,
      turno_id: turnoId,
      texto_original: texto,
      texto_brain: brainResult,
      latencia_ms: latenciaTotal,
      comanda_id: comandaId,
    })

    return NextResponse.json({
      ok: true,
      texto,
      brain: brainResult,
      latencia_ms: latenciaTotal,
      latencia_ear_ms: latenciaEar,
      comanda_id: comandaId,
    })
  } catch (err) {
    console.error('[TRANSCRIBE]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 }
    )
  }
}
