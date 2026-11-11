package com.pulse.netmeter

import android.app.Application
import android.net.TrafficStats
import android.os.SystemClock
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.pulse.netmeter.data.StorageRepository
import com.pulse.netmeter.engine.NetworkInspector
import com.pulse.netmeter.engine.SpeedTestEngine
import com.pulse.netmeter.model.DailyUsageEntry
import com.pulse.netmeter.model.LiveTrafficSnapshot
import com.pulse.netmeter.model.RadioDiagnostics
import com.pulse.netmeter.model.SeriesSample
import com.pulse.netmeter.model.SpeedTestRecord
import com.pulse.netmeter.model.SpeedUnit
import com.pulse.netmeter.model.TestPhase
import com.pulse.netmeter.service.SpeedMeterService
import com.pulse.netmeter.service.TrafficStateBus
import com.pulse.netmeter.util.FormatUtils
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.util.UUID

data class SpeedTestUiState(
    val phase: TestPhase = TestPhase.IDLE,
    val progress: Float = 0f,
    val gaugeMbps: Double = 0.0,
    val downloadMbps: Double = 0.0,
    val downloadPeakMbps: Double = 0.0,
    val downloadBytes: Long = 0L,
    val uploadMbps: Double = 0.0,
    val uploadPeakMbps: Double = 0.0,
    val uploadBytes: Long = 0L,
    val pingMs: Double = 0.0,
    val jitterMs: Double = 0.0,
    val loadedPingMs: Double = 0.0,
    val packetLossPct: Double = 0.0,
    val bufferbloatGrade: String = "—",
    val downloadSeries: List<SeriesSample> = emptyList(),
    val uploadSeries: List<SeriesSample> = emptyList(),
    val streams: Int = 4,
    val durationSec: Int = 6,
    val unit: SpeedUnit = SpeedUnit.MBPS,
    val customServerUrl: String = "",
    val autoStartOnBoot: Boolean = false,
    val errorMessage: String? = null
)

class NetMeterViewModel(application: Application) : AndroidViewModel(application) {

    private val repo = StorageRepository(application)
    private val engine = SpeedTestEngine()
    private val inspector = NetworkInspector(application)

    val liveTraffic: StateFlow<LiveTrafficSnapshot> = TrafficStateBus.state

    private val _testState = MutableStateFlow(
        SpeedTestUiState(
            unit = repo.preferredUnit,
            customServerUrl = repo.customServerUrl,
            autoStartOnBoot = repo.autoStartOnBoot
        )
    )
    val testState: StateFlow<SpeedTestUiState> = _testState.asStateFlow()

    private val _history = MutableStateFlow<List<SpeedTestRecord>>(emptyList())
    val history: StateFlow<List<SpeedTestRecord>> = _history.asStateFlow()

    private val _dailyUsage = MutableStateFlow<List<DailyUsageEntry>>(emptyList())
    val dailyUsage: StateFlow<List<DailyUsageEntry>> = _dailyUsage.asStateFlow()

    private val _diagnostics = MutableStateFlow(RadioDiagnostics())
    val diagnostics: StateFlow<RadioDiagnostics> = _diagnostics.asStateFlow()

    private val _pingSweepSamples = MutableStateFlow<List<Double?>>(emptyList())
    val pingSweepSamples: StateFlow<List<Double?>> = _pingSweepSamples.asStateFlow()

    private val _isSweeping = MutableStateFlow(false)
    val isSweeping: StateFlow<Boolean> = _isSweeping.asStateFlow()

    private var speedTestJob: Job? = null

    init {
        _history.value = repo.loadHistory()
        _dailyUsage.value = repo.getRecentDailyUsage(7)
        val (todayWifi, todayMobile) = repo.getTodayTraffic()
        TrafficStateBus.update {
            it.copy(todayWifiBytes = todayWifi, todayMobileBytes = todayMobile)
        }
        refreshDiagnostics()
        startForegroundFallbackSampler()
    }

