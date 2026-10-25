// PATRIMONIO (25/10/2026) — «¿Esto lo cubre tu seguro?» con BD. Reglas puras: `cubre-seguro.ts`.
//
// 🚨 Parte de `accesosPatrimonio(identidadId)` (cookie + `portal_vinculo`): los gastos salen SOLO de los titulares
// autorizados y vivos; los enlaces, SOLO de los inmuebles de esos titulares; las pólizas, de lo que ESTA identidad ve
// (`carteraDeIdentidad` a su nivel + sus declaradas). Descartar sella `portal_aviso_leido` de la identidad de la sesión,
// tras comprobar que el gasto está entre los visibles: un id ajeno es la misma 404 que uno inexistente.
// `null` = no se pudo leer (nunca «no hay avisos»); `undefined` = esta identidad no tiene patrimonio a la vista.
import { esFecha } from '@central/module-patrimonio'

import { carteraDeIdentidad, polizasParaParte } from '../cartera-lectura'
import { prisma } from '../db'
import { DECLARADA_NO_ELIMINADA } from '../declaradas-eliminadas'
import { getIdentidad } from '../session'
import { accesosPatrimonio } from './accesos'
import { claveDescarte, clasificarReparacion, coberturaHogar, desdeVentana, esClaveDescarte, type AvisoCubre } from './cubre-seguro'
import { fechaMadrid } from './dia-madrid'
import type { FilaEnlace, PolizaVisible } from './seguros-inmueble-api'
import { enlacesVivosDeInmuebles, visiblesDeCartera, visiblesDeDeclaradas } from './seguros-inmueble-bd'

const dia = (d: Date) => d.toISOString().slice(0, 10)

export async function avisosCubreSeguro(identidadId: string): Promise<AvisoCubre[] | null | undefined> {
  if ((await getIdentidad())?.id !== identidadId) return undefined
  const acc = await accesosPatrimonio(identidadId)
  if (acc.size === 0) return undefined
  const hoy = fechaMadrid(new Date())
  if (!esFecha(hoy)) return null

  const titulares = await prisma.portalPatrimonioTitular.findMany({
    where: { clienteId: { in: [...acc.keys()] }, archivadoEn: null },
    select: { id: true },
  })
  if (titulares.length === 0) return []
  const gastos = await prisma.portalPatrimonioGasto.findMany({
    where: {
      titularId: { in: titulares.map((t) => t.id) },
      estado: 'confirmado',
      inmuebleId: { not: null },
      fecha: { gte: new Date(`${desdeVentana(hoy)}T00:00:00Z`), lte: new Date(`${hoy}T00:00:00Z`) },
    },
    orderBy: { fecha: 'desc' },
    take: 2000,
    select: { id: true, inmuebleId: true, fecha: true, categoria: true, concepto: true, totalCent: true, propuesta: true },
  })
  // Solo las que parecen una reparación: lo demás ni toca la cartera.
  const candidatos = gastos.flatMap((g) => {
    const prop = typeof g.propuesta === 'object' && g.propuesta !== null && !Array.isArray(g.propuesta) ? (g.propuesta as Record<string, unknown>) : {}
    const proveedor = typeof prop.proveedor === 'string' ? prop.proveedor : null
    const tipo = clasificarReparacion({ categoria: g.categoria, concepto: g.concepto, proveedor })
    return tipo !== null && g.inmuebleId !== null && g.concepto !== null ? [{ g, tipo, inmuebleId: g.inmuebleId, concepto: g.concepto }] : []
  })
  if (candidatos.length === 0) return []

  const idsInmueble = [...new Set(candidatos.map((c) => c.inmuebleId))]
  const [inmuebles, enlaces, leidos, cartera, declaradas] = await Promise.all([
    prisma.portalPatrimonioInmueble.findMany({
      where: { id: { in: idsInmueble }, archivadoEn: null, titularId: { in: titulares.map((t) => t.id) } },
      select: { id: true, alias: true },
    }),
    enlacesVivosDeInmuebles(titulares.map((t) => t.id), idsInmueble),
    prisma.portalAvisoLeido.findMany({ where: { identidadId, clave: { startsWith: claveDescarte('') } }, select: { clave: true } }),
    carteraDeIdentidad(identidadId).then((v) => ({ ok: true as const, v }), (e: unknown) => ({ ok: false as const, e })),
    prisma.portalPolizaDeclarada
      .findMany({
        where: { identidadId, ...DECLARADA_NO_ELIMINADA },
        select: { id: true, compania: true, ramo: true, fechaVencimiento: true, vigenteDeclarada: true, eliminadaEn: true, referenciaCatastral: true, datosRamo: true },
      })
      .then((v) => ({ ok: true as const, v }), (e: unknown) => ({ ok: false as const, e })),
  ])
  if (!cartera.ok) console.error('[cubre-seguro] cartera ilegible:', cartera.e instanceof Error ? cartera.e.message : cartera.e)
  if (!declaradas.ok) console.error('[cubre-seguro] declaradas ilegibles:', declaradas.e instanceof Error ? declaradas.e.message : declaradas.e)
  const visibles: PolizaVisible[] | null = cartera.ok && declaradas.ok ? [...visiblesDeCartera(cartera.v), ...visiblesDeDeclaradas(declaradas.v, new Date())] : null
  const puedeParte = cartera.ok ? polizasParaParte(cartera.v) : new Set<string>()

  const alias = new Map(inmuebles.map((i) => [i.id, i.alias]))
  const descartados = new Set(leidos.map((l) => l.clave))
  const enlacesDe = new Map<string, FilaEnlace[]>()
  for (const e of enlaces) enlacesDe.set(e.inmuebleId, [...(enlacesDe.get(e.inmuebleId) ?? []), e])
  const coberturaDe = new Map<string, ReturnType<typeof coberturaHogar>>()

  return candidatos.flatMap((c) => {
    const nombre = alias.get(c.inmuebleId)
    if (nombre === undefined) return [] // inmueble archivado o ajeno
    let cobertura = coberturaDe.get(c.inmuebleId)
    if (!cobertura) {
      cobertura = coberturaHogar(enlacesDe.get(c.inmuebleId) ?? [], visibles, puedeParte)
      coberturaDe.set(c.inmuebleId, cobertura)
    }
    return [{
      gastoId: c.g.id, inmuebleId: c.inmuebleId, inmuebleAlias: nombre, concepto: c.concepto, fecha: dia(c.g.fecha),
      totalCent: c.g.totalCent === null ? null : Number(c.g.totalCent), tipo: c.tipo, cobertura,
      descartado: descartados.has(claveDescarte(c.g.id)),
    }]
  })
}

/** Sella «no me interesa este aviso» para la sesión. `no_encontrado` = el gasto no está entre los avisos visibles (404). */
export async function descartarAvisoCubre(gastoId: string): Promise<'ok' | 'sin_sesion' | 'no_encontrado'> {
  const identidad = await getIdentidad()
  if (!identidad) return 'sin_sesion'
  const clave = claveDescarte(gastoId)
  if (!esClaveDescarte(clave)) return 'no_encontrado'
  const avisos = await avisosCubreSeguro(identidad.id)
  if (!avisos || !avisos.some((a) => a.gastoId === gastoId)) return 'no_encontrado'
  await prisma.portalAvisoLeido.createMany({ data: [{ identidadId: identidad.id, clave }], skipDuplicates: true })
  return 'ok'
}
