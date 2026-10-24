// PATRIMONIO (22/10/2026, paso 6) — adaptador con BD del cron `patrimonio-gastos` (puertos de `generar-gastos.ts`).
//
// ⚠️ EXENTO a propósito de `accesosPatrimonio` y de `lib/session` (ver los EXENTOS de
// `test/regression-portal-patrimonio-aislamiento.test.ts` y `test/regression-portal-aislamiento.test.ts`): lo ejecuta
// el cron autenticado por `CRON_SECRET`, no una persona; no hay identidad, hay muchos titulares. Cada fila que escribe
// lleva el `titularId` de la propia plantilla / de la comunidad de la derrama (nunca de una request), sin
// `creado_por_identidad_id` (NULL = lo generó el sistema). Escribe con el rol del portal: tiene SELECT de plantilla,
// derrama, comunidad y titular, e INSERT de `portal_patrimonio_gasto` (ver el SQL del paso 3); no necesita nada más.
import { Prisma } from '@prisma/client'
import type { Derrama, PlantillaGasto } from '@central/module-patrimonio'

import { prisma } from '../db'
import type { GastoGenerado, PuertosGenerador } from './generar-gastos'

const dia = (d: Date) => d.toISOString().slice(0, 10)

export function puertosGenerador(): PuertosGenerador {
  return {
    async plantillas() {
      const filas = await prisma.portalPatrimonioPlantillaGasto.findMany({
        where: { activo: true, titular: { archivadoEn: null }, OR: [{ inmuebleId: null }, { inmueble: { archivadoEn: null } }] },
      })
      return filas.map(
        (f): PlantillaGasto => ({
          id: f.id,
          titularId: f.titularId,
          inmuebleId: f.inmuebleId,
          concepto: f.concepto,
          categoria: f.categoria as PlantillaGasto['categoria'],
          periodicidad: f.periodicidad as PlantillaGasto['periodicidad'],
          diaMes: f.diaMes,
          inicio: dia(f.inicio),
          fin: f.fin ? dia(f.fin) : null,
          // null = variable; nunca 0.
          importe: f.importeCent === null ? null : Number(f.importeCent),
          activo: f.activo,
        }),
      )
    },
    async derramas() {
      const filas = await prisma.portalPatrimonioDerrama.findMany({
        where: { archivadoEn: null, comunidad: { archivadoEn: null, titular: { archivadoEn: null } } },
        include: { comunidad: { select: { titularId: true } } },
      })
      return filas.map(
        (f): Derrama => ({
          id: f.id,
          titularId: f.comunidad.titularId,
          inmuebleId: f.inmuebleId,
          concepto: f.concepto,
          total: Number(f.totalCent),
          cuotas: f.cuotas,
          primera: dia(f.primera),
        }),
      )
    },
    async inmueblesArchivados(ids) {
      if (ids.length === 0) return new Set<string>()
      const filas = await prisma.portalPatrimonioInmueble.findMany({
        where: { id: { in: [...ids] }, archivadoEn: { not: null } },
        select: { id: true },
      })
      return new Set(filas.map((f) => f.id))
    },
    async clavesDe(titularId) {
      const filas = await prisma.portalPatrimonioGasto.findMany({ where: { titularId, clave: { not: null } }, select: { clave: true } })
      return new Set(filas.map((f) => f.clave as string))
    },
    async insertar(g: GastoGenerado) {
      try {
        await prisma.portalPatrimonioGasto.create({
          data: {
            titularId: g.titularId,
            inmuebleId: g.inmuebleId,
            fecha: new Date(`${g.fecha}T00:00:00.000Z`),
            categoria: g.categoria,
            concepto: g.concepto,
            baseCent: null,
            totalCent: g.importe === null ? null : BigInt(g.importe),
            estado: 'propuesto',
            origen: g.origen,
            clave: g.clave,
          },
          select: { id: true },
        })
        return 'creado'
      } catch (e) {
        // Índice único (titular_id, clave): otra pasada (o una concurrente) ya lo creó.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return 'duplicado'
        throw e
      }
    },
  }
}
