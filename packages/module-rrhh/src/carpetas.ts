// Taxonomía de expediente RR.HH. reutilizable. Es el conjunto de carpetas estándar de un
// trabajador (datos personales, contratos, nóminas, partes médicos, otros) que comparten rrhh
// (empleados) e ialimp (limpiadoras). Cada vertical puede usar esta por defecto o aportar la suya:
// el motor documental (`@central/module-documental`) es agnóstico.

import { indexarCarpetas, type ConfigCarpeta, type Actor } from '@central/module-documental'

/** Carpetas estándar del expediente de un trabajador. */
export const CARPETAS_RRHH: ConfigCarpeta[] = [
  { id: 'datos_personales', etiqueta: 'Datos personales', titularPuedeSubir: true, titularPuedeVer: true },
  { id: 'contratos', etiqueta: 'Contratos', titularPuedeSubir: false, titularPuedeVer: true },
  { id: 'nominas', etiqueta: 'Nóminas', titularPuedeSubir: false, titularPuedeVer: true },
  { id: 'partes_medicos', etiqueta: 'Partes médicos', titularPuedeSubir: true, titularPuedeVer: true },
  { id: 'formacion', etiqueta: 'Formación', titularPuedeSubir: false, titularPuedeVer: true },
  { id: 'prevencion_riesgos', etiqueta: 'Prevención de riesgos', titularPuedeSubir: false, titularPuedeVer: true },
  { id: 'otros', etiqueta: 'Otros', titularPuedeSubir: false, titularPuedeVer: true },
]

export const CARPETAS_RRHH_IDX = indexarCarpetas(CARPETAS_RRHH)

// Mapeo de roles → actores del motor documental: el responsable de RR.HH. es 'gestor', el trabajador 'titular'.
export const ACTOR_GESTOR: Actor = 'gestor'
export const ACTOR_TITULAR: Actor = 'titular'
