import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { auditado } from '@/lib/auditoria'
import { ErrorCodeoscopic } from '@/lib/codeoscopic/cliente'
import { resolverConfig, explicarConfig } from '@/lib/codeoscopic/config'
import { conLibroDeEmision } from '@/lib/codeoscopic/libro-emision'
import { recomendarLimitesHogar } from '@/lib/codeoscopic/limites-hogar'
import { prepararLimitesHogar, type CuerpoRetarificacion } from '@/lib/retarificar-cartera'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// El portal avisa de que la recomendación puede tardar más de un minuto.
export const maxDuration = 300

/**
 * `POST /api/operador/codeoscopic/limites-hogar` — los capitales de continente y
 * contenido que Codeoscopic recomienda para la vivienda de una póliza de hogar.
 *
 *   { polizaId, confirmado: true, solicitadoPor?, resueltos?, correcciones?, catastro? }
 *
 * Mismo cuerpo que `/retarificar` (la vivienda se precalifica igual), sin exigir
 * capital: es lo que se pregunta.
 *
 * 🚨 **Se trata como una llamada que puede costar.** El portal no la documenta
 * como facturable, pero devuelve un capital por compañía y [Probable] tarifica
 * por dentro. Por eso: detrás del interruptor de TARIFICAR (no del gratis),
 * `confirmado: true` obligatorio, SIN `GET` (un prefetch no puede dispararla),
 * un solo intento y su línea en el libro de consumo (`limites_hogar`, coste en
 * env a 0 = «sin confirmar», tope propio). Lo que devuelve es una RECOMENDACIÓN:
 * la pantalla la ofrece para rellenar el capital, nunca lo rellena sola.
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const cuerpo = (await req.json().catch(() => ({}))) as Record<string, unknown>
  if (cuerpo.confirmado !== true) {
    return NextResponse.json(
      {
        estado: 'error',
        causa: 'sin_confirmar',
        mensaje: 'Hay que mandar `confirmado: true` (booleano): es una llamada real a Codeoscopic.',
        gastado: '0,00€',
      },
      { status: 400 },
    )
  }
  const polizaId = typeof cuerpo.polizaId === 'string' ? cuerpo.polizaId.trim() : ''
  if (!/^[0-9a-f-]{36}$/i.test(polizaId)) {
    return NextResponse.json({ estado: 'error', causa: 'otro', mensaje: 'falta polizaId', gastado: '0,00€' }, { status: 400 })
  }

  // Gratis: precalificación, catálogo de ramos. Corta sin llamar al vendor.
  const preparado = await prepararLimitesHogar({ polizaId, cuerpo: cuerpo as CuerpoRetarificacion })
  if (preparado.estado === 'corte') {
    return NextResponse.json(preparado.respuesta.cuerpo, { status: preparado.respuesta.status })
  }

  const cfg = resolverConfig(process.env)
  if (cfg.estado !== 'lista') {
    return NextResponse.json({ estado: 'sin_configurar', mensaje: explicarConfig(cfg), gastado: '0,00€' }, { status: 503 })
  }

  const solicitadoPor = typeof cuerpo.solicitadoPor === 'string' && cuerpo.solicitadoPor.trim() ? cuerpo.solicitadoPor.trim() : 'plataforma'
  try {
    const r = await conLibroDeEmision(
      { correduriaId: preparado.correduriaId, operacion: 'limites_hogar', solicitadoPor, projectId: null },
      () => recomendarLimitesHogar(cfg.config, preparado.cuerpo),
    )
    if (!r.ok) {
      return NextResponse.json(
        { estado: r.razon === 'tope' ? 'tope' : 'error', causa: r.razon, mensaje: r.mensaje, gastado: '0,00€' },
        { status: r.razon === 'tope' ? 429 : 503 },
      )
    }
    const { continente, contenido } = r.valor.limites
    return NextResponse.json({
      estado: 'ok',
      continente,
      contenido,
      // Sin ninguno de los dos, la respuesta no dice nada útil: se enseña cruda.
      ...(continente === null && contenido === null ? { crudo: r.valor.crudo } : {}),
      coste: r.coste,
      restantesHoy: r.restantesHoy,
    })
  } catch (e) {
    if (e instanceof ErrorCodeoscopic) {
      const sinCargo = e.pruebaQueNoHuboCargo
      return NextResponse.json(
        {
          estado: 'error',
          causa: e.clase,
          mensaje: `Codeoscopic no ha recomendado capitales: ${e.detalle}`,
          // Un timeout o un 5xx no prueban que no se haya cobrado.
          gastoDesconocido: !sinCargo,
          ...(sinCargo ? { gastado: '0,00€' } : {}),
        },
        { status: e.clase === 'validacion' ? 422 : 502 },
      )
    }
    return NextResponse.json(
      { estado: 'error', causa: 'otro', mensaje: e instanceof Error ? e.message : String(e), gastoDesconocido: true },
      { status: 502 },
    )
  }
})
