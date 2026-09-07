'use client'
import { useRouter } from 'next/navigation'

import { normalizarTitular } from '@central/module-seguros-portal'
import { useState } from 'react'

import { avisoDocumentoNoPoliza } from '@central/module-seguros-portal'

import { eur } from '@/lib/dinero'
import { fechaEs } from '@/lib/fechas'

import { AnadirPoliza, type PolizaGuardada } from './AnadirPoliza'
import type { RamoOpcion } from './CamposPoliza'

type DatosLeidos = {
  compania: string | null
  numeroPoliza: string | null
  ramo: string | null
  primaAnual: number | null
  fechaVencimiento: string | null
}
type Resultado = {
  datos: DatosLeidos & { tipoDocumento?: 'poliza' | 'suplemento' | 'recibo' | 'otro' | null }
  fuente: 'texto' | 'vision' | 'none'
  /** Cómo fue la 2ª pasada, la de los campos propios del ramo. Ver `EstadoCamposRamo`. */
  camposRamo?: 'leidos' | 'no_leidos' | 'no_aplica'
}

/**
 * La entrada a la bóveda de aportadas: dos caminos para la misma fila.
 *
 *  - Subir el PDF o una foto: lo lee la IA y lo que salga se enseña como
 *    «leído por nosotros», para que la persona lo revise.
 *  - Añadirla A MANO (`AnadirPoliza`): para quien la tiene en papel o no
 *    tiene el documento. Lo que teclea es lo que se guarda.
 *
 * Lo que NO hace ninguno de los dos, y el texto no debe insinuar: meter la
 * póliza en la cartera de la correduría, ni verificarla nadie. Es el apunte de
 * la persona; con la fecha de vencimiento se le puede avisar antes de que venza.
 */
