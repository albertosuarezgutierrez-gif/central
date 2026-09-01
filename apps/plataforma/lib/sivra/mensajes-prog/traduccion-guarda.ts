// lib/sivra/mensajes-prog/traduccion-guarda.ts — guarda PURA de la traducción (sin IA ni deps).
// Vive separada de traducir.ts (que importa @central/core-ai) para poder testearse con node --test
// sin arrastrar el paquete — mismo patrón que clave-dedup.ts / idempotencia.ts.
//
// ¿La traducción conserva todos los datos duros del original?
//  - Toda secuencia de ≥2 dígitos (códigos, horas, teléfonos, números de portal).
//  - Toda URL http(s).
// Basta con que cada dato aparezca en la traducción: un código repetido que quede una vez sigue
// siendo utilizable; uno MUTADO o perdido, no — y en ese caso se envía el español.
export function conservaDatos(orig: string, trad: string): boolean {
  if (!trad.trim()) return false
  const datos = (s: string) => [
    ...(s.match(/\d[\d#]{1,}/g) || []),
    ...(s.match(/https?:\/\/[^\s)]+/g) || []),
  ]
  const enTrad = new Set(datos(trad))
  return datos(orig).every(d => enTrad.has(d))
}
