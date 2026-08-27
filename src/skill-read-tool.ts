import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

import type { ResourceLoader, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const readParameters = Type.Object({
  path: Type.String({ description: "已启用 skill 资源的绝对或相对路径" }),
  offset: Type.Optional(Type.Integer({ minimum: 1, description: "从第几行开始读取（从 1 开始）" })),
  limit: Type.Optional(Type.Integer({ minimum: 1, description: "最多读取多少行" })),
});

const MAX_RESOURCE_BYTES = 1024 * 1024;

function isInside(baseDirectory: string, candidate: string): boolean {
  const relative = path.relative(baseDirectory, candidate);
  return (
    relative === "" ||
    (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}

async function canonicalDirectories(resourceLoader: ResourceLoader): Promise<string[]> {
  const directories = new Set<string>();
  for (const skill of resourceLoader.getSkills().skills) {
    directories.add(await realpath(skill.baseDir));
  }
  return [...directories];
}

export async function createSkillReadTool(
  learnerSpace: string,
  resourceLoader: ResourceLoader,
): Promise<ToolDefinition<any, any>> {
  const allowedDirectories = await canonicalDirectories(resourceLoader);

  const tool: ToolDefinition<
    typeof readParameters,
    { path: string; startLine: number; endLine: number }
  > = {
    name: "read",
    label: "读取 skill 资源",
    description:
      "读取已启用 skill 自己目录内的文本资源。此能力不提供任意文件访问，也不启用其他 coding tools。",
    promptSnippet: "Read enabled skill instructions and their bundled text resources",
    parameters: readParameters,
    async execute(_toolCallId, parameters, signal) {
      if (signal?.aborted) throw new Error("读取已取消。");

      const requestedPath = path.isAbsolute(parameters.path)
        ? parameters.path
        : path.resolve(learnerSpace, parameters.path);
      const canonicalPath = await realpath(requestedPath);

      if (!allowedDirectories.some((directory) => isInside(directory, canonicalPath))) {
        throw new Error("read 只允许访问当前已启用 skill 自己的资源目录。");
      }

      const file = await stat(canonicalPath);
      if (!file.isFile()) throw new Error("read 只能读取普通文件。");
      if (file.size > MAX_RESOURCE_BYTES) {
        throw new Error("skill 资源超过 1 MiB；请将说明拆分为较小的文本资源。");
      }

      const text = await readFile(canonicalPath, "utf8");
      if (signal?.aborted) throw new Error("读取已取消。");

      const lines = text.split(/\r?\n/u);
      const startIndex = (parameters.offset ?? 1) - 1;
      if (startIndex >= lines.length) {
        throw new Error(`offset 超出文件范围；文件共 ${lines.length} 行。`);
      }

      const endIndex = parameters.limit
        ? Math.min(lines.length, startIndex + parameters.limit)
        : lines.length;
      let output = lines.slice(startIndex, endIndex).join("\n");
      if (endIndex < lines.length) {
        output += `\n\n[文件还有 ${lines.length - endIndex} 行；使用 offset=${endIndex + 1} 继续读取。]`;
      }

      return {
        content: [{ type: "text", text: output }],
        details: {
          path: canonicalPath,
          startLine: startIndex + 1,
          endLine: endIndex,
        },
      };
    },
  };

  return tool as ToolDefinition<any, any>;
}
