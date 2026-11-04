// Configuración de prueba: valores ARBITRARIOS del test (no son los de alta) para demostrar que el cálculo
// sale de la configuración. Se elige un IVA que no es el general para que nada «acierte» con un literal.
import { configDeAlta, type ConfigTaller } from '../src/index.ts'

export function configPrueba(): ConfigTaller {
  const c = configDeAlta()
  c.precioHoraCent = 4800
  c.ivas = [
    { codigo: 'g', nombre: 'General prueba', puntosBasicos: 1900 },
    { codigo: 'r', nombre: 'Reducido prueba', puntosBasicos: 500 },
  ]
  c.ivaPorDefecto = { mano_obra: 'g', pieza: 'g', granel: 'g', otro: 'g' }
  c.tiposVehiculo = [
    { codigo: 'turismo', nombre: 'Turismo', recargoPuntosBasicos: 0, activo: true },
    { codigo: 'furgoneta', nombre: 'Furgoneta', recargoPuntosBasicos: 2500, activo: true },
    { codigo: 'baja', nombre: 'De baja', recargoPuntosBasicos: 0, activo: false },
  ]
  c.aceites = [
    { codigo: 'gen', nombre: 'Aceite genérico', familia: 'generico', precioLitroCent: 899, activo: true },
    { codigo: 'esp', nombre: 'Aceite específico', familia: 'especifico', precioLitroCent: 1475, ivaCodigo: 'r', activo: true },
  ]
  c.paquetes = [
    {
      codigo: 'aceite', nombre: 'Cambio de aceite', baremoMinutos: 45,
      precioCerradoPorTipo: { turismo: 3000 },
      piezas: [{ descripcion: 'Filtro de aceite', cantidad: 1, precioUnitarioCent: 1250 }],
      requiereAceite: true, activo: true,
    },
    { codigo: 'filtros', nombre: 'Filtros', baremoMinutos: 20, precioCerradoPorTipo: {}, piezas: [], requiereAceite: false, activo: true },
  ]
  return c
}
