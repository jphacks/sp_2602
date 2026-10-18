package dev.hackathon.kit.kitnative.engine

import java.text.Normalizer
import java.util.Locale

// 制限する Web サイト（docs/decisions.md D-111）の純粋な規則。JVM のテスト（WebSitesTest）で確かめる。
//   - 登録の形のそろえ方（normalizePattern）と、アドレス欄の文字が登録に当たるか（matches）は、
//     JS の contracts/web-sites.ts と同じ規則。同じ例の表（src/test/resources/web-site-cases.tsv）を両方のテストが読む。
//     片方を変えたら、もう片方と表も直す。
//   - 止めるかの判定（WebBlockRules.blockedPattern）と、出しすぎない間隔（WebBlockGate）
// 参考にしたもの: SelfLock（https://github.com/EtashTyagi/SelfLock 。MIT License, Copyright (c) 2026 Etash Tyagi。
//   全文は modules/kit-native/LICENSE-SelfLock）の util/BrowserUrlParser.kt（アドレス欄の文字からドメインを取り出す）と
//   SelfLockAccessibilityService.kt の looksLikeNavigatedUrl（アドレスらしい文字か）・ドメインの一致（同じか「.＋登録」で終わる）。
//   Slope ではパスの前置き（youtube.com/shorts）を足し、java.net.URI に頼らず自分で区切る（入力中の半端な文字で例外にしないため）。
object WebSites {
  const val MAX_PATTERN_LENGTH = 200

  // ドメインの1つの区切り・最後の区切り・パスに使ってよい文字（contracts/web-sites.ts の LABEL・TLD・PATH と同じ）
  private val LABEL = Regex("^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")
  private val TLD = Regex("^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$")
  private val PATH = Regex("^[a-z0-9\\-._~!$&'()*+,;=:@%/]*$")
  private val SCHEME = Regex("^([a-z][a-z0-9+.\\-]*)://")
  private val SPACE = Regex("\\s")

  private fun validHost(host: String): Boolean {
    val labels = host.split('.')
    return labels.size >= 2 && labels.all { LABEL.matches(it) } && TLD.matches(labels.last())
  }

  // 保護者が打った文字 → 登録の形（"youtube.com" / "youtube.com/shorts"）。そろえられなければ null。
  // 端末はサーバでそろえた形を受け取るが、念のためもう一度そろえ、そろわないものは使わない（EngineStore.restrictionFromJson）
  fun normalizePattern(input: String): String? {
    var s = Normalizer.normalize(input, Normalizer.Form.NFKC).trim().lowercase(Locale.ROOT)
    if (s.isEmpty() || SPACE.containsMatchIn(s)) return null
    SCHEME.find(s)?.let { m ->
      val scheme = m.groupValues[1]
      if (scheme != "http" && scheme != "https") return null
      s = s.substring(m.value.length)
    }
    if (s.contains('?') || s.contains('#')) return null
    val slash = s.indexOf('/')
    var host = if (slash < 0) s else s.substring(0, slash)
    var path = if (slash < 0) "" else s.substring(slash)
    if (host.contains('@') || host.contains(':')) return null
    host = host.trimEnd('.')
    if (host.startsWith("www.")) host = host.substring(4)
    if (host.any { it.code > 0x7f }) return null
    if (host.length > 253 || !validHost(host)) return null
    path = path.trimEnd('/')
    if (!PATH.matches(path)) return null
    val pattern = host + path
    return if (pattern.length > MAX_PATTERN_LENGTH) null else pattern
  }

  // アドレス欄の文字 → ドメインとパス（パスがなければ "/"）。アドレスらしくなければ null（判定しない）
  // 空白が入る = 検索の言葉を入れている途中など。http(s) 以外（chrome:// など）も判定しない
  fun parseAddress(text: String): Pair<String, String>? {
    var s = text.trim().lowercase(Locale.ROOT)
    if (s.isEmpty() || SPACE.containsMatchIn(s)) return null
    SCHEME.find(s)?.let { m ->
      val scheme = m.groupValues[1]
      if (scheme != "http" && scheme != "https") return null
      s = s.substring(m.value.length)
    }
    val end = s.indexOfFirst { it == '/' || it == '?' || it == '#' }
    var host = if (end < 0) s else s.substring(0, end)
    val rest = if (end < 0) "" else s.substring(end)
    val at = host.lastIndexOf('@') // user@host の形（"youtube.com@evil.example" の本当の行き先は evil.example）
    if (at >= 0) host = host.substring(at + 1)
    host = host.replace(Regex(":\\d*$"), "").trimEnd('.')
    if (!validHost(host)) return null
    val q = rest.indexOfFirst { it == '?' || it == '#' }
    val path = if (q < 0) rest else rest.substring(0, q)
    return host to path.ifEmpty { "/" }
  }

