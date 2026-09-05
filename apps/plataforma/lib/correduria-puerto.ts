// Los dos lectores nuevos del puerto de asegura: el buscador de TODO y la cola
// de retención (recibos devueltos). Interpretación PURA + la llamada.
//
// El diccionario de motivos vive AQUÍ y no en cada componente: estaba copiado
// en dos sitios y, cuando asegura no responde, la pantalla apilaba tres
// recuadros de error distintos diciendo lo mismo.

import type { Retarificabilidad } from '@central/module-seguros'
import { leerRetarificacion } from './ficha-asegura.ts'

export type MotivoPuerto = 'secreto_rechazado' | 'asegura_error' | 'respuesta_ilegible' | 'red'

/** Causa que declara asegura cuando su BD falla (`causa` en la respuesta del puerto).
 *  Cada una se arregla en un sitio distinto; una causa desconocida se muestra tal cual. */
export const CAUSAS_ASEGURA: Record<string, string> = {
  credenciales: 'la base de datos rechaza la contraseña de DATABASE_URL (rol prisma_seguros): la URL pegada en Vercel no lleva la contraseña actual del rol',
  permisos: 'el rol de DATABASE_URL no tiene permiso sobre el schema seguros',
  conexion: 'no se llega a la base de datos (host, puerto o pooler)',
  esquema: 'falta una tabla o columna en el schema seguros',
  sin_correduria: 'la base responde pero no hay ninguna fila en corredurias',
  otro: 'error no clasificado; mira los logs de central-asegura en Vercel',
}

export function describirCausaAsegura(causa: string | undefined): string | null {
  if (!causa) return null
  return CAUSAS_ASEGURA[causa] ?? causa
}

export const MOTIVOS_PUERTO: Record<MotivoPuerto, string> = {
  secreto_rechazado:
    'asegura rechaza el secreto (ASEGURA_OPERADOR_SECRET no coincide entre los dos proyectos).',
  asegura_error: 'asegura respondió, pero no pudo leer la cartera en central (DATABASE_URL del proyecto Vercel central-asegura, rol prisma_seguros).',
  respuesta_ilegible: 'la respuesta no tenía la forma esperada.',
  red: 'no se pudo llegar a asegura (timeout, DNS o TLS).',
}

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

function numero(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function entero(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null
}

// ── Buscador ────────────────────────────────────────────────────────────────

/**
 * `viva` = entra por CIMA o vence dentro de la ventana · `historica` = volcado
 * de junio · `sin_fecha` / `desconocida` = NO se sabe, y no se disfraza.
 */
export type Vitalidad = 'viva' | 'historica' | 'sin_fecha' | 'desconocida'

export type Hermana = {
  clienteId: string
  nombre: string
  mismoNombre: boolean
  vitalidad: Vitalidad
}

export type Hallazgo = {
  clienteId: string
  nombre: string
  /** El enum de la BD. No dice si es un cliente de hoy: para eso, `vitalidad`. */
  tipo: string
  polizas: number
  porque: string
  /** Pólizas por CIMA. `null` = no se contó, NO 0. */
  polizasCima: number | null
  ultimoVencimiento: string | null
  vitalidad: Vitalidad
  /** `null` = asegura no informa hermanas (versión vieja, o no se pudo mirar).
   *  `[]` = se miró y no hay. Pintarlos igual diría «no hay duplicados». */
  hermanas: Hermana[] | null
  aviso: { clase: 'duplicado' | 'comparte'; texto: string; preferida: Hermana | null } | null
  /**
   * Teléfono y email del titular, para llamar/escribir desde el propio
   * resultado. 🚨 `null` = asegura no lo manda (versión anterior) o no se pudo
   * consultar. NO es «no tiene»: por eso la UI no pinta nada en ese caso, en
   * vez de afirmar que no hay forma de contactar.
   */
  contacto: Contacto | null
}

export type Contacto = {
  telefono: string | null
  /** Hay valor guardado y la clave no lo abre. Se dice «cifrado», no «no hay». */
  telefonoIlegible: boolean
  email: string | null
  emailIlegible: boolean
}

const VITALIDADES = new Set(['viva', 'historica', 'sin_fecha', 'desconocida'])

/** Una vitalidad que no se reconoce NO tumba la lista: degrada a «desconocida»,
 *  que es el estado que no afirma nada. Así una versión más vieja de asegura
 *  (que no manda el campo) sigue sirviendo la búsqueda. */
function vitalidad(v: unknown): Vitalidad {
  return typeof v === 'string' && VITALIDADES.has(v) ? (v as Vitalidad) : 'desconocida'
}

/**
 * El bloque de contacto del hallazgo. Ausente o con forma rara → `null` («no
 * se sabe»), NUNCA un objeto a ceros: eso diría «se ha mirado y no tiene»
 * sobre una ficha que quizá sí tiene teléfono. Es la misma degradación que ya
 * hace el bloque de recibos con una versión anterior de asegura.
 */
export function interpretarContacto(v: unknown): Contacto | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  return {
    telefono: cadena(o.telefono),
    telefonoIlegible: o.telefonoIlegible === true,
    email: cadena(o.email),
    emailIlegible: o.emailIlegible === true,
  }
}

