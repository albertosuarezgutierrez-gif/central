// Qué campos PROPIOS pide cada ramo al abrir/editar un SINIESTRO — no la póliza.
//
// Hermano de `campos-ramo.ts` de `@central/module-seguros-portal` (mismo
// contrato: `CampoRamo`, `TipoCampo`, `Readonly<Record<Ramo, readonly
// CampoRamo[]>>`, `normalizarDatosRamo()`), pero para siniestros: lo que hace
// falta saber al abrir un siniestro de auto (colisión, atestado, culpabilidad)
// no tiene nada que ver con lo que hace falta saber para tarificar la póliza
// (kilómetros anuales, valor del vehículo).
//
// 🚨 NO se duplica nada que YA sea cabecera de `Siniestro` en `siniestros.ts`:
// fecha/hora, lugar (CP/ciudad/provincia/dirección), descripción, tramitador,
// perito, gravedad, reserva, indemnización y referencia ya existen ahí. Este
// catálogo es SOLO lo que un ramo necesita ADEMÁS de la cabecera común.
//
// 🚨 NINGÚN CAMPO ES OBLIGATORIO (misma regla que pólizas): un cliente dando
// parte con el coche todavía en la cuneta no puede tener que rellenarlo todo
// para que se guarde lo que sí sabe.
//
// 🚨 `datosRamo` es EXCLUSIVO de siniestros `gestionado_correduria`. CIMA no
// manda este nivel de detalle (medido: 0 de 69 siniestros reales traen
// tramitador/perito/gravedad de CIMA, y el protocolo EIAC de siniestros no
// tiene un hueco para esto) — quien llama decide si ofrece la edición según el
// `origen`, este módulo no lo sabe ni lo necesita saber.
//
// ⚠️ El ramo aquí es el de la PÓLIZA (mismo vocabulario que `RAMOS_POLIZA` de
// `@central/module-seguros-portal`, duplicado como `RAMOS_SINIESTRO` porque
// este paquete no depende de aquel — si un ramo se añade allí, añádelo aquí
// también). NO es el `ramo` de `TIPOS_SINIESTRO` (`siniestros.ts`), que
// clasifica la CAUSA del siniestro y usa su propio vocabulario más corto
// (`'general'`, no `'responsabilidad_civil'`); son dos preguntas distintas y
// mezclarlas dejaría un siniestro de agua en una vivienda alquilada sin
// catálogo porque el ramo de la póliza es `hogar` y el de `TIPOS_SINIESTRO` es
// `'hogar'` también, pero un RC de un local sería `'general'` en uno y
// `'comercio'`/`'responsabilidad_civil'` en el otro.

/** Cómo se pinta un campo — idéntico al de `campos-ramo.ts`, mismo motivo. */
export type TipoCampo = 'texto' | 'numero' | 'dinero' | 'fecha' | 'opcion' | 'triestado'

export type OpcionCampo = { valor: string; etiqueta: string }

export type CampoRamoSiniestro = {
  /** Clave dentro del `jsonb`. Estable: renombrarla huérfana los datos ya guardados. */
  readonly id: string
  readonly etiqueta: string
  readonly tipo: TipoCampo
  readonly ayuda?: string
  readonly opciones?: readonly OpcionCampo[]
  readonly min?: number
  readonly max?: number
}

/** Ramos de póliza para los que este catálogo tiene sentido. Ver la cabecera. */
export const RAMOS_SINIESTRO = [
  'auto',
  'moto',
  'hogar',
  'vida',
  'salud',
  'decesos',
  'responsabilidad_civil',
  'comercio',
  'comunidades',
  'otros',
] as const
export type RamoSiniestro = (typeof RAMOS_SINIESTRO)[number]

/** Tope de un texto libre: por encima no es un dato, es un pegado. */
export const MAX_TEXTO_RAMO_SINIESTRO = 300

const OPCIONES_USO_VEHICULO: readonly OpcionCampo[] = [
  { valor: 'particular', etiqueta: 'Particular' },
  { valor: 'profesional', etiqueta: 'Profesional' },
  { valor: 'alquiler', etiqueta: 'Alquiler / VTC' },
  { valor: 'carga', etiqueta: 'Transporte de mercancías' },
]

