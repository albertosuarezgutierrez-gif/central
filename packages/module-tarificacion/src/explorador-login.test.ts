// Cepos del LOGIN ASISTIDO del explorador (14/10/2026). Fixtures SINTÉTICAS: usuario y contraseña inventados, compuestos en
// runtime (un literal con pinta de clave dispara gitleaks).
import { describe, it, expect } from 'vitest'
import {
  CATALOGO_EXPLORACION,
  CLAVE_CONTRASENA,
  CLAVE_USUARIO,
  ENTRADAS_EXPLORACION,
  catalogoParaIA,
  esUrlSsoLoginAsistido,
  inventarioSinCredenciales,
  loginAsistidoDe,
  marcarCredencialesInventario,
  marcarUsuarioEnTexto,
  resolverDato,
  resumenLoginParaMapa,
  sanearInventarioDom,
  validarRespuestaExplorador,
  validarRespuestaLogin,
  type InventarioDom,
} from './index.ts'

const USUARIO = ['agente', 'sintetico', '07'].join('.')
const CLAVE = ['Clave', 'Sintetica', '!2026'].join('-')
const CRED = { usuario: USUARIO, contrasena: CLAVE }
const OCC = 'occident:productos:hogar'
const SSO = 'https://ssoaut.gco.global/my.policy'

function inventario(elementos: unknown[], url = SSO, titulos: unknown[] = []): InventarioDom {
  return sanearInventarioDom({ marcos: [{ url, nombre: null, elementos, titulos }] }, undefined, { refs: true })!
}

/** Variante (b): usuario + contraseña. */
const VARIANTE_B = () => inventario([
  { tag: 'input', id: 'usernamegco', name: 'username', type: 'text', etiqueta: 'Nombre de usuario' },
  { tag: 'input', id: 'password', name: 'password', type: 'password', etiqueta: 'Contraseña' },
  { tag: 'button', id: 'SubmitCreds', type: 'submit', texto: 'Iniciar sesión' },
])
/** Variante (a): lista de usuarios (el usuario propio YA marcado) + contraseña. */
const VARIANTE_A = (filas: 'select' | 'radio' = 'select') => inventario([
  filas === 'select'
    ? { tag: 'select', id: 'usuarios', name: 'usuario', etiqueta: 'Usuario', opciones: [{ valor: 'otro.agente', texto: 'otro.agente' }, { valor: CLAVE_USUARIO, texto: CLAVE_USUARIO }] }
    : { tag: 'input', id: 'u2', name: 'usuario', type: 'radio', etiqueta: CLAVE_USUARIO },
  { tag: 'input', id: 'password', name: 'password', type: 'password', etiqueta: 'Contraseña' },
  { tag: 'button', id: 'SubmitCreds', type: 'submit', texto: 'Iniciar sesión' },
])
const resp = (acciones: unknown[]) => ({ version: 1, fase: 'login', pantalla: { nombre: 'Acceso', tipo: 'formulario' }, acciones, mapeo: [], motivo: null })
const refDe = (inv: InventarioDom, id: string) => inv.marcos[0].elementos.find((e) => e.id === id)!.ref!

describe('login asistido: solo Occident y solo su SSO', () => {
  it('lista cerrada: occident sí; allianz y mapfre no', () => {
    expect(loginAsistidoDe(OCC)).toEqual({ compania: 'occident', hostSso: 'ssoaut.gco.global' })
    for (const e of Object.keys(ENTRADAS_EXPLORACION).filter((k) => ENTRADAS_EXPLORACION[k].compania !== 'occident')) expect(loginAsistidoDe(e)).toBeNull()
    expect(loginAsistidoDe('inventada')).toBeNull()
  })
  it('https + host EXACTO', () => {
    expect(esUrlSsoLoginAsistido('occident', SSO)).toBe(true)
    for (const u of ['http://ssoaut.gco.global/my.policy', 'https://ssoaut.gco.global.evil.example/', 'https://x.ssoaut.gco.global/', 'https://ssoaut.gco.global:8443/', 'https://u:p@ssoaut.gco.global/', 'https://portaloccident.gco.global/', 'nada']) {
      expect(esUrlSsoLoginAsistido('occident', u), u).toBe(false)
    }
    expect(esUrlSsoLoginAsistido('allianz', SSO)).toBe(false)
  })
})

