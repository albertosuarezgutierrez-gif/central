package es.iarest.app

// ═══════════════════════════════════════════════════════════════
// ia.rest · BridgeService — Bridge Mesh v7 nativo Android
//
// Service en background que convierte el móvil en nodo bridge:
//   · Heartbeat cada 5s → servidor elige master/standby
//   · Master: recibe print_jobs via WebSocket Realtime
//   · Imprime via Socket TCP ESC/POS (puerto 9100)
//   · Detecta WiFi/datos → si no hay WiFi siempre standby
//   · Failover: si master cae, standby se promueve en <15s
// ═══════════════════════════════════════════════════════════════

import android.app.*
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiManager
import android.os.*
import android.util.Log
import androidx.core.app.NotificationCompat
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStream
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Socket
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

class BridgeService : Service() {

    companion object {
        const val TAG            = "ia.rest.Bridge"
        const val CHANNEL_ID     = "iarest_bridge"
        const val NOTIF_ID       = 1001
        const val API            = "https://www.iarest.es"
        const val SUPABASE_URL   = "https://efncqyvhniaxsirhdxaa.supabase.co"
        const val ANON_KEY       = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmbmNxeXZobmlheHNpcmhkeGFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2ODk5MzYsImV4cCI6MjA5MzI2NTkzNn0.dt3ko-HWzJK57FQyRDTjU07QBsYv9fpGo8Sm3Cs6heA"
        const val VERSION        = "7.0.0-android"
        const val PREFS_NAME     = "iarest_bridge"
        const val PREF_TOKEN     = "bridge_token"
        const val PREF_DEVICE    = "device_name"
        const val HEARTBEAT_MS   = 5_000L
        const val STANDBY_MS     = 10_000L

        fun setToken(ctx: Context, token: String, deviceName: String = "") {
            ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
                .putString(PREF_TOKEN, token)
                .putString(PREF_DEVICE, deviceName.ifEmpty { android.os.Build.MODEL })
                .apply()
        }

        fun getToken(ctx: Context): String? =
            ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getString(PREF_TOKEN, null)
    }

    private val http = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()

    private val running    = AtomicBoolean(false)
    private val rol        = AtomicReference("unknown")
    private var ws: WebSocket? = null
    private var restauranteId: String? = null
    private var handler: Handler? = null
    private var looper: HandlerThread? = null

    // ── Lifecycle ────────────────────────────────────────────────
    override fun onCreate() {
        super.onCreate()
        crearCanalNotificacion()
        // startForeground sin tipo — compatible con todas las versiones Android
        startForeground(NOTIF_ID, buildNotification("Iniciando..."))
        Log.i(TAG, "BridgeService onCreate")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val token = getToken(this)
        if (token.isNullOrEmpty()) {
            Log.i(TAG, "Sin token — bridge inactivo")
            stopSelf()
            return START_NOT_STICKY
        }
        if (!running.getAndSet(true)) {
            arrancarLoop(token)
        }
        return START_STICKY
    }

