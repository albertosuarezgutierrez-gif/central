// Editar y dar de alta un cliente de la correduría: las REGLAS, sin BD.
//
// Dictado de Alberto (02/09/2026): el contacto (varios teléfonos y emails, la
// dirección) se cambia libremente; los datos de IDENTIDAD —DNI, nombre,
// apellidos, fecha de nacimiento— «tendrá que solicitarlo documentado»: solo se
// tocan con un documento de identidad RECIBIDO en la ficha, y el cambio queda
// anotado con ese documento.
//
// Lo que este módulo decide y lo que no:
// - Normaliza y valida lo que se teclea (un teléfono con espacios, un DNI con
//   guiones, una fecha en formato español) y dice POR QUÉ no vale.
// - Decide si una edición exige documento (`revisarEdicion`) y qué documento
//   sirve (`documentoAcredita`).
// - NO cifra, NO consulta nada: eso es de `apps/asegura/lib/cartera-edicion.ts`.

import type { DocumentoResumen } from './documentos.ts'

export type Revisado<T> = { ok: true; valor: T } | { ok: false; motivo: string }

// ─── Contacto ────────────────────────────────────────────────────────────────

export type TipoContacto = 'telefono' | 'email'

/** Etiquetas cerradas: un texto libre acaba con «movil», «Móvil» y «mobil» como tres cosas. */
export const ETIQUETAS_TELEFONO = ['móvil', 'fijo', 'trabajo', 'whatsapp', 'otro'] as const
export const ETIQUETAS_EMAIL = ['personal', 'trabajo', 'otro'] as const

export function etiquetaContacto(tipo: TipoContacto, v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim().toLowerCase()
  const lista: readonly string[] = tipo === 'telefono' ? ETIQUETAS_TELEFONO : ETIQUETAS_EMAIL
  return lista.includes(t) ? t : null
}

/** Un teléfono/email de la ficha. `valor === null && ilegible` = cifrado que no abre. */
export type ContactoCliente = {
  id: string
  tipo: TipoContacto
  valor: string | null
  ilegible: boolean
  etiqueta: string | null
  principal: boolean
  creado: string
}

/**
 * Teléfono → forma canónica. Español: 9 dígitos que empiezan por 6-9, sin
 * prefijo (así están los 4.794 de `cliente_telefonos`); se admite `+34`/`0034`
 * delante y se quita. Extranjero: `+` y 8-15 dígitos, se conserva el `+`.
 */
export function normalizarTelefono(v: unknown): Revisado<string> {
  if (typeof v !== 'string') return { ok: false, motivo: 'Falta el teléfono.' }
  let s = v.replace(/[\s.\-()]/g, '')
  if (s === '') return { ok: false, motivo: 'Falta el teléfono.' }
  if (s.startsWith('0034')) s = '+34' + s.slice(4)
  if (/^\+34\d{9}$/.test(s)) s = s.slice(3)
  if (/^\d{9}$/.test(s)) {
    if (!/^[6-9]/.test(s)) return { ok: false, motivo: 'Un teléfono español empieza por 6, 7, 8 o 9.' }
    return { ok: true, valor: s }
  }
  if (/^\+\d{8,15}$/.test(s)) return { ok: true, valor: s }
  return { ok: false, motivo: 'Teléfono no válido: 9 dígitos (o +prefijo y número para el extranjero).' }
}

export function normalizarEmail(v: unknown): Revisado<string> {
  if (typeof v !== 'string') return { ok: false, motivo: 'Falta el email.' }
  const s = v.trim().toLowerCase()
  if (s === '') return { ok: false, motivo: 'Falta el email.' }
  // Suficiente para cazar el error de tecleo; la validez real la da el envío.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) || s.length > 254) {
    return { ok: false, motivo: 'Email no válido.' }
  }
  return { ok: true, valor: s }
}

export function normalizarContacto(tipo: TipoContacto, v: unknown): Revisado<string> {
  return tipo === 'telefono' ? normalizarTelefono(v) : normalizarEmail(v)
}

// ─── Identidad ───────────────────────────────────────────────────────────────

const LETRAS_DNI = 'TRWAGMYFPDXBNJZSQVHLCKE'

export type TipoPersona = 'fisica' | 'juridica'

/**
 * DNI / NIE / CIF → forma canónica (mayúsculas, sin separadores) y qué es.
 * DNI y NIE comprueban la letra de control; el CIF solo la forma (el dígito
 * de control del CIF tiene dos algoritmos según la letra y aquí no se juega
 * nada con él: la búsqueda va por hash de la forma canónica).
 */
