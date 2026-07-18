// Señales de mercado LIBRES: derivables de una cotización básica (precio + medias móviles +
// rango de 52 semanas), que es lo que da el plan gratuito de FMP (/quote) — sin screener ni DCF.
// Puro y testeable; lo consume apps/plataforma/lib/fmp.ts al mapear la cotización.

// Posición dentro del rango de 52 semanas: 0 = pegado a mínimos anuales (barato respecto a su
// propio año), 1 = pegado a máximos. Proxy HONESTO de "cotiza por debajo de valor" cuando no hay
// DCF/PER. OJO: cerca de mínimos también puede ser un cuchillo cayendo → es solo un lead a estudiar
// (paper), nunca una orden; combínalo con la guarda de volatilidad y la confirmación de volumen.
export function posicionRango52(
  precio: number,
  min52: number | undefined,
  max52: number | undefined,
): number | undefined {
  if (min52 === undefined || max52 === undefined) return undefined
  if (!Number.isFinite(min52) || !Number.isFinite(max52) || !(max52 > min52)) return undefined
  const p = (precio - min52) / (max52 - min52)
  return Math.min(1, Math.max(0, p))
}

// Fuerza relativa vs un índice de referencia (p.ej. SPY): rendimiento del activo − rendimiento del
// índice en la misma ventana (default ~63 sesiones = 1 trimestre). >0 = lo hace MEJOR que el mercado
// (aguanta la caída), <0 = peor. Filtra la cantera: en un mercado que cae, prefiere lo que cae menos.
export function fuerzaRelativa(cierresActivo: number[], cierresIndice: number[], ventana = 63): number | undefined {
  if (cierresActivo.length < ventana + 1 || cierresIndice.length < ventana + 1) return undefined
  const a0 = cierresActivo[cierresActivo.length - 1 - ventana], a1 = cierresActivo[cierresActivo.length - 1]
  const i0 = cierresIndice[cierresIndice.length - 1 - ventana], i1 = cierresIndice[cierresIndice.length - 1]
  if (a0 <= 0 || i0 <= 0) return undefined
  return (a1 / a0 - 1) - (i1 / i0 - 1)
}

// Tendencia por medias móviles 50/200 (golden/death cross simplificado). Informativa.
export function tendenciaMedias(
  precio: number,
  avg50: number | undefined,
  avg200: number | undefined,
): 'alcista' | 'bajista' | 'mixta' | undefined {
  if (avg50 === undefined || avg200 === undefined) return undefined
  if (!Number.isFinite(avg50) || !Number.isFinite(avg200)) return undefined
  if (precio > avg50 && avg50 >= avg200) return 'alcista'
  if (precio < avg50 && avg50 <= avg200) return 'bajista'
  return 'mixta'
}
