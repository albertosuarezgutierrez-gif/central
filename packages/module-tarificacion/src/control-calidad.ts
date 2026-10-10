// Control de calidad ANTES de enseñar o enviar un resultado de tarificación (08/10/2026). PURO.
// Los ERRORES bloquean (no se enseña ni se envía); los AVISOS se enseñan junto al resultado.
// No toca reloj ni red: `hoy` llega de fuera (ISO AAAA-MM-DD) para que sea determinista y testeable.

export type ControlOferta = {
  /** Prima ANUAL total (con impuestos). Nunca el primer recibo. */
  primaAnualEur: number | null
  primaNetaEur?: number | null
  impuestosEur?: number | null
  primaTotalEur?: number | null
  /** Desglose por periodo (primer recibo «anual» y «sucesivos» = prima anual real), como `OfertaNormalizada.desglose`. */
  desglose?: {
    anual: { primaNetaEur: number | null; impuestosEur: number | null; primaTotalEur: number | null }
    sucesivos: { primaNetaEur: number | null; impuestosEur: number | null; primaTotalEur: number | null }
  } | null
  /** Hasta cuándo vale (ISO). `null` = no se sabe. */
  validaHasta: string | null
  /** Capitales del presupuesto por clave de garantía. `null` = no consta. */
  capitales: Record<string, number | null>
  /** Estado de la ficha de producto de la oferta; `null` = sin ficha. */
  fichaEstado: 'validada' | 'pendiente' | null
  /** Datos con los que se cotizó de verdad (lo que leyó el portal/formulario). */
  datosUsados: Record<string, unknown>
}

export type ControlSolicitud = {
  /** Fecha de efecto pedida (ISO). */
  fechaEfecto: string | null
  capitalesPedidos: Record<string, number>
  /** Datos de la solicitud (formulario canónico aplanado). */
  datos: Record<string, unknown>
}

export type IncidenciaCalidad = {
  codigo:
    | 'precio_ausente' | 'desglose_incoherente' | 'precio_es_primer_recibo' | 'precio_distinto_del_desglose'
    | 'fecha_efecto_invalida' | 'fecha_efecto_pasada' | 'oferta_caducada' | 'validez_desconocida'
    | 'capital_distinto' | 'capital_sin_dato' | 'capital_no_pedido'
    | 'coberturas_sin_validar' | 'sin_ficha'
    | 'dato_distinto' | 'dato_no_usado'
  mensaje: string
  campo: string | null
}

export type ResultadoCalidad = { ok: boolean; errores: IncidenciaCalidad[]; avisos: IncidenciaCalidad[] }

export type OpcionesCalidad = {
  /** Tolerancia de céntimos en neta+impuestos≈total (por defecto 0,02 €). */
  toleranciaEur?: number
  /** Tolerancia de comparación de capitales en € (por defecto 1 €). */
  toleranciaCapitalEur?: number
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/
function fechaValida(s: string | null): s is string {
  const m = s ? ISO.exec(s) : null
  if (!m) return false
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]
}
const esNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

function dinero(n: number): string {
  const [e, d] = Math.abs(n).toFixed(2).split('.')
  return `${n < 0 ? '-' : ''}${e.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${d}€`
}

function iguales(a: unknown, b: unknown): boolean {
  if (esNum(a) && esNum(b)) return Math.abs(a - b) < 0.005
  if (typeof a === 'string' && typeof b === 'string') return a.trim().toLowerCase() === b.trim().toLowerCase()
  return JSON.stringify(a) === JSON.stringify(b)
}

