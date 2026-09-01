import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { isCronAuthorized } from '@/lib/cron-auth'
import { tgAviso } from '@/lib/telegram'
import { getPLMensual, mesPorDefecto } from '@/lib/sivra/pl-mensual'
import { getResumenFinanciero } from '@/lib/finanzas'
import { calcularEstadoDeclaracion } from '@/lib/comparativa-declaracion'
import { facturasMensualesFaltantes } from '@/lib/sivra/facturas-mensuales'
import { eur } from '@/lib/dinero'
import { veredictoLiquidacion } from '@/lib/cuadre-tarjetas'
import { sondearProveedoresIA, TIMEOUT_MS as SONDA_TIMEOUT_MS } from '@/lib/monitoring/sonda-ia'
import { estadoPresupuesto, PROVEEDOR_PASARELA } from '@/lib/ai-gateway'
import { veredictoSonda } from '@/lib/monitoring/sonda-veredicto'
import type { TraficoRealProveedor } from '@/lib/monitoring/sonda-veredicto'
import type { NextRequest } from 'next/server'

// 180 y no 60: la sonda de proveedores (Check 13) añade hasta ~60 s de pings (timeout de 30 s ×2
// intentos si el primero expira — mismo timeout que el tráfico real; NIM gratis responde en ~26 s
// de media) y el resto de checks ya rondaban el techo. El dispatcher tolera hasta 280 s por job.
export const maxDuration = 180

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const hoy = new Date().toISOString().slice(0, 10)
  const hace60 = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const fallos: string[] = []
  const ok: string[] = []

  try {
    // Check 1: Duplicados activos
    const dup = await prisma.$queryRaw<Array<{ n: bigint }>>(Prisma.sql`
      SELECT COUNT(*) as n FROM (
        SELECT fecha_operacion, importe, cuenta_bancaria_id FROM movimientos_bancarios
        WHERE COALESCE(duplicado_estado,'') <> 'ignorado'
        GROUP BY fecha_operacion, importe, cuenta_bancaria_id HAVING COUNT(*) > 1
      ) t
    `)
    const nDup = Number(dup[0]?.n ?? 0)
    if (nDup > 0) fallos.push(`🔴 ${nDup} grupos de duplicados activos en movimientos_bancarios`)
    else ok.push('✅ Sin duplicados activos')

    // Check 2: Backlog requiere_revision — SOLO lo genuinamente sin clasificar
    // (marcado Y aún sin confirmar). Un movimiento con destino_confirmado=true ya está
    // clasificado aunque conserve la bandera (varios saneos SQL fijaron el destino sin
    // limpiar requiere_revision → ~937 falsos positivos que inflaban el 🔴). El resto de
    // la app ya usa esta misma semántica (finanzas.ts, contable/*).
    const rev = await prisma.$queryRaw<Array<{ n: bigint }>>(Prisma.sql`
      SELECT COUNT(*) as n FROM movimientos_bancarios
      WHERE requiere_revision = true
        AND COALESCE(destino_confirmado, false) = false
        AND COALESCE(duplicado_estado,'') <> 'ignorado'
    `)
    const nRev = Number(rev[0]?.n ?? 0)
    if (nRev > 200) fallos.push(`🔴 Backlog requiere_revision: ${nRev} movimientos sin clasificar`)
    else if (nRev > 100) fallos.push(`🟡 Backlog requiere_revision: ${nRev} movimientos`)
    else ok.push(`✅ Backlog requiere_revision: ${nRev} (OK)`)

    // Check 3: Cuadre OTA vs banco (ventana 60 días)
    const cuadre = await prisma.$queryRaw<Array<{ origen: string; total: number }>>(Prisma.sql`
      SELECT 'incomes' as origen, COALESCE(SUM(amount),0)::float as total
      FROM incomes WHERE portal IN ('BOOKING','AIRBNB','EXPEDIA','AGODA')
        AND "checkOut"::date <= ${hoy}::date AND "checkOut"::date >= ${hace60}::date
      UNION ALL
      SELECT 'banco' as origen, COALESCE(SUM(importe),0)::float as total
      FROM movimientos_bancarios
      WHERE importe > 0 AND destino IN ('turistico_duplex','turistico_pisos')
        AND COALESCE(duplicado_estado,'') <> 'ignorado'
        AND fecha_operacion BETWEEN ${hace60}::date AND ${hoy}::date
    `)
    const totalInc = cuadre.find(r => r.origen === 'incomes')?.total ?? 0
    const totalBanco = cuadre.find(r => r.origen === 'banco')?.total ?? 0
    const ratio = totalInc > 0 ? totalBanco / totalInc : 0
    if (ratio < 0.7) fallos.push(`🔴 Cuadre OTA: banco ${eur(Number(totalBanco))} vs incomes ${eur(Number(totalInc))} (ratio ${ratio.toFixed(2)} < 0.70)`)
    else ok.push(`✅ Cuadre OTA: banco/incomes ratio ${ratio.toFixed(2)}`)

    // Check 4: salud del SYNC de Smoobu — por LATIDO (agente_latidos.'smoobu_sync'), no por la
    // última reserva. runSync registra intento al empezar y pasada buena al terminar (job diario
    // de las 05:00 o webhook), haya o no reservas; MAX(createdAt) de incomes solo mide cuándo
    // entró la última reserva NUEVA, y una racha sin reservas (sequía 25/07→01/08) NO es un
    // fallo del sync — feedback de Alberto 01/08/2026: no pintarla de 🔴, decir qué es.
    const [latidoSmoobu, ultimoIncome] = await Promise.all([
      prisma.$queryRaw<Array<{ ultimo_at: Date | null; ultimo_ok_at: Date | null }>>(Prisma.sql`
        SELECT ultimo_at, ultimo_ok_at FROM agente_latidos WHERE agente = 'smoobu_sync'
      `).catch(() => [] as Array<{ ultimo_at: Date | null; ultimo_ok_at: Date | null }>),
      prisma.$queryRaw<Array<{ ultima: Date }>>(Prisma.sql`
        SELECT MAX("createdAt") as ultima FROM incomes
      `),
    ])
    const diasSinReserva = ultimoIncome[0]?.ultima
      ? Math.floor((Date.now() - new Date(ultimoIncome[0].ultima).getTime()) / 86400000)
      : null
    const notaReserva = diasSinReserva === null ? ''
      : diasSinReserva > 2 ? ` — sin reservas nuevas desde hace ${diasSinReserva}d (temporada floja, no es un fallo)`
      : ` — última reserva nueva hace ${diasSinReserva}d`
    const horasSinLatidoOk = latidoSmoobu[0]?.ultimo_ok_at
      ? (Date.now() - new Date(latidoSmoobu[0].ultimo_ok_at).getTime()) / 3_600_000
      : null
    if (horasSinLatidoOk === null) {
      // Sin pasada buena registrada (el sync aún no corrió con el código nuevo, o muere siempre):
      // distinguir «no se dispara» de «se dispara y no termina» (landmine 31/07/2026).
      const intento = latidoSmoobu[0]?.ultimo_at
      if ((diasSinReserva ?? 999) <= 2) ok.push('✅ Smoobu sync: sin latido aún, pero con reservas recientes')
      else if (intento) fallos.push(`🔴 Smoobu sync AVERIADO: se dispara (último intento ${new Date(intento).toISOString().slice(0, 16)}Z) pero nunca termina una pasada${notaReserva}`)
      else fallos.push(`🔴 Smoobu sync: sin ningún latido registrado y sin reservas nuevas desde hace ${diasSinReserva ?? '?'}d (¿el job updates/sync no se dispara?)`)
    } else if (horasSinLatidoOk > 26) {
      // El job es diario: >26h sin pasada buena = el sync NO está corriendo (o muere a medias).
      fallos.push(`🔴 Smoobu sync AVERIADO: sin pasada completa desde hace ${(horasSinLatidoOk / 24).toFixed(1)}d (revisa el job updates/sync del dispatcher)${notaReserva}`)
    } else {
      ok.push(`✅ Smoobu sync: activo (latido hace ${Math.round(horasSinLatidoOk)}h)${notaReserva}`)
    }

    // Check 5: Incomes con amount NULL
    const nullAmt = await prisma.$queryRaw<Array<{ n: bigint }>>(Prisma.sql`
      SELECT COUNT(*) as n FROM incomes WHERE amount IS NULL AND portal IN ('BOOKING','AIRBNB','EXPEDIA')
    `)
    const nNull = Number(nullAmt[0]?.n ?? 0)
    if (nNull > 0) fallos.push(`🟡 ${nNull} incomes OTA con amount=NULL`)
    else ok.push('✅ Sin incomes con amount NULL')

    // (Check de "alertas acumuladas" RETIRADO 11/07/2026): contaba filas de la tabla `alertas`,
    // que es de IALIMP (operativa de limpiezas de Sique Brilla), sin filtrar por empresa → metía
    // el backlog de Sique Brilla al Telegram de Alberto. Esas alertas son suyas, no de plataforma:
    // ialimp ya las gestiona (panel 🔔 + cron semanal de aviso por email a la empresa). Plataforma
    // no debe vigilar la tabla de otro tenant. No sustituir por otro conteo de `alertas` aquí.

    // Check 7: Cuadre tarjetas — cada liquidación mensual de tarjeta cargada en una cuenta
    // corriente (TARJ.CRDTO / PAGO DE TARJETA) debe tener importado el DESGLOSE del ciclo
    // que paga → si no, ese gasto es invisible para /finanzas (pasó con la tarjeta de
    // Pilar: 6 meses y ~3.500€ sin desglosar hasta que llegó el PDF, 02/07/2026).
    // Dos pruebas, porque el espejo 'PAGO RECIBO' del mismo día/importe/PAN NO puede existir
    // hasta el mes siguiente (esa línea ABRE el extracto siguiente — landmine 08/08/2026,
    // PR #1300): si no hay espejo, vale como desglose que la cuenta de la tarjeta
    // (TARJETA-KUTXA-<últ.4>, filas que solo pueden venir de un extracto subido) tenga
    // compras del mes del ciclo (el del día anterior a la liquidación). El veredicto y el
    // mensaje viven en lib/cuadre-tarjetas.ts (puro, testeado).
    const liqSinEspejo = await prisma.$queryRaw<Array<{ fecha: Date; importe: number; pan: string | null; compras_ciclo: number; suma_ciclo: number }>>(Prisma.sql`
      SELECT mb.fecha_operacion AS fecha, mb.importe::float AS importe,
             substring(mb.concepto FROM '\\d{10,19}') AS pan,
             COALESCE(det.n, 0)::int AS compras_ciclo,
             COALESCE(det.total, 0)::float AS suma_ciclo
      FROM movimientos_bancarios mb
      JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS n, COALESCE(SUM(-m3.importe), 0) AS total
        FROM movimientos_bancarios m3
        JOIN cuentas_bancarias cb3 ON cb3.id = m3.cuenta_bancaria_id
        WHERE cb3.tipo = 'tarjeta'
          AND cb3.iban LIKE '%' || right(substring(mb.concepto FROM '\\d{10,19}'), 4)
          AND m3.importe < 0
          AND m3.concepto NOT ILIKE '%PAGO RECIBO%'
          AND COALESCE(m3.duplicado_estado,'') <> 'ignorado'
          AND m3.fecha_operacion >= date_trunc('month', mb.fecha_operacion - INTERVAL '1 day')
          AND m3.fecha_operacion < date_trunc('month', mb.fecha_operacion - INTERVAL '1 day') + INTERVAL '1 month'
      ) det ON substring(mb.concepto FROM '\\d{10,19}') IS NOT NULL
      WHERE mb.importe < 0
        AND mb.concepto ~* 'TARJ\\.?\\s*CR[EÉ]?DTO|PAGO DE TARJETA|LIQUIDACI.N (DE )?TARJETA'
        AND COALESCE(mb.duplicado_estado,'') <> 'ignorado'
        AND mb.fecha_operacion >= (${hoy}::date - INTERVAL '75 days')
        AND NOT EXISTS (
          SELECT 1 FROM movimientos_bancarios m2
          WHERE m2.cuenta_bancaria_id <> mb.cuenta_bancaria_id
            AND m2.fecha_operacion = mb.fecha_operacion
            AND m2.importe = -mb.importe
            AND m2.concepto ILIKE '%PAGO RECIBO%'
            AND COALESCE(m2.duplicado_estado,'') <> 'ignorado'
            AND (substring(mb.concepto FROM '\\d{10,19}') IS NULL
                 OR m2.concepto LIKE '%' || substring(mb.concepto FROM '\\d{10,19}') || '%')
        )
      ORDER BY mb.fecha_operacion
    `)
    if (liqSinEspejo.length > 0) {
      for (const l of liqSinEspejo) {
        const v = veredictoLiquidacion({ fecha: l.fecha, importe: l.importe, pan: l.pan, comprasCiclo: l.compras_ciclo, sumaCiclo: l.suma_ciclo })
        if (v.nivel === 'fallo') fallos.push(v.texto)
        else ok.push(v.texto)
      }
    } else ok.push('✅ Cuadre tarjetas: todas las liquidaciones tienen su detalle')

    // Check 8: Justificantes al cierre de trimestre — en los últimos 10 días de cada
    // trimestre, avisa de los gastos DEDUCIBLES del trimestre que siguen sin factura
    // (ni conciliado ni factura_ref). Es el momento barato de pedir duplicados.
    const ahora = new Date(hoy + 'T12:00:00Z')
    const mes = ahora.getUTCMonth()                       // 0-11
    const finTrimestre = new Date(Date.UTC(ahora.getUTCFullYear(), Math.floor(mes / 3) * 3 + 3, 0))
    const diasParaCierre = Math.ceil((finTrimestre.getTime() - ahora.getTime()) / 86400000)
    if (diasParaCierre <= 10) {
      const iniTrimestre = new Date(Date.UTC(ahora.getUTCFullYear(), Math.floor(mes / 3) * 3, 1)).toISOString().slice(0, 10)
      const sinFactura = await prisma.$queryRaw<Array<{ n: bigint; total: number }>>(Prisma.sql`
        SELECT COUNT(*) as n, COALESCE(SUM(-importe),0)::float as total
        FROM movimientos_bancarios
        WHERE importe < 0 AND destino IN ('seguros','turistico_pisos','turistico_duplex')
          AND COALESCE(conciliado,false) = false AND factura_ref IS NULL
          AND COALESCE(amortizable,false) = false
          AND COALESCE(duplicado_estado,'') <> 'ignorado'
          AND fecha_operacion BETWEEN ${iniTrimestre}::date AND ${hoy}::date
      `)
      const nSin = Number(sinFactura[0]?.n ?? 0)
      const totalSin = sinFactura[0]?.total ?? 0
      if (nSin > 0) fallos.push(`🧾 Cierre de trimestre en ${diasParaCierre}d: ${nSin} gastos deducibles sin justificante (${eur(Number(totalSin))}) → /finanzas?tab=gastos`)
      else ok.push('✅ Justificantes: todos los deducibles del trimestre con factura')
    }

    // Check 10: Correduría muda — comisiones entrantes que no llegan a 'seguros'. Vigila la RAÍZ del
    // incidente de julio 2026 (una regla-trampa "TRANSF"→pisos secuestraba las comisiones y la
    // correduría cobraba 0 en silencio). Salta SOLO si en el mes en curso la correduría cobró 0€ Y
    // hay abonos entrantes de BBVA sin identificar (personal/pisos + requiere_revision, sin confirmar):
    // es autolimpiable (al clasificarlos desaparece) → no spamea si de verdad no hubo comisiones.
    const inicioMes = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1)).toISOString().slice(0, 10)
    const corr = await prisma.$queryRaw<Array<{ cobrado: number; sin_ident: bigint }>>(Prisma.sql`
      SELECT
        COALESCE(SUM(mb.importe) FILTER (WHERE mb.destino = 'seguros' AND mb.importe > 0), 0)::float AS cobrado,
        COUNT(*) FILTER (
          WHERE mb.importe > 0 AND mb.requiere_revision = true
            AND COALESCE(mb.destino_confirmado,false) = false
            AND COALESCE(mb.destino,'') NOT IN ('seguros','turistico_duplex')
        ) AS sin_ident
      FROM movimientos_bancarios mb
      JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
      WHERE cb.banco = 'BBVA'
        AND COALESCE(mb.duplicado_estado,'') <> 'ignorado'
        AND mb.fecha_operacion >= ${inicioMes}::date
    `)
    const corrCobrado = corr[0]?.cobrado ?? 0
    const corrSinIdent = Number(corr[0]?.sin_ident ?? 0)
    if (corrCobrado === 0 && corrSinIdent > 0) {
      fallos.push(`🔴 Correduría a 0€ este mes con ${corrSinIdent} abono(s) BBVA sin identificar → revisa clasificación en /banca (¿una regla-trampa manda las comisiones a otro negocio?)`)
    } else ok.push(`✅ Correduría: ${eur(Number(corrCobrado))} cobrado este mes`)

    // Check 11: factura MENSUAL esperada de proveedores fijos (lavandería/limpieza). Vigila la
    // RAÍZ del caso AFV-11625 (mayo 2026): la factura de Giraldillo quedó sin pagar, nadie avisó,
    // y Alberto acabó pagando dos el mismo día. A partir del día 5 del mes, si un proveedor
    // mensual no tiene NI factura en `gastos` NI pago en el banco desde el inicio del mes
    // anterior, se avisa. Autolimpiable: al ingerir la factura o verse el pago, desaparece.
    // La lavandería se vigila GENÉRICA (decisión de Alberto 28/07/2026: hoy es Giraldillo pero
    // puede cambiar de proveedor) — cualquier proveedor/contraparte "lavandería" cuenta.
    const PROVEEDORES_MENSUALES = [
      { nombre: 'Lavandería (Giraldillo u otra)', gastosLike: '%lavander%', bancoLike: '%LAVANDERIA%' },
      { nombre: 'Sique Brilla (limpieza)', gastosLike: '%brilla%', bancoLike: 'SI QUE BRILLA%' },
    ]
    const estadoProveedores = []
    for (const p of PROVEEDORES_MENSUALES) {
      const [g, m] = await Promise.all([
        prisma.$queryRaw<Array<{ f: string | null }>>(Prisma.sql`
          SELECT MAX(fecha)::text AS f FROM gastos WHERE proveedor ILIKE ${p.gastosLike}`),
        prisma.$queryRaw<Array<{ f: string | null }>>(Prisma.sql`
          SELECT MAX(fecha_operacion)::date::text AS f FROM v_movimientos_activos
          WHERE contraparte ILIKE ${p.bancoLike} AND importe < 0`),
      ])
      estadoProveedores.push({ nombre: p.nombre, ultimaFactura: g[0]?.f ?? null, ultimoPago: m[0]?.f ?? null })
    }
    const proveedoresFaltan = facturasMensualesFaltantes(hoy, estadoProveedores)
    if (proveedoresFaltan.length > 0) {
      fallos.push(`🧺 Factura mensual sin rastro del mes pasado: ${proveedoresFaltan.join(' · ')} — ni en gastos ni pagada en el banco (¿se quedó sin pagar como la AFV-11625 de mayo?)`)
    } else ok.push('✅ Facturas mensuales (lavandería/limpieza) al día')

    // Check 11-bis: el desglose de la limpieza DEGRADÓ (25/08/2026). El P&L por piso reparte cada
    // pago a Sique Brilla con su factura si está aportada y, si no, la INFIERE por mejor ajuste al
    // importe. Esa inferencia se rompe sola el día que suban las tarifas o que un movimiento pague
    // dos facturas: el pago cae al reparto proporcional y la pantalla SIGUE enseñando números
    // plausibles. Sin este aviso, la degradación es invisible — que es justo lo que la regla «un
    // dato que NO hay ≠ un dato que no se ha mirado» prohíbe. El aviso lleva a la cura: aportar
    // la factura en /sivra/resultado-pisos.
    for (const m of [mesPorDefecto(), `${ahora.getUTCFullYear()}-${String(ahora.getUTCMonth() + 1).padStart(2, '0')}`]) {
      const pl = await getPLMensual(m).catch(() => null)
      if (pl?.desglose.facturasIlegibles) {
        fallos.push(`🧹 No se pueden leer las facturas de limpieza aportadas (${m}): ${pl.desglose.facturasIlegibles} — el P&L está estimando lo que ya está medido`)
      }
      const aOjo = pl?.desglose.pagos.filter(p => p.origen === 'proporcional' || p.origen === 'partes_iguales') ?? []
      if (aOjo.length) {
        const total = aOjo.reduce((s, p) => s + p.importe, 0)
        fallos.push(
          `🧹 Limpieza sin desglosar en ${m}: ${eur(total)} repartido en proporción (no cuadra con salidas × tarifa) — ` +
          '¿han subido las tarifas o un pago junta dos facturas? Aporta la factura en /sivra/resultado-pisos',
        )
      }
    }

    // Check 9: Smoke-test de los CARGADORES de las páginas clave. Ejecuta las funciones que
    // alimentan /sivra/resultado-pisos, /finanzas y «Mi declaración»; si alguna lanza (p.ej.
    // drift de esquema como una vista sin una columna nueva), avisa. Los demás checks miran
    // calidad de datos, no que las páginas RENDERICEN — este hueco dejó pasar el 500 de
    // /sivra/resultado-pisos (v_movimientos_activos sin propiedad_id, 01–03/07/2026).
    const cuentaSmoke = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM cuentas LIMIT 1`)
    const cid = cuentaSmoke[0]?.id
    const yearSmoke = ahora.getUTCFullYear()
    const smoke: Array<[string, () => Promise<unknown>]> = [
      ['/sivra/resultado-pisos (getPLMensual)', () => getPLMensual(mesPorDefecto())],
    ]
    if (cid) {
      smoke.push(['/finanzas (getResumenFinanciero)', () => getResumenFinanciero(cid, yearSmoke, 0)])
      smoke.push(['/finanzas/fiscal «Mi declaración» (calcularEstadoDeclaracion)', () => calcularEstadoDeclaracion(cid, yearSmoke)])
    }
    for (const [nombre, fn] of smoke) {
      try { await fn(); ok.push(`✅ Smoke ${nombre}`) }
      catch (e) { fallos.push(`🔴 Página rota: ${nombre} → ${e instanceof Error ? e.message : String(e)}`) }
    }

    // Check 12: proveedor de IA MUERTO — el que falla SIEMPRE y nadie echa de menos.
    //
    // Caso fundacional (01/08/2026): `GEMINI_API_KEY` acumulaba **548 llamadas y 0 éxitos** desde el
    // 16/06 —en search, chat, eventos, empresas y contable, con tres modelos distintos— y no saltó
    // nada en mes y medio. La cadena de fallback funcionó tan bien que convirtió una credencial
    // muerta en un peaje invisible: cada llamada pagaba el intento fallido (y su timeout) antes de
    // caer al camino de pago. Una cadena de respaldo sana enmascara la avería del eslabón; por eso
    // hay que mirar el eslabón, no el resultado final.
    //
    // ⚠️ La ventana es de 30 DÍAS y el umbral de 10 llamadas — calibrado contra el caso real, no a
    // ojo. La primera versión miraba 7 días con umbral 20 y NO habría cazado nada: Gemini hace ~12
    // llamadas por semana (los crons que lo usan son diarios, no de tráfico), así que jamás habría
    // llegado a 20 y el check habría dado verde mientras el proveedor llevaba mes y medio muerto.
    // Un vigilante que no puede disparar es peor que no tenerlo, porque tranquiliza.
    //
    // ⚠️ Además el proveedor tiene que seguir RECIBIENDO llamadas (última < 3 días): la alerta
    // denuncia un peaje que se sigue pagando. Cuando el eslabón ya se desenchufó del código (caso
    // Gemini, 02/08/2026) las filas rojas históricas permanecen 30 días en la ventana y sin esta
    // condición el check repetiría la misma alerta cada día sobre un problema ya resuelto — ruido
    // que entrena a ignorar el canal. Un proveedor muerto con cadencia semanal sigue disparando:
    // cada pasada suya renueva los 3 días.
    //
    // ⚠️ Se excluye el pseudo-proveedor 'pasarela' (rechazos PRE-VUELO del propio gate: presupuesto
    // mensual excedido, búsqueda sin configurar): ahí no se llamó a ningún proveedor, así que por
    // definición nunca tendrán un ok=true y dispararían este check para siempre. Caso 25/08/2026:
    // esos rechazos iban atribuidos a 'gemini' y el check acusó a Gemini —desenchufado desde el
    // 01/08— de «15 llamadas y ninguna correcta»; el agotamiento del presupuesto lo canta ahora
    // su propio check (12-bis), con su nombre.
    const proveedoresMuertos = await prisma.$queryRaw<
      { proveedor: string; llamadas: bigint; dias: number; ultimo_error: string | null }[]
    >`
      SELECT proveedor,
             COUNT(*) AS llamadas,
             COUNT(DISTINCT creada_at::date)::int AS dias,
             MAX(left(COALESCE(error, ''), 140)) AS ultimo_error
      FROM ai_usos
      WHERE creada_at > now() - interval '30 days' AND proveedor IS NOT NULL
        AND proveedor <> ${PROVEEDOR_PASARELA}
      GROUP BY proveedor
      HAVING COUNT(*) >= 10 AND COUNT(*) FILTER (WHERE ok) = 0
         AND MAX(creada_at) > now() - interval '3 days'`
    for (const p of proveedoresMuertos) {
      fallos.push(
        `🔴 IA «${p.proveedor}»: ${Number(p.llamadas)} llamadas en ${p.dias} días distintos y ` +
        `NINGUNA correcta. La cadena de fallback lo tapa, así que todo "funciona" mientras se paga ` +
        `el camino de pago Y el intento fallido de este. Último error: ${p.ultimo_error ?? 'sin detalle'}`,
      )
    }
    if (!proveedoresMuertos.length) ok.push('✅ Ningún proveedor de IA muerto')

    // Check 12-bis: presupuesto MENSUAL de la pasarela (AI_GATEWAY_LIMITE_MENSUAL, nº de llamadas
    // OK). Cuando se agota, TODOS los /api/ai/* responden 429 hasta el día 1 — incluida la cadena
    // gratis (chat/tools por NIM→Groq), que no cuesta nada bloquear. Antes ese estado solo se veía
    // en el god-panel /operador/ia (nadie lo mira a diario) y, disfrazado, en el Check 12 acusando
    // al proveedor equivocado. El límite vigente sale de la fila única de `ia_limite_mensual`
    // (editable por Supabase sin redeploy; sin fila, manda la env AI_GATEWAY_LIMITE_MENSUAL).
    const presupuestoMensual = await estadoPresupuesto()
    if (presupuestoMensual.limite > 0 && presupuestoMensual.ratio >= 1) {
      fallos.push(
        `🔴 Pasarela IA: presupuesto mensual AGOTADO (${presupuestoMensual.usado}/${presupuestoMensual.limite} llamadas OK) — ` +
        `todos los /api/ai/* responden 429 hasta el día 1. Si no es esperado, sube el límite en la tabla ia_limite_mensual (UPDATE ... SET limite_mensual = N; 0 = sin límite).`,
      )
    } else if (presupuestoMensual.limite > 0 && presupuestoMensual.ratio >= 0.8) {
      fallos.push(`🟡 Pasarela IA: presupuesto mensual al ${Math.round(presupuestoMensual.ratio * 100)}% (${presupuestoMensual.usado}/${presupuestoMensual.limite} llamadas OK)`)
    } else {
      ok.push(presupuestoMensual.limite > 0
        ? `✅ Presupuesto mensual IA: ${presupuestoMensual.usado}/${presupuestoMensual.limite} llamadas OK`
        : '✅ Presupuesto mensual IA: sin límite configurado')
    }

    // Check 13: sonda ACTIVA de proveedores de IA — no espera al tráfico.
    //
    // El Check 12 es forense: solo dispara cuando el tráfico orgánico ya acumuló ≥10 fallos
    // (~una semana con la cadencia real de los crons), y así fue como Gemini estuvo mes y medio
    // muerto sin que nadie lo viera. Esta sonda hace un ping real y minúsculo a CADA proveedor
    // configurado (misma key y mismo modelo que producción) y canta el eslabón caído el MISMO
    // día, haya tráfico o no. Detalle y coste (despreciable) en lib/monitoring/sonda-ia.ts.
    //
    // El veredicto separa LENTO de MUERTO (04/08/2026): un timeout de la sonda con tráfico real
    // completando el mismo día (caso NIM: p50 ~25 s contra timeout de 30 s, tier gratis con cola)
    // es 🟠 «degradado», no 🔴 «revisar key/cuota» — la primera versión mandó a revisar una key
    // que la víspera llevaba 40 llamadas reales OK. Ventana de 48 h porque el check corre a las
    // ~07:00 UTC y el tráfico del día anterior puede superar las 24 h; si el proveedor muere de
    // verdad, la ventana se vacía sola y el 🟠 escala a 🔴 en pasadas siguientes.
    const sonda = await sondearProveedoresIA()
    const sospechosos = sonda.filter((s) => !s.ok || (s.reintentos ?? 0) > 0)
    const traficoReal = new Map<string, TraficoRealProveedor>()
    if (sospechosos.length > 0) {
      const filas = await prisma.$queryRaw<Array<{ proveedor: string; exitos: number; p50: number | null }>>`
        SELECT proveedor,
               COUNT(*) FILTER (WHERE ok)::int AS exitos,
               (percentile_cont(0.5) WITHIN GROUP (ORDER BY ms) FILTER (WHERE ok))::float AS p50
        FROM ai_usos
        WHERE creada_at > now() - interval '48 hours' AND endpoint <> 'sonda'
          AND proveedor IN (${Prisma.join(sospechosos.map((s) => s.proveedor))})
        GROUP BY proveedor`
      for (const f of filas) traficoReal.set(f.proveedor, { exitos: f.exitos, p50Ms: f.p50, ventanaHoras: 48 })
    }
    for (const s of sospechosos) {
      fallos.push(veredictoSonda(s, traficoReal.get(s.proveedor), SONDA_TIMEOUT_MS).linea)
    }
    if (sonda.length === 0) {
      // Cero proveedores configurados no es «todo bien»: es que la sonda no pudo mirar nada.
      fallos.push('🔴 Sonda IA: ningún proveedor configurado (¿envs de IA ausentes en este entorno?)')
    } else if (sospechosos.length === 0) {
      ok.push(`✅ Sonda IA: ${sonda.length} proveedores responden (${sonda.map((s) => s.proveedor).join(', ')})`)
    } else if (sonda.length > sospechosos.length) {
      ok.push(`✅ Sonda IA: ${sonda.length - sospechosos.length} de ${sonda.length} proveedores responden a la primera`)
    }

  } catch (err) {
    fallos.push(`🔴 Error ejecutando health check: ${err instanceof Error ? err.message : String(err)}`)
  }

  if (fallos.length > 0) {
    const msg = [
      `⚕️ <b>Health Check — ${hoy}</b>`,
      '',
      ...fallos,
      '',
      `✅ ${ok.length} checks OK`,
    ].join('\n')
    await tgAviso('sistema.health-check', msg, { html: true })
  }

  return NextResponse.json({ ok, fallos, timestamp: new Date().toISOString() })
}
