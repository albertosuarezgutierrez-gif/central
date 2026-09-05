// Dar de alta a la PERSONA DE CONTACTO de una ficha —el administrador de una
// sociedad, quien lleva de verdad sus seguros— sin salir de ella: se crea su
// ficha y se vincula, en dos escrituras encadenadas.
//
// Por qué una FICHA y no un campo «persona de contacto» dentro de la sociedad
// (Alberto, 05/09/2026): esa persona es un FUTURO CLIENTE. El estado se DERIVA
// de sus pólizas (`estadoCliente`), así que la ficha nace 🕐 Lead sola y pasa a
// ✅ Cliente el día que CIMA confirme su primera póliza — sin migrar nada y sin
// tocar `tipo` / `lead_estado`, columnas heredadas del CRM de Manuel que esta
// pantalla no usa y que escribirlas crearía una segunda verdad sobre la misma
// persona. Un campo de texto dentro de la sociedad no puede hacer nada de eso:
// el día que le vendas hay que crearla de cero y se pierde el histórico.
//
// 🚨 Y son DOS escrituras, así que la segunda puede fallar sola. Ese estado
// intermedio —ficha creada, vínculo no— es REAL y no se puede pintar como un
// fallo del alta: la persona YA existe en la cartera y repetir el alta la
// duplicaría. Es la misma familia que la regla global «dato que no hay ≠ dato
// que no se ha mirado»: aquí el «no se ha podido vincular» tiene que decirse
// entero, con el id en la mano, para poder reintentar SOLO el vínculo.

import { TIPOS_RELACION, type TipoRelacion } from './relaciones.ts'

/**
 * Los vínculos que se ofrecen primero según lo que sea la ficha de la que
 * cuelga el contacto. En una SOCIEDAD la persona de contacto es su
 * administrador o un empleado; en una persona física, familia.
 *
 * `null` (no se sabe si es física o jurídica) devuelve la lista entera sin
 * reordenar: adivinarlo por el nombre es justo lo que la regla de identidad
 * prohíbe.
 */
export function tiposContactoSugeridos(tipoPersona: 'fisica' | 'juridica' | null | undefined): readonly TipoRelacion[] {
  if (tipoPersona !== 'juridica') return TIPOS_RELACION
  const primero: readonly TipoRelacion[] = ['Administración', 'Empleado/a', 'Socio/a', 'Accionista', 'Dueño']
  return [...primero, ...TIPOS_RELACION.filter((t) => !primero.includes(t))]
}

/** Lo mínimo que hace falta saber de cada escritura para contar qué ha pasado. */
export type PasoEscritura = { ok: true; id?: string | null } | { ok: false }

export type ResultadoPersonaContacto =
  /** Ficha creada Y vinculada. Todavía NO ve nada: la autorización es otro acto. */
  | { estado: 'creada_y_vinculada'; id: string }
  /** La ficha existe y el vínculo no. Reintentable SIN volver a dar de alta. */
  | { estado: 'creada_sin_vinculo'; id: string }
  /** El alta dice que sí pero no manda id: no se puede vincular ni reintentar a ciegas. */
  | { estado: 'creada_sin_id' }
  /** El alta no llegó a crear nada. El porqué lo cuenta el resultado del alta. */
  | { estado: 'no_creada' }

/**
 * Qué ha pasado de verdad tras las dos escrituras.
 *
 * `vinculo === null` = todavía no se ha intentado (el alta falló, o falta el
 * id). No es «falló el vínculo»: son cosas distintas y mandan a hacer cosas
 * distintas —volver a intentar el alta corregida, o reintentar solo el vínculo.
 */
export function combinarPersonaContacto(alta: PasoEscritura, vinculo: PasoEscritura | null): ResultadoPersonaContacto {
  if (!alta.ok) return { estado: 'no_creada' }
  const id = typeof alta.id === 'string' && alta.id.trim() !== '' ? alta.id.trim() : null
  if (id === null) return { estado: 'creada_sin_id' }
  if (vinculo === null || !vinculo.ok) return { estado: 'creada_sin_vinculo', id }
  return { estado: 'creada_y_vinculada', id }
}

/**
 * Qué se le dice a Alberto en cada caso. Se queda aquí —y no en el JSX— porque
 * la frase de `creada_sin_vinculo` es la que evita el duplicado: si esa dice
 * «no se ha podido crear», el siguiente clic crea una segunda ficha.
 */
export function textoPersonaContacto(r: ResultadoPersonaContacto, nombre: string, nombreFicha: string): string {
  switch (r.estado) {
    case 'creada_y_vinculada':
      return `✅ ${nombre} ya está en la cartera y vinculada a ${nombreFicha}. Todavía NO ve nada: el acceso al portal se le da aparte, con «Autorizar» en su fila.`
    case 'creada_sin_vinculo':
      return `⚠️ ${nombre} SÍ se ha creado en la cartera, pero no se ha podido vincular a ${nombreFicha}. No la vuelvas a dar de alta (se duplicaría): reintenta solo el vínculo.`
    case 'creada_sin_id':
      return `⚠️ asegura dice que ha creado a ${nombre} pero no manda su id, así que no se ha podido vincular. Búscala por su nombre antes de volver a darla de alta: puede existir ya.`
    case 'no_creada':
      return `✖ No se ha creado nada.`
  }
}

/** La fuente que se anota: llega por la empresa de la que es contacto. */
export const FUENTE_PERSONA_CONTACTO = 'recomendacion' as const
