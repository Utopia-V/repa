#!/usr/bin/env node
// 按 ARCHITECTURE.md 的模块边表机械化校验 src/ 的依赖方向。
// 规则来源是 ARCHITECTURE.md「模块边表」，规范见其「校验器规范」小节；
// 边表与本脚本的解释不一致时，以边表为准，修文档或修代码，不要绕过校验。
//
// 导入提取使用仓库既有 devDependency 的 TypeScript AST（而非源码正则），
// 避免注释/模板字符串误报与动态导入漏报。
//
// 用法：
//   node scripts/check-architecture.mjs                # 校验当前仓库
//   node scripts/check-architecture.mjs --root <dir>   # 校验指定目录
//   node scripts/check-architecture.mjs --self-test    # 运行内置自测（临时夹具）
import { readdir, readFile } from "node:fs/promises";
import { statSync as statSyncNow } from "node:fs";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

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

// 从 ARCHITECTURE.md 提取模块边表。单元格内每个 `名字` 后可跟（仅 type）、（仅 re-export）等注解。
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
      entries.push({
        name,
        typeOnly: annotation.includes("仅 type"),
        reExportOnly: annotation.includes("仅 re-export"),
      });
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

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

// 命名导入是否全部为内联 type（import { type A, type B }），且无默认/命名空间绑定。
function isPureInlineType(clause) {
  if (!clause || clause.isTypeOnly || clause.name || (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings))) {
    return false;
  }
  const nb = clause.namedBindings;
  if (!nb || !ts.isNamedImports(nb) || nb.elements.length === 0) return false;
  return nb.elements.every((e) => e.isTypeOnly);
}

