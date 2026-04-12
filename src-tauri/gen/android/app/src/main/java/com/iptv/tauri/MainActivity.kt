package com.iptv.tauri

import android.os.Build
import android.os.Bundle
import android.view.KeyEvent
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // enableEdgeToEdge() requires API 29+
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      enableEdgeToEdge()
    }
    super.onCreate(savedInstanceState)
  }

  @Suppress("WhenBranchOnly")
  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    when (event.keyCode) {
      KeyEvent.KEYCODE_DPAD_RIGHT,
      KeyEvent.KEYCODE_DPAD_LEFT,
      KeyEvent.KEYCODE_DPAD_UP,
      KeyEvent.KEYCODE_DPAD_DOWN,
      KeyEvent.KEYCODE_DPAD_CENTER,
      KeyEvent.KEYCODE_ENTER,
      KeyEvent.KEYCODE_MEDIA_PLAY,
      KeyEvent.KEYCODE_MEDIA_PAUSE,
      KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> {
        // Let WebView handle the key for navigation
        // Only consume it if WebView handled it
        return super.dispatchKeyEvent(event)
      }
      KeyEvent.KEYCODE_BACK -> {
        // Handle back button normally
        return super.dispatchKeyEvent(event)
      }
      else -> {
        // Let other keys pass through
        return super.dispatchKeyEvent(event)
      }
    }
  }
}
