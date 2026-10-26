/**
 * «¿Es esta tu vivienda?» (26/10/2026) en el ENLACE de datos de hogar: con la dirección que va escribiendo el cliente se
 * consulta el Catastro (libre y público) para ENSEÑARLE lo que dice —tipo, planta, m², año— en vez de preguntárselo.
 * Si confirma, esas preguntas no se hacen; si corrige o el Catastro no responde, se preguntan.
 *
 * Misma regla que asegura al completar (`apps/asegura/lib/solicitud-datos-hogar.ts`): solo un inmueble INEQUÍVOCO da
 * m² y año; el tipo sale de `deducirViviendaCatastro` (división horizontal + planta declarada contra la parcela). La
 * respuesta no lleva la referencia ni nada del cliente. Nunca lanza: fallo = «sin datos» (se pregunta todo).
 */
import { caracterizarVivienda, precalificarHogar } from '@central/core-catastro'
import { bajarCatastro, inmueblesPorDireccion } from '@central/core-catastro/http'
import { deducirViviendaCatastro, inmuebleUnicoCatastro, type ViviendaDeducida } from '@central/module-tarificacion'

export type ViviendaCatastroPublica = {
  estado: 'ok' | 'sin_datos'
  /** piso · planta_baja · atico · unifamiliar · null (no se sabe: se pregunta). */
  tipo: ViviendaDeducida['tipo']
  metros: number | null
  anio: number | null
}

const SIN: ViviendaCatastroPublica = { estado: 'sin_datos', tipo: null, metros: null, anio: null }
const TOPE_MS = 10_000

export type ConsultaVivienda = { provincia: string; municipio: string; sigla: string; calle: string; numero: string; planta: string | null; puerta: string | null; cp: string | null }

export async function viviendaCatastro(q: ConsultaVivienda): Promise<ViviendaCatastroPublica> {
  const consulta = (async (): Promise<ViviendaCatastroPublica> => {
    const lista = await inmueblesPorDireccion({ provincia: q.provincia, municipio: q.municipio, sigla: q.sigla, calle: q.calle, numero: q.numero, viaOficial: q.calle })
    if (lista === null || lista.inmuebles.length === 0) return SIN
    const e = inmuebleUnicoCatastro(lista.inmuebles, { planta: q.planta, puerta: q.puerta, codigoPostal: q.cp })
    if (e.estado !== 'unico') {
      const d = deducirViviendaCatastro({ tipoFicha: null, inmuebles: lista.inmuebles, plantaDeclarada: q.planta })
      return d.tipo === null ? SIN : { estado: 'ok', tipo: d.tipo, metros: null, anio: null }
    }
    const datos = await bajarCatastro(e.refCompleta)
    if (datos === null) return SIN
    const p = precalificarHogar(datos)
    const d = deducirViviendaCatastro({ tipoFicha: caracterizarVivienda(datos)?.tipo ?? null, inmuebles: lista.inmuebles, plantaDeclarada: q.planta })
    const metros = p.datos.metrosCuadrados !== null && p.datos.metrosCuadrados > 0 ? p.datos.metrosCuadrados : null
    const anio = p.datos.anioConstruccion !== null && p.datos.anioConstruccion >= 1500 ? p.datos.anioConstruccion : null
    return d.tipo === null && metros === null && anio === null ? SIN : { estado: 'ok', tipo: d.tipo, metros, anio }
  })().catch(() => SIN)
  const tope = new Promise<ViviendaCatastroPublica>((r) => setTimeout(() => r(SIN), TOPE_MS))
  return Promise.race([consulta, tope])
}
