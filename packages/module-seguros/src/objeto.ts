/**
 * QUÉ asegura cada póliza — el «objeto asegurado».
 *
 * Una lista de renovaciones con cliente, ramo y prima no basta para llamar a
 * nadie: el mismo tomador puede tener tres pólizas de auto, y «Auto · Mapfre ·
 * 431,85€» no dice CUÁL. Lo que identifica la póliza en la conversación es el
 * bien: la matrícula y el coche, el piso, la actividad cubierta por la RC.
 *
 * El dato vive en `polizas.datos_especificos` (JSON libre, lo escribe la
 * ingesta EIAC/CIMA de cada compañía) y en `poliza_coberturas`. Ninguno de los
 * dos está garantizado, así que esto tiene CUATRO salidas y no dos:
 *
 *   - `conocido`     → se sabe qué asegura.
 *   - `no_informado` → la compañía no lo ha mandado. Es un «todavía no se
 *                      sabe», NUNCA un «no tiene».
 *   - `cifrado`      → el dato SÍ está, pero llega cifrado (`v1:iv:cipher:tag`,
 *                      AES-256-GCM del CRM de origen) y aquí no hay clave. Es
 *                      distinto de que falte, y decir «sin dato» sería mentir.
 *   - `sin_objeto`   → el ramo no tiene bien asegurado porque asegura personas
 *                      (vida, salud, decesos, accidentes). Ausencia DEFINITIVA:
 *                      prometer una pasada futura que traiga el dato sería la
 *                      otra forma de mentir.
 *
 * Todo aquí es puro y testeable: la lógica del titular no vive en el JSX
 * (regla global de CLAUDE.md).
 */

export type EstadoObjeto = 'conocido' | 'no_informado' | 'cifrado' | 'sin_objeto'

export type ObjetoAsegurado = {
  estado: EstadoObjeto
  /** Lo que identifica el bien de un vistazo. `null` si no se sabe. */
  titulo: string | null
  /** Segunda línea: matrícula, metros, año… `null` si no hay. */
  detalle: string | null
  /** Por qué falta (o por qué está a medias). Va al `title` de la celda. */
  nota: string | null
}

/** Prefijo del cifrado del CRM de origen (AES-256-GCM, `v1:iv:cipher:tag`). */
const PREFIJO_CIFRADO = 'v1:'

/**
 * Valores de cajón: un «no lo he sabido leer» vestido de dato. Se cuelan por
 * toda guarda basada en NULL, así que se anulan ANTES de mirarlos (lección de
 * `subastas.tipo_bien`).
 */
const CAJON = new Set([
  '', '-', '--', '.', 'N/A', 'NA', 'NULL', 'NONE', 'OTRO', 'OTROS', 'DESCONOCIDO',
  'DESCONOCIDA', 'SIN DATOS', 'SIN DATO', 'NO INFORMADO', 'NO CONSTA', 'SIN CLASIFICAR',
  '0', '00000000',
])

/** Ramos de personas: el «objeto» es el propio asegurado, no hay bien que listar. */
const RAMOS_DE_PERSONAS = new Set(['vida', 'salud', 'decesos', 'accidentes'])

/** Texto útil de un campo, o `null`. Distingue el cifrado de la ausencia. */
function texto(v: unknown): string | null | 'cifrado' {
  if (typeof v === 'number' && Number.isFinite(v)) v = String(v)
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (t.startsWith(PREFIJO_CIFRADO)) return 'cifrado'
  if (CAJON.has(t.toUpperCase())) return null
  return t.length > 0 ? t : null
}

/** Como `texto`, pero el cifrado cuenta como ausencia (para campos que solo se pintan). */
function claro(v: unknown): string | null {
  const t = texto(v)
  return t === 'cifrado' ? null : t
}

function numero(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null
}

