// Importar a la intranet un proyecto creado A MANO en la web de Avant2
// (fila 13 del plan, 26/09/2026).
//
// Puro a propósito (sin BD ni red): lo usa `app/api/operador/codeoscopic/importar/route.ts`
// y lo prueba `importar.test.ts` contra la forma REAL de un `GET /insurances/{id}` hecho en
// la web, no contra una forma supuesta.
//
// Qué NO hace: ReRate. Una oferta de la web solo se importa si YA trae la acción
// `SubmitPolicyApplication` (o sea, se confirmó en Avant2) y sigue en plazo; si no,
// se confirma en Avant2 y se vuelve a importar. Así el import es gratis y la emisión
// sigue por `/emitir`, con todas sus guardas.

type Json = Record<string, unknown>
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/

/** Ramos que se importan hoy: los de vehículo, que son los que ya emite `/emitir`. */
const RAMO_DE_LINEA: Record<string, string> = { Car: 'auto', Motorcycle: 'moto' }

export function ramoDeLinea(crudo: unknown): string | null {
  const id = str(obj(obj(crudo).insuranceLine).id)
  return id ? RAMO_DE_LINEA[id] ?? null : null
}

/** El documento del tomador tal cual lo trae el vendor. Solo se usa para calcular su hash. */
export function documentoTomador(crudo: unknown): string | null {
  return str(obj(obj(obj(crudo).holder).identificationDocument).id)
}

export interface OfertaImportable {
  quoteId: string
  compania: string | null
  producto: string | null
  modalidad: string | null
  categoria: string | null
  /** Prima total del periodo (anual), la que enseña la tabla de precios. */
  primaEur: number | null
  /** Primer recibo: con pago fraccionado es menor que la prima. */
  primerReciboEur: number | null
  pago: string | null
  efecto: string | null
  caduca: string | null
  emitible: boolean
  /** Por qué NO se puede emitir desde la intranet. `null` si se puede. */
  motivo: string | null
}

function fechaValida(s: string | null): string | null {
  return s && RE_FECHA.test(s.slice(0, 10)) ? s.slice(0, 10) : null
}

/** Cada precio del proyecto con su veredicto. Primero los emitibles, luego por prima. */
export function ofertasDelProyecto(crudo: unknown, hoy: string): OfertaImportable[] {
  const p = obj(crudo)
  const efectoProyecto = fechaValida(str(p.effectiveDate))
  const lista = arr(p.mainQuotes).flatMap((q): OfertaImportable[] => {
    const c = obj(q)
    const quoteId = str(c.id)
    if (!quoteId) return []
    const producto = obj(c.product)
    const modalidad = obj(producto.modality)
    const efecto = fechaValida(str(c.effectiveDate)) ?? efectoProyecto
    const caduca = fechaValida(str(c.expirationDate))
    const acciones = arr(c.actions).map((a) => str(obj(a).id))
    let motivo: string | null = null
    if (!acciones.includes('SubmitPolicyApplication')) {
      motivo = 'sin confirmar en Avant2 (la compañía aún no deja emitirla)'
    } else if (caduca && caduca < hoy) {
      motivo = `caducó el ${caduca}`
    } else if (!efecto) {
      motivo = 'sin fecha de efecto'
    } else if (efecto < hoy) {
      motivo = `la fecha de efecto (${efecto}) ya ha pasado`
    }
    return [{
      quoteId,
      compania: str(obj(producto.vendor).name),
      producto: str(producto.name),
      modalidad: str(modalidad.name),
      categoria: str(obj(modalidad.category).name),
      primaEur: num(c.premium),
      primerReciboEur: num(c.downPayment),
      pago: str(obj(c.paymentFrequency).name),
      efecto,
      caduca,
      emitible: motivo === null,
      motivo,
    }]
  })
  return lista.sort(
    (a, b) => Number(b.emitible) - Number(a.emitible) || (a.primaEur ?? Infinity) - (b.primaEur ?? Infinity),
  )
}

/** El `mainQuote` crudo de un precio, para `leerOferta` y para el widget de la compañía. */
export function quoteCrudo(crudo: unknown, quoteId: string): Json | null {
  const q = arr(obj(crudo).mainQuotes).find((x) => str(obj(x).id) === quoteId)
  return q ? obj(q) : null
}

/** Matrícula normalizada (solo letras y cifras, en mayúscula) para comparar la del proyecto con la de la póliza. */
export function normalizarMatricula(v: unknown): string | null {
  const s = typeof v === 'string' ? v.toUpperCase().replace(/[^A-Z0-9]/g, '') : ''
  return s.length >= 4 ? s : null
}

export function matriculaProyecto(crudo: unknown): string | null {
  return normalizarMatricula(obj(obj(crudo).risk).registrationPlate)
}

const FRACCIONAMIENTO_DE_PAGO: Record<string, string> = {
  Annual: 'anual',
  SixMonth: 'semestral',
  Quarterly: 'trimestral',
  Monthly: 'mensual',
}

/**
 * Fraccionamiento de UN precio del proyecto (`paymentFrequency.id` del vendor → el nuestro).
 * Recorre el árbol entero porque tras un ReRate el precio aceptado puede no estar en
 * `mainQuotes` sino dentro de `offers[]`. `null` = no se sabe, nunca «anual» por defecto.
 */
export function fraccionamientoDeOferta(crudo: unknown, quoteId: string | null | undefined): string | null {
  if (!quoteId) return null
  const pila: unknown[] = [crudo]
  let vistos = 0
  while (pila.length > 0 && vistos < 5000) {
    const v = pila.pop()
    vistos++
    if (Array.isArray(v)) {
      for (const x of v) pila.push(x)
    } else if (v && typeof v === 'object') {
      const o = v as Json
      const id = typeof o.id === 'number' ? String(o.id) : o.id
      const pago = str(obj(o.paymentFrequency).id)
      if (id === quoteId && pago) return FRACCIONAMIENTO_DE_PAGO[pago] ?? null
      for (const x of Object.values(o)) if (x && typeof x === 'object') pila.push(x)
    }
  }
  return null
}
