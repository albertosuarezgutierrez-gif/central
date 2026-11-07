// PUENTE correduría → «Mi empresa» (solo en plataforma, que ya ve las dos cosas). PURO, con test.
//
// Al activar herramientas de una sociedad, la pantalla del operador PRE-RELLENA dueño y miembros con un rol SUGERIDO a partir
// de las relaciones que ya constan en la ficha de la sociedad en la cartera (`seguros.cliente_relaciones`, leídas por el puerto
// de asegura). El operador confirma o corrige; la copia a `herramientas` ocurre SOLO con su clic, y se guarda de dónde salió
// (`origen`) para avisar si la relación cambia («¿actualizar rol?»), sin cambiar nada sola.
//
// Reglas (Alberto, 07/11/2026):
//  · Sugerencia, nunca decisión: el mapeo es EDITABLE aquí y la pantalla lo deja corregir.
//  · El parentesco NO implica rol (Cónyuge, Hermano/a…): sin rol sugerido. Tampoco se deduce nada de apellidos.
//  · Las apps de herramientas no leen `seguros` ni importan module-seguros: este puente vive en plataforma y solo pasa
//    ids, nombre y tipo de relación; nada de pólizas.
//  · Sin relaciones legibles (`null`) = «no se pudo leer», nunca «no hay nadie».

export type RolMiembro = 'dueno' | 'admin' | 'consulta' | 'empleado'

/** Tipo de relación (desde la ficha de la SOCIEDAD: «X · Administración» = X es la administración de la sociedad) → rol. */
export const ROL_POR_RELACION: Readonly<Record<string, RolMiembro>> = {
  'Dueño': 'dueno',
  'Socio/a': 'consulta',
  'Accionista': 'consulta',
  'Administración': 'admin',
  'Empleado/a': 'empleado',
}

/** Título de representación de la autorización del portal (si consta) → manda sobre el tipo: quien la representa, firma. */
const ROL_POR_TITULO: Readonly<Record<string, RolMiembro>> = { administrador: 'dueno', apoderado: 'dueno', empleado_autorizado: 'admin' }

export type RelacionLeida = {
  relacionadoId: string
  nombre: string
  tipo: string
  tipoPersona: 'fisica' | 'juridica' | null
  /** Título con el que representa a la sociedad (autorización del portal), si consta. */
  titulo?: string | null
}

export type Sugerencia = {
  relacionadoId: string
  nombre: string
  tipo: string
  rol: RolMiembro | null
  titulo: 'administrador' | 'apoderado' | null
  motivo: string
  origen: OrigenRelacion
}

export type OrigenRelacion = { fuente: 'relacion_correduria'; cliente_id: string; relacionado_id: string; tipo: string; titulo: string | null }

export function rolSugerido(r: Pick<RelacionLeida, 'tipo' | 'titulo' | 'tipoPersona'>): { rol: RolMiembro | null; motivo: string } {
  if (r.tipoPersona === 'juridica') return { rol: null, motivo: 'es una sociedad, no una persona' }
  const porTitulo = r.titulo ? ROL_POR_TITULO[r.titulo] : undefined
  if (porTitulo) return { rol: porTitulo, motivo: `representa a la sociedad como ${r.titulo}` }
  const porTipo = ROL_POR_RELACION[r.tipo]
  if (porTipo) return { rol: porTipo, motivo: `relación «${r.tipo}» en la ficha de la sociedad` }
  return { rol: null, motivo: `«${r.tipo}» no implica ningún rol (decide tú)` }
}

/** Sugerencias para la sociedad `clienteId`, en orden: dueño(s) → consulta → administración → sin rol. */
export function sugerirMiembros(clienteId: string, relaciones: readonly RelacionLeida[] | null): Sugerencia[] | null {
  if (relaciones === null) return null
  const orden: Record<string, number> = { dueno: 0, consulta: 1, admin: 2, empleado: 3, ninguno: 4 }
  return relaciones
    .map((r) => {
      const s = rolSugerido(r)
      const titulo: Sugerencia['titulo'] = r.titulo === 'administrador' || r.titulo === 'apoderado' ? r.titulo : null
      return { relacionadoId: r.relacionadoId, nombre: r.nombre, tipo: r.tipo, rol: s.rol, titulo, motivo: s.motivo,
        origen: { fuente: 'relacion_correduria' as const, cliente_id: clienteId, relacionado_id: r.relacionadoId, tipo: r.tipo, titulo: r.titulo ?? null } }
    })
    .sort((a, b) => orden[a.rol ?? 'ninguno'] - orden[b.rol ?? 'ninguno'] || a.nombre.localeCompare(b.nombre, 'es'))
}

export type CambioRelacion =
  | { estado: 'igual' }
  | { estado: 'cambio'; antes: string; ahora: string; rolSugerido: RolMiembro | null }
  | { estado: 'desaparecida' }
  | { estado: 'no_se_sabe' }

/**
 * Compara el origen guardado de un miembro con las relaciones de HOY. Solo AVISA: el rol no se toca sin el clic del operador.
 * `relaciones: null` (no se pudo leer) → `no_se_sabe`, nunca «desaparecida».
 */
export function cambioDeRelacion(origen: unknown, relaciones: readonly RelacionLeida[] | null): CambioRelacion | null {
  if (!origen || typeof origen !== 'object') return null
  const o = origen as Record<string, unknown>
  if (o.fuente !== 'relacion_correduria' || typeof o.relacionado_id !== 'string') return null
  if (relaciones === null) return { estado: 'no_se_sabe' }
  const r = relaciones.find((x) => x.relacionadoId === o.relacionado_id)
  if (!r) return { estado: 'desaparecida' }
  const antes = `${String(o.tipo ?? '')}${o.titulo ? ` · ${String(o.titulo)}` : ''}`
  const ahora = `${r.tipo}${r.titulo ? ` · ${r.titulo}` : ''}`
  return antes === ahora ? { estado: 'igual' } : { estado: 'cambio', antes, ahora, rolSugerido: rolSugerido(r).rol }
}

/** Lee la respuesta del puerto de relaciones de asegura a `RelacionLeida[]` (o null si no se pudo leer). */
export function relacionesLeidas(v: unknown): RelacionLeida[] | null {
  if (!Array.isArray(v)) return null
  const out: RelacionLeida[] = []
  for (const x of v) {
    if (!x || typeof x !== 'object') continue
    const o = x as Record<string, unknown>
    if (typeof o.relacionadoId !== 'string' || typeof o.tipo !== 'string' || !o.tipo.trim()) continue
    const aut = o.autorizacion as Record<string, unknown> | null | undefined
    const titulo = aut && typeof aut === 'object' && typeof aut.tituloRepresentacion === 'string' ? aut.tituloRepresentacion : null
    out.push({ relacionadoId: o.relacionadoId, nombre: typeof o.nombre === 'string' && o.nombre.trim() ? o.nombre : 'sin nombre', tipo: o.tipo,
      tipoPersona: o.tipoPersona === 'fisica' || o.tipoPersona === 'juridica' ? o.tipoPersona : null, titulo })
  }
  return out
}
