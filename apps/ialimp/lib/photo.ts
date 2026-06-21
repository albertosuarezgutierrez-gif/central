// Helper de cliente: convierte la URL pública de una foto de cleaning-photos
// en una llamada al proxy firmado. Deja pasar data: y URLs de otros buckets.
export function photoSrc(u?: string | null): string {
  if (!u) return ''
  if (!u.includes('/cleaning-photos/')) return u
  return `/api/l/photo?u=${encodeURIComponent(u)}`
}
