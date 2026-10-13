import { NextResponse } from 'next/server'

import { tgSend } from '@central/core-telegram'
import { MAX_BYTES_DOCUMENTO, MIMES_DOCUMENTO } from '@central/module-seguros'

import { carteraDeIdentidad } from '@/lib/cartera-lectura'
import { guardarDocumentoPropio } from '@/lib/documento-portal'
import {
  AVISO_CARTA_IMPAGO,
  TIPOS_ESCANER,
  esCartaImpago,
  nombreDeArchivo,
  normalizarLecturaEscaner,
  textoAvisoImpago,
  type TipoEscaner,
} from '@/lib/escaner-documento'
import { polizasPropiasParaEscanerDeSesion } from '@/lib/escaner-documento-polizas'
import { rateLimit } from '@/lib/rate-limit'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'

const EXTENSION: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' }

/**
 * «Escanear un documento», paso 2: la persona YA ha confirmado tipo y póliza. Archiva por el
 * puente (misma vía que subir una póliza) y, si es una carta de impago, avisa al corredor.
 *
 * El tipo manda lo que CONFIRMÓ la persona, no lo que dijo la IA. La póliza se valida contra
 * las propias de la identidad (`polizasPropiasParaEscanerDeSesion`); un id ajeno se ignora, no se archiva
 * "en" ella. El puente no guarda vínculo a póliza: compañía y nº van en el NOMBRE del fichero.
 * El aviso de impago sale aunque el archivado falle (sin ficha, sin puente): el corredor tiene
 * que saber de un impago aunque el papel no haya podido guardarse.
 */
export async function POST(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  const tope = rateLimit(`escaner-archivo:${identidad.id}`, 30, 24 * 60 * 60 * 1000)
  if (!tope.allowed) return NextResponse.json({ error: 'demasiadas_peticiones', retryAfter: tope.retryAfter ?? 3600 }, { status: 429 })

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

  const tipoCampo = form.get('tipo')
  if (typeof tipoCampo !== 'string' || !(TIPOS_ESCANER as readonly string[]).includes(tipoCampo)) {
    return NextResponse.json({ error: 'tipo_invalido' }, { status: 400 })
  }
  const tipo = tipoCampo as TipoEscaner
  const lectura = normalizarLecturaEscaner({ tipo, fecha: form.get('fecha'), importe: form.get('importe') })

  let compania: string | null = null
  let numeroPoliza: string | null = null
  const polizaCampo = form.get('polizaId')
  if (typeof polizaCampo === 'string' && polizaCampo !== '') {
    const propias = await polizasPropiasParaEscanerDeSesion().catch(() => null)
    const elegida = propias?.find((p) => p.id === polizaCampo)
    if (!elegida) return NextResponse.json({ error: 'poliza_no_tuya' }, { status: 403 })
    compania = elegida.compania
    numeroPoliza = elegida.numeroPoliza
  }

  const nombre = nombreDeArchivo({ tipo, compania, numeroPoliza, fecha: lectura.fecha, extension: EXTENSION[fichero.type] ?? '' })
  const guardado = await guardarDocumentoPropio(identidad.id, {
    tipo: tipo === 'recibo' ? 'recibo' : 'otro',
    nombre,
    mime: fichero.type,
    contenido: Buffer.from(await fichero.arrayBuffer()),
  })

  let avisoCorredor: 'enviado' | 'sin_canal' | 'error' | null = null
  if (esCartaImpago(tipo)) {
    avisoCorredor = 'error'
    try {
      const cartera = await carteraDeIdentidad(identidad.id).catch(() => null)
      const unica = cartera && cartera.propias.length === 1 ? cartera.propias[0]! : null
      const id = await tgSend(textoAvisoImpago({ identidadId: identidad.id, clienteNombre: unica?.nombre ?? null, compania, numeroPoliza, fecha: lectura.fecha }))
      avisoCorredor = id === null ? 'sin_canal' : 'enviado'
    } catch (e) {
      console.error('[portal/escaner] aviso de impago no salió:', e instanceof Error ? e.message : e)
    }
  }

  return NextResponse.json({
    archivado: guardado.estado === 'ok',
    estado: guardado.estado,
    nombre,
    // La pantalla muestra SIEMPRE este texto con una carta de impago, se haya podido archivar o no.
    aviso: esCartaImpago(tipo) ? AVISO_CARTA_IMPAGO : null,
    avisoCorredor,
  })
}
