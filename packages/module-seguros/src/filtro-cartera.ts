// El filtro del listado de cartera: qué se puede pedir y cómo se lee de una URL.
//
// Vive en el módulo compartido porque lo necesitan las DOS apps: `apps/asegura`
// para construir la consulta y `apps/plataforma` para pintar los desplegables y
// el resumen de lo que está filtrado. Si cada una tuviera su lista, el día que
// se añada un ramo la pantalla ofrecería un filtro que el puerto no entiende, o
// al revés — y las dos formas de ese desajuste devuelven cero resultados sin un
// solo error.
//
// ─── La regla que gobierna este fichero ─────────────────────────────────────
// Un valor de filtro que no se reconoce NO se ignora en silencio. Ignorarlo
// convierte «enséñame los de ramo XYZ» en «enséñamelo todo», que es la
// respuesta que más se parece a haber funcionado y la que nunca es cierta. Por
// eso `parseFiltroCartera` devuelve también lo que ha DESCARTADO, y la pantalla
// lo dice.

/** Los ramos que existen en el enum `tipo_seguro` del schema `seguros`. */
export type RamoSeguro =
  | 'auto' | 'moto' | 'hogar' | 'vida' | 'salud'
  | 'decesos' | 'responsabilidad_civil' | 'comercio' | 'comunidades' | 'otros'

/**
 * Los ramos, con su rótulo. El orden es el de la cartera real medida el
 * 03/09/2026 (auto 81 · hogar 19 · RC 9 · moto 1 de las 110 vivas): los que se
 * usan de verdad, primero. Los que hoy tienen 0 pólizas NO se esconden — un
 * desplegable que solo ofrece lo que ya existe no deja buscar un hueco, y
 * buscar huecos es justo para lo que sirve esto.
 */
export const RAMOS: readonly { v: RamoSeguro; label: string }[] = [
  { v: 'auto', label: 'Auto' },
  { v: 'hogar', label: 'Hogar' },
  { v: 'responsabilidad_civil', label: 'R. Civil' },
  { v: 'moto', label: 'Moto' },
  { v: 'vida', label: 'Vida' },
  { v: 'salud', label: 'Salud' },
  { v: 'decesos', label: 'Decesos' },
  { v: 'comercio', label: 'Comercio' },
  { v: 'comunidades', label: 'Comunidades' },
  { v: 'otros', label: 'Otros' },
]

const RAMOS_VALIDOS = new Set<string>(RAMOS.map(r => r.v))

export function etiquetaRamo(v: string): string {
  return RAMOS.find(r => r.v === v)?.label ?? v
}

/**
 * Qué mitad de la cartera se lista.
 *
 * 🚨 NO sale de `clientes.tipo`. Esa columna dice 2.742 «cliente» y 29.860
 * «lead» (medido 03/09/2026) cuando la cartera viva son **80 clientes**: es un
 * campo del volcado que nadie mantiene. El grupo se DERIVA de que el cliente
 * tenga o no alguna póliza de cartera viva (`esCarteraViva`, `cartera-viva.ts`),
 * que es la única fuente de esa verdad en el repo.
 */
export type GrupoCartera = 'viva' | 'leads'

/** Estado de la póliza, tal cual el enum `estado_poliza`. */
export type EstadoPolizaFiltro =
  | 'activa' | 'vencida' | 'cancelada' | 'en_renovacion' | 'en_vigor'
  | 'fin_riesgo' | 'recibo_devuelto' | 'cambio_clave' | 'anula_al_vencimiento' | 'competencia'

export const ESTADOS: readonly { v: EstadoPolizaFiltro; label: string }[] = [
  { v: 'activa', label: 'Activa' },
  { v: 'cancelada', label: 'Cancelada' },
  { v: 'en_vigor', label: 'En vigor' },
  { v: 'en_renovacion', label: 'En renovación' },
  { v: 'recibo_devuelto', label: 'Recibo devuelto' },
  { v: 'anula_al_vencimiento', label: 'Anula al vencimiento' },
  { v: 'vencida', label: 'Vencida' },
  { v: 'fin_riesgo', label: 'Fin de riesgo' },
  { v: 'cambio_clave', label: 'Cambio de clave' },
  { v: 'competencia', label: 'Competencia' },
]

const ESTADOS_VALIDOS = new Set<string>(ESTADOS.map(e => e.v))

