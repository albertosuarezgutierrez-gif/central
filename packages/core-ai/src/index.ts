// @central/core-ai — núcleo IA compartido (casa de marcas).
// Adaptadores de proveedor PUROS e identity-agnostic (la config la inyecta la
// app). La POLÍTICA (fallback, timeouts, selección de modelo) vive en cada app.

export { cleanJSON } from './clean-json'
export { nimText, nimChat, nimVision, nimChatTools } from './nim'
export type { NimChatMessage, NimChatOptions, NimToolMessage, NimToolCall, NimToolResult } from './nim'
export { groqText, groqChat, groqChatTools } from './groq'
export type { GroqConfig } from './groq'
export { geminiSearch } from './gemini'
export type { GeminiConfig } from './gemini'
export type { ImageInput, NimConfig } from './types'
export { aiComplete, aiTools } from './client'
export { gatewayChat, gatewaySearch, gatewayVision, gatewayTools } from './gateway'
export type { GatewayConfig } from './gateway'
