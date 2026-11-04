// Retirada del vehículo (OT → «entregado»): qué hace falta para entregar y cómo se versiona el texto de conformidad.
// Lógica PURA: la firma (PNG) y el almacén los aporta la app.
import type { ConfigRetirada } from './config.ts'

export const MAX_NOMBRE_RETIRA = 200
export const MAX_TEXTO_CONFORMIDAD = 4000

export interface EntradaRetirada {
  /** Quien retira el vehículo (puede no ser el titular). */
  nombre: string
  tieneFirma: boolean
}

/**
 * Errores de una entrega concreta (vacío = se puede entregar). Con firma obligatoria hacen falta firma y nombre; si el taller la
 * desactivó, entregar sin firma es válido, pero una firma que llega se guarda con su nombre.
 */
export function validarRetirada(r: ConfigRetirada, e: EntradaRetirada): string[] {
  const errores: string[] = []
  const nombre = e.nombre.trim()
  if (nombre.length > MAX_NOMBRE_RETIRA) errores.push('el nombre de quien retira es demasiado largo')
  if (r.firmaObligatoria && !e.tieneFirma) errores.push('falta la firma de conformidad de quien retira el vehículo')
  if ((r.firmaObligatoria || e.tieneFirma) && !nombre) errores.push('falta el nombre de quien retira el vehículo')
  return errores
}

/** Errores del texto que edita el taller (se guarda con la firma: no puede quedar vacío ni desmesurado). */
export function validarTextoConformidad(texto: string): string[] {
  const t = texto.trim()
  if (!t) return ['el texto de conformidad no puede estar vacío']
  if (t.length > MAX_TEXTO_CONFORMIDAD) return [`el texto de conformidad no puede pasar de ${MAX_TEXTO_CONFORMIDAD} caracteres`]
  return []
}

/** «retirada-borrador-1» → «retirada-borrador-2»; sin número final se añade «-2». Cada cambio del texto sube la versión. */
export function siguienteVersionTexto(version: string): string {
  const v = version.trim()
  const m = v.match(/^(.*?)(\d+)$/)
  return m ? `${m[1]}${Number(m[2]) + 1}` : `${v || 'retirada'}-2`
}
