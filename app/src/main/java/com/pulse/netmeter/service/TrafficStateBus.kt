package com.pulse.netmeter.service

import com.pulse.netmeter.model.LiveTrafficSnapshot
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

object TrafficStateBus {
    private val _state = MutableStateFlow(LiveTrafficSnapshot())
    val state: StateFlow<LiveTrafficSnapshot> = _state.asStateFlow()

    fun update(transform: (LiveTrafficSnapshot) -> LiveTrafficSnapshot) {
        _state.update(transform)
    }

    fun resetSession() {
        _state.update {
            it.copy(
                peakDownBytesPerSec = 0L,
                peakUpBytesPerSec = 0L,
                sessionWifiBytes = 0L,
                sessionMobileBytes = 0L,
                historyDownMbps = emptyList(),
                historyUpMbps = emptyList()
            )
        }
    }
}
