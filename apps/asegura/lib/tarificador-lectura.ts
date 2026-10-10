// Lectura (solo SELECT) de un trabajo del tarificador RPA para el puerto de operador. Todo por
// `correduria_id`. La proyección pública vive en `tarificador-lectura-reglas.ts`.
import { prisma } from './tenant'
import { documentoDePdf, proyectarTrabajo, proyectarUltimoRiesgo, type TrabajoLectura, type UltimoRiesgo } from './tarificador-lectura-reglas'

/**
 * Riesgo del trabajo MÁS RECIENTE de ese cliente (cualquier estado, también error: interesan los datos
 * tecleados). Por `correduria_id`; solo SELECT; sin html/captura/error. Pre-rellena el modal del bot.
 */
export async function leerUltimoRiesgo(correduriaId: string, clienteId: string, compania: string, ramo: string): Promise<UltimoRiesgo> {
  const f = await prisma.$queryRaw<{ id: string; created_at: Date; riesgo: unknown }[]>`
    select t.id::text as id, t.created_at, t.riesgo
    from seguros.tarificacion_trabajos t
    where t.correduria_id = ${correduriaId}::uuid and t.cliente_id = ${clienteId}::uuid
      and lower(t.compania) = ${compania} and t.ramo = ${ramo}
    order by t.created_at desc
    limit 1`
  return proyectarUltimoRiesgo(f[0] ?? null)
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
