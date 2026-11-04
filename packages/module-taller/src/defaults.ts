// Valores de ALTA de un taller nuevo. Es el ÚNICO fichero de `src/` donde pueden aparecer precios,
// IVA o intervalos literales (cepo: test/guardian-literales.test.ts). El dueño los edita después.
//
// ⚠️ Pendientes de confirmar con el taller piloto (spec §11): el precio hora (50,00 €/h es una inferencia de
// «5 h = 250 €»), recargos por tipo de vehículo, paquetes y aceites. Por eso los catálogos de precio nacen
// VACÍOS o a 0: un precio inventado acabaría en un presupuesto real. Sin paquetes ni aceites configurados
// el presupuesto por paquete devuelve error en vez de inventar.

import type { ConfigTaller } from './config.ts'

export const PRECIO_HORA_ALTA_CENT = 5000

export const IVA_GENERAL_PB = 2100
export const IVA_REDUCIDO_PB = 1000
export const IVA_EXENTO_PB = 0

/** Construye la configuración de alta. Siempre devuelve un objeto NUEVO (nunca compartas el de otro taller). */
export function configDeAlta(): ConfigTaller {
  return {
    precioHoraCent: PRECIO_HORA_ALTA_CENT,
    ivas: [
      { codigo: 'general', nombre: 'IVA general', puntosBasicos: IVA_GENERAL_PB },
      { codigo: 'reducido', nombre: 'IVA reducido', puntosBasicos: IVA_REDUCIDO_PB },
      { codigo: 'exento', nombre: 'Exento', puntosBasicos: IVA_EXENTO_PB },
    ],
    ivaPorDefecto: { mano_obra: 'general', pieza: 'general', granel: 'general', otro: 'general' },
    tiposVehiculo: [
      { codigo: 'turismo', nombre: 'Turismo', recargoPuntosBasicos: 0, activo: true },
      { codigo: 'todoterreno', nombre: 'Todoterreno', recargoPuntosBasicos: 0, activo: true },
      { codigo: 'furgoneta', nombre: 'Furgoneta', recargoPuntosBasicos: 0, activo: true },
      { codigo: 'otro', nombre: 'Otro', recargoPuntosBasicos: 0, activo: true },
    ],
    paquetes: [],
    aceites: [],
    series: [
      { codigo: 'F', prefijo: 'F', descripcion: 'Facturas', rectificativa: false, porDefecto: true },
      { codigo: 'R', prefijo: 'R', descripcion: 'Rectificativas', rectificativa: true, porDefecto: false },
    ],
    mediosCobro: [
      { codigo: 'efectivo', nombre: 'Efectivo', esEfectivo: true, activo: true },
      { codigo: 'bizum', nombre: 'Bizum', esEfectivo: false, activo: true },
      { codigo: 'tarjeta', nombre: 'Tarjeta', esEfectivo: false, activo: true },
      { codigo: 'transferencia', nombre: 'Transferencia', esEfectivo: false, activo: true },
      { codigo: 'otro', nombre: 'Otro', esEfectivo: false, activo: true },
    ],
    intervalosAvisos: {
      itvAntelacionDias: 30,
      revisionFechaAntelacionDias: 30,
      revisionKmAntelacion: 1000,
      seguroAntelacionDias: 30,
      recordatorioCitaHoras: 24,
    },
    // Sin franjas: el taller pone su horario antes de abrir citas (no se inventa uno).
    horarioCitas: { franjas: [], duracionHuecoMinutos: 30, puestos: 1 },
    textos: {
      pieResguardo: '',
      pieFactura: '',
      condicionesPresupuesto: '',
      firmaCorreo: '',
      // Borrador hasta F0 (texto legal revisado por Alberto).
      textoConsentimientoComercialTaller:
        'Acepto que el taller me envíe promociones y campañas propias. Puedo retirarlo cuando quiera.',
      versionTextoComercialTaller: 'taller-borrador-1',
    },
    validezPresupuestoDias: 30,
  }
}
