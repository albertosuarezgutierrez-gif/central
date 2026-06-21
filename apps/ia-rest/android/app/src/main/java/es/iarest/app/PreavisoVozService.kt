package es.iarest.app

// ═══════════════════════════════════════════════════════════════
// ia.rest · PreavisoVozService — voz del preaviso de marcha con la
// pantalla apagada (Fase 2b).
//
// Servicio en primer plano que escucha la tabla `preavisos` por
// Supabase Realtime y, cuando llega uno dirigido a una comanda de
// ESTE camarero, lo lee en voz alta con el TTS nativo de Android +
// vibra — aunque el móvil esté bloqueado.
//
// Complementa la voz web de /edge (Capa 1): la web habla cuando la
// app está visible; este servicio habla SOLO cuando NO está visible
// (pantalla apagada / app en segundo plano) → sin voz duplicada.
//
// Credenciales: NO se hardcodean. La WebView (/edge) pasa la URL y
// la anon key actuales por el bridge (IaRestBridge.setPreavisoSesion),
// para no quedar atados a un proyecto Supabase obsoleto.
// ═══════════════════════════════════════════════════════════════

import android.app.*
import android.content.Context
import android.content.Intent
import android.os.*
import android.speech.tts.TextToSpeech
import android.util.Log
import androidx.core.app.NotificationCompat
import okhttp3.*
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

class PreavisoVozService : Service(), TextToSpeech.OnInitListener {

    companion object {
        const val TAG        = "ia.rest.Voz"
        const val CHANNEL_ID = "iarest_voz"
        const val NOTIF_ID   = 1002

        // ── Sesión inyectada desde la WebView (sin hardcode de credenciales) ──
        @Volatile var supabaseUrl  = ""
        @Volatile var anonKey      = ""
        @Volatile var schema       = "iarest"
        @Volatile var restauranteId = ""
        @Volatile var comandaIds: Set<String> = emptySet()
        @Volatile var voiceOn      = true
        // appVisible=true → la web habla (Capa 1); el nativo calla para no duplicar.
        @Volatile var appVisible   = true

        fun actualizarSesion(
            url: String, anon: String, sch: String,
            rid: String, ids: Set<String>, voice: Boolean
        ) {
            supabaseUrl = url; anonKey = anon
            schema = sch.ifEmpty { "iarest" }
            restauranteId = rid; comandaIds = ids; voiceOn = voice
        }
    }

