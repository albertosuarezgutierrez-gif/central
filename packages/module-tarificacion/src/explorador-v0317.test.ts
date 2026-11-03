// Explorador 0.3.17 (29/10/2026) · fixtures SINTÉTICAS (sin PII):
//  1) Mapfre NSE: onclick de 2001..8000 car. (RichFaces A4J) se evalúa ENTERO (`onclickCompleto`, fuera del tope de 60 KB); >8000 sigue recortado.
//  2) Allianz ePAC drvp00: «Aceptar» SIN id ni onclick, único en el marco, con la misma vigilancia que el avance por id.
//  3) Diagnóstico del rechazo: tag/type/name/clase/texto ≤40 del control (nunca el valor de un campo).
import { describe, it, expect } from 'vitest'
import {
  CLAVES_ELEMENTO_TEXTO,
  MAX_BYTES_INVENTARIO_DOM,
  MAX_ONCLICK_COMPLETO_TOTAL,
  MAX_ONCLICK_EVALUACION,
  ONCLICK_REDACTADO,
  avancePorIdAutorizado,
  bloqueoAvance,
  conOnclickCompleto,
  describirControlRechazado,
  esAvanceAutorizado,
  redactarValoresInventario,
  sanearInventarioDom,
  textoRechazo,
  unicoPorTexto,
  validarRespuestaExplorador,
  type InventarioDom,
} from './index.ts'
import { motivoNoAvancePorId } from './explorador.ts'

const MF = 'mapfre:automoviles:patinetes'
const MP = 'allianz:autos:movilidad_personal'
const URL_NSE = 'https://wmediadores.mapfre.com/EVT21_NSE_FWEB/app/emision/busquedaProductos.jsf'
const URL_SERVLET = 'https://epac.example.test/drvp00/SEAServlet?a=1'
const URL_CONTROL = 'https://epac.example.test/drvp00/main/control.do'

function inv(url: string, elementos: unknown[], titulos: unknown[] = [{ texto: 'Datos del Vehículo', tag: 'h2' }, { texto: 'Selección de Municipio', tag: 'h2' }, { texto: 'Tomador y Conductor Principal', tag: 'h2' }], importes?: unknown[]): InventarioDom {
  return sanearInventarioDom({ marcos: [{ url, nombre: 'm', titulos, ...(importes ? { importes } : {}), elementos }] }, undefined, { refs: true })!
}
function resp(i: InventarioDom, entrada: string, ramo: string, acciones: unknown[]) {
  return validarRespuestaExplorador({ version: 1, pantalla: { nombre: 'X', tipo: 'formulario' }, acciones, mapeo: [], motivo: null }, { inventario: i, ramo, entrada, datosReales: null, presupuestoEnCurso: false })
}
const a4j = (relleno: string, fin = '') =>
  `A4J.AJAX.Submit('formDatos',event,{'similarityGroupingId':'formDatos:btnSiguiente','parameters':{'formDatos:btnSiguiente':'formDatos:btnSiguiente'},'containerId':'j_id_${relleno}'${fin}});return false;`
const siguiente = (onclick: string) => ({ tag: 'a', role: 'link', id: 'formDatos:btnSiguiente', texto: 'Siguiente >>', onclick })
const avanzar = (i: InventarioDom, entrada = MF, ramo = 'patinete') => resp(i, entrada, ramo, [{ accion: 'avanzar', ref: i.marcos[0].elementos[0].ref, efectoEsperado: 'siguiente_pantalla', confianza: 'alta' }])

