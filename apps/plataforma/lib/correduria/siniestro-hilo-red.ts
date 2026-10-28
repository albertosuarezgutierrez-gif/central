// Red del expediente de siniestro: llamadas al puerto de asegura (solo desde rutas API de plataforma).
import { llamar, type Reenvio } from '../siniestros-asegura.ts'

export const hiloAsegura = (correduriaId: string | null, siniestroId: string): Promise<Reenvio> =>
  llamar(`/api/operador/siniestro/hilo?${new URLSearchParams({ ...(correduriaId ? { correduriaId } : {}), siniestroId })}`, { method: 'GET' })

export const anotarHiloAsegura = (body: Record<string, unknown>): Promise<Reenvio> =>
  llamar('/api/operador/siniestro/hilo', { method: 'POST', body: JSON.stringify(body) })

export const cierreAsegura = (body: Record<string, unknown>): Promise<Reenvio> =>
  llamar('/api/operador/siniestro/cierre', { method: 'PATCH', body: JSON.stringify(body) })

export const iaSiniestroAsegura = (body: Record<string, unknown>): Promise<Reenvio> =>
  llamar('/api/operador/siniestro/ia', { method: 'POST', body: JSON.stringify(body) })

export const esperandoAsegura = (correduriaId: string | null): Promise<Reenvio> =>
  llamar(`/api/operador/siniestros/esperando${correduriaId ? `?${new URLSearchParams({ correduriaId })}` : ''}`, { method: 'GET' })
