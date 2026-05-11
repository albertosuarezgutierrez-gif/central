package es.iarest.app

import android.Manifest
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioManager
import android.net.Uri
import android.os.Bundle
import android.view.KeyEvent
import android.view.WindowManager
import android.webkit.*
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import org.json.JSONObject
import java.net.URL

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var mediaSession: MediaSessionCompat
    private var pttActive = false

    private val CURRENT_VERSION = 6
    private val VERSION_URL = "https://www.iarest.es/app/version.json"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        webView = WebView(this)
        setContentView(webView)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccessFromFileURLs = true
            allowUniversalAccessFromFileURLs = true
            cacheMode = WebSettings.LOAD_DEFAULT
            setSupportMultipleWindows(false)
        }

        // Toda navegación interna — no salta a Chrome
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val url = request?.url?.toString() ?: return false
                return when {
                    url.contains("iarest.es") -> false
                    url.contains("ia-rest.vercel.app") -> false
                    url.contains("supabase.co") -> false
                    else -> { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))); true }
                }
            }
        }

        // Permisos de micrófono al WebView
        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread { request.grant(request.resources) }
            }
        }

        webView.loadUrl("https://www.iarest.es/login")

        // ── CRÍTICO: dar foco al WebView para que los toques respondan ──
        webView.isFocusable = true
        webView.isFocusableInTouchMode = true
        webView.requestFocus()

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.RECORD_AUDIO), 1)
        }

        setupMediaSession()
        checkForUpdate()
    }

    // Recarga WebView cuando Android concede el permiso de micro
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 1 && grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            webView.reload()
        }
    }

    // ── PTT via teclado hardware (DOBLE cobertura: Activity + MediaSession) ──
    // Este método intercepta el botón del auricular A NIVEL DE ACTIVITY,
    // antes de que llegue a cualquier otro handler del sistema.
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val isHeadset = event.keyCode == KeyEvent.KEYCODE_HEADSETHOOK ||
                        event.keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE

        if (isHeadset) {
            when (event.action) {
                KeyEvent.ACTION_DOWN -> {
                    if (!pttActive) {
                        pttActive = true
                        webView.post { webView.evaluateJavascript("window.startPTT&&window.startPTT()", null) }
                    }
                    return true // consumido
                }
                KeyEvent.ACTION_UP -> {
                    pttActive = false
                    webView.post { webView.evaluateJavascript("window.stopPTT&&window.stopPTT()", null) }
                    return true // consumido
                }
            }
        }
        return super.dispatchKeyEvent(event)
    }

    // ── Auto-update ───────────────────────────────────────────────
    private fun checkForUpdate() {
        Thread {
            try {
                val json = URL(VERSION_URL).readText()
                val obj = JSONObject(json)
                val latest = obj.getInt("version")
                val url = obj.getString("url")
                val notes = obj.optString("notes", "")
                if (latest > CURRENT_VERSION) {
                    runOnUiThread { showUpdateDialog(latest, url, notes) }
                }
            } catch (_: Exception) {}
        }.start()
    }

    private fun showUpdateDialog(v: Int, url: String, notes: String) {
        AlertDialog.Builder(this)
            .setTitle("🔄 Nueva versión de ia.rest")
            .setMessage(buildString {
                append("Versión $v disponible.")
                if (notes.isNotEmpty()) append("\n\n$notes")
                append("\n\n¿Actualizar ahora?")
            })
            .setPositiveButton("Actualizar") { _, _ ->
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
            }
            .setNegativeButton("Ahora no", null)
            .show()
    }

    // ── MediaSession (segunda línea de defensa para el PTT) ────────
    private fun setupMediaSession() {
        mediaSession = MediaSessionCompat(this, "IaRest")
        mediaSession.setPlaybackState(PlaybackStateCompat.Builder()
            .setActions(PlaybackStateCompat.ACTION_PLAY_PAUSE or PlaybackStateCompat.ACTION_PLAY or PlaybackStateCompat.ACTION_PAUSE)
            .setState(PlaybackStateCompat.STATE_PLAYING, 0, 1f)
            .build())
        mediaSession.setCallback(object : MediaSessionCompat.Callback() {
            override fun onMediaButtonEvent(e: Intent): Boolean {
                val k = e.getParcelableExtra<KeyEvent>(Intent.EXTRA_KEY_EVENT) ?: return false
                if (k.keyCode == KeyEvent.KEYCODE_HEADSETHOOK || k.keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE) {
                    when (k.action) {
                        KeyEvent.ACTION_DOWN -> { pttActive = true; webView.post { webView.evaluateJavascript("window.startPTT&&window.startPTT()", null) } }
                        KeyEvent.ACTION_UP   -> { pttActive = false; webView.post { webView.evaluateJavascript("window.stopPTT&&window.stopPTT()", null) } }
                    }
                    return true
                }
                return super.onMediaButtonEvent(e)
            }
        })
        mediaSession.isActive = true
        @Suppress("DEPRECATION")
        (getSystemService(Context.AUDIO_SERVICE) as AudioManager)
            .requestAudioFocus(null, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN)
    }

    override fun onDestroy() {
        super.onDestroy()
        mediaSession.isActive = false
        mediaSession.release()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack()
    }
}
