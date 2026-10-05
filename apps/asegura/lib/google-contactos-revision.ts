/**
 * Cola de revisión de la sincronización con Google Contacts (05/10/2026): leerla y resolverla.
 *
 * Qué hace cada botón lo decide `efectoResolucion` (puro, `@central/module-seguros`). Aquí solo
 * BD. 🚨 Ninguna resolución toca Google, y solo «Unificar» toca `google_contactos_vinculo` (crea el
 * vínculo PENDIENTE ficha ↔ contacto; lo escribe la pasada siguiente del cron). «Mantener CRM» sobre
 * un contacto que Alberto sacó del grupo solo cierra la revisión (el vínculo sigue
 * `fuera_del_grupo` y la sincronización no lo recrea).
 *
 * 🛡️ Cada consulta lleva `correduriaId` (Prisma con BYPASSRLS: el filtro es el código).
 */
import { HASH_PENDIENTE_UNIFICAR, limpiarMote, moteDesdeAgenda, type CamposSincronizados, type PersonaGoogle } from '@central/module-seguros/google-contactos'
import {
  efectoResolucion, esMotivoDuplicado, MOTIVOS_UNIFICABLES_EN_LOTE,
  type AccionRevision, type MotivoDuplicado, type TipoRevisionGoogle,
} from '@central/module-seguros/google-contactos-revision'
import { decryptField } from '@central/module-seguros-pii'

import { prismaAsegura } from './asegura-db'
import { Prisma } from './generated/asegura-client'
import { altaCliente, anadirContacto, listarContactos } from './cartera-edicion'
import { lectorContactoGoogle } from './google-contactos'

export const PAGINA_REVISION = 50

