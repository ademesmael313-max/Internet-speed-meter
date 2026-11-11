package com.pulse.netmeter.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.net.TrafficStats
import android.os.Build
import android.os.IBinder
import android.os.SystemClock
import androidx.core.app.NotificationCompat
import androidx.core.graphics.drawable.IconCompat
import com.pulse.netmeter.MainActivity
import com.pulse.netmeter.R
import com.pulse.netmeter.data.StorageRepository
import com.pulse.netmeter.util.FormatUtils
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

class SpeedMeterService : Service() {

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var monitorJob: Job? = null
    private lateinit var notificationManager: NotificationManager
    private lateinit var repository: StorageRepository

    override fun onCreate() {
        super.onCreate()
        notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        repository = StorageRepository(this)
        ensureNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopMeterService()
            return START_NOT_STICKY
        }

        val initialNotification = buildSpeedNotification(0L, 0L, 0L, 0L)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(
                NOTIFICATION_ID,
                initialNotification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
            )
        } else {
            startForeground(NOTIFICATION_ID, initialNotification)
        }

        TrafficStateBus.update { it.copy(isServiceRunning = true) }
        startSamplingLoop()
        return START_STICKY
    }

    private fun startSamplingLoop() {
        if (monitorJob?.isActive == true) return
        monitorJob = serviceScope.launch {
            var prevRx = TrafficStats.getTotalRxBytes().coerceAtLeast(0L)
            var prevTx = TrafficStats.getTotalTxBytes().coerceAtLeast(0L)
            var prevMobRx = TrafficStats.getMobileRxBytes().coerceAtLeast(0L)
            var prevMobTx = TrafficStats.getMobileTxBytes().coerceAtLeast(0L)
            var prevTimeMs = SystemClock.elapsedRealtime()

            while (isActive) {
                delay(1000L)
                val nowMs = SystemClock.elapsedRealtime()
                val dtSec = ((nowMs - prevTimeMs) / 1000.0).coerceAtLeast(0.2)
                prevTimeMs = nowMs

                val curRx = TrafficStats.getTotalRxBytes().coerceAtLeast(prevRx)
                val curTx = TrafficStats.getTotalTxBytes().coerceAtLeast(prevTx)
                val curMobRx = TrafficStats.getMobileRxBytes().coerceAtLeast(prevMobRx)
                val curMobTx = TrafficStats.getMobileTxBytes().coerceAtLeast(prevMobTx)

                val dRx = (curRx - prevRx).coerceAtLeast(0L)
                val dTx = (curTx - prevTx).coerceAtLeast(0L)
                val dMob = ((curMobRx - prevMobRx) + (curMobTx - prevMobTx)).coerceAtLeast(0L)
                val dTotal = dRx + dTx
                val dWifi = (dTotal - dMob).coerceAtLeast(0L)

                prevRx = curRx
                prevTx = curTx
                prevMobRx = curMobRx
                prevMobTx = curMobTx

                val downBps = (dRx / dtSec).toLong()
                val upBps = (dTx / dtSec).toLong()
                val downMbps = FormatUtils.bytesToMbps(dRx, dtSec)
                val upMbps = FormatUtils.bytesToMbps(dTx, dtSec)

                val (todayWifi, todayMobile) = repository.addDailyTraffic(dWifi, dMob)

                var sessionWifiSnapshot = 0L
                var sessionMobSnapshot = 0L
                TrafficStateBus.update { prev ->
                    sessionWifiSnapshot = prev.sessionWifiBytes + dWifi
                    sessionMobSnapshot = prev.sessionMobileBytes + dMob
                    prev.copy(
                        downBytesPerSec = downBps,
                        upBytesPerSec = upBps,
                        peakDownBytesPerSec = maxOf(prev.peakDownBytesPerSec, downBps),
                        peakUpBytesPerSec = maxOf(prev.peakUpBytesPerSec, upBps),
                        sessionWifiBytes = sessionWifiSnapshot,
                        sessionMobileBytes = sessionMobSnapshot,
                        todayWifiBytes = todayWifi,
                        todayMobileBytes = todayMobile,
                        historyDownMbps = (prev.historyDownMbps + downMbps).takeLast(60),
                        historyUpMbps = (prev.historyUpMbps + upMbps).takeLast(60),
                        isServiceRunning = true
                    )
                }

                val notification = buildSpeedNotification(
                    downBps = downBps,
                    upBps = upBps,
                    todayWifi = todayWifi,
                    todayMobile = todayMobile
                )
                notificationManager.notify(NOTIFICATION_ID, notification)
            }
        }
    }

    private fun buildSpeedNotification(
        downBps: Long,
        upBps: Long,
        todayWifi: Long,
        todayMobile: Long
    ): Notification {
        val totalBps = downBps + upBps
        val (downVal, downUnit) = FormatUtils.formatRateCompact(downBps)
        val (upVal, upUnit) = FormatUtils.formatRateCompact(upBps)

        val openIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val stopIntent = PendingIntent.getService(
            this,
            1,
            Intent(this, SpeedMeterService::class.java).apply { action = ACTION_STOP },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val speedIcon = createSpeedStatusBarIcon(totalBps)

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(speedIcon)
            .setContentTitle("↓ $downVal $downUnit   ·   ↑ $upVal $upUnit")
            .setContentText(
                "Today Wi-Fi: ${FormatUtils.formatBytes(todayWifi)}  |  Mobile: ${FormatUtils.formatBytes(todayMobile)}"
            )
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setShowWhen(false)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(openIntent)
            .addAction(R.drawable.ic_stat_speed, "Stop Meter", stopIntent)
            .build()
    }

    /**
     * Renders a crisp 2-line monochrome status-bar icon (e.g. "1.8" / "MB/s")
     * so live internet speed stays visible at the top of Android's status bar.
     */
    private fun createSpeedStatusBarIcon(bytesPerSec: Long): IconCompat {
        val (numText, unitText) = FormatUtils.formatRateCompact(bytesPerSec)
        val size = 72
        val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)

        val numPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            textAlign = Paint.Align.CENTER
            typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
            textSize = if (numText.length >= 4) 27f else 33f
        }

        val unitPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            textAlign = Paint.Align.CENTER
            typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD)
            textSize = 20f
        }

        canvas.drawText(numText, size / 2f, 36f, numPaint)
        canvas.drawText(unitText, size / 2f, 64f, unitPaint)

        return IconCompat.createWithBitmap(bitmap)
    }

    private fun ensureNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            getString(R.string.notification_channel_name),
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = getString(R.string.notification_channel_desc)
            setShowBadge(false)
            enableLights(false)
            enableVibration(false)
        }
        notificationManager.createNotificationChannel(channel)
    }

    private fun stopMeterService() {
        monitorJob?.cancel()
        TrafficStateBus.update { it.copy(isServiceRunning = false) }
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        TrafficStateBus.update { it.copy(isServiceRunning = false) }
        serviceScope.cancel()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        const val CHANNEL_ID = "pulse_live_speed_channel"
        const val NOTIFICATION_ID = 4101
        const val ACTION_STOP = "com.pulse.netmeter.ACTION_STOP_SERVICE"

        fun start(context: Context) {
            val intent = Intent(context, SpeedMeterService::class.java)
            context.startForegroundService(intent)
        }

        fun stop(context: Context) {
            val intent = Intent(context, SpeedMeterService::class.java).apply {
                action = ACTION_STOP
            }
            context.startService(intent)
        }
    }
}
