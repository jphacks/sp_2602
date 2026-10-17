// サーバのデータの置き場所（今はメモリの上だけ。サーバを止めると消える）。
// バックエンドは今はモックだが、「固定値を返すだけ」ではなく状態を持つので、2台の端末（親・子）で同じ開発サーバにつなげば
// QR の紐づけ〜計画〜利用記録の表示まで通して試せる。DB（backend/ の表）に移すときは、このクラスと同じ関数の形で作り直す。
// 持っているもの: 利用者（D1）・合言葉・ペアリング（QR）・家族のつながり（D2）・通常上限と計画（D8）・テスト期間（D3）・
//   空白期間（Q7）・日別上限（D6）・対象外アプリ（D7）・利用記録（D4。送信 ID で重複しない）・子どもの端末が使っている版（Q6）。
// 設定を変える操作は「写しを作って変える → C10 で日別上限を作り直す → 全部うまくいったら入れ替えて版を上げる」の1回の処理（Q5）。
//   途中で失敗したら前の状態のまま（DB のトランザクションの代わり）。
// MOCK=1 のときは、デモの3人（contracts/fixtures.ts の mockSessions）と、見本の計画・利用記録を用意する。
import { addDays, datesInRange, todayString } from "../../../contracts/dates";
import { demoUsageDay, mockSessions } from "../../../contracts/fixtures";
import type {
  BlankPeriod,
  ConfigResult,
  ConfigSnapshot,
  DailyLimit,
  DayLimit,
  ExcludedApp,
  ExcludedAppInput,
  LinkStatus,
  PairStatus,
  PairTicket,
  ParentUsageView,
  PlanSettings,
  PlanSettingsInput,
  Role,
  Session,
  TestPeriod,
  UsageDay,
  UsageDayReport,
  UsageUploadResult,
} from "../../../contracts/schemas";
import { isMock } from "../env";
import { AppError } from "../errors";
import { computeDailyLimits, type DailyLimitOptions, mergeWithFinalized, PlanCalcError } from "../plan/daily-limits";

// ── 決まりごと ──

// QR の有効期限は 10 分・1回だけ・出し直したら前の QR は無効（Q10）
export const PAIR_TTL_MS = 10 * 60_000;
// 合言葉の期限: 最後に使ってから30日（作り直し前の決定 10/17）
export const SESSION_IDLE_MS = 30 * 86_400_000;
// TODO(未決): C10 の日別上限を何日先まで作るか（図・仕様に数値がない）。今は今日から 120 日先まで
export const LIMIT_HORIZON_DAYS = 120;

export type StoreOptions = {
  now?: () => Date; // 時計（テストで差し替える）
  seed?: boolean; // デモの3人と見本のデータを入れるか（既定は MOCK=1 のとき）
  calcOptions?: DailyLimitOptions; // C10 の未決の点を変えて試すとき
};

type User = { userId: string; name: string; role: Role | null };
type SessionRow = { token: string; userId: string; lastUsedAt: number };
type Pair = {
  pairId: string;
  code: string;
  childUserId: string;
  childName: string;
  parentUserId: string | null;
  state: PairStatus["state"];
  expiresAt: number;
};
type ChildConfig = {
  configVersion: number;
  calculationVersion: number;
  usualLimitMinutes: number | null;
  plan: PlanSettings | null;
  testPeriods: TestPeriod[];
  blankPeriods: BlankPeriod[];
  dailyLimits: DailyLimit[];
  excludedApps: ExcludedApp[];
  childAppliedVersion: number | null;
};
type Batch = { childId: string; fingerprint: string; appliedDates: string[] };

const randomId = () => crypto.randomUUID();
// QR に入れる番号。推測されにくい長さにする（合言葉や個人情報は入れない）
const randomCode = () => `${randomId().replace(/-/g, "")}${randomId().replace(/-/g, "").slice(0, 8)}`;

const byStart = <T extends { startDate: string; id: string }>(a: T, b: T) =>
  a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : a.id < b.id ? -1 : 1;

// 利用記録の中身の指紋（同じ送信 ID の送り直しが、同じ中身かを比べる）
function fingerprintOf(days: UsageDayReport[]): string {
  const canon = [...days]
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((d) => ({
      ...d,
      apps: [...d.apps].sort((a, b) => (a.packageName < b.packageName ? -1 : 1)),
    }));
  return JSON.stringify(canon);
}

