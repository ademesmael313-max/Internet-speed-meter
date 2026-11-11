package com.pulse.netmeter

import com.pulse.netmeter.model.SpeedUnit
import com.pulse.netmeter.util.FormatUtils
import org.junit.Assert.assertEquals
import org.junit.Test

class FormatUtilsTest {

    @Test
    fun bytesToMbps_convertsAccurately() {
        assertEquals(100.0, FormatUtils.bytesToMbps(12_500_000L, 1.0), 0.001)
        assertEquals(0.0, FormatUtils.bytesToMbps(0L, 5.0), 0.001)
    }

    @Test
    fun formatSpeedValue_handlesUnits() {
        assertEquals("80.00", FormatUtils.formatSpeedValue(80.0, SpeedUnit.MBPS))
        assertEquals("10.00", FormatUtils.formatSpeedValue(80.0, SpeedUnit.MB_PER_SEC))
        assertEquals("245.6", FormatUtils.formatSpeedValue(245.64, SpeedUnit.MBPS))
    }

    @Test
    fun formatRateCompact_scalesForStatusBarIcon() {
        assertEquals("512" to "B/s", FormatUtils.formatRateCompact(512L))
        assertEquals("256" to "KB/s", FormatUtils.formatRateCompact(256L * 1024L))
        assertEquals("2.5" to "MB/s", FormatUtils.formatRateCompact((2.5 * 1024 * 1024).toLong()))
    }

    @Test
    fun computeJitter_and_bufferbloatGrade_workAsExpected() {
        val jitter = FormatUtils.computeJitter(listOf(10.0, 14.0, 12.0, 18.0))
        assertEquals(4.0, jitter, 0.001)
        assertEquals("A", FormatUtils.bufferbloatGrade(12.0, 15.0))
        assertEquals("C", FormatUtils.bufferbloatGrade(12.0, 35.0))
        assertEquals("F", FormatUtils.bufferbloatGrade(12.0, 110.0))
    }
}