export type RevisionGoogle = {
  id: string
  tipo: TipoRevisionGoogle
  /** Solo `duplicado_ambiguo`; `null` = fila anterior a la columna (no se sabe: sin «Unificar»). */
  motivo: MotivoDuplicado | null
  campos: string[]
  clienteId: string | null
  /** Nombre de la ficha del CRM (en claro en `clientes`); `null` si no hay ficha o ya no existe. */
  clienteNombre: string | null
  /** Lo que había en Google. `null` = no hay (borrado) o no se pudo descifrar (`propuestaIlegible`). */
  propuesta: CamposSincronizados | null
  propuestaIlegible: boolean
  /** Solo `telefono_titular` (un botón por ficha) y `telefono_muchas_fichas` (informativa): las fichas que comparten el número. */
  candidatos: { id: string; nombre: string | null; tipoPersona: string | null }[]
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
        grupo: o.grupo === 'cliente' || o.grupo === 'lead' || o.grupo === 'compania' || o.grupo === 'ex_cliente' ? o.grupo : null,
        tambien: opc(o.tambien),
        // Campos de después del 05/10/2026 (las revisiones anteriores no los traen: `null` = no consta).
        nota: opc(o.nota), url: opc(o.url), cumpleanos: opc(o.cumpleanos), aviso: o.aviso === true,
        alerta: o.alerta === 'siniestro' || o.alerta === 'recibo' ? o.alerta : null,
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
export async function listarRevisiones(correduriaId: string, despuesDe: string | null): Promise<{ revisiones: RevisionGoogle[]; siguiente: string | null; pendientes: number; nombreDistintoPendientes: number }> {
  const db = prismaAsegura()
  const corte = despuesDe
    ? Prisma.sql`and (r.creado_en, r.id) < (select x.creado_en, x.id from google_contactos_revision x where x.id = ${despuesDe}::uuid and x.correduria_id = ${correduriaId}::uuid)`
    : Prisma.empty
  const [idsPagina, pendientes, nombreDistintoPendientes] = await Promise.all([
    db.$queryRaw<{ id: string }[]>(Prisma.sql`
      select r.id::text as id from google_contactos_revision r
      where r.correduria_id = ${correduriaId}::uuid and r.estado = 'pendiente' ${corte}
      order by r.creado_en desc, r.id desc
      limit ${PAGINA_REVISION + 1}`),
    db.googleContactosRevision.count({ where: { correduriaId, estado: 'pendiente' } }),
    db.googleContactosRevision.count({ where: { correduriaId, estado: 'pendiente', tipo: 'duplicado_ambiguo', motivo: 'nombre_distinto' } }),
  ])
  const orden = idsPagina.map((f) => f.id)
  const porId = new Map(
    (orden.length ? await db.googleContactosRevision.findMany({ where: { correduriaId, id: { in: orden } } }) : []).map((f) => [f.id, f]),
  )
  const filas = orden.flatMap((id) => (porId.has(id) ? [porId.get(id)!] : []))
  const pagina = filas.slice(0, PAGINA_REVISION)
  const ids = [...new Set(pagina.flatMap((f) => [f.clienteId, ...f.candidatos]).filter((x): x is string => !!x))]
  const fichas = ids.length
    ? await db.cliente.findMany({ where: { correduriaId, id: { in: ids } }, select: { id: true, nombre: true, apellidos: true, tipoPersona: true } })
    : []
  const nombre = new Map(fichas.map((f) => [f.id, [f.nombre, f.apellidos].filter(Boolean).join(' ').trim() || null]))
  const tipoPersona = new Map(fichas.map((f) => [f.id, f.tipoPersona ?? null]))
  return {
    revisiones: pagina.map((f) => {
      const p = leerPropuesta(f.propuestaCifrada)
      return {
        id: f.id, tipo: f.tipo as TipoRevisionGoogle, motivo: esMotivoDuplicado(f.motivo) ? f.motivo : null, campos: f.campos, clienteId: f.clienteId,
        clienteNombre: f.clienteId ? (nombre.get(f.clienteId) ?? null) : null,
        propuesta: p.propuesta, propuestaIlegible: p.ilegible, creadoEn: f.creadoEn.toISOString(),
        candidatos: f.candidatos.map((id) => ({ id, nombre: nombre.get(id) ?? null, tipoPersona: tipoPersona.get(id) ?? null })),
      }
    }),
    siguiente: filas.length > PAGINA_REVISION ? pagina[pagina.length - 1].id : null,
    pendientes,
    nombreDistintoPendientes,
  }
}

export type ResultadoResolucion =
  | { ok: true; estado: 'aceptada' | 'descartada'; clienteId: string | null }
  | { ok: false; estado: string; motivo: string; status: number; [k: string]: unknown }

export async function resolverRevision(
  correduriaId: string,
  p: { id: string; accion: AccionRevision; actor: string; forzar: boolean; clienteId?: string | null },
): Promise<ResultadoResolucion> {
  const db = prismaAsegura()
  const fila = await db.googleContactosRevision.findFirst({ where: { correduriaId, id: p.id } })
  if (!fila) return { ok: false, estado: 'no_encontrada', motivo: 'Esa revisión no existe en esta correduría.', status: 404 }
  if (fila.estado !== 'pendiente') return { ok: false, estado: 'ya_resuelta', motivo: 'Esa revisión ya estaba resuelta.', status: 409 }
  const ef = efectoResolucion(fila.tipo, p.accion, fila.motivo, fila.campos)
  if (!ef.ok) return { ok: false, estado: 'invalido', motivo: ef.motivo, status: 422 }
  if (ef.titular) return elegirTitular(correduriaId, fila, p.actor, p.clienteId ?? null)
  if (ef.enriquecer) return anadirAFicha(correduriaId, fila, p.actor)
  if (ef.vinculo === 'unificar' || ef.mote) return unificarOMote(correduriaId, fila, p.actor, { accion: p.accion, vinculo: ef.vinculo === 'unificar', mote: ef.mote }, lectorContactoGoogle(correduriaId))

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

// ─── «Este número es de…» y «Añadir a la ficha» ───────────────────────────────

/**
 * Guarda la ficha elegida como TITULAR del número (`google_contactos_titular_telefono`, por índice ciego)
 * y cierra la revisión, en UNA transacción. Solo vale una de las candidatas, viva y sin fusionar. No toca
 * Google ni vínculos: la pasada siguiente hace UN contacto (el de esa ficha) y desvincula los demás sin
 * borrarlos. Las fichas del CRM NO se fusionan.
 */
async function elegirTitular(
  correduriaId: string,
  fila: { id: string; telefonoHash: string | null; candidatos: string[] },
  actor: string,
  clienteId: string | null,
): Promise<ResultadoResolucion> {
  if (!fila.telefonoHash) return { ok: false, estado: 'invalido', motivo: 'Esta revisión no trae el número.', status: 422 }
  if (!clienteId || !fila.candidatos.includes(clienteId)) {
    return { ok: false, estado: 'invalido', motivo: 'Elige una de las fichas que comparten ese número.', status: 422 }
  }
  const db = prismaAsegura()
  const ficha = await db.cliente.findFirst({ where: { correduriaId, id: clienteId }, select: { mergedIntoClienteId: true } })
  if (!ficha) return { ok: false, estado: 'invalido', motivo: 'La ficha ya no existe.', status: 422 }
  if (ficha.mergedIntoClienteId) return { ok: false, estado: 'invalido', motivo: 'Esa ficha se fusionó en otra: la sincronización volverá a preguntar.', status: 422 }
  const telefonoHash = fila.telefonoHash
  try {
    await db.$transaction(async (tx) => {
      const ahora = new Date()
      const { count } = await tx.googleContactosRevision.updateMany({
        where: { correduriaId, id: fila.id, estado: 'pendiente' },
        data: { estado: 'aceptada', resolucion: 'elegir_titular', resueltoPor: actor, resueltoEn: ahora, clienteId },
      })
      if (count === 0) throw new Rechazo({ ok: false, estado: 'ya_resuelta', motivo: 'Otra persona la resolvió a la vez.', status: 409 })
      await tx.googleContactosTitularTelefono.upsert({
        where: { correduriaId_telefonoHash: { correduriaId, telefonoHash } },
        create: { correduriaId, telefonoHash, clienteId, elegidoPor: actor, elegidoEn: ahora },
        update: { clienteId, elegidoPor: actor, elegidoEn: ahora },
      })
    })
  } catch (e) {
    if (e instanceof Rechazo) return e.r
    throw e
  }
  return { ok: true, estado: 'aceptada', clienteId }
}

/**
 * «Añadir a la ficha»: el teléfono/correo que el contacto de Google tiene y la ficha NO. Se añade con el
 * alta normal de contactos de la ficha (`anadirContacto`: cifrado + índice ciego + duplicados en otras
 * fichas → 409), SOLO si la ficha sigue sin ninguno de ese tipo: nunca se pisa ni se suma a uno que ya
 * esté. CLAIM primero; si el alta no sale, la revisión vuelve a pendiente.
 */
async function anadirAFicha(
  correduriaId: string,
  fila: { id: string; clienteId: string | null; campos: string[]; propuestaCifrada: string | null },
  actor: string,
): Promise<ResultadoResolucion> {
  const campo = fila.campos[0]
  if (!fila.clienteId || (campo !== 'telefono' && campo !== 'email')) return { ok: false, estado: 'invalido', motivo: 'Esta revisión no trae ficha o dato.', status: 422 }
  const p = leerPropuesta(fila.propuestaCifrada)
  const valor = p.propuesta ? (campo === 'telefono' ? p.propuesta.telefono : p.propuesta.email) : null
  if (!valor) return { ok: false, estado: 'invalido', motivo: p.ilegible ? 'No se puede leer el dato (clave PII).' : 'No hay dato que añadir.', status: 422 }
  const actuales = await listarContactos(correduriaId, fila.clienteId)
  if (!actuales) return { ok: false, estado: 'error', motivo: 'No se ha podido leer la ficha: no se añade nada.', status: 503 }
  if ((campo === 'telefono' ? actuales.telefonos : actuales.emails).length > 0) {
    return { ok: false, estado: 'conflicto', motivo: `La ficha ya tiene ${campo === 'telefono' ? 'teléfono' : 'correo'}: no se pisa. Descarta esta propuesta o edítalo en la ficha.`, status: 409 }
  }
  const db = prismaAsegura()
  const resueltoEn = new Date()
  const { count } = await db.googleContactosRevision.updateMany({
    where: { correduriaId, id: fila.id, estado: 'pendiente' },
    data: { estado: 'aceptada', resolucion: 'anadir_a_ficha', resueltoPor: actor, resueltoEn },
  })
  if (count === 0) return { ok: false, estado: 'ya_resuelta', motivo: 'Otra persona la resolvió a la vez.', status: 409 }
  let r: Awaited<ReturnType<typeof anadirContacto>>
  try {
    r = await anadirContacto(correduriaId, fila.clienteId, { tipo: campo, valor, forzar: false, actor: `${actor} (desde Google Contactos)` })
  } catch (e) {
    await liberarClaim(correduriaId, fila.id, actor, resueltoEn)
    throw e
  }
  if (!r.ok) {
    await liberarClaim(correduriaId, fila.id, actor, resueltoEn)
    const { ok: _ok, status, ...resto } = r
    void _ok
    return { ok: false, ...resto, status }
  }
  return { ok: true, estado: 'aceptada', clienteId: fila.clienteId }
}

// ─── Unificar y mote ──────────────────────────────────────────────────────────

class Rechazo extends Error {
  constructor(readonly r: Extract<ResultadoResolucion, { ok: false }>) { super(r.motivo) }
}

function esUnicaViolada(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
}

type FilaUnificar = {
  id: string; clienteId: string | null; companiaContactoId: string | null; resourceName: string; propuestaCifrada: string | null
}

/**
 * «Unificar» un `duplicado_ambiguo` inequívoco y/o guardar un MOTE («Usar como mote»), en UNA
 * transacción: el claim de la revisión, el vínculo PENDIENTE ficha ↔ resourceName (origen `adoptado`,
 * hash `HASH_PENDIENTE_UNIFICAR`) y el mote (`seguros.cliente_mote`, el nombre que Alberto tenía en
 * Google, limpio). Nada en Google: lo escribe la pasada siguiente del cron. 🔒 Un resourceName nunca
 * queda en dos fichas ni una ficha en dos contactos: lo comprueba aquí y lo garantizan los UNIQUE del
 * vínculo (P2002 → 409, sin claim). Las compañías 🔵 no llevan mote: se unifican con su nombre.
 */
async function unificarOMote(
  correduriaId: string,
  fila: FilaUnificar,
  actor: string,
  modo: { accion: AccionRevision; vinculo: boolean; mote: boolean },
  leerGoogle: (resourceName: string) => Promise<PersonaGoogle | null>,
): Promise<ResultadoResolucion> {
  const db = prismaAsegura()
  if ((fila.clienteId === null) === (fila.companiaContactoId === null)) {
    return { ok: false, estado: 'invalido', motivo: 'Esta revisión ya no tiene ficha del CRM.', status: 422 }
  }
  if (fila.clienteId) {
    const ficha = await db.cliente.findFirst({ where: { correduriaId, id: fila.clienteId }, select: { mergedIntoClienteId: true } })
    if (!ficha) return { ok: false, estado: 'invalido', motivo: 'La ficha ya no existe.', status: 422 }
    if (ficha.mergedIntoClienteId) return { ok: false, estado: 'invalido', motivo: 'Esa ficha se fusionó en otra: la sincronización volverá a proponer la buena.', status: 422 }
  } else if (modo.mote && !modo.vinculo) {
    return { ok: false, estado: 'invalido', motivo: 'Los contactos de compañía no llevan mote.', status: 422 }
  }
  let mote: string | null = null
  // «Unificar» NO pisa un mote que la ficha ya tenga: solo vincula. («Usar como mote» sí: es explícito.)
  const conservaMote = modo.vinculo && !!fila.clienteId
    && (await db.clienteMote.findUnique({ where: { clienteId: fila.clienteId }, select: { clienteId: true } })) !== null
  if (modo.mote && fila.clienteId && !conservaMote) {
    const p = leerPropuesta(fila.propuestaCifrada)
    // Unificar: el nombre que el contacto tiene HOY en Google (aún no lo ha tocado el CRM); si no se
    // puede leer, lo encolado. «Usar como mote»: lo encolado (el cron ya le ha vuelto a poner el del CRM).
    const actual = modo.vinculo ? await leerGoogle(fila.resourceName).catch(() => null) : null
    mote = modo.vinculo
      ? moteDesdeAgenda(actual, p.propuesta)
      : p.propuesta ? limpiarMote(`${p.propuesta.nombre} ${p.propuesta.apellidos}`) : null
    if (!mote) {
      return {
        ok: false, estado: 'invalido', status: 422,
        motivo: p.ilegible
          ? 'No se puede leer el nombre que tenía en Google (clave PII).'
          : 'El nombre que tenía en Google está vacío.' + (modo.vinculo ? ' Usa «Unificar con nombre del CRM».' : ''),
      }
    }
  }
  const clave = fila.clienteId ? { clienteId: fila.clienteId } : { companiaContactoId: fila.companiaContactoId! }
  try {
    await db.$transaction(async (tx) => {
      const ahora = new Date()
      const { count } = await tx.googleContactosRevision.updateMany({
        where: { correduriaId, id: fila.id, estado: 'pendiente' },
        data: { estado: 'aceptada', resolucion: modo.accion, resueltoPor: actor, resueltoEn: ahora },
      })
      if (count === 0) throw new Rechazo({ ok: false, estado: 'ya_resuelta', motivo: 'Otra persona la resolvió a la vez.', status: 409 })
      if (modo.vinculo) {
        const ya = await tx.googleContactosVinculo.findFirst({
          where: { correduriaId, OR: [{ resourceName: fila.resourceName }, clave] },
          select: { resourceName: true },
        })
        if (ya) {
          throw new Rechazo({
            ok: false, estado: 'conflicto', status: 409,
            motivo: ya.resourceName === fila.resourceName
              ? 'Ese contacto de Google ya está unido a otra ficha.'
              : 'Esta ficha ya está unida a otro contacto de Google.',
          })
        }
        await tx.googleContactosVinculo.create({
          data: {
            correduriaId, clienteId: fila.clienteId, companiaContactoId: fila.companiaContactoId,
            resourceName: fila.resourceName, etag: null, hashEnviado: HASH_PENDIENTE_UNIFICAR, origen: 'adoptado', estado: 'activo',
          },
        })
      }
      if (mote && fila.clienteId && modo.vinculo) {
        // Si otro lo puso a la vez, gana el que ya estaba (no se pisa).
        await tx.clienteMote.createMany({ data: [{ clienteId: fila.clienteId, mote, actualizadoPor: actor, actualizadoEn: ahora }], skipDuplicates: true })
      } else if (mote && fila.clienteId) {
        await tx.clienteMote.upsert({
          where: { clienteId: fila.clienteId },
          create: { clienteId: fila.clienteId, mote, actualizadoPor: actor, actualizadoEn: ahora },
          update: { mote, actualizadoPor: actor, actualizadoEn: ahora },
        })
      }
    })
  } catch (e) {
    if (e instanceof Rechazo) return e.r
    if (esUnicaViolada(e)) return { ok: false, estado: 'conflicto', motivo: 'Ese contacto o esa ficha ya están unidos a otro (a la vez).', status: 409 }
    throw e
  }
  return { ok: true, estado: 'aceptada', clienteId: fila.clienteId }
}

/** Tope por llamada de «Unificar todos»: el proxy de plataforma corta a 15 s (cada una puede leer Google). */
export const MAX_UNIFICAR_LOTE = 20

/** Causas que no se arreglan reintentando: se OMITEN y el cursor las deja atrás (siguen en la cola, una a una). */
const PERMANENTES = new Set(['invalido', 'conflicto'])

export type ResultadoLote =
  | { ok: true; unificadas: number; omitidas: { id: string; motivo: string }[]; fallidas: { id: string; motivo: string }[]; siguiente: string | null; quedan: number }
  | { ok: false; estado: string; motivo: string; status: number }

/**
 * «Unificar todos los de nombre distinto» con la opción POR DEFECTO (mote = su nombre de agenda), de
 * 20 en 20 por CURSOR (`despuesDe` = la última vista; `siguiente` para seguir). Una que no se puede
 * unificar por causa PERMANENTE (sin nombre, ficha fusionada, ya unida por el cron…) se OMITE y el
 * cursor la deja atrás: no atasca los lotes siguientes y sigue en la cola para resolverla a mano.
 * Solo `nombre_distinto` (`MOTIVOS_UNIFICABLES_EN_LOTE`).
 */
export async function unificarTodos(
  correduriaId: string,
  p: { motivo: MotivoDuplicado; actor: string; despuesDe?: string | null },
): Promise<ResultadoLote> {
  if (!MOTIVOS_UNIFICABLES_EN_LOTE.includes(p.motivo)) return { ok: false, estado: 'invalido', motivo: 'En bloque solo se unifican los de «nombre distinto»; los demás, uno a uno.', status: 422 }
  const db = prismaAsegura()
  const where = { correduriaId, estado: 'pendiente', tipo: 'duplicado_ambiguo', motivo: p.motivo }
  const corte = p.despuesDe ? await db.googleContactosRevision.findFirst({ where: { correduriaId, id: p.despuesDe }, select: { creadoEn: true, id: true } }) : null
  if (p.despuesDe && !corte) return { ok: false, estado: 'invalido', motivo: 'El cursor no es de esta cola.', status: 422 }
  const tras = corte ? { OR: [{ creadoEn: { gt: corte.creadoEn } }, { creadoEn: corte.creadoEn, id: { gt: corte.id } }] } : {}
  const filas = await db.googleContactosRevision.findMany({
    where: { ...where, ...tras }, orderBy: [{ creadoEn: 'asc' }, { id: 'asc' }], take: MAX_UNIFICAR_LOTE + 1,
    select: { id: true, clienteId: true, companiaContactoId: true, resourceName: true, propuestaCifrada: true, creadoEn: true },
  })
  const lote = filas.slice(0, MAX_UNIFICAR_LOTE)
  const leer = lectorContactoGoogle(correduriaId)
  let unificadas = 0
  const omitidas: { id: string; motivo: string }[] = []
  const fallidas: { id: string; motivo: string }[] = []
  for (const f of lote) {
    const r = await unificarOMote(correduriaId, f, p.actor, { accion: 'unificar', vinculo: true, mote: true }, leer)
    if (r.ok) unificadas++
    else if (r.estado === 'ya_resuelta') continue
    else (PERMANENTES.has(r.estado) ? omitidas : fallidas).push({ id: f.id, motivo: r.motivo })
  }
  const ultima = lote[lote.length - 1]
  const siguiente = filas.length > MAX_UNIFICAR_LOTE && ultima ? ultima.id : null
  const quedan = ultima
    ? await db.googleContactosRevision.count({ where: { ...where, OR: [{ creadoEn: { gt: ultima.creadoEn } }, { creadoEn: ultima.creadoEn, id: { gt: ultima.id } }] } })
    : 0
  return { ok: true, unificadas, omitidas, fallidas, siguiente, quedan }
}
