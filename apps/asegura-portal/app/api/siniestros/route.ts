import { NextResponse } from 'next/server'

import { normalizarParte, plazoComunicacion, type ParteEntrada } from '@central/module-seguros-portal'

import { carteraDeIdentidad } from '@/lib/cartera-lectura'
import { prisma } from '@/lib/db'
import { crearParte, fechaHechoAUtc } from '@/lib/partes-siniestro'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'

/**
 * Alta de un parte de siniestro por el CLIENTE.
 *
 * 🚨 Lo que se guarda es una DECLARACIÓN, no un siniestro. `seguros.siniestros`
 * la llena CIMA y este rol ni la escribe; el parte nace en `enviado`, que
 * significa «nos lo has contado a nosotros» y NO «tu compañía ya lo sabe». Por
 * eso la respuesta devuelve el `plazo` del art. 16 LCS: el reloj de los 7 días
 * sigue corriendo contra la entidad, no contra este formulario.
 *
 * El orden de los pasos no es decorativo:
 *   1. identidad (cookie)  → sin ella no hay a quién colgarle nada.
 *   2. validación (módulo puro) → todos los errores a la vez, uno por campo.
 *   3. PERTENENCIA de la póliza → el paso que impide colgar un parte de la
 *      póliza de otro mandando su uuid.
 *   4. escritura.
 * Adelantar el 4 al 3 es exactamente el fallo que este fichero existe para
 * evitar, y no se vería en ningún log porque la operación sería un éxito.
 */
export async function POST(req: Request) {
  // La identidad SIEMPRE sale de la cookie, nunca del cuerpo de la petición:
  // es lo único que separa la bóveda de una persona de la de otra.
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }

  let cuerpo: unknown
  try {
    cuerpo = await req.json()
  } catch {
    return NextResponse.json({ error: 'cuerpo_invalido' }, { status: 400 })
  }

  // Qué es un parte válido lo decide el módulo puro, no esta ruta: la misma
  // regla tiene que valer desde la pantalla, desde aquí y desde donde venga
  // después. El mapa de errores por campo sale TAL CUAL — la UI lo traduce a
  // texto junto a cada input, y agregarlo aquí a un «datos inválidos» a secas
  // deja al usuario adivinando cuál de los seis campos está mal.
  //
  // `null` y `3` son JSON perfectamente válidos: sin esta guarda, un cuerpo así
  // revienta con un 500 dentro del validador en vez de contestar qué falta.
  const entrada: ParteEntrada = typeof cuerpo === 'object' && cuerpo !== null ? (cuerpo as ParteEntrada) : {}
  const normalizado = normalizarParte(entrada)
  if (!normalizado.ok) {
    return NextResponse.json({ error: 'datos_invalidos', errores: normalizado.errores }, { status: 400 })
  }
  const valor = normalizado.valor

  // ─── 3. Pertenencia ────────────────────────────────────────────────────────
  // Sin esto, cualquiera con sesión cuelga un parte de la póliza de otro
  // mandando su uuid: los ids viajan en el JSON y no los firma nadie.
  //
  // «No existe» y «no es tuya» se responden IGUAL a propósito. Distinguirlas
  // convierte la ruta en un oráculo de uuids válidos de la cartera ajena, que
  // es la información que necesita quien está probando.
  if (valor.polizaDeclaradaId !== null) {
    // Póliza aportada por el propio cliente: el filtro por `identidadId` va
    // JUNTO al id, nunca un `findUnique({ where: { id } })` y un `if` después.
    const propia = await prisma.portalPolizaDeclarada.findFirst({
      where: { id: valor.polizaDeclaradaId, identidadId: identidad.id },
      select: { id: true },
    })
    if (!propia) return NextResponse.json({ error: 'poliza_no_tuya' }, { status: 403 })
  }

  if (valor.polizaId !== null) {
    // Póliza de la CARTERA: la lista sale de `carteraDeIdentidad()`, que parte
    // de `portal_vinculo` filtrado por esta identidad. Es la ÚNICA forma
    // legítima de saber qué pólizas son suyas: ir a la tabla `polizas` con el
    // id que llega en el cuerpo devolvería 200 con la póliza de cualquiera, y
    // por eso el guardián exige que quien toque la cartera nombre esa costura.
    // Cuentan las propias y las que otro le ha autorizado a ver: si puede verla
    // en su bóveda, puede declarar un siniestro sobre ella.
    const cartera = await carteraDeIdentidad(identidad.id)
    const suyas = new Set(
      [...cartera.propias, ...cartera.autorizadas].flatMap((t) => t.polizas.map((p) => p.id)),
    )
    if (!suyas.has(valor.polizaId)) {
      return NextResponse.json({ error: 'poliza_no_tuya' }, { status: 403 })
    }
  }

  // Sin `try/catch`: si la BD falla, que salga como error. Un `{ ok: true }` de
  // consuelo dejaría al cliente creyendo que ha declarado un siniestro que no
  // existe en ninguna parte, que es la peor mentira que puede contar el portal.
  const { id } = await crearParte(identidad.id, valor)

  // El plazo se calcula sobre la MISMA fecha que se acaba de guardar.
  // `fueraDePlazo: true` NO es «has perdido la cobertura» y la pantalla no
  // puede decir eso (art. 16 LCS: la compañía solo puede reclamar los daños del
  // retraso). Un portal que le diga «ya no te cubren» a quien avisa tarde
  // consigue que la próxima vez no avise.
  const plazo = plazoComunicacion({ fechaHecho: fechaHechoAUtc(valor.fechaHecho), hoy: new Date() })

  return NextResponse.json({ id, plazo }, { status: 201 })
}
