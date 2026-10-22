// Quién puede hacer qué con el patrimonio de un titular (spec §4, «Aislamiento» y tabla de permisos).
//
// 🚨 FAIL-CLOSED. Lo que no se reconoce no abre nada: un alcance desconocido, una autorización revocada, caducada
// o sin aceptar, una ficha que no está viva, un nivel o una acción fuera de la lista → nada / `false`.
// En particular, los alcances de la BÓVEDA (`ver`, `ver_economico`, `gestion`, `total`) NO abren el patrimonio:
// solo `patrimonio_gestion` / `patrimonio_total` (que, como `flota`, NO están en `ALCANCES` del portal).
//
// Las entradas llegan YA acotadas a la identidad de la sesión por el adaptador (`lib/patrimonio/accesos.ts`, a
// imagen de `accesosFlota()`): aquí no se consulta nada, solo se decide. Las claves son el `cliente_id` de la ficha
// del titular (`portal_patrimonio_titular.cliente_id`, UNIQUE): el adaptador traduce a `titular.id` si lo necesita.
// 🚨 Ninguna función lee el reloj: `hoy` entra como parámetro.

export type NivelPatrimonio = 'gestion' | 'total'

/** Valores de `portal_autorizacion.alcance` que abren el patrimonio. NO son `Alcance` de la bóveda. */
export const ALCANCE_PATRIMONIO_GESTION = 'patrimonio_gestion' as const
export const ALCANCE_PATRIMONIO_TOTAL = 'patrimonio_total' as const

const NIVEL_DE_ALCANCE: Readonly<Record<string, NivelPatrimonio>> = Object.freeze({
  [ALCANCE_PATRIMONIO_GESTION]: 'gestion',
  [ALCANCE_PATRIMONIO_TOTAL]: 'total',
})

/** La fila de `portal_autorizacion` tal como la trae el adaptador (mismas fechas que `AutorizacionFechas`). */
export interface AutorizacionPatrimonio {
  otorganteClienteId: string
  alcance: string
  /** Una autorización de patrimonio es del titular ENTERO: con póliza concreta no abre nada. */
  polizaId: string | null
  aceptadoEn: Date | null
  /** `null` = no caduca. */
  caducaEn: Date | null
  revocadoEn: Date | null
}

export interface EntradaNiveles {
  /** Fichas vinculadas a la identidad (`portal_vinculo`): es ella misma → `total`. */
  vinculadas: readonly string[]
  /** Sociedades de las que la identidad es Dueño (`empresasDeFichas()`) → `total`. */
  dueno: readonly string[]
  /** Autorizaciones cuyo destinatario es esta identidad o una ficha suya. */
  autorizaciones: readonly AutorizacionPatrimonio[]
  /** Solo fichas VIVAS (activas, sin fusionar). Lo que no esté aquí no abre nada, venga de donde venga. */
  fichasVivas: ReadonlySet<string>
  hoy: Date
}

/** Misma regla que `estadoAutorizacion` del portal: revocada gana a todo; caducada antes que pendiente. */
function autorizacionVigente(a: AutorizacionPatrimonio, hoy: Date): boolean {
  if (a.revocadoEn !== null) return false
  if (a.caducaEn !== null && !(a.caducaEn.getTime() > hoy.getTime())) return false
  return a.aceptadoEn !== null
}

function masAlto(a: NivelPatrimonio | undefined, b: NivelPatrimonio): NivelPatrimonio {
  return a === 'total' || b === 'total' ? 'total' : 'gestion'
}

/**
 * Los titulares cuyo patrimonio ve esta identidad, con su nivel. Si varias fuentes dan nivel, se queda el más alto.
 */
export function nivelesPatrimonio(x: EntradaNiveles): Map<string, NivelPatrimonio> {
  const out = new Map<string, NivelPatrimonio>()
  const poner = (id: string, nivel: NivelPatrimonio) => {
    if (!x.fichasVivas.has(id)) return
    out.set(id, masAlto(out.get(id), nivel))
  }
  for (const id of x.vinculadas) poner(id, 'total')
  for (const id of x.dueno) poner(id, 'total')
  for (const a of x.autorizaciones) {
    const nivel = Object.prototype.hasOwnProperty.call(NIVEL_DE_ALCANCE, a.alcance) ? NIVEL_DE_ALCANCE[a.alcance] : undefined
    if (nivel === undefined) continue
    if (a.polizaId !== null) continue
    if (!autorizacionVigente(a, x.hoy)) continue
    poner(a.otorganteClienteId, nivel)
  }
  return out
}

/**
 * Autorizar a un tercero NO lo da el nivel: solo el propio titular (ficha vinculada) o el Dueño de la sociedad.
 * Un autorizado con nivel Total no reautoriza a un cuarto.
 */
export function puedeAutorizarPatrimonio(
  x: Pick<EntradaNiveles, 'vinculadas' | 'dueno' | 'fichasVivas'>,
  titularClienteId: string,
): boolean {
  if (!x.fichasVivas.has(titularClienteId)) return false
  return x.vinculadas.includes(titularClienteId) || x.dueno.includes(titularClienteId)
}

export const ACCIONES_PATRIMONIO = [
  /** Ver inmuebles, contratos, gastos, calendario, rentabilidad. */
  'ver',
  /** Subir/confirmar facturas, crear plantillas, documentos. */
  'gestionar_gastos_documentos',
  /** Alta/baja de inmueble, contrato, inquilino; enlace del inquilino. */
  'alta_baja',
  /** Ver NIF/IBAN/teléfono del inquilino. */
  'ver_pii_inquilino',
  /** Autorizar a un tercero: NUNCA por nivel (ver `puedeAutorizarPatrimonio`). */
  'autorizar_tercero',
] as const

export type AccionPatrimonio = (typeof ACCIONES_PATRIMONIO)[number]

const TABLA: Readonly<Record<NivelPatrimonio, ReadonlySet<AccionPatrimonio>>> = Object.freeze({
  gestion: new Set<AccionPatrimonio>(['ver', 'gestionar_gastos_documentos']),
  total: new Set<AccionPatrimonio>(['ver', 'gestionar_gastos_documentos', 'alta_baja', 'ver_pii_inquilino']),
})

/** Tabla de §4. Nivel o acción desconocidos (o `undefined`: el titular no está en el mapa) → `false`. */
export function puede(nivel: NivelPatrimonio | null | undefined, accion: AccionPatrimonio): boolean {
  if (nivel !== 'gestion' && nivel !== 'total') return false
  return TABLA[nivel].has(accion)
}
