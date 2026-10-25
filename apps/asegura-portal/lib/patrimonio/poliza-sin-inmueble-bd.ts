// PATRIMONIO (25/10/2026) — puerto con BD del aviso «esta póliza protege una vivienda que no tienes en tu patrimonio»
// (sentido póliza → inmueble; las reglas son PURAS en `@central/module-patrimonio` `poliza-sin-inmueble.ts`).
//
// 🚨 Parte de `accesosPatrimonio(identidadId)` (cookie + `portal_vinculo`): sin patrimonio a la vista (módulo no activo,
// vista de corredor) no se ofrece NADA. Las pólizas salen de lo que ESTA identidad ve (`carteraDeIdentidad` a su nivel:
// la ubicación llega `null` donde no la ve, y nunca a un tercero persona física) y de SUS declaradas no eliminadas.
// Los inmuebles y enlaces se leen solo de titulares autorizados. Nada del request decide a quién pertenece algo.
// Las peticiones ya abiertas («mejorar precio», «pedir precio») se leen por el PUENTE de asegura, nunca de la cartera de
// oportunidades; una lectura fallida es `sin_comprobar` (ni se ofrece el botón ni se afirma nada).
import {
  estadoPeticionAviso,
  polizasSinInmueble,
  puede,
  type AvisoPolizaSinInmueble,
  type EnlaceParaAvisoPoliza,
  type EstadoPeticionAviso,
  type PolizaParaAvisoInmueble,
} from '@central/module-patrimonio'

import { carteraDeIdentidad, type CarteraPortal } from '../cartera-lectura'
import { prisma } from '../db'
import { DECLARADA_NO_ELIMINADA } from '../declaradas-eliminadas'
import { peticionesPrecio } from '../mejorar-precio'
import { getIdentidad } from '../session'
import { accesosPatrimonio } from './accesos'
import { peticionesPedirPrecioPorPuente } from './pedir-precio-puente'
import { inmueblesYEnlacesDeIdentidad, visiblesDeCartera, visiblesDeDeclaradas } from './seguros-inmueble-bd'

export type AvisoPintable = AvisoPolizaSinInmueble & {
  compania: string | null
  ramo: string | null
  /** Ficha dueña de la póliza de cartera (para preseleccionar el titular del alta); declaradas: `null`. */
  titularClienteId: string | null
  /** `null` = no se han mirado las peticiones (Inicio solo cuenta). */
  peticion: EstadoPeticionAviso | null
}

type FilaDeclarada = Parameters<typeof visiblesDeDeclaradas>[0][number]

const SELECT_DECLARADAS = {
  id: true, compania: true, ramo: true, fechaVencimiento: true, vigenteDeclarada: true, eliminadaEn: true,
  referenciaCatastral: true, datosRamo: true,
} as const

/**
 * Las pólizas de hogar/comunidad de esta identidad que no cuelgan de ningún inmueble. `[]` = no hay (o no se ofrece:
 * sin patrimonio, sin nivel). Lanza si la BD falla: quien pinta lo convierte en «no hemos podido comprobarlo».
 * `cartera`/`declaradas` evitan releer lo que Inicio ya leyó. `conPeticiones: false` = solo contar (no llama al puente).
 */
