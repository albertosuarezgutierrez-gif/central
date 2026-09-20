import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'

import { normalizarTitular, type TitularDeclarado } from '@central/module-seguros-portal'

import { avisarPolizaDeclaradaDesdeAlta } from '@/lib/aviso-poliza-declarada'
import { guardarDocumentoPropio } from '@/lib/documento-portal'
import { prisma } from '@/lib/db'
import { extraerPoliza } from '@/lib/extraer-poliza'
import { normalizarAlta } from '@/lib/poliza-editable'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'

const MAX_BYTES = 10 * 1024 * 1024

/**
 * Alta de una póliza en la bóveda del cliente. Dos caminos, una sola ruta:
 *
 *  - `multipart/form-data` con `documento` → sube un PDF/foto, lo lee la IA y
 *    la fila nace SIN confirmar (los datos los ha adivinado un extractor).
 *  - `application/json` con los campos declarables → alta A MANO, para quien
 *    tiene la póliza en papel o no tiene el PDF. La fila nace confirmada: la
 *    ha escrito la persona con sus ojos.
 *
 * Los dos crean la misma fila (`procedencia: 'declarado'`): que el dato lo
 * aporte el cliente, con o sin papel, no lo convierte en dato verificado.
 */
export async function POST(req: Request) {
  // La identidad SIEMPRE sale de la cookie, nunca del cuerpo de la petición:
  // es lo único que impide que alguien escriba en la bóveda de otro.
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }

  const tipo = req.headers.get('content-type') ?? ''
  if (tipo.includes('application/json')) return altaAMano(req, identidad.id)
  return altaConDocumento(req, identidad.id)
}

/**
 * Lo que se guarda de la pregunta «¿es tuya o de tu empresa?».
 *
 * 🚨 `sin_preguntar` se guarda como NULL y NO como `'propio'`. Es la diferencia
 * entre «ha dicho que es suya» y «no consta», y de ella depende contra qué
 * ficha se comprueba después si la casa ya lleva esa póliza. Un default a
 * `'propio'` sería cómodo y falso.
 */
function columnasTitular(t: TitularDeclarado) {
  return {
    titularTipo: t.tipo === 'sin_preguntar' ? null : t.tipo,
    titularEmpresaNombre: t.nombre,
    titularEmpresaCif: t.cif,
  }
}

