package com.iptv.tauri

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.view.KeyEvent
import androidx.activity.enableEdgeToEdge
import org.json.JSONObject

class MainActivity : TauriActivity() {
    companion object {
        // Weak reference to allow access from other activities
        private var _currentInstance: java.lang.ref.WeakReference<MainActivity>? = null
        var currentInstance: MainActivity?
            get() = _currentInstance?.get()
            set(value) {
                _currentInstance = if (value != null) java.lang.ref.WeakReference(value) else null
            }
    }

    private var webView: WebView? = null
    private var keyDownTime = 0L
    private val LONG_PRESS_DELAY = 500L // 500ms for long press
    private val handler = Handler(Looper.getMainLooper())
    private var longPressTriggered = false
    private var longPressEventSent = false

    // Single long press handler that's reused
    private val longPressRunnable = Runnable {
        if (!longPressEventSent) {
            webView?.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('tvlongpress', { bubbles: true, cancelable: true }))",
                null
            )
            longPressTriggered = true
            longPressEventSent = true
        }
    }

    init {
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        currentInstance = this
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        // If NativePlayerActivity is active, let it handle all D-pad keys
        if (NativePlayerActivity.currentInstance != null) {
            when (keyCode) {
                KeyEvent.KEYCODE_DPAD_CENTER,
                KeyEvent.KEYCODE_ENTER,
                KeyEvent.KEYCODE_DPAD_UP,
                KeyEvent.KEYCODE_DPAD_DOWN,
                KeyEvent.KEYCODE_DPAD_LEFT,
                KeyEvent.KEYCODE_DPAD_RIGHT -> {
                    return false
                }
            }
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        // BACK zawsze własny handler
        if (event.action == KeyEvent.ACTION_DOWN &&
            event.keyCode == KeyEvent.KEYCODE_BACK) {

            webView?.evaluateJavascript(
                "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Back', code: 'Back', cancelable: true }))",
                null
            )
            return true
        }

        val isDpadKey = when (event.keyCode) {
            KeyEvent.KEYCODE_DPAD_UP,
            KeyEvent.KEYCODE_DPAD_DOWN,
            KeyEvent.KEYCODE_DPAD_LEFT,
            KeyEvent.KEYCODE_DPAD_RIGHT,
            KeyEvent.KEYCODE_DPAD_CENTER,
            KeyEvent.KEYCODE_ENTER -> true
            else -> false
        }

        if (!isDpadKey) {
            return super.dispatchKeyEvent(event)
        }

        // Always handle D-pad keys - let JS check if input is focused
        handleTvNavigation(event)
        return true
    }

    private fun handleTvNavigation(event: KeyEvent) {
        try {
            if (event.keyCode == KeyEvent.KEYCODE_DPAD_CENTER ||
                event.keyCode == KeyEvent.KEYCODE_ENTER) {

                if (event.action == KeyEvent.ACTION_DOWN) {
                    if (event.repeatCount == 0) {
                        longPressTriggered = false
                        longPressEventSent = false

                        handler.removeCallbacks(longPressRunnable)
                        handler.postDelayed(longPressRunnable, LONG_PRESS_DELAY)
                    }

                    webView?.evaluateJavascript(
                        "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', cancelable: true }))",
                        null
                    )

                } else if (event.action == KeyEvent.ACTION_UP) {
                    handler.removeCallbacks(longPressRunnable)

                    if (!longPressTriggered) {
                        webView?.evaluateJavascript(
                            "window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', cancelable: true }))",
                            null
                        )
                    }
                }

                return
            }

            if (event.action == KeyEvent.ACTION_DOWN) {
                val keyName = when (event.keyCode) {
                    KeyEvent.KEYCODE_DPAD_UP -> "ArrowUp"
                    KeyEvent.KEYCODE_DPAD_DOWN -> "ArrowDown"
                    KeyEvent.KEYCODE_DPAD_LEFT -> "ArrowLeft"
                    KeyEvent.KEYCODE_DPAD_RIGHT -> "ArrowRight"
                    else -> null
                }

                if (keyName != null) {
                    val webView = webView
                    if (webView != null) {
                        webView.evaluateJavascript(
                            "window.dispatchEvent(new KeyboardEvent('keydown', { key: '$keyName', code: '$keyName', cancelable: true }))",
                            null
                        )
                    }
                }
            }
        } catch (e: Exception) {
            android.util.Log.e("MainActivity", "Error in handleTvNavigation", e)
        }
    }

    override fun onResume() {
        super.onResume()
        // Restore focus to WebView when returning from NativePlayerActivity
        webView?.requestFocus()
        window.decorView.requestFocus()
    }

    override fun onWebViewCreate(webView: WebView) {
        super.onWebViewCreate(webView)
        this.webView = webView

        // Configure WebView focus for proper input handling
        webView.isFocusable = true
        webView.isFocusableInTouchMode = true
        webView.descendantFocusability = android.view.ViewGroup.FOCUS_AFTER_DESCENDANTS

        // Request focus for WebView to receive key events
        webView.requestFocus()

        // Configure WebView for 4K TV density scaling
        val metrics = resources.displayMetrics
        val densityDpi = metrics.densityDpi

        // Adjust text zoom based on screen density for 4K TVs
        webView.settings.apply {
            // Enable proper density scaling
            setSupportZoom(true)
            builtInZoomControls = false
            displayZoomControls = false

            // Enable keyboard handling for Android TV
            domStorageEnabled = true
            javaScriptEnabled = true

            // Adjust text scale for high-density displays (4K TVs often report 2x-3x density)
            // Use smaller zoom for 4K to prevent oversized elements
            when {
                densityDpi >= 480 -> { // 4K/XXHDPI
                    textZoom = 80
                }
                densityDpi >= 320 -> { // 2K/XHDPI
                    textZoom = 90
                }
                else -> {
                    textZoom = 100
                }
            }
        }

        // Configure soft input mode for Android TV
        webView.settings.setNeedInitialFocus(true)

        // TV Interface for keyboard and other TV-specific functions
        webView.addJavascriptInterface(object {
            @JavascriptInterface
            fun showKeyboard() {
                runOnUiThread {
                    val imm = getSystemService(android.content.Context.INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager
                    imm.showSoftInput(webView, android.view.inputmethod.InputMethodManager.SHOW_IMPLICIT)
                }
            }

            @JavascriptInterface
            fun hideKeyboard() {
                runOnUiThread {
                    val imm = getSystemService(android.content.Context.INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager
                    imm.hideSoftInputFromWindow(webView.windowToken, 0)
                }
            }
        }, "AndroidTV")

        webView.addJavascriptInterface(object {
            @JavascriptInterface
            fun open_compose_player(paramsJson: String) {
                try {
                    val params = JSONObject(paramsJson)
                    android.util.Log.d("MainActivity", "open_compose_player called with channel: ${params.optString("channelName")}, channelsJson length: ${params.optString("channelsJson").length}")
                    runOnUiThread {
                        try {
                            val intent = android.content.Intent(this@MainActivity, NativePlayerActivity::class.java)
                            intent.putExtra("url", params.optString("url"))
                            intent.putExtra("channelName", params.optString("channelName"))
                            intent.putExtra("channelId", params.optString("channelId"))
                            intent.putExtra("portalUrl", params.optString("portalUrl"))
                            intent.putExtra("mac", params.optString("mac"))
                            intent.putExtra("token", params.optString("token"))
                            intent.putExtra("isVod", params.optBoolean("isVod"))
                            intent.putExtra("episodesJson", params.optString("episodesJson"))
                            intent.putExtra("currentEpisodeIndex", params.optInt("currentEpisodeIndex"))
                            intent.putExtra("autoPlayEpisodes", params.optBoolean("autoPlayEpisodes"))
                            intent.putExtra("channelsJson", params.optString("channelsJson"))
                            intent.putExtra("epgTitle", params.optString("epgTitle"))
                            intent.putExtra("epgStart", params.optString("epgStart"))
                            intent.putExtra("epgEnd", params.optString("epgEnd"))
                            intent.putExtra("epgNextTitle", params.optString("epgNextTitle"))
                            intent.putExtra("epgNextStart", params.optString("epgNextStart"))
                            intent.putExtra("epgNextEnd", params.optString("epgNextEnd"))
                        android.util.Log.d("MainActivity", "Starting NativePlayerActivity")
                        startActivity(intent)
                    } catch (e: Exception) {
                        android.util.Log.e("MainActivity", "Failed to start NativePlayerActivity", e)
                    }
                }
                } catch (e: Exception) {
                    android.util.Log.e("MainActivity", "Failed to parse player params", e)
                }
            }

            @JavascriptInterface
            fun change_channel(url: String, channelName: String) {
                val instance = NativePlayerActivity.currentInstance
                if (instance == null) {
                    runOnUiThread {
                        val intent = android.content.Intent(this@MainActivity, NativePlayerActivity::class.java)
                        intent.putExtra("url", url)
                        intent.putExtra("channelName", channelName)
                        startActivity(intent)
                    }
                } else {
                    runOnUiThread {
                        instance.changeChannel(url, channelName, isVod = false) // Channels are never VOD
                    }
                }
            }
        }, "ExoPlayer")
    }

    // Public methods for channel up/down events (called from NativePlayerActivity)
    fun emitChannelUp() {
        runOnUiThread {
            webView?.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('channelUp'))",
                null
            )
        }
    }

    fun emitChannelDown() {
        runOnUiThread {
            webView?.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('channelDown'))",
                null
            )
        }
    }
}
