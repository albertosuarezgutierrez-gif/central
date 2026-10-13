// Reglas PURAS del cotizador de HOGAR embebido en la oportunidad (10/10/2026, fase HOGAR del riesgo unificado,
// docs/superpowers/specs/2026-10-10-riesgo-unificado-todos-los-ramos-design.md). Las cubre `cotizador-hogar.test.ts`.
//
// Embebido = «solo condiciones»: la vivienda y las personas son las del RIESGO (bloques de arriba). La ficha de
// `hogar-nuevo` (Formulario) se pinta entera para que se vea con qué se cotiza, pero solo se tocan aquí las
// condiciones de ESTA cotización (fecha de efecto) y los datos personales que la ficha no trae (estado civil), como
// en moto y auto. Lo demás se corrige arriba y el cotizador se vuelve a leer solo (huella del riesgo).

/** Las filas de la ficha de hogar que se pueden tocar dentro del riesgo. El resto, en sus bloques de arriba. */
export const CAMPOS_HOGAR_EMBEBIDO_EDITABLES = ['fechaEfecto', 'estadoCivil'] as const

export function filaHogarEditableEmbebida(campo: string): boolean {
  return (CAMPOS_HOGAR_EMBEBIDO_EDITABLES as readonly string[]).includes(campo)
}

/** Grupos de la ficha de hogar (`resumen-hogar.ts` de asegura) que son la VIVIENDA del riesgo. */
const GRUPOS_VIVIENDA = new Set(['donde', 'como', 'protecciones', 'capitales'])

/** Dónde se corrige una fila que falta o está mal, cuando el cotizador va dentro del riesgo. */
export function dondeSeCorrigeHogar(fila: { campo: string; grupo: string }): 'aqui' | 'vivienda' | 'personas' {
  if (filaHogarEditableEmbebida(fila.campo)) return 'aqui'
  // «El tomador es el propietario» es un dato de la vivienda del riesgo (`datosVivienda.propietarioEsTomador`).
  if (fila.campo === 'propietarioEsTomador' || GRUPOS_VIVIENDA.has(fila.grupo)) return 'vivienda'
  return 'personas'
}

export function textoDondeSeCorrige(d: 'aqui' | 'vivienda' | 'personas'): string | null {
  return d === 'vivienda' ? 'Se corrige arriba, en «Datos de la vivienda».' : d === 'personas' ? 'Se corrige arriba, en «Intervinientes» (Editar datos).' : null
}

/**
 * Lo que las PERSONAS del riesgo dicen frente a lo que la petición de hogar de Codeoscopic puede llevar. Esa petición
 * solo tiene `holder` y, si `propietarioEsTomador`, `risk.owner` = la misma persona (`peticion-hogar.ts` de asegura):
 * no admite un propietario ni un asegurado DISTINTOS del tomador.
 *
 * - Contradicción (bloquea, no se pagan 0,50€): el propietario del riesgo es otra ficha y la vivienda dice «el
 *   propietario es el tomador: Sí» (se mandaría al tomador como dueño), o el propietario es la ficha del tomador y la
 *   vivienda dice «No».
 * - Aviso (no bloquea): propietario o asegurado distintos del tomador que NO viajan en el precio; se recogen al emitir.
 * - `propietarioEsTomador: null` = no se sabe: aquí no se decide nada (la ficha de hogar lo pide como «falta»).
 */
export function figurasFrenteAPeticionHogar(e: {
  figuras: ReadonlyArray<{ rol: string; clienteId: string; nombre: string }>
  tomadorId: string
  propietarioEsTomador: boolean | null
}): { bloqueo: string | null; avisos: string[] } {
  const avisos: string[] = []
  let bloqueo: string | null = null
  const propietario = e.figuras.find((f) => f.rol === 'propietario') ?? null
  if (propietario && propietario.clienteId !== e.tomadorId) {
    if (e.propietarioEsTomador === true) {
      bloqueo = `«El propietario es el tomador» dice Sí, pero en «Intervinientes» el propietario es ${propietario.nombre}. Corrige uno de los dos arriba antes de pedir precio.`
    } else {
      avisos.push(`El propietario (${propietario.nombre}) no es el tomador: la petición de hogar de Codeoscopic no lleva un propietario distinto del tomador, así que no viaja en este precio. Se recoge al emitir.`)
    }
  } else if (propietario && propietario.clienteId === e.tomadorId && e.propietarioEsTomador === false) {
    bloqueo = '«El propietario es el tomador» dice No, pero en «Intervinientes» el propietario es el propio tomador. Corrige uno de los dos arriba antes de pedir precio.'
  }
  for (const a of e.figuras.filter((f) => f.rol === 'asegurado' && f.clienteId !== e.tomadorId)) {
    avisos.push(`El asegurado (${a.nombre}) no es el tomador: la petición de hogar no lleva asegurado aparte, así que no viaja en este precio. Se recoge al emitir.`)
  }
  return { bloqueo, avisos }
}

/**
 * «El tomador es el propietario» con el que se cotiza dentro del riesgo. El dato de la vivienda manda. Si no consta
 * (`null`) y en «Intervinientes» el propietario es OTRA ficha, es `false`: lo dice el propio riesgo, no es un supuesto
 * (sin esto asegura SUPONE «sí» y mandaría al tomador como dueño). Si no consta y nada lo contradice, `null`: la ficha
 * de hogar lo marca como supuesto, como siempre.
 */
export function propietarioEsTomadorDeRiesgo(e: {
  figuras: ReadonlyArray<{ rol: string; clienteId: string }>
  tomadorId: string
  propietarioEsTomador: boolean | null
}): boolean | null {
  if (e.propietarioEsTomador !== null) return e.propietarioEsTomador
  const p = e.figuras.find((f) => f.rol === 'propietario')
  return p && p.clienteId !== e.tomadorId ? false : null
}
