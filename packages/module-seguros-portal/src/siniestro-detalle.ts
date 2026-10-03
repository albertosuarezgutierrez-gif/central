/**
 * TODO lo que la compañía cuenta de un siniestro, para el CLIENTE (28/09/2026).
 *
 * Dictado de Alberto: «el seguro es suyo, tiene que saber todo… contra más
 * información le demos menos necesita de nosotros». Deroga la regla del
 * 03/09/2026 que ocultaba tramitador, perito, reserva y culpa.
 *
 * Lo que SIGUE fuera, y no por decisión de pantalla sino porque no es suyo:
 * los datos personales de TERCEROS (matrícula y conductor del contrario,
 * nombre de la persona física que prestó una asistencia). Llegan CIFRADOS
 * (`v1:`) y el portal no tiene la clave: `textoClaro` los descarta, así que
 * aunque un día llegaran aquí, no se pintarían.
 *
 * Tres estados como en todo el portal: `null` = la compañía no lo informa ·
 * lista vacía no se devuelve nunca (se colapsa a `null`) · con dato = el dato.
 * Un código que no está en la tabla NO se pinta crudo.
 */

export type ContactoGestion = { nombre: string | null; telefono: string | null; email: string | null }

export type DetalleSiniestroCompania = {
  /** `YYYY-MM-DD`: cuándo se DECLARÓ a la compañía (≠ la fecha del hecho). */
  fechaDeclaracion: string | null
  /** Posición de culpa, ya en palabras. Código desconocido → `null`. */
  culpa: string | null
  /** Papel del asegurado en el siniestro («Causante» / «Perjudicado»). */
  papel: string | null
  /** Hubo parte amistoso (DAA). `null` = no consta; `false` = consta que no. */
  parteAmistoso: boolean | null
  /** Lo que la compañía APARTA para el siniestro — no lo que va a pagar. */
  reserva: number | null
  reservaPorCobertura: { cobertura: string; importe: number | null }[] | null
  totalRecobrado: number | null
  expedientes: {
    numero: string | null
    desde: string | null
    hasta: string | null
    reserva: number | null
    pagado: number | null
    recobrado: number | null
  }[] | null
  riesgo: { descripcion: string | null; coberturas: { descripcion: string | null; capital: number | null }[] } | null
  /** «SEAT IBIZA · 1234ABC». */
  vehiculo: string | null
  /** Solo marca y modelo: la matrícula del contrario es de un tercero. */
  vehiculoContrario: string | null
  /** Asistencias prestadas; el prestador solo si es EMPRESA. */
  asistencias: { descripcion: string | null; prestador: string | null }[] | null
  /** Descripción que manda la compañía por CIMA (≠ `comentario` del corredor). */
  descripcion: string | null
  tramitador: ContactoGestion | null
  perito: ContactoGestion | null
}

export type EntradaDetalle = {
  fechaDeclaracion: unknown
  posicion: unknown
  responsabilidad: unknown
  daa: unknown
  reserva: unknown
  reservaDesglose: unknown
  totalRecobros: unknown
  expedientes: unknown
  riesgo: unknown
  vehiculo: unknown
  vehiculoContrario: unknown
  asistencias: unknown
  descripcion: unknown
  tramitador: { nombre: unknown; telefono: unknown; email: unknown }
  perito: { nombre: unknown; telefono: unknown; email: unknown }
}

/** Posición de culpa EIAC (`claves_posicionsiniestro`). NA = no aplica → no se pinta. */
const CULPA: Record<string, string> = {
  CU: 'Con culpa del asegurado',
  RE: 'Sin culpa: tu compañía reclama al contrario',
  // `IN` (indeterminada) NO se pinta: en siniestros ya pagados decía «culpa sin determinar», que
  // es ruido y suena a que falta algo. «Sin determinar» es «no consta»: no se afirma nada.
}

const PAPEL: Record<string, string> = {
  CAUSANTE: 'Causante (tu vehículo o tú causasteis el daño)',
  PERJUDICADO: 'Perjudicado (sufriste el daño)',
}

/** Texto en claro, o `null`. Un valor cifrado (`v1:`) NUNCA se pinta. */
export function textoClaro(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' || t.startsWith('v1:') ? null : t
}

/** Decimal de Prisma / string / número → número finito. `''` y basura → `null`, nunca 0. */
function importe(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'string' && v.trim() === '') return null
  const n = typeof v === 'number' ? v : Number(String(v))
  return Number.isFinite(n) ? n : null
}

const fecha = (v: unknown): string | null => {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10)
  const t = textoClaro(v)
  return t && /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : null
}

const obj = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null