describe('validarRespuestaLogin', () => {
  it('variante (b): rellenar usuario y contraseña por CLAVE y avanzar con el submit', () => {
    const inv = VARIANTE_B()
    const v = validarRespuestaLogin(resp([
      { accion: 'rellenar', ref: refDe(inv, 'usernamegco'), dato: CLAVE_USUARIO },
      { accion: 'rellenar', ref: refDe(inv, 'password'), dato: CLAVE_CONTRASENA },
      { accion: 'avanzar', ref: refDe(inv, 'SubmitCreds'), efectoEsperado: 'siguiente_pantalla', confianza: 'alta' },
    ]), { inventario: inv, entrada: OCC })
    expect(v.ok).toBe(true)
  })
  it('variante (a): elegir el usuario propio (select o radio) y la contraseña', () => {
    for (const filas of ['select', 'radio'] as const) {
      const inv = VARIANTE_A(filas)
      const v = validarRespuestaLogin(resp([
        { accion: 'elegir', ref: refDe(inv, filas === 'select' ? 'usuarios' : 'u2'), dato: CLAVE_USUARIO },
        { accion: 'rellenar', ref: refDe(inv, 'password'), dato: CLAVE_CONTRASENA },
        { accion: 'avanzar', ref: refDe(inv, 'SubmitCreds'), efectoEsperado: 'siguiente_pantalla', confianza: 'media' },
      ]), { inventario: inv, entrada: OCC })
      expect(v.ok, filas).toBe(true)
    }
  })
  it('cepos: cada forma de romperlo, en ROJO', () => {
    const inv = VARIANTE_B()
    const u = refDe(inv, 'usernamegco')
    const c = refDe(inv, 'password')
    const b = refDe(inv, 'SubmitCreds')
    const malos: [string, unknown, string?][] = [
      ['contraseña en un input de texto', resp([{ accion: 'rellenar', ref: u, dato: CLAVE_CONTRASENA }])],
      ['usuario en el password', resp([{ accion: 'rellenar', ref: c, dato: CLAVE_USUARIO }])],
      ['un VALOR en vez de la clave', resp([{ accion: 'rellenar', ref: c, dato: CLAVE }])],
      ['clave de catálogo de ramo', resp([{ accion: 'rellenar', ref: u, dato: 'tomador.nif' }])],
      ['texto libre (valor)', resp([{ accion: 'rellenar', ref: u, dato: CLAVE_USUARIO, valor: USUARIO }])],
      ['terminar', resp([{ accion: 'terminar', refsPrecio: [] }])],
      ['marcar', resp([{ accion: 'marcar', ref: b }])],
      ['avanzar que no es el último', resp([{ accion: 'avanzar', ref: b, efectoEsperado: 'siguiente_pantalla', confianza: 'alta' }, { accion: 'rellenar', ref: u, dato: CLAVE_USUARIO }])],
      ['avanzar con otro efecto', resp([{ accion: 'avanzar', ref: b, efectoEsperado: 'calcular', confianza: 'alta' }])],
      ['otra entrada (allianz)', resp([{ accion: 'rellenar', ref: u, dato: CLAVE_USUARIO }]), 'allianz:particulares:hogar'],
      ['otra entrada (mapfre)', resp([{ accion: 'rellenar', ref: u, dato: CLAVE_USUARIO }]), 'mapfre:nueva_produccion:auto'],
      ['mapeo no vacío', { ...resp([{ accion: 'rellenar', ref: u, dato: CLAVE_USUARIO }]), mapeo: [{ ref: u, campoCanonico: null, confianza: 'alta' }] }],
      ['clave extra', { ...resp([{ accion: 'rellenar', ref: u, dato: CLAVE_USUARIO }]), contrasena: CLAVE }],
    ]
    for (const [nombre, r, entrada] of malos) expect(validarRespuestaLogin(r, { inventario: inv, entrada: entrada ?? OCC }).ok, nombre).toBe(false)
  })
  it('falla cerrado fuera del SSO: el marco del elemento en otro host (o http) no vale', () => {
    for (const url of ['https://otro.example.com/login', 'http://ssoaut.gco.global/my.policy', 'https://portaloccident.gco.global/']) {
      const inv = inventario([{ tag: 'input', id: 'password', type: 'password', etiqueta: 'Contraseña' }], url)
      expect(validarRespuestaLogin(resp([{ accion: 'rellenar', ref: refDe(inv, 'password'), dato: CLAVE_CONTRASENA }]), { inventario: inv, entrada: OCC }).ok, url).toBe(false)
    }
  })
  it('avance: solo un submit, nunca un botón de emisión/prohibido ni un enlace', () => {
    const inv = inventario([
      { tag: 'button', id: 'b1', type: 'button', texto: 'Iniciar sesión' },
      { tag: 'button', id: 'b2', type: 'submit', texto: 'Enviar' },
      { tag: 'a', id: 'b3', texto: '¿Ha olvidado su clave?' },
      { tag: 'input', id: 'b4', type: 'submit', ariaLabel: 'Aceptar' },
    ])
    for (const id of ['b1', 'b2', 'b3', 'b4']) {
      expect(validarRespuestaLogin(resp([{ accion: 'avanzar', ref: refDe(inv, id), efectoEsperado: 'siguiente_pantalla', confianza: 'alta' }]), { inventario: inv, entrada: OCC }).ok, id).toBe(false)
    }
  })
  it('elegir: solo la fila que ENSEÑA el usuario propio', () => {
    const inv = inventario([
      { tag: 'input', id: 'u1', type: 'radio', etiqueta: 'otro.agente' },
      { tag: 'select', id: 's', opciones: [{ valor: 'otro.agente', texto: 'otro.agente' }] },
    ])
    for (const id of ['u1', 's']) expect(validarRespuestaLogin(resp([{ accion: 'elegir', ref: refDe(inv, id), dato: CLAVE_USUARIO }]), { inventario: inv, entrada: OCC }).ok, id).toBe(false)
  })
  it('OTP: parar otp es una respuesta válida (y va sola)', () => {
    const inv = VARIANTE_B()
    expect(validarRespuestaLogin(resp([{ accion: 'parar', motivo: 'otp' }]), { inventario: inv, entrada: OCC }).ok).toBe(true)
    expect(validarRespuestaLogin(resp([{ accion: 'parar', motivo: 'otp' }, { accion: 'rellenar', ref: refDe(inv, 'usernamegco'), dato: CLAVE_USUARIO }]), { inventario: inv, entrada: OCC }).ok).toBe(false)
  })
})

