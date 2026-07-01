// Catálogo de tipos de solicitud del empleado. Módulo PURO (sin prisma) para que lo puedan
// importar tanto el backend (validación) como los componentes de cliente, sin arrastrar prisma.
//
// Incluye los permisos retribuidos del art. 37.3 ET (actualizado por el RD-ley 5/2023). Los días
// indicados en `pista` son ORIENTATIVOS: el cómputo real lo fija el convenio colectivo aplicable.

export type GrupoSolicitud = { id: string; etiqueta: string }
export type TipoSolicitud = { id: string; etiqueta: string; grupo: string; pista?: string }

export const GRUPOS_SOLICITUD: GrupoSolicitud[] = [
  { id: 'vacaciones', etiqueta: 'Vacaciones' },
  { id: 'permiso', etiqueta: 'Permisos retribuidos' },
  { id: 'sabados', etiqueta: 'Sábados' },
  { id: 'ausencia', etiqueta: 'Ausencias por salud' },
  { id: 'otro', etiqueta: 'Otros' },
]

export const TIPOS_SOLICITUD: TipoSolicitud[] = [
  { id: 'vacaciones', etiqueta: 'Vacaciones', grupo: 'vacaciones' },

  { id: 'matrimonio', etiqueta: 'Matrimonio o registro de pareja de hecho', grupo: 'permiso', pista: 'Habitualmente 15 días naturales (según convenio).' },
  { id: 'fallecimiento', etiqueta: 'Fallecimiento de familiar', grupo: 'permiso', pista: 'Cónyuge/pareja o familiar hasta 2º grado. Suele ser 2 días (más si hay desplazamiento). Adjunta justificante.' },
  { id: 'hospitalizacion', etiqueta: 'Hospitalización de familiar', grupo: 'permiso', pista: 'Familiar hasta 2º grado. Habitualmente 5 días. Adjunta justificante.' },
  { id: 'enfermedad_grave', etiqueta: 'Accidente o enfermedad grave de familiar', grupo: 'permiso', pista: 'Familiar hasta 2º grado. Habitualmente 5 días. Adjunta justificante.' },
  { id: 'intervencion', etiqueta: 'Intervención quirúrgica de familiar', grupo: 'permiso', pista: 'Sin hospitalización pero con reposo domiciliario. Habitualmente 5 días.' },

  { id: 'sabado_manana', etiqueta: 'Mañana', grupo: 'sabados' },
  { id: 'sabado_tarde', etiqueta: 'Tarde', grupo: 'sabados' },
  { id: 'sabado_completo', etiqueta: 'Completo', grupo: 'sabados' },

  { id: 'parte_medico', etiqueta: 'Parte médico / consulta', grupo: 'ausencia' },
  { id: 'baja', etiqueta: 'Baja médica (IT)', grupo: 'ausencia' },

  { id: 'otro', etiqueta: 'Otro', grupo: 'otro' },
]

/** Ids válidos (para validación en backend). */
export const IDS_SOLICITUD: string[] = TIPOS_SOLICITUD.map(t => t.id)

const ETIQUETAS: Record<string, string> = Object.fromEntries(TIPOS_SOLICITUD.map(t => [t.id, t.etiqueta]))
/** Etiqueta legible de un tipo (o el propio id si es desconocido). */
export const tipoEtiqueta = (id: string): string => ETIQUETAS[id] ?? id

/** Pista orientativa (días/justificante) del tipo, si la tiene. */
export const pistaTipo = (id: string): string | undefined => TIPOS_SOLICITUD.find(t => t.id === id)?.pista

/** Tipos agrupados por categoría, en orden, para pintar `<optgroup>`. */
export const tiposPorGrupo = (): { grupo: GrupoSolicitud; tipos: TipoSolicitud[] }[] =>
  GRUPOS_SOLICITUD.map(grupo => ({ grupo, tipos: TIPOS_SOLICITUD.filter(t => t.grupo === grupo.id) }))
