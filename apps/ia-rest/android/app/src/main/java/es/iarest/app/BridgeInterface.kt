package es.iarest.app

// ═══════════════════════════════════════════════════════════════
// ia.rest · BridgeInterface
// JavascriptInterface — la WebView puede configurar el bridge
// desde /owner sin salir de la app.
//
// Uso desde JS en la WebView:
//   window.IaRestBridge.setToken("TOKEN_AQUI", "Tablet Barra")
//   window.IaRestBridge.getStatus()  → "master" | "standby" | "inactivo"
//   window.IaRestBridge.stop()
// ═══════════════════════════════════════════════════════════════

import android.content.Context
import android.content.Intent
import android.webkit.JavascriptInterface
import android.os.Build

class BridgeInterface(private val ctx: Context) {

    @JavascriptInterface
    fun setToken(token: String, deviceName: String) {
        if (token.isBlank()) return
        val name = deviceName.ifEmpty { Build.MODEL }
        BridgeService.setToken(ctx, token, name)
        // Arrancar (o reiniciar) el Service
        val intent = Intent(ctx, BridgeService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(intent)
        } else {
            ctx.startService(intent)
        }
    }

    @JavascriptInterface
    fun getToken(): String =
        BridgeService.getToken(ctx) ?: ""

    @JavascriptInterface
    fun stop() {
        ctx.stopService(Intent(ctx, BridgeService::class.java))
        BridgeService.setToken(ctx, "", "")
    }

    @JavascriptInterface
    fun getDeviceName(): String =
        ctx.getSharedPreferences(BridgeService.PREFS_NAME, Context.MODE_PRIVATE)
            .getString(BridgeService.PREF_DEVICE, Build.MODEL) ?: Build.MODEL

    @JavascriptInterface
    fun getVersion(): String = BridgeService.VERSION

    // ── Voz del preaviso de marcha (Fase 2b) ─────────────────────
    // La WebView (/edge) pasa las credenciales Supabase ACTUALES (de las env
    // vars, sin hardcode), el restaurante, las comandas de este camarero y si
    // la voz está activa. Arranca/para el servicio que habla con pantalla apagada.
    @JavascriptInterface
    fun setPreavisoSesion(
        supabaseUrl: String, anonKey: String, schema: String,
        restauranteId: String, comandaIdsCsv: String, voiceOn: Boolean
    ) {
        val ids = comandaIdsCsv.split(",").map { it.trim() }.filter { it.isNotEmpty() }.toSet()
        PreavisoVozService.actualizarSesion(supabaseUrl, anonKey, schema, restauranteId, ids, voiceOn)
        val intent = Intent(ctx, PreavisoVozService::class.java)
        if (restauranteId.isNotEmpty() && voiceOn && supabaseUrl.isNotEmpty() && anonKey.isNotEmpty()) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(intent)
            else ctx.startService(intent)
        } else {
            ctx.stopService(intent)
        }
    }
}
