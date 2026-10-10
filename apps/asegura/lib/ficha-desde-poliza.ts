// Vuelca a la ficha del TOMADOR lo que su póliza subida sabe y la ficha no (03/10/2026).
//
// La regla (qué se escribe y qué no) es PURA y está en `@central/module-seguros`
// (`parcheFichaDesdePoliza`, con sus tests): solo rellena huecos, nunca pisa, y con un DNI distinto
// no toca nada. Aquí solo se lee la ficha, se aplica el parche con las escrituras de siempre
// (`anadirContacto`, `guardarCarnet`) y se deja una nota en el historial con lo rellenado.
//
// - Nunca lanza: lo llama la subida de un documento, que ya está guardado y no puede caerse por esto.
// - Cada escritura vuelve a comprobar el hueco en la propia sentencia (y lo dice con RETURNING): dos
//   subidas a la vez no se pisan, y la nota y la auditoría cuentan solo lo escrito.
// - En el historial van los NOMBRES de los campos, no los valores (es la ficha; el valor ya está en ella).
import { Prisma } from './generated/asegura-client'
import {
  normalizarContacto,
  parcheFichaDesdePoliza,
  parcheFigura,
  provinciaPorCp,
  type ContactoTomadorLeido,
  type DomicilioFigura,
  type PersonaFigura,
  type ResultadoParche,
} from '@central/module-seguros'
import { computeDniLookupHash, encryptField } from '@central/module-seguros-pii'
import { prismaAsegura } from './asegura-db'
import { anotarCambio } from './auditoria'
import { anadirContacto, anotarHistorialCliente, coincidencias, descifrarCampo, guardarCarnet, listarContactos } from './cartera-edicion'

export type VolcadoFicha =
  | { estado: 'rellenada'; campos: string[]; fechaNacimientoAConfirmar: boolean; avisos: string[] }
  | { estado: 'nada_que_rellenar'; avisos: string[] }
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

// ─── Huecos de la ficha: UNA sentencia, fila bloqueada (tomador y figuras) ──────────────────────
// Cada columna se escribe SOLO si estaba vacía, y el RETURNING dice cuáles lo estaban de verdad (la
// fila se bloquea y se lee en la misma sentencia): la nota del historial y la auditoría cuentan lo
// ESCRITO, no lo propuesto. Dos subidas a la vez no se pisan ni se atribuyen lo ajeno.

/** Una columna a rellenar: `cuando` se evalúa contra la fila bloqueada (`a.a_*`). */
type Hueco = { flag: string; etiqueta: string | null; auditoria: string | null; cuando: Prisma.Sql; sets: Prisma.Sql[] }
const vacio = (col: string) => Prisma.raw(`nullif(trim(coalesce(${col}, '')), '') is null`)

function huecoFechaNacimiento(fecha: string, aConfirmar: boolean): Hueco {
  return {
    flag: 'fecha_nacimiento',
    etiqueta: aConfirmar ? 'fecha de nacimiento (01/01, a confirmar)' : 'fecha de nacimiento',
    auditoria: 'fecha_nacimiento',
    cuando: Prisma.sql`${vacio('a.a_fn')}`,
    sets: [Prisma.sql`fecha_nacimiento = case when ${vacio('a.a_fn')} then ${encryptField(fecha)} else c.fecha_nacimiento end`],
  }
}

/**
 * El domicilio (calle cifrada; CP, población y provincia en claro, como siempre). CP, población y
 * provincia van con la calle: solo si la calle estaba vacía (y ellos también), para no casar el CP de
 * una dirección con la calle de otra. Sin provincia leída, la del CP (solo junto a calle y CP).
 */
function huecosDomicilio(d: { direccion: string | null; codigoPostal: string | null; ciudad: string | null; provincia: string | null }): Hueco[] {
  const out: Hueco[] = []
  if (d.direccion) {
    out.push({
      flag: 'direccion', etiqueta: 'domicilio', auditoria: 'direccion', cuando: Prisma.sql`${vacio('a.a_dir')}`,
      sets: [Prisma.sql`direccion = case when ${vacio('a.a_dir')} then ${encryptField(d.direccion)} else c.direccion end`],
    })
  }
  const conCalle = (col: string, alias: string, v: string, etiqueta: string) =>
    out.push({
      flag: col, etiqueta, auditoria: col,
      cuando: Prisma.sql`${vacio(`a.${alias}`)} and ${vacio('a.a_dir')}`,
      sets: [Prisma.sql`${Prisma.raw(col)} = case when ${vacio(`a.${alias}`)} and ${vacio('a.a_dir')} then ${v} else ${Prisma.raw(`c.${col}`)} end`],
    })
  if (d.codigoPostal) conCalle('codigo_postal', 'a_cp', d.codigoPostal, 'código postal')
  if (d.ciudad) conCalle('ciudad', 'a_ciudad', d.ciudad.slice(0, 100), 'población')
  const provincia = d.provincia ?? (d.direccion && d.codigoPostal ? provinciaPorCp(d.codigoPostal) : null)
  if (provincia) conCalle('provincia', 'a_prov', provincia.slice(0, 100), 'provincia')
  return out
}

