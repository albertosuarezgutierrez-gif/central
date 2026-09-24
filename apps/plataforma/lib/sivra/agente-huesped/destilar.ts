// lib/sivra/agente-huesped/destilar.ts — de la respuesta de Alberto al HECHO del piso.
//
// Ver el comentario de `interpretarDestilado` en `reglas.ts`: lo que se guardaba era la carta
// entera. Aquí se pide UNA frase con el conocimiento permanente y se filtra con esa guarda pura.
import { aiComplete } from '@central/core-ai'
import { interpretarDestilado } from './reglas'

const TIMEOUT_MS = 15_000

const SYSTEM = `Extraes CONOCIMIENTO PERMANENTE de un alojamiento turístico a partir de lo que el
anfitrión le ha respondido a un huésped.
Devuelve UNA sola frase en español, en tercera persona, con el hecho que servirá para responder a
CUALQUIER huésped futuro. Sin saludos, sin despedidas, sin comillas, sin explicaciones.
Reglas estrictas:
- NUNCA incluyas nombres de huéspedes, fechas de una reserva concreta, teléfonos, emails ni IBAN.
- NUNCA conviertas un estado de ese día ("el parking está ocupado esta semana") en una característica
  del alojamiento: eso NO es un hecho permanente.
- Si la respuesta es solo cortesía, o no enseña nada que sirva para otro huésped, responde
  exactamente: NADA`

// Devuelve el hecho destilado, o '' si no hay nada que guardar (o si la IA no respondió).
// '' NUNCA significa «no había hecho»: significa «no se guarda», que es la decisión conservadora.
export async function destilarHecho(p: { pregunta: string; respuesta: string }): Promise<string> {
  const user = `MENSAJE DEL HUÉSPED: ${p.pregunta}\n\nRESPUESTA DEL ANFITRIÓN:\n${p.respuesta}`
  try {
    const out = await aiComplete([{ role: 'user' as const, content: user }], {
      system: SYSTEM, maxTokens: 120, temperature: 0, timeoutMs: TIMEOUT_MS,
    })
    return interpretarDestilado(out || '')
  } catch {
    return ''
  }
}