const objetos = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.map(obj).filter((x): x is Record<string, unknown> => x !== null) : []

const noVacia = <T>(xs: T[]): T[] | null => (xs.length > 0 ? xs : null)

function contacto(c: EntradaDetalle['tramitador']): ContactoGestion | null {
  const r = { nombre: textoClaro(c.nombre), telefono: textoClaro(c.telefono), email: textoClaro(c.email) }
  return r.nombre === null && r.telefono === null && r.email === null ? null : r
}

/**
 * Un código interno delante del nombre («1219-Allianz Auto Terceros») no es para el cliente:
 * se quita el prefijo numérico. Si solo quedara el código, `null`.
 */
export function descripcionRiesgoLegible(v: unknown): string | null {
  const t = textoClaro(v)
  if (t === null) return null
  const limpio = t.replace(/^\d{2,}\s*[-–:]\s*/, '').trim()
  return limpio === '' || /^\d+$/.test(limpio) ? null : limpio
}

/**
 * `nombresCobertura`: código de cobertura de la PÓLIZA → su nombre. La reserva por cobertura
 * llega con el código («16: 171,31€»); un código numérico sin nombre que lo traduzca NO se pinta
 * (no dice nada al cliente); un texto ya legible sí.
 */
export function detalleSiniestroCompania(
  e: EntradaDetalle,
  nombresCobertura: Readonly<Record<string, string>> = {},
): DetalleSiniestroCompania | null {
  const cod = (v: unknown) => textoClaro(v)?.toUpperCase() ?? null
  const posicion = cod(e.posicion)
  const papel = cod(e.responsabilidad)

  const rd = obj(e.reservaDesglose)
  const reservaPorCobertura = rd
    ? noVacia(
        objetos(rd.coberturas)
          .map((c) => {
            const cod = textoClaro(c.cobertura)
            return { cobertura: cod === null ? null : Object.hasOwn(nombresCobertura, cod) ? nombresCobertura[cod] : /^[\d\s./-]+$/.test(cod) ? null : cod, importe: importe(c.importe) }
          })
          .filter((c): c is { cobertura: string; importe: number | null } => c.cobertura !== null),
      )
    : null

  const ri = obj(e.riesgo)
  const riCob = ri
    ? objetos(ri.coberturas)
        .map((c) => ({ descripcion: textoClaro(c.descripcion), capital: importe(c.capital) }))
        .filter((c) => c.descripcion !== null || c.capital !== null)
    : []
  const riesgoDesc = ri ? descripcionRiesgoLegible(ri.descripcion) : null
  const riesgo = ri && (riesgoDesc !== null || riCob.length > 0)
    ? { descripcion: riesgoDesc, coberturas: riCob }
    : null

  const ve = obj(e.vehiculo)
  const vehiculoTxt = ve
    ? [[textoClaro(ve.marca), textoClaro(ve.modelo)].filter(Boolean).join(' ') || null, textoClaro(ve.matricula)]
        .filter(Boolean)
        .join(' · ') || null
    : null

  const vc = obj(e.vehiculoContrario)

  const d: DetalleSiniestroCompania = {
    fechaDeclaracion: fecha(e.fechaDeclaracion),
    culpa: posicion ? CULPA[posicion] ?? null : null,
    papel: papel ? PAPEL[papel] ?? null : null,
    parteAmistoso: typeof e.daa === 'boolean' ? e.daa : null,
    reserva: importe(e.reserva),
    reservaPorCobertura,
    totalRecobrado: importe(e.totalRecobros),
    expedientes: noVacia(
      objetos(e.expedientes)
        .map((x) => ({
          numero: textoClaro(x.numero),
          desde: fecha(x.fechaInicio),
          hasta: fecha(x.fechaFin),
          reserva: importe(x.importeReserva),
          pagado: importe(x.totalPagos),
          recobrado: importe(x.totalRecobros),
        }))
        .filter((x) => Object.values(x).some((v) => v !== null)),
    ),
    riesgo,
    vehiculo: vehiculoTxt,
    vehiculoContrario: vc ? textoClaro(vc.marcaModelo) : null,
    asistencias: noVacia(
      objetos(e.asistencias)
        // `nombre` (persona física) va cifrado y es de un tercero: ni se lee.
        .map((a) => ({ descripcion: textoClaro(a.descripcion), prestador: textoClaro(a.razonSocial) }))
        .filter((a) => a.descripcion !== null || a.prestador !== null),
    ),
    descripcion: textoClaro(e.descripcion),
    tramitador: contacto(e.tramitador),
    perito: contacto(e.perito),
  }
  return Object.values(d).every((v) => v === null) ? null : d
}
