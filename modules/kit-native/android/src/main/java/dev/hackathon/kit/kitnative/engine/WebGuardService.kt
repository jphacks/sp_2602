package dev.hackathon.kit.kitnative.engine

import android.accessibilityservice.AccessibilityService
import android.content.SharedPreferences
import android.os.Handler
import android.os.Looper
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

// 制限する Web サイト（docs/decisions.md D-111）を止めるユーザー補助のサービス。
// その日の上限に達したあと、子どもがブラウザで保護者の登録したサイトを開いたら:
//   1. ブラウザを1つ前の画面に戻す（GLOBAL_ACTION_BACK）
//   2. 少し待って、C4 と同じ「時間は終わりです」の画面（子11。LimitPrompt の道筋）を出す
//   同じサイトに続けて出しすぎない（WebBlockGate。LimitRules の PromptThrottle と同じ考え方）。
// 止めない: 上限なし・未設定・空白期間・ルールが分からない日・ログアウト後・アドレス欄が入力中（WebBlockRules）。
// 読むもの: ブラウザのアドレス欄の文字だけ（res/xml/slope_web_guard.xml の packageNames で、下の4つのブラウザの出来事しか届かない）。
//   ページの中身・ほかのアプリの画面は読まない。読んだアドレスは端末の外へ送らず、残しもしない。
// 判定の値: EngineStore の restriction（JS の saveRestriction。blockedSites）と today_usage（監視の Service が書く「上限に達したか」）。
//   値が変わったときだけ読み直す（出来事のたびに JSON を読まない）。上限に達していなければ、画面の中も読まない。
// 許可: 設定の「ユーザー補助」で Slope をオンにする（EnginePermissions.ACCESSIBILITY。子どものホームの案内カードから開く）。
// Android の制約（MVP_SPEC 2章「強制停止・常時遮断は保証しない」）: ここに挙げたブラウザ以外・アプリの中のブラウザ・
//   アドレス欄にドメインしか出さない設定のブラウザ（パスつきの登録が判定できない）では止められない。
// 参考にしたもの: SelfLock（https://github.com/EtashTyagi/SelfLock 。MIT License, Copyright (c) 2026 Etash Tyagi。
//   全文は modules/kit-native/LICENSE-SelfLock）の service/SelfLockAccessibilityService.kt（ブラウザごとのアドレス欄の id
//   browserUrlBarIds・入力中は判定しない・アドレス欄を id で探す）と res/xml/accessibility_service_config.xml。
//   Hilt・Room・VPN などの仕組みは持ち込まず、Slope の engine/ の作り（EngineStore・純粋な規則の関数）に合わせた。
class WebGuardService : AccessibilityService() {
  companion object {
    // ブラウザごとのアドレス欄の view id（SelfLock の browserUrlBarIds を出発点にした。ブラウザの版で変わることがある）。
    // ここのパッケージ名は res/xml/slope_web_guard.xml の packageNames と同じにする
    val URL_BAR_IDS: Map<String, List<String>> =
      mapOf(
        "com.android.chrome" to listOf("com.android.chrome:id/url_bar"),
        "com.sec.android.app.sbrowser" to listOf("com.sec.android.app.sbrowser:id/location_bar_edit_text"),
        "org.mozilla.firefox" to
          listOf(
            "org.mozilla.firefox:id/mozac_browser_toolbar_url_view",
            "org.mozilla.fenix:id/mozac_browser_toolbar_url_view",
            "org.mozilla.firefox:id/url_bar_title",
          ),
        "com.microsoft.emmx" to listOf("com.microsoft.emmx:id/url_bar"),
      )

    // 戻してから案内を出すまでの間（戻る動きの途中で画面を重ねると、戻るが効かないことがあるため）
    const val PROMPT_DELAY_MS = 300L

    // 開いたままのページを確かめ直す間隔（監視の Service が上限に達している間に確かめる間隔 INTERVAL_REACHED_MS と同じ）
    const val RECHECK_MS = 5_000L
  }

  // 一定の間隔で今の画面を確かめ直す。
  // なぜ: today_usage は中身が変わったときだけ書かれる（ブラウザを対象外アプリにすると、上限に達したあとも変わらない）ので、
  //   値の変化だけを頼りにすると、開いたままのページが止まらないことがある。上限に達していなければ画面を読まずに終わるので軽い
  private val recheck =
    object : Runnable {
      override fun run() {
        checkActiveWindow()
        main.postDelayed(this, RECHECK_MS)
      }
    }

