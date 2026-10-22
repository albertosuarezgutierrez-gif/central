// Material del empleado (EPIs, herramientas, maquinaria): reglas PURAS (migración 0028).
// El empleado sube una foto + tipo + nombre corto + nota; RRHH la revisa y pone el estado.
// 🚨 Aislamiento: el path de la foto lo construye el SERVIDOR (`pathMaterial`) con el empresa_id y
// el empleado_id de la SESIÓN; antes de firmar una URL se comprueba con `esPathMaterialDe` que el
// path de la fila cuelga de su empresa/empleado. Nunca se firma un path que venga del cliente.

export const TIPOS_MATERIAL = ['epi', 'herramienta', 'maquinaria', 'otro'] as const
export type TipoMaterial = (typeof TIPOS_MATERIAL)[number]
export const ETIQUETA_TIPO: Record<TipoMaterial, string> = {
  epi: 'EPI', herramienta: 'Herramienta', maquinaria: 'Maquinaria', otro: 'Otro',
}

export const ESTADOS_MATERIAL = ['pendiente', 'revisado', 'falta_roto', 'devuelto'] as const
export type EstadoMaterial = (typeof ESTADOS_MATERIAL)[number]
export const ETIQUETA_ESTADO: Record<EstadoMaterial, string> = {
  pendiente: 'Pendiente de revisar', revisado: 'Revisado ✓', falta_roto: 'Falta o roto', devuelto: 'Devuelto',
}
/** Estados que RRHH puede poner desde el panel (volver a `pendiente` no se ofrece). */
export const ESTADOS_REVISION = ['revisado', 'falta_roto', 'devuelto'] as const satisfies readonly EstadoMaterial[]

export const MAX_BYTES_FOTO = 8 * 1024 * 1024
/**
 * Lo que de verdad cabe en una petición a una función de Vercel (~4,5 MB de cuerpo, menos el sobre
 * multipart). El cliente no manda un ORIGINAL sin comprimir por encima de esto: Vercel lo cortaría
 * con un 413 antes de llegar a nuestro código. El servidor sigue aceptando hasta `MAX_BYTES_FOTO`.
 */
export const MAX_BYTES_ORIGINAL_CLIENTE = 4 * 1024 * 1024
export const NOMBRE_MAX = 80
export const NOTA_MAX = 500
export const LADO_MAX_COMPRIMIDO = 1600

export const MIME_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const
export type MimeFoto = (typeof MIME_PERMITIDOS)[number]
const EXT: Record<MimeFoto, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' }

// Marcas ISO-BMFF de HEIC/HEIF (bytes 8..12 tras `ftyp`).
const MARCAS_HEIC = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'])

const ascii = (b: Uint8Array, desde: number, hasta: number) => String.fromCharCode(...b.subarray(desde, hasta))

/** Tipo REAL por los magic bytes (no por el content-type declarado). null = no es una imagen admitida. */
export function detectarImagen(b: Uint8Array): MimeFoto | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((x, i) => b[i] === x)) return 'image/png'
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP') return 'image/webp'
  if (b.length >= 12 && ascii(b, 4, 8) === 'ftyp' && MARCAS_HEIC.has(ascii(b, 8, 12))) return 'image/heic'
  return null
}

export type FotoValida = { ok: true; mime: MimeFoto; ext: string } | { ok: false; error: string; status: 400 | 413 | 415 }

/** Valida la foto: tamaño (1..8 MB), content-type declarado en la lista y que coincida con los magic bytes. */
export function validarFoto(declarado: string, tamano: number, cabecera: Uint8Array): FotoValida {
  if (!Number.isFinite(tamano) || tamano <= 0) return { ok: false, error: 'La foto está vacía', status: 400 }
  if (tamano > MAX_BYTES_FOTO) return { ok: false, error: 'La foto pasa de 8 MB', status: 413 }
  const decl = (declarado || '').split(';')[0].trim().toLowerCase()
  if (!(MIME_PERMITIDOS as readonly string[]).includes(decl)) {
    return { ok: false, error: 'Formato no admitido (solo JPG, PNG, WEBP o HEIC)', status: 415 }
  }
  const real = detectarImagen(cabecera)
  if (!real || real !== decl) return { ok: false, error: 'El archivo no es una imagen válida', status: 415 }
  return { ok: true, mime: real, ext: EXT[real] }
}

export type AltaMaterial = { tipo: TipoMaterial; nombre: string; nota: string | null }

/** Valida tipo / nombre (1..80, recortado) / nota (≤500, vacía → NULL). */
export function validarAltaMaterial(entrada: { tipo?: unknown; nombre?: unknown; nota?: unknown }):
  { ok: true; datos: AltaMaterial } | { ok: false; error: string } {
  const tipo = typeof entrada.tipo === 'string' ? entrada.tipo : ''
  if (!(TIPOS_MATERIAL as readonly string[]).includes(tipo)) return { ok: false, error: 'Tipo de material no válido' }
  const nombre = typeof entrada.nombre === 'string' ? entrada.nombre.trim().replace(/\s+/g, ' ') : ''
  if (!nombre) return { ok: false, error: 'Pon un nombre corto al material' }
  if (nombre.length > NOMBRE_MAX) return { ok: false, error: `El nombre admite como máximo ${NOMBRE_MAX} caracteres` }
  const notaTxt = typeof entrada.nota === 'string' ? entrada.nota.trim() : ''
  if (notaTxt.length > NOTA_MAX) return { ok: false, error: `La nota admite como máximo ${NOTA_MAX} caracteres` }
  return { ok: true, datos: { tipo: tipo as TipoMaterial, nombre, nota: notaTxt || null } }
}

