// Emisión por Codeoscopic y conciliación con CIMA — reglas puras de la spec
// docs/superpowers/specs/2026-09-02-emision-conciliacion-cima-design.md.
//
// El problema, medido: la emisión legacy escribía 9 campos y ninguno decía
// «esta la emitimos nosotros»; CIMA casa una póliza por número + NOMBRE exacto
// de compañía y, si casa, reescribe incluido `cliente_id`. Resultado: la
// primera póliza que emitamos acaba DUPLICADA (nombre distinto) o PISADA.
//
//   D2 `prepararPolizaEmitida` — la fila que se escribe al emitir: origen
//      `emitida_codeoscopic`, código DGS y el texto EXACTO que CIMA usa para esa
//      compañía (de `companias_dgs.nombre_cima`), número tal cual lo dé el vendor,
//      `import_ref` NULL, `id_poliza_entidad` NULL hasta que CIMA la confirme.
//   D4 `emparejarConCima` — casar por número normalizado + código DGS; respaldo
//      hash del DNI + código + fecha de inicio ±15 días; ambigüedad → `review`.
//   D3 `conciliarConCima` — qué manda cada lado cuando casan: CIMA en estado,
//      fechas, número definitivo, `id_poliza_entidad`; nosotros en
//      `datos_especificos` (se FUSIONA) y en `cliente_id` (si el hash del DNI
//      no coincide → `review`, no se pisa).
//
// Nada de aquí gasta dinero ni toca la BD. Quien emite de verdad (PR3, tras
// `CODEOSCOPIC_EMISION_ACTIVA`) llama a `prepararPolizaEmitida` y escribe la fila
// en la MISMA transacción que `codeoscopic_projects.poliza_id`.

import { normalizarNumeroPoliza } from './duplicados.ts'

export type CompaniaDgs = {
  codigoDgs: string
  nombreComun: string
  /** Texto EXACTO de `polizas.aseguradora` que CIMA usa. `null` = nunca visto. */
  nombreCima: string | null
  enCima: boolean
  activa: boolean
}

export const TIPOS_SEGURO = ['auto', 'moto', 'hogar', 'vida', 'salud', 'decesos', 'responsabilidad_civil', 'comercio', 'comunidades', 'otros'] as const
export type TipoSeguro = (typeof TIPOS_SEGURO)[number]

/** Máximo representable en `polizas.prima_anual numeric(10,2)`. */
export const PRIMA_ANUAL_MAX = 99_999_999.99

export type ProyectoEmitido = {
  /** `codeoscopic_projects.project_id_codeoscopic`. */
  projectIdCodeoscopic: string
  producto: string
  /** Código DGS de la compañía ganadora (el catálogo del vendor habla en DGS). */
  codigoDgs: string
  /** Número de póliza que devolvió el vendor al emitir (puede ser provisional o faltar). */
  numeroPoliza: string | null
  /** Prima anual ofertada (la que aceptó el cliente). */
  primaAnual: number | null
  /** Momento de la emisión. */
  emitidaEn: string
  /** El riesgo tarificado (matrícula/versión, o dirección+m²+año): lo que CIMA NO manda. */
  riesgo: Record<string, unknown> | null
  fraccionamiento?: string | null
}

export type PolizaEmitida = {
  correduriaId: string
  clienteId: string
  tipo: TipoSeguro
  aseguradora: string
  codigoEntidadDgs: string
  numeroPoliza: string | null
  estado: 'activa'
  origen: 'emitida_codeoscopic'
  importRef: null
  idPolizaEntidad: null
  fechaInicio: string
  fechaVencimiento: string
  primaAnual: number | null
  fraccionamiento: string | null
  datosEspecificos: Record<string, unknown>
}

export type PreparacionEmision =
  | { ok: true; fila: PolizaEmitida; avisos: string[] }
  | { ok: false; motivo: string }

function fechaIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function masUnAnio(iso: string): string {
  const d = new Date(iso)
  return fechaIso(new Date(Date.UTC(d.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate())))
}

/** Prima saneada para `numeric(10,2)`: no-número → null; negativa → 0; fuera de rango → tope. Devuelve aviso si toca. */
export function sanearPrima(raw: unknown): { valor: number | null; aviso: string | null } {
  if (typeof raw !== 'number') return { valor: null, aviso: null }
  if (!Number.isFinite(raw)) return { valor: null, aviso: 'prima no finita: se guarda sin prima' }
  if (raw < 0) return { valor: 0, aviso: `prima negativa (${raw}): se guarda 0` }
  if (raw > PRIMA_ANUAL_MAX) return { valor: PRIMA_ANUAL_MAX, aviso: `prima fuera de rango (${raw}): se guarda el máximo` }
  return { valor: Math.round(raw * 100) / 100, aviso: null }
}