/** ¿Parece una matrícula española (o de las viejas con provincia)? */
export function pareceMatricula(v: string): boolean {
  const t = v.replace(/[\s-]/g, '').toUpperCase()
  return t.length >= 6 && t.length <= 9 && /\d{4}/.test(t) && /^[A-Z0-9]+$/.test(t)
}

function unir(partes: Array<string | null>, sep = ' · '): string | null {
  const vivas = partes.filter((p): p is string => p !== null && p !== '')
  return vivas.length > 0 ? vivas.join(sep) : null
}

const NO_INFORMADO: ObjetoAsegurado = {
  estado: 'no_informado',
  titulo: null,
  detalle: null,
  nota: 'La compañía no ha informado qué asegura esta póliza. No es que no tenga objeto: es que no consta.',
}

export type EntradaObjeto = {
  tipo: string
  /** `polizas.datos_especificos` tal cual (JSON de la ingesta). */
  datos?: Record<string, unknown> | null
  /** Descripciones de `poliza_coberturas` — lo único que describe una RC. */
  coberturas?: Array<string | null | undefined> | null
}

export function objetoAsegurado(entrada: EntradaObjeto): ObjetoAsegurado {
  const tipo = (entrada.tipo || '').toLowerCase()
  const d = entrada.datos && typeof entrada.datos === 'object' ? entrada.datos : {}

  if (tipo === 'auto' || tipo === 'moto') return objetoVehiculo(d)
  if (tipo === 'hogar' || tipo === 'comunidad') return objetoInmueble(d, tipo)
  if (tipo === 'comercio') return objetoComercio(d, entrada.coberturas)
  if (tipo === 'responsabilidad_civil') return objetoResponsabilidadCivil(entrada.coberturas)
  if (RAMOS_DE_PERSONAS.has(tipo)) {
    return {
      estado: 'sin_objeto',
      titulo: 'El propio asegurado',
      detalle: null,
      nota: 'Es un seguro de personas: no hay bien asegurado que listar.',
    }
  }
  return objetoGenerico(d, entrada.coberturas)
}

function objetoVehiculo(d: Record<string, unknown>): ObjetoAsegurado {
  const marca = claro(d.marca)
  const modelo = claro(d.modelo)
  const version = claro(d.version)
  const anio = claro(d.anio)
  // `vehiculo` NO es una descripción: medido en la cartera real, viene con la
  // matrícula dentro. Solo se usa como matrícula de respaldo, y solo si lo
  // parece — etiquetarla como «modelo» sería inventarse el dato.
  const respaldo = claro(d.vehiculo)
  const matricula = claro(d.matricula) ?? (respaldo && pareceMatricula(respaldo) ? respaldo : null)
  const descripcionSuelta = respaldo && !pareceMatricula(respaldo) ? respaldo : null

  const titulo = unir([marca, modelo], ' ') ?? descripcionSuelta
  const detalle = unir([matricula, version, anio])

  if (titulo === null && detalle === null) return NO_INFORMADO
  if (titulo === null) {
    return {
      estado: 'conocido',
      titulo: matricula,
      detalle: unir([version, anio]),
      nota: 'De este vehículo consta la matrícula, pero la compañía no ha informado marca ni modelo.',
    }
  }
  return {
    estado: 'conocido',
    titulo,
    detalle,
    nota: matricula === null ? 'Sin matrícula informada por la compañía.' : null,
  }
}