    override fun onDestroy() {
        running.set(false)
        ws?.cancel()
        looper?.quit()
        Log.i(TAG, "BridgeService destruido")
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // ── Loop principal ───────────────────────────────────────────
    private fun arrancarLoop(token: String) {
        looper = HandlerThread("bridge-loop").also { it.start() }
        handler = Handler(looper!!.looper)

        val tick = object : Runnable {
            override fun run() {
                if (!running.get()) return
                try {
                    pingMesh(token)
                    if (rol.get() == "master") {
                        procesarJobs(token)
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Tick error: ${e.message}")
                }
                val delay = if (rol.get() == "master") HEARTBEAT_MS else STANDBY_MS
                handler?.postDelayed(this, delay)
            }
        }
        handler?.post(tick)
    }

    // ── Heartbeat + master election ──────────────────────────────
    private fun pingMesh(token: String) {
        val enWifi  = estaEnWifi()
        val ipLan   = obtenerIpLan() ?: ""
        val device  = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(PREF_DEVICE, Build.MODEL) ?: Build.MODEL

        val url = "$API/api/bridge/info" +
            "?token=$token&v=$VERSION" +
            "&wifi=${if (enWifi) "1" else "0"}" +
            "&platform=android" +
            "&device=${device.replace(" ", "%20")}" +
            (if (ipLan.isNotEmpty()) "&ip_lan=$ipLan" else "")

        val req = Request.Builder().url(url).get().build()
        val res = http.newCall(req).execute()

        if (!res.isSuccessful) return
        val body = JSONObject(res.body?.string() ?: return)

        restauranteId = body.optString("restaurante_id").ifEmpty { restauranteId }
        val nuevoRol  = body.optString("rol", "standby")
        val rolAntes  = rol.getAndSet(nuevoRol)
        val nodos     = body.optInt("nodos_activos", 1)

        if (nuevoRol != rolAntes) {
            val estado = if (nuevoRol == "master")
                "★ MASTER${if (nodos > 1) " ($nodos nodos)" else ""}"
            else "Standby"
            Log.i(TAG, "Rol: $estado")
            actualizarNotificacion(estado)
        }

        // Conectar WebSocket Realtime si soy master y no está conectado
        if (nuevoRol == "master" && ws == null) {
            restauranteId?.let { conectarRealtime(token, it) }
        } else if (nuevoRol != "master") {
            ws?.cancel()
            ws = null
        }
    }

    // ── WebSocket Realtime Supabase ──────────────────────────────
    private fun conectarRealtime(token: String, rid: String) {
        val wsUrl = SUPABASE_URL.replace("https://", "wss://") +
            "/realtime/v1/websocket?apikey=$ANON_KEY&vsn=1.0.0"

        val req = Request.Builder().url(wsUrl).build()
        ws = http.newWebSocket(req, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                Log.i(TAG, "Realtime conectado")
                // Suscribir a print_jobs del restaurante
                val join = JSONObject().apply {
                    put("topic", "realtime:public:print_jobs:restaurante_id=eq.$rid")
                    put("event", "phx_join")
                    put("payload", JSONObject().apply {
                        put("config", JSONObject().apply {
                            put("postgres_changes", JSONArray().apply {
                                put(JSONObject().apply {
                                    put("event", "INSERT")
                                    put("schema", "public")
                                    put("table", "print_jobs")
                                    put("filter", "restaurante_id=eq.$rid")
                                })
                            })
                        })
                    })
                    put("ref", "1")
                }
                webSocket.send(join.toString())
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                try {
                    val msg    = JSONObject(text)
                    val record = msg.optJSONObject("payload")
                        ?.optJSONObject("data")
                        ?.optJSONObject("record")
                        ?: return
                    if (record.optString("status") == "pendiente" &&
                        record.optString("restaurante_id") == rid) {
                        Log.i(TAG, "Nuevo job via Realtime")
                        val tkn = getToken(this@BridgeService) ?: return
                        procesarJobs(tkn)
                    }
                } catch (_: Exception) {}
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.w(TAG, "WS caído: ${t.message} — reconectando en 5s")
                ws = null
                handler?.postDelayed({
                    if (rol.get() == "master") {
                        restauranteId?.let { conectarRealtime(token, it) }
                    }
                }, 5_000L)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                ws = null
            }
        })
    }

    // ── Fetch y procesado de print_jobs ──────────────────────────
    private fun procesarJobs(token: String) {
        val req = Request.Builder()
            .url("$API/api/print?token=$token&v=$VERSION")
            .get().build()
        val res = http.newCall(req).execute()
        if (!res.isSuccessful) return

        val body = JSONObject(res.body?.string() ?: return)
        if (body.optBoolean("standby")) return  // otro nodo es master

        val jobs = body.optJSONArray("jobs") ?: return
        for (i in 0 until jobs.length()) {
            imprimirJob(jobs.getJSONObject(i), token)
        }
    }