/**
 * Ventana de vencimiento.
 *
 * `sin_fecha` es un filtro de PRIMERA, no un residuo: 1.194 pólizas no tienen
 * fecha (medido 31/08) y son las que no salen en ninguna lista de renovaciones.
 * Poder pedirlas es lo que las hace reclamables a la compañía.
 */
export type VentanaVencimiento = 'vencidas' | 'd30' | 'd60' | 'd90' | 'anio' | 'sin_fecha'

export const VENTANAS: readonly { v: VentanaVencimiento; label: string }[] = [
  { v: 'd30', label: 'Vencen en 30 días' },
  { v: 'd60', label: 'Vencen en 60 días' },
  { v: 'd90', label: 'Vencen en 90 días' },
  { v: 'anio', label: 'Vencen este año' },
  { v: 'vencidas', label: 'Ya vencidas' },
  { v: 'sin_fecha', label: 'Sin fecha informada' },
]

const VENTANAS_VALIDAS = new Set<string>(VENTANAS.map(v => v.v))

/** Si se puede contactar con el cliente. `sin` = ni email ni teléfono. */
export type FiltroCanal = 'con' | 'sin'

export type FiltroCartera = {
  grupo: GrupoCartera
  /** El cliente tiene AL MENOS una póliza viva de alguno de estos ramos. */
  ramos: RamoSeguro[]
  /**
   * El cliente NO tiene NINGUNA póliza viva de estos ramos. Es el filtro de
   * venta cruzada: `ramos=[auto] & sinRamos=[hogar]` son los 81 autos a los que
   * les falta el hogar. Solo tiene sentido sobre la cartera viva.
   */
  sinRamos: RamoSeguro[]
  companias: string[]
  estados: EstadoPolizaFiltro[]
  provincias: string[]
  vence: VentanaVencimiento | null
  canal: FiltroCanal | null
  /** Texto libre sobre nombre y apellidos. Menos de 3 letras NO se busca. */
  q: string
  pagina: number
  porPagina: number
}

export type ParseFiltro = {
  filtro: FiltroCartera
  /**
   * Valores que venían en la URL y no se han entendido, con su campo. La
   * pantalla los DICE en vez de comportarse como si no se hubieran pedido: un
   * filtro descartado en silencio enseña una lista más ancha de la pedida y
   * parece que ha funcionado.
   */
  descartados: { campo: string; valor: string }[]
  /**
   * `false` cuando `q` traía algo pero es demasiado corto para buscar. No es lo
   * mismo que no haber buscado: la pantalla tiene que decir por qué el texto no
   * ha filtrado, en vez de devolver todo como si el cuadro estuviera vacío.
   */
  buscable: boolean
}

export const POR_PAGINA_DEFECTO = 50
export const POR_PAGINA_MAX = 200
export const MIN_LETRAS_BUSQUEDA = 3

type Lector = { get(k: string): string | null }

function lista(l: Lector, k: string): string[] {
  const v = l.get(k)
  if (!v) return []
  return v.split(',').map(s => s.trim()).filter(Boolean)
}

function entero(l: Lector, k: string, porDefecto: number): number {
  const v = l.get(k)
  if (v === null || !/^\d{1,9}$/.test(v.trim())) return porDefecto
  return Number(v.trim())
}

/**
 * Lee el filtro de los parámetros de una URL.
 *
 * Se comparte entre el proxy de plataforma y el puerto de asegura para que los
 * dos entiendan EXACTAMENTE lo mismo; si cada uno parseara por su cuenta, un
 * parámetro que uno acepta y el otro ignora produce una lista distinta de la
 * pedida sin que nada falle.
 */
