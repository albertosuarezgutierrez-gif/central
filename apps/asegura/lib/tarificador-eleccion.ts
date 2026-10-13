// Elección AUTOMÁTICA de la versión del vehículo con IA (13/10/2026) — el cableado con BD, IA y lanzador. Las reglas
// (cuándo, tope de 1, validación contra la lista) viven en `tarificador-eleccion-reglas.ts` y tienen test.
//
// IA: `iaTexto()` (pasarela de plataforma → cadena de fallback de `@central/core-ai`; queda en `ai_usos` con
// app='asegura' y bajo sus topes). `privado: true` aunque solo viajan datos del VEHÍCULO (marca, modelo, clase,
// cilindrada, descripción) y la lista de catálogo: nada de personas.
//
// Las rutas del worker solo conocen el id del trabajo; aquí el trabajo se lee por id y se relanza con SU correduría.

import { iaTexto } from './ia'
import { prisma } from './tenant'
import { lanzarPendientes } from './tarificador'
import { procesarEleccionVersion, type DepsEleccion, type FilaEleccion, type ResultadoEleccion } from './tarificador-eleccion-reglas'

async function leer(trabajoId: string): Promise<FilaEleccion | null> {
  const filas = await prisma.$queryRaw<FilaEleccion[]>`
    select t.id::text as id, t.correduria_id::text as correduria_id, t.compania, t.ramo, t.estado,
           to_jsonb(t)->>'modo' as modo, t.riesgo, t.error
    from seguros.tarificacion_trabajos t where t.id = ${trabajoId}::uuid`
  return filas[0] ?? null
}

/**
 * Aplica en UNA transacción con `for update`: el trabajo sigue en `requiere_humano`, con EL MISMO fallo (`error.en`) y
 * sin elección previa en el riesgo. Escribe `riesgo.eleccionVersion` (+ `eleccionVersionIa`: la marca del intento
 * automático) y lo devuelve a `pendiente` con los intentos a 0, como «Reintentar» de la bandeja.
 */
async function aplicar(f: FilaEleccion, e: { codigo: string; etiqueta: string }, motivo: string, errorEn: string | null): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const filas = await tx.$queryRaw<{ estado: string; error_en: string | null; tiene_eleccion: boolean }[]>`
      select t.estado, t.error->>'en' as error_en,
             (t.riesgo ? 'eleccionVersion' and t.riesgo->'eleccionVersion' <> 'null'::jsonb) or t.riesgo ? 'eleccionVersionIa' as tiene_eleccion
      from seguros.tarificacion_trabajos t
      where t.id = ${f.id}::uuid and t.correduria_id = ${f.correduria_id}::uuid for update`
    const a = filas[0]
    if (!a || a.estado !== 'requiere_humano' || a.tiene_eleccion || (a.error_en ?? null) !== errorEn) return false
    const eleccion = JSON.stringify({ codigo: e.codigo, etiqueta: e.etiqueta })
    const marca = JSON.stringify({ motivo: motivo.slice(0, 300), en: new Date().toISOString() })
    const n = await tx.$executeRaw`
      update seguros.tarificacion_trabajos
      set riesgo = riesgo || jsonb_build_object('eleccionVersion', ${eleccion}::jsonb, 'eleccionVersionIa', ${marca}::jsonb),
          estado = 'pendiente', intentos = 0, lease_hasta = null, fly_machine_id = null, error = null,
          iniciado_at = null, terminado_at = null, updated_at = now()
      where id = ${f.id}::uuid and correduria_id = ${f.correduria_id}::uuid and estado = 'requiere_humano'`
    return n === 1
  })
}

/** La IA no se atrevió: se anota en el `error` (sigue `requiere_humano`; la persona ve por qué). Sin datos personales. */
async function anotarBaja(f: FilaEleccion, r: { motivo: string }, errorEn: string | null): Promise<void> {
  const nota = JSON.stringify({ confianza: 'baja', motivo: r.motivo.slice(0, 300), en: new Date().toISOString() })
  await prisma.$executeRaw`
    update seguros.tarificacion_trabajos
    set error = error || jsonb_build_object('eleccionIa', ${nota}::jsonb), updated_at = now()
    where id = ${f.id}::uuid and correduria_id = ${f.correduria_id}::uuid and estado = 'requiere_humano'
      and (error->>'en') is not distinct from ${errorEn}`
}

const depsReales = (): DepsEleccion => ({
  env: process.env,
  leer,
  ia: (system, prompt) => iaTexto(prompt, { system, maxTokens: 300, timeoutMs: 20_000, privado: true }),
  aplicar,
  anotarBaja,
  lanzar: (correduriaId, compania) => lanzarPendientes(correduriaId, compania),
})

/** Tras un `requiere_humano` con lista de versiones. Nunca lanza: un fallo deja el trabajo como estaba (para una persona). */
export async function intentarEleccionVersionIa(trabajoId: string, deps: DepsEleccion = depsReales()): Promise<ResultadoEleccion | null> {
  try {
    const r = await procesarEleccionVersion(trabajoId, deps)
    console.info('[tarificador] elección de versión con IA', trabajoId, r.estado, r.estado === 'aplicado' ? r.codigo : '')
    return r
  } catch (e) {
    console.error('[tarificador] elección de versión con IA', trabajoId, e instanceof Error ? e.message.slice(0, 200) : e)
    return null
  }
}