function objetoInmueble(d: Record<string, unknown>, tipo: string): ObjetoAsegurado {
  const localidad = claro(d.localidad)
  const cp = claro(d.cp)
  const metros = numero(d.metrosCuadrados)
  const anio = numero(d.anioConstruccion)
  const viviendas = numero(d.nViviendas)
  const bloques = numero(d.nBloques)
  const direccionCifrada = texto(d.direccion) === 'cifrado'
  const direccionClara = claro(d.direccion)

  const titulo = direccionClara ?? unir([localidad, cp ? `CP ${cp}` : null], ' · ')
  const detalle = unir([
    metros ? `${metros} m²` : null,
    anio ? `construida en ${anio}` : null,
    viviendas ? `${viviendas} viviendas` : null,
    bloques ? `${bloques} bloques` : null,
  ])

  if (titulo === null && detalle === null) {
    if (direccionCifrada) {
      return {
        estado: 'cifrado',
        titulo: null,
        detalle: null,
        nota: 'La dirección del riesgo SÍ está, pero llega cifrada del CRM de origen y aquí no hay clave para leerla.',
      }
    }
    return NO_INFORMADO
  }
  return {
    estado: 'conocido',
    titulo: titulo ?? (tipo === 'comunidad' ? 'Comunidad' : 'Vivienda'),
    detalle,
    nota: direccionClara !== null
      ? null
      : direccionCifrada
        ? 'La calle exacta viene cifrada del CRM de origen: aquí solo se puede mostrar localidad y código postal.'
        : 'Sin dirección informada por la compañía.',
  }
}

function objetoComercio(
  d: Record<string, unknown>,
  coberturas: EntradaObjeto['coberturas'],
): ObjetoAsegurado {
  const actividad = claro(d.actividad)
  const riesgo = claro(d.riesgoComercio)
  const localidad = claro(d.localidad)
  if (actividad === null && riesgo === null) {
    return porCoberturas(coberturas, 'Sin actividad informada: se describe por las coberturas contratadas.')
  }
  return {
    estado: 'conocido',
    titulo: actividad ?? riesgo,
    detalle: unir([actividad !== null ? riesgo : null, localidad]),
    nota: null,
  }
}

/**
 * Una RC no tiene bien: tiene MODALIDAD. Lo que la describe («de qué es») son
 * las coberturas contratadas — locativa, patronal/accidentes de trabajo,
 * explotación… y eso vive en `poliza_coberturas`, no en `datos_especificos`.
 */
function objetoResponsabilidadCivil(coberturas: EntradaObjeto['coberturas']): ObjetoAsegurado {
  return porCoberturas(
    coberturas,
    'Una RC no asegura un bien: lo que la identifica son sus modalidades (coberturas contratadas).',
  )
}

/** Describe una póliza por las coberturas contratadas, que es lo único que hay
 *  cuando no existe ficha del bien. */
function porCoberturas(coberturas: EntradaObjeto['coberturas'], nota: string | null): ObjetoAsegurado {
  const modalidades: string[] = []
  for (const c of coberturas ?? []) {
    const t = claro(c)
    if (t === null) continue
    const normal = t.length > 40 ? `${t.slice(0, 40)}…` : t
    if (!modalidades.some(m => m.toLowerCase() === normal.toLowerCase())) modalidades.push(normal)
  }
  if (modalidades.length === 0) return NO_INFORMADO
  const visibles = modalidades.slice(0, 3)
  return {
    estado: 'conocido',
    titulo: visibles.join(', '),
    detalle: modalidades.length > visibles.length ? `+${modalidades.length - visibles.length} coberturas` : null,
    nota,
  }
}

/** Ramos sin plantilla propia: se aprovecha lo que haya, sin inventar etiquetas. */
function objetoGenerico(
  d: Record<string, unknown>,
  coberturas: EntradaObjeto['coberturas'],
): ObjetoAsegurado {
  const viviendas = numero(d.nViviendas)
  const bloques = numero(d.nBloques)
  if (viviendas !== null || bloques !== null) {
    return {
      estado: 'conocido',
      titulo: unir([
        viviendas ? `${viviendas} viviendas` : null,
        bloques ? `${bloques} bloques` : null,
      ], ' · '),
      detalle: null,
      nota: null,
    }
  }
  const actividad = claro(d.actividad)
  if (actividad !== null) return { estado: 'conocido', titulo: actividad, detalle: null, nota: null }
  return porCoberturas(coberturas, 'Descrita por sus coberturas: este ramo no trae ficha del bien asegurado.')
}