const versionConflict = () =>
  new AppError("conflict", "ほかの端末で先に変更されました", "画面を更新して、もう一度変更してください");

const oneToOne = () =>
  new AppError(
    "conflict",
    "すでにほかの家族と連携しています",
    "いまは保護者1人と子ども1人だけで連携できます（2人目は連携できません）",
  );

export class MemoryStore {
  private readonly now: () => Date;
  private readonly calcOptions: DailyLimitOptions;
  private users = new Map<string, User>();
  private googleUsers = new Map<string, string>(); // Google の sub → userId
  private sessions = new Map<string, SessionRow>();
  private pairs = new Map<string, Pair>();
  private links = new Set<string>(); // `${parentId}|${childId}`
  private configs = new Map<string, ChildConfig>();
  private batches = new Map<string, Batch>();
  private usage = new Map<string, Map<string, UsageDayReport>>(); // childId → date → その日の正の記録
  private lastUploadedAt = new Map<string, string>();

  constructor(opts: StoreOptions = {}) {
    this.now = opts.now ?? (() => new Date());
    this.calcOptions = opts.calcOptions ?? {};
    if (opts.seed ?? isMock()) this.seedDemo();
  }

  private today(): string {
    return todayString(this.now());
  }

  // ── 利用者と合言葉 ──

  // MOCK のログイン。固定の3人（mockSessions）はその合言葉を、ほかの "mock-xxx" は xxx ごとの「はじめての人」を返す
  signInMock(idToken: string): Session {
    const fixed = mockSessions[idToken as keyof typeof mockSessions];
    if (fixed) {
      if (!this.users.has(fixed.userId))
        this.users.set(fixed.userId, { userId: fixed.userId, name: fixed.name, role: fixed.role });
      this.sessions.set(fixed.token, { token: fixed.token, userId: fixed.userId, lastUsedAt: this.now().getTime() });
      return this.sessionOf(fixed.token, fixed.userId);
    }
    const suffix = idToken.slice("mock-".length) || "anonymous";
    return this.signInGoogle(`mock:${suffix}`, `はじめての人（${suffix.slice(-4)}）`);
  }

  // Google で確かめた人に合言葉を出す。初めての人は登録する（role は null。紐づけで決まる）
  signInGoogle(sub: string, name: string): Session {
    let userId = this.googleUsers.get(sub);
    if (!userId) {
      userId = randomId();
      this.googleUsers.set(sub, userId);
      this.users.set(userId, { userId, name, role: null });
    }
    const token = randomId(); // TODO(未決): 本物の DB では合言葉をハッシュで保存する（作り直し前の方針）
    this.sessions.set(token, { token, userId, lastUsedAt: this.now().getTime() });
    return this.sessionOf(token, userId);
  }

  // 合言葉から呼んだ人を探す。30日使われていなければ無効。使うたびに期限を延ばす
  findSession(token: string): Session | null {
    const row = this.sessions.get(token);
    if (!row) return null;
    const now = this.now().getTime();
    if (now - row.lastUsedAt > SESSION_IDLE_MS) {
      this.sessions.delete(token);
      return null;
    }
    row.lastUsedAt = now;
    return this.sessionOf(token, row.userId);
  }

  private sessionOf(token: string, userId: string): Session {
    const user = this.users.get(userId);
    if (!user) throw new AppError("internal");
    return { token, userId, name: user.name, role: user.role };
  }

  private userOf(userId: string): User {
    const user = this.users.get(userId);
    if (!user) throw new AppError("not_found", "利用者が見つかりません");
    return user;
  }

  // ── QR の紐づけ（C1）──

  private hasChild(parentId: string): boolean {
    for (const key of this.links) if (key.startsWith(`${parentId}|`)) return true;
    return false;
  }

  private hasParent(childId: string): boolean {
    for (const key of this.links) if (key.endsWith(`|${childId}`)) return true;
    return false;
  }

  // 子ども: QR を出す。前に出した未使用の QR は無効にする（Q10）。すでに連携済みなら conflict（親1人↔子1人。Q2）
  pairStart(caller: Session, name?: string): PairTicket {
    if (caller.role === "parent")
      throw new AppError("conflict", "保護者の端末では QR を出せません", "子どもの端末で QR を出してください");
    if (this.hasParent(caller.userId)) throw oneToOne();
    const now = this.now().getTime();
    for (const p of this.pairs.values())
      if (p.childUserId === caller.userId && (p.state === "waiting" || p.state === "claimed")) p.state = "expired";
    const pair: Pair = {
      pairId: randomId(),
      code: randomCode(),
      childUserId: caller.userId,
      childName: name ?? caller.name,
      parentUserId: null,
      state: "waiting",
      expiresAt: now + PAIR_TTL_MS,
    };
    this.pairs.set(pair.pairId, pair);
    return { pairId: pair.pairId, code: pair.code, expiresAt: new Date(pair.expiresAt).toISOString() };
  }

