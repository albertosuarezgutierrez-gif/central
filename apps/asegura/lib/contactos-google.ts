/**
 * La selección que se sincroniza con Google Contacts (05/10/2026): la del .vcf del móvil
 * (`contactosMovil`: cartera en vigor + leads de Vencimientos) más lo que solo va a Google:
 *   · B · la NOTA (ficha rápida: pólizas en vigor —ramo + compañía—, próximo vencimiento) y la URL
 *         de la ficha en plataforma (`/correduria/cliente/<id>`). Sin NIF, importes ni nº de póliza.
 *   · C · los contactos de las COMPAÑÍAS (`compania_contactos` activos de compañías activas), 🔵.
 *   · D · el aviso ⏰ si alguna póliza en vigor del cliente vence en ≤30 días.
 *   · E · la fecha de nacimiento de la ficha (`clientes.fecha_nacimiento`, CIFRADA), si consta.
 *   · ESTADOS (05/10/2026): 🚨 siniestro abierto/en tramitación (no fusionado), 💶 recibo DEVUELTO de
 *         una póliza en vigor (no los `pendiente`: Alberto los leyó como deuda y no lo son), ⚪
 *         EX-CLIENTE (póliza de cartera viva y ninguna en vigor) SOLO si ya tiene vínculo: no se crean
 *         contactos de ex-clientes; el que había se queda con ⚪ en vez de retirarse.
 *   · MOTE (`cliente_mote`, aislado): el contacto se llama «<emoji> <mote>».
 *   · «UN NÚMERO, UN CONTACTO» (05/10/2026): `tipo_persona` (decide la principal de un teléfono
 *         compartido), el resumen ramo · compañía («También: …») y si la ficha NO tiene ningún
 *         teléfono/correo (columna Y tabla hija vacías: «Enriquecer ficha»; si no, no se propone).
 * 🚨 Si la consulta de siniestros, recibos, motes o ex-clientes FALLA, se lanza como las demás: el
 * cron no escribe nada y cada contacto conserva su emoji anterior («no se pudo mirar» ≠ «no hay»).
 * Lo que no se puede leer va como `null` («no se sabe»): ese campo de Google no se toca. Si una
 * consulta falla, LANZA (el cron no escribe nada): un hueco aquí no es «no hay».
 *
 * 🛡️ Clientes y pólizas filtrados por `correduriaId`. `compania_contactos` es un catálogo GLOBAL
 * (no lleva correduría): hoy hay una sola correduría; con una segunda habría que acotarlo.
 */
import {
  alertaPrioritaria, avisoVencimiento, conLineasEstado, lineasEstado, nombreCompaniaContacto, normalizarNacimiento,
  notaCliente, notaExCliente, notaLead, proximoVencimiento, resumenPolizas, trocear, PREFIJO_CLAVE_COMPANIA, type ContactoGoogle,
} from '@central/module-seguros/google-contactos'
import { importeEiac, sqlCarteraEnVigor, sqlCarteraViva } from '@central/module-seguros'

import { prismaAsegura } from './asegura-db'
import { contactosDe } from './cartera-busqueda'
import { descifrarCampo } from './cartera-edicion'
import { contactosMovil } from './contactos-movil'
import { URL_PLATAFORMA_DEFECTO } from './datos-cotizados'
import { Prisma } from './generated/asegura-client'

export type SeleccionGoogle = { contactos: ContactoGoogle[]; seleccionCompleta: boolean }

export function hoyMadrid(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
}

export function urlFichaPlataforma(clienteId: string): string {
  const base = (process.env.PLATAFORMA_URL?.trim() || URL_PLATAFORMA_DEFECTO).replace(/\/+$/, '')
  return `${base}/correduria/cliente/${encodeURIComponent(clienteId)}`
}

