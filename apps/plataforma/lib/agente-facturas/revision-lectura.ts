// Señales de que la IA ha LEÍDO MAL el documento (no de que no sea gasto). Módulo PURO.
//
// No descartan nada: si alguna salta, el gasto va a la bandeja con el aviso y nunca se
// auto-confirma ni refuerza una regla. Patrones vistos en `gastos` (origen agente-email, 60 días
// hasta el 03/11/2026):
//   · El nombre del CLIENTE o la dirección del piso tomados como proveedor (factura de El Giraldillo
//     con proveedor «SOCORRO» = la calle del piso; foto de WhatsApp con cliente «SOCORRO»).
//   · El propio titular como proveedor (recibo de póliza de cliente con proveedor = Alberto).
//   · Documento de hace meses que llega hoy por un reenvío (resúmenes de Booking de 2024,
//     albarán de julio leído en octubre): ¿gasto de este periodo o histórico?
import { normalizaNombreReceptor, type Titular } from './receptor.ts'

/** Más vieja que esto (respecto de hoy), la fecha del documento obliga a revisar. */
export const DIAS_DOC_ANTIGUO = 90

/**
 * Nombres de los inmuebles PROPIOS tal como aparecen en las facturas (calle o apodo del piso).
 * Solo casa si el «proveedor» ES eso, no si lo contiene («Farmacia Socorro» no salta).
 */
export const NOMBRES_INMUEBLES = ['socorro', 'bustos tavera']

const PREFIJO_DIRECCION = /^(?:calle|c|cl|avda|avenida|plaza|pza|casa|piso|apartamento|apto)\s+/

function sinPrefijoNiNumero(n: string): string {
  return n.replace(PREFIJO_DIRECCION, '').replace(/\s+\d+[a-z]?(?:\s.*)?$/, '').trim()
}

function mismoNombre(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  // «alberto suarez» vs «alberto suarez gutierrez»: uno es prefijo del otro y no es trivial.
  const [corto, largo] = a.length <= b.length ? [a, b] : [b, a]
  return corto.length >= 8 && corto.split(' ').length >= 2 && largo.startsWith(`${corto} `)
}

export interface LecturaRevisable {
  proveedor?: string | null
  cliente?: string | null
  fecha?: string | null
}

function diasDesde(fechaIso: string, hoy: Date): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaIso)) return null
  const t = Date.parse(`${fechaIso}T00:00:00Z`)
  if (Number.isNaN(t)) return null
  return Math.floor((hoy.getTime() - t) / 86_400_000)
}

/** Avisos de lectura dudosa. `[]` = nada que objetar (no «verificado»: solo que no salta ninguna señal). */
export function avisosDeLectura(
  d: LecturaRevisable,
  titulares: Titular[] = [],
  hoy: Date = new Date(),
  /** `false` en la subida manual: ahí Alberto sube a propósito un documento viejo. */
  opts: { antiguedad?: boolean } = {},
): string[] {
  const avisos: string[] = []
  const prov = normalizaNombreReceptor(d.proveedor)
  const cli = normalizaNombreReceptor(d.cliente)

  if (prov) {
    if (titulares.some((t) => mismoNombre(prov, normalizaNombreReceptor(t.nombre)))) {
      avisos.push('El proveedor leído es uno de tus titulares: la IA ha confundido emisor y destinatario')
    } else if (cli && mismoNombre(prov, cli)) {
      avisos.push('Proveedor y cliente leídos coinciden: revisa quién EMITE la factura')
    }
    if (NOMBRES_INMUEBLES.includes(sinPrefijoNiNumero(prov))) {
      avisos.push(`El proveedor leído («${d.proveedor?.trim()}») es la dirección de un piso, no quien emite la factura`)
    }
  }

  const dias = opts.antiguedad !== false && d.fecha ? diasDesde(d.fecha, hoy) : null
  if (dias !== null && dias > DIAS_DOC_ANTIGUO) {
    avisos.push(`Documento fechado el ${d.fecha} (hace ${dias} días): ¿gasto de este periodo o un reenvío de histórico?`)
  }
  return avisos
}
