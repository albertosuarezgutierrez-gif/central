/**
 * Los cuatro motivos por los que el puerto con central-asegura puede fallar, y
 * dónde se arregla cada uno.
 *
 * Vivía duplicado dentro de `CorreduriaClient.tsx`. Se saca aquí porque ahora
 * lo necesitan varios bloques de la pantalla (renovaciones, cartera) y porque
 * un texto de diagnóstico copiado es un texto que se corrige en un sitio y se
 * queda viejo en el otro.
 *
 * El texto NO es decorativo: dice si el problema está en el secreto, en la BD
 * de asegura o en la red, para no tener que adivinarlo (31/08/2026).
 */

export type MotivoError = 'secreto_rechazado' | 'asegura_error' | 'respuesta_ilegible' | 'red'

export const MOTIVOS: Record<MotivoError, string> = {
  secreto_rechazado:
    'central-asegura ha RECHAZADO el secreto (401): los dos valores de ASEGURA_OPERADOR_SECRET no coinciden. Vuelve a pegar el MISMO valor en los dos proyectos de Vercel y redespliega.',
  asegura_error:
    'central-asegura responde, pero no puede leer la cartera en central: revisa DATABASE_URL del proyecto Vercel central-asegura (rol prisma_seguros) y su último despliegue.',
  respuesta_ilegible:
    'central-asegura ha devuelto una respuesta inesperada (ni cartera ni error conocido). Mira los logs del proyecto en Vercel.',
  red: 'no se pudo contactar con central-asegura (timeout o red). Reintenta en un rato.',
}
