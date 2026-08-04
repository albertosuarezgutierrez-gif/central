import { NextResponse } from 'next/server'
import { verificarSecreto, registrarUso, dentroDePresupuesto } from '@/lib/ai-gateway'
import { chatConDirector } from '@/lib/pasarela'
import { validarReescritura } from '@/lib/reescritura-guardia'
import type { NimChatMessage } from '@central/core-ai'

// 150s: la guardia puede encadenar DOS llamadas LLM (barato + escalado a Opus si la
// guardia rechaza la primera), cada una con timeoutMs:55_000 más abajo — 60s se quedaba
// corto y Vercel mataba la función a mitad del escalado (FUNCTION_INVOCATION_TIMEOUT,
// visto en vivo el 29/07/2026: /api/ai/ejecutar sin responder tras exactamente 60s).
export const maxDuration = 150
export const dynamic = 'force-dynamic'

// EJECUTOR de código — el 3er rol del "caro planifica / barato ejecuta". Dado UN archivo + una
// instrucción precisa (que ya redactó el planificador: la sesión Claude alta), un modelo CODER
// BARATO de la categoría `codigo` reescribe el archivo. Determinista: NO pasa por el decisor del
// Director (el caller ya sabe la categoría), reutiliza presupuesto + telemetría de la pasarela.
// NO edita disco ni git: devuelve el contenido; el orquestador lo aplica, revisa y verifica.

/** Quita fences markdown accidentales (```lang ... ```) que algunos modelos añaden pese al system. */
function quitarFences(texto: string): string {
  const t = texto.trim()
  const m = t.match(/^```[^\n]*\n([\s\S]*?)\n```$/)
  return (m ? m[1] : t)
}

const SYSTEM = [
  'Eres un programador senior. Recibes el CONTENIDO ACTUAL de un archivo y una INSTRUCCIÓN.',
  'Reescribe el archivo COMPLETO aplicando la instrucción, conservando todo lo demás intacto.',
  'Devuelve SOLO el contenido final del archivo: sin explicaciones, sin comentarios extra y SIN',
  'fences de markdown (nada de ```). Mantén el estilo, la indentación y las convenciones del archivo.',
].join(' ')

export async function POST(req: Request) {
  if (!verificarSecreto(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const ruta = typeof body?.ruta === 'string' ? body.ruta.trim() : ''
  const contenido = typeof body?.contenido === 'string' ? body.contenido : ''
  const instruccion = typeof body?.instruccion === 'string' ? body.instruccion.trim() : ''
  const criterio = typeof body?.criterio === 'string' ? body.criterio.trim() : ''
  const app = String(body?.app ?? 'codigo')
  const clienteRef = typeof body?.cliente === 'string' && body.cliente.trim() ? body.cliente.trim().slice(0, 120) : null
  const maxTokens = Number(body?.maxTokens) > 0 ? Math.min(Number(body.maxTokens), 32_000) : 8_000

  if (!contenido || !instruccion) {
    return NextResponse.json({ error: 'Faltan contenido e instruccion' }, { status: 400 })
  }

  if (!(await dentroDePresupuesto())) {
    await registrarUso({ app, endpoint: 'ejecutar', proveedor: 'openrouter', modelo: null, ok: false, ms: 0, error: 'presupuesto mensual excedido', clienteRef })
    return NextResponse.json({ error: 'Límite mensual de IA alcanzado' }, { status: 429 })
  }

  const user = [
    `Archivo: ${ruta || '(sin ruta)'}`,
    `Instrucción: ${instruccion}`,
    criterio ? `Criterio de aceptación: ${criterio}` : '',
    '',
    'CONTENIDO ACTUAL:',
    contenido,
  ].filter(Boolean).join('\n')
  const messages: NimChatMessage[] = [{ role: 'user', content: user }]

  const reescribir = async (categoria: 'codigo' | 'plan') => {
    const res = await chatConDirector(messages, {
      app, endpoint: 'ejecutar', categoria, system: SYSTEM,
      temperature: 0, maxTokens, timeoutMs: 55_000, clienteRef,
    })
    return { contenido: quitarFences(res.text), modelo: res.modelo }
  }

  try {
    // 1) coder BARATO del catálogo (categoria:'codigo'), sin hop al decisor. La pasarela gestiona
    //    presupuesto diario, fallback y registro en ai_usos (endpoint='ejecutar').
    let out = await reescribir('codigo')
    let chequeo = validarReescritura(contenido, out.contenido)
    let escalado = false

    // 2) GUARDIA: si la salida es destructiva (trunca el fichero o borra exports que existían — el
    //    coder barato lo hace a veces), NO la aplicamos: reintentamos UNA vez con el modelo FUERTE
    //    (categoria:'plan' = el modelo alto del catálogo). Coste alto solo en el caso raro de fallo;
    //    la vía normal sigue siendo barata.
    if (!chequeo.ok) {
      const fuerte = await reescribir('plan')
      const chequeoFuerte = validarReescritura(contenido, fuerte.contenido)
      if (chequeoFuerte.ok) {
        out = fuerte; chequeo = chequeoFuerte; escalado = true
      } else {
        // 3) Ni el barato ni el fuerte producen una reescritura sana → NO devolvemos código roto.
        //    422 con el motivo: el orquestador salta ese archivo y el humano lo ve. Nada se aplica.
        return NextResponse.json(
          { error: `reescritura rechazada por la guardia: ${chequeoFuerte.motivo || chequeo.motivo}`, motivo: chequeoFuerte.motivo || chequeo.motivo },
          { status: 422 },
        )
      }
    }
    return NextResponse.json({ contenido: out.contenido, modelo: out.modelo, ruta: ruta || null, escalado })
  } catch {
    return NextResponse.json({ error: 'Ejecutor de código no disponible' }, { status: 502 })
  }
}
