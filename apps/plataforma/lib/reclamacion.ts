// Borrador de reclamación por un cargo bancario duplicado (F2). Mismo cliente que
// lib/categorizar.ts: aiComplete(prompt, opts) sobre NVIDIA NIM (gratis); si no hay
// NVIDIA_API_KEY o falla, degrada limpio a una plantilla estática.
import { aiComplete } from '@central/core-ai'
import { eur } from './dinero'

export type ReclamacionInput = { comercio: string; importe: number; fechas: string[] }

export async function redactarReclamacion(input: ReclamacionInput): Promise<{ asunto: string; cuerpo: string }> {
  const imp = Math.abs(input.importe)
  const asunto = `Reclamación por cargo duplicado — ${input.comercio} (${eur(imp)})`
  const plantilla = [
    `Estimados,`,
    ``,
    `He detectado un cargo duplicado de ${eur(imp)} correspondiente a "${input.comercio}",`,
    `registrado en las fechas ${input.fechas.join(' y ')}. Solo una de las operaciones es legítima.`,
    `Solicito la anulación del cargo duplicado y el reintegro del importe.`,
    ``,
    `Quedo a la espera de su confirmación. Un saludo.`,
  ].join('\n')

  try {
    const cuerpo = await aiComplete(
      `Comercio: ${input.comercio}. Importe duplicado: ${eur(imp)}. Fechas: ${input.fechas.join(', ')}.`,
      {
        system: 'Redacta en español formal y breve una reclamación por un cargo bancario duplicado. Devuelve SOLO el cuerpo del email, sin asunto ni encabezados.',
        model: 'meta/llama-3.1-8b-instruct', maxTokens: 500, temperature: 0.2, timeoutMs: 30_000,
      },
    )
    return { asunto, cuerpo: (cuerpo || '').trim() || plantilla }
  } catch {
    return { asunto, cuerpo: plantilla }
  }
}
