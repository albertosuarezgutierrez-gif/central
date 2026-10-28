// Tarificador RPA — orquestador con BD (05/10/2026). La cola es `seguros.tarificacion_trabajos`
// (sin Redis ni colas externas); el worker corre en una máquina EFÍMERA de Fly por trabajo.
//
// 🛡️ Todo filtrado por `correduria_id` en lo que entra por el puerto de operador. Las rutas del
//    worker solo conocen el id del trabajo (uuid) y solo mientras está `en_curso` con lease vivo.
// 🚨 TARIFICAR ≠ EMITIR. Nada de aquí habla con Codeoscopic ni emite. Los precios de portal se
//    guardan con `canal = 'rpa'`, sin `project_id_codeoscopic` ni libro de gasto: ningún camino de
//    Avant2 puede casarlos (CHECK `tarificacion_fuera_de_avant2`).

import { riesgoConTomadorMediador } from './tarificador-explorador-mediador'
import { cierraCabeceraTrasFallo, estadoFalloExploracion, exploradoValido, modoParaWorker, modosReclamables } from './tarificador-explorador-reglas'
import { createHash } from 'node:crypto'
import {
  MAX_INTENTOS,
  claveCompania,
  entradaConTomadorMediador,
  estadoTrasError,
  estadoTrasErrorEmision,
  franquiciaGeneral,
  puedeAutomatizar,
  riesgoSinDatosPersonales,
  sanearRecorrido,
  valoresSensiblesDeRiesgo,
  type OfertaNormalizada,
  type PasoTraza,
  type FormularioAuto,
  type FormularioHogarSinTomador,
  type AtascoWorker,
  type RiesgoComunidad,
  type TipoError,
} from '@central/module-tarificacion'
import { decryptField } from '@central/module-seguros-pii'
import { aplicarCompaniaActual, aplicarPolizaAnteriorUltimos5, companiaActualDeCliente, companiaActualUnica, necesitaCompaniaActual, type PolizaParaCompaniaActual } from './tarificador-compania-actual'
import { aplicarFichaTomador, fichaTomadorAutoDeFicha, necesitaFichaTomador, type FilaFichaTomadorAuto } from './tarificador-ficha-tomador'
import { prisma } from './tenant'
import { aplicarSexoDeFicha, necesitaSexoDeFicha } from './tarificador-sexo-ficha'
import { sobreCoberturasRpa } from './presupuesto-rpa-reglas'
import { hayBotVersion, hayImagenTrabajo, hayPasos } from './esquema-bd'
import { leerFilaImagen } from './tarificador-imagen'
import { elegirImagenProduccion, imagenParaTrabajo } from './tarificador-imagen-reglas'
import { caducarEmisiones } from './tarificador-emision'
import { MENSAJE_EMISION_INCIERTA, autorizacionSinResolver } from './tarificador-emision-reglas'
import { memoriaTrasExito } from './tarificador-eleccion-reglas'
import { guardarMemoriaVersion } from './tarificador-memoria'
import { formasRiesgoDuplicado } from './tarificador-duplicados'
import { purgarEvidenciaCaducada, purgarRecorridosCaducados, purgarRiesgoTrabajos, purgarRiesgosCerrados } from './tarificador-purga'
import { atascoParaFallo, caducarAtascos, caducarPausas, evaluarCorte, guardarAtasco, pausarTrasHumo, pausaViva, sqlSinPausa } from './tarificador-robustez'
import { PREFIJO_HUMO_NO_SOPORTADO, estadoTrasFalloHumo, humoPideParar } from './tarificador-humo-reglas'
import {
  CLAVE_ESPERA_VEHICULO,
  ESTADOS_ORIGEN_VIVOS,
  ORIGENES_VEHICULO_ENCADENADO,
  decidirEspera,
  esOrigenVehiculo,
  esperaLiberable,
  necesitaVehiculoEncadenado,
  riesgoAlEncolar,
  riesgoConVehiculo,
  vehiculoDeOrigenes,
  vehiculoParaRiesgoOrigen,
  type FilaOrigen,
  type VehiculoEncadenado,
} from './tarificador-espera-vehiculo'
import {
  ESTADOS_DUPLICADO,
  LEASE_MS,
  VENTANA_OK_DUPLICADO_MS,
  avisoTraza,
  bloqueaDuplicado,
  claveEncolar,
  configFly,
  huecosLibres,
  mensajeDuplicado,
  mimeCaptura,
  nombreCapturaFallo,
  peticionMaquina,
  repartirEnCurso,
  aplicarNifTomador,
  aplicarDatosTomador,
  aplicarTomadorHogar,
  companiaAdmiteRamoRpa,
  lecturaNifFicha,
  lecturaTomadorHogar,
  necesitaTomadorHogar,
  lecturaTomadorFicha,
  necesitaDatosTomador,
  type FilaTomadorFicha,
  necesitaNifTomador,
  riesgoParaEncolar,
  riesgoSinNifTomador,
  tipoFalloNifTomador,
  rpaActivo,
  type ConfigFly,
  type ResultadoWorker,
} from './tarificador-reglas'

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
type Db = Pick<Tx, '$queryRaw' | '$executeRaw'>

export type Integracion = { modo: string; maxConcurrencia: number; activo: boolean }

export async function leerIntegracion(correduriaId: string, compania: string, ramo: string): Promise<Integracion | null> {
  const filas = await prisma.$queryRaw<{ modo: string; max_concurrencia: number; activo: boolean }[]>`
    select modo, max_concurrencia, activo
    from seguros.companias_integracion
    where correduria_id = ${correduriaId}::uuid and compania = ${claveCompania(compania)} and ramo = ${ramo}`
  const f = filas[0]
  return f ? { modo: f.modo, maxConcurrencia: f.max_concurrencia, activo: f.activo } : null
}

// ─── Encolar ─────────────────────────────────────────────────────────────────

export type EntradaEncolar = {
  correduriaId: string
  oportunidadId: string | null
  clienteId: string | null
  polizaId: string | null
  compania: string
  /** Comunidades (RiesgoComunidad) o, desde el 13/10/2026, Moto y (14/10/2026) Auto (FormularioAuto ya validado); Hogar (19/10/2026) sin tomador. El ramo discrimina el riesgo. */
  ramo: 'comunidades' | 'moto' | 'auto' | 'hogar'
  riesgo: RiesgoComunidad | FormularioAuto | FormularioHogarSinTomador
  solicitadoPor: string
  /**
   * F3b (19/10/2026, aviso «Listo para tarificar» de un lead): solo COMPRUEBA si ya hay un trabajo vivo igual (el mismo cálculo
   * que el encolado), sin crear nada. Con uno → `encolado` + `duplicado: true`; sin él → `rechazado` 409 `no_duplicado`. Así una
   * pulsación que solo trae duplicados dice «ya en marcha» sin reservar cupo (ni toparse con el tope).
   */
  soloComprobarDuplicado?: boolean
  /**
   * Imagen de PRUEBA (27/10/2026, solo `probar`): `rama-*` YA validada y con el interruptor comprobado por la ruta. Se guarda en
   * `imagen_prueba` del trabajo NUEVO en el mismo INSERT (nunca hay un instante en que se lance con la de producción). Con un
   * duplicado vivo → 409 (ese trabajo va con otra imagen). Exige la columna (`hayImagenTrabajo`).
   */
  imagenPrueba?: string | null
}

export type ResultadoEncolar =
  /** `duplicado: true` = ya había un trabajo vivo con el mismo riesgo y se devuelve ESE (no se crea otro). */
  | { estado: 'encolado'; trabajoId: string; duplicado: boolean; /** Estado REAL del trabajo devuelto cuando `duplicado` (nunca «en marcha» a ciegas). */ estadoPrevio?: string; mensaje?: string }
  | { estado: 'rechazado'; status: number; motivo: string }

