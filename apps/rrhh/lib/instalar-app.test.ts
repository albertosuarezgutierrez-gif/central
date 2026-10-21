import { describe, it, expect } from 'vitest'
import { avisoInstalar, esSafariIOS } from './instalar-app'

const SAFARI_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'
const CHROME_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/124.0 Mobile/15E148 Safari/604.1'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36'
const base = { standalone: false, hayPromptAndroid: false, descartado: false }

describe('avisoInstalar', () => {
  it('iOS: solo en Safari y fuera de standalone', () => {
    expect(esSafariIOS(SAFARI_IOS)).toBe(true)
    expect(esSafariIOS(CHROME_IOS)).toBe(false)
    expect(avisoInstalar({ ...base, plataforma: 'ios', userAgent: SAFARI_IOS })).toBe('ios')
    expect(avisoInstalar({ ...base, plataforma: 'ios', userAgent: CHROME_IOS })).toBeNull()
    expect(avisoInstalar({ ...base, plataforma: 'ios', userAgent: SAFARI_IOS, standalone: true })).toBeNull()
  })
  it('Android: solo si el navegador ofreció beforeinstallprompt', () => {
    expect(avisoInstalar({ ...base, plataforma: 'android', userAgent: ANDROID })).toBeNull()
    expect(avisoInstalar({ ...base, plataforma: 'android', userAgent: ANDROID, hayPromptAndroid: true })).toBe('android')
  })
  it('descartado u otra plataforma -> nada', () => {
    expect(avisoInstalar({ ...base, plataforma: 'android', userAgent: ANDROID, hayPromptAndroid: true, descartado: true })).toBeNull()
    expect(avisoInstalar({ ...base, plataforma: 'otro', userAgent: 'Windows', hayPromptAndroid: true })).toBeNull()
  })
})
