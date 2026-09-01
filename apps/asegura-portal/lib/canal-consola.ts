import type { Canal } from './canal'

/**
 * Adaptador de DESARROLLO: escribe el código en el log del servidor.
 * Se registra solo fuera de producción — en producción, un código de acceso en
 * los logs es una credencial regalada.
 */
export const canalConsola: Canal = {
  tipo: 'email',
  async enviarCodigo(destino, codigo) {
    if (process.env.NODE_ENV === 'production') return false
    console.log(`[portal] código para ${destino}: ${codigo}`)
    return true
  },
}
