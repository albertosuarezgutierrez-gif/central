// Fechas SIEMPRE relativas a hoy (regla del CLAUDE.md raíz): nada de fechas fijas contra validaciones con reloj.
export const DIA_MS = 86_400_000
export const hoy = (): Date => new Date()
export const masDias = (base: Date, n: number): Date => new Date(base.getTime() + n * DIA_MS)
