// Pólizas DECLARADAS por el cliente en el portal (`seguros.portal_poliza_declarada`)
// que están cerca de su vencimiento: gestionadas por OTRA compañía, no por
// Grupo ASegura. Es la lista de venta — Alberto llama ANTES de que renueven
// solas con la compañía de siempre.
//
// ─── Por qué es una llamada de Alberto y no un aviso automático al cliente ──
// La cartera de comparables por ramo/compañía es minúscula (110 pólizas vivas
// repartidas en 4 ramos): un precio orientativo automático con esa muestra
// sería un número plausible y falso (regla del CLAUDE.md raíz sobre valores
// leídos mal). Con muestra insuficiente NO se compara precio: se avisa a
// Alberto para que venda a mano, con el conocimiento del mercado que él tiene
// y la muestra no.
//
// ─── Por qué solo cuenta lo que se puede VINCULAR a una ficha ───────────────
// Una declarada nace de una `PortalIdentidad`, no de un `Cliente`: el enlace
// entre las dos vive en `portal_vinculo` (por email, y solo si no es
// ambiguo — ver `apps/asegura-portal/CLAUDE.md`). Sin vínculo no hay nombre
// ni teléfono a quien llamar, así que esa fila se CUENTA aparte
// (`sinVincular`) en vez de desaparecer en silencio.

import { diasHastaVencimiento } from '@central/module-seguros'
import { decryptField } from '@central/module-seguros-pii'
import { aseguraConfigurada, prismaAsegura } from './asegura-db'

export const DIAS_AVISO_DECLARADAS = 60

export type DeclaradaPorVencer = {
  id: string
  clienteId: string
  cliente: string
  /** Para llamar sin salir de la pantalla. `null` = no consta o no se descifra. */
  telefono: string | null
  telefonoIlegible: boolean
  email: string | null
  emailIlegible: boolean
  compania: string | null
  ramo: string | null
  numeroPoliza: string | null
  fechaVencimiento: string
  dias: number
}

export type DeclaradasPorVencer = {
  filas: DeclaradaPorVencer[]
  /** Declaradas dentro de la ventana cuya identidad no está vinculada a
   *  ninguna ficha de esta correduría: no hay a quién llamar todavía. */
  sinVincular: number
}

function hoyUtc(): Date {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/** Descifra sin convertir un fallo en «no tiene dato». */
function descifrar(v: string | null | undefined): string | null {
  if (typeof v !== 'string' || v.trim() === '') return null
  if (!v.startsWith('v1:')) return v
  try {
    return decryptField(v)
  } catch {
    return null
  }
}

function ilegible(v: string | null | undefined): boolean {
  return typeof v === 'string' && v.startsWith('v1:') && descifrar(v) === null
}

export async function declaradasPorVencer(
  correduriaId: string,
  dias: number = DIAS_AVISO_DECLARADAS,
  hoyRef: Date = hoyUtc(),
): Promise<DeclaradasPorVencer> {
  const vacia: DeclaradasPorVencer = { filas: [], sinVincular: 0 }
  if (!aseguraConfigurada()) return vacia
  const db = prismaAsegura()

  const hasta = new Date(hoyRef)
  hasta.setUTCDate(hasta.getUTCDate() + dias)

  const declaradas = await db.portalPolizaDeclarada.findMany({
    where: { fechaVencimiento: { gte: hoyRef, lte: hasta } },
    select: {
      id: true, identidadId: true, compania: true, numeroPoliza: true, ramo: true,
      fechaVencimiento: true,
    },
    orderBy: { fechaVencimiento: 'asc' },
  })
  if (declaradas.length === 0) return vacia

  // El vínculo identidad→ficha es de ESTA correduría; una identidad puede
  // tener más de un vínculo (empresa + su administrador) — se toma el más
  // antiguo, mismo desempate que usa el portal para LEER (nunca para escribir).
  const identidadIds = [...new Set(declaradas.map((d) => d.identidadId))]
  const vinculos = await db.portalVinculo.findMany({
    where: { identidadId: { in: identidadIds }, correduriaId },
    select: { identidadId: true, clienteId: true, creadoEn: true },
    orderBy: { creadoEn: 'asc' },
  })
  const clienteIdPorIdentidad = new Map<string, string>()
  for (const v of vinculos) {
    if (!clienteIdPorIdentidad.has(v.identidadId)) clienteIdPorIdentidad.set(v.identidadId, v.clienteId)
  }

  const clienteIds = [...new Set(clienteIdPorIdentidad.values())]
  const clientes = clienteIds.length
    ? await db.cliente.findMany({
        where: { id: { in: clienteIds } },
        select: { id: true, nombre: true, apellidos: true, telefono: true, email: true },
      })
    : []
  const clientePorId = new Map(clientes.map((c) => [c.id, c]))

  const filas: DeclaradaPorVencer[] = []
  let sinVincular = 0
  for (const d of declaradas) {
    const clienteId = clienteIdPorIdentidad.get(d.identidadId)
    const c = clienteId ? clientePorId.get(clienteId) : undefined
    if (!c || d.fechaVencimiento === null) {
      sinVincular++
      continue
    }
    filas.push({
      id: d.id,
      clienteId: c.id,
      cliente: `${c.nombre} ${c.apellidos}`.trim(),
      telefono: descifrar(c.telefono),
      telefonoIlegible: ilegible(c.telefono),
      email: descifrar(c.email),
      emailIlegible: ilegible(c.email),
      compania: d.compania,
      ramo: d.ramo,
      numeroPoliza: d.numeroPoliza,
      fechaVencimiento: d.fechaVencimiento.toISOString().slice(0, 10),
      dias: diasHastaVencimiento(d.fechaVencimiento, hoyRef),
    })
  }

  return { filas, sinVincular }
}