export async function encolarTrabajo(e: EntradaEncolar): Promise<ResultadoEncolar> {
  // Hogar solo para las compañías con bot de tarificación (hoy Allianz): la fila `mapfre/hogar` solo habilita la exploración.
  if (!companiaAdmiteRamoRpa(e.compania, e.ramo)) return { estado: 'rechazado', status: 409, motivo: `ramo_no_admitido: el bot de ${claveCompania(e.compania)} no tarifica ${e.ramo}` }
  const integ = await leerIntegracion(e.correduriaId, e.compania, e.ramo)
  // Fail-closed: sin fila, inactiva o con un modo que no es rpa_autorizada, no se encola.
  if (!integ || !integ.activo || !puedeAutomatizar(integ.modo)) {
    return { estado: 'rechazado', status: 409, motivo: `modo_no_automatizable: ${integ ? (integ.activo ? integ.modo : 'inactiva') : 'sin_integracion'}` }
  }
  // CORTE (F2): la pareja está en pausa tras 3 fallos seguidos del bot; no se encola hasta que Alberto la reanude.
  if (await pausaViva(prisma, e.correduriaId, claveCompania(e.compania), e.ramo)) {
    return { estado: 'rechazado', status: 409, motivo: `bot_pausado: ${claveCompania(e.compania)}/${e.ramo} está en pausa tras varios fallos seguidos; reanúdalo en /correduria/tarificador` }
  }

  // Anclas: el cliente sale de la oportunidad (si viene) y TIENE que ser de esta correduría.
  let clienteId = e.clienteId
  let polizaId = e.polizaId
  if (e.oportunidadId) {
    const op = await prisma.$queryRaw<{ cliente_id: string | null; poliza_id: string | null }[]>`
      select cliente_id::text as cliente_id, poliza_id::text as poliza_id
      from seguros.oportunidades
      where id = ${e.oportunidadId}::uuid and correduria_id = ${e.correduriaId}::uuid`
    if (!op[0]) return { estado: 'rechazado', status: 404, motivo: 'oportunidad_no_encontrada' }
    if (clienteId && op[0].cliente_id && clienteId !== op[0].cliente_id) {
      return { estado: 'rechazado', status: 400, motivo: 'cliente_no_es_el_de_la_oportunidad' }
    }
    clienteId = clienteId ?? op[0].cliente_id
    polizaId = polizaId ?? op[0].poliza_id
  }
  if (!clienteId) return { estado: 'rechazado', status: 400, motivo: 'falta_cliente (o una oportunidad con cliente)' }
  const cli = await prisma.$queryRaw<{ ok: number }[]>`
    select 1 as ok from seguros.clientes where id = ${clienteId}::uuid and correduria_id = ${e.correduriaId}::uuid`
  if (!cli[0]) return { estado: 'rechazado', status: 404, motivo: 'cliente_no_encontrado' }
  if (polizaId) {
    const pol = await prisma.$queryRaw<{ ok: number }[]>`
      select 1 as ok from seguros.polizas where id = ${polizaId}::uuid and correduria_id = ${e.correduriaId}::uuid`
    if (!pol[0]) return { estado: 'rechazado', status: 404, motivo: 'poliza_no_encontrada' }
  }

  // VEHÍCULO ENCADENADO (Generali Turismos, 18/10/2026, regla de Alberto): Generali no saca el vehículo por matrícula. Si un
  // `ok` de Allianz/Mapfre de ESTA oportunidad ya lo confirmó, se encola con él; si no, queda `pendiente` con `esperaVehiculo`
  // (no se reclama) hasta que llegue (`registrarResultado` / barrido). Sin oportunidad → rechazo. Ver tarificador-espera-vehiculo.ts.
  let riesgoEntrada: RiesgoComunidad | FormularioAuto | FormularioHogarSinTomador = e.riesgo
  if (necesitaVehiculoEncadenado(e.compania, e.ramo)) {
    const origenes = e.oportunidadId ? await leerOrigenesVehiculo(prisma, e.correduriaId, e.oportunidadId) : []
    const enc = riesgoAlEncolar(e.riesgo, e.oportunidadId, vehiculoDeOrigenes(origenes))
    if (!enc.ok) return { estado: 'rechazado', status: enc.status, motivo: enc.motivo }
    riesgoEntrada = enc.riesgo
  }

  // NIF del tomador para Mapfre (14/10/2026): lo pone ASEGURA desde la ficha, pero NO aquí. Al encolar solo se COMPRUEBA
  // que la ficha (de ESTA correduría) lo tiene legible y válido; sin NIF / ilegible / no válido → rechazo SIN encolar. Lo
  // que se guarda es el riesgo SIN documento (el NIF en claro no se persiste): se descifra e inyecta al ENTREGAR el trabajo
  // al worker (`trabajoParaWorker`). El documento no sale en ningún motivo ni en la respuesta.
  const dniFicha = necesitaNifTomador(e.compania, e.ramo, riesgoSinNifTomador(riesgoEntrada)) ? await leerDniFicha(e.correduriaId, clienteId) : null
  // Nombre, apellidos y nacimiento del tomador (alta en Mapfre si no lo conoce): misma regla, comprobados aquí y SOLO
  // inyectados al entregar. Si faltan → 422 `falta_datos_tomador` («falta X en la ficha») sin encolar ni gastar máquina.
  const fichaTomador = necesitaDatosTomador(e.compania, e.ramo, riesgoSinNifTomador(riesgoEntrada)) ? await leerTomadorFicha(e.correduriaId, clienteId) : null
  // Sexo del conductor (18/10/2026): si el formulario no lo trae y conduce el cliente, del tratamiento Sr./Sra. de SU ficha
  // (`aplicarSexoDeFicha`); sin tratamiento traducible no se pone (lo dirá `faltanParaTarificar`). Fallo de lectura = sin él.
  if (necesitaSexoDeFicha(e.ramo, riesgoEntrada)) {
    const saludo = await prisma.$queryRaw<{ saludo: string | null }[]>`
      select saludo from seguros.clientes where id = ${clienteId}::uuid and correduria_id = ${e.correduriaId}::uuid and merged_into_cliente_id is null`
      .then((f) => f[0]?.saludo ?? null).catch((): string | null => null)
    riesgoEntrada = aplicarSexoDeFicha(e.ramo, riesgoEntrada, saludo)
  }
  // Compañía anterior (Mapfre/Allianz auto, 19/10/2026): si el formulario no la trae pero la oportunidad o las pólizas del cliente la
  // saben, se rellena ANTES de validar (si no, `falta_compania_anterior` rechazaba con 422 antes de que la entrega la pusiera).
  // No pisa lo que ya trae; sin dato sigue faltando (nunca un valor de cajón: `nombreCompaniaUtil`).
  if (necesitaCompaniaActual(claveCompania(e.compania), e.ramo, riesgoEntrada)) {
    riesgoEntrada = aplicarCompaniaActual(claveCompania(e.compania), e.ramo, riesgoEntrada, await leerCompaniaActualCliente(e.correduriaId, clienteId, e.oportunidadId ?? null)) as typeof riesgoEntrada
  }
  // Tomador de Hogar (19/10/2026, Allianz): DNI/NIE y nacimiento de la ficha; solo se COMPRUEBAN aquí, se inyectan al entregar.
  const fichaHogar = necesitaTomadorHogar(e.compania, e.ramo) ? await leerTomadorFicha(e.correduriaId, clienteId) : null
  // Allianz auto/moto (20/10/2026): la ficha completa (NIF…) se lee para EVALUAR los obligatorios de origen ficha (NIF del tomador de
  // Allianz moto); lo guardado sigue sin ella, se inyecta al entregar.
  const filaFichaAuto = necesitaFichaTomador(e.compania, e.ramo) ? await leerFichaTomadorAuto(e.correduriaId, clienteId) : null
  const guardar = riesgoParaEncolar(e.compania, e.ramo, riesgoEntrada, () => lecturaNifFicha(dniFicha, decryptField), () => lecturaTomadorFicha(fichaTomador, decryptField), () => lecturaTomadorHogar(fichaHogar, decryptField), () => fichaTomadorAutoDeFicha(filaFichaAuto, decryptField, e.ramo, new Date(), e.compania))
  if (!guardar.ok) return { estado: 'rechazado', status: guardar.status, motivo: guardar.motivo }

  // Sin duplicados (13/10/2026; `ok` con precio <10 min, 15/10/2026): mismo cliente (ficha) + compañía + ramo + oportunidad/póliza + riesgo
  // (igualdad `jsonb`) con un trabajo aún vivo, o terminado con precio hace menos de 10 min → se devuelve ESE. Cerrojo consultivo por clave y no índice único parcial: «en_curso con lease vivo» depende de now()
  // (no cabe en el predicado de un índice) y el riesgo es un jsonb grande; el cerrojo serializa a dos que encolan lo mismo.
  const compania = claveCompania(e.compania)
  // Un `ok` ya purgó su riesgo a la lista blanca (salvo origen de emisión): se compara con ambas formas, salvo hogar (su
  // forma purgada no distingue viviendas: `riesgoPurgadoJson` es null y `t.riesgo = null` nunca casa).
  const { riesgoJson, riesgoPurgadoJson } = formasRiesgoDuplicado(guardar.riesgo as Record<string, unknown>, e.ramo)
  const cid = clienteId
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${claveEncolar({ correduriaId: e.correduriaId, clienteId: cid, compania, ramo: e.ramo })}))`
    const previos = await tx.$queryRaw<{ id: string; estado: string; lease_hasta: Date | null; intentos: number; modo: string | null; ahora: Date; terminado_at: Date | null; actualizado_at: Date | null; con_precio: boolean }[]>`
      select t.id::text as id, t.estado, t.lease_hasta, t.intentos, to_jsonb(t)->>'modo' as modo, now() as ahora, t.terminado_at, t.updated_at as actualizado_at,
             (t.tarificacion_id is not null and exists (
               select 1 from seguros.tarificacion_precios p where p.tarificacion_id = t.tarificacion_id and p.prima_eur is not null)) as con_precio
      from seguros.tarificacion_trabajos t
      where t.correduria_id = ${e.correduriaId}::uuid and t.cliente_id = ${cid}::uuid
        and t.compania = ${compania} and t.ramo = ${e.ramo}
        and t.estado = any(${[...ESTADOS_DUPLICADO]}::text[])
        and (t.riesgo = ${riesgoJson}::jsonb or t.riesgo = ${riesgoPurgadoJson}::jsonb)
        and (t.estado <> 'ok' or t.terminado_at > now() - ${VENTANA_OK_DUPLICADO_MS / 1000}::int * interval '1 second')
        and t.oportunidad_id is not distinct from ${e.oportunidadId ?? null}::uuid
        and t.poliza_id is not distinct from ${polizaId ?? null}::uuid
        and coalesce(to_jsonb(t)->>'modo', 'tarificar') not in ('exploracion', 'humo')
      order by t.created_at`
    const vivo = previos.find((p) => bloqueaDuplicado({ estado: p.estado, leaseHasta: p.lease_hasta, intentos: p.intentos, modo: p.modo, terminadoAt: p.terminado_at, conPrecio: p.con_precio, actualizadoAt: p.actualizado_at }, p.ahora, MAX_INTENTOS))
    if (vivo && e.imagenPrueba) return { estado: 'rechazado' as const, status: 409, motivo: `duplicado_imagen_prueba: ya hay un trabajo igual (${vivo.id}, ${vivo.estado}); la imagen de prueba solo va en un trabajo nuevo` }
    if (vivo) return { estado: 'encolado' as const, trabajoId: vivo.id, duplicado: true, estadoPrevio: vivo.estado, mensaje: mensajeDuplicado(vivo.estado) }
    if (e.soloComprobarDuplicado) return { estado: 'rechazado' as const, status: 409, motivo: 'no_duplicado' }
    if (e.imagenPrueba) {
      const conPrueba = await tx.$queryRaw<{ id: string }[]>`
        insert into seguros.tarificacion_trabajos
          (correduria_id, oportunidad_id, cliente_id, poliza_id, compania, ramo, riesgo, solicitado_por, imagen_prueba)
        values (${e.correduriaId}::uuid, ${e.oportunidadId}::uuid, ${cid}::uuid, ${polizaId}::uuid,
                ${compania}, ${e.ramo}, ${riesgoJson}::jsonb, ${e.solicitadoPor}, ${e.imagenPrueba})
        returning id::text as id`
      return { estado: 'encolado' as const, trabajoId: conPrueba[0].id, duplicado: false }
    }
    const filas = await tx.$queryRaw<{ id: string }[]>`
      insert into seguros.tarificacion_trabajos
        (correduria_id, oportunidad_id, cliente_id, poliza_id, compania, ramo, riesgo, solicitado_por)
      values (${e.correduriaId}::uuid, ${e.oportunidadId}::uuid, ${cid}::uuid, ${polizaId}::uuid,
              ${compania}, ${e.ramo}, ${riesgoJson}::jsonb, ${e.solicitadoPor})
      returning id::text as id`
    return { estado: 'encolado' as const, trabajoId: filas[0].id, duplicado: false }
  }, { timeout: 15000, maxWait: 10000 })
}

/**
 * Nombre, apellidos, nacimiento y tipo de persona de la ficha TAL CUAL están en BD (lo cifrado, cifrado), de ESTA
 * correduría. Los abre `lecturaTomadorFicha`. `null` = no hay ficha de esta correduría con ese id.
 */
async function leerTomadorFicha(correduriaId: string, clienteId: string): Promise<FilaTomadorFicha | null> {
  const filas = await prisma.$queryRaw<{ dni: string | null; nombre: string | null; apellidos: string | null; fecha_nacimiento: string | null; tipo_persona: string | null }[]>`
    select dni, nombre, apellidos, fecha_nacimiento, tipo_persona::text as tipo_persona
    from seguros.clientes where id = ${clienteId}::uuid and correduria_id = ${correduriaId}::uuid and merged_into_cliente_id is null`
  const f = filas[0]
  return f ? { dni: f.dni, nombre: f.nombre, apellidos: f.apellidos, fechaNacimiento: f.fecha_nacimiento, tipoPersona: f.tipo_persona } : null
}

/**
 * Tomador de la ficha para `fichaTomador` (Allianz auto/moto, 17/10/2026): las columnas que lee Codeoscopic (`clienteOrigenDe`)
 * más `ciudad`/`provincia` y los carnés, TAL CUAL (lo cifrado, cifrado), de ESTA correduría y de la ficha VIVA (una lápida de
 * fusión no da datos: podrían ser viejos). Los abre `fichaTomadorAutoDeFicha`. `null` = no hay ficha viva o la lectura falló
 * (entonces el riesgo va SIN `fichaTomador`: «no se miró», nunca «no tiene»).
 */
async function leerFichaTomadorAuto(correduriaId: string, clienteId: string): Promise<FilaFichaTomadorAuto | null> {
  try {
    const filas = await prisma.$queryRaw<{ dni: string | null; direccion: string | null; codigo_postal: string | null; ciudad: string | null; provincia: string | null; fecha_nacimiento: string | null; tipo_persona: string | null; telefono: string | null; email: string | null }[]>`
      select dni, direccion, codigo_postal, ciudad, provincia, fecha_nacimiento, telefono, email, tipo_persona::text as tipo_persona
      from seguros.clientes
      where id = ${clienteId}::uuid and correduria_id = ${correduriaId}::uuid and merged_into_cliente_id is null`
    const f = filas[0]
    if (!f) return null
    // Carnés aparte: si esta lectura falla, `null` (no se pudieron leer), no «no tiene carné».
    const carnets = await prisma.$queryRaw<{ tipo: string; fecha_carnet: string | null }[]>`
      select tipo, fecha_carnet from seguros.cliente_carnets_conducir
      where cliente_id = ${clienteId}::uuid and correduria_id = ${correduriaId}::uuid`
      .then((ks) => ks.map((k) => ({ tipo: k.tipo, fechaCarnet: k.fecha_carnet })))
      .catch(() => null)
    // Contacto (Mapfre, 26/10/2026): columna espejo + tablas hijas, el principal primero. Si la lectura falla, listas vacías
    // («sin contacto»: el bot lo avisa y no guarda el proyecto), nunca un dato inventado.
    const telefonos = await prisma.$queryRaw<{ telefono: string | null }[]>`
      select telefono from seguros.cliente_telefonos
      where cliente_id = ${clienteId}::uuid and correduria_id = ${correduriaId}::uuid order by es_principal desc, created_at`
      .then((ts) => ts.map((t) => t.telefono)).catch(() => [])
    const emails = await prisma.$queryRaw<{ email: string | null }[]>`
      select email from seguros.cliente_emails
      where cliente_id = ${clienteId}::uuid and correduria_id = ${correduriaId}::uuid order by es_principal desc, created_at`
      .then((es) => es.map((x) => x.email)).catch(() => [])
    const ordenados = (hijos: (string | null)[], espejo: string | null): string[] => [...hijos, espejo].filter((v): v is string => typeof v === 'string' && v.trim() !== '')
    return { dni: f.dni, direccion: f.direccion, codigoPostal: f.codigo_postal, ciudad: f.ciudad, provincia: f.provincia, fechaNacimiento: f.fecha_nacimiento, tipoPersona: f.tipo_persona, carnets, telefonos: ordenados(telefonos, f.telefono), emails: ordenados(emails, f.email) }
  } catch {
    return null
  }
}

/** DNI de la ficha TAL CUAL está en BD (cifrado `v1:` o legado), de ESTA correduría. Lo descifra `lecturaNifFicha`. */
async function leerDniFicha(correduriaId: string, clienteId: string): Promise<string | null> {
  const filas = await prisma.$queryRaw<{ dni: string | null }[]>`
    select dni from seguros.clientes where id = ${clienteId}::uuid and correduria_id = ${correduriaId}::uuid`
  return filas[0]?.dni ?? null
}

/** Como `leerCompaniaActualCliente` pero ESTRICTA (`companiaActualUnica`): solo con exactamente una póliza de auto en vigor. Para «probar». */
export async function leerCompaniaActualUnicaCliente(correduriaId: string, clienteId: string): Promise<string | null> {
  return leerCompaniaActualCliente(correduriaId, clienteId, null, companiaActualUnica)
}

/** Compañía con la que está asegurado hoy el cliente (columnas NO personales). `null` = no se sabe o la lectura falló. */
async function leerCompaniaActualCliente(
  correduriaId: string, clienteId: string | null, oportunidadId: string | null,
  decidir: (competencia: unknown, polizas: readonly PolizaParaCompaniaActual[] | null) => string | null = companiaActualDeCliente,
): Promise<string | null> {
  try {
    const comp = oportunidadId
      ? await prisma.$queryRaw<{ pc: unknown }[]>`
          select poliza_competencia as pc from seguros.oportunidades where id = ${oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid`
      : []
    const polizas = clienteId
      ? await prisma.$queryRaw<{ tipo: string | null; aseguradora: string | null; compania_declarada: string | null; estado: string | null; import_ref: string | null; eiac_xml_hash: string | null; sustituida_at: Date | null; fecha_efecto: string | null }[]>`
          select tipo::text as tipo, aseguradora, compania_declarada, estado::text as estado, import_ref, eiac_xml_hash, sustituida_at,
                 coalesce(fecha_efecto_actual, fecha_inicio)::text as fecha_efecto
          from seguros.polizas
          where cliente_id = ${clienteId}::uuid and correduria_id = ${correduriaId}::uuid and merged_into_poliza_id is null`
      : []
    const ps: PolizaParaCompaniaActual[] = polizas.map((p) => ({ tipo: p.tipo, aseguradora: p.aseguradora, companiaDeclarada: p.compania_declarada, estado: p.estado, importRef: p.import_ref, eiacXmlHash: p.eiac_xml_hash, sustituidaAt: p.sustituida_at, fechaEfecto: p.fecha_efecto }))
    return decidir(comp[0]?.pc ?? null, ps)
  } catch {
    return null
  }
}

/** Número de la póliza actual declarado en la oportunidad (SOLO esa clave, de ESTA correduría). Dato sensible: nunca se registra. `null` = no hay o la lectura falló. */
async function leerNumeroPolizaActual(correduriaId: string, oportunidadId: string | null): Promise<string | null> {
  if (!oportunidadId) return null
  try {
    const f = await prisma.$queryRaw<{ n: string | null }[]>`
      select poliza_competencia->'historialDeclarado'->>'numeroPoliza' as n from seguros.oportunidades where id = ${oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid`
    return f[0]?.n ?? null
  } catch {
    return null
  }
}

// ─── Reclamar y lanzar ───────────────────────────────────────────────────────

/** `imagen_prueba` (27/10/2026): imagen de rama pedida por `probar` solo para este trabajo (`null` = la de producción). */
type Reclamado = { id: string; intentos: number; imagen_prueba: string | null }

/**
 * Reclama el pendiente más antiguo de (correduría, compañía) si hay hueco bajo `max_concurrencia`
 * y la integración SIGUE autorizada. El cerrojo consultivo por compañía serializa a dos lanzadores
 * simultáneos (sin él, los dos verían 0 en curso y lanzarían 2 con la misma credencial).
 */
export type ReclamoCola = {
  trabajo: Reclamado | null
  /** Máquinas de Fly de los trabajos cuyo lease venció (se dieron por fallo): el llamante las destruye, fuera de la transacción. */
  maquinasVencidas: string[]
}

/**
 * 13/10/2026 (defecto 1): un `en_curso` con lease VENCIDO ya no ocupa hueco. Dentro del mismo cerrojo pasa a fallo de
 * infra con `marcarFallo` (la política de siempre: `error_reintentable` si quedan intentos, si no `error_definitivo`;
 * uno de emisión → `requiere_humano`), así un trabajo colgado no bloquea la cola hasta el siguiente barrido.
 */
export async function reclamarSiguiente(correduriaId: string, compania: string, modos: readonly string[] = ['tarificar', 'emision']): Promise<ReclamoCola> {
  const clave = claveCompania(compania)
  // CORTE (F2): una pareja (compañía, ramo) en pausa no se reclama. Vacío sin el SQL de la F2.
  const sinPausa = await sqlSinPausa()
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${'tarificador:' + correduriaId + ':' + clave}))`
    const cupo = await tx.$queryRaw<{ max: number | null }[]>`
      select min(max_concurrencia)::int as max
      from seguros.companias_integracion
      where correduria_id = ${correduriaId}::uuid and compania = ${clave} and activo and modo = 'rpa_autorizada'`
    const max = cupo[0]?.max ?? null
    if (max === null) return { trabajo: null, maquinasVencidas: [] }
    // La hora es la de la BD (la misma que compara `trabajoParaWorker`), no la del servidor de Vercel.
    const enCurso = await tx.$queryRaw<{ id: string; intentos: number; lease_hasta: Date | null; fly_machine_id: string | null; ahora: Date }[]>`
      select id::text as id, intentos, lease_hasta, fly_machine_id, now() as ahora from seguros.tarificacion_trabajos
      where correduria_id = ${correduriaId}::uuid and compania = ${clave} and estado = 'en_curso'`
    const ahora = enCurso[0]?.ahora ?? new Date()
    const { vivos, vencidos } = repartirEnCurso(enCurso.map((f) => ({ ...f, leaseHasta: f.lease_hasta })), ahora)
    const maquinasVencidas: string[] = []
    for (const v of vencidos) {
      // `marcarFallo` solo toca la fila si SIGUE `en_curso` (un resultado que llegó a la vez gana y esto no hace nada).
      const f = await marcarFallo(tx, v.id, v.intentos, { tipo: 'infra', mensaje: 'lease_vencido: el worker no devolvió resultado a tiempo', url: null }, null)
      if (f.tocada && v.fly_machine_id) maquinasVencidas.push(v.fly_machine_id)
    }
    if (huecosLibres(max, vivos.length) <= 0) return { trabajo: null, maquinasVencidas }
    const leaseHasta = new Date(Date.now() + LEASE_MS)
    const filas = await tx.$queryRaw<Reclamado[]>`
      update seguros.tarificacion_trabajos t
      set estado = 'en_curso', intentos = t.intentos + 1, lease_hasta = ${leaseHasta},
          iniciado_at = now(), updated_at = now(), fly_machine_id = null
      where t.id = (
        select w.id from seguros.tarificacion_trabajos w
        join seguros.companias_integracion ci
          on ci.correduria_id = w.correduria_id and ci.compania = w.compania and ci.ramo = w.ramo
         and ci.activo and ci.modo = 'rpa_autorizada'
        where w.correduria_id = ${correduriaId}::uuid and w.compania = ${clave}
          -- autorizado_emision: Alberto pulsó «Emitir»; la máquina 2 reanuda (no es un reintento: intentos a 0).
          and w.estado in ('pendiente', 'autorizado_emision') and w.intentos < ${MAX_INTENTOS}
          -- Solo los modos que se pueden lanzar ahora (13/10/2026): 'exploracion' únicamente con su interruptor
          -- (modosReclamables); una exploración no ocupa máquina ni hueco mientras esté apagado.
          and coalesce(to_jsonb(w)->>'modo', 'tarificar') = any(${[...modos]}::text[])
          ${sinPausa}
          -- Vehículo encadenado (Generali, 18/10/2026): uno que ESPERA el vehículo de Allianz/Mapfre no se lanza todavía.
          and (case when jsonb_typeof(w.riesgo) = 'object' then w.riesgo -> ${CLAVE_ESPERA_VEHICULO}::text end) is null
        order by w.created_at
        for update of w skip locked
        limit 1)
      returning t.id::text as id, t.intentos, to_jsonb(t)->>'imagen_prueba' as imagen_prueba`
    return { trabajo: filas[0] ?? null, maquinasVencidas }
  }, { timeout: 15000, maxWait: 10000 })
}

