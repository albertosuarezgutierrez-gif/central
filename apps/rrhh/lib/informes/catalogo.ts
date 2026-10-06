// Catálogo DECLARATIVO de informes del panel del responsable.
//
// Módulo PURO (sin prisma ni next): lo importan el motor, el validador, la exportación y la UI.
// Una entidad nueva = una entrada aquí + su consulta en `consultas.ts` (el SELECT debe devolver
// TODAS las claves de `columnas` con el mismo nombre). Nada de lo que llega del cliente se
// interpola en SQL: el cliente solo elige CLAVES de esta lista blanca.
//
// Tres estados (regla del repo): un valor `null` es «no se sabe / no hay dato», nunca 0. Las
// métricas de suma/media lo excluyen y cuentan cuántas filas quedaron fuera (`sinDato`).

import { TIPOS_SOLICITUD, GRUPOS_SOLICITUD } from '@/lib/solicitudes-tipos'

export type TipoColumna = 'texto' | 'numero' | 'fecha' | 'fechahora' | 'horas' | 'dinero' | 'booleano'

export type ColumnaDef = { clave: string; etiqueta: string; tipo: TipoColumna; porDefecto?: boolean }

export type Opcion = { valor: string; etiqueta: string }

export type FiltroDef =
  | { clave: string; etiqueta: string; tipo: 'rango_fecha' }   // { desde?: 'YYYY-MM-DD', hasta?: 'YYYY-MM-DD' }
  | { clave: string; etiqueta: string; tipo: 'rango_mes' }     // { desde?: 'YYYY-MM', hasta?: 'YYYY-MM' }
  | { clave: string; etiqueta: string; tipo: 'empleado' }      // uuid
  | { clave: string; etiqueta: string; tipo: 'obra' }          // uuid
  | { clave: string; etiqueta: string; tipo: 'opcion'; opciones: Opcion[] }
  | { clave: string; etiqueta: string; tipo: 'booleano' }

/** Cómo se agrupa: por el valor tal cual, o por día/semana/mes/año de una columna de fecha.
 *  `campo` puede ser un campo interno de la consulta (p. ej. `empleado_id`) que no es columna
 *  visible: se agrupa por IDENTIDAD y se rotula con `campoEtiqueta` (dos empleados con el mismo
 *  nombre nunca se funden). */
export type ModoAgrupacion = 'valor' | 'dia' | 'semana' | 'mes' | 'anio'
export type AgrupacionDef = { clave: string; etiqueta: string; campo: string; modo: ModoAgrupacion; campoEtiqueta?: string }

export type MetricaDef =
  | { clave: string; etiqueta: string; tipo: 'recuento' }
  | { clave: string; etiqueta: string; tipo: 'suma' | 'media'; campo: string; formato: TipoColumna }
  /** Cuenta las filas cuyo `campo` es null (p. ej. fichajes en curso: sin horas todavía). */
  | { clave: string; etiqueta: string; tipo: 'recuento_nulos'; campo: string }

export type EntidadDef = {
  clave: string
  etiqueta: string
  descripcion: string
  /** Solo para empresas con control horario activado (`empresas.tiene_fichaje`). */
  requiereFichaje?: boolean
  columnas: ColumnaDef[]
  filtros: FiltroDef[]
  agrupaciones: AgrupacionDef[]
  metricas: MetricaDef[]
}

