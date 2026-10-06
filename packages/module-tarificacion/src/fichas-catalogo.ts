// FICHAS DE PRODUCTO — catálogo de GARANTÍAS canónicas (07/10/2026). PURO.
//
// Base del comparador multi-compañía de Grupo ASegura: cada compañía llama distinto a lo mismo
// («Daños por agua con búsqueda y reparación», «Localización y reparación de fugas»…). Para comparar
// Allianz con Mapfre, cada condición del condicionado tiene que caer en UNA clave de aquí.
//
// · Las claves que se solapan con la taxonomía de `@central/module-seguros` (`coberturas-taxonomia.ts`:
//   continente, contenido, danos_agua, incendio, rc_general…) se llaman IGUAL a propósito: un día se
//   cruzarán las dos lecturas (oferta subida a mano ↔ ficha del tarificador) sin tabla de traducción.
// · Una garantía que no casa NO se fuerza a una clave: va a `extras` con su literal (nunca se inventa clave).
// · Extensible: otro ramo = otra entrada en `CATALOGO_FICHAS` (y su valor en `RAMOS_FICHA`).

export const RAMOS_FICHA = ['comunidades', 'rc'] as const
export type RamoFicha = (typeof RAMOS_FICHA)[number]

export type GrupoGarantiaFicha = 'danos' | 'rc' | 'asistencia' | 'juridica' | 'otros'
/** Qué número es el natural de la garantía: un CAPITAL del presupuesto, un LÍMITE del condicionado o un servicio. */
export type TipoValorFicha = 'capital' | 'limite' | 'servicio'

export type GarantiaFicha = {
  clave: string
  etiqueta: string
  grupo: GrupoGarantiaFicha
  tipoValor: TipoValorFicha
  /** Sinónimos YA normalizados (`normalizarLiteral`). Se busca por palabras completas; gana el más largo. */
  sinonimos: readonly string[]
}

const g = (clave: string, etiqueta: string, grupo: GrupoGarantiaFicha, tipoValor: TipoValorFicha, sinonimos: string[]): GarantiaFicha =>
  ({ clave, etiqueta, grupo, tipoValor, sinonimos })