export function normalizarDni(v: unknown): Revisado<{ valor: string; tipoPersona: TipoPersona }> {
  if (typeof v !== 'string') return { ok: false, motivo: 'Falta el DNI.' }
  const s = v.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (s === '') return { ok: false, motivo: 'Falta el DNI.' }
  const dni = /^(\d{8})([A-Z])$/.exec(s)
  if (dni) {
    if (LETRAS_DNI[Number(dni[1]) % 23] !== dni[2]) return { ok: false, motivo: 'La letra del DNI no cuadra con los números.' }
    return { ok: true, valor: { valor: s, tipoPersona: 'fisica' } }
  }
  const nie = /^([XYZ])(\d{7})([A-Z])$/.exec(s)
  if (nie) {
    const n = Number(String('XYZ'.indexOf(nie[1])) + nie[2])
    if (LETRAS_DNI[n % 23] !== nie[3]) return { ok: false, motivo: 'La letra del NIE no cuadra con los números.' }
    return { ok: true, valor: { valor: s, tipoPersona: 'fisica' } }
  }
  if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(s)) return { ok: true, valor: { valor: s, tipoPersona: 'juridica' } }
  return { ok: false, motivo: 'No es un DNI, NIE ni CIF válido.' }
}

/** «12345678Z» → «*****678Z»: lo justo para reconocerlo sin que cruce entero el puerto. */
export function enmascararDni(dni: string | null): string | null {
  if (!dni) return null
  const s = dni.trim()
  if (s.length <= 4) return '*'.repeat(s.length)
  return '*'.repeat(s.length - 4) + s.slice(-4)
}

/** Fecha de nacimiento en `YYYY-MM-DD` o `D/M/YYYY` → ISO. Tiene que existir y ser pasada. */
export function normalizarFechaNacimiento(v: unknown, hoy = new Date()): Revisado<string> {
  if (typeof v !== 'string' || v.trim() === '') return { ok: false, motivo: 'Falta la fecha de nacimiento.' }
  const s = v.trim()
  let a: number, m: number, d: number
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  const esp = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s)
  if (iso) [a, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
  else if (esp) [d, m, a] = [Number(esp[1]), Number(esp[2]), Number(esp[3])]
  else return { ok: false, motivo: 'Fecha no válida: usa DD/MM/AAAA.' }
  const f = new Date(Date.UTC(a, m - 1, d))
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) {
    return { ok: false, motivo: 'Esa fecha no existe.' }
  }
  if (a < 1900) return { ok: false, motivo: 'Fecha de nacimiento anterior a 1900.' }
  if (f.getTime() > hoy.getTime()) return { ok: false, motivo: 'La fecha de nacimiento no puede ser futura.' }
  return { ok: true, valor: `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` }
}

export function normalizarNombre(v: unknown, campo = 'nombre'): Revisado<string> {
  if (typeof v !== 'string') return { ok: false, motivo: `Falta el ${campo}.` }
  const s = v.replace(/\s+/g, ' ').trim()
  if (s === '') return { ok: false, motivo: `Falta el ${campo}.` }
  if (s.length > 255) return { ok: false, motivo: `El ${campo} es demasiado largo.` }
  return { ok: true, valor: s }
}

export function normalizarCp(v: unknown): Revisado<string> {
  if (typeof v !== 'string') return { ok: false, motivo: 'Falta el código postal.' }
  const s = v.trim()
  if (!/^\d{5}$/.test(s)) return { ok: false, motivo: 'El código postal son 5 dígitos.' }
  const p = Number(s.slice(0, 2))
  if (p < 1 || p > 52) return { ok: false, motivo: 'Código postal fuera de España.' }
  return { ok: true, valor: s }
}

