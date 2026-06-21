import { NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { aiRunner } from '@/lib/concursos'
import { COMUNIDADES } from '@central/module-concursos'

// K "Búsqueda en lenguaje natural": traduce una petición libre a los filtros del
// buscador {cpv, ccaa, provincia, presupuesto, q}. Degrada a búsqueda por texto si
// la IA falla. No toca BD.
export const maxDuration = 30

export async function POST(req: Request) {
  try { await requireEmpresaId() }
  catch { return NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }

  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 }) }
  const texto = String(b?.texto || '').trim()
  if (!texto) return NextResponse.json({ error: 'Falta el texto' }, { status: 400 })

  const ccaaIds = COMUNIDADES.map(c => c.id).join(', ')
  const system = `Conviertes una petición en lenguaje natural en filtros JSON para buscar licitaciones públicas españolas. Responde SOLO un objeto JSON (sin texto ni markdown) con estas claves opcionales:
- "cpv": array de prefijos CPV (2-4 dígitos, sin puntos) del sector (ej. fontanería→["4533"], limpieza→["90"], catering→["55"], obras→["45"], jardinería→["77"], informática→["72"], seguridad→["797"]).
- "ccaa": id de comunidad autónoma, uno de: ${ccaaIds}. Solo si se menciona la región; vacío si dan una provincia concreta.
- "provincia": nombre de la provincia si se menciona una (ej. "Sevilla").
- "presupuesto_min", "presupuesto_max": números en euros.
- "q": palabras clave libres que no encajen en lo anterior.
Omite las claves que no apliquen.`

  let filtros: any = {}
  try {
    let raw = (await aiRunner(system, texto)).trim()
    raw = raw.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim()
    filtros = JSON.parse(raw)
  } catch {
    return NextResponse.json({ filtros: { q: texto } }) // degrada a búsqueda normal
  }

  const out: any = {}
  if (Array.isArray(filtros.cpv)) out.cpv = filtros.cpv.map((x: any) => String(x).replace(/[^0-9]/g, '')).filter(Boolean)
  if (typeof filtros.ccaa === 'string' && COMUNIDADES.some(c => c.id === filtros.ccaa)) out.ccaa = filtros.ccaa
  if (typeof filtros.provincia === 'string' && filtros.provincia.trim()) out.provincia = filtros.provincia.trim()
  if (filtros.presupuesto_min != null && !isNaN(Number(filtros.presupuesto_min))) out.presupuesto_min = Number(filtros.presupuesto_min)
  if (filtros.presupuesto_max != null && !isNaN(Number(filtros.presupuesto_max))) out.presupuesto_max = Number(filtros.presupuesto_max)
  if (typeof filtros.q === 'string' && filtros.q.trim()) out.q = filtros.q.trim()
  return NextResponse.json({ filtros: out })
}