/** Cambio de estado desde el panel: solo los de `ESTADOS_REVISION`; nota opcional ≤500 (vacía → NULL). */
export function validarCambioEstado(entrada: { estado?: unknown; nota?: unknown }):
  { ok: true; estado: EstadoMaterial; nota: string | null } | { ok: false; error: string } {
  const estado = typeof entrada.estado === 'string' ? entrada.estado : ''
  if (!(ESTADOS_REVISION as readonly string[]).includes(estado)) return { ok: false, error: 'Estado no válido' }
  const nota = typeof entrada.nota === 'string' ? entrada.nota.trim() : ''
  if (nota.length > NOTA_MAX) return { ok: false, error: `La nota admite como máximo ${NOTA_MAX} caracteres` }
  return { ok: true, estado: estado as EstadoMaterial, nota: nota || null }
}

/** El empleado solo puede borrar lo suyo mientras RRHH no lo haya revisado. */
export function empleadoPuedeBorrar(estado: string): boolean {
  return estado === 'pendiente'
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

/** `material/<empresa>/<empleado>/<uuid>.<ext>` — sin datos personales en el nombre. */
export function pathMaterial(empresaId: string, empleadoId: string, uuid: string, ext: string): string {
  if (!UUID_RE.test(empresaId) || !UUID_RE.test(empleadoId) || !UUID_RE.test(uuid)) throw new Error('Identificador no válido')
  if (!Object.values(EXT).includes(ext)) throw new Error('Extensión no válida')
  return `material/${empresaId.toLowerCase()}/${empleadoId.toLowerCase()}/${uuid.toLowerCase()}.${ext}`
}

/** ¿`path` es una foto de material de ESA empresa y ESE empleado? (antes de firmar una URL). */
export function esPathMaterialDe(empresaId: string, empleadoId: string, path: unknown): path is string {
  if (typeof path !== 'string' || !UUID_RE.test(empresaId) || !UUID_RE.test(empleadoId)) return false
  return new RegExp(`^material/${empresaId.toLowerCase()}/${empleadoId.toLowerCase()}/${UUID}\\.(jpg|png|webp|heic)$`).test(path)
}

export type FiltrosMaterial = {
  empleado_id: string | null; tipo: TipoMaterial | null; estado: EstadoMaterial | null; offset: number; limit: number
}

/** Filtros del panel desde la query. Un valor fuera de catálogo se IGNORA (no se convierte en otro). */
export function leerFiltrosMaterial(sp: URLSearchParams): FiltrosMaterial {
  const emp = sp.get('empleado_id') ?? ''
  const tipo = sp.get('tipo') ?? ''
  const estado = sp.get('estado') ?? ''
  const offset = Math.max(0, Number.parseInt(sp.get('offset') ?? '0', 10) || 0)
  const limit = Math.min(100, Math.max(1, Number.parseInt(sp.get('limit') ?? '50', 10) || 50))
  return {
    empleado_id: UUID_RE.test(emp) ? emp.toLowerCase() : null,
    tipo: (TIPOS_MATERIAL as readonly string[]).includes(tipo) ? (tipo as TipoMaterial) : null,
    estado: (ESTADOS_MATERIAL as readonly string[]).includes(estado) ? (estado as EstadoMaterial) : null,
    offset, limit,
  }
}

/**
 * Qué sube el cliente: la versión comprimida si la hay; si la compresión falló (p. ej. HEIC en un
 * navegador que no lo decodifica), el ORIGINAL solo si es de un tipo admitido y cabe en lo que deja
 * pasar Vercel. Si no, error claro (no se manda algo que va a rebotar).
 */
export function decidirSubida(original: { type: string; size: number }, comprimida: { size: number } | null):
  { usar: 'comprimida' | 'original' } | { error: string } {
  if (comprimida && comprimida.size > 0 && comprimida.size <= MAX_BYTES_ORIGINAL_CLIENTE) return { usar: 'comprimida' }
  const tipo = (original.type || '').toLowerCase()
  if (!(MIME_PERMITIDOS as readonly string[]).includes(tipo)) {
    return { error: 'No se pudo preparar la foto en este móvil. Hazla en JPG (cámara normal) y vuelve a probar.' }
  }
  if (original.size > MAX_BYTES_ORIGINAL_CLIENTE) {
    return { error: 'La foto es demasiado grande y este navegador no la puede reducir. Prueba con otra foto o desde otro navegador.' }
  }
  return { usar: 'original' }
}
