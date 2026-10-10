import { NextResponse } from 'next/server'

import { tgSend } from '@central/core-telegram'
import { aplicarRamoAlParte, normalizarParte, plazoComunicacion, textoAvisoParteNuevo, type ParteEntrada } from '@central/module-seguros-portal'

import { carteraDeIdentidad, polizasParaParte } from '@/lib/cartera-lectura'
import { prisma } from '@/lib/db'
import { DECLARADA_NO_ELIMINADA } from '@/lib/declaradas-eliminadas'
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
/**
 * Lo que el aviso a Alberto cuenta de la póliza y su titular, sacado de la cartera
 * YA autorizada para esta identidad (nunca de una consulta por el id del cuerpo).
 * Enlace: `PLATAFORMA_URL` (la misma variable que usa `apps/asegura`); sin ella, no
 * se inventa una URL y el texto dice «míralo en /correduria».
 */
function datosDelAviso(
  cartera: Awaited<ReturnType<typeof carteraDeIdentidad>>,
  polizaId: string | null,
  declarada: { compania: string | null; ramo: string | null; numeroPoliza: string | null } | null,
) {
  const base = process.env.PLATAFORMA_URL?.trim().replace(/\/+$/, '') || null
  const enlaceA = (ruta: string) => (base !== null && base.startsWith('https://') ? `${base}${ruta}` : null)
  if (polizaId !== null) {
    const grupos = [
      { otro: false, titulares: cartera.propias },
      { otro: true, titulares: cartera.autorizadas },
      { otro: true, titulares: cartera.intervinientes },
    ]
    for (const g of grupos) {
      for (const t of g.titulares) {
        const p = t.polizas.find((x) => x.id === polizaId)
        if (!p) continue
        return {
          cliente: t.nombre,
          loDaOtro: g.otro,
          compania: p.compania,
          numeroPoliza: p.numeroPoliza,
          ramo: p.ramo,
          enlace: enlaceA(`/correduria/poliza/${encodeURIComponent(p.id)}`),
        }
      }
    }
  }
  // Sin póliza de cartera: el titular solo si la identidad tiene UNA ficha propia (si
  // tiene varias, elegir una sería inventar a quién es el parte).
  const unica = cartera.propias.length === 1 ? cartera.propias[0]! : null
  return {
    cliente: unica?.nombre ?? null,
    loDaOtro: false,
    compania: declarada?.compania ?? null,
    numeroPoliza: declarada?.numeroPoliza ?? null,
    ramo: declarada?.ramo ?? null,
    enlace: unica ? enlaceA(`/correduria/cliente/${encodeURIComponent(unica.clienteId)}`) : enlaceA('/correduria'),
  }
}