const OPCIONES_TIPO_COLISION: readonly OpcionCampo[] = [
  { valor: 'trasera', etiqueta: 'Alcance por detrás' },
  { valor: 'frontal', etiqueta: 'Frontal' },
  { valor: 'lateral', etiqueta: 'Lateral' },
  { valor: 'estacionado', etiqueta: 'Estando estacionado' },
  { valor: 'vuelco', etiqueta: 'Vuelco / salida de vía' },
  { valor: 'atropello', etiqueta: 'Atropello' },
  { valor: 'otro', etiqueta: 'Otro' },
]

const OPCIONES_CUERPO_POLICIAL: readonly OpcionCampo[] = [
  { valor: 'policia_local', etiqueta: 'Policía Local' },
  { valor: 'guardia_civil', etiqueta: 'Guardia Civil (Tráfico)' },
  { valor: 'policia_nacional', etiqueta: 'Policía Nacional' },
  { valor: 'mossos', etiqueta: 'Mossos d’Esquadra' },
  { valor: 'ertzaintza', etiqueta: 'Ertzaintza' },
]

const OPCIONES_CULPABILIDAD: readonly OpcionCampo[] = [
  { valor: 'propia', etiqueta: 'Mía' },
  { valor: 'contrario', etiqueta: 'Del contrario' },
  { valor: 'concurrente', etiqueta: 'Concurrente (de los dos)' },
  { valor: 'indeterminada', etiqueta: 'Sin determinar todavía' },
]

const OPCIONES_ZONA_IMPACTO: readonly OpcionCampo[] = [
  { valor: 'frontal', etiqueta: 'Frontal' },
  { valor: 'trasera', etiqueta: 'Trasera' },
  { valor: 'lateral_izquierdo', etiqueta: 'Lateral izquierdo' },
  { valor: 'lateral_derecho', etiqueta: 'Lateral derecho' },
  { valor: 'parabrisas_lunas', etiqueta: 'Parabrisas o lunas' },
  { valor: 'techo_bajos', etiqueta: 'Techo o bajos (vuelco)' },
]

/** Auto y moto comparten dinámica de accidente: mismo catálogo. */
const CAMPOS_ACCIDENTE_VEHICULO: readonly CampoRamoSiniestro[] = [
  { id: 'usoVehiculo', etiqueta: '¿Para qué se usaba el vehículo?', tipo: 'opcion', opciones: OPCIONES_USO_VEHICULO },
  {
    id: 'conductorDistintoTomador',
    etiqueta: '¿Conducía alguien distinto del tomador?',
    tipo: 'triestado',
    ayuda: 'Si no lo sabes, déjalo en blanco.',
  },
  {
    id: 'conductorNombre',
    etiqueta: 'Nombre del conductor (si no era el tomador)',
    tipo: 'texto',
  },
  { id: 'tipoColision', etiqueta: 'Tipo de colisión', tipo: 'opcion', opciones: OPCIONES_TIPO_COLISION },
  {
    id: 'existeAtestado',
    etiqueta: '¿Hay atestado policial?',
    tipo: 'triestado',
    ayuda: 'Si no lo sabes o todavía no lo has pedido, déjalo en blanco.',
  },
  { id: 'cuerpoPolicial', etiqueta: 'Cuerpo policial que intervino', tipo: 'opcion', opciones: OPCIONES_CUERPO_POLICIAL },
  {
    id: 'existeDeclaracionAmistosa',
    etiqueta: '¿Se rellenó una declaración amistosa (parte europeo)?',
    tipo: 'triestado',
  },
  { id: 'culpabilidad', etiqueta: '¿De quién es la culpa?', tipo: 'opcion', opciones: OPCIONES_CULPABILIDAD },
  { id: 'zonaImpacto', etiqueta: 'Zona del impacto en tu vehículo', tipo: 'opcion', opciones: OPCIONES_ZONA_IMPACTO },
  {
    id: 'vehiculoInmovilizado',
    etiqueta: '¿El vehículo no puede circular por sus propios medios?',
    tipo: 'triestado',
    ayuda: 'Marca «Sí» si hace falta grúa.',
  },
  {
    id: 'existenLesionados',
    etiqueta: '¿Hay algún herido?',
    tipo: 'triestado',
    ayuda: 'Por defecto no se supone nada: si no lo sabes, déjalo en blanco.',
  },
  { id: 'tallerNombre', etiqueta: 'Taller donde se va a reparar (si ya lo sabes)', tipo: 'texto' },
]

