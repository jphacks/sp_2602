package dev.hackathon.kit.kitnative.engine

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.Log
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

// 合言葉（ログインのトークン）を端末に置く前に封をする（セキュリティ検査 PII-05 / AND-05 / IPA-13）。
// 前は Kotlin の EngineStore（shared_prefs/slope_engine.xml）にも、JS の AsyncStorage（databases/RKStorage）にも平文で置いていた。
// 鍵は Android Keystore の AES-256-GCM（端末から取り出せない。アプリを消す・データを消すと鍵も消え、封をした値は開けなくなる
// = ログインし直し）。封をした値の形: "sb1:" + Base64(IV 12 バイト + 暗号文と認証タグ)。
// JS からは KitNativeModule の sealSecret / openSecret で使う（src/lib/session-store.ts）。
// 鍵は1つ（ALIAS）を JS の Session と Kotlin の report_token（EngineStore）が共用している。
object SecretBox {
  private const val TAG = "SlopeSecretBox"
  private const val KEYSTORE = "AndroidKeyStore"
  private const val ALIAS = "slope_secret_v1"
  private const val PREFIX = "sb1:"
  private const val IV_BYTES = 12
  private const val TAG_BITS = 128

  // 封をした値の形か（平文の古い値と見分けるため）
  fun isSealed(value: String): Boolean = value.startsWith(PREFIX)

  // 封をする。Keystore が使えないときは null（呼ぶ側は平文で置かずに、保存しないこと）
  // 鍵が壊れている（あるのに使えない）と、そのままでは毎回失敗して直らない。そこで失敗したら鍵を消して、新しい鍵で1回だけやり直す。
  //   鍵を作り直すと、同じ鍵で封をしたもう一方の値（JS の Session / Kotlin の report_token）は開けなくなるが、
  //   それぞれ既存の「開けない → 消す（JS: loadSession）・送らない（Kotlin: loadReporter が null）→ ログインし直し・JS が setStatusReporter で封をし直す」に落ちる。
  // 開ける側（open）の失敗では鍵を消さない（値の書き換え・一時的な失敗で消すと、他の値まで読めなくなるため）
  @Synchronized
  fun seal(plain: String): String? =
    trySeal(plain)
      ?: run {
        Log.w(TAG, "鍵を消して作り直します")
        deleteKey()
        trySeal(plain)
      }

  private fun trySeal(plain: String): String? =
    try {
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.ENCRYPT_MODE, key()) // IV は Keystore が毎回ランダムに作る
      val iv = cipher.iv
      val body = cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
      PREFIX + Base64.encodeToString(iv + body, Base64.NO_WRAP)
    } catch (e: Exception) {
      // 値や平文は書かない（例外の種類だけ）
      Log.w(TAG, "封ができませんでした（${e.javaClass.name}）")
      null
    }

  // 開ける。形が違う・鍵が違う（作り直された）・書き換えられているときは null
  @Synchronized
  fun open(sealed: String): String? {
    if (!isSealed(sealed)) return null
    return try {
      val bytes = Base64.decode(sealed.substring(PREFIX.length), Base64.NO_WRAP)
      if (bytes.size <= IV_BYTES) return null
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.DECRYPT_MODE, existingKey() ?: return null, GCMParameterSpec(TAG_BITS, bytes, 0, IV_BYTES))
      String(cipher.doFinal(bytes, IV_BYTES, bytes.size - IV_BYTES), Charsets.UTF_8)
    } catch (e: Exception) {
      Log.w(TAG, "封を開けられませんでした（${e.javaClass.name}）")
      null
    }
  }

  private fun existingKey(): SecretKey? {
    val ks = KeyStore.getInstance(KEYSTORE).apply { load(null) }
    return (ks.getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry)?.secretKey
  }

  private fun deleteKey() {
    try {
      KeyStore.getInstance(KEYSTORE).apply { load(null) }.deleteEntry(ALIAS)
    } catch (e: Exception) {
      Log.w(TAG, "鍵を消せませんでした（${e.javaClass.name}）")
    }
  }

  private fun key(): SecretKey =
    existingKey()
      ?: KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
        .apply {
          init(
            KeyGenParameterSpec
              .Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
              .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
              .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
              .setKeySize(256)
              .setRandomizedEncryptionRequired(true)
              .build(),
          )
        }.generateKey()
}