export function parseFiltroCartera(l: Lector): ParseFiltro {
  const descartados: { campo: string; valor: string }[] = []

  const filtrar = <T extends string>(campo: string, valores: string[], validos: Set<string>): T[] => {
    const buenos: T[] = []
    for (const v of valores) {
      if (validos.has(v)) buenos.push(v as T)
      else descartados.push({ campo, valor: v })
    }
    return buenos
  }

  const grupoBruto = (l.get('grupo') ?? '').trim()
  let grupo: GrupoCartera = 'viva'
  if (grupoBruto === 'leads') grupo = 'leads'
  else if (grupoBruto && grupoBruto !== 'viva') descartados.push({ campo: 'grupo', valor: grupoBruto })

  const ramos = filtrar<RamoSeguro>('ramo', lista(l, 'ramo'), RAMOS_VALIDOS)
  const sinRamos = filtrar<RamoSeguro>('sinRamo', lista(l, 'sinRamo'), RAMOS_VALIDOS)
  const estados = filtrar<EstadoPolizaFiltro>('estado', lista(l, 'estado'), ESTADOS_VALIDOS)

  const venceBruto = (l.get('vence') ?? '').trim()
  let vence: VentanaVencimiento | null = null
  if (venceBruto) {
    if (VENTANAS_VALIDAS.has(venceBruto)) vence = venceBruto as VentanaVencimiento
    else descartados.push({ campo: 'vence', valor: venceBruto })
  }

  const canalBruto = (l.get('canal') ?? '').trim()
  let canal: FiltroCanal | null = null
  if (canalBruto) {
    if (canalBruto === 'con' || canalBruto === 'sin') canal = canalBruto
    else descartados.push({ campo: 'canal', valor: canalBruto })
  }

  const q = (l.get('q') ?? '').trim()
  const buscable = q.length === 0 || q.length >= MIN_LETRAS_BUSQUEDA

  const porPaginaBruto = entero(l, 'porPagina', POR_PAGINA_DEFECTO)
  const porPagina = Math.min(POR_PAGINA_MAX, Math.max(1, porPaginaBruto))
  const pagina = Math.max(1, entero(l, 'pagina', 1))

  return {
    filtro: {
      grupo,
      ramos,
      // Pedir «sin hogar» sobre los leads no significa nada: un lead no tiene
      // ninguna póliza viva, así que TODOS cumplirían y el filtro engañaría.
      sinRamos: grupo === 'viva' ? sinRamos : [],
      companias: lista(l, 'compania'),
      estados,
      provincias: lista(l, 'provincia'),
      vence,
      canal,
      // Un texto corto no filtra, y `buscable` es lo que lo declara.
      q: buscable ? q : '',
      pagina,
      porPagina,
    },
    descartados,
    buscable,
  }
}

/** ¿El filtro pide algo, o es la vista por defecto? Para decidir si hay que ofrecer «limpiar». */
export function filtroActivo(f: FiltroCartera): boolean {
  return (
    f.ramos.length > 0 || f.sinRamos.length > 0 || f.companias.length > 0 ||
    f.estados.length > 0 || f.provincias.length > 0 ||
    f.vence !== null || f.canal !== null || f.q !== '' || f.grupo !== 'viva'
  )
}

/**
 * El filtro en una frase, para la cabecera de la lista y para la primera línea
 * del CSV exportado. Un CSV sin decir de qué es se convierte en «la lista de
 * clientes» en cuanto sale del navegador, y ahí ya nadie sabe qué se filtró.
 */
export function describirFiltro(f: FiltroCartera): string {
  const partes: string[] = [f.grupo === 'viva' ? 'cartera viva' : 'leads (volcado histórico)']
  if (f.ramos.length) partes.push(`con ${f.ramos.map(etiquetaRamo).join(' o ')}`)
  if (f.sinRamos.length) partes.push(`SIN ${f.sinRamos.map(etiquetaRamo).join(' ni ')}`)
  if (f.companias.length) partes.push(`en ${f.companias.join(' o ')}`)
  if (f.estados.length) partes.push(`estado ${f.estados.join(' o ')}`)
  if (f.provincias.length) partes.push(`de ${f.provincias.join(' o ')}`)
  if (f.vence) partes.push(VENTANAS.find(v => v.v === f.vence)?.label.toLowerCase() ?? f.vence)
  if (f.canal === 'sin') partes.push('sin email ni teléfono')
  if (f.canal === 'con') partes.push('con algún canal de contacto')
  if (f.q) partes.push(`que contengan «${f.q}»`)
  return partes.join(' · ')
}

/**
 * Los días de la ventana, o `null` para las dos que no son un plazo.
 * Se comparte para que la consulta y el rótulo no puedan discrepar.
 */
export function diasDeVentana(v: VentanaVencimiento): number | null {
  if (v === 'd30') return 30
  if (v === 'd60') return 60
  if (v === 'd90') return 90
  return null
}