export function prepararPolizaEmitida(args: {
  correduriaId: string
  clienteId: string
  proyecto: ProyectoEmitido
  catalogo: readonly CompaniaDgs[]
}): PreparacionEmision {
  const { proyecto } = args
  if (!args.correduriaId || !args.clienteId) return { ok: false, motivo: 'sin correduría o sin cliente: no se acuña una póliza huérfana' }
  if (!(TIPOS_SEGURO as readonly string[]).includes(proyecto.producto)) return { ok: false, motivo: `producto desconocido: ${proyecto.producto}` }
  const codigo = (proyecto.codigoDgs ?? '').trim().toUpperCase()
  if (!/^[A-Z]\d{4}$/.test(codigo)) return { ok: false, motivo: `código DGS no válido: ${proyecto.codigoDgs}` }
  const emitida = new Date(proyecto.emitidaEn)
  if (Number.isNaN(emitida.getTime())) return { ok: false, motivo: 'fecha de emisión no válida' }

  const avisos: string[] = []
  const compania = args.catalogo.find((c) => c.codigoDgs === codigo)
  let aseguradora: string
  if (!compania) {
    aseguradora = codigo
    avisos.push(`compañía ${codigo} no está en companias_dgs: se guarda el código como nombre; CIMA no la casará hasta que se dé de alta`)
  } else if (compania.nombreCima) {
    aseguradora = compania.nombreCima
  } else {
    aseguradora = compania.nombreComun
    avisos.push(`sin nombre CIMA conocido para ${compania.nombreComun} (${codigo}): CIMA puede traer esta póliza como una nueva en vez de casarla`)
  }
  if (compania && !compania.enCima) avisos.push(`${compania.nombreComun} no está adherida a CIMA: esta póliza NO se confirmará sola; habrá que cargarla a mano`)

  const numero = typeof proyecto.numeroPoliza === 'string' && proyecto.numeroPoliza.trim() !== '' ? proyecto.numeroPoliza.trim().slice(0, 100) : null
  if (numero === null) avisos.push('el vendor no devolvió número de póliza: CIMA solo podrá casarla por DNI + compañía + fecha')

  const prima = sanearPrima(proyecto.primaAnual)
  if (prima.aviso) avisos.push(prima.aviso)

  const fechaInicio = fechaIso(emitida)
  avisos.push('fechas interinas (inicio = emisión, vencimiento = +1 año): CIMA las sustituirá por las reales')

  return {
    ok: true,
    avisos,
    fila: {
      correduriaId: args.correduriaId,
      clienteId: args.clienteId,
      tipo: proyecto.producto as TipoSeguro,
      aseguradora: aseguradora.slice(0, 255),
      codigoEntidadDgs: codigo,
      numeroPoliza: numero,
      estado: 'activa',
      origen: 'emitida_codeoscopic',
      importRef: null,
      idPolizaEntidad: null,
      fechaInicio,
      fechaVencimiento: masUnAnio(fechaInicio),
      primaAnual: prima.valor,
      fraccionamiento: proyecto.fraccionamiento ?? null,
      datosEspecificos: {
        ...(proyecto.riesgo ?? {}),
        codeoscopic: { projectId: proyecto.projectIdCodeoscopic, emitidaEn: emitida.toISOString(), primaOfertada: prima.valor },
      },
    },
  }
}

// ─── D4: emparejar lo que trae CIMA con lo que tenemos ───────────────────────

export type PolizaCandidata = {
  id: string
  numeroPoliza: string | null
  codigoEntidadDgs: string | null
  /** Hash de búsqueda del DNI del tomador (`clientes.dni_lookup_hash`). */
  dniHash: string | null
  fechaInicio: string | null
  origen: string
}

export type PolizaCima = {
  numeroPoliza: string | null
  codigoEntidadDgs: string | null
  dniHash: string | null
  fechaInicio: string | null
}

export type Emparejamiento =
  | { resultado: 'casa'; polizaId: string; por: 'numero' | 'dni_fecha' }
  | { resultado: 'nueva' }
  | { resultado: 'review'; motivo: string; candidatas: string[] }

const DIA_MS = 86_400_000
export const MARGEN_FECHA_INICIO_DIAS = 15

function mismaFecha(a: string | null, b: string | null, margenDias: number): boolean {
  if (!a || !b) return false
  const da = new Date(a).getTime()
  const db = new Date(b).getTime()
  if (Number.isNaN(da) || Number.isNaN(db)) return false
  return Math.abs(da - db) <= margenDias * DIA_MS
}

