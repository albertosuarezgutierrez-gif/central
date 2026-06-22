// lib/sivra/agente-huesped/guardrail.ts — anti-invención.
// Extrae "datos duros" (códigos, teléfonos, claves, URLs) de la respuesta y comprueba
// que estén presentes en las fuentes (guía + historial + datos de reserva).
function normaliza(s: string): string { return (s || '').toLowerCase().replace(/[\s\-().]/g, '') }

const PATRONES: RegExp[] = [
  /\+?\d[\d\s().-]{6,}\d/g,                  // teléfonos
  /\b[A-Za-z0-9]{4,}\d{2,}[A-Za-z0-9]*\b/g,  // claves alfanuméricas tipo Sevilla2026 / 4471X
  /\b\d{4,}\b/g,                              // códigos numéricos de 4+ dígitos
  /https?:\/\/\S+/g,                          // URLs
]

export function contieneDatoInventado(respuesta: string, fuentes: string): boolean {
  const src = normaliza(fuentes)
  for (const re of PATRONES) {
    const m = respuesta.match(re)
    if (!m) continue
    for (const token of m) {
      // Horas tipo 15:00 / 11:00 son seguras (no son "datos duros" inventables).
      if (/^\d{1,2}:\d{2}$/.test(token.trim())) continue
      if (!src.includes(normaliza(token))) return true
    }
  }
  return false
}
