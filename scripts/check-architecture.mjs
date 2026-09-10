#!/usr/bin/env node
// 按 ARCHITECTURE.md 的模块边表机械化校验 src/ 的依赖方向。
// 规则来源是 ARCHITECTURE.md「模块边表」，规范见其「校验器规范」小节；
// 边表与本脚本的解释不一致时，以边表为准，修文档或修代码，不要绕过校验。
//
// 用法：
//   node scripts/check-architecture.mjs                # 校验当前仓库
//   node scripts/check-architecture.mjs --root <dir>   # 校验指定目录
//   node scripts/check-architecture.mjs --self-test    # 运行内置自测（临时夹具）
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ARCH_DOC = "ARCHITECTURE.md";
const SRC_DIR = "src";

async function walkTs(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walkTs(full)));
    else if (entry.isFile() && entry.name.endsWith(".ts")) out.push(full);
  }
  return out.sort();
}

// 从 ARCHITECTURE.md 提取模块边表。单元格内每个 `名字` 后可跟（仅 type）等注解。
export function parseEdgeTable(markdown) {
  const rows = markdown
    .split("\n")
    .filter((line) => line.trim().startsWith("|"))
    .map((line) =>
      line
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((cell) => cell.trim()),
    )
    .filter((cells) => !cells.every((c) => /^:?-{3,}:?$/.test(c)));

  if (rows.length < 2) {
    throw new Error(`${ARCH_DOC} 中未找到模块边表（需要一个至少含表头和数据行的表格）`);
  }
  const header = rows[0];
  const colOf = (needle) => header.findIndex((h) => h.includes(needle));
  const modCol = colOf("模块");
  const internalCol = colOf("内部");
  const thirdCol = colOf("第三方");
  if (modCol < 0 || internalCol < 0 || thirdCol < 0) {
    throw new Error(`${ARCH_DOC} 边表表头需包含「模块」「允许的内部边」「允许的第三方依赖」三列`);
  }

  const parseCell = (cell) => {
    const entries = [];
    for (const m of cell.matchAll(/`([^`]+)`\s*(?:（([^）]*)）)?/g)) {
      const name = m[1].trim();
      const annotation = m[2] ?? "";
      if (!name || name === "无") continue;
      entries.push({ name, typeOnly: annotation.includes("仅 type") });
    }
    return entries;
  };

  const table = new Map();
  for (const row of rows.slice(1)) {
    const mod = row[modCol]?.replace(/`/g, "").trim();
    if (!mod) continue;
    table.set(mod, {
      internal: parseCell(row[internalCol] ?? ""),
      third: parseCell(row[thirdCol] ?? ""),
    });
  }
  if (table.size === 0) throw new Error(`${ARCH_DOC} 边表没有数据行`);
  return table;
}

// 提取一个 .ts 文件的全部 import/export-from 语句。
// typeOnly 判定依据 ARCHITECTURE.md 校验器规范：import type / export type 开头；
// 命名导入中的内联 type 与值混排时按值处理（更强约束不受影响）。
export function extractImports(source) {
  const statements = [];
  const push = (typeOnly, spec, index) => {
    const line = source.slice(0, index).split("\n").length;
    statements.push({ spec, typeOnly, line });
  };
  for (const m of source.matchAll(/(?:^|\n)\s*(import|export)\s+(type\s+)?[\s\S]*?from\s*["']([^"']+)["']/g)) {
    push(Boolean(m[2]), m[3], m.index);
  }
  for (const m of source.matchAll(/(?:^|\n)\s*import\s*["']([^"']+)["']/g)) {
    push(false, m[1], m.index);
  }
  return statements;
}

function resolveInternalSpecifier(spec, fromFile, srcDir) {
  const abs = path.resolve(path.dirname(fromFile), spec);
  const candidates = [];
  if (spec.endsWith(".js")) candidates.push(abs.replace(/\.js$/, ".ts"));
  candidates.push(abs + ".ts", path.join(abs, "index.ts"));
  const found = candidates.find((p) => p.startsWith(srcDir + path.sep) && p.endsWith(".ts"));
  return found ? path.relative(srcDir, found).split(path.sep).join("/") : null;
}