/** Provincia por los dos primeros dígitos del CP (la que se corrigió a mano en 32 fichas el 02/09/2026). */
const PROVINCIA_POR_CP: Record<string, string> = {
  '01': 'Álava', '02': 'Albacete', '03': 'Alicante', '04': 'Almería', '05': 'Ávila', '06': 'Badajoz',
  '07': 'Illes Balears', '08': 'Barcelona', '09': 'Burgos', '10': 'Cáceres', '11': 'Cádiz', '12': 'Castellón',
  '13': 'Ciudad Real', '14': 'Córdoba', '15': 'A Coruña', '16': 'Cuenca', '17': 'Girona', '18': 'Granada',
  '19': 'Guadalajara', '20': 'Gipuzkoa', '21': 'Huelva', '22': 'Huesca', '23': 'Jaén', '24': 'León',
  '25': 'Lleida', '26': 'La Rioja', '27': 'Lugo', '28': 'Madrid', '29': 'Málaga', '30': 'Murcia',
  '31': 'Navarra', '32': 'Ourense', '33': 'Asturias', '34': 'Palencia', '35': 'Las Palmas', '36': 'Pontevedra',
  '37': 'Salamanca', '38': 'Santa Cruz de Tenerife', '39': 'Cantabria', '40': 'Segovia', '41': 'Sevilla',
  '42': 'Soria', '43': 'Tarragona', '44': 'Teruel', '45': 'Toledo', '46': 'Valencia', '47': 'Valladolid',
  '48': 'Bizkaia', '49': 'Zamora', '50': 'Zaragoza', '51': 'Ceuta', '52': 'Melilla',
}

export function provinciaPorCp(cp: string | null | undefined): string | null {
  if (!cp) return null
  return PROVINCIA_POR_CP[cp.trim().slice(0, 2)] ?? null
}

// ─── Edición ─────────────────────────────────────────────────────────────────

export type CampoIdentidad = 'dni' | 'nombre' | 'apellidos' | 'fechaNacimiento'
export const CAMPOS_IDENTIDAD: readonly CampoIdentidad[] = ['dni', 'nombre', 'apellidos', 'fechaNacimiento']

export type CampoLibre = 'direccion' | 'codigoPostal' | 'ciudad' | 'provincia' | 'notas'
export const CAMPOS_LIBRES: readonly CampoLibre[] = ['direccion', 'codigoPostal', 'ciudad', 'provincia', 'notas']

export const ETIQUETA_CAMPO: Record<CampoIdentidad | CampoLibre, string> = {
  dni: 'DNI', nombre: 'nombre', apellidos: 'apellidos', fechaNacimiento: 'fecha de nacimiento',
  direccion: 'dirección', codigoPostal: 'código postal', ciudad: 'ciudad', provincia: 'provincia', notas: 'notas',
}

/** `null` en un campo = borrarlo; ausente = no tocarlo. */
export type EdicionCliente = {
  identidad?: Partial<Record<CampoIdentidad, string | null>>
  libre?: Partial<Record<CampoLibre, string | null>>
  /** El documento de identidad que acredita el cambio. Obligatorio si se toca identidad. */
  documentoId?: string | null
}

export type IdentidadRevisada = {
  dni?: { valor: string; tipoPersona: TipoPersona } | null
  nombre?: string
  apellidos?: string
  fechaNacimiento?: string | null
}

export type EdicionRevisada =
  | { ok: true; identidad: IdentidadRevisada; libre: Partial<Record<CampoLibre, string | null>>; tocaIdentidad: boolean }
  | { ok: false; motivo: string; campo?: CampoIdentidad | CampoLibre }

/** `'documento_requerido'` es el motivo que la pantalla convierte en «pide el DNI». */
export const MOTIVO_DOCUMENTO_REQUERIDO = 'documento_requerido'

/**
 * Revisa una edición entera. Un solo motivo de rechazo cada vez, con su campo,
 * para que el formulario señale la casilla.
 */
