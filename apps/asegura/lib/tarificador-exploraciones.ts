// Explorador IA — lectura y revisión (fase C, 13/10/2026). Solo lo que lee el puerto de operador: cabeceras, resumen
// de pasos (SIN inventario) y el mapa re-validado. No toca el worker ni la lógica de los pasos (fase B).
import { validarMapa, type MapaExploracion } from '@central/module-tarificacion'
import { prisma } from './tenant'
import { puedeAprobar, resumirPaso, type EstadoMapa, type PasoResumen } from './tarificador-exploraciones-reglas'

export type ResumenExploracion = {
  id: string
  trabajoId: string
  compania: string
  producto: string
  entrada: string
  /** Estado del TRABAJO (pendiente, en_curso, ok, requiere_humano, error_*, cancelado). */
  estadoTrabajo: string
  estadoMapa: EstadoMapa
  conDatosReales: boolean
  pasos: number
  llamadasIA: number
  costeEstimadoEur: number
  modelo: string | null
  motivoFin: string | null
  tieneMapa: boolean
  revisadoPor: string | null
  revisadoEn: string | null
  creadoEn: string
  cerradaEn: string | null
}

type Fila = {
  id: string; trabajo_id: string; compania: string; producto: string; entrada: string; estado_trabajo: string; estado_mapa: string
  con_datos_reales: boolean; pasos: number; llamadas_ia: number; coste: unknown; modelo: string | null; motivo_fin: string | null
  tiene_mapa: boolean; revisado_por: string | null; revisado_at: Date | null; created_at: Date; cerrada_at: Date | null
}

const aResumen = (f: Fila): ResumenExploracion => ({
  id: f.id, trabajoId: f.trabajo_id, compania: f.compania, producto: f.producto, entrada: f.entrada, estadoTrabajo: f.estado_trabajo,
  estadoMapa: f.estado_mapa === 'revisado' || f.estado_mapa === 'descartado' ? f.estado_mapa : 'borrador',
  conDatosReales: f.con_datos_reales, pasos: Number(f.pasos), llamadasIA: f.llamadas_ia, costeEstimadoEur: Number(f.coste),
  modelo: f.modelo, motivoFin: f.motivo_fin, tieneMapa: f.tiene_mapa, revisadoPor: f.revisado_por,
  revisadoEn: f.revisado_at ? f.revisado_at.toISOString() : null, creadoEn: f.created_at.toISOString(), cerradaEn: f.cerrada_at ? f.cerrada_at.toISOString() : null,
})

/** Las últimas exploraciones de la correduría (sin mapa ni inventario: es el listado). */
export async function listarExploraciones(correduriaId: string, limite = 100): Promise<ResumenExploracion[]> {
  const filas = await prisma.$queryRaw<Fila[]>`
    select e.id::text, e.trabajo_id::text, e.compania, e.producto, e.entrada, t.estado as estado_trabajo, e.estado_mapa,
           e.con_datos_reales, (select count(*) from seguros.tarificador_exploracion_pasos p where p.exploracion_id = e.id)::int as pasos,
           e.llamadas_ia, e.coste_estimado_eur as coste, e.modelo, e.motivo_fin, (e.mapa is not null) as tiene_mapa,
           e.revisado_por, e.revisado_at, e.created_at, e.cerrada_at
    from seguros.tarificador_exploraciones e
    join seguros.tarificacion_trabajos t on t.id = e.trabajo_id and t.correduria_id = e.correduria_id
    where e.correduria_id = ${correduriaId}::uuid
    order by e.created_at desc
    limit ${limite}`
  return filas.map(aResumen)
}

export type DetalleExploracion = ResumenExploracion & { pasosLista: PasoResumen[]; mapa: MapaExploracion | null; mapaInvalido: boolean }

export async function leerExploracion(correduriaId: string, id: string): Promise<DetalleExploracion | null> {
  const filas = await prisma.$queryRaw<(Fila & { mapa: unknown })[]>`
    select e.id::text, e.trabajo_id::text, e.compania, e.producto, e.entrada, t.estado as estado_trabajo, e.estado_mapa,
           e.con_datos_reales, (select count(*) from seguros.tarificador_exploracion_pasos p where p.exploracion_id = e.id)::int as pasos,
           e.llamadas_ia, e.coste_estimado_eur as coste, e.modelo, e.motivo_fin, (e.mapa is not null) as tiene_mapa,
           e.revisado_por, e.revisado_at, e.created_at, e.cerrada_at, e.mapa
    from seguros.tarificador_exploraciones e
    join seguros.tarificacion_trabajos t on t.id = e.trabajo_id and t.correduria_id = e.correduria_id
    where e.correduria_id = ${correduriaId}::uuid and e.id = ${id}::uuid`
  const f = filas[0]
  if (!f) return null
  // Sin `inventario`: la pantalla de revisión no lo necesita y es lo más pesado de la fila.
  const pasos = await prisma.$queryRaw<{ n: number; huella: string; respuesta: unknown; origen: string; coste_estimado_eur: unknown; errores: unknown }[]>`
    select n, huella, respuesta, origen, coste_estimado_eur, errores
    from seguros.tarificador_exploracion_pasos
    where exploracion_id = ${id}::uuid and correduria_id = ${correduriaId}::uuid
    order by n
    limit 200`
  const mapa = f.mapa === null ? null : validarMapa(f.mapa)
  return {
    ...aResumen(f),
    pasosLista: pasos.map((p) => resumirPaso({ n: p.n, huella: p.huella, respuesta: p.respuesta, origen: p.origen, costeEur: Number(p.coste_estimado_eur), errores: p.errores })),
    mapa,
    mapaInvalido: f.mapa !== null && mapa === null,
  }
}

export type ResultadoRevision =
  | { estado: 'ok'; estadoMapa: EstadoMapa }
  | { estado: 'no_encontrada' }
  | { estado: 'sin_mapa' | 'sin_cerrar' | 'mapa_invalido' }

/**
 * Marca el mapa `revisado` (aprobado), `descartado` o de vuelta a `borrador`. Aprobar solo cambia el ESTADO: no exporta
 * ni genera código (eso es un PR aparte, con un agente). Sin mapa, sin cerrar o con un mapa que no valida → no se aprueba.
 */
export async function revisarMapa(correduriaId: string, id: string, estado: EstadoMapa, quien: string): Promise<ResultadoRevision> {
  const f = await prisma.$queryRaw<{ mapa: unknown; cerrada: boolean }[]>`
    select mapa, (cerrada_at is not null) as cerrada from seguros.tarificador_exploraciones
    where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid`
  if (!f[0]) return { estado: 'no_encontrada' }
  if (estado === 'revisado') {
    const p = puedeAprobar({ tieneMapa: f[0].mapa !== null, cerrada: f[0].cerrada })
    if (p !== 'ok') return { estado: p }
    if (validarMapa(f[0].mapa) === null) return { estado: 'mapa_invalido' }
  }
  const borrador = estado === 'borrador'
  await prisma.$executeRaw`
    update seguros.tarificador_exploraciones
    set estado_mapa = ${estado}, revisado_por = ${borrador ? null : quien}, revisado_at = ${borrador ? null : new Date()}, updated_at = now()
    where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid`
  return { estado: 'ok', estadoMapa: estado }
}
