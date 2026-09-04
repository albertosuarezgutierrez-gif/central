import { NextResponse } from 'next/server'
import { z } from 'zod'

import { MAX_DIRECCION } from '@central/module-seguros-portal'

import {
  HTTP_POR_ESTADO_SUGERENCIA,
  sugerirDirecciones,
  MAX_CANDIDATOS,
  MAX_PROPUESTAS_IA,
} from '@/lib/catastro-sugerencias'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
/**
 * En el peor caso se encadenan hasta {@link MAX_VARIANTES} + {@link MAX_PROPUESTAS_IA}
 * consultas al Catastro (cada una con su cerrojo de 350 ms entre peticiones) más
 * una llamada a la IA. `/api/catastro` se conforma con 30 s; esto necesita más.
 */
export const maxDuration = 60

/**
 * `POST /api/catastro/sugerir` — el ÚLTIMO recurso antes de que la persona
 * teclee su casa entera a mano. Se llama cuando `POST /api/catastro` ya ha
 * contestado `no_encontrado` con la dirección tal cual la escribió.
 *
 * Devuelve **candidatos que el Catastro HA CONFIRMADO**, nunca texto suelto de
 * una IA, y cada uno diciendo de dónde salió (`determinista` | `ia`).
 *
 * 🚨 **Aquí no se elige por nadie.** Ni siquiera cuando queda un solo
 * candidato: se devuelve para que la persona confirme que esa es su casa.
 * Quedarse con «la que más se parece» mete los metros, el año y el CP de OTRA
 * vivienda en su póliza de hogar — no da error, no se ve, y en un siniestro se
 * paga como infraseguro. Se enseña, no se guarda.
 *
 * 🚨 **Exige sesión.** Sin ella esto sería un proxy anónimo contra un servicio
 * público con nuestra IP y, encima, gastando IA de nuestra cuenta.
 *
 * 🚨 **No escribe NADA** (no toca `prisma`) y **no registra la dirección en
 * ningún log**: es dato personal.
 *
 * | HTTP | `estado`               | qué significa |
 * |------|------------------------|---------------|
 * | 200  | `candidatos`           | 1..{@link MAX_CANDIDATOS} direcciones confirmadas. **Elige la persona** |
 * | 400  | `datos_invalidos`      | el cuerpo no cumple el esquema |
 * | 401  | `sin_sesion`           | sin cookie del portal |
 * | 404  | `sin_candidatos`       | se probó todo y el Catastro no confirmó ninguna |
 * | 422  | `direccion_ilegible`   | ni una sola forma llegó a ser consultable |
 * | 502  | `catastro_no_responde` | el servicio se cayó. **NO es «no existe»** |
 * | 503  | `ia_no_disponible`     | hacía falta la IA y no la hubo. **NO es «no hay nada»** |
 */

const Entrada = z.object({
  // El mismo tope que `variantesDireccion()`: por encima no es una dirección,
  // es un pegado, y el módulo devolvería cero variantes.
  direccion: z.string().trim().min(3).max(MAX_DIRECCION),
  municipio: z.string().trim().min(2).max(100),
  provincia: z.string().trim().min(2).max(100),
})

export async function POST(req: Request) {
  try {
    await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }

  const parsed = Entrada.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'datos_invalidos' }, { status: 400 })

  const r = await sugerirDirecciones(parsed.data)
  // El cuerpo va entero en los cinco casos: el `estado` es el contrato con la
  // pantalla y el código HTTP la honestidad en el protocolo. Ninguno se colapsa
  // en «no se ha encontrado nada».
  return NextResponse.json(r, { status: HTTP_POR_ESTADO_SUGERENCIA[r.estado] })
}