export function revisarEdicion(e: EdicionCliente): EdicionRevisada {
  const identidad: IdentidadRevisada = {}
  const libre: Partial<Record<CampoLibre, string | null>> = {}

  for (const campo of CAMPOS_IDENTIDAD) {
    if (!e.identidad || !(campo in e.identidad)) continue
    const v = e.identidad[campo]
    if (campo === 'nombre' || campo === 'apellidos') {
      if (v === null || v === undefined) {
        if (campo === 'nombre') return { ok: false, motivo: 'El nombre no se puede dejar vacío.', campo }
        identidad.apellidos = ''
        continue
      }
      const r = normalizarNombre(v, campo)
      if (!r.ok) return { ok: false, motivo: r.motivo, campo }
      identidad[campo] = r.valor
    } else if (campo === 'dni') {
      if (v === null) { identidad.dni = null; continue }
      const r = normalizarDni(v)
      if (!r.ok) return { ok: false, motivo: r.motivo, campo }
      identidad.dni = r.valor
    } else {
      if (v === null) { identidad.fechaNacimiento = null; continue }
      const r = normalizarFechaNacimiento(v)
      if (!r.ok) return { ok: false, motivo: r.motivo, campo }
      identidad.fechaNacimiento = r.valor
    }
  }

  for (const campo of CAMPOS_LIBRES) {
    if (!e.libre || !(campo in e.libre)) continue
    const v = e.libre[campo]
    if (v === null || v === undefined || v.trim() === '') { libre[campo] = null; continue }
    if (campo === 'codigoPostal') {
      const r = normalizarCp(v)
      if (!r.ok) return { ok: false, motivo: r.motivo, campo }
      libre.codigoPostal = r.valor
      continue
    }
    const s = v.replace(/\s+/g, ' ').trim()
    if (campo !== 'notas' && s.length > 100) return { ok: false, motivo: `${ETIQUETA_CAMPO[campo]}: demasiado largo.`, campo }
    libre[campo] = s
  }

  const tocaIdentidad = Object.keys(identidad).length > 0
  if (!tocaIdentidad && Object.keys(libre).length === 0) return { ok: false, motivo: 'No hay nada que cambiar.' }
  if (tocaIdentidad && !e.documentoId) return { ok: false, motivo: MOTIVO_DOCUMENTO_REQUERIDO }
  return { ok: true, identidad, libre, tocaIdentidad }
}

/** Qué documento sirve para cambiar la identidad: uno de tipo DNI que HAYA LLEGADO. */
export function documentoAcredita(d: Pick<DocumentoResumen, 'tipo' | 'estado'>): boolean {
  return d.tipo === 'dni' && d.estado !== 'pedido'
}

export function documentosAcreditativos(docs: readonly DocumentoResumen[] | null): DocumentoResumen[] {
  return (docs ?? []).filter(documentoAcredita)
}

/**
 * El texto que queda en `historial_interno`. Sin valores de identidad: dice QUÉ
 * cambió y con qué documento, no el DNI nuevo ni el viejo (el historial va en
 * claro). Los campos libres sí llevan su valor nuevo, salvo la dirección.
 */
export function textoHistorialEdicion(
  r: Extract<EdicionRevisada, { ok: true }>,
  ctx: { actor: string; documentoId?: string | null },
): string {
  const partes: string[] = []
  const ident = (Object.keys(r.identidad) as CampoIdentidad[]).map((c) => ETIQUETA_CAMPO[c])
  if (ident.length > 0) {
    partes.push(`identidad (${ident.join(', ')})${ctx.documentoId ? ` acreditada con el documento ${ctx.documentoId}` : ''}`)
  }
  for (const c of Object.keys(r.libre) as CampoLibre[]) {
    const v = r.libre[c]
    if (c === 'direccion' || c === 'notas') partes.push(v === null ? `${ETIQUETA_CAMPO[c]} borrada` : `${ETIQUETA_CAMPO[c]} cambiada`)
    else partes.push(v === null ? `${ETIQUETA_CAMPO[c]} borrado` : `${ETIQUETA_CAMPO[c]} → ${v}`)
  }
  return `Edición desde plataforma por ${ctx.actor}: ${partes.join(' · ')}`
}

// ─── Alta ────────────────────────────────────────────────────────────────────

/**
 * De dónde sale una ficha (`clientes.fuente`, enum `fuente_origen` de la BD).
 * Los seis primeros son los del CRM de Manuel (nadie los escribía); los tres
 * últimos son los CANALES de lead (02/09/2026): formulario web, portal del
 * cliente y WhatsApp. Mismo orden y mismos literales que el enum de Prisma.
 */
export const FUENTES_ORIGEN = [
  'venta_directa', 'tarifas_blancas', 'ahorro_seguro', 'recomendacion', 'renovacion', 'otros',
  'web', 'portal', 'whatsapp',
] as const
export type FuenteOrigen = (typeof FUENTES_ORIGEN)[number]

/** Los canales por los que ENTRA un lead sin que nadie lo teclee (§6 de la visión del CRM). */
export const FUENTES_CANAL: readonly FuenteOrigen[] = ['web', 'portal', 'whatsapp']

export function esFuenteCanal(f: FuenteOrigen | null | undefined): boolean {
  return f != null && FUENTES_CANAL.includes(f)
}

