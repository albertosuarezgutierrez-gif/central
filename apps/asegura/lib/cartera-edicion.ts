// Editar y dar de alta clientes de la cartera (escrituras sobre `seguros`,
// 02/09/2026). Es el back del «✏️ Datos del cliente» y del «➕ Nuevo cliente»
// de `/correduria` en plataforma.
//
// ─── Reglas ──────────────────────────────────────────────────────────────────
// - `correduriaId` SIEMPRE explícito y el cliente se comprueba de esa correduría
//   ANTES de escribir (con BYPASSRLS un id ajeno no falla: escribe en otro).
// - Lo que va cifrado en `clientes` (teléfono, email, DNI, fecha, dirección) se
//   cifra AQUÍ con las mismas primitivas que el CRM de Manuel (`@central/
//   module-seguros-pii`) y lleva su índice ciego: si no, el buscador y CIMA
//   dejan de encontrar la ficha EN SILENCIO.
// - Varios teléfonos y emails viven en `cliente_telefonos` / `cliente_emails`;
//   el PRINCIPAL se espeja en `clientes.telefono` / `clientes.email` (es lo que
//   leen la ficha, el buscador y los avisos). Esas dos columnas tienen índice
//   ÚNICO por hash: un principal no puede repetirse entre fichas.
// - Identidad (DNI, nombre, apellidos, fecha de nacimiento) SOLO con un
//   documento de identidad recibido de ESTE cliente (dictado de Alberto:
//   «tendrá que solicitarlo documentado»). Las reglas son puras y están en
//   `@central/module-seguros` (cliente-edicion.ts); aquí solo se aplican.
// - Todo cambio deja fila en `historial_interno` (sin valores de identidad).
// - Un alta desde aquí es un `lead`: «cliente» lo pone CIMA cuando entra una
//   póliza. La búsqueda previa por DNI/teléfono/email es lo que evita el
//   duplicado que luego hay que fusionar a mano.
// - `clientes.fuente` dice por dónde entró la ficha (`web`, `portal`,
//   `whatsapp` son los canales de lead; el resto, lo que teclea Alberto). Sin
//   fuente se deja NULL: «no se sabe», nunca «otros». Un alta que llega por un
//   CANAL deja historial tipo `contacto` (§6 de la visión del CRM); una
//   tecleada, `nota`.

import {
  coincidenciaBloquea,
  documentoAcredita,
  estadoDocumento,
  etiquetaContacto,
  normalizarContacto,
  revisarAlta,
  revisarEdicion,
  textoHistorialAlta,
  textoHistorialEdicion,
  tipoDocumento,
  tipoHistorial,
  tipoHistorialAlta,
  type AltaCliente,
  type Coincidencia,
  type ContactoCliente,
  type EdicionCliente,
  type TipoContacto,
  type TipoHistorial,
} from '@central/module-seguros'
import {
  computeDniLookupHash,
  computeEmailLookupHash,
  computeTelefonoLookupHash,
  decryptField,
  encryptField,
} from '@central/module-seguros-pii'
import { prismaAsegura } from './asegura-db'

// ─── Cifrado ─────────────────────────────────────────────────────────────────

/** Como en cartera-ficha: `v1:` que no abre → `null` (ilegible), en claro → tal cual. */
export function descifrarCampo(v: string | null | undefined): string | null {
  if (typeof v !== 'string' || v.trim() === '') return null
  if (!v.startsWith('v1:')) return v
  try {
    return decryptField(v)
  } catch {
    return null
  }
}

export function campoIlegible(v: string | null | undefined): boolean {
  return typeof v === 'string' && v.startsWith('v1:') && descifrarCampo(v) === null
}

type Fallo = { ok: false; estado: 'invalido' | 'conflicto' | 'no_encontrado' | 'error'; motivo: string; campo?: string; coincidencias?: Coincidencia[]; forzable?: boolean; status: 404 | 409 | 422 | 500 }

