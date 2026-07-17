// Agente conversacional de Empresas. Carga el dataset real (getEmpresasYRadar), lo serializa a un
// contexto compacto (parte pura en empresas-agente-contexto) y lo pasa a la pasarela IA. Las
// empresas/cifras salen de la BD; la IA solo filtra/ordena/narra sobre esa lista (nunca inventa).
import { aiComplete } from '@/lib/ai-client'
import { getEmpresasYRadar, getProvincias, type FiltroEmpresas } from '@/lib/empresas'
import { construirContexto, SYSTEM } from './empresas-agente-contexto'

/**
 * Responde a una pregunta cargando el dataset (filtrado por provincia si se pasa) y consultando la IA.
 * Si se pasa `contextoWeb` (resultado de una búsqueda web), se añade al contexto y la IA puede usarlo
 * (citando enlaces) además de la lista de la BD.
 */
export async function responderEmpresas(pregunta: string, provincia?: string, contextoWeb?: string): Promise<{ text: string }> {
  const filtro: FiltroEmpresas = provincia ? { provincia } : {}
  const [datos, provincias] = await Promise.all([getEmpresasYRadar(filtro), getProvincias()])
  const contexto = construirContexto({ ...datos, provincias }, 200)
  const bloqueWeb = contextoWeb ? `\n\n# Resultados de búsqueda web (úsalos y CITA los enlaces; no inventes)\n${contextoWeb}` : ''
  const text = await aiComplete([
    { role: 'system', content: `${SYSTEM}\n\nCONTEXTO:\n${contexto}${bloqueWeb}` },
    { role: 'user', content: pregunta },
  ])
  return { text: text?.trim() || 'No he podido generar respuesta.' }
}
