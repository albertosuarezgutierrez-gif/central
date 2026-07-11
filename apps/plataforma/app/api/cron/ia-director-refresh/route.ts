// META-AGENTE INVESTIGADOR — cron SEMANAL que mantiene al día al Agente Director:
// lee el catálogo público de OpenRouter (/api/v1/models), elige de forma DETERMINISTA el
// mejor modelo disponible por categoría (lógica/redacción/contexto/general) según listas de
// preferencia + precios vivos, regenera el system prompt del Director y lo versiona en
// ia_director_prompt. Si cambia el JUEGO DE MODELOS (no solo precios) → aviso Telegram.
// De paso vigila los créditos de la cuenta OpenRouter (/api/v1/credits) y avisa bajo umbral.
// Ranking determinista a propósito: auditable y predecible; nada de LLM eligiendo modelos.

import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { prisma } from '@/lib/db'
import { tgSend } from '@central/core-telegram'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

type ModeloOR = {
  id: string
  context_length?: number
  pricing?: { prompt?: string; completion?: string }
  architecture?: { input_modalities?: string[]; output_modalities?: string[] }
}

// Listas de PREFERENCIA por categoría (ordenadas): se elige el primero que EXISTA en el
// catálogo vivo y respete el techo de precio. Si el favorito desaparece (retirada tipo
// llama-3.1-405b en NIM), el siguiente entra solo y se avisa por Telegram.
const PREFERIDOS: Record<string, { tags: string[]; lista: string[] }> = {
  logica: {
    tags: ['logica', 'datos', 'barato'],
    lista: ['deepseek/deepseek-chat', 'deepseek/deepseek-chat-v3-0324', 'qwen/qwen-2.5-72b-instruct'],
  },
  codigo: {
    // Programación (leer/editar código, bugs, refactors). Del más barato+capaz al premium; el
    // Director sube de nivel por complejidad/presupuesto (modelosPermitidos). Para habilitar Opus
    // en tareas duras, subir DIRECTOR_MAX_PRECIO_OUT (su salida supera el techo por defecto de 20).
    tags: ['codigo', 'logica'],
    lista: ['qwen/qwen-2.5-coder-32b-instruct', 'deepseek/deepseek-chat', 'anthropic/claude-sonnet-4.5'],
  },
  redaccion: {
    tags: ['redaccion', 'vision'],
    lista: ['anthropic/claude-sonnet-4.5', 'anthropic/claude-3.7-sonnet', 'anthropic/claude-3.5-sonnet'],
  },
  contexto: {
    tags: ['contexto', 'vision', 'barato'],
    lista: ['google/gemini-2.5-flash', 'google/gemini-flash-1.5'],
  },
  general: {
    tags: ['general', 'barato'],
    lista: ['meta-llama/llama-3.3-70b-instruct', 'meta-llama/llama-3.1-70b-instruct', 'mistralai/mistral-small-3.1-24b-instruct'],
  },
}

const CRITERIOS: Record<string, string> = {
  logica: 'Lógica, datos, cifras, clasificación, SQL',
  codigo: 'Programación: leer/editar código, arreglar bugs, refactors',
  redaccion: 'Redacción humana cuidada (emails a clientes, textos comerciales) o visión',
  contexto: 'Contexto masivo (documentos largos) o multimodal',
  general: 'Todo lo demás (chat corto, resúmenes, extracción simple)',
}

// USD por millón de tokens desde el pricing de OpenRouter (viene en USD por token, string).
const porMillon = (v?: string) => v ? +(Number(v) * 1_000_000).toFixed(4) : undefined

