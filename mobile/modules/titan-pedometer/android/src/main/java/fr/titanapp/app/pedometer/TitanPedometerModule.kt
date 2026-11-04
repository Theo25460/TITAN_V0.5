package fr.titanapp.app.pedometer

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * TITAN's own pedometer: the phone's hardware step counter (TYPE_STEP_COUNTER), read on the device, with no third party.
 *
 * The sensor reports a cumulative total since the last boot. JavaScript keeps its own bookkeeping (per day, per account) from that total:
 *  - `readTotalAsync` answers the current cumulative total once, so steps taken while TITAN was closed are recovered when it opens;
 *  - the `onStep` event streams the total while the app is in the foreground, which makes the counter move as the person walks;
 *  - `bootEpochMs` lets JavaScript notice a reboot (the total restarts from zero).
 * The sensor is batched and very cheap: no foreground service, no wake lock, nothing runs when the app is not open.
 */
class TitanPedometerModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("React context lost")

  private val sensorManager: SensorManager
    get() = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager

  private val stepSensor: Sensor?
    get() = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)

  private var streaming: SensorEventListener? = null

  private fun startStreaming() {
    if (streaming != null) return
    val sensor = stepSensor ?: return
    val listener = object : SensorEventListener {
      override fun onSensorChanged(event: SensorEvent) {
        sendEvent(
          "onStep",
          mapOf(
            "total" to event.values[0].toDouble(),
            "at" to System.currentTimeMillis().toDouble()
          )
        )
      }

      override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
    }
    streaming = listener
    // Normal rate with no batching delay: a step shows up within about a second while the screen is on.
    sensorManager.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_NORMAL, 0)
  }

  private fun stopStreaming() {
    streaming?.let { sensorManager.unregisterListener(it) }
    streaming = null
  }

  override fun definition() = ModuleDefinition {
    Name("TitanPedometer")

    Events("onStep")

    Function("isAvailable") {
      stepSensor != null
    }

    // Wall-clock instant of the last boot: a different value means the cumulative total restarted.
    Function("bootEpochMs") {
      (System.currentTimeMillis() - SystemClock.elapsedRealtime()).toDouble()
    }

    // The current cumulative total, read once. The sensor reports on registration, so this normally answers at once.
    AsyncFunction("readTotalAsync") { timeoutMs: Int, promise: Promise ->
      val sensor = stepSensor
      if (sensor == null) {
        promise.reject("ERR_UNAVAILABLE", "No hardware step counter on this device", null)
      } else {
        val manager = sensorManager
        val handler = Handler(Looper.getMainLooper())
        var settled = false
        lateinit var listener: SensorEventListener

        fun finish(total: Double?) {
          if (settled) return
          settled = true
          manager.unregisterListener(listener)
          if (total != null) {
            promise.resolve(total)
          } else {
            promise.reject("ERR_TIMEOUT", "The step counter did not answer", null)
          }
        }

        listener = object : SensorEventListener {
          override fun onSensorChanged(event: SensorEvent) {
            finish(event.values[0].toDouble())
          }

          override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
        }
        manager.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_NORMAL, 0)
        handler.postDelayed({ finish(null) }, timeoutMs.toLong())
      }
      Unit
    }

    OnStartObserving {
      startStreaming()
    }

    OnStopObserving {
      stopStreaming()
    }

    OnDestroy {
      stopStreaming()
    }
  }
}
