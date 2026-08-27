import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
  type Context,
  type FauxProviderHandle,
  type FauxResponseStep,
} from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";

import {
  openRepa,
  type RepaApplication,
  type RepaEvent,
} from "../src/application.js";
import { REPA_BASE_PROMPT, type PiModelOverride } from "../src/pi-host.js";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const fixturePackage = path.join(testDirectory, "fixtures", "repa-test-package");
const brokenPackage = path.join(testDirectory, "fixtures", "repa-broken-package");
const fixtureSkillPath = path.join(
  fixturePackage,
  "skills",
  "fixture-learning-skill",
  "SKILL.md",
);

interface TestSpace {
  root: string;
  learnerSpace: string;
  agentDir: string;
}

interface OpenFixtureOptions {
  packages?: string[];
  trustExtensions?: boolean;
  resume?: boolean;
  contextWindow?: number;
  maxTokens?: number;
  tokensPerSecond?: number;
  compaction?: { enabled: boolean; reserveTokens: number; keepRecentTokens: number };
}

class EventCollector {
  readonly events: RepaEvent[] = [];
  readonly done: Promise<void>;
  readonly #waiters: Array<{
    predicate: (event: RepaEvent) => boolean;
    resolve: (event: RepaEvent) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }> = [];

  constructor(source: AsyncIterable<RepaEvent>) {
    this.done = this.#consume(source);
  }

  async waitFor(
    predicate: (event: RepaEvent) => boolean,
    message: string,
    timeoutMilliseconds = 8_000,
  ): Promise<RepaEvent> {
    const existing = this.events.find(predicate);
    if (existing) return existing;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.#waiters.findIndex((waiter) => waiter.timer === timer);
        if (index >= 0) this.#waiters.splice(index, 1);
        reject(new Error(`${message}\n已观察事件：${JSON.stringify(this.events, null, 2)}`));
      }, timeoutMilliseconds);
      this.#waiters.push({ predicate, resolve, reject, timer });
    });
  }

  async settle(): Promise<void> {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  async #consume(source: AsyncIterable<RepaEvent>): Promise<void> {
    try {
      for await (const event of source) {
        this.events.push(event);
        for (const waiter of [...this.#waiters]) {
          if (!waiter.predicate(event)) continue;
          clearTimeout(waiter.timer);
          this.#waiters.splice(this.#waiters.indexOf(waiter), 1);
          waiter.resolve(event);
        }
      }
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      for (const waiter of this.#waiters.splice(0)) {
        clearTimeout(waiter.timer);
        waiter.reject(failure);
      }
      throw failure;
    }
  }
}

function messageText(message: Context["messages"][number]): string {
  if (typeof message.content === "string") return message.content;
  return message.content
    .map((part) => {
      if (part.type === "text") return part.text;
      if (part.type === "thinking") return part.thinking;
      if (part.type === "toolCall") return `${part.name}:${JSON.stringify(part.arguments)}`;
      if (part.type === "image") return "";
      return "";
    })
    .join("\n");
}

function latestMessageText(context: Context, role: Context["messages"][number]["role"]): string {
  const message = [...context.messages].reverse().find((candidate) => candidate.role === role);
  return message ? messageText(message) : "";
}

function assistantText(events: RepaEvent[]): string {
  return events
    .flatMap((event) => (event.type === "assistant_text_delta" ? [event.delta] : []))
    .join("");
}