const ESTADOS_EMPLEADO: Opcion[] = [
  { valor: 'activo', etiqueta: 'Activo' },
  { valor: 'baja', etiqueta: 'Baja' },
]
const ESTADOS_SOLICITUD: Opcion[] = [
  { valor: 'solicitada', etiqueta: 'Solicitada' },
  { valor: 'aprobada', etiqueta: 'Aprobada' },
  { valor: 'rechazada', etiqueta: 'Rechazada' },
]
const ESTADOS_NOMINA: Opcion[] = [
  { valor: 'borrador', etiqueta: 'Borrador' },
  { valor: 'confirmada', etiqueta: 'Confirmada' },
]
const ESTADOS_FIRMA: Opcion[] = [
  { valor: 'no_requiere', etiqueta: 'No requiere firma' },
  { valor: 'pendiente', etiqueta: 'Pendiente de firma' },
  { valor: 'firmado', etiqueta: 'Firmado' },
]
const TIPOS_INCIDENCIA: Opcion[] = [
  { valor: 'horas_extra', etiqueta: 'Horas extra' },
  { valor: 'ausencia_injustificada', etiqueta: 'Ausencia injustificada' },
  { valor: 'plus_puntual', etiqueta: 'Plus puntual' },
  { valor: 'descuento', etiqueta: 'Descuento' },
  { valor: 'baja_it', etiqueta: 'Baja IT' },
  { valor: 'vacaciones', etiqueta: 'Vacaciones' },
]

const F_EMPLEADO: FiltroDef = { clave: 'empleado_id', etiqueta: 'Empleado', tipo: 'empleado' }

