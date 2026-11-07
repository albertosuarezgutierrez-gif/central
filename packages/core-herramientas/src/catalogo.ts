// Catálogo CERRADO de herramientas de «Mi empresa». Una sola copia: el CHECK de `herramientas.cuenta_herramienta.herramienta`
// (apps/empresa/prisma/sql/0001) repite estos ids y `catalogo.test.ts` lo vigila. El bloque del Anexo I del contrato de
// encargo vive AQUÍ (la plantilla solo tiene el hueco `{{anexo_i}}`): añadir una herramienta = una entrada + su bloque.

/** App de destino del salto (traspaso) y dueña del `ref_externa`. */
export type AppDestino = 'contabilidad' | 'rrhh' | 'taller'

export type BloqueAnexo = {
  /** Identificador del bloque en el Anexo I (dos herramientas pueden compartir bloque: rrhh y nóminas). */
  id: 'I.A' | 'I.B' | 'I.C' | 'I.D'
  titulo: string
  /** Filas «etiqueta | texto» de la tabla del bloque, en orden. */
  filas: ReadonlyArray<readonly [string, string]>
}

export type Herramienta = {
  id: IdHerramienta
  nombre: string
  /** Una línea para la tarjeta de la portada. */
  descripcion: string
  app: AppDestino
  /** Qué identifica `ref_externa` en la app (para la pantalla del operador). */
  refEtiqueta: string
  /** ¿«Mi empresa» puede saltar a la app con token de un solo uso (F1)? Si no, la tarjeta lo dice. */
  traspaso: boolean
  /** Herramientas que deben estar en el mismo anexo para activar esta. */
  requiere: readonly IdHerramienta[]
  anexo: BloqueAnexo
}

const ANEXO_CONTABILIDAD: BloqueAnexo = {
  id: 'I.A',
  titulo: 'Contabilidad',
  filas: [
    ['Naturaleza', 'Registro de asientos, facturas emitidas y recibidas, libros registro, importación de extractos bancarios (Norma 43/CSV) y conciliación.'],
    ['Finalidad', 'Llevar la contabilidad y los libros fiscales del Responsable.'],
    ['Interesados', 'Clientes, proveedores y otros terceros con los que opera el Responsable (personas físicas o representantes y contactos de personas jurídicas).'],
    ['Tipos de datos', 'Identificativos (nombre o razón social, NIF), de contacto (domicilio, correo, teléfono), económicos y de transacciones (importes, conceptos, fechas, facturas), bancarios (IBAN y movimientos de los extractos).'],
    ['Categorías especiales', 'No se prevén.'],
  ],
}

const ANEXO_RRHH: BloqueAnexo = {
  id: 'I.B',
  titulo: 'RRHH — nóminas, fichajes y portal del empleado',
  filas: [
    ['Naturaleza', 'Ficha del empleado, contratos, cálculo y distribución de nóminas y documentos, registro de jornada (fichajes), solicitudes (vacaciones, ausencias), comunicaciones con el empleado, firma de documentos y avisos (correo y notificaciones en el móvil).'],
    ['Finalidad', 'Gestión de personal del Responsable y cumplimiento de sus obligaciones laborales, incluido el registro diario de jornada (art. 34.9 del Estatuto de los Trabajadores).'],
    ['Interesados', 'Empleados y, en su caso, candidatos o antiguos empleados del Responsable.'],
    ['Tipos de datos', 'Identificativos (nombre, DNI/NIE, número de la Seguridad Social, foto si se aporta), de contacto, laborales (puesto, contrato, jornada, horarios, vacaciones y ausencias), económicos de nómina (salario, retenciones de IRPF, cotizaciones), bancarios (IBAN para el pago), registro de jornada (horas de entrada y salida) y, **solo si el Responsable activa la función**, **geolocalización en el momento de fichar** (no hay seguimiento continuo).'],
    ['Categorías especiales', 'Pueden aparecer datos de salud de forma accesoria (justificantes de baja o ausencia). El Responsable debe limitarlos a lo imprescindible.'],
    ['Lectura automática', 'Para asignar cada nómina o documento a su empleado puede usarse un modelo de IA que recibe **solo el texto minimizado** (sin IBAN, DNI/NIE, NSS, correos ni cifras); la verificación por DNI se hace sin salir del sistema. Además, el **asistente** del portal (para el empleado y para el administrador) envía al modelo de IA la pregunta y el contexto necesario para contestarla (p. ej., relación de documentos y solicitudes del empleado): *alcance exacto de lo que sale y su minimización, pendiente de confirmar*. Ver Anexo III.'],
  ],
}