  // 期限が過ぎていれば expired にする（聞かれたときに確かめる）
  private refreshExpiry(p: Pair): void {
    if ((p.state === "waiting" || p.state === "claimed") && this.now().getTime() > p.expiresAt) p.state = "expired";
  }

  private statusOf(p: Pair): PairStatus {
    return {
      pairId: p.pairId,
      state: p.state,
      child: { id: p.childUserId, name: p.childName },
      parentName: p.parentUserId ? (this.users.get(p.parentUserId)?.name ?? null) : null,
      expiresAt: new Date(p.expiresAt).toISOString(),
    };
  }

  // 自分が関わるペアリング（QR を出した子ども・読んだ保護者）だけ。ほかは not_found（ある・ないも漏らさない）
  private pairFor(caller: Session, pairId: string): Pair {
    const p = this.pairs.get(pairId);
    if (!p || (p.childUserId !== caller.userId && p.parentUserId !== caller.userId))
      throw new AppError("not_found", "このペアリングは見つかりません", "QR をもう一度出してください");
    this.refreshExpiry(p);
    return p;
  }

  pairStatus(caller: Session, pairId: string): PairStatus {
    return this.statusOf(this.pairFor(caller, pairId));
  }

  // 保護者: QR の番号を送る。同じ QR を2回読んでも、2回目は使用済み（conflict）になる
  pairClaim(caller: Session, code: string): PairStatus {
    if (caller.role === "child")
      throw new AppError("forbidden", "子どもの端末では QR を読み取れません", "保護者の端末で読み取ってください");
    const p = [...this.pairs.values()].find((x) => x.code === code);
    if (!p) throw new AppError("not_found", "この QR コードは使えません", "子どもの端末で QR を出し直してください");
    this.refreshExpiry(p);
    if (p.state === "expired")
      throw new AppError("conflict", "この QR コードは期限が切れています", "子どもの端末で QR を出し直してください");
    if (p.state !== "waiting")
      throw new AppError("conflict", "この QR コードはもう使われています", "子どもの端末で QR を出し直してください");
    if (p.childUserId === caller.userId)
      throw new AppError("conflict", "自分の QR コードは読み取れません", "保護者の端末で読み取ってください");
    if (this.hasChild(caller.userId) || this.hasParent(p.childUserId)) throw oneToOne();
    p.parentUserId = caller.userId;
    p.state = "claimed";
    return this.statusOf(p);
  }

  // 子ども: 「はい / いいえ」。はいなら役割と D2 のつながりを保存してから linked を返す（保存が確定するまで成功を返さない）
  pairConfirm(caller: Session, pairId: string, accept: boolean): PairStatus {
    const p = this.pairFor(caller, pairId);
    if (p.childUserId !== caller.userId)
      throw new AppError("forbidden", "QR を出した子どもだけが確定できます", "子どもの端末で確定してください");
    if (p.state === "expired")
      throw new AppError("conflict", "この QR コードは期限が切れています", "QR をもう一度出してください");
    if (p.state !== "claimed")
      throw new AppError(
        "conflict",
        "まだ保護者が読み取っていません",
        "保護者の端末で QR を読み取ってもらってください",
      );
    if (!accept) {
      p.state = "rejected";
      return this.statusOf(p);
    }
    const parentId = p.parentUserId as string;
    const parent = this.userOf(parentId);
    const child = this.userOf(p.childUserId);
    if (parent.role === "child" || child.role === "parent")
      throw new AppError("conflict", "役割が合わないため連携できません", "QR をもう一度出してください");
    // 読み取りから確定までの間に、どちらかが別の相手と連携していないかを確かめ直す（Q2）
    if (this.hasChild(parentId) || this.hasParent(child.userId)) throw oneToOne();
    // ここから先は失敗しない書き込みだけ（役割・つながり・設定の器・QR の使用済み）を、まとめて行う
    parent.role = "parent";
    child.role = "child";
    this.links.add(`${parentId}|${child.userId}`);
    this.configFor(child.userId);
    p.state = "linked";
    return this.statusOf(p);
  }

