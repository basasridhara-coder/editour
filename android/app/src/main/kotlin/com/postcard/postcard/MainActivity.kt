package com.postcard.postcard

import android.media.MediaScannerConnection
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File

class MainActivity : FlutterActivity() {
    private val CHANNEL = "com.postcard.app/gallery"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL).setMethodCallHandler { call, result ->
            if (call.method == "scanFile") {
                val path = call.argument<String>("path")
                if (path != null) {
                    try {
                        MediaScannerConnection.scanFile(
                            applicationContext,
                            arrayOf(path),
                            arrayOf("image/png")
                        ) { _, _ -> }
                        result.success(true)
                    } catch (e: Exception) {
                        result.error("SCAN_ERROR", e.message, null)
                    }
                } else {
                    result.error("INVALID_PATH", "Path was null", null)
                }
            } else {
                result.notImplemented()
            }
        }
    }
}
