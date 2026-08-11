// @central/module-flota — Flota/Transporte genérico de la casa de marcas.
// Extraído de la flota a medida de ia-rest (`vehiculos_grupo` + `evento_transporte`) hacia un
// módulo portable: lógica pura (costes, rentabilidad, asignación por capacidad/tipo, gestión
// documental ITV/seguro, intercompany) + puertos de adaptación. Cada vertical aporta su adaptador.
// Reutilizable por ia-rest (transporte de catering), la vertical Transporte (camiones, interno +
// externo) y cualquier cliente con flota. Ver docs/DISENO-modulos-materiales-flota.md §4.

// Tipos y puertos
export type {
  TipoVehiculo,
  Vehiculo,
  ParentType,
  ParentRef,
  EstadoPorte,
  Porte,
  TipoParada,
  ParadaRuta,
  TipoDocumentoVehiculo,
  DocumentoVehiculo,
  Mantenimiento,
  Repostaje,
  Carga,
  Intervalo,
  RentabilidadPorte,
  RentabilidadVehiculo,
  EstadoDocumento,
  AlertaDocumento,
  VehiculoAdapter,
  PorteAdapter,
} from './types'

// Lógica pura
export {
  round2,
  costePorteEstimado,
  costePorteReal,
  costePorKm,
  rentabilidadPorte,
  rentabilidadVehiculo,
  vehiculoAptoParaCarga,
  intervaloPorte,
  vehiculoDisponible,
  vehiculosAptos,
  asignarVehiculo,
  estadoDocumento,
  alertasDocumentos,
  vehiculosSinDocumentar,
  DOCS_OBLIGATORIOS,
  esPorteIntercompany,
  totalIntercompany,
} from './flota'