describe('0.3.17 · onclick hasta 8000 car. SOLO para la evaluación', () => {
  it('2001..8000 car.: `onclick` queda recortado a 2000 con «…» y el entero viaja en `onclickCompleto`; el validador lo evalúa ENTERO', () => {
    for (const n of [2100, 5000, 7700]) {
      const oc = a4j('x'.repeat(n))
      const i = inv(URL_NSE, [siguiente(oc)])
      const e = i.marcos[0].elementos[0]
      expect(e.onclick!.endsWith('…')).toBe(true)
      expect(e.onclick!.length).toBeLessThanOrEqual(2000)
      expect(e.onclickCompleto).toBe(oc)
      expect(bloqueoAvance(MF, conOnclickCompleto(i).marcos[0].elementos[0], i.marcos[0])).toBeNull()
      expect(avanzar(i).ok, String(n)).toBe(true)
    }
  })
  it('≤2000 car.: sin `onclickCompleto` (como en 0.3.16)', () => {
    const i = inv(URL_NSE, [siguiente(a4j('x'.repeat(300)))])
    expect(i.marcos[0].elementos[0].onclickCompleto).toBeUndefined()
    expect(i.marcos[0].elementos[0].onclick!.endsWith('…')).toBe(false)
  })
  it('más de 8000 car. sigue siendo onclick_truncado (no se pulsa)', () => {
    const i = inv(URL_NSE, [siguiente(a4j('x'.repeat(MAX_ONCLICK_EVALUACION + 100)))])
    expect(i.marcos[0].elementos[0].onclickCompleto).toBeUndefined()
    const r = avanzar(i)
    expect(r.ok).toBe(false)
    expect(JSON.stringify(r)).toMatch(/onclick_truncado/)
  })
  it('la acción final MÁS ALLÁ de los 2000 car. se ve → boton_de_emision; el origen ajax se evalúa sobre el texto completo', () => {
    for (const fin of [",'emitir':'1'", ",'oncomplete':'contratarPoliza()'", ",'accion':'confirmar'"]) {
      const i = inv(URL_NSE, [siguiente(a4j('x'.repeat(3000), fin))])
      const r = avanzar(i)
      expect(r.ok, fin).toBe(false)
      expect(JSON.stringify(r), fin).toMatch(/boton_de_emision/)
    }
    // Casilla JSF cuyo ajax nombra OTRO componente DESPUÉS de los 2000 car.: bloqueada.
    const ID = 'formulario:tabla:3:radio'
    const radio = (oc: string) => ({ tag: 'input', type: 'radio', id: ID, name: 'radio', etiqueta: 'MásPatín', onclick: oc })
    const largo = (fin: string) => `/*${'y'.repeat(2500)}*/ mojarra.jsfcljs(document.getElementById('formulario'),{'${ID}':'${ID}'${fin}},'')`
    const ok = inv(URL_NSE, [radio(largo(''))])
    expect(resp(ok, MF, 'patinete', [{ accion: 'marcar', ref: ok.marcos[0].elementos[0].ref }]).ok).toBe(true)
    const mal = inv(URL_NSE, [radio(largo(",'formulario:j_idt88':'formulario:j_idt88'"))])
    expect(resp(mal, MF, 'patinete', [{ accion: 'marcar', ref: mal.marcos[0].elementos[0].ref }]).ok).toBe(false)
  })
  it('el tope de 60 KB NO se infla con `onclickCompleto`; el presupuesto total lo limita y lo que no cabe queda recortado (= no se pulsa)', () => {
    const elementos = Array.from({ length: 10 }, (_, k) => ({ tag: 'a', role: 'link', id: `f:b${k}`, texto: `Siguiente ${k}`, onclick: a4j('z'.repeat(5000), `,'k':'${k}'`) }))
    const i = inv(URL_NSE, elementos)
    expect(i.recortado).toBeNull()
    const con = i.marcos[0].elementos.filter((e) => e.onclickCompleto !== undefined)
    expect(con.length).toBe(Math.floor(MAX_ONCLICK_COMPLETO_TOTAL / 5000 / 1.02) || con.length)
    expect(con.length).toBeGreaterThan(0)
    expect(con.length).toBeLessThan(10)
    const sin = i.marcos[0].elementos.find((e) => e.onclickCompleto === undefined)!
    expect(sin.onclick!.endsWith('…')).toBe(true)
    // Medido SIN `onclickCompleto` cabe en el tope; con él lo supera (por eso no cuenta).
    const claro = JSON.stringify(i, (k, v) => (k === 'onclickCompleto' ? undefined : v)).length
    expect(claro).toBeLessThan(MAX_BYTES_INVENTARIO_DOM)
  })
  it('dato personal en cualquier punto del onclick (también tras 2000 car.) → ONCLICK_REDACTADO y sin `onclickCompleto`', () => {
    const i = inv(URL_NSE, [siguiente(a4j('x'.repeat(2500), ",'nif':'12345678Z'"))])
    expect(i.marcos[0].elementos[0].onclick).toBe(ONCLICK_REDACTADO)
    expect(i.marcos[0].elementos[0].onclickCompleto).toBeUndefined()
    expect(avanzar(i).ok).toBe(false)
  })
  it('segunda pasada (asegura): conserva `onclickCompleto`; uno que no continúa el `onclick` se ignora; `conOnclickCompleto` no muta', () => {
    const oc = a4j('x'.repeat(3000))
    const i1 = inv(URL_NSE, [siguiente(oc)])
    const copia = JSON.parse(JSON.stringify(i1))
    const i2 = sanearInventarioDom(copia, undefined, { refs: true })!
    expect(i2.marcos[0].elementos[0].onclickCompleto).toBe(oc)
    const falso = JSON.parse(JSON.stringify(i1))
    falso.marcos[0].elementos[0].onclickCompleto = `otra cosa distinta ${'q'.repeat(3000)}`
    const i3 = sanearInventarioDom(falso, undefined, { refs: true })!
    expect(i3.marcos[0].elementos[0].onclickCompleto).toBeUndefined()
    expect(i3.marcos[0].elementos[0].onclick!.endsWith('…')).toBe(true)
    const antes = JSON.stringify(i1)
    const ev = conOnclickCompleto(i1)
    expect(ev.marcos[0].elementos[0].onclick).toBe(oc)
    expect(ev.marcos[0].elementos[0].onclickCompleto).toBeUndefined()
    expect(JSON.stringify(i1)).toBe(antes)
  })
  it('la redacción por valores conocidos quita `onclickCompleto` (está en CLAVES_ELEMENTO_TEXTO) y deja el prefijo recortado = no se pulsa', () => {
    expect(CLAVES_ELEMENTO_TEXTO).toContain('onclickCompleto')
    const i = inv(URL_NSE, [siguiente(a4j('x'.repeat(2500), ",'v':'VALORSECRETO'"))])
    expect(i.marcos[0].elementos[0].onclickCompleto).toContain('VALORSECRETO')
    const r = redactarValoresInventario(i, ['VALORSECRETO'])
    expect(r.marcos[0].elementos[0].onclickCompleto).toBeUndefined()
    expect(avanzar(r).ok).toBe(false)
  })
})

