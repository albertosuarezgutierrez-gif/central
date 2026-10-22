// ¿De quién es la póliza que acaba de subir el cliente? — decisión PURA (22/10/2026).
//
// 🚨 Por qué existe. Hasta hoy, si la casilla «es de una empresa» no se marcaba, se guardaba
// `titular_tipo='propio'`. Eso es un «no se sabe» guardado como AFIRMACIÓN, y no es inocuo:
// `TITULAR_TIPO_VISIBLE_A_TERCERO = 'propio'` (`lib/declaradas-de-titular.ts`) decide qué
// declaradas ve un tercero autorizado — una póliza de empresa subida sin marcar la casilla
// quedaba a la vista de quien la persona autorizó a mirar SUS seguros personales.
//
// Reglas:
//   1. La casilla sin marcar NO dice nada → `null` (la columna vacía, «no consta»). Solo la
//      casilla marcada (o la respuesta explícita del paso posterior) escribe algo.
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

/**
 * Lo que viaja en el alta con documento según la casilla. Sin marcar → `null` = NO se manda
 * `titularTipo` y la fila nace con `titular_tipo` NULL («no consta»). Nunca `'propio'` por defecto.
 */
export function titularDeLaCasilla(esDeEmpresa: boolean): 'empresa' | null {
  return esDeEmpresa ? 'empresa' : null
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
  | {
      tipo: 'empresa'
      nombre: string
      /** Solo si pasa el dígito de control: un CIF mal leído no se guarda como identidad. */
      cif: string | null
      rol: RolEnEmpresa | null
    }

/**
 * El cuerpo del PATCH `{ titularEmpresa: { nombre, cif?, rol? } }` = «sí, es de mi empresa».
 * Va SOLO (como `vigenteDeclarada`): no es una revisión de los datos de la póliza. «No» no se
 * manda — no escribe nada, la columna sigue a NULL.
 */
export function leerTitularParche(cuerpo: unknown): LecturaTitularParche {
  if (cuerpo === null || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) return { tipo: 'ausente' }
  const bruto = cuerpo as Record<string, unknown>
  if (!('titularEmpresa' in bruto) || bruto.titularEmpresa === undefined) return { tipo: 'ausente' }
  const otros = Object.keys(bruto).filter((k) => k !== 'titularEmpresa' && bruto[k] !== undefined)
  if (otros.length > 0) return { tipo: 'error', error: 'titular_con_cambios' }

  const t = bruto.titularEmpresa
  if (!t || typeof t !== 'object' || Array.isArray(t)) return { tipo: 'error', error: 'titular_invalido' }
  const o = t as Record<string, unknown>
  const rolBruto = o.rol === undefined ? null : o.rol
  if (rolBruto !== null && !esRolEnEmpresa(rolBruto)) return { tipo: 'error', error: 'titular_invalido' }
  const n = normalizarTitular({ tipo: 'empresa', nombre: o.nombre, cif: o.cif })
  if (n.tipo !== 'empresa' || n.nombre === null) return { tipo: 'error', error: 'titular_invalido' }
  return { tipo: 'empresa', nombre: n.nombre, cif: n.cifValido ? n.cif : null, rol: rolBruto }
}