export type DepsLanzador = {
  fetch: typeof fetch
  env: Record<string, string | undefined>
}

const depsReales = (): DepsLanzador => ({ fetch: globalThis.fetch, env: process.env })

export type ResumenLanzar = { lanzados: string[]; fallidos: { id: string; motivo: string }[]; omitido?: string }

/** Lanza tantos trabajos como quepan para (correduría, compañía). Uno por máquina. */
export async function lanzarPendientes(correduriaId: string, compania: string, deps: DepsLanzador = depsReales()): Promise<ResumenLanzar> {
  const r: ResumenLanzar = { lanzados: [], fallidos: [] }
  if (!rpaActivo(deps.env)) return { ...r, omitido: 'rpa_apagado' }
  // IMAGEN (27/10/2026): la fila `produccion` de `seguros.tarificador_imagen` manda; la env `TARIFICADOR_FLY_IMAGE` es el respaldo
  // (sin tabla, sin fila, lectura fallida o valor que no casa con `REGEX_IMAGEN_BOT`). Ver tarificador-imagen-reglas.ts.
  const filaImagen = await leerFilaImagen()
  const produccion = elegirImagenProduccion(filaImagen?.imagen ?? null, deps.env)
  if (produccion.aviso) console.error(`[tarificador-imagen] ${produccion.aviso}`)
  const c = configFly(deps.env, produccion.origen === 'bd' ? produccion.imagen : null)
  if (!c.ok) return { ...r, omitido: `fly_sin_configurar: ${c.faltan.join(', ')}` }
  const conImagenTrabajo = await hayImagenTrabajo()
  for (let vuelta = 0; vuelta < 5; vuelta++) {
    const { trabajo: t, maquinasVencidas } = await reclamarSiguiente(correduriaId, compania, modosReclamables(deps.env))
    // Una máquina de lease vencido puede seguir viva con la credencial: se destruye ANTES de lanzar otra.
    for (const m of maquinasVencidas) await destruirMaquina(c.cfg, m, deps.fetch)
    if (!t) break
    // Imagen de PRUEBA (rama-*, pedida por `probar`): solo para ESTE trabajo y con el interruptor encendido AHORA; si no vale,
    // el trabajo falla con el motivo (nunca se cae a producción en silencio: la prueba mediría otra cosa).
    const im = imagenParaTrabajo({ imagenPrueba: t.imagen_prueba ?? null, permitirPrueba: filaImagen?.permitirPrueba === true, produccion: c.cfg.imagen })
    if (!im.ok) {
      await marcarFallo(prisma, t.id, t.intentos, { tipo: 'datos', mensaje: im.motivo, url: null }, null)
      r.fallidos.push({ id: t.id, motivo: im.motivo })
      continue
    }
    const res = await crearMaquina({ ...c.cfg, imagen: im.imagen }, t.id, deps.fetch)
    if (res.ok) {
      if (conImagenTrabajo) {
        await prisma.$executeRaw`
          update seguros.tarificacion_trabajos set fly_machine_id = ${res.machineId}, imagen_bot = ${im.imagen}, updated_at = now()
          where id = ${t.id}::uuid and estado = 'en_curso'`
      } else {
        await prisma.$executeRaw`
          update seguros.tarificacion_trabajos set fly_machine_id = ${res.machineId}, updated_at = now()
          where id = ${t.id}::uuid and estado = 'en_curso'`
      }
      console.info(`[tarificador] máquina lanzada: trabajo ${t.id} imagen ${im.imagen}${im.prueba ? ' (PRUEBA)' : ` (${produccion.origen ?? 'env'})`}`) // vuelta atrás: ver MANUAL-NUEVO-BOT.md
      r.lanzados.push(t.id)
    } else {
      await marcarFallo(prisma, t.id, t.intentos, { tipo: 'infra', mensaje: `fly: ${res.motivo}`, url: null }, null)
      r.fallidos.push({ id: t.id, motivo: res.motivo })
    }
  }
  return r
}

