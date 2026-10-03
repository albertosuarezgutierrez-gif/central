// Vuelca a la ficha del TOMADOR lo que su póliza subida sabe y la ficha no (03/10/2026).
//
// La regla (qué se escribe y qué no) es PURA y está en `@central/module-seguros`
// (`parcheFichaDesdePoliza`, con sus tests): solo rellena huecos, nunca pisa, y con un DNI distinto
// no toca nada. Aquí solo se lee la ficha, se aplica el parche con las escrituras de siempre
// (`anadirContacto`, `guardarCarnet`) y se deja una nota en el historial con lo rellenado.
//
// - Nunca lanza: lo llama la subida de un documento, que ya está guardado y no puede caerse por esto.
// - Cada escritura vuelve a comprobar el hueco en la propia sentencia (`coalesce`/`where`): dos
//   subidas a la vez no pisan la una a la otra.
// - En el historial van los NOMBRES de los campos, no los valores (es la ficha; el valor ya está en ella).
import { Prisma } from './generated/asegura-client'
import {
  normalizarContacto,
  parcheFichaDesdePoliza,
  provinciaPorCp,
  type ContactoTomadorLeido,
  type ResultadoParche,
} from '@central/module-seguros'
import { computeDniLookupHash, encryptField } from '@central/module-seguros-pii'
import { prismaAsegura } from './asegura-db'
import { anotarCambio } from './auditoria'
import { anadirContacto, anotarHistorialCliente, coincidencias, descifrarCampo, guardarCarnet, listarContactos } from './cartera-edicion'

export type VolcadoFicha =
  | { estado: 'rellenada'; campos: string[]; fechaNacimientoAConfirmar: boolean; avisos: string[] }
  | { estado: 'nada_que_rellenar' }
  | { estado: 'no_tocada'; motivo: Exclude<ResultadoParche['motivo'], 'ok'> | 'sin_ficha' }
  | { estado: 'error'; motivo: string }

export type DatosTomadorLeidos = {
  ramo: string | null
  dni: string | null
  fechaNacimiento: string | null
  fechaCarnet: string | null
  contacto: ContactoTomadorLeido
}

const hoyIso = (d: Date) => d.toISOString().slice(0, 10)

