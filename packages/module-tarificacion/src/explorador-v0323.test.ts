// Explorador 0.3.23 (30/10/2026) · fixtures SINTÉTICAS (sin PII):
// 1) Mapfre NSE «Datos del vehículo (patinete)»: el POST a …/infObjetoAsegurado/infObjetoAseguradoAutos.jsf llevaba
//    `formObjAseg:confirmarGuardado` (confirmar el GUARDADO de los datos del objeto asegurado, pre-tarificación) y casaba con «confirm».
//    Exención ESTRECHA: último segmento EXACTO `confirmarGuardado`, origen y ruta exactos de la pantalla del objeto asegurado, valor ficha
//    simple sin acción final. Todo lo demás con «confirm» (botón name==value, javax.faces.source, otra ruta…) sigue bloqueando.
// 2) Diagnóstico: el bloqueo de cuerpo lista TODOS los nombres con la CLASE de su valor (vacío/false/true/num/otro), sin cortarse.
// TARIFICAR ≠ EMITIR: cada brazo que debe fallar, en rojo.
import { describe, it, expect } from 'vitest'
import {
  claseValorDiagnostico,
  cuerpoToleradoConAccionReal,
  detalleCuerpoToleradoConAccionReal,
  EmisionBloqueadaError,
  esConfirmarGuardadoObjetoAsegurado,
  MAX_DETALLE_CUERPO_MENSAJE,
  textoDetalleCuerpo,
} from './index.ts'

const ORIGEN = 'https://wmediadores.mapfre.com'
const URL_OBJ = `${ORIGEN}/EVT21_NSE_FWEB/app/emision/infObjetoAsegurado/infObjetoAseguradoAutos.jsf`
const URL_DG = `${ORIGEN}/EVT21_NSE_FWEB/app/emision/informacionGeneral/datosGenerales.jsf`
const CG = 'formObjAseg:confirmarGuardado'

describe('0.3.23 · Mapfre NSE: confirmarGuardado del objeto asegurado', () => {
  it('real: nombre exacto, ruta exacta y valor sin acción → exento', () => {
    for (const v of ['', 'false', 'true', 'S', 'N', '0', '1']) expect(esConfirmarGuardadoObjetoAsegurado(CG, v, URL_OBJ), v).toBe(true)
    expect(esConfirmarGuardadoObjetoAsegurado('formObjAseg:sub:confirmarGuardado', '', URL_OBJ)).toBe(true)
    expect(esConfirmarGuardadoObjetoAsegurado(CG, '', `${URL_OBJ};jsessionid=ABC123.nodo1`)).toBe(true)
    expect(esConfirmarGuardadoObjetoAsegurado(CG, '', `${ORIGEN}/EVT21_NSE_FWEB/app/emision/infObjetoAsegurado/infObjetoAseguradoPatinetes.jsf`)).toBe(true)
  })

  it('nombre que no es EXACTAMENTE `<form>:confirmarGuardado` → no exento', () => {
    for (const n of ['confirmarGuardado', ':confirmarGuardado', 'formObjAseg::confirmarGuardado', 'formObjAseg:confirmarguardado', 'formObjAseg:ConfirmarGuardado',
      'formObjAseg:confirmarGuardadoX', 'formObjAseg:btnConfirmarGuardado', 'formObjAseg:confirmarGuardado:x', 'formObjAseg:confirmarEmision', 'formObjAseg:confirmar',
      'formEmitir:confirmarGuardado', 'btnFirmar:confirmarGuardado', 'formPago:confirmarGuardado', 'form Obj:confirmarGuardado']) {
      expect(esConfirmarGuardadoObjetoAsegurado(n, '', URL_OBJ), n).toBe(false)
    }
  })

  it('valor que es un nombre/rótulo de acción (botón JSF name==value incluido) → no exento', () => {
    for (const v of [CG, 'confirmarGuardado', 'Confirmar guardado', 'confirmar', 'CONFIRM', 'emitir', 'Emitir', 'contratar', 'firmar', 'pagar', 'pago', 'formalizar',
      'grabar', 'anular', 'aceptar', 'Aceptar', 'iban', 'btnEmitir', 'x:y', 'a b', 'valor_muy_largo_de_mas_de_veinte']) {
      expect(esConfirmarGuardadoObjetoAsegurado(CG, v, URL_OBJ), v).toBe(false)
    }
  })

  it('otra ruta u otro origen (también otras pantallas de NSE), sin URL o con credenciales → no exento', () => {
    for (const u of [URL_DG, `${ORIGEN}/EVT21_NSE_FWEB/app/emision/busquedaProductos/busquedaProductos.jsf`,
      `${ORIGEN}/EVT21_NSE_FWEB/app/emision/infObjetoAsegurado/emitirPoliza.jsf`, `${ORIGEN}/EVT21_NSE_FWEB/app/emision/infObjetoAsegurado/infObjetoAseguradoAutos.jsf/x`,
      `${ORIGEN}/EVT21_NSE_FWEB/app/emision/otro/infObjetoAsegurado/infObjetoAseguradoAutos.jsf`, `${ORIGEN}/x/infObjetoAsegurado/infObjetoAseguradoAutos.jsf`,
      `https://wmediadores.mapfre.com.evil.test/EVT21_NSE_FWEB/app/emision/infObjetoAsegurado/infObjetoAseguradoAutos.jsf`,
      `http://wmediadores.mapfre.com/EVT21_NSE_FWEB/app/emision/infObjetoAsegurado/infObjetoAseguradoAutos.jsf`,
      `https://u:p@wmediadores.mapfre.com/EVT21_NSE_FWEB/app/emision/infObjetoAsegurado/infObjetoAseguradoAutos.jsf`,
      `${ORIGEN}/EVT21_NSE_FWEB/app/emision/infObjetoAsegurado/infObjetoAseguradoAutos.jsf;jsessionid=a;b=emitir`, '', 'no es url']) {
      expect(esConfirmarGuardadoObjetoAsegurado(CG, '', u), u).toBe(false)
    }
    expect(esConfirmarGuardadoObjetoAsegurado(CG, '', undefined)).toBe(false)
    expect(esConfirmarGuardadoObjetoAsegurado(CG, '', null)).toBe(false)
  })

  const REAL = `formObjAseg=formObjAseg&formObjAseg%3AcodigoPostal=41003&${encodeURIComponent(CG)}=&javax.faces.ViewState=j_id5`
  it('real: el cuerpo del POST con confirmarGuardado vacío, a la ruta del objeto asegurado → no casa (antes: «confirm»)', () => {
    expect(detalleCuerpoToleradoConAccionReal(REAL)).not.toBeNull() // sin URL, como antes
    expect(detalleCuerpoToleradoConAccionReal(REAL, URL_OBJ)).toBeNull()
    expect(cuerpoToleradoConAccionReal(REAL.replace('Guardado=', 'Guardado=true'), URL_OBJ)).toBe(false)
  })

  it('con el mismo POST: cualquier otro «confirm» sigue bloqueando', () => {
    for (const c of [
      `${REAL}&javax.faces.source=${encodeURIComponent(CG)}`,
      `${REAL}&javax.faces.partial.execute=formObjAseg%3AbtnConfirmar`,
      `${REAL}&formObjAseg%3AbtnConfirmar=formObjAseg%3AbtnConfirmar`,
      `${REAL}&formObjAseg%3AconfirmarEmision=`,
      `${REAL}&formObjAseg%3AbtnEmitir=x`,
      REAL.replace('Guardado=', `Guardado=${encodeURIComponent(CG)}`),
      REAL.replace('Guardado=', 'Guardado=Confirmar'),
      REAL.replace('Guardado=', 'Guardado=emitir'),
    ]) expect(cuerpoToleradoConAccionReal(c, URL_OBJ), c).toBe(true)
    // La misma exención en OTRA pantalla de NSE no vale.
    expect(cuerpoToleradoConAccionReal(REAL, URL_DG)).toBe(true)
  })
})

