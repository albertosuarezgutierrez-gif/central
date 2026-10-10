// Lectura de las conversaciones de WhatsApp para el puerto de operador (plataforma las pinta).
// Descifra el texto y el teléfono AQUÍ (el teléfono sí cruza el puerto: es para llamar).
// Tres estados en el texto: string = el mensaje · null + `purgado` = se borró (retención/personal) ·
// null + `ilegible` = está cifrado y no abre (clave): nunca «vacío» como si no hubiera mensaje.

import { decryptField } from '@central/module-seguros-pii'
import { Prisma } from '../generated/asegura-client'
import { prismaAsegura } from '../asegura-db'

export type MensajeVista = {
  id: string
  direccion: 'entrante' | 'saliente'
  tipo: string | null
  fecha: string | null
  texto: string | null
  purgado: boolean
  ilegible: boolean
}

export type ConversacionVista = {
  id: string
  estado: string
  clienteId: string | null
  clientesCandidatos: number | null
  telefono: string | null
  perfilNombre: string | null
  ultimoMensajeAt: string | null
  analizadaAt: string | null
  analisis: unknown
  analisisError: string | null
  optOut: boolean
  mensajes: MensajeVista[]
  /** Hay más mensajes que los devueltos (se piden con `antesDe`). */
  hayMas: boolean
}

function abrir(v: string | null): { texto: string | null; ilegible: boolean } {
  if (v === null || v === '') return { texto: null, ilegible: false }
  if (!v.startsWith('v1:')) return { texto: v, ilegible: false }
  try {
    return { texto: decryptField(v), ilegible: false }
  } catch {
    return { texto: null, ilegible: true }
  }
}

type FilaConv = {
  id: string
  estado: string
  cliente_id: string | null
  clientes_candidatos: number | null
  telefono: string | null
  perfil: string | null
  ultimo: Date | null
  analizada_at: Date | null
  analisis: unknown
  analisis_error: string | null
  opt_out: boolean
}

async function conMensajes(filas: FilaConv[], porConversacion: number): Promise<ConversacionVista[]> {
  const db = prismaAsegura()
  const out: ConversacionVista[] = []
  for (const c of filas) {
    const ms = await db.$queryRaw<{ id: string; direccion: 'entrante' | 'saliente'; tipo: string | null; enviado_at: Date | null; contenido: string; purgado: boolean }[]>(Prisma.sql`
      select id::text as id, direccion, tipo, enviado_at, contenido, texto_purgado_at is not null as purgado
        from mensajes where conversacion_id = ${c.id}::uuid and direccion is not null
       order by enviado_at desc nulls last limit ${porConversacion + 1}`)
    const hayMas = ms.length > porConversacion
    const mensajes = ms.slice(0, porConversacion).reverse().map((m) => {
      const t = m.purgado ? { texto: null, ilegible: false } : abrir(m.contenido)
      return { id: m.id, direccion: m.direccion, tipo: m.tipo, fecha: m.enviado_at?.toISOString() ?? null, texto: t.texto, purgado: m.purgado, ilegible: t.ilegible }
    })
    out.push({
      id: c.id,
      estado: c.estado,
      clienteId: c.cliente_id,
      clientesCandidatos: c.clientes_candidatos,
      telefono: abrir(c.telefono).texto,
      perfilNombre: abrir(c.perfil).texto,
      ultimoMensajeAt: c.ultimo?.toISOString() ?? null,
      analizadaAt: c.analizada_at?.toISOString() ?? null,
      analisis: c.analisis,
      analisisError: c.analisis_error,
      optOut: c.opt_out,
      mensajes,
      hayMas,
    })
  }
  return out
}

const COLUMNAS = Prisma.sql`id::text as id, estado, cliente_id::text as cliente_id, clientes_candidatos, wa_telefono_cifrado as telefono,
  wa_perfil_nombre_cifrado as perfil, ultimo_mensaje_at as ultimo, analizada_at, analisis, analisis_error, wa_opt_out_at is not null as opt_out`

/** Las conversaciones de una ficha (y de las fichas fusionadas en ella). */
export async function conversacionesDeCliente(correduriaId: string, clienteId: string): Promise<ConversacionVista[]> {
  const filas = await prismaAsegura().$queryRaw<FilaConv[]>(Prisma.sql`
    select ${COLUMNAS} from conversaciones
     where correduria_id = ${correduriaId}::uuid and wa_telefono_hash is not null
       and cliente_id in (
         select id from clientes where correduria_id = ${correduriaId}::uuid
            and (id = ${clienteId}::uuid or merged_into_cliente_id = ${clienteId}::uuid))
     order by ultimo_mensaje_at desc nulls last limit 20`)
  return conMensajes(filas, 50)
}

/** La bandeja: conversaciones sin ficha que aún nadie (ni la IA) ha clasificado. */
export async function bandejaPendientes(correduriaId: string, limite = 50): Promise<ConversacionVista[]> {
  const filas = await prismaAsegura().$queryRaw<FilaConv[]>(Prisma.sql`
    select ${COLUMNAS} from conversaciones
     where correduria_id = ${correduriaId}::uuid and wa_telefono_hash is not null and estado = 'pendiente_clasificar'
     order by ultimo_mensaje_at desc nulls last limit ${limite}`)
  return conMensajes(filas, 10)
}
