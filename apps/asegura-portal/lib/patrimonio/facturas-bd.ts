// PATRIMONIO (22/10/2026, paso 7) — adaptador con BD de las facturas leídas con IA.
//
// 🚨 Como `gastos-bd.ts`: parte de `accesosPatrimonio(identidadId)` (cookie + `portal_vinculo`); `titular_id` se resuelve
// aquí desde la ficha ya autorizada, jamás del cliente; el inmueble se busca DENTRO del titular y toda escritura sobre un
// gasto lleva `titularId` + `origen: 'factura'` + `estado: 'propuesto'` en el `where` (id ajeno = 0 filas = 404).
// Solo usa columnas con GRANT para `prisma_asegura_portal` (sin SQL nuevo). El tope diario cuenta FILAS de esta identidad
// en el día de Madrid, y contar + insertar ocurren dentro de UNA transacción con un bloqueo asesor por identidad
// (`facturas-tx.ts`, con el orden de sentencias cubierto por test). Confirmar con otro inmueble traslada el documento
// (copia + sello del viejo + repunte del gasto) en la misma transacción.
import type { Prisma } from '@prisma/client'

import { prisma } from '../db'
import { getIdentidad } from '../session'
import { accesosPatrimonio } from './accesos'
import { CARPETA_FACTURAS } from './carpetas'
import { fechaMadrid, inicioDiaMadrid } from './dia-madrid'
import type { TxMin } from './documentos-tx'
import { extraerFactura } from './extraer-factura'
import { ConfirmacionAdelantada, confirmarGasto, reservarConTope } from './facturas-tx'
import type { AccesosMapa } from './gastos-api'
import { titularDe } from './gastos-bd'
import { MAX_FACTURAS_DIA, type PuertosFacturas } from './facturas-api'
import { PROPUESTA_VACIA } from './factura-propuesta'

const aFecha = (s: string) => new Date(`${s}T00:00:00.000Z`)

/** `ahora` se inyecta para poder probar el límite del día; en producción es el reloj. */
export function puertosFacturas(identidadId: string, ahora: () => Date = () => new Date()): PuertosFacturas {
  let cache: AccesosMapa | null = null
  const accesos = async () => (cache ??= await accesosPatrimonio(identidadId))
  // Defensa en profundidad: la sesión tiene que ser la de `identidadId`.
  const sesionOk = async () => (await getIdentidad())?.id === identidadId

  async function resolver(clienteId: string, gastoId: string, data: Prisma.PortalPatrimonioGastoUncheckedUpdateManyInput) {
    if (!(await sesionOk())) return 'no_encontrado' as const
    const t = await titularDe(clienteId, identidadId)
    if (!t) return 'no_encontrado' as const
    const donde = { id: gastoId, titularId: t.id, origen: 'factura' }
    const r = await prisma.portalPatrimonioGasto.updateMany({ where: { ...donde, estado: 'propuesto' }, data })
    if (r.count === 1) return 'ok' as const
    const existe = await prisma.portalPatrimonioGasto.findFirst({ where: donde, select: { id: true } })
    return existe ? ('ya_resuelto' as const) : ('no_encontrado' as const)
  }

  return {
    accesos,

    async inmuebleDelTitular(clienteId, inmuebleId) {
      if (!(await sesionOk())) return false
      const t = await titularDe(clienteId, identidadId)
      if (!t) return false
      const i = await prisma.portalPatrimonioInmueble.findFirst({ where: { id: inmuebleId, titularId: t.id, archivadoEn: null }, select: { id: true } })
      return i !== null
    },

    async reservarPropuesta({ clienteId, inmuebleId, fichero }) {
      if (!(await sesionOk())) return { ok: false, motivo: 'no_encontrado' }
      const t = await titularDe(clienteId, identidadId)
      if (!t) return { ok: false, motivo: 'no_encontrado' }
      const ahoraD = ahora()
      // Un solo paso: sin el bloqueo, N subidas simultáneas leen el mismo recuento (< tope), todas pasan y todas gastan IA.
      return prisma.$transaction(async (tx) =>
        reservarConTope(tx as unknown as TxMin, {
          identidadId,
          titularId: t.id,
          inmuebleId,
          carpetaFacturas: CARPETA_FACTURAS,
          fichero,
          desde: inicioDiaMadrid(ahoraD),
          fechaMarcador: fechaMadrid(ahoraD),
          max: MAX_FACTURAS_DIA,
          propuestaInicial: { fuente: 'none', motivos: ['Leyendo la factura…'], leido: PROPUESTA_VACIA } as unknown as Prisma.InputJsonValue,
        }),
      )
    },

    leer: (f) => extraerFactura(f.contenido, f.mime, f.nombre),

    async completarPropuesta({ clienteId, gastoId, lectura }) {
      if (!(await sesionOk())) return
      const t = await titularDe(clienteId, identidadId)
      if (!t) return
      const p = lectura.propuesta
      // Solo la fila reservada por ESTA identidad, de ESTE titular, aún `propuesto`: un id ajeno = 0 filas.
      await prisma.portalPatrimonioGasto.updateMany({
        where: { id: gastoId, titularId: t.id, origen: 'factura', estado: 'propuesto', creadoPorIdentidadId: identidadId },
        data: {
          // La fecha del marcador se conserva si no se leyó: la verdad leída está en `propuesta.leido.fecha` (null = sin leer).
          ...(p.fecha ? { fecha: aFecha(p.fecha) } : {}),
          categoria: p.categoria,
          concepto: p.concepto ?? p.proveedor,
          baseCent: p.baseCent === null ? null : BigInt(p.baseCent),
          totalCent: p.totalCent === null ? null : BigInt(p.totalCent),
          propuesta: { fuente: lectura.fuente, motivos: lectura.motivos, leido: p } as unknown as Prisma.InputJsonValue,
        },
      })
    },

    async confirmar({ clienteId, gastoId, datos }) {
      if (!(await sesionOk())) return 'no_encontrado'
      const t = await titularDe(clienteId, identidadId)
      if (!t) return 'no_encontrado'
      try {
        return await prisma.$transaction(async (tx) => confirmarGasto(tx as unknown as TxMin, { titularId: t.id, identidadId, gastoId, datos, ahora: ahora() }))
      } catch (e) {
        if (e instanceof ConfirmacionAdelantada) return 'ya_resuelto'
        throw e
      }
    },

    descartar: ({ clienteId, gastoId }) => resolver(clienteId, gastoId, { estado: 'descartado' }),
  }
}