describe('credencial.* NO existe fuera de la fase de login', () => {
  it('ningún catálogo de ramo la trae, ni la ve la IA', () => {
    for (const [ramo, cat] of Object.entries(CATALOGO_EXPLORACION)) {
      expect(cat.some((d) => d.clave.startsWith('credencial.')), ramo).toBe(false)
      expect(JSON.stringify(catalogoParaIA(ramo))).not.toMatch(/credencial\./)
    }
  })
  it('el validador normal la rechaza (rellenar y mapeo) y el worker no la resuelve', () => {
    const inv = VARIANTE_B()
    for (const entrada of Object.keys(ENTRADAS_EXPLORACION)) {
      const ramo = ENTRADAS_EXPLORACION[entrada].ramo
      for (const dato of [CLAVE_USUARIO, CLAVE_CONTRASENA]) {
        const r = { version: 1, pantalla: { nombre: 'x', tipo: 'formulario' }, acciones: [{ accion: 'rellenar', ref: refDe(inv, 'usernamegco'), dato }], mapeo: [], motivo: null }
        expect(validarRespuestaExplorador(r, { inventario: inv, ramo, entrada, datosReales: null }).ok, `${entrada} ${dato}`).toBe(false)
        const m = { ...r, acciones: [{ accion: 'parar', motivo: 'ambiguo' }], mapeo: [{ ref: refDe(inv, 'usernamegco'), campoCanonico: dato, confianza: 'alta' }] }
        expect(validarRespuestaExplorador(m, { inventario: inv, ramo, entrada, datosReales: null }).ok).toBe(false)
        expect(resolverDato(dato, { ramo, conDatosReales: false, riesgo: null, env: { CRED_OCCIDENT_PORTAL_PASS: CLAVE }, hoy: new Date() })).toEqual({ ok: false, motivo: 'clave_desconocida' })
      }
    }
  })
  it('una respuesta de login (fase) no pasa el validador normal: nunca entra en el mapa ni en su memoria', () => {
    const inv = VARIANTE_B()
    const r = resp([{ accion: 'avanzar', ref: refDe(inv, 'SubmitCreds'), efectoEsperado: 'siguiente_pantalla', confianza: 'alta' }])
    expect(validarRespuestaExplorador(r, { inventario: inv, ramo: 'hogar', entrada: OCC, datosReales: null }).ok).toBe(false)
  })
})

