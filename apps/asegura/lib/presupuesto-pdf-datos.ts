// Lee de la cartera lo que pinta `pdfPresupuesto`. Todo filtrado por la correduría: con BYPASSRLS
// un id ajeno no falla, devuelve los datos de otro.

import { MEDIADOR } from '@central/module-seguros'
import { prismaAsegura } from './asegura-db'
import { leerDatosCotizados } from './datos-cotizados'
import { coberturasIncluidas, type DatosPdfPresupuesto } from './presupuesto-pdf'

function numero(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(String(v))
  return Number.isFinite(n) ? n : null
}

/** `null` = no existe en esta correduría. Un fallo de consulta LANZA (no es «no existe»). */
export async function datosPdfPresupuesto(correduriaId: string, id: string): Promise<DatosPdfPresupuesto | null> {
  const db = prismaAsegura()
  const p = await db.presupuesto.findFirst({
    where: { id, correduriaId },
    include: { opciones: { where: { ocultaAt: null }, orderBy: { orden: 'asc' } } },
  })
  if (!p) return null
  const cliente = await db.cliente.findFirst({ where: { id: p.clienteId, correduriaId }, select: { nombre: true, apellidos: true } })
  const [tarif] = await db.$queryRaw<{ peticion: unknown }[]>`
    select peticion from tarificaciones
    where correduria_id = ${correduriaId}::uuid and id = ${p.tarificacionId}::uuid`

  // Los mismos grupos que «Revisa tus datos» del portal, pero con el DNI ENTERO: el PDF va al propio
  // tomador para que compruebe los datos de la emisión. Ilegible → null (el PDF lo dice).
  const leidos = leerDatosCotizados(tarif?.peticion, p.ramo, { documentoCompleto: true })

  return {
    // La referencia PROPIA; nunca el nº de proyecto de Avant2 ni la del vendor (no se leen aquí).
    referencia: p.referencia ?? null,
    cliente: [cliente?.nombre, cliente?.apellidos].map((s) => s?.trim()).filter(Boolean).join(' ') || 'Cliente',
    ramo: p.ramo,
    creadoAt: p.creadoAt,
    venceEl: p.venceEl,
    datosCalculo: leidos.estado === 'ok' ? leidos.grupos : null,
    necesidades: p.necesidades,
    opciones: p.opciones.map((o) => ({
      compania: o.compania,
      producto: o.producto,
      modalidad: o.modalidad,
      categoria: o.categoria,
      primaEur: numero(o.primaEur),
      franquiciaEur: numero(o.franquiciaEur),
      firmeza: o.firmeza,
      papeles: o.papeles,
      coberturas: coberturasIncluidas(o.coberturas),
    })),
    mediador: {
      marca: MEDIADOR.marca,
      nombre: MEDIADOR.identidad.nombre,
      claveDgsfp: MEDIADOR.identidad.claveDgsfp,
      domicilio: MEDIADOR.identidad.domicilio,
      email: MEDIADOR.identidad.email || null,
    },
  }
}
