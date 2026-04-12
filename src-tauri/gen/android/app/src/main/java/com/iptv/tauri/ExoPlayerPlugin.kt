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
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.exoplayer.source.MediaSource
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray

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
    private var timeUpdateJob: java.util.Timer? = null

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
                        if (isPlaying) {
                            startTimeUpdates()
                        } else {
                            stopTimeUpdates()
                        }
                    }

                    override fun onPlayerError(error: PlaybackException) {
                        val payload = JSObject()
                        payload.put("errorCode", error.errorCode)
                        payload.put("errorMessage", error.message ?: "Unknown error")
                        emitEvent(EVENT_ERROR, payload)
                    }

                    override fun onTracksChanged(tracks: Tracks) {
                        val trackList = JSArray()
                        tracks.groups.forEach { group ->
                            for (i in 0 until group.mediaTrackGroup.length) {
                                val track = JSObject()
                                track.put("id", i)
                                track.put("type", getTrackTypeString(group.type))
                                track.put("selected", group.isTrackSelected(i))
                                track.put("language", group.getTrackFormat(i)?.language ?: "")
                                track.put("label", group.getTrackFormat(i)?.label ?: "")
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

                // Create data source factory with headers for Stalker portals
                val dataSourceFactory = DefaultHttpDataSource.Factory()
                    .setDefaultRequestProperties(args.headers ?: emptyMap())

                val mediaItem = MediaItem.Builder()
                    .setUri(Uri.parse(url))
                    .build()

                // Use appropriate media source based on URL
                val mediaSource: MediaSource = when {
                    url.contains(".m3u8") -> {
                        HlsMediaSource.Factory(dataSourceFactory).createMediaSource(mediaItem)
                    }
                    else -> {
                        ProgressiveMediaSource.Factory(dataSourceFactory).createMediaSource(mediaItem)
                    }
                }

                player?.setMediaSource(mediaSource)
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
                        // Use trackId as group index to support multiple groups of same type
                        val trackGroups = player?.currentTracks?.groups ?: emptyList()
                        val filteredGroups = trackGroups.filter { it.type == trackType }
                        if (args.trackId < filteredGroups.size) {
                            val targetGroup = filteredGroups[args.trackId]
                            val override = TrackSelectionOverride(targetGroup.mediaTrackGroup, 0)
                            builder.setOverrideForType(override)
                        }
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
            val duration = player?.duration?.takeIf { it != C.TIME_UNSET } ?: 0
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
                track.put("id", 0)
                track.put("type", getTrackTypeString(group.type))
                track.put("selected", group.isSelected)
                track.put("trackCount", group.length)

                // Add track details
                val trackArray = JSArray()
                for (i in 0 until group.mediaTrackGroup.length) {
                    val format = group.getTrackFormat(i)
                    val trackInfo = JSObject()
                    trackInfo.put("index", i)
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

    private fun getTrackTypeString(type: Int): String {
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
        activity.runOnUiThread {
            try {
                when (data) {
                    is JSObject -> trigger(event, data)
                    is JSArray -> {
                        val wrapper = JSObject()
                        wrapper.put("data", data)
                        trigger(event, wrapper)
                    }
                    is String -> {
                        val payload = JSObject()
                        payload.put("state", data)
                        trigger(event, payload)
                    }
                    else -> {
                        val payload = JSObject()
                        payload.put("value", data.toString())
                        trigger(event, payload)
                    }
                }
            } catch (e: Exception) {
                // Ignore emit errors — player may be destroyed
            }
        }
    }

    private fun startTimeUpdates() {
        timeUpdateJob?.cancel()
        timeUpdateJob = java.util.Timer()
        timeUpdateJob?.scheduleAtFixedRate(object : java.util.TimerTask() {
            override fun run() {
                val p = player ?: return
                if (p.isPlaying) {
                    val payload = JSObject()
                    payload.put("position", p.currentPosition)
                    payload.put("duration", p.duration)
                    payload.put("bufferedPosition", p.bufferedPosition)
                    emitEvent(EVENT_TIME_UPDATE, payload)
                }
            }
        }, 0, 1000) // co 1 sekundę
    }

    private fun stopTimeUpdates() {
        timeUpdateJob?.cancel()
        timeUpdateJob = null
    }

    override fun onDestroy() {
        super.onDestroy()
        stopTimeUpdates()
        listener?.let { player?.removeListener(it) }
        player?.release()
        player = null
        trackSelector = null
        listener = null
    }
}
