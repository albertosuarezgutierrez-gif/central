// MEMORIA de elecciones del tarificador (13/10/2026) — con BD. Tabla `seguros.tarificador_elecciones`
// (SQL `prisma/sql/2026-10-13_tarificador_elecciones.sql`). Las reglas (clave, validación contra la lista, la persona gana
// a la IA) son PURAS y viven en `@central/module-tarificacion` (`eleccion-memoria.ts`) y `tarificador-eleccion-reglas.ts`.
//
// 🔒 Sin datos personales: la clave solo lleva marca, modelo, clase, cilindrada y descripción del VEHÍCULO.
// 🛡️ Todo por `correduria_id`.
// Fail-soft: sin la tabla (SQL sin aplicar) o con la BD caída, leer devuelve `null` («no se sabe» → se pregunta a la IA,
// como antes) y escribir no hace nada. Nunca rompe la bandeja ni el registro del resultado.

import { fusionarMemoria, type EntradaMemoria, type OrigenMemoria } from '@central/module-tarificacion'
import { prisma } from './tenant'
import type { ClaveMemoria } from './tarificador-eleccion-reglas'

const TIPO_VERSION = 'version'

const corto = (e: unknown) => (e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200))

/** Lo recordado para la clave, o `null` (no hay, o no se pudo leer). */
export async function leerMemoriaVersion(k: ClaveMemoria): Promise<EntradaMemoria | null> {
  try {
    const filas = await prisma.$queryRaw<EntradaMemoria[]>`
      select m.codigo, m.etiqueta, m.origen, m.confirmaciones
      from seguros.tarificador_elecciones m
      where m.correduria_id = ${k.correduriaId}::uuid and m.compania = ${k.compania} and m.ramo = ${k.ramo}
        and m.tipo = ${TIPO_VERSION} and m.clave_normalizada = ${k.clave}`
    return filas[0] ?? null
  } catch (e) {
    console.warn('[tarificador] memoria de elecciones: no se pudo leer', corto(e))
    return null
  }
}

/** Borra la entrada SOLO si sigue apuntando a `codigo` (una elección más nueva no se toca). */
export async function invalidarMemoriaVersion(k: ClaveMemoria, codigo: string): Promise<void> {
  try {
    await prisma.$executeRaw`
      delete from seguros.tarificador_elecciones
      where correduria_id = ${k.correduriaId}::uuid and compania = ${k.compania} and ramo = ${k.ramo}
        and tipo = ${TIPO_VERSION} and clave_normalizada = ${k.clave} and codigo = ${codigo}`
  } catch (e) {
    console.warn('[tarificador] memoria de elecciones: no se pudo invalidar', corto(e))
  }
}

/**
 * Guarda/refuerza una elección CONFIRMADA (persona en la bandeja, o IA/memoria tras un `ok`). La decisión es la pura
 * `fusionarMemoria` (la persona gana a la IA), bajo `for update` de la fila. Mejor esfuerzo: nunca lanza.
 */
export async function guardarMemoriaVersion(k: ClaveMemoria, e: { codigo: string; etiqueta: string; origen: OrigenMemoria }): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      const filas = await tx.$queryRaw<(EntradaMemoria & { id: string })[]>`
        select m.id::text as id, m.codigo, m.etiqueta, m.origen, m.confirmaciones
        from seguros.tarificador_elecciones m
        where m.correduria_id = ${k.correduriaId}::uuid and m.compania = ${k.compania} and m.ramo = ${k.ramo}
          and m.tipo = ${TIPO_VERSION} and m.clave_normalizada = ${k.clave}
        for update`
      const actual = filas[0] ?? null
      const nueva = fusionarMemoria(actual, e)
      if (!nueva) return
      if (!actual) {
        // Carrera con otro alta de la misma clave: gana la primera (on conflict do nothing).
        await tx.$executeRaw`
          insert into seguros.tarificador_elecciones
            (correduria_id, compania, ramo, tipo, clave_normalizada, codigo, etiqueta, origen, confirmaciones, ultima_vez)
          values (${k.correduriaId}::uuid, ${k.compania}, ${k.ramo}, ${TIPO_VERSION}, ${k.clave}, ${nueva.codigo},
                  ${nueva.etiqueta.slice(0, 200)}, ${nueva.origen}, ${nueva.confirmaciones}::int, now())
          on conflict (correduria_id, compania, ramo, tipo, clave_normalizada) do nothing`
        return
      }
      await tx.$executeRaw`
        update seguros.tarificador_elecciones
        set codigo = ${nueva.codigo}, etiqueta = ${nueva.etiqueta.slice(0, 200)}, origen = ${nueva.origen},
            confirmaciones = ${nueva.confirmaciones}::int, ultima_vez = now()
        where id = ${actual.id}::uuid and correduria_id = ${k.correduriaId}::uuid`
    })
  } catch (err) {
    console.warn('[tarificador] memoria de elecciones: no se pudo guardar', corto(err))
  }
}