export function emparejarConCima(candidatas: readonly PolizaCandidata[], cima: PolizaCima): Emparejamiento {
  if (!cima.codigoEntidadDgs) return { resultado: 'review', motivo: 'CIMA no trae código de entidad', candidatas: [] }
  const codigo = cima.codigoEntidadDgs.toUpperCase()
  const numero = normalizarNumeroPoliza(cima.numeroPoliza)
  if (numero) {
    const porNumero = candidatas.filter((c) => c.codigoEntidadDgs?.toUpperCase() === codigo && normalizarNumeroPoliza(c.numeroPoliza) === numero)
    if (porNumero.length === 1) return { resultado: 'casa', polizaId: porNumero[0].id, por: 'numero' }
    if (porNumero.length > 1) return { resultado: 'review', motivo: 'varias pólizas con el mismo número y compañía', candidatas: porNumero.map((c) => c.id) }
  }
  if (cima.dniHash) {
    const porDni = candidatas.filter(
      (c) => c.codigoEntidadDgs?.toUpperCase() === codigo && c.dniHash === cima.dniHash && mismaFecha(c.fechaInicio, cima.fechaInicio, MARGEN_FECHA_INICIO_DIAS),
    )
    if (porDni.length === 1) return { resultado: 'casa', polizaId: porDni[0].id, por: 'dni_fecha' }
    if (porDni.length > 1) return { resultado: 'review', motivo: 'varias pólizas del mismo tomador, compañía y fecha', candidatas: porDni.map((c) => c.id) }
  }
  return { resultado: 'nueva' }
}

// ─── D3: qué manda cada lado cuando casan ────────────────────────────────────

export type NuestraPoliza = {
  origen: string
  clienteId: string
  dniHash: string | null
  datosEspecificos: Record<string, unknown> | null
  primaAnual: number | null
}

export type CimaPoliza = {
  clienteId: string
  dniHash: string | null
  estado: string
  fechaInicio: string | null
  fechaVencimiento: string | null
  numeroPoliza: string | null
  idPolizaEntidad: string | null
  primaAnual: number | null
  datosEspecificos: Record<string, unknown> | null
}

export type Conciliacion =
  | {
      resultado: 'update'
      cambios: {
        estado: string
        fechaInicio: string | null
        fechaVencimiento: string | null
        numeroPoliza: string | null
        idPolizaEntidad: string | null
        primaAnual: number | null
        datosEspecificos: Record<string, unknown>
        clienteId: string
      }
      /** Qué se conservó de lo nuestro, para `poliza_merge_log`. */
      conservado: string[]
    }
  | { resultado: 'review'; motivo: string }

/**
 * Sobre una emitida por nosotros (`emitida_codeoscopic`) que CIMA acaba de
 * traer: CIMA manda en lo suyo, nosotros en el riesgo y en el tomador.
 * Sobre una que NO es nuestra, CIMA manda en todo (como el legacy).
 */
export function conciliarConCima(nuestra: NuestraPoliza, cima: CimaPoliza): Conciliacion {
  const esNuestra = nuestra.origen === 'emitida_codeoscopic'
  if (!esNuestra) {
    return {
      resultado: 'update',
      cambios: {
        estado: cima.estado, fechaInicio: cima.fechaInicio, fechaVencimiento: cima.fechaVencimiento,
        numeroPoliza: cima.numeroPoliza, idPolizaEntidad: cima.idPolizaEntidad, primaAnual: cima.primaAnual,
        datosEspecificos: cima.datosEspecificos ?? nuestra.datosEspecificos ?? {}, clienteId: cima.clienteId,
      },
      conservado: [],
    }
  }
  if (nuestra.clienteId !== cima.clienteId) {
    if (!nuestra.dniHash || !cima.dniHash || nuestra.dniHash !== cima.dniHash) {
      return { resultado: 'review', motivo: 'CIMA resuelve otro tomador y el DNI no coincide: no se pisa cliente_id' }
    }
  }
  const conservado: string[] = []
  // El riesgo: CIMA rellena claves que falten, no sustituye las nuestras.
  const datos: Record<string, unknown> = { ...(cima.datosEspecificos ?? {}), ...(nuestra.datosEspecificos ?? {}) }
  if (nuestra.datosEspecificos && Object.keys(nuestra.datosEspecificos).length) conservado.push('datos_especificos')
  // La prima ofertada se guarda aparte si CIMA trae otra.
  let primaAnual = cima.primaAnual ?? nuestra.primaAnual
  if (cima.primaAnual !== null && nuestra.primaAnual !== null && cima.primaAnual !== nuestra.primaAnual) {
    const cod = (datos.codeoscopic ?? {}) as Record<string, unknown>
    datos.codeoscopic = { ...cod, primaOfertada: nuestra.primaAnual }
    conservado.push('prima_ofertada')
    primaAnual = cima.primaAnual
  }
  conservado.push('cliente_id')
  return {
    resultado: 'update',
    cambios: {
      estado: cima.estado, fechaInicio: cima.fechaInicio, fechaVencimiento: cima.fechaVencimiento,
      numeroPoliza: cima.numeroPoliza ?? null, idPolizaEntidad: cima.idPolizaEntidad, primaAnual,
      datosEspecificos: datos, clienteId: nuestra.clienteId,
    },
    conservado,
  }
}