describe('0.3.23 · diagnóstico del bloqueo de cuerpo: todos los nombres, clase del valor, sin cortarse', () => {
  it('claseValorDiagnostico: vacío/false/true/num/otro, nunca el valor', () => {
    expect(['', '  ', 'false', 'true', '12', '-3', '1,5', '12345678', 'TRUE', 'x', '12345678Z', 'Sevilla'].map(claseValorDiagnostico))
      .toEqual(['vacío', 'vacío', 'false', 'true', 'num', 'num', 'num', 'num', 'otro', 'otro', 'otro', 'otro'])
    expect(claseValorDiagnostico(null)).toBe('vacío')
  })

  it('cada nombre con la clase de su valor; ningún valor real sale', () => {
    const c = 'formDG%3AbtnConfirmarA=&formDG%3AbtnConfirmarB=false&formDG%3AbtnConfirmarC=true&formDG%3AbtnConfirmarD=7&formDG%3AbtnFirmar=12345678Z&javax.faces.source=formDG%3AbtnEmitir'
    const t = textoDetalleCuerpo(detalleCuerpoToleradoConAccionReal(c, URL_DG)!)
    expect(t).toBe('parámetros (6): «formDG:btnConfirmarA» [valor: vacío] casa con «confirm», «formDG:btnConfirmarB» [valor: false] casa con «confirm», '
      + '«formDG:btnConfirmarC» [valor: true] casa con «confirm», «formDG:btnConfirmarD» [valor: num] casa con «confirm», «formDG:btnFirmar» [valor: otro] casa con «firm», '
      + '«javax.faces.source» [valor: otro] casa con «emit»')
    expect(t).not.toMatch(/12345678Z|btnEmitir/)
  })

  it('una lista larga NO se corta (antes, a 150 car.) y entra entera en el mensaje del error, delante de la URL', () => {
    const c = Array.from({ length: 12 }, (_, k) => `formDG%3AbtnConfirmarNumero${k}=`).join('&')
    const t = textoDetalleCuerpo(detalleCuerpoToleradoConAccionReal(c)!)
    expect(t).not.toMatch(/más\)/)
    for (let k = 0; k < 12; k++) expect(t).toContain(`«formDG:btnConfirmarNumero${k}» [valor: vacío]`)
    const url = `${URL_DG}?${'a'.repeat(400)}`
    const e = new EmisionBloqueadaError('url', url, t)
    expect(e.message).toContain(`[acción en el cuerpo de la petición: ${t}] `)
    expect(e.message.length).toBeLessThan(2000)
    expect(t.length).toBeLessThanOrEqual(MAX_DETALLE_CUERPO_MENSAJE)
    // Sin detalle, el mensaje de siempre.
    expect(new EmisionBloqueadaError('url', 'https://x.test/emitir').message).toBe('guard_emision: url bloqueada (casa con el patrón de emisión): «https://x.test/emitir»')
  })

  it('solo un cuerpo patológico (> tope) dice «(+N más)», sin partir un nombre', () => {
    const c = Array.from({ length: 200 }, (_, k) => `formDG%3AbtnConfirmarNumero${k}=`).join('&')
    const t = textoDetalleCuerpo(detalleCuerpoToleradoConAccionReal(c)!)
    expect(t.length).toBeLessThanOrEqual(MAX_DETALLE_CUERPO_MENSAJE)
    expect(t).toMatch(/casa con «confirm» \(\+\d+ más\)$/)
  })
})
