import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { auditado } from '@/lib/auditoria'
import { fechaCorreoMadrid, validarEntradaEvento, validarMarcaRevisado } from '@/lib/correo-evento'
import { eventosCorreoRecientes, marcarEventoRevisado, registrarEventoCorreo } from '@/lib/correo-evento-bd'
import { esTablaInexistente } from '@/lib/correo-avisos-intranet'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Avisos de compañías leídos del correo (14/10/2026; `solicitud` —estado de un proyecto en la compañía, casado con
 * la OPORTUNIDAD por `compania_solicitud_num`— el 20/10/2026). Lo llama el triaje de `apps/plataforma`
 * cuando `leerCorreoEventoAseguradora` reconoce un correo `correduria`/`correduria-recibo` que NO es
 * una devolución (esas van por `/recibos/devolucion`).
 *
 *   POST { mensajeId, compania?, evento, fechaCorreo? }
 *        → { estado:'ok', resultados: [{ tipo, clave, estado:'aplicado'|'duplicado_cima'|'sin_resolver'|'procesando',
 *            repetido, resumen, motivo, clienteId, cliente, polizaId, siniestroId, tareaVence }] }
 *        · 422 `invalido` (forma, compañía o código DGS que no casan) · 503 `sin_migracion` (sin la tabla:
 *          no se ha escrito nada) · 503 `sin_configurar`.
 *        Idempotente por Message-ID + tipo + elemento: releer el correo devuelve lo hecho (`repetido: true`).
 *        Póliza no resuelta (o casa con dos) → `sin_resolver`: NO se escribe nada en la cartera.
 *   GET  ?dias=30 → { estado:'ok', filas, truncado } — la bandeja «Correos de compañía» de Mi mesa.
 *
 *   PATCH { id, revisado } → { estado:'ok', id, revisado } — «Marcar como mirado» / «Deshacer» de la bandeja.
 *        422 `invalido` · 404 `no_encontrado` (la fila no es de esta correduría) · 503 `sin_migracion`.
 *
 * Lógica de despacho: `lib/correo-evento.ts` (puro, con test). Escrituras: `lib/correo-evento-bd.ts`.
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const v = validarEntradaEvento(b)
    if (!v.ok) return NextResponse.json({ estado: 'invalido', motivo: v.motivo }, { status: 422 })
    const fechaCorreo = fechaCorreoMadrid(b?.fechaCorreo)
    // El instante exacto del correo: una solicitud solo pisa su estado con un correo MÁS NUEVO que el último aplicado.
    const instante = typeof b?.fechaCorreo === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(b.fechaCorreo) ? new Date(b.fechaCorreo) : null
    const r = await registrarEventoCorreo(correduria.id, v.entrada, fechaCorreo, undefined, instante && !Number.isNaN(instante.getTime()) ? instante : null)
    if (!r.ok) return NextResponse.json({ estado: r.estado, motivo: r.motivo }, { status: 503 })
    return NextResponse.json({ estado: 'ok', ilegibles: v.entrada.ilegibles, resultados: r.resultados })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/correo/evento', e) }, { status: 500 })
  }
})

export const PATCH = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const v = validarMarcaRevisado(await req.json().catch(() => null))
    if (!v.ok) return NextResponse.json({ estado: 'invalido', motivo: v.motivo }, { status: 422 })
    const hecho = await marcarEventoRevisado(correduria.id, v.id, v.revisado)
    if (!hecho) return NextResponse.json({ estado: 'no_encontrado' }, { status: 404 })
    return NextResponse.json({ estado: 'ok', id: v.id, revisado: v.revisado })
  } catch (e) {
    if (esTablaInexistente(e)) return NextResponse.json({ estado: 'sin_migracion', motivo: 'falta aplicar 2026-10-14_correo_evento_entrante.sql' }, { status: 503 })
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/correo/evento', e) }, { status: 500 })
  }
})

export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const dias = Number(new URL(req.url).searchParams.get('dias') ?? '30')
    const r = await eventosCorreoRecientes(correduria.id, Number.isFinite(dias) ? dias : 30)
    return NextResponse.json({ estado: 'ok', ...r }, { headers: { 'cache-control': 'no-store' } })
  } catch (e) {
    if (esTablaInexistente(e)) return NextResponse.json({ estado: 'sin_migracion', motivo: 'falta aplicar 2026-10-14_correo_evento_entrante.sql' }, { status: 503 })
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/correo/evento', e) }, { status: 500 })
  }
}
