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
  if (importesNoRespaldados(respuesta, fuentes).length > 0) return true
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

// ── Importes en euros ──────────────────────────────────────────────────────────────────────
//
// 🚨 Los patrones de arriba NO cazan un precio: buscan códigos de 4+ dígitos, teléfonos y URLs, así
// que el «unos 25-30€» que el agente se inventó para el taxi del aeropuerto (05/09/2026, reserva
// 154375571) pasó limpio. Un importe es justo lo que un huésped apunta y luego reclama, y el precio
// real de ese trayecto es una tarifa FIJA municipal: no es opinable, o está bien o está mal.
//
// Cualquier cifra en euros que no aparezca en las fuentes escala. Es deliberadamente estricto: el
// coste de un falso positivo es que Alberto lea un borrador correcto, y el de un falso negativo es
// un precio falso escrito por el anfitrión en el chat oficial de Booking.
const RE_IMPORTE = /(?:€\s*(\d+(?:[.,]\d{1,2})?)|(\d+(?:[.,]\d{1,2})?)\s*(?:€|eur\b|euros?\b))/gi
// Rango: «25-30€», «25 a 30 euros», «25 to 30 EUR». La primera cifra no lleva marca de moneda, así
// que sin esto solo se comprobaría la segunda y media mentira se colaría.
const RE_RANGO = /(\d+(?:[.,]\d{1,2})?)\s*(?:-|–|a|to|bis)\s*(\d+(?:[.,]\d{1,2})?)\s*(?:€|eur\b|euros?\b)/gi

const valorDe = (s: string): number => Number(String(s).replace(',', '.'))

// Todos los números que aparecen en las fuentes, normalizados (26 y 26,00 son el mismo importe).
function numerosDe(texto: string): Set<number> {
  const out = new Set<number>()
  for (const m of (texto || '').matchAll(/\d+(?:[.,]\d{1,2})?/g)) {
    const n = valorDe(m[0])
    if (Number.isFinite(n)) out.add(n)
  }
  return out
}

export function importesNoRespaldados(respuesta: string, fuentes: string): number[] {
  const enFuentes = numerosDe(fuentes)
  const citados = new Set<number>()
  for (const m of (respuesta || '').matchAll(RE_RANGO)) {
    citados.add(valorDe(m[1])); citados.add(valorDe(m[2]))
  }
  for (const m of (respuesta || '').matchAll(RE_IMPORTE)) {
    citados.add(valorDe(m[1] ?? m[2]))
  }
  return [...citados].filter(n => Number.isFinite(n) && !enFuentes.has(n)).sort((a, b) => a - b)
}
