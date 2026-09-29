// Catálogo NORMALIZADO de garantías por ramo y el clasificador que lleva a él las coberturas que manda
// cada compañía (28/09/2026). PURO.
//
// Cada compañía llama distinto a lo mismo («Asistencia en viaje», «Grúa y asistencia»…). Para que el
// cliente —o Alberto en su parrilla— marque «Lunas» y vea qué compañías la incluyen y a qué precio,
// cada cobertura tiene que caer en UNA clave de este catálogo.
//
// 🚨 La regla que no se negocia: una garantía que no se reconoce, o cuya lista no llegó, es
// `no_consta` («no sabemos»), NUNCA `no`. `no` solo sale de una cobertura reconocida con
// `incluida === false`. Pintar «no incluye lunas» porque el nombre no casó con un patrón sería afirmar
// una ausencia sin haberla mirado.
//
// Los patrones se escriben sobre el nombre ya pasado por `claveCobertura` (sin tildes, minúsculas, sin
// signos). Los nombres de moto están sacados de coberturas reales de Codeoscopic; los de auto y hogar
// son el vocabulario del mercado y se afinan con `noReconocidas()`.

export type RamoGarantias = 'auto' | 'moto' | 'hogar' | 'decesos' | 'salud' | 'vida'
export type EstadoGarantia = 'si' | 'no' | 'no_consta'

export type GarantiaCatalogo = {
  clave: string
  /** Lo que ve el cliente en el interruptor. */
  etiqueta: string
  patrones: RegExp[]
  /** Falsos amigos: si casa alguno, NO es esta garantía aunque case un patrón. */
  excluye?: RegExp[]
}

export type CoberturaParaClasificar = { nombre: string; incluida: boolean | null; texto?: string | null }

export type GarantiasClasificadas = { version: number; porClave: Record<string, EstadoGarantia> }

/** Súbelo al cambiar patrones: lo guardado con otra versión se reclasifica desde las coberturas. */
export const VERSION_CATALOGO = 1

/** Misma normalización que la tabla de coberturas del portal: sin tildes, minúsculas, sin signos. */
export function claveCobertura(nombre: string): string {
  return nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim()
}

const RC_OBLIGATORIA: GarantiaCatalogo = { clave: 'rc_obligatoria', etiqueta: 'Responsabilidad civil obligatoria', patrones: [/\bresponsabilidad civil obligatoria\b/, /\brc obligatoria\b/, /\bseguro obligatorio\b/] }
const RC_VOLUNTARIA: GarantiaCatalogo = { clave: 'rc_voluntaria', etiqueta: 'Responsabilidad civil voluntaria', patrones: [/\bresponsabilidad civil voluntaria\b/, /\brc voluntaria\b/, /\bresponsabilidad civil suplementaria\b/] }
const DEFENSA: GarantiaCatalogo = { clave: 'defensa_juridica', etiqueta: 'Defensa jurídica', patrones: [/\bdefensa juridica\b/, /\bproteccion juridica\b/, /\breclamacion de danos\b/], excluye: [/\bmultas?\b/] }
const MULTAS: GarantiaCatalogo = { clave: 'defensa_multas', etiqueta: 'Defensa en multas', patrones: [/\bmultas?\b/] }
const CARNET: GarantiaCatalogo = { clave: 'retirada_carnet', etiqueta: 'Retirada de carné', patrones: [/\bretirada (del |de )?carne?t?\b/, /\bprivacion (temporal )?del? (permiso|carne?t?)\b/] }
const ASISTENCIA_VIAJE: GarantiaCatalogo = { clave: 'asistencia_viaje', etiqueta: 'Asistencia en viaje y grúa', patrones: [/\basistencia\b/, /\bgrua\b/, /\bremolque\b/], excluye: [/\bjuridica\b/] }
/**
 * Asistencia AMPLIADA (29/09/2026). No sale del NOMBRE —todas se llaman «Asistencia en viaje»—, sino del
 * texto de la cobertura (Occident: «Asistencia en viaje amplia: Opcional (no incluida)») o de la opción
 * de producto con la que se tarificó (Allianz: «Asistencia en Viaje: Estándar»). Sin patrones: la fija
 * `asistenciaAmpliada()`. Sin ninguna de las dos señales queda `no_consta`, nunca `no`.
 */
