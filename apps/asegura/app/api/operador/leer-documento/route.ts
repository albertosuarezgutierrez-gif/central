import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { leerPoliza, revisarFichero } from '@/lib/documentos/extraer-poliza'
import { auditado } from '@/lib/auditoria'
import { tomadorDe } from '@/lib/tomador-documento'
import { correduriaUnica } from '@/lib/cartera'
import { polizaEnCartera } from '@/lib/poliza-en-cartera'
import { seguroAnteriorDe } from '@central/module-seguros'
import { contrasenasDeLaFicha } from '@/lib/documentos/contrasenas-ficha'
import { guardarExtraccion, oportunidadDesdeLecturaConIdentidad, type ResultadoOportunidadDocumento } from '@/lib/oportunidad-documento'
import type { PropuestaIdentidad } from '@central/module-seguros'
import { guardarDocumento } from '@/lib/cartera-documentos'
import { fichaDelDocumento, type FichaDelDocumento } from '@/lib/oportunidad-documento-reglas'

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
 * - `seguroAnterior` (auto/moto): código DGS, efecto, años sin siniestros y siniestros en 5 años; y desde el
 *   03/10/2026 nº de póliza, matrícula, canal (mediador/financiera), cesión de derechos y modalidad.
 *   `null` = el documento no dice nada de eso.
 * - `matricula`/`vehiculo`: identifican el coche (dos coches del mismo cliente)
 *   y dan nombre a la oportunidad. Son del riesgo, no de la persona.
 * - `clienteId` (29/09/2026): si el PDF viene con contraseña, se prueba el DNI de
 *   ESA ficha (las compañías lo usan de contraseña). Se descifra y se prueba aquí
 *   dentro: el DNI no sale en la respuesta ni pasa por plataforma.
 * - `crear=1` (29/09/2026, pantalla «Subir póliza»): además ABRE la oportunidad (o la completa) y
 *   guarda el fichero en la ficha a la que va: un documento de seguro subido no se puede perder.
 *   Desde el 03/10/2026 también rellena los HUECOS de la ficha del tomador con lo que trae la póliza
 *   (fecha de nacimiento, domicilio, teléfono, email, carné; `volcarPolizaEnFicha`) y guarda lo
 *   leído SIN datos personales con el documento. En la respuesta va QUÉ se rellenó (nombres de campo), nunca los valores.
 *   Sin él, sigue siendo solo lectura (el alta a mano y Telegram deciden ellos).
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
  const contenido = Buffer.from(await fichero.arrayBuffer())
  const r = await leerPoliza(contenido, fichero.type, fichero.name, {
    contrasenas: typeof clienteId === 'string' && clienteId.trim() !== '' ? () => correduriaUnica().then((c) => (c ? contrasenasDeLaFicha(c.id, clienteId.trim()) : [])) : undefined,
  })
  if (r.fase === 'ninguno') return NextResponse.json({ error: r.motivo }, { status: 422 })

  const d = r.datos
  const [tomador, enCartera] = await Promise.all([
    new URL(req.url).searchParams.get('tomador') === '1' ? tomadorDe({ ramo: r.ramo, tipoLectura: r.fase, datos: r.datos as unknown as Record<string, string | number | null> }, { tomadorEsEmpresa: r.contacto?.tomadorEsEmpresa, cifTomador: r.contacto?.cifTomador }) : undefined,
    correduriaUnica().then((c) => (c ? polizaEnCartera(c.id, d.numeroPoliza) : null)).catch(() => null),
  ])
  let oportunidad: ResultadoOportunidadDocumento | undefined
  let ficheroGuardado = false
  let ficha: FichaDelDocumento | null = null
  // 05/10/2026: propuesta de corregir nombre/apellidos con la póliza (mismo DNI que la ficha). NO se
  // escribe: la pantalla la enseña y, si el corredor la confirma, va por el PATCH de identidad con
  // este documento como acreditativo. `null` = no hay nada que proponer (o no se guardó el fichero).
  let identidad: { clienteId: string; documentoId: string; propuesta: PropuestaIdentidad } | null = null
  if (form.get('crear') === '1') {
    const c = await correduriaUnica().catch(() => null)
    if (c) {
      const sube = typeof clienteId === 'string' && clienteId.trim() !== '' ? clienteId.trim() : null
      const conIdentidad = await oportunidadDesdeLecturaConIdentidad({ correduriaId: c.id, clienteSube: sube, lectura: r, origen: 'subir-poliza', actor: req.headers.get('x-actor') ?? 'corredor' })
      oportunidad = conIdentidad.resultado
      // El fichero va a la ficha del tomador (la de la oportunidad, o la ya resuelta si la oportunidad
      // falló), o a la póliza si ya es nuestra. En los demás desenlaces (sin tomador legible, no es un
      // seguro) NO se guarda ni se toca ficha alguna, y se dice (`ficheroGuardado: false`).
      ficha = fichaDelDocumento(oportunidad)
      const destino = ficha
        ? { clienteId: ficha.clienteId }
        : oportunidad.estado === 'ya_nuestra' && enCartera?.[0]
          ? { polizaId: enCartera[0].polizaId }
          : null
      if (destino) {
        const g = await guardarDocumento(c.id, { ...destino, tipo: 'poliza', nombre: fichero.name, mime: fichero.type, contenido, subidoPor: 'corredor', notas: 'Subida desde «Subir póliza»' }).catch(() => null)
        ficheroGuardado = g?.ok === true
        // Lo leído (sin datos personales: `extraccionSinPii`) se queda con el documento, con la marca de
        // identidad (índice ciego del DNI) si el documento va a la ficha en la que se comprobó.
        if (g?.ok) {
          const marca = conIdentidad.marca && 'clienteId' in destino && destino.clienteId === conIdentidad.marca.clienteId ? conIdentidad.marca : null
          await guardarExtraccion(c.id, g.documento.id, r.bruto ?? null, marca)
          const p = conIdentidad.propuesta
          if (p && marca?.coincidiaConFicha && p.clienteId === marca.clienteId) identidad = { clienteId: p.clienteId, documentoId: g.documento.id, propuesta: p.propuesta }
        }
      }
    }
  }
  const auto = r.fase === 'auto' ? r.datos : null
  const vehiculo = auto ? [auto.marca, auto.modelo].filter(Boolean).join(' ').trim() || null : null
  return NextResponse.json({
    // `ficha` (03/10/2026): la ficha del tomador resultante —id, si se creó, NOMBRES de lo rellenado
    // y avisos—; `null` = no se ha tocado ninguna ficha.
    ...(oportunidad ? { oportunidad, ficheroGuardado, ficha, identidad } : {}),
    enCartera,
    matricula: auto?.matricula ?? null,
    vehiculo,
    // Lo que da el bonus (29/09/2026): se guarda con la oportunidad y precarga la tarificación.
    // Son datos del RIESGO: nada de la persona sale por aquí.
    seguroAnterior: auto
      ? seguroAnteriorDe({
          codigoDgs: auto.codigoEntidadDgs, fechaEfecto: auto.fechaEfecto, aniosSinSiniestros: auto.aniosSinSiniestros, siniestrosUltimos5: auto.siniestrosUltimos5,
          // 03/10/2026: identifica ESA póliza para imputar el bonus a un vehículo nuevo (todo opcional; null = no lo dice).
          numeroPoliza: auto.numeroPoliza, matricula: auto.matricula, canal: r.contacto?.mediador ?? null,
          cesionDerechos: r.contacto?.cesionDerechos ?? null, modalidad: r.bruto?.modalidad ?? null,
          pagoUnico: r.bruto?.pagoUnicoPlurianual, fechaVencimiento: d.fechaVencimiento,
        })
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


