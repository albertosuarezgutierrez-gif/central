import { indexarCarpetas, type ConfigCarpeta, type Actor } from '@central/module-documental'

// Taxonomía de carpetas del expediente de EMPLEADO (lo específico de rrhh; el módulo es agnóstico).
export const CARPETAS: ConfigCarpeta[] = [
  { id: 'datos_personales', etiqueta: 'Datos personales', titularPuedeSubir: true, titularPuedeVer: true },
  { id: 'contratos', etiqueta: 'Contratos', titularPuedeSubir: false, titularPuedeVer: true },
  { id: 'nominas', etiqueta: 'Nóminas', titularPuedeSubir: false, titularPuedeVer: true },
  { id: 'partes_medicos', etiqueta: 'Partes médicos', titularPuedeSubir: true, titularPuedeVer: true },
  { id: 'otros', etiqueta: 'Otros', titularPuedeSubir: false, titularPuedeVer: true },
]

export const CARPETAS_IDX = indexarCarpetas(CARPETAS)

// Mapeo de roles de rrhh → actores del módulo: el responsable de RR.HH. es 'gestor', el empleado 'titular'.
export const ACTOR_GESTOR: Actor = 'gestor'
export const ACTOR_TITULAR: Actor = 'titular'

export const BUCKET_DOCS = 'rrhh-documentos'
