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
    const pendingItemsRaw = formData.get('pending_items') as string | null  // flujo conversacional
    if (!audio || !camareroId || !turnoId)
      return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })

    const supabase = createServerClient()
    const rid = getRestauranteId(req)

    const { texto, latencia_ms: latenciaEar } = await transcribir(audio)
    const brainResult = await parsearComanda(texto, rid)

    // Flujo conversacional: si hay items pendientes de grabación anterior
    // (camarero dijo items pero no la mesa), esta grabación es solo la mesa
    if (pendingItemsRaw) {
      try {
        const prevItems = JSON.parse(pendingItemsRaw)
        if (brainResult.items.length === 0 && prevItems.length > 0) {
          brainResult.items = prevItems
        }
      } catch { /* ignorar */ }
    }

    // ── CHEQUEO 86: antes de insertar, detectar items agotados ──────────────
    let alertas86: string[] = []
    if (brainResult.items.length > 0 && brainResult.tipo !== '86') {
      const { data: activos86 } = await supabase
        .from('productos_86')
        .select('nombre')
        .eq('turno_id', turnoId)
        .eq('restaurante_id', rid)
      if (activos86?.length) {
        const nombres86 = activos86.map(p => p.nombre.toLowerCase())
        alertas86 = brainResult.items
          .filter(it => nombres86.includes(it.nombre.toLowerCase()))
          .map(it => it.nombre)
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    // ── LOOKUP DE MESA: robusto en 2 pasos ──────────────────────────────────
    // EU Reglamento 1169/2011 — 14 alérgenos de declaración obligatoria
    let alertasAlergenos: { producto: string; alergenos: string[] }[] = []

    // Paso 1: buscar por codigo exacto (T04, P02, B01…)
    let { data: mesa } = await supabase.from('mesas')
      .select('id, codigo, estado, alergenos_mesa, numero, zona')
      .eq('codigo', brainResult.mesa)
      .eq('restaurante_id', rid)
      .maybeSingle()

    // Paso 2: fallback por numero extraído del codigo BRAIN
    // Cubre casos donde el prompt devuelve código con prefijo distinto al de la BD
    if (!mesa && brainResult.mesa) {
      const num = parseInt((brainResult.mesa).replace(/[^0-9]/g, ''))
      if (num > 0) {
        const prefix = (brainResult.mesa).match(/^([A-Za-z]+)/)?.[1]?.toUpperCase()
        // Mapa de prefijos a zonas según la BD real
        const prefixToZona: Record<string, string> = { T: 'salon', P: 'terraza', B: 'barra', M: 'salon' }
        const zonaHint = prefix ? prefixToZona[prefix] : null

        const { data: candidatas } = await supabase.from('mesas')
          .select('id, codigo, estado, alergenos_mesa, numero, zona')
          .eq('restaurante_id', rid)
          .eq('numero', num)

        if (candidatas?.length === 1) {
          mesa = candidatas[0]
          console.log(`[TRANSCRIBE] mesa fallback by numero: ${brainResult.mesa} → ${mesa.codigo}`)
        } else if (candidatas && candidatas.length > 1) {
          // Intentar discriminar por zona inferida del prefijo
          const candidataZona = zonaHint
            ? candidatas.find(m => (m as any).zona === zonaHint)
            : null
          // Sin zona clara, preferir salón (la más común sin prefijo)
          mesa = candidataZona ?? candidatas.find(m => (m as any).zona === 'salon') ?? candidatas[0]
          console.log(`[TRANSCRIBE] mesa fallback ambigua: ${brainResult.mesa} → ${mesa?.codigo} (zona ${mesa?.zona})`)
        }
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    if (mesa?.alergenos_mesa?.length && brainResult.items.length > 0) {
      const alergenosMesa: string[] = mesa.alergenos_mesa
      const nombresItems = brainResult.items.map(it => it.nombre)
      const { data: productosConAlergenos } = await supabase
        .from('productos')
        .select('nombre, alergenos')
        .in('nombre', nombresItems)
        .eq('restaurante_id', rid)
        .not('alergenos', 'is', null)
      if (productosConAlergenos?.length) {
        for (const prod of productosConAlergenos) {
          if (!prod.alergenos?.length) continue
          const conflicto = (prod.alergenos as string[]).filter(a =>
            alergenosMesa.some(am => am.toLowerCase() === a.toLowerCase())
          )
          if (conflicto.length > 0) {
            alertasAlergenos.push({ producto: prod.nombre, alergenos: conflicto })
          }
        }
      }
    }

    let comandaId: string | null = null
    if (mesa) {
      const { data: comanda, error: comandaError } = await supabase.from('comandas')
        .insert({ mesa_id: mesa.id, camarero_id: camareroId, turno_id: turnoId,
          tipo: brainResult.tipo, estado: brainResult.tipo === 'cuenta' ? 'nueva' : 'en_cocina',
          restaurante_id: rid,
          ...(brainResult.num_comensales ? { num_comensales: brainResult.num_comensales } : {}) })
        .select().single()
      if (comandaError) throw comandaError
      comandaId = comanda.id

      if (brainResult.items.length > 0) {
        const itemsConFormato = brainResult.items.filter(i => i.formato)
        const formatoMap: Record<string, { id: string; nombre: string; precio: number }> = {}
        const precioMap: Record<string, { id: string; precio: number }> = {}
        const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

        // Precio base de TODOS los productos (lookup automático desde carta)
        const todosNombres = [...new Set(brainResult.items.map(i => i.nombre))]
        const { data: todosProds } = await supabase
          .from('productos').select('id,nombre,precio').in('nombre', todosNombres).eq('restaurante_id', rid)
        for (const p of todosProds ?? []) {
          if (p.precio != null) precioMap[norm(p.nombre)] = { id: p.id, precio: Number(p.precio) }
        }

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
              if (prod) formatoMap[`${norm(prod.nombre)}:${norm(f.nombre)}`] = { id: f.id, nombre: f.nombre, precio: f.precio }
            }
          }
        }

        await supabase.from('comanda_items').insert(
          brainResult.items.map((item) => {
            const fmtData = item.formato ? (formatoMap[`${norm(item.nombre)}:${norm(item.formato)}`] ?? null) : null
            const prodBase = precioMap[norm(item.nombre)] ?? null
            return {
              comanda_id: comanda.id, nombre: item.nombre, cantidad: item.cantidad,
              notas: item.notas || null,
              producto_id: item.producto_id ?? prodBase?.id ?? null,
              precio_unitario: fmtData?.precio ?? item.precio_unitario ?? prodBase?.precio ?? null,
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
          {
            id: comanda.id,
            tipo: brainResult.tipo,
            mesa_codigo: mesa.codigo,
            camarero_nombre: camarero?.nombre ?? 'Sala',
            restaurante_id: rid,
            zona_tipo: (mesa as Record<string, unknown>).zona as string ?? null,
          },
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

    if (alertasAlergenos.length > 0 && comandaId && mesa) {
      const logs = alertasAlergenos.flatMap(a =>
        a.alergenos.map(al => ({
          comanda_id: comandaId,
          mesa_id: mesa!.id,
          restaurante_id: rid,
          producto_nombre: a.producto,
          alergeno: al,
          confirmado_por: camareroId,
          nota: `Alerta automática — alérgeno declarado en mesa ${mesa!.codigo}`,
        }))
      )
      await supabase.from('alergeno_confirmaciones').insert(logs)
    }

    return NextResponse.json({ ok: true, texto, brain: brainResult, latencia_ms: latenciaTotal, latencia_ear_ms: latenciaEar, comanda_id: comandaId, alertas_86: alertas86, alertas_alergenos: alertasAlergenos })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const is401 = msg.includes('401') || (err as { status?: number })?.status === 401

    if (is401) {
      const missingGroq = !process.env.GROQ_API_KEY
      const missingAnthropic = !process.env.ANTHROPIC_API_KEY
      const hint = missingGroq
        ? 'GROQ_API_KEY no configurada en Vercel env vars'
        : missingAnthropic
          ? 'ANTHROPIC_API_KEY no configurada en Vercel env vars'
          : 'API key inválida o expirada (Groq/Anthropic) — revisar Vercel env vars'
      console.error('[TRANSCRIBE] 401 —', hint, err)
      return NextResponse.json({ error: hint, code: 'API_KEY_INVALID' }, { status: 500 })
    }

    console.error('[TRANSCRIBE]', err)
    return NextResponse.json({ error: msg || 'Error interno' }, { status: 500 })
  }
}