function invalido(motivo: string, campo?: string): Fallo {
  return { ok: false, estado: 'invalido', motivo, campo, status: 422 }
}
function noEncontrado(): Fallo {
  return { ok: false, estado: 'no_encontrado', motivo: 'El cliente no existe en esta correduría.', status: 404 }
}
function conflicto(coincidencias: Coincidencia[], forzable: boolean): Fallo {
  return { ok: false, estado: 'conflicto', motivo: 'Ese dato ya está en otra ficha.', coincidencias, forzable, status: 409 }
}
function fallo(e: unknown): Fallo {
  return { ok: false, estado: 'error', motivo: e instanceof Error ? e.message : String(e), status: 500 }
}

/**
 * Cifra y hashea. Si la clave PII falta o está mal, `encryptField` lanza en
 * producción: eso se convierte en un 500 con su mensaje, nunca en escribir el
 * dato en claro o sin índice.
 */
function cifrado(tipo: TipoContacto | 'dni', valor: string): { cifrado: string; hash: string | null } {
  const hash =
    tipo === 'telefono' ? computeTelefonoLookupHash(valor) : tipo === 'email' ? computeEmailLookupHash(valor) : computeDniLookupHash(valor)
  return { cifrado: encryptField(valor), hash }
}

async function clienteDe(correduriaId: string, clienteId: string) {
  return prismaAsegura().cliente.findFirst({
    where: { id: clienteId, correduriaId, mergedIntoClienteId: null },
    select: { id: true, nombre: true, apellidos: true, telefono: true, email: true },
  })
}

// ─── Coincidencias (búsqueda previa) ─────────────────────────────────────────

/**
 * ¿Qué OTRAS fichas de la correduría tienen ya este DNI/teléfono/email?
 * Mira el principal (`clientes`) y también los secundarios de las tablas
 * hijas. Las lápidas de fusión no cuentan.
 */
export async function coincidencias(
  correduriaId: string,
  datos: { dni?: string | null; telefono?: string | null; email?: string | null },
  excepto?: string,
): Promise<Coincidencia[]> {
  const db = prismaAsegura()
  const out: Coincidencia[] = []
  const vistos = new Set<string>()
  const nombreDe = (c: { id: string; nombre: string; apellidos: string; tipo: unknown }) => ({
    id: c.id,
    nombre: `${c.nombre} ${c.apellidos}`.trim(),
    tipo: String(c.tipo),
  })
  const anota = (c: { id: string; nombre: string; apellidos: string; tipo: unknown }, por: Coincidencia['por']) => {
    if (c.id === excepto || vistos.has(`${c.id}:${por}`)) return
    vistos.add(`${c.id}:${por}`)
    out.push({ ...nombreDe(c), por })
  }
  const sel = { id: true, nombre: true, apellidos: true, tipo: true } as const

  if (datos.dni) {
    const h = computeDniLookupHash(datos.dni)
    if (h) {
      for (const c of await db.cliente.findMany({ where: { correduriaId, dniLookupHash: h, mergedIntoClienteId: null }, select: sel })) anota(c, 'dni')
    }
  }
  if (datos.telefono) {
    const h = computeTelefonoLookupHash(datos.telefono)
    if (h) {
      for (const c of await db.cliente.findMany({ where: { correduriaId, telefonoLookupHash: h, mergedIntoClienteId: null }, select: sel })) anota(c, 'telefono')
      const hijas = await db.clienteTelefono.findMany({
        where: { correduriaId, telefonoLookupHash: h, cliente: { mergedIntoClienteId: null } },
        select: { cliente: { select: sel } },
      })
      for (const t of hijas) anota(t.cliente, 'telefono')
    }
  }
  if (datos.email) {
    const h = computeEmailLookupHash(datos.email)
    if (h) {
      for (const c of await db.cliente.findMany({ where: { correduriaId, emailLookupHash: h, mergedIntoClienteId: null }, select: sel })) anota(c, 'email')
      const hijas = await db.clienteEmail.findMany({
        where: { correduriaId, emailLookupHash: h, cliente: { mergedIntoClienteId: null } },
        select: { cliente: { select: sel } },
      })
      for (const t of hijas) anota(t.cliente, 'email')
    }
  }
  return out
}

