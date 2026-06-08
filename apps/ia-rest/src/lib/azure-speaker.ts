/**
 * azure-speaker.ts — Wrapper para Azure Speaker Recognition REST API
 *
 * Documentación: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speaker-recognition-overview
 * Endpoint: text-independent verification (no requiere frase fija)
 * Precio Free F0: 10.000 transacciones/mes
 *
 * Variables de entorno requeridas:
 *   AZURE_SPEECH_KEY    → Keys and Endpoint → KEY 1
 *   AZURE_SPEECH_REGION → ej: "westeurope"
 */

const REGION = () => process.env.AZURE_SPEECH_REGION || 'westeurope'
const KEY    = () => process.env.AZURE_SPEECH_KEY || ''
const BASE   = () =>
  `https://${REGION()}.api.cognitive.microsoft.com/speaker/verification/v2.0/text-independent/profiles`

/** Devuelve true si Azure está configurado */
export function azureDisponible(): boolean {
  return !!(process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION)
}

/**
 * Crea un nuevo perfil de voz en Azure.
 * Llamar la primera vez que un camarero inicia calibración.
 */
export async function crearPerfilAzure(): Promise<string> {
  const r = await fetch(BASE(), {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': KEY(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ locale: 'es-es' }),
  })
  if (!r.ok) {
    const err = await r.text()
    throw new Error(`Azure crear perfil: ${r.status} ${err}`)
  }
  const d = await r.json()
  return d.profileId as string
}

/**
 * Añade audio de entrenamiento al perfil.
 * El audio debe ser WAV PCM 16kHz 16bit mono.
 * Azure requiere ~20s acumulados para marcar el perfil como "Enrolled".
 *
 * @returns segundosRestantes (0 cuando ya está enrollado) y enrolled (true cuando listo)
 */
export async function enrollarAzure(
  profileId: string,
  audioBlob: Blob
): Promise<{ segundosRestantes: number; enrolled: boolean }> {
  const r = await fetch(`${BASE()}/${profileId}/enrollments`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': KEY(),
      'Content-Type': 'audio/wav',
    },
    body: await audioBlob.arrayBuffer(),
  })
  if (!r.ok) {
    const err = await r.text()
    throw new Error(`Azure enroll: ${r.status} ${err}`)
  }
  const d = await r.json()
  return {
    segundosRestantes: d.remainingEnrollmentsSpeechLength ?? 0,
    enrolled: d.enrollmentStatus === 'Enrolled',
  }
}

/**
 * Verifica si el audio corresponde al perfil registrado.
 * NO bloqueante: si falla por cualquier motivo devuelve null.
 *
 * @returns score 0.0–1.0, o null si no se pudo verificar
 */
export async function verificarAzure(
  profileId: string,
  audioBlob: Blob
): Promise<number | null> {
  try {
    // Usar el tipo real del blob. Si es WebM, Azure puede rechazarlo (→ null gracioso).
    // El enrollment siempre usa WAV (generado por capturarWAV() en el cliente).
    const contentType = audioBlob.type?.includes('wav') ? 'audio/wav'
                      : audioBlob.type?.includes('ogg') ? 'audio/ogg; codecs=opus'
                      : audioBlob.type || 'audio/wav'
    const r = await fetch(`${BASE()}/${profileId}/verify`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': KEY(),
        'Content-Type': contentType,
      },
      body: await audioBlob.arrayBuffer(),
    })
    if (!r.ok) return null
    const d = await r.json()
    return typeof d.score === 'number' ? d.score : null
  } catch {
    return null
  }
}

/**
 * Elimina el perfil de Azure (para recalibrar desde cero).
 */
export async function eliminarPerfilAzure(profileId: string): Promise<void> {
  await fetch(`${BASE()}/${profileId}`, {
    method: 'DELETE',
    headers: { 'Ocp-Apim-Subscription-Key': KEY() },
  })
}
