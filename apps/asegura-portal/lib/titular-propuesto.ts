// ¿De quién es la póliza que acaba de subir el cliente? — decisión PURA (22/10/2026).
//
// 🚨 Por qué existe. Hasta hoy, si la casilla «es de una empresa» no se marcaba, se guardaba
// `titular_tipo='propio'`. Eso es un «no se sabe» guardado como AFIRMACIÓN, y no es inocuo:
// `TITULAR_TIPO_VISIBLE_A_TERCERO = 'propio'` (`lib/declaradas-de-titular.ts`) decide qué
// declaradas ve un tercero autorizado — una póliza de empresa subida sin marcar la casilla
// quedaba a la vista de quien la persona autorizó a mirar SUS seguros personales.
//
// Reglas:
//   1. Pregunta EXPLÍCITA de tres opciones: «Es mía» → 'propio' · «Es de una empresa que gestiono» →
//      'empresa' · «No lo sé» (o sin contestar) → `null` («no consta»). Nunca se guarda 'propio' por
//      omisión: sin contestar no se afirma nada. Sin 'propio' explícito la declarada personal no la ve
//      un autorizado con «Total» (`TITULAR_TIPO_VISIBLE_A_TERCERO`) ni se coteja (`fichaParaCotejar`).
//   2. Si el documento trae como tomador una EMPRESA y la persona no ha dicho ya de quién es, se le
//      PROPONE la pregunta («Esta póliza está a nombre de X. ¿Es de tu empresa?»). Proponer no es
//      guardar: sin respuesta, la columna sigue a NULL.
//   3. Un tomador persona física con un NIF que no sabemos comparar NO se propone: el portal no lee
//      el DNI de la ficha de nadie (ni su hash), así que «distinto del tuyo» sería una suposición.
//      El NIF de una persona física se usa SOLO para clasificar (persona/empresa) y no se guarda.
//   4. Decir «sí, es de mi empresa» es una DECLARACIÓN: no da acceso a la ficha de esa empresa ni
//      la casa con una existente (eso lo decide el corredor; ver `titular-declarado.ts`).

import { cifDeEmpresa, esTomadorEmpresa } from '@central/module-seguros'
import { normalizarTitular } from '@central/module-seguros-portal'

/** Lo que el cliente puede decir que es en la empresa. Vocabulario cerrado (CHECK en la BD). */
export const ROLES_EN_EMPRESA = ['propietario', 'administrador', 'empleado', 'otro'] as const
export type RolEnEmpresa = (typeof ROLES_EN_EMPRESA)[number]

export const ETIQUETA_ROL: Record<RolEnEmpresa, string> = {
  propietario: 'Propietario o socio',
  administrador: 'Administrador',
  empleado: 'Empleado',
  otro: 'Otra cosa',
}

export function esRolEnEmpresa(v: unknown): v is RolEnEmpresa {
  return typeof v === 'string' && (ROLES_EN_EMPRESA as readonly string[]).includes(v)
}

/**
 * Lo que se lee del TOMADOR en el documento, ya minimizado:
 *   `null`                                   = no se ha leído tomador (fallo o el papel no lo trae).
 *   `{ tipo: 'persona' }`                    = es una persona física. Ni su nombre ni su DNI viajan.
 *   `{ tipo: 'empresa', nombre, cif }`       = una empresa; `cif` solo si pasa el dígito de control.
 */
export type TomadorLeido = { tipo: 'persona' } | { tipo: 'empresa'; nombre: string; cif: string | null }

function texto(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim()
  return t === '' ? null : t
}

/**
 * Del JSON de la IA al `TomadorLeido`. Misma regla que la vía del corredor
 * (`esTomadorEmpresa`/`cifDeEmpresa` de `@central/module-seguros`): lo dice el lector, o hay CIF →
 * empresa; un DNI/NIE válido de persona física → persona, diga lo que diga el nombre.
 */
export function normalizarTomadorLeido(bruto: unknown): TomadorLeido | null {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return null
  const o = bruto as Record<string, unknown>
  const nombre = texto(o.tomador)
  if (nombre === null || nombre.length > 200) return null
  const tomadorEsEmpresa = typeof o.tomadorEsEmpresa === 'boolean' ? o.tomadorEsEmpresa : null
  const empresa = esTomadorEmpresa({ tomador: nombre, dni: o.dni, cifTomador: o.cifTomador, tomadorEsEmpresa })
  if (!empresa) return { tipo: 'persona' }
  return { tipo: 'empresa', nombre, cif: cifDeEmpresa(o.cifTomador) ?? cifDeEmpresa(o.dni) }
}

/** Las tres respuestas de la pregunta «¿De quién es esta póliza?». */
export type RespuestaTitular = 'propio' | 'empresa' | 'no_se'