function hermanas(v: unknown): Hermana[] | null {
  if (!Array.isArray(v)) return null
  const out: Hermana[] = []
  for (const h of v) {
    if (typeof h !== 'object' || h === null) continue
    const o = h as Record<string, unknown>
    const id = cadena(o.clienteId)
    const nombre = cadena(o.nombre)
    if (id === null || nombre === null) continue
    out.push({ clienteId: id, nombre, mismoNombre: o.mismoNombre === true, vitalidad: vitalidad(o.vitalidad) })
  }
  return out
}

export type BloqueResultados = {
  tipo: string
  valor: string
  hallazgos: Hallazgo[]
  /** `null` = no se pudo contar el alcance. NO se afirma que alcance a todo. */
  cobertura: { alcanzables: number; total: number } | null
  explicacion: string
}

export type Busqueda =
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: MotivoPuerto }
  | {
      estado: 'ok'
      termino: string
      /** `false` = el término es corto o no encaja en nada. NO es «no hay». */
      buscable: boolean
      bloques: BloqueResultados[]
      avisos: { tema: string; texto: string }[]
      distintos: number
    }

export function interpretarBusqueda(status: number, json: unknown): Busqueda {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  if (status !== 200 || typeof json !== 'object' || json === null) {
    return { estado: 'error', motivo: 'respuesta_ilegible' }
  }
  const r = json as Record<string, unknown>
  if (r.estado === 'sin_configurar') return { estado: 'sin_configurar' }
  if (r.estado === 'error') return { estado: 'error', motivo: 'asegura_error' }
  if (r.estado !== 'ok' || !Array.isArray(r.bloques)) {
    return { estado: 'error', motivo: 'respuesta_ilegible' }
  }

  const bloques: BloqueResultados[] = []
  for (const b of r.bloques) {
    if (typeof b !== 'object' || b === null) return { estado: 'error', motivo: 'respuesta_ilegible' }
    const o = b as Record<string, unknown>
    if (typeof o.tipo !== 'string' || !Array.isArray(o.hallazgos)) {
      return { estado: 'error', motivo: 'respuesta_ilegible' }
    }
    const hallazgos: Hallazgo[] = []
    for (const h of o.hallazgos) {
      if (typeof h !== 'object' || h === null) return { estado: 'error', motivo: 'respuesta_ilegible' }
      const x = h as Record<string, unknown>
      if (typeof x.clienteId !== 'string' || typeof x.nombre !== 'string') {
        return { estado: 'error', motivo: 'respuesta_ilegible' }
      }
      const hs = hermanas(x.hermanas)
      const av = x.aviso as Record<string, unknown> | null | undefined
      const textoAviso = typeof av === 'object' && av !== null ? cadena(av.texto) : null
      hallazgos.push({
        clienteId: x.clienteId,
        nombre: x.nombre,
        tipo: cadena(x.tipo) ?? 'sin_informar',
        polizas: entero(x.polizas) ?? 0,
        porque: cadena(x.porque) ?? '',
        polizasCima: entero(x.polizasCima),
        ultimoVencimiento: cadena(x.ultimoVencimiento),
        vitalidad: vitalidad(x.vitalidad),
        hermanas: hs,
        contacto: interpretarContacto(x.contacto),
        aviso:
          textoAviso === null || av == null
            ? null
            : {
                clase: av.clase === 'comparte' ? 'comparte' : 'duplicado',
                texto: textoAviso,
                preferida: hermanas([av.preferida])?.[0] ?? null,
              },
      })
    }
    const c = o.cobertura
    const alcanzables = typeof c === 'object' && c !== null ? entero((c as Record<string, unknown>).alcanzables) : null
    const total = typeof c === 'object' && c !== null ? entero((c as Record<string, unknown>).total) : null
    bloques.push({
      tipo: o.tipo,
      valor: cadena(o.valor) ?? '',
      hallazgos,
      // Si falta cualquiera de los dos, la cobertura es DESCONOCIDA, no cero:
      // un {0,0} diría «no alcanza a nadie», que es una afirmación.
      cobertura: alcanzables === null || total === null ? null : { alcanzables, total },
      explicacion: cadena(o.explicacion) ?? '',
    })
  }

  const avisos: { tema: string; texto: string }[] = []
  if (Array.isArray(r.avisos)) {
    for (const a of r.avisos) {
      if (typeof a !== 'object' || a === null) continue
      const o = a as Record<string, unknown>
      const texto = cadena(o.texto)
      if (texto) avisos.push({ tema: cadena(o.tema) ?? 'aviso', texto })
    }
  }

  return {
    estado: 'ok',
    termino: cadena(r.termino) ?? '',
    buscable: r.buscable === true,
    bloques,
    avisos,
    distintos: entero(r.distintos) ?? 0,
  }
}

