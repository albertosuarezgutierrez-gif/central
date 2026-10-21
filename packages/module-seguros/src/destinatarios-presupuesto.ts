// A QUIÉN se le puede mandar un presupuesto por correo cuando el TOMADOR no tiene (21/10/2026, regla de Alberto).
//
// «Si el tomador no tiene correo, se puede enviar a una persona relacionada SOLO si (a) su relación con el tomador es
// Dueño, Administrador o Representante, o (b) el tomador le autoriza a ver sus pólizas. Nunca otras relaciones. El
// destinatario lo ELIGE Alberto; nada sale solo.»
//
// Cómo se aplica, y por qué:
//   · Con correo del tomador no hay terceros: el presupuesto va al tomador (`tomador`). Si el correo del tomador NO SE
//     PUEDE LEER (`no_se_sabe`), tampoco: «ilegible» no es «no tiene», y escribir a un tercero de quien quizá tiene
//     correo es justo lo que la regla evita (`tomador_no_se_sabe`). Si el tomador se dio de BAJA de correo, tampoco
//     (`tomador_baja`): no se rodea su voluntad escribiendo a su dueño.
//   · (a) Representación: el TIPO tal cual se escribió, normalizado (tildes, mayúsculas, «/a»): `Dueño`,
//     `Administración`/`Administrador/a`, `Representante (legal)`. Nada de `Accionista`, `Socio/a`, `Empleado/a`,
//     `Empresa`, `Contacto - Tomador`… Solo si el tomador es una EMPRESA de forma explícita (`juridica`; un NULL no
//     inventa una empresa): de una persona física nadie es «dueño». La dirección de la fila del volcado no es fiable
//     (mismo aviso que `dueno-empresa.ts` del portal), así que se acepta en los dos sentidos, PERO en el sentido
//     inverso (A = el candidato, B = el tomador) el candidato no puede ser otra empresa explícita: dos jurídicas con
//     un «Dueño» al revés podrían ser la matriz dueña de la filial, y la filial no recibe los presupuestos de la matriz.
//   · (b) Autorización: SOLO la fila A = tomador → B = candidato con `puedeVerPolizas` (A autoriza a B). La inversa
//     (el candidato autoriza al tomador) no da nada. Una fila `Sin vínculo` no autoriza aunque traiga el flag
//     (`permiteAutorizar`). 🚨 En asegura ese flag llega CALCULADO desde `portal_autorizacion` vigente
//     (`cartera-relaciones.ts`), no de la columna muerta.
//   · Elegible por relación pero sin correo, dado de baja o con correo ilegible: NO es elegible, y se dice por qué.
//   · Dos fichas distintas no se funden jamás: se agrupa por `clienteId`.
//
// PURO: lo usan asegura (para VALIDAR en el servidor el destinatario que pide la pantalla) y plataforma (para pintar
// el selector). Cepo: `destinatarios-presupuesto.test.ts`.

import { permiteAutorizar, type RelacionFila } from './relaciones.ts'

export type EstadoCorreoPersona = 'con_email' | 'sin_email' | 'baja_de_correo' | 'no_se_sabe'
export type TipoPersonaFicha = 'fisica' | 'juridica' | null

export type TomadorDestino = { clienteId: string; tipoPersona: TipoPersonaFicha; correo: EstadoCorreoPersona }
/** Lo que se sabe de cada ficha relacionada. Una que no está en la lista (fusionada, de otra correduría) no recibe nada. */
export type PersonaDestino = { clienteId: string; nombre: string | null; tipoPersona: TipoPersonaFicha; correo: EstadoCorreoPersona }

export type ViaDestino = 'representacion' | 'autorizacion'
export type MotivoNoElegible =
  /** Su relación con el tomador no es ninguna de las que habilitan, y el tomador no le autoriza a ver sus pólizas. */
  | 'relacion_no_habilita'
  /** Es Dueño/Administrador/Representante, pero el tomador no consta como empresa. */
  | 'tomador_no_es_empresa'
  | 'sin_email'
  | 'baja_de_correo'
  | 'email_no_se_sabe'

export type ContactoElegible = { clienteId: string; nombre: string | null; relacion: string; via: ViaDestino }
export type ContactoNoElegible = { clienteId: string; nombre: string | null; relacion: string; motivo: MotivoNoElegible }

export type DestinatariosPresupuesto =
  | { estado: 'tomador' }
  | { estado: 'tomador_no_se_sabe' }
  /** El tomador se dio de baja de correo: su voluntad no se rodea escribiendo a su dueño. */
  | { estado: 'tomador_baja' }
  | { estado: 'contactos'; elegibles: ContactoElegible[]; noElegibles: ContactoNoElegible[] }
  | { estado: 'nadie'; noElegibles: ContactoNoElegible[] }

