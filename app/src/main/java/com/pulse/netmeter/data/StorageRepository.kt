package com.pulse.netmeter.data

import android.content.Context
import com.pulse.netmeter.model.DailyUsageEntry
import com.pulse.netmeter.model.SpeedTestRecord
import com.pulse.netmeter.model.SpeedUnit
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.time.LocalDate

class StorageRepository(context: Context) {

    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences("pulse_netmeter_prefs", Context.MODE_PRIVATE)
    private val historyFile = File(appContext.filesDir, "speedtest_history.json")
    private val lock = Any()

    var autoStartOnBoot: Boolean
        get() = prefs.getBoolean("auto_start_boot", false)
        set(value) = prefs.edit().putBoolean("auto_start_boot", value).apply()

    var customServerUrl: String
        get() = prefs.getString("custom_server_url", "") ?: ""
        set(value) = prefs.edit().putString("custom_server_url", value.trim()).apply()

    var preferredUnit: SpeedUnit
        get() {
            val raw = prefs.getString("preferred_unit", SpeedUnit.MBPS.name)
            return runCatching { SpeedUnit.valueOf(raw ?: SpeedUnit.MBPS.name) }
                .getOrDefault(SpeedUnit.MBPS)
        }
        set(value) = prefs.edit().putString("preferred_unit", value.name).apply()

    fun addDailyTraffic(wifiDelta: Long, mobileDelta: Long): Pair<Long, Long> {
        val today = LocalDate.now().toString()
        val wifiKey = "wifi_$today"
        val mobileKey = "mobile_$today"
        synchronized(lock) {
            val newWifi = (prefs.getLong(wifiKey, 0L) + wifiDelta.coerceAtLeast(0L))
            val newMobile = (prefs.getLong(mobileKey, 0L) + mobileDelta.coerceAtLeast(0L))
            prefs.edit()
                .putLong(wifiKey, newWifi)
                .putLong(mobileKey, newMobile)
                .apply()
            return newWifi to newMobile
        }
    }

    fun getTodayTraffic(): Pair<Long, Long> {
        val today = LocalDate.now().toString()
        return prefs.getLong("wifi_$today", 0L) to prefs.getLong("mobile_$today", 0L)
    }

    fun getRecentDailyUsage(days: Int = 7): List<DailyUsageEntry> {
        val today = LocalDate.now()
        return (0 until days).map { offset ->
            val date = today.minusDays(offset.toLong()).toString()
            DailyUsageEntry(
                dateIso = date,
                wifiBytes = prefs.getLong("wifi_$date", 0L),
                mobileBytes = prefs.getLong("mobile_$date", 0L)
            )
        }
    }

    fun loadHistory(): List<SpeedTestRecord> {
        synchronized(lock) {
            if (!historyFile.exists()) return emptyList()
            return runCatching {
                val arr = JSONArray(historyFile.readText())
                buildList {
                    for (i in 0 until arr.length()) {
                        val o = arr.getJSONObject(i)
                        add(
                            SpeedTestRecord(
                                id = o.optString("id"),
                                timestampEpochMs = o.optLong("timestampEpochMs"),
                                serverName = o.optString("serverName", "Cloudflare Edge"),
                                streams = o.optInt("streams", 4),
                                durationSec = o.optInt("durationSec", 6),
                                downloadMbps = o.optDouble("downloadMbps", 0.0),
                                downloadPeakMbps = o.optDouble("downloadPeakMbps", 0.0),
                                downloadBytes = o.optLong("downloadBytes", 0L),
                                uploadMbps = o.optDouble("uploadMbps", 0.0),
                                uploadPeakMbps = o.optDouble("uploadPeakMbps", 0.0),
                                uploadBytes = o.optLong("uploadBytes", 0L),
                                pingMs = o.optDouble("pingMs", 0.0),
                                jitterMs = o.optDouble("jitterMs", 0.0),
                                loadedPingMs = o.optDouble("loadedPingMs", 0.0),
                                packetLossPct = o.optDouble("packetLossPct", 0.0),
                                bufferbloatGrade = o.optString("bufferbloatGrade", "A"),
                                networkType = o.optString("networkType", "Broadband")
                            )
                        )
                    }
                }
            }.getOrDefault(emptyList())
        }
    }

    fun saveRecord(record: SpeedTestRecord): List<SpeedTestRecord> {
        synchronized(lock) {
            val updated = (listOf(record) + loadHistory().filterNot { it.id == record.id }).take(100)
            persistRecords(updated)
            return updated
        }
    }

    fun deleteRecord(id: String): List<SpeedTestRecord> {
        synchronized(lock) {
            val updated = loadHistory().filterNot { it.id == id }
            persistRecords(updated)
            return updated
        }
    }

    fun clearHistory(): List<SpeedTestRecord> {
        synchronized(lock) {
            if (historyFile.exists()) historyFile.delete()
            return emptyList()
        }
    }

    private fun persistRecords(records: List<SpeedTestRecord>) {
        val arr = JSONArray()
        for (r in records) {
            val o = JSONObject().apply {
                put("id", r.id)
                put("timestampEpochMs", r.timestampEpochMs)
                put("serverName", r.serverName)
                put("streams", r.streams)
                put("durationSec", r.durationSec)
                put("downloadMbps", r.downloadMbps)
                put("downloadPeakMbps", r.downloadPeakMbps)
                put("downloadBytes", r.downloadBytes)
                put("uploadMbps", r.uploadMbps)
                put("uploadPeakMbps", r.uploadPeakMbps)
                put("uploadBytes", r.uploadBytes)
                put("pingMs", r.pingMs)
                put("jitterMs", r.jitterMs)
                put("loadedPingMs", r.loadedPingMs)
                put("packetLossPct", r.packetLossPct)
                put("bufferbloatGrade", r.bufferbloatGrade)
                put("networkType", r.networkType)
            }
            arr.put(o)
        }
        historyFile.writeText(arr.toString(2))
    }
}
