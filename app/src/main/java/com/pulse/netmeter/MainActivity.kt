package com.pulse.netmeter

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.NetworkCheck
import androidx.compose.material.icons.filled.Router
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.pulse.netmeter.model.SpeedUnit
import com.pulse.netmeter.ui.CharcoalCard
import com.pulse.netmeter.ui.CyanAccent
import com.pulse.netmeter.ui.DiagnosticsScreen
import com.pulse.netmeter.ui.HistoryScreen
import com.pulse.netmeter.ui.LiveMeterScreen
import com.pulse.netmeter.ui.ObsidianBg
import com.pulse.netmeter.ui.PulseNetMeterTheme
import com.pulse.netmeter.ui.SlateBorder
import com.pulse.netmeter.ui.SpeedTestScreen
import com.pulse.netmeter.ui.TextPrimary
import com.pulse.netmeter.ui.TextSecondary

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            PulseNetMeterTheme {
                PulseNetMeterApp()
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PulseNetMeterApp(vm: NetMeterViewModel = viewModel()) {
    var selectedTab by rememberSaveable { mutableIntStateOf(0) }

    val liveTraffic by vm.liveTraffic.collectAsState()
    val testState by vm.testState.collectAsState()
    val history by vm.history.collectAsState()
    val dailyUsage by vm.dailyUsage.collectAsState()
    val diagnostics by vm.diagnostics.collectAsState()
    val sweepSamples by vm.pingSweepSamples.collectAsState()
    val isSweeping by vm.isSweeping.collectAsState()

    Scaffold(
        containerColor = ObsidianBg,
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = ObsidianBg,
                    titleContentColor = TextPrimary
                ),
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = "PULSE",
                            fontWeight = FontWeight.Bold,
                            fontSize = 18.sp,
                            color = TextPrimary
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = "// NET-METER",
                            fontWeight = FontWeight.Bold,
                            fontSize = 15.sp,
                            fontFamily = FontFamily.Monospace,
                            color = CyanAccent
                        )
                    }
                },
                actions = {
                    Row(
                        modifier = Modifier
                            .padding(end = 10.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .background(CharcoalCard),
                        horizontalArrangement = Arrangement.spacedBy(2.dp)
                    ) {
                        SpeedUnit.entries.forEach { u ->
                            val active = testState.unit == u
                            TextButton(
                                onClick = { vm.setUnit(u) }
                            ) {
                                Text(
                                    text = u.label,
                                    color = if (active) CyanAccent else TextSecondary,
                                    fontWeight = if (active) FontWeight.Bold else FontWeight.Normal,
                                    fontFamily = FontFamily.Monospace,
                                    fontSize = 12.sp
                                )
                            }
                        }
                    }
                }
            )
        },
        bottomBar = {
            NavigationBar(
                containerColor = CharcoalCard
            ) {
                val navColors = NavigationBarItemDefaults.colors(
                    selectedIconColor = CyanAccent,
                    selectedTextColor = CyanAccent,
                    indicatorColor = SlateBorder,
                    unselectedIconColor = TextSecondary,
                    unselectedTextColor = TextSecondary
                )
                NavigationBarItem(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    icon = { Icon(Icons.Default.Speed, contentDescription = "Live Meter") },
                    label = { Text("Live Meter", fontSize = 11.sp) },
                    colors = navColors
                )
                NavigationBarItem(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    icon = { Icon(Icons.Default.NetworkCheck, contentDescription = "Speed Test") },
                    label = { Text("Speed Test", fontSize = 11.sp) },
                    colors = navColors
                )
                NavigationBarItem(
                    selected = selectedTab == 2,
                    onClick = { selectedTab = 2 },
                    icon = { Icon(Icons.Default.History, contentDescription = "History") },
                    label = { Text("History", fontSize = 11.sp) },
                    colors = navColors
                )
                NavigationBarItem(
                    selected = selectedTab == 3,
                    onClick = { selectedTab = 3 },
                    icon = { Icon(Icons.Default.Router, contentDescription = "Diagnostics") },
                    label = { Text("Diagnostics", fontSize = 11.sp) },
                    colors = navColors
                )
            }
        }
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            when (selectedTab) {
                0 -> LiveMeterScreen(
                    traffic = liveTraffic,
                    dailyUsage = dailyUsage,
                    unit = testState.unit,
                    autoStartOnBoot = testState.autoStartOnBoot,
                    onToggleService = { vm.toggleStatusBarMeter(it) },
                    onToggleBoot = { vm.setAutoStartOnBoot(it) },
                    onResetSession = { vm.resetLiveSession() }
                )
                1 -> SpeedTestScreen(
                    state = testState,
                    onStartOrStop = { vm.startOrStopSpeedTest() },
                    onSelectStreams = { vm.setStreams(it) },
                    onSelectDuration = { vm.setDuration(it) },
                    onCustomServerChanged = { vm.setCustomServerUrl(it) }
                )
                2 -> HistoryScreen(
                    records = history,
                    unit = testState.unit,
                    onDelete = { vm.deleteHistoryRecord(it) },
                    onClearAll = { vm.clearAllHistory() }
                )
                3 -> DiagnosticsScreen(
                    diag = diagnostics,
                    sweepSamples = sweepSamples,
                    isSweeping = isSweeping,
                    onRefresh = { vm.refreshDiagnostics() },
                    onRunSweep = { vm.runPingSweep() }
                )
            }
        }
    }
}
