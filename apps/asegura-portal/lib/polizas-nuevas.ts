/**
 * Las pólizas NUEVAS de esta identidad, para la campana (26/09/2026): «tienes una póliza nueva» y,
 * si sustituye a otra, de qué compañía era la anterior. Lo que es «nueva» lo decide la regla pura
 * `polizasNuevasParaAviso` — la MISMA que usa el correo de la intranet en `apps/asegura`.
 *
 * Solo pólizas de fichas VINCULADAS a esta identidad como tomador (no las de quien le autoriza a
 * ver las suyas: una póliza nueva de otro no es un aviso suyo). La identidad sale de la sesión.
 */
import {
  CORTE_AVISO_POLIZA_NUEVA,
  DIAS_AVISO_POLIZA_NUEVA,
  polizasNuevasParaAviso,
  type PolizaNuevaParaAviso,
} from '@central/module-seguros-portal'
import { WHERE_CARTERA_EN_VIGOR } from '@central/module-seguros'

import { prisma } from './db'
import { getIdentidad } from './session'

const MS_DIA = 86_400_000

export async function polizasNuevasDeIdentidad(identidadId: string, hoy = new Date()): Promise<PolizaNuevaParaAviso[]> {
  const vinculos = await prisma.portalVinculo.findMany({ where: { identidadId }, select: { clienteId: true } })
  if (vinculos.length === 0) return []
  const desde = new Date(Math.max(Date.parse(`${CORTE_AVISO_POLIZA_NUEVA}T00:00:00Z`), hoy.getTime() - DIAS_AVISO_POLIZA_NUEVA * MS_DIA))
  const polizas = await prisma.poliza.findMany({
    where: {
      AND: [
        { clienteId: { in: vinculos.map((v) => v.clienteId) } },
        { mergedIntoPolizaId: null },
        WHERE_CARTERA_EN_VIGOR,
        { createdAt: { gte: desde } },
      ],
    },
    select: { numeroPoliza: true, codigoEntidadDgs: true, aseguradora: true, tipo: true, fechaInicio: true, createdAt: true, polizaOrigenId: true },
  })
  if (polizas.length === 0) return []

  const origenIds = polizas.map((p) => p.polizaOrigenId).filter((x): x is string => x !== null)
  const origenes = origenIds.length
    ? await prisma.poliza.findMany({ where: { id: { in: origenIds } }, select: { id: true, aseguradora: true, codigoEntidadDgs: true } })
    : []
  const codigos = [...new Set([...polizas, ...origenes].map((p) => p.codigoEntidadDgs).filter((x): x is string => !!x))]
  const nombres = new Map(
    (codigos.length ? await prisma.companiaDgs.findMany({ where: { codigoDgs: { in: codigos } }, select: { codigoDgs: true, nombreComun: true } }) : [])
      .map((c) => [c.codigoDgs, c.nombreComun]),
  )
  const nombre = (p: { aseguradora: string; codigoEntidadDgs: string | null }) =>
    (p.codigoEntidadDgs ? nombres.get(p.codigoEntidadDgs) : undefined) ?? p.aseguradora
  const origenPorId = new Map(origenes.map((o) => [o.id, nombre(o)]))

  return polizasNuevasParaAviso(
    polizas.map((p) => ({
      numeroPoliza: p.numeroPoliza,
      codigoEntidadDgs: p.codigoEntidadDgs,
      compania: nombre(p),
      tipo: String(p.tipo),
      fechaEfecto: p.fechaInicio ? p.fechaInicio.toISOString().slice(0, 10) : null,
      creadaEn: p.createdAt,
      sustituye: p.polizaOrigenId !== null,
      sustituyeA: p.polizaOrigenId ? (origenPorId.get(p.polizaOrigenId) ?? null) : null,
    })),
    hoy,
  )
}

/** La misma lectura para la sesión actual (sin sesión, nada). */
export async function polizasNuevasDeSesion(): Promise<PolizaNuevaParaAviso[]> {
  const identidad = await getIdentidad()
  return identidad ? polizasNuevasDeIdentidad(identidad.id) : []
}
