// Red del expediente de siniestro: llamadas al puerto de asegura (solo desde rutas API de plataforma).
import { llamar, type Reenvio } from '../siniestros-asegura.ts'

/** Cuerpo para el puerto: `correduriaId` solo si hay (si es null se omite; el puerto usa la correduría única). */
export const conCorreduria = (correduriaId: string | null, body: Record<string, unknown>): Record<string, unknown> => {
  const { correduriaId: _ignorado, ...resto } = body
  return correduriaId ? { ...resto, correduriaId } : resto
}

export const hiloAsegura = (correduriaId: string | null, siniestroId: string): Promise<Reenvio> =>
  llamar(`/api/operador/siniestro/hilo?${new URLSearchParams({ ...(correduriaId ? { correduriaId } : {}), siniestroId })}`, { method: 'GET' })

export const anotarHiloAsegura = (body: Record<string, unknown>): Promise<Reenvio> =>
  llamar('/api/operador/siniestro/hilo', { method: 'POST', body: JSON.stringify(body) })

export const cierreAsegura = (body: Record<string, unknown>): Promise<Reenvio> =>
  llamar('/api/operador/siniestro/cierre', { method: 'PATCH', body: JSON.stringify(body) })

export const iaSiniestroAsegura = (body: Record<string, unknown>): Promise<Reenvio> =>
  llamar('/api/operador/siniestro/ia', { method: 'POST', body: JSON.stringify(body) }, 170_000)

export const esperandoAsegura = (correduriaId: string | null): Promise<Reenvio> =>
  llamar(`/api/operador/siniestros/esperando${correduriaId ? `?${new URLSearchParams({ correduriaId })}` : ''}`, { method: 'GET' })

export const volcadoAsegura = (body: Record<string, unknown>): Promise<Reenvio> =>
  llamar('/api/operador/siniestro/hilo/volcado', { method: 'POST', body: JSON.stringify(body) }, 60_000)

export const polizaBuscarAsegura = (correduriaId: string | null, siniestroId: string, q: string): Promise<Reenvio> =>
  llamar(`/api/operador/siniestro/poliza-buscar?${new URLSearchParams({ ...(correduriaId ? { correduriaId } : {}), siniestroId, q })}`, { method: 'GET' }, 60_000)
