import { NextResponse } from 'next/server'

import { MAX_BYTES_DOCUMENTO, MIMES_DOCUMENTO } from '@central/module-seguros'

import { proponerPoliza } from '@/lib/escaner-documento'
import { leerDocumentoEscaneado } from '@/lib/escaner-documento-ia'
import { polizasPropiasParaEscanerDeSesion, reservarEscaneoDeSesion } from '@/lib/escaner-documento-polizas'

export const runtime = 'nodejs'

/**
 * «Escanear un documento», paso 1: LEE y PROPONE, no archiva nada. La persona confirma en
 * pantalla y entonces se llama a `/api/documentos/archivar`.
 *
 * Sin key de IA responde `{ ia: false }`: la pantalla ofrece archivar a mano (200, no un error:
 * el escáner es una ayuda, no un requisito). Tope por IDENTIDAD y día: cada escaneo es una
 * llamada de IA sobre un fichero de hasta 10 MB, y una sesión la consigue cualquiera con un buzón.
 */
export async function POST(req: Request) {
  // La identidad la resuelve `reservarEscaneoDeSesion` desde la cookie (`lib/session`); sin sesión, 401.
  // Cupo diario en BD (no en memoria). Un fallo de BD no es «hay cupo»: 503 y no se llama a la IA.
  let cupo: Awaited<ReturnType<typeof reservarEscaneoDeSesion>>
  try {
    cupo = await reservarEscaneoDeSesion()
  } catch (e) {
    console.error('[portal/escaner] no se pudo comprobar el cupo:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'cupo_no_disponible' }, { status: 503 })
  }
  if (cupo === null) return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  if (cupo === 'tope') {
    return NextResponse.json({ error: 'demasiadas_peticiones', retryAfter: 3600 }, { status: 429, headers: { 'retry-after': '3600' } })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'cuerpo_invalido' }, { status: 400 })
  }
  const fichero = form.get('documento')
  if (!(fichero instanceof File)) return NextResponse.json({ error: 'sin_fichero' }, { status: 400 })
  if (fichero.size > MAX_BYTES_DOCUMENTO) return NextResponse.json({ error: 'fichero_grande' }, { status: 413 })
  if (!(MIMES_DOCUMENTO as readonly string[]).includes(fichero.type)) return NextResponse.json({ error: 'tipo_no_admitido' }, { status: 415 })

  const resultado = await leerDocumentoEscaneado(Buffer.from(await fichero.arrayBuffer()), fichero.type, fichero.name)
  if (!resultado.ia) return NextResponse.json({ ia: false })

  // Las candidatas salen de la cartera de ESTA identidad; el servidor las devuelve para que la
  // pantalla deje elegir, y `archivar` las vuelve a calcular (no se fía de lo que vuelva).
  const candidatas = await polizasPropiasParaEscanerDeSesion().catch(() => null)
  const propuesta = candidatas === null ? null : proponerPoliza(resultado.lectura, candidatas)
  return NextResponse.json({
    ia: true,
    // `legible: false` = la IA falló o no había texto: «no hemos podido leerlo», nunca «no tiene datos».
    legible: resultado.ok,
    lectura: resultado.lectura,
    propuesta,
    polizas: candidatas,
  })
}
