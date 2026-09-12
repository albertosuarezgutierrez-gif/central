import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { prisma } from '@/lib/tenant'
import { correduriaUnica } from '@/lib/cartera'
import { catalogoCompanias, registrarPolizaEmitida } from '@/lib/emision'
import { resolverConfigEmision, camposDeEmision } from '@/lib/codeoscopic/emitir'
import { enviarEmision } from '@/lib/codeoscopic/emitir-envio'
import {
  conCuentaBancaria,
  esFalloDeCuentaBancaria,
  extraerIbanTecleado,
  ibanEnCampos,
  ibanEnmascarado,
  ibanValido,
  normalizarIban,
} from '@/lib/codeoscopic/emitir-iban'
import { decryptField } from '@central/module-seguros-pii'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * `POST /api/operador/codeoscopic/emitir` — el Submit de verdad
 * (`POST /insurances/{id}/policy-applications`), y el acuñado en nuestra BD
 * si el vendor lo acepta.
 *
 * 🚨 **Construida el 11/09/2026, sin sandbox y sin fixture del fabricante.**
 * El propio portal avisa de que esta operación puede aceptar el producto
 * principal y fallar en los addons, sin decir cómo reanudarlo — por eso
 * `crudo` (la respuesta ENTERA del vendor) viaja siempre en la respuesta,
 * salga bien o mal. Detrás de `CODEOSCOPIC_EMISION_ACTIVA` y con un candado
 * de un solo intento por proyecto (`lib/codeoscopic/emitir.ts::enviarEmision`).
 *
 * ── Cuerpo ──────────────────────────────────────────────────────────────────
 *   { projectId, confirmado: true, campos?: Record<string, unknown> }
 *
 * `projectId` tiene que tener ya una oferta confirmada por
 * `POST .../oferta` (ReRate) — si no, se corta con 409 antes de llamar a
 * nadie. `campos` son los datos que pida `policy-application-fields` (se
 * consulta aquí mismo, gratis, y viaja en la respuesta de error si faltan).
 */
