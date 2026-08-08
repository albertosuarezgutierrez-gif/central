// apps/plataforma/lib/contable/documentos-tipos.ts
// Lógica PURA de interpretación de un documento extraído (ticket/factura) → factura estructurada
// o "no lo he podido leer". Sin BD ni alias '@/', así el test (node --test) la carga aislada
// (mismo motivo por el que parse.ts / formato.ts / acciones-tipos.ts son autónomos).
// REGLA DURA: nunca inventamos importe ni fecha. Si no hay datos fiables → ok:false.
// SEGUNDA REGLA DURA (08/08/2026): tampoco afirmamos una AUSENCIA que no hemos podido comprobar —
// «no encuentro el cargo» y «mi extracto todavía no llega a esa fecha» son cosas distintas.
import { eur } from '../dinero.ts'

export type ExtraccionCruda = {
  fecha?: string | null
  proveedor?: string | null
  concepto?: string | null
  numero_factura?: string | null
  total?: number | null
}

export type FacturaDoc = {
  proveedor: string
  fecha: string        // 'YYYY-MM-DD'
  total: number        // positivo (importe con IVA)
  numero: string | null
  concepto: string | null
}

export type Interpretacion =
  | { ok: false; motivo: string }
  | { ok: true; factura: FacturaDoc }

export type MatchDoc = { movId: string; concepto: string | null; importe: number } | null

/** Un movimiento bancario candidato, con lo justo para explicárselo a Alberto. */
export type MovCandidato = {
  movId: string
  fecha: string          // 'YYYY-MM-DD'
  concepto: string | null
  importe: number        // con su signo (los cargos, negativos)
  banco: string | null
}

/** Hasta dónde llega el extracto de cada banco. `ultima: null` = esa cuenta no tiene movimientos. */
export type CoberturaBanco = { banco: string; ultima: string | null }

/**
 * Resultado de cruzar la factura leída contra los movimientos bancarios. Distingue los cinco
 * desenlaces posibles, porque los cinco se le cuentan a Alberto de forma distinta:
 * - `match`            — cargo del mismo importe, sin conciliar, dentro de ±7 días. Se propone conciliar.
 * - `ya_conciliado`    — ese cargo existe pero YA está conciliado. No es «no lo encuentro».
 * - `fuera_de_ventana` — existe uno del mismo importe, pero más lejos en el tiempo. Se pregunta.
 * - `sin_cobertura`    — el extracto no llega todavía a la fecha de la factura: NO se ha podido mirar.
 * - `sin_match`        — se ha mirado de verdad y no hay nada que cuadre.
 */
export type CruceDoc =
  | { estado: 'match'; mov: MovCandidato }
  | { estado: 'ya_conciliado'; mov: MovCandidato }
  | { estado: 'fuera_de_ventana'; mov: MovCandidato; dias: number }
  | { estado: 'sin_cobertura'; cobertura: CoberturaBanco[] }
  | { estado: 'sin_match'; cobertura: CoberturaBanco[] }

const NO_LEIDO = 'No he podido leer el documento. Prueba con una foto más nítida o un PDF que tenga texto (no solo imagen escaneada).'
const SIN_DATOS = 'He abierto el documento pero no distingo el importe o la fecha con seguridad, así que no me lo invento. Dímelos tú o sube una copia más clara.'

// 'YYYY-MM-DD' → 'DD/MM/YYYY' (lo que Alberto lee en su banco). Deja pasar lo que no reconozca.
export function fechaEs(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || '')
}

// «BBVA hasta el 07/08/2026 · Kutxabank hasta el 05/08/2026». Las cuentas sin un solo movimiento se
// omiten: no aportan nada al «hasta dónde he podido mirar».
function textoCobertura(cobertura: CoberturaBanco[]): string {
  return cobertura
    .filter(c => c.ultima)
    .map(c => `${c.banco} hasta el ${fechaEs(c.ultima)}`)
    .join(' · ')
}