/** Texto → fuente válida. Vacío/ausente → `null` (no se sabe); desconocida → rechazo con motivo. */
export function fuenteOrigen(v: unknown): Revisado<FuenteOrigen | null> {
  if (v === null || v === undefined) return { ok: true, valor: null }
  if (typeof v !== 'string') return { ok: false, motivo: 'Fuente no válida.' }
  const s = v.trim().toLowerCase()
  if (s === '') return { ok: true, valor: null }
  if ((FUENTES_ORIGEN as readonly string[]).includes(s)) return { ok: true, valor: s as FuenteOrigen }
  return { ok: false, motivo: `Fuente desconocida: «${s}».` }
}

export const ETIQUETA_FUENTE: Record<FuenteOrigen, string> = {
  venta_directa: 'venta directa',
  tarifas_blancas: 'tarifas blancas',
  ahorro_seguro: 'ahorro seguro',
  recomendacion: 'recomendación',
  renovacion: 'renovación',
  otros: 'otros',
  web: 'formulario web',
  portal: 'portal del cliente',
  whatsapp: 'WhatsApp',
}

export type AltaCliente = {
  nombre: string
  apellidos: string
  dni: string | null
  tipoPersona: TipoPersona | null
  fechaNacimiento: string | null
  telefono: string | null
  email: string | null
  direccion: string | null
  codigoPostal: string | null
  ciudad: string | null
  provincia: string | null
  notas: string | null
  /** `null` = no se ha dicho (alta manual antigua); NUNCA se inventa «otros». */
  fuente: FuenteOrigen | null
}

export type TipoHistorial = 'nota' | 'gestion' | 'contacto'
export const TIPOS_HISTORIAL: readonly TipoHistorial[] = ['nota', 'gestion', 'contacto']

export function tipoHistorial(v: unknown): TipoHistorial | null {
  return typeof v === 'string' && (TIPOS_HISTORIAL as readonly string[]).includes(v) ? (v as TipoHistorial) : null
}

/**
 * Qué fila deja un alta en `historial_interno`. Un lead que entra por un CANAL
 * (web, portal, WhatsApp) es un CONTACTO del cliente con la correduría —§6:
 * «cada contacto deja historial tipo contacto»—; un alta tecleada es una nota.
 */
export function tipoHistorialAlta(fuente: FuenteOrigen | null): TipoHistorial {
  return esFuenteCanal(fuente) ? 'contacto' : 'nota'
}

export function textoHistorialAlta(
  a: Pick<AltaCliente, 'fuente' | 'notas'>,
  ctx: { actor: string; compartido?: boolean },
): string {
  const coletilla = ctx.compartido ? ' (comparte teléfono/email con otra ficha, a sabiendas)' : ''
  if (esFuenteCanal(a.fuente)) {
    const via = ETIQUETA_FUENTE[a.fuente as FuenteOrigen]
    return `Lead recibido por ${via}${a.notas ? `: ${a.notas}` : ''}${coletilla}`
  }
  const origen = a.fuente ? ` (fuente: ${ETIQUETA_FUENTE[a.fuente]})` : ''
  return `Alta manual desde plataforma por ${ctx.actor}${origen}${coletilla}`
}

export type AltaRevisada = { ok: true; alta: AltaCliente } | { ok: false; motivo: string; campo?: string }

/**
 * Un alta exige nombre y AL MENOS un dato por el que se pueda volver a
 * encontrar (DNI, teléfono o email): una ficha con solo un nombre es la que
 * mañana se duplica, porque nadie la encuentra al buscar.
 */