// ─── Contactos ───────────────────────────────────────────────────────────────

export type Contactos = { telefonos: ContactoCliente[]; emails: ContactoCliente[] }

/**
 * Todos los teléfonos y emails de la ficha. Si la tabla hija está vacía pero
 * `clientes.telefono` tiene valor (3.000+ fichas del volcado están así), ese
 * valor se presenta como el único, principal, con id `col:telefono` — para que
 * la pantalla no diga «sin teléfonos» con un teléfono delante.
 *
 * `null` = no se ha podido consultar.
 */
export async function listarContactos(correduriaId: string, clienteId: string): Promise<Contactos | null> {
  try {
    const db = prismaAsegura()
    const c = await db.cliente.findFirst({
      where: { id: clienteId, correduriaId, mergedIntoClienteId: null },
      select: {
        telefono: true,
        email: true,
        telefonos: { orderBy: [{ esPrincipal: 'desc' }, { createdAt: 'asc' }] },
        emails: { orderBy: [{ esPrincipal: 'desc' }, { createdAt: 'asc' }] },
      },
    })
    if (!c) return null
    const fila = (tipo: TipoContacto, f: { id: string; etiqueta: string | null; esPrincipal: boolean; createdAt: Date }, v: string): ContactoCliente => ({
      id: f.id,
      tipo,
      valor: descifrarCampo(v),
      ilegible: campoIlegible(v),
      etiqueta: f.etiqueta,
      principal: f.esPrincipal,
      creado: f.createdAt.toISOString(),
    })
    const telefonos = c.telefonos.map((t) => fila('telefono', t, t.telefono))
    const emails = c.emails.map((e) => fila('email', e, e.email))
    const columna = (tipo: TipoContacto, v: string | null): ContactoCliente[] =>
      v && v.trim() !== ''
        ? [{ id: `col:${tipo}`, tipo, valor: descifrarCampo(v), ilegible: campoIlegible(v), etiqueta: null, principal: true, creado: '' }]
        : []
    return {
      telefonos: telefonos.length > 0 ? telefonos : columna('telefono', c.telefono),
      emails: emails.length > 0 ? emails : columna('email', c.email),
    }
  } catch {
    return null
  }
}

export type ResultadoContacto = { ok: true; contacto: ContactoCliente | null; contactos: Contactos } | Fallo

/**
 * Cuando la ficha solo tiene el valor en la COLUMNA (sin filas hijas), antes
 * de añadir otro hay que bajar ese valor a la tabla hija como principal: si
 * no, el nuevo secundario quedaría solo en la hija y la ficha lo pintaría como
 * único. Idempotente.
 */
async function bajarColumnaAHija(correduriaId: string, clienteId: string, tipo: TipoContacto): Promise<void> {
  const db = prismaAsegura()
  const c = await db.cliente.findFirst({
    where: { id: clienteId, correduriaId },
    select: { telefono: true, email: true, telefonoLookupHash: true, emailLookupHash: true, _count: { select: { telefonos: true, emails: true } } },
  })
  if (!c) return
  if (tipo === 'telefono' && c._count.telefonos === 0 && c.telefono) {
    await db.clienteTelefono.create({
      data: { clienteId, correduriaId, telefono: c.telefono, telefonoLookupHash: c.telefonoLookupHash, esPrincipal: true },
    })
  }
  if (tipo === 'email' && c._count.emails === 0 && c.email) {
    await db.clienteEmail.create({
      data: { clienteId, correduriaId, email: c.email, emailLookupHash: c.emailLookupHash, esPrincipal: true },
    })
  }
}

