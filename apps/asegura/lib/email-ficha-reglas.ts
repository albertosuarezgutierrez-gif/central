// Regla pura (sin BD ni cifrado propio) de qué dirección usar entre las guardadas de una ficha.
import { esCanalCorreduria } from '@central/module-seguros'

export type EstadoEmailGuardado = { estado: 'ok'; email: string } | { estado: 'sin_email' } | { estado: 'ilegible' }

/**
 * Pura (sin BD): de las direcciones cifradas de la ficha, el desenlace.
 */
export function elegirEmailGuardado(
  guardados: string[],
  { campoIlegible, descifrarCampo }: { campoIlegible: (v: string) => boolean; descifrarCampo: (v: string) => string | null },
): EstadoEmailGuardado {
  // El canal de la correduría (hola@…) que se pone cuando la compañía exige un email NO es del
  // cliente: no se le escribe ahí (se le escribiría a la propia correduría). Se salta.
  let hayCanal = false
  let hayIlegible = false
  for (const cifrado of guardados) {
    if (campoIlegible(cifrado)) { hayIlegible = true; continue }
    const claro = descifrarCampo(cifrado)
    if (claro && claro.trim() !== '') {
      if (esCanalCorreduria(claro)) { hayCanal = true; continue }
      return { estado: 'ok', email: claro.trim() }
    }
    hayIlegible = true
  }
  // Si alguna dirección no se pudo abrir, prevalece `ilegible` (problema de clave): el canal de la
  // correduría no debe taparlo. `sin_email` solo cuando lo ÚNICO que había era el canal.
  if (hayIlegible || !hayCanal) return { estado: 'ilegible' }
  return { estado: 'sin_email' }
}