  // 判定に使う値の写し（EngineStore の値が変わったら捨てて、次の出来事で読み直す）
  private data class State(val rule: Restriction?, val today: TodaySummary?, val enabled: Boolean)

  @Volatile
  private var state: State? = null
  private val main = Handler(Looper.getMainLooper())
  private val gate = WebBlockGate()
  private var gateDate: String? = null

  // SharedPreferences は受け手を弱い参照で持つので、フィールドに持ち続ける。
  // 値が変わったら写しを捨て、今前にある画面も確かめ直す。
  // なぜ: 出来事（アドレス欄・画面の変化）のときだけ確かめていたので、上限に達する前から開いていたページを、達したあとも
  //   そのまま見続けられた（実機 SC-53C）。監視の Service は上限に達している間 5 秒ごとに today_usage を確かめるので、
  //   ここで確かめ直せば（と下の 5 秒ごとの確かめ直しで）、開いたままのページも数秒で止まる（同じ登録に出しすぎないのは WebBlockGate のまま）
  private val storeListener =
    SharedPreferences.OnSharedPreferenceChangeListener { _, _ ->
      state = null
      main.post { checkActiveWindow() }
    }

  override fun onServiceConnected() {
    super.onServiceConnected()
    EngineStore.registerListener(this, storeListener)
    state = null
    main.removeCallbacks(recheck)
    main.postDelayed(recheck, RECHECK_MS)
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    val pkg = event?.packageName?.toString() ?: return
    if (pkg !in URL_BAR_IDS) return
    checkActiveWindow()
  }

  // 今前にある画面がブラウザなら、アドレス欄を読んで判定する（出来事のときと、判定の値が変わったときに呼ぶ）
  private fun checkActiveWindow() {
    val front = rootInActiveWindow ?: return
    val pkg = front.packageName?.toString() ?: return
    val ids = URL_BAR_IDS[pkg] ?: return
    val now = System.currentTimeMillis()
    val today = DayWindow.dateOf(now)
    if (today != gateDate) {
      gate.reset() // 日付が変わったら、前の日の時刻は忘れる
      gateDate = today
    }
    val s = currentState()
    // 上限に達していない・登録がない・ログアウト後なら、画面の中を読まずに終わる（ふだんはここで終わる）
    if (!WebBlockRules.isActive(s.rule, s.today, today, s.enabled)) return
    val bar = findUrlBar(front, ids) ?: return
    val pattern =
      WebBlockRules.blockedPattern(bar.text?.toString(), bar.isFocused, s.rule, s.today, today, s.enabled) ?: return
    val action = gate.decide(pattern, now)
    if (action.back) performGlobalAction(GLOBAL_ACTION_BACK)
    if (action.prompt) main.postDelayed({ showPrompt() }, PROMPT_DELAY_MS)
  }

  override fun onInterrupt() {
    // 読み上げなどの「中断」はない（何も出していない）
  }

  override fun onDestroy() {
    EngineStore.unregisterListener(this, storeListener)
    main.removeCallbacksAndMessages(null)
    super.onDestroy()
  }

  private fun currentState(): State =
    state ?: State(
      rule = EngineStore.loadRestriction(this),
      today = EngineStore.loadToday(this),
      enabled = EngineStore.isEngineEnabled(this),
    ).also { state = it }

  // アドレス欄を id で探す（最初に見つかったもの）
  private fun findUrlBar(root: AccessibilityNodeInfo, ids: List<String>): AccessibilityNodeInfo? {
    for (id in ids) {
      val nodes = root.findAccessibilityNodeInfosByViewId(id)
      if (!nodes.isNullOrEmpty()) return nodes[0]
    }
    return null
  }

  // C4 と同じ「時間は終わりです」（子11）。Slope の画面が前にあるときは JS の画面が自分で出すので出さない。
  // ユーザー補助のサービスは裏から画面を出してよい（重ねて表示の許可がなくても出す。出せなければ通知）
  private fun showPrompt() {
    if (AppVisibility.slopeInForeground) return
    LimitPrompt.show(this, canStartDirectly = true)
  }
}