  // ── D2: 連携状態 ──

  isLinked(parentId: string, childId: string): boolean {
    return this.links.has(`${parentId}|${childId}`);
  }

  linkStatus(caller: Session): LinkStatus {
    const partners: LinkStatus["partners"] = [];
    for (const key of this.links) {
      const [parentId, childId] = key.split("|") as [string, string];
      if (parentId === caller.userId) {
        const c = this.users.get(childId);
        if (c) partners.push({ userId: c.userId, name: c.name, role: "child" });
      } else if (childId === caller.userId) {
        const pa = this.users.get(parentId);
        if (pa) partners.push({ userId: pa.userId, name: pa.name, role: "parent" });
      }
    }
    const role = this.users.get(caller.userId)?.role ?? null;
    return { state: partners.length > 0 ? "linked" : "unlinked", role, partners };
  }

  family(caller: Session): { children: { id: string; name: string }[] } {
    return {
      children: this.linkStatus(caller)
        .partners.filter((p) => p.role === "child")
        .map((p) => ({ id: p.userId, name: p.name })),
    };
  }

  // ── 子どもごとの設定（D3・D6・D7・D8・空白期間）──

  private configFor(childId: string): ChildConfig {
    let c = this.configs.get(childId);
    if (!c) {
      c = {
        configVersion: 0,
        calculationVersion: 0,
        usualLimitMinutes: null,
        plan: null,
        testPeriods: [],
        blankPeriods: [],
        dailyLimits: [],
        excludedApps: [],
        childAppliedVersion: null,
      };
      this.configs.set(childId, c);
    }
    return c;
  }

  // 設定を1回変える。版を確かめ、写しを変え、必要なら C10 で日別上限を作り直し、全部うまくいったら入れ替えて版を上げる（Q5・Q6）。
  // 途中で失敗したら（版のずれ・計算できない入力）何も変えずにエラーを投げる（前の正式な版を保つ。MVP_SPEC 4.4）
  private mutate(
    childId: string,
    expectedVersion: number,
    change: (draft: ChildConfig) => void,
    opts: { recalc: boolean },
  ): ChildConfig {
    const current = this.configFor(childId);
    if (current.configVersion !== expectedVersion) throw versionConflict();
    const draft: ChildConfig = structuredClone(current);
    change(draft);
    draft.testPeriods.sort(byStart);
    draft.blankPeriods.sort(byStart);
    if (opts.recalc) this.recalculate(draft);
    draft.configVersion = current.configVersion + 1;
    this.configs.set(childId, draft);
    return draft;
  }

  // C10: 今日から先の日別上限を作り直す（昨日以前の値は変えない。Q4）
  private recalculate(draft: ChildConfig): void {
    const today = this.today();
    let computed: DailyLimit[];
    try {
      computed = computeDailyLimits(
        {
          usualLimitMinutes: draft.usualLimitMinutes,
          plan: draft.plan,
          testPeriods: draft.testPeriods,
          blankPeriods: draft.blankPeriods,
        },
        today,
        addDays(today, LIMIT_HORIZON_DAYS),
        this.calcOptions,
      );
    } catch (e) {
      if (e instanceof PlanCalcError) throw new AppError("bad_request", e.message, "入力を見直してください");
      throw e;
    }
    draft.dailyLimits = mergeWithFinalized(draft.dailyLimits, computed, today);
    draft.calculationVersion += 1;
  }

