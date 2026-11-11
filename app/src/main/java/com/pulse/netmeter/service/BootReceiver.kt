package com.pulse.netmeter.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.pulse.netmeter.data.StorageRepository

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action == Intent.ACTION_BOOT_COMPLETED) {
            val repo = StorageRepository(context)
            if (repo.autoStartOnBoot) {
                runCatching { SpeedMeterService.start(context) }
            }
        }
    }
}
