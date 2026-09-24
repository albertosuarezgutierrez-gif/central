// Fechas en formato español. Las columnas `date` de la cartera llegan de Prisma
// como medianoche UTC: se formatea en UTC para que «vence el 15» no salga «14».
export function fechaEs(d: Date | null | undefined): string | null {
  if (!d) return null
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })
}
