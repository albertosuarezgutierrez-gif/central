/**
 * Formación continua del personal que distribuye seguros (IDD, Directiva (UE) 2016/97, art. 10.2:
 * al menos 15 horas de formación profesional al año).
 *
 * PENDIENTE_REVISION_LEGAL: el mínimo por nivel de formación (RD 287/2021) lo confirma la asesoría;
 * por eso el mínimo es un parámetro con el de la directiva por defecto, no una constante escondida.
 *
 * La persona se identifica por su nombre normalizado (no hay ficha de empleado en `seguros`): una
 * persona sin ningún registro este año SÍ aparece si tuvo registros antes, con 0 horas. Una que no
 * aparece en ningún año no se puede afirmar que cumpla: simplemente no consta.
 */

export const HORAS_MINIMAS_IDD = 15

export type RegistroFormacion = {
  persona: string
  /** Horas acreditadas por el certificado. */
  horas: number
  /** `YYYY-MM-DD` de finalización; decide el año. */
  fecha: string
}

export type EstadoFormacion =
  /** Ya tiene las horas del año. */
  | 'cumplido'
  /** Año en curso, le faltan horas y aún queda margen. */
  | 'en_curso'
  /** Año en curso, le faltan horas y queda poco (desde el 1 de octubre): hay que apuntarse ya. */
  | 'atrasado'
  /** Año cerrado sin las horas. */
  | 'incumplido'

export type ResumenPersona = { persona: string; horas: number; faltan: number; estado: EstadoFormacion }

export type ResumenFormacion = {
  año: number
  minimo: number
  personas: ResumenPersona[]
  /** Los que piden acción: atrasados + incumplidos. */
  pendientes: number
}

/** Clave de identidad de una persona: sin tildes, sin mayúsculas, sin espacios de sobra. */
export function clavePersona(nombre: string): string {
  return nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

const r2 = (n: number) => Math.round(n * 100) / 100

export function resumenFormacion(
  registros: readonly RegistroFormacion[],
  año: number,
  hoy: string,
  minimo: number = HORAS_MINIMAS_IDD,
): ResumenFormacion {
  const añoHoy = Number(hoy.slice(0, 4))
  const porPersona = new Map<string, { persona: string; horas: number }>()
  for (const r of registros) {
    const clave = clavePersona(r.persona)
    if (!clave || Number(r.fecha.slice(0, 4)) > año) continue
    const p = porPersona.get(clave) ?? { persona: r.persona.trim(), horas: 0 }
    if (r.fecha.startsWith(`${año}-`)) p.horas += r.horas
    porPersona.set(clave, p)
  }
  const personas = [...porPersona.values()]
    .map(({ persona, horas }): ResumenPersona => {
      const h = r2(horas)
      const faltan = r2(Math.max(0, minimo - h))
      let estado: EstadoFormacion
      if (faltan === 0) estado = 'cumplido'
      else if (año < añoHoy) estado = 'incumplido'
      else estado = hoy >= `${año}-10-01` ? 'atrasado' : 'en_curso'
      return { persona, horas: h, faltan, estado }
    })
    .sort((a, b) => a.persona.localeCompare(b.persona))
  return { año, minimo, personas, pendientes: personas.filter((p) => p.estado === 'atrasado' || p.estado === 'incumplido').length }
}

export type AltaFormacion = { persona: string; curso: string; entidad: string | null; fecha: string; horas: number }

/** Valida el alta de un curso. Todos los motivos juntos, para pintarlos de una vez. */
export function validarAltaFormacion(
  c: Record<string, unknown> | null,
  hoy: string,
): { ok: true; valor: AltaFormacion } | { ok: false; motivos: string[] } {
  const motivos: string[] = []
  const txt = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const persona = txt(c?.persona)
  const curso = txt(c?.curso)
  const entidad = txt(c?.entidad)
  const fecha = txt(c?.fecha)
  // Se valida el TEXTO (hasta 2 decimales) antes de convertir: comprobar `x*100` entero falla por la coma
  // flotante (2,3 · 1,1 · 8,2 se rechazaban).
  const horasTxt = typeof c?.horas === 'number' ? String(c.horas) : txt(c?.horas)
  const horas = /^\d{1,3}([.,]\d{1,2})?$/.test(horasTxt) ? Number(horasTxt.replace(',', '.')) : NaN
  if (!persona || persona.length > 120) motivos.push('Falta la persona (máx. 120 caracteres).')
  if (!curso || curso.length > 200) motivos.push('Falta el curso (máx. 200 caracteres).')
  if (entidad.length > 200) motivos.push('La entidad formadora es demasiado larga.')
  const fechaReal = /^\d{4}-\d{2}-\d{2}$/.test(fecha) && !Number.isNaN(Date.parse(`${fecha}T00:00:00Z`))
    && new Date(`${fecha}T00:00:00Z`).toISOString().slice(0, 10) === fecha
  if (!fechaReal || fecha < '2000-01-01') {
    motivos.push('La fecha no es válida.')
  } else if (fecha > hoy) {
    motivos.push('La fecha no puede ser futura: se anota el curso ya terminado.')
  }
  if (!Number.isFinite(horas) || horas <= 0 || horas > 200) {
    motivos.push('Las horas tienen que ser un número entre 0 y 200 (hasta 2 decimales).')
  }
  if (motivos.length) return { ok: false, motivos }
  return { ok: true, valor: { persona, curso, entidad: entidad || null, fecha, horas } }
}