const ANEXO_TALLER: BloqueAnexo = {
  id: 'I.C',
  titulo: 'Gestión de taller',
  filas: [
    ['Naturaleza', 'Citas, órdenes de trabajo, presupuestos, facturación, entrega del vehículo, fotos del vehículo y comunicaciones con el cliente.'],
    ['Finalidad', 'Prestar el servicio de reparación y mantenimiento del Responsable a sus clientes.'],
    ['Interesados', 'Clientes finales del taller y, en su caso, conductores o personas autorizadas a recoger el vehículo.'],
    ['Tipos de datos', 'Identificativos y de contacto, datos del vehículo (matrícula, bastidor/VIN, marca, modelo, kilometraje), **fotografías del vehículo** (que pueden mostrar accidentalmente personas, matrículas u objetos personales), trabajos realizados e importes.'],
    ['Conservación', 'Las fotos se purgan automáticamente tras el plazo que configure el Responsable desde la entrega del vehículo.'],
  ],
}

const ANEXO_PROVEEDORES: BloqueAnexo = {
  id: 'I.D',
  titulo: 'Portal de proveedores',
  filas: [
    ['Naturaleza', 'Recepción de facturas de proveedores (XML, PDF o imagen) y extracción de sus datos.'],
    ['Finalidad', 'Registrar las compras del Responsable.'],
    ['Interesados', 'Proveedores y sus personas de contacto.'],
    ['Tipos de datos', 'Identificativos, de contacto y datos de la factura.'],
    ['Lectura automática', 'Las facturas XML se leen sin IA. Si hay que usar IA, se envía **solo el texto de la factura minimizado** (sin IBAN, correos ni teléfonos); a la IA no va nada del taller ni de sus clientes. Las **imágenes** (JPG/PNG) se envían tal cual a un modelo de visión con exigencia de no conservación para entrenamiento. Ver Anexo III.'],
  ],
}

export const IDS_HERRAMIENTA = ['contabilidad', 'rrhh', 'nominas', 'taller', 'portal_proveedores'] as const
export type IdHerramienta = (typeof IDS_HERRAMIENTA)[number]

export const CATALOGO: Readonly<Record<IdHerramienta, Herramienta>> = {
  contabilidad: {
    id: 'contabilidad', nombre: 'Contabilidad', descripcion: 'Diario, mayor, facturas, banco e impuestos.',
    app: 'contabilidad', refEtiqueta: 'Id de la empresa en Contabilidad', traspaso: true, requiere: [], anexo: ANEXO_CONTABILIDAD,
  },
  rrhh: {
    id: 'rrhh', nombre: 'RRHH · Portal del Empleado', descripcion: 'Empleados, fichajes, documentos y solicitudes.',
    app: 'rrhh', refEtiqueta: 'Id de la empresa en RRHH', traspaso: true, requiere: [], anexo: ANEXO_RRHH,
  },
  nominas: {
    id: 'nominas', nombre: 'Nóminas → Contabilidad', descripcion: 'Las nóminas de RRHH pasan solas a la contabilidad.',
    app: 'rrhh', refEtiqueta: 'Id de la empresa en RRHH', traspaso: true, requiere: ['rrhh', 'contabilidad'], anexo: ANEXO_RRHH,
  },
  taller: {
    id: 'taller', nombre: 'Gestión de taller', descripcion: 'Citas, órdenes de trabajo, presupuestos y entregas.',
    app: 'taller', refEtiqueta: 'Id del taller', traspaso: false, requiere: [], anexo: ANEXO_TALLER,
  },
  portal_proveedores: {
    id: 'portal_proveedores', nombre: 'Portal de proveedores', descripcion: 'Facturas de proveedores leídas y registradas.',
    app: 'taller', refEtiqueta: 'Id del taller', traspaso: false, requiere: [], anexo: ANEXO_PROVEEDORES,
  },
}

export const esHerramienta = (v: unknown): v is IdHerramienta =>
  typeof v === 'string' && (IDS_HERRAMIENTA as readonly string[]).includes(v)

/** Normaliza una lista pedida: solo ids del catálogo, sin repetidos, en el ORDEN del catálogo (el anexo sale siempre igual). */
export function normalizarHerramientas(lista: unknown): IdHerramienta[] | null {
  if (!Array.isArray(lista) || lista.length === 0) return null
  if (!lista.every(esHerramienta)) return null
  const set = new Set(lista)
  return IDS_HERRAMIENTA.filter((h) => set.has(h))
}

/** Dependencias que faltan en la lista (p. ej. nóminas sin rrhh o sin contabilidad). */
export function dependenciasQueFaltan(lista: readonly IdHerramienta[]): string[] {
  const set = new Set(lista)
  const faltan: string[] = []
  for (const h of lista) {
    for (const r of CATALOGO[h].requiere) if (!set.has(r)) faltan.push(`«${CATALOGO[h].nombre}» necesita «${CATALOGO[r].nombre}»`)
  }
  return faltan
}

/** Bloques del Anexo I de una lista, sin repetir (rrhh + nóminas → un solo I.B), en orden de bloque. */
export function bloquesAnexo(lista: readonly IdHerramienta[]): BloqueAnexo[] {
  const porId = new Map<string, BloqueAnexo>()
  for (const h of lista) porId.set(CATALOGO[h].anexo.id, CATALOGO[h].anexo)
  return [...porId.values()].sort((a, b) => a.id.localeCompare(b.id))
}
