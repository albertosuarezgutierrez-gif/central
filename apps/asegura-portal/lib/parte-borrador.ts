// Borrador del parte de siniestro, guardado en ESTE dispositivo.
//
// Quien da un parte lo hace con prisa y desde el móvil: una llamada, la app que
// se cierra, la batería. Sin borrador, lo escrito se pierde y hay que empezar de
// cero justo en el peor momento.
//
// 🚨 Tres decisiones que no se tocan sin pensarlo:
// - La clave lleva la IDENTIDAD: un móvil compartido (la familia) no puede
//   enseñarle a una persona el siniestro a medias de otra.
// - Caduca (`CADUCA_MS`): un borrador de hace una semana ya no es «lo que estaba
//   escribiendo», es un siniestro viejo que alguien podría enviar sin mirar.
// - Los FICHEROS no se guardan (un `File` no se serializa, y 10 MB de fotos en
//   localStorage tampoco caben). La pantalla lo dice al recuperar.
//
// Todo acceso a `localStorage` va en try/catch: en navegación privada o con el
// almacenamiento bloqueado lanza, y un borrador que no se puede guardar no puede
// romper el parte.

export const CADUCA_MS = 72 * 60 * 60 * 1000

export function claveBorrador(identidadId: string): string {
  return `asegura-portal:parte-borrador:v1:${identidadId}`
}

export type Borrador<F> = { guardadoEn: number; form: F }

/** ¿Hay algo que merezca guardarse? Un formulario sin tocar no es un borrador. */
export function merecePena(form: { descripcion: string; lugar: string; fechaHecho: string }): boolean {
  return form.descripcion.trim() !== '' || form.lugar.trim() !== '' || form.fechaHecho !== ''
}

/**
 * Lee un borrador y lo valida. `null` = no hay, está caducado o no se entiende.
 * Solo se aceptan las claves de `plantilla` y con su mismo tipo: lo que venga
 * del almacenamiento no es de fiar (otra versión de la app, o manipulado).
 */
export function leerBorrador<F extends Record<string, unknown>>(
  bruto: string | null,
  plantilla: F,
  ahora: number,
): Borrador<F> | null {
  if (bruto === null) return null
  let v: unknown
  try {
    v = JSON.parse(bruto)
  } catch {
    return null
  }
  if (typeof v !== 'object' || v === null) return null
  const { guardadoEn, form } = v as { guardadoEn?: unknown; form?: unknown }
  if (typeof guardadoEn !== 'number' || !Number.isFinite(guardadoEn)) return null
  if (ahora - guardadoEn > CADUCA_MS || guardadoEn > ahora + 60_000) return null
  if (typeof form !== 'object' || form === null) return null
  const limpio = mezclar(plantilla, form as Record<string, unknown>)
  return { guardadoEn, form: limpio }
}

function mezclar<F extends Record<string, unknown>>(plantilla: F, origen: Record<string, unknown>): F {
  const salida: Record<string, unknown> = { ...plantilla }
  for (const k of Object.keys(plantilla)) {
    const base = plantilla[k]
    const valor = origen[k]
    if (Array.isArray(base)) {
      if (Array.isArray(valor) && valor.every((x) => typeof x === 'string')) salida[k] = valor
    } else if (typeof base === 'object' && base !== null) {
      if (typeof valor === 'object' && valor !== null && !Array.isArray(valor)) {
        salida[k] = mezclar(base as Record<string, unknown>, valor as Record<string, unknown>)
      }
    } else if (typeof valor === typeof base) {
      salida[k] = valor
    }
  }
  return salida as F
}

export function guardar(clave: string, form: unknown, ahora: number): void {
  try {
    localStorage.setItem(clave, JSON.stringify({ guardadoEn: ahora, form }))
  } catch {
    // Sin almacenamiento no hay borrador; el parte sigue funcionando igual.
  }
}

export function leer(clave: string): string | null {
  try {
    return localStorage.getItem(clave)
  } catch {
    return null
  }
}

export function borrar(clave: string): void {
  try {
    localStorage.removeItem(clave)
  } catch {
    // idem
  }
}
