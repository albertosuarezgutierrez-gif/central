// Productividad por compañía frente a los acuerdos (fase 2, 06/10/2026). Lo sirve
// `GET /api/operador/companias/productividad`; plataforma lo pinta junto a los
// contactos y acuerdos de cada compañía. Spec §3:
// docs/superpowers/specs/2026-10-06-correduria-acuerdos-companias-design.md
//
// Aquí solo se LEE (recibos de CIMA de pólizas de cartera viva) y se llama a las
// reglas puras de `@central/module-seguros` (`produccionPorCompania`,
// `evaluarObjetivo`). Nada se decide en este fichero.
//
// 🚨 La producción usa `WHERE_CARTERA_VIVA` (origen CIMA) y NO «en vigor»: pregunta
// QUÉ SE PRODUJO en el periodo, y una póliza nueva de marzo cancelada en
// septiembre produjo en marzo (spec §3.1). La cartera en vigor es otra pregunta.
//
// 🚨 Tres estados: `sin_configurar` · `error` con causa · `ok`. Con el techo de
// lectura alcanzado, `truncado: true` y todos los objetivos salen «pendiente»
// (`lectura_incompleta`): una producción cortada es un número plausible y bajo.

import {
  WHERE_CARTERA_VIVA,
  WHERE_CARTERA_EN_VIGOR,
  agregarCarteraVigor,
  evaluarObjetivo,
  produccionPorCompania,
  type EstadoObjetivo,
  type FilaCartera,
  type ProduccionCompania,
  type ReciboProduccion,
} from '@central/module-seguros'
import { aseguraConfigurada, prismaAsegura } from './asegura-db'
import { acuerdosCartera } from './acuerdos'
import { registrarErrorCartera, type CausaErrorCartera } from './error-cartera'

/** Techo de recibos leídos. La cartera entera son ~460 recibos (06/10/2026). */
export const LIMITE_RECIBOS_PRODUCTIVIDAD = 5000

export type ObjetivoEvaluado = {
  acuerdoId: string
  objetivoId: string
  companiaCodigoDgs: string
  estado: EstadoObjetivo
}

export type ProductividadCartera =
  | { estado: 'sin_configurar' }
  | { estado: 'error'; causa: CausaErrorCartera }
  | {
      estado: 'ok'
      anio: number
      /** Fechas de EFECTO, bordes incluidos. */
      periodo: { desde: string; hasta: string }
      hoy: string
      truncado: boolean
      /** Recibos sin código DGS de compañía: no se pueden asignar a ninguna. */
      sinCompania: number
      produccion: ProduccionCompania[]
      objetivos: ObjetivoEvaluado[]
      /** Cartera EN VIGOR de hoy por compañía × ramo (`esCarteraEnVigor`), para el panel de control. */
      cartera: FilaCartera[]
      /** Pólizas en vigor sin código DGS (o sin ramo): no se asignan a ninguna compañía. */
      carteraSinCompania: number
    }

const iso = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null)

function codigoMediador(json: unknown): unknown {
  if (typeof json !== 'object' || json === null) return null
  const m = (json as Record<string, unknown>).mediador
  if (typeof m !== 'object' || m === null) return null
  return (m as Record<string, unknown>).codigoInterno ?? null
}

