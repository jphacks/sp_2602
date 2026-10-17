package dev.hackathon.kit.kitnative.engine

import android.content.Context
import android.content.Intent
import android.content.pm.ResolveInfo
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.Drawable
import android.util.Base64
import java.io.ByteArrayOutputStream
import java.security.MessageDigest

// Q15: ホーム画面に出るアプリ（ACTION_MAIN + CATEGORY_LAUNCHER）の一覧とアイコンを取る部品。JS の getLauncherApps が使い、
// JS が親16 の候補・保護者の画面のアイコンとしてサーバへ送る（送るのは packageName・表示名・アイコンだけ。docs/decisions.md D-110）。
// 見える範囲: QUERY_ALL_PACKAGES には頼らず、AndroidManifest の <queries>（MAIN + LAUNCHER）で見える分だけを読む。
//   なぜ: Google Play は QUERY_ALL_PACKAGES を限られた用途にしか認めない。子どもが開けるアプリ（＝ホーム画面に出るアプリ）
//   だけを候補にすれば足り、それは <queries> の宣言で見える。
// 数えないもの: Slope 自身（対象外にする意味がない）。ホーム画面に出ないもの（システムの部品など）は、そもそも見えない。
// アイコン: OS のアイコン（アダプティブアイコンも含む）を正方形の Bitmap に描いてから PNG にする（一辺 96px。20KB に収まらなければ
//   72px・48px と小さくする。どれでも収まらない・描けなければ null = 保護者の画面は仮のアイコンのまま）。

data class LauncherApp(
  val packageName: String,
  val label: String,
  val iconPng: String? = null, // PNG の base64（改行なし）
  val iconHash: String? = null, // PNG の中身の SHA-256（16進・小文字）。サーバも中身から計算し直して確かめる
)

// 一覧を整える純粋な部分（Android の API に頼らないので JVM のテストで確かめられる。EngineRulesTest）
object LauncherAppList {
  // 表示名の長さの上限。contracts/schemas.ts の ChildApp.label（120 文字）と同じ（長い名前で送信が断られないように）
  const val MAX_LABEL = 120

  // 生の一覧 → 送る一覧。
  //   - 同じアプリに入口（ホーム画面のアイコン）が2つ以上あっても1つにまとめる（先に見えた方を使う）
  //   - Slope 自身と、空の packageName は入れない
  //   - 名前は前後の空白を除き、空なら packageName、長すぎれば切る
  //   - packageName の順に並べる（OS が返す順は毎回同じとは限らないので、JS が「前に送った中身と同じか」を比べられるように）
  fun normalize(raw: List<LauncherApp>, selfPackage: String): List<LauncherApp> {
    val byPackage = LinkedHashMap<String, LauncherApp>()
    for (app in raw) {
      val pkg = app.packageName.trim()
      if (pkg.isEmpty() || pkg == selfPackage || byPackage.containsKey(pkg)) continue
      byPackage[pkg] = app.copy(packageName = pkg, label = cleanLabel(app.label, pkg))
    }
    return byPackage.values.sortedBy { it.packageName }
  }

  // 画面に出す名前を整える（前後の空白を除く・空なら packageName・MAX_LABEL 文字で切る）
  fun cleanLabel(label: String, packageName: String): String {
    val trimmed = label.trim()
    val base = if (trimmed.isEmpty()) packageName else trimmed
    if (base.length <= MAX_LABEL) return base
    // サロゲートペア（絵文字など）の途中で切らない（半分だけの文字を送らないように）
    val end = if (Character.isHighSurrogate(base[MAX_LABEL - 1])) MAX_LABEL - 1 else MAX_LABEL
    return base.substring(0, end)
  }
}

// アイコンの大きさの決め方とハッシュ（純粋な部分。EngineRulesTest）
object AppIconCodec {
  // 1枚の上限（バイト）。contracts/schemas.ts の MAX_APP_ICON_BYTES と同じ（サーバが大きすぎるアイコンを断るため）
  const val MAX_BYTES = 20 * 1024

  // 試す一辺の大きさ（px）。保護者の画面のアイコンは 40dp ほどなので、96px あれば高い画素密度の画面でもぼやけにくい
  val SIZES = intArrayOf(96, 72, 48)

  // 大きい順に encode を試し、maxBytes 以下に収まった最初の PNG を返す。どれも収まらない・作れなければ null
  fun pick(sizes: IntArray, maxBytes: Int, encode: (Int) -> ByteArray?): ByteArray? {
    for (size in sizes) {
      val bytes = encode(size) ?: continue
      if (bytes.isNotEmpty() && bytes.size <= maxBytes) return bytes
    }
    return null
  }

  // SHA-256 の16進（小文字 64 文字）
  fun sha256Hex(bytes: ByteArray): String {
    val digest = MessageDigest.getInstance("SHA-256").digest(bytes)
    val sb = StringBuilder(digest.size * 2)
    for (b in digest) sb.append(String.format("%02x", b.toInt() and 0xff))
    return sb.toString()
  }
}

object LauncherApps {
  // 端末のホーム画面に出るアプリの一覧（packageName の順・アイコンつき）。OS のエラーはそのまま投げる（JS 側で unavailable にする）
  fun read(context: Context): List<LauncherApp> {
    val pm = context.packageManager
    val launcher = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
    // flags を数で渡す形は API 33 から非推奨（ResolveInfoFlags の形は API 33 から）。minSdk 24 でも動くように数の形を使う
    @Suppress("DEPRECATION")
    val found: List<ResolveInfo> = pm.queryIntentActivities(launcher, 0)
    val self = context.packageName
    val seen = HashSet<String>()
    val raw = ArrayList<LauncherApp>()
    for (ri in found) {
      val info = ri.activityInfo ?: continue
      val pkg = info.packageName ?: continue
      // 同じアプリの2つ目の入口・Slope 自身は、名前とアイコンを読む前に飛ばす（アイコンを描く手間を省く）
      if (pkg == self || !seen.add(pkg)) continue
      val appInfo = info.applicationInfo
      // アプリの名前（入口ごとの名前ではなく）。引けなければ空（→ packageName）
      val label =
        try {
          appInfo?.loadLabel(pm)?.toString() ?: ""
        } catch (e: Exception) {
          ""
        }
      val png =
        try {
          appInfo?.loadIcon(pm)?.let { icon -> AppIconCodec.pick(AppIconCodec.SIZES, AppIconCodec.MAX_BYTES) { renderPng(icon, it) } }
        } catch (e: Exception) {
          null
        }
      raw.add(
        LauncherApp(
          pkg,
          label,
          png?.let { Base64.encodeToString(it, Base64.NO_WRAP) },
          png?.let { AppIconCodec.sha256Hex(it) },
        ),
      )
    }
    return LauncherAppList.normalize(raw, self)
  }

  // Drawable（アダプティブアイコンも）を size×size の Bitmap に描いて PNG にする。描けなければ null
  private fun renderPng(icon: Drawable, size: Int): ByteArray? {
    return try {
      val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
      // OS が共有している Drawable の大きさを変えないよう、別の複製に描く
      val drawable = icon.constantState?.newDrawable()?.mutate() ?: icon
      drawable.setBounds(0, 0, size, size)
      drawable.draw(Canvas(bitmap))
      val out = ByteArrayOutputStream()
      val ok = bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
      bitmap.recycle()
      if (ok) out.toByteArray() else null
    } catch (e: Exception) {
      null
    }
  }
}
