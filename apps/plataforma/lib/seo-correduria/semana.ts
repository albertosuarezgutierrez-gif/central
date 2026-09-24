// lib/seo-correduria/semana.ts — la clave temporal de la foto semanal.
// Vive fuera de la ruta porque un route handler de Next solo puede exportar GET/POST/config.

/** Lunes (UTC) de la semana ISO en que cae `hoy`, como 'YYYY-MM-DD'. */
export function lunesDe(hoy: Date): string {
  const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()))
  const diaSemana = (d.getUTCDay() + 6) % 7 // lunes = 0 … domingo = 6
  d.setUTCDate(d.getUTCDate() - diaSemana)
  return d.toISOString().slice(0, 10)
}
