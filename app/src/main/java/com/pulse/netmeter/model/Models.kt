package com.pulse.netmeter.model

enum class SpeedUnit(val label: String) {
    MBPS("Mbps"),
    MB_PER_SEC("MB/s")
}

enum class TestPhase {
    IDLE,
    PING,
    DOWNLOAD,
    UPLOAD,
    DONE,
    ERROR
}

data class SeriesSample(
    val second: Float,
    val mbps: Double
)

data class SpeedTestRecord(
    val id: String,
    val timestampEpochMs: Long,
    val serverName: String,
    val streams: Int,
    val durationSec: Int,
    val downloadMbps: Double,
    val downloadPeakMbps: Double,
    val downloadBytes: Long,
    val uploadMbps: Double,
    val uploadPeakMbps: Double,
    val uploadBytes: Long,
    val pingMs: Double,
    val jitterMs: Double,
    val loadedPingMs: Double,
    val packetLossPct: Double,
    val bufferbloatGrade: String,
    val networkType: String
)

data class LiveTrafficSnapshot(
    val downBytesPerSec: Long = 0L,
    val upBytesPerSec: Long = 0L,
    val peakDownBytesPerSec: Long = 0L,
    val peakUpBytesPerSec: Long = 0L,
    val sessionWifiBytes: Long = 0L,
    val sessionMobileBytes: Long = 0L,
    val todayWifiBytes: Long = 0L,
    val todayMobileBytes: Long = 0L,
    val historyDownMbps: List<Double> = emptyList(),
    val historyUpMbps: List<Double> = emptyList(),
    val isServiceRunning: Boolean = false
)

data class DailyUsageEntry(
    val dateIso: String,
    val wifiBytes: Long,
    val mobileBytes: Long
)

data class RadioDiagnostics(
    val connected: Boolean = false,
    val transportLabel: String = "Disconnected",
    val interfaceName: String = "—",
    val localAddresses: String = "—",
    val dnsServers: String = "—",
    val linkDownKbps: Int = 0,
    val linkUpKbps: Int = 0,
    val isMetered: Boolean = false,
    val isVpnActive: Boolean = false,
    val publicIp: String = "Tap Refresh",
    val ispOrg: String = "—",
    val edgeColocation: String = "—"
)
