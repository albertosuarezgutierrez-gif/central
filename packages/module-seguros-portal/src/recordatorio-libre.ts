/**
 * Recordatorios que el CLIENTE se pone a sí mismo — ITV, carnet, caldera,
 * extintores, o cualquier otra cosa en texto libre. Es la mitad del motor de
 * `portal_obligacion` que hasta el 13/09/2026 solo alimentaban las pólizas
 * (ver `2026-09-03_portal_obligacion.sql`: «el enum nace con sitio para el
 * resto porque una obligación cuelga del BIEN y el motor es el mismo para la
 * ITV de un coche que para el vencimiento de su seguro»). Aquí no hay bien ni
 * póliza detrás: la persona escribe qué y cuándo, y ya está.
 *
 * 🚨 A propósito NO reutiliza `fechaAccionable()` de `obligacion.ts`: aquella
 * resta 30 días porque es un plazo LEGAL (art. 22 LCS) que el cliente no
 * elige. Aquí la fecha que el cliente teclea YA ES la fecha en la que quiere
 * que le avisen — restarle algo sería avisarle antes de lo que pidió.
 */

export type TipoRecordatorio = 'itv' | 'carnet' | 'mantenimiento' | 'revision_gas' | 'libre'

export interface SugerenciaRecordatorio {
  clave: string
  tipo: TipoRecordatorio
  titulo: string
  /** Cada cuántos meses se repite por defecto. `null` = de una sola vez. La
   *  persona puede cambiarlo al crearlo: esto es solo el valor de partida. */
  repiteCadaMesesPorDefecto: number | null
}

/**
 * El catálogo de accesos rápidos. Todas caen en uno de los CUATRO tipos que ya
 * tenía el enum (`itv`, `carnet`, `mantenimiento`, `revision_gas`) — varias
 * sugerencias pueden compartir tipo (p. ej. «Extintores» y «Boletín
 * eléctrico» son las dos `mantenimiento`): el tipo es para agrupar/iconizar,
 * el título es lo que de verdad las distingue.
 */
export const SUGERENCIAS_RECORDATORIO: readonly SugerenciaRecordatorio[] = [
  { clave: 'itv', tipo: 'itv', titulo: 'ITV', repiteCadaMesesPorDefecto: 12 },
  { clave: 'carnet', tipo: 'carnet', titulo: 'Carnet de conducir', repiteCadaMesesPorDefecto: 120 },
  { clave: 'caldera', tipo: 'revision_gas', titulo: 'Revisión de caldera', repiteCadaMesesPorDefecto: 12 },
  { clave: 'gas', tipo: 'revision_gas', titulo: 'Revisión de gas butano', repiteCadaMesesPorDefecto: 60 },
  { clave: 'extintores', tipo: 'mantenimiento', titulo: 'Revisión de extintores', repiteCadaMesesPorDefecto: 12 },
  {
    clave: 'electrica',
    tipo: 'mantenimiento',
    titulo: 'Boletín de instalación eléctrica (OCA)',
    repiteCadaMesesPorDefecto: 60,
  },
] as const

export const TITULO_MAX = 80
export const REPITE_CADA_MESES_MIN = 1
export const REPITE_CADA_MESES_MAX = 120

export type EntradaRecordatorio = {
  tipo?: unknown
  titulo?: unknown
  fechaEvento?: unknown
  repiteCadaMeses?: unknown
  /** De qué PÓLIZA de la cartera es este recordatorio (para poder decir «ITV
   *  del Ibiza» en vez de «ITV» a secas). Excluyente con `polizaDeclaradaId`. */
  polizaId?: unknown
  /** La misma idea, para una póliza que aportó el propio cliente. */
  polizaDeclaradaId?: unknown
}

export type RecordatorioNormalizado = {
  tipo: TipoRecordatorio
  titulo: string
  fechaEvento: Date
  repiteCadaMeses: number | null
  polizaId: string | null
  polizaDeclaradaId: string | null
}

export type ResultadoRecordatorio =
  | { ok: true; datos: RecordatorioNormalizado }
  | {
      ok: false
      error: 'titulo_invalido' | 'fecha_invalida' | 'tipo_invalido' | 'repeticion_invalida' | 'poliza_ambigua'
    }

const TIPOS_VALIDOS: readonly TipoRecordatorio[] = ['itv', 'carnet', 'mantenimiento', 'revision_gas', 'libre']

/**
 * Valida lo que manda el formulario. NO impone que la fecha sea futura: un
 * recordatorio con fecha pasada simplemente no cae dentro de la ventana de
 * aviso (`entraEnVentana()`) y no molesta a nadie — rechazarlo sería una
 * regla de negocio que esta pieza no tiene por qué imponer.
 */
