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
export const VERSION_CATALOGO = 3

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
/**
 * Asistencia en el hogar AMPLIADA (29/09/2026). Como la de viaje: todas se llaman «Asistencia en el hogar» y
 * el nivel va en el texto (Fidelidade: «ASISTENCIA HOGAR AMPLIADA…» / «ASISTENCIA HOGAR BÁSICA…»). La fija
 * `asistenciaHogarAmpliada()`; sin señal, `no_consta`.
 */
const ASISTENCIA_HOGAR_AMPLIADA: GarantiaCatalogo = { clave: 'asistencia_hogar_ampliada', etiqueta: 'Asistencia en el hogar ampliada', patrones: [] }
const SUSTITUCION: GarantiaCatalogo = { clave: 'vehiculo_sustitucion', etiqueta: 'Vehículo de sustitución', patrones: [/\bvehiculo (de )?sustitucion\b/, /\bcoche de sustitucion\b/, /\bvehiculo de reemplazo\b/] }
const CONDUCTOR: GarantiaCatalogo = { clave: 'conductor', etiqueta: 'Seguro del conductor y ocupantes', patrones: [/\bconductor\b/, /\bocupantes\b/, /\baccidentes personales\b/] }
const INCENDIO_VEH: GarantiaCatalogo = { clave: 'incendio', etiqueta: 'Incendio', patrones: [/\bincendio\b/] }
const ROBO_VEH: GarantiaCatalogo = { clave: 'robo', etiqueta: 'Robo', patrones: [/\brobo\b/, /\bhurto\b/], excluye: [/\baccesorios?\b/, /\bequipaje\b/, /\bobjetos?\b/] }
const DANOS_PROPIOS: GarantiaCatalogo = { clave: 'danos_propios', etiqueta: 'Daños propios (todo riesgo)', patrones: [/\bdanos propios\b/, /\btodo riesgo\b/, /\bdanos al vehiculo\b/], excluye: [/\bcargador\b/] }
const PERDIDA_TOTAL: GarantiaCatalogo = { clave: 'perdida_total', etiqueta: 'Pérdida total', patrones: [/\bperdida total\b/, /\bgrandes danos\b/, /\bsiniestro total\b/] }
/** Choque o atropello de animales (29/09/2026). Occident lo da SUELTO en terceros («Daños propios» con solo esto dentro). */
const ANIMALES_VEH: GarantiaCatalogo = { clave: 'colision_animales', etiqueta: 'Choque con animales', patrones: [/\banimales\b/, /\bcinegetic/, /\batropello\b/] }
const FENOMENOS_VEH: GarantiaCatalogo = { clave: 'fenomenos_atmosfericos', etiqueta: 'Fenómenos atmosféricos', patrones: [/\bfenomenos? atmosfericos?\b/, /\bgranizo\b/, /\binundacion\b/] }

