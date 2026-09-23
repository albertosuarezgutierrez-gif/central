/**
 * Contactos para el móvil (23/09/2026): la cartera EN VIGOR y los leads que se
 * están trabajando en Vencimientos, con su teléfono y correo ya descifrados,
 * para que plataforma arme el .vcf (`libroVcard` de `@central/module-seguros`).
 *
 * Solo lo que hace falta para reconocer a quien llama: nombre, teléfono,
 * correo y si es cliente o lead. Ni DNI, ni dirección, ni pólizas.
 */
import { sqlCarteraEnVigor, type ContactoMovil } from '@central/module-seguros'

import { prismaAsegura } from './asegura-db'
import { contactosDe } from './cartera-busqueda'
import { Prisma } from './generated/asegura-client'
import { leadsCompetencia } from './leads-competencia'

export type ContactosMovil = {
  contactos: ContactoMovil[]
  clientes: number
  leads: number
  /** Clientes cuyo contacto no se pudo leer (consulta caída): NO van y se cuenta. */
  clientesSinLeer: number
}

export async function contactosMovil(correduriaId: string): Promise<ContactosMovil> {
  const clientes = await prismaAsegura().$queryRaw<{ id: string; nombre: string | null; apellidos: string | null }[]>(Prisma.sql`
    select distinct c.id::text as id, c.nombre, c.apellidos
    from clientes c
    join polizas p on p.cliente_id = c.id and p.correduria_id = c.correduria_id
    where c.correduria_id = ${correduriaId}::uuid and c.activo and c.merged_into_cliente_id is null
      and p.merged_into_poliza_id is null
      and ${Prisma.raw(sqlCarteraEnVigor('p'))}`)
  const contactos = await contactosDe(correduriaId, clientes.map(c => c.id))
  const deClientes: ContactoMovil[] = contactos === null ? [] : clientes.map(c => {
    const k = contactos.get(c.id)
    return { clienteId: c.id, nombre: c.nombre, apellidos: c.apellidos, telefono: k?.telefono ?? null, email: k?.email ?? null, grupo: 'cliente' }
  })

  // Los mismos leads que la pestaña Leads de Vencimientos (ventana de 90 días).
  const { leads } = await leadsCompetencia(correduriaId, 90)
  const deLeads: ContactoMovil[] = leads.map(l => ({
    // El lead trae el nombre ya compuesto: va entero como «nombre».
    clienteId: l.clienteId, nombre: l.cliente, apellidos: null, telefono: l.telefono, email: l.email, grupo: 'lead',
  }))
  return {
    contactos: [...deClientes, ...deLeads],
    clientes: deClientes.length,
    leads: deLeads.length,
    clientesSinLeer: contactos === null ? clientes.length : 0,
  }
}
