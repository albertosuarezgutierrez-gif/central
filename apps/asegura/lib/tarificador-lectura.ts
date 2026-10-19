// Lectura (solo SELECT) de un trabajo del tarificador RPA para el puerto de operador. Todo por
// `correduria_id`. La proyección pública vive en `tarificador-lectura-reglas.ts`.
import { prisma } from './tenant'
import { COMPANIAS_HOGAR_RPA, RAMOS_TARIFICABLES_RPA } from './tarificador-reglas'
import { documentoDePdf, primeroReutilizable, proyectarTrabajo, proyectarUltimoRiesgo, type TrabajoLectura, type UltimoRiesgo } from './tarificador-lectura-reglas'

/** Cuántos trabajos recientes se miran para encontrar uno cuyo riesgo no esté purgado (plantillas). */
export const CANDIDATOS_PLANTILLA = 20

/**
 * Riesgo del trabajo MÁS RECIENTE de ese cliente (cualquier estado, también error: interesan los datos
 * tecleados). Por `correduria_id`; solo SELECT; sin html/captura/error. Pre-rellena el modal del bot.
 */
export async function leerUltimoRiesgo(correduriaId: string, clienteId: string, compania: string, ramo: string): Promise<UltimoRiesgo> {
  const f = await prisma.$queryRaw<{ id: string; created_at: Date; riesgo: unknown; estado: string; ramo: string }[]>`
    select t.id::text as id, t.created_at, t.riesgo, t.estado, t.ramo
    from seguros.tarificacion_trabajos t
    where t.correduria_id = ${correduriaId}::uuid and t.cliente_id = ${clienteId}::uuid
      and lower(t.compania) = ${compania} and t.ramo = ${ramo}
      and coalesce(to_jsonb(t)->>'modo', 'tarificar') <> 'exploracion'
    order by t.created_at desc
    limit ${CANDIDATOS_PLANTILLA}`
  // Un riesgo ya purgado no precarga (se salta al anterior que aún lo tenga).
  return proyectarUltimoRiesgo(primeroReutilizable(f).fila)
}

type FilaTrabajo = { estado: string; created_at: Date; updated_at: Date; error: unknown; respuesta: unknown }

async function leerFila(correduriaId: string, id: string): Promise<FilaTrabajo | null> {
  const f = await prisma.$queryRaw<FilaTrabajo[]>`
    select t.estado, t.created_at, t.updated_at, t.error, x.respuesta
    from seguros.tarificacion_trabajos t
    left join seguros.tarificaciones x on x.id = t.tarificacion_id and x.correduria_id = t.correduria_id
    where t.id = ${id}::uuid and t.correduria_id = ${correduriaId}::uuid`
  return f[0] ?? null
}

export async function leerTrabajoOperador(correduriaId: string, id: string): Promise<TrabajoLectura | null> {
  const f = await leerFila(correduriaId, id)
  return f ? proyectarTrabajo(f, f.respuesta) : null
}

export async function leerPdfTrabajo(
  correduriaId: string, id: string, indice: number,
): Promise<{ nombre: string; contenido: Buffer } | null> {
  const f = await leerFila(correduriaId, id)
  if (!f || f.estado !== 'ok') return null
  const docId = documentoDePdf(f.respuesta, indice)
  if (!docId) return null
  const d = await prisma.$queryRaw<{ nombre_fichero: string | null; contenido: Buffer | null }[]>`
    select nombre_fichero, contenido from seguros.documentos
    where id = ${docId}::uuid and correduria_id = ${correduriaId}::uuid and mime_type = 'application/pdf'`
  if (!d[0]?.contenido) return null
  return { nombre: d[0].nombre_fichero ?? `oferta-${indice + 1}.pdf`, contenido: Buffer.from(d[0].contenido) }
}

// ─── Integraciones activas y «probar» (13/10/2026) ───────────────────────────

export type IntegracionActiva = { compania: string; ramo: string }

/**
 * Compañía+ramo que el bot PUEDE tarificar hoy: fila activa en `rpa_autorizada` (mismo cerrojo que `encolarTrabajo`) Y de un
 * ramo con adaptador (`RAMOS_TARIFICABLES_RPA`); Hogar (19/10/2026) solo de las compañías de `COMPANIAS_HOGAR_RPA` (la fila
 * `mapfre/hogar` u `occident/hogar` solo habilita la EXPLORACIÓN). Solo SELECT.
 */
export async function leerIntegracionesActivas(correduriaId: string): Promise<IntegracionActiva[]> {
  return prisma.$queryRaw<IntegracionActiva[]>`
    select compania, ramo from seguros.companias_integracion
    where correduria_id = ${correduriaId}::uuid and activo and modo = 'rpa_autorizada'
      and ramo = any(${[...RAMOS_TARIFICABLES_RPA]}::text[])
      and (ramo <> 'hogar' or compania = any(${[...COMPANIAS_HOGAR_RPA]}::text[]))
    order by compania, ramo`
}

/**
 * Riesgo COMPLETO del último trabajo de ese cliente+compañía+ramo cuyo riesgo NO esté purgado. Solo para reencolar en
 * servidor: NUNCA sale hacia plataforma. `soloPurgados` = los había, pero todos purgados (la ruta responde `origen_purgado`).
 */
export async function leerRiesgoParaReencolar(correduriaId: string, clienteId: string, compania: string, ramo: string): Promise<{ riesgo: unknown | null; soloPurgados: boolean }> {
  const f = await prisma.$queryRaw<{ riesgo: unknown; estado: string; ramo: string }[]>`
    select t.riesgo, t.estado, t.ramo from seguros.tarificacion_trabajos t
    where t.correduria_id = ${correduriaId}::uuid and t.cliente_id = ${clienteId}::uuid
      and lower(t.compania) = ${compania} and t.ramo = ${ramo}
      and coalesce(to_jsonb(t)->>'modo', 'tarificar') <> 'exploracion'
    order by t.created_at desc limit ${CANDIDATOS_PLANTILLA}`
  const r = primeroReutilizable(f)
  return { riesgo: r.fila?.riesgo ?? null, soloPurgados: r.soloPurgados }
}