const ASISTENCIA_AMPLIADA: GarantiaCatalogo = { clave: 'asistencia_ampliada', etiqueta: 'Asistencia en viaje ampliada', patrones: [] }
const SUSTITUCION: GarantiaCatalogo = { clave: 'vehiculo_sustitucion', etiqueta: 'Vehículo de sustitución', patrones: [/\bvehiculo (de )?sustitucion\b/, /\bcoche de sustitucion\b/, /\bvehiculo de reemplazo\b/] }
const CONDUCTOR: GarantiaCatalogo = { clave: 'conductor', etiqueta: 'Seguro del conductor y ocupantes', patrones: [/\bconductor\b/, /\bocupantes\b/, /\baccidentes personales\b/] }
const INCENDIO_VEH: GarantiaCatalogo = { clave: 'incendio', etiqueta: 'Incendio', patrones: [/\bincendio\b/] }
const ROBO_VEH: GarantiaCatalogo = { clave: 'robo', etiqueta: 'Robo', patrones: [/\brobo\b/, /\bhurto\b/], excluye: [/\baccesorios?\b/, /\bequipaje\b/, /\bobjetos?\b/] }
const DANOS_PROPIOS: GarantiaCatalogo = { clave: 'danos_propios', etiqueta: 'Daños propios (todo riesgo)', patrones: [/\bdanos propios\b/, /\btodo riesgo\b/, /\bdanos al vehiculo\b/], excluye: [/\bcargador\b/] }
const PERDIDA_TOTAL: GarantiaCatalogo = { clave: 'perdida_total', etiqueta: 'Pérdida total', patrones: [/\bperdida total\b/, /\bgrandes danos\b/, /\bsiniestro total\b/] }
const FENOMENOS_VEH: GarantiaCatalogo = { clave: 'fenomenos_atmosfericos', etiqueta: 'Fenómenos atmosféricos', patrones: [/\bfenomenos? atmosfericos?\b/, /\bgranizo\b/, /\binundacion\b/] }