export async function seleccionGoogle(correduriaId: string, hoy: string = hoyMadrid()): Promise<SeleccionGoogle> {
  const db = prismaAsegura()
  const sel = await contactosMovil(correduriaId)

  // Pólizas EN VIGOR de los clientes de la selección (la misma definición que «cliente»).
  const polizas = await db.$queryRaw<{ clienteId: string; ramo: string; compania: string | null; vencimiento: string | null }[]>(Prisma.sql`
    select p.cliente_id::text as "clienteId", p.tipo::text as ramo,
      coalesce(nullif(trim(cd.nombre_comun), ''), nullif(trim(p.aseguradora), '')) as compania,
      to_char(p.fecha_vencimiento, 'YYYY-MM-DD') as vencimiento
    from polizas p
    join clientes c on c.id = p.cliente_id and c.correduria_id = p.correduria_id
    left join companias_dgs cd on cd.codigo_dgs = p.codigo_entidad_dgs
    where p.correduria_id = ${correduriaId}::uuid and c.activo and c.merged_into_cliente_id is null
      and p.merged_into_poliza_id is null
      and ${Prisma.raw(sqlCarteraEnVigor('p'))}`)
  const porCliente = new Map<string, typeof polizas>()
  for (const p of polizas) porCliente.set(p.clienteId, [...(porCliente.get(p.clienteId) ?? []), p])

  // Fecha de nacimiento, descifrada como el resto (ilegible o rara → null: no se toca la de Google).
  const ids = [...new Set(sel.contactos.map((c) => c.clienteId))]
  const nacimiento = new Map<string, string | null>()
  for (const tanda of trocear(ids, 5000)) {
    const filas = await db.cliente.findMany({ where: { correduriaId, id: { in: tanda } }, select: { id: true, fechaNacimiento: true } })
    for (const f of filas) nacimiento.set(f.id, normalizarNacimiento(descifrarCampo(f.fechaNacimiento)))
  }

  // ⚪ EX-CLIENTES: SOLO fichas que ya tienen vínculo y no salen en la selección (no se crean contactos
  // nuevos de ex-clientes). Póliza de cartera viva (no volcado) y ninguna en vigor; nunca `clientes.tipo`.
  const enSel = new Set(ids)
  const vinculadas = (await db.googleContactosVinculo.findMany({ where: { correduriaId, clienteId: { not: null } }, select: { clienteId: true } }))
    .flatMap((v) => (v.clienteId && !enSel.has(v.clienteId) ? [v.clienteId] : []))
  const exClientes = vinculadas.length === 0 ? [] : await db.$queryRaw<{ id: string; nombre: string | null; apellidos: string | null; baja: string | null; compania: string | null }[]>(Prisma.sql`
    select c.id::text as id, c.nombre, c.apellidos, u.baja, u.compania
    from clientes c
    left join lateral (
      select to_char(coalesce(p.fecha_situacion, p.fecha_vencimiento), 'YYYY-MM-DD') as baja,
        coalesce(nullif(trim(cd.nombre_comun), ''), nullif(trim(p.aseguradora), '')) as compania
      from polizas p left join companias_dgs cd on cd.codigo_dgs = p.codigo_entidad_dgs
      where p.cliente_id = c.id and p.correduria_id = c.correduria_id and p.merged_into_poliza_id is null
        and ${Prisma.raw(sqlCarteraViva('p'))}
      order by coalesce(p.fecha_situacion, p.fecha_vencimiento) desc nulls last
      limit 1
    ) u on true
    where c.correduria_id = ${correduriaId}::uuid and c.id = any(${vinculadas}::uuid[])
      and c.activo and c.merged_into_cliente_id is null
      and exists (select 1 from polizas p where p.cliente_id = c.id and p.correduria_id = c.correduria_id
        and p.merged_into_poliza_id is null and ${Prisma.raw(sqlCarteraViva('p'))})
      and not exists (select 1 from polizas p where p.cliente_id = c.id and p.correduria_id = c.correduria_id
        and p.merged_into_poliza_id is null and ${Prisma.raw(sqlCarteraEnVigor('p'))})`)
  const contactoEx = exClientes.length ? await contactosDe(correduriaId, exClientes.map((x) => x.id)) : new Map()
  const fichas = [...ids, ...exClientes.map((x) => x.id)]

  // 🚨 Siniestros abiertos y 💶 recibos devueltos de pólizas EN VIGOR. Una consulta caída LANZA.
  const siniestros = fichas.length === 0 ? [] : await db.$queryRaw<{ clienteId: string; numero: string | null; estado: string }[]>(Prisma.sql`
    select s.cliente_id::text as "clienteId", coalesce(nullif(trim(s.referencia), ''), nullif(trim(s.id_siniestro_entidad), '')) as numero,
      s.estado::text as estado
    from siniestros s
    where s.correduria_id = ${correduriaId}::uuid and s.cliente_id = any(${fichas}::uuid[])
      and s.fusionado_en_siniestro_id is null and s.estado::text in ('abierto', 'en_tramitacion')`)
  const devueltos = fichas.length === 0 ? [] : await db.$queryRaw<{ clienteId: string; primaTotal: string | null; ramo: string; compania: string | null }[]>(Prisma.sql`
    select p.cliente_id::text as "clienteId", r.prima_total as "primaTotal", p.tipo::text as ramo,
      coalesce(nullif(trim(cd.nombre_comun), ''), nullif(trim(p.aseguradora), '')) as compania
    from poliza_recibos r
    join polizas p on p.id = r.poliza_id and p.correduria_id = r.correduria_id
    left join companias_dgs cd on cd.codigo_dgs = p.codigo_entidad_dgs
    where r.correduria_id = ${correduriaId}::uuid and p.cliente_id = any(${fichas}::uuid[])
      and r.situacion::text = 'devuelto' and p.merged_into_poliza_id is null
      and ${Prisma.raw(sqlCarteraEnVigor('p'))}`)
  // MOTE (tabla aislada `cliente_mote`; sin relación Prisma con Cliente a propósito).
  const motes = new Map<string, string>()
  for (const tanda of trocear(fichas, 5000)) {
    for (const m of await db.clienteMote.findMany({ where: { clienteId: { in: tanda } }, select: { clienteId: true, mote: true } })) motes.set(m.clienteId, m.mote)
  }
  const agrupar = <T extends { clienteId: string }>(xs: T[]) => {
    const m = new Map<string, T[]>()
    for (const x of xs) m.set(x.clienteId, [...(m.get(x.clienteId) ?? []), x])
    return m
  }
  // Perfil de cada ficha: tipo de persona y si NO tiene ningún teléfono/correo (en la BD: columna y
  // tabla hija; sin descifrar nada). Una consulta caída LANZA: el cron no escribe.
  const perfil = new Map<string, { tipoPersona: 'fisica' | 'juridica' | null; sinTel: boolean; sinEmail: boolean }>()
  for (const tanda of trocear(fichas, 5000)) {
    const filas = await db.$queryRaw<{ id: string; tipoPersona: string | null; sinTel: boolean; sinEmail: boolean }[]>(Prisma.sql`
      select c.id::text as id, c.tipo_persona::text as "tipoPersona",
        (c.telefono is null and not exists (select 1 from cliente_telefonos t where t.cliente_id = c.id)) as "sinTel",
        (c.email is null and not exists (select 1 from cliente_emails m where m.cliente_id = c.id)) as "sinEmail"
      from clientes c
      where c.correduria_id = ${correduriaId}::uuid and c.id = any(${tanda}::uuid[])`)
    for (const f of filas) {
      perfil.set(f.id, {
        tipoPersona: f.tipoPersona === 'fisica' || f.tipoPersona === 'juridica' ? f.tipoPersona : null,
        sinTel: f.sinTel === true, sinEmail: f.sinEmail === true,
      })
    }
  }
  const deFicha = (id: string) => {
    const x = perfil.get(id)
    return { tipoPersona: x?.tipoPersona ?? null, fichaSinTelefono: x?.sinTel === true, fichaSinEmail: x?.sinEmail === true }
  }
  const sinPorCliente = agrupar(siniestros)
  const recPorCliente = agrupar(devueltos)
  const estado = (clienteId: string) => {
    const ss = sinPorCliente.get(clienteId) ?? []
    const rs = recPorCliente.get(clienteId) ?? []
    return {
      alerta: alertaPrioritaria({ siniestroAbierto: ss.length > 0, reciboDevuelto: rs.length > 0 }),
      lineas: lineasEstado({
        siniestros: ss.map((x) => ({ numero: x.numero, estado: x.estado })),
        recibos: rs.map((x) => ({ importe: importeEiac(x.primaTotal), ramo: x.ramo, compania: x.compania })),
      }),
    }
  }

  const deCartera: ContactoGoogle[] = sel.contactos.map((c) => {
    const base = { ...c, url: urlFichaPlataforma(c.clienteId), cumpleanos: nacimiento.get(c.clienteId) ?? null, mote: motes.get(c.clienteId) ?? null, ...deFicha(c.clienteId) }
    if (c.grupo === 'cliente') {
      const ps = porCliente.get(c.clienteId) ?? []
      const vencs = ps.map((p) => p.vencimiento)
      const e = estado(c.clienteId)
      return {
        ...base,
        nota: conLineasEstado(notaCliente({ polizas: ps.map((p) => ({ ramo: p.ramo, compania: p.compania })), proximoVencimiento: proximoVencimiento(vencs, hoy) }), e.lineas),
        aviso: avisoVencimiento(vencs, hoy),
        alerta: e.alerta,
        resumen: resumenPolizas(ps),
      }
    }
    const l = sel.detalleLeads.get(c.clienteId)
    return {
      ...base, nota: l ? notaLead({ ramo: l.ramo, compania: l.aseguradora, vencimiento: l.vencimiento }) : null, aviso: false,
      resumen: l ? resumenPolizas([{ ramo: l.ramo, compania: l.aseguradora }]) : null,
    }
  })
  const deExClientes: ContactoGoogle[] = contactoEx === null ? [] : exClientes.map((x) => {
    const k = contactoEx.get(x.id)
    const e = estado(x.id)
    return {
      clienteId: x.id, nombre: x.nombre, apellidos: x.apellidos, telefono: k?.telefono ?? null, email: k?.email ?? null,
      grupo: 'ex_cliente', url: urlFichaPlataforma(x.id), cumpleanos: nacimiento.get(x.id) ?? null, mote: motes.get(x.id) ?? null,
      nota: notaExCliente({ baja: x.baja, compania: x.compania }, e.lineas), aviso: false, alerta: e.alerta,
      resumen: x.compania?.trim() || null, ...deFicha(x.id),
    }
  })

  // C · Compañías: catálogo de contactos humanos (comercial, siniestros…). Sin cifrar.
  const contactosCompania = await db.companiaContacto.findMany({
    where: { activo: true, compania: { activa: true } },
    select: { id: true, nombre: true, area: true, telefono: true, email: true, compania: { select: { nombreComun: true } } },
    orderBy: [{ companiaCodigoDgs: 'asc' }, { orden: 'asc' }],
  })
  const deCompanias: ContactoGoogle[] = contactosCompania.map((k) => ({
    clienteId: `${PREFIJO_CLAVE_COMPANIA}${k.id}`,
    nombre: nombreCompaniaContacto({ compania: k.compania.nombreComun, area: k.area, nombre: k.nombre }),
    apellidos: null,
    telefono: k.telefono,
    email: k.email,
    grupo: 'compania',
  }))

  // Sin el contacto de los ex-clientes no salen en la lista: entonces la selección NO está completa
  // (si no, se retirarían de Google por «ya no están»).
  return { contactos: [...deCartera, ...deExClientes, ...deCompanias], seleccionCompleta: sel.clientesSinLeer === 0 && contactoEx !== null }
}