export function controlarCalidad(oferta: ControlOferta, solicitud: ControlSolicitud, hoy: string, opciones: OpcionesCalidad = {}): ResultadoCalidad {
  const tol = opciones.toleranciaEur ?? 0.02
  const tolCap = opciones.toleranciaCapitalEur ?? 1
  const errores: IncidenciaCalidad[] = []
  const avisos: IncidenciaCalidad[] = []
  const err = (codigo: IncidenciaCalidad['codigo'], mensaje: string, campo: string | null = null) => errores.push({ codigo, mensaje, campo })
  const avi = (codigo: IncidenciaCalidad['codigo'], mensaje: string, campo: string | null = null) => avisos.push({ codigo, mensaje, campo })

  // 1) Precio anual presente y > 0
  const precioOk = esNum(oferta.primaAnualEur) && oferta.primaAnualEur > 0
  if (!precioOk) err('precio_ausente', 'La oferta no tiene precio anual válido (mayor que 0): no se puede enseñar ni recomendar.', 'primaAnualEur')

  // 2) Coherencia neta + impuestos ≈ total
  const coherente = (neta: unknown, imp: unknown, total: unknown, donde: string) => {
    if (esNum(neta) && esNum(imp) && esNum(total) && Math.abs(neta + imp - total) > tol + 1e-9) {
      err('desglose_incoherente', `${donde}: neta ${dinero(neta)} + impuestos ${dinero(imp)} no suman el total ${dinero(total)}.`, donde)
    }
  }
  coherente(oferta.primaNetaEur, oferta.impuestosEur, oferta.primaTotalEur, 'prima')
  if (oferta.desglose) {
    const { anual, sucesivos } = oferta.desglose
    coherente(anual.primaNetaEur, anual.impuestosEur, anual.primaTotalEur, 'desglose.anual')
    coherente(sucesivos.primaNetaEur, sucesivos.impuestosEur, sucesivos.primaTotalEur, 'desglose.sucesivos')
    if (precioOk && esNum(sucesivos.primaTotalEur)) {
      const p = oferta.primaAnualEur as number
      if (Math.abs(p - sucesivos.primaTotalEur) > tol) {
        if (esNum(anual.primaTotalEur) && Math.abs(p - anual.primaTotalEur) <= tol) {
          err('precio_es_primer_recibo', `El precio ${dinero(p)} es el primer recibo prorrateado, no la prima anual (${dinero(sucesivos.primaTotalEur)}).`, 'primaAnualEur')
        } else avi('precio_distinto_del_desglose', `El precio anual ${dinero(p)} no coincide con la prima anual del desglose (${dinero(sucesivos.primaTotalEur)}).`, 'primaAnualEur')
      }
    }
  }
  if (precioOk && esNum(oferta.primaTotalEur) && Math.abs(oferta.primaTotalEur - (oferta.primaAnualEur as number)) > tol && !oferta.desglose) {
    avi('precio_distinto_del_desglose', `El precio anual ${dinero(oferta.primaAnualEur as number)} no coincide con el total ${dinero(oferta.primaTotalEur)}.`, 'primaTotalEur')
  }

  // 3) Fecha de efecto: hoy o futura
  if (!fechaValida(hoy)) err('fecha_efecto_invalida', 'Fecha de referencia («hoy») inválida: no se puede comprobar el efecto.', 'hoy')
  else if (!fechaValida(solicitud.fechaEfecto)) err('fecha_efecto_invalida', 'La fecha de efecto falta o no es una fecha válida (AAAA-MM-DD).', 'fechaEfecto')
  else if (solicitud.fechaEfecto < hoy) err('fecha_efecto_pasada', `La fecha de efecto ${solicitud.fechaEfecto} ya pasó (hoy es ${hoy}).`, 'fechaEfecto')

  // 4) Oferta caducada
  if (oferta.validaHasta === null) avi('validez_desconocida', 'La oferta no indica hasta cuándo es válida.', 'validaHasta')
  else if (!fechaValida(oferta.validaHasta)) avi('validez_desconocida', `Validez ilegible («${oferta.validaHasta}»).`, 'validaHasta')
  else if (fechaValida(hoy) && oferta.validaHasta < hoy) err('oferta_caducada', `La oferta caducó el ${oferta.validaHasta}.`, 'validaHasta')

  // 5) Capitales del presupuesto = capitales pedidos
  for (const [clave, pedido] of Object.entries(solicitud.capitalesPedidos)) {
    const v = oferta.capitales[clave]
    if (v === undefined || v === null) avi('capital_sin_dato', `El presupuesto no trae el capital de ${clave} (se pidieron ${dinero(pedido)}): verificar.`, clave)
    else if (Math.abs(v - pedido) > tolCap) avi('capital_distinto', `Capital de ${clave}: presupuestado ${dinero(v)}, pedido ${dinero(pedido)}.`, clave)
  }
  for (const [clave, v] of Object.entries(oferta.capitales)) {
    if (v !== null && !(clave in solicitud.capitalesPedidos)) avi('capital_no_pedido', `El presupuesto trae un capital de ${clave} (${dinero(v)}) que no se pidió.`, clave)
  }

  // 6) Ficha validada vs pendiente
  if (oferta.fichaEstado === 'pendiente') avi('coberturas_sin_validar', 'Coberturas sin validar: la ficha del producto está pendiente de revisión.', 'fichaEstado')
  else if (oferta.fichaEstado === null) avi('sin_ficha', 'No hay ficha de producto: las coberturas no constan.', 'fichaEstado')

  // 7) Datos usados = datos de la solicitud (distinto = error: se cotizó otra cosa)
  for (const [k, pedido] of Object.entries(solicitud.datos)) {
    if (!(k in oferta.datosUsados)) avi('dato_no_usado', `No consta qué valor de «${k}» usó la cotización.`, k)
    else if (!iguales(oferta.datosUsados[k], pedido)) err('dato_distinto', `«${k}»: se cotizó con ${JSON.stringify(oferta.datosUsados[k])} y la solicitud dice ${JSON.stringify(pedido)}.`, k)
  }

  return { ok: errores.length === 0, errores, avisos }
}
