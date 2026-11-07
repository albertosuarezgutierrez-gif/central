/**
 * Remesa SEPA de transferencias (pain.001, propósito SALA) para pagar las nóminas CONFIRMADAS de una empresa y mes.
 * Lógica PURA: sin BD ni reloj (la fecha de ejecución y la de creación se inyectan). La carga vive en
 * `lib/remesa-nominas-datos.ts`.
 *
 * Reglas (todas fail-closed: ante la duda NO sale fichero, sale la lista de qué arreglar):
 *  - Solo nóminas en estado `confirmada` del periodo pedido; las demás no entran y se cuentan aparte.
 *  - IBAN del empleado ausente o inválido → error con la lista de empleados afectados. Nunca se omite a nadie en silencio
 *    (un empleado fuera de la remesa = un sueldo sin pagar).
 *  - Líquido NULL / no entero / ≤ 0 → error («no se sabe» ≠ 0 €).
 *  - Nómina o empleado de OTRA empresa → rechazado (defensa en profundidad: `rrhh_app` tiene BYPASSRLS).
 *  - Σ importes de la remesa = Σ líquidos, en céntimos enteros.
 *  - Los mensajes de error NUNCA incluyen el IBAN (ni de empleado ni de empresa).
 *  - Contra el DOBLE PAGO: MsgId/PmtInfId DETERMINISTAS por empresa + periodo + contenido (`idMensajeRemesa`). Descargar dos
 *    veces la misma remesa da el mismo identificador (el banco rechaza el duplicado); una remesa distinta (otra nómina, otro
 *    importe, otro IBAN) da otro. La fecha de ejecución y la de creación NO entran: cambiarlas no convierte un pago en otro.
 *    El sello por nómina (`nominas.remesa_generada_at`) y el 409 sin confirmación viven en la ruta.
 */
import { createHash } from 'node:crypto'
import { generarSepaXml, validarIban } from '@central/module-pagos'

export interface EmpresaRemesa {
  id: string
  nombre: string
  nif: string | null
  iban: string | null
  bic: string | null
}

export interface EmpleadoRemesa {
  id: string
  empresa_id: string
  nombre: string
  apellidos: string | null
  iban: string | null
}

export interface NominaRemesa {
  id: string
  empresa_id: string
  empleado_id: string
  periodo: string
  estado: string
  /** Líquido a percibir en céntimos. `null` = no se sabe (nunca se trata como 0). */
  liquido_centimos: number | null
  modo?: string | null
}

export type CodigoErrorRemesa =
  | 'empresa_sin_iban'
  | 'empresa_iban_invalido'
  | 'empresa_bic_invalido'
  | 'empresa_sin_nif'
  | 'fecha_invalida'
  | 'periodo_invalido'
  | 'sin_nominas_confirmadas'
  | 'nomina_otra_empresa'
  | 'nomina_otro_periodo'
  | 'empleado_no_encontrado'
  | 'empleado_otra_empresa'
  | 'empleado_duplicado'
  | 'empleado_sin_iban'
  | 'empleado_iban_invalido'
  | 'liquido_desconocido'
  | 'liquido_no_positivo'
  | 'nomina_simulada'

export interface ErrorRemesa {
  codigo: CodigoErrorRemesa
  mensaje: string
  empleado_id?: string
  empleado_nombre?: string
  nomina_id?: string
}

export interface RemesaOk {
  ok: true
  xml: string
  nombreFichero: string
  num_transferencias: number
  total_centimos: number
  /** Nóminas del periodo que NO entran por no estar confirmadas (se avisa, no se pagan). */
  no_confirmadas: number
  /** MsgId del fichero (determinista; PmtInfId = `${id_mensaje}-001`). */
  id_mensaje: string
  /** Nóminas que van en el fichero: son las que se sellan con `remesa_generada_at`. */
  nomina_ids: string[]
}

export interface RemesaError {
  ok: false
  errores: ErrorRemesa[]
  no_confirmadas: number
}

export interface ArmarRemesaParams {
  empresa: EmpresaRemesa
  periodo: string
  nominas: NominaRemesa[]
  empleados: EmpleadoRemesa[]
  /** YYYY-MM-DD, inyectada por quien llama. */
  fechaEjecucion: string
  /** YYYY-MM-DD de hoy (inyectado): la ejecución no puede ser anterior. */
  hoy: string
  /** CreDtTm del fichero; inyectado para que el resultado sea determinista. */
  creadoEn: Date
}

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/
const RE_PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/
const RE_BIC = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/