// ── Cola de retención ───────────────────────────────────────────────────────

export type EnRiesgo = {
  polizaId: string
  clienteId: string
  cliente: string
  telefono: string | null
  telefonoIlegible: boolean
  tipo: string
  aseguradora: string
  numeroPoliza: string | null
  matricula: string | null
  prima: number | null
  importeRecibo: number | null
  fechaRecibo: string | null
  /**
   * Lo que AFIRMA la compañía del recibo: `devuelto` = el cobro falló y lo dice
   * ella; `pendiente` = no consta cobrado, que NO es lo mismo.
   * `null` = asegura (versión vieja) no lo manda, o sea que tampoco se sabe.
   */
  situacionRecibo: 'devuelto' | 'pendiente' | null
  estado: 'en_plazo' | 'suspendida' | 'extinguida' | 'sin_fecha' | 'sin_confirmar'
  dias: number | null
  diasParaExtincion: number | null
  accion: string
  retarificable: boolean
  /** Ramo/motivo/fuente del veredicto. `null`/ausente = asegura (versión vieja) no lo manda. */
  retarificacion?: Retarificabilidad | null
}

export type Impagados =
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: MotivoPuerto }
  | {
      estado: 'ok'
      filas: EnRiesgo[]
      resumen: {
        /** Impago CONFIRMADO y pasado el mes: los únicos que se pueden dar
         *  por «sin cobertura». */
        suspendidas: number
        enPlazo: number
        extinguidas: number
        sinFecha: number
        /** Vencidos sin noticia de la compañía: se miran, no se llaman. */
        sinConfirmar: number
        /** `null` = ninguna informa prima. NO es 0,00€. */
        primaEnRiesgo: number | null
        sinPrima: number
      }
      /** Pólizas vivas sin NINGÚN recibo informado: no se sabe si están pagadas. */
      sinRecibosInformados: number
      /** Pendientes que aún no han vencido o no traen fecha. */
      pendientesSinJuzgar: number
    }

const ESTADOS_RETENCION = new Set([
  'en_plazo',
  'suspendida',
  'extinguida',
  'sin_fecha',
  'sin_confirmar',
])

