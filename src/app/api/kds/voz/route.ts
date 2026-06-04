export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { transcribir } from '@/lib/ear'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'
import { notificarClienteQrListo } from '@/lib/qr-notify'

// ── BRAIN-KDS: system prompt orientado a confirmar platos ──────────────────
const KDS_PROMPT = `Eres BRAIN-KDS, el agente de confirmación de cocina de ia.rest.
Conviertes frases habladas por el cocinero en confirmaciones de mesa estructuradas.

REGLAS ESTRICTAS:
- Responde SOLO con JSON válido, sin texto adicional ni markdown
- El cocinero indica qué mesa ha terminado de cocinar
- Extrae el código de mesa según los prefijos del local (ver ZONAS abajo)
- Fallback de prefijos si no hay zonas: S=salon, T=terraza, B=barra

FRASES QUE DEBES ENTENDER (ejemplos):
- "listo la cuatro" → S4
- "mesa 4 pasa" → S4
- "sale todo S4" → S4
- "listo mesa doce" → S12
- "sale la ocho" → S8
- "barra dos lista" → B2
- "pasa terraza cinco" → P05
- "listo todo la quince" → T15
- "sale mesa siete" → S7

SCHEMA (responde EXACTAMENTE con este formato):
{"mesa":"S4","confianza":0.95,"raw":"texto original"}`

async function buildZonasKDS(restaurante_id: string): Promise<string> {
  try {
    const supabase = createServerClient()
    const { data: zonas } = await supabase
      .from('zonas')
      .select('nombre, prefijo')
      .eq('activa', true)
      .eq('restaurante_id', restaurante_id)
      .order('orden')

    if (!zonas?.length) return ''

    const lines = zonas
      .filter(z => z.prefijo)
      .map(z => `  ${z.prefijo}XX = ${z.nombre} (ej: ${z.prefijo}01, ${z.prefijo}12)`)
      .join('\n')
    return `\nZONAS DEL LOCAL:\n${lines}\n`
  } catch {
    return ''
  }
}

export async function POST(req: NextRequest) {
  const start = Date.now()
  try {
    const formData = await req.formData()
    const audio = formData.get('audio') as Blob
    const seccionId = formData.get('seccion_id') as string | null

    if (!audio) return NextResponse.json({ error: 'Audio requerido' }, { status: 400 })

    const supabase = createServerClient()
    const rid = getRestauranteId(req)

    // ── EAR: transcribir ───────────────────────────────────────────────────
    const { texto, latencia_ms: latenciaEar } = await transcribir(audio)

    // ── BRAIN-KDS: extraer mesa de la frase ────────────────────────────────
    const [{ callAI: aiKds, cleanJSON }, zonasContext] = await Promise.all([
      import('@/lib/ai-client'),
      buildZonasKDS(rid),
    ])

    let kdsResult: { mesa: string; confianza: number; raw: string }
    try {
      const raw = await aiKds(KDS_PROMPT + zonasContext, texto, 128)
      kdsResult = JSON.parse(cleanJSON(raw))
    } catch {
      return NextResponse.json(
        { error: 'No entendí la mesa. Intenta de nuevo.', texto },
        { status: 422 }
      )
    }

    if (!kdsResult.mesa || kdsResult.confianza < 0.5) {
      return NextResponse.json(
        { error: `No identifiqué la mesa (confianza baja). Texto: "${texto}"`, texto },
        { status: 422 }
      )
    }

    // ── Buscar mesa en BD ──────────────────────────────────────────────────
    const { data: mesa } = await supabase
      .from('mesas')
      .select('id, codigo')
      .eq('codigo', kdsResult.mesa)
      .eq('restaurante_id', rid)
      .single()

    if (!mesa) {
      return NextResponse.json(
        { error: `Mesa "${kdsResult.mesa}" no encontrada. Texto: "${texto}"`, texto },
        { status: 404 }
      )
    }

    // ── Buscar comandas activas de esa mesa en cocina ──────────────────────
    let comandasQuery = supabase
      .from('comandas')
      .select('id, camarero_id, numero_ticket, items:comanda_items(id, seccion_id)')
      .eq('mesa_id', mesa.id)
      .eq('restaurante_id', rid)
      .in('tipo', ['comanda', 'marchar'])
      .in('estado', ['nueva', 'en_cocina'])

    const { data: comandas } = await comandasQuery

    if (!comandas?.length) {
      return NextResponse.json(
        { error: `${kdsResult.mesa} — sin comandas pendientes`, texto, mesa: kdsResult.mesa },
        { status: 200 }
      )
    }

    // ── Marcar items como listo (filtrar por sección si procede) ───────────
    let itemsActualizados = 0
    const camareroIds: string[] = []

    for (const comanda of comandas) {
      const items = comanda.items ?? []
      const itemsFiltrados = seccionId
        ? items.filter((it: { id: string; seccion_id: string | null }) => it.seccion_id === seccionId)
        : items

      if (itemsFiltrados.length === 0) continue

      const ids = itemsFiltrados.map((it: { id: string }) => it.id)
      await supabase
        .from('comanda_items')
        .update({ estado: 'listo' })
        .in('id', ids)

      itemsActualizados += ids.length
      if (comanda.camarero_id && !camareroIds.includes(comanda.camarero_id)) {
        camareroIds.push(comanda.camarero_id)
      }
    }

    // ── Comprobar si toda la comanda quedó lista → cerrar + push ──────────
    for (const comanda of comandas) {
      const { data: allItems } = await supabase
        .from('comanda_items')
        .select('estado')
        .eq('comanda_id', comanda.id)

      const todosListos = allItems?.every(it => it.estado === 'listo')
      if (todosListos) {
        await supabase.from('comandas').update({ estado: 'lista' }).eq('id', comanda.id)
        await supabase.from('mesas').update({ estado: 'activa' }).eq('id', mesa.id)

        // Avisar al cliente QR si el pedido vino del QR de mesa (best-effort).
        notificarClienteQrListo(supabase, comanda.id, req.nextUrl.origin).catch(() => {})

        if (comanda.camarero_id) {
          fetch('/api/push/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: 'Comanda lista',
              body: `${kdsResult.mesa} — todo listo. Puedes servir.`,
              mesa: kdsResult.mesa,
              camarero_ids: [comanda.camarero_id],
              data: { url: '/edge' },
            }),
          }).catch(() => {})
        }
      }
    }

    const latenciaTotal = Date.now() - start

    return NextResponse.json({
      ok: true,
      texto,
      mesa: kdsResult.mesa,
      items_actualizados: itemsActualizados,
      latencia_ms: latenciaTotal,
      latencia_ear_ms: latenciaEar,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[KDS-VOZ]', err)
    return NextResponse.json({ error: msg || 'Error interno' }, { status: 500 })
  }
}
