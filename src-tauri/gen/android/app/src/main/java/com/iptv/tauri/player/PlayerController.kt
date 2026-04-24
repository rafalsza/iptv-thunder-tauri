package com.iptv.tauri.player

import android.content.Context
import android.view.View
import android.widget.ProgressBar
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.lifecycleScope
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class PlayerController(
    private val context: Context,
    private val lifecycleOwner: LifecycleOwner,
    private val progressBar: ProgressBar?,
    private val onStateChange: (PlayerState) -> Unit,
    private val onError: (error: androidx.media3.common.PlaybackException, retryCount: Int, maxRetries: Int) -> Unit,
    private val onRetry: () -> Unit,
    private val onUiStateChange: (PlayerUiState) -> Unit = {},
    private val initialChannelName: String = ""
) {
    companion object {
        private const val MAX_RETRIES = 5
        private val RETRY_DELAYS_MS = longArrayOf(1000, 2000, 5000, 10000)
    }

    init {
        // Constructor
    }

    var player: ExoPlayer? = null
        private set

    private var retryCount = 0
    private var retryJob: Job? = null
    var wasPlayingBeforeStop = false
    private var updateJob: Job? = null
    private var currentUiState = PlayerUiState(channelName = initialChannelName)

    sealed class PlayerState {
        data object Loading : PlayerState()
        data object Live : PlayerState()
        data object Playing : PlayerState()
        data object Ended : PlayerState()
        data class Error(val message: String) : PlayerState()
        data class Reconnecting(val seconds: Long) : PlayerState()
    }

    data class PlayerUiState(
        val isPlaying: Boolean = false,
        val isLive: Boolean = false,
        val stateLabel: String = "",
        val channelName: String = "",
        val currentProgress: Float = 0f,
        val currentPosition: Long = 0L,
        val duration: Long = 0L,
        val isVod: Boolean = false
    )

    fun initialize(url: String, isVod: Boolean = false) {
        val loadControl = DefaultLoadControl.Builder()
            .setBufferDurationsMs(
                5000,  // minBufferMs: 5s for faster start
                30000, // maxBufferMs: 30s for IPTV stability
                2500,  // bufferForPlaybackMs: 2.5s before playing
                5000   // bufferForPlaybackAfterRebufferMs: 5s after rebuffer
            )
            .setPrioritizeTimeOverSizeThresholds(true)
            .build()

        // Configure data source with longer timeouts for IPTV
        val httpDataSourceFactory = DefaultHttpDataSource.Factory()
            .setConnectTimeoutMs(20000)  // 20s connection timeout
            .setReadTimeoutMs(20000)     // 20s read timeout

        // Detect HLS streams - check for m3u8 in URL or query parameters
        val isHls = url.contains(".m3u8", ignoreCase = true) ||
                    url.contains("hls", ignoreCase = true)

        // Use HlsMediaSource for HLS streams
        val mediaSource = if (isHls) {
            HlsMediaSource.Factory(httpDataSourceFactory)
                .setAllowChunklessPreparation(true)
                .createMediaSource(MediaItem.fromUri(url))
        } else {
            DefaultMediaSourceFactory(httpDataSourceFactory)
                .createMediaSource(MediaItem.fromUri(url))
        }

        player = ExoPlayer.Builder(context)
            .setLoadControl(loadControl)
            .setSeekBackIncrementMs(10000)
            .setSeekForwardIncrementMs(10000)
            .build().apply {
                setMediaSource(mediaSource)
                playWhenReady = true
                prepare()
            }

        // Update initial UI state with isVod
        currentUiState = currentUiState.copy(isVod = isVod)
        onUiStateChange(currentUiState)

        setupListeners()
    }

    private fun setupListeners() {
        player?.addListener(object : Player.Listener {
            override fun onIsPlayingChanged(playing: Boolean) {
                progressBar?.visibility = if (playing) View.GONE else View.VISIBLE

                if (playing) {
                    startPeriodicUpdate()
                } else {
                    stopPeriodicUpdate()
                }
            }

            override fun onPlaybackStateChanged(state: Int) {
                when (state) {
                    Player.STATE_IDLE, Player.STATE_BUFFERING -> {
                        progressBar?.visibility = View.VISIBLE
                        onStateChange(PlayerState.Loading)
                        currentUiState = currentUiState.copy(stateLabel = "Loading...")
                        onUiStateChange(currentUiState)
                    }
                    Player.STATE_READY -> {
                        progressBar?.visibility = View.GONE
                        val isLive = player?.isCurrentMediaItemLive == true
                        onStateChange(if (isLive) PlayerState.Live else PlayerState.Playing)
                        retryCount = 0

                        // Update UI state immediately
                        currentUiState = currentUiState.copy(
                            stateLabel = if (isLive) "Live" else "Playing"
                        )
                        updateUiState()

                        // Start periodic update for VOD
                        if (!isLive) {
                            startPeriodicUpdate()
                        }
                    }
                    Player.STATE_ENDED -> {
                        progressBar?.visibility = View.GONE
                        onStateChange(PlayerState.Ended)
                        stopPeriodicUpdate()
                    }
                }
            }

            override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                handleError(error)
            }
        })
    }

    private fun startPeriodicUpdate() {
        stopPeriodicUpdate()
        updateJob = lifecycleOwner.lifecycleScope.launch {
            while (true) {
                delay(1000) // Update every second
                updateUiState()
            }
        }
    }

    private fun updateUiState() {
        val duration = player?.duration ?: 0L
        val position = player?.currentPosition ?: 0L
        val progress = if (duration > 0) (position.toFloat() / duration) * 100 else 0f
        val isLive = player?.isCurrentMediaItemLive == true
        val isPlaying = player?.isPlaying == true

        currentUiState = currentUiState.copy(
            isPlaying = isPlaying,
            isLive = isLive,
            currentProgress = progress,
            currentPosition = position,
            duration = duration
        )

        onUiStateChange(currentUiState)
    }

    private fun stopPeriodicUpdate() {
        updateJob?.cancel()
        updateJob = null
    }

    private fun handleError(error: androidx.media3.common.PlaybackException) {
        android.util.Log.e("PlayerController", "Player error: ${error.errorCode}, retry: $retryCount/$MAX_RETRIES", error)

        if (retryCount < MAX_RETRIES) {
            retryCount++
            val delayMs = RETRY_DELAYS_MS.getOrElse(retryCount - 1) { 10000L }
            onStateChange(PlayerState.Reconnecting(delayMs / 1000))
            progressBar?.visibility = View.VISIBLE
            currentUiState = currentUiState.copy(stateLabel = "Reconnecting in ${delayMs / 1000}s...")
            onUiStateChange(currentUiState)
            onError(error, retryCount, MAX_RETRIES)

            retryJob = lifecycleOwner.lifecycleScope.launch {
                delay(delayMs)
                android.util.Log.d("PlayerController", "Retrying playback (attempt $retryCount)")
                onRetry()
            }
        } else {
            onStateChange(PlayerState.Error("No signal"))
            progressBar?.visibility = View.GONE
            currentUiState = currentUiState.copy(stateLabel = "No signal")
            onUiStateChange(currentUiState)
            android.util.Log.e("PlayerController", "Max retries reached, giving up")
        }
    }

    fun retry() {
        player?.prepare()
        player?.play()
    }

    fun changeChannel(url: String, channelName: String = "", isVod: Boolean = false) {
        android.util.Log.d("PlayerController", "Changing channel to: $channelName, URL: $url, isVod: $isVod")
        retryCount = 0
        player?.stop()

        // Create appropriate media source for the URL
        val httpDataSourceFactory = DefaultHttpDataSource.Factory()
            .setConnectTimeoutMs(20000)
            .setReadTimeoutMs(20000)

        // Detect HLS streams
        val isHls = url.contains(".m3u8", ignoreCase = true) ||
                    url.contains("hls", ignoreCase = true)

        val mediaSource = if (isHls) {
            HlsMediaSource.Factory(httpDataSourceFactory)
                .setAllowChunklessPreparation(true)
                .createMediaSource(MediaItem.fromUri(url))
        } else {
            DefaultMediaSourceFactory(httpDataSourceFactory)
                .createMediaSource(MediaItem.fromUri(url))
        }

        player?.setMediaSource(mediaSource)
        player?.playWhenReady = true
        player?.prepare()

        currentUiState = currentUiState.copy(
            channelName = channelName,
            isVod = isVod,
            stateLabel = ""
        )
        onUiStateChange(currentUiState)
    }

    fun pause() {
        wasPlayingBeforeStop = player?.isPlaying == true
        player?.pause()
    }

    fun resume() {
        if (wasPlayingBeforeStop) {
            player?.play()
        }
    }

    fun togglePlayPause() {
        player?.let {
            if (it.isPlaying) {
                it.pause()
                wasPlayingBeforeStop = false
            } else {
                it.play()
                wasPlayingBeforeStop = true
            }
        }
    }

    fun mute() {
        player?.mute()
    }

    fun unmute() {
        player?.unmute()
    }

    fun toggleMute(): Boolean {
        return player?.let {
            val isMuted = it.volume == 0f
            if (isMuted) {
                it.unmute()
            } else {
                it.mute()
            }
            !isMuted
        } ?: false
    }

    fun setVolume(volume: Float) {
        player?.volume = volume.coerceIn(0f, 1f)
    }

    fun seekTo(position: Long) {
        if (player?.isCurrentMediaItemSeekable == true) {
            player?.seekTo(position.coerceAtLeast(0L))
        }
    }

    fun seekRelative(offsetMs: Long) {
        if (player?.isCurrentMediaItemSeekable == true) {
            val newPosition = (player?.currentPosition ?: 0L) + offsetMs
            player?.seekTo(newPosition.coerceAtLeast(0L))
        }
    }

    fun seekByProgress(progressPercent: Int) {
        val duration = player?.duration ?: 0
        if (duration > 0 && duration != C.TIME_UNSET) {
            val position = (duration * progressPercent / 1000).toLong()
            player?.seekTo(position)
        }
    }

    fun getCurrentProgress(): Float {
        val duration = player?.duration ?: 0L
        val position = player?.currentPosition ?: 0L
        return if (duration > 0 && duration != C.TIME_UNSET) {
            (position.toFloat() / duration) * 100
        } else 0f
    }

    fun release() {
        retryJob?.cancel()
        updateJob?.cancel()
        player?.stop()
        player?.clearMediaItems()
        player?.release()
        player = null
    }
}
