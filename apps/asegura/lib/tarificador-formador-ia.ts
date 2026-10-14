// La llamada a la IA del formador del tarificador RPA (06/10/2026). Por `iaTexto()` (pasarela de
// plataforma: queda en `ai_usos` con app='asegura' y le aplican los topes diario/mensual) con
// `privado: true` (solo proveedores que no entrenan con los datos). Lo que se manda ya va sin valores
// de inputs y con los datos personales tapados (`leerEstructura`, `limpiarTextoAviso`).

import { iaTexto } from './ia'
import { MAX_TOKENS_SALIDA_FORMADOR, costeEstimado } from './tarificador-formador-reglas'

/** `modelo`: slug de OpenRouter por la pasarela (escalón potente); sin él, el por defecto. `timeoutMs` por llamada (escalera: 15 s). */
export async function preguntarIA(system: string, prompt: string, modelo?: string, timeoutMs = 20_000): Promise<{ texto: string; coste: number }> {
  const texto = await iaTexto(prompt, { system, maxTokens: MAX_TOKENS_SALIDA_FORMADOR, timeoutMs, privado: true, ...(modelo ? { modeloOpenRouter: modelo } : {}) })
  return { texto, coste: costeEstimado(system.length + prompt.length, texto.length, modelo) }
}
