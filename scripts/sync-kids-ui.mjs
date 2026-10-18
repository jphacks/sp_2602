// 子ども用の新しい部品（ブラウザの確認ページで作っているもの）を、アプリの中（src/kids/）へ写す道具。
//   元: tmp/animations/rnweb/whiteboard/ の theme/・tools/・marker/・chalk/・pencil/・assets/・components/
//   先: src/kids/ の同じ名前のフォルダ（部品は src/kids/components/…）
// 使い方（リポジトリの一番上で）:
//   node scripts/sync-kids-ui.mjs              写し直す（何度でもよい。黒板・ノートができたら、また写す）
//   node scripts/sync-kids-ui.mjs --dry-run    何を写すか・import の書き換えに困る所がないかだけ見る（何も書かない）
//   node scripts/sync-kids-ui.mjs --from <道>  元のフォルダを指定する（既定は下の findSource）
//   node scripts/sync-kids-ui.mjs --force      写した先を手で直していても上書きする（ふだんは止まって知らせる）
// なぜ写すのか: 元は確認ページ（react-native-web・作り物の端末とサーバ）で、ほかの担当がまだ作っている最中。
//   アプリの画面はそのまま、部品だけを差し替えて端末で動かしたいので、元を変えずに写して import だけ直す。
//   写した先は直さない（直すなら元を直して写し直す）。手で直したまま写し直すと消えるので、写したときの中身の指紋を
//   src/kids/sync-manifest.json に残し、次に写すときに違っていたら止まる。
// import の書き換えの決まり（確認ページの build.mjs の差し替えを、アプリの中の決まりに直したもの）:
//   1. "@app-src/X"          → "@/X"（作り物の中からアプリの本物を読む書き方。アプリでは本物そのもの）
//   2. "@/components[/X]"    → 新しい部品（元の components/X）があれば "@/kids/components[/X]"、なければそのまま（アプリの元の部品・計算）
//   3. "@/lib/X"             → src/kids/lib/X（アプリ用の中継ぎ。手で書いたもの）があればそれ、なければそのまま（アプリの本物）。
//                              確認ページでは作り物（stubs/lib/）を読んでいるが、アプリでは本物を読む
//   4. react-native の Text・TextInput → "@/kids/lib/text"（書体の名前と太さを、読み込んだ書体の名前に直す。Android は太さを名前で分けるため）
//   5. "./x" "../x"          → そのまま（写す範囲の外を指していたら止める）
//   6. 作り物（stubs/・scenes/・demo）を読んでいたら止める
// 写したあと biome で形をそろえる（npm run lint を通すため。決まりそのものは変えない）。
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// 写すフォルダ（元と先で同じ名前）
export const DIRS = ["theme", "tools", "marker", "chalk", "pencil", "assets", "components"];
// 写す拡張子。.mjs（画像やアイコンを作る道具）・.md（表現の書き出し）は確認ページの側のものなので写さない
const CODE = new Set([".ts", ".tsx"]);
const COPY = new Set([".ts", ".tsx", ".json", ".png", ".jpg", ".jpeg", ".webp"]);
const EXTS = [".tsx", ".ts", ".js", ".json"];
const ORIGIN = "tmp/animations/rnweb/whiteboard";
const MANIFEST = "sync-manifest.json";

export const header = (rel) =>
  `// ${ORIGIN}/${rel} から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。\n`;

// dir/rel（拡張子なし）に当たるファイル。なければ null
function findIn(dir, rel, exists = fs.existsSync) {
  for (const base of [path.join(dir, rel), path.join(dir, rel, "index")]) {
    if (/\.[a-z]+$/.test(rel) && exists(base) && !fs.statSync(base).isDirectory()) return base;
    for (const e of EXTS) if (exists(base + e)) return base + e;
  }
  return null;
}