/** Espeja el principal en la columna de `clientes` (o la vacía si no queda ninguno). */
async function espejarPrincipal(correduriaId: string, clienteId: string, tipo: TipoContacto): Promise<void> {
  const db = prismaAsegura()
  if (tipo === 'telefono') {
    const p = await db.clienteTelefono.findFirst({ where: { clienteId, correduriaId, esPrincipal: true } })
    await db.cliente.updateMany({
      where: { id: clienteId, correduriaId },
      data: { telefono: p?.telefono ?? null, telefonoLookupHash: p?.telefonoLookupHash ?? null, updatedAt: new Date() },
    })
  } else {
    const p = await db.clienteEmail.findFirst({ where: { clienteId, correduriaId, esPrincipal: true } })
    await db.cliente.updateMany({
      where: { id: clienteId, correduriaId },
      data: { email: p?.email ?? null, emailLookupHash: p?.emailLookupHash ?? null, updatedAt: new Date() },
    })
  }
}

function esUnicoViolado(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002'
}

export async function anadirContacto(
  correduriaId: string,
  clienteId: string,
  entrada: { tipo: TipoContacto; valor: unknown; etiqueta?: unknown; principal?: boolean; forzar?: boolean; actor: string },
): Promise<ResultadoContacto> {
  const tipo: TipoContacto = entrada.tipo === 'email' ? 'email' : 'telefono'
  const norm = normalizarContacto(tipo, entrada.valor)
  if (!norm.ok) return invalido(norm.motivo, tipo)
  try {
    const c = await clienteDe(correduriaId, clienteId)
    if (!c) return noEncontrado()
    const otros = await coincidencias(correduriaId, { [tipo]: norm.valor }, clienteId)
    // Un teléfono repetido puede ser un matrimonio; se admite a sabiendas.
    // Pero como PRINCIPAL no cabe en la columna única: eso no se fuerza.
    const principalEnOtra = otros.length > 0 && entrada.principal === true
    if (otros.length > 0 && (!entrada.forzar || principalEnOtra)) {
      if (principalEnOtra) {
        // ¿La otra lo tiene como principal (columna) o solo como secundario?
        const h = tipo === 'telefono' ? computeTelefonoLookupHash(norm.valor) : computeEmailLookupHash(norm.valor)
        const enColumna = h
          ? await prismaAsegura().cliente.count({
              where: tipo === 'telefono'
                ? { correduriaId, telefonoLookupHash: h, mergedIntoClienteId: null, id: { not: clienteId } }
                : { correduriaId, emailLookupHash: h, mergedIntoClienteId: null, id: { not: clienteId } },
            })
          : 0
        if (enColumna > 0) return conflicto(otros, false)
        if (!entrada.forzar) return conflicto(otros, true)
      } else {
        return conflicto(otros, true)
      }
    }
    await bajarColumnaAHija(correduriaId, clienteId, tipo)
    const db = prismaAsegura()
    const { cifrado: valorCifrado, hash } = cifrado(tipo, norm.valor)
    const etiqueta = etiquetaContacto(tipo, entrada.etiqueta)
    const hayPrincipal =
      tipo === 'telefono'
        ? (await db.clienteTelefono.count({ where: { clienteId, correduriaId, esPrincipal: true } })) > 0
        : (await db.clienteEmail.count({ where: { clienteId, correduriaId, esPrincipal: true } })) > 0
    const principal = entrada.principal === true || !hayPrincipal
    if (principal) {
      if (tipo === 'telefono') await db.clienteTelefono.updateMany({ where: { clienteId, correduriaId }, data: { esPrincipal: false } })
      else await db.clienteEmail.updateMany({ where: { clienteId, correduriaId }, data: { esPrincipal: false } })
    }
    const fila =
      tipo === 'telefono'
        ? await db.clienteTelefono.create({ data: { clienteId, correduriaId, telefono: valorCifrado, telefonoLookupHash: hash, etiqueta, esPrincipal: principal } })
        : await db.clienteEmail.create({ data: { clienteId, correduriaId, email: valorCifrado, emailLookupHash: hash, etiqueta, esPrincipal: principal } })
    if (principal) await espejarPrincipal(correduriaId, clienteId, tipo)
    await anotarHistorial(correduriaId, clienteId, 'contacto', `${tipo === 'telefono' ? 'Teléfono' : 'Email'} añadido${etiqueta ? ` (${etiqueta})` : ''}${principal ? ', principal' : ''} desde plataforma por ${entrada.actor}`)
    const contactos = (await listarContactos(correduriaId, clienteId)) ?? { telefonos: [], emails: [] }
    return {
      ok: true,
      contacto: { id: fila.id, tipo, valor: norm.valor, ilegible: false, etiqueta, principal, creado: fila.createdAt.toISOString() },
      contactos,
    }
  } catch (e) {
    if (esUnicoViolado(e)) {
      const otros = await coincidencias(correduriaId, { [tipo]: norm.valor }, clienteId).catch(() => [])
      return conflicto(otros, false)
    }
    return fallo(e)
  }
}