function normalizar(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Las variantes reales del CRM (SELECT DISTINCT del 21/10/2026: `Dueño`, `Administración`) y las que pidió Alberto. */
const TIPOS_REPRESENTACION = new Set([
  'dueno', 'duena', 'dueno/a', 'dueno/duena',
  'administracion', 'administrador', 'administradora', 'administrador/a', 'administrador/administradora',
  'representante', 'representante legal',
])

/** ¿Este tipo de relación es de representación (Dueño, Administrador, Representante)? */
export function esRelacionDeRepresentacion(tipo: string): boolean {
  return TIPOS_REPRESENTACION.has(normalizar(tipo))
}

export const TEXTO_NO_ELEGIBLE: Record<MotivoNoElegible, string> = {
  relacion_no_habilita: 'no es dueño, administrador ni representante, ni tiene permiso para ver sus pólizas',
  tomador_no_es_empresa: 'el tomador no consta como empresa',
  sin_email: 'no tiene correo en su ficha',
  baja_de_correo: 'se dio de baja de correo',
  email_no_se_sabe: 'su correo no se ha podido leer',
}

export function destinatariosPresupuesto(
  tomador: TomadorDestino,
  relaciones: readonly RelacionFila[],
  personas: readonly PersonaDestino[],
): DestinatariosPresupuesto {
  if (tomador.correo === 'con_email') return { estado: 'tomador' }
  if (tomador.correo === 'no_se_sabe') return { estado: 'tomador_no_se_sabe' }
  if (tomador.correo === 'baja_de_correo') return { estado: 'tomador_baja' }

  const porId = new Map(personas.map((p) => [p.clienteId, p]))
  // Por FICHA: la mejor razón que tenga (representación > autorización) y, si no tiene ninguna, sus tipos.
  const grupo = new Map<string, { via: ViaDestino | null; relacion: string | null; tipos: string[]; soloFaltaEmpresa: boolean }>()
  for (const f of relaciones) {
    if (f.clienteAId === f.clienteBId) continue
    const ida = f.clienteAId === tomador.clienteId
    if (!ida && f.clienteBId !== tomador.clienteId) continue
    const otro = ida ? f.clienteBId : f.clienteAId
    const persona = porId.get(otro)
    if (!persona) continue // ficha que no se pudo leer como viva de esta correduría: nada.
    const g = grupo.get(otro) ?? { via: null, relacion: null, tipos: [], soloFaltaEmpresa: false }
    grupo.set(otro, g)
    if (!g.tipos.includes(f.tipo)) g.tipos.push(f.tipo)

    if (esRelacionDeRepresentacion(f.tipo)) {
      const sentidoOk = ida || persona.tipoPersona !== 'juridica'
      if (tomador.tipoPersona === 'juridica' && sentidoOk) {
        g.via = 'representacion'
        g.relacion = f.tipo
        continue
      }
      if (tomador.tipoPersona !== 'juridica') g.soloFaltaEmpresa = true
    }
    // (b) Solo A = tomador autoriza a B = este candidato.
    if (ida && f.puedeVerPolizas && permiteAutorizar(f.tipo) && g.via === null) {
      g.via = 'autorizacion'
      g.relacion = f.tipo
    }
  }

  const elegibles: ContactoElegible[] = []
  const noElegibles: ContactoNoElegible[] = []
  for (const [clienteId, g] of grupo) {
    const p = porId.get(clienteId)!
    const relacion = g.relacion ?? g.tipos.join(', ')
    if (g.via === null) {
      noElegibles.push({ clienteId, nombre: p.nombre, relacion, motivo: g.soloFaltaEmpresa ? 'tomador_no_es_empresa' : 'relacion_no_habilita' })
      continue
    }
    if (p.correo !== 'con_email') {
      noElegibles.push({ clienteId, nombre: p.nombre, relacion, motivo: p.correo === 'no_se_sabe' ? 'email_no_se_sabe' : p.correo })
      continue
    }
    elegibles.push({ clienteId, nombre: p.nombre, relacion, via: g.via })
  }
  return elegibles.length > 0 ? { estado: 'contactos', elegibles, noElegibles } : { estado: 'nadie', noElegibles }
}

/** ¿Puede recibir el presupuesto ESTE `clienteId`? La guarda del servidor: el que pide la pantalla no se cree. */
export function destinatarioElegible(d: DestinatariosPresupuesto, clienteId: string): ContactoElegible | null {
  return d.estado === 'contactos' ? d.elegibles.find((e) => e.clienteId === clienteId) ?? null : null
}
