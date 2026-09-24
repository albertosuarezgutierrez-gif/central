// Fichas IPID por compañía + producto (tabla `ipid` del schema de la cartera). Documento PÚBLICO de la compañía: no lleva
// datos de nadie. La regla de identidad (`claveProducto`) y la validación viven en `@central/module-seguros`.

import { createHash } from 'node:crypto'
import { claveProducto, revisarIpid } from '@central/module-seguros'
import { prismaAsegura } from './asegura-db'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type IpidVista = {
  id: string
  compania: string
  producto: string
  nombreFichero: string
  sha256: string
  bytes: number
  subidoPor: string
  createdAt: string
}

/** Las vigentes. Lanza si la consulta falla: quien llama decide cómo decir «no se pudo leer». */
export async function listarIpid(correduriaId: string): Promise<IpidVista[]> {
  return prismaAsegura().$queryRaw<IpidVista[]>`
    select id::text as id, compania, producto, nombre_fichero as "nombreFichero", sha256,
           octet_length(contenido)::int as bytes, subido_por as "subidoPor", to_char(created_at, 'YYYY-MM-DD') as "createdAt"
    from ipid where correduria_id = ${correduriaId}::uuid and retirado_at is null
    order by lower(compania), lower(producto)`
}

export type ResultadoSubida = { estado: 'creado'; id: string; sustituye: boolean } | { estado: 'invalida'; motivo: string }

/** Sube (o sustituye) la ficha de un producto. La anterior se RETIRA, no se borra: lo firmado cita su huella. */
export async function subirIpid(
  correduriaId: string,
  d: { compania: string; producto: string; nombre: string; mime: string; contenido: Buffer },
  actor: string,
): Promise<ResultadoSubida> {
  const compania = d.compania.trim(), producto = d.producto.trim()
  const clave = claveProducto(compania, producto)
  if (!clave || compania.length > 120 || producto.length > 160) return { estado: 'invalida', motivo: 'Faltan la compañía o el producto (o son demasiado largos).' }
  const reparo = revisarIpid({ type: d.mime, size: d.contenido.length, name: d.nombre })
  if (reparo) return { estado: 'invalida', motivo: reparo }
  if (d.contenido.subarray(0, 5).toString('latin1') !== '%PDF-') return { estado: 'invalida', motivo: 'El fichero no es un PDF.' }
  const sha256 = createHash('sha256').update(d.contenido).digest('hex')
  const nombre = d.nombre.trim().slice(0, 200) || 'ipid.pdf'
  return prismaAsegura().$transaction(async (tx) => {
    const retiradas = await tx.$executeRaw`
      update ipid set retirado_at = now() where correduria_id = ${correduriaId}::uuid and clave = ${clave} and retirado_at is null`
    const [fila] = await tx.$queryRaw<{ id: string }[]>`
      insert into ipid (correduria_id, clave, compania, producto, nombre_fichero, contenido, sha256, subido_por)
      values (${correduriaId}::uuid, ${clave}, ${compania}, ${producto}, ${nombre}, ${d.contenido}, ${sha256}, ${actor})
      returning id::text as id`
    return { estado: 'creado' as const, id: fila.id, sustituye: retiradas > 0 }
  })
}

export async function retirarIpid(correduriaId: string, id: string): Promise<'hecho' | 'no_encontrado' | 'invalida'> {
  if (!UUID.test(id)) return 'invalida'
  const n = await prismaAsegura().$executeRaw`
    update ipid set retirado_at = now() where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid and retirado_at is null`
  return n > 0 ? 'hecho' : 'no_encontrado'
}

/** La ficha vigente de una opción, por la MISMA clave que usa el portal para enseñar el enlace. */
export async function ipidDeOpcion(correduriaId: string, compania: string, producto: string | null): Promise<{ id: string; sha256: string } | null> {
  const clave = claveProducto(compania, producto)
  if (!clave) return null
  const [f] = await prismaAsegura().$queryRaw<{ id: string; sha256: string }[]>`
    select id::text as id, sha256 from ipid
    where correduria_id = ${correduriaId}::uuid and clave = ${clave} and retirado_at is null limit 1`
  return f ?? null
}