describe('marcado del usuario y retirada de la contraseña', () => {
  it('el usuario delimitado se sustituye por la clave; un usuario más largo que lo contiene, no', () => {
    expect(marcarUsuarioEnTexto(`Hola ${USUARIO.toUpperCase()}`, USUARIO)).toBe(`Hola ${CLAVE_USUARIO}`)
    expect(marcarUsuarioEnTexto(`${USUARIO}x`, USUARIO)).toBe(`${USUARIO}x`)
    expect(marcarUsuarioEnTexto(`x.${USUARIO}`, USUARIO)).toBe(`x.${USUARIO}`)
    expect(marcarUsuarioEnTexto('ana.lopez', 'ana')).toBe('ana.lopez')
  })
  it('el inventario que sale no lleva ni el usuario ni la contraseña (aunque el crudo traiga value o texto)', () => {
    const crudo = sanearInventarioDom({
      marcos: [{
        url: SSO, nombre: null, titulos: [`Bienvenido ${USUARIO}`],
        elementos: [
          { tag: 'input', id: 'password', type: 'password', value: CLAVE, etiqueta: 'Contraseña' },
          { tag: 'select', id: 'usuarios', opciones: [{ valor: USUARIO, texto: USUARIO }, { valor: 'otro.agente', texto: 'otro.agente' }] },
          { tag: 'label', texto: `Pista: ${CLAVE}` },
        ],
      }],
    }, undefined, { refs: true })!
    expect(JSON.stringify(crudo)).not.toContain(`"value"`)
    const sale = marcarCredencialesInventario(crudo, CRED)
    const s = JSON.stringify(sale)
    expect(s).not.toContain(CLAVE)
    expect(s.toLowerCase()).not.toContain(USUARIO)
    expect(s).toContain(CLAVE_USUARIO)
    expect(inventarioSinCredenciales(sale, CRED)).toBe(true)
    // La última red ve FALLAR lo que se cuele.
    expect(inventarioSinCredenciales(crudo, CRED)).toBe(false)
    expect(inventarioSinCredenciales({ x: `a ${USUARIO} b` }, CRED)).toBe(false)
    expect(inventarioSinCredenciales({ x: JSON.stringify(CLAVE) }, CRED)).toBe(false)
  })
  it('resumen para el mapa: estructura, sin valores', () => {
    const r = resumenLoginParaMapa(2, marcarCredencialesInventario(VARIANTE_A(), CRED))
    expect(r).toMatch(/login asistido, pantalla 2/)
    expect(r).toMatch(/input\[type=password\]#password/)
    expect(r).toMatch(/button\[type=submit\]#SubmitCreds «Iniciar sesión»/)
    expect(r).not.toContain(CLAVE)
    expect(r.toLowerCase()).not.toContain(USUARIO)
  })
})

describe('revisión 14/10/2026', () => {
  it('elegir: una fila <button> sin type (submit) o type=submit NO vale; <button type=button> sí', () => {
    const inv = inventario([
      { tag: 'button', id: 'b0', texto: CLAVE_USUARIO },
      { tag: 'button', id: 'b1', type: 'submit', texto: CLAVE_USUARIO },
      { tag: 'button', id: 'b2', type: 'button', texto: CLAVE_USUARIO },
    ])
    const v = (id: string) => validarRespuestaLogin(resp([{ accion: 'elegir', ref: refDe(inv, id), dato: CLAVE_USUARIO }]), { inventario: inv, entrada: OCC }).ok
    expect(v('b0')).toBe(false)
    expect(v('b1')).toBe(false)
    expect(v('b2')).toBe(true)
  })
  it('última red: sin delimitar, sin mayúsculas, codificado en URL (%20 y +) y recortado con «…»', () => {
    const cred = { usuario: 'ana lopez', contrasena: CLAVE }
    for (const fuga of [`x.${USUARIO}`, `${USUARIO}@dominio.es`, `${USUARIO}_2`, USUARIO.toUpperCase(), `${USUARIO.slice(0, 6)}…`]) {
      expect(inventarioSinCredenciales({ t: fuga }, CRED), fuga).toBe(false)
    }
    for (const fuga of ['ana%20lopez', 'ana+lopez', 'ANA LOPEZ']) expect(inventarioSinCredenciales({ t: fuga }, cred), fuga).toBe(false)
    expect(inventarioSinCredenciales({ t: `${CLAVE.slice(0, 5)}…` }, CRED)).toBe(false)
    // La clave marcada y otros usuarios no son fuga.
    expect(inventarioSinCredenciales({ t: `${CLAVE_USUARIO} otro.agente ana…` }, CRED)).toBe(true)
  })
})