export async function productividadCartera(correduriaId: string, anio: number, hoy: string): Promise<ProductividadCartera> {
  if (!aseguraConfigurada()) return { estado: 'sin_configurar' }
  const acuerdos = await acuerdosCartera(correduriaId)
  if (acuerdos.estado !== 'ok') return acuerdos
  try {
    const periodo = { desde: `${anio}-01-01`, hasta: `${anio}-12-31` }
    // El rango leído cubre el año pedido Y los periodos de todos los objetivos.
    let desde = periodo.desde
    let hasta = periodo.hasta
    for (const a of acuerdos.acuerdos) for (const o of a.objetivos) {
      if (o.periodoDesde < desde) desde = o.periodoDesde
      if (o.periodoHasta > hasta) hasta = o.periodoHasta
    }

    const filas = await prismaAsegura().polizaRecibo.findMany({
      where: {
        correduriaId,
        fechaEfectoActual: { gte: new Date(`${desde}T00:00:00Z`), lt: new Date(Date.parse(`${hasta}T00:00:00Z`) + 86_400_000) },
        poliza: { correduriaId, ...WHERE_CARTERA_VIVA, mergedIntoPolizaId: null },
      },
      select: {
        polizaId: true,
        codigoEntidadDgs: true,
        claseRecibo: true,
        situacion: true,
        fechaEfectoActual: true,
        primaNeta: true,
        comisionBruta: true,
        datosExtra: true,
        poliza: { select: { tipo: true, datosEspecificos: true } },
      },
      // Lo más reciente primero: si se alcanza el techo, se cae lo viejo.
      orderBy: { fechaEfectoActual: 'desc' },
      take: LIMITE_RECIBOS_PRODUCTIVIDAD + 1,
    })
    // Cartera de HOY (otra pregunta que la producción del periodo, spec §3.1): pólizas en vigor.
    const vigor = await prismaAsegura().poliza.findMany({
      where: { AND: [{ correduriaId, mergedIntoPolizaId: null }, WHERE_CARTERA_EN_VIGOR] },
      select: { codigoEntidadDgs: true, tipo: true, primaAnual: true },
    })
    const carteraVigor = agregarCarteraVigor(vigor.map((p) => ({
      companiaCodigoDgs: p.codigoEntidadDgs,
      ramo: p.tipo,
      primaAnual: p.primaAnual === null ? null : Number(p.primaAnual.toString()),
    })))

    const truncado = filas.length > LIMITE_RECIBOS_PRODUCTIVIDAD
    const leidas = truncado ? filas.slice(0, LIMITE_RECIBOS_PRODUCTIVIDAD) : filas

    let sinCompania = 0
    const recibos: ReciboProduccion[] = []
    for (const f of leidas) {
      if (!f.codigoEntidadDgs) { sinCompania++; continue }
      recibos.push({
        polizaId: f.polizaId,
        companiaCodigoDgs: f.codigoEntidadDgs,
        clase: f.claseRecibo,
        situacion: f.situacion,
        fechaEfecto: iso(f.fechaEfectoActual),
        primaNeta: f.primaNeta,
        comisionBruta: f.comisionBruta,
        ramo: f.poliza.tipo,
        codigoRecibo: codigoMediador(f.datosExtra),
        codigoPoliza: codigoMediador(f.poliza.datosEspecificos),
      })
    }

    const claves = acuerdos.claves.map((c) => ({ id: c.id, companiaCodigoDgs: c.companiaCodigoDgs, codigosCima: c.codigosCima }))
    const objetivos: ObjetivoEvaluado[] = acuerdos.acuerdos.flatMap((a) =>
      a.objetivos.map((o) => ({
        acuerdoId: a.id,
        objetivoId: o.id,
        companiaCodigoDgs: a.companiaCodigoDgs,
        estado: evaluarObjetivo({
          acuerdo: { claveId: a.claveId, revisado: a.revisadoAt !== null },
          objetivo: {
            tipo: o.tipo.valor,
            ambito: o.ambito.valor,
            base: o.base.valor,
            criterioCobro: o.criterioCobro === null ? null : o.criterioCobro.valor,
            ramos: o.ramos,
            periodoDesde: o.periodoDesde,
            periodoHasta: o.periodoHasta,
            tramos: o.tramos,
            siniestralidadMaxPct: o.siniestralidadMaxPct,
          },
          recibos: recibos.filter((r) => r.companiaCodigoDgs === a.companiaCodigoDgs),
          claves,
          hoy,
          completo: !truncado,
        }),
      })),
    )

    return {
      estado: 'ok',
      anio,
      periodo,
      hoy,
      truncado,
      sinCompania,
      produccion: produccionPorCompania(recibos, periodo),
      objetivos,
      cartera: carteraVigor.filas,
      carteraSinCompania: carteraVigor.sinCompania + carteraVigor.sinRamo,
    }
  } catch (e) {
    return { estado: 'error', causa: registrarErrorCartera('operador/companias/productividad', e) }
  }
}
