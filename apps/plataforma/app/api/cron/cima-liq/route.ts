// /api/cron/cima-liq — libro de comisiones de la correduría.
//
// Tres ejes por (compañía, periodo): DEVENGADO (recibos cobrados) → LIQUIDADO
// (extracto de la compañía) → COBRADO (BBVA). Cada salto tiene su propio fallo,
// y llamarlos a todos «descuadre» impedía saber a quién reclamar.
//
// 🚨 Antes esto hablaba SOAP directo contra `ws.cimaseg.es` con un parser del
// fichero LIQ adivinado y un mapa de compañías equivocado (códigos numéricos
// cuando los reales son C0058/C0109/C0468/C0613). Nunca se validó —el endpoint
// devolvía 404— y por eso vivía apagado. Ahora lee el puerto de central-asegura,
// que sirve lo que el JAR oficial de TIREA ya dejó parseado, con la comisión,
// la retención y la remesa SEPARADAS.
import { NextRequest, NextResponse } from 'next/server'
import { secretoCoincide, autorizacionBearerValida } from '@central/core-identity'
import { prisma } from '@/lib/db'
import { eur } from '@/lib/dinero'
import { tgAviso } from '@/lib/telegram/avisos'
import { comisionesAsegura, nombreCompania } from '@/lib/comisiones-asegura'
import { describirCausaAsegura } from '@/lib/correduria-puerto'
import { registrarLatido } from '@/lib/monitoring/latido-escribir'
import { estadoCuadre, remesaEfectiva, mesEnPeriodo, finDeMes, ESTADOS_PENDIENTES, type EstadoCuadre } from '@/lib/correduria/cuadre'
import { bancoDePeriodo, casarAbonos, rangoAbonos, type AbonoBanco } from '@/lib/correduria/casar-banco'
import { cuentaDelLibro } from '@/lib/correduria/cuenta-libro'
import { fusionarExtractosPdf, type FilaLibro } from '@/lib/correduria/liquidacion-doc'
import { leerLiquidacionDocs } from '@/lib/correduria/liquidacion-doc-db'
import { alertasCuadreComisiones, type AlertaComisiones, type PeriodoAviso } from '@/lib/correduria/cuadre-avisos'
import { decidirEnvios, hashTexto } from '@/lib/fiscal-alertas'
import { enviosPrevios, registrarEnvio } from '@/lib/fiscal-alertas-db'
import { hoyMadrid } from '@/lib/cierre-mes'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Huella de la pasada. Hace falta porque este cron solo habla cuando ENCUENTRA
 * algo: un año entero sin descuadres y un cron muerto son el mismo silencio, y
 * lo que hay detrás es el libro de comisiones (dinero que se reclama o no se
 * reclama a la compañía). Los dos caminos de «no he podido mirar» —puerto sin
 * configurar y error de lectura— laten con `ok=false` a propósito: son justo
 * los que hoy devolvían 200 y se leían como una pasada buena.
 */