export async function avisosPolizasSinInmueble(
  identidadId: string,
  opciones: { conPeticiones: boolean; cartera?: CarteraPortal | null; declaradas?: readonly FilaDeclarada[] | null },
): Promise<AvisoPintable[]> {
  if ((await getIdentidad())?.id !== identidadId) return []
  const acc = await accesosPatrimonio(identidadId)
  if (acc.size === 0) return []
  const hoy = new Date()

  const [rCartera, rDeclaradas] = await Promise.allSettled([
    opciones.cartera !== undefined ? Promise.resolve(opciones.cartera) : carteraDeIdentidad(identidadId),
    opciones.declaradas !== undefined
      ? Promise.resolve(opciones.declaradas)
      : prisma.portalPolizaDeclarada.findMany({ where: { identidadId, ...DECLARADA_NO_ELIMINADA }, select: SELECT_DECLARADAS }),
  ])
  const cartera = rCartera.status === 'fulfilled' ? rCartera.value : null
  const declaradas = rDeclaradas.status === 'fulfilled' ? rDeclaradas.value : null
  if (cartera === null && declaradas === null) throw new Error('ni la cartera ni las declaradas se pudieron leer')

  const algunTitularDaAlta = [...acc.values()].some((n) => puede(n, 'alta_baja'))
  // Ficha dueña de cada póliza de cartera (la primera que la lista: mismo orden que `visiblesDeCartera`).
  const fichaDe = new Map<string, string>()
  if (cartera) {
    for (const t of [...cartera.propias, ...cartera.autorizadas, ...cartera.intervinientes]) {
      for (const p of t.polizas) if (!fichaDe.has(p.id)) fichaDe.set(p.id, t.clienteId)
    }
  }
  const visibles = [...(cartera ? visiblesDeCartera(cartera) : []), ...(declaradas ? visiblesDeDeclaradas(declaradas, hoy) : [])]
  const polizas: PolizaParaAvisoInmueble[] = visibles.map((v) => {
    const ficha = v.tipo === 'cartera' ? fichaDe.get(v.id) : undefined
    const nivel = ficha === undefined ? undefined : acc.get(ficha)
    return {
      tipo: v.tipo, id: v.id, ramo: v.ramo, vigente: v.vigente, ubicacion: v.ubicacion, referenciaCatastral: v.referenciaCatastral,
      puedeAnadir: v.tipo === 'declarada' ? algunTitularDaAlta : nivel !== undefined && puede(nivel, 'alta_baja'),
    }
  })

  const { inmuebles, filas } = await inmueblesYEnlacesDeIdentidad(identidadId)
  const enlaces: EnlaceParaAvisoPoliza[] = filas.flatMap((f): EnlaceParaAvisoPoliza[] => {
    if (f.polizaId !== null && f.polizaDeclaradaId === null) return [{ inmuebleId: f.inmuebleId, tipo: 'cartera', polizaId: f.polizaId, estado: f.estado, archivado: false }]
    if (f.polizaDeclaradaId !== null && f.polizaId === null) return [{ inmuebleId: f.inmuebleId, tipo: 'declarada', polizaId: f.polizaDeclaradaId, estado: f.estado, archivado: false }]
    return []
  })

  const avisos = polizasSinInmueble({
    polizas,
    inmuebles: inmuebles.map((i) => ({
      id: i.id, referenciaCatastral: i.referenciaCatastral, cp: i.cp, via: i.via, numero: i.numero,
      puedeEnlazar: puede(acc.get(i.titular.clienteId), 'enlazar_seguro'),
    })),
    enlaces,
  })

  const datos = new Map(visibles.map((v) => [`${v.tipo}:${v.id}`, v]))
  const base = avisos.map((a) => ({ ...a, compania: datos.get(`${a.tipo}:${a.id}`)?.compania ?? null, ramo: datos.get(`${a.tipo}:${a.id}`)?.ramo ?? null, titularClienteId: a.tipo === 'cartera' ? (fichaDe.get(a.id) ?? null) : null }))
  if (!opciones.conPeticiones || base.length === 0) return base.map((a) => ({ ...a, peticion: null }))

  // Peticiones ya abiertas, por el puente. Una fuente caída = `null` = sin comprobar.
  const [mejorar, pedir] = await Promise.all([peticionesPrecio(identidadId), peticionesPedirPrecioPorPuente(identidadId)])
  return base.map((a) => ({
    ...a,
    peticion: estadoPeticionAviso({
      tipo: a.tipo, polizaId: a.id, inmuebleId: a.propuesta.accion === 'enlazar' ? a.propuesta.inmuebleId : null,
      deMejorarPrecio: mejorar, dePedirPrecio: pedir,
    }),
  }))
}