export const CATALOGO_GARANTIAS: Record<RamoGarantias, readonly GarantiaCatalogo[]> = {
  auto: [
    RC_OBLIGATORIA, RC_VOLUNTARIA, DEFENSA, MULTAS, CARNET, ASISTENCIA_VIAJE, ASISTENCIA_AMPLIADA,
    { clave: 'lunas', etiqueta: 'Lunas', patrones: [/\blunas?\b/, /\bcristales\b/, /\blunetas?\b/] },
    ROBO_VEH, INCENDIO_VEH, FENOMENOS_VEH, DANOS_PROPIOS, ANIMALES_VEH, PERDIDA_TOTAL, SUSTITUCION, CONDUCTOR,
  ],
  moto: [
    RC_OBLIGATORIA, RC_VOLUNTARIA, DEFENSA, MULTAS, CARNET, ASISTENCIA_VIAJE, ASISTENCIA_AMPLIADA,
    ROBO_VEH, INCENDIO_VEH, FENOMENOS_VEH, DANOS_PROPIOS, ANIMALES_VEH, PERDIDA_TOTAL, SUSTITUCION, CONDUCTOR,
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
    // «Asistencia en viaje / Accidentes» (Allianz, Fidelidade) NO es la del hogar: sin el `viaje` su «no incluida» contaba aquí.
    { clave: 'asistencia_hogar', etiqueta: 'Asistencia en el hogar', patrones: [/\basistencia\b/, /\bmanitas\b/, /\bcerrajer/, /\breparaciones urgentes\b/], excluye: [/\bjuridica\b/, /\binformatica\b/, /\bviaje\b/] },
    ASISTENCIA_HOGAR_AMPLIADA,
    { clave: 'todo_riesgo_accidental', etiqueta: 'Todo riesgo accidental', patrones: [/\btodo riesgo\b/, /\bdanos accidentales\b/] },
    { clave: 'restauracion_estetica', etiqueta: 'Restauración estética', patrones: [/\brestauracion estetica\b/, /\bdanos esteticos\b/] },
    { clave: 'animales', etiqueta: 'Animales domésticos', patrones: [/\banimales\b/, /\bmascotas?\b/] },
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

/** Garantías que una PARTE de otro bloque puede afirmar por sí sola (su nombre no admite otra lectura). */
const CLAVES_DE_PARTE: readonly string[] = ['colision_animales', 'fenomenos_atmosfericos']

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
  const anotar = (clave: string, estado: EstadoGarantia) => {
    if (PESO[estado] > PESO[porClave[clave] ?? 'no_consta']) porClave[clave] = estado
  }
  for (const c of lista ?? []) {
    const estado: EstadoGarantia = c.incluida === true ? 'si' : c.incluida === false || esOpcionalSinMarcar(c) ? 'no' : 'no_consta'
    const subs = subcoberturas(c.texto)
    if (subs.length === 0) {
      for (const clave of clavesDe(ramo, c.nombre)) anotar(clave, estado)
      continue
    }
    // El texto enumera lo que lleva DENTRO: manda eso, no el nombre del bloque. Occident llama
    // «Daños propios» a un bloque que en terceros solo trae animales y fenómenos: por el nombre
    // salía «daños propios: sí» en un terceros básico.
    // Una parte solo habla de las garantías del propio bloque y de las que no admiten otra lectura:
    // «Rc incendio» dentro de la RC obligatoria NO es la garantía de incendio del vehículo.
    const propias = clavesDe(ramo, c.nombre)
    const admitidas = new Set([...propias, ...CLAVES_DE_PARTE])
    const dentro = new Set<string>()
    let todasReconocidas = true
    for (const s of subs) {
      const e: EstadoGarantia = estado === 'si' ? s.estado : estado
      if (clavesDe(ramo, s.nombre).length === 0) todasReconocidas = false
      for (const clave of clavesDe(ramo, s.nombre)) {
        if (!admitidas.has(clave)) continue
        if (s.estado !== 'no_consta') dentro.add(clave)
        anotar(clave, e)
      }
    }
    // Lo que el nombre promete y la lista no trae: el bloque está y eso no va en él. Solo se afirma
    // «no» si TODAS las partes son garantías reconocidas; una parte que no se entiende («» Franquicia:
    // 300 €») podría ser justo lo que falta, y entonces es «no consta».
    for (const clave of propias) {
      if (dentro.has(clave)) continue
      anotar(clave, estado !== 'si' ? estado : todasReconocidas ? 'no' : 'no_consta')
    }
  }
  if ('asistencia_ampliada' in porClave) porClave.asistencia_ampliada = asistenciaAmpliada(lista, opciones)
  if ('asistencia_hogar_ampliada' in porClave) porClave.asistencia_hogar_ampliada = asistenciaHogarAmpliada(lista)
  // La opción con la que se tarificó manda sobre la lista de coberturas: es la elección real.
  for (const [clave, estado] of Object.entries(garantiasDeOpciones(opciones))) {
    if (clave in porClave) porClave[clave] = estado
  }
  return { version: VERSION_CATALOGO, porClave }
}

/**
 * Opciones del producto que dicen SÍ o NO a una garantía del catálogo (29/09/2026). Lista CERRADA de
 * etiquetas medidas en `tarificacion_precios.opciones`, no los patrones del catálogo: esos casarían
 * con preguntas de tarificación («El conductor habitual es hijo de asegurado: No») y fabricarían un
 * «no» falso. Medido: Allianz «Vehículo de sustitución: No», Generali «Retirada de carnet: Sin
 * contratar», Reale «Retirada de carnet: Excluida - 0 €» y «Reclamación de multas: Excluida».
 */
const OPCION_GARANTIA: readonly { clave: string; etiqueta: RegExp }[] = [
  { clave: 'vehiculo_sustitucion', etiqueta: /^(vehiculo|coche) de sustitucion$/ },
  { clave: 'retirada_carnet', etiqueta: /^retirada (del |de )?carne?t?$/ },
  { clave: 'defensa_multas', etiqueta: /^(reclamacion|defensa|recurso) (de |en )?multas$/ },
  // Hogar, Fidelidade: «Todo riesgo accidental: No».
  { clave: 'todo_riesgo_accidental', etiqueta: /^todo riesgo accidental$/ },
]
const VALOR_NO = /^(no|sin contratar|no contratad[ao]|excluid[ao])\b/
const VALOR_SI = /^(si|incluid[ao]|contratad[ao])\b/
/** Valor que habla de OTRA garantía: Reale «Asistencia en viaje: SIN vehículo de sustitución». */
const VALOR_SUSTITUCION = /^(sin|con) vehiculo de sustitucion\b/

/** PURO. Lo que las opciones afirman de cada garantía; lo que no afirman, no sale (no es un «no»). */
export function garantiasDeOpciones(opciones: readonly OpcionProductoLegible[] | null | undefined): Record<string, EstadoGarantia> {
  const r: Record<string, EstadoGarantia> = {}
  for (const o of opciones ?? []) {
    const e = claveCobertura(o.etiqueta)
    const v = claveCobertura(o.valor)
    const s = VALOR_SUSTITUCION.exec(v)
    if (s) {
      r.vehiculo_sustitucion = s[1] === 'sin' ? 'no' : 'si'
      continue
    }
    const g = OPCION_GARANTIA.find((x) => x.etiqueta.test(e))
    if (!g) continue
    if (VALOR_NO.test(v)) r[g.clave] = 'no'
    else if (VALOR_SI.test(v)) r[g.clave] = 'si'
  }
  return r
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

/**
 * Una cobertura que el vendor manda SIN decir si va incluida y cuyo texto la declara «(opcional)»: es un
 * extra que no está en este precio (Fidelidade hogar: «TODO RIESGO ACCIDENTAL (OPCIONAL)…», `incluida`
 * null). Solo con los paréntesis: «Opcional» suelto puede ser parte de otra frase. Si el vendor dice
 * `incluida: true`, manda él aunque el texto diga «(opcional)» (Allianz lo hace).
 */
function esOpcionalSinMarcar(c: CoberturaParaClasificar): boolean {
  return c.incluida == null && typeof c.texto === 'string' && /\(\s*opcional\s*\)/i.test(c.texto)
}

/** PURO. Asistencia en el hogar ampliada según el texto (Fidelidade: «ASISTENCIA HOGAR AMPLIADA/BÁSICA»). */
export function asistenciaHogarAmpliada(lista: readonly CoberturaParaClasificar[] | null): EstadoGarantia {
  let r: EstadoGarantia = 'no_consta'
  for (const c of lista ?? []) {
    if (!c.texto) continue
    const m = /^asistencia (en el )?hogar (ampliada|basica)\b/.exec(claveCobertura(c.texto))
    if (!m) continue
    // La ampliada incluida es un sí; la ampliada marcada NO incluida o la básica incluida, un no.
    if (m[2] === 'ampliada' && c.incluida === true) return 'si'
    if ((m[2] === 'ampliada' && c.incluida === false) || (m[2] === 'basica' && c.incluida === true)) r = 'no'
  }
  return r
}

/**
 * Las partes de una cobertura cuyo texto las ENUMERA (Occident: «» Animales cinegéticos y domésticos:
 * Incluida.  : CONTRATADA.» Fenómenos atmosféricos con franquicia: Franquicia 600 €.  : CONTRATADA»).
 * PURO. Solo con ese formato (»); un texto en prosa devuelve `[]` y se clasifica por el nombre.
 * Estado de cada parte: «no contratada / no incluida / excluida» → `no`; «opcional» sin más → `no_consta`; lo demás → `si`.
 */
export function subcoberturas(texto: string | null | undefined): { nombre: string; estado: EstadoGarantia }[] {
  if (typeof texto !== 'string' || !texto.includes('»')) return []
  return texto
    .split('»')
    .map((t) => t.trim())
    .filter((t) => t.includes(':'))
    .map((t) => {
      const nombre = t.slice(0, t.indexOf(':')).trim()
      const crudo = t.slice(t.indexOf(':') + 1)
      const resto = claveCobertura(crudo)
      // El valor es la PRIMERA frase («Incluida», «Opcional (no incluida)») y el sello final («: CONTRATADA»).
      // «(Robo e incendio excluida franquicia)» más adelante habla de la franquicia, no de la garantía.
      const valor = claveCobertura(crudo.split('.')[0] ?? '')
      const sello = claveCobertura(crudo.slice(crudo.lastIndexOf(':') + 1))
      const NO = /\b(no contratad[ao]|no incluid[ao]|excluid[ao]|sin contratar)\b/
      const no = NO.test(valor) || (crudo.includes(':') && NO.test(sello))
      // «Exceso de equipamiento opcional (incendio, robo y daños propios): 1.500 €» es un límite, no una garantía.
      const opcional = /\bopcional\b/.test(claveCobertura(nombre)) || /\bopcional\b/.test(resto)
      return { nombre, estado: (no ? 'no' : opcional ? 'no_consta' : 'si') as EstadoGarantia }
    })
    .filter((s) => s.nombre !== '')
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

/** Un descuento comercial que la compañía aplicó al precio (opción de producto). */
export type DescuentoComercial = { etiqueta: string; pct: number }

/**
 * PURO. Los descuentos comerciales de un precio, leídos de sus opciones (29/09/2026). Medido:
 * Allianz «Descuento comercial % (CAP)» y «(venta cruzada)», Occident y Generali «Descuento comercial».
 * `null` = no se pudieron leer las opciones (no es «sin descuento»); `[]` = la compañía no manda
 * ninguno. Un 0 SÍ se devuelve: es un «sin descuento» afirmado por la compañía.
 */
export function descuentosDeOpciones(opciones: readonly OpcionProductoLegible[] | null | undefined): DescuentoComercial[] | null {
  if (opciones == null) return null
  const r: DescuentoComercial[] = []
  for (const o of opciones) {
    const e = claveCobertura(o.etiqueta)
    if (!/^descuento comercial\b/.test(e)) continue
    const limpio = String(o.valor).replace(',', '.').replace(/[%\s]/g, '')
    // Vacío no es 0: sería convertir un «no se sabe» en «sin descuento».
    if (limpio === '') continue
    const pct = Number(limpio)
    if (!Number.isFinite(pct)) continue
    const sufijo = /\(([^)]+)\)/.exec(o.etiqueta)?.[1]?.trim()
    r.push({ etiqueta: sufijo ?? 'comercial', pct })
  }
  return r
}