async function createTestSpace(
  testContext: TestContext,
  options: OpenFixtureOptions = {},
): Promise<TestSpace> {
  const root = await mkdtemp(path.join(os.tmpdir(), "repa-acceptance-"));
  const learnerSpace = path.join(root, "learner");
  const agentDir = path.join(root, "agent");
  await mkdir(path.join(learnerSpace, ".pi"), { recursive: true });
  await mkdir(agentDir, { recursive: true });
  await writeFile(
    path.join(agentDir, "settings.json"),
    `${JSON.stringify(
      {
        extensions: ["!**/*"],
        skills: ["!**/*"],
        prompts: ["!**/*"],
        themes: ["!**/*"],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    path.join(learnerSpace, ".pi", "settings.json"),
    `${JSON.stringify(
      {
        packages: options.packages ?? [fixturePackage],
        retry: { enabled: false },
        compaction: options.compaction ?? {
          enabled: true,
          reserveTokens: 400,
          keepRecentTokens: 200,
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  testContext.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  return { root, learnerSpace, agentDir };
}

async function createModelOverride(
  space: TestSpace,
  options: OpenFixtureOptions = {},
): Promise<{ faux: FauxProviderHandle; override: PiModelOverride }> {
  const faux = fauxProvider({
    api: `repa-test-api-${path.basename(space.root)}`,
    provider: `repa-test-provider-${path.basename(space.root)}`,
    models: [
      {
        id: "repa-test-model",
        name: "Repa Test Model",
        reasoning: false,
        input: ["text"],
        contextWindow: options.contextWindow ?? 16_384,
        maxTokens: options.maxTokens ?? 512,
      },
    ],
    tokensPerSecond: options.tokensPerSecond ?? 0,
    tokenSize: { min: 1, max: 1 },
  });
  const modelRuntime = await ModelRuntime.create({
    authPath: path.join(space.agentDir, "auth.json"),
    modelsPath: null,
    allowModelNetwork: false,
    refreshOnCreate: false,
  });
  modelRuntime.registerNativeProvider(faux.provider);
  return {
    faux,
    override: { modelRuntime, model: faux.getModel() },
  };
}

async function openFixture(
  testContext: TestContext,
  options: OpenFixtureOptions = {},
): Promise<{
  space: TestSpace;
  faux: FauxProviderHandle;
  application: RepaApplication;
  collector: EventCollector;
}> {
  const space = await createTestSpace(testContext, options);
  const { faux, override } = await createModelOverride(space, options);
  const opened = await openRepa(
    {
      learnerSpace: space.learnerSpace,
      agentDir: space.agentDir,
      resume: options.resume,
      trustExtensions: options.trustExtensions ?? true,
    },
    { modelOverride: override },
  );
  assert.equal(opened.ok, true, opened.ok ? undefined : opened.error.message);
  const application = opened.application;
  const collector = new EventCollector(application.events);
  await collector.waitFor((event) => event.type === "session_opened", "Session 未打开。");
  testContext.after(async () => {
    await application.command({ type: "close" });
    await collector.done;
  });
  return { space, faux, application, collector };
}

test("Application seam 流式对话并复用受信任 Package 的 prompt、skill 与 tool", async (t) => {
  const { faux, application, collector } = await openFixture(t);

  const responses: FauxResponseStep[] = [
    (context) => {
      assert.match(latestMessageText(context, "user"), /FIXTURE_PROMPT_EXPANDED/u);
      const systemPrompt = context.systemPrompt ?? "";
      assert.match(systemPrompt, /You are Repa, a general learning Agent\./u);
      assert.match(systemPrompt, /fixture-learning-skill/u);
      assert.doesNotMatch(systemPrompt, /expert coding assistant operating inside pi/iu);
      const toolNames = (context.tools ?? []).map((tool) => tool.name).sort();
      assert.deepEqual(toolNames, ["fixture_echo", "read"]);
      return fauxAssistantMessage("普通流式回复");
    },
    fauxAssistantMessage(fauxToolCall("fixture_echo", { message: "hello" }), {
      stopReason: "toolUse",
    }),
    (context) => {
      assert.match(latestMessageText(context, "toolResult"), /fixture:hello/u);
      return fauxAssistantMessage("扩展工具闭环完成");
    },
    fauxAssistantMessage(fauxToolCall("read", { path: fixtureSkillPath }), {
      stopReason: "toolUse",
    }),
    (context) => {
      assert.match(latestMessageText(context, "toolResult"), /FULL_SKILL_INSTRUCTION_MARKER/u);
      return fauxAssistantMessage("skill 完整说明已读取");
    },
    fauxAssistantMessage(
      fauxToolCall("read", { path: path.join(fixturePackage, "package.json") }),
      { stopReason: "toolUse" },
    ),
    (context) => {
      assert.match(latestMessageText(context, "toolResult"), /只允许访问当前已启用 skill/u);
      return fauxAssistantMessage("越界读取已拒绝");
    },
  ];
  faux.setResponses(responses);

  const promptStart = collector.events.length;
  await application.command({ type: "send", text: "/fixture-prompt" });
  await collector.settle();
  assert.match(assistantText(collector.events.slice(promptStart)), /普通流式回复/u);
  assert(
    collector.events.slice(promptStart).filter((event) => event.type === "assistant_text_delta")
      .length > 1,
    "普通回复应通过多个 text delta 流式返回。",
  );

  const extensionStart = collector.events.length;
  await application.command({ type: "send", text: "调用扩展工具" });
  await collector.settle();
  const extensionEvents = collector.events.slice(extensionStart);
  assert(
    extensionEvents.some(
      (event) =>
        event.type === "tool_finished" &&
        event.name === "fixture_echo" &&
        !event.isError &&
        event.output.includes("fixture:hello"),
    ),
  );
  assert.match(assistantText(extensionEvents), /扩展工具闭环完成/u);

  const skillStart = collector.events.length;
  await application.command({ type: "send", text: "读取 fixture skill" });
  await collector.settle();
  const skillEvents = collector.events.slice(skillStart);
  assert(
    skillEvents.some(
      (event) =>
        event.type === "tool_finished" &&
        event.name === "read" &&
        !event.isError &&
        event.output.includes("FULL_SKILL_INSTRUCTION_MARKER"),
    ),
  );
  assert.match(assistantText(skillEvents), /skill 完整说明已读取/u);

  const deniedReadStart = collector.events.length;
  await application.command({ type: "send", text: "尝试读取 skill 目录之外的文件" });
  await collector.settle();
  const deniedReadEvents = collector.events.slice(deniedReadStart);
  assert(
    deniedReadEvents.some(
      (event) =>
        event.type === "tool_finished" &&
        event.name === "read" &&
        event.isError &&
        event.output.includes("只允许访问当前已启用 skill"),
    ),
  );
  assert.match(assistantText(deniedReadEvents), /越界读取已拒绝/u);
  assert(collector.events.some((event) => event.type === "extension_trust"));
  assert.equal(collector.events.some((event) => event.type === "error"), false);
});

test("未显式信任时不加载项目 Package、skill 或 prompt", async (t) => {
  const { faux, application, collector } = await openFixture(t, { trustExtensions: false });
  faux.setResponses([
    (context) => {
      assert.equal(latestMessageText(context, "user"), "/fixture-prompt");
      assert.doesNotMatch(context.systemPrompt ?? "", /fixture-learning-skill/u);
      assert.deepEqual((context.tools ?? []).map((tool) => tool.name), ["read"]);
      return fauxAssistantMessage("UNTRUSTED_RESOURCES_DISABLED");
    },
  ]);

  await application.command({ type: "send", text: "/fixture-prompt" });
  await collector.settle();
  assert.match(assistantText(collector.events), /UNTRUSTED_RESOURCES_DISABLED/u);
  assert.equal(collector.events.some((event) => event.type === "extension_trust"), false);
  assert.equal(
    collector.events.some(
      (event) => event.type === "tool_started" && event.name === "fixture_echo",
    ),
    false,
  );
});

test("Application seam 可以取消生成，并把 provider 失败变成可恢复错误", async (t) => {
  const { faux, application, collector } = await openFixture(t, { tokensPerSecond: 20 });
  faux.setResponses([
    fauxAssistantMessage("等待取消的流式内容。".repeat(80)),
    fauxAssistantMessage("", { stopReason: "error", errorMessage: "provider exploded" }),
    fauxAssistantMessage("错误后仍可继续"),
  ]);

  const send = application.command({ type: "send", text: "请生成很长的内容" });
  await collector.waitFor(
    (event) => event.type === "assistant_text_delta",
    "取消测试没有观察到首个流式增量。",
  );
  await application.command({ type: "cancel" });
  await send;
  await collector.settle();
  assert(collector.events.some((event) => event.type === "generation_cancelled"));
  assert(
    collector.events.some(
      (event) => event.type === "turn_finished" && event.status === "cancelled",
    ),
  );

  const failureStart = collector.events.length;
  await application.command({ type: "send", text: "触发 provider 失败" });
  await collector.settle();
  const failureEvents = collector.events.slice(failureStart);
  assert(
    failureEvents.some(
      (event) =>
        event.type === "error" &&
        event.code === "provider" &&
        event.recoverable &&
        event.message.includes("provider exploded"),
    ),
    `provider 失败事件不符合稳定类别：${JSON.stringify(failureEvents, null, 2)}`,
  );
  assert(
    failureEvents.some(
      (event) => event.type === "turn_finished" && event.status === "failed",
    ),
  );

  const recoveryStart = collector.events.length;
  await application.command({ type: "send", text: "失败后继续" });
  await collector.settle();
  assert.match(assistantText(collector.events.slice(recoveryStart)), /错误后仍可继续/u);
});

test("关闭后重新打开同一学习者空间会恢复原 Pi Session", async (t) => {
  const space = await createTestSpace(t);
  const firstModel = await createModelOverride(space);
  firstModel.faux.setResponses([fauxAssistantMessage("FIRST_SESSION_REPLY")]);
  const firstOpen = await openRepa(
    {
      learnerSpace: space.learnerSpace,
      agentDir: space.agentDir,
      trustExtensions: true,
    },
    { modelOverride: firstModel.override },
  );
  assert.equal(firstOpen.ok, true, firstOpen.ok ? undefined : firstOpen.error.message);
  const firstCollector = new EventCollector(firstOpen.application.events);
  const firstOpened = await firstCollector.waitFor(
    (event) => event.type === "session_opened",
    "首次 Session 未打开。",
  );
  assert.equal(firstOpened.type, "session_opened");
  assert.equal(firstOpened.restored, false);
  await firstOpen.application.command({ type: "send", text: "FIRST_SESSION_USER" });
  await firstOpen.application.command({ type: "close" });
  await firstCollector.done;

  const secondModel = await createModelOverride(space);
  secondModel.faux.setResponses([
    (context) => {
      const transcript = context.messages.map(messageText).join("\n");
      assert.match(transcript, /FIRST_SESSION_USER/u);
      assert.match(transcript, /FIRST_SESSION_REPLY/u);
      return fauxAssistantMessage("RESUMED_SESSION_REPLY");
    },
  ]);
  const secondOpen = await openRepa(
    {
      learnerSpace: space.learnerSpace,
      agentDir: space.agentDir,
      trustExtensions: true,
    },
    { modelOverride: secondModel.override },
  );
  assert.equal(secondOpen.ok, true, secondOpen.ok ? undefined : secondOpen.error.message);
  const secondCollector = new EventCollector(secondOpen.application.events);
  const secondOpened = await secondCollector.waitFor(
    (event) => event.type === "session_opened",
    "恢复 Session 未打开。",
  );
  assert.equal(secondOpened.type, "session_opened");
  assert.equal(secondOpened.restored, true);
  assert.equal(secondOpened.sessionId, firstOpened.sessionId);

  const resumeStart = secondCollector.events.length;
  await secondOpen.application.command({ type: "send", text: "恢复后继续" });
  await secondCollector.settle();
  assert.match(assistantText(secondCollector.events.slice(resumeStart)), /RESUMED_SESSION_REPLY/u);
  await secondOpen.application.command({ type: "close" });
  await secondCollector.done;
});

test("标准 compaction 完成后仍能通过同一 seam 继续对话", async (t) => {
  const { faux, application, collector } = await openFixture(t, {
    contextWindow: 1_600,
    maxTokens: 256,
    compaction: { enabled: true, reserveTokens: 400, keepRecentTokens: 200 },
  });
  const scripted: FauxResponseStep = (context, _options, state) => {
    if (!(context.systemPrompt ?? "").includes(REPA_BASE_PROMPT)) {
      return fauxAssistantMessage("STANDARD_COMPACTION_SUMMARY");
    }
    return fauxAssistantMessage(`NORMAL_REPLY_${state.callCount}:` + "学习上下文。".repeat(80));
  };
  faux.setResponses(Array.from({ length: 40 }, () => scripted));

  for (let index = 0; index < 10; index += 1) {
    await application.command({
      type: "send",
      text: `LONG_USER_${index}:` + "需要保留的学习对话。".repeat(80),
    });
    if (
      collector.events.some(
        (event) => event.type === "compaction_finished" && !event.aborted,
      )
    ) {
      break;
    }
  }

  assert(
    collector.events.some((event) => event.type === "compaction_started"),
    "未观察到 Pi 标准 compaction 启动。",
  );
  assert(
    collector.events.some(
      (event) => event.type === "compaction_finished" && !event.aborted,
    ),
    "未观察到 Pi 标准 compaction 完成。",
  );

  const continuationStart = collector.events.length;
  await application.command({ type: "send", text: "压缩后继续" });
  await collector.settle();
  assert.match(assistantText(collector.events.slice(continuationStart)), /NORMAL_REPLY_/u);
  assert.equal(
    collector.events
      .slice(continuationStart)
      .some((event) => event.type === "turn_finished" && event.status === "completed"),
    true,
  );
});

test("Extension 与 Session 打开失败使用稳定错误类别", async (t) => {
  const broken = await openFixture(t, { packages: [fixturePackage, brokenPackage] });
  const extensionError = await broken.collector.waitFor(
    (event) =>
      event.type === "error" &&
      event.code === "extension" &&
      event.message.includes("BROKEN_EXTENSION_MARKER"),
    "损坏 Extension 没有转换成稳定错误事件。",
  );
  assert.equal(extensionError.type, "error");
  assert.equal(extensionError.operation, "extension");
  assert.equal(extensionError.recoverable, true);

  const root = await mkdtemp(path.join(os.tmpdir(), "repa-invalid-space-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const filePath = path.join(root, "not-a-directory");
  await writeFile(filePath, "file", "utf8");
  const failedOpen = await openRepa({ learnerSpace: filePath });
  assert.equal(failedOpen.ok, false);
  assert.equal(failedOpen.error.code, "session");
  assert.equal(failedOpen.error.operation, "open");
  assert.equal(failedOpen.error.recoverable, false);
});