    private val http = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.SECONDS)   // WS de larga duración
        .pingInterval(20, TimeUnit.SECONDS)
        .build()

    private val running = AtomicBoolean(false)
    private var ws: WebSocket? = null
    private var tts: TextToSpeech? = null
    private var ttsListo = false
    private var handler: Handler? = null
    private var looper: HandlerThread? = null
    private val yaHablados = HashSet<String>()   // dedup de preavisos ya leídos
    private var ridConectado = ""

    // ── Lifecycle ────────────────────────────────────────────────
    override fun onCreate() {
        super.onCreate()
        crearCanal()
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                startForeground(
                    NOTIF_ID, buildNotification(),
                    android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
                )
            } else {
                startForeground(NOTIF_ID, buildNotification())
            }
        } catch (e: Exception) {
            Log.w(TAG, "startForeground falló: ${e.message}")
        }
        tts = TextToSpeech(this, this)
        looper = HandlerThread("voz-loop").also { it.start() }
        handler = Handler(looper!!.looper)
    }

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            tts?.language = Locale("es", "ES")
            ttsListo = true
        } else {
            Log.w(TAG, "TTS no disponible (status=$status)")
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (supabaseUrl.isEmpty() || anonKey.isEmpty() || restauranteId.isEmpty() || !voiceOn) {
            Log.i(TAG, "Sesión incompleta o voz off — servicio inactivo")
            stopSelf()
            return START_NOT_STICKY
        }
        running.set(true)
        // (re)conectar si cambió el restaurante o no había WS
        if (ws == null || ridConectado != restauranteId) {
            ws?.cancel(); ws = null
            conectarRealtime(restauranteId)
        }
        return START_STICKY
    }

    override fun onDestroy() {
        running.set(false)
        ws?.cancel(); ws = null
        try { tts?.stop(); tts?.shutdown() } catch (_: Exception) {}
        looper?.quit()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // ── Supabase Realtime: preavisos INSERT del restaurante ──────
    private fun conectarRealtime(rid: String) {
        if (supabaseUrl.isEmpty() || anonKey.isEmpty()) return
        ridConectado = rid
        val wsUrl = supabaseUrl.replace("https://", "wss://") +
            "/realtime/v1/websocket?apikey=$anonKey&vsn=1.0.0"

        ws = http.newWebSocket(Request.Builder().url(wsUrl).build(), object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                Log.i(TAG, "Realtime conectado (preavisos)")
                val join = JSONObject().apply {
                    put("topic", "realtime:$schema:preavisos:rid=$rid")
                    put("event", "phx_join")
                    put("payload", JSONObject().apply {
                        put("config", JSONObject().apply {
                            put("postgres_changes", JSONArray().apply {
                                put(JSONObject().apply {
                                    put("event", "INSERT")
                                    put("schema", schema)
                                    put("table", "preavisos")
                                    put("filter", "restaurante_id=eq.$rid")
                                })
                            })
                        })
                    })
                    put("ref", "1")
                }
                webSocket.send(join.toString())
                programarHeartbeat()
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                try {
                    val record = JSONObject(text)
                        .optJSONObject("payload")?.optJSONObject("data")?.optJSONObject("record")
                        ?: return
                    manejarPreaviso(record)
                } catch (_: Exception) {}
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.w(TAG, "WS caído: ${t.message} — reintento en 5s")
                ws = null
                handler?.postDelayed({
                    if (running.get() && voiceOn && restauranteId.isNotEmpty()) conectarRealtime(restauranteId)
                }, 5_000L)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) { ws = null }
        })
    }

    private fun programarHeartbeat() {
        handler?.postDelayed(object : Runnable {
            override fun run() {
                val sock = ws ?: return
                try {
                    sock.send(JSONObject().apply {
                        put("topic", "phoenix"); put("event", "heartbeat")
                        put("payload", JSONObject()); put("ref", "hb")
                    }.toString())
                } catch (_: Exception) {}
                handler?.postDelayed(this, 25_000L)
            }
        }, 25_000L)
    }

    // ── Decidir y hablar ─────────────────────────────────────────
    private fun manejarPreaviso(record: JSONObject) {
        if (record.optString("estado") != "enviado") return
        val comandaId = record.optString("comanda_id")
        val id = record.optString("id").ifEmpty { comandaId }
        if (comandaId.isEmpty() || comandaId !in comandaIds) return
        if (!voiceOn || appVisible) return            // la web ya habla si está visible
        if (!yaHablados.add(id)) return               // dedup
        if (yaHablados.size > 200) yaHablados.clear()

        val mesa = record.optString("mesa")
        val platos = leerPlatos(record)
        val texto = textoPreaviso(mesa, platos)
        if (texto.isNotEmpty()) hablar(texto)
        vibrar()
    }

    private fun leerPlatos(record: JSONObject): JSONArray {
        record.optJSONArray("platos")?.let { return it }
        // jsonb puede llegar como string serializado
        val raw = record.optString("platos")
        return try { if (raw.isNotEmpty()) JSONArray(raw) else JSONArray() }
        catch (_: Exception) { JSONArray() }
    }

    // Espejo de lib/preaviso.ts textoPreaviso(): "Mesa 7: salen 2 Entrecot, 1 Lubina"
    private fun textoPreaviso(mesa: String, platos: JSONArray): String {
        val partes = ArrayList<String>()
        for (i in 0 until platos.length()) {
            val p = platos.optJSONObject(i) ?: continue
            val n = p.optInt("cantidad", 1)
            val nombre = p.optString("nombre")
            if (nombre.isNotEmpty()) partes.add("$n $nombre")
        }
        if (partes.isEmpty()) return ""
        val lista = partes.joinToString(", ")
        return if (mesa.isNotEmpty()) "Mesa $mesa: salen $lista" else "Salen $lista"
    }

    private fun hablar(texto: String) {
        if (!ttsListo) return
        try { tts?.speak(texto, TextToSpeech.QUEUE_ADD, null, "preaviso-${System.currentTimeMillis()}") }
        catch (e: Exception) { Log.w(TAG, "TTS speak falló: ${e.message}") }
    }

    @Suppress("DEPRECATION")
    private fun vibrar() {
        try {
            val v = getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator ?: return
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                v.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 30, 50, 30), -1))
            } else {
                v.vibrate(longArrayOf(0, 30, 50, 30), -1)
            }
        } catch (_: Exception) {}
    }

    // ── Notificación foreground ──────────────────────────────────
    private fun crearCanal() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(
                CHANNEL_ID, "ia.rest Voz", NotificationManager.IMPORTANCE_LOW
            ).apply { description = "Lee los preavisos de marcha en voz alta" }
            (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(ch)
        }
    }

    private fun buildNotification(): Notification {
        val intent = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("ia.rest")
            .setContentText("Avisos de marcha por voz activos")
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentIntent(intent)
            .setOngoing(true)
            .setSilent(true)
            .build()
    }
}
