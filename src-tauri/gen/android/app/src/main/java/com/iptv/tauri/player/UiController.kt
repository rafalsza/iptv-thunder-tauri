package com.iptv.tauri.player

import android.view.View
import android.view.ViewGroup
import android.widget.SeekBar
import android.widget.TextView
import androidx.appcompat.widget.AppCompatSeekBar
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.lifecycleScope
import androidx.media3.common.C
import androidx.media3.ui.PlayerView
import com.google.android.material.button.MaterialButton
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class UiController(
    private val lifecycleOwner: LifecycleOwner,
    private val playerView: PlayerView?,
    private val headerContainer: View?,
    private val controlsContainer: View?,
    private val channelNameTextView: TextView?,
    private val liveLabelTextView: TextView?,
    private val qualityLabelTextView: TextView?,
    private val currentTimeTextView: TextView?,
    private val durationTimeTextView: TextView?,
    private val seekBar: AppCompatSeekBar?,
    private val playPauseButton: MaterialButton?,
    private val seekForwardButton: MaterialButton?,
    private val seekBackwardButton: MaterialButton?,
    private val statusIndicator: View?,
    private val getDuration: () -> Long,
    private val onSeek: (positionMs: Long) -> Unit,
    private val onPlayPause: () -> Unit,
    private val onSeekForward: () -> Unit,
    private val onSeekBackward: () -> Unit,
    private val formatTime: (Long) -> String
) {
    companion object {
        private const val HIDE_DELAY_MS = 5000L
    }

    private var hideJob: Job? = null

    var showControls = true
        private set
    var isSeeking = false
        private set

    private val focusableButtons by lazy {
        listOf(playPauseButton, seekBackwardButton, seekForwardButton)
    }

    init {
        setupPlayerView()
        setupFocusNavigation()
        setupSeekBar()
        setupButtons()
        setupFocusVisuals()
    }

    private fun setupPlayerView() {
        playerView?.isFocusable = false
        playerView?.isFocusableInTouchMode = false
        playerView?.descendantFocusability = ViewGroup.FOCUS_BLOCK_DESCENDANTS

        playerView?.setOnClickListener {
            toggleControls()
        }
    }

    private fun setupFocusNavigation() {
        playPauseButton?.isFocusable = true
        seekForwardButton?.isFocusable = true
        seekBackwardButton?.isFocusable = true

        playPauseButton?.nextFocusRightId = seekForwardButton?.id ?: 0
        playPauseButton?.nextFocusLeftId = seekBackwardButton?.id ?: 0
        seekBackwardButton?.nextFocusRightId = playPauseButton?.id ?: 0
        seekForwardButton?.nextFocusLeftId = playPauseButton?.id ?: 0
    }

    private fun setupSeekBar() {
        seekBar?.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(seekBar: SeekBar?, progress: Int, fromUser: Boolean) {
                if (fromUser) {
                    updateTimeLabelsFromProgress(progress)
                }
            }

            override fun onStartTrackingTouch(seekBar: SeekBar?) {
                isSeeking = true
            }

            override fun onStopTrackingTouch(seekBar: SeekBar?) {
                isSeeking = false
                val progress = seekBar?.progress ?: 0
                val duration = getDuration()
                if (duration > 0) {
                    val position = (duration * progress / 1000).toLong()
                    onSeek(position)
                }
            }
        })
    }

    private fun setupButtons() {
        playPauseButton?.setOnClickListener {
            onPlayPause()
            resetHideTimer()
        }

        seekForwardButton?.setOnClickListener {
            onSeekForward()
            resetHideTimer()
        }

        seekBackwardButton?.setOnClickListener {
            onSeekBackward()
            resetHideTimer()
        }
    }

    private fun setupFocusVisuals() {
        focusableButtons.forEach { btn ->
            btn?.setOnFocusChangeListener { v, hasFocus ->
                resetAllButtonVisuals()
                if (hasFocus) {
                    v.scaleX = 1.1f
                    v.scaleY = 1.1f
                    v.alpha = 1f
                }
            }
        }
    }

    private fun resetAllButtonVisuals() {
        focusableButtons.forEach { btn ->
            btn?.scaleX = 1f
            btn?.scaleY = 1f
            btn?.alpha = 0.8f
        }
    }

    private fun updateTimeLabelsFromProgress(progress: Int) {
        val duration = getDuration()
        if (duration > 0) {
            val position = (duration * progress / 1000).toLong()
            currentTimeTextView?.text = formatTime(position)
            durationTimeTextView?.text = formatTime(duration)
        }
    }

    fun setChannelName(name: String) {
        channelNameTextView?.text = name
    }

    fun updatePlayPauseButton(isPlaying: Boolean) {
        playPauseButton?.text = if (isPlaying) "⏸" else "▶"
    }

    fun updateStatusIndicator(isPlaying: Boolean) {
        statusIndicator?.setBackgroundColor(
            if (isPlaying) android.graphics.Color.GREEN
            else android.graphics.Color.GRAY
        )
    }

    fun updateStateLabel(state: String) {
        liveLabelTextView?.text = state
    }

    fun updateQualityLabel(quality: String) {
        qualityLabelTextView?.text = quality
        qualityLabelTextView?.visibility = if (quality.isNotEmpty()) View.VISIBLE else View.GONE
    }

    fun updateSeekBar(progress: Float, duration: Long, currentPosition: Long, isVod: Boolean) {
        if (!isSeeking) {
            seekBar?.max = 1000
            seekBar?.progress = (progress * 10).toInt()
        }

        if (isVod && duration > 0 && duration != C.TIME_UNSET) {
            seekBar?.visibility = View.VISIBLE
            currentTimeTextView?.text = formatTime(currentPosition)
            durationTimeTextView?.text = formatTime(duration)
            currentTimeTextView?.visibility = View.VISIBLE
            durationTimeTextView?.visibility = View.VISIBLE
        } else {
            seekBar?.visibility = View.GONE
            currentTimeTextView?.visibility = View.GONE
            durationTimeTextView?.visibility = View.GONE
        }
    }

    fun toggleControls() {
        if (showControls) hideControls() else showControls()
    }

    fun showControls() {
        showControls = true
        headerContainer?.visibility = View.VISIBLE
        controlsContainer?.visibility = View.VISIBLE
        resetHideTimer()
    }

    fun hideControls() {
        showControls = false
        headerContainer?.visibility = View.GONE
        controlsContainer?.visibility = View.GONE
    }

    fun resetHideTimer() {
        hideJob?.cancel()
        hideJob = lifecycleOwner.lifecycleScope.launch {
            delay(HIDE_DELAY_MS)
            hideControls()
        }
    }

    fun stopHideTimer() {
        hideJob?.cancel()
        hideJob = null
    }

    fun focusPlayPauseButton(): Boolean {
        return playPauseButton?.requestFocus() ?: false
    }

    fun focusSeekBar(): Boolean {
        return seekBar?.requestFocus() ?: false
    }

    fun release() {
        stopHideTimer()
    }
}