const AGENTE = 'cima_liq'

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const ok =
    autorizacionBearerValida(req, 'CRON_SECRET') ||
    secretoCoincide(req.nextUrl.searchParams.get('secret'), secret)
  if (!ok) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // 🚨 De QUIÉN es el libro. Era `SELECT id FROM cuentas LIMIT 1` sin orden: con tres cuentas en la BD,
  // Postgres devolvía la que le venía bien, y desde el 20/09/2026 escribía en una cuenta SIN bancos —
  // el libro de Alberto se quedó congelado ese día y nada falló. Ahora: las cuentas con acceso a la
  // correduría (`CORREDURIA_EMAILS`, la misma lista que guarda `/correduria`), y entre ellas la que
  // recibe los abonos de seguros en sus bancos.
  // Sin la lista no se escribe nada (fail-closed, igual que `/correduria`): «no sé de quién es el libro»
  // no autoriza a escribirlo en una cuenta cualquiera. La regla vive en `lib/correduria/cuenta-libro.ts`
  // (la comparte el lector de liquidaciones PDF del agente de facturas).
  const cuenta = await cuentaDelLibro()
  if (!cuenta.ok) {
    await registrarLatido(AGENTE, false, cuenta.motivo)
    return NextResponse.json({ ok: false, msg: cuenta.motivo })
  }
  const cuentaId = cuenta.cuentaId
  // Una cuenta sin un solo abono de seguros deja el tramo del banco a «—» en todo el libro: es
  // exactamente el fallo del 20/09, así que el latido no puede quedar verde.
  const avisoCuenta = cuenta.abonos === 0
    ? 'la cuenta elegida no tiene abonos de seguros en sus bancos: el tramo del banco no se ha podido cruzar'
    : null

  // Desde el 1 de diciembre del año anterior: en enero llega la liquidación de diciembre, y sin ese
  // periodo en el libro su abono no tendría a dónde ir.
  const anio = new Date().getFullYear()
  const com = await comisionesAsegura(`${anio - 1}-12-01`)

  if (com.estado === 'sin_configurar') {
    // El puerto no está conectado. NO es «no hay comisiones»: no se escribe nada
    // ni se avisa, porque no hay nada que reclamar todavía.
    //
    // Pero SÍ late en falso: «no se ha podido mirar» no es «va bien». Sin esto,
    // un `ASEGURA_OPERADOR_SECRET` que se caiga deja el libro de comisiones
    // congelado y la pasada devolviendo 200 para siempre.
    await registrarLatido(AGENTE, false, 'puerto sin configurar (falta ASEGURA_OPERADOR_SECRET)')
    return NextResponse.json({ ok: true, msg: 'Puerto de asegura sin configurar' })
  }

  if (com.estado === 'error') {
    // 🚨 No se ha podido mirar ≠ no hay. Se marca el libro como NO comprobado
    // (en vez de dejar importes viejos pasando por vigentes) y se dice.
    await prisma.$executeRaw`
      UPDATE comisiones_devengo SET leido_ok = false, actualizado_at = now()
      WHERE cuenta_id = ${cuentaId}::uuid`
    await tgAviso(
      'correduria.cima-liq',
      `⚪ <b>Comisiones</b> — no se ha podido leer la cartera (<code>${com.motivo}</code>).\n` +
        // La causa es la mitad útil del aviso: `asegura_error` sin ella no dice
        // si hay que tocar la contraseña, los permisos o el schema. Si asegura no
        // la manda se DICE que no se sabe, no se deja el hueco en blanco.
        `Causa: ${describirCausaAsegura(com.causa) ?? '<i>sin causa — asegura no la manda</i>'}\n` +
        `El libro queda marcado como <b>no comprobado</b>, no a cero.`,
      { html: true },
    )
    await registrarLatido(AGENTE, false, `no se pudo leer la cartera: ${com.motivo}${com.causa ? ` (${com.causa})` : ''}`)
    return NextResponse.json({ ok: false, motivo: com.motivo, causa: com.causa ?? null }, { status: 502 })
  }

  // ── Cobertura por compañía ────────────────────────────────────────────────
  // Sin esto, el total anual parecería completo estando ciego a las compañías
  // que no tienen ninguna fuente.
  for (const k of com.cobertura) {
    await prisma.$executeRaw`
      INSERT INTO comisiones_cobertura
        (cuenta_id, compania_codigo, compania, tiene_recibos_cima, desde_recibos, tiene_liq_cima, actualizado_at)
      VALUES (${cuentaId}::uuid, ${k.companiaCodigo}, ${nombreCompania(k.companiaCodigo)},
              ${k.recibos > 0}, ${k.primerRecibo}::date, ${k.liquidaciones > 0}, now())
      ON CONFLICT (cuenta_id, compania_codigo) DO UPDATE SET
        compania = EXCLUDED.compania,
        tiene_recibos_cima = EXCLUDED.tiene_recibos_cima,
        desde_recibos = EXCLUDED.desde_recibos,
        tiene_liq_cima = EXCLUDED.tiene_liq_cima,
        actualizado_at = now()`
  }
  const conCobertura = new Set(
    com.cobertura.filter(k => k.recibos > 0 || k.liquidaciones > 0).map(k => k.companiaCodigo),
  )

  // ── Un periodo por liquidación, más los meses que SOLO tienen devengo ──────
  // Los segundos son justo el caso Mapfre: devenga comisión y no manda extracto.
  const filasCima: FilaLibro[] = com.periodos.map(p => ({
    codigo: p.companiaCodigo,
    inicio: p.periodoInicio,
    fin: p.periodoFin,
    bruto: p.liqBruto,
    ret: p.liqRetencion,
    remesa: p.liqRemesa,
    hash: p.liqHash,
    origen: 'cima' as const,
  }))

  // ── Liquidaciones que llegaron por CORREO (PDF, agente de facturas) ───────
  // Rellenan el eje LIQUIDADO solo donde CIMA no lo trae (CIMA manda). Va ANTES de las filas de «solo
  // devengo»: un mes cubierto por un PDF no puede quedar además como fila suelta. `null` = la tabla no
  // se pudo leer: se sigue solo con CIMA y se dice en el latido.
  const docs = await leerLiquidacionDocs(cuentaId, `${anio - 1}-12-01`)
  const manuales = await prisma.$queryRaw<Array<{ codigo: string; inicio: string; fin: string }>>`
    SELECT compania_codigo AS codigo, to_char(periodo_inicio, 'YYYY-MM-DD') AS inicio, to_char(periodo_fin, 'YYYY-MM-DD') AS fin
    FROM comisiones_devengo
    WHERE cuenta_id = ${cuentaId}::uuid AND liq_origen = 'manual' AND liq_bruto IS NOT NULL`
  const fusion = fusionarExtractosPdf(filasCima, docs ?? [], manuales)
  const filas = fusion.filas
  for (const codigo of new Set(fusion.filas.filter(f => f.origen === 'pdf').map(f => f.codigo))) {
    conCobertura.add(codigo)
    await prisma.$executeRaw`
      INSERT INTO comisiones_cobertura (cuenta_id, compania_codigo, compania, tiene_correo_importe, actualizado_at)
      VALUES (${cuentaId}::uuid, ${codigo}, ${nombreCompania(codigo)}, true, now())
      ON CONFLICT (cuenta_id, compania_codigo) DO UPDATE SET tiene_correo_importe = true, actualizado_at = now()`
  }
  for (const d of com.devengos) {
    const yaEsta = filas.some(f => f.codigo === d.companiaCodigo && mesEnPeriodo(d.mes, f.inicio, f.fin))
    if (!yaEsta) {
      filas.push({
        codigo: d.companiaCodigo,
        inicio: `${d.mes}-01`,
        fin: finDeMes(d.mes),
        bruto: null,
        ret: null,
        remesa: null,
        hash: null,
        origen: 'cima',
      })
    }
  }

  // ── El banco: cada abono de seguros a UN periodo como mucho (`casar-banco.ts`) ─
  // Occident manda bruto negativo con remesa 0 y cobra |bruto| − retención: se casa por ESA remesa.
  const periodosLiq = filas.map(f => ({ codigo: f.codigo, inicio: f.inicio, fin: f.fin, remesa: remesaEfectiva(f.bruto, f.ret, f.remesa) }))
  const rango = rangoAbonos(periodosLiq)
  const abonos: AbonoBanco[] = rango === null ? [] : (await prisma.$queryRaw<Array<{
    id: string; fecha: string; importe: number; concepto: string | null; concepto_normalizado: string | null
    contraparte: string | null; compania_seguros: string | null
  }>>`
    SELECT mb.id::text AS id, to_char(mb.fecha_operacion, 'YYYY-MM-DD') AS fecha, mb.importe::float AS importe,
           mb.concepto, mb.concepto_normalizado, mb.contraparte, mb.compania_seguros
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
      AND mb.destino = 'seguros'
      AND mb.importe > 0
      AND coalesce(mb.duplicado_estado, '') <> 'ignorado'
      AND mb.fecha_operacion >= ${rango.desde}::date
      AND mb.fecha_operacion <= ${rango.hasta}::date
    ORDER BY mb.fecha_operacion, mb.id`).map(r => ({
      id: r.id, fecha: r.fecha, importe: Number(r.importe), concepto: r.concepto,
      conceptoNormalizado: r.concepto_normalizado, contraparte: r.contraparte, companiaSeguros: r.compania_seguros,
    }))
  const reglas = new Map((await prisma.$queryRaw<Array<{ clave: string; compania: string }>>`
    SELECT clave, compania FROM correduria_reglas WHERE cuenta_id = ${cuentaId}::uuid`).map(r => [r.clave, r.compania]))
  const casado = casarAbonos(periodosLiq, abonos, reglas)

  // Avisos con clave estable: pasan por el dedupe de `fiscal_avisos_enviados` al final.
  const alertas: AlertaComisiones[] = []
  // Un abono que liquida varias remesas y trae de MÁS: el sobrante no se reparte (no hay columna ni
  // criterio para saber a qué periodo va), se deja constancia aquí.
  for (const e of casado.excedentes) {
    alertas.push({
      clave: `comisiones-excedente-${e.abonoId}`,
      suave: false,
      texto: `🔴 <b>Comisiones · ${nombreCompania(e.codigo)}</b>: el abono ${e.abonoId.slice(0, 8)} (${eur(e.importe)}) liquida varias remesas por ${eur(e.sumaRemesas)} ` +
        `y sobran ${eur(e.excedente)} sin repartir. Revísalo en <b>/correduria</b>.`,
    })
  }
  const periodosAviso: PeriodoAviso[] = []
  let pendientes = 0

  for (const f of filas) {
    const delPeriodo = com.devengos.filter(
      d => d.companiaCodigo === f.codigo && mesEnPeriodo(d.mes, f.inicio, f.fin),
    )
    const recibos = delPeriodo.reduce((s, d) => s + d.recibos, 0)
    const esperado = recibos > 0 ? Math.round(delPeriodo.reduce((s, d) => s + d.bruto, 0) * 100) / 100 : null

    const { total: bancoTotal, ids: bancoIds } = bancoDePeriodo(
      { codigo: f.codigo, inicio: f.inicio, fin: f.fin, remesa: remesaEfectiva(f.bruto, f.ret, f.remesa) }, casado, abonos)

    await prisma.$executeRaw`
      INSERT INTO comisiones_devengo
        (cuenta_id, compania_codigo, compania, periodo_inicio, periodo_fin,
         esperado_bruto, esperado_recibos, liq_bruto, liq_retencion, liq_remesa,
         liq_origen, liq_hash, banco_total, banco_movimiento_ids, leido_ok, actualizado_at)
      VALUES (${cuentaId}::uuid, ${f.codigo}, ${nombreCompania(f.codigo)},
              ${f.inicio}::date, ${f.fin}::date,
              ${esperado}, ${recibos > 0 ? recibos : null},
              ${f.bruto}, ${f.ret}, ${f.remesa},
              ${f.bruto == null ? null : f.origen}, ${f.hash},
              ${bancoTotal}, ${bancoIds}::uuid[], true, now())
      ON CONFLICT (cuenta_id, compania_codigo, periodo_inicio, periodo_fin) DO UPDATE SET
        compania = EXCLUDED.compania,
        esperado_bruto = EXCLUDED.esperado_bruto,
        esperado_recibos = EXCLUDED.esperado_recibos,
        -- coalesce: lo que ya se confirmó a mano (Mapfre) no lo pisa un NULL
        -- de CIMA, que sigue sin mandar extracto.
        liq_bruto = coalesce(EXCLUDED.liq_bruto, comisiones_devengo.liq_bruto),
        liq_retencion = coalesce(EXCLUDED.liq_retencion, comisiones_devengo.liq_retencion),
        liq_remesa = coalesce(EXCLUDED.liq_remesa, comisiones_devengo.liq_remesa),
        liq_origen = coalesce(EXCLUDED.liq_origen, comisiones_devengo.liq_origen),
        liq_hash = coalesce(EXCLUDED.liq_hash, comisiones_devengo.liq_hash),
        banco_total = EXCLUDED.banco_total,
        banco_movimiento_ids = EXCLUDED.banco_movimiento_ids,
        leido_ok = true,
        actualizado_at = now()`

    const estado: EstadoCuadre = estadoCuadre({
      leidoOk: true,
      tieneCobertura: conCobertura.has(f.codigo),
      esperadoBruto: esperado,
      liqBruto: f.bruto,
      liqRetencion: f.ret,
      liqRemesa: f.remesa,
      bancoTotal,
    })

    if (ESTADOS_PENDIENTES.includes(estado)) pendientes++
    periodosAviso.push({
      codigo: f.codigo, compania: nombreCompania(f.codigo), inicio: f.inicio, fin: f.fin, leidoOk: true,
      esperadoBruto: esperado, liqBruto: f.bruto, liqRetencion: f.ret, liqRemesa: f.remesa, bancoTotal,
      liqOrigen: f.bruto == null ? null : f.origen,
    })
  }

  // ── Cuadre mensual por compañía (lib/correduria/cuadre-avisos.ts) ─────────
  // (a) devengado sin abono > 60 días · (b) neto vs banco > 5 € · (c) abono sin liquidación (suave).
  const hoy = hoyMadrid()
  alertas.push(...alertasCuadreComisiones(periodosAviso, hoy))

  // 🚨 Comisiones que la compañía informó y NO se pudieron leer. Van SIEMPRE,
  // aunque todo lo demás cuadre: un devengo calculado sobre recibos ilegibles
  // es más BAJO que el real, así que «cuadra» puede significar «cuadra con una
  // cifra incompleta» — que es precisamente cuando se deja de reclamar algo.
  // `null` (una asegura más vieja no manda el campo) NO se cuenta como 0: se
  // dice que no se sabe.
  // 🚨 Y el hueco que está POR ENCIMA de todos: la lectura vino RECORTADA.
  // Un devengo calculado sobre parte de los recibos no es «cuadra con una
  // cifra incompleta»: es un libro al que le faltan periodos enteros. Por eso
  // el año se marca `leido_ok = false` —que es el mismo camino que ya existía
  // para el fallo de lectura, y que `estadoCuadre` pinta como `no-comprobado`—
  // en vez de dejar filas con cara de comprobadas.
  //
  // `truncado === null` (una asegura más vieja no manda el campo) NO se trata
  // como `false`: no se marca nada, pero tampoco se afirma que el libro esté
  // completo — se dice en el latido y en la respuesta. El libro se comporta
  // como antes de que el campo existiera, que es lo único honesto que se puede
  // hacer sin el dato.
  if (com.truncado === true) {
    await prisma.$executeRaw`
      UPDATE comisiones_devengo SET leido_ok = false, actualizado_at = now()
      WHERE cuenta_id = ${cuentaId}::uuid
        AND periodo_inicio >= ${`${anio}-01-01`}::date`
    await tgAviso(
      'correduria.cima-liq',
      `⚠️ <b>Comisiones</b> — la cartera vino <b>RECORTADA</b>: asegura tocó su techo de lectura, ` +
        `así que faltan recibos y/o liquidaciones y el devengado de ${anio} sale más BAJO que el real.
` +
        `El libro queda marcado como <b>no comprobado</b>, no a cero. Hay que subir el tope en ` +
        `<code>apps/asegura/lib/cartera-techos.ts</code>.`,
      { html: true },
    )
  }

  const sinDato = com.devengos.some(d => d.ilegibles == null)
  const ilegibles = com.devengos.reduce((s, d) => s + (d.ilegibles ?? 0), 0)
  if (sinDato) {
    alertas.push({ clave: 'comisiones-ilegibles', suave: true, texto: '⚪ <b>Comisiones</b> — no se sabe cuántos recibos tienen la comisión ilegible (asegura no lo informa): el devengado puede ser un suelo.' })
  } else if (ilegibles > 0) {
    alertas.push({ clave: 'comisiones-ilegibles', suave: false, texto: `⚠️ <b>Comisiones</b> — ${ilegibles} recibo(s) cobrados con la comisión ILEGIBLE: el devengado es un suelo, no el total. Revisa en <b>/correduria</b>.` })
  }

  // Sin repetir: el mismo aviso (clave + contenido) no vuelve en 7 días (30 los suaves); si el contenido
  // cambia, es un aviso nuevo. Mismo mecanismo que los avisos fiscales (`fiscal_avisos_enviados`;
  // sin la tabla, fail-open: se avisa sin dedupe).
  const previos = await enviosPrevios(cuentaId)
  const ahora = new Date()
  const aEnviar = [
    ...decidirEnvios(alertas.filter(a => !a.suave), previos, ahora, 7),
    ...decidirEnvios(alertas.filter(a => a.suave), previos, ahora, 30),
  ]
  for (const a of aEnviar) {
    const id = await tgAviso('correduria.cima-liq', a.texto, { html: true })
    if (id != null) await registrarEnvio(cuentaId, a.clave, hashTexto(a.texto))
  }
  const avisos = alertas.filter(a => !a.suave)

  // Una lectura recortada tiñe el latido: el libro de ese año NO está
  // comprobado, y un latido verde diría lo contrario. `null` no lo tiñe (no se
  // sabe, y no saberlo es el estado anterior a que existiera el campo), pero sí
  // se DICE en el detalle: es donde se mira cuando algo no cuadra.
  const notaTecho =
    com.truncado === true
      ? 'LECTURA RECORTADA: faltan periodos, el libro queda no comprobado'
      : com.truncado === null
        ? 'no se sabe si la lectura vino recortada (asegura no lo informa)'
        : 'lectura completa'
  const pasadaOk = com.truncado !== true && avisoCuenta === null
  await registrarLatido(
    AGENTE,
    pasadaOk,
    [
      avisoCuenta,
      `${filas.length} periodo(s) cuadrados · ${avisos.length} con dinero que no cuadra · ${pendientes} sin dato o sin fuente`,
      sinDato ? 'comisiones ilegibles: no se sabe' : `${ilegibles} recibo(s) con comisión ilegible`,
      casado.sinPeriodo > 0 ? `${casado.sinPeriodo} abono(s) de seguros sin periodo en el libro` : null,
      docs === null
        ? 'liquidaciones PDF: no se pudieron leer'
        : `liquidaciones PDF: ${fusion.usados.length} al libro, ${fusion.noUsados.length} sin usar` +
          (fusion.informativos.length ? `, ${fusion.informativos.length} mes(es) solo con avisos ADXP (informativo)` : ''),
      notaTecho,
    ].filter(Boolean).join(' · '),
  )
  return NextResponse.json({
    ok: pasadaOk,
    cuentaSinAbonos: avisoCuenta !== null,
    // Abonos de una compañía del libro que no se han podido atribuir a ningún periodo (su mes no está).
    abonosSinPeriodo: casado.sinPeriodo,
    periodos: filas.length,
    avisos: avisos.length,
    avisosEnviados: aEnviar.map(a => a.clave),
    liquidacionesPdf: docs === null ? null : { usadas: fusion.usados, sinUsar: fusion.noUsados, informativos: fusion.informativos },
    pendientes,
    // `null` = asegura no lo informa. No es 0. Igual que `recibosComisionIlegible`.
    lecturaTruncada: com.truncado,
    recibosComisionIlegible: sinDato ? null : ilegibles,
  })
}