  // 期間どうしが重ならないことを確かめる（C10 が計算できないため。TODO(未決): 重なりの扱いは MVP_SPEC 9章 High）
  private assertNoOverlap(periods: { id: string; name: string; startDate: string; endDate: string }[]): void {
    const sorted = [...periods].sort(byStart);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      if (prev && cur && cur.startDate <= prev.endDate)
        throw new AppError(
          "bad_request",
          `「${prev.name}」と期間が重なっています`,
          "ほかの期間と重ならない日付にしてください",
        );
    }
  }

  private changeOf(c: ChildConfig) {
    return { configVersion: c.configVersion, calculationVersion: c.calculationVersion };
  }

  planView(childId: string) {
    const c = this.configFor(childId);
    return {
      childId,
      plan: c.plan,
      usualLimitMinutes: c.usualLimitMinutes,
      configVersion: c.configVersion,
      childAppliedVersion: c.childAppliedVersion,
    };
  }

  // 計画の保存（Q14: 開始日・S・G が必須、G ≤ S は契約で、開始日は今日以降をここで確かめる）
  planSave(
    childId: string,
    expectedVersion: number,
    input: PlanSettingsInput & { usualLimitMinutes?: number },
    opts: { allowPastStart?: boolean } = {},
  ) {
    // TODO(未決): 始まった計画の S・G だけを変えたいとき、開始日が昨日以前になって保存できない（Q14 の「開始日は今日以降」をそのまま守っている）
    if (!opts.allowPastStart && input.planStartDate < this.today())
      throw new AppError("bad_request", "計画開始日は今日以降にしてください", "開始日を選び直してください");
    const next = this.mutate(
      childId,
      expectedVersion,
      (d) => {
        d.plan = {
          planStartDate: input.planStartDate,
          startLimitMinutes: input.startLimitMinutes,
          finalGoalMinutes: input.finalGoalMinutes,
          childId,
          version: expectedVersion + 1,
          updatedAt: this.now().toISOString(),
        };
        if (input.usualLimitMinutes !== undefined) d.usualLimitMinutes = input.usualLimitMinutes;
      },
      { recalc: true },
    );
    return { plan: next.plan as PlanSettings, usualLimitMinutes: next.usualLimitMinutes, ...this.changeOf(next) };
  }

  // 通常上限の保存（Q7: 親に決まったとき＝紐づけ直後に決める）
  usualLimitSave(childId: string, expectedVersion: number, usualLimitMinutes: number) {
    const next = this.mutate(
      childId,
      expectedVersion,
      (d) => {
        d.usualLimitMinutes = usualLimitMinutes;
      },
      { recalc: true },
    );
    return { usualLimitMinutes, ...this.changeOf(next) };
  }

  // ── D3: テスト期間（親子。作った人を残す。Q11）──

  testPeriods(childId: string) {
    const c = this.configFor(childId);
    return {
      childId,
      testPeriods: c.testPeriods,
      configVersion: c.configVersion,
      childAppliedVersion: c.childAppliedVersion,
    };
  }

  testPeriodCreate(
    caller: Session,
    childId: string,
    expectedVersion: number,
    input: { name: string; startDate: string; endDate: string },
  ) {
    const testPeriod: TestPeriod = {
      id: randomId(),
      ...input,
      createdByUserId: caller.userId,
      createdByRole: caller.role ?? "child",
    };
    const next = this.mutate(
      childId,
      expectedVersion,
      (d) => {
        d.testPeriods.push(testPeriod);
        this.assertNoOverlap(d.testPeriods);
      },
      { recalc: true },
    );
    return { testPeriod, ...this.changeOf(next) };
  }

  testPeriodUpdate(
    childId: string,
    expectedVersion: number,
    input: { id: string; name: string; startDate: string; endDate: string },
  ) {
    let saved: TestPeriod | null = null;
    const next = this.mutate(
      childId,
      expectedVersion,
      (d) => {
        const i = d.testPeriods.findIndex((t) => t.id === input.id);
        const old = d.testPeriods[i];
        if (!old) throw new AppError("not_found", "このテスト期間は見つかりません", "一覧を更新してください");
        saved = { ...old, ...input };
        d.testPeriods[i] = saved;
        this.assertNoOverlap(d.testPeriods);
      },
      { recalc: true },
    );
    return { testPeriod: saved as unknown as TestPeriod, ...this.changeOf(next) };
  }

  testPeriodDelete(childId: string, expectedVersion: number, id: string) {
    const next = this.mutate(
      childId,
      expectedVersion,
      (d) => {
        const before = d.testPeriods.length;
        d.testPeriods = d.testPeriods.filter((t) => t.id !== id);
        if (d.testPeriods.length === before)
          throw new AppError("not_found", "このテスト期間は見つかりません", "一覧を更新してください");
      },
      { recalc: true },
    );
    return { deletedId: id, ...this.changeOf(next) };
  }

  // ── 空白期間（Q7。親だけ。期間中は制限なし）──

  blankPeriods(childId: string) {
    const c = this.configFor(childId);
    return {
      childId,
      blankPeriods: c.blankPeriods,
      configVersion: c.configVersion,
      childAppliedVersion: c.childAppliedVersion,
    };
  }

  blankPeriodCreate(
    childId: string,
    expectedVersion: number,
    input: { name: string; startDate: string; endDate: string },
  ) {
    const blankPeriod: BlankPeriod = { id: randomId(), ...input };
    const next = this.mutate(
      childId,
      expectedVersion,
      (d) => {
        d.blankPeriods.push(blankPeriod);
        this.assertNoOverlap(d.blankPeriods);
      },
      { recalc: true },
    );
    return { blankPeriod, ...this.changeOf(next) };
  }

  blankPeriodUpdate(childId: string, expectedVersion: number, input: BlankPeriod) {
    const next = this.mutate(
      childId,
      expectedVersion,
      (d) => {
        const i = d.blankPeriods.findIndex((b) => b.id === input.id);
        if (i < 0) throw new AppError("not_found", "この空白期間は見つかりません", "一覧を更新してください");
        d.blankPeriods[i] = input;
        this.assertNoOverlap(d.blankPeriods);
      },
      { recalc: true },
    );
    return { blankPeriod: input, ...this.changeOf(next) };
  }

  blankPeriodDelete(childId: string, expectedVersion: number, id: string) {
    const next = this.mutate(
      childId,
      expectedVersion,
      (d) => {
        const before = d.blankPeriods.length;
        d.blankPeriods = d.blankPeriods.filter((b) => b.id !== id);
        if (d.blankPeriods.length === before)
          throw new AppError("not_found", "この空白期間は見つかりません", "一覧を更新してください");
      },
      { recalc: true },
    );
    return { deletedId: id, ...this.changeOf(next) };
  }

  // ── C9: 対象外アプリ ──

  excludedAppsView(childId: string) {
    const c = this.configFor(childId);
    return {
      childId,
      apps: c.excludedApps,
      configVersion: c.configVersion,
      childAppliedVersion: c.childAppliedVersion,
    };
  }

  excludedAppsSave(childId: string, expectedVersion: number, apps: ExcludedAppInput[]) {
    const next = this.mutate(
      childId,
      expectedVersion,
      (d) => {
        const before = new Map(d.excludedApps.map((a) => [a.packageName, a]));
        const unique = new Map(apps.map((a) => [a.packageName, a]));
        // 前から対象外だったアプリは、入った版（sinceVersion）を変えない
        d.excludedApps = [...unique.values()].map((a) => ({
          ...a,
          sinceVersion: before.get(a.packageName)?.sinceVersion ?? expectedVersion + 1,
        }));
      },
      { recalc: false }, // 対象外アプリは日別上限の計算に使わない（C3 で除くだけ）。版は上がる（Q6）
    );
    return { apps: next.excludedApps, configVersion: next.configVersion };
  }

  // ── C7: 設定のスナップショット ──

  // 子どもが呼んだときは、送られた knownVersion を「子どもの端末が使っている版」として覚える（Q6。親の「反映済み／反映待ち」に使う）
  configGet(caller: Session, childId: string, knownVersion?: number): ConfigResult {
    const c = this.configFor(childId);
    if (caller.role === "child" && knownVersion !== undefined && knownVersion <= c.configVersion)
      c.childAppliedVersion = knownVersion;
    if (knownVersion === c.configVersion) return { changed: false, configVersion: c.configVersion };
    const snapshot: ConfigSnapshot = structuredClone({
      childId,
      configVersion: c.configVersion,
      calculationVersion: c.calculationVersion,
      usualLimitMinutes: c.usualLimitMinutes,
      plan: c.plan,
      testPeriods: c.testPeriods,
      blankPeriods: c.blankPeriods,
      dailyLimits: c.dailyLimits,
      excludedApps: c.excludedApps,
      generatedAt: this.now().toISOString(),
    });
    return { changed: true, snapshot };
  }

  // ── C8: 利用記録 ──

  // 同じ送信 ID・同じ中身の送り直しは duplicate（二重に保存しない）。同じ送信 ID で中身が違えば conflict。
  // 日ごとに「測った時刻が一番新しい記録」を正とする（Q8。後から届いた古い記録で上書きしない）
  usageUpload(childId: string, submissionId: string, days: UsageDayReport[]): UsageUploadResult {
    const fingerprint = fingerprintOf(days);
    const seen = this.batches.get(submissionId);
    if (seen) {
      if (seen.childId !== childId || seen.fingerprint !== fingerprint)
        throw new AppError(
          "conflict",
          "同じ送信 ID で、違う内容の記録が届きました",
          "この記録は送り直さずに、新しい送信 ID で送ってください",
        );
      return { submissionId, status: "duplicate", appliedDates: seen.appliedDates };
    }
    let byDate = this.usage.get(childId);
    if (!byDate) {
      byDate = new Map();
      this.usage.set(childId, byDate);
    }
    const appliedDates: string[] = [];
    for (const day of days) {
      const current = byDate.get(day.date);
      if (!current || Date.parse(day.measuredAt) > Date.parse(current.measuredAt)) {
        byDate.set(day.date, day);
        appliedDates.push(day.date);
      }
    }
    this.batches.set(submissionId, { childId, fingerprint, appliedDates });
    this.lastUploadedAt.set(childId, this.now().toISOString());
    return { submissionId, status: "accepted", appliedDates };
  }

  // C6: 親が見る期間の実績と日別上限。記録がない日は recorded: false（0 分の記録と区別する）
  usageView(childId: string, from: string, to: string): ParentUsageView {
    const byDate = this.usage.get(childId) ?? new Map<string, UsageDayReport>();
    const limits = new Map(this.configFor(childId).dailyLimits.map((l) => [l.date, l]));
    const days: UsageDay[] = datesInRange(from, to).map((date) => {
      const rec = byDate.get(date);
      const l = limits.get(date);
      const limit: DayLimit | null = !l
        ? null
        : l.kind === "limited"
          ? { kind: "limited", limitMinutes: l.limitMinutes }
          : { kind: "unlimited", blankPeriodId: l.blankPeriodId };
      return {
        date,
        recorded: rec != null,
        usedMinutes: rec ? rec.restrictedMinutes : null,
        measuredAt: rec ? rec.measuredAt : null,
        limit,
        apps: rec ? [...rec.apps].sort((a, b) => b.usedMinutes - a.usedMinutes) : [],
      };
    });
    return { childId, from, to, days, lastUploadedAt: this.lastUploadedAt.get(childId) ?? null };
  }

  // ── MOCK の見本 ──

  // デモの3人（保護者・子ども・はじめての人）。保護者と子どもは連携済みで、通常上限・計画・テスト・対象外アプリ・過去6日の記録が入っている
  private seedDemo(): void {
    for (const idToken of Object.keys(mockSessions)) this.signInMock(idToken);
    const parent = mockSessions["mock-google-parent"];
    const childId = mockSessions["mock-google-child"].userId;
    this.links.add(`${parent.userId}|${childId}`);
    const today = this.today();
    const v1 = this.usualLimitSave(childId, 0, 180);
    // 見本として2週間前に始まった計画を入れる（画面の確認用。本物の保存では開始日は今日以降。Q14）
    const v2 = this.planSave(
      childId,
      v1.configVersion,
      { planStartDate: addDays(today, -14), startLimitMinutes: 300, finalGoalMinutes: 120 },
      { allowPastStart: true },
    );
    const parentSession = this.sessionOf(parent.token, parent.userId);
    this.testPeriodCreate(parentSession, childId, v2.configVersion, {
      name: "数学",
      startDate: addDays(today, 11),
      endDate: addDays(today, 13),
    });
    // 過去の日の上限も見本として入れる（本物では、その日に作られた値が確定値として残る）
    const config = this.configFor(childId);
    const past = computeDailyLimits(
      { usualLimitMinutes: 180, plan: config.plan, testPeriods: config.testPeriods, blankPeriods: [] },
      addDays(today, -14),
      addDays(today, -1),
      this.calcOptions,
    );
    config.dailyLimits = [...past, ...config.dailyLimits];
    this.excludedAppsSave(childId, config.configVersion, [
      { packageName: "com.example.studynote", label: "学習ノート" },
    ]);
    for (let i = 6; i >= 1; i--) {
      const date = addDays(today, -i);
      this.usageUpload(childId, randomId(), [demoUsageDay(date, `${date}T12:00:00.000Z`)]);
    }
  }
}

// プロセスに1つだけ持つ（開発中の再読み込みでも消えないよう globalThis に置く）
const g = globalThis as unknown as { __slopeStore?: MemoryStore };

export function getStore(): MemoryStore {
  g.__slopeStore ??= new MemoryStore();
  return g.__slopeStore;
}

// テスト用: 新しい store に入れ替える（時計・見本の有無を変えられる）
export function resetStore(opts: StoreOptions = {}): MemoryStore {
  g.__slopeStore = new MemoryStore(opts);
  return g.__slopeStore;
}
