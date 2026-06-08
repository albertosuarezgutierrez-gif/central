// @iarest/core-ai — núcleo IA compartido (casa de marcas).
// Adaptadores de proveedor PUROS e identity-agnostic (la config la inyecta la
// app). La POLÍTICA (fallback, timeouts, selección de modelo) vive en cada app.

export { cleanJSON } from './clean-json'
export { nimText, nimChat, nimVision } from './nim'
export type { NimChatMessage, NimChatOptions } from './nim'
export { geminiSearch } from './gemini'
export type { GeminiConfig } from './gemini'
export type { ImageInput, NimConfig } from './types'
