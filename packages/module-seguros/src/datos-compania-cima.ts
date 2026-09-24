/**
 * Lo que la COMPAÑÍA dice de una póliza por CIMA y que no es el objeto asegurado
 * (24/09/2026): anulación, póliza a la que sustituye, suplementos, «otros datos»
 * y el resto de la ficha del inmueble o de la embarcación.
 *
 * Lo escribe la ingesta de CIMA (mapper EIAC del CRM, repo `asegura`) en
 * `polizas.datos_especificos`, en claro: es dato de contrato. Este lector lo usan
 * las DOS apps —asegura para servirlo por el puerto y plataforma para leer la
 * respuesta—, así que tolera cualquier forma: lo que no tenga la forma esperada
 * se descarta, nunca se inventa.
 *
 * 🚨 `null` = la ficha no trae nada de esto (o es anterior a que se leyera);
 * no significa «la compañía no lo manda». Los códigos (motivo de anulación,
 * clase de inmueble, zona…) llegan TAL CUAL: no hay catálogo EIAC y traducirlos
 * a ojo sería inventarse el contrato. Donde la compañía manda texto, se pinta el
 * texto.
 */

export type AnulacionCima = { fecha: string | null; motivo: string | null; detalle: string | null }
export type PolizaReemplazadaCima = {
  numero: string
  codigoDgs: string | null
  ramoDgs: string | null
  descripcionRamo: string | null
}
export type SuplementoCima = {
  id: string | null
  detalle: string | null
  clase: string | null
  descripcionClase: string | null
  situacion: string | null
  fechaEfecto: string | null
  fechaEmision: string | null
  fechaVencimiento: string | null
}
export type OtroDatoCima = { id: string | null; descripcion: string | null; valor: string | null }
export type MedidaProteccionCima = { medida: string | null; valor: string | null }
export type InmuebleCima = {
  claseInmueble: string | null
  usoInmueble: string | null
  zona: string | null
  claseComunidad: string | null
  actividad: string | null
  /** El valor crudo de `Antiguedad` (un año o una fecha). El año limpio ya viaja en el objeto. */
  antiguedad: string | null
  medidasProteccion: MedidaProteccionCima[]
}
export type EmbarcacionCima = {
  nombre: string | null
  matricula: string | null
  marca: string | null
  modelo: string | null
  clase: string | null
  eslora: string | null
  potencia: string | null
  plazas: string | null
  puertoBase: string | null
  anio: string | null
}

export type DatosCompaniaCima = {
  anulacion: AnulacionCima | null
  polizaReemplazada: PolizaReemplazadaCima | null
  suplementos: SuplementoCima[]
  otrosDatos: OtroDatoCima[]
  inmueble: InmuebleCima | null
  embarcacion: EmbarcacionCima | null
}

const MAX = 60

