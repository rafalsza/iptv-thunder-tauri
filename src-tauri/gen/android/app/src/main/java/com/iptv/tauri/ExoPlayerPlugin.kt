package com.iptv.tauri

import android.app.Activity
import android.net.Uri
import android.view.View
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.TrackGroup
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.Tracks
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.Event
import app.tauri.plugin.Listener

@InvokeArg
class PlayArgs {
    var url: String? = null
    var headers: Map<String, String>? = null
    var resumePosition: Long = 0
}

@InvokeArg
class SeekArgs {
    var position: Long = 0
}

@InvokeArg
class SpeedArgs {
    var speed: Float = 1.0f
}

@InvokeArg
class VolumeArgs {
    var volume: Float = 1.0f
}

@InvokeArg
class TrackArgs {
    var trackId: Int = 0
    var trackType: String? = null
}

@TauriPlugin
class ExoPlayerPlugin(private val activity: Activity) : Plugin(activity) {
    private var player: ExoPlayer? = null
    private var trackSelector: DefaultTrackSelector? = null
    private var listener: Player.Listener? = null
    private var eventListener: Listener? = null

    companion object {
        const val EVENT_PLAYBACK_STATE = "playback_state"
        const val EVENT_TIME_UPDATE = "time_update"
        const val EVENT_ERROR = "error"
        const val EVENT_TRACKS_CHANGED = "tracks_changed"
    }

    @Command
    fun init(invoke: Invoke) {
        activity.runOnUiThread {
            try {
                // Release existing player if any
                player?.release()
                listener?.let { player?.removeListener(it) }

                // Create track selector for Android TV
                trackSelector = DefaultTrackSelector(activity).apply {
                    setParameters(
                        buildUponParameters()
                            .setAllowVideoMixedMimeTypeAdaptiveness(true)
                            .setAllowAudioMixedMimeTypeAdaptiveness(true)
                            .build()
                    )
                }

                // Create ExoPlayer
                player = ExoPlayer.Builder(activity)
                    .setTrackSelector(trackSelector!!)
                    .build()

                // Set up player listener
                listener = object : Player.Listener {
                    override fun onPlaybackStateChanged(playbackState: Int) {
                        val state = when (playbackState) {
                            Player.STATE_IDLE -> "idle"
                            Player.STATE_BUFFERING -> "buffering"
                            Player.STATE_READY -> "ready"
                            Player.STATE_ENDED -> "ended"
                            else -> "unknown"
                        }
                        emitEvent(EVENT_PLAYBACK_STATE, state)
                    }

                    override fun onIsPlayingChanged(isPlaying: Boolean) {
                        val payload = JSObject()
                        payload.put("isPlaying", isPlaying)
                        emitEvent(EVENT_PLAYBACK_STATE, if (isPlaying) "playing" else "paused")
                    }

                    override fun onPlaybackError(error: PlaybackException) {
                        val payload = JSObject()
                        payload.put("errorCode", error.errorCode)
                        payload.put("errorMessage", error.message ?: "Unknown error")
                        emitEvent(EVENT_ERROR, payload)
                    }

                    override fun onTracksChanged(tracks: Tracks) {
                        val trackList = JSArray()
                        tracks.groups.forEach { group ->
                            group.mediaTrackGroup.forEachIndexed { index, _ ->
                                val track = JSObject()
                                track.put("id", group.id)
                                track.put("type", getTrackTypeString(group.type))
                                track.put("selectedIndex", if (group.isSelected) index else -1)
                                track.put("language", group.getTrackFormat(index)?.language ?: "")
                                track.put("label", group.getTrackFormat(index)?.label ?: "")
                                trackList.put(track)
                            }
                        }
                        emitEvent(EVENT_TRACKS_CHANGED, trackList)
                    }
                }

                player?.addListener(listener!!)

                val result = JSObject()
                result.put("success", true)
                invoke.resolve(result)
            } catch (e: Exception) {
                invoke.reject("Failed to initialize ExoPlayer: ${e.message}")
            }
        }
    }

