// lib/sivra/catastro-pisos.ts — rellena `properties.catastro_*` de los pisos turísticos desde el
// Catastro (servicio libre, mismo adaptador que la correduría). Solo mira los pisos que aún no
// están en `ok`: con los cuatro resueltos, la pasada no consulta nada.
import { prisma } from '@/lib/db'
import { consultarHogar } from '@/lib/correduria-hogar'
import { consultaDePiso, resultadoDePiso, type ResultadoPiso } from './catastro-pisos-logica'

type Fila = { id: string; name: string; location: string | null; ref_catastral: string | null }

export async function enriquecerCatastroPisos(): Promise<Array<{ piso: string } & ResultadoPiso>> {
  const pisos = await prisma.$queryRaw<Fila[]>`
    SELECT id, name, location, ref_catastral FROM properties
     WHERE "smoobuId" IS NOT NULL AND catastro_estado IS DISTINCT FROM 'ok'
     ORDER BY id`
  const out: Array<{ piso: string } & ResultadoPiso> = []
  for (const p of pisos) {
    const c = consultaDePiso({ refCatastral: p.ref_catastral, location: p.location })
    const r: ResultadoPiso = c
      ? resultadoDePiso(await consultarHogar(c))
      : { estado: 'direccion_ilegible', referencia: null, m2: null, anio: null, uso: null, direccion: null, cp: null, detalle: 'el piso no tiene ni referencia catastral ni dirección' }
    await prisma.$executeRaw`
      UPDATE properties SET
        catastro_estado = ${r.estado}, catastro_detalle = ${r.detalle}, catastro_revisado_at = now(),
        ref_catastral = COALESCE(ref_catastral, ${r.referencia}),
        catastro_m2 = COALESCE(${r.m2}::int, catastro_m2),
        catastro_anio = COALESCE(${r.anio}::int, catastro_anio),
        catastro_uso = COALESCE(${r.uso}, catastro_uso),
        catastro_direccion = COALESCE(${r.direccion}, catastro_direccion),
        catastro_cp = COALESCE(${r.cp}, catastro_cp)
      WHERE id = ${p.id}`
    out.push({ piso: p.name, ...r })
  }
  return out
}
