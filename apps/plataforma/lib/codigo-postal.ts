/**
 * Código postal → municipio(s). Delega en `@central/core-direccion/servidor` (la tabla INE se movió allí el 20/10/2026).
 * `null` = «no lo sé»; nunca `[]`. SOLO servidor.
 */
export { municipiosPorCp } from '@central/core-direccion/servidor'
