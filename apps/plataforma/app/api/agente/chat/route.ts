// Chat con el AGENTE de pricing de sivra (humano en el bucle — Paso 5-bis).
//
// Solo lectura sobre las decisiones/aprendizaje del agente + escritura ACOTADA: si Alberto da una
// instrucción/regla ("no bajes Busto de 120", "sé más agresivo en Semana Santa"), se guarda como
// insight en `pricing_aprendizaje`, que el agente autónomo LEE y respeta en su siguiente ciclo.
// Así la mejora es por datos + feedback humano. NO escribe precios (eso solo el Paso 4 con raíles).
import { NextRequest, NextResponse } from 'next/server'
import { chatConDirector } from '@/lib/pasarela'
import { requireSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'

export const maxDuration = 30
export const dynamic = 'force-dynamic'

const PISOS = ['prop_house_sevillana', 'prop_busto_reform', 'prop_duplex_center', 'prop_luxury_busto']

// Construye el contexto de solo-lectura que ve la IA: pisos+reglas, pausa, decisiones recientes
// (con motivo) y la memoria de aprendizaje. Todo defensivo (BD compartida, SQL crudo).
async function contexto(propertyId: string | null): Promise<string> {
  const pisos = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT z.property_id, z.nombre, z.postal_code, z.max_guests, z.tipo,
           s.min_price, s.max_price, s.max_change_pct, s.apply_enabled, s.events_enabled
    FROM pricing_piso_zona z
    LEFT JOIN pricing_settings s ON s.property_id = z.property_id
    ORDER BY z.property_id`).catch(() => [])

  const cfg = await prisma.$queryRaw<{ paused: boolean }[]>(Prisma.sql`
    SELECT paused FROM pricing_config WHERE id = 1 LIMIT 1`).catch(() => [])
  const paused = cfg[0]?.paused === true

  const decisiones = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT property_id, rate_date::text AS rate_date, price, min_stay, motivo, dry_run, fuente,
           ciclo_at::text AS ciclo_at
    FROM pricing_decisiones
    WHERE (${propertyId}::text IS NULL OR property_id = ${propertyId})
    ORDER BY ciclo_at DESC, rate_date ASC
    LIMIT 60`).catch(() => [])

  const aprendizaje = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT property_id, temporada, insight, updated_at::text AS updated_at
    FROM pricing_aprendizaje
    ORDER BY updated_at DESC LIMIT 40`).catch(() => [])

  const pisosTxt = pisos.length ? pisos.map(p =>
    `- ${p.property_id}${p.nombre ? ` (${p.nombre})` : ''}: CP ${p.postal_code ?? '?'}, aforo ${p.max_guests ?? '?'}, tipo ${p.tipo ?? '?'}. `
    + `Reglas → suelo ${p.min_price ?? 'sin'}€, techo ${p.max_price ?? 'sin'}€, tope/día ±${p.max_change_pct != null ? Math.round(p.max_change_pct * 100) + '%' : '?'}, `
    + `aplica=${p.apply_enabled ? 'sí' : 'no'}, eventos=${p.events_enabled ? 'sí' : 'no'}.`
  ).join('\n') : '- (sin datos de zona aún: lanzar /api/pricing/pisos-zona en sivra)'

  const decTxt = decisiones.length ? decisiones.slice(0, 50).map(d =>
    `- ${d.rate_date} · ${d.property_id} · ${d.price}€${d.min_stay ? ` (min-stay ${d.min_stay})` : ''}${d.dry_run ? ' [simulado]' : ''} — ${d.motivo || 'sin motivo'} [${d.fuente || 'agente'}]`
  ).join('\n') : '- (el agente aún no ha registrado decisiones)'

  const aprTxt = aprendizaje.length ? aprendizaje.map(a =>
    `- ${a.property_id} / ${a.temporada}: ${a.insight}`
  ).join('\n') : '- (sin aprendizaje guardado todavía)'

  return `# Pisos turísticos de Alberto (Sevilla) y reglas de pricing
Pausa global del pricing: ${paused ? 'ACTIVADA (no se escribe en Smoobu)' : 'desactivada'}.
${pisosTxt}

# Decisiones recientes del agente (precio + por qué)
${decTxt}

# Memoria / aprendizaje del agente (reglas e insights que el agente respeta)
${aprTxt}`
}

const SYSTEM = `Eres el AGENTE de pricing de los pisos turísticos de Alberto en Sevilla. Hablas con Alberto, el dueño.
Tu trabajo en este chat:
1. EXPLICAR tus decisiones de precio leyendo los "motivos" del contexto. Responde en español, claro y breve. No inventes: si un dato no está en el contexto, dilo.
2. ACEPTAR instrucciones/reglas que Alberto quiera que recuerdes para los próximos ciclos (ej: "no bajes Busto de 120", "sé más agresivo en Semana Santa", "prioriza ocupación en agosto").

Cuando Alberto te dé una instrucción o regla NUEVA que debas recordar, añade AL FINAL de tu respuesta una única línea EXACTAMENTE con este formato (y nada más en esa línea):
GUARDAR_APRENDIZAJE: {"property_id":"<uno de: prop_house_sevillana|prop_busto_reform|prop_duplex_center|prop_luxury_busto|ALL>","temporada":"<slug corto, ej: semana_santa|feria|agosto|general>","insight":"<la regla en una frase clara>"}

Reglas:
- Si NO hay instrucción nueva que recordar (solo es una pregunta), NO añadas esa línea.
- "ALL" = aplica a todos los pisos. Usa temporada "general" si no es de una época concreta.
- NUNCA prometes cambiar precios al instante: las reglas las aplicará el agente en su próximo ciclo, siempre con los raíles (suelo de coste, tope ±/día, pausa).`

export async function POST(req: NextRequest) {
  const session = await requireSession().catch(() => null)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const mensaje = typeof body?.mensaje === 'string' ? body.mensaje.trim() : ''
  const propertyId = typeof body?.property_id === 'string' && PISOS.includes(body.property_id) ? body.property_id : null
  if (!mensaje) return NextResponse.json({ error: 'mensaje requerido' }, { status: 400 })

  let ctx = ''
  try { ctx = await contexto(propertyId) } catch { ctx = '(no se pudo leer el contexto del agente)' }
  const prompt = `${ctx}\n\n# Mensaje de Alberto\n${mensaje}\n\n# Tu respuesta`

  let respuesta = ''
  try {
    respuesta = (await chatConDirector([{ role: 'user', content: prompt }], { app: 'plataforma', endpoint: 'agente-chat', system: SYSTEM, maxTokens: 700, timeoutMs: 25_000 })).text
  } catch (e: any) {
    const msg = String(e?.message || e)
    if (msg.includes('NVIDIA_API_KEY')) {
      return NextResponse.json({ respuesta: 'El chat del agente necesita la variable NVIDIA_API_KEY en el proyecto Vercel de plataforma.' })
    }
    return NextResponse.json({ respuesta: 'No se pudo consultar al agente: ' + msg.slice(0, 140) })
  }

  // Persistir la instrucción de Alberto como aprendizaje (si la IA emitió la línea).
  let guardado: { property_id: string; temporada: string; insight: string } | null = null
  const m = respuesta.match(/GUARDAR_APRENDIZAJE:\s*(\{[\s\S]*\})/)
  if (m) {
    try {
      const obj = JSON.parse(m[1])
      const pid = obj?.property_id === 'ALL' || PISOS.includes(obj?.property_id) ? String(obj.property_id) : null
      const temporada = typeof obj?.temporada === 'string' ? obj.temporada.slice(0, 60) : null
      const insight = typeof obj?.insight === 'string' ? obj.insight.slice(0, 500) : null
      if (pid && temporada && insight) {
        await prisma.$executeRaw(Prisma.sql`
          INSERT INTO pricing_aprendizaje (property_id, temporada, insight, metricas, updated_at)
          VALUES (${pid}, ${temporada}, ${insight},
                  ${JSON.stringify({ source: 'chat_alberto', at: new Date().toISOString() })}::jsonb, now())
          ON CONFLICT (property_id, temporada) DO UPDATE
          SET insight = EXCLUDED.insight, metricas = EXCLUDED.metricas, updated_at = now()`)
        guardado = { property_id: pid, temporada, insight }
      }
    } catch { /* línea mal formada: no guardar */ }
    // No mostrar la línea técnica al usuario.
    respuesta = respuesta.replace(/GUARDAR_APRENDIZAJE:\s*\{[\s\S]*\}/, '').trim()
  }

  return NextResponse.json({ respuesta, guardado })
}
