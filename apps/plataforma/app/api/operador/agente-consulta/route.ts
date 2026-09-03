// Preguntar POR un agente (no AL agente) — la consulta que faltaba en /operador/agentes.
//
// Alberto (02/09/2026): «unifica agentes en una página y ahí meter todos, por si tengo consulta de
// algo». La página ya estaba; lo que no había era dónde preguntar. Y hablar con el agente no es
// posible: 28 de los 29 son crons o sesiones efímeras. Aquí se responde leyendo su EXPEDIENTE —
// ficha del catálogo + semáforo + huella de sus pasadas + veredicto del vigía — que es lo que uno
// pregunta de verdad: «¿por qué no me avisó?», «¿cuándo pasó la última vez?».
//
// Solo lectura: este puerto no lanza, no pausa y no cambia nada de ningún agente.
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { getAdmin } from '@/lib/superadmin'
import { chatConDirector } from '@/lib/pasarela'
import { FAMILIAS } from '@/lib/agentes-catalogo'
import { getSaludAgentesCompleta, LATIDOS_POR_AGENTE } from '@/lib/agentes-salud'
import {
  formatearExpediente, SYSTEM_CONSULTA,
  type Expediente, type LatidoExpediente, type VigiaExpediente,
} from '@/lib/agentes-expediente'

export const maxDuration = 30
export const dynamic = 'force-dynamic'

/** Filas de `agente_latidos` de los ids que respaldan a este agente. `[]` si la tabla no está. */
async function latidos(ids: string[]): Promise<LatidoExpediente[]> {
  if (!ids.length) return []
  try {
    return await prisma.$queryRaw<LatidoExpediente[]>(Prisma.sql`
      SELECT agente, ultimo_at::text AS ultimo_at, ultimo_ok_at::text AS ultimo_ok_at, ok, detalle
      FROM agente_latidos WHERE agente = ANY(${ids}::text[])`)
  } catch {
    return []
  }
}

/** Veredicto del vigía. Con varios latidos gana el que tenga alerta: es el que explica el rojo. */
async function vigia(ids: string[]): Promise<VigiaExpediente> {
  if (!ids.length) return null
  try {
    const filas = await prisma.$queryRaw<NonNullable<VigiaExpediente>[]>(Prisma.sql`
      SELECT evaluado_at::text AS evaluado_at, alerta, horas, max_horas, motivo, nota, sonda_error
      FROM agente_salud WHERE agente = ANY(${ids}::text[])
      ORDER BY alerta DESC NULLS LAST, evaluado_at DESC
      LIMIT 1`)
    return filas[0] ?? null
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  const admin = await getAdmin().catch(() => null)
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({} as any))
  const id = typeof body?.agente === 'string' ? body.agente : ''
  const mensaje = typeof body?.mensaje === 'string' ? body.mensaje.trim().slice(0, 1000) : ''
  if (!mensaje) return NextResponse.json({ error: 'mensaje requerido' }, { status: 400 })

  // El agente tiene que estar EN EL CATÁLOGO: sin ficha no hay expediente que leer, y responder
  // «sobre» un id inventado sería exactamente la alucinación que este puerto existe para evitar.
  const ficha = FAMILIAS.flatMap(f => f.agentes).find(a => a.id === id)
  if (!ficha) return NextResponse.json({ error: `agente desconocido: ${id || '(vacío)'}` }, { status: 400 })

  const esperados = LATIDOS_POR_AGENTE[id] ?? []
  const [saludTodos, filasLatido, veredicto] = await Promise.all([
    getSaludAgentesCompleta().catch(() => ({})),
    latidos(esperados),
    vigia(esperados),
  ])

  const s = (saludTodos as Record<string, { estado: 'verde' | 'ambar' | 'rojo' | 'gris'; detalle: string; ultima: string | null; horas: number | null }>)[id]
  const expediente: Expediente = {
    ficha: {
      id: ficha.id, nombre: ficha.nombre, funcion: ficha.funcion, cadencia: ficha.cadencia,
      disparo: ficha.disparo, entrega: ficha.entrega, telegram: ficha.telegram,
      archivo: ficha.archivo, vertical: ficha.vertical, estado: ficha.estado,
    },
    salud: s ? { estado: s.estado, detalle: s.detalle, ultima: s.ultima, horas: s.horas } : null,
    latidos: filasLatido,
    latidosEsperados: esperados,
    vigia: veredicto,
  }

  const prompt = `${formatearExpediente(expediente)}\n\n# Pregunta de Alberto\n${mensaje}\n\n# Tu respuesta`

  try {
    const { text } = await chatConDirector([{ role: 'user', content: prompt }], {
      app: 'plataforma', endpoint: 'agente-consulta', system: SYSTEM_CONSULTA,
      maxTokens: 600, timeoutMs: 25_000,
    })
    return NextResponse.json({ respuesta: text })
  } catch (e: any) {
    // Se devuelve el fallo como fallo, no como una respuesta vacía que se lea como «no hay nada».
    return NextResponse.json(
      { error: 'No se pudo consultar: ' + String(e?.message || e).slice(0, 160) },
      { status: 502 },
    )
  }
}