/** El ramo de una póliza que YA está en la cartera autorizada de esta identidad. `null` si no aparece. */
function ramoDePolizaAutorizada(cartera: Awaited<ReturnType<typeof carteraDeIdentidad>>, polizaId: string): string | null {
  for (const titulares of [cartera.propias, cartera.autorizadas, cartera.intervinientes]) {
    for (const t of titulares) {
      const p = t.polizas.find((x) => x.id === polizaId)
      if (p) return p.ramo
    }
  }
  return null
}

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
  let valor = normalizado.valor

  // ─── 3. Pertenencia ────────────────────────────────────────────────────────
  // Sin esto, cualquiera con sesión cuelga un parte de la póliza de otro
  // mandando su uuid: los ids viajan en el JSON y no los firma nadie.
  //
  // «No existe» y «no es tuya» se responden IGUAL a propósito. Distinguirlas
  // convierte la ruta en un oráculo de uuids válidos de la cartera ajena, que
  // es la información que necesita quien está probando.
  // Lo que dice el aviso a Alberto de la póliza: SOLO de lo ya autorizado para
  // esta identidad (la cartera leída aquí abajo o la declarada filtrada por ella).
  let declarada: { compania: string | null; ramo: string | null; numeroPoliza: string | null } | null = null
  let cartera: Awaited<ReturnType<typeof carteraDeIdentidad>> | null = null
  if (valor.polizaDeclaradaId !== null) {
    // Póliza aportada por el propio cliente: el filtro por `identidadId` va
    // JUNTO al id, nunca un `findUnique({ where: { id } })` y un `if` después.
    const propia = await prisma.portalPolizaDeclarada.findFirst({
      where: { id: valor.polizaDeclaradaId, identidadId: identidad.id, ...DECLARADA_NO_ELIMINADA },
      select: { id: true, compania: true, ramo: true, numeroPoliza: true },
    })
    if (!propia) return NextResponse.json({ error: 'poliza_no_tuya' }, { status: 403 })
    declarada = { compania: propia.compania, ramo: propia.ramo, numeroPoliza: propia.numeroPoliza }
  }

  if (valor.polizaId !== null) {
    // Póliza de la CARTERA: la lista sale de `carteraDeIdentidad()`, que parte
    // de `portal_vinculo` filtrado por esta identidad. Es la ÚNICA forma
    // legítima de saber qué pólizas son suyas: ir a la tabla `polizas` con el
    // id que llega en el cuerpo devolvería 200 con la póliza de cualquiera, y
    // por eso el guardián exige que quien toque la cartera nombre esa costura.
    // Cuentan las propias y, de las autorizadas, SOLO las que traen el alcance
    // `partes` (`polizasParaParte`): ver una póliza no da derecho a declarar un
    // siniestro en nombre de su tomador (art. 16 LCS; decisión de Alberto, 24/09/2026).
    cartera = await carteraDeIdentidad(identidad.id)
    if (!polizasParaParte(cartera).has(valor.polizaId)) {
      return NextResponse.json({ error: 'poliza_no_tuya' }, { status: 403 })
    }
  }

  // ─── 3b. Ramo ──────────────────────────────────────────────────────────────
  // El tipo y los campos por ramo se aceptan SOLO con el ramo de la póliza ya
  // autorizada arriba (cartera leída por identidad o declarada filtrada por
  // identidad), nunca con un ramo que diga el cuerpo. Sin póliza → sin ramo →
  // `tipoSiniestro` y `datosRamo` a `null`.
  const ramo =
    declarada !== null
      ? declarada.ramo
      : valor.polizaId !== null && cartera !== null
        ? ramoDePolizaAutorizada(cartera, valor.polizaId)
        : null
  valor = aplicarRamoAlParte(valor, ramo, entrada)

  // Sin `try/catch`: si la BD falla, que salga como error. Un `{ ok: true }` de
  // consuelo dejaría al cliente creyendo que ha declarado un siniestro que no
  // existe en ninguna parte, que es la peor mentira que puede contar el portal.
  const { id } = await crearParte(identidad.id, valor)

  // Aviso INMEDIATO a Alberto (26/09/2026). Antes solo existía el resumen de
  // las 06:55 de plataforma, que se comía hasta un día de los siete del art.
  // 16 LCS; ese cron sigue como red de seguridad. Si Telegram falla, el parte
  // YA está guardado y la respuesta no cambia: el cron lo repetirá mañana.
  try {
    // Cliente titular, compañía, nº, ramo y enlace a la ficha (03/10/2026). Si algo
    // de esto falla, el aviso sale igual con lo que haya: el parte ya está guardado.
    const datos = datosDelAviso(cartera ?? (await carteraDeIdentidad(identidad.id)), valor.polizaId, declarada)
    await tgSend(
      textoAvisoParteNuevo({
        ...datos,
        parteId: id,
        nombre: identidad.nombre ?? null,
        tipoSiniestro: valor.tipoSiniestro,
        datosRamo: valor.datosRamo,
        fechaHecho: valor.fechaHecho,
        hayHeridos: valor.hayHeridos,
        hayTerceros: valor.hayTerceros,
        polizaDeclarada: valor.polizaDeclaradaId !== null,
        sinPoliza: valor.polizaId === null && valor.polizaDeclaradaId === null,
      }),
    )
  } catch (e) {
    console.error('[portal/siniestros] Telegram no salió:', e instanceof Error ? e.message : e)
  }

  // El plazo se calcula sobre la MISMA fecha que se acaba de guardar.
  // `fueraDePlazo: true` NO es «has perdido la cobertura» y la pantalla no
  // puede decir eso (art. 16 LCS: la compañía solo puede reclamar los daños del
  // retraso). Un portal que le diga «ya no te cubren» a quien avisa tarde
  // consigue que la próxima vez no avise.
  const plazo = plazoComunicacion({ fechaHecho: fechaHechoAUtc(valor.fechaHecho), hoy: new Date() })

  return NextResponse.json({ id, plazo }, { status: 201 })
}