/**
 * Lo que viaja en el alta según la respuesta. `no_se` o sin contestar (`null`) → `null` = NO se manda
 * `titularTipo` y la fila nace con `titular_tipo` NULL («no consta»). 'propio' solo si lo dijo.
 */
export function titularDeLaRespuesta(r: RespuestaTitular | null): 'propio' | 'empresa' | null {
  return r === 'propio' || r === 'empresa' ? r : null
}

/**
 * Preselección tras leer el documento. Solo una EMPRESA leída (por CIF o por el lector) preselecciona
 * «empresa». Una persona física NO preselecciona «Es mía»: el portal no lee el DNI de la ficha de nadie
 * (ni su hash), así que «el DNI del tomador es el de quien sube» sería una suposición. Sin tomador →
 * sin preselección: el cliente elige.
 */
export function preseleccionTitular(tomador: TomadorLeido | null): RespuestaTitular | null {
  return tomador !== null && tomador.tipo === 'empresa' ? 'empresa' : null
}

export type PropuestaTitular =
  | { tipo: 'preguntar_empresa'; nombre: string; cif: string | null }
  | { tipo: 'nada'; motivo: 'ya_contestado' | 'sin_tomador' | 'persona' }

/**
 * ¿Hay que preguntarle tras subir? Solo si NO lo ha dicho ya (`titularGuardado` null) y el
 * documento trae una empresa como tomador.
 */
export function proponerTitular(e: { titularGuardado: string | null; tomador: TomadorLeido | null }): PropuestaTitular {
  if (e.titularGuardado !== null) return { tipo: 'nada', motivo: 'ya_contestado' }
  if (e.tomador === null) return { tipo: 'nada', motivo: 'sin_tomador' }
  if (e.tomador.tipo === 'persona') return { tipo: 'nada', motivo: 'persona' }
  return { tipo: 'preguntar_empresa', nombre: e.tomador.nombre, cif: e.tomador.cif }
}

export type LecturaTitularParche =
  | { tipo: 'ausente' }
  | { tipo: 'error'; error: 'titular_invalido' | 'titular_con_cambios' }
  /** `{ titularTipo: 'propio' }` = «es mía». */
  | { tipo: 'propio' }
  /** `{ titularTipo: null }` = «no lo sé»: vuelve a NULL («no consta»). */
  | { tipo: 'ninguno' }
  | {
      tipo: 'empresa'
      nombre: string
      /** Solo si pasa el dígito de control: un CIF mal leído no se guarda como identidad. */
      cif: string | null
      rol: RolEnEmpresa | null
    }

/**
 * El cuerpo del PATCH de titular, SIEMPRE solo (como `vigenteDeclarada`): no es una revisión de los
 * datos de la póliza.
 *   `{ titularEmpresa: { nombre, cif?, rol? } }` = «sí, es de mi empresa».
 *   `{ titularTipo: 'propio' }`                  = «es mía».
 *   `{ titularTipo: null }`                      = «no lo sé» (vuelve a NULL).
 */
export function leerTitularParche(cuerpo: unknown): LecturaTitularParche {
  if (cuerpo === null || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) return { tipo: 'ausente' }
  const bruto = cuerpo as Record<string, unknown>
  const hayEmpresa = 'titularEmpresa' in bruto && bruto.titularEmpresa !== undefined
  const hayTipo = 'titularTipo' in bruto && bruto.titularTipo !== undefined
  if (!hayEmpresa && !hayTipo) return { tipo: 'ausente' }
  const propias = hayEmpresa ? 'titularEmpresa' : 'titularTipo'
  const otros = Object.keys(bruto).filter((k) => k !== propias && bruto[k] !== undefined)
  if (otros.length > 0) return { tipo: 'error', error: 'titular_con_cambios' }

  if (!hayEmpresa) {
    if (bruto.titularTipo === 'propio') return { tipo: 'propio' }
    if (bruto.titularTipo === null) return { tipo: 'ninguno' }
    // 'empresa' va por `titularEmpresa` (lleva nombre): aquí no se admite.
    return { tipo: 'error', error: 'titular_invalido' }
  }

  const t = bruto.titularEmpresa
  if (!t || typeof t !== 'object' || Array.isArray(t)) return { tipo: 'error', error: 'titular_invalido' }
  const o = t as Record<string, unknown>
  const rolBruto = o.rol === undefined ? null : o.rol
  if (rolBruto !== null && !esRolEnEmpresa(rolBruto)) return { tipo: 'error', error: 'titular_invalido' }
  const n = normalizarTitular({ tipo: 'empresa', nombre: o.nombre, cif: o.cif })
  if (n.tipo !== 'empresa' || n.nombre === null) return { tipo: 'error', error: 'titular_invalido' }
  return { tipo: 'empresa', nombre: n.nombre, cif: n.cifValido ? n.cif : null, rol: rolBruto }
}