    @Command
    fun play(invoke: Invoke) {
        val args = invoke.parseArgs(PlayArgs::class.java)
        val url = args.url ?: return invoke.reject("URL is required")

        activity.runOnUiThread {
            try {
                if (player == null) {
                    invoke.reject("ExoPlayer not initialized. Call init first.")
                    return@runOnUiThread
                }

                val mediaItemBuilder = MediaItem.Builder()
                    .setUri(Uri.parse(url))

                // Add metadata for IPTV
                val metadataBuilder = MediaMetadata.Builder()
                mediaItemBuilder.setMetadata(metadataBuilder.build())

                val mediaItem = mediaItemBuilder.build()
                player?.setMediaItem(mediaItem)
                player?.prepare()

                // Seek to resume position if provided
                if (args.resumePosition > 0) {
                    player?.seekTo(args.resumePosition)
                }

                player?.play()

                val result = JSObject()
                result.put("success", true)
                result.put("url", url)
                invoke.resolve(result)
            } catch (e: Exception) {
                invoke.reject("Failed to play: ${e.message}")
            }
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
    fun setVolume(invoke: Invoke) {
        val args = invoke.parseArgs(VolumeArgs::class.java)
        activity.runOnUiThread {
            player?.volume = args.volume
            val result = JSObject()
            result.put("success", true)
            result.put("volume", args.volume)
            invoke.resolve(result)
        }
    }

    @Command
    fun setTrack(invoke: Invoke) {
        val args = invoke.parseArgs(TrackArgs::class.java)
        activity.runOnUiThread {
            try {
                trackSelector?.let { selector ->
                    val parameters = selector.parameters
                    val trackType = when (args.trackType) {
                        "audio" -> C.TRACK_TYPE_AUDIO
                        "video" -> C.TRACK_TYPE_VIDEO
                        "text" -> C.TRACK_TYPE_TEXT
                        else -> return@runOnUiThread invoke.reject("Invalid track type")
                    }

                    // Build new track selection
                    val builder = parameters.buildUpon()
                    if (args.trackId >= 0) {
                        val trackGroup = TrackGroup()
                        val override = TrackSelectionOverride(trackGroup, args.trackId)
                        builder.setOverrideForType(trackType, override)
                    } else {
                        builder.clearOverridesOfType(trackType)
                    }

                    selector.parameters = builder.build()

                    val result = JSObject()
                    result.put("success", true)
                    invoke.resolve(result)
                } ?: invoke.reject("Track selector not initialized")
            } catch (e: Exception) {
                invoke.reject("Failed to set track: ${e.message}")
            }
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
            result.put("bufferedPosition", player?.bufferedPosition ?: 0)
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

    @Command
    fun getTracks(invoke: Invoke) {
        activity.runOnUiThread {
            val tracks = player?.currentTracks
            val trackList = JSArray()

            tracks?.groups?.forEach { group ->
                val track = JSObject()
                track.put("id", group.id)
                track.put("type", getTrackTypeString(group.type))
                track.put("selected", group.isSelected)
                track.put("trackCount", group.length)

                // Add track details
                val trackArray = JSArray()
                group.mediaTrackGroup.forEachIndexed { index, _ ->
                    val format = group.getTrackFormat(index)
                    val trackInfo = JSObject()
                    trackInfo.put("index", index)
                    trackInfo.put("language", format?.language ?: "")
                    trackInfo.put("label", format?.label ?: "")
                    trackInfo.put("bitrate", format?.bitrate ?: 0)
                    trackArray.put(trackInfo)
                }
                track.put("tracks", trackArray)

                trackList.put(track)
            }

            val result = JSObject()
            result.put("tracks", trackList)
            invoke.resolve(result)
        }
    }

    private fun getTrackTypeString(@C.TrackType type: Int): String {
        return when (type) {
            C.TRACK_TYPE_AUDIO -> "audio"
            C.TRACK_TYPE_VIDEO -> "video"
            C.TRACK_TYPE_TEXT -> "text"
            C.TRACK_TYPE_IMAGE -> "image"
            C.TRACK_TYPE_METADATA -> "metadata"
            C.TRACK_TYPE_CAMERA_MOTION -> "camera_motion"
            C.TRACK_TYPE_NONE -> "none"
            C.TRACK_TYPE_UNKNOWN -> "unknown"
            else -> "unknown"
        }
    }

    private fun emitEvent(event: String, data: Any) {
        val payload = when (data) {
            is String -> {
                val obj = JSObject()
                obj.put("data", data)
                obj
            }
            is JSObject -> data
            is JSArray -> {
                val obj = JSObject()
                obj.put("data", data)
                obj
            }
            else -> {
                val obj = JSObject()
                obj.put("data", data.toString())
                obj
            }
        }
        eventListener?.emit(event, payload)
    }

    override fun onDestroy() {
        super.onDestroy()
        listener?.let { player?.removeListener(it) }
        player?.release()
        player = null
        trackSelector = null
        listener = null
    }
}