export async function cambiarContacto(
  correduriaId: string,
  clienteId: string,
  entrada: { id: string; principal?: boolean; etiqueta?: unknown; actor: string },
): Promise<ResultadoContacto> {
  try {
    const c = await clienteDe(correduriaId, clienteId)
    if (!c) return noEncontrado()
    const db = prismaAsegura()
    const t = await db.clienteTelefono.findFirst({ where: { id: entrada.id, clienteId, correduriaId } })
    const m = t ? null : await db.clienteEmail.findFirst({ where: { id: entrada.id, clienteId, correduriaId } })
    if (!t && !m) return { ok: false, estado: 'no_encontrado', motivo: 'Ese teléfono o email no está en la ficha.', status: 404 }
    const tipo: TipoContacto = t ? 'telefono' : 'email'
    const data: { esPrincipal?: boolean; etiqueta?: string | null } = {}
    if ('etiqueta' in entrada) data.etiqueta = etiquetaContacto(tipo, entrada.etiqueta)
    if (entrada.principal === true) {
      if (tipo === 'telefono') await db.clienteTelefono.updateMany({ where: { clienteId, correduriaId }, data: { esPrincipal: false } })
      else await db.clienteEmail.updateMany({ where: { clienteId, correduriaId }, data: { esPrincipal: false } })
      data.esPrincipal = true
    }
    if (tipo === 'telefono') await db.clienteTelefono.update({ where: { id: entrada.id }, data })
    else await db.clienteEmail.update({ where: { id: entrada.id }, data })
    if (entrada.principal === true) {
      await espejarPrincipal(correduriaId, clienteId, tipo)
      await anotarHistorial(correduriaId, clienteId, 'contacto', `${tipo === 'telefono' ? 'Teléfono' : 'Email'} principal cambiado desde plataforma por ${entrada.actor}`)
    }
    return { ok: true, contacto: null, contactos: (await listarContactos(correduriaId, clienteId)) ?? { telefonos: [], emails: [] } }
  } catch (e) {
    if (esUnicoViolado(e)) {
      // Se intentó espejar como principal un valor que otra ficha ya tiene en su columna.
      await prismaAsegura().$executeRaw`select 1`.catch(() => null)
      return conflicto([], false)
    }
    return fallo(e)
  }
}