export function interpretarImpagados(status: number, json: unknown): Impagados {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  if (status !== 200 || typeof json !== 'object' || json === null) {
    return { estado: 'error', motivo: 'respuesta_ilegible' }
  }
  const r = json as Record<string, unknown>
  if (r.estado === 'sin_configurar') return { estado: 'sin_configurar' }
  if (r.estado === 'error') return { estado: 'error', motivo: 'asegura_error' }
  if (r.estado !== 'ok' || !Array.isArray(r.filas)) {
    return { estado: 'error', motivo: 'respuesta_ilegible' }
  }

  const filas: EnRiesgo[] = []
  for (const f of r.filas) {
    if (typeof f !== 'object' || f === null) return { estado: 'error', motivo: 'respuesta_ilegible' }
    const o = f as Record<string, unknown>
    if (typeof o.polizaId !== 'string' || typeof o.clienteId !== 'string' || typeof o.cliente !== 'string') {
      return { estado: 'error', motivo: 'respuesta_ilegible' }
    }
    // 🚨 Un estado que no se reconoce invalida la lista: pintarlo como
    // «en plazo» diría que aún hay margen sobre una póliza que quizá ya no lo
    // tiene, y ese es justo el error que esta pantalla existe para evitar.
    if (typeof o.estado !== 'string' || !ESTADOS_RETENCION.has(o.estado)) {
      return { estado: 'error', motivo: 'respuesta_ilegible' }
    }
    filas.push({
      polizaId: o.polizaId,
      clienteId: o.clienteId,
      cliente: o.cliente,
      telefono: cadena(o.telefono),
      telefonoIlegible: o.telefonoIlegible === true,
      tipo: cadena(o.tipo) ?? 'sin_informar',
      aseguradora: cadena(o.aseguradora) ?? 'sin informar',
      numeroPoliza: cadena(o.numeroPoliza),
      matricula: cadena(o.matricula),
      prima: numero(o.prima),
      importeRecibo: numero(o.importeRecibo),
      fechaRecibo: cadena(o.fechaRecibo),
      // Cualquier cosa que no sea exactamente una de las dos situaciones se
      // queda en `null` («no se sabe»), nunca en `devuelto`: inventarse un
      // impago confirmado es justo lo que esta pantalla no puede hacer.
      situacionRecibo:
        o.situacionRecibo === 'devuelto' || o.situacionRecibo === 'pendiente'
          ? o.situacionRecibo
          : null,
      estado: o.estado as EnRiesgo['estado'],
      dias: numero(o.dias),
      diasParaExtincion: numero(o.diasParaExtincion),
      accion: cadena(o.accion) ?? '',
      retarificable: o.retarificable === true,
      retarificacion: leerRetarificacion(o.retarificacion),
    })
  }

  const res = (typeof r.resumen === 'object' && r.resumen !== null ? r.resumen : {}) as Record<string, unknown>
  return {
    estado: 'ok',
    filas,
    resumen: {
      suspendidas: entero(res.suspendidas) ?? 0,
      enPlazo: entero(res.enPlazo) ?? 0,
      extinguidas: entero(res.extinguidas) ?? 0,
      sinFecha: entero(res.sinFecha) ?? 0,
      // 0 aquí sí es correcto contra una versión vieja de asegura: ese estado
      // no existía, así que no había ninguno.
      sinConfirmar: entero(res.sinConfirmar) ?? 0,
      primaEnRiesgo: numero(res.primaEnRiesgo),
      sinPrima: entero(res.sinPrima) ?? 0,
    },
    // `null` no se colapsa a 0: si asegura no manda el campo, la pantalla no
    // puede decir «ninguna póliza está sin recibos», que es lo tranquilizador.
    sinRecibosInformados: entero(r.sinRecibosInformados) ?? -1,
    pendientesSinJuzgar: entero(r.pendientesSinJuzgar) ?? -1,
  }
}

// ── Llamadas ────────────────────────────────────────────────────────────────

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

