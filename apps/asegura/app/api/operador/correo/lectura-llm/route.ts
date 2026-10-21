import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { auditado } from '@/lib/auditoria'
import { validarEntradaLecturaLLM } from '@/lib/correo-lectura-llm'
import { guardarLecturaLLM } from '@/lib/correo-lectura-llm-bd'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Lecturas del EXTRACTOR LLM en MODO SOMBRA (F2 del agente de correo, 21/10/2026). Lo llama el triaje de `apps/plataforma`
 * (`lib/correo/extractor-llm.ts`) tras leer un correo de compañía con el modelo, cuando `CORREO_LLM_MODO=sombra`.
 *
 *   POST { mensajeId, proposito: 'cola_larga'|'comparacion', modelo, ficha, noLiterales, comparacion? }
 *        → { estado:'ok', repetido } · 422 `invalido` · 503 `sin_migracion` (sin la tabla: no se ha escrito nada) ·
 *          503 `sin_configurar`.
 *
 * SOLO guarda la propuesta para medirla: no escribe en la cartera, no crea tareas, no avisa. Idempotente por Message-ID.
 * Validación: `lib/correo-lectura-llm.ts` (puro, con test; ignora cualquier `tomador`). Escritura: `lib/correo-lectura-llm-bd.ts`.
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const v = validarEntradaLecturaLLM(await req.json().catch(() => null))
    if (!v.ok) return NextResponse.json({ estado: 'invalido', motivo: v.motivo }, { status: 422 })
    const r = await guardarLecturaLLM(correduria.id, v.entrada)
    if (!r.ok) return NextResponse.json({ estado: r.estado, motivo: r.motivo }, { status: 503 })
    return NextResponse.json({ estado: 'ok', repetido: r.repetido })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/correo/lectura-llm', e) }, { status: 500 })
  }
})
