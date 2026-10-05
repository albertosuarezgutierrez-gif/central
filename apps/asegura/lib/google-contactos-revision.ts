/**
 * Cola de revisión de la sincronización con Google Contacts (05/10/2026): leerla y resolverla.
 *
 * Qué hace cada botón lo decide `efectoResolucion` (puro, `@central/module-seguros`). Aquí solo
 * BD. 🚨 Ninguna resolución toca `google_contactos_vinculo` ni Google: «Mantener CRM» sobre un
 * contacto que Alberto sacó del grupo solo cierra la revisión (el vínculo sigue
 * `fuera_del_grupo` y la sincronización no lo recrea).
 *
 * 🛡️ Cada consulta lleva `correduriaId` (Prisma con BYPASSRLS: el filtro es el código).
 */
import type { CamposSincronizados } from '@central/module-seguros/google-contactos'
import { efectoResolucion, type AccionRevision, type TipoRevisionGoogle } from '@central/module-seguros/google-contactos-revision'
import { decryptField } from '@central/module-seguros-pii'

import { prismaAsegura } from './asegura-db'
import { Prisma } from './generated/asegura-client'
import { altaCliente } from './cartera-edicion'

export const PAGINA_REVISION = 50

export type RevisionGoogle = {
  id: string
  tipo: TipoRevisionGoogle
  campos: string[]
  clienteId: string | null
  /** Nombre de la ficha del CRM (en claro en `clientes`); `null` si no hay ficha o ya no existe. */
  clienteNombre: string | null
  /** Lo que había en Google. `null` = no hay (borrado) o no se pudo descifrar (`propuestaIlegible`). */
  propuesta: CamposSincronizados | null
  propuestaIlegible: boolean
  creadoEn: string
}

function leerPropuesta(c: string | null): { propuesta: CamposSincronizados | null; ilegible: boolean } {
  if (!c) return { propuesta: null, ilegible: false }
  try {
    const o = JSON.parse(decryptField(c)) as Partial<CamposSincronizados>
    const txt = (v: unknown) => (typeof v === 'string' ? v : '')
    const opc = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null)
    return {
      propuesta: {
        nombre: txt(o.nombre), apellidos: txt(o.apellidos), telefono: opc(o.telefono), email: opc(o.email),
        grupo: o.grupo === 'cliente' || o.grupo === 'lead' || o.grupo === 'compania' ? o.grupo : null,
        // Campos de después del 05/10/2026 (las revisiones anteriores no los traen: `null` = no consta).
        nota: opc(o.nota), url: opc(o.url), cumpleanos: opc(o.cumpleanos), aviso: o.aviso === true,
      },
      ilegible: false,
    }
  } catch {
    // Sin clave que lo abra NO se dice «no había nada»: se dice que no se puede leer.
    return { propuesta: null, ilegible: true }
  }
}

/**
 * Pendientes, de la más reciente a la más antigua, de 50 en 50. Paginación por CLAVE
 * (`creado_en`, `id`) de la última que se vio, no por desplazamiento ni con el `cursor` de Prisma:
 * al resolver tarjetas ya cargadas, un `skip` saltaría revisiones sin enseñarlas nunca, y el
 * `cursor` + `skip: 1` de Prisma, si esa última ya NO está pendiente, se come la siguiente.
 */
export async function listarRevisiones(correduriaId: string, despuesDe: string | null): Promise<{ revisiones: RevisionGoogle[]; siguiente: string | null; pendientes: number }> {
  const db = prismaAsegura()
  const corte = despuesDe
    ? Prisma.sql`and (r.creado_en, r.id) < (select x.creado_en, x.id from google_contactos_revision x where x.id = ${despuesDe}::uuid and x.correduria_id = ${correduriaId}::uuid)`
    : Prisma.empty
  const [idsPagina, pendientes] = await Promise.all([
    db.$queryRaw<{ id: string }[]>(Prisma.sql`
      select r.id::text as id from google_contactos_revision r
      where r.correduria_id = ${correduriaId}::uuid and r.estado = 'pendiente' ${corte}
      order by r.creado_en desc, r.id desc
      limit ${PAGINA_REVISION + 1}`),
    db.googleContactosRevision.count({ where: { correduriaId, estado: 'pendiente' } }),
  ])
  const orden = idsPagina.map((f) => f.id)
  const porId = new Map(
    (orden.length ? await db.googleContactosRevision.findMany({ where: { correduriaId, id: { in: orden } } }) : []).map((f) => [f.id, f]),
  )
  const filas = orden.flatMap((id) => (porId.has(id) ? [porId.get(id)!] : []))
  const pagina = filas.slice(0, PAGINA_REVISION)
  const ids = [...new Set(pagina.map((f) => f.clienteId).filter((x): x is string => !!x))]
  const fichas = ids.length
    ? await db.cliente.findMany({ where: { correduriaId, id: { in: ids } }, select: { id: true, nombre: true, apellidos: true } })
    : []
  const nombre = new Map(fichas.map((f) => [f.id, [f.nombre, f.apellidos].filter(Boolean).join(' ').trim() || null]))
  return {
    revisiones: pagina.map((f) => {
      const p = leerPropuesta(f.propuestaCifrada)
      return {
        id: f.id, tipo: f.tipo as TipoRevisionGoogle, campos: f.campos, clienteId: f.clienteId,
        clienteNombre: f.clienteId ? (nombre.get(f.clienteId) ?? null) : null,
        propuesta: p.propuesta, propuestaIlegible: p.ilegible, creadoEn: f.creadoEn.toISOString(),
      }
    }),
    siguiente: filas.length > PAGINA_REVISION ? pagina[pagina.length - 1].id : null,
    pendientes,
  }
}