export function SubirPoliza({ ramos }: { ramos: readonly RamoOpcion[] }) {
  const router = useRouter()
  const [estado, setEstado] = useState<'reposo' | 'subiendo' | 'listo' | 'error'>('reposo')
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [manual, setManual] = useState(false)
  // De quién es la póliza que se va a subir. Se pregunta ANTES de elegir el
  // fichero porque la respuesta viaja en el mismo envío: preguntarla después
  // dejaría filas ya guardadas sin respuesta cuando alguien cierra la pestaña,
  // y esas serían indistinguibles de un «no se preguntó».
  //
  // 🚨 Arranca en `null` — sin respuesta — y NO en «mía». Un valor por defecto
  // aquí no es una comodidad: es responder por el cliente, y de esa respuesta
  // depende contra qué ficha se comprueba luego si la correduría ya la lleva.
  const [deQuien, setDeQuien] = useState<'propio' | 'empresa' | null>(null)
  // Se recuerda entre subidas porque quien trae las pólizas de su empresa trae
  // varias seguidas. Se recuerda VISIBLE: el control sigue en pantalla con la
  // respuesta marcada, así que cambiarla es un clic y no hay nada oculto.
  const [empresa, setEmpresa] = useState('')
  const [cif, setCif] = useState('')
  const [guardadaAMano, setGuardadaAMano] = useState<PolizaGuardada | null>(null)

  async function subir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = '' // permite volver a elegir el mismo fichero tras un error
    if (!f) return
    setEstado('subiendo')
    setResultado(null)
    setGuardadaAMano(null)
    const body = new FormData()
    body.append('documento', f)
    // Solo se manda lo que la persona ha CONTESTADO. Sin respuesta no se manda
    // nada y la fila queda con «no se preguntó», que es la verdad.
    if (deQuien !== null) body.append('titularTipo', deQuien)
    if (deQuien === 'empresa') {
      body.append('titularEmpresaNombre', empresa)
      if (cif.trim() !== '') body.append('titularEmpresaCif', cif)
    }
    try {
      const r = await fetch('/api/polizas', { method: 'POST', body })
      if (!r.ok) return setEstado('error')
      setResultado((await r.json()) as Resultado)
      setEstado('listo')
      // Refresca la lista de arriba SIN desmontarla ni tapar la pantalla con un
      // loader (regla de rendimiento de UI del monorepo).
      router.refresh()
    } catch {
      setEstado('error')
    }
  }

  function abrirManual() {
    // El formulario se monta SOLO al pedirlo: en reposo la sección son dos botones.
    setResultado(null)
    setEstado('reposo')
    setGuardadaAMano(null)
    setManual(true)
  }

  function guardadaManual(p: PolizaGuardada) {
    setGuardadaAMano(p)
    setManual(false)
  }

  const subiendo = estado === 'subiendo'
  // No se puede subir sin contestar, y si dice «de mi empresa» hace falta CUÁL:
  // «de mi empresa» sin nombre no identifica ninguna empresa (la BD lo rechaza
  // con un CHECK, y llegar hasta allí devolvería un error de Postgres en vez de
  // decir qué falta).
  // 🚨 Con «de mi empresa» hacen falta las DOS cosas, y el CIF además VÁLIDO.
  // El nombre es la etiqueta; el CIF es la identidad. Sin él, «Transportes
  // Ejemplo SL» y «TRANSPORTES EJEMPLO, S.L.» son dos empresas distintas, y con
  // uno mal tecleado se funden dos que sí lo son. La persona tiene la póliza
  // delante: es el único momento en que puede mirarlo.
  const titularParaEnviar = normalizarTitular({ tipo: deQuien, nombre: empresa, cif })
  const cifPuesto = cif.trim() !== ''
  const cifMal = deQuien === 'empresa' && cifPuesto && !titularParaEnviar.cifValido
  const listoParaSubir =
    deQuien === 'propio' || (deQuien === 'empresa' && empresa.trim() !== '' && titularParaEnviar.cifValido)
  const etiquetaRamo = (valor: string | null) =>
    valor === null ? null : (ramos.find((r) => r.valor === valor)?.etiqueta ?? valor)

  return (
    <section className="seccion" aria-labelledby="alta-titulo">
      <h2 id="alta-titulo">Añade una póliza</h2>
      <p className="suave" style={{ fontSize: 14, marginTop: 0 }}>
        Sube el PDF o una foto, o añádela a mano si no tienes el documento. Da igual que no sea nuestra:
        la guardamos en tu bóveda y, si nos dices cuándo vence, podemos avisarte antes. Es tu apunte: no la
        contratamos ni la gestionamos por ti.
      </p>

      {(
        <fieldset className="de-quien" disabled={subiendo}>
          <legend>¿De quién es esta póliza?</legend>
          <div className="de-quien-opciones">
            <label>
              <input
                type="radio"
                name="de-quien"
                checked={deQuien === 'propio'}
                onChange={() => setDeQuien('propio')}
              />
              Mía
            </label>
            <label>
              <input
                type="radio"
                name="de-quien"
                checked={deQuien === 'empresa'}
                onChange={() => setDeQuien('empresa')}
              />
              De mi empresa
            </label>
          </div>
          {deQuien === 'empresa' && (
            <div className="de-quien-empresa">
              <label>
                Nombre de la empresa
                <input
                  type="text"
                  className="campo"
                  value={empresa}
                  onChange={(e) => setEmpresa(e.target.value)}
                  placeholder="Ej.: Transportes Ejemplo, S.L."
                />
              </label>
              <label>
                CIF <span className="tenue">(está en la primera página de la póliza)</span>
                <input
                  type="text"
                  className="campo"
                  value={cif}
                  onChange={(e) => setCif(e.target.value)}
                  placeholder="B12345678"
                  aria-invalid={cifMal || undefined}
                />
                {/* Se dice en cuanto se ve, no al enviar: la persona tiene el
                    papel delante y puede volver a mirarlo. */}
                {cifMal && (
                  <span className="editor-error" role="alert">
                    Ese CIF no cuadra. Cópialo tal cual aparece en la póliza.
                  </span>
                )}
              </label>
              {/* Se dice lo que ESTO hace y lo que NO hace. Sin esta línea, quien
                  escribe el nombre de su empresa se cree que a partir de ahora
                  la correduría gestiona sus seguros, y no es así. */}
              <p className="suave" style={{ fontSize: 13, margin: 0 }}>
                Lo guardamos como una nota tuya para saber que esta póliza no es personal. No damos de alta
                a la empresa ni gestionamos sus seguros por decirlo aquí.
              </p>
            </div>
          )}
        </fieldset>
      )}

      {!manual && (
        <div className="alta-acciones">
          <label
            className="boton-subir"
            aria-disabled={subiendo || !listoParaSubir}
            title={listoParaSubir ? undefined : 'Dinos antes de quién es la póliza'}
          >
            {subiendo ? 'Leyendo el documento…' : 'Elegir PDF o foto'}
            <input
              type="file"
              accept="application/pdf,image/*"
              onChange={subir}
              disabled={subiendo || !listoParaSubir}
            />
          </label>
          <button
            type="button"
            className="boton secundario"
            onClick={abrirManual}
            disabled={subiendo || !listoParaSubir}
            title={listoParaSubir ? undefined : 'Dinos antes de quién es la póliza'}
          >
            Añadirla a mano
          </button>
        </div>
      )}

      {/* `listoParaSubir` bloquea los DOS caminos, no solo el del fichero: el
          alta a mano guarda la misma fila y merece la misma respuesta. */}
      {manual && listoParaSubir && deQuien !== null && (
        <AnadirPoliza
          ramos={ramos}
          titular={{ tipo: deQuien, nombre: empresa, cif }}
          onCancelar={() => setManual(false)}
          onGuardada={guardadaManual}
        />
      )}

      {estado === 'error' && (
        <p className="editor-error" role="alert" style={{ marginTop: 12 }}>
          No hemos podido subirla. Inténtalo otra vez, o añádela a mano.
        </p>
      )}

      {guardadaAMano && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 14 }}>
            <strong>Guardada.</strong> Ya está en tu lista de arriba; puedes corregirla cuando quieras.
          </p>
          {/* Lo que acaba de escribir la persona, tal cual se ha guardado: un
              hueco es «no lo has puesto», no un 0 ni un cajón. */}
          <dl className="datos-leidos">
            <dt>Compañía</dt>
            <dd>{guardadaAMano.compania ?? NO_PUESTO}</dd>
            <dt>Nº de póliza</dt>
            <dd>{guardadaAMano.numeroPoliza ?? NO_PUESTO}</dd>
            <dt>Ramo</dt>
            <dd>{etiquetaRamo(guardadaAMano.ramo) ?? NO_PUESTO}</dd>
            <dt>Prima anual</dt>
            <dd>{guardadaAMano.primaAnual == null ? NO_PUESTO : eur(guardadaAMano.primaAnual)}</dd>
            <dt>Vencimiento</dt>
            <dd>
              {guardadaAMano.fechaVencimiento
                ? fechaEs(new Date(`${guardadaAMano.fechaVencimiento}T00:00:00Z`))
                : NO_PUESTO}
            </dd>
          </dl>
        </div>
      )}

      {estado === 'listo' && resultado && (
        <div style={{ marginTop: 12 }}>
          {resultado.fuente === 'none' ? (
            // NO decimos «no tiene esos datos»: decimos que no hemos podido
            // leerlos. Es la diferencia entre un dato ausente y uno no mirado.
            <p style={{ fontSize: 14 }}>
              <strong>No hemos podido leer el documento.</strong> La póliza está guardada; complétala a mano
              cuando quieras.
            </p>
          ) : (
            <>
              <p style={{ fontSize: 14 }}>
                Guardada. <strong>Estos datos los hemos leído nosotros del documento</strong> — revísalos y
                confírmalos.
              </p>
              {/* 🚨 Y se DICE cuando el papel no es la póliza. Sin esta frase, la
                  prima sale «—» justo después de subir un documento que llevaba
                  una cifra bien visible, y eso se lee como un fallo de lectura
                  nuestro en vez de como lo que es: ese importe existe y NO es la
                  prima anual. La frase la calcula el módulo puro, no el JSX: el
                  aviso y la anulación de la prima tienen que ir siempre juntos. */}
              {avisoDocumentoNoPoliza(resultado.datos.tipoDocumento ?? null) && (
                <p className="pendiente" style={{ fontSize: 13 }}>
                  {avisoDocumentoNoPoliza(resultado.datos.tipoDocumento ?? null)}
                </p>
              )}
              {/* 🚨 Se DICE que la segunda lectura no salió. Sin esta frase, una
                  póliza cuyo bloque de marca y modelo no se pudo leer se ve
                  exactamente igual que una que no los trae: campos vacíos bajo un
                  cartel que dice «leída de tu PDF». El cliente concluiría que su
                  documento no los lleva, y es falso — lo lleva y no lo miramos.
                  `no_aplica` NO pinta nada: ahí no había nada que preguntar. */}
              {resultado.camposRamo === 'no_leidos' && (
                <p className="pendiente" style={{ fontSize: 13 }}>
                  Los datos propios de este seguro (marca, modelo, uso…) no los hemos podido leer esta vez.
                  No es que el documento no los traiga: puedes ponerlos a mano.
                </p>
              )}
              {/* Nada de volcar el JSON crudo: la prima se pinta con `eur()`
                  (formato español, regla global) y un campo que la IA no supo
                  leer dice «no lo hemos encontrado», no un hueco ni un 0. */}
              <dl className="datos-leidos">
                <dt>Compañía</dt>
                <dd>{resultado.datos.compania ?? NO_LEIDO}</dd>
                <dt>Nº de póliza</dt>
                <dd>{resultado.datos.numeroPoliza ?? NO_LEIDO}</dd>
                <dt>Ramo</dt>
                <dd>{etiquetaRamo(resultado.datos.ramo) ?? NO_LEIDO}</dd>
                <dt>Prima anual</dt>
                <dd>{resultado.datos.primaAnual == null ? NO_LEIDO : eur(resultado.datos.primaAnual)}</dd>
                <dt>Vencimiento</dt>
                <dd>
                  {resultado.datos.fechaVencimiento
                    ? fechaEs(new Date(`${resultado.datos.fechaVencimiento}T00:00:00Z`))
                    : NO_LEIDO}
                </dd>
              </dl>
            </>
          )}
        </div>
      )}
    </section>
  )
}

const NO_LEIDO = <span className="tenue">No lo hemos encontrado en el documento</span>
const NO_PUESTO = <span className="tenue">No lo has puesto</span>
