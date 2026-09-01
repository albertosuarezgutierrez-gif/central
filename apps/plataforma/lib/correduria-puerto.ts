// Los dos lectores nuevos del puerto de asegura: el buscador de TODO y la cola
// de retención (recibos devueltos). Interpretación PURA + la llamada.
//
// El diccionario de motivos vive AQUÍ y no en cada componente: estaba copiado
// en dos sitios y, cuando asegura no responde, la pantalla apilaba tres
// recuadros de error distintos diciendo lo mismo.

export type MotivoPuerto = 'secreto_rechazado' | 'asegura_error' | 'respuesta_ilegible' | 'red'

export const MOTIVOS_PUERTO: Record<MotivoPuerto, string> = {
  secreto_rechazado:
    'asegura rechaza el secreto (ASEGURA_OPERADOR_SECRET no coincide entre los dos proyectos).',
  asegura_error: 'asegura respondió, pero no pudo leer su base de datos.',
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

export type Hallazgo = {
  clienteId: string
  nombre: string
  tipo: string
  polizas: number
  porque: string
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
      hallazgos.push({
        clienteId: x.clienteId,
        nombre: x.nombre,
        tipo: cadena(x.tipo) ?? 'sin_informar',
        polizas: entero(x.polizas) ?? 0,
        porque: cadena(x.porque) ?? '',
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
  estado: 'en_plazo' | 'suspendida' | 'extinguida' | 'sin_fecha'
  dias: number | null
  diasParaExtincion: number | null
  accion: string
  retarificable: boolean
}

export type Impagados =
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: MotivoPuerto }
  | {
      estado: 'ok'
      filas: EnRiesgo[]
      resumen: {
        suspendidas: number
        enPlazo: number
        extinguidas: number
        sinFecha: number
        /** `null` = ninguna informa prima. NO es 0,00€. */
        primaEnRiesgo: number | null
        sinPrima: number
      }
      /** Pólizas vivas sin NINGÚN recibo informado: no se sabe si están pagadas. */
      sinRecibosInformados: number
      /** Pendientes que aún no han vencido o no traen fecha. */
      pendientesSinJuzgar: number
    }

const ESTADOS_RETENCION = new Set(['en_plazo', 'suspendida', 'extinguida', 'sin_fecha'])

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
      estado: o.estado as EnRiesgo['estado'],
      dias: numero(o.dias),
      diasParaExtincion: numero(o.diasParaExtincion),
      accion: cadena(o.accion) ?? '',
      retarificable: o.retarificable === true,
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

export async function impagadosAsegura(): Promise<Impagados> {
  try {
    const r = await pedir('/api/operador/impagados')
    if (r === null) return { estado: 'sin_configurar' }
    return interpretarImpagados(r.status, r.json)
  } catch {
    return { estado: 'error', motivo: 'red' }
  }
}
