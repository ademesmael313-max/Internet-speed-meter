package com.pulse.netmeter.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.pulse.netmeter.model.DailyUsageEntry
import com.pulse.netmeter.model.LiveTrafficSnapshot
import com.pulse.netmeter.model.SpeedUnit
import com.pulse.netmeter.util.FormatUtils

@Composable
fun LiveMeterScreen(
    traffic: LiveTrafficSnapshot,
    dailyUsage: List<DailyUsageEntry>,
    unit: SpeedUnit,
    autoStartOnBoot: Boolean,
    onToggleService: (Boolean) -> Unit,
    onToggleBoot: (Boolean) -> Unit,
    onResetSession: () -> Unit
) {
    val context = LocalContext.current
    val notifLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { _ ->
        onToggleService(true)
    }

    val downMbps = FormatUtils.bytesToMbps(traffic.downBytesPerSec, 1.0)
    val upMbps = FormatUtils.bytesToMbps(traffic.upBytesPerSec, 1.0)
    val peakDownMbps = FormatUtils.bytesToMbps(traffic.peakDownBytesPerSec, 1.0)
    val peakUpMbps = FormatUtils.bytesToMbps(traffic.peakUpBytesPerSec, 1.0)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        // Status-Bar Indicator Card
        Card(
            colors = CardDefaults.cardColors(containerColor = CharcoalCard),
            border = BorderStroke(
                1.dp,
                if (traffic.isServiceRunning) CyanAccent.copy(alpha = 0.55f) else SlateBorder
            ),
            shape = RoundedCornerShape(18.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.weight(1f)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(40.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(CyanAccent.copy(alpha = 0.14f)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.NotificationsActive,
                                contentDescription = null,
                                tint = CyanAccent
                            )
                        }
                        Spacer(modifier = Modifier.width(12.dp))
                        Column {
                            Text(
                                text = "Status-Bar Speed Meter",
                                color = TextPrimary,
                                fontWeight = FontWeight.Bold,
                                fontSize = 16.sp
                            )
                            Text(
                                text = if (traffic.isServiceRunning)
                                    "Active in status bar & lock screen"
                                else
                                    "Show live KB/s & MB/s in Android status bar",
                                color = TextSecondary,
                                fontSize = 12.sp
                            )
                        }
                    }

                    Button(
                        onClick = {
                            if (traffic.isServiceRunning) {
                                onToggleService(false)
                            } else {
                                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                                    ContextCompat.checkSelfPermission(
                                        context,
                                        Manifest.permission.POST_NOTIFICATIONS
                                    ) != PackageManager.PERMISSION_GRANTED
                                ) {
                                    notifLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                                } else {
                                    onToggleService(true)
                                }
                            }
                        },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (traffic.isServiceRunning) CrimsonBad.copy(alpha = 0.22f) else CyanAccent,
                            contentColor = if (traffic.isServiceRunning) CrimsonBad else Color(0xFF041311)
                        ),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Text(
                            text = if (traffic.isServiceRunning) "STOP" else "ENABLE",
                            fontWeight = FontWeight.Bold,
                            fontFamily = FontFamily.Monospace,
                            fontSize = 12.sp
                        )
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = "Auto-start meter on phone boot",
                        color = TextSecondary,
                        fontSize = 12.sp
                    )
                    Switch(
                        checked = autoStartOnBoot,
                        onCheckedChange = onToggleBoot,
                        colors = SwitchDefaults.colors(
                            checkedThumbColor = ObsidianBg,
                            checkedTrackColor = CyanAccent
                        )
                    )
                }
            }
        }

        // Live Device-Wide Download & Upload Readouts
        Row(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            MetricTile(
                title = "LIVE DOWNLOAD",
                value = FormatUtils.formatSpeedValue(downMbps, unit),
                unitLabel = unit.label,
                subLabel = "Peak ${FormatUtils.formatSpeedValue(peakDownMbps, unit)} ${unit.label}",
                accent = CyanAccent,
                icon = {
                    Icon(
                        Icons.Default.ArrowDownward,
                        contentDescription = null,
                        tint = CyanAccent,
                        modifier = Modifier.size(16.dp)
                    )
                },
                modifier = Modifier.weight(1f)
            )
            MetricTile(
                title = "LIVE UPLOAD",
                value = FormatUtils.formatSpeedValue(upMbps, unit),
                unitLabel = unit.label,
                subLabel = "Peak ${FormatUtils.formatSpeedValue(peakUpMbps, unit)} ${unit.label}",
                accent = VioletAccent,
                icon = {
                    Icon(
                        Icons.Default.ArrowUpward,
                        contentDescription = null,
                        tint = VioletAccent,
                        modifier = Modifier.size(16.dp)
                    )
                },
                modifier = Modifier.weight(1f)
            )
        }

        // Real-Time Dual-Trace Graph
        Card(
            colors = CardDefaults.cardColors(containerColor = CharcoalCard),
            border = BorderStroke(1.dp, SlateBorder),
            shape = RoundedCornerShape(18.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = "REAL-TIME DEVICE TRAFFIC (60s)",
                        color = TextSecondary,
                        fontSize = 11.sp,
                        fontFamily = FontFamily.Monospace
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        LegendDot(color = CyanAccent, text = "DL")
                        Spacer(modifier = Modifier.width(10.dp))
                        LegendDot(color = VioletAccent, text = "UL")
                        IconButton(onClick = onResetSession, modifier = Modifier.size(28.dp)) {
                            Icon(
                                Icons.Default.Refresh,
                                contentDescription = "Reset session",
                                tint = TextSecondary,
                                modifier = Modifier.size(16.dp)
                            )
                        }
                    }
                }
                Spacer(modifier = Modifier.height(8.dp))
                DualLineChart(
                    primaryValues = traffic.historyDownMbps,
                    secondaryValues = traffic.historyUpMbps,
                    chartHeight = 155.dp
                )
            }
        }

        // Today & Session Wi-Fi vs Mobile Data Usage
        Row(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            MetricTile(
                title = "TODAY WI-FI",
                value = FormatUtils.formatBytes(traffic.todayWifiBytes),
                unitLabel = "",
                subLabel = "Session: ${FormatUtils.formatBytes(traffic.sessionWifiBytes)}",
                accent = EmeraldGood,
                modifier = Modifier.weight(1f)
            )
            MetricTile(
                title = "TODAY MOBILE",
                value = FormatUtils.formatBytes(traffic.todayMobileBytes),
                unitLabel = "",
                subLabel = "Session: ${FormatUtils.formatBytes(traffic.sessionMobileBytes)}",
                accent = AmberWarn,
                modifier = Modifier.weight(1f)
            )
        }

        // 7-Day Data Usage Ledger
        Card(
            colors = CardDefaults.cardColors(containerColor = CharcoalCard),
            border = BorderStroke(1.dp, SlateBorder),
            shape = RoundedCornerShape(18.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "7-DAY DATA USAGE LEDGER",
                    color = TextSecondary,
                    fontSize = 11.sp,
                    fontFamily = FontFamily.Monospace
                )
                Spacer(modifier = Modifier.height(10.dp))
                Row(
                    horizontalArrangement = Arrangement.SpaceBetween,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 6.dp)
                ) {
                    Text("Date", color = TextMuted, fontSize = 11.sp, modifier = Modifier.weight(1.2f))
                    Text("Wi-Fi", color = TextMuted, fontSize = 11.sp, modifier = Modifier.weight(1f))
                    Text("Mobile", color = TextMuted, fontSize = 11.sp, modifier = Modifier.weight(1f))
                    Text("Total", color = TextMuted, fontSize = 11.sp, modifier = Modifier.weight(1f))
                }
                dailyUsage.forEach { entry ->
                    Row(
                        horizontalArrangement = Arrangement.SpaceBetween,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 5.dp)
                    ) {
                        Text(
                            entry.dateIso.takeLast(5),
                            color = TextPrimary,
                            fontSize = 12.sp,
                            fontFamily = FontFamily.Monospace,
                            modifier = Modifier.weight(1.2f)
                        )
                        Text(
                            FormatUtils.formatBytes(entry.wifiBytes),
                            color = CyanAccent,
                            fontSize = 12.sp,
                            fontFamily = FontFamily.Monospace,
                            modifier = Modifier.weight(1f)
                        )
                        Text(
                            FormatUtils.formatBytes(entry.mobileBytes),
                            color = AmberWarn,
                            fontSize = 12.sp,
                            fontFamily = FontFamily.Monospace,
                            modifier = Modifier.weight(1f)
                        )
                        Text(
                            FormatUtils.formatBytes(entry.wifiBytes + entry.mobileBytes),
                            color = TextSecondary,
                            fontSize = 12.sp,
                            fontFamily = FontFamily.Monospace,
                            modifier = Modifier.weight(1f)
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun MetricTile(
    title: String,
    value: String,
    unitLabel: String,
    subLabel: String,
    accent: Color,
    icon: (@Composable () -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = CharcoalCard),
        border = BorderStroke(1.dp, SlateBorder),
        shape = RoundedCornerShape(16.dp),
        modifier = modifier
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = title,
                    color = TextSecondary,
                    fontSize = 10.sp,
                    fontFamily = FontFamily.Monospace
                )
                icon?.invoke()
            }
            Spacer(modifier = Modifier.height(6.dp))
            Row(verticalAlignment = Alignment.Bottom) {
                Text(
                    text = value,
                    color = TextPrimary,
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace
                )
                if (unitLabel.isNotEmpty()) {
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = unitLabel,
                        color = accent,
                        fontSize = 11.sp,
                        fontFamily = FontFamily.Monospace,
                        modifier = Modifier.padding(bottom = 3.dp)
                    )
                }
            }
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = subLabel,
                color = TextMuted,
                fontSize = 11.sp,
                fontFamily = FontFamily.Monospace
            )
        }
    }
}

@Composable
private fun LegendDot(color: Color, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .size(8.dp)
                .clip(CircleShape)
                .background(color)
        )
        Spacer(modifier = Modifier.width(4.dp))
        Text(text = text, color = TextSecondary, fontSize = 11.sp, fontFamily = FontFamily.Monospace)
    }
}