const OPCIONES_TIPO_INMUEBLE: readonly OpcionCampo[] = [
  { valor: 'piso', etiqueta: 'Piso' },
  { valor: 'unifamiliar', etiqueta: 'Vivienda unifamiliar' },
  { valor: 'local_comercial', etiqueta: 'Local comercial' },
  { valor: 'nave_industrial', etiqueta: 'Nave industrial' },
  { valor: 'comunidad', etiqueta: 'Zonas comunes de la comunidad' },
]

const OPCIONES_MODALIDAD_COBRO: readonly OpcionCampo[] = [
  { valor: 'indemnizacion_directa', etiqueta: 'Indemnización directa a mí' },
  { valor: 'reparacion_red', etiqueta: 'Reparación por un gremio de la compañía' },
]

const GREMIOS: readonly OpcionCampo[] = [
  { valor: 'fontanero', etiqueta: 'Fontanero' },
  { valor: 'albanil', etiqueta: 'Albañil' },
  { valor: 'pintor', etiqueta: 'Pintor' },
  { valor: 'parquetista', etiqueta: 'Parquetista / suelos' },
  { valor: 'electricista', etiqueta: 'Electricista' },
  { valor: 'cristalero', etiqueta: 'Cristalero' },
]

const CAMPOS_HOGAR: readonly CampoRamoSiniestro[] = [
  { id: 'tipoInmueble', etiqueta: 'Tipo de inmueble afectado', tipo: 'opcion', opciones: OPCIONES_TIPO_INMUEBLE },
  {
    id: 'habitabilidadAfectada',
    etiqueta: '¿La vivienda ha quedado inhabitable?',
    tipo: 'triestado',
    ayuda: 'Marca «Sí» si hay que buscar alojamiento mientras se repara.',
  },
  {
    id: 'requiereIntervencionUrgente',
    etiqueta: '¿Hace falta una intervención urgente ahora mismo?',
    tipo: 'triestado',
    ayuda: 'Cerrar la llave de paso, tapar un cristal roto, cortar la luz…',
  },
  {
    id: 'gremioRequerido',
    etiqueta: 'Gremio que hace falta (el principal, si hay varios)',
    tipo: 'opcion',
    opciones: GREMIOS,
  },
  { id: 'modalidadCobro', etiqueta: 'Cómo prefieres resolverlo', tipo: 'opcion', opciones: OPCIONES_MODALIDAD_COBRO },
]

const OPCIONES_VIA_RECLAMACION: readonly OpcionCampo[] = [
  { valor: 'extrajudicial', etiqueta: 'Extrajudicial / amistosa' },
  { valor: 'judicial_civil', etiqueta: 'Judicial civil' },
  { valor: 'judicial_penal', etiqueta: 'Judicial penal' },
]

const OPCIONES_SUBRAMO_RC: readonly OpcionCampo[] = [
  { valor: 'general', etiqueta: 'General / de explotación' },
  { valor: 'patronal', etiqueta: 'Patronal (frente a empleados)' },
  { valor: 'profesional', etiqueta: 'Profesional' },
  { valor: 'productos', etiqueta: 'De producto' },
  { valor: 'inmueble', etiqueta: 'Del inmueble' },
]

const OPCIONES_TIPO_RECLAMANTE: readonly OpcionCampo[] = [
  { valor: 'cliente', etiqueta: 'Un cliente' },
  { valor: 'empleado', etiqueta: 'Un empleado' },
  { valor: 'proveedor', etiqueta: 'Un proveedor' },
  { valor: 'administracion', etiqueta: 'Una administración pública' },
  { valor: 'particular', etiqueta: 'Un particular' },
]

const CAMPOS_RC: readonly CampoRamoSiniestro[] = [
  { id: 'subramoRc', etiqueta: 'Tipo de responsabilidad civil', tipo: 'opcion', opciones: OPCIONES_SUBRAMO_RC },
  { id: 'viaReclamacion', etiqueta: 'Vía de la reclamación', tipo: 'opcion', opciones: OPCIONES_VIA_RECLAMACION },
  { id: 'tipoReclamante', etiqueta: 'Quién reclama', tipo: 'opcion', opciones: OPCIONES_TIPO_RECLAMANTE },
  {
    id: 'cuantiaReclamadaInicial',
    etiqueta: 'Cuantía reclamada (si ya se conoce)',
    tipo: 'dinero',
    min: 0,
    max: 50000000,
  },
  {
    id: 'fechaHechoCausante',
    etiqueta: 'Fecha del hecho que originó el daño (si es distinta a cuando se supo)',
    tipo: 'fecha',
  },
  { id: 'juzgadoYAutos', etiqueta: 'Juzgado y nº de autos (si hay procedimiento judicial)', tipo: 'texto' },
  { id: 'abogadoProcurador', etiqueta: 'Abogado / procurador asignado', tipo: 'texto' },
  { id: 'danosCorporales', etiqueta: '¿Hay daños corporales?', tipo: 'triestado' },
  { id: 'danosMateriales', etiqueta: '¿Hay daños materiales?', tipo: 'triestado' },
  { id: 'perjuiciosPatrimoniales', etiqueta: '¿Hay perjuicios patrimoniales puros?', tipo: 'triestado' },
]