// 提取一个 .ts 文件的全部依赖语句（静态 import、export-from、动态 import()）。
export function extractImports(source, fileName = "inline.ts") {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const statements = [];
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      statements.push({
        spec: node.moduleSpecifier.text,
        typeOnly: Boolean(node.importClause?.isTypeOnly) || isPureInlineType(node.importClause),
        kind: "import",
        line: lineOf(sourceFile, node),
      });
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      statements.push({
        spec: node.moduleSpecifier.text,
        typeOnly: Boolean(node.isTypeOnly) || isPureInlineTypeClause(node.exportClause),
        kind: "export",
        line: lineOf(sourceFile, node),
      });
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      statements.push({
        spec: node.arguments[0].text,
        typeOnly: false,
        kind: "dynamic-import",
        line: lineOf(sourceFile, node),
      });
    } else if (
      ts.isImportTypeNode(node) &&
      node.argument &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    ) {
      // type P = import("pkg").P —— 纯类型级依赖，仍须在边表登记
      statements.push({
        spec: node.argument.literal.text,
        typeOnly: true,
        kind: "import-type",
        line: lineOf(sourceFile, node),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return statements;
}

// export {...} from 的内联 type 判定（exportClause 是 NamedExports）。
function isPureInlineTypeClause(clause) {
  if (!clause || clause.isTypeOnly) return Boolean(clause?.isTypeOnly);
  if (!ts.isNamedExports(clause) || clause.elements.length === 0) return false;
  return clause.elements.every((e) => e.isTypeOnly);
}

// 相对 specifier 解析（.js → .ts 映射、.ts 直写、目录 index.ts）。
// 返回 { target }：src/ 内已存在文件；{ exempt: true }：存在但在 src/ 外（规范豁免）；
// { missing: true }：候选都不存在。
function resolveInternalSpecifier(spec, fromFile, srcDir) {
  const abs = path.resolve(path.dirname(fromFile), spec);
  const candidates = [];
  if (spec.endsWith(".js")) candidates.push(abs.replace(/\.js$/, ".ts"));
  if (spec.endsWith(".ts")) candidates.push(abs);
  candidates.push(abs + ".ts", path.join(abs, "index.ts"));
  let existsSomewhere = false;
  for (const p of candidates) {
    let isFile = false;
    try {
      isFile = statSyncNow(p).isFile();
    } catch {
      isFile = false;
    }
    if (!isFile) continue;
    existsSomewhere = true;
    if (p.startsWith(srcDir + path.sep) && p.endsWith(".ts")) {
      return { target: path.relative(srcDir, p).split(path.sep).join("/") };
    }
  }
  if (existsSomewhere) return { exempt: true };
  return { missing: true };
}

function isFile(rel, srcDir) {
  try {
    return statSyncNow(path.join(srcDir, rel)).isFile();
  } catch {
    return false;
  }
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
    for (const { spec, typeOnly, kind, line } of extractImports(await readFile(file, "utf8"), file)) {
      if (spec.startsWith("node:")) continue;
      if (spec.startsWith(".")) {
        const resolved = resolveInternalSpecifier(spec, file, srcDir);
        if (resolved.missing) {
          violations.push({
            file: key,
            line,
            message: `无法解析的内部导入 "${spec}"`,
            remediation: "确认相对路径与 .js → .ts 映射是否正确（校验器规范）",
          });
          continue;
        }
        if (resolved.exempt) continue; // src/ 外部模块不计入方向规则
        const target = resolved.target;
        if (!isFile(target, srcDir)) {
          violations.push({
            file: key,
            line,
            message: `内部导入 "${spec}" 指向不存在的文件`,
            remediation: "修正路径或创建目标文件",
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
          continue;
        }
        const entry = row.internal.find((e) => e.name === target);
        if (entry.reExportOnly && kind !== "export") {
          violations.push({
            file: key,
            line,
            message: `边表将 \`${key}\` → \`${target}\` 登记为仅 re-export，此处是 ${kind === "dynamic-import" ? "动态导入" : "普通导入"}`,
            remediation: `改为 \`export ... from "${spec}"\`（公共出口只做转发）；确需普通导入时先修改 ${ARCH_DOC} 边表并说明理由`,
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
          remediation: `改为 \`import type\`（或纯内联 type 限定符）；确需值导入时先修改 ${ARCH_DOC} 边表并说明理由`,
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
  let caseNo = 0;
  const makeRepo = async (files) => {
    const root = path.join(tmp, `case${caseNo++}`);
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
  const good = {
    "ARCHITECTURE.md": table,
    "src/a.ts": 'import { b } from "./b.js";\nimport type { M } from "left-pad";\nimport { type N } from "left-pad";\nexport { type O } from "left-pad";\ntype P = import("left-pad").P;\n',
    "src/b.ts": "export const b = 1;\n",
  };
  try {
    // 1 通过：合法边 + import type + 纯内联 type
    let root = await makeRepo(good);
    let r = await checkArchitecture(root);
    assert.equal(r.violations.length, 0, `应无违例：${JSON.stringify(r.violations)}`);

    // 2 失败：逆向内部边（含修复指引）
    root = await makeRepo({
      "ARCHITECTURE.md": table,
      "src/a.ts": "export const a = 1;\n",
      "src/b.ts": 'import { a } from "./a.js";\n',
    });
    r = await checkArchitecture(root);
    assert.equal(r.violations.length, 1);
    assert.match(r.violations[0].message, /未在边表登记/);
    assert.match(r.violations[0].remediation, /ARCHITECTURE\.md/);

    // 3 失败：仅 type 依赖被值导入（含修复指引）
    root = await makeRepo({
      "ARCHITECTURE.md": table,
      "src/a.ts": 'import { x } from "left-pad";\n',
      "src/b.ts": "",
    });
    r = await checkArchitecture(root);
    assert.equal(r.violations.length, 1);
    assert.match(r.violations[0].message, /仅 type/);
    assert.match(r.violations[0].remediation, /import type/);

    // 4 失败：未登记的源文件
    root = await makeRepo({
      "ARCHITECTURE.md": table,
      "src/a.ts": "",
      "src/b.ts": "",
      "src/c.ts": "",
    });
    r = await checkArchitecture(root);
    assert.equal(r.violations.length, 1);
    assert.match(r.violations[0].message, /未在.*登记/);

    // 5 失败：未登记的第三方依赖；node: 豁免
    root = await makeRepo({
      "ARCHITECTURE.md": table,
      "src/a.ts": 'import { strict } from "node:assert/strict";\nimport x from "left-right";\n',
      "src/b.ts": "",
    });
    r = await checkArchitecture(root);
    assert.equal(r.violations.length, 1);
    assert.match(r.violations[0].message, /left-right/);

    // 6 失败：仅 re-export 边被普通导入；export-from 放行
    root = await makeRepo({
      "ARCHITECTURE.md": table.replace(
        "| `a.ts` | `b.ts` |",
        "| `a.ts` | `b.ts`（仅 re-export） |",
      ),
      "src/a.ts": 'import { b } from "./b.js";\n',
      "src/b.ts": "export const b = 1;\n",
    });
    r = await checkArchitecture(root);
    assert.equal(r.violations.length, 1);
    assert.match(r.violations[0].message, /仅 re-export/);
    root = await makeRepo({
      "ARCHITECTURE.md": table.replace(
        "| `a.ts` | `b.ts` |",
        "| `a.ts` | `b.ts`（仅 re-export） |",
      ),
      "src/a.ts": 'export { b } from "./b.js";\n',
      "src/b.ts": "export const b = 1;\n",
    });
    r = await checkArchitecture(root);
    assert.equal(r.violations.length, 0, JSON.stringify(r.violations));

    // 7 失败：无法解析的内部导入；src/ 外存在文件豁免；动态导入按值处理
    root = await makeRepo({
      "ARCHITECTURE.md": table.replace("| `a.ts` | `b.ts` |", "| `a.ts` | `b.ts`、`outside.ts` |"),
      "src/a.ts": 'import { g } from "./missing.js";\nimport { h } from "../outside.js";\nconst lazy = import("left-pad");\n',
      "src/b.ts": "",
      "outside.ts": "export const h = 1;\n",
    });
    r = await checkArchitecture(root);
    assert.equal(r.violations.length, 2, JSON.stringify(r.violations));
    assert.ok(r.violations.some((v) => v.message.includes("无法解析")));
    assert.ok(r.violations.some((v) => v.message.includes("left-pad") && v.message.includes("仅 type")));

    // 8 失败：边表缺失时抛错
    root = await makeRepo({ "ARCHITECTURE.md": "# t\n\n没有表格\n", "src/a.ts": "" });
    await assert.rejects(() => checkArchitecture(root), /未找到模块边表/);

    // 9 失败：命名空间导入按值处理；import-type 未登记第三方也报违例；已登记第三方 import-type 放行（见案例 1）
    root = await makeRepo({
      "ARCHITECTURE.md": table,
      "src/a.ts": 'import * as ns from "left-pad";\ntype Q = import("left-right").Q;\n',
      "src/b.ts": "",
    });
    r = await checkArchitecture(root);
    assert.equal(r.violations.length, 2, JSON.stringify(r.violations));
    assert.ok(r.violations.some((v) => v.message.includes("left-pad") && v.message.includes("仅 type")));
    assert.ok(r.violations.some((v) => v.message.includes("left-right")));

    // 10 失败：动态导入触发「仅 re-export」拒绝
    root = await makeRepo({
      "ARCHITECTURE.md": table.replace(
        "| `a.ts` | `b.ts` |",
        "| `a.ts` | `b.ts`（仅 re-export） |",
      ),
      "src/a.ts": 'const l = import("./b.js");\n',
      "src/b.ts": "export const b = 1;\n",
    });
    r = await checkArchitecture(root);
    assert.equal(r.violations.length, 1);
    assert.match(r.violations[0].message, /仅 re-export/);

    console.log("self-test: 10 cases passed");
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