function generarPrompt(porCategoria: Record<string, string>, slugs: string[]): string {
  const lineas = Object.entries(porCategoria)
    .map(([cat, id]) => `- ${CRITERIOS[cat]} → ${id}`)
    .join('\n')
  return `Eres el DIRECTOR de una pasarela de IA. Tu ÚNICA tarea: leer la petición del usuario y elegir el modelo ideal del catálogo. Responde SOLO con JSON {"modelo": "<slug>"}.

Criterios:
${lineas}

Catálogo permitido: ${slugs.join(', ')}`
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // 1) Catálogo público (sin key).
  const res = await fetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) return NextResponse.json({ error: `OpenRouter models HTTP ${res.status}` }, { status: 502 })
  const data = (await res.json()) as { data?: ModeloOR[] }
  const vivos = new Map((data.data ?? []).map(m => [m.id, m]))
  if (!vivos.size) return NextResponse.json({ error: 'catálogo vacío' }, { status: 502 })

  // 1.5) BUCLE DE APRENDIZAJE (F4): rendimiento REAL de cada modelo servido por la pasarela sobre
  // una ventana de días (de ai_usos). Un modelo con mala racha (error_rate/latencia por encima del
  // umbral, con muestra suficiente) queda PENALIZADO: se descarta del catálogo nuevo. Determinista.
  const dias = Number(process.env.DIRECTOR_APRENDIZAJE_DIAS ?? 7)
  const minLlam = Number(process.env.DIRECTOR_MIN_LLAMADAS ?? 20)
  const maxErr = Number(process.env.DIRECTOR_MAX_ERROR_RATE ?? 0.3)
  const maxMs = Number(process.env.DIRECTOR_MAX_MS ?? 20_000)
  const perf = await prisma.$queryRaw<Array<{ modelo: string; llamadas: bigint; err: number; ms: number; coste: number }>>`
    SELECT split_part(modelo, ':', 1) AS modelo,
           count(*) AS llamadas,
           (count(*) FILTER (WHERE NOT ok))::float / NULLIF(count(*), 0) AS err,
           COALESCE(avg(ms) FILTER (WHERE ok), 0)::float AS ms,
           COALESCE(avg(coste_eur), 0)::float AS coste
    FROM ai_usos
    WHERE endpoint <> 'director' AND proveedor = 'openrouter' AND modelo IS NOT NULL
      AND creada_at >= now() - make_interval(days => ${dias})
    GROUP BY split_part(modelo, ':', 1)`.catch(() => [] as Array<{ modelo: string; llamadas: bigint; err: number; ms: number; coste: number }>)
  const stats = new Map(perf.map(p => [p.modelo, {
    llamadas: Number(p.llamadas), err: Number(p.err), ms: Math.round(Number(p.ms)), coste: Number(p.coste),
  }]))
  const malos = new Set([...stats].filter(([, s]) => s.llamadas >= minLlam && (s.err >= maxErr || s.ms >= maxMs)).map(([id]) => id))

  // 2) Elección determinista por categoría (primer preferido vivo, bajo el techo de precio y NO penalizado).
  const techoOut = Number(process.env.DIRECTOR_MAX_PRECIO_OUT ?? 20) // USD/M de salida
  const porCategoria: Record<string, string> = {}
  const caidos: string[] = []
  const penalizados: string[] = []
  for (const [cat, def] of Object.entries(PREFERIDOS)) {
    const elegido = def.lista.find(id => {
      const m = vivos.get(id)
      return m && (porMillon(m.pricing?.completion) ?? 0) <= techoOut && !malos.has(id)
    })
    if (!elegido) continue
    porCategoria[cat] = elegido
    if (elegido !== def.lista[0] && !vivos.has(def.lista[0])) caidos.push(`${def.lista[0]} → ${elegido} (${cat})`)
    // El favorito estaba vivo y barato pero se descartó por RENDIMIENTO (no por desaparecer).
    if (elegido !== def.lista[0] && vivos.has(def.lista[0]) && malos.has(def.lista[0])) {
      const s = stats.get(def.lista[0])!
      penalizados.push(`${def.lista[0]} → ${elegido} (${cat}: err ${(s.err * 100).toFixed(0)}%, ${s.ms}ms)`)
    }
  }
  if (!Object.keys(porCategoria).length) return NextResponse.json({ error: 'ningún preferido vivo' }, { status: 502 })

  const slugs = [...new Set(Object.values(porCategoria))]
  const modelos = slugs.map(id => {
    const m = vivos.get(id)!
    return {
      id,
      precio_in: porMillon(m.pricing?.prompt),
      precio_out: porMillon(m.pricing?.completion),
      contexto: m.context_length,
      tags: Object.entries(porCategoria).filter(([, v]) => v === id).flatMap(([c]) => PREFERIDOS[c].tags),
    }
  })
  // Suplentes: variantes :free vivas de los elegidos primero, luego el modelo de contexto (barato).
  const suplentes = [
    ...slugs.map(id => `${id}:free`).filter(id => vivos.has(id)),
    ...(porCategoria.contexto ? [porCategoria.contexto] : []),
    ...(porCategoria.general ? [porCategoria.general] : []),
  ].filter((v, i, a) => a.indexOf(v) === i).slice(0, 3)

  const prompt = generarPrompt(porCategoria, slugs)
  const catalogo = { modelos, suplentes }

  // 3) Versionar solo si algo cambió (prompt o catálogo); avisar solo si cambió el JUEGO de modelos.
  const prev = await prisma.$queryRaw<Array<{ version: number; prompt: string; catalogo: unknown }>>`
    SELECT version, prompt, catalogo FROM ia_director_prompt ORDER BY version DESC LIMIT 1`
  const prevCat = (prev[0]?.catalogo ?? {}) as { modelos?: Array<{ id: string }>; suplentes?: string[] }
  const prevSlugs = (prevCat.modelos ?? []).map(m => m.id).sort().join(',')
  const sinCambios = prev.length > 0 && prev[0].prompt === prompt
    && JSON.stringify(prevCat) === JSON.stringify(catalogo)

  let version = prev[0]?.version ?? 0
  if (!sinCambios) {
    version += 1
    await prisma.$executeRaw`
      INSERT INTO ia_director_prompt (version, prompt, catalogo, origen)
      VALUES (${version}, ${prompt}, ${JSON.stringify(catalogo)}::jsonb, 'cron')`
    const cambioModelos = prevSlugs !== slugs.slice().sort().join(',')
    if (cambioModelos || penalizados.length) {
      await tgSend(
        `🧠 <b>IA — Director actualizado (v${version})</b>\nModelos por categoría:\n` +
        Object.entries(porCategoria).map(([c, id]) => `· ${c}: ${id}`).join('\n') +
        (caidos.length ? `\n⚠️ Preferidos caídos del catálogo:\n${caidos.map(c => `· ${c}`).join('\n')}` : '') +
        (penalizados.length ? `\n📉 Penalizados por rendimiento:\n${penalizados.map(c => `· ${c}`).join('\n')}` : '') +
        `\nSuplentes: ${suplentes.join(', ') || '—'}`,
      ).catch(() => {})
    }
  }

  // 3.5) Snapshot de aprendizaje: guarda el rendimiento observado de cada modelo (histórico por día).
  for (const [id, s] of stats) {
    await prisma.$executeRaw`
      INSERT INTO ia_director_aprendizaje (fecha, modelo, llamadas, error_rate, ms_medio, coste_medio_eur, ventana_dias, penalizado)
      VALUES (current_date, ${id}, ${s.llamadas}, ${s.err}, ${s.ms}, ${s.coste}, ${dias}, ${malos.has(id)})
      ON CONFLICT (fecha, modelo) DO UPDATE SET
        llamadas = EXCLUDED.llamadas, error_rate = EXCLUDED.error_rate, ms_medio = EXCLUDED.ms_medio,
        coste_medio_eur = EXCLUDED.coste_medio_eur, ventana_dias = EXCLUDED.ventana_dias, penalizado = EXCLUDED.penalizado`
      .catch(() => {})
  }

  // 4) Vigilancia de créditos (requiere key; si no hay, se salta sin fallar).
  let creditos: { total: number; usado: number; restante: number } | null = null
  const apiKey = process.env.OPENROUTER_API_KEY
  if (apiKey) {
    try {
      const rc = await fetch('https://openrouter.ai/api/v1/credits', {
        headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(15_000),
      })
      if (rc.ok) {
        const jc = (await rc.json()) as { data?: { total_credits?: number; total_usage?: number } }
        const total = Number(jc.data?.total_credits ?? 0)
        const usado = Number(jc.data?.total_usage ?? 0)
        creditos = { total, usado, restante: +(total - usado).toFixed(2) }
        const umbral = Number(process.env.AI_CREDITOS_UMBRAL ?? 5)
        if (creditos.restante < umbral) {
          await tgSend(`🔴 <b>IA — créditos OpenRouter bajos</b>\nQuedan $${creditos.restante} (umbral $${umbral}). Recarga en openrouter.ai o la pasarela caerá a la cadena gratis.`).catch(() => {})
        }
      }
    } catch { /* la vigilancia de créditos nunca tumba el refresh */ }
  }

  return NextResponse.json({ ok: true, version, sinCambios, porCategoria, suplentes, caidos, penalizados, creditos })
}
