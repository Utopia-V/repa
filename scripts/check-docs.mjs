#!/usr/bin/env node
// 校验仓库文档的结构与内部链接：
//   1. 所有 Markdown 中的相对链接必须指向存在的文件；
//   2. docs/exec-plans/active/ 下的执行计划必须包含固定小节（目的/任务分解/决策日志/进度日志）；
//   3. docs/adr/ 的 ADR 编号不得重复。
// 约定来源：docs/exec-plans/README.md 与 ADR-0006。
//
// 用法：
//   node scripts/check-docs.mjs                # 校验当前仓库
//   node scripts/check-docs.mjs --root <dir>   # 校验指定目录
//   node scripts/check-docs.mjs --self-test    # 运行内置自测（临时夹具）
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const PLAN_SECTIONS = ["目的", "任务分解", "决策日志", "进度日志"];

async function walkMarkdown(dir, skipDirs = new Set()) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (skipDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walkMarkdown(full, skipDirs)));
    else if (entry.isFile() && entry.name.endsWith(".md")) out.push(full);
  }
  return out.sort();
}

export async function collectMarkdown(root) {
  const files = await walkMarkdown(root, new Set(["node_modules", ".git", ".pi"]));
  // 校验范围 = docs/ 全部 Markdown + 根目录一级 Markdown
  return files.filter((f) => {
    const rel = path.relative(root, f);
    return rel.startsWith("docs") || !rel.includes(path.sep);
  });
}

export function extractRelativeLinks(markdown) {
  const links = [];
  for (const m of markdown.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    let url = m[1];
    if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("mailto:")) continue;
    url = url.split("#")[0];
    if (!url) continue; // 纯锚点
    try {
      url = decodeURIComponent(url);
    } catch {
      // 保留原样，交给存在性检查失败
    }
    links.push(url);
  }
  return links;
}

export async function checkDocs(root) {
  const violations = [];
  const files = await collectMarkdown(root);
  let linkCount = 0;

  for (const file of files) {
    const rel = path.relative(root, file).split(path.sep).join("/");
    const markdown = await readFile(file, "utf8");

    for (const link of extractRelativeLinks(markdown)) {
      linkCount++;
      const target = path.resolve(path.dirname(file), link);
      try {
        await stat(target);
      } catch {
        violations.push({
          file: rel,
          message: `相对链接指向不存在的文件：${link}`,
          remediation: "修正链接，或恢复/创建目标文件；链接一律使用相对路径（docs/exec-plans/README.md 约定）",
        });
      }
    }

    if (rel.startsWith("docs/exec-plans/active/")) {
      const headers = markdown
        .split("\n")
        .filter((l) => l.startsWith("## "))
        .map((l) => l.replace(/^##\s+/, "").trim());
      for (const section of PLAN_SECTIONS) {
        if (!headers.some((h) => h === section)) {
          violations.push({
            file: rel,
            message: `执行计划缺少固定小节「${section}」`,
            remediation: `按 docs/exec-plans/README.md 约定补充小节：${PLAN_SECTIONS.join("、")}`,
          });
        }
      }
    }
  }

  const adrDir = path.join(root, "docs", "adr");
  try {
    const seen = new Map();
    for (const name of await readdir(adrDir)) {
      const m = name.match(/^(\d{4})-/);
      if (!m) continue;
      if (seen.has(m[1])) {
        violations.push({
          file: `docs/adr/${name}`,
          message: `ADR 编号 ${m[1]} 与 ${seen.get(m[1])} 重复`,
          remediation: "重编号新文件为下一个可用编号，并更新仓库内引用",
        });
      }
      seen.set(m[1], name);
    }
  } catch {
    // docs/adr 不存在时跳过（惰性创建约定）
  }

  return { violations, filesChecked: files.length, linkCount };
}

async function selfTest() {
  const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
  const os = await import("node:os");
  const assert = (await import("node:assert/strict")).default;
  const tmp = await mkdtemp(path.join(os.tmpdir(), "check-docs-test-"));
  try {
    // 失败：坏链接 + 缺小节 + ADR 重号
    const root = path.join(tmp, "bad");
    await mkdir(path.join(root, "docs/adr"), { recursive: true });
    await mkdir(path.join(root, "docs/exec-plans/active"), { recursive: true });
    await writeFile(
      path.join(root, "README.md"),
      "[断了](docs/nope.md)\n[锚点](#ok)\n[外部](https://example.com)\n",
    );
    await writeFile(path.join(root, "docs/exec-plans/active/x.md"), "## 目的\n\n内容\n");
    await writeFile(path.join(root, "docs/adr/0001-a.md"), "a\n");
    await writeFile(path.join(root, "docs/adr/0001-b.md"), "b\n");
    let r = await checkDocs(root);
    assert.equal(r.violations.length, 5, `应 5 个违例：${JSON.stringify(r.violations, null, 1)}`);
    assert.ok(r.violations.some((v) => v.message.includes("nope.md")));
    assert.ok(r.violations.filter((v) => v.message.includes("固定小节")).length === 3);
    assert.ok(r.violations.some((v) => v.message.includes("0001")));

    // 通过：合法树
    const good = path.join(tmp, "good");
    await mkdir(path.join(good, "docs/adr"), { recursive: true });
    await mkdir(path.join(good, "docs/exec-plans/active"), { recursive: true });
    await writeFile(path.join(good, "README.md"), "[ADR](docs/adr/0001-a.md)\n");
    await writeFile(
      path.join(good, "docs/exec-plans/active/x.md"),
      "## 目的\n## 任务分解\n## 决策日志\n## 进度日志\n",
    );
    await writeFile(path.join(good, "docs/adr/0001-a.md"), "a\n");
    r = await checkDocs(good);
    assert.equal(r.violations.length, 0, `应无违例：${JSON.stringify(r.violations)}`);
    console.log("self-test: 2 cases passed");
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

const args = process.argv.slice(2);
if (args.includes("--self-test")) {
  await selfTest();
} else {
  const rootIdx = args.indexOf("--root");
  const root = rootIdx >= 0 ? path.resolve(args[rootIdx + 1]) : process.cwd();
  const { violations, filesChecked, linkCount } = await checkDocs(root);
  if (violations.length > 0) {
    console.error(`✗ 文档校验：${violations.length} 个违例（${filesChecked} 个文件，${linkCount} 个链接）\n`);
    for (const v of violations) {
      console.error(`✗ ${v.file} ${v.message}`);
      console.error(`  修复：${v.remediation}\n`);
    }
    process.exit(1);
  }
  console.log(`✓ 文档校验：${filesChecked} 个文件、${linkCount} 个链接、结构与编号全部合规`);
}
