// PATRIMONIO (22/10/2026) — reglas PURAS de la UI de facturas (sin imports: se usan desde el cliente).

/**
 * Regla de la UI de subida: el fichero solo se guarda si cuelga de un inmueble (sin owner no hay carpeta). Con inmuebles
 * hay que ELEGIR uno (`elegir`); sin ninguno no se puede guardar el fichero (`sin_inmuebles`: «añade primero un inmueble»).
 * `inmuebleElegido` vacío = no elegido. El servidor sigue aceptando la subida sin inmueble (la lectura funciona igual).
 */
export function reglaInmuebleSubida(inmuebles: number, inmuebleElegido: string): 'ok' | 'elegir' | 'sin_inmuebles' {
  if (inmuebles <= 0) return 'sin_inmuebles'
  return inmuebleElegido.trim() === '' ? 'elegir' : 'ok'
}

/**
 * Al confirmar: ¿qué pasa con el fichero guardado? `se_traslada` = se copia al inmueble nuevo; `queda` = «sin inmueble» o el
 * mismo (el documento sigue en el inmueble de la subida); `sin_fichero` = la subida no guardó fichero.
 */
export function destinoDelFichero(inmuebleSubida: string | null, inmuebleConfirmado: string): 'se_traslada' | 'queda' | 'sin_fichero' {
  if (inmuebleSubida === null) return 'sin_fichero'
  return inmuebleConfirmado !== '' && inmuebleConfirmado !== inmuebleSubida ? 'se_traslada' : 'queda'
}