export async function checkArchitecture(root) {
  const srcDir = path.join(root, SRC_DIR);
  const table = parseEdgeTable(await readFile(path.join(root, ARCH_DOC), "utf8"));
  const files = await walkTs(srcDir);
  const violations = [];

  for (const file of files) {
    const key = path.relative(srcDir, file).split(path.sep).join("/");
    const row = table.get(key);
    if (!row) {
      violations.push({
        file: key,
        line: 0,
        message: `源文件未在 ${ARCH_DOC} 模块边表登记`,
        remediation: `在 ${ARCH_DOC}「模块边表」为 \`${key}\` 增加一行（内部边与第三方依赖），或删除该文件`,
      });
      continue;
    }
    for (const { spec, typeOnly, line } of extractImports(await readFile(file, "utf8"))) {
      if (spec.startsWith("node:")) continue;
      if (spec.startsWith(".")) {
        const target = resolveInternalSpecifier(spec, file, srcDir);
        if (!target) {
          violations.push({
            file: key,
            line,
            message: `无法解析的内部导入 "${spec}"`,
            remediation: "确认相对路径与 .js → .ts 映射是否正确（校验器规范）",
          });
          continue;
        }
        if (!row.internal.some((e) => e.name === target)) {
          violations.push({
            file: key,
            line,
            message: `内部边 \`${key}\` → \`${target}\` 未在边表登记`,
            remediation: `依赖合理时在 ${ARCH_DOC} 边表为 \`${key}\` 登记 \`${target}\`；否则调整分层（方向只能沿 cli → application → pi-host → skill-read-tool 前进）`,
          });
        }
        continue;
      }
      const entry = row.third.find((e) => e.name === spec);
      if (!entry) {
        violations.push({
          file: key,
          line,
          message: `第三方依赖 "${spec}" 未在边表为 \`${key}\` 登记`,
          remediation: `在 ${ARCH_DOC} 边表为 \`${key}\` 登记 "${spec}"（注意标注是否仅 type），或改用已登记的依赖`,
        });
        continue;
      }
      if (entry.typeOnly && !typeOnly) {
        violations.push({
          file: key,
          line,
          message: `边表将 "${spec}" 登记为仅 type，此处是值导入`,
          remediation: `改为 \`import type\`（或内联 type 限定符）；确需值导入时先修改 ${ARCH_DOC} 边表并说明理由`,
        });
      }
    }
  }
  return { violations, filesChecked: files.length, modules: table.size };
}

async function selfTest() {
  const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
  const os = await import("node:os");
  const assert = (await import("node:assert/strict")).default;
  const tmp = await mkdtemp(path.join(os.tmpdir(), "check-arch-test-"));
  const makeRepo = async (files) => {
    const root = path.join(tmp, await readdir(tmp).then((n) => `case${n.length}`));
    for (const [rel, content] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
      await writeFile(path.join(root, rel), content);
    }
    return root;
  };
  const table = `# t

## 模块边表

| 模块 | 允许的内部边 | 允许的第三方依赖 |
|---|---|---|
| \`a.ts\` | \`b.ts\` | \`left-pad\`（仅 type） |
| \`b.ts\` | 无 | 无 |
`;
  try {
    // 通过：合法边 + type-only 第三方
    let root = await makeRepo({
      "ARCHITECTURE.md": table,
      "src/a.ts": 'import { b } from "./b.js";\nimport type { M } from "left-pad";\n',
      "src/b.ts": "export const b = 1;\n",
    });
    let r = await checkArchitecture(root);
    assert.equal(r.violations.length, 0, `应无违例：${JSON.stringify(r.violations)}`);

    // 失败：逆向内部边
    root = await makeRepo({
      "ARCHITECTURE.md": table,
      "src/a.ts": "export const a = 1;\n",
      "src/b.ts": 'import { a } from "./a.js";\n',
    });
    r = await checkArchitecture(root);
    assert.equal(r.violations.length, 1);
    assert.match(r.violations[0].message, /未在边表登记/);
    assert.match(r.violations[0].remediation, /ARCHITECTURE\.md/);

    // 失败：仅 type 依赖被值导入
    root = await makeRepo({
      "ARCHITECTURE.md": table,
      "src/a.ts": 'import { x } from "left-pad";\n',
      "src/b.ts": "",
    });
    r = await checkArchitecture(root);
    assert.equal(r.violations.length, 1);
    assert.match(r.violations[0].message, /仅 type/);

    // 失败：未登记的源文件
    root = await makeRepo({
      "ARCHITECTURE.md": table,
      "src/a.ts": "",
      "src/b.ts": "",
      "src/c.ts": "",
    });
    r = await checkArchitecture(root);
    assert.equal(r.violations.length, 1);
    assert.match(r.violations[0].message, /未在.*登记/);
    console.log("self-test: 4 cases passed");
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
  const { violations, filesChecked, modules } = await checkArchitecture(root);
  if (violations.length > 0) {
    console.error(`✗ 架构校验：${violations.length} 个违例（${filesChecked} 个文件，边表 ${modules} 个模块）\n`);
    for (const v of violations) {
      console.error(`✗ ${v.file}:${v.line} ${v.message}`);
      console.error(`  修复：${v.remediation}\n`);
    }
    process.exit(1);
  }
  console.log(`✓ 架构校验：${filesChecked} 个文件全部符合 ${ARCH_DOC} 模块边表（${modules} 个模块）`);
}