describe('0.3.17 · Allianz ePAC: «Aceptar» sin id ni onclick, único en el marco', () => {
  const ACEPTAR = { tag: 'button', type: 'button', texto: 'Aceptar', clase: 'botonAzul' }
  const el0 = (i: InventarioDom) => i.marcos[0].elementos[0]
  it('único, sin id ni onclick, en /drvp00/main/control.do, título de datos → autorizado y se puede validar el avance', () => {
    const i = inv(URL_CONTROL, [ACEPTAR])
    expect(avancePorIdAutorizado(MP, el0(i), i.marcos[0])).not.toBeNull()
    expect(esAvanceAutorizado(MP, el0(i), i.marcos[0])).toBe(true)
    expect(bloqueoAvance(MP, el0(i), i.marcos[0])).toBeNull()
    expect(avanzar(i, MP).ok).toBe(true)
  })
  it('revisión 0.3.17: el mismo «Aceptar» sin id en el marco del SERVLET (u otra ruta) → no es esta regla (ruta_de_marco_distinta)', () => {
    for (const url of [URL_SERVLET, 'https://epac.example.test/drvp00/main/otro.do']) {
      const i = inv(url, [ACEPTAR])
      expect(avancePorIdAutorizado(MP, el0(i), i.marcos[0]), url).toBeNull()
      expect(motivoNoAvancePorId(MP, el0(i), i.marcos[0]), url).toBe('ruta_de_marco_distinta')
      expect(avanzar(i, MP).ok, url).toBe(false)
    }
  })
  it('dos «Aceptar» en el marco (con o sin id) → rechazado, con causa texto_no_unico_en_marco', () => {
    for (const otro of [{ tag: 'button', id: 'btnAceptar', texto: 'Aceptar', onclick: 'eventoSiguiente()' }, { tag: 'a', texto: 'Aceptar' }, { tag: 'td', texto: 'ACEPTAR', onclick: 'x()' }]) {
      const i = inv(URL_CONTROL, [ACEPTAR, otro])
      expect(avancePorIdAutorizado(MP, el0(i), i.marcos[0])).toBeNull()
      expect(bloqueoAvance(MP, el0(i), i.marcos[0])).toBe('aceptar_no_autorizado')
      expect(motivoNoAvancePorId(MP, el0(i), i.marcos[0])).toBe('texto_no_unico_en_marco')
      const r = avanzar(i, MP)
      expect(r.ok).toBe(false)
      expect(JSON.stringify(r)).toMatch(/texto_no_unico_en_marco/)
    }
    expect(unicoPorTexto(inv(URL_CONTROL, [ACEPTAR]).marcos[0], /^aceptar$/)).toBe(true)
  })
  it('con id (sin onclick) o con onclick (sin id), o con otro texto → no es esta regla', () => {
    for (const el of [{ ...ACEPTAR, id: 'x1' }, { ...ACEPTAR, onclick: 'enviar()' }, { ...ACEPTAR, texto: 'Aceptar y emitir' }, { ...ACEPTAR, texto: 'Aceptar todo' }]) {
      const i = inv(URL_CONTROL, [el])
      expect(avancePorIdAutorizado(MP, el0(i), i.marcos[0]), JSON.stringify(el)).toBeNull()
      expect(avanzar(i, MP).ok, JSON.stringify(el)).toBe(false)
    }
  })
  it('título de emisión/resumen/contratación/pago/firma/IBAN/tarificar/revisión/formalización → rechazado', () => {
    for (const t of ['Resumen', 'Emisión de la póliza', 'Contratación', 'Forma de pago', 'Firma', 'IBAN', 'Tarificar', 'Revisión', 'Formalización']) {
      const i = inv(URL_CONTROL, [ACEPTAR], [{ texto: 'Datos del Vehículo', tag: 'h2' }, { texto: t, tag: 'h3' }])
      expect(avancePorIdAutorizado(MP, el0(i), i.marcos[0]), t).toBeNull()
      expect(avanzar(i, MP).ok, t).toBe(false)
    }
  })
  it('con importes en el marco, en otra ruta, otra entrada, Mapfre o con ng-click → rechazado', () => {
    const conPrecio = inv(URL_CONTROL, [ACEPTAR], undefined, [{ texto: '47,55 €', etiqueta: 'Prima total' }])
    expect(avancePorIdAutorizado(MP, el0(conPrecio), conPrecio.marcos[0])).toBeNull()
    for (const url of ['https://epac.example.test/drvp01/main/control.do', 'https://epac.example.test/drvp00/main/otro.do', 'https://epac.example.test/x/drvp00/main/control.do']) {
      const i = inv(url, [ACEPTAR])
      expect(avancePorIdAutorizado(MP, el0(i), i.marcos[0]), url).toBeNull()
    }
    const ok = inv(URL_CONTROL, [ACEPTAR])
    expect(avancePorIdAutorizado('allianz:particulares:hogar', el0(ok), ok.marcos[0])).toBeNull()
    expect(avancePorIdAutorizado(MF, el0(ok), ok.marcos[0])).toBeNull()
    const ng = inv(URL_CONTROL, [{ tag: 'button', texto: 'Aceptar', onclick: 'ngClick()' }])
    expect(avancePorIdAutorizado(MP, el0(ng), ng.marcos[0])).toBeNull()
  })
  it('toleran el recorte de la lista de títulos solo como el avance por id (el guard vivo repite la vigilancia)', () => {
    const muchos = Array.from({ length: 25 }, (_, k) => ({ texto: `Cabecera ${k}`, tag: 'th' }))
    const i = inv(URL_CONTROL, [ACEPTAR], muchos)
    expect(avancePorIdAutorizado(MP, el0(i), i.marcos[0])).not.toBeNull()
    const mal = inv(URL_CONTROL, [ACEPTAR], [{ texto: 'Resumen de la póliza', tag: 'th' }, ...muchos])
    expect(avancePorIdAutorizado(MP, el0(mal), mal.marcos[0])).toBeNull()
  })
})