export async function borrarContacto(
  correduriaId: string,
  clienteId: string,
  entrada: { id: string; actor: string },
): Promise<ResultadoContacto> {
  try {
    const c = await clienteDe(correduriaId, clienteId)
    if (!c) return noEncontrado()
    const db = prismaAsegura()
    // `col:telefono` = el valor vive solo en la columna: borrarlo es vaciarla.
    if (entrada.id === 'col:telefono' || entrada.id === 'col:email') {
      const tipo: TipoContacto = entrada.id === 'col:telefono' ? 'telefono' : 'email'
      await db.cliente.updateMany({
        where: { id: clienteId, correduriaId },
        data: tipo === 'telefono' ? { telefono: null, telefonoLookupHash: null } : { email: null, emailLookupHash: null },
      })
      await anotarHistorial(correduriaId, clienteId, 'contacto', `${tipo === 'telefono' ? 'Teléfono' : 'Email'} borrado desde plataforma por ${entrada.actor}`)
      return { ok: true, contacto: null, contactos: (await listarContactos(correduriaId, clienteId)) ?? { telefonos: [], emails: [] } }
    }
    const t = await db.clienteTelefono.findFirst({ where: { id: entrada.id, clienteId, correduriaId } })
    const m = t ? null : await db.clienteEmail.findFirst({ where: { id: entrada.id, clienteId, correduriaId } })
    if (!t && !m) return { ok: false, estado: 'no_encontrado', motivo: 'Ese teléfono o email no está en la ficha.', status: 404 }
    const tipo: TipoContacto = t ? 'telefono' : 'email'
    const eraPrincipal = t ? t.esPrincipal : m!.esPrincipal
    if (tipo === 'telefono') await db.clienteTelefono.delete({ where: { id: entrada.id } })
    else await db.clienteEmail.delete({ where: { id: entrada.id } })
    if (eraPrincipal) {
      // Asciende el más antiguo que quede; si no queda ninguno, la columna se vacía.
      if (tipo === 'telefono') {
        const s = await db.clienteTelefono.findFirst({ where: { clienteId, correduriaId }, orderBy: { createdAt: 'asc' } })
        if (s) await db.clienteTelefono.update({ where: { id: s.id }, data: { esPrincipal: true } })
      } else {
        const s = await db.clienteEmail.findFirst({ where: { clienteId, correduriaId }, orderBy: { createdAt: 'asc' } })
        if (s) await db.clienteEmail.update({ where: { id: s.id }, data: { esPrincipal: true } })
      }
      await espejarPrincipal(correduriaId, clienteId, tipo)
    }
    await anotarHistorial(correduriaId, clienteId, 'contacto', `${tipo === 'telefono' ? 'Teléfono' : 'Email'} borrado desde plataforma por ${entrada.actor}`)
    return { ok: true, contacto: null, contactos: (await listarContactos(correduriaId, clienteId)) ?? { telefonos: [], emails: [] } }
  } catch (e) {
    if (esUnicoViolado(e)) return conflicto([], false)
    return fallo(e)
  }
}

// ─── Identidad y datos libres ────────────────────────────────────────────────

export type Identidad = {
  nombre: string
  apellidos: string
  dniEnmascarado: string | null
  dniIlegible: boolean
  fechaNacimiento: string | null
  fechaNacimientoIlegible: boolean
  tipoPersona: string | null
}

export type ResultadoEdicion = { ok: true } | Fallo

/**
 * Aplica una edición ya revisada por las reglas puras. Si toca identidad,
 * exige que `documentoId` sea un documento de tipo DNI, recibido, DE ESTE
 * cliente: un documento de otra ficha no acredita nada.
 */