const COMUNIDADES: readonly GarantiaFicha[] = [
  // ── Daños ──
  g('continente', 'Continente / edificación', 'danos', 'capital', ['continente', 'edificacion', 'edificio', 'capital edificio', 'valor de reposicion edificacion', 'edificacion valor reposicion']),
  g('contenido', 'Contenido / mobiliario comunitario', 'danos', 'capital', ['contenido', 'mobiliario comunitario', 'mobiliario comun', 'enseres comunes', 'enseres']),
  g('incendio', 'Incendio, explosión y caída del rayo', 'danos', 'servicio', ['incendio', 'explosion', 'caida del rayo', 'incendio y explosion', 'incendio explosion y caida de rayo']),
  g('fenomenos_atmosfericos', 'Fenómenos atmosféricos', 'danos', 'limite', ['fenomenos atmosfericos', 'fenomenos meteorologicos', 'lluvia viento pedrisco y nieve', 'lluvia viento', 'pedrisco', 'tormenta']),
  g('danos_agua', 'Daños por agua', 'danos', 'limite', ['danos por agua', 'danos agua', 'escape de agua', 'escapes de agua', 'derrame de agua']),
  g('danos_agua_localizacion', 'Daños por agua: localización y reparación de la avería', 'danos', 'limite', ['localizacion y reparacion', 'busqueda y reparacion', 'localizacion de fugas', 'localizacion de averias', 'reparacion de la averia', 'gastos de localizacion', 'reparacion de tuberias']),
  g('danos_agua_sin_localizacion', 'Daños por agua sin localización de la causa', 'danos', 'limite', ['sin localizacion', 'sin causa localizada', 'filtraciones sin localizar', 'agua sin localizacion']),
  g('rotura_cristales', 'Rotura de cristales', 'danos', 'limite', ['rotura de cristales', 'cristales', 'lunas', 'rotura de lunas', 'vidrios', 'loza sanitaria']),
  g('rotura_maquinaria', 'Rotura de maquinaria / averías', 'danos', 'limite', ['rotura de maquinaria', 'averia de maquinaria', 'averias de maquinaria', 'averia maquinaria', 'maquinaria', 'averia de ascensor', 'equipos electronicos']),
  g('danos_electricos', 'Daños eléctricos', 'danos', 'limite', ['danos electricos', 'dano electrico', 'sobretension', 'cortocircuito']),
  g('robo', 'Robo y expoliación', 'danos', 'limite', ['robo', 'expoliacion', 'robo y expoliacion', 'hurto', 'atraco']),
  g('actos_vandalicos', 'Actos vandálicos o malintencionados', 'danos', 'limite', ['actos vandalicos', 'vandalismo', 'actos malintencionados', 'graffitis', 'pintadas']),
  g('valor_estetico', 'Valor estético / restauración estética', 'danos', 'limite', ['valor estetico', 'restauracion estetica', 'danos esteticos', 'perdida estetica']),
  g('derrumbe', 'Derrumbe / hundimiento', 'danos', 'limite', ['derrumbe', 'derrumbamiento', 'hundimiento']),
  g('gastos_desescombro', 'Gastos de demolición y desescombro', 'danos', 'limite', ['desescombro', 'demolicion', 'gastos de demolicion', 'salvamento']),
  g('perdida_alquileres', 'Pérdida de alquileres / inhabitabilidad', 'otros', 'limite', ['perdida de alquileres', 'perdida de rentas', 'inhabitabilidad', 'alojamiento provisional', 'gastos de alojamiento']),
  // ── Responsabilidad civil ──
  g('rc_general', 'RC general / de la comunidad (inmobiliaria)', 'rc', 'limite', ['responsabilidad civil', 'rc', 'rc general', 'responsabilidad civil general', 'responsabilidad civil inmobiliaria', 'rc inmobiliaria', 'responsabilidad civil de la comunidad', 'rc comunidad', 'rc de la comunidad', 'propiedad del inmueble']),
  g('rc_cruzada', 'RC cruzada entre copropietarios', 'rc', 'limite', ['rc cruzada', 'responsabilidad civil cruzada', 'entre copropietarios', 'copropietarios entre si']),
  g('rc_agua', 'RC por daños por agua', 'rc', 'limite', ['rc por agua', 'rc agua', 'responsabilidad civil por agua', 'responsabilidad civil por danos por agua', 'rc danos por agua', 'rc por danos por agua']),
  g('rc_organos_gobierno', 'RC de órganos de gobierno (presidente, administrador)', 'rc', 'limite', ['organos de gobierno', 'rc organos de gobierno', 'rc administradores', 'rc presidente', 'junta de gobierno', 'cargos directivos']),
  g('rc_patronal', 'RC patronal (empleados de la finca)', 'rc', 'limite', ['rc patronal', 'responsabilidad civil patronal', 'patronal']),
  // ── Asistencia y servicios ──
  g('asistencia', 'Asistencia 24 h (urgencias, manitas)', 'asistencia', 'servicio', ['asistencia', 'asistencia 24 horas', 'asistencia 24 h', 'servicio de urgencia', 'urgencias 24', 'reparaciones urgentes', 'cerrajeria']),
  g('control_plagas', 'Control de plagas (desinsectación / desratización)', 'asistencia', 'servicio', ['plagas', 'control de plagas', 'asistencia plagas', 'desinsectacion', 'desratizacion', 'tratamiento de plagas']),
  g('desatascos', 'Desatascos', 'asistencia', 'limite', ['desatasco', 'desatascos', 'atascos', 'obstruccion de tuberias', 'obstruccion de bajantes']),
  g('ite', 'Inspección técnica de edificios (ITE / IEE)', 'asistencia', 'servicio', ['ite', 'inspeccion tecnica de edificios', 'inspeccion tecnica', 'iee', 'informe de evaluacion del edificio']),
  // ── Jurídico ──
  g('defensa_juridica', 'Defensa jurídica y reclamación de daños', 'juridica', 'limite', ['defensa juridica', 'defensa legal', 'proteccion juridica', 'reclamacion de danos', 'defensa penal', 'fianzas']),
  g('asesoramiento_juridico', 'Asesoramiento jurídico (telefónico / LPH)', 'juridica', 'servicio', ['asesoramiento juridico', 'asesoramiento legal', 'consulta juridica', 'orientacion juridica', 'asesoramiento telefonico']),
  g('impago_cuotas', 'Impago de cuotas de comunidad', 'juridica', 'limite', ['impago de cuotas', 'impago cuotas', 'reclamacion de cuotas', 'morosidad', 'cuotas impagadas', 'recobro de cuotas']),
]