const OPCIONES_TIPO_EVENTO_PERSONAL: readonly OpcionCampo[] = [
  { valor: 'fallecimiento', etiqueta: 'Fallecimiento' },
  { valor: 'invalidez', etiqueta: 'Invalidez (total o parcial)' },
  { valor: 'enfermedad', etiqueta: 'Enfermedad' },
  { valor: 'incapacidad_temporal', etiqueta: 'Incapacidad temporal' },
  { valor: 'asistencia_sanitaria', etiqueta: 'Asistencia sanitaria' },
]

const OPCIONES_CAUSA_ORIGEN: readonly OpcionCampo[] = [
  { valor: 'enfermedad_comun', etiqueta: 'Enfermedad común' },
  { valor: 'accidente_laboral', etiqueta: 'Accidente laboral' },
  { valor: 'accidente_trafico', etiqueta: 'Accidente de tráfico' },
  { valor: 'accidente_domestico', etiqueta: 'Accidente doméstico' },
]

/**
 * Vida / salud / decesos: SOLO datos de contrato y del trámite, nunca de
 * salud de la persona (art. 9 RGPD — misma frontera que `campos-ramo.ts` de
 * pólizas). Nada de diagnóstico, CIE ni centro médico con detalle clínico.
 */
const CAMPOS_PERSONALES: readonly CampoRamoSiniestro[] = [
  { id: 'tipoEvento', etiqueta: 'Qué ha pasado', tipo: 'opcion', opciones: OPCIONES_TIPO_EVENTO_PERSONAL },
  { id: 'causaOrigen', etiqueta: 'Origen', tipo: 'opcion', opciones: OPCIONES_CAUSA_ORIGEN },
  {
    id: 'fechaDiagnosticoOFallecimiento',
    etiqueta: 'Fecha del diagnóstico o del fallecimiento',
    tipo: 'fecha',
  },
  {
    id: 'tramiteLiquidacionPendiente',
    etiqueta: '¿Está pendiente el trámite del Impuesto de Sucesiones (para cobrar)?',
    tipo: 'triestado',
    ayuda: 'Solo aplica en fallecimiento con beneficiarios.',
  },
]

/**
 * El catálogo. Los ramos financieros (impago de alquiler, crédito, caución)
 * quedan FUERA a propósito: Grupo ASegura no los vende hoy (no están en
 * `RAMOS_SINIESTRO` porque no lo están en `RAMOS_POLIZA`). Si se dan de alta
 * algún día, se añaden entonces con la misma mecánica.
 */
export const CAMPOS_POR_RAMO_SINIESTRO: Readonly<Record<RamoSiniestro, readonly CampoRamoSiniestro[]>> = {
  auto: CAMPOS_ACCIDENTE_VEHICULO,
  moto: CAMPOS_ACCIDENTE_VEHICULO,
  hogar: CAMPOS_HOGAR,
  comercio: CAMPOS_HOGAR,
  comunidades: CAMPOS_HOGAR,
  responsabilidad_civil: CAMPOS_RC,
  vida: CAMPOS_PERSONALES,
  salud: CAMPOS_PERSONALES,
  decesos: CAMPOS_PERSONALES,
  // Cajón de sastre: sin catálogo propio, solo lo que ya trae la cabecera.
  otros: [],
}

/** Los campos de un ramo, o lista vacía si el ramo no se reconoce. Nunca lanza. */
export function camposDeRamoSiniestro(ramo: string | null | undefined): readonly CampoRamoSiniestro[] {
  if (typeof ramo !== 'string') return []
  return CAMPOS_POR_RAMO_SINIESTRO[ramo as RamoSiniestro] ?? []
}

