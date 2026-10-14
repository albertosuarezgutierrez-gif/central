/**
 * Aviso de prueba de «Configuración» (14/10/2026): texto FIJO (sin datos personales) y el mapeo puro
 * de los resultados de envío a la respuesta de `POST /api/push/prueba`.
 */
export const PRUEBA_PUSH_MAX = 3
export const PRUEBA_PUSH_VENTANA_MS = 10 * 60 * 1000

export const PAYLOAD_PRUEBA = {
  title: 'Grupo ASegura',
  body: 'Aviso de prueba: tus avisos llegan bien a este dispositivo.',
  icon: '/icono-app',
  data: { url: '/configuracion' },
} as const

export type ResultadoEnvioPrueba = { ok: boolean }

export type RespuestaPrueba =
  | { status: 200; cuerpo: { enviados: number; fallidos: number } }
  | { status: 502; cuerpo: { error: 'envio_fallido'; enviados: 0; fallidos: number } }

/** Todos fallaron = 502 (no se finge un envío que no salió); con al menos uno aceptado, 200. */
export function respuestaDePrueba(resultados: ResultadoEnvioPrueba[]): RespuestaPrueba {
  const enviados = resultados.filter((r) => r.ok).length
  const fallidos = resultados.length - enviados
  if (enviados === 0) return { status: 502, cuerpo: { error: 'envio_fallido', enviados: 0, fallidos } }
  return { status: 200, cuerpo: { enviados, fallidos } }
}