export async function volcarPolizaEnFicha(e: {
  correduriaId: string
  clienteId: string
  leido: DatosTomadorLeidos
  actor: string
  origen: string
  hoy?: Date
}): Promise<VolcadoFicha> {
  try {
    const db = prismaAsegura()
    const c = await db.cliente.findFirst({
      where: { id: e.clienteId, correduriaId: e.correduriaId, mergedIntoClienteId: null },
      select: { dni: true, fechaNacimiento: true, direccion: true, codigoPostal: true, ciudad: true, provincia: true },
    })
    if (!c) return { estado: 'no_tocada', motivo: 'sin_ficha' }
    const lleno = (v: string | null) => typeof v === 'string' && v.trim() !== ''
    const [contactos, carnets] = await Promise.all([
      listarContactos(e.correduriaId, e.clienteId),
      db.clienteCarnetConducir.count({ where: { clienteId: e.clienteId, correduriaId: e.correduriaId } }).catch(() => null),
    ])
    // Un contacto que no se descifra cuenta como «no se sabe»: la lista entera pasa a null y no se
    // añade nada de ese tipo (podría ser el mismo número).
    const valores = (tipo: 'telefono' | 'email', xs: { valor: string | null; ilegible: boolean }[] | undefined) => {
      if (!xs || xs.some((x) => x.ilegible)) return null
      return xs.flatMap((x) => {
        const n = x.valor ? normalizarContacto(tipo, x.valor) : null
        return n && n.ok ? [n.valor] : []
      })
    }
    const dniLeido = lleno(c.dni) ? descifrarCampo(c.dni) : null
    const r = parcheFichaDesdePoliza(
      {
        tieneDni: lleno(c.dni),
        tieneFechaNacimiento: lleno(c.fechaNacimiento),
        tieneDireccion: lleno(c.direccion),
        tieneCodigoPostal: lleno(c.codigoPostal),
        tieneCiudad: lleno(c.ciudad),
        tieneProvincia: lleno(c.provincia),
        telefonos: contactos ? valores('telefono', contactos.telefonos) : null,
        emails: contactos ? valores('email', contactos.emails) : null,
        carnets,
      },
      e.leido,
      lleno(c.dni) ? (dniLeido ?? undefined) : null,
      hoyIso(e.hoy ?? new Date()),
    )
    if (r.motivo !== 'ok') return { estado: 'no_tocada', motivo: r.motivo }
    if (r.rellenado.length === 0) return { estado: 'nada_que_rellenar' }

    const p = r.parche
    const hechos: string[] = []
    const avisos: string[] = []

    // 1. Columnas de la ficha, cada una SOLO si sigue vacía en el momento de escribir.
    let dni: { cifrado: string; hash: string | null } | null = null
    if (p.dni) {
      // Un DNI que ya está en otra ficha no se copia aquí: serían dos fichas de la misma persona, y
      // eso se resuelve fusionando (por SQL con lote), no escribiendo.
      const otros = await coincidencias(e.correduriaId, { dni: p.dni }, e.clienteId).catch(() => null)
      if (otros === null) avisos.push('no se pudo comprobar si el DNI ya estaba en otra ficha: no se ha guardado')
      else if (otros.length > 0) avisos.push(`el DNI ya está en otra ficha (${otros.map((o) => o.id).join(', ')}): no se ha copiado, posible duplicado`)
      else dni = { cifrado: encryptField(p.dni), hash: computeDniLookupHash(p.dni) }
    }
    const vacio = (col: string) => Prisma.raw(`nullif(trim(coalesce(${col}, '')), '') is null`)
    const sets: Prisma.Sql[] = []
    if (dni) {
      sets.push(Prisma.sql`dni = case when ${vacio('dni')} then ${dni.cifrado} else dni end`)
      sets.push(Prisma.sql`dni_lookup_hash = case when ${vacio('dni')} then ${dni.hash} else dni_lookup_hash end`)
    }
    if (p.fechaNacimiento) sets.push(Prisma.sql`fecha_nacimiento = case when ${vacio('fecha_nacimiento')} then ${encryptField(p.fechaNacimiento)} else fecha_nacimiento end`)
    if (p.direccion) sets.push(Prisma.sql`direccion = case when ${vacio('direccion')} then ${encryptField(p.direccion)} else direccion end`)
    // CP, población y provincia van con la calle (el parche solo los trae si la calle estaba vacía):
    // la sentencia los ata a que la calle SIGA vacía, para no casar el CP de una con la calle de otra.
    const conCalle = (col: string, v: string) =>
      Prisma.sql`${Prisma.raw(col)} = case when ${vacio(col)} and ${vacio('direccion')} then ${v} else ${Prisma.raw(col)} end`
    if (p.codigoPostal) sets.push(conCalle('codigo_postal', p.codigoPostal))
    if (p.ciudad) sets.push(conCalle('ciudad', p.ciudad.slice(0, 100)))
    const provincia = p.provincia ?? (p.direccion && p.codigoPostal ? provinciaPorCp(p.codigoPostal) : null)
    if (provincia) sets.push(conCalle('provincia', provincia.slice(0, 100)))
    if (sets.length > 0) {
      const n = await db.$executeRaw(Prisma.sql`
        update clientes set ${Prisma.join(sets, ', ')}, updated_at = now()
        where id = ${e.clienteId}::uuid and correduria_id = ${e.correduriaId}::uuid and merged_into_cliente_id is null`)
      if (n > 0) {
        if (dni) { hechos.push('DNI'); anotarCambio({ entidad: 'cliente', id: e.clienteId, campo: 'dni' }) }
        if (p.fechaNacimiento) {
          hechos.push(p.fechaNacimientoAConfirmar ? 'fecha de nacimiento (01/01, a confirmar)' : 'fecha de nacimiento')
          anotarCambio({ entidad: 'cliente', id: e.clienteId, campo: 'fecha_nacimiento' })
        }
        if (p.direccion) { hechos.push('domicilio'); anotarCambio({ entidad: 'cliente', id: e.clienteId, campo: 'direccion' }) }
        if (p.codigoPostal) { hechos.push('código postal'); anotarCambio({ entidad: 'cliente', id: e.clienteId, campo: 'codigo_postal' }) }
        if (p.ciudad) { hechos.push('población'); anotarCambio({ entidad: 'cliente', id: e.clienteId, campo: 'ciudad' }) }
        if (provincia) { hechos.push('provincia'); anotarCambio({ entidad: 'cliente', id: e.clienteId, campo: 'provincia' }) }
      }
    }

    // 2. Teléfono y email: por la misma puerta que la ficha (sin duplicar en la ficha; si otra
    //    ficha ya lo tiene NO se fuerza: un móvil identifica un hogar, no a una persona).
    for (const tipo of ['telefono', 'email'] as const) {
      const valor = tipo === 'telefono' ? p.telefono : p.email
      if (!valor) continue
      const a = await anadirContacto(e.correduriaId, e.clienteId, { tipo, valor, principal: false, forzar: false, actor: e.actor, etiqueta: null }).catch(() => null)
      if (a?.ok) hechos.push(tipo === 'telefono' ? 'teléfono' : 'email')
      else if (a && a.estado === 'conflicto') {
        const quien = (a.coincidencias ?? []).map((x) => x.id).join(', ')
        avisos.push(`${tipo === 'telefono' ? 'el teléfono' : 'el email'} de la póliza ya está en otra ficha (${quien || 'otra'}): no se ha añadido`)
      } else if (!a || a.estado !== 'invalido') avisos.push(`no se pudo guardar ${tipo === 'telefono' ? 'el teléfono' : 'el email'}`)
    }

    // 3. Carné: solo si sigue sin NINGUNO justo ahora (el parche ya lo miró; esto cierra la carrera).
    if (p.carnet) {
      const ya = await db.clienteCarnetConducir.count({ where: { clienteId: e.clienteId, correduriaId: e.correduriaId } }).catch(() => null)
      if (ya === 0) {
        const g = await guardarCarnet(e.correduriaId, e.clienteId, { tipo: p.carnet.tipo, fecha: p.carnet.fecha, actor: e.actor }).catch(() => null)
        if (g?.ok) hechos.push(`carné ${p.carnet.tipo}`)
        else avisos.push('no se pudo guardar el carné')
      }
    }

    if (hechos.length === 0 && avisos.length === 0) return { estado: 'nada_que_rellenar' }
    const partes = [
      hechos.length > 0 ? `Rellenado desde la póliza subida (${e.origen}): ${hechos.join(', ')}.` : `Póliza subida (${e.origen}): no se ha rellenado nada.`,
      p.fechaNacimiento && p.fechaNacimientoAConfirmar && hechos.some((h) => h.startsWith('fecha de nacimiento'))
        ? 'Fecha de nacimiento 01/01 a confirmar: la póliza solo trae el año.'
        : null,
      avisos.length > 0 ? `Ojo: ${avisos.join('; ')}.` : null,
      `— por ${e.actor}`,
    ].filter(Boolean)
    await anotarHistorialCliente(e.correduriaId, e.clienteId, 'gestion', partes.join(' ').slice(0, 2000)).catch(() => null)
    return hechos.length > 0
      ? { estado: 'rellenada', campos: hechos, fechaNacimientoAConfirmar: p.fechaNacimientoAConfirmar && p.fechaNacimiento !== null, avisos }
      : { estado: 'nada_que_rellenar' }
  } catch (err) {
    console.error('[ficha-desde-poliza] no se pudo volcar la póliza en la ficha:', err instanceof Error ? err.message : err)
    return { estado: 'error', motivo: err instanceof Error ? err.message : String(err) }
  }
}