async function altaConDocumento(req: Request, identidadId: string) {
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'cuerpo_invalido' }, { status: 400 })
  }
  const fichero = form.get('documento')
  if (!(fichero instanceof File)) return NextResponse.json({ error: 'sin_fichero' }, { status: 400 })
  if (fichero.size > MAX_BYTES) return NextResponse.json({ error: 'fichero_grande' }, { status: 413 })

  // La pregunta viaja en el MISMO formulario que el documento: separarla en una
  // segunda petición dejaría filas guardadas sin respuesta cuando alguien cierra
  // la pestaña, y esas filas son indistinguibles de un «no se preguntó».
  const titular = normalizarTitular({
    tipo: form.get('titularTipo'),
    nombre: form.get('titularEmpresaNombre'),
    cif: form.get('titularEmpresaCif'),
  })

  // Casi siempre vacío: nadie sabe de antemano que su PDF pide contraseña.
  // Viaja por si acaso, para que un cliente que sí lo sepa no tenga que fallar
  // primero — `extraerPoliza` la ignora sin más si no hace falta.
  const contrasenaCampo = form.get('contrasena')
  const contrasena = typeof contrasenaCampo === 'string' && contrasenaCampo !== '' ? contrasenaCampo : undefined

  const buffer = Buffer.from(await fichero.arrayBuffer())
  // Las dos van en paralelo: son independientes (una lee con IA, la otra sube
  // bytes) y no hay que esperar a la extracción para archivar el documento.
  // 🚨 El archivado NUNCA bloquea el alta: si el puente falla (env sin poner,
  // asegura caído), la póliza se guarda igual con lo que se pudo leer — es la
  // regla de la casa, «guardar primero, para no perder datos» no puede
  // convertirse en «si no se pudo archivar, no se guarda nada».
  const [{ datos, fuente, camposRamo, motivo }, documentoGuardado] = await Promise.all([
    extraerPoliza(buffer, fichero.type, fichero.name, contrasena),
    guardarDocumentoPropio(identidadId, { tipo: 'poliza', nombre: fichero.name, mime: fichero.type, contenido: buffer }),
  ])

  const poliza = await prisma.portalPolizaDeclarada.create({
    data: {
      identidadId,
      compania: datos.compania,
      numeroPoliza: datos.numeroPoliza,
      ramo: datos.ramo,
      primaAnual: datos.primaAnual,
      fechaVencimiento: datos.fechaVencimiento ? new Date(`${datos.fechaVencimiento}T00:00:00Z`) : null,
      // Los tres del vehículo, si el documento los traía. `null` es lo normal:
      // una póliza de hogar no tiene matrícula, y una de auto puede no traer el
      // bastidor impreso. Se guardan ya validados por `extraer-poliza.ts` —un
      // bastidor que no cumple la forma llega `null`, porque un VIN mal leído no
      // es un dato incompleto, es OTRO coche.
      matricula: datos.matricula,
      bastidor: datos.bastidor,
      // Medianoche UTC, igual que el vencimiento: la columna es `date` y así el
      // día no se corre según la zona del servidor.
      fechaMatriculacion: datos.fechaMatriculacion
        ? new Date(`${datos.fechaMatriculacion}T00:00:00Z`)
        : null,
      // La referencia catastral del INMUEBLE, si el documento la traía. Solo la
      // de 20 caracteres: una de 14 es la de la FINCA (el edificio) y llega
      // `null` desde `extraer-poliza.ts` — guardarla traería los metros del
      // edificio a una póliza de hogar, que es un dato plausible y equivocado.
      referenciaCatastral: datos.referenciaCatastral,
      // Los campos propios del RAMO que el documento traía, ya validados contra
      // el catálogo del ramo detectado (`normalizarDatosRamo`, en el módulo
      // puro): lo que la IA no supo leer bien no llega hasta aquí, llega `null`.
      // `DbNull` es el NULL de SQL —la columna vacía, lo que `IS NULL` encuentra—
      // y `JsonNull` guardaría el literal `null` DENTRO del JSON, que pasa todas
      // las guardas de NULL. La distinción es la misma que la de `extraccionBruta`.
      datosRamo: datos.datosRamo ?? Prisma.DbNull,
      // Y de dónde salió cada uno de esos campos: aquí, TODOS del `documento`
      // (los ha leído la IA del PDF o de la foto), que es distinto de lo que la
      // persona teclea a ojo y distinto de lo que confirma del Catastro. Los
      // orígenes se escriben en el MISMO paso que sus datos: uno sin el otro es
      // una afirmación sobre un dato que no está.
      datosRamoOrigen: datos.datosRamoOrigen ?? Prisma.DbNull,
      // Siempre `declarado`: lo ha aportado el usuario. Que lo haya leído una IA
      // no lo convierte en dato verificado — al revés, es donde más se inventa.
      procedencia: 'declarado',
      confirmadaPorUsuario: false,
      documentoNombre: fichero.name,
      ...columnasTitular(titular),
      // `camposRamo` entra en la extracción bruta para que quede constancia de
      // que la 2ª pasada se intentó y no salió: sin él, una fila con
      // `datos_ramo` a NULL no distingue «la póliza no lo trae» de «no se pudo
      // mirar», y esa distinción es justo lo que hay que poder auditar después.
      // `documentoGuardado` deja constancia de si el FICHERO llegó a la ficha
      // del corredor (`seguros.documentos`) o por qué no, para poder auditarlo
      // después sin tener que reproducir la subida.
      extraccionBruta: { fuente, camposRamo, datos, documentoGuardado: documentoGuardado.estado },
    },
    select: { id: true },
  })

  // Best-effort y no bloqueante: el aviso a Alberto no puede retrasar ni
  // tumbar la respuesta al cliente que acaba de subir su póliza.
  void avisarPolizaDeclaradaDesdeAlta({
    identidadId,
    compania: datos.compania,
    ramo: datos.ramo,
    numeroPoliza: datos.numeroPoliza,
    fechaVencimiento: datos.fechaVencimiento,
  })

  return NextResponse.json({ id: poliza.id, datos, fuente, camposRamo, motivo, documentoGuardado: documentoGuardado.estado })
}

