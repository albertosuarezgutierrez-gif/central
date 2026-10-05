// Guardianes del tarificador RPA: tarificar ≠ emitir, credenciales que no salen, fail-closed.
// Cada cepo se ha visto FALLAR (rompiendo lo que protege) antes de darlo por bueno.
import { describe, it, expect } from 'vitest'
import {
  comprobarBoton,
  comprobarUrl,
  EmisionBloqueadaError,
  pareceEmision,
  puedeAutomatizar,
  MODOS_INTEGRACION,
  redactar,
  redactarHtml,
  secretosDelEntorno,
  crearRedactor,
  MARCA_REDACTADO,
  variablesProhibidas,
  envDeMaquina,
  ENV_MAQUINA_PERMITIDAS,
  nombresCredencial,
} from './index.ts'

describe('guard de emisión', () => {
  it.each([
    'https://epac.allianz.es/poliza/emitir?id=1',
    'https://x/Emisión',
    'https://x/contratacion/paso1',
    'https://x/formalizar',
    'https://x/suplemento/nuevo',
    'https://x/anulacion',
    'https://x/solicitud-baja',
    'https://x/%C3%A9mitir', // codificada
    'https://x/emisi%C3%B3n',
  ])('aborta la URL %s', (url) => {
    expect(() => comprobarUrl(url)).toThrow(EmisionBloqueadaError)
  })

  it.each(['Emitir póliza', 'CONTRATAR', 'Formalización', 'Solicitar suplemento', 'Anular', 'Dar de baja'])(
    'aborta el botón «%s»',
    (texto) => {
      expect(() => comprobarBoton([texto])).toThrow(EmisionBloqueadaError)
    },
  )

  it('mira también id/aria-label/value, no solo el texto visible', () => {
    expect(() => comprobarBoton(['', null, 'btnEmitirPoliza'])).toThrow(/guard_emision/)
    expect(() => comprobarBoton([undefined, 'Formalizar contrato'])).toThrow(/boton/)
  })

  it('deja pasar la tarificación', () => {
    for (const ok of ['https://epac.allianz.es/tarificador/comunidades', 'Calcular precio', 'Tarificar', 'Siguiente', 'Descargar proyecto PDF']) {
      expect(pareceEmision(ok)).toBe(false)
    }
    expect(() => comprobarUrl('https://epac.allianz.es/cotizacion?ramo=comunidades')).not.toThrow()
    expect(() => comprobarBoton(['Calcular', null, undefined])).not.toThrow()
  })

  it('el error lleva tipo emision (el orquestador lo convierte en error_definitivo)', () => {
    try {
      comprobarUrl('https://x/emitir')
      expect.unreachable()
    } catch (e) {
      expect((e as EmisionBloqueadaError).tipo).toBe('emision')
    }
  })
})

describe('puedeAutomatizar es fail-closed', () => {
  it('solo rpa_autorizada', () => {
    const si = MODOS_INTEGRACION.filter((m) => puedeAutomatizar(m))
    expect(si).toEqual(['rpa_autorizada'])
  })
  it.each([null, undefined, '', 'RPA_AUTORIZADA', ' rpa_autorizada', 'rpa_autorizada ', 'rpa', true, 1, {}, ['rpa_autorizada']])(
    'no automatiza con %j',
    (v) => {
      expect(puedeAutomatizar(v)).toBe(false)
    },
  )
})

describe('redactor de credenciales', () => {
  const env = {
    CRED_ALLIANZ_EPAC_USER: 'agente.sevilla77',
    CRED_ALLIANZ_EPAC_PASS: 'S3cr3t!o&x',
    // valor ficticio compuesto en runtime: un literal junto a «SECRET» dispara gitleaks generic-api-key
    TARIFICADOR_WORKER_SECRET: ['wk', '9f8e7d6c5b4a'].join('_'),
    JOB_ID: '11111111-1111-1111-1111-111111111111',
    HOME: '/root',
  }
  const secretos = secretosDelEntorno(env)

  it('recoge los valores de CRED_* y de *SECRET*, no los de variables normales', () => {
    expect(secretos).toContain('S3cr3t!o&x')
    expect(secretos).toContain('agente.sevilla77')
    expect(secretos).toContain('wk_9f8e7d6c5b4a')
    expect(secretos).not.toContain('/root')
    expect(secretos).not.toContain(env.JOB_ID)
  })

  it('no deja pasar ni el literal ni sus formas codificadas', () => {
    const log = crearRedactor(secretos)
    const linea = log(
      `login user=agente.sevilla77 pass=S3cr3t!o&x url=https://x/?p=${encodeURIComponent('S3cr3t!o&x')} b64=${btoa('S3cr3t!o&x')} auth=Bearer wk_9f8e7d6c5b4a`,
    )
    for (const s of secretos) expect(linea).not.toContain(s)
    expect(linea).not.toContain(encodeURIComponent('S3cr3t!o&x'))
    expect(linea).not.toContain(btoa('S3cr3t!o&x'))
    expect(linea).toContain(MARCA_REDACTADO)
  })

  it('redacta password=… y Authorization: Bearer … aunque no se conozca el valor', () => {
    const t = redactar('{"password":"otraDistinta"} Authorization: Bearer abc.def.ghi', [])
    expect(t).not.toContain('otraDistinta')
    expect(t).not.toContain('abc.def.ghi')
  })

  it('vacía el value de los input password del HTML de evidencia', () => {
    const html = '<form><input type="password" name="pwd" value="loquesea"><input type="text" value="Calle Socorro"></form>'
    const r = redactarHtml(html, [])
    expect(r).not.toContain('loquesea')
    expect(r).toContain('Calle Socorro')
  })
})

describe('entorno del worker', () => {
  it('detecta CODEOSCOPIC_* y DATABASE_URL', () => {
    expect(
      variablesProhibidas({ CODEOSCOPIC_CLIENT_SECRET: 'x', DATABASE_URL: 'postgres://', JOB_ID: 'y', CRED_ALLIANZ_EPAC_PASS: 'z' }),
    ).toEqual(['CODEOSCOPIC_CLIENT_SECRET', 'DATABASE_URL'])
    expect(variablesProhibidas({ JOB_ID: 'y', CRED_ALLIANZ_EPAC_USER: 'u', TARIFICADOR_WORKER_SECRET: 's' })).toEqual([])
  })

  it('la máquina solo recibe JOB_ID y la URL (sin secretos)', () => {
    const env = envDeMaquina({ jobId: '11111111-1111-4111-8111-111111111111', apiUrl: 'https://api.grupoasegura.es/ruta?x=1' })
    expect(Object.keys(env).sort()).toEqual([...ENV_MAQUINA_PERMITIDAS].sort())
    expect(env.TARIFICADOR_API_URL).toBe('https://api.grupoasegura.es')
    expect(() => envDeMaquina({ jobId: 'no-uuid', apiUrl: 'https://a.es' })).toThrow()
    expect(() => envDeMaquina({ jobId: '11111111-1111-4111-8111-111111111111', apiUrl: 'http://a.es' })).toThrow(/https/)
    expect(() => envDeMaquina({ jobId: '11111111-1111-4111-8111-111111111111', apiUrl: 'https://u:p@a.es' })).toThrow(/credenciales/)
  })

  it('nombres de credencial', () => {
    expect(nombresCredencial('allianz_epac')).toEqual({ usuario: 'CRED_ALLIANZ_EPAC_USER', contrasena: 'CRED_ALLIANZ_EPAC_PASS' })
    expect(() => nombresCredencial('allianz epac')).toThrow()
  })
})
