package com.iptv.tauri

import android.app.Activity
import android.net.Uri
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import app.tauri.plugin.Invoke

@InvokeArg
class PlayArgs {
    var url: String? = null
    var headers: Map<String, String>? = null
}

@InvokeArg
class SeekArgs {
    var position: Long = 0
}

@InvokeArg
class SpeedArgs {
    var speed: Float = 1.0f
}

@TauriPlugin
class ExoPlayerPlugin(private val activity: Activity) : Plugin(activity) {
    private var player: ExoPlayer? = null
    private var playerView: PlayerView? = null

    @Command
    fun play(invoke: Invoke) {
        val args = invoke.parseArgs(PlayArgs::class.java)
        val url = args.url ?: return invoke.reject("URL is required")

        activity.runOnUiThread {
            if (player == null) {
                player = ExoPlayer.Builder(activity).build()
            }

            val mediaItem = MediaItem.fromUri(Uri.parse(url))
            player?.setMediaItem(mediaItem)
            player?.prepare()
            player?.play()

            val result = JSObject()
            result.put("success", true)
            result.put("url", url)
            invoke.resolve(result)
        }
    }

    @Command
    fun pause(invoke: Invoke) {
        activity.runOnUiThread {
            player?.pause()
            val result = JSObject()
            result.put("success", true)
            result.put("isPlaying", false)
            invoke.resolve(result)
        }
    }

    @Command
    fun resume(invoke: Invoke) {
        activity.runOnUiThread {
            player?.play()
            val result = JSObject()
            result.put("success", true)
            result.put("isPlaying", true)
            invoke.resolve(result)
        }
    }

    @Command
    fun stop(invoke: Invoke) {
        activity.runOnUiThread {
            player?.stop()
            player?.clearMediaItems()
            val result = JSObject()
            result.put("success", true)
            invoke.resolve(result)
        }
    }

    @Command
    fun seek(invoke: Invoke) {
        val args = invoke.parseArgs(SeekArgs::class.java)
        activity.runOnUiThread {
            player?.seekTo(args.position)
            val result = JSObject()
            result.put("success", true)
            result.put("position", args.position)
            invoke.resolve(result)
        }
    }

    @Command
    fun setSpeed(invoke: Invoke) {
        val args = invoke.parseArgs(SpeedArgs::class.java)
        activity.runOnUiThread {
            player?.playbackParameters = PlaybackParameters(args.speed)
            val result = JSObject()
            result.put("success", true)
            result.put("speed", args.speed)
            invoke.resolve(result)
        }
    }

    @Command
    fun getPosition(invoke: Invoke) {
        activity.runOnUiThread {
            val position = player?.currentPosition ?: 0
            val duration = player?.duration ?: 0
            val result = JSObject()
            result.put("position", position)
            result.put("duration", duration)
            result.put("isPlaying", player?.isPlaying ?: false)
            invoke.resolve(result)
        }
    }

    @Command
    fun isPlaying(invoke: Invoke) {
        activity.runOnUiThread {
            val result = JSObject()
            result.put("isPlaying", player?.isPlaying ?: false)
            invoke.resolve(result)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        player?.release()
        player = null
    }
}