function fechaValida(f: string): boolean {
  if (!RE_FECHA.test(f)) return false
  const d = new Date(`${f}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f
}

/**
 * Euros (número o texto decimal, como sale de `datos_calculo->>'netoAPagar'`) → céntimos enteros. Devuelve `null` si
 * no se sabe (ausente, vacío, no numérico, con más de 2 decimales efectivos): nunca 0 por defecto.
 */
export function eurosACentimos(v: unknown): number | null {
  // Número → su forma decimal corta (`toPrecision(15)` quita el ruido de float: 0.1+0.2 → «0.3») y se parsea como texto.
  // Sin `* 100` sobre float (guardián test/regression-nominas-sin-float.test.ts).
  if (typeof v === 'number') return Number.isFinite(v) ? eurosACentimos(String(Number(v.toPrecision(15)))) : null
  if (typeof v !== 'string') return null
  // Más de 2 decimales reales = cifra sin redondear: no se adivina (null).
  const m = /^(-?)(\d+)(?:[.,](\d{1,2}))?$/.exec(v.trim())
  if (!m) return null
  const c = Number(m[2] + (m[3] ?? '').padEnd(2, '0'))
  return m[1] === '-' ? -c : c
}

/** Texto para campos SEPA (charset latino básico): sin tildes, ñ→n, lo demás fuera del juego → espacio. */
export function textoSepa(s: string, max: number): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9/\-?:().,'+ ]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, max)
}

/**
 * MsgId determinista: `NOM` + AAAAMM + 22 hex de sha256(empresa, periodo, IBAN de cargo, transferencias ordenadas). 31
 * caracteres: con el sufijo `-001` del PmtInfId cabe en los 35 de SEPA. PURO.
 */
export function idMensajeRemesa(p: {
  empresaId: string
  periodo: string
  ibanCargo: string
  transferencias: { nominaId: string; iban: string; centimos: number }[]
}): string {
  const lineas = [...p.transferencias]
    .sort((a, b) => (a.nominaId < b.nominaId ? -1 : a.nominaId > b.nominaId ? 1 : 0))
    .map(t => `${t.nominaId}|${t.iban}|${t.centimos}`)
  const hash = createHash('sha256').update([p.empresaId, p.periodo, p.ibanCargo, ...lineas].join('\n')).digest('hex')
  return `NOM${p.periodo.replace('-', '')}${hash.slice(0, 22).toUpperCase()}`
}

function nombreCompleto(e: EmpleadoRemesa): string {
  return [e.nombre, e.apellidos].filter(Boolean).join(' ').trim()
}

export function armarRemesaNominas(p: ArmarRemesaParams): RemesaOk | RemesaError {
  const errores: ErrorRemesa[] = []
  const { empresa } = p

  if (!RE_PERIODO.test(p.periodo)) errores.push({ codigo: 'periodo_invalido', mensaje: 'Periodo inválido (YYYY-MM)' })
  if (!fechaValida(p.fechaEjecucion) || !fechaValida(p.hoy) || p.fechaEjecucion < p.hoy) {
    errores.push({ codigo: 'fecha_invalida', mensaje: 'Fecha de ejecución inválida o anterior a hoy' })
  }

  const ibanEmpresa = empresa.iban?.replace(/\s/g, '').toUpperCase() ?? ''
  if (!ibanEmpresa) errores.push({ codigo: 'empresa_sin_iban', mensaje: 'La empresa no tiene IBAN de cargo configurado' })
  else if (!validarIban(ibanEmpresa)) errores.push({ codigo: 'empresa_iban_invalido', mensaje: 'El IBAN de cargo de la empresa no es válido' })
  const bic = empresa.bic?.replace(/\s/g, '').toUpperCase() || null
  if (bic && !RE_BIC.test(bic)) errores.push({ codigo: 'empresa_bic_invalido', mensaje: 'El BIC de la empresa no es válido' })
  const nif = empresa.nif?.replace(/[\s-]/g, '').toUpperCase() || null
  if (!nif) errores.push({ codigo: 'empresa_sin_nif', mensaje: 'La empresa no tiene NIF configurado (identifica al ordenante)' })

  const confirmadas = p.nominas.filter(n => n.estado === 'confirmada')
  const no_confirmadas = p.nominas.length - confirmadas.length
  if (confirmadas.length === 0) {
    errores.push({ codigo: 'sin_nominas_confirmadas', mensaje: 'No hay nóminas confirmadas en este periodo' })
  }

  const empleadosPorId = new Map<string, EmpleadoRemesa>()
  for (const e of p.empleados) empleadosPorId.set(e.id, e)

  const vistos = new Set<string>()
  const transferencias: { creditorName: string; creditorIban: string; importe: number; concepto: string; endToEndId: string }[] = []
  const contenido: { nominaId: string; iban: string; centimos: number }[] = []
  let total_centimos = 0

  for (const n of confirmadas) {
    if (n.empresa_id !== empresa.id) {
      errores.push({ codigo: 'nomina_otra_empresa', mensaje: 'Nómina de otra empresa', nomina_id: n.id })
      continue
    }
    if (n.periodo !== p.periodo) {
      errores.push({ codigo: 'nomina_otro_periodo', mensaje: `Nómina de otro periodo (${n.periodo})`, nomina_id: n.id })
      continue
    }
    const e = empleadosPorId.get(n.empleado_id)
    if (!e) {
      errores.push({ codigo: 'empleado_no_encontrado', mensaje: 'Empleado no encontrado en la empresa', nomina_id: n.id, empleado_id: n.empleado_id })
      continue
    }
    const base = { empleado_id: e.id, empleado_nombre: nombreCompleto(e), nomina_id: n.id }
    if (e.empresa_id !== empresa.id) {
      errores.push({ codigo: 'empleado_otra_empresa', mensaje: 'Empleado de otra empresa', ...base })
      continue
    }
    if (vistos.has(e.id)) {
      errores.push({ codigo: 'empleado_duplicado', mensaje: 'Más de una nómina confirmada del empleado en el periodo', ...base })
      continue
    }
    vistos.add(e.id)
    if (n.modo === 'simulacion') {
      errores.push({ codigo: 'nomina_simulada', mensaje: 'Nómina en simulación: no se puede pagar', ...base })
      continue
    }
    const c = n.liquido_centimos
    if (c === null || c === undefined || !Number.isSafeInteger(c)) {
      errores.push({ codigo: 'liquido_desconocido', mensaje: 'Líquido a percibir desconocido', ...base })
      continue
    }
    if (c <= 0) {
      errores.push({ codigo: 'liquido_no_positivo', mensaje: 'Líquido a percibir ≤ 0', ...base })
      continue
    }
    const iban = e.iban?.replace(/\s/g, '').toUpperCase() ?? ''
    if (!iban) {
      errores.push({ codigo: 'empleado_sin_iban', mensaje: 'Empleado sin IBAN', ...base })
      continue
    }
    if (!validarIban(iban)) {
      errores.push({ codigo: 'empleado_iban_invalido', mensaje: 'IBAN del empleado no válido', ...base })
      continue
    }
    total_centimos += c
    contenido.push({ nominaId: n.id, iban, centimos: c })
    transferencias.push({
      creditorName: textoSepa(nombreCompleto(e) || 'Empleado', 70),
      creditorIban: iban,
      importe: c / 100,
      concepto: `NOMINA ${p.periodo}`,
      endToEndId: `NOM${n.id.replace(/-/g, '')}`.slice(0, 35),
    })
  }

  if (errores.length > 0) return { ok: false, errores, no_confirmadas }

  const idMensaje = idMensajeRemesa({ empresaId: empresa.id, periodo: p.periodo, ibanCargo: ibanEmpresa, transferencias: contenido })
  const xml = generarSepaXml({
    debtorName: textoSepa(empresa.nombre, 70),
    debtorIban: ibanEmpresa,
    debtorBic: bic ?? undefined,
    // AEB: identificador del ordenante = NIF + sufijo de 3 dígitos ('000' salvo que el banco asigne otro).
    iniciadorId: `${nif}000`,
    fechaEjecucion: p.fechaEjecucion,
    idMensaje,
    creadoEn: p.creadoEn,
    proposito: 'SALA',
    transferencias,
  })

  return {
    ok: true,
    xml,
    nombreFichero: `remesa-nominas-${p.periodo}.xml`,
    num_transferencias: transferencias.length,
    total_centimos,
    no_confirmadas,
    id_mensaje: idMensaje,
    nomina_ids: contenido.map(t => t.nominaId),
  }
}
