import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { auditado } from '@/lib/auditoria'
import { anadirMensajeSiniestro, leerHiloSiniestro, metaPreRehuse, valorarAnalisisSiniestro } from '@/lib/siniestro-hilo'
import { actorDe, cadena, correduriaPedida, respuestaFallo } from '@/lib/siniestro-hilo-puerto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Hilo de conversación del siniestro (corredor ↔ IA ↔ compañía), por el puerto de operador.
 *
 *   GET  ?correduriaId&siniestroId → { estado:'ok', siniestro, poliza, documentosSiniestro, mensajes, plazos,
 *                                      diasEsperandoCompania }   (`mensajes: null` = no se pudo leer)
 *   POST { correduriaId, siniestroId, autor ('compania'|'corredor'|'interna'), tipo, texto (≤ 50.000),
 *          documentoId?, reclamacionSac? (solo con tipo 'enviado'), sustituyeA? (id de mensaje: EDITAR = versión nueva;
 *          mismo siniestro y autor, nunca de la IA, no ya sustituido → 409), actor? } → { estado:'ok', ...Mensaje, mensaje, preRehuse?: true }
 *   POST { correduriaId, siniestroId, valoracion: { mensajeId (mensaje 'ia' de este siniestro), voto: 'bien'|'mal', motivo? }, actor? }
 *        → nota interna (texto = motivo o 👍/👎, meta.valoracion {mensajeId, voto}); 404 si no es un mensaje de la IA de este siniestro.
 *   `preRehuse: true` = el texto apunta a rehúse (`detectarPreRehuse`) y el siniestro no había avisado antes (`meta.preRehuseAvisado`, una vez).
 *   GET añade `partesPortal: [{id, fecha, descripcion, documentos:[{id, nombre}]}] | null` (partes del portal vinculados).
 * Cada mensaje del GET lleva `sustituidoPor` (id | null); plazos/espera/IA leen solo la última versión.
 *
 * SOLO-AÑADIR: no hay PATCH ni DELETE (cepo `test/regression-siniestro-hilo.test.ts`). El autor `ia` lo escribe
 * SOLO el servidor (`anadirMensajeSiniestro(..., { canal: 'servidor' })`): por aquí → 422.
 * 400 falta un id · 403 otra correduría · 404 siniestro/documento/mensaje no es de esta correduría · 409 mensaje ya editado · 422 inválido ·
 * 503 `sin_migracion` (SQL 2026-10-28d sin aplicar).
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const q = new URL(req.url).searchParams
  const siniestroId = cadena(q.get('siniestroId'))
  if (!siniestroId) return NextResponse.json({ estado: 'invalido', motivo: 'falta siniestroId' }, { status: 400 })
  try {
    const c = await correduriaPedida(q.get('correduriaId'))
    if (!c.ok) return c.res
    const r = await leerHiloSiniestro(c.id, siniestroId)
    if (!r.ok) return respuestaFallo(r)
    return NextResponse.json({ estado: 'ok', ...r.hilo })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/siniestro/hilo', e) }, { status: 500 })
  }
}

export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b || typeof b !== 'object') return NextResponse.json({ estado: 'invalido', motivo: 'cuerpo no válido' }, { status: 422 })
  const siniestroId = cadena(b.siniestroId)
  if (!siniestroId) return NextResponse.json({ estado: 'invalido', motivo: 'falta siniestroId' }, { status: 400 })
  // Defensa explícita además de la regla pura: el puerto NUNCA escribe como IA.
  if (b.autor === 'ia') return NextResponse.json({ estado: 'invalido', motivo: 'autor «ia» solo lo escribe el servidor' }, { status: 422 })
  // Editar un mensaje de la IA tampoco: `anadirMensajeSiniestro` rechaza `sustituyeA` cuyo original sea autor «ia».
  try {
    const c = await correduriaPedida(b.correduriaId)
    if (!c.ok) return c.res
    // Valoración 👍/👎 de un análisis de la IA: nota interna con `meta.valoracion` (no pasa por el resto de campos).
    if (b.valoracion !== undefined && b.valoracion !== null) {
      const rv = await valorarAnalisisSiniestro(c.id, { siniestroId, valoracion: b.valoracion, creadoPor: actorDe(req, b) })
      if (!rv.ok) return respuestaFallo(rv)
      return NextResponse.json({ estado: 'ok', ...rv.mensaje, mensaje: rv.mensaje })
    }
    const preRehuse = await metaPreRehuse(c.id, siniestroId, b.texto)
    const r = await anadirMensajeSiniestro(c.id, {
      siniestroId,
      autor: b.autor,
      tipo: b.tipo,
      texto: b.texto,
      documentoId: cadena(b.documentoId),
      reclamacionSac: b.reclamacionSac,
      sustituyeA: b.sustituyeA === undefined || b.sustituyeA === null ? null : (cadena(b.sustituyeA) ?? ''),
      creadoPor: actorDe(req, b),
      canal: 'operador',
      ...(preRehuse ? { meta: preRehuse } : {}),
    })
    if (!r.ok) return respuestaFallo(r)
    // Mensaje en la raíz (contrato «→ Mensaje») y también en `mensaje`, por convención del puerto.
    // `preRehuse: true` = primer mensaje del siniestro que apunta a rehúse: plataforma avisa por Telegram.
    return NextResponse.json({ estado: 'ok', ...r.mensaje, mensaje: r.mensaje, ...(preRehuse ? { preRehuse: true } : {}) })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/siniestro/hilo', e) }, { status: 500 })
  }
})