export async function editarCliente(
  correduriaId: string,
  clienteId: string,
  edicion: EdicionCliente,
  actor: string,
): Promise<ResultadoEdicion> {
  const r = revisarEdicion(edicion)
  if (!r.ok) return invalido(r.motivo, r.campo)
  try {
    const db = prismaAsegura()
    const c = await clienteDe(correduriaId, clienteId)
    if (!c) return noEncontrado()

    if (r.tocaIdentidad) {
      const d = await db.documento.findFirst({
        where: { id: edicion.documentoId ?? '', correduriaId, clienteId },
        select: { tipo: true, estado: true },
      })
      if (!d || !documentoAcredita({ tipo: tipoDocumento(d.tipo), estado: estadoDocumento(d.estado) })) {
        return invalido('documento_no_acredita', 'documentoId')
      }
    }

    const data: Record<string, unknown> = { updatedAt: new Date() }
    if (r.identidad.nombre !== undefined) data.nombre = r.identidad.nombre
    if (r.identidad.apellidos !== undefined) data.apellidos = r.identidad.apellidos
    if (r.identidad.dni !== undefined) {
      if (r.identidad.dni === null) {
        data.dni = null
        data.dniLookupHash = null
      } else {
        const otros = await coincidencias(correduriaId, { dni: r.identidad.dni.valor }, clienteId)
        if (coincidenciaBloquea(otros)) return conflicto(otros, false)
        const { cifrado: dniCifrado, hash } = cifrado('dni', r.identidad.dni.valor)
        data.dni = dniCifrado
        data.dniLookupHash = hash
        data.tipoPersona = r.identidad.dni.tipoPersona
      }
    }
    if (r.identidad.fechaNacimiento !== undefined) {
      data.fechaNacimiento = r.identidad.fechaNacimiento === null ? null : encryptField(r.identidad.fechaNacimiento)
    }
    if (r.libre.direccion !== undefined) data.direccion = r.libre.direccion === null ? null : encryptField(r.libre.direccion)
    if (r.libre.codigoPostal !== undefined) data.codigoPostal = r.libre.codigoPostal
    if (r.libre.ciudad !== undefined) data.ciudad = r.libre.ciudad
    if (r.libre.provincia !== undefined) data.provincia = r.libre.provincia
    if (r.libre.notas !== undefined) data.notas = r.libre.notas

    await db.cliente.update({ where: { id: clienteId }, data })
    await anotarHistorial(correduriaId, clienteId, 'gestion', textoHistorialEdicion(r, { actor, documentoId: edicion.documentoId }))
    return { ok: true }
  } catch (e) {
    if (esUnicoViolado(e)) return conflicto([], false)
    return fallo(e)
  }
}

// ─── Alta ────────────────────────────────────────────────────────────────────

export type ResultadoAlta = { ok: true; id: string } | Fallo

/**
 * Alta manual = `lead`, `prospecto`. Antes de crear, busca por DNI, teléfono y
 * email: un DNI repetido es la misma persona y NO se crea; un teléfono o email
 * repetidos pueden ser otra persona y se crea solo con `forzar` — y entonces
 * ese valor va a la tabla hija, no a la columna única (que ya la tiene otra
 * ficha). Todo en una transacción: o queda la ficha entera o nada.
 */
export async function altaCliente(
  correduriaId: string,
  entrada: Record<string, unknown>,
  actor: string,
): Promise<ResultadoAlta> {
  const r = revisarAlta(entrada)
  if (!r.ok) return invalido(r.motivo, r.campo)
  const a: AltaCliente = r.alta
  try {
    const otros = await coincidencias(correduriaId, { dni: a.dni, telefono: a.telefono, email: a.email })
    if (otros.length > 0) {
      if (coincidenciaBloquea(otros)) return conflicto(otros, false)
      if (entrada.forzar !== true) return conflicto(otros, true)
    }
    const telEnOtra = otros.some((o) => o.por === 'telefono')
    const mailEnOtra = otros.some((o) => o.por === 'email')
    const db = prismaAsegura()
    const id = await db.$transaction(async (tx) => {
      const tel = a.telefono ? cifrado('telefono', a.telefono) : null
      const mail = a.email ? cifrado('email', a.email) : null
      const dni = a.dni ? cifrado('dni', a.dni) : null
      const creado = await tx.cliente.create({
        data: {
          correduriaId,
          nombre: a.nombre,
          apellidos: a.apellidos,
          tipo: 'lead',
          segmento: 'prospecto',
          tipoPersona: a.tipoPersona,
          dni: dni?.cifrado ?? null,
          dniLookupHash: dni?.hash ?? null,
          fechaNacimiento: a.fechaNacimiento ? encryptField(a.fechaNacimiento) : null,
          // El principal se espeja en la columna única SOLO si ninguna otra ficha lo tiene ya.
          telefono: tel && !telEnOtra ? tel.cifrado : null,
          telefonoLookupHash: tel && !telEnOtra ? tel.hash : null,
          email: mail && !mailEnOtra ? mail.cifrado : null,
          emailLookupHash: mail && !mailEnOtra ? mail.hash : null,
          direccion: a.direccion ? encryptField(a.direccion) : null,
          codigoPostal: a.codigoPostal,
          ciudad: a.ciudad,
          provincia: a.provincia,
          notas: a.notas,
          fuente: a.fuente,
        },
        select: { id: true },
      })
      if (tel) {
        await tx.clienteTelefono.create({
          data: { clienteId: creado.id, correduriaId, telefono: tel.cifrado, telefonoLookupHash: tel.hash, etiqueta: 'móvil', esPrincipal: true },
        })
      }
      if (mail) {
        await tx.clienteEmail.create({
          data: { clienteId: creado.id, correduriaId, email: mail.cifrado, emailLookupHash: mail.hash, etiqueta: 'personal', esPrincipal: true },
        })
      }
      const tipoHist: TipoHistorial = tipoHistorialAlta(a.fuente)
      await tx.$executeRaw`
        insert into historial_interno (correduria_id, cliente_id, tipo, texto)
        values (${correduriaId}::uuid, ${creado.id}::uuid, cast(${tipoHist} as tipo_historial_interno),
                ${textoHistorialAlta(a, { actor, compartido: telEnOtra || mailEnOtra })})`
      return creado.id
    })
    return { ok: true, id }
  } catch (e) {
    if (esUnicoViolado(e)) {
      const otros = await coincidencias(correduriaId, { dni: a.dni, telefono: a.telefono, email: a.email }).catch(() => [])
      return conflicto(otros, false)
    }
    return fallo(e)
  }
}