/** Los ramos del catálogo, para que un test compruebe que no falta ninguno. */
export const RAMOS_SINIESTRO_CON_CATALOGO: readonly RamoSiniestro[] = RAMOS_SINIESTRO

/** Lo que se guarda en `datos_ramo`. Claves del catálogo; nunca `null` dentro. */
export type DatosRamoSiniestro = Record<string, string | number | boolean>

export type ResultadoDatosRamoSiniestro = { ok: true; datos: DatosRamoSiniestro | null } | { ok: false; error: string }

/**
 * Valores de cajón: un «no lo sé» escrito con letras. Misma lista que
 * `campos-ramo.ts` — un «no consta» tiene el mismo aspecto en una póliza que
 * en un siniestro.
 */
const CAJON = new Set([
  '',
  '-',
  '--',
  'n/a',
  'na',
  'nc',
  'no consta',
  'no aplica',
  'desconocido',
  'desconocida',
  'sin datos',
  'sin dato',
  'pendiente',
  'ninguno',
  'ninguna',
  '?',
])

function esCajon(texto: string): boolean {
  return CAJON.has(texto.trim().toLowerCase())
}

const RE_FECHA_RAMO_SINIESTRO = /^\d{4}-\d{2}-\d{2}$/

/** `undefined` = no se escribe la clave · `'invalido'` = error con nombre del campo. */
function normalizarValor(campo: CampoRamoSiniestro, valor: unknown): string | number | boolean | undefined | 'invalido' {
  if (campo.tipo === 'triestado') {
    if (typeof valor === 'boolean') return valor
    const t = String(valor).trim().toLowerCase()
    if (t === 'si' || t === 'sí' || t === 'true') return true
    if (t === 'no' || t === 'false') return false
    // «No lo sé» y cualquier otra cosa: no se escribe. Colapsarlo a `false`
    // diría «ha contestado que no» sobre algo que nadie ha preguntado.
    return undefined
  }

  if (campo.tipo === 'numero' || campo.tipo === 'dinero') {
    if (typeof valor === 'string' && esCajon(valor)) return undefined
    const n = typeof valor === 'number' ? valor : Number(String(valor).trim().replace(/\./g, '').replace(',', '.'))
    if (!Number.isFinite(n)) return 'invalido'
    if (campo.min !== undefined && n < campo.min) return 'invalido'
    if (campo.max !== undefined && n > campo.max) return 'invalido'
    return n
  }

  const texto = String(valor).trim()
  if (esCajon(texto)) return undefined

  if (campo.tipo === 'fecha') {
    if (!RE_FECHA_RAMO_SINIESTRO.test(texto)) return 'invalido'
    const [a, m, d] = texto.split('-').map(Number)
    const fecha = new Date(Date.UTC(a, m - 1, d))
    if (fecha.getUTCFullYear() !== a || fecha.getUTCMonth() !== m - 1 || fecha.getUTCDate() !== d) return 'invalido'
    return texto
  }

  if (campo.tipo === 'opcion') {
    const ok = (campo.opciones ?? []).some((o) => o.valor === texto)
    return ok ? texto : 'invalido'
  }

  if (texto.length > MAX_TEXTO_RAMO_SINIESTRO) return 'invalido'
  return texto
}

/**
 * Normaliza lo que llega de la pantalla contra el catálogo del ramo. Mismas
 * reglas que `normalizarDatosRamo()` de pólizas — ver su cabecera.
 */
export function normalizarDatosRamoSiniestro(ramo: string | null | undefined, entrada: unknown): ResultadoDatosRamoSiniestro {
  const campos = camposDeRamoSiniestro(ramo)
  if (campos.length === 0) return { ok: true, datos: null }
  if (entrada === null || entrada === undefined) return { ok: true, datos: null }
  if (typeof entrada !== 'object' || Array.isArray(entrada)) return { ok: false, error: 'datos_ramo_invalidos' }

  const bruto = entrada as Record<string, unknown>
  const datos: DatosRamoSiniestro = {}

  for (const campo of campos) {
    if (!(campo.id in bruto)) continue
    const valor = bruto[campo.id]
    if (valor === null || valor === undefined) continue

    const normalizado = normalizarValor(campo, valor)
    if (normalizado === 'invalido') return { ok: false, error: `campo_invalido:${campo.id}` }
    if (normalizado === undefined) continue
    datos[campo.id] = normalizado
  }

  return { ok: true, datos: Object.keys(datos).length === 0 ? null : datos }
}
