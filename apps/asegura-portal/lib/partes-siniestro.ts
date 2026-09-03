// Los PARTES de siniestro que abre el cliente desde el portal: lectura de los
// suyos y alta de uno nuevo.
//
// 🔒 Aislamiento por CÓDIGO: no hay RLS que rescate un olvido (el rol
// `prisma_asegura_portal` es NOBYPASSRLS pero `portal_parte_siniestro` no tiene
// políticas para él). TODA consulta de este fichero filtra por `identidadId`, y
// ese id sale SIEMPRE de la cookie por `lib/session` — jamás del cuerpo de la
// petición. Las funciones `…DeIdentidad` lo reciben ya resuelto por quien pasó
// por la puerta; `partesDeSesion()` la abre aquí. Lo vigila
// `test/regression-portal-aislamiento.test.ts`.
//
// 🚨 Y la regla que sostiene el fichero entero, que vive en el módulo puro
// (`@central/module-seguros-portal/parte-siniestro`): **un parte enviado NO es
// un siniestro comunicado a la compañía.** La correduría media por el CLIENTE:
// entre que él pulsa «enviar» y que Alberto abre el siniestro en la entidad hay
// horas o días, y en ese hueco el cliente cree que ya está hecho. Por eso
// `comunicado` NO se deriva aquí de un `estado !== 'enviado'` —`recibido` es
// «lo hemos leído nosotros», que es justo el estado que se confunde— sino de
// `comunicadoACompania()`, que es la única fuente de esa frase. Si alguien
// sustituye esa llamada por una comparación a mano, el portal empieza a decirle
// a la gente que su compañía ya lo sabe cuando no lo sabe.
//
// El portal solo INSERTA y LEE: aquí no hay `update` ni `delete` sobre
// `portalParteSiniestro`, y no es un olvido — lo declarado es una comunicación,
// no un borrador, y el rol de BD tampoco tiene esos GRANT. Los sellos de estado
// (`recibido_at`, `abierto_en_compania_at`) los pone el corredor desde su app.
import { comunicadoACompania, type ParteEstado, type ParteNormalizado } from '@central/module-seguros-portal'

import { prisma } from './db'
import { getIdentidad } from './session'

/** Cuántos partes se traen a la bóveda. Regla de rendimiento UI de la casa. */
const MAX_PARTES = 50

export type PartePortal = {
  id: string
  descripcion: string
  fechaHecho: Date
  /** `null` = no sabía la hora. No se inventa un 00:00. */
  horaAproximada: string | null
  lugar: string | null
  /**
   * 🚨 Tri-estado, y el `null` es el que importa: «no lo ha contestado» NO es
   * «no hubo heridos». Colapsarlo a `false` le pinta a Alberto un «sin heridos»
   * de un accidente sobre el que nadie preguntó, y un parte con heridos se
   * tramita en horas. La misma regla del NULL de la raíz, en el peor sitio.
   */
  hayHeridos: boolean | null
  hayTerceros: boolean | null
  estado: ParteEstado
  /**
   * Sale de `comunicadoACompania(estado)` del módulo puro, NUNCA de un
   * `estado !== 'enviado'`: solo `abierto_en_compania` significa que la entidad
   * lo sabe, y ese estado lo pone Alberto cuando el siniestro existe de verdad.
   */
  comunicado: boolean
  /** Póliza de la CARTERA. Excluyente con `polizaDeclaradaId` (lo garantiza `normalizarParte`). */
  polizaId: string | null
  /** Póliza que el propio cliente aportó al portal. */
  polizaDeclaradaId: string | null
  creadoEn: Date
}

/**
 * `YYYY-MM-DD` (ya validado por `normalizarParte`) → medianoche UTC.
 *
 * Vive aquí y se exporta para que la ruta cuente el plazo del art. 16 LCS sobre
 * EXACTAMENTE la misma fecha que se guarda. Dos conversiones distintas del
 * mismo texto es como se acaba enseñando un plazo de un día que no coincide con
 * el de la ficha, sin que nada falle.
 */
export function fechaHechoAUtc(fecha: string): Date {
  return new Date(`${fecha}T00:00:00Z`)
}

/**
 * Los partes de ESTA identidad, del más reciente al más antiguo.
 *
 * El `where` por `identidadId` es la única frontera entre una bóveda y otra:
 * sin él la consulta responde 200 con los partes de todo el mundo y nada falla.
 */
export async function partesDeIdentidad(identidadId: string): Promise<PartePortal[]> {
  const filas = await prisma.portalParteSiniestro.findMany({
    where: { identidadId },
    select: {
      id: true,
      descripcion: true,
      fechaHecho: true,
      horaAproximada: true,
      lugar: true,
      hayHeridos: true,
      hayTerceros: true,
      estado: true,
      polizaId: true,
      polizaDeclaradaId: true,
      creadoEn: true,
      // Ni `motivoDescarte` ni los sellos de gestión: son notas del corredor,
      // no dato del cliente (regla de visibilidad del portal, 03/09/2026).
    },
    orderBy: { creadoEn: 'desc' },
    take: MAX_PARTES,
  })

  return filas.map((f) => ({
    ...f,
    comunicado: comunicadoACompania(f.estado),
  }))
}

/** Igual que `partesDeIdentidad`, abriendo la puerta aquí. `null` = no hay sesión. */
export async function partesDeSesion(): Promise<PartePortal[] | null> {
  const identidad = await getIdentidad()
  if (!identidad) return null
  return partesDeIdentidad(identidad.id)
}

/**
 * Alta del parte. `valor` viene YA normalizado por `normalizarParte()` del
 * módulo puro: aquí no se vuelve a validar nada ni se rellena ningún hueco.
 *
 * 🚨 `hayHeridos`/`hayTerceros` se escriben tal cual llegan, `null` incluido.
 * Ningún `?? false` — ver `PartePortal`.
 *
 * La PERTENENCIA de la póliza (que sea de esta identidad) NO se comprueba aquí:
 * la hace quien llama, antes, porque necesita leer la cartera. Este fichero
 * confía en su llamador para eso y en nada más: el `identidadId` que escribe es
 * el que le dan, y es el que sale de la cookie.
 *
 * Sin `try/catch`: un fallo de BD tiene que subir como error. Devolver un id
 * falso o un `{ ok: true }` dejaría al cliente creyendo que ha declarado un
 * siniestro que no existe en ninguna parte.
 */
export async function crearParte(identidadId: string, valor: ParteNormalizado): Promise<{ id: string }> {
  const parte = await prisma.portalParteSiniestro.create({
    data: {
      identidadId,
      polizaId: valor.polizaId,
      polizaDeclaradaId: valor.polizaDeclaradaId,
      descripcion: valor.descripcion,
      fechaHecho: fechaHechoAUtc(valor.fechaHecho),
      horaAproximada: valor.horaAproximada,
      lugar: valor.lugar,
      hayHeridos: valor.hayHeridos,
      hayTerceros: valor.hayTerceros,
      // `enviado` es el default de la BD y se deja explícito: nace SIN estar
      // comunicado a la compañía, y ningún camino del portal lo asciende.
      estado: 'enviado',
    },
    select: { id: true },
  })

  return parte
}