    /**
     * Samples Android TrafficStats while the app UI is open whenever the background
     * ForegroundService is turned off, ensuring the Live Meter tab always works immediately.
     */
    private fun startForegroundFallbackSampler() {
        viewModelScope.launch(Dispatchers.Default) {
            var prevRx = TrafficStats.getTotalRxBytes().coerceAtLeast(0L)
            var prevTx = TrafficStats.getTotalTxBytes().coerceAtLeast(0L)
            var prevMobRx = TrafficStats.getMobileRxBytes().coerceAtLeast(0L)
            var prevMobTx = TrafficStats.getMobileTxBytes().coerceAtLeast(0L)
            var prevTime = SystemClock.elapsedRealtime()

            while (isActive) {
                delay(1000L)
                val now = SystemClock.elapsedRealtime()
                val dtSec = ((now - prevTime) / 1000.0).coerceAtLeast(0.2)
                prevTime = now

                val curRx = TrafficStats.getTotalRxBytes().coerceAtLeast(prevRx)
                val curTx = TrafficStats.getTotalTxBytes().coerceAtLeast(prevTx)
                val curMobRx = TrafficStats.getMobileRxBytes().coerceAtLeast(prevMobRx)
                val curMobTx = TrafficStats.getMobileTxBytes().coerceAtLeast(prevMobTx)

                if (TrafficStateBus.state.value.isServiceRunning) {
                    prevRx = curRx
                    prevTx = curTx
                    prevMobRx = curMobRx
                    prevMobTx = curMobTx
                    _dailyUsage.value = repo.getRecentDailyUsage(7)
                    continue
                }

                val dRx = (curRx - prevRx).coerceAtLeast(0L)
                val dTx = (curTx - prevTx).coerceAtLeast(0L)
                val dMob = ((curMobRx - prevMobRx) + (curMobTx - prevMobTx)).coerceAtLeast(0L)
                val dWifi = ((dRx + dTx) - dMob).coerceAtLeast(0L)

                prevRx = curRx
                prevTx = curTx
                prevMobRx = curMobRx
                prevMobTx = curMobTx

                val downBps = (dRx / dtSec).toLong()
                val upBps = (dTx / dtSec).toLong()
                val downMbps = FormatUtils.bytesToMbps(dRx, dtSec)
                val upMbps = FormatUtils.bytesToMbps(dTx, dtSec)

                val (todayWifi, todayMobile) = repo.addDailyTraffic(dWifi, dMob)
                _dailyUsage.value = repo.getRecentDailyUsage(7)

                TrafficStateBus.update { prev ->
                    prev.copy(
                        downBytesPerSec = downBps,
                        upBytesPerSec = upBps,
                        peakDownBytesPerSec = maxOf(prev.peakDownBytesPerSec, downBps),
                        peakUpBytesPerSec = maxOf(prev.peakUpBytesPerSec, upBps),
                        sessionWifiBytes = prev.sessionWifiBytes + dWifi,
                        sessionMobileBytes = prev.sessionMobileBytes + dMob,
                        todayWifiBytes = todayWifi,
                        todayMobileBytes = todayMobile,
                        historyDownMbps = (prev.historyDownMbps + downMbps).takeLast(60),
                        historyUpMbps = (prev.historyUpMbps + upMbps).takeLast(60)
                    )
                }
            }
        }
    }

    fun toggleStatusBarMeter(enable: Boolean) {
        val ctx = getApplication<Application>()
        if (enable) {
            SpeedMeterService.start(ctx)
        } else {
            SpeedMeterService.stop(ctx)
        }
    }

    fun resetLiveSession() {
        TrafficStateBus.resetSession()
    }

    fun setUnit(unit: SpeedUnit) {
        repo.preferredUnit = unit
        _testState.update { it.copy(unit = unit) }
    }

    fun setStreams(streams: Int) {
        _testState.update { it.copy(streams = streams) }
    }

    fun setDuration(durationSec: Int) {
        _testState.update { it.copy(durationSec = durationSec) }
    }

    fun setCustomServerUrl(url: String) {
        repo.customServerUrl = url
        _testState.update { it.copy(customServerUrl = url) }
    }

    fun setAutoStartOnBoot(enabled: Boolean) {
        repo.autoStartOnBoot = enabled
        _testState.update { it.copy(autoStartOnBoot = enabled) }
    }