export type ResultadoResolucion =
  | { ok: true; estado: 'aceptada' | 'descartada'; clienteId: string | null }
  | { ok: false; estado: string; motivo: string; status: number; [k: string]: unknown }

export async function resolverRevision(
  correduriaId: string,
  p: { id: string; accion: AccionRevision; actor: string; forzar: boolean },
): Promise<ResultadoResolucion> {
  const db = prismaAsegura()
  const fila = await db.googleContactosRevision.findFirst({ where: { correduriaId, id: p.id } })
  if (!fila) return { ok: false, estado: 'no_encontrada', motivo: 'Esa revisión no existe en esta correduría.', status: 404 }
  if (fila.estado !== 'pendiente') return { ok: false, estado: 'ya_resuelta', motivo: 'Esa revisión ya estaba resuelta.', status: 409 }
  const ef = efectoResolucion(fila.tipo, p.accion)
  if (!ef.ok) return { ok: false, estado: 'invalido', motivo: ef.motivo, status: 422 }

  const propuestaLead = ef.altaLead ? leerPropuesta(fila.propuestaCifrada) : null
  if (propuestaLead && !propuestaLead.propuesta) {
    return { ok: false, estado: 'invalido', motivo: propuestaLead.ilegible ? 'No se puede leer lo que había en Google (clave PII).' : 'No hay datos que dar de alta.', status: 422 }
  }

  // 🔒 El CLAIM primero (solo una de dos resoluciones simultáneas lo gana): si el alta del lead fuera
  // antes, dos «Aceptar como lead» a la vez crearían DOS leads. Solo la revisión; el vínculo y
  // Google, intactos (`ef.vinculo === 'ninguno'`).
  const resueltoEn = new Date()
  const { count } = await db.googleContactosRevision.updateMany({
    where: { correduriaId, id: p.id, estado: 'pendiente' },
    data: { estado: ef.estado, resolucion: p.accion, resueltoPor: p.actor, resueltoEn },
  })
  if (count === 0) return { ok: false, estado: 'ya_resuelta', motivo: 'Otra persona la resolvió a la vez.', status: 409, clienteId: fila.clienteId }
  if (!propuestaLead?.propuesta) return { ok: true, estado: ef.estado, clienteId: fila.clienteId }

  // Alta normal de lead: busca antes duplicados por teléfono/email (409 con las fichas) y deja
  // historial. Sin fuente inventada: `null` = no se ha dicho.
  const propuesta = propuestaLead.propuesta
  let alta: Awaited<ReturnType<typeof altaCliente>>
  try {
    alta = await altaCliente(
      correduriaId,
      {
        nombre: propuesta.nombre, apellidos: propuesta.apellidos, telefono: propuesta.telefono ?? '', email: propuesta.email ?? '',
        notas: 'Propuesto desde el grupo «Grupo ASegura» de Google Contacts.', forzar: p.forzar,
      },
      p.actor,
    )
  } catch (e) {
    await liberarClaim(correduriaId, p.id, p.actor, resueltoEn)
    throw e
  }
  if (!alta.ok) {
    // Sin lead (p. ej. 409 por duplicado: se reintenta con «forzar»): la revisión vuelve a pendiente,
    // solo si sigue siendo NUESTRO claim.
    await liberarClaim(correduriaId, p.id, p.actor, resueltoEn)
    const { ok: _ok, status, ...resto } = alta
    void _ok
    return { ok: false, ...resto, status }
  }
  await db.googleContactosRevision.updateMany({ where: { correduriaId, id: p.id }, data: { clienteId: alta.id } })
  return { ok: true, estado: ef.estado, clienteId: alta.id }
}

/** Deshace un claim propio (mismo actor y mismo instante) si el alta del lead no salió. */
async function liberarClaim(correduriaId: string, id: string, actor: string, resueltoEn: Date): Promise<void> {
  await prismaAsegura().googleContactosRevision.updateMany({
    where: { correduriaId, id, estado: { not: 'pendiente' }, resueltoPor: actor, resueltoEn },
    data: { estado: 'pendiente', resolucion: null, resueltoPor: null, resueltoEn: null },
  })
}