function obj(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function txt(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t
}

function fecha(v: unknown): string | null {
  const t = txt(v)
  return t !== null && /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null
}

function lista<T>(v: unknown, leer: (o: Record<string, unknown>) => T | null): T[] {
  if (!Array.isArray(v)) return []
  const out: T[] = []
  for (const x of v) {
    const o = obj(x)
    const r = o ? leer(o) : null
    if (r !== null) out.push(r)
    if (out.length >= MAX) break
  }
  return out
}

function algunoInformado(o: Record<string, unknown>): boolean {
  return Object.values(o).some((v) => v !== null && !(Array.isArray(v) && v.length === 0))
}

export function leerDatosCompaniaCima(datos: unknown): DatosCompaniaCima | null {
  const d = obj(datos)
  if (!d) return null

  const an = obj(d.anulacion)
  const anulacion: AnulacionCima | null = an
    ? { fecha: fecha(an.fecha), motivo: txt(an.motivo), detalle: txt(an.detalle) }
    : null

  const re = obj(d.polizaReemplazada)
  const numeroRe = re ? txt(re.numero) : null
  const polizaReemplazada: PolizaReemplazadaCima | null =
    re && numeroRe
      ? { numero: numeroRe, codigoDgs: txt(re.codigoDgs), ramoDgs: txt(re.ramoDgs), descripcionRamo: txt(re.descripcionRamo) }
      : null

  const suplementos = lista<SuplementoCima>(d.suplementos, (s) => {
    const r: SuplementoCima = {
      id: txt(s.id),
      detalle: txt(s.detalle),
      clase: txt(s.clase),
      descripcionClase: txt(s.descripcionClase),
      situacion: txt(s.situacion),
      fechaEfecto: fecha(s.fechaEfecto),
      fechaEmision: fecha(s.fechaEmision),
      fechaVencimiento: fecha(s.fechaVencimiento),
    }
    return algunoInformado(r) ? r : null
  })
  // El más reciente arriba; los que no traen fecha, al final y en su orden.
  suplementos.sort((a, b) => (b.fechaEfecto ?? '').localeCompare(a.fechaEfecto ?? ''))

  const otrosDatos = lista<OtroDatoCima>(d.otrosDatos, (o) => {
    const r = { id: txt(o.id), descripcion: txt(o.descripcion), valor: txt(o.valor) }
    return r.id || r.descripcion ? r : null
  })

  const medidasProteccion = lista<MedidaProteccionCima>(d.medidasProteccion, (m) => {
    const r = { medida: txt(m.medida), valor: txt(m.valor) }
    return r.medida || r.valor ? r : null
  })
  const inmuebleCand: InmuebleCima = {
    claseInmueble: txt(d.claseInmueble),
    usoInmueble: txt(d.usoInmueble),
    zona: txt(d.zona),
    claseComunidad: txt(d.claseComunidad),
    actividad: txt(d.actividad),
    antiguedad: txt(d.antiguedadCima),
    medidasProteccion,
  }
  const inmueble = algunoInformado(inmuebleCand) ? inmuebleCand : null

  const e = obj(d.embarcacion)
  const embCand: EmbarcacionCima | null = e
    ? {
        nombre: txt(e.nombre),
        matricula: txt(e.matricula),
        marca: txt(e.marca),
        modelo: txt(e.modelo),
        clase: txt(e.clase),
        eslora: txt(e.eslora),
        potencia: txt(e.potencia),
        plazas: txt(e.plazas),
        puertoBase: txt(e.puertoBase),
        anio: txt(e.anio),
      }
    : null
  const embarcacion = embCand && algunoInformado(embCand) ? embCand : null

  const anulacionOk = anulacion && algunoInformado(anulacion) ? anulacion : null
  if (!anulacionOk && !polizaReemplazada && suplementos.length === 0 && otrosDatos.length === 0 && !inmueble && !embarcacion) {
    return null
  }
  return { anulacion: anulacionOk, polizaReemplazada, suplementos, otrosDatos, inmueble, embarcacion }
}

/**
 * Cómo se dice una anulación en pantalla. La fusión de CIMA (`jsonb ||`) deja
 * la anulación vieja en la ficha aunque la póliza se rehabilite, así que el
 * rótulo depende del ESTADO de la póliza: con la póliza vigente no se afirma
 * que esté anulada, se dice que consta una anulación ANTERIOR.
 */
export function rotuloAnulacionCima(a: AnulacionCima, polizaVigente: boolean): string {
  const que = a.detalle ?? (a.motivo ? `motivo ${a.motivo}` : 'sin motivo informado')
  if (polizaVigente) return `Consta una anulación anterior${a.fecha ? ` (${a.fecha})` : ''}: ${que}. La póliza sigue en vigor.`
  return `Anulada${a.fecha ? ` con fecha ${a.fecha}` : ''}: ${que}.`
}

/**
 * El mismo lector sobre lo que SIRVE el puerto (`DatosCompaniaCima` ya armado):
 * lo usa plataforma. Se aplana el `inmueble` a la forma de `datos_especificos`
 * y se pasa por `leerDatosCompaniaCima`, así las dos puntas validan igual y no
 * hay dos listas de campos que puedan divergir.
 */
export function leerDatosCompaniaPuerto(v: unknown): DatosCompaniaCima | null {
  const d = obj(v)
  if (!d) return null
  const inm = obj(d.inmueble)
  const plano: Record<string, unknown> = { ...d }
  delete plano.inmueble
  if (inm) {
    const { antiguedad, ...resto } = inm
    Object.assign(plano, resto, { antiguedadCima: antiguedad })
  }
  return leerDatosCompaniaCima(plano)
}
