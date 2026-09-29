// «El cliente se va» desde un recibo DEVUELTO (Alberto, 29/09/2026): la clienta avisó de que no
// quería la moto; el recibo vuelve sin pagar y la compañía anulará la póliza. El corredor lo da por
// hecho YA (baja verificada), sin esperar a que CIMA lo confirme, y la pérdida se convierte en una
// oportunidad para el año que viene: su seguro nuevo renovará en el aniversario del que dejó.
//
// Reglas puras (sin BD): qué motivo vale, cuándo vence su seguro nuevo y qué día llamarle.

/** Subconjunto de `MOTIVOS_PERDIDA` (`@central/module-seguros`) que tiene sentido para una baja. */
export const MOTIVOS_BAJA = ['competidor', 'precio', 'cliente_desiste', 'otro'] as const
export type MotivoBaja = (typeof MOTIVOS_BAJA)[number]

export const ROTULO_MOTIVO_BAJA: Record<MotivoBaja, string> = {
  competidor: 'se va a otra compañía',
  precio: 'por precio',
  cliente_desiste: 'ya no quiere el seguro',
  otro: 'otro motivo',
}

/** Días antes del vencimiento en que se le llama para pasarle precio (el mismo criterio que las oportunidades de competencia). */
export const DIAS_ANTES_LLAMADA = 60

export function motivoBajaValido(v: unknown): MotivoBaja | null {
  return typeof v === 'string' && (MOTIVOS_BAJA as readonly string[]).includes(v) ? (v as MotivoBaja) : null
}

function isoValida(s: string | null | undefined): string | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(`${s}T00:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s
}

function sumarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/**
 * Cuándo renueva el seguro que el cliente contrate fuera: el primer aniversario POSTERIOR a hoy del
 * efecto del recibo que no pagó (es el día en que dejó de estar con nosotros). Sin esa fecha, el
 * vencimiento de la póliza. `null` si no hay ninguna fecha legible: no se inventa un día.
 */
export function vencimientoCompetencia(efectoRecibo: string | null, vencimientoPoliza: string | null, hoy: string): string | null {
  return siguienteAniversario(isoValida(efectoRecibo), hoy) ?? siguienteAniversario(isoValida(vencimientoPoliza), hoy)
}

/** El primer aniversario de `base` posterior a hoy, en los 3 años siguientes; `null` si no hay base o es más vieja. */
function siguienteAniversario(base: string | null, hoy: string): string | null {
  if (!base) return null
  const [a, m, d] = base.split('-').map(Number)
  for (let n = 0; n <= 3; n++) {
    const dia = Math.min(d, new Date(Date.UTC(a + n, m, 0)).getUTCDate()) // 29/02 → 28/02
    const iso = `${a + n}-${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
    if (iso > hoy) return iso
  }
  return null
}

/** La llamada: {@link DIAS_ANTES_LLAMADA} días antes de ese vencimiento, nunca antes de mañana. */
export function fechaLlamada(vence: string | null, hoy: string): string {
  const manana = sumarDias(hoy, 1)
  if (!vence) return manana
  const antes = sumarDias(vence, -DIAS_ANTES_LLAMADA)
  return antes > manana ? antes : manana
}