async function crearMaquina(cfg: ConfigFly, jobId: string, f: typeof fetch): Promise<{ ok: true; machineId: string } | { ok: false; motivo: string }> {
  try {
    const p = peticionMaquina(cfg, jobId, process.env.TARIFICADOR_EXPLORADOR_VISTA)
    const res = await f(p.url, { ...p.init, signal: AbortSignal.timeout(20_000) })
    const texto = await res.text()
    if (!res.ok) return { ok: false, motivo: `HTTP ${res.status}: ${texto.slice(0, 300)}` }
    const id = (JSON.parse(texto) as { id?: unknown }).id
    return typeof id === 'string' && id ? { ok: true, machineId: id } : { ok: false, motivo: 'respuesta sin id de máquina' }
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : String(e) }
  }
}

/** Mejor esfuerzo: una máquina colgada se destruye (auto_destroy la quita sola si el proceso sale). */
async function destruirMaquina(cfg: ConfigFly, machineId: string, f: typeof fetch): Promise<void> {
  try {
    await f(`https://api.machines.dev/v1/apps/${encodeURIComponent(cfg.app)}/machines/${encodeURIComponent(machineId)}?force=true`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${cfg.token}` },
      signal: AbortSignal.timeout(10_000),
    })
  } catch (e) {
    console.error('[tarificador] no se pudo destruir la máquina', machineId, e instanceof Error ? e.message : e)
  }
}

// ─── Lo que ve el worker ─────────────────────────────────────────────────────

export type TrabajoParaWorker = {
  id: string; compania: string; ramo: string; riesgo: unknown; leaseHasta: string; modo: 'tarificar' | 'emision' | 'exploracion' | 'humo'
  /** Solo en `modo = 'exploracion'`: la entrada cerrada y si va ligada a una petición real (la verdad: `cliente_id`). */
  exploracion?: { entrada: string; conDatosReales: boolean }
}

/**
 * Solo un trabajo `en_curso` con lease vivo. Ni cliente, ni póliza, ni correduría: solo el riesgo. `modo` por to_jsonb
 * (sin el SQL de emisión la columna no existe: null = tarificar). Lo de la emisión lo añade la ruta (`emisionParaWorker`).
 * `modosWorker`: lo que la imagen declara saber hacer (cabecera `X-Tarificador-Modos`); una exploración solo se sirve a
 * quien la declara, y con su entrada (sin cabecera de exploración legible → no se sirve).
 */
export async function trabajoParaWorker(id: string, modosWorker: readonly string[] = ['tarificar', 'emision']): Promise<TrabajoParaWorker | null> {
  const filas = await prisma.$queryRaw<{ id: string; correduria_id: string; cliente_id: string | null; oportunidad_id: string | null; intentos: number; compania: string; ramo: string; riesgo: unknown; lease_hasta: Date; modo: string | null; con_cliente: boolean }[]>`
    select t.id::text as id, t.correduria_id::text as correduria_id, t.cliente_id::text as cliente_id, t.oportunidad_id::text as oportunidad_id, t.intentos,
           t.compania, t.ramo, t.riesgo, t.lease_hasta, to_jsonb(t)->>'modo' as modo, (t.cliente_id is not null) as con_cliente
    from seguros.tarificacion_trabajos t
    where t.id = ${id}::uuid and t.estado = 'en_curso' and t.lease_hasta > now()`
  const f = filas[0]
  // Un modo que el worker no sabe ejecutar NO se sirve: una imagen anterior a la fase B trataría todo lo que no es
  // `emision` como `tarificar` (`modoParaWorker`, fail-closed).
  const modo = f ? modoParaWorker(f.modo, modosWorker) : null
  if (!f || !modo) return null
  let riesgo = f.riesgo
  // NIF del tomador (Mapfre auto/moto, 14/10/2026): se descifra AQUÍ, solo para la respuesta (canal del worker, con su
  // Bearer); nunca se escribe en BD. Si la ficha ya no lo permite (borrado, ilegible, no válido) el trabajo FALLA con el
  // motivo (sin documento) y no se sirve: el worker sale sin entrar en el portal.
  if (modo !== 'exploracion' && modo !== 'humo' && necesitaNifTomador(f.compania, f.ramo, riesgo)) {
    const dni = f.cliente_id ? await leerDniFicha(f.correduria_id, f.cliente_id) : null
    const conNif = aplicarNifTomador(f.compania, f.ramo, riesgo, () => lecturaNifFicha(dni, decryptField))
    if (!conNif.ok) {
      await prisma.$transaction((tx) => marcarFallo(tx, f.id, f.intentos, { tipo: tipoFalloNifTomador(conNif.status), mensaje: conNif.motivo, url: null }, null))
      return null
    }
    riesgo = conNif.riesgo
  }
  // Nombre, apellidos y nacimiento del tomador (alta en Mapfre): igual que el NIF, solo en la respuesta, nunca en BD.
  if (modo !== 'exploracion' && modo !== 'humo' && necesitaDatosTomador(f.compania, f.ramo, riesgo)) {
    const ficha = f.cliente_id ? await leerTomadorFicha(f.correduria_id, f.cliente_id) : null
    const conDatos = aplicarDatosTomador(f.compania, f.ramo, riesgo, () => lecturaTomadorFicha(ficha, decryptField))
    if (!conDatos.ok) {
      await prisma.$transaction((tx) => marcarFallo(tx, f.id, f.intentos, { tipo: tipoFalloNifTomador(conDatos.status), mensaje: conDatos.motivo, url: null }, null))
      return null
    }
    riesgo = conDatos.riesgo
  }
  // Tomador de Hogar (Allianz, 19/10/2026): DNI/NIE y nacimiento de la ficha, solo en la respuesta (nunca en BD). Si la ficha ya no
  // lo permite el trabajo FALLA con el motivo (sin valores) y no se sirve: el worker sale sin entrar en el portal.
  if (modo !== 'exploracion' && modo !== 'humo' && necesitaTomadorHogar(f.compania, f.ramo)) {
    const fila = f.cliente_id ? await leerTomadorFicha(f.correduria_id, f.cliente_id) : null
    const conTomador = aplicarTomadorHogar(f.compania, f.ramo, riesgo, () => lecturaTomadorHogar(fila, decryptField))
    if (!conTomador.ok) {
      await prisma.$transaction((tx) => marcarFallo(tx, f.id, f.intentos, { tipo: tipoFalloNifTomador(conTomador.status), mensaje: conTomador.motivo, url: null }, null))
      return null
    }
    riesgo = conTomador.riesgo
  }
  // Tomador de la ficha (Allianz auto/moto, 17/10/2026): tipo, documento, CP, localidad, dirección y fechas, campo a campo con
  // tres estados. Igual que el NIF: solo en la respuesta, nunca en BD. No falla el trabajo: lo que no consta es hueco del bot.
  if (modo !== 'exploracion' && modo !== 'humo' && necesitaFichaTomador(f.compania, f.ramo)) {
    const fila = f.cliente_id ? await leerFichaTomadorAuto(f.correduria_id, f.cliente_id) : null
    const conFicha = aplicarFichaTomador(f.compania, f.ramo, riesgo, () => fichaTomadorAutoDeFicha(fila, decryptField, f.ramo, new Date(), f.compania))
    riesgo = conFicha
  }
  // Compañía actual del vehículo (Allianz auto, 18/10/2026): si el riesgo no la trae, la del cliente (su póliza de la competencia
  // en la oportunidad, o su póliza de auto en vigor). Solo en la respuesta; no bloquea: sin dato, el bot lo deja como hueco.
  if (modo !== 'exploracion' && modo !== 'humo' && f.compania === 'allianz' && f.ramo === 'auto') {
    const conCompania = aplicarCompaniaActual(f.compania, f.ramo, riesgo, await leerCompaniaActualCliente(f.correduria_id, f.cliente_id, f.oportunidad_id))
    riesgo = conCompania
    // Últimos 5 dígitos de la póliza actual (19/10/2026): Allianz los pide en «Antecedentes». Solo la cola de 5 cifras, en la respuesta.
    const conPoliza = aplicarPolizaAnteriorUltimos5(f.compania, f.ramo, riesgo, await leerNumeroPolizaActual(f.correduria_id, f.oportunidad_id))
    riesgo = conPoliza
  }
  const base = { id: f.id, compania: f.compania, ramo: f.ramo, riesgo, leaseHasta: f.lease_hasta.toISOString(), modo }
  if (modo !== 'exploracion') return base
  const x = await prisma.$queryRaw<{ entrada: string }[]>`
    select e.entrada from seguros.tarificador_exploraciones e
    join seguros.tarificacion_trabajos t on t.id = e.trabajo_id and t.correduria_id = e.correduria_id
    where e.trabajo_id = ${id}::uuid and e.cerrada_at is null`
  if (!x[0]) return null
  // Tomador = MEDIADOR (patinete, 28/10/2026): sus datos van SOLO en la respuesta al worker (como el NIF de arriba), nunca en BD.
  const conMediador = entradaConTomadorMediador(x[0].entrada) && !f.con_cliente
  return { ...base, ...(conMediador ? { riesgo: riesgoConTomadorMediador(riesgo) } : {}), exploracion: { entrada: x[0].entrada, conDatosReales: f.con_cliente } }
}

// ─── Resultado ───────────────────────────────────────────────────────────────

type FilaTrabajo = {
  id: string
  correduria_id: string
  /** NULL solo en una exploración SINTÉTICA (2026-10-13_tarificador_explorador.sql). */
  cliente_id: string | null
  poliza_id: string | null
  oportunidad_id: string | null
  compania: string
  ramo: string
  riesgo: RiesgoComunidad | FormularioAuto | FormularioHogarSinTomador
  estado: string
  intentos: number
  solicitado_por: string
}

export type ResultadoRegistro =
  | { estado: 'registrado'; estadoTrabajo: string; tarificacionId?: string }
  | { estado: 'conflicto'; motivo: string }
  | { estado: 'no_encontrado' }

export async function registrarResultado(r: ResultadoWorker): Promise<ResultadoRegistro> {
  // La TRAZA va FUERA de la transacción del resultado: el resultado del trabajo jamás depende de ella.
  // Esquema opcional (SQL de 08/10/2026 puede no estar aplicado): se omite `bot_version` / la traza si no existen.
  const conBot = await hayBotVersion()
  type Interno = { res: ResultadoRegistro; traza: { t: FilaTrabajo; captura: 'con_captura' | null } | null }
  const interno: Interno = await prisma.$transaction(async (tx) => {
    const filas = await tx.$queryRaw<(FilaTrabajo & { modo: string | null })[]>`
      select w.id::text as id, w.correduria_id::text as correduria_id, w.cliente_id::text as cliente_id,
             w.poliza_id::text as poliza_id, w.oportunidad_id::text as oportunidad_id, w.compania, w.ramo, w.riesgo,
             w.estado, w.intentos, w.solicitado_por, to_jsonb(w)->>'modo' as modo
      from seguros.tarificacion_trabajos w where w.id = ${r.trabajoId}::uuid for update`
    const t = filas[0]
    if (!t) return { res: { estado: 'no_encontrado' as const }, traza: null }
    // Un trabajo de EMISIÓN no devuelve ofertas por aquí: su resultado va por /api/tarificador/emision/resultado.
    if (t.modo === 'emision' && r.tipo !== 'error') return { res: { estado: 'conflicto' as const, motivo: 'trabajo de emisión: usa /api/tarificador/emision/resultado' }, traza: null }
    // EXPLORACIÓN (13/10/2026): termina `explorado` (el mapa ya está en su cabecera) o con error; nunca con ofertas. Y al
    // revés: solo una exploración puede terminar `explorado`.
    const deExploracion = t.modo === 'exploracion'
    // PRUEBA DE HUMO (15/10/2026): termina `humo` (pasó) o con error (falló); nunca con ofertas. Y solo ella termina `humo`.
    const deHumo = t.modo === 'humo'
    if (deHumo && r.tipo !== 'humo' && r.tipo !== 'error') return { res: { estado: 'conflicto' as const, motivo: 'trabajo de humo: solo termina «humo» o con error' }, traza: null }
    if (!deHumo && r.tipo === 'humo') return { res: { estado: 'conflicto' as const, motivo: 'solo una prueba de humo termina «humo»' }, traza: null }
    if (deExploracion && r.tipo === 'ok') return { res: { estado: 'conflicto' as const, motivo: 'trabajo de exploración: no devuelve ofertas' }, traza: null }
    if (!deExploracion && r.tipo === 'explorado') return { res: { estado: 'conflicto' as const, motivo: 'solo una exploración termina «explorado»' }, traza: null }
    // Un resultado tardío (el barrido ya dio el lease por vencido) NO pisa lo decidido.
    if (t.estado !== 'en_curso') return { res: { estado: 'conflicto' as const, motivo: `trabajo en estado ${t.estado}` }, traza: null }

    if (r.tipo === 'humo') {
      // Sin tarificación, sin evidencia, sin riesgo que purgar (va vacío): solo el desenlace. La traza no se guarda (no es una tarificación).
      // Omitido (sin adaptador activo de esa compañía en la imagen): `cancelado`, ni éxito ni fallo; el informe no lo cuenta.
      // `error.humo` guarda qué ramo se probó y qué ramos tienen bot en la imagen (el informe avisa de «integración activa sin bot»).
      const humo = r.ramosConBot ? { humo: { ramoProbado: r.ramoProbado, conBot: r.ramosConBot } } : {}
      const omitido = r.omitido ? JSON.stringify({ tipo: 'datos', mensaje: `${PREFIJO_HUMO_NO_SOPORTADO}: ${r.omitido}`, ...humo }) : null
      const errorOk = !omitido && r.ramosConBot ? JSON.stringify(humo) : null
      await tx.$executeRaw`
        update seguros.tarificacion_trabajos
        set estado = case when ${omitido}::text is null then 'ok' else 'cancelado' end, lease_hasta = null,
            error = coalesce(${omitido}::jsonb, ${errorOk}::jsonb), terminado_at = now(), updated_at = now()
        where id = ${t.id}::uuid and estado = 'en_curso'`
      if (conBot) await tx.$executeRaw`update seguros.tarificacion_trabajos set bot_version = coalesce(${r.botVersion}, bot_version) where id = ${t.id}::uuid`
      return { res: { estado: 'registrado' as const, estadoTrabajo: omitido ? 'cancelado' : 'ok' }, traza: null }
    }

    if (r.tipo === 'explorado') {
      // La cabecera DEBE estar cerrada (el cierre guarda el mapa): si no, no es un `ok` sino un error con motivo claro.
      const cab = await tx.$queryRaw<{ cerrada: boolean }[]>`select (cerrada_at is not null) as cerrada from seguros.tarificador_exploraciones where trabajo_id = ${t.id}::uuid`
      if (!exploradoValido(cab[0]?.cerrada)) {
        const { estado } = await marcarFallo(tx, t.id, t.intentos, { tipo: 'portal', mensaje: 'exploracion_sin_cierre: el worker informó «explorado» pero la cabecera no está cerrada (el mapa no se guardó)', url: null }, null, conBot ? r.botVersion : null, conBot)
        return { res: { estado: 'registrado' as const, estadoTrabajo: estado }, traza: { t, captura: null } }
      }
      // PRESUPUESTO GUARDADO (14/10/2026): su PDF va a `seguros.documentos` como el de una tarificación (mismo `guardarAdjunto`)
      // y queda en `evidencia_documento_id` del trabajo; la referencia del portal, en las notas del documento (y en
      // `mapa.presupuesto`, que escribió el cierre). Un documento tiene que colgar de un cliente o póliza
      // (`documentos_colgado_de_algo`): en una exploración SINTÉTICA (sin cliente) el PDF no se guarda (el mapa dice `pdf`).
      const pdfDoc = r.presupuesto?.pdf && (t.cliente_id || t.poliza_id)
        ? await guardarAdjunto(tx, t, {
            nombre: r.presupuesto.pdf.nombre,
            mime: 'application/pdf',
            contenido: r.presupuesto.pdf.contenido,
            notas: notasPresupuestoExplorado(t.compania, t.ramo, r.presupuesto.referencia),
          })
        : null
      // Sin tarificación (el CHECK `trabajo_ok_con_tarificacion` lo admite solo en exploración). El motivo de fin, en `error`
      // NO: va en la cabecera de la exploración (`motivo_fin`, lo escribió el cierre).
      await tx.$executeRaw`
        update seguros.tarificacion_trabajos
        set estado = 'ok', lease_hasta = null, error = null, terminado_at = now(), updated_at = now(),
            evidencia_documento_id = coalesce(${pdfDoc}::uuid, evidencia_documento_id)
        where id = ${t.id}::uuid and estado = 'en_curso'`
      // La versión va en un UPDATE aparte: el esquema opcional (`bot_version`) puede no estar aplicado. Antes la rama
      // «explorado» no la escribía y toda exploración ok salía con `bot_version` vacío (14/10/2026).
      if (conBot) await tx.$executeRaw`update seguros.tarificacion_trabajos set bot_version = coalesce(${r.botVersion}, bot_version) where id = ${t.id}::uuid`
      // PURGA (13/10/2026): cerrado → fuera los datos personales del riesgo, en el MISMO commit.
      await purgarRiesgoTrabajos(tx, [t.id])
      return { res: { estado: 'registrado' as const, estadoTrabajo: 'ok' }, traza: { t, captura: null } }
    }

    if (r.tipo === 'error') {
      // Una exploración no guarda captura ni HTML como documento (puede no tener cliente y no hacen falta para el mapa).
      const evidencia = deExploracion || deHumo ? null : { trabajo: t, captura: r.captura, capturaConDatos: r.capturaConDatos, html: r.html }
      // Defensa en profundidad: el recorrido se vuelve a sanear con los valores del riesgo de ESTE trabajo (ya leído arriba).
      if (r.error.recorrido) {
        const { recorrido: _crudo, ...resto } = r.error
        const limpio = sanearRecorrido(r.error.recorrido, undefined, valoresSensiblesDeRiesgo(t.riesgo))
        r.error = limpio && limpio.capturas.length > 0 ? { ...resto, recorrido: limpio } : resto
      }
      const { estado } = await marcarFallo(tx, t.id, t.intentos, r.error, evidencia, conBot ? r.botVersion : null, conBot)
      return { res: { estado: 'registrado' as const, estadoTrabajo: estado }, traza: deHumo ? null : { t, captura: r.captura ? 'con_captura' as const : null } }
    }

    const docs: string[] = []
    for (const p of r.pdfs) {
      docs.push(await guardarAdjunto(tx, t, { nombre: p.nombre, mime: 'application/pdf', contenido: p.contenido, notas: `Oferta de ${t.compania} (${t.ramo}) obtenida por el tarificador RPA` }))
    }
    const tarificacionId = await guardarTarificacionRpa(tx, t, r.ofertas, docs)
    if (conBot) {
      await tx.$executeRaw`
        update seguros.tarificacion_trabajos
        set estado = 'ok', tarificacion_id = ${tarificacionId}::uuid, evidencia_documento_id = ${docs[0] ?? null}::uuid,
            lease_hasta = null, error = null, terminado_at = now(), updated_at = now(),
            bot_version = coalesce(${r.botVersion}, bot_version)
        where id = ${t.id}::uuid`
    } else {
      await tx.$executeRaw`
        update seguros.tarificacion_trabajos
        set estado = 'ok', tarificacion_id = ${tarificacionId}::uuid, evidencia_documento_id = ${docs[0] ?? null}::uuid,
            lease_hasta = null, error = null, terminado_at = now(), updated_at = now()
        where id = ${t.id}::uuid`
    }
    // VEHÍCULO ENCADENADO (18/10/2026): el catálogo que confirmó el bot de Allianz/Mapfre se guarda en SU riesgo (claves de
    // la lista blanca: sobrevive a la purga) y se inyecta en los Generali de la oportunidad que lo esperaban. Mismo commit.
    if (r.vehiculo && esOrigenVehiculo(t.compania, t.ramo)) {
      await tx.$executeRaw`
        update seguros.tarificacion_trabajos
        set riesgo = riesgo || ${JSON.stringify(vehiculoParaRiesgoOrigen(t.compania, r.vehiculo))}::jsonb
        where id = ${t.id}::uuid and correduria_id = ${t.correduria_id}::uuid and jsonb_typeof(riesgo) = 'object'`
      if (t.oportunidad_id) await inyectarVehiculoEnEspera(tx, t.correduria_id, t.oportunidad_id, r.vehiculo)
    }
    // PURGA (13/10/2026): DESPUÉS de guardar la tarificación y los PDF (lo último que lee el riesgo dentro de la
    // transacción) y en el MISMO commit. El aprendizaje de versión de abajo usa la copia en memoria (`t`), no la fila.
    // Un `ok` de Allianz Comunidades es origen posible de una emisión y NO se purga (`esOrigenDeEmision`).
    await purgarRiesgoTrabajos(tx, [t.id])
    return { res: { estado: 'registrado' as const, estadoTrabajo: 'ok', tarificacionId }, traza: { t, captura: null } }
  })
  // APRENDER (13/10/2026): un `ok` con tarificación que llevaba una versión AUTOMÁTICA (IA o memoria) la confirma en
  // `seguros.tarificador_elecciones`. Fuera de la transacción y sin lanzar: el resultado jamás depende de la memoria.
  if (interno.res.estado === 'registrado' && interno.res.estadoTrabajo === 'ok' && interno.res.tarificacionId && interno.traza) {
    const aprender = memoriaTrasExito(interno.traza.t)
    if (aprender) await guardarMemoriaVersion(aprender.k, { codigo: aprender.codigo, etiqueta: aprender.etiqueta, origen: 'ia' })
  }
  if (interno.traza) {
    if (!(await hayPasos())) {
      console.error(avisoTraza(interno.traza.t.id, 'la tabla tarificacion_trabajo_pasos no existe: no se guarda la traza (¿SQL de 08/10/2026 sin aplicar?)'))
    } else if (r.pasos.length === 0) {
      // Sin pasos y sin rechazo (ese ya se avisó en la ruta): el adaptador no instrumenta ctx.paso, o el worker es anterior a la traza.
      if (!r.trazaRechazada && r.tipo !== 'explorado' && (interno.traza.t as { modo?: string | null }).modo !== 'exploracion') console.error(avisoTraza(interno.traza.t.id, 'el worker no mandó ningún paso (adaptador sin ctx.paso o imagen antigua)'))
    } else {
      try {
        await guardarPasos(prisma, interno.traza.t, r.pasos, interno.traza.captura)
      } catch (e) {
        // Sin datos personales: solo el id del trabajo y el mensaje del error (`avisoTraza` quita URLs y recorta).
        console.error(avisoTraza(interno.traza.t.id, `no se pudo guardar la traza (${r.pasos.length} pasos): ${e instanceof Error ? e.message : String(e)}`))
      }
    }
  }
  return interno.res
}

/** Notas del documento del presupuesto guardado por el explorador. La referencia es del portal (no es un dato personal). */
export function notasPresupuestoExplorado(compania: string, ramo: string, referencia: string | null): string {
  return `Presupuesto de ${compania} (${ramo}) guardado por el explorador del tarificador RPA${referencia ? ` · referencia del portal: ${referencia}` : ' · referencia: no se vio'}`
}

async function guardarTarificacionRpa(tx: Db, t: FilaTrabajo, ofertas: OfertaNormalizada[], docs: string[]): Promise<string> {
  const rg = t.riesgo
  // La columna `ramo` del trabajo manda: si el JSON del riesgo dice otra cosa, no se guarda nada con columnas equivocadas.
  if (rg.ramo !== t.ramo) throw new Error(`tarificador: el riesgo (${String(rg.ramo)}) no casa con el ramo del trabajo (${t.ramo})`)
  // Columnas planas de la tarificación: las de un edificio solo existen en Comunidades; un vehículo (Moto) solo aporta el CP.
  // `null` = no consta (≠ 0): nunca se inventa un metro cuadrado ni un capital para una moto.
  const col =
    rg.ramo === 'comunidades'
      ? { fechaEfecto: rg.fechaEfecto ?? null, codigoPostal: rg.direccion?.codigoPostal ?? null, m2: rg.m2Construidos ?? null, anioConstruccion: rg.anioConstruccion ?? null, capitalContinente: rg.capitalContinente ?? null, capitalContenido: rg.capitalContenido ?? null }
      : rg.ramo === 'hogar'
        // Hogar (19/10/2026): la vivienda del formulario. `null` = no consta (nunca 0).
        ? { fechaEfecto: null, codigoPostal: rg.inmueble.codigoPostal, m2: rg.inmueble.superficieM2, anioConstruccion: rg.inmueble.anioConstruccion, capitalContinente: rg.hogar.capitalContinenteEur, capitalContenido: rg.hogar.capitalContenidoEur }
        : { fechaEfecto: null, codigoPostal: rg.codigoPostal, m2: null, anioConstruccion: null, capitalContinente: null, capitalContenido: null }
  const conDocs = ofertas.map((o) => ({ ...o, documentoId: o.pdf ? (docs[o.pdf.indice] ?? null) : null }))
  // ADITIVO (07/10/2026): el PDF del proyecto de la compañía (`seguros.documentos`), sin columna nueva: va en el
  // jsonb `respuesta`. `null` = el worker no lo obtuvo (el motivo va en los `avisos` de la oferta).
  const proyectoDocumentoId = conDocs.find((o) => o.documentoId)?.documentoId ?? null
  const respuesta = { canal: 'rpa', compania: t.compania, ofertas: conDocs, proyectoDocumentoId }
  // `peticion` NUNCA con el riesgo entero (13/10/2026): misma lista blanca que la purga del trabajo. Nadie lee de una
  // petición de portal datos personales (los lectores de `peticion` buscan la forma de Avant2: `risk.*`, `holder`).
  const filas = await tx.$queryRaw<{ id: string }[]>`
    insert into seguros.tarificaciones (
      correduria_id, intento_id, simulado, project_id_codeoscopic, canal,
      ramo, puerta, poliza_id, cliente_id, oportunidad_id, fecha_efecto, peticion,
      codigo_postal, metros_cuadrados, anio_construccion, capital_continente, capital_contenido,
      solicitado_por, respuesta, fallos
    ) values (
      ${t.correduria_id}::uuid, null, false, null, 'rpa',
      ${t.ramo}, 'corredor', ${t.poliza_id}::uuid, ${t.cliente_id}::uuid, ${t.oportunidad_id}::uuid,
      ${col.fechaEfecto}::date, ${JSON.stringify(riesgoSinDatosPersonales(rg, t.ramo))}::jsonb,
      ${col.codigoPostal}, ${col.m2}::int, ${col.anioConstruccion}::int,
      ${col.capitalContinente}::numeric, ${col.capitalContenido}::numeric,
      ${t.solicitado_por}, ${JSON.stringify(respuesta)}::jsonb, '[]'::jsonb
    ) returning id::text as id`
  const id = filas[0]?.id
  if (!id) throw new Error('tarificacion_rpa_sin_id')
  const leidasAt = new Date().toISOString()
  for (const o of ofertas) {
    // `frecuencia_pago` NO se escribe: es vocabulario de Avant2 (`paymentFrequency`); el fraccionamiento
    // del portal viaja en `respuesta.ofertas[]`. Mezclar vocabularios en una columna es inventar dato.
    // Un precio de portal es una OFERTA de la compañía, no un precio cerrado: `estimado` hasta que el
    // corredor lo revise (y nunca ReRate: no hay proyecto de Avant2 que re-tarificar).
    // COBERTURAS (18/10/2026): el sobre que entiende `coberturasDeSobre()`; sin ninguna legible → NULL (no consta,
    // jamás `vacias` = «no cubre nada»). Los avisos (supuestos incluidos) siguen en `avisos`, como aviso y no como dato.
    const sobre = sobreCoberturasRpa(o.coberturas, leidasAt)
    await tx.$executeRaw`
      insert into seguros.tarificacion_precios (
        tarificacion_id, compania, producto, modalidad, categoria, prima_eur, franquicia_eur,
        firmeza, requiere_rerate, referencia_vendor, avisos, coberturas
      ) values (
        ${id}::uuid, ${o.compania}, ${o.producto}, null, null, ${o.primaAnualEur}::numeric, ${franquiciaGeneral(o)}::numeric,
        'estimado', false, ${o.referenciaPortal}, ${JSON.stringify(o.avisos)}::jsonb, ${sobre ? JSON.stringify(sobre) : null}::jsonb
      )`
  }
  return id
}

async function guardarAdjunto(
  tx: Db,
  t: Pick<FilaTrabajo, 'correduria_id' | 'cliente_id' | 'poliza_id'>,
  a: { nombre: string; mime: string; contenido: Buffer; notas: string },
): Promise<string> {
  const sha = createHash('sha256').update(a.contenido).digest('hex')
  const filas = await tx.$queryRaw<{ id: string }[]>`
    insert into seguros.documentos
      (correduria_id, cliente_id, poliza_id, tipo, estado, nombre_fichero, mime_type, size_bytes, sha256,
       contenido, notas, subido_por, visible_por_cliente)
    values (${t.correduria_id}::uuid, ${t.cliente_id}::uuid, ${t.poliza_id}::uuid, 'otro', 'recibido',
            ${a.nombre}, ${a.mime}, ${a.contenido.length}::int, ${sha}, ${a.contenido}, ${a.notas}, 'agente', false)
    returning id::text as id`
  return filas[0].id
}

/**
 * Traza (08/10/2026): una fila por paso en `tarificacion_trabajo_pasos`. Los pasos ya vienen validados (solo cinco
 * claves, nombres de una lista cerrada). Si el trabajo falló con captura, el ÚLTIMO paso fallido apunta a ella
 * (`documento:<uuid>` = `evidencia_documento_id`); sin mecanismo de captura → `captura_ref` NULL. Las filas son
 * inmutables y el POST del resultado es idempotente (el segundo llega con el trabajo ya fuera de `en_curso` → 409).
 */
async function guardarPasos(tx: Db, t: Pick<FilaTrabajo, 'id' | 'correduria_id' | 'intentos'>, pasos: PasoTraza[], captura: 'con_captura' | null): Promise<void> {
  if (!pasos.length) return
  let ultimoFallido = -1
  pasos.forEach((p, i) => { if (!p.ok) ultimoFallido = i })
  let capturaRef: string | null = null
  if (captura && ultimoFallido >= 0) {
    const f = await tx.$queryRaw<{ id: string | null }[]>`select evidencia_documento_id::text as id from seguros.tarificacion_trabajos where id = ${t.id}::uuid`
    capturaRef = f[0]?.id ? `documento:${f[0].id}` : null
  }
  for (let i = 0; i < pasos.length; i++) {
    const p = pasos[i]
    await tx.$executeRaw`
      insert into seguros.tarificacion_trabajo_pasos (trabajo_id, correduria_id, intento, paso, inicio, duracion_ms, ok, error_codigo, captura_ref)
      values (${t.id}::uuid, ${t.correduria_id}::uuid, ${t.intentos}::int, ${p.paso}, ${p.inicio}::timestamptz, ${p.duracionMs}::int, ${p.ok}, ${p.errorCodigo},
              ${i === ultimoFallido ? capturaRef : null})`
  }
}

/** Marca el fallo de un trabajo `en_curso` según la política (1 reintento, solo infra). */
async function marcarFallo(
  db: Db,
  id: string,
  intentos: number,
  error: { tipo: TipoError; mensaje: string; url: string | null; atasco?: AtascoWorker },
  evidencia: { trabajo: FilaTrabajo; captura: Buffer | null; capturaConDatos?: boolean; html: string | null } | null,
  botVersion: string | null = null,
  conBotVersion = false,
): Promise<{ estado: string; tocada: boolean }> {
  // EMISIÓN (10/10/2026): nunca se reintenta sola (tras el clic, el estado en la compañía es incierto) → requiere_humano,
  // con tipo `emision` (la bandeja no la deja reintentar) y el aviso a Alberto rearmado.
  const modoFila = await db.$queryRaw<{ modo: string | null }[]>`select to_jsonb(t)->>'modo' as modo from seguros.tarificacion_trabajos t where t.id = ${id}::uuid`
  const deEmision = modoFila[0]?.modo === 'emision'
  // Si el token YA se canjeó (autorización consumida sin desenlace), el clic pudo salir: INCIERTO, y la autorización queda
  // marcada `incierto` (bloquea pedir otra emisión del presupuesto hasta que una persona lo resuelva mirando ePAC).
  let incierta = false
  let autorizacionIncierta: string | null = null
  if (deEmision) {
    const aut = await db.$queryRaw<{ id: string; consumido_at: Date | null; resultado: string | null }[]>`
      select a.id::text as id, a.consumido_at, a.resultado from seguros.tarificacion_emision_autorizacion a where a.trabajo_id = ${id}::uuid`
    const a = aut[0]
    incierta = autorizacionSinResolver(a ? { consumidoAt: a.consumido_at, resultado: a.resultado } : null)
    autorizacionIncierta = incierta ? a!.id : null
    const prefijo = incierta ? `${MENSAJE_EMISION_INCIERTA} Detalle: ` : ''
    error = { ...error, tipo: 'emision', mensaje: `${prefijo}[emisión, ${error.tipo}] ${error.mensaje}`.slice(0, 2000) }
  }
  const deExploracion = modoFila[0]?.modo === 'exploracion'
  // PRUEBA DE HUMO (15/10/2026): nunca se reintenta (otro login con nuestra credencial no aporta nada); sin atasco ni corte de tarificar.
  const deHumo = modoFila[0]?.modo === 'humo'
  let estado = deEmision ? estadoTrasErrorEmision() : estadoTrasError(error.tipo, intentos)
  if (deExploracion) {
    const cab = await db.$queryRaw<{ cerrada: boolean }[]>`select (cerrada_at is not null) as cerrada from seguros.tarificador_exploraciones where trabajo_id = ${id}::uuid`
    estado = estadoFalloExploracion(estado, cab[0]?.cerrada === true)
  }
  // ATASCO (F2): un hueco del portal con checkpoint, en un trabajo de tarificar, con el interruptor y bajo el tope de rondas →
  // `atascado` (espera la elección de Alberto) en vez de `error_definitivo`. El checkpoint NO va al `error` jsonb.
  if (deHumo) estado = estadoTrasFalloHumo()
  const { atasco: atascoCable, ...errorSinAtasco } = error
  error = errorSinAtasco
  const atasco = !deEmision && !deExploracion && !deHumo
    ? await atascoParaFallo(db, { trabajoId: id, estado, modo: modoFila[0]?.modo ?? null, tipoError: error.tipo, atasco: atascoCable })
    : null
  if (atasco) estado = 'atascado'
  // Un atascado (como un reintentable) sigue abierto: sin `terminado_at`.
  const abierto = estado === 'error_reintentable' || estado === 'atascado'
  let capturaId: string | null = null
  let htmlId: string | null = null
  const mimeCap = mimeCaptura(evidencia?.captura)
  if (evidencia?.captura && mimeCap) {
    // PNG (fallo genérico) o JPEG (atasco/hueco, 21/10/2026: puede mostrar datos del tomador). Mismo sitio y mismas reglas que
    // el HTML de evidencia: documento del cliente, solo por el puerto del operador, purga a los 15 días.
    capturaId = await guardarAdjunto(db, evidencia.trabajo, { nombre: nombreCapturaFallo(id, mimeCap), mime: mimeCap, contenido: evidencia.captura, notas: `Captura del fallo del tarificador RPA (${error.tipo})` })
  }
  if (evidencia?.html) {
    htmlId = await guardarAdjunto(db, evidencia.trabajo, { nombre: `fallo-${id.slice(0, 8)}.html`, mime: 'text/html', contenido: Buffer.from(evidencia.html, 'utf8'), notas: `HTML (redactado) del fallo del tarificador RPA (${error.tipo})` })
  }
  // `...error` lleva también los accesorios ya validados del cable (`opcionesVersion`, `inventarioDom`): van al jsonb.
  // Marca (15/10/2026): un `atascado` dice en su `error` que espera elección y con qué clave (solo la clave: el checkpoint, con
  // sus selectores, vive en `tarificador_atascos`). La caducidad la pisa con 'caducado' y el barrido de huérfanos con 'huerfano'.
  // Opciones de lista que vio el worker (21/10/2026; solo texto, redactado): `[]` = miró y no había; ausente = no se miró.
  const opcionesAtasco = atasco && atascoCable?.opciones ? { atascoOpciones: atascoCable.opciones } : {}
  const marcaAtasco = atasco ? { atasco: 'esperando', atascoClave: atasco.clave, ...opcionesAtasco } : {}
  // `capturaConDatos`: la captura muestra datos del tomador → el aviso de Telegram sale SIN foto (solo pantalla de plataforma).
  const marcaCaptura = capturaId ? { capturaConDatos: evidencia?.capturaConDatos === true } : {}
  const err = JSON.stringify({ ...error, ...marcaAtasco, ...marcaCaptura, html_documento_id: htmlId, en: new Date().toISOString() })
  let filasTocadas: number
  if (conBotVersion) {
    filasTocadas = await db.$executeRaw`
      update seguros.tarificacion_trabajos
      set estado = ${estado}, error = ${err}::jsonb, lease_hasta = null,
          evidencia_documento_id = coalesce(${capturaId}::uuid, evidencia_documento_id),
          bot_version = coalesce(${botVersion}, bot_version),
          terminado_at = case when ${abierto} then null else now() end, updated_at = now()
      where id = ${id}::uuid and estado = 'en_curso'`
  } else {
    filasTocadas = await db.$executeRaw`
      update seguros.tarificacion_trabajos
      set estado = ${estado}, error = ${err}::jsonb, lease_hasta = null,
          evidencia_documento_id = coalesce(${capturaId}::uuid, evidencia_documento_id),
          terminado_at = case when ${abierto} then null else now() end, updated_at = now()
      where id = ${id}::uuid and estado = 'en_curso'`
  }
  const tocada = filasTocadas > 0
  // Una exploración que ya no se reintenta cierra su cabecera con estado de error (`descartado` si no hay mapa).
  if (tocada && deExploracion && cierraCabeceraTrasFallo(estado)) {
    await db.$executeRaw`
      update seguros.tarificador_exploraciones
      set cerrada_at = now(), estado_mapa = case when mapa is null then 'descartado' else estado_mapa end,
          motivo_fin = coalesce(motivo_fin, 'error_trabajo'), updated_at = now()
      where trabajo_id = ${id}::uuid and cerrada_at is null`
  }
  // Los efectos secundarios SOLO si el UPDATE tocó la fila (si un resultado llegó a la vez y ganó, esto no hace nada).
  if (tocada && autorizacionIncierta) await db.$executeRaw`update seguros.tarificacion_emision_autorizacion set resultado = 'incierto' where id = ${autorizacionIncierta}::uuid and resultado is null`
  if (tocada && deEmision) await db.$executeRaw`update seguros.tarificacion_trabajos set emision_avisada_at = null where id = ${id}::uuid and estado = 'requiere_humano'`
  // ATASCO (F2): el checkpoint con la captura del fallo (misma transacción).
  if (tocada && atasco) {
    const fila = await db.$queryRaw<{ correduria_id: string; compania: string; ramo: string }[]>`
      select correduria_id::text as correduria_id, compania, ramo from seguros.tarificacion_trabajos where id = ${id}::uuid`
    if (fila[0]) await guardarAtasco(db, { id, correduriaId: fila[0].correduria_id, compania: fila[0].compania, ramo: fila[0].ramo }, atasco, capturaId)
  }
  // PURGA (13/10/2026): solo si quedó en un estado cerrado (`error_definitivo`); `error_reintentable`, `requiere_humano` y
  // `atascado` conservan el riesgo para el reintento (lo decide `planPurgaRiesgo`).
  if (tocada) await purgarRiesgoTrabajos(db, [id])
  // CORTE (F2): tras un `error_definitivo` de tarificar, ¿lleva la pareja N fallos seguidos del bot? → pausa (una viva).
  if (tocada && estado === 'error_definitivo' && !deEmision && !deExploracion && !deHumo) await evaluarCorte(db, id)
  // HUMO con la contraseña rechazada: pausa de la compañía (como un trabajo de tarificar) y no se repite el login esta noche.
  if (tocada && deHumo && humoPideParar(error.tipo)) await pausarTrasHumo(db, id)
  return { estado, tocada }
}

// ─── Barrido (enganchable a un cron existente) ───────────────────────────────

export type ResumenBarrido = {
  /** `rpa_apagado`: la limpieza SÍ corrió; solo se omitió el lanzamiento de máquinas. */
  omitido?: string
  /** Pasos del barrido que fallaron (nombre → mensaje). Ausente = ninguno falló; un paso fallido deja su campo sin definir, no a 0. */
  errores?: Record<string, string>
  pausasCaducadas?: number
  emisionesCaducadas?: { solicitudes: number; autorizaciones: number }
  leasesVencidos: number
  reencolados: number
  cancelados: number
  /** Respaldo de la purga del riesgo (13/10/2026): trabajos cerrados a los que aún les quedaba algún dato personal. */
  riesgosPurgados?: number
  /** Trabajos cerrados a los que se les quitó el recorrido/inventario por caducidad (`DIAS_RETENCION_RECORRIDO`). */
  recorridosCaducados?: number
  /** Documentos de evidencia de fallo (captura/HTML) borrados por caducidad (`DIAS_RETENCION_EVIDENCIA`, 15 días). */
  evidenciasPurgadas?: number
  /** F2: atascos sin respuesta que pasaron a `error_definitivo`. */
  atascosCaducados?: number
  /** Generali en espera del vehículo (18/10/2026): cuántos recibieron el de Allianz/Mapfre y cuántos se cancelaron sin él. */
  esperasVehiculo?: { inyectados: number; cancelados: number; liberados: number; esperando: number }
  lanzar: Record<string, ResumenLanzar>
}

/**
 * Barrido de la cola. Cron PROPIO cada 5 min (`/api/cron/tarificador-cola`, 13/10/2026) además del de
 * renovaciones; y al encolar se lanza en el acto (`lanzarPendientes`). Hace, en orden:
 *   1. lease vencido (`en_curso` y `lease_hasta` pasado) → fallo de infra (reintentable una vez) y
 *      destruye la máquina si sigue viva;
 *   2. `error_reintentable` bajo el tope → `pendiente`;
 *   3. `pendiente` de una integración que YA no es rpa_autorizada/activa → `cancelado`;
 *   4. lanza lo que quepa por compañía.
 */
export async function barrerTarificadorRpa(correduriaId: string, deps: DepsLanzador = depsReales()): Promise<ResumenBarrido> {
  const r: ResumenBarrido = { leasesVencidos: 0, reencolados: 0, cancelados: 0, lanzar: {} }
  // La LIMPIEZA corre siempre (19/10/2026): con el RPA apagado los colgados se limpiaban nunca. Solo LANZAR máquinas depende del flag.
  const activo = rpaActivo(deps.env)
  if (!activo) r.omitido = 'rpa_apagado'
  // Cada paso con su propio try/catch (un fallo no impide los demás): `errores` los lista; nunca se calla un fallo como «0».
  const paso = async <T>(nombre: string, fn: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await fn()
    } catch (e) {
      const msg = e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 200) : String(e).slice(0, 200)
      console.error(`[tarificador] barrido, paso ${nombre}`, msg)
      ;(r.errores ??= {})[nombre] = msg
      return undefined
    }
  }

  await paso('leases_vencidos', async () => {
    const vencidos = await prisma.$queryRaw<{ id: string; intentos: number; fly_machine_id: string | null }[]>`
      select id::text as id, intentos, fly_machine_id from seguros.tarificacion_trabajos
      where correduria_id = ${correduriaId}::uuid and estado = 'en_curso' and lease_hasta < now()`
    const fly = configFly(deps.env)
    for (const v of vencidos) {
      const f = await marcarFallo(prisma, v.id, v.intentos, { tipo: 'infra', mensaje: 'lease_vencido: el worker no devolvió resultado a tiempo', url: null }, null)
      if (!f.tocada) continue // un resultado llegó a la vez y ganó: ni se cuenta ni se destruye la máquina
      if (fly.ok && v.fly_machine_id) await destruirMaquina(fly.cfg, v.fly_machine_id, deps.fetch)
      r.leasesVencidos++
    }
  })

  // Emisión: 24 h sin botón, o autorización caducada sin máquina → cancelado (nunca se emite tarde).
  r.emisionesCaducadas = await paso('emisiones', () => caducarEmisiones(correduriaId))

  // ATASCO (F2): sin respuesta pasada su hora → error_definitivo (riesgo purgado y corte evaluado). Sin lanzar: el barrido sigue.
  r.atascosCaducados = await paso('atascos', () => caducarAtascos(correduriaId))

  // PAUSAS (19/10/2026): una sin reanudar pasadas `PAUSA_CADUCA_HORAS` se cierra (reanudada_por = 'caducidad'); la fila se conserva.
  r.pausasCaducadas = await paso('pausas', () => caducarPausas(correduriaId))

  r.reencolados = (await paso('reencolar', () => prisma.$executeRaw`
    update seguros.tarificacion_trabajos set estado = 'pendiente', updated_at = now()
    where correduria_id = ${correduriaId}::uuid and estado = 'error_reintentable' and intentos < ${MAX_INTENTOS}`)) ?? 0

  r.cancelados = (await paso('cancelar_no_autorizados', async () => {
    const cancelados = await prisma.$queryRaw<{ id: string }[]>`
      update seguros.tarificacion_trabajos w
      set estado = 'cancelado', terminado_at = now(), updated_at = now(),
          error = jsonb_build_object('tipo', 'datos', 'mensaje', 'modo_no_automatizable: la integración ya no está autorizada o activa')
      where w.correduria_id = ${correduriaId}::uuid and w.estado = 'pendiente'
        and not exists (
          select 1 from seguros.companias_integracion ci
          where ci.correduria_id = w.correduria_id and ci.compania = w.compania and ci.ramo = w.ramo
            and ci.activo and ci.modo = 'rpa_autorizada')
      returning w.id::text as id`
    await purgarRiesgoTrabajos(prisma, cancelados.map((c) => c.id))
    return cancelados.length
  })) ?? 0

  // Respaldo de la purga: lo cerrado por un camino que no la llamó (o antes de existir). Sin lanzar: el barrido sigue.
  r.riesgosPurgados = await paso('purga_riesgos', () => purgarRiesgosCerrados(prisma, correduriaId))
  // El recorrido y el inventario de pantalla de un trabajo cerrado se guardan `DIAS_RETENCION_RECORRIDO` días (diagnóstico).
  r.recorridosCaducados = await paso('recorridos', () => purgarRecorridosCaducados(prisma, correduriaId))
  // La EVIDENCIA de fallo (captura/HTML con datos personales) de un trabajo terminado vive `DIAS_RETENCION_EVIDENCIA` días (15).
  r.evidenciasPurgadas = await paso('evidencias', () => purgarEvidenciaCaducada(prisma, correduriaId))

  // Vehículo encadenado (Generali, 18/10/2026): inyecta el de Allianz/Mapfre o cancela si ya no puede llegar. Sin lanzar.
  r.esperasVehiculo = await paso('esperas_vehiculo', () => resolverEsperasVehiculo(correduriaId))

  // Lanzar máquinas SÍ depende del flag (`lanzarPendientes` también lo comprueba).
  if (!activo) return r
  await paso('lanzar', async () => {
    const companias = await prisma.$queryRaw<{ compania: string }[]>`
      select distinct compania from seguros.tarificacion_trabajos
      where correduria_id = ${correduriaId}::uuid and estado = 'pendiente'`
    for (const c of companias) {
      // Un fallo de una compañía no impide lanzar las demás.
      await paso(`lanzar_${c.compania}`, async () => { r.lanzar[c.compania] = await lanzarPendientes(correduriaId, c.compania, deps) })
    }
  })
  return r
}

// ─── Vehículo encadenado (Generali, 18/10/2026) ─────────────────────────────

/** Los `ok` de Allianz/Mapfre AUTO de la oportunidad (de ESTA correduría), los más recientes primero. */
async function leerOrigenesVehiculo(db: Db, correduriaId: string, oportunidadId: string): Promise<FilaOrigen[]> {
  const filas = await db.$queryRaw<{ compania: string; ramo: string; riesgo: unknown; terminado_at: Date | null }[]>`
    select t.compania, t.ramo, t.riesgo, t.terminado_at
    from seguros.tarificacion_trabajos t
    where t.correduria_id = ${correduriaId}::uuid and t.oportunidad_id = ${oportunidadId}::uuid
      and t.estado = 'ok' and t.ramo = 'auto' and t.compania = any(${[...ORIGENES_VEHICULO_ENCADENADO]}::text[])
      and coalesce(to_jsonb(t)->>'modo', 'tarificar') in ('tarificar', 'identificar')
    order by t.terminado_at desc nulls last
    limit 10`
  return filas.map((f) => ({ compania: f.compania, ramo: f.ramo, riesgo: f.riesgo, terminadoAt: f.terminado_at }))
}

/** Los últimos `ok` de Allianz/Mapfre AUTO del CLIENTE (de ESTA correduría), para «probar» Generali sin oportunidad. Fallo de lectura = sin origen. */
export async function leerOrigenesVehiculoCliente(correduriaId: string, clienteId: string): Promise<FilaOrigen[]> {
  try {
    const filas = await prisma.$queryRaw<{ compania: string; ramo: string; riesgo: unknown; terminado_at: Date | null }[]>`
      select t.compania, t.ramo, t.riesgo, t.terminado_at
      from seguros.tarificacion_trabajos t
      where t.correduria_id = ${correduriaId}::uuid and t.cliente_id = ${clienteId}::uuid
        and t.estado = 'ok' and t.ramo = 'auto' and t.compania = any(${[...ORIGENES_VEHICULO_ENCADENADO]}::text[])
        and coalesce(to_jsonb(t)->>'modo', 'tarificar') in ('tarificar', 'identificar')
      order by t.terminado_at desc nulls last
      limit 10`
    return filas.map((f) => ({ compania: f.compania, ramo: f.ramo, riesgo: f.riesgo, terminadoAt: f.terminado_at }))
  } catch {
    return []
  }
}

/** Inyecta `v` en los trabajos `pendiente` en espera de la oportunidad (de ESTA correduría). Devuelve cuántos. */
async function inyectarVehiculoEnEspera(db: Db, correduriaId: string, oportunidadId: string, v: VehiculoEncadenado): Promise<number> {
  const filas = await db.$queryRaw<{ id: string; riesgo: unknown }[]>`
    select t.id::text as id, t.riesgo from seguros.tarificacion_trabajos t
    where t.correduria_id = ${correduriaId}::uuid and t.oportunidad_id = ${oportunidadId}::uuid and t.estado = 'pendiente'
      and (case when jsonb_typeof(t.riesgo) = 'object' then t.riesgo -> ${CLAVE_ESPERA_VEHICULO}::text end) is not null
    for update`
  let n = 0
  for (const f of filas) {
    n += await db.$executeRaw`
      update seguros.tarificacion_trabajos set riesgo = ${JSON.stringify(riesgoConVehiculo(f.riesgo, v))}::jsonb, updated_at = now()
      where id = ${f.id}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'pendiente'`
  }
  return n
}

/**
 * Barrido de los trabajos en espera del vehículo: con un `ok` de origen en la oportunidad → se inyecta. Sin vehículo:
 *   · Generali (no busca por matrícula): sin ningún origen vivo o pasadas 24 h → `cancelado` con el motivo (y riesgo purgado).
 *   · Mapfre/Allianz: nunca se cancelan ni se congelan; si la identificación no está en curso, falló, Mapfre está pausado/inactivo
 *     o pasaron 2 h, se LIBERAN (se quita la marca) y tarifican preguntando su versión, como siempre.
 */
async function resolverEsperasVehiculo(correduriaId: string): Promise<{ inyectados: number; cancelados: number; liberados: number; esperando: number }> {
  const res = { inyectados: 0, cancelados: 0, liberados: 0, esperando: 0 }
  const esperas = await prisma.$queryRaw<{ id: string; oportunidad_id: string | null; compania: string; ramo: string; created_at: Date; ahora: Date }[]>`
    select t.id::text as id, t.oportunidad_id::text as oportunidad_id, t.compania, t.ramo, t.created_at, now() as ahora
    from seguros.tarificacion_trabajos t
    where t.correduria_id = ${correduriaId}::uuid and t.estado = 'pendiente'
      and (case when jsonb_typeof(t.riesgo) = 'object' then t.riesgo -> ${CLAVE_ESPERA_VEHICULO}::text end) is not null
    order by t.created_at
    limit 100`
  // ¿Puede avanzar una identificación de Mapfre? (pausa viva de la pareja o integración inactiva/ausente → no). Una vez por barrido, y solo si hace falta.
  let mapfreBloqueado: boolean | null = null
  const origenBloqueado = async (): Promise<boolean> => {
    if (mapfreBloqueado === null) {
      // Si no se puede comprobar, se considera bloqueado: lo conservador es liberar (que pregunte), nunca congelar.
      mapfreBloqueado = await Promise.all([pausaViva(prisma, correduriaId, 'mapfre', 'auto'), leerIntegracion(correduriaId, 'mapfre', 'auto')])
        .then(([pausa, integ]) => pausa || !integ || !integ.activo)
        .catch(() => true)
    }
    return mapfreBloqueado
  }
  for (const w of esperas) {
    const liberable = esperaLiberable(w.compania, w.ramo)
    // Orden (revisión 18/10/2026): PRIMERO se cuentan los orígenes vivos y DESPUÉS se leen los `ok`. Al revés, un Allianz/Mapfre
    // que acaba `ok` entre las dos lecturas no se ve ni como `ok` ni como vivo, y el Generali se cancelaría con vehículo disponible.
    // Para un trabajo liberable el origen vivo es una IDENTIFICACIÓN de Mapfre (`modo = identificar`), no otra tarificación.
    const vivos = w.oportunidad_id
      ? liberable
        ? await prisma.$queryRaw<{ n: number }[]>`
            select count(*)::int as n from seguros.tarificacion_trabajos t
            where t.correduria_id = ${correduriaId}::uuid and t.oportunidad_id = ${w.oportunidad_id}::uuid and t.ramo = 'auto'
              and t.compania = 'mapfre' and coalesce(to_jsonb(t)->>'modo', 'tarificar') = 'identificar'
              and t.estado = any(${[...ESTADOS_ORIGEN_VIVOS]}::text[])`
        : await prisma.$queryRaw<{ n: number }[]>`
            select count(*)::int as n from seguros.tarificacion_trabajos t
            where t.correduria_id = ${correduriaId}::uuid and t.oportunidad_id = ${w.oportunidad_id}::uuid and t.ramo = 'auto'
              and t.compania = any(${[...ORIGENES_VEHICULO_ENCADENADO]}::text[]) and t.estado = any(${[...ESTADOS_ORIGEN_VIVOS]}::text[])`
      : [{ n: 0 }]
    const origenes = w.oportunidad_id ? await leerOrigenesVehiculo(prisma, correduriaId, w.oportunidad_id) : []
    const vehiculo = vehiculoDeOrigenes(origenes)
    const d = decidirEspera({
      vehiculo,
      origenesVivos: vivos[0]?.n ?? 0,
      creadoAt: w.created_at,
      ahora: w.ahora,
      compania: w.compania,
      ramo: w.ramo,
      origenBloqueado: liberable && !vehiculo ? await origenBloqueado() : false,
    })
    if (d.tipo === 'esperar') {
      res.esperando++
    } else if (d.tipo === 'inyectar') {
      res.inyectados += await prisma.$transaction((tx) => inyectarVehiculoEnEspera(tx, correduriaId, w.oportunidad_id!, d.vehiculo))
    } else if (d.tipo === 'liberar') {
      // Solo si SIGUE pendiente y en espera: si mientras tanto el registro del ok le inyectó el vehículo (quita la marca), no hay nada que liberar.
      const l = await prisma.$executeRaw`
        update seguros.tarificacion_trabajos
        set riesgo = riesgo - ${CLAVE_ESPERA_VEHICULO}::text, updated_at = now()
        where id = ${w.id}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'pendiente'
          and jsonb_typeof(riesgo) = 'object' and (riesgo -> ${CLAVE_ESPERA_VEHICULO}::text) is not null`
      res.liberados += l
    } else {
      const c = await prisma.$executeRaw`
        update seguros.tarificacion_trabajos
        set estado = 'cancelado', terminado_at = now(), updated_at = now(),
            error = jsonb_build_object('tipo', 'datos', 'mensaje', ${d.motivo}::text)
        where id = ${w.id}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'pendiente'
          -- Solo si SIGUE en espera: si mientras tanto el registro del ok le inyectó el vehículo (quita la marca), no se cancela.
          -- (equivale a riesgo ? 'esperaVehiculo', escrito como la consulta de arriba, sin el operador ? en el SQL de Prisma).
          and jsonb_typeof(riesgo) = 'object' and (riesgo -> ${CLAVE_ESPERA_VEHICULO}::text) is not null`
      if (c > 0) {
        await purgarRiesgoTrabajos(prisma, [w.id])
        res.cancelados++
      }
    }
  }
  return res
}
