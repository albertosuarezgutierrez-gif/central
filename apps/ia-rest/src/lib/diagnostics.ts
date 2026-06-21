/**
 * ia.rest — Sistema de diagnóstico y detección de conflictos
 *
 * Detecta automáticamente conflictos de integración APK↔Web
 * y los reporta en consola. En desarrollo muestra un panel visual.
 *
 * Uso: importar en edge/page.tsx y llamar a runDiagnostics()
 */

export interface DiagnosticResult {
  ok: boolean
  system: string
  status: string
  detail?: string
}

export function runDiagnostics(): DiagnosticResult[] {
  const results: DiagnosticResult[] = []

  // ── 1. Entorno de ejecución ────────────────────────────────────
  const isNative = !!(window as any).isNativeApp
  const isChrome = /Chrome/.test(navigator.userAgent) && !/Chromium/.test(navigator.userAgent)
  results.push({
    ok: true,
    system: 'Entorno',
    status: isNative ? '📱 APK nativo' : isChrome ? '🌐 Chrome' : '🌐 Navegador',
    detail: navigator.userAgent.slice(0, 80)
  })

  // ── 2. MediaSession — detectar conflicto APK vs Web ────────────
  if ('mediaSession' in navigator) {
    const webHandlerActive = !!(navigator.mediaSession as any)._playHandler
    if (isNative && webHandlerActive) {
      results.push({
        ok: false,
        system: 'MediaSession',
        status: '⚠️ CONFLICTO: handlers web activos en APK nativo',
        detail: 'La web MediaSession compite con la nativa. window.isNativeApp debería desactivarla.'
      })
      console.error('[ia.rest] MediaSession conflict detected: web handlers active inside APK')
    } else {
      results.push({
        ok: true,
        system: 'MediaSession',
        status: isNative ? '✅ Nativa (APK controla)' : '✅ Web (Chrome controla)',
      })
    }
  } else {
    results.push({ ok: false, system: 'MediaSession', status: '❌ No soportado' })
  }

  // ── 3. Micrófono ───────────────────────────────────────────────
  const hasGetUserMedia = !!(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function')
  if (hasGetUserMedia) {
    results.push({ ok: true, system: 'Micrófono API', status: '✅ getUserMedia disponible' })
  } else {
    results.push({ ok: false, system: 'Micrófono API', status: '❌ getUserMedia no disponible', detail: 'Requiere HTTPS o localhost' })
  }

  // ── 4. Permiso de micrófono ────────────────────────────────────
  if (navigator.permissions) {
    navigator.permissions.query({ name: 'microphone' as PermissionName }).then(p => {
      if (p.state !== 'granted') {
        console.warn(`[ia.rest] Microphone permission: ${p.state}`)
      }
    }).catch(() => {})
  }

  // ── 5. Service Worker ──────────────────────────────────────────
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistration().then(reg => {
      if (!reg) console.warn('[ia.rest] No service worker registered')
    })
    results.push({ ok: true, system: 'Service Worker', status: '✅ Soportado' })
  } else {
    results.push({ ok: false, system: 'Service Worker', status: '❌ No soportado — push no funcionará' })
  }

  // ── 6. Notificaciones push ─────────────────────────────────────
  if ('Notification' in window) {
    const perm = Notification.permission
    results.push({
      ok: perm === 'granted',
      system: 'Notificaciones',
      status: perm === 'granted' ? '✅ Concedidas' : perm === 'denied' ? '❌ Denegadas' : '⚠️ Sin decidir',
      detail: perm !== 'granted' ? 'Las alertas de cocina no llegarán al camarero' : undefined
    })
    if (perm === 'denied') console.error('[ia.rest] Push notifications denied — cocina alerts will not work')
  } else {
    results.push({ ok: false, system: 'Notificaciones', status: '❌ No soportado' })
  }

  // ── 7. WebSocket / Supabase Realtime ──────────────────────────
  if ('WebSocket' in window) {
    results.push({ ok: true, system: 'WebSocket', status: '✅ Soportado (Supabase Realtime OK)' })
  } else {
    results.push({ ok: false, system: 'WebSocket', status: '❌ No soportado — Realtime no funcionará' })
  }

  // ── 8. isNativeApp flag consistencia ─────────────────────────
  if (isNative) {
    const startPTT = typeof (window as any).startPTT === 'function'
    const stopPTT  = typeof (window as any).stopPTT  === 'function'
    results.push({
      ok: startPTT && stopPTT,
      system: 'PTT Nativo',
      status: startPTT && stopPTT ? '✅ window.startPTT/stopPTT expuestos' : '❌ PTT globals no definidos',
      detail: !startPTT || !stopPTT ? 'El APK no podrá disparar PTT. Revisar edge/page.tsx.' : undefined
    })
    if (!startPTT || !stopPTT) {
      console.error('[ia.rest] Native PTT: window.startPTT or window.stopPTT not defined')
    }
  }

  // ── Log resumen ───────────────────────────────────────────────
  const errors = results.filter(r => !r.ok)
  if (errors.length === 0) {
    console.log('[ia.rest] ✅ Diagnóstico OK — todos los sistemas operativos')
  } else {
    console.warn(`[ia.rest] ⚠️ ${errors.length} problema(s) detectado(s):`)
    errors.forEach(e => console.warn(`  • ${e.system}: ${e.status}${e.detail ? ' — ' + e.detail : ''}`))
  }

  return results
}