export const CATALOGO: EntidadDef[] = [
  {
    clave: 'fichajes',
    etiqueta: 'Fichajes (control horario)',
    descripcion: 'Entradas y salidas registradas. Los fichajes en curso no suman horas.',
    requiereFichaje: true,
    columnas: [
      { clave: 'empleado', etiqueta: 'Empleado', tipo: 'texto', porDefecto: true },
      { clave: 'dni', etiqueta: 'DNI/NIE', tipo: 'texto' },
      { clave: 'fecha', etiqueta: 'Fecha', tipo: 'fecha', porDefecto: true },
      { clave: 'entrada', etiqueta: 'Entrada', tipo: 'fechahora', porDefecto: true },
      { clave: 'salida', etiqueta: 'Salida', tipo: 'fechahora', porDefecto: true },
      { clave: 'horas', etiqueta: 'Horas', tipo: 'horas', porDefecto: true },
      { clave: 'obra', etiqueta: 'Obra / centro', tipo: 'texto', porDefecto: true },
      { clave: 'estado', etiqueta: 'Estado', tipo: 'texto' },
      { clave: 'observaciones', etiqueta: 'Observaciones', tipo: 'texto' },
    ],
    filtros: [
      { clave: 'fecha', etiqueta: 'Fecha de entrada', tipo: 'rango_fecha' },
      F_EMPLEADO,
      { clave: 'obra_id', etiqueta: 'Obra / centro', tipo: 'obra' },
      { clave: 'estado', etiqueta: 'Estado', tipo: 'opcion', opciones: [{ valor: 'cerrado', etiqueta: 'Cerrado' }, { valor: 'activo', etiqueta: 'En curso' }] },
    ],
    agrupaciones: [
      { clave: 'empleado', etiqueta: 'Por empleado', campo: 'empleado_id', campoEtiqueta: 'empleado_etiqueta', modo: 'valor' },
      { clave: 'obra', etiqueta: 'Por obra / centro', campo: 'obra_id', campoEtiqueta: 'obra', modo: 'valor' },
      { clave: 'dia', etiqueta: 'Por día', campo: 'fecha', modo: 'dia' },
      { clave: 'semana', etiqueta: 'Por semana', campo: 'fecha', modo: 'semana' },
      { clave: 'mes', etiqueta: 'Por mes', campo: 'fecha', modo: 'mes' },
      { clave: 'estado', etiqueta: 'Por estado', campo: 'estado', modo: 'valor' },
    ],
    metricas: [
      { clave: 'n', etiqueta: 'Fichajes', tipo: 'recuento' },
      { clave: 'horas', etiqueta: 'Horas trabajadas', tipo: 'suma', campo: 'horas', formato: 'horas' },
      { clave: 'media_horas', etiqueta: 'Media por fichaje', tipo: 'media', campo: 'horas', formato: 'horas' },
      { clave: 'en_curso', etiqueta: 'En curso (sin horas)', tipo: 'recuento_nulos', campo: 'horas' },
    ],
  },
  {
    clave: 'solicitudes',
    etiqueta: 'Ausencias, vacaciones, permisos y bajas',
    descripcion: 'Solicitudes de los empleados. Los días son naturales y de la solicitud completa.',
    columnas: [
      { clave: 'empleado', etiqueta: 'Empleado', tipo: 'texto', porDefecto: true },
      { clave: 'dni', etiqueta: 'DNI/NIE', tipo: 'texto' },
      { clave: 'grupo', etiqueta: 'Grupo', tipo: 'texto' },
      { clave: 'tipo', etiqueta: 'Tipo', tipo: 'texto', porDefecto: true },
      { clave: 'fecha_inicio', etiqueta: 'Desde', tipo: 'fecha', porDefecto: true },
      { clave: 'fecha_fin', etiqueta: 'Hasta', tipo: 'fecha', porDefecto: true },
      { clave: 'dias', etiqueta: 'Días naturales', tipo: 'numero', porDefecto: true },
      { clave: 'estado', etiqueta: 'Estado', tipo: 'texto', porDefecto: true },
      { clave: 'motivo', etiqueta: 'Motivo', tipo: 'texto' },
      { clave: 'justificante', etiqueta: 'Justificante adjunto', tipo: 'booleano' },
      { clave: 'creada', etiqueta: 'Solicitada el', tipo: 'fecha' },
      { clave: 'resuelta', etiqueta: 'Resuelta el', tipo: 'fecha' },
    ],
    filtros: [
      { clave: 'fecha', etiqueta: 'Periodo de la ausencia', tipo: 'rango_fecha' },
      F_EMPLEADO,
      { clave: 'tipo', etiqueta: 'Tipo', tipo: 'opcion', opciones: TIPOS_SOLICITUD.map(t => ({ valor: t.id, etiqueta: t.etiqueta })) },
      { clave: 'grupo', etiqueta: 'Grupo', tipo: 'opcion', opciones: GRUPOS_SOLICITUD.map(g => ({ valor: g.id, etiqueta: g.etiqueta })) },
      { clave: 'estado', etiqueta: 'Estado', tipo: 'opcion', opciones: ESTADOS_SOLICITUD },
    ],
    agrupaciones: [
      { clave: 'empleado', etiqueta: 'Por empleado', campo: 'empleado_id', campoEtiqueta: 'empleado_etiqueta', modo: 'valor' },
      { clave: 'tipo', etiqueta: 'Por tipo', campo: 'tipo', modo: 'valor' },
      { clave: 'grupo', etiqueta: 'Por grupo', campo: 'grupo', modo: 'valor' },
      { clave: 'estado', etiqueta: 'Por estado', campo: 'estado', modo: 'valor' },
      { clave: 'mes', etiqueta: 'Por mes de inicio', campo: 'fecha_inicio', modo: 'mes' },
    ],
    metricas: [
      { clave: 'n', etiqueta: 'Solicitudes', tipo: 'recuento' },
      { clave: 'dias', etiqueta: 'Días naturales', tipo: 'suma', campo: 'dias', formato: 'numero' },
      { clave: 'media_dias', etiqueta: 'Media de días', tipo: 'media', campo: 'dias', formato: 'numero' },
      { clave: 'sin_fechas', etiqueta: 'Sin fechas completas', tipo: 'recuento_nulos', campo: 'dias' },
    ],
  },
  {
    clave: 'empleados',
    etiqueta: 'Empleados (plantilla)',
    descripcion: 'Ficha de cada empleado de la empresa.',
    columnas: [
      { clave: 'empleado', etiqueta: 'Nombre', tipo: 'texto', porDefecto: true },
      { clave: 'dni', etiqueta: 'DNI/NIE', tipo: 'texto', porDefecto: true },
      { clave: 'nss', etiqueta: 'N.º Seg. Social', tipo: 'texto' },
      { clave: 'email', etiqueta: 'Email', tipo: 'texto' },
      { clave: 'telefono', etiqueta: 'Teléfono', tipo: 'texto' },
      { clave: 'puesto', etiqueta: 'Puesto', tipo: 'texto', porDefecto: true },
      { clave: 'categoria', etiqueta: 'Categoría', tipo: 'texto' },
      { clave: 'grupo_cotizacion', etiqueta: 'Grupo de cotización', tipo: 'texto' },
      { clave: 'tipo_contrato', etiqueta: 'Tipo de contrato', tipo: 'texto' },
      { clave: 'tipo_jornada', etiqueta: 'Jornada', tipo: 'texto' },
      { clave: 'centro_trabajo', etiqueta: 'Centro de trabajo', tipo: 'texto' },
      { clave: 'localidad', etiqueta: 'Localidad', tipo: 'texto' },
      { clave: 'provincia', etiqueta: 'Provincia', tipo: 'texto' },
      { clave: 'estado_civil', etiqueta: 'Estado civil', tipo: 'texto' },
      { clave: 'fecha_nacimiento', etiqueta: 'Fecha de nacimiento', tipo: 'fecha' },
      { clave: 'fecha_alta', etiqueta: 'Fecha de alta', tipo: 'fecha', porDefecto: true },
      { clave: 'antiguedad', etiqueta: 'Antigüedad (años)', tipo: 'numero' },
      { clave: 'fecha_reconocimiento_medico', etiqueta: 'Reconocimiento médico', tipo: 'fecha' },
      { clave: 'estado', etiqueta: 'Estado', tipo: 'texto', porDefecto: true },
    ],
    filtros: [
      { clave: 'fecha', etiqueta: 'Fecha de alta', tipo: 'rango_fecha' },
      F_EMPLEADO,
      { clave: 'estado', etiqueta: 'Estado', tipo: 'opcion', opciones: ESTADOS_EMPLEADO },
    ],
    agrupaciones: [
      { clave: 'estado', etiqueta: 'Por estado', campo: 'estado', modo: 'valor' },
      { clave: 'puesto', etiqueta: 'Por puesto', campo: 'puesto', modo: 'valor' },
      { clave: 'categoria', etiqueta: 'Por categoría', campo: 'categoria', modo: 'valor' },
      { clave: 'centro_trabajo', etiqueta: 'Por centro de trabajo', campo: 'centro_trabajo', modo: 'valor' },
      { clave: 'tipo_contrato', etiqueta: 'Por tipo de contrato', campo: 'tipo_contrato', modo: 'valor' },
      { clave: 'anio_alta', etiqueta: 'Por año de alta', campo: 'fecha_alta', modo: 'anio' },
    ],
    metricas: [
      { clave: 'n', etiqueta: 'Empleados', tipo: 'recuento' },
      { clave: 'media_antiguedad', etiqueta: 'Antigüedad media (años)', tipo: 'media', campo: 'antiguedad', formato: 'numero' },
      { clave: 'sin_alta', etiqueta: 'Sin fecha de alta', tipo: 'recuento_nulos', campo: 'fecha_alta' },
    ],
  },
  {
    clave: 'nominas',
    etiqueta: 'Nóminas',
    descripcion: 'Importes calculados de cada nómina. Una nómina sin cálculo no suma 0: queda «sin dato».',
    columnas: [
      { clave: 'empleado', etiqueta: 'Empleado', tipo: 'texto', porDefecto: true },
      { clave: 'dni', etiqueta: 'DNI/NIE', tipo: 'texto' },
      { clave: 'periodo', etiqueta: 'Periodo', tipo: 'texto', porDefecto: true },
      { clave: 'estado', etiqueta: 'Estado', tipo: 'texto', porDefecto: true },
      { clave: 'bruto', etiqueta: 'Total devengado', tipo: 'dinero', porDefecto: true },
      { clave: 'salario_base', etiqueta: 'Salario base', tipo: 'dinero' },
      { clave: 'horas_extra_importe', etiqueta: 'Horas extra (€)', tipo: 'dinero' },
      { clave: 'ss_trabajador', etiqueta: 'Seg. Social trabajador', tipo: 'dinero' },
      { clave: 'irpf', etiqueta: 'IRPF', tipo: 'dinero' },
      { clave: 'deducciones', etiqueta: 'Total deducciones', tipo: 'dinero' },
      { clave: 'neto', etiqueta: 'Líquido a percibir', tipo: 'dinero', porDefecto: true },
      { clave: 'cuota_patronal', etiqueta: 'Seg. Social empresa', tipo: 'dinero' },
      { clave: 'coste_empresa', etiqueta: 'Coste total empresa', tipo: 'dinero', porDefecto: true },
      { clave: 'confirmada', etiqueta: 'Confirmada el', tipo: 'fecha' },
      { clave: 'enviada', etiqueta: 'Enviada el', tipo: 'fecha' },
    ],
    filtros: [
      { clave: 'periodo', etiqueta: 'Periodo', tipo: 'rango_mes' },
      F_EMPLEADO,
      { clave: 'estado', etiqueta: 'Estado', tipo: 'opcion', opciones: ESTADOS_NOMINA },
    ],
    agrupaciones: [
      { clave: 'empleado', etiqueta: 'Por empleado', campo: 'empleado_id', campoEtiqueta: 'empleado_etiqueta', modo: 'valor' },
      { clave: 'periodo', etiqueta: 'Por periodo', campo: 'periodo', modo: 'valor' },
      { clave: 'estado', etiqueta: 'Por estado', campo: 'estado', modo: 'valor' },
    ],
    metricas: [
      { clave: 'n', etiqueta: 'Nóminas', tipo: 'recuento' },
      { clave: 'bruto', etiqueta: 'Total devengado', tipo: 'suma', campo: 'bruto', formato: 'dinero' },
      { clave: 'irpf', etiqueta: 'IRPF', tipo: 'suma', campo: 'irpf', formato: 'dinero' },
      { clave: 'neto', etiqueta: 'Líquido', tipo: 'suma', campo: 'neto', formato: 'dinero' },
      { clave: 'coste_empresa', etiqueta: 'Coste empresa', tipo: 'suma', campo: 'coste_empresa', formato: 'dinero' },
      { clave: 'media_neto', etiqueta: 'Líquido medio', tipo: 'media', campo: 'neto', formato: 'dinero' },
      { clave: 'sin_calculo', etiqueta: 'Sin cálculo', tipo: 'recuento_nulos', campo: 'bruto' },
    ],
  },
  {
    clave: 'incidencias',
    etiqueta: 'Incidencias de nómina',
    descripcion: 'Horas extra, pluses, descuentos, bajas IT… registradas en cada nómina.',
    columnas: [
      { clave: 'empleado', etiqueta: 'Empleado', tipo: 'texto', porDefecto: true },
      { clave: 'periodo', etiqueta: 'Periodo', tipo: 'texto', porDefecto: true },
      { clave: 'tipo', etiqueta: 'Tipo', tipo: 'texto', porDefecto: true },
      { clave: 'concepto', etiqueta: 'Concepto', tipo: 'texto', porDefecto: true },
      { clave: 'importe', etiqueta: 'Importe', tipo: 'dinero', porDefecto: true },
      { clave: 'horas', etiqueta: 'Horas', tipo: 'horas', porDefecto: true },
      { clave: 'dias', etiqueta: 'Días', tipo: 'numero', porDefecto: true },
    ],
    filtros: [
      { clave: 'periodo', etiqueta: 'Periodo', tipo: 'rango_mes' },
      F_EMPLEADO,
      { clave: 'tipo', etiqueta: 'Tipo', tipo: 'opcion', opciones: TIPOS_INCIDENCIA },
    ],
    agrupaciones: [
      { clave: 'empleado', etiqueta: 'Por empleado', campo: 'empleado_id', campoEtiqueta: 'empleado_etiqueta', modo: 'valor' },
      { clave: 'tipo', etiqueta: 'Por tipo', campo: 'tipo', modo: 'valor' },
      { clave: 'periodo', etiqueta: 'Por periodo', campo: 'periodo', modo: 'valor' },
    ],
    metricas: [
      { clave: 'n', etiqueta: 'Incidencias', tipo: 'recuento' },
      { clave: 'importe', etiqueta: 'Importe', tipo: 'suma', campo: 'importe', formato: 'dinero' },
      { clave: 'horas', etiqueta: 'Horas', tipo: 'suma', campo: 'horas', formato: 'horas' },
      { clave: 'dias', etiqueta: 'Días', tipo: 'suma', campo: 'dias', formato: 'numero' },
    ],
  },
  {
    clave: 'contratos',
    etiqueta: 'Contratos laborales',
    descripcion: 'Condiciones de contrato usadas para calcular nóminas.',
    columnas: [
      { clave: 'empleado', etiqueta: 'Empleado', tipo: 'texto', porDefecto: true },
      { clave: 'tipo_contrato', etiqueta: 'Tipo de contrato', tipo: 'texto', porDefecto: true },
      { clave: 'categoria', etiqueta: 'Categoría convenio', tipo: 'texto' },
      { clave: 'grupo_cotizacion', etiqueta: 'Grupo de cotización', tipo: 'numero' },
      { clave: 'salario_base', etiqueta: 'Salario base', tipo: 'dinero', porDefecto: true },
      { clave: 'jornada_pct', etiqueta: 'Jornada (%)', tipo: 'numero', porDefecto: true },
      { clave: 'irpf_pct', etiqueta: 'Retención IRPF (%)', tipo: 'numero' },
      { clave: 'vigente_desde', etiqueta: 'Vigente desde', tipo: 'fecha', porDefecto: true },
      { clave: 'activo', etiqueta: 'Activo', tipo: 'booleano', porDefecto: true },
    ],
    filtros: [
      { clave: 'fecha', etiqueta: 'Vigente desde', tipo: 'rango_fecha' },
      F_EMPLEADO,
      { clave: 'activo', etiqueta: 'Solo activos', tipo: 'booleano' },
      { clave: 'tipo_contrato', etiqueta: 'Tipo de contrato', tipo: 'opcion', opciones: [
        { valor: 'indefinido', etiqueta: 'Indefinido' }, { valor: 'temporal', etiqueta: 'Temporal' }, { valor: 'parcial', etiqueta: 'Parcial' },
      ] },
    ],
    agrupaciones: [
      { clave: 'tipo_contrato', etiqueta: 'Por tipo de contrato', campo: 'tipo_contrato', modo: 'valor' },
      { clave: 'grupo_cotizacion', etiqueta: 'Por grupo de cotización', campo: 'grupo_cotizacion', modo: 'valor' },
      { clave: 'categoria', etiqueta: 'Por categoría', campo: 'categoria', modo: 'valor' },
      { clave: 'activo', etiqueta: 'Activos / inactivos', campo: 'activo', modo: 'valor' },
    ],
    metricas: [
      { clave: 'n', etiqueta: 'Contratos', tipo: 'recuento' },
      { clave: 'salario', etiqueta: 'Suma salario base', tipo: 'suma', campo: 'salario_base', formato: 'dinero' },
      { clave: 'media_salario', etiqueta: 'Salario base medio', tipo: 'media', campo: 'salario_base', formato: 'dinero' },
      { clave: 'media_jornada', etiqueta: 'Jornada media (%)', tipo: 'media', campo: 'jornada_pct', formato: 'numero' },
    ],
  },
  {
    clave: 'documentos',
    etiqueta: 'Documentos de empleados',
    descripcion: 'Documentación subida a la carpeta de cada empleado y su estado de firma.',
    columnas: [
      { clave: 'empleado', etiqueta: 'Empleado', tipo: 'texto', porDefecto: true },
      { clave: 'carpeta', etiqueta: 'Carpeta', tipo: 'texto', porDefecto: true },
      { clave: 'nombre', etiqueta: 'Documento', tipo: 'texto', porDefecto: true },
      { clave: 'tipo', etiqueta: 'Tipo de archivo', tipo: 'texto' },
      { clave: 'tamano_kb', etiqueta: 'Tamaño (KB)', tipo: 'numero' },
      { clave: 'subido_por', etiqueta: 'Subido por', tipo: 'texto' },
      { clave: 'subido', etiqueta: 'Subido el', tipo: 'fecha', porDefecto: true },
      { clave: 'caducidad', etiqueta: 'Caducidad', tipo: 'fecha' },
      { clave: 'caducado', etiqueta: 'Caducado', tipo: 'booleano' },
      { clave: 'estado_firma', etiqueta: 'Estado de firma', tipo: 'texto', porDefecto: true },
      { clave: 'requiere_firma_empresa', etiqueta: 'Requiere firma empresa', tipo: 'booleano' },
      { clave: 'firmado_empresa', etiqueta: 'Firmado por la empresa el', tipo: 'fecha' },
    ],
    filtros: [
      { clave: 'fecha', etiqueta: 'Fecha de subida', tipo: 'rango_fecha' },
      F_EMPLEADO,
      { clave: 'estado_firma', etiqueta: 'Estado de firma', tipo: 'opcion', opciones: ESTADOS_FIRMA },
    ],
    agrupaciones: [
      { clave: 'empleado', etiqueta: 'Por empleado', campo: 'empleado_id', campoEtiqueta: 'empleado_etiqueta', modo: 'valor' },
      { clave: 'carpeta', etiqueta: 'Por carpeta', campo: 'carpeta', modo: 'valor' },
      { clave: 'estado_firma', etiqueta: 'Por estado de firma', campo: 'estado_firma', modo: 'valor' },
      { clave: 'mes', etiqueta: 'Por mes de subida', campo: 'subido', modo: 'mes' },
    ],
    metricas: [
      { clave: 'n', etiqueta: 'Documentos', tipo: 'recuento' },
      { clave: 'tamano', etiqueta: 'Tamaño total (KB)', tipo: 'suma', campo: 'tamano_kb', formato: 'numero' },
    ],
  },
  {
    clave: 'obras',
    etiqueta: 'Obras / centros de trabajo',
    descripcion: 'Centros con geovalla para el fichaje, con sus horas y fichajes acumulados.',
    requiereFichaje: true,
    columnas: [
      { clave: 'nombre', etiqueta: 'Obra / centro', tipo: 'texto', porDefecto: true },
      { clave: 'direccion', etiqueta: 'Dirección', tipo: 'texto', porDefecto: true },
      { clave: 'radio_m', etiqueta: 'Radio geovalla (m)', tipo: 'numero' },
      { clave: 'activa', etiqueta: 'Activa', tipo: 'booleano', porDefecto: true },
      { clave: 'fichajes', etiqueta: 'Fichajes', tipo: 'numero', porDefecto: true },
      { clave: 'horas', etiqueta: 'Horas (cerradas)', tipo: 'horas', porDefecto: true },
      { clave: 'creada', etiqueta: 'Creada el', tipo: 'fecha' },
    ],
    filtros: [
      { clave: 'fecha', etiqueta: 'Fichajes entre', tipo: 'rango_fecha' },
      { clave: 'activa', etiqueta: 'Solo activas', tipo: 'booleano' },
    ],
    agrupaciones: [
      { clave: 'activa', etiqueta: 'Activas / inactivas', campo: 'activa', modo: 'valor' },
    ],
    metricas: [
      { clave: 'n', etiqueta: 'Obras', tipo: 'recuento' },
      { clave: 'fichajes', etiqueta: 'Fichajes', tipo: 'suma', campo: 'fichajes', formato: 'numero' },
      { clave: 'horas', etiqueta: 'Horas', tipo: 'suma', campo: 'horas', formato: 'horas' },
    ],
  },
]

export const LIMITE_FILAS = 50_000
/** Filas que viajan a la vista previa (el resto, en la descarga). Los totales son siempre de todo. */
export const LIMITE_VISTA = 2_000

export function entidad(clave: string): EntidadDef | undefined {
  return CATALOGO.find(e => e.clave === clave)
}