// 1つの import の行き先を書き換える。返すのは { spec, error }
//   ctx.hasKidsComponent(rel) … 元の components/ に rel の部品があるか
//   ctx.hasKidsLib(rel)       … src/kids/lib/ に rel の中継ぎがあるか
export function rewriteSpecifier(spec, ctx) {
  if (/(^|\/)(stubs|scenes)(\/|$)|(^|\/)(demo|scene-type|kit-check-entry)$/.test(spec))
    return { spec, error: `確認ページの作り物を読んでいる: "${spec}"` };
  if (spec.startsWith("@app-src/")) return { spec: `@/${spec.slice("@app-src/".length)}` };
  if (spec === "@/components" || spec.startsWith("@/components/")) {
    const rel = spec.slice("@/components".length).replace(/^\//, "");
    if (ctx.hasKidsComponent(rel || "index")) return { spec: rel ? `@/kids/components/${rel}` : "@/kids/components" };
    return { spec };
  }
  if (spec.startsWith("@/lib/")) {
    const rel = spec.slice("@/lib/".length);
    if (ctx.hasKidsLib(rel)) return { spec: `@/kids/lib/${rel}` };
    return { spec };
  }
  return { spec };
}

// Text・TextInput（値として読むもの）を react-native の import から抜き出す
const MOVE_FROM_RN = new Set(["Text", "TextInput"]);
export const TEXT_MODULE = "@/kids/lib/text";

// 1つのファイルの中身を書き換える。返すのは { text, errors, specs }（specs は書き換えたあとの行き先の一覧）
export function rewriteSource(text, fileName, ctx) {
  const ts = require("typescript");
  const sf = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const edits = []; // { start, end, text }
  const errors = [];
  const specs = [];
  const editSpec = (lit) => {
    const r = rewriteSpecifier(lit.text, ctx);
    if (r.error) errors.push(r.error);
    specs.push(r.spec);
    if (r.spec !== lit.text) edits.push({ start: lit.getStart(sf) + 1, end: lit.getEnd() - 1, text: r.spec });
  };
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const lit = node.moduleSpecifier;
      if (ts.isImportDeclaration(node) && lit.text === "react-native" && moveTextImports(ts, sf, node, edits)) {
        specs.push("react-native", TEXT_MODULE);
        return;
      }
      editSpec(lit);
      return;
    }
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal))
      editSpec(node.argument.literal);
    if (ts.isCallExpression(node) && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) {
      const callee = node.expression;
      if (callee.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(callee) && callee.text === "require"))
        editSpec(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  edits.sort((a, b) => b.start - a.start);
  let out = text;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return { text: out, errors, specs };
}

// import { StyleSheet, Text, View } from "react-native" → import { StyleSheet, View } from "react-native"; import { Text } from "@/kids/lib/text";
function moveTextImports(ts, sf, node, edits) {
  const clause = node.importClause;
  if (!clause || clause.isTypeOnly || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) return false;
  const elements = clause.namedBindings.elements;
  const moved = elements.filter((el) => !el.isTypeOnly && MOVE_FROM_RN.has((el.propertyName ?? el.name).text));
  if (moved.length === 0) return false;
  const kept = elements.filter((el) => !moved.includes(el)).map((el) => el.getText(sf));
  const def = clause.name ? clause.name.getText(sf) : null;
  const lines = [];
  if (def || kept.length > 0)
    lines.push(
      `import ${[def, kept.length > 0 ? `{ ${kept.join(", ")} }` : null].filter(Boolean).join(", ")} from "react-native";`,
    );
  lines.push(`import { ${moved.map((el) => el.getText(sf)).join(", ")} } from "${TEXT_MODULE}";`);
  edits.push({ start: node.getStart(sf), end: node.getEnd(), text: lines.join("\n") });
  return true;
}

// 元のフォルダ: --from があればそれ。なければ、このリポジトリの tmp/、それもなければ本体の作業フォルダ（git worktree の最初）の tmp/
function findSource(arg) {
  if (arg) return path.resolve(arg);
  const own = path.join(repo, ORIGIN);
  if (fs.existsSync(own)) return own;
  try {
    const out = execFileSync("git", ["-C", repo, "worktree", "list", "--porcelain"], { encoding: "utf8" });
    const main = out
      .split(/\r?\n/)
      .find((l) => l.startsWith("worktree "))
      ?.slice("worktree ".length);
    if (main) return path.join(main, ORIGIN);
  } catch {}
  return own;
}

function listFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else out.push(path.relative(root, p).split(path.sep).join("/"));
    }
  };
  for (const d of DIRS) if (fs.existsSync(path.join(root, d))) walk(path.join(root, d));
  return out.sort();
}

const sha = (buf) => createHash("sha256").update(buf).digest("hex");

