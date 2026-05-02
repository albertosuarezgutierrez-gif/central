import { NextRequest, NextResponse } from 'next/server'
import { transcribir } from '@/lib/ear'
import { parsearComanda } from '@/lib/brain'
import { crearPrintJobs } from '@/lib/courier'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'

export async function POST(req: NextRequest) {
  const start = Date.now()
  try {
    const formData = await req.formData()
    const audio = formData.get('audio') as Blob
    const camareroId = formData.get('camarero_id') as string
    const turnoId = formData.get('turno_id') as string
    if (!audio || !camareroId || !turnoId)
      return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })

    const supabase = createServerClient()
    const rid = getRestauranteId(req)

    const { texto, latencia_ms: latenciaEar } = await transcribir(audio)
    const brainResult = await parsearComanda(texto)

    const { data: mesa } = await supabase.from('mesas')
      .select('id, codigo, estado').eq('codigo', brainResult.mesa).eq('restaurante_id', rid).single()

    let comandaId: string | null = null
    if (mesa) {
      const { data: comanda, error: comandaError } = await supabase.from('comandas')
        .insert({ mesa_id: mesa.id, camarero_id: camareroId, turno_id: turnoId,
          tipo: brainResult.tipo, estado: brainResult.tipo === 'cuenta' ? 'nueva' : 'en_cocina',
          restaurante_id: rid })
        .select().single()
      if (comandaError) throw comandaError
      comandaId = comanda.id

      if (brainResult.items.length > 0) {
        // Resolver formato_id para items que traen formato de voz
        const itemsConFormato = brainResult.items.filter(i => i.formato)
        const formatoMap: Record<string, { id: string; nombre: string; precio: number }> = {}

        if (itemsConFormato.length > 0) {
          const nombresUnicos = [...new Set(itemsConFormato.map(i => i.nombre))]
          const { data: prods } = await supabase
            .from('productos').select('id,nombre').in('nombre', nombresUnicos).eq('restaurante_id', rid)
          if (prods?.length) {
            const { data: formatos } = await supabase
              .from('producto_formatos').select('id,producto_id,nombre,precio')
              .in('producto_id', prods.map(p => p.id)).eq('activo', true)
            for (const f of formatos ?? []) {
              const prod = prods.find(p => p.id === f.producto_id)
              if (prod) formatoMap[`${prod.nombre}:${f.nombre}`] = { id: f.id, nombre: f.nombre, precio: f.precio }
            }
          }
        }

        await supabase.from('comanda_items').insert(
          brainResult.items.map((item) => {
            const fmtData = item.formato ? (formatoMap[`${item.nombre}:${item.formato}`] ?? null) : null
            return {
              comanda_id: comanda.id, nombre: item.nombre, cantidad: item.cantidad,
              notas: item.notas || null, producto_id: item.producto_id ?? null,
              precio_unitario: fmtData?.precio ?? item.precio_unitario ?? null,
              restaurante_id: rid,
              formato_id: fmtData?.id ?? null,
              formato_nombre: fmtData?.nombre ?? null,
            }
          })
        )
      }

      if (['comanda', 'marchar'].includes(brainResult.tipo) && brainResult.items.length > 0) {
        const { data: camarero } = await supabase.from('camareros').select('nombre').eq('id', camareroId).single()
        crearPrintJobs(
          { id: comanda.id, tipo: brainResult.tipo, mesa_codigo: brainResult.mesa, camarero_nombre: camarero?.nombre ?? 'Sala' },
          brainResult.items.map(item => ({ nombre: item.nombre, cantidad: item.cantidad,
            notas: item.notas ?? null, seccion_id: (item as Record<string, unknown>).seccion_id as string ?? null }))
        ).catch(err => console.error('[COURIER]', err))
      }

      const nuevoEstado = ({ comanda: 'activa', marchar: 'marchar', '86': mesa.estado, cuenta: 'cuenta', aviso: 'aviso' })[brainResult.tipo] as string
      await supabase.from('mesas').update({ estado: nuevoEstado, ultima_comanda: new Date().toISOString(), camarero_id: camareroId }).eq('id', mesa.id)

      if (brainResult.tipo === '86') {
        await supabase.from('productos_86').insert(
          brainResult.items.map((item) => ({ nombre: item.nombre, turno_id: turnoId, restaurante_id: rid }))
        )
      }
    }

    const latenciaTotal = Date.now() - start
    await supabase.from('transcripciones').insert({
      camarero_id: camareroId, turno_id: turnoId, texto_original: texto,
      texto_brain: brainResult, latencia_ms: latenciaTotal, comanda_id: comandaId, restaurante_id: rid,
    })

    return NextResponse.json({ ok: true, texto, brain: brainResult, latencia_ms: latenciaTotal, latencia_ear_ms: latenciaEar, comanda_id: comandaId })
  } catch (err) {
    console.error('[TRANSCRIBE]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error interno' }, { status: 500 })
  }
}
