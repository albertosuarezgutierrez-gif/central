/**
 * La selección que se sincroniza con Google Contacts (05/10/2026): la del .vcf del móvil
 * (`contactosMovil`: cartera en vigor + leads de Vencimientos) más lo que solo va a Google:
 *   · B · la NOTA (ficha rápida: pólizas en vigor —ramo + compañía—, próximo vencimiento) y la URL
 *         de la ficha en plataforma (`/correduria/cliente/<id>`). Sin NIF, importes ni nº de póliza.
 *   · C · los contactos de las COMPAÑÍAS (`compania_contactos` activos de compañías activas), 🔵.
 *   · D · el aviso ⏰ si alguna póliza en vigor del cliente vence en ≤30 días.
 *   · E · la fecha de nacimiento de la ficha (`clientes.fecha_nacimiento`, CIFRADA), si consta.
 * Lo que no se puede leer va como `null` («no se sabe»): ese campo de Google no se toca. Si una
 * consulta falla, LANZA (el cron no escribe nada): un hueco aquí no es «no hay».
 *
 * 🛡️ Clientes y pólizas filtrados por `correduriaId`. `compania_contactos` es un catálogo GLOBAL
 * (no lleva correduría): hoy hay una sola correduría; con una segunda habría que acotarlo.
 */
import {
  avisoVencimiento, nombreCompaniaContacto, normalizarNacimiento, notaCliente, notaLead, proximoVencimiento,
  trocear, PREFIJO_CLAVE_COMPANIA, type ContactoGoogle,
} from '@central/module-seguros/google-contactos'
import { sqlCarteraEnVigor } from '@central/module-seguros'

import { prismaAsegura } from './asegura-db'
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

  const deCartera: ContactoGoogle[] = sel.contactos.map((c) => {
    const base = { ...c, url: urlFichaPlataforma(c.clienteId), cumpleanos: nacimiento.get(c.clienteId) ?? null }
    if (c.grupo === 'cliente') {
      const ps = porCliente.get(c.clienteId) ?? []
      const vencs = ps.map((p) => p.vencimiento)
      return {
        ...base,
        nota: notaCliente({ polizas: ps.map((p) => ({ ramo: p.ramo, compania: p.compania })), proximoVencimiento: proximoVencimiento(vencs, hoy) }),
        aviso: avisoVencimiento(vencs, hoy),
      }
    }
    const l = sel.detalleLeads.get(c.clienteId)
    return { ...base, nota: l ? notaLead({ ramo: l.ramo, compania: l.aseguradora, vencimiento: l.vencimiento }) : null, aviso: false }
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

  return { contactos: [...deCartera, ...deCompanias], seleccionCompleta: sel.clientesSinLeer === 0 }
}