// Decide si la extracción es utilizable y normaliza la factura. Determinista, sin red.
export function interpretarExtraccion(data: ExtraccionCruda, source: 'text' | 'vision' | 'none'): Interpretacion {
  if (source === 'none') return { ok: false, motivo: NO_LEIDO }

  const total = Number(data.total)
  const fecha = (data.fecha || '').toString().slice(0, 10)
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !Number.isFinite(total) || total === 0) {
    return { ok: false, motivo: SIN_DATOS }
  }

  return {
    ok: true,
    factura: {
      proveedor: (data.proveedor || '').toString().trim() || 'Proveedor desconocido',
      fecha,
      total: Math.abs(total),
      numero: data.numero_factura ? String(data.numero_factura).trim() : null,
      concepto: data.concepto ? String(data.concepto).trim() : null,
    },
  }
}

// Texto legible para el chat tras leer el documento. Determinista.
export function resumenDocumento(f: FacturaDoc, cruce: CruceDoc): string {
  const cab = `📄 Leído: ${f.proveedor} · ${fechaEs(f.fecha)} · ${eur(f.total)}${f.numero ? ` · nº ${f.numero}` : ''}.`
  const de = (m: MovCandidato) => `${fechaEs(m.fecha)}${m.banco ? ` · ${m.banco}` : ''} · ${eur(Math.abs(m.importe))}${m.concepto ? ` (${m.concepto})` : ''}`

  switch (cruce.estado) {
    case 'match':
      return `${cab}\nCuadra con un movimiento bancario de ${eur(Math.abs(cruce.mov.importe))}${cruce.mov.concepto ? ` (${cruce.mov.concepto})` : ''}. ¿Lo concilio?`

    case 'ya_conciliado':
      return `${cab}\nEse cargo ya está conciliado: ${de(cruce.mov)}. No toco nada.`

    case 'fuera_de_ventana':
      return `${cab}\nNo hay ningún cargo de ese importe en ±7 días, pero sí uno ${cruce.dias} días después/antes: ${de(cruce.mov)}. ¿Es ese? Dime que sí y lo concilio.`

    // ⚠️ El caso que motivó todo esto: el extracto del banco NO llega aún a la fecha de la factura,
    // así que no es que el cargo no exista — es que todavía no lo he podido ver. Decir «no encuentro
    // un movimiento que cuadre» aquí es afirmar una ausencia sin haber mirado.
    case 'sin_cobertura': {
      const cob = textoCobertura(cruce.cobertura)
      return `${cab}\n⏳ Todavía NO puedo decirte si está pagada: la factura es del ${fechaEs(f.fecha)} y mis movimientos llegan${cob ? ` solo a ${cob}` : ' menos lejos'}. En cuanto el banco sincronice lo cruzo solo; si tienes prisa, importa el extracto en /banca.`
    }

    case 'sin_match': {
      const cob = textoCobertura(cruce.cobertura)
      return `${cab}\nHe mirado todos los cargos de ${eur(f.total)} en ±7 días y no hay ninguno${cob ? ` (extractos: ${cob})` : ''}. Revísalo tú o súbeme el cargo correcto.`
    }
  }
}

// El movimiento sobre el que se puede PROPONER conciliar. Solo el cruce exacto y el que cae fuera de
// la ventana (ese se pregunta antes). Un cargo ya conciliado no se vuelve a proponer.
export function matchDeCruce(cruce: CruceDoc): MatchDoc {
  if (cruce.estado === 'match' || cruce.estado === 'fuera_de_ventana') {
    return { movId: cruce.mov.movId, concepto: cruce.mov.concepto, importe: cruce.mov.importe }
  }
  return null
}

// Referencia corta que se guarda en factura_ref al conciliar. Determinista.
export function refFactura(f: FacturaDoc): string {
  return `doc:${f.proveedor}${f.numero ? ' ' + f.numero : ''}`.slice(0, 120)
}

// Construye la propuesta de acción "conciliar" a partir de la factura y su match bancario. Puro:
// lo consumen la boca web (/api/contable/chat) y la de Telegram (lib/contable/telegram.ts) igual,
// así ninguna de las dos inventa el importe (sale del OCR + SQL) ni divergen entre sí.
export type PropuestaAccion = { tipo: string; params: Record<string, unknown>; resumen: string }
export function accionConciliar(f: FacturaDoc, match: MatchDoc): PropuestaAccion | null {
  if (!match) return null
  return {
    tipo: 'conciliar',
    params: { movId: match.movId, facturaRef: refFactura(f), concepto: match.concepto },
    resumen: `Conciliar factura de ${f.proveedor} (${eur(f.total)}) con el movimiento de ${eur(Math.abs(match.importe))}`,
  }
}