/**
 * Checklist de integración APK ↔ Web
 * Para revisar manualmente antes de subir nueva versión del APK
 */
export const APK_WEB_INTEGRATION_CHECKLIST = [
  {
    id: 'native_flag',
    check: 'APK inyecta window.isNativeApp=true via onPageFinished',
    file: 'android/app/src/main/java/es/iarest/app/MainActivity.kt',
    pattern: 'window.isNativeApp = true'
  },
  {
    id: 'web_mediasession_skip',
    check: 'Web salta MediaSession si isNativeApp',
    file: 'src/app/edge/page.tsx',
    pattern: 'isNativeApp'
  },
  {
    id: 'ptt_globals',
    check: 'window.startPTT y stopPTT expuestos en edge/page.tsx',
    file: 'src/app/edge/page.tsx',
    pattern: 'window.startPTT'
  },
  {
    id: 'dispatch_key',
    check: 'APK override dispatchKeyEvent para KEYCODE_HEADSETHOOK',
    file: 'android/app/src/main/java/es/iarest/app/MainActivity.kt',
    pattern: 'KEYCODE_HEADSETHOOK'
  },
  {
    id: 'permissions_manifest',
    check: 'AndroidManifest tiene RECORD_AUDIO + POST_NOTIFICATIONS + CAMERA',
    file: 'android/app/src/main/AndroidManifest.xml',
    pattern: 'POST_NOTIFICATIONS'
  },
  {
    id: 'permissions_runtime',
    check: 'APK pide todos los permisos al arrancar (requestAllPermissions)',
    file: 'android/app/src/main/java/es/iarest/app/MainActivity.kt',
    pattern: 'requestAllPermissions'
  },
  {
    id: 'webview_focus',
    check: 'WebView.requestFocus() llamado tras setup',
    file: 'android/app/src/main/java/es/iarest/app/MainActivity.kt',
    pattern: 'requestFocus'
  },
  {
    id: 'navigation_internal',
    check: 'shouldOverrideUrlLoading mantiene iarest.es dentro del WebView',
    file: 'android/app/src/main/java/es/iarest/app/MainActivity.kt',
    pattern: 'iarest.es'
  },
  {
    id: 'version_sync',
    check: 'CURRENT_VERSION en MainActivity == version en public/app/version.json',
    file: 'android/app/src/main/java/es/iarest/app/MainActivity.kt + public/app/version.json',
    pattern: 'CURRENT_VERSION'
  },
  {
    id: 'apk_login_url',
    check: 'APK carga /login directamente (no landing)',
    file: 'android/app/src/main/java/es/iarest/app/MainActivity.kt',
    pattern: 'iarest.es/login'
  }
]