export const CATALOGO_GARANTIAS: Record<RamoGarantias, readonly GarantiaCatalogo[]> = {
  auto: [
    RC_OBLIGATORIA, RC_VOLUNTARIA, DEFENSA, MULTAS, CARNET, ASISTENCIA_VIAJE, ASISTENCIA_AMPLIADA,
    { clave: 'lunas', etiqueta: 'Lunas', patrones: [/\blunas?\b/, /\bcristales\b/, /\blunetas?\b/] },
    ROBO_VEH, INCENDIO_VEH, FENOMENOS_VEH, DANOS_PROPIOS, PERDIDA_TOTAL, SUSTITUCION, CONDUCTOR,
  ],
  moto: [
    RC_OBLIGATORIA, RC_VOLUNTARIA, DEFENSA, MULTAS, CARNET, ASISTENCIA_VIAJE, ASISTENCIA_AMPLIADA,
    ROBO_VEH, INCENDIO_VEH, FENOMENOS_VEH, DANOS_PROPIOS, PERDIDA_TOTAL, SUSTITUCION, CONDUCTOR,
    { clave: 'equipamiento', etiqueta: 'Casco y equipamiento', patrones: [/\bcasco\b/, /\bvestimenta\b/, /\bequipamiento\b/, /\bindumentaria\b/] },
    { clave: 'accesorios', etiqueta: 'Accesorios', patrones: [/\baccesorios?\b/] },
  ],
  hogar: [
    { clave: 'continente', etiqueta: 'Continente (la vivienda)', patrones: [/\bcontinente\b/, /\bedificio\b/] },
    { clave: 'contenido', etiqueta: 'Contenido (muebles y enseres)', patrones: [/\bcontenido\b/, /\bmobiliario\b/, /\benseres\b/] },
    { clave: 'danos_agua', etiqueta: 'Daños por agua', patrones: [/\bdanos por agua\b/, /\bagua\b/, /\bfugas?\b/, /\bfiltraciones?\b/] },
    { clave: 'rc_familiar', etiqueta: 'Responsabilidad civil', patrones: [/\bresponsabilidad civil\b/, /\brc\b/] },
    { clave: 'robo', etiqueta: 'Robo', patrones: [/\brobo\b/, /\bexpoliacion\b/, /\bhurto\b/], excluye: [/\bfuera del hogar\b/] },
    { clave: 'cristales', etiqueta: 'Rotura de cristales', patrones: [/\bcristales\b/, /\blunas\b/, /\bvitroceramica\b/, /\bespejos\b/] },
    { clave: 'danos_electricos', etiqueta: 'Daños eléctricos', patrones: [/\bdanos electricos\b/, /\belectric/] },
    { clave: 'fenomenos_atmosfericos', etiqueta: 'Fenómenos atmosféricos', patrones: [/\bfenomenos? atmosfericos?\b/, /\btormenta\b/, /\bviento\b/, /\bgranizo\b/, /\blluvia\b/] },
    { clave: 'incendio', etiqueta: 'Incendio', patrones: [/\bincendio\b/, /\bexplosion\b/] },
    { clave: 'asistencia_hogar', etiqueta: 'Asistencia en el hogar', patrones: [/\basistencia\b/, /\bmanitas\b/, /\bcerrajer/, /\breparaciones urgentes\b/], excluye: [/\bjuridica\b/, /\binformatica\b/] },
    { clave: 'electrodomesticos', etiqueta: 'Reparación de electrodomésticos', patrones: [/\belectrodomesticos?\b/, /\blinea blanca\b/] },
    { clave: 'joyas', etiqueta: 'Joyas y objetos de valor', patrones: [/\bjoyas?\b/, /\bobjetos de valor\b/] },
    { clave: 'defensa_juridica', etiqueta: 'Defensa jurídica', patrones: [/\bdefensa juridica\b/, /\bproteccion juridica\b/] },
  ],
  decesos: [
    { clave: 'servicio_funerario', etiqueta: 'Servicio funerario', patrones: [/\bservicio funerario\b/, /\bdecesos\b/, /\bsepelio\b/, /\bfuneral\b/, /\binhumacion\b/, /\bincineracion\b/] },
    { clave: 'traslado', etiqueta: 'Traslado nacional', patrones: [/\btraslado\b/], excluye: [/\binternacional\b/, /\bextranjero\b/] },
    { clave: 'repatriacion', etiqueta: 'Repatriación desde el extranjero', patrones: [/\brepatriacion\b/, /\btraslado internacional\b/, /\bextranjero\b/] },
    { clave: 'asistencia_viaje', etiqueta: 'Asistencia en viaje', patrones: [/\basistencia en viaje\b/, /\bviaje\b/] },
    { clave: 'gestoria', etiqueta: 'Gestoría y trámites', patrones: [/\bgestoria\b/, /\btramites?\b/, /\btestamento\b/] },
    { clave: 'asistencia_psicologica', etiqueta: 'Asistencia psicológica', patrones: [/\bpsicolog/, /\bduelo\b/] },
    { clave: 'segunda_opinion', etiqueta: 'Segunda opinión médica', patrones: [/\bsegunda opinion\b/] },
    { clave: 'capital_accidente', etiqueta: 'Indemnización por accidente', patrones: [/\baccidente\b/, /\bindemnizacion\b/] },
  ],
  salud: [
    { clave: 'medicina_general', etiqueta: 'Medicina general y pediatría', patrones: [/\bmedicina (general|primaria)\b/, /\bpediatria\b/, /\batencion primaria\b/] },
    { clave: 'especialistas', etiqueta: 'Especialistas', patrones: [/\bespecialistas?\b/, /\bespecialidades\b/] },
    { clave: 'urgencias', etiqueta: 'Urgencias', patrones: [/\burgencias?\b/] },
    { clave: 'pruebas', etiqueta: 'Pruebas diagnósticas', patrones: [/\bpruebas\b/, /\bdiagnostic/, /\banalisis\b/, /\bresonancia\b/] },
    { clave: 'hospitalizacion', etiqueta: 'Hospitalización y cirugía', patrones: [/\bhospitalizacion\b/, /\bcirugia\b/, /\bintervenciones?\b/, /\bingreso\b/] },
    { clave: 'parto', etiqueta: 'Embarazo y parto', patrones: [/\bparto\b/, /\bembarazo\b/, /\bmaternidad\b/] },
    { clave: 'dental', etiqueta: 'Dental', patrones: [/\bdental\b/, /\bodontolog/, /\bbucodental\b/] },
    { clave: 'fisioterapia', etiqueta: 'Fisioterapia', patrones: [/\bfisioterapia\b/, /\brehabilitacion\b/] },
    { clave: 'psicologia', etiqueta: 'Psicología', patrones: [/\bpsicolog/] },
    { clave: 'reembolso', etiqueta: 'Reembolso (médico libre)', patrones: [/\breembolso\b/, /\blibre eleccion\b/] },
    { clave: 'asistencia_viaje', etiqueta: 'Asistencia en viaje', patrones: [/\bviaje\b/, /\bextranjero\b/] },
  ],
  vida: [
    { clave: 'fallecimiento', etiqueta: 'Fallecimiento', patrones: [/\bfallecimiento\b/, /\bmuerte\b/], excluye: [/\baccidente\b/] },
    { clave: 'fallecimiento_accidente', etiqueta: 'Fallecimiento por accidente', patrones: [/\b(fallecimiento|muerte) (por|de) accidente\b/, /\baccidente\b.*\b(fallecimiento|muerte)\b/] },
    { clave: 'invalidez', etiqueta: 'Invalidez absoluta y permanente', patrones: [/\binvalidez\b/, /\bincapacidad permanente\b/, /\bipa\b/] },
    { clave: 'incapacidad_temporal', etiqueta: 'Incapacidad temporal (baja)', patrones: [/\bincapacidad temporal\b/, /\bbaja laboral\b/] },
    { clave: 'enfermedades_graves', etiqueta: 'Enfermedades graves', patrones: [/\benfermedades? graves?\b/, /\bcancer\b/] },
    { clave: 'asistencia', etiqueta: 'Servicios de asistencia', patrones: [/\basistencia\b/, /\bsegunda opinion\b/, /\btestamento\b/] },
  ],
}

