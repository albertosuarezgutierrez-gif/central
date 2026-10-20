// Municipio elegido en el cotizador cuando VARIOS comparten el código postal → la OPORTUNIDAD (20/10/2026). PURO.
//
// Se guarda en el riesgo (`info_riesgo.datosVehiculo`: `municipioCirculacionId`, `municipioCirculacion` y el ancla
// `municipioCirculacionCp`), por el mismo PATCH que la cilindrada (`llamarDatosRiesgo`). NUNCA en la ficha: `clientes.ciudad`
// no se pisa. Al reabrir se precarga, y sigue viajando como `poblacion` al bot (`tarificador-moto-formulario.ts`).
//
// El ancla es el CP del que salió la lista (el de la ficha, `cpMunicipios`). Si el CP del riesgo cambia —la ficha tiene
// otro CP, o el riesgo declara un `cpCirculacion` distinto—, el municipio guardado NO se aplica: se vuelve a elegir.
// Con un solo municipio no se guarda nada (viene puesto solo).

type Opcion = { id: string; nombre: string }

export type MunicipioRiesgoGuardado = {
  municipioCirculacionId: number | null
  municipioCirculacion: string | null
  municipioCirculacionCp?: string | null
  cpCirculacion: string | null
}

export type DatosMunicipioAGuardar = { municipioCirculacionId: number; municipioCirculacion: string; municipioCirculacionCp: string }

const CP = /^\d{5}$/
const MAX_MUNICIPIO = 80 // tope de `municipioCirculacion` en `validarDatosVehiculoRiesgo`
const CAJON = new Set(['otro', 'otros', 'n/a', 'na', 'desconocido', 'no consta', 'sin especificar', '-'])

function cpValido(cp: string | null | undefined): string | null {
  const t = (cp ?? '').trim()
  return CP.test(t) ? t : null
}

/** ¿El CP del riesgo es el de la lista? Sin CP de la lista, no se sabe: no. Un `cpCirculacion` distinto del riesgo, no. */
function cpCasa(cpLista: string | null, cpCirculacionRiesgo: string | null | undefined): cpLista is string {
  if (cpLista === null) return false
  const cpRiesgo = cpValido(cpCirculacionRiesgo)
  return cpRiesgo === null || cpRiesgo === cpLista
}

/** Id (texto, como el `<select>`) del municipio guardado en el riesgo, solo si sigue aplicando. `null` = no se precarga. */
export function municipioPrecargado(e: {
  guardado: MunicipioRiesgoGuardado | null | undefined
  municipios: readonly Opcion[] | null | undefined
  /** CP de la ficha del que sale `municipios`. `null` = no se sabe. */
  cpMunicipios: string | null | undefined
}): string | null {
  const lista = e.municipios ?? []
  if (lista.length < 2 || !e.guardado) return null
  const cpLista = cpValido(e.cpMunicipios)
  if (!cpCasa(cpLista, e.guardado.cpCirculacion)) return null
  if (cpValido(e.guardado.municipioCirculacionCp) !== cpLista) return null
  const id = e.guardado.municipioCirculacionId
  if (id === null || !Number.isInteger(id) || id <= 0) return null
  const op = lista.find((m) => m.id === String(id))
  return op ? op.id : null
}

/** Qué se guarda en el riesgo al elegir municipio, o `null` (nada que recordar, sin oportunidad, CP que no casa, ya guardado). */
export function municipioAGuardar(e: {
  oportunidadId: string | null | undefined
  elegidoId: string | null | undefined
  municipios: readonly Opcion[] | null | undefined
  cpMunicipios: string | null | undefined
  /** `cpCirculacion` del riesgo: si declara otro CP, la lista (del CP de la ficha) no es la suya. */
  cpCirculacionRiesgo: string | null | undefined
  /** Lo ya guardado (riesgo al abrir o último guardado de esta pantalla), para no repetir. */
  guardado?: MunicipioRiesgoGuardado | null
}): DatosMunicipioAGuardar | null {
  if (!e.oportunidadId) return null
  const lista = e.municipios ?? []
  if (lista.length < 2) return null
  const cpLista = cpValido(e.cpMunicipios)
  if (!cpCasa(cpLista, e.cpCirculacionRiesgo)) return null
  const op = lista.find((m) => m.id === (e.elegidoId ?? '').trim())
  if (!op || !/^\d+$/.test(op.id)) return null
  const id = Number(op.id)
  const nombre = op.nombre.replace(/\s+/g, ' ').trim()
  if (!Number.isSafeInteger(id) || id <= 0 || nombre === '' || nombre.length > MAX_MUNICIPIO || CAJON.has(nombre.toLowerCase())) return null
  const g = e.guardado
  if (g && g.municipioCirculacionId === id && cpValido(g.municipioCirculacionCp) === cpLista) return null
  return { municipioCirculacionId: id, municipioCirculacion: nombre, municipioCirculacionCp: cpLista }
}

/**
 * `poblacion` que viaja al bot (Allianz Moto elige la localidad por ella), o `null` (20/10/2026). Solo con 2 o más municipios
 * en el CP y si el CP del que salió la lista casa con el del riesgo (misma regla que `municipioAGuardar`). En otro caso NO viaja
 * y el servidor sigue con `poblacionDesdeFicha` (p. ej. la pedanía exacta de la ficha).
 */
export function poblacionParaBot(e: {
  elegidoId: string | null | undefined
  municipios: readonly Opcion[] | null | undefined
  cpMunicipios: string | null | undefined
  cpCirculacionRiesgo: string | null | undefined
}): string | null {
  const lista = e.municipios ?? []
  if (lista.length < 2) return null
  if (!cpCasa(cpValido(e.cpMunicipios), e.cpCirculacionRiesgo)) return null
  const op = lista.find((m) => m.id === (e.elegidoId ?? '').trim())
  const nombre = op?.nombre.replace(/\s+/g, ' ').trim() ?? ''
  return nombre === '' ? null : nombre
}
