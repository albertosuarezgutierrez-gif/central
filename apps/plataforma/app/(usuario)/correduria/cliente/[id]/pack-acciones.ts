'use server'

// Acciones de servidor del PACK coche + moto (03/10/2026). Mismo patrón que `auto-nuevo/acciones.ts`:
// el Bearer no baja al navegador y `confirmado: true` lo pone `cotizar*NuevaAsegura()` en el servidor.
//
// 🚨 `pedirCotizacionPack` CUESTA 0,50€ REALES. Lee el riesgo del OTRO vehículo en el servidor (no se
// fía de lo que mande el navegador sobre qué coche es), comprueba que cabe (`planPackOtroVehiculo`) y,
// solo entonces, hace la llamada. Si no cabe, 0,00€ y se explica.

import { catalogoAsegura, cotizarAutoNuevaAsegura } from '@/lib/auto-nuevo-asegura'
import { garajePorDefecto } from '@/lib/supuestos-presupuesto'
import { cotizarMotoNuevaAsegura } from '@/lib/moto-nuevo-asegura'
import { tarificacionNuevaGuardadaAsegura, type RespuestaRetarificar, type RespuestaTarificacionNueva } from '@/lib/retarificar-asegura'
import { otroRamoPack, planPackOtroVehiculo, type RamoPack } from '@/lib/correduria/pack-otro-vehiculo'
import { cargarVariante } from '../../oportunidad/[id]/cargar-variante'

export type RespuestaPack = RespuestaRetarificar | { estado: 'pack_no'; motivo: string }

/** La tarificación YA guardada del otro vehículo. **Gratis.** Evita pagar otra vez lo que ya se pagó. */
export async function pedirPackGuardado(entrada: { clienteId: string; ramoActual: RamoPack; oportunidadOtroId: string }): Promise<RespuestaTarificacionNueva> {
  return tarificacionNuevaGuardadaAsegura(entrada.clienteId, otroRamoPack(entrada.ramoActual), { oportunidadId: entrada.oportunidadOtroId, tarificacionId: null })
}

export async function pedirCotizacionPack(entrada: {
  clienteId: string
  ramoActual: RamoPack
  oportunidadOtroId: string
  /** Del cliente (los mismos de la pantalla: es la misma persona). */
  estadoCivilId: string
  municipioId: string
  fechaEfecto: string | null
}): Promise<RespuestaPack> {
  const ramo = otroRamoPack(entrada.ramoActual)
  const carga = await cargarVariante(entrada.oportunidadOtroId, null, entrada.clienteId, ramo)
  if (carga.estado !== 'ok') {
    return { estado: 'pack_no', motivo: carga.estado === 'error' ? carga.mensaje : 'No se ha podido leer el otro vehículo.' }
  }
  // La oportunidad tiene que ser DE ESTE cliente: el id lo manda el navegador.
  if (carga.riesgo.oportunidad.clienteId !== entrada.clienteId) {
    return { estado: 'pack_no', motivo: 'El otro vehículo no es de este cliente: no se tarifica.' }
  }
  const plan = planPackOtroVehiculo({ ramo, datos: carga.riesgo.datosVehiculo ?? null, fechaEfecto: entrada.fechaEfecto })
  if (!plan.ok) return { estado: 'pack_no', motivo: plan.motivo }

  // El garaje del otro vehículo si lo trae; si no, el supuesto de siempre, DE SU CATÁLOGO (el de moto y el de
  // coche son listas distintas: el id de una no vale en la otra). Catálogo gratis.
  let garaje = typeof plan.resueltos.garaje === 'string' ? plan.resueltos.garaje : null
  if (garaje === null) {
    const cat = await catalogoAsegura({ tipo: ramo === 'moto' ? 'garajes-moto' : 'garajes' })
    garaje = cat.estado === 'ok' ? garajePorDefecto(cat.opciones)?.id ?? null : null
    if (garaje === null) return { estado: 'pack_no', motivo: `No se ha podido leer el catálogo de garajes del ${ramo === 'moto' ? 'moto' : 'coche'} para el supuesto de siempre (0,00€).` }
  }

  const cuerpo = {
    clienteId: entrada.clienteId,
    solicitadoPor: 'plataforma/correduria',
    resueltos: {
      ...plan.resueltos,
      estadoCivilId: entrada.estadoCivilId,
      municipioId: entrada.municipioId,
      garaje,
      garajeEsSupuesto: true,
    },
    correcciones: plan.fechaEfecto ? { fechaEfecto: plan.fechaEfecto } : undefined,
    oportunidadId: entrada.oportunidadOtroId,
    figuras: carga.variante.figuras as Record<string, string>,
    nota: 'Pack coche + moto',
  }
  return ramo === 'moto' ? cotizarMotoNuevaAsegura(cuerpo) : cotizarAutoNuevaAsegura(cuerpo)
}