    // ── Impresión ESC/POS via TCP ────────────────────────────────
    private fun imprimirJob(job: JSONObject, token: String) {
        val jobId     = job.optString("id")
        val ip        = job.optString("ip_address").ifEmpty { job.optString("ip") }
        val port      = job.optInt("port", 9100)
        val printData = job.optString("print_data")

        if (ip.isEmpty() || printData.isEmpty()) return

        try {
            val bytes = android.util.Base64.decode(printData, android.util.Base64.DEFAULT)
            Socket().use { socket ->
                socket.connect(InetSocketAddress(InetAddress.getByName(ip), port), 5_000)
                socket.getOutputStream().also { out: OutputStream ->
                    out.write(bytes)
                    out.flush()
                }
            }
            reportarResultado(jobId, "impreso", null, token)
            Log.i(TAG, "✓ Job $jobId → $ip:$port")
        } catch (e: Exception) {
            Log.w(TAG, "✗ Job $jobId → $ip: ${e.message}")
            reportarResultado(jobId, "error", e.message, token)
            // Auto-scan si la impresora no responde
            handler?.post { autoScan(job.optString("impresora_id"), ip, token) }
        }
    }

    // ── Reportar resultado al servidor ───────────────────────────
    private fun reportarResultado(jobId: String, status: String, error: String?, token: String) {
        try {
            val payload = JSONObject().apply {
                put("job_id", jobId)
                put("status", status)
                if (error != null) put("error_msg", error)
            }
            val req = Request.Builder()
                .url("$API/api/print")
                .post(payload.toString().toRequestBody("application/json".toMediaType()))
                .header("x-bridge-token", token)
                .build()
            http.newCall(req).execute()
        } catch (_: Exception) {}
    }

    // ── Auto-scan: busca impresoras en LAN si una falla ──────────
    private fun autoScan(impresoraId: String, ipFallida: String, token: String) {
        if (rol.get() != "master") return
        Log.i(TAG, "Auto-scan: $ipFallida no responde, buscando...")

        val base = ipFallida.substringBeforeLast(".")
        val encontradas = mutableListOf<String>()

        for (i in 1..254) {
            val ip = "$base.$i"
            if (ip == ipFallida) continue
            try {
                Socket().use { s ->
                    s.connect(InetSocketAddress(InetAddress.getByName(ip), 9100), 300)
                    encontradas.add(ip)
                }
            } catch (_: Exception) {}
        }

        if (encontradas.isEmpty()) {
            Log.i(TAG, "Auto-scan: sin impresoras encontradas")
            return
        }

        val nuevaIp = encontradas.first()
        Log.i(TAG, "Auto-scan: encontrada $nuevaIp, actualizando...")

        try {
            val payload = JSONObject().apply {
                put("impresora_id", impresoraId)
                put("new_ip", nuevaIp)
            }
            val req = Request.Builder()
                .url("$API/api/bridge/update-ip")
                .post(payload.toString().toRequestBody("application/json".toMediaType()))
                .header("x-bridge-token", token)
                .build()
            http.newCall(req).execute()
            Log.i(TAG, "IP actualizada: $ipFallida → $nuevaIp")
        } catch (_: Exception) {}
    }

    // ── Detección de red ─────────────────────────────────────────
    private fun estaEnWifi(): Boolean {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val net = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(net) ?: return false
        return caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
               caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
    }

    private fun obtenerIpLan(): String? {
        return try {
            val wm = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            val ip = wm.connectionInfo.ipAddress
            if (ip == 0) null
            else "%d.%d.%d.%d".format(ip and 0xff, ip shr 8 and 0xff, ip shr 16 and 0xff, ip shr 24 and 0xff)
        } catch (_: Exception) { null }
    }

    // ── Notificación foreground ──────────────────────────────────
    private fun crearCanalNotificacion() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(
                CHANNEL_ID, "ia.rest Bridge",
                NotificationManager.IMPORTANCE_LOW
            ).apply { description = "Bridge de impresión en background" }
            (getSystemService(NOTIFICATION_SERVICE) as NotificationManager)
                .createNotificationChannel(ch)
        }
    }

    private fun buildNotification(estado: String): Notification {
        val intent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("ia.rest Bridge")
            .setContentText(estado)
            .setSmallIcon(android.R.drawable.ic_menu_send)
            .setContentIntent(intent)
            .setOngoing(true)
            .setSilent(true)
            .build()
    }

    private fun actualizarNotificacion(estado: String) {
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIF_ID, buildNotification(estado))
    }
}
