// Antes/después de cada escritura del puerto (Fase 1b de ASegura OS, pieza c). PURO.
//
// Las funciones que escriben la cartera llaman a `anotarCambio()` (lib/auditoria.ts) y el cambio
// viaja en la MISMA fila de `seguros.auditoria` que la llamada del puerto que lo provocó: quién,
// qué ruta y, ahora, qué campo pasó de qué a qué.
//
// 🚨 La tabla es append-only y no se puede tocar ante una supresión RGPD, así que aquí la regla
// va AL REVÉS de lo cómodo: un valor solo se guarda si el campo está en `CAMPOS_CON_VALOR`
// (estados, tipos, fechas de negocio, importes). Todo lo demás —DNI, nombre, dirección, contacto,
// notas, motivos escritos a mano— queda como `{ campo, tocado: true }`: consta que se escribió,
// no qué. Un campo nuevo que nadie ha clasificado cae en ese lado, nunca en el de guardar.

export type Cambio = {
  entidad: string
  id: string
  campo: string
  antes?: unknown
  despues?: unknown
}

export type CambioGuardado =
  | { entidad: string; id: string; campo: string; antes: Primitivo; despues: Primitivo }
  | { entidad: string; id: string; campo: string; tocado: true }

type Primitivo = string | number | boolean | null

/** `entidad.campo` cuyos valores se pueden guardar: datos de negocio, nunca de una persona. */
export const CAMPOS_CON_VALOR: ReadonlySet<string> = new Set([
  'cliente.activo',
  'anulacion.estado',
  'carta_mediador.estado',
  'siniestro.estado',
  'poliza.estado',
  'poliza.modalidad_rc',
  'poliza.numero_poliza',
  'poliza.fecha_efecto',
  'poliza.fecha_vencimiento',
  'poliza.prima_total',
  'poliza.aseguradora',
  'relacion.tipo',
  'relacion.existe',
  'autorizacion.estado',
  'autorizacion.alcance',
  'supresion.estado',
  'interviniente.existe',
  'documento.estado',
  'documento.existe',
  'evento.estado',
  'oportunidad.estado',
  'aprobacion.estado',
])

/** Tope por fila: una escritura masiva no convierte la auditoría en un volcado. */
export const MAX_CAMBIOS = 50
const MAX_TEXTO = 80

function primitivo(v: unknown): Primitivo | undefined {
  if (v === null || v === undefined) return null
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') return v.length > MAX_TEXTO ? v.slice(0, MAX_TEXTO) : v
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString()
  return undefined // objetos y arrays no se guardan: no se sabe qué llevan dentro
}

export function sanearCambio(c: Cambio): CambioGuardado {
  const base = { entidad: c.entidad, id: c.id, campo: c.campo }
  if (!CAMPOS_CON_VALOR.has(`${c.entidad}.${c.campo}`)) return { ...base, tocado: true }
  const antes = primitivo(c.antes)
  const despues = primitivo(c.despues)
  if (antes === undefined || despues === undefined) return { ...base, tocado: true }
  return { ...base, antes, despues }
}

/** Saneados, sin los que no cambian (antes === después) y con el tope aplicado. */
export function cambiosParaGuardar(cambios: Cambio[]): CambioGuardado[] {
  return cambios
    .map(sanearCambio)
    .filter((c) => !('antes' in c) || c.antes !== c.despues)
    .slice(0, MAX_CAMBIOS)
}
