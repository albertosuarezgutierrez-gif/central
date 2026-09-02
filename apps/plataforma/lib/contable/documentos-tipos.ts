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
  /** Con qué factura se concilió, si ya lo está. Sirve para que Alberto vea si es OTRA factura. */
  facturaRef?: string | null
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
  | { estado: 'ya_conciliado'; mov: MovCandidato; otro?: MovCandidato | null }
  | { estado: 'fuera_de_ventana'; mov: MovCandidato; dias: number }
  | { estado: 'sin_cobertura'; cobertura: CoberturaBanco[] }
  | { estado: 'sin_match'; cobertura: CoberturaBanco[] }

const NO_LEIDO = 'No he podido leer el documento. Prueba con una foto más nítida o un PDF que tenga texto (no solo imagen escaneada).'
const SIN_DATOS = 'He abierto el documento pero no distingo el importe o la fecha con seguridad, así que no me lo invento. Dímelos tú o sube una copia más clara.'

/**
 * POR QUÉ no se ha podido leer un documento. Lo produce `extraerDesdeBuffer` y lo consume
 * `interpretarExtraccion`; vive AQUÍ (y no en `lib/agente-facturas/extraer.ts`) porque este módulo
 * es el puro y testeable —no puede importar del alias '@/'— y el de allí sí puede importar el tipo.
 *
 * 02/09/2026 — el hueco que cierra: hasta hoy los tres casos de abajo salían por la MISMA frase
 * («prueba con una foto más nítida o un PDF que tenga texto»), que a un PDF le pide una foto y no
 * dice si el documento se ha llegado a mirar. Alberto subió «movimientos (2).pdf» y recibió eso:
 * ni él sabía qué arreglar ni nosotros qué había fallado. Regla del CLAUDE.md: un fallo del que no
 * se sabe la causa se DECLARA, no se disfraza de consejo.
 */
export type MotivoSinLectura =
  /** Ni se pudo abrir (archivo dañado, cifrado, no es un PDF de verdad). `detalle` = error real. */
  | { clase: 'pdf_ilegible'; detalle: string }
  /** Se abrió bien pero no tiene capa de texto (escaneado). `ocr` = qué pasó al leerlo por visión. */
  | { clase: 'pdf_sin_texto'; paginas: number; ocr: 'no_intentado' | 'sin_paginas' | 'sin_datos' | 'error' }
  /** No es ni PDF ni imagen: no hay lector para eso. */
  | { clase: 'formato_no_soportado'; mimeType: string }

// La salida honesta cuando el documento no era una factura suelta: el banco entra por su propia
// puerta, y esa SÍ acepta el listado entero. No prometemos que el PDF escaneado sirva ahí.
const RUTA_BANCA = 'Si era un extracto del banco o de la tarjeta, descárgalo del banco en Excel/CSV y súbelo en /banca → Importar (ahí eliges la cuenta).'

/**
 * Texto para Alberto cuando NO se ha podido leer el documento. Determinista y sin red.
 * Sin `motivo` (llamadas antiguas) se conserva la frase histórica.
 */
export function motivoNoLeido(m?: MotivoSinLectura | null): string {
  if (!m) return NO_LEIDO

  if (m.clase === 'formato_no_soportado') {
    return `Ese archivo no es un PDF ni una imagen (${m.mimeType || 'tipo desconocido'}), así que no tengo con qué abrirlo. Mándamelo en PDF, JPG o PNG. ${RUTA_BANCA}`
  }

  if (m.clase === 'pdf_ilegible') {
    return `No he podido ni ABRIR el PDF${m.detalle ? ` (${m.detalle})` : ''}, así que no lo he mirado: no es que no ponga nada. Suele pasar con un archivo dañado a medias o protegido con contraseña — vuelve a descargarlo del origen y súbelo otra vez.`
  }

  const pag = m.paginas > 0 ? ` (${m.paginas} ${m.paginas === 1 ? 'página' : 'páginas'})` : ''
  const cab = `He abierto el PDF${pag} y NO trae capa de texto: es una imagen escaneada.`
  switch (m.ocr) {
    case 'no_intentado':
      return `${cab} Aquí no lo leo por visión, así que no lo he mirado. ${RUTA_BANCA}`
    case 'sin_paginas':
      return `${cab} Tampoco he conseguido convertir sus páginas en imagen para leerlas por visión, así que NO lo he llegado a mirar. Mándame una foto de la factura, o el PDF original con texto. ${RUTA_BANCA}`
    case 'error':
      return `${cab} He intentado leerlo por visión y la IA ha fallado, así que sigue SIN mirar (no es que no ponga nada). Reinténtalo en un minuto. ${RUTA_BANCA}`
    case 'sin_datos':
      return `${cab} Lo he leído por visión y aun así no distingo el importe ni la fecha, así que no me los invento. Dímelos tú, o mándame una foto más nítida. ${RUTA_BANCA}`
  }
}

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
export function interpretarExtraccion(
  data: ExtraccionCruda,
  source: 'text' | 'vision' | 'none',
  motivo?: MotivoSinLectura | null,
): Interpretacion {
  if (source === 'none') return { ok: false, motivo: motivoNoLeido(motivo) }

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

    // Mismo importe y fecha cercana es un indicio fuerte, NO una prueba: dos recibos gemelos del
    // mismo proveedor son indistinguibles por importe. Se dice lo que se sabe (hay un cargo así y ya
    // está conciliado, y con qué) y se deja la puerta abierta a que la factura sea otra.
    case 'ya_conciliado': {
      const ref = cruce.mov.facturaRef ? ` con ${cruce.mov.facturaRef}` : ''
      const alternativa = cruce.otro
        ? `\nSi esta factura es otra distinta, tengo otro cargo del mismo importe sin conciliar: ${de(cruce.otro)}.`
        : '\nSi esta factura es otra distinta, dímelo.'
      return `${cab}\nHay un cargo de ese importe el ${fechaEs(cruce.mov.fecha)}${cruce.mov.banco ? ` (${cruce.mov.banco})` : ''} que YA está conciliado${ref}, así que no toco nada.${alternativa}`
    }

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