// RC general / de actividad (08/10/2026). Ramo canónico sin compañía registrada todavía (la primera: Occident).
// `limite_indemnizacion` es el CAPITAL contratado (suma asegurada del presupuesto); el resto, límites/sublímites del condicionado.
const RC: readonly GarantiaFicha[] = [
  // ── Responsabilidad civil ──
  g('limite_indemnizacion', 'Límite de indemnización (suma asegurada)', 'rc', 'capital', ['limite de indemnizacion', 'suma asegurada', 'capital asegurado', 'limite por siniestro', 'limite maximo de indemnizacion', 'limite de cobertura']),
  g('limite_agregado_anual', 'Límite agregado anual', 'rc', 'limite', ['limite agregado', 'agregado anual', 'limite anual', 'limite maximo por anualidad', 'limite por anualidad de seguro']),
  g('rc_explotacion', 'RC de explotación (actividad)', 'rc', 'limite', ['rc explotacion', 'responsabilidad civil de explotacion', 'responsabilidad civil explotacion', 'explotacion', 'rc general', 'responsabilidad civil general', 'rc de la actividad', 'responsabilidad civil de la actividad', 'rc actividad']),
  g('rc_patronal', 'RC patronal (empleados)', 'rc', 'limite', ['rc patronal', 'responsabilidad civil patronal', 'patronal', 'rc empleador', 'responsabilidad civil del empleador']),
  g('sublimite_victima_patronal', 'Sublímite por víctima (RC patronal)', 'rc', 'limite', ['sublimite por victima', 'limite por victima', 'sublimite victima', 'sublimite por victima patronal', 'maximo por victima']),
  g('rc_productos', 'RC de productos', 'rc', 'limite', ['rc productos', 'responsabilidad civil de productos', 'responsabilidad civil productos', 'productos entregados']),
  g('rc_post_trabajos', 'RC post-trabajos / trabajos terminados', 'rc', 'limite', ['rc post trabajos', 'post trabajos', 'responsabilidad civil post trabajos', 'trabajos terminados', 'rc trabajos terminados', 'despues de la entrega', 'post entrega']),
  g('rc_locativa', 'RC locativa (daños al local alquilado)', 'rc', 'limite', ['rc locativa', 'responsabilidad civil locativa', 'locativa', 'danos al local arrendado', 'danos al inmueble alquilado', 'responsabilidad del arrendatario']),
  g('rc_cruzada', 'RC cruzada', 'rc', 'limite', ['rc cruzada', 'responsabilidad civil cruzada']),
  g('rc_contaminacion_accidental', 'RC por contaminación accidental', 'rc', 'limite', ['contaminacion accidental', 'rc contaminacion', 'responsabilidad civil por contaminacion', 'polucion accidental']),
  g('rc_subsidiaria', 'RC subsidiaria / de contratistas y subcontratistas', 'rc', 'limite', ['rc subsidiaria', 'responsabilidad civil subsidiaria', 'subcontratistas', 'contratistas y subcontratistas', 'rc subcontratistas']),
  g('rc_gastos_prevencion', 'Gastos de prevención y salvamento', 'rc', 'limite', ['gastos de prevencion', 'gastos de salvamento', 'prevencion y salvamento', 'salvamento y prevencion']),
  // ── Jurídico ──
  g('defensa_juridica', 'Defensa jurídica y reclamación de daños', 'juridica', 'limite', ['defensa juridica', 'defensa legal', 'defensa y reclamacion', 'reclamacion de danos', 'defensa penal', 'gastos de defensa']),
  g('fianzas_judiciales', 'Fianzas judiciales y constitución de fianzas', 'juridica', 'limite', ['fianzas', 'fianzas judiciales', 'constitucion de fianzas', 'fianza penal', 'fianza civil', 'defensa y fianzas']),
  // ── Otros ──
  g('franquicia_general', 'Franquicia general de la póliza', 'otros', 'limite', ['franquicia', 'franquicia general', 'franquicia por siniestro', 'franquicia a cargo del asegurado']),
  g('ambito_territorial', 'Ámbito territorial de la cobertura', 'otros', 'servicio', ['ambito territorial', 'ambito geografico', 'territorialidad', 'ambito de cobertura']),
  g('retroactividad', 'Retroactividad / cobertura de reclamaciones', 'otros', 'servicio', ['retroactividad', 'periodo de retroactividad', 'reclamaciones presentadas', 'claims made']),
]

export const CATALOGO_FICHAS: Readonly<Record<RamoFicha, readonly GarantiaFicha[]>> = {
  comunidades: COMUNIDADES,
  rc: RC,
}

export function esRamoFicha(v: unknown): v is RamoFicha {
  return typeof v === 'string' && (RAMOS_FICHA as readonly string[]).includes(v)
}

/** Garantías del ramo; un ramo sin catálogo devuelve [] (todo irá a `extras`, nunca a una clave inventada). */
export function garantiasFicha(ramo: string): readonly GarantiaFicha[] {
  return esRamoFicha(ramo) ? CATALOGO_FICHAS[ramo] : []
}

export function garantiaFicha(ramo: string, clave: string): GarantiaFicha | null {
  return garantiasFicha(ramo).find((x) => x.clave === clave) ?? null
}

/** Minúsculas, sin tildes, solo letras/números y espacios simples. */
export function normalizarLiteral(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ]+/g, ' ').trim()
}

/**
 * Literal de la compañía → clave del catálogo, o `null` si no se reconoce (va a `extras`).
 * Palabras completas; gana el sinónimo MÁS LARGO (así «RC por agua» no cae en «rc» ni en «daños por agua»).
 */
export function claveDeLiteral(ramo: string, literal: string): string | null {
  const t = ` ${normalizarLiteral(literal)} `
  if (t.trim() === '') return null
  let mejor: { clave: string; len: number } | null = null
  for (const gar of garantiasFicha(ramo)) {
    for (const s of gar.sinonimos) {
      if (t.includes(` ${s} `) && (mejor === null || s.length > mejor.len)) mejor = { clave: gar.clave, len: s.length }
    }
  }
  return mejor?.clave ?? null
}
