// Extracción AUTOMÁTICA de coberturas tras guardar el proyecto (26/10/2026). La llama la ruta del resultado del worker
// (en `after`), ANTES de preparar el borrador del presupuesto, para que éste ya tenga las coberturas.
//
// 🚨 NUNCA lanza ni rompe el guardado del precio (que ya está en BD): un fallo se registra (sin datos personales: id del
//    trabajo + clase del error) y la tarificación queda «Coberturas sin extraer» en plataforma, donde se puede lanzar a mano.
// Idempotente: si la tarificación ya tiene extracción no vuelve a gastar IA.
import { prisma } from './tenant'
import { registrarErrorCartera } from './error-cartera'
import { extraerCoberturas, SinTablaFichasError } from './tarificador-fichas'
import { datosProyecto, esUuid } from './tarificador-fichas-reglas'

export type ResultadoExtraccionAuto =
  | { estado: 'extraida'; modo: string }
  | { estado: 'ya_extraida' }
  | { estado: 'nada'; motivo: string }
  | { estado: 'fallo'; motivo: string }

export const ACTOR_EXTRACCION_AUTO = 'auto:rpa'

export async function extraerCoberturasTrasTrabajo(trabajoId: string): Promise<ResultadoExtraccionAuto> {
  try {
    if (!esUuid(trabajoId)) return { estado: 'nada', motivo: 'trabajo_invalido' }
    const [t] = await prisma.$queryRaw<{ correduria_id: string; tarificacion_id: string | null; estado: string; modo: string | null }[]>`
      select correduria_id::text as correduria_id, tarificacion_id::text as tarificacion_id, estado, to_jsonb(w)->>'modo' as modo
      from seguros.tarificacion_trabajos w where w.id = ${trabajoId}::uuid`
    if (!t || t.estado !== 'ok' || !t.tarificacion_id || (t.modo ?? 'tarificar') !== 'tarificar') return { estado: 'nada', motivo: 'no_es_tarificar_ok' }
    const [x] = await prisma.$queryRaw<{ respuesta: unknown }[]>`
      select respuesta from seguros.tarificaciones where id = ${t.tarificacion_id}::uuid and correduria_id = ${t.correduria_id}::uuid`
    if (!datosProyecto(x?.respuesta)?.documentoId) return { estado: 'nada', motivo: 'sin_pdf_del_proyecto' }
    const ya = await prisma.$queryRaw<{ id: string }[]>`
      select id::text as id from seguros.tarificador_coberturas_presupuesto
      where tarificacion_id = ${t.tarificacion_id}::uuid and correduria_id = ${t.correduria_id}::uuid`
    if (ya.length > 0) return { estado: 'ya_extraida' }
    const r = await extraerCoberturas(t.correduria_id, t.tarificacion_id, ACTOR_EXTRACCION_AUTO)
    if (r.estado === 'ok') return { estado: 'extraida', modo: r.modo }
    // `sin_texto` ya queda guardado (PDF escaneado); el resto no guarda nada y se puede reintentar a mano.
    const motivo = 'mensaje' in r ? r.mensaje.slice(0, 160) : r.estado
    console.error(`[proyecto-auto] trabajo ${trabajoId}: coberturas no extraídas (${r.estado})`)
    return { estado: 'fallo', motivo }
  } catch (e) {
    if (e instanceof SinTablaFichasError) {
      console.error(`[proyecto-auto] trabajo ${trabajoId}: falta el SQL 2026-10-07c (fichas): no se extraen coberturas`)
      return { estado: 'nada', motivo: 'sin_tabla' }
    }
    return { estado: 'fallo', motivo: registrarErrorCartera('proyecto-auto/extraccion', e) }
  }
}
