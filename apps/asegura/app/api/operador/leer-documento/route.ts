import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { leerPoliza, revisarFichero } from '@/lib/documentos/extraer-poliza'
import { auditado } from '@/lib/auditoria'
import { tomadorDe } from '@/lib/tomador-documento'
import { correduriaUnica } from '@/lib/cartera'
import { polizaEnCartera } from '@/lib/poliza-en-cartera'
import { seguroAnteriorDe } from '@central/module-seguros'
import { contrasenasDeLaFicha } from '@/lib/documentos/contrasenas-ficha'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * POST /api/operador/leer-documento — lee una póliza, un recibo o una foto y
 * devuelve SOLO lo que hace falta para abrir una oportunidad: ramo, compañía,
 * número, vencimiento y prima (24/09/2026, Alberto: «que el agente con IA busque
 * los datos que haya; la idea es hacer las cosas lo más rápido posible»).
 *
 * - Misma lectura que `/api/cartera/documentos` (`leerPoliza`), por el puerto de
 *   operador para que plataforma la use con la sesión de Alberto.
 * - **No escribe nada ni guarda el fichero**: el corredor revisa lo leído en el
 *   formulario y es él quien lo guarda.
 * - **No devuelve datos personales** (tomador, DNI, nacimiento, dirección): la
 *   oportunidad no los necesita y viajarían al navegador para nada.
 * - `?tomador=1` (27/09/2026, asistente de Telegram): además dice QUIÉN es el
 *   tomador —su nombre, las fichas con ese DNI y las que se llaman igual— y un `sello` opaco con
 *   el alta cifrada para `POST /api/operador/cliente`. El DNI se busca aquí dentro
 *   y viaja solo cifrado: plataforma nunca lo ve en claro.
 * - `enCartera` (27/09/2026): las pólizas EN VIGOR con ese mismo número. Con
 *   alguna, no es una oportunidad: ya es nuestra. `null` = no se ha podido mirar.
 * - `seguroAnterior` (auto/moto): código DGS, efecto, años sin siniestros y siniestros en 5 años.
 *   `null` = el documento no dice nada de eso.
 * - `matricula`/`vehiculo`: identifican el coche (dos coches del mismo cliente)
 *   y dan nombre a la oportunidad. Son del riesgo, no de la persona.
 * - `clienteId` (29/09/2026): si el PDF viene con contraseña, se prueba el DNI de
 *   ESA ficha (las compañías lo usan de contraseña). Se descifra y se prueba aquí
 *   dentro: el DNI no sale en la respuesta ni pasa por plataforma.
 * - «No se pudo leer» es 422 con motivo, nunca 200 con todo a null: eso se
 *   pintaría como «el documento no trae nada».
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'esperaba un formulario con el fichero' }, { status: 400 })
  }
  const fichero = form.get('fichero')
  if (!(fichero instanceof File)) return NextResponse.json({ error: 'falta el fichero' }, { status: 400 })
  const reparo = revisarFichero({ type: fichero.type, size: fichero.size, name: fichero.name })
  if (reparo) return NextResponse.json({ error: reparo }, { status: 415 })

  const clienteId = form.get('clienteId')
  const r = await leerPoliza(Buffer.from(await fichero.arrayBuffer()), fichero.type, fichero.name, {
    contrasenas: typeof clienteId === 'string' && clienteId.trim() !== '' ? () => correduriaUnica().then((c) => (c ? contrasenasDeLaFicha(c.id, clienteId.trim()) : [])) : undefined,
  })
  if (r.fase === 'ninguno') return NextResponse.json({ error: r.motivo }, { status: 422 })

  const d = r.datos
  const [tomador, enCartera] = await Promise.all([
    new URL(req.url).searchParams.get('tomador') === '1' ? tomadorDe({ ramo: r.ramo, tipoLectura: r.fase, datos: r.datos as unknown as Record<string, string | number | null> }) : undefined,
    correduriaUnica().then((c) => (c ? polizaEnCartera(c.id, d.numeroPoliza) : null)).catch(() => null),
  ])
  const auto = r.fase === 'auto' ? r.datos : null
  const vehiculo = auto ? [auto.marca, auto.modelo].filter(Boolean).join(' ').trim() || null : null
  return NextResponse.json({
    enCartera,
    matricula: auto?.matricula ?? null,
    vehiculo,
    // Lo que da el bonus (29/09/2026): se guarda con la oportunidad y precarga la tarificación.
    // Son datos del RIESGO: nada de la persona sale por aquí.
    seguroAnterior: auto
      ? seguroAnteriorDe({ codigoDgs: auto.codigoEntidadDgs, fechaEfecto: auto.fechaEfecto, aniosSinSiniestros: auto.aniosSinSiniestros, siniestrosUltimos5: auto.siniestrosUltimos5 })
      : null,
    ...(tomador ? { tomador } : {}),
    leido: true,
    fuente: r.fuente,
    ramo: r.ramo,
    compania: d.compania,
    numeroPoliza: d.numeroPoliza,
    fechaVencimiento: d.fechaVencimiento,
    primaAnual: d.primaAnual,
  })
})


