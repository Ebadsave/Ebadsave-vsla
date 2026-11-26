package expo.modules.ebadsavesms

import android.Manifest
import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.telephony.SmsManager
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/**
 * Sends a text through the phone's own SIM with SmsManager. No internet, no gateway.
 * The promise resolves "sent" once the radio has accepted every message part, and
 * rejects with a code (E_NO_PERMISSION, E_NO_SIGNAL, E_RADIO_OFF, E_GENERIC, E_TIMEOUT...)
 * so the app can mark that member as Failed and carry on.
 */
class EbadsaveSmsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("EbadsaveSms")

    AsyncFunction("sendSms") { phone: String, message: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("E_NO_CONTEXT", "App context is not available.", null)
        return@AsyncFunction
      }
      if (ContextCompat.checkSelfPermission(context, Manifest.permission.SEND_SMS)
        != PackageManager.PERMISSION_GRANTED
      ) {
        promise.reject("E_NO_PERMISSION", "SEND_SMS permission was not granted.", null)
        return@AsyncFunction
      }
      sendThroughSim(context, phone, message, promise)
    }
  }

  private fun smsManager(context: Context): SmsManager =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      context.getSystemService(SmsManager::class.java)
    } else {
      @Suppress("DEPRECATION") SmsManager.getDefault()
    }

  private fun sendThroughSim(context: Context, phone: String, message: String, promise: Promise) {
    try {
      val manager = smsManager(context)
      val parts = manager.divideMessage(message)
      val total = parts.size
      val action = "expo.modules.ebadsavesms.SENT_" + UUID.randomUUID()
      val finished = AtomicBoolean(false)
      val received = AtomicInteger(0)
      val handler = Handler(Looper.getMainLooper())
      var receiver: BroadcastReceiver? = null

      fun finish(error: Pair<String, String>?) {
        if (!finished.compareAndSet(false, true)) return
        handler.removeCallbacksAndMessages(null)
        try { receiver?.let { context.unregisterReceiver(it) } } catch (_: Exception) {}
        if (error == null) promise.resolve("sent") else promise.reject(error.first, error.second, null)
      }

      val sentReceiver = object : BroadcastReceiver() {
        override fun onReceive(c: Context?, intent: Intent?) {
          if (resultCode != Activity.RESULT_OK) {
            val code = when (resultCode) {
              SmsManager.RESULT_ERROR_NO_SERVICE -> "E_NO_SIGNAL"
              SmsManager.RESULT_ERROR_RADIO_OFF -> "E_RADIO_OFF"
              SmsManager.RESULT_ERROR_NULL_PDU -> "E_BAD_NUMBER"
              else -> "E_GENERIC"
            }
            finish(Pair(code, "SMS was not sent (code $resultCode)."))
          } else if (received.incrementAndGet() >= total) {
            finish(null)
          }
        }
      }
      receiver = sentReceiver
      ContextCompat.registerReceiver(
        context, sentReceiver, IntentFilter(action), ContextCompat.RECEIVER_NOT_EXPORTED,
      )

      val flags = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_ONE_SHOT
      val sentIntents = ArrayList<PendingIntent>()
      for (i in 0 until total) {
        val intent = Intent(action).setPackage(context.packageName)
        sentIntents.add(PendingIntent.getBroadcast(context, i, intent, flags))
      }

      handler.postDelayed({ finish(Pair("E_TIMEOUT", "The phone did not confirm the SMS in time.")) }, 45_000)

      if (total == 1) {
        manager.sendTextMessage(phone, null, message, sentIntents[0], null)
      } else {
        manager.sendMultipartTextMessage(phone, null, parts, sentIntents, null)
      }
    } catch (e: SecurityException) {
      promise.reject("E_NO_PERMISSION", "SEND_SMS permission was refused.", e)
    } catch (e: IllegalArgumentException) {
      promise.reject("E_BAD_NUMBER", "Invalid phone number or message.", e)
    } catch (e: Exception) {
      promise.reject("E_GENERIC", e.message ?: "SMS failed.", e)
    }
  }
}