describe('0.3.17 · el rechazo describe el control (sin valores)', () => {
  it('avance rechazado: tag, type, name, clase y texto ≤40 en el texto del rechazo', () => {
    const i = inv(URL_CONTROL, [{ tag: 'button', type: 'button', name: 'btnX', texto: 'Aceptar', clase: 'botonAzul grande', onclick: 'emitir()' }])
    const r = avanzar(i, MP)
    expect(r.ok).toBe(false)
    if (r.ok) return
    const t = textoRechazo(r.rechazos![0])
    expect(t).toMatch(/\[tag=button type=button name=btnX clase=botonAzul grande texto=«Aceptar»\]$/)
  })
  it('un campo de texto o select nunca saca texto; un texto con forma de dato personal tampoco; todo ≤40', () => {
    expect(describirControlRechazado({ tag: 'input', type: 'text', name: 'cp', texto: 'valor escrito' } as never)).toBe('tag=input type=text name=cp clase=- texto=-')
    expect(describirControlRechazado({ tag: 'select', texto: 'x' } as never)).toMatch(/texto=-$/)
    expect(describirControlRechazado({ tag: 'button', texto: 'Mi NIF 12345678Z' } as never)).toMatch(/texto=-$/)
    const largo = describirControlRechazado({ tag: 'a', name: 'n'.repeat(90), clase: 'c'.repeat(90), texto: 't'.repeat(90) } as never)
    expect(largo).not.toMatch(/n{41}|c{41}|t{41}/)
  })
  it('una acción sin ref del inventario no lleva descripción', () => {
    const i = inv(URL_CONTROL, [{ tag: 'button', texto: 'Aceptar' }])
    const r = resp(i, MP, 'patinete', [{ accion: 'marcar', ref: 'r999' }])
    expect(!r.ok && r.rechazos?.[0].control).toBeUndefined()
  })
})
