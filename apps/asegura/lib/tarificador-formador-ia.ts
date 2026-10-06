// La llamada a la IA del formador del tarificador RPA (06/10/2026). Por `iaTexto()` (pasarela de
// plataforma: queda en `ai_usos` con app='asegura' y le aplican los topes diario/mensual) con
// `privado: true` (solo proveedores que no entrenan con los datos). Lo que se manda ya va sin valores
// de inputs y con los datos personales tapados (`leerEstructura`, `limpiarTextoAviso`).

import { iaTexto } from './ia'
import { costeEstimado } from './tarificador-formador-reglas'

export async function preguntarIA(system: string, prompt: string): Promise<{ texto: string; coste: number }> {
  const texto = await iaTexto(prompt, { system, maxTokens: 600, timeoutMs: 20_000, privado: true })
  return { texto, coste: costeEstimado(system.length + prompt.length, texto.length) }
}