/** Escribe los huecos en UNA sentencia (UPDATE … RETURNING sobre la fila bloqueada). Devuelve las etiquetas de lo ESCRITO. */
async function escribirHuecos(correduriaId: string, clienteId: string, campos: Hueco[]): Promise<string[]> {
  if (campos.length === 0) return []
  const filas = await prismaAsegura().$queryRaw<Record<string, boolean>[]>(Prisma.sql`
    with a as (
      select id, dni as a_dni, fecha_nacimiento as a_fn, direccion as a_dir, codigo_postal as a_cp, ciudad as a_ciudad, provincia as a_prov
      from clientes
      where id = ${clienteId}::uuid and correduria_id = ${correduriaId}::uuid and merged_into_cliente_id is null
      for update
    )
    update clientes c set ${Prisma.join(campos.flatMap((x) => x.sets), ', ')}, updated_at = now()
    from a where c.id = a.id
    returning ${Prisma.join(campos.map((x) => Prisma.sql`(${x.cuando}) as ${Prisma.raw(`"${x.flag}"`)}`), ', ')}`)
  const escrito = filas[0]
  const hechos: string[] = []
  for (const x of campos) {
    if (escrito?.[x.flag] !== true) continue
    if (x.etiqueta) hechos.push(x.etiqueta)
    if (x.auditoria) anotarCambio({ entidad: 'cliente', id: clienteId, campo: x.auditoria })
  }
  return hechos
}

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
    if (r.rellenado.length === 0) return { estado: 'nada_que_rellenar', avisos: [] }

    const p = r.parche
    const hechos: string[] = []
    const avisos: string[] = []

    // 1. Columnas de la ficha, cada una SOLO si sigue vacía en el momento de escribir.
    let dni: { cifrado: string; hash: string | null } | null = null
    const etiquetaId = p.esEmpresa ? 'CIF' : 'DNI'
    if (p.dni) {
      // Un DNI que ya está en otra ficha no se copia aquí: serían dos fichas de la misma persona, y
      // eso se resuelve fusionando (por SQL con lote), no escribiendo. El CIF de una empresa va en la
      // MISMA columna, con el mismo cifrado y el mismo índice ciego (`dni_lookup_hash`).
      const otros = await coincidencias(e.correduriaId, { dni: p.dni }, e.clienteId).catch(() => null)
      if (otros === null) avisos.push(`no se pudo comprobar si el ${etiquetaId} ya estaba en otra ficha: no se ha guardado`)
      else if (otros.length > 0) avisos.push(`el ${etiquetaId} ya está en otra ficha (${otros.map((o) => o.id).join(', ')}): no se ha copiado, posible duplicado`)
      else dni = { cifrado: encryptField(p.dni), hash: computeDniLookupHash(p.dni) }
    }
    const campos: Hueco[] = []
    if (dni) {
      campos.push({
        flag: 'dni', etiqueta: etiquetaId, auditoria: 'dni', cuando: Prisma.sql`${vacio('a.a_dni')}`,
        sets: [
          Prisma.sql`dni = case when ${vacio('a.a_dni')} then ${dni.cifrado} else c.dni end`,
          Prisma.sql`dni_lookup_hash = case when ${vacio('a.a_dni')} then ${dni.hash} else c.dni_lookup_hash end`,
        ],
      })
    }
    if (p.fechaNacimiento) campos.push(huecoFechaNacimiento(p.fechaNacimiento, p.fechaNacimientoAConfirmar))
    campos.push(...huecosDomicilio(p))
    hechos.push(...(await escribirHuecos(e.correduriaId, e.clienteId, campos)))

    // 2. Teléfono y email: por la misma puerta que la ficha (sin duplicar en la ficha; si otra
    //    ficha ya lo tiene NO se fuerza: un móvil identifica un hogar, no a una persona).
    for (const tipo of ['telefono', 'email'] as const) {
      const valor = tipo === 'telefono' ? p.telefono : p.email
      if (!valor) continue
      // 🚨 El email volcado NUNCA queda principal (`nuncaPrincipal`): el portal enlaza la sesión por el
      // email principal, y un papel subido no puede entregar la cuenta de nadie.
      const a = await anadirContacto(e.correduriaId, e.clienteId, { tipo, valor, principal: false, nuncaPrincipal: tipo === 'email', forzar: false, actor: e.actor, etiqueta: null }).catch(() => null)
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

    if (hechos.length === 0 && avisos.length === 0) return { estado: 'nada_que_rellenar', avisos }
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
      ? { estado: 'rellenada', campos: hechos, fechaNacimientoAConfirmar: hechos.includes('fecha de nacimiento (01/01, a confirmar)'), avisos }
      // Sin nada escrito, los avisos (DNI en otra ficha, teléfono que no se guardó…) siguen viajando.
      : { estado: 'nada_que_rellenar', avisos }
  } catch (err) {
    console.error('[ficha-desde-poliza] no se pudo volcar la póliza en la ficha:', err instanceof Error ? err.message : err)
    return { estado: 'error', motivo: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Fecha de nacimiento, domicilio y carné de una FIGURA de la póliza (propietario, conductor) a SU
 * ficha (03/10/2026). Solo HUECOS (`parcheFigura`, puro); fecha y domicilio en UNA sentencia con la
 * fila bloqueada (`escribirHuecos`, la misma que el tomador). Quien llama ya ha comprobado que la
 * ficha es de esa persona (su DNI, o el lead recién abierto / ya vinculado al tomador con su nombre
 * exacto). Nunca lanza: devuelve lo escrito (nombres de campo) y los avisos.
 */
export async function volcarFiguraEnFicha(e: {
  correduriaId: string
  clienteId: string
  persona: Pick<PersonaFigura, 'fechaNacimiento' | 'fechaCarnet' | 'claseCarnet'> & Partial<DomicilioFigura>
  ramo: string
  /** Cómo figura en la póliza («Conductor habitual»…), para la nota del historial. */
  queEs: string
  actor: string
  origen: string
  hoy?: Date
}): Promise<{ campos: string[]; avisos: string[] }> {
  const campos: string[] = []
  const avisos: string[] = []
  try {
    if (!e.persona.fechaNacimiento && !e.persona.fechaCarnet && !e.persona.domicilioVia) return { campos, avisos }
    const db = prismaAsegura()
    const c = await db.cliente.findFirst({
      where: { id: e.clienteId, correduriaId: e.correduriaId, mergedIntoClienteId: null },
      select: { fechaNacimiento: true, direccion: true, codigoPostal: true, ciudad: true, provincia: true },
    })
    if (!c) return { campos, avisos: ['no se encontró su ficha para rellenarla'] }
    const lleno = (v: string | null) => typeof v === 'string' && v.trim() !== ''
    const carnets = await db.clienteCarnetConducir.count({ where: { clienteId: e.clienteId, correduriaId: e.correduriaId } }).catch(() => null)
    const p = parcheFigura(
      {
        tieneFechaNacimiento: lleno(c.fechaNacimiento),
        carnets,
        tieneDireccion: lleno(c.direccion),
        tieneCodigoPostal: lleno(c.codigoPostal),
        tieneCiudad: lleno(c.ciudad),
        tieneProvincia: lleno(c.provincia),
      },
      e.persona,
      e.ramo,
      hoyIso(e.hoy ?? new Date()),
    )
    if (p.rellenado.length === 0) return { campos, avisos }
    // Fecha y domicilio: solo si siguen vacíos AHORA (la misma sentencia lo comprueba).
    const huecos: Hueco[] = []
    if (p.fechaNacimiento) huecos.push(huecoFechaNacimiento(p.fechaNacimiento, p.fechaNacimientoAConfirmar))
    huecos.push(...huecosDomicilio(p))
    campos.push(...(await escribirHuecos(e.correduriaId, e.clienteId, huecos)))
    if (p.carnet) {
      const ya = await db.clienteCarnetConducir.count({ where: { clienteId: e.clienteId, correduriaId: e.correduriaId } }).catch(() => null)
      if (ya === 0) {
        const g = await guardarCarnet(e.correduriaId, e.clienteId, { tipo: p.carnet.tipo, fecha: p.carnet.fecha, actor: e.actor }).catch(() => null)
        if (g?.ok) campos.push(`carné ${p.carnet.tipo}`)
        else avisos.push('no se pudo guardar su carné')
      }
    }
    if (campos.length > 0) {
      const partes = [
        `Rellenado desde la póliza subida (${e.origen}), donde figura como ${e.queEs.toLowerCase()}: ${campos.join(', ')}.`,
        campos.some((x) => x.includes('a confirmar')) ? 'Fecha de nacimiento 01/01 a confirmar: la póliza solo trae el año.' : null,
        `— por ${e.actor}`,
      ].filter(Boolean)
      await anotarHistorialCliente(e.correduriaId, e.clienteId, 'gestion', partes.join(' ').slice(0, 2000)).catch(() => null)
    }
    return { campos, avisos }
  } catch (err) {
    console.error('[ficha-desde-poliza] no se pudo rellenar la ficha de la figura:', err instanceof Error ? err.message : err)
    return { campos, avisos: [...avisos, 'no se pudo rellenar su ficha'] }
  }
}