/** Las claves del catálogo que describe UNA cobertura (normalmente una; «Rotura de faro/Casco» → una). */
function clavesDe(ramo: RamoGarantias, nombre: string): string[] {
  const n = claveCobertura(nombre)
  if (!n) return []
  return CATALOGO_GARANTIAS[ramo]
    .filter((g) => g.patrones.some((p) => p.test(n)) && !(g.excluye ?? []).some((p) => p.test(n)))
    .map((g) => g.clave)
}

const PESO: Record<EstadoGarantia, number> = { no_consta: 0, no: 1, si: 2 }

/**
 * Lleva las coberturas de UN precio al catálogo del ramo. Todas las claves salen en el resultado:
 * `si` (reconocida e incluida) · `no` (reconocida y marcada NO incluida) · `no_consta` (el resto).
 * Varias coberturas sobre la misma clave: gana `si` sobre `no`, y `no` sobre `no_consta`.
 * `lista === null` (no se pudieron leer) → todo `no_consta`.
 */
export function clasificarCoberturas(
  ramo: RamoGarantias,
  lista: readonly CoberturaParaClasificar[] | null,
  opciones?: readonly OpcionProductoLegible[] | null,
): GarantiasClasificadas {
  const porClave: Record<string, EstadoGarantia> = {}
  for (const g of CATALOGO_GARANTIAS[ramo]) porClave[g.clave] = 'no_consta'
  for (const c of lista ?? []) {
    const estado: EstadoGarantia = c.incluida === true ? 'si' : c.incluida === false ? 'no' : 'no_consta'
    for (const clave of clavesDe(ramo, c.nombre)) {
      if (PESO[estado] > PESO[porClave[clave] ?? 'no_consta']) porClave[clave] = estado
    }
  }
  if ('asistencia_ampliada' in porClave) porClave.asistencia_ampliada = asistenciaAmpliada(lista, opciones)
  return { version: VERSION_CATALOGO, porClave }
}

/** Una opción de producto legible del vendor (`formattedOptions`: etiqueta + valor). */
export type OpcionProductoLegible = { etiqueta: string; valor: string }

const AMPLIADA_SI = /\b(ampliad[ao]|amplia|plus|premium|superior|completa|total|extra)\b/
const AMPLIADA_NO = /\b(estandar|standard|basica|basico|basic)\b/

/**
 * Si el precio lleva asistencia AMPLIADA. PURO. Manda la opción con la que se tarificó (es la elección
 * real); si no la hay, el texto de la cobertura. `no` solo con una señal explícita: la opción dice
 * «Estándar/Básica», o el texto dice que la amplia es opcional / no incluida. Lo demás, `no_consta`.
 * 🚨 «SIN vehículo de sustitución» (Reale) habla del coche de sustitución, no del nivel de asistencia:
 * no se lee como «no ampliada».
 */
export function asistenciaAmpliada(
  lista: readonly CoberturaParaClasificar[] | null,
  opciones?: readonly OpcionProductoLegible[] | null,
): EstadoGarantia {
  for (const o of opciones ?? []) {
    if (!/\basistencia\b/.test(claveCobertura(o.etiqueta))) continue
    const v = claveCobertura(o.valor)
    if (AMPLIADA_SI.test(v)) return 'si'
    if (AMPLIADA_NO.test(v)) return 'no'
  }
  for (const c of lista ?? []) {
    if (!/\basistencia\b/.test(claveCobertura(c.nombre)) || !c.texto) continue
    const t = claveCobertura(c.texto)
    const m = /\basistencia (en )?viaje (ampliad[ao]|amplia)\b(.{0,40})/.exec(t)
    if (!m) continue
    if (/\b(opcional|no incluid[ao])\b/.test(m[3])) return 'no'
    if (/\bincluid[ao]\b/.test(m[3])) return 'si'
  }
  return 'no_consta'
}

/** Nombres que no casan con ninguna garantía del catálogo: la lista para ir afinando patrones. */
export function noReconocidas(ramo: RamoGarantias, lista: readonly CoberturaParaClasificar[] | null): string[] {
  return (lista ?? []).map((c) => c.nombre).filter((n) => clavesDe(ramo, n).length === 0)
}

/** El ramo del catálogo para un ramo de la cartera, o `null` si no tiene catálogo (no se filtra). */
const RAMOS_CATALOGO: readonly string[] = ['auto', 'moto', 'hogar', 'decesos', 'salud', 'vida']

export function ramoDeCatalogo(ramo: string | null | undefined): RamoGarantias | null {
  return typeof ramo === 'string' && RAMOS_CATALOGO.includes(ramo) ? (ramo as RamoGarantias) : null
}