function main() {
  const args = process.argv.slice(2);
  const opt = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const dry = args.includes("--dry-run");
  const force = args.includes("--force");
  const from = findSource(opt("--from"));
  const dest = path.join(repo, "src", "kids");
  if (!fs.existsSync(path.join(from, "components"))) {
    console.error(`元のフォルダが見つからない: ${from}（--from で指定する）`);
    process.exit(1);
  }

  const all = listFiles(from);
  const files = all.filter((f) => COPY.has(path.extname(f)));
  const skipped = all.filter((f) => !COPY.has(path.extname(f)));
  const kidsComponents = path.join(from, "components");
  const ctx = {
    hasKidsComponent: (rel) => findIn(kidsComponents, rel) != null,
    hasKidsLib: (rel) => findIn(path.join(dest, "lib"), rel) != null,
  };

  // 1. 書き換える（まだ書かない）
  const outputs = new Map(); // rel → Buffer | string
  const problems = [];
  for (const rel of files) {
    const src = path.join(from, rel);
    if (!CODE.has(path.extname(rel))) {
      outputs.set(rel, fs.readFileSync(src));
      continue;
    }
    const r = rewriteSource(fs.readFileSync(src, "utf8"), rel, ctx);
    for (const e of r.errors) problems.push(`${rel}: ${e}`);
    // 行き先があるかを確かめる（写す範囲の外・アプリにないもの・入っていないパッケージ）
    for (const spec of r.specs) {
      const p = checkTarget(spec, rel, files, dest);
      if (p) problems.push(`${rel}: ${p}`);
    }
    outputs.set(rel, header(rel) + r.text);
  }
  if (problems.length > 0) {
    console.error(`写せない所がある（元を直すか、この道具の決まりを足す）:\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
  if (dry) {
    console.log(
      `元: ${from}\n写すもの ${files.length} 個、写さないもの ${skipped.length} 個（${skipped.join("、") || "なし"}）`,
    );
    return;
  }

  // 2. 写した先を手で直していないか（直していたら止まる）
  const manifestPath = path.join(dest, MANIFEST);
  const before = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : { files: {} };
  const present = listFiles(dest);
  const touched = present.filter((rel) => before.files[rel] !== sha(fs.readFileSync(path.join(dest, rel))));
  if (touched.length > 0 && !force) {
    console.error(
      `写した先を手で直した（か、写したものでない）ファイルがある。直すなら元（${ORIGIN}）を直す。上書きしてよければ --force:\n  ${touched.join("\n  ")}`,
    );
    process.exit(1);
  }

  // 3. 写す（前に写したフォルダは消してから。元で消したファイルが残らないように）
  for (const d of DIRS) fs.rmSync(path.join(dest, d), { recursive: true, force: true });
  for (const [rel, data] of outputs) {
    const to = path.join(dest, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.writeFileSync(to, data);
  }

  // 4. 形をそろえる（biome。整形・import の並び・安全な直しだけ）
  const biome = path.join(repo, "node_modules", "@biomejs", "biome", "bin", "biome");
  const targets = DIRS.map((d) => path.join(dest, d)).filter((p) => fs.existsSync(p));
  // 使っていない import だけは消す（元に残っていても動きは変わらない。biome の「安全でない直し」に入っているので別に頼む）
  try {
    execFileSync(
      process.execPath,
      [
        biome,
        "lint",
        "--write",
        "--unsafe",
        "--only=correctness/noUnusedImports",
        "--no-errors-on-unmatched",
        ...targets,
      ],
      { cwd: repo, stdio: "pipe" },
    );
  } catch {}
  try {
    execFileSync(process.execPath, [biome, "check", "--write", "--no-errors-on-unmatched", ...targets], {
      cwd: repo,
      stdio: "pipe",
    });
  } catch (e) {
    // 直せない決まりが残っていても写すのは終える（npm run lint で見る）
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    const summary = out.split(/\r?\n/).filter((l) => /Found \d+ (error|warning)/.test(l));
    console.warn(
      `biome で直せない所が残った（npm run lint で見る）: ${summary.join(" ") || "詳しくは npx biome check src/kids"}`,
    );
  }

  // 5. 指紋を残す
  const manifest = { from: ORIGIN, files: {} };
  for (const rel of listFiles(dest)) manifest.files[rel] = sha(fs.readFileSync(path.join(dest, rel)));
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  try {
    execFileSync(process.execPath, [biome, "format", "--write", manifestPath], { cwd: repo, stdio: "pipe" });
  } catch {}
  console.log(`写した: ${from} → src/kids（${outputs.size} 個。写さなかったもの: ${skipped.join("、") || "なし"}）`);
}

// 書き換えたあとの行き先が、アプリの中で読めるか。読めなければ理由を返す
function checkTarget(spec, rel, files, dest) {
  if (spec.startsWith(".")) {
    const to = path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec));
    const hit = [to, ...EXTS.map((e) => to + e), ...EXTS.map((e) => `${to}/index${e}`)].some((c) => files.includes(c));
    return hit ? null : `写す範囲の外を読んでいる: "${spec}"`;
  }
  if (spec.startsWith("@/kids/lib/"))
    return findIn(path.join(dest, "lib"), spec.slice("@/kids/lib/".length)) ? null : `中継ぎがない: "${spec}"`;
  if (spec === "@/kids/components" || spec.startsWith("@/kids/components/")) return null; // 元の components/ にあることは書き換えで確かめた
  if (spec.startsWith("@/")) return findIn(path.join(repo, "src"), spec.slice(2)) ? null : `アプリにない: "${spec}"`;
  if (spec.startsWith("@contracts/"))
    return findIn(path.join(repo, "contracts"), spec.slice(11)) ? null : `contracts にない: "${spec}"`;
  if (spec.startsWith("node:")) return `Node の部品を読んでいる（端末では動かない）: "${spec}"`;
  const pkg = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
  const deps = JSON.parse(fs.readFileSync(path.join(repo, "package.json"), "utf8"));
  if (!deps.dependencies?.[pkg] && !deps.devDependencies?.[pkg]) return `package.json にないパッケージ: "${pkg}"`;
  return null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
