/* eslint-disable @typescript-eslint/no-explicit-any -- delegados Prisma tipados de forma estructural (fake en tests) */
// Marca personalizada del taller en BD (`configuracion.marca_*`, 0004). Se llama dentro de `conTaller`.
// NULL = usar el default de la marca; los colores se guardan normalizados (#rrggbb minúsculas) y validados.
import { coloresPorDefecto, fondosMarca } from './marca.ts'
import { evaluarMarca, normalizarHex, type EvaluacionMarca } from './contraste.ts'
import { auditar } from './config-repo.ts'

type Delegado = { findUnique(a: any): Promise<any>; update(a: any): Promise<any>; create(a: any): Promise<any> }
export type TxMarca = { configuracion: Delegado; auditoria: Delegado }
export type MarcaGuardada = { primario: string | null; secundario: string | null; logoRuta: string | null }

export async function leerMarcaGuardada(tx: Pick<TxMarca, 'configuracion'>, tallerId: string): Promise<MarcaGuardada> {
  const c = await tx.configuracion.findUnique({ where: { tallerId } })
  return {
    primario: normalizarHex(c?.marcaColorPrimario),
    secundario: normalizarHex(c?.marcaColorSecundario),
    logoRuta: typeof c?.marcaLogoRuta === 'string' && c.marcaLogoRuta ? c.marcaLogoRuta : null,
  }
}

export class ErrorMarca extends Error {}

/** `null`/vacío = volver al default. Color inválido → error (no se guarda nada). Devuelve los avisos de contraste (no bloquean). */
export async function guardarColores(
  tx: TxMarca, o: { tallerId: string; usuarioId: string; primario: string | null; secundario: string | null },
): Promise<EvaluacionMarca> {
  const limpia = (v: string | null) => (v == null || v.trim() === '' ? null : normalizarHex(v) ?? 'invalido')
  const p = limpia(o.primario), s = limpia(o.secundario)
  if (p === 'invalido' || s === 'invalido') throw new ErrorMarca('Color no válido: usa 6 cifras hexadecimales, por ejemplo #3364ee')
  const antes = await leerMarcaGuardada(tx, o.tallerId)
  await tx.configuracion.update({ where: { tallerId: o.tallerId }, data: { marcaColorPrimario: p, marcaColorSecundario: s } })
  await auditar(tx as never, {
    tallerId: o.tallerId, usuarioId: o.usuarioId, entidad: 'configuracion', accion: 'ajustes:marca_colores',
    antes: { primario: antes.primario, secundario: antes.secundario }, despues: { primario: p, secundario: s },
  })
  const d = coloresPorDefecto()
  return evaluarMarca({ primario: p ?? d.primario, secundario: s ?? d.secundario }, fondosMarca())
}

export async function guardarLogoRuta(tx: TxMarca, o: { tallerId: string; usuarioId: string; ruta: string | null }) {
  const antes = await leerMarcaGuardada(tx, o.tallerId)
  await tx.configuracion.update({ where: { tallerId: o.tallerId }, data: { marcaLogoRuta: o.ruta } })
  await auditar(tx as never, {
    tallerId: o.tallerId, usuarioId: o.usuarioId, entidad: 'configuracion', accion: 'ajustes:marca_logo',
    antes: { logoRuta: antes.logoRuta }, despues: { logoRuta: o.ruta },
  })
}
