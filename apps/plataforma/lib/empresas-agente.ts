// Agente conversacional de Empresas. Carga el dataset real (getEmpresasYRadar), lo serializa a un
// contexto compacto (parte pura en empresas-agente-contexto) y lo pasa a la pasarela IA. Las
// empresas/cifras salen de la BD; la IA solo filtra/ordena/narra sobre esa lista (nunca inventa).
import { aiComplete } from '@/lib/ai-client'
import { getEmpresasYRadar, getProvincias, type FiltroEmpresas } from '@/lib/empresas'
import { construirContexto, SYSTEM } from './empresas-agente-contexto'

/** Responde a una pregunta cargando el dataset (filtrado por provincia si se pasa) y consultando la IA. */
export async function responderEmpresas(pregunta: string, provincia?: string): Promise<{ text: string }> {
  const filtro: FiltroEmpresas = provincia ? { provincia } : {}
  const [datos, provincias] = await Promise.all([getEmpresasYRadar(filtro), getProvincias()])
  const contexto = construirContexto({ ...datos, provincias }, 200)
  const text = await aiComplete([
    { role: 'system', content: `${SYSTEM}\n\nCONTEXTO:\n${contexto}` },
    { role: 'user', content: pregunta },
  ])
  return { text: text?.trim() || 'No he podido generar respuesta.' }
}
