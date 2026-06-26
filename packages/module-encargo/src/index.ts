// @central/module-encargo — el agregado genérico Encargo de la casa de marcas.
// La "pieza central" de la modularización: une CRM + presupuestos + agenda + inventario +
// proveedores + portal + feedback + flota + intercompany bajo una identidad común (evento, porte,
// alquiler, cita…) con una máquina de estados. Cada módulo se cuelga del Encargo por su id.
// Lógica pura (tipos + máquina de estados + composición + resumen) + puertos de adaptación.
// Ver docs/DISENO-modularizacion-verticales.md §3.

export type {
  TipoEncargo,
  Vertical,
  EstadoEncargo,
  ComponenteEncargo,
  EnlacesEncargo,
  Encargo,
  NuevoEncargo,
  FiltroEncargo,
  ResumenEncargos,
  EncargoRepository,
  EncargoAdapter,
} from './types'

export {
  ESTADOS,
  ESTADOS_ABIERTOS,
  ESTADOS_CERRADOS,
  TRANSICIONES,
  esAbierto,
  esCerrado,
  puedeTransicionar,
  transicionar,
  componentesVinculados,
  estaCompleto,
  componentesFaltantes,
  round2,
  resumenEncargos,
} from './encargo'
