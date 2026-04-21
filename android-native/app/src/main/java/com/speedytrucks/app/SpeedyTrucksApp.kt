package com.speedytrucks.app

import android.app.Application
import dagger.hilt.android.HiltAndroidApp
import timber.log.Timber

@HiltAndroidApp
class SpeedyTrucksApp : Application() {

    override fun onCreate() {
        super.onCreate()
        // Timber debug tree is planted only in debug builds.
        // In release builds, logs are stripped by ProGuard rules.
        if (BuildConfig.DEBUG) {
            Timber.plant(Timber.DebugTree())
        }
    }
}
