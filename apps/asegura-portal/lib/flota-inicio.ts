// La tarjeta «Mi flota» de Inicio (27/10/2026): qué se cuenta y qué se dice. PURO: sin BD, sin sesión, sin reloj (los
// vehículos ya traen su ITV y su vencimiento calculados por `vehiculosDeFlota`). La lectura vive en `flotaParaInicio`
// (`lib/flota.ts`); la tarjeta, en `app/(portal)/inicio/TarjetaFlota.tsx`.
//
// 🚨 Tres estados, como en el resto de Inicio (CLAUDE.md raíz: «dato que NO hay ≠ dato que NO se ha mirado»):
//   · `null` = no se ha podido comprobar → la tarjeta dice «no hemos podido comprobar…», NUNCA un 0 ni un «sin ITV».
//   · `0` = se miró y no hay.
//   · Una sociedad cuya flota no se pudo leer (`vehiculos === null`) deja en `null` TODAS las cifras de vehículos
//     (lo conservador: una suma a medias parecería completa).
// La ITV es un CÁLCULO sobre una inspección que no hemos visto: no existe «ITV al día», solo «cae en los próximos N días»
// o «no sabemos la fecha».
import { DIAS_PRONTO_FLOTA, type VehiculoFlota } from '@central/module-seguros-portal'

export type SociedadFlotaInicio = {
  id: string
  nombre: string
  /** `null` = la flota de esta sociedad no se pudo leer. */
  vehiculos: VehiculoFlota[] | null
  /** `true` = la lista se cortó por el tope de lectura: las cifras son «al menos». */
  recortada: boolean
}

export type EntradaFlotaInicio = {
  sociedades: SociedadFlotaInicio[]
  /** Nombramientos de jefe de flota por aceptar. `null` = no se pudo comprobar. */
  nombramientos: number | null
}

export type ResumenFlotaInicio = {
  sociedades: number
  vehiculos: number | null
  /** Las cifras son un mínimo (flota recortada por el tope de lectura). */
  incompleta: boolean
  /** Vehículos con la ITV calculada en los próximos `DIAS_PRONTO_FLOTA` días (o ya pasada). */
  itvPronto: number | null
  /** Vehículos de los que no sabemos la fecha de la ITV. */
  itvSinSaber: number | null
  /** Seguros de vehículos que vencen en los próximos `DIAS_PRONTO_FLOTA` días. */
  vencenPronto: number | null
  nombramientos: number | null
}

export function resumenFlotaInicio(e: EntradaFlotaInicio): ResumenFlotaInicio {
  const leidas = e.sociedades.every((s) => s.vehiculos !== null)
  const base = { sociedades: e.sociedades.length, nombramientos: e.nombramientos }
  if (!leidas) {
    return { ...base, vehiculos: null, incompleta: false, itvPronto: null, itvSinSaber: null, vencenPronto: null }
  }
  const todos = e.sociedades.flatMap((s) => s.vehiculos ?? [])
  return {
    ...base,
    vehiculos: todos.length,
    incompleta: e.sociedades.some((s) => s.recortada),
    itvPronto: todos.filter((v) => v.itv.estado === 'calculada' && v.itv.pronto).length,
    itvSinSaber: todos.filter((v) => v.itv.estado === 'desconocida').length,
    vencenPronto: todos.filter((v) => v.vencimiento.estado === 'pronto').length,
  }
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

export type TextosFlotaInicio = {
  /** Cada línea: el texto y si es «no se pudo comprobar» (la tarjeta la pinta con `role="status"`). */
  lineas: { texto: string; sinComprobar: boolean }[]
  /** `true` si algo pide atención ya (ITV o vencimiento próximos, nombramiento por aceptar). */
  pideAtencion: boolean
  /** `true` si hay un nombramiento de jefe de flota por aceptar (el botón de la tarjeta lo dice). */
  hayNombramientos: boolean
}

export function textosFlotaInicio(r: ResumenFlotaInicio): TextosFlotaInicio {
  const lineas: TextosFlotaInicio['lineas'] = []
  const dias = DIAS_PRONTO_FLOTA

  if (r.sociedades === 0 && r.vehiculos === 0) {
    // Solo un nombramiento por aceptar: aún no hay ninguna flota que contar (no es «sin vehículos»).
  } else if (r.vehiculos === null || r.itvPronto === null || r.itvSinSaber === null || r.vencenPronto === null) {
    lineas.push({ texto: 'Ahora no hemos podido comprobar los vehículos de tu flota.', sinComprobar: true })
  } else if (r.vehiculos === 0) {
    lineas.push({ texto: 'No nos consta ningún vehículo con seguro en vigor en tus sociedades.', sinComprobar: false })
  } else {
    const minimo = r.incompleta ? 'Al menos ' : ''
    lineas.push({
      texto: `${minimo}${plural(r.vehiculos, 'vehículo con seguro en vigor', 'vehículos con seguro en vigor')}.`,
      sinComprobar: false,
    })
    lineas.push({
      texto:
        r.itvPronto > 0
          ? `${plural(r.itvPronto, 'vehículo tiene', 'vehículos tienen')} la ITV en los próximos ${dias} días (fecha calculada).`
          : `Ninguna ITV calculada cae en los próximos ${dias} días.`,
      sinComprobar: false,
    })
    if (r.itvSinSaber > 0) {
      lineas.push({ texto: `De ${plural(r.itvSinSaber, 'vehículo', 'vehículos')} no sabemos la fecha de la ITV.`, sinComprobar: false })
    }
    lineas.push({
      texto:
        r.vencenPronto > 0
          ? `${plural(r.vencenPronto, 'seguro vence', 'seguros vencen')} en los próximos ${dias} días.`
          : `Ningún seguro de tus vehículos vence en los próximos ${dias} días.`,
      sinComprobar: false,
    })
  }

  if (r.nombramientos === null) {
    lineas.push({ texto: 'Ahora no hemos podido comprobar si te han nombrado jefe de flota.', sinComprobar: true })
  } else if (r.nombramientos > 0) {
    lineas.push({
      texto: `${plural(r.nombramientos, 'sociedad te ha nombrado', 'sociedades te han nombrado')} jefe de flota: acéptalo o recházalo.`,
      sinComprobar: false,
    })
  }

  // `null` (no se pudo comprobar) no es «hay algo»: no tiñe la tarjeta, pero su línea ya dice «no hemos podido comprobar».
  const hay = (n: number | null) => n !== null && n > 0
  const pideAtencion = hay(r.itvPronto) || hay(r.vencenPronto) || hay(r.nombramientos)
  return { lineas, pideAtencion, hayNombramientos: hay(r.nombramientos) }
}

/**
 * ¿La tarjeta de Inicio impide decir «Todo al día»? Sí si algo pide atención Y si no se pudo comprobar algo (un «todo al
 * día» sobre lo que no se ha mirado sería falso). `undefined` = no hay tarjeta de flota: no impide nada.
 */
export function flotaImpideTodoAlDia(e: EntradaFlotaInicio | null | undefined): boolean {
  if (e === undefined) return false
  if (e === null) return true
  const t = textosFlotaInicio(resumenFlotaInicio(e))
  return t.pideAtencion || t.lineas.some((l) => l.sinComprobar)
}
