// Tipos compartidos del núcleo IA (casa de marcas).

/** Imagen para llamadas de visión (base64 puro, sin prefijo `data:`). */
export interface ImageInput {
  data: string       // base64 puro (sin prefijo data:)
  mediaType: string  // 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
}

/**
 * Configuración para el cliente NVIDIA NIM.
 *
 * El paquete es **identity-agnostic**: NO lee `process.env` ni secretos. La app
 * consumidora construye esta config (apiKey desde su propio entorno) y la pasa.
 * Así el mismo núcleo sirve a ia.rest, SIVRA e IALIMP sin acoplar credenciales.
 */
export interface NimConfig {
  apiKey: string
  baseUrl?: string      // default: endpoint OpenAI-compatible de NVIDIA
  textModel?: string    // default: meta/llama-3.3-70b-instruct
  visionModel?: string  // default: meta/llama-3.2-11b-vision-instruct
}
