#!/usr/bin/env node

import { createInterface } from "node:readline";

import { openRepa, type RepaEvent } from "./application.js";

interface CliOptions {
  learnerSpace: string;
  trustExtensions: boolean;
  resume: boolean;
}

function usage(): string {
  return [
    "用法：repa <learner-space> [--trust-extensions] [--new-session]",
    "",
    "  --trust-extensions  加载 Pi Package/Extension/skill/prompt；代码拥有宿主进程权限，并非沙箱",
    "  --new-session       不恢复该学习者空间中最近的 Session",
  ].join("\n");
}

function parseArguments(arguments_: string[]): CliOptions | undefined {
  let learnerSpace: string | undefined;
  let trustExtensions = false;
  let resume = true;

  for (const argument of arguments_) {
    if (argument === "--help" || argument === "-h") return undefined;
    if (argument === "--trust-extensions") {
      trustExtensions = true;
      continue;
    }
    if (argument === "--new-session") {
      resume = false;
      continue;
    }
    if (argument.startsWith("-")) throw new Error(`未知参数：${argument}`);
    if (learnerSpace) throw new Error("只能指定一个 learner-space。");
    learnerSpace = argument;
  }

  if (!learnerSpace) return undefined;
  return { learnerSpace, trustExtensions, resume };
}

function writeEvent(event: RepaEvent, state: { assistantLineOpen: boolean; generating: boolean }): void {
  const finishAssistantLine = () => {
    if (state.assistantLineOpen) process.stdout.write("\n");
    state.assistantLineOpen = false;
  };

  switch (event.type) {
    case "session_opened":
      console.log(
        `${event.restored ? "已恢复" : "已创建"} Session ${event.sessionId}（${event.learnerSpace}）`,
      );
      return;
    case "extension_trust":
      console.warn(`注意：${event.message}`);
      return;
    case "warning":
      console.warn(`警告：${event.message}`);
      return;
    case "turn_started":
      state.generating = true;
      return;
    case "assistant_text_delta":
      if (!state.assistantLineOpen) process.stdout.write("Repa> ");
      process.stdout.write(event.delta);
      state.assistantLineOpen = true;
      return;
    case "tool_started":
      finishAssistantLine();
      console.log(`  [tool] ${event.name}…`);
      return;
    case "tool_finished":
      finishAssistantLine();
      console.log(`  [tool] ${event.name} ${event.isError ? "失败" : "完成"}`);
      return;
    case "generation_cancelled":
      finishAssistantLine();
      console.log("已取消当前生成。");
      return;
    case "turn_finished":
      finishAssistantLine();
      state.generating = false;
      return;
    case "compaction_started":
      finishAssistantLine();
      console.log(`  [session] 正在压缩上下文（${event.reason}）…`);
      return;
    case "compaction_finished":
      finishAssistantLine();
      console.log(`  [session] 上下文压缩${event.aborted ? "已取消" : "完成"}`);
      return;
    case "error":
      finishAssistantLine();
      console.error(`错误 [${event.code}]：${event.message}`);
      return;
    case "closed":
      finishAssistantLine();
      return;
  }
}

async function main(): Promise<void> {
  let options: CliOptions | undefined;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage());
    process.exitCode = 2;
    return;
  }

  if (!options) {
    console.log(usage());
    return;
  }

  const opened = await openRepa(options);
  if (!opened.ok) {
    console.error(`无法打开 Repa [${opened.error.code}]：${opened.error.message}`);
    process.exitCode = 1;
    return;
  }

  const application = opened.application;
  const state = { assistantLineOpen: false, generating: false };
  const eventsFinished = (async () => {
    for await (const event of application.events) writeEvent(event, state);
  })();

  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "You> ",
  });

  console.log("输入 /cancel 取消当前生成，输入 /exit 正常关闭。\n");
  readline.prompt();

  readline.on("line", (line) => {
    const input = line.trim();
    if (input === "/exit") {
      readline.close();
      void application.command({ type: "close" });
      return;
    }
    if (input === "/cancel") {
      void application.command({ type: "cancel" }).finally(() => readline.prompt());
      return;
    }
    void application.command({ type: "send", text: line }).finally(() => readline.prompt());
  });

  readline.on("SIGINT", () => {
    if (state.generating) {
      void application.command({ type: "cancel" });
    } else {
      readline.close();
      void application.command({ type: "close" });
    }
  });

  readline.on("close", () => {
    void application.command({ type: "close" });
  });

  await eventsFinished;
}

await main();
