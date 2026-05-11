package es.iarest.app

import android.Manifest
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
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
    private lateinit var audioManager: AudioManager
    private var pttActive = false
    private val mainHandler = Handler(Looper.getMainLooper())

    private val CURRENT_VERSION = 10
    private val VERSION_URL = "https://www.iarest.es/app/version.json"

    private val REQUIRED_PERMISSIONS = buildList {
        add(Manifest.permission.RECORD_AUDIO)
        add(Manifest.permission.CAMERA)
        add(Manifest.permission.VIBRATE)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            add(Manifest.permission.POST_NOTIFICATIONS)
            add(Manifest.permission.READ_MEDIA_IMAGES)
        } else {
            add(Manifest.permission.READ_EXTERNAL_STORAGE)
        }
    }.toTypedArray()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager

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

        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                webView.evaluateJavascript("window.isNativeApp = true;", null)
                // Re-solicitar foco de audio en cada carga de página
                requestAudioFocusAndSession()
            }
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

        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread { request.grant(request.resources) }
            }
        }

        webView.loadUrl("https://www.iarest.es/login")

        webView.isFocusable = true
        webView.isFocusableInTouchMode = true
        webView.requestFocus()

        requestAllPermissions()
        setupMediaSession()
        checkForUpdate()
    }

    // ── Foco de audio — se llama al iniciar Y después de cada grabación ──
    @Suppress("DEPRECATION")
    private fun requestAudioFocusAndSession() {
        audioManager.requestAudioFocus(
            { focusChange ->
                // Si perdemos el foco y luego lo recuperamos, re-activamos la sesión
                if (focusChange == AudioManager.AUDIOFOCUS_GAIN) {
                    mediaSession.isActive = true
                    pttActive = false // reset por si quedó pillado
                }
            },
            AudioManager.STREAM_MUSIC,
            AudioManager.AUDIOFOCUS_GAIN
        )
        mediaSession.isActive = true
    }

    private fun requestAllPermissions() {
        val missing = REQUIRED_PERMISSIONS.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }.toTypedArray()
        if (missing.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, missing, 10)
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 10) webView.reload()
    }

    // ── PTT via dispatchKeyEvent — intercepta ANTES que cualquier asistente ──
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val isHeadset = event.keyCode == KeyEvent.KEYCODE_HEADSETHOOK ||
                        event.keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
        if (isHeadset) {
            when (event.action) {
                KeyEvent.ACTION_DOWN -> {
                    if (!pttActive) {
                        pttActive = true
                        webView.post { webView.evaluateJavascript("window.resetPTT&&window.resetPTT();setTimeout(()=>{window.startPTT&&window.startPTT()},50)", null) }
                    }
                    return true
                }
                KeyEvent.ACTION_UP -> {
                    pttActive = false
                    webView.post { webView.evaluateJavascript("window.stopPTT&&window.stopPTT()", null) }
                    // Re-solicitar foco tras cada grabación para no perderlo
                    mainHandler.postDelayed({ requestAudioFocusAndSession() }, 500)
                    return true
                }
            }
        }
        return super.dispatchKeyEvent(event)
    }

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
                        KeyEvent.ACTION_DOWN -> if (!pttActive) { pttActive = true; webView.post { webView.evaluateJavascript("window.resetPTT&&window.resetPTT();setTimeout(()=>{window.startPTT&&window.startPTT()},50)", null) } }
                        KeyEvent.ACTION_UP   -> { pttActive = false; webView.post { webView.evaluateJavascript("window.stopPTT&&window.stopPTT()", null) }; mainHandler.postDelayed({ requestAudioFocusAndSession() }, 500) }
                    }
                    return true
                }
                return super.onMediaButtonEvent(e)
            }
        })
        requestAudioFocusAndSession()
    }

    override fun onResume() {
        super.onResume()
        // Re-solicitar foco cuando la app vuelve al primer plano
        requestAudioFocusAndSession()
        webView.requestFocus()
    }

    override fun onDestroy() {
        super.onDestroy()
        mediaSession.isActive = false
        mediaSession.release()
    }

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
            .setPositiveButton("Actualizar") { _, _ -> startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
            .setNegativeButton("Ahora no", null)
            .show()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack()
    }
}
