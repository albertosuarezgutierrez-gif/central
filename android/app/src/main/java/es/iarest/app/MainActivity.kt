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

    private val CURRENT_VERSION = 4
    private val VERSION_URL = "https://www.iarest.es/app/version.json"
    private val APP_HOST = "iarest.es"

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

        // ── WebViewClient: toda la navegación interna, sin saltar a Chrome ──
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val url = request?.url?.toString() ?: return false
                return when {
                    // URLs de ia.rest → dentro del WebView
                    url.contains(APP_HOST) -> false
                    url.contains("ia-rest.vercel.app") -> false
                    // Supabase (auth, realtime) → dentro del WebView
                    url.contains("supabase.co") -> false
                    // GitHub solo para descarga del APK → Chrome
                    url.contains("github.com") -> {
                        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                        true
                    }
                    // Cualquier otra URL externa → Chrome
                    else -> {
                        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                        true
                    }
                }
            }
        }

        // ── WebChromeClient: permisos micro ────────────────────────────────
        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread { request.grant(request.resources) }
            }
        }

        webView.loadUrl("https://www.iarest.es/login")

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.RECORD_AUDIO), 1)
        }

        setupMediaSession()
        checkForUpdate()
    }

    // ── Auto-update ───────────────────────────────────────────────
    private fun checkForUpdate() {
        Thread {
            try {
                val json = URL(VERSION_URL).readText()
                val obj = JSONObject(json)
                val latestVersion = obj.getInt("version")
                val downloadUrl = obj.getString("url")
                val notes = obj.optString("notes", "")
                if (latestVersion > CURRENT_VERSION) {
                    runOnUiThread { showUpdateDialog(latestVersion, downloadUrl, notes) }
                }
            } catch (_: Exception) {}
        }.start()
    }

    private fun showUpdateDialog(newVersion: Int, url: String, notes: String) {
        val msg = buildString {
            append("Versión $newVersion disponible.")
            if (notes.isNotEmpty()) append("\n\n$notes")
            append("\n\n¿Actualizar ahora?")
        }
        AlertDialog.Builder(this)
            .setTitle("🔄 Nueva versión de ia.rest")
            .setMessage(msg)
            .setPositiveButton("Actualizar") { _, _ ->
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
            }
            .setNegativeButton("Ahora no", null)
            .show()
    }

    // ── MediaSession PTT ──────────────────────────────────────────
    private fun setupMediaSession() {
        mediaSession = MediaSessionCompat(this, "IaRest")
        val stateBuilder = PlaybackStateCompat.Builder()
            .setActions(PlaybackStateCompat.ACTION_PLAY_PAUSE or PlaybackStateCompat.ACTION_PLAY or PlaybackStateCompat.ACTION_PAUSE)
            .setState(PlaybackStateCompat.STATE_PLAYING, 0, 1f)
        mediaSession.setPlaybackState(stateBuilder.build())

        mediaSession.setCallback(object : MediaSessionCompat.Callback() {
            override fun onMediaButtonEvent(mediaButtonEvent: Intent): Boolean {
                val keyEvent = mediaButtonEvent.getParcelableExtra<KeyEvent>(Intent.EXTRA_KEY_EVENT) ?: return false
                val isHeadsetBtn = keyEvent.keyCode == KeyEvent.KEYCODE_HEADSETHOOK || keyEvent.keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
                if (isHeadsetBtn) {
                    when (keyEvent.action) {
                        KeyEvent.ACTION_DOWN -> webView.post { webView.evaluateJavascript("window.startPTT && window.startPTT()", null) }
                        KeyEvent.ACTION_UP   -> webView.post { webView.evaluateJavascript("window.stopPTT && window.stopPTT()", null) }
                    }
                    return true
                }
                return super.onMediaButtonEvent(mediaButtonEvent)
            }
        })
        mediaSession.isActive = true
        val audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        @Suppress("DEPRECATION")
        audioManager.requestAudioFocus(null, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN)
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