export function normalizarRecordatorio(entrada: EntradaRecordatorio): ResultadoRecordatorio {
  // 🚨 `undefined` (el campo no viaja) es el ÚNICO caso que cae a `'libre'` por
  // defecto. Un `tipo` que SÍ viaja pero no es una cadena del catálogo (un
  // número, un booleano, `null` explícito) se rechaza — antes se colaba como
  // `'libre'` en silencio, que es la misma familia de fallo que un `NULL`
  // colapsado a un valor de cajón.
  if (entrada.tipo !== undefined && typeof entrada.tipo !== 'string') return { ok: false, error: 'tipo_invalido' }
  const tipo = entrada.tipo === undefined ? 'libre' : entrada.tipo
  if (!(TIPOS_VALIDOS as readonly string[]).includes(tipo)) return { ok: false, error: 'tipo_invalido' }

  const tituloBruto = typeof entrada.titulo === 'string' ? entrada.titulo.trim() : ''
  if (tituloBruto.length === 0 || tituloBruto.length > TITULO_MAX) return { ok: false, error: 'titulo_invalido' }

  // 🚨 `new Date('2027-02-30T00:00:00Z')` NO da inválido: `Date` normaliza en
  // silencio al 2 de marzo. El `<input type="date">` del formulario nunca deja
  // elegir un 30 de febrero, pero esta función también la llama la API a
  // pelo — así que se comprueba que la fecha construida DEVUELVE el mismo
  // día/mes/año que se le pidió, no solo que sea un `Date` válido.
  const fechaBruta = typeof entrada.fechaEvento === 'string' ? entrada.fechaEvento : null
  const coincideFormato = fechaBruta !== null && /^\d{4}-\d{2}-\d{2}$/.test(fechaBruta)
  const fechaEvento = coincideFormato ? new Date(`${fechaBruta}T00:00:00Z`) : new Date(NaN)
  if (Number.isNaN(fechaEvento.getTime()) || fechaEvento.toISOString().slice(0, 10) !== fechaBruta) {
    return { ok: false, error: 'fecha_invalida' }
  }

  let repiteCadaMeses: number | null = null
  if (entrada.repiteCadaMeses !== null && entrada.repiteCadaMeses !== undefined && entrada.repiteCadaMeses !== '') {
    // 🚨 `Number(true) === 1`: sin este filtro de tipo, un booleano cuela como
    // «cada 1 mes» y un array de un elemento también se deja convertir. Solo
    // un `number` o un `string` (lo que manda el `<input type="number">`, que
    // en el DOM siempre es texto) son formas legítimas de mandar esto.
    const bruto = entrada.repiteCadaMeses
    if (typeof bruto !== 'number' && typeof bruto !== 'string') return { ok: false, error: 'repeticion_invalida' }
    const n = Number(bruto)
    if (!Number.isInteger(n) || n < REPITE_CADA_MESES_MIN || n > REPITE_CADA_MESES_MAX) {
      return { ok: false, error: 'repeticion_invalida' }
    }
    repiteCadaMeses = n
  }

  // Igual que `normalizarParte()`: los dos ids viajan del mismo formulario,
  // uno u otro, nunca los dos — un recordatorio no puede ser a la vez de una
  // póliza de la cartera Y de una que el cliente aportó.
  const polizaId = typeof entrada.polizaId === 'string' && entrada.polizaId !== '' ? entrada.polizaId : null
  const polizaDeclaradaId =
    typeof entrada.polizaDeclaradaId === 'string' && entrada.polizaDeclaradaId !== '' ? entrada.polizaDeclaradaId : null
  if (polizaId !== null && polizaDeclaradaId !== null) return { ok: false, error: 'poliza_ambigua' }

  return {
    ok: true,
    datos: { tipo: tipo as TipoRecordatorio, titulo: tituloBruto, fechaEvento, repiteCadaMeses, polizaId, polizaDeclaradaId },
  }
}

/** Último día del mes `y`-`m` (0-indexado), en UTC. */
function ultimoDiaDelMes(y: number, m: number): number {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
}

/**
 * `base` + `meses`, conservando el DÍA salvo que el mes destino sea más corto
 * (31 de enero + 1 mes = 28/29 de febrero) — el mismo criterio que
 * `sumarMesesClamp()` de `cobro-declarado.ts`, para que un recordatorio anual
 * puesto un 31 no se vaya corriendo de mes con `setUTCMonth()`.
 */
export function siguienteOcurrencia(fechaEvento: Date, repiteCadaMeses: number): Date {
  const dia = fechaEvento.getUTCDate()
  const indice = fechaEvento.getUTCFullYear() * 12 + fechaEvento.getUTCMonth() + repiteCadaMeses
  const anio = Math.floor(indice / 12)
  const mes = indice - anio * 12
  return new Date(Date.UTC(anio, mes, Math.min(dia, ultimoDiaDelMes(anio, mes))))
}
