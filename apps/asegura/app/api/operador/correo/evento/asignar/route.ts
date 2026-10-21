import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { auditado } from '@/lib/auditoria'
import { validarAsignacionEvento } from '@/lib/correo-documento'
import { asignarEventoCorreo } from '@/lib/correo-asignar-bd'
import { esTablaInexistente } from '@/lib/correo-avisos-intranet'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/operador/correo/evento/asignar — «Asignar a cliente / oportunidad» de la bandeja «Correos de compañía»
 * (F1 del agente de correo, 21/10/2026). `{ id, clienteId, oportunidadId?, actor }` → `{ estado:'ok', via, resumen, documentos }`.
 *   · Solo avisos `sin_resolver` (409 si ya tienen desenlace).
 *   · Una SOLICITUD exige la oportunidad del cliente (se apunta su nº y se engancha como si se hubiera escrito a mano).
 *   · El resto: nota en la ficha y fila `aplicado` (sin tareas ni siniestros). Los adjuntos sin asignar del correo, a la ficha.
 * Regla pura y test: `lib/correo-documento.ts` (`decidirAsignacion`). Escritura: `lib/correo-asignar-bd.ts`.
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const v = validarAsignacionEvento(b)
    if (!v.ok) return NextResponse.json({ estado: 'invalido', motivo: v.motivo }, { status: 422 })
    const actor = typeof b?.actor === 'string' && b.actor.trim() !== '' ? b.actor.trim().slice(0, 120) : 'plataforma'
    const r = await asignarEventoCorreo(correduria.id, v.valor, actor)
    if (!r.ok) return NextResponse.json({ estado: r.estado, motivo: r.motivo }, { status: r.status })
    return NextResponse.json({ estado: 'ok', via: r.via, resumen: r.resumen, documentos: r.documentos })
  } catch (e) {
    if (esTablaInexistente(e)) return NextResponse.json({ estado: 'sin_migracion', motivo: 'falta aplicar 2026-10-14_correo_evento_entrante.sql' }, { status: 503 })
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/correo/evento/asignar', e) }, { status: 500 })
  }
})