async function pedir(path: string): Promise<{ status: number; json: unknown } | null> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return null
  const res = await fetch(`${urlAsegura()}${path}`, {
    headers: { Authorization: `Bearer ${secret}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  })
  return { status: res.status, json: await res.json().catch(() => null) }
}

export async function buscarAsegura(q: string): Promise<Busqueda> {
  try {
    const r = await pedir(`/api/operador/buscar?q=${encodeURIComponent(q)}`)
    if (r === null) return { estado: 'sin_configurar' }
    return interpretarBusqueda(r.status, r.json)
  } catch {
    return { estado: 'error', motivo: 'red' }
  }
}

// ─── Ramos de Codeoscopic (¿tarifica hogar?) ─────────────────────────────────

export type HogarCodeoscopic =
  | { estado: 'disponible'; id: string; nombre: string }
  | { estado: 'ausente'; ramos: string[] }
  | { estado: 'desconocido' }

export type LineasCodeoscopic =
  | { estado: 'sin_configurar'; mensaje: string | null }
  | { estado: 'error'; motivo: string }
  | { estado: 'ok'; ramos: string[]; hogar: HogarCodeoscopic }

/**
 * Puro. `hogar` degrada a `desconocido` ante cualquier forma rara: afirmar
 * «hogar disponible» o «ausente» sobre un JSON que no se entiende sería lo
 * mismo que inventarlo.
 */
export function interpretarLineas(status: number, json: unknown): LineasCodeoscopic {
  if (status === 401) return { estado: 'error', motivo: 'secreto' }
  if (typeof json !== 'object' || json === null) return { estado: 'error', motivo: `HTTP ${status}` }
  const o = json as Record<string, unknown>
  if (o.estado === 'sin_configurar') return { estado: 'sin_configurar', mensaje: cadena(o.mensaje) }
  if (o.estado !== 'ok') return { estado: 'error', motivo: cadena(o.mensaje) ?? `HTTP ${status}` }
  const ramos = Array.isArray(o.lineas)
    ? o.lineas.map((l) => cadena((l as Record<string, unknown>)?.nombre)).filter((x): x is string => x !== null)
    : []
  return { estado: 'ok', ramos, hogar: leerHogar(o.hogar) }
}

function leerHogar(v: unknown): HogarCodeoscopic {
  if (typeof v !== 'object' || v === null) return { estado: 'desconocido' }
  const h = v as Record<string, unknown>
  if (h.estado === 'disponible') {
    const id = cadena(h.id)
    if (id === null) return { estado: 'desconocido' }
    return { estado: 'disponible', id, nombre: cadena(h.nombre) ?? id }
  }
  if (h.estado === 'ausente') {
    const ramos = Array.isArray(h.ramos) ? h.ramos.map(cadena).filter((x): x is string => x !== null) : []
    return { estado: 'ausente', ramos }
  }
  return { estado: 'desconocido' }
}

export async function lineasCodeoscopic(): Promise<LineasCodeoscopic> {
  try {
    const r = await pedir('/api/operador/codeoscopic/lineas')
    if (r === null) return { estado: 'sin_configurar', mensaje: null }
    return interpretarLineas(r.status, r.json)
  } catch {
    return { estado: 'error', motivo: 'red' }
  }
}

export async function impagadosAsegura(): Promise<Impagados> {
  try {
    const r = await pedir('/api/operador/impagados')
    if (r === null) return { estado: 'sin_configurar' }
    return interpretarImpagados(r.status, r.json)
  } catch {
    return { estado: 'error', motivo: 'red' }
  }
}

// ── Clientes sin canal de contacto ──────────────────────────────────────────
//
// Quién de la cartera VIVA no tiene ni email ni teléfono. Medido el 02/09/2026:
// 26 de ~79. A esos el aviso de vencimiento no les llega, no pueden entrar al
// portal (identifica por email) y —lo que hace que nadie se entere— desde el
// código se ven igual que un cliente al que sí se avisó.
//
// 🚨 Los tres estados aquí NO son de adorno:
//   · `false` → se miró la columna y NO hay nada: no se le puede escribir.
//   · `true`  → hay algo guardado. Ojo: mide PRESENCIA, no validez.
//   · `null`  → asegura no lo informa (versión vieja del puerto, o lista
//               truncada). Es «no comprobado», y NO se pinta como «no tiene»:
//               esa confusión es justo la que convierte un hueco en una
//               afirmación tranquilizadora y falsa.
//
// 🚨 Y la ficha del tomador NO es el único sitio donde vive su contacto
// (04/09/2026, lo cazó Alberto: `Esquiansa` salía «ilocalizable» y su contacto
// de siempre es Juan Manuel López Benjumea). Hay tres sitios:
//   1. Su ficha.
//   2. Su propio dato colgado de la PÓLIZA y nunca copiado a la ficha
//      (`canalEnPoliza`). El cron de avisos lee la ficha → hoy no le sale nada.
//   3. Otra persona de su póliza (`contactoDeOtros`): hay a quién llamar.
// ⚖️ Tener a quién llamar NO es poder notificar: el preaviso del art. 22 LCS va
// al TOMADOR. Por eso 2 y 3 son estados propios y no un «localizable» a secas.

export type EstadoCanal =
  | 'sin_ninguno'
  | 'contacto_via_tercero'
  | 'canal_en_poliza'
  | 'solo_telefono'
  | 'solo_email'
  | 'con_ambos'
  | 'no_comprobado'

/** Ficha de una persona localizable que aparece en las pólizas del cliente.
 *  El nombre viene de `clientes` (en claro); un interviniente suelto lleva el
 *  nombre cifrado y por eso solo cuenta, no se nombra. */
export type FichaContacto = { clienteId: string; nombre: string }

export type ClienteCanal = {
  clienteId: string
  nombre: string
  /** `null` = asegura no informó el campo. NO es «no tiene email». */
  tieneEmail: boolean | null
  tieneTelefono: boolean | null
  /** Intervinientes de sus pólizas vivas que son ÉL MISMO y traen contacto.
   *  `null` = el puerto no lo informa; NO es «no hay». */
  canalEnPoliza: number | null
  /** Personas distintas de él, localizables, en sus pólizas vivas. `null` = ídem. */
  contactoDeOtros: number | null
  /** Las de arriba que tienen ficha (nombre en claro + enlace). Puede venir más
   *  corta que `contactoDeOtros`: los sueltos no tienen ficha. */
  fichasContacto: FichaContacto[]
  estado: EstadoCanal
  /** `null` = no se contó. NO es «no tiene pólizas» (estaría fuera de la lista). */
  polizasCima: number | null
  /** De esas, las que siguen en estado que renueva. `0` = ninguna renueva (no
   *  hay aviso que mandarle); `null` = el puerto no lo informa, que NO es 0. */
  polizasQueRenuevan: number | null
  /** Renovación más cercana. `null` = no la hay a futuro o no se sabe; los dos
   *  contadores de al lado dicen cuál de las dos cosas es. */
  proximoVencimiento: string | null
  polizasSinFecha: number | null
  /** `null` = ninguna póliza suya informa prima. NUNCA 0,00€. */
  prima: number | null
  polizasSinPrima: number | null
}

export type SinCanal =
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: MotivoPuerto }
  | {
      estado: 'ok'
      filas: ClienteCanal[]
      resumen: {
        /** Todos `null` = no comprobado (lista truncada o puerto viejo). */
        vivos: number | null
        conEmail: number | null
        conTelefono: number | null
        conAlguno: number | null
        /** Sin contacto EN SU FICHA. No es lo mismo que ilocalizable. */
        sinNinguno: number | null
        /** 🚨 El titular: ni ficha, ni póliza, ni nadie. `null` = no comprobado. */
        ilocalizables: number | null
        /** Sin nada en la ficha pero con por dónde tirar. */
        rescatables: number | null
        /** Ilocalizables cuyas pólizas ya NO renuevan: no hay nada que avisarles. */
        ilocalizablesSinRenovacion: number | null
      }
      truncado: boolean
    }

/** Tri-estado de verdad: un campo ausente es `null` («no se informó»), no
 *  `false`. Con `=== true` a secas, un puerto que no manda el campo diría que
 *  TODOS están sin email. */
function booleano(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null
}

/** El estado se DERIVA de dónde hay contacto; no se cree el que venga en el
 *  JSON. Si falta cualquiera de las cuatro medidas, el resultado es
 *  `no_comprobado`.
 *
 *  🚨 Ojo al último bloque: sin saber lo de la póliza NO se puede declarar a
 *  nadie ilocalizable. Un puerto viejo (que no manda esos dos recuentos) dejaba
 *  a los 19 pintados como «no les llega NADA», y de 19 solo 15 lo eran. Ante el
 *  hueco, el estado conservador es «no comprobado», nunca la afirmación. */
export function derivarEstadoCanal(
  email: boolean | null,
  telefono: boolean | null,
  canalEnPoliza: number | null,
  contactoDeOtros: number | null,
): EstadoCanal {
  if (email === null || telefono === null) return 'no_comprobado'
  if (email && telefono) return 'con_ambos'
  if (email) return 'solo_email'
  if (telefono) return 'solo_telefono'
  if (canalEnPoliza === null || contactoDeOtros === null) return 'no_comprobado'
  if (canalEnPoliza > 0) return 'canal_en_poliza'
  if (contactoDeOtros > 0) return 'contacto_via_tercero'
  return 'sin_ninguno'
}

/** Las fichas nombradas. Una entrada sin id o con el nombre cifrado (`v1:`) se
 *  descarta: sigue contada en `contactoDeOtros`, pero no se inventa un nombre. */
function leerFichasContacto(v: unknown): FichaContacto[] {
  if (!Array.isArray(v)) return []
  const out: FichaContacto[] = []
  for (const f of v) {
    if (typeof f !== 'object' || f === null) continue
    const o = f as Record<string, unknown>
    const id = cadena(o.clienteId)
    const nombre = cadena(o.nombre)
    if (id === null || nombre === null || nombre.startsWith('v1:')) continue
    out.push({ clienteId: id, nombre })
  }
  return out
}

export function interpretarSinCanal(status: number, json: unknown): SinCanal {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  if (status !== 200 || typeof json !== 'object' || json === null) {
    return { estado: 'error', motivo: 'respuesta_ilegible' }
  }
  const r = json as Record<string, unknown>
  if (r.estado === 'sin_configurar') return { estado: 'sin_configurar' }
  if (r.estado === 'error') return { estado: 'error', motivo: 'asegura_error' }
  if (r.estado !== 'ok' || !Array.isArray(r.filas)) {
    return { estado: 'error', motivo: 'respuesta_ilegible' }
  }

  const filas: ClienteCanal[] = []
  for (const f of r.filas) {
    if (typeof f !== 'object' || f === null) return { estado: 'error', motivo: 'respuesta_ilegible' }
    const o = f as Record<string, unknown>
    const id = cadena(o.clienteId)
    const nombre = cadena(o.nombre)
    // Sin id no hay ficha a la que ir y sin nombre no se sabe a quién llamar:
    // una fila así no es «un cliente sin canal», es una respuesta rota.
    if (id === null || nombre === null) return { estado: 'error', motivo: 'respuesta_ilegible' }
    const tieneEmail = booleano(o.tieneEmail)
    const tieneTelefono = booleano(o.tieneTelefono)
    const canalEnPoliza = entero(o.canalEnPoliza)
    const contactoDeOtros = entero(o.contactoDeOtros)
    filas.push({
      clienteId: id,
      nombre,
      tieneEmail,
      tieneTelefono,
      canalEnPoliza,
      contactoDeOtros,
      fichasContacto: leerFichasContacto(o.fichasContacto),
      estado: derivarEstadoCanal(tieneEmail, tieneTelefono, canalEnPoliza, contactoDeOtros),
      polizasCima: entero(o.polizasCima),
      polizasQueRenuevan: entero(o.polizasQueRenuevan),
      proximoVencimiento: cadena(o.proximoVencimiento),
      polizasSinFecha: entero(o.polizasSinFecha),
      prima: numero(o.prima),
      polizasSinPrima: entero(o.polizasSinPrima),
    })
  }

  const res = (typeof r.resumen === 'object' && r.resumen !== null ? r.resumen : {}) as Record<string, unknown>
  return {
    estado: 'ok',
    filas,
    // `entero()` ya devuelve null cuando falta: aquí NO se colapsa a 0, porque
    // «0 clientes ilocalizables» es la frase tranquilizadora que no se ha medido.
    resumen: {
      vivos: entero(res.vivos),
      conEmail: entero(res.conEmail),
      conTelefono: entero(res.conTelefono),
      conAlguno: entero(res.conAlguno),
      sinNinguno: entero(res.sinNinguno),
      ilocalizables: entero(res.ilocalizables),
      rescatables: entero(res.rescatables),
      ilocalizablesSinRenovacion: entero(res.ilocalizablesSinRenovacion),
    },
    truncado: r.truncado === true,
  }
}

export async function sinCanalAsegura(): Promise<SinCanal> {
  try {
    const r = await pedir('/api/operador/sin-canal')
    if (r === null) return { estado: 'sin_configurar' }
    return interpretarSinCanal(r.status, r.json)
  } catch {
    return { estado: 'error', motivo: 'red' }
  }
}

// ─── Backfill del blind index de DNI (mantenimiento) ─────────────────────────
//
// EL PORQUÉ (03/09/2026, PR #2206): la cartera arrastra 556 grupos de fichas
// duplicadas y el criterio fuerte para fusionarlas —mismo NIF— está ciego en
// **15.800 fichas que tienen el DNI guardado y `dni_lookup_hash` a NULL**. Sin
// ese hash no se puede ni preguntar si dos fichas son la misma persona.
//
// 🚨 Y el arreglo NO es un UPDATE: `uq_clientes_dni_lookup_hash` es UNIQUE, así
// que la segunda ficha de cada DNI repetido revienta al escribir. **El choque no
// es un estorbo, es el hallazgo.** De ahí los tres pasos, en este orden:
//   1. CALCULAR en seco (esto, un GET que no escribe nada)
//   2. FUSIONAR los choques por lote SQL, con los nombres delante de Alberto
//   3. ESCRIBIR los hashes, ya sin conflicto posible
//
// ⚠️ CORREGIDO el 05/09/2026: aquí ponía que el paso 3 no se expone «mientras
// queden choques, porque un botón que promete escribir y revienta a la mitad es
// peor que no tenerlo». **La escritura no revienta**: el plan clasifica cada
// ficha antes de tocar nada y el POST sólo escribe las `rellenable`, así que la
// segunda ficha de un DNI repetido ni siquiera llega al UPDATE. Con esa frase, y
// sin botón en ninguna pantalla, «hacer el backfill» no lo podía hacer nadie:
// exigía un `curl` con el secreto de operador a mano. Fusionar primero sigue
// siendo mejor —cada fusión convierte un choque en un hash más que se puede
// escribir— pero es más cobertura, no un requisito.
//
// 🚨 Y hay un cuarto estado que no estaba: el DNI CENTINELA. Un documento con
// letra correcta tecleado en la ficha de varias personas distintas (medido: 20
// fichas con 20 nombres sin relación y 19 correos distintos). No es un
// duplicado, así que no se fusiona; y no se escribe NUNCA, tampoco en los
// `lead` —que son 14.990 de las 15.092 sin hash— donde el índice único no
// protege y el hash entraría sin que nada fallase.

export type PlanBackfillDni =
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }
  | {
      estado: 'ok'
      /** Fichas con DNI y sin hash que se pueden escribir sin chocar con nadie. */
      rellenables: number
      /** Fichas en un DNI repetido: NO se escriben, se fusionan antes. */
      enChoque: number
      /** Grupos de fichas que comparten DNI. Esto es la lista de fusiones. */
      grupos: number
      /** DNI que no descifra o que no parece un documento. NO es «sin DNI». */
      ilegibles: number
      /** Fichas de un DNI centinela: no se escriben ni se fusionan, se corrigen. */
      compartidas: number
      /** Cuántos DNI distintos están así. */
      gruposCompartidos: number
      yaTiene: number
      sinDni: number
      total: number
    }

export async function planBackfillDni(): Promise<PlanBackfillDni> {
  try {
    const r = await pedir('/api/operador/backfill-dni')
    if (r === null) return { estado: 'sin_configurar' }
    return interpretarPlanBackfill(r.status, r.json)
  } catch {
    return { estado: 'error', motivo: 'red' }
  }
}

/** Puro: separado para poder probarlo sin red. */
export function interpretarPlanBackfill(status: number, json: unknown): PlanBackfillDni {
  if (status === 401 || status === 403) {
    return { estado: 'error', motivo: 'asegura rechaza el secreto (ASEGURA_OPERADOR_SECRET no coincide entre los dos proyectos)' }
  }
  const j = (json ?? {}) as Record<string, unknown>
  if (j.estado === 'sin_configurar') return { estado: 'sin_configurar' }
  if (j.estado !== 'ok') {
    const causa = typeof j.causa === 'string' ? j.causa : typeof j.motivo === 'string' ? j.motivo : `respuesta ${status}`
    return { estado: 'error', motivo: causa }
  }
  const r = (j.resumen ?? {}) as Record<string, unknown>
  const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  const choques = Array.isArray(j.choques) ? j.choques.length : 0
  const compartidos = Array.isArray(j.compartidos) ? j.compartidos.length : 0
  return {
    estado: 'ok',
    rellenables: n(r.rellenables),
    enChoque: n(r.enChoque),
    grupos: choques,
    ilegibles: n(r.ilegibles),
    compartidas: n(r.compartidos),
    gruposCompartidos: compartidos,
    yaTiene: n(r.yaTiene),
    sinDni: n(r.sinDni),
    total: n(r.total),
  }
}

// ─── Paso 3: ESCRIBIR los hashes ─────────────────────────────────────────────

export type EscrituraBackfillDni =
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }
  | {
      estado: 'ok'
      /** Hashes escritos en esta pasada. */
      escritos: number
      /** Cuántos quedan. `0` = terminado. */
      restantes: number
      /** Fichas que el plan daba por escribibles y la BD rechazó. Se dicen. */
      fallidos: number
    }

/**
 * Lanza la escritura. `limite` la parte en tandas: descifrar y hashear 32.000
 * fichas ya consume parte de los 300 s del endpoint de asegura, así que una
 * pasada sin tope puede no llegar. Se vuelve a pulsar hasta `restantes: 0`.
 */
export async function escribirBackfillDni(limite?: number): Promise<EscrituraBackfillDni> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return { estado: 'sin_configurar' }
  try {
    const res = await fetch(`${urlAsegura()}/api/operador/backfill-dni`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
      body: JSON.stringify({ confirmar: 'escribir', limite }),
      cache: 'no-store',
      // Muy por encima de los 8 s del resto del puerto: esto descifra la cartera
      // entera antes de escribir. El endpoint de asegura declara `maxDuration = 300`.
      signal: AbortSignal.timeout(290_000),
    })
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
    return interpretarEscrituraBackfill(res.status, json)
  } catch {
    // 🚨 Un timeout aquí NO dice que no se haya escrito nada: la transacción del
    // otro lado puede haber terminado. Se dice así y se vuelve a mirar el plan.
    return { estado: 'error', motivo: 'se cortó la conexión antes de recibir el resultado — vuelve a cargar la página para ver cuánto se escribió' }
  }
}

/** Puro: separado para poder probarlo sin red. */
export function interpretarEscrituraBackfill(status: number, json: unknown): EscrituraBackfillDni {
  if (status === 401 || status === 403) {
    return { estado: 'error', motivo: 'asegura rechaza el secreto (ASEGURA_OPERADOR_SECRET no coincide entre los dos proyectos)' }
  }
  const j = (json ?? {}) as Record<string, unknown>
  if (j.estado === 'sin_configurar') return { estado: 'sin_configurar' }
  if (j.estado !== 'ok') {
    const causa = typeof j.causa === 'string' ? j.causa : typeof j.motivo === 'string' ? j.motivo : `respuesta ${status}`
    return { estado: 'error', motivo: causa }
  }
  const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  return {
    estado: 'ok',
    escritos: n(j.escritos),
    restantes: n(j.restantes),
    fallidos: Array.isArray(j.fallidos) ? j.fallidos.length : 0,
  }
}