    fun startOrStopSpeedTest() {
        val currentPhase = _testState.value.phase
        if (currentPhase == TestPhase.PING || currentPhase == TestPhase.DOWNLOAD || currentPhase == TestPhase.UPLOAD) {
            speedTestJob?.cancel()
            speedTestJob = null
            _testState.update { it.copy(phase = TestPhase.IDLE, progress = 0f, gaugeMbps = 0.0) }
            return
        }

        speedTestJob = viewModelScope.launch {
            val cfg = _testState.value
            val customUrl = cfg.customServerUrl
            _testState.update {
                it.copy(
                    phase = TestPhase.PING,
                    progress = 0.04f,
                    gaugeMbps = 0.0,
                    downloadMbps = 0.0,
                    downloadPeakMbps = 0.0,
                    downloadBytes = 0L,
                    uploadMbps = 0.0,
                    uploadPeakMbps = 0.0,
                    uploadBytes = 0L,
                    pingMs = 0.0,
                    jitterMs = 0.0,
                    loadedPingMs = 0.0,
                    packetLossPct = 0.0,
                    bufferbloatGrade = "—",
                    downloadSeries = emptyList(),
                    uploadSeries = emptyList(),
                    errorMessage = null
                )
            }

            try {
                val pingRes = engine.measurePing(10, customUrl) { ms, idx, total ->
                    _testState.update { s ->
                        s.copy(
                            pingMs = ms ?: s.pingMs,
                            progress = (idx.toFloat() / total.toFloat()) * 0.2f
                        )
                    }
                }

                if (pingRes.samplesMs.isEmpty()) {
                    _testState.update {
                        it.copy(
                            phase = TestPhase.ERROR,
                            errorMessage = "Unable to reach speed test endpoint. Check internet connection."
                        )
                    }
                    return@launch
                }

                _testState.update {
                    it.copy(
                        pingMs = pingRes.avgMs,
                        jitterMs = pingRes.jitterMs,
                        packetLossPct = pingRes.lossPct,
                        phase = TestPhase.DOWNLOAD
                    )
                }

                val dlRes = engine.measureDownload(cfg.streams, cfg.durationSec, customUrl) { mbps, bytes, frac ->
                    _testState.update {
                        it.copy(
                            gaugeMbps = mbps,
                            downloadMbps = mbps,
                            downloadBytes = bytes,
                            progress = 0.2f + frac * 0.4f
                        )
                    }
                }

                _testState.update {
                    it.copy(
                        downloadMbps = dlRes.sustainedMbps,
                        downloadPeakMbps = dlRes.peakMbps,
                        downloadBytes = dlRes.totalBytes,
                        downloadSeries = dlRes.series,
                        loadedPingMs = if (dlRes.loadedPingMs > 0.0) dlRes.loadedPingMs else pingRes.avgMs,
                        gaugeMbps = 0.0,
                        phase = TestPhase.UPLOAD
                    )
                }

                delay(250L)

                val ulRes = engine.measureUpload(cfg.streams, cfg.durationSec, customUrl) { mbps, bytes, frac ->
                    _testState.update {
                        it.copy(
                            gaugeMbps = mbps,
                            uploadMbps = mbps,
                            uploadBytes = bytes,
                            progress = 0.6f + frac * 0.4f
                        )
                    }
                }

                val loadedValues = listOf(dlRes.loadedPingMs, ulRes.loadedPingMs).filter { it > 0.0 }
                val avgLoadedPing = if (loadedValues.isNotEmpty()) loadedValues.average() else pingRes.avgMs
                val grade = FormatUtils.bufferbloatGrade(pingRes.avgMs, avgLoadedPing)
                val radio = inspector.readLocalRadioState()

                val record = SpeedTestRecord(
                    id = UUID.randomUUID().toString(),
                    timestampEpochMs = System.currentTimeMillis(),
                    serverName = engine.serverDisplayName(customUrl),
                    streams = cfg.streams,
                    durationSec = cfg.durationSec,
                    downloadMbps = dlRes.sustainedMbps,
                    downloadPeakMbps = dlRes.peakMbps,
                    downloadBytes = dlRes.totalBytes,
                    uploadMbps = ulRes.sustainedMbps,
                    uploadPeakMbps = ulRes.peakMbps,
                    uploadBytes = ulRes.totalBytes,
                    pingMs = pingRes.avgMs,
                    jitterMs = pingRes.jitterMs,
                    loadedPingMs = avgLoadedPing,
                    packetLossPct = pingRes.lossPct,
                    bufferbloatGrade = grade,
                    networkType = radio.transportLabel
                )

                _history.value = repo.saveRecord(record)

                _testState.update {
                    it.copy(
                        phase = TestPhase.DONE,
                        progress = 1f,
                        gaugeMbps = dlRes.sustainedMbps,
                        uploadMbps = ulRes.sustainedMbps,
                        uploadPeakMbps = ulRes.peakMbps,
                        uploadBytes = ulRes.totalBytes,
                        uploadSeries = ulRes.series,
                        loadedPingMs = avgLoadedPing,
                        bufferbloatGrade = grade
                    )
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _testState.update {
                    it.copy(
                        phase = TestPhase.ERROR,
                        errorMessage = e.localizedMessage ?: "Speed test interrupted"
                    )
                }
            }
        }
    }

    fun deleteHistoryRecord(id: String) {
        _history.value = repo.deleteRecord(id)
    }

    fun clearAllHistory() {
        _history.value = repo.clearHistory()
    }

    fun refreshDiagnostics() {
        viewModelScope.launch {
            _diagnostics.value = inspector.readLocalRadioState()
            _diagnostics.value = inspector.inspectFullDiagnostics()
        }
    }

    fun runPingSweep() {
        if (_isSweeping.value) return
        viewModelScope.launch {
            _isSweeping.value = true
            _pingSweepSamples.value = emptyList()
            try {
                engine.measurePing(20, _testState.value.customServerUrl) { ms, _, _ ->
                    _pingSweepSamples.update { it + ms }
                }
            } finally {
                _isSweeping.value = false
            }
        }
    }
}
