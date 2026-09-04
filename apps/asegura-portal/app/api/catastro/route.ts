import { NextResponse } from 'next/server'
import { z } from 'zod'

import { MAX_TEXTO_RAMO } from '@central/module-seguros-portal'

import { consultarCatastroHogar, HTTP_POR_ESTADO, type ConsultaCatastro } from '@/lib/catastro'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
/** El Catastro encadena hasta tres consultas con un cerrojo de 350 ms entre ellas. */
export const maxDuration = 30

/**
 * `POST /api/catastro` — lo que el Catastro sepa de una vivienda, para OFRECER
 * los metros construidos, el año del edificio y el código postal de la ficha de
 * hogar. Es el equivalente del «Usar esta fecha» que la matrícula ofrece en
 * auto: se enseña, y solo entra en el formulario si la persona lo acepta.
 *
 * Dos formas de preguntar, y la segunda es la vuelta de la primera:
 *
 *   { direccion, municipio, provincia }  →  el caso normal.
 *   { referencia }                       →  los 20 caracteres de UN piso, que
 *                                           es lo que devuelve `estado:'elegir'`
 *                                           cuando el portal tiene varios.
 *
 * 🚨 **Esta ruta EXIGE sesión, y no es una formalidad.** Sin ella el portal se
 * convierte en un proxy anónimo contra un servicio público a nuestro nombre y
 * con nuestra IP en su límite de peticiones: cualquiera podría barrer el
 * callejero desde aquí y el Catastro cortaría a los clientes de verdad. El
 * único efecto visible sería que el portal «deja de encontrar direcciones».
 *
 * 🚨 **No escribe NADA.** Solo consulta. El dato entra en `datos_ramo` por el
 * camino normal (`PATCH /api/polizas/[id]`) cuando el cliente lo acepta: quien
 * firma la póliza es él, y el Catastro puede ir atrasado.
 *
 * Los códigos, uno por situación y sin colapsar (ver `HTTP_POR_ESTADO`):
 *
 * | HTTP | `estado`               | qué significa |
 * |------|------------------------|---------------|
 * | 200  | `ok`                   | el piso, con lo que el Catastro publique (y `sinDato` con lo que no) |
 * | 300  | `elegir`               | la dirección da VARIOS pisos: elige la persona, no el código |
 * | 400  | `datos_invalidos`      | el cuerpo no cumple el esquema |
 * | 401  | `sin_sesion`           | sin cookie del portal |
 * | 404  | `no_encontrado`        | el Catastro contestó y ahí no hay nada |
 * | 409  | `via_ambigua`          | el callejero da varias vías y ninguna gana |
 * | 422  | `direccion_ilegible`   | no se pudo sacar sigla/calle/número del texto |
 * | 422  | `referencia_invalida`  | la referencia no son 20 caracteres (la de 14 es la del edificio) |
 * | 502  | `catastro_no_responde` | el servicio no contestó. **NO es «no existe»** |
 */

const PorDireccion = z.object({
  // El mismo tope que el campo `direccion` del catálogo de hogar: por encima no
  // es una dirección, es un pegado.
  direccion: z.string().trim().min(3).max(MAX_TEXTO_RAMO),
  municipio: z.string().trim().min(2).max(100),
  provincia: z.string().trim().min(2).max(100),
})

// Con separadores y espacios caben de sobra los 20 caracteres; se normalizan
// después. El tope es para que el cuerpo no crezca, no para validar el formato.
const PorReferencia = z.object({ referencia: z.string().trim().min(14).max(40) })

const Entrada = z.union([PorReferencia, PorDireccion])

export async function POST(req: Request) {
  // La sesión SIEMPRE por la puerta única. Aquí no se resuelve ninguna
  // identidad concreta —esta ruta no lee ni escribe datos de nadie— pero sin
  // ella la puerta se queda abierta al mundo.
  try {
    await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }

  const parsed = Entrada.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'datos_invalidos' }, { status: 400 })

  const d = parsed.data
  const consulta: ConsultaCatastro =
    'referencia' in d
      ? { por: 'referencia', referencia: d.referencia }
      : { por: 'direccion', direccion: d.direccion, municipio: d.municipio, provincia: d.provincia }

  const r = await consultarCatastroHogar(consulta)
  // El cuerpo va entero en los seis casos: el `estado` es el contrato con la
  // pantalla y el código HTTP la honestidad en el protocolo. Ni uno solo
  // devuelve una sugerencia a medias o un objeto vacío que parezca buena.
  return NextResponse.json(r, { status: HTTP_POR_ESTADO[r.estado] })
}