export function revisarAlta(e: Record<string, unknown>): AltaRevisada {
  const nombre = normalizarNombre(e.nombre, 'nombre')
  if (!nombre.ok) return { ok: false, motivo: nombre.motivo, campo: 'nombre' }
  let apellidos = ''
  if (typeof e.apellidos === 'string' && e.apellidos.trim() !== '') {
    const r = normalizarNombre(e.apellidos, 'apellidos')
    if (!r.ok) return { ok: false, motivo: r.motivo, campo: 'apellidos' }
    apellidos = r.valor
  }
  let dni: string | null = null
  let tipoPersona: TipoPersona | null = null
  if (typeof e.dni === 'string' && e.dni.trim() !== '') {
    const r = normalizarDni(e.dni)
    if (!r.ok) return { ok: false, motivo: r.motivo, campo: 'dni' }
    dni = r.valor.valor
    tipoPersona = r.valor.tipoPersona
  }
  let fechaNacimiento: string | null = null
  if (typeof e.fechaNacimiento === 'string' && e.fechaNacimiento.trim() !== '') {
    const r = normalizarFechaNacimiento(e.fechaNacimiento)
    if (!r.ok) return { ok: false, motivo: r.motivo, campo: 'fechaNacimiento' }
    fechaNacimiento = r.valor
  }
  let telefono: string | null = null
  if (typeof e.telefono === 'string' && e.telefono.trim() !== '') {
    const r = normalizarTelefono(e.telefono)
    if (!r.ok) return { ok: false, motivo: r.motivo, campo: 'telefono' }
    telefono = r.valor
  }
  let email: string | null = null
  if (typeof e.email === 'string' && e.email.trim() !== '') {
    const r = normalizarEmail(e.email)
    if (!r.ok) return { ok: false, motivo: r.motivo, campo: 'email' }
    email = r.valor
  }
  if (!dni && !telefono && !email) {
    return { ok: false, motivo: 'Hace falta DNI, teléfono o email: sin ninguno, la ficha no se podrá volver a encontrar.' }
  }
  let codigoPostal: string | null = null
  if (typeof e.codigoPostal === 'string' && e.codigoPostal.trim() !== '') {
    const r = normalizarCp(e.codigoPostal)
    if (!r.ok) return { ok: false, motivo: r.motivo, campo: 'codigoPostal' }
    codigoPostal = r.valor
  }
  const fuente = fuenteOrigen(e.fuente)
  if (!fuente.ok) return { ok: false, motivo: fuente.motivo, campo: 'fuente' }
  const libre = (k: string): string | null =>
    typeof e[k] === 'string' && (e[k] as string).trim() !== '' ? (e[k] as string).replace(/\s+/g, ' ').trim() : null
  const provincia = libre('provincia') ?? provinciaPorCp(codigoPostal)
  return {
    ok: true,
    alta: {
      nombre: nombre.valor,
      apellidos,
      dni,
      tipoPersona,
      fechaNacimiento,
      telefono,
      email,
      direccion: libre('direccion'),
      codigoPostal,
      ciudad: libre('ciudad'),
      provincia,
      notas: libre('notas'),
      fuente: fuente.valor,
    },
  }
}

/** Con qué se ha encontrado ya una ficha al dar de alta (para no duplicarla). */
export type Coincidencia = { id: string; nombre: string; por: 'dni' | 'telefono' | 'email'; tipo: string }

/**
 * Un DNI que ya está NUNCA se fuerza: es la misma persona. Teléfono o email
 * repetidos sí pueden ser dos personas (matrimonio, padre e hijo) y se admite
 * seguir adelante a sabiendas.
 */
export function coincidenciaBloquea(cs: readonly Coincidencia[]): boolean {
  return cs.some((c) => c.por === 'dni')
}

/**
 * Cómo se llaman los campos de identidad según sea persona física o jurídica.
 *
 * 🚨 Alberto, 02/09/2026, mirando GLOBAL 2 INSTALACIONES TÉCNICAS: «¿DNI una
 * empresa?». El dato es el mismo campo (`clientes.dni`) y la ficha ya sabe que
 * es `tipo_persona = juridica`, pero el formulario le pedía DNI, apellidos y
 * fecha de NACIMIENTO a una sociedad. Un rótulo que no encaja con lo que se
 * mira hace dudar del dato, aunque el dato esté bien.
 *
 * `null` (la inmensa mayoría de la cartera: 32.520 fichas del volcado sin
 * clasificar) NO es «física»: se queda con el rótulo neutro de siempre.
 */
export type EtiquetasIdentidad = {
  documento: string
  nombre: string
  apellidos: string
  fecha: string
  /** Para el aviso «hace falta el X en la ficha» y el botón «Pedir X». */
  pedir: string
}

export function etiquetasIdentidad(tipoPersona: TipoPersona | null | undefined): EtiquetasIdentidad {
  if (tipoPersona === 'juridica') {
    return {
      documento: 'CIF',
      nombre: 'Razón social',
      apellidos: 'Razón social (continuación)',
      // Mismo campo que la fecha de nacimiento de una persona.
      fecha: 'Fecha de constitución',
      pedir: 'CIF',
    }
  }
  return {
    documento: 'DNI / NIE / CIF',
    nombre: 'Nombre',
    apellidos: 'Apellidos',
    fecha: 'Fecha de nacimiento',
    pedir: 'DNI',
  }
}
