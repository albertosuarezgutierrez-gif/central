// Qué parte de una precalificación de auto PUEDE salir por el puerto de
// operador hacia `apps/plataforma`. LÓGICA PURA: sin red, sin BD, sin Prisma.
//
// ─── Por qué existe este fichero y no un `JSON.stringify(pre)` ──────────────
// `precalificarAuto()` devuelve TRES cosas: `datos` (lo que se le manda al
// vendor), `supuestos` y `faltan`. Las dos últimas son justo lo que la pantalla
// de plataforma necesita para pintarse; la primera **no puede cruzar el puerto
// jamás**: lleva DNI, teléfono, fecha de nacimiento y el código postal del
// tomador, y `apps/asegura/CLAUDE.md` es explícito — «la dirección del RIESGO sí
// cruza el puerto; la del tomador, no». El CP es parte de esa dirección.
//
// La trampa está en que los supuestos **también llevan el CP**: `precalificarAuto`
// anota `{ campo: 'cpCirculacion', valor: <el CP del tomador> }` para explicar
// que se supone que el coche duerme donde vive el cliente. Publicar la lista tal
// cual sacaría el dato personal por la puerta de atrás, sin que nada fallase y
// sin que se viera en ninguna revisión de tipos.
//
// ─── Y por qué se OCULTA el valor en vez de borrar el supuesto ──────────────
// Borrarlo sería peor que publicarlo: el supuesto «el coche circula donde vive
// el tomador» es letra pequeña del precio, y esconderlo convertiría un «se ha
// supuesto esto» en un silencio. Así que el supuesto viaja ENTERO —campo,
// motivo y su marca de optimista— y lo único que se queda en casa es el valor,
// con `oculto: true` para que la pantalla pueda decir por qué no lo enseña.
// Tres estados otra vez: valor · «no hay» · «lo hay pero no sale de aquí».

/**
 * Campos de `DatosAuto` cuyo VALOR es un dato personal del tomador y no cruza
 * el puerto. Se escriben aquí, en un solo sitio, para que añadir un campo nuevo
 * a la precalificación obligue a decidir a qué lado cae.
 *
 * `cpResidencia` y `cpCirculacion` están los dos: son el mismo código postal
 * escrito dos veces (el segundo se supone del primero), así que tapar solo uno
 * no taparía nada.
 */
export const CAMPOS_PERSONALES: ReadonlySet<string> = new Set<string>([
  'dni',
  'nombre',
  'apellido1',
  'apellido2',
  'fechaNacimiento',
  'telefono',
  'sexo',
  'fechaCarnet',
  'cpResidencia',
  'cpCirculacion',
  'direccion',
  'matricula',
])

/** Un supuesto tal y como sale por el puerto. */
export type SupuestoPublico = {
  campo: string
  /** `null` cuando `oculto` es `true`: el valor existe, pero no sale de asegura. */
  valor: unknown
  porque: string
  optimista: boolean
  /** `true` = hay valor y es un dato personal, así que se queda dentro. */
  oculto?: true
}

type SupuestoInterno = {
  campo: PropertyKey
  valor: unknown
  porque: string
  optimista?: boolean
}

/**
 * Deja los supuestos listos para viajar: los de campos personales pierden el
 * valor y ganan `oculto: true`; el resto salen tal cual.
 *
 * `optimista` se normaliza a booleano SIEMPRE (también cuando es `false`): si
 * se enviara solo al ser `true`, una pantalla vieja no podría distinguir
 * «no es optimista» de «no me han mandado el campo» — el mismo fallo que ya
 * costó pintar «—» sobre primas que existían.
 */
export function sanearSupuestos(supuestos: ReadonlyArray<SupuestoInterno>): SupuestoPublico[] {
  return supuestos.map((s) => {
    const campo = String(s.campo)
    const base = { campo, porque: s.porque, optimista: s.optimista === true }
    return CAMPOS_PERSONALES.has(campo)
      ? { ...base, valor: null, oculto: true as const }
      : { ...base, valor: s.valor }
  })
}

/** Un hueco que impide cotizar, tal y como sale por el puerto. */
export type ReparoPublico = { campo: string; motivo: string }

/**
 * Los reparos llevan el NOMBRE del campo y un motivo fijo escrito por nosotros
 * («hace falta para poder cotizar»), nunca el valor: por eso pasan enteros.
 * Se normaliza `campo` a `string` porque al otro lado del puerto no existe
 * `keyof DatosAuto` y un `PropertyKey` no sobrevive a un JSON.
 */
export function sanearReparos(faltan: ReadonlyArray<{ campo: PropertyKey; motivo: string }>): ReparoPublico[] {
  return faltan.map((f) => ({ campo: String(f.campo), motivo: f.motivo }))
}
