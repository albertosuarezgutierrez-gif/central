// Modelo de OpenRouter EXPLÍCITO que un llamante de la pasarela puede pedir (13/10/2026, explorador IA del tarificador
// de asegura). Puro: valida la forma del slug. `null` = no es un slug de OpenRouter aceptable.
//
// No confundir con `model` del cuerpo de /api/ai/chat: ese es el PIN que SALTA OpenRouter y va a la cadena clásica
// (NIM…); un id de OpenRouter ahí acaba en «NVIDIA HTTP 404» (ver lib/subastas/lector-registral-enrutado.test.ts).

const RE_SLUG = /^[a-z0-9][a-z0-9-]{0,40}\/[a-z0-9][a-z0-9._-]{0,80}(?::[a-z]{1,20})?$/

export function modeloOpenRouterValido(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return RE_SLUG.test(s) ? s : null
}
