// Competitividad de precio por compañía (07/11/2026). Lo sirve `GET /api/operador/companias/competitividad?anio=YYYY`
// y plataforma lo pinta en el cuadro de mando por compañía y en «Preparar reunión».
//
// Aquí solo se LEE (tarificaciones guardadas + sus precios, de TODOS los canales) y se llama a
// `observacionesDeTarificaciones` (adaptador) y `calcularCompetitividad` (puro, `@central/module-seguros`).
// Cambiar la fuente de precios = cambiar la lectura de este fichero; el cálculo no se toca.
//
// 🚨 Tres estados: `sin_configurar` · `error` con causa · `ok`. Con `truncado` las cifras son un suelo.
// 🔒 Sin un solo dato personal: solo compañía, ramo, nivel, prima y fecha. Todo SQL por `correduria_id`.

import { calcularCompetitividad, type FilaPareja, type FilaSegmento } from '@central/module-seguros'
import { aseguraConfigurada } from './asegura-db'
import { prisma } from './tenant'
import { catalogoCompanias } from './emision'
import { registrarErrorCartera, type CausaErrorCartera } from './error-cartera'
import { observacionesDeTarificaciones, type FilaSinPrecio, type LecturaObservaciones, type PrecioLeido, type TarificacionLeida } from './observaciones-precio-tarificaciones'

/** Techo de lectura (hoy ~120 tarificaciones y ~800 precios). */
export const LIMITE_TARIFICACIONES_COMPETITIVIDAD = 20000

export type CompetitividadCartera =
  | { estado: 'sin_configurar' }
  | { estado: 'error'; causa: CausaErrorCartera }
  | {
      estado: 'ok'
      anio: number
      hoy: string
      truncado: boolean
      /** Cuántas tarificaciones (todas las fechas) se leyeron, por canal. */
      tarificaciones: LecturaObservaciones['tarificaciones']
      excluidas: LecturaObservaciones['excluidas']
      descartadas: { invalidas: number; sinNivel: number }
      pareja: FilaPareja[]
      segmento: FilaSegmento[]
      sinPrecio: FilaSinPrecio[]
      /** Nombre por código de compañía (también las que no tienen ficha). */
      nombres: Record<string, string>
    }

const dec = (v: unknown): number | null => {
  if (v === null || v === undefined) return null
  const n = Number(String(v))
  return Number.isFinite(n) ? n : null
}

export async function leerTarificaciones(correduriaId: string): Promise<{ filas: TarificacionLeida[]; truncado: boolean }> {
  const cabeceras = await prisma.$queryRaw<{ id: string; canal: string; ramo: string | null; oportunidad_id: string | null; fecha: string; fallos: unknown }[]>`
    select id::text as id, canal, ramo, oportunidad_id::text as oportunidad_id,
           (creado_at at time zone 'Europe/Madrid')::date::text as fecha, fallos
    from tarificaciones
    where correduria_id = ${correduriaId}::uuid and simulado = false and canal in ('codeoscopic', 'rpa')
    order by creado_at desc
    limit ${LIMITE_TARIFICACIONES_COMPETITIVIDAD + 1}`
  const truncado = cabeceras.length > LIMITE_TARIFICACIONES_COMPETITIVIDAD
  const leidas = cabeceras.slice(0, LIMITE_TARIFICACIONES_COMPETITIVIDAD)
  const precios = await prisma.$queryRaw<{
    tarificacion_id: string; id: string; id_precio: string | null; compania: string | null; producto: string | null; modalidad: string | null
    categoria: string | null; prima_eur: unknown; franquicia_eur: unknown; garantias: unknown; coberturas: unknown
  }[]>`
    select p.tarificacion_id::text as tarificacion_id, p.id::text as id, p.id_precio, p.compania, p.producto, p.modalidad, p.categoria,
           p.prima_eur, p.franquicia_eur, p.garantias, p.coberturas
    from tarificacion_precios p
    join tarificaciones t on t.id = p.tarificacion_id
    where t.correduria_id = ${correduriaId}::uuid and t.simulado = false and t.canal in ('codeoscopic', 'rpa')`
  const porTarificacion = new Map<string, PrecioLeido[]>()
  for (const p of precios) {
    const lista = porTarificacion.get(p.tarificacion_id) ?? []
    lista.push({
      id: p.id, idVendor: p.id_precio, compania: p.compania, producto: p.producto, modalidad: p.modalidad, categoria: p.categoria,
      primaEur: dec(p.prima_eur), franquiciaEur: dec(p.franquicia_eur), garantias: p.garantias, coberturas: p.coberturas,
    })
    porTarificacion.set(p.tarificacion_id, lista)
  }
  const filas: TarificacionLeida[] = leidas.map((c) => ({
    id: c.id, canal: c.canal, ramo: c.ramo, oportunidadId: c.oportunidad_id, fecha: c.fecha, fallos: c.fallos, precios: porTarificacion.get(c.id) ?? [],
  }))
  return { filas, truncado }
}

export async function competitividadCartera(correduriaId: string, anio: number, hoy: string): Promise<CompetitividadCartera> {
  if (!aseguraConfigurada()) return { estado: 'sin_configurar' }
  try {
    const [{ filas, truncado }, catalogo] = await Promise.all([leerTarificaciones(correduriaId), catalogoCompanias()])
    // Sin catálogo no se sabe qué compañía es cada nombre: no se afirma nada (≠ «sin datos»).
    if (catalogo === null) return { estado: 'error', causa: registrarErrorCartera('operador/companias/competitividad', new Error('catalogo de companias ilegible')) }
    const lectura = observacionesDeTarificaciones(filas, catalogo)
    const calculo = calcularCompetitividad(lectura.observaciones, { anio })
    return {
      estado: 'ok', anio, hoy, truncado,
      tarificaciones: lectura.tarificaciones, excluidas: lectura.excluidas, descartadas: calculo.descartadas,
      pareja: calculo.pareja, segmento: calculo.segmento,
      sinPrecio: lectura.sinPrecio.filter((s) => s.anio === anio),
      nombres: { ...Object.fromEntries(catalogo.map((c) => [c.codigoDgs, c.nombreComun])), ...calculo.nombres },
    }
  } catch (e) {
    return { estado: 'error', causa: registrarErrorCartera('operador/companias/competitividad', e) }
  }
}