// ─── Historial ───────────────────────────────────────────────────────────────

/**
 * Deja constancia en `historial_interno` (tabla del CRM, 0 filas hasta hoy).
 * Best-effort a propósito: el cambio ya está hecho, y un historial caído no
 * puede deshacerlo ni presentarlo como fallido.
 */
async function anotarHistorial(correduriaId: string, clienteId: string, tipo: TipoHistorial, texto: string): Promise<void> {
  try {
    await prismaAsegura().$executeRaw`
      insert into historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${correduriaId}::uuid, ${clienteId}::uuid, cast(${tipo} as tipo_historial_interno), ${texto})`
  } catch (e) {
    console.error('[cartera-edicion] historial_interno no se pudo anotar:', e instanceof Error ? e.message : e)
  }
}


export type ResultadoHistorial = { ok: true } | Fallo

/**
 * Anotar una fila de historial COMO OPERACIÓN (puerto `POST /api/operador/cliente/historial`):
 * un contacto que llega por un canal —formulario web sobre una ficha que ya
 * existía, p. ej.— y cuyo único rastro es esta fila. Por eso aquí NO es
 * best-effort como `anotarHistorial`: si no se escribe, se dice (500), porque
 * el llamante tiene que saber que ese contacto no ha quedado en ningún sitio.
 * El cliente se comprueba de la correduría antes (404 si no).
 */
export async function anotarHistorialCliente(
  correduriaId: string,
  clienteId: string,
  tipo: unknown,
  texto: unknown,
): Promise<ResultadoHistorial> {
  const t = tipoHistorial(tipo)
  if (!t) return invalido('Tipo de historial no válido: nota, gestion o contacto.', 'tipo')
  const txt = typeof texto === 'string' ? texto.replace(/\s+/g, ' ').trim() : ''
  if (txt === '') return invalido('Falta el texto.', 'texto')
  if (txt.length > 2000) return invalido('El texto es demasiado largo (máx. 2000).', 'texto')
  if (clienteId.trim() === '') return invalido('Falta el cliente.', 'clienteId')
  try {
    if (!(await clienteDe(correduriaId, clienteId))) return noEncontrado()
    await prismaAsegura().$executeRaw`
      insert into historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${correduriaId}::uuid, ${clienteId}::uuid, cast(${t} as tipo_historial_interno), ${txt})`
    return { ok: true }
  } catch (e) {
    return fallo(e)
  }
}