async function altaAMano(req: Request, identidadId: string) {
  let cuerpo: unknown
  try {
    cuerpo = await req.json()
  } catch {
    return NextResponse.json({ error: 'cuerpo_invalido' }, { status: 400 })
  }

  // La MISMA validación que el PATCH (`lib/poliza-editable.ts`): lo que se
  // rechaza al corregir se rechaza al crear. Y exige compañía o número: sin
  // nada que identifique el seguro, la fila es ruido.
  const normalizado = normalizarAlta(cuerpo)
  if (!normalizado.ok) return NextResponse.json({ error: normalizado.error }, { status: 400 })
  const { datos } = normalizado

  // La misma pregunta que en el alta con documento, leída del JSON. No pasa por
  // `normalizarAlta` a propósito: aquello valida los campos de la PÓLIZA y esto
  // es de quién es, que es otra cosa y tiene su propio módulo puro.
  const cuerpoObj = (cuerpo ?? {}) as Record<string, unknown>
  const titular = normalizarTitular({
    tipo: cuerpoObj.titularTipo,
    nombre: cuerpoObj.titularEmpresaNombre,
    cif: cuerpoObj.titularEmpresaCif,
  })

  // Las dos columnas de JSON salen del resto a propósito: Prisma NO admite
  // `null` en una columna `Json?`, y el `null` de `DatosAlta` («no se ha
  // declarado ninguno») tiene que llegar a la BD como `DbNull` (NULL de SQL) y
  // nunca como `JsonNull`, que escribiría el literal `null` DENTRO del JSON y se
  // colaría por `IS NULL`. `referenciaCatastral` no: es una columna `text` y
  // viaja en el resto como la matrícula.
  const { datosRamo, datosRamoOrigen, ...resto } = datos

  const poliza = await prisma.portalPolizaDeclarada.create({
    data: {
      identidadId,
      ...resto,
      datosRamo: datosRamo ?? Prisma.DbNull,
      // El origen viaja pegado a sus datos, en la misma escritura: guardar los
      // metros sin decir que los dio el Catastro los deja indistinguibles de una
      // estimación a ojo, y es justo la pregunta que esta columna responde.
      datosRamoOrigen: datosRamoOrigen ?? Prisma.DbNull,
      ...columnasTitular(titular),
      // Sigue siendo un dato APORTADO por el cliente, no verificado contra la
      // compañía: `declarado`, igual que si viniera de un PDF.
      procedencia: 'declarado',
      // `true` desde el nacimiento, al contrario que en el alta con documento.
      // `confirmadaPorUsuario` significa una sola cosa: «una persona ha revisado
      // estos datos con sus ojos». En el PDF los adivina un extractor y la
      // persona todavía no los ha mirado; aquí los ha tecleado ella, campo a
      // campo, así que ya están revisados — dejarlo a `false` le pediría que
      // confirmara lo que acaba de escribir.
      confirmadaPorUsuario: true,
      // No hubo documento ni extractor: los dos huecos se declaran, no se
      // rellenan con un nombre de cajón ni con un JSON vacío. `DbNull` es el
      // NULL de SQL (la columna vacía, lo que `IS NULL` encuentra); `JsonNull`
      // guardaría el literal `null` DENTRO del JSON, que pasa todas las guardas
      // de NULL y es otro «no lo sé» disfrazado de valor.
      documentoNombre: null,
      extraccionBruta: Prisma.DbNull,
    },
    select: { id: true },
  })

  const fechaVencimiento = datos.fechaVencimiento ? datos.fechaVencimiento.toISOString().slice(0, 10) : null

  // Best-effort y no bloqueante, igual que en el alta con documento.
  void avisarPolizaDeclaradaDesdeAlta({
    identidadId,
    compania: datos.compania,
    ramo: datos.ramo,
    numeroPoliza: datos.numeroPoliza,
    fechaVencimiento,
  })

  return NextResponse.json(
    {
      id: poliza.id,
      datos: {
        ...datos,
        // Columna `date`: se devuelve como `YYYY-MM-DD`, que es lo que la
        // pantalla pinta y lo que come `<input type="date">`.
        fechaVencimiento,
      },
    },
    { status: 201 },
  )
}