export async function POST(req: Request) {
  if (!operadorAutorizado(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const cuerpo = (await req.json().catch(() => ({}))) as Record<string, unknown>

  if (cuerpo.confirmado !== true) {
    return NextResponse.json(
      {
        estado: 'error',
        causa: 'sin_confirmar',
        mensaje:
          'Hay que mandar `confirmado: true` (booleano) para emitir de verdad: sin sandbox, esta ' +
          'llamada compromete un contrato real y no se dispara sin una confirmación explícita.',
      },
      { status: 400 },
    )
  }

  const projectId = cadena(cuerpo.projectId)
  if (!projectId) {
    return NextResponse.json({ estado: 'error', causa: 'otro', mensaje: 'falta projectId' }, { status: 400 })
  }
  const camposCliente = esObjeto(cuerpo.campos) ? cuerpo.campos : {}
  const actor = cadena(cuerpo.actor) ?? 'plataforma'

  const correduria = await correduriaUnica().catch(() => null)
  if (!correduria) {
    return NextResponse.json(
      { estado: 'error', causa: 'otro', mensaje: 'no se ha podido resolver la correduría' },
      { status: 503 },
    )
  }

  const filas = await prisma.$queryRaw<
    { poliza_id: string | null; aseguradora: string | null; accepted_offer_id_codeoscopic: string | null }[]
  >`
    select poliza_id::text as poliza_id, aseguradora, accepted_offer_id_codeoscopic
    from codeoscopic_projects
    where correduria_id = ${correduria.id}::uuid and project_id_codeoscopic = ${projectId}
  `
  const p = filas[0]
  if (!p || !p.accepted_offer_id_codeoscopic || !p.aseguradora) {
    return NextResponse.json(
      {
        estado: 'error',
        causa: 'otro',
        mensaje:
          'este proyecto no tiene una oferta confirmada todavía: primero POST .../oferta (ReRate), ' +
          'y solo con esa respuesta en la mano se llama a esto.',
      },
      { status: 409 },
    )
  }
  if (!p.poliza_id) {
    return NextResponse.json(
      {
        estado: 'error',
        causa: 'otro',
        mensaje: 'este proyecto no está enlazado a ninguna póliza de la cartera: no se sabe de quién es',
      },
      { status: 409 },
    )
  }

  const polizas = await prisma.$queryRaw<
    {
      cliente_id: string
      tipo: string
      fraccionamiento: string | null
      datos_especificos: unknown
      cuenta_poliza: string | null
      cuenta_cliente: string | null
    }[]
  >`
    select p.cliente_id::text as cliente_id, p.tipo::text as tipo, p.fraccionamiento::text as fraccionamiento,
           p.datos_especificos, p.cuenta_bancaria as cuenta_poliza, c.cuenta_bancaria as cuenta_cliente
    from polizas p
    left join clientes c on c.id = p.cliente_id and c.correduria_id = p.correduria_id
    where p.id = ${p.poliza_id}::uuid and p.correduria_id = ${correduria.id}::uuid
  `
  const poliza = polizas[0]
  if (!poliza) {
    return NextResponse.json(
      { estado: 'error', causa: 'otro', mensaje: 'la póliza enlazada a este proyecto ya no existe' },
      { status: 404 },
    )
  }

  // ── La cuenta bancaria del Submit (duodécimo 400 real, 12/09/2026) ────────
  // Orden: lo tecleado en plataforma (`campos.iban`) > lo que ya viniera en
  // `payment.bankAccount.iban` > la ficha (póliza, luego cliente; cifradas).
  // Nunca se inventa: si no está en ningún sitio, se manda sin ella y, si la
  // compañía la exige, su 400 vuelve como hueco `iban` (más abajo).
  const { iban: ibanTecleado, resto: camposBase } = extraerIbanTecleado(camposCliente)
  if (ibanTecleado !== null && !ibanValido(ibanTecleado)) {
    return NextResponse.json(
      {
        estado: 'error',
        causa: 'faltan_campos',
        mensaje: `El IBAN tecleado (${ibanEnmascarado(ibanTecleado)}) no pasa los dígitos de control: revísalo.`,
        faltan: ['iban'],
        campos: null,
      },
      { status: 422 },
    )
  }
  const ibanFicha = ibanTecleado ?? ibanEnCampos(camposBase) ?? ibanDeFicha([poliza.cuenta_poliza, poliza.cuenta_cliente])
  const camposEnvio = ibanFicha ? conCuentaBancaria(camposBase, ibanFicha) : camposBase

  const r = resolverConfigEmision()
  if (r.estado !== 'lista') {
    return NextResponse.json(
      {
        estado: 'error',
        causa: 'apagado',
        mensaje: r.estado === 'apagado' ? r.motivo : `faltan variables: ${r.faltan.join(', ')}`,
      },
      { status: 503 },
    )
  }

  // GRATIS: lo que el vendor dice que hace falta. Informativo — no bloquea el
  // Submit si no se pudo leer (un endpoint sin fixture puede tener otra forma
  // de la que se ha adivinado); lo que sí decide si algo faltaba de verdad es
  // la respuesta del propio Submit.
  const campos = await camposDeEmision(r.config, projectId, p.accepted_offer_id_codeoscopic).catch(
    () => null,
  )
  const faltan = (campos ?? [])
    .filter((c) => c.obligatorio && !(c.id in camposEnvio))
    .map((c) => c.id)
  if (faltan.length > 0) {
    return NextResponse.json(
      {
        estado: 'error',
        causa: 'faltan_campos',
        mensaje: 'el vendor pide estos campos para emitir y no han llegado en `campos`',
        faltan,
        campos,
      },
      { status: 422 },
    )
  }

  const envio = await enviarEmision(r.config, {
    correduriaId: correduria.id,
    projectId,
    offerId: p.accepted_offer_id_codeoscopic,
    campos: camposEnvio,
  })

  if (!envio.ok) {
    // «The bank account is mandatory according to the selected companies and
    // payment types.» — no es un fallo del vendor: es un dato que falta. Se
    // devuelve como hueco para que plataforma pinte la caja del IBAN. Si YA se
    // mandó una cuenta y la compañía sigue pidiéndola, se dice cuál (enmascarada)
    // para que nadie crea que no viajó.
    if (envio.razon === 'vendor' && esFalloDeCuentaBancaria(envio.mensaje)) {
      return NextResponse.json(
        {
          estado: 'error',
          causa: 'faltan_campos',
          mensaje: ibanFicha
            ? `La compañía exige cuenta bancaria para esta forma de pago y se le mandó ${ibanEnmascarado(ibanFicha)}, ` +
              'pero la sigue pidiendo: revisa la respuesta completa (`crudo`) antes de repetir.'
            : 'La compañía exige una cuenta bancaria (IBAN) para esta forma de pago, y ni la póliza ni la ficha ' +
              'del cliente la tienen. Tecléala y vuelve a emitir: no se ha emitido nada.',
          faltan: ['iban'],
          campos: null,
          crudo: envio.crudo ?? null,
        },
        { status: 422 },
      )
    }
    return NextResponse.json(
      { estado: 'error', causa: envio.razon, mensaje: envio.mensaje, crudo: envio.crudo ?? null },
      { status: envio.razon === 'en-vuelo' ? 409 : 502 },
    )
  }

  // ── El vendor aceptó: se acuña la póliza en NUESTRA BD ──────────────────
  const catalogo = await catalogoCompanias()
  const codigoDgs = catalogo?.find((c) => coincideCompania(c.nombreComun, p.aseguradora!))?.codigoDgs ?? null
  if (!codigoDgs) {
    // El vendor YA aceptó el Submit: esto NO se pierde. Se deja constancia del
    // aviso y de la respuesta cruda para que se acuñe a mano — un dato de
    // nuestro catálogo que falta no puede borrar una emisión real.
    return NextResponse.json({
      estado: 'emitido_sin_acunar',
      mensaje:
        `Codeoscopic aceptó la emisión pero «${p.aseguradora}» no tiene código DGS en companias_dgs: ` +
        'la póliza NO se ha acuñado sola. Añade el código y acúñala a mano con este `crudo`.',
      referenciaVendor: envio.referenciaVendor,
      crudo: envio.crudo,
    })
  }

  const acunado = await registrarPolizaEmitida(correduria.id, {
    clienteId: poliza.cliente_id,
    actor,
    proyecto: {
      projectIdCodeoscopic: projectId,
      producto: poliza.tipo,
      codigoDgs,
      numeroPoliza: envio.referenciaVendor,
      primaAnual: numero(cuerpo.primaAnual),
      emitidaEn: new Date().toISOString(),
      riesgo: esObjeto(poliza.datos_especificos) ? poliza.datos_especificos : null,
      fraccionamiento: poliza.fraccionamiento,
    },
  })

  return NextResponse.json({
    estado: acunado.ok ? 'ok' : 'emitido_sin_acunar',
    referenciaVendor: envio.referenciaVendor,
    acunado,
    crudo: envio.crudo,
  })
}

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

/**
 * La primera cuenta VÁLIDA de la ficha, descifrada. 🚨 Sin `PII_ENCRYPTION_KEY`,
 * `decryptField` devuelve el cifrado tal cual (`v1:…`) sin lanzar: eso no es un
 * IBAN y no pasa `ibanValido`, así que no puede viajar al vendor. Ilegible o
 * inválido = «no lo sé», y lo pide la pantalla.
 */
function ibanDeFicha(candidatas: (string | null)[]): string | null {
  for (const cifrada of candidatas) {
    if (!cifrada) continue
    let claro: string | null
    try {
      claro = decryptField(cifrada)
    } catch {
      continue
    }
    if (claro === null || claro.startsWith('v1:')) continue
    const iban = normalizarIban(claro)
    if (iban && ibanValido(iban)) return iban
  }
  return null
}

function numero(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function coincideCompania(nombreComun: string, aseguradora: string): boolean {
  const a = nombreComun.trim().toLowerCase()
  const b = aseguradora.trim().toLowerCase()
  return a === b || a.includes(b) || b.includes(a)
}
