// apps/plataforma/lib/dinero.ts
// Formato de dinero en español: separador de miles con punto, decimales con coma y el € DETRÁS
// (2.162,49€), no el estilo dólar ($2162.49). Módulo puro; reutilizable en cualquier pantalla.

// Importe en euros con 2 decimales: 2162.49 → "2.162,49€", 8 → "8,00€".
export function eur(n: number): string {
  const v = Number.isFinite(n) ? n : 0
  // useGrouping:'always' → el punto de millar sale también en 4 cifras (2.162,49), que es lo que
  // pide Alberto; el es-ES por defecto lo omite por debajo de 10.000.
  return `${v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })}€`
}

// Importe en euros sin decimales: 2163 → "2.163€", 8 → "8€".
export function eurSinDecimales(n: number): string {
  const v = Number.isFinite(n) ? n : 0
  return `${v.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: 'always' })}€`
}