  // アドレス欄の文字が、登録の1つに当たるか（pattern はそろえた形）
  fun matches(address: String, pattern: String): Boolean {
    val (host, path) = parseAddress(address) ?: return false
    val slash = pattern.indexOf('/')
    val pHost = if (slash < 0) pattern else pattern.substring(0, slash)
    val prefix = if (slash < 0) "" else pattern.substring(slash)
    if (host != pHost && !host.endsWith(".$pHost")) return false
    if (prefix.isEmpty()) return true
    // パスの区切りで比べる（"/shorts" は "/shorts"・"/shorts/abc" に当たり、"/shortstory" には当たらない）
    return path == prefix || path.startsWith("$prefix/")
  }

  fun firstMatch(address: String, patterns: List<String>): String? = patterns.firstOrNull { matches(address, it) }
}

// 止めるかの判定（純粋な関数）。WebGuardService がブラウザのアドレス欄の文字を読んだたびに呼ぶ。
// 止めるのは、次が全部そろったときだけ（C4 と同じく、上限なし・未設定・空白期間・ルールが分からない日は止めない）:
//   - 見守りが動いている（ログアウトしていない）
//   - 今日の使用量のまとめ（EngineStore の today_usage。監視の Service が 15〜30 秒ごとに書く）が今日の分で、上限に達している
//   - アドレス欄が入力中（focused）でない（打っている途中の文字で止めない）
//   - アドレス欄の文字が登録の1つに当たる
object WebBlockRules {
  // 当たった登録を返す（止めないなら null）
  fun blockedPattern(
    address: String?,
    addressFocused: Boolean,
    rule: Restriction?,
    today: TodaySummary?,
    todayDate: String,
    engineEnabled: Boolean,
  ): String? {
    if (!isActive(rule, today, todayDate, engineEnabled)) return null
    if (address.isNullOrEmpty() || addressFocused) return null
    return WebSites.firstMatch(address, rule!!.blockedSites)
  }

  // 今止める状態か（アドレス欄を読む前に確かめる。違えば画面の中を読まずに済む）
  fun isActive(rule: Restriction?, today: TodaySummary?, todayDate: String, engineEnabled: Boolean): Boolean {
    if (!engineEnabled || rule == null || rule.blockedSites.isEmpty()) return false
    if (today == null || today.date != todayDate) return false
    return today.reached
  }
}

// 出しすぎない間隔（LimitRules の PromptThrottle と同じ考え方）。
//   戻す: 同じ登録には backGapMs（既定 2 秒）あける。戻したあとも、前のページのアドレスが少しのあいだ届くので、
//         続けて戻して2つ前・ブラウザの外まで戻らないようにする
//   案内（子11）: 同じ登録には promptGapMs（既定 60 秒）、どの登録でも anyPromptGapMs（既定 10 秒）あける（PromptThrottle）。
//         案内を閉じたあとすぐ同じサイトを開いたときは、戻すだけにする（案内を出し続けて端末が使えなくならないように）
// TODO(未決): 間隔の長さ（実機で子どもに試してもらって決める。PromptThrottle と同じ）
class WebBlockGate(
  private val backGapMs: Long = 2_000L,
  promptGapMs: Long = 60_000L,
  anyPromptGapMs: Long = 10_000L,
) {
  data class Action(val back: Boolean, val prompt: Boolean)

  private val lastBack = HashMap<String, Long>()
  private val prompts = PromptThrottle(promptGapMs, anyPromptGapMs)

  fun decide(pattern: String, now: Long): Action {
    val last = lastBack[pattern]
    if (last != null && now - last < backGapMs) return Action(back = false, prompt = false)
    lastBack[pattern] = now
    val key = "site:$pattern"
    val prompt = prompts.allow(key, now)
    if (prompt) prompts.record(key, now)
    return Action(back = true, prompt = prompt)
  }

  // 日付が変わったときなどに、覚えた時刻を消す
  fun reset() {
    lastBack.clear()
    prompts.reset()
  }
}
