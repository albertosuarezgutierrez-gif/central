// Cuadro de mando por compañía y año natural (07/11/2026). Lo sirve
// `GET /api/operador/companias/cuadro?anio=YYYY`; plataforma lo pinta en /correduria/companias.
//
// Aquí solo se LEE (pólizas de cartera viva con sus recibos, siniestros) y se llama a las reglas puras
// de `@central/module-seguros` (`cuadroCompanias`). La producción y la comisión de recibos NO se
// recalculan: se reutiliza `productividadCartera` (la misma cifra que el panel de objetivos).
// Se sirve el año pedido Y el anterior, para la comparación.
//
// 🚨 Tres estados: `sin_configurar` · `error` con causa · `ok`. Con un techo de lectura alcanzado
// (`truncado`) las cifras de ese origen son un suelo, y se dice.
// 🔒 Sin un solo dato personal: solo recuentos e importes por compañía y ramo.

import {
  WHERE_CARTERA_VIVA,
  cuadroCompanias,
  esCarteraEnVigor,
  primaConRecibos,
  type CuadroCompaniaAnio,
  type PolizaCuadro,
  type ReciboVigencia,
  type SiniestroCuadro,
} from '@central/module-seguros'
import { aseguraConfigurada, prismaAsegura } from './asegura-db'
import { registrarErrorCartera, type CausaErrorCartera } from './error-cartera'
import { productividadCartera } from './acuerdos-productividad'

/** Techos de lectura (la cartera entera son ~170 pólizas y ~480 recibos, 07/11/2026). */
export const LIMITE_POLIZAS_CUADRO = 20000
export const LIMITE_SINIESTROS_CUADRO = 20000

export type CuadroCartera =
  | { estado: 'sin_configurar' }
  | { estado: 'error'; causa: CausaErrorCartera }
  | {
      estado: 'ok'
      anio: number
      hoy: string
      /** Alguna lectura llegó a su techo: las cifras son un suelo. */
      truncado: boolean
      /** Producción/comisión (recibos) cortada por su techo propio. */
      produccionTruncada: boolean
      companias: CuadroCompaniaAnio[]
      /** Mismo cuadro del año anterior (comparación). */
      anterior: CuadroCompaniaAnio[]
      polizasSinCompania: number
      siniestrosSinCompania: number
    }

const iso = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null)
const madrid = (d: Date | null): string | null => (d ? d.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }) : null)
const dec = (d: { toString(): string } | null): number | null => (d === null ? null : Number(d.toString()))

export async function cuadroCartera(correduriaId: string, anio: number, hoy: string): Promise<CuadroCartera> {
  if (!aseguraConfigurada()) return { estado: 'sin_configurar' }
  try {
    const db = prismaAsegura()
    const [polizas, siniestros, prodActual, prodAnterior] = await Promise.all([
      db.poliza.findMany({
        where: { correduriaId, mergedIntoPolizaId: null, ...WHERE_CARTERA_VIVA },
        select: {
          id: true, codigoEntidadDgs: true, tipo: true, estado: true, importRef: true, eiacXmlHash: true,
          sustituidaAt: true, fechaEfectoInicial: true, fechaSituacion: true,
          primaAnual: true, primaBruta: true, fraccionamiento: true,
          recibos: { select: { claseRecibo: true, situacion: true, primaTotal: true, fechaVencimiento: true } },
        },
        take: LIMITE_POLIZAS_CUADRO + 1,
      }),
      db.siniestro.findMany({
        where: { correduriaId, fusionadoEnSiniestroId: null, poliza: { mergedIntoPolizaId: null } },
        select: {
          codigoEntidadDgs: true, fechaHora: true, fechaDeclaracion: true, tipo: true,
          indemnizacionCima: true, reservaCima: true, totalPagosCima: true,
          indemnizacionImporte: true, reservaImporte: true,
          poliza: { select: { codigoEntidadDgs: true } },
        },
        take: LIMITE_SINIESTROS_CUADRO + 1,
      }),
      productividadCartera(correduriaId, anio, hoy),
      productividadCartera(correduriaId, anio - 1, hoy),
    ])
    if (prodActual.estado !== 'ok') return prodActual
    // El año anterior es comparación: si falla, se declara vacío, no se tumba el cuadro.
    const produccionAnterior = prodAnterior.estado === 'ok' ? prodAnterior.produccion : []

    const truncado = polizas.length > LIMITE_POLIZAS_CUADRO || siniestros.length > LIMITE_SINIESTROS_CUADRO
    const polizasCuadro: PolizaCuadro[] = polizas.slice(0, LIMITE_POLIZAS_CUADRO).map((p) => ({
      companiaCodigoDgs: p.codigoEntidadDgs,
      ramo: p.tipo,
      estado: p.estado,
      enVigorHoy: esCarteraEnVigor({ importRef: p.importRef, eiacXmlHash: p.eiacXmlHash, estado: p.estado, sustituidaAt: p.sustituidaAt }),
      fechaEfectoInicial: iso(p.fechaEfectoInicial),
      fechaSituacion: iso(p.fechaSituacion),
      prima: primaConRecibos(
        {
          primaAnual: dec(p.primaAnual),
          primaBruta: dec(p.primaBruta),
          fraccionamiento: p.fraccionamiento === null ? null : String(p.fraccionamiento),
        },
        p.recibos.map((r): ReciboVigencia => ({
          claseRecibo: r.claseRecibo,
          situacion: r.situacion === null ? null : String(r.situacion),
          primaTotal: r.primaTotal,
          fechaVencimiento: iso(r.fechaVencimiento),
        })),
        hoy,
      ).prima,
    }))
    const siniestrosCuadro: SiniestroCuadro[] = siniestros.slice(0, LIMITE_SINIESTROS_CUADRO).map((s) => ({
      companiaCodigoDgs: s.codigoEntidadDgs ?? s.poliza.codigoEntidadDgs,
      fecha: madrid(s.fechaHora) ?? iso(s.fechaDeclaracion),
      tipo: s.tipo,
      // Lo que manda la compañía por EIAC; el importe del corredor (alta manual) solo si CIMA no trae.
      indemnizacion: dec(s.indemnizacionCima) ?? dec(s.indemnizacionImporte),
      reserva: dec(s.reservaCima) ?? dec(s.reservaImporte),
      pagos: dec(s.totalPagosCima),
    }))

    const actual = cuadroCompanias({ anio, hoy, polizas: polizasCuadro, siniestros: siniestrosCuadro, produccion: prodActual.produccion })
    const anterior = cuadroCompanias({ anio: anio - 1, hoy, polizas: polizasCuadro, siniestros: siniestrosCuadro, produccion: produccionAnterior })
    return {
      estado: 'ok',
      anio,
      hoy,
      truncado,
      produccionTruncada: prodActual.truncado || (prodAnterior.estado === 'ok' && prodAnterior.truncado),
      companias: actual.companias,
      anterior: anterior.companias,
      polizasSinCompania: actual.polizasSinCompania,
      siniestrosSinCompania: actual.siniestrosSinCompania,
    }
  } catch (e) {
    return { estado: 'error', causa: registrarErrorCartera('operador/companias/cuadro', e) }
  }
}
