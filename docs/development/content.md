# 内容、保存与恢复

`ContentStore` 是一个学习空间中正文、身份和内容关系的共同修改入口。前端通过应用协议调用，Agent 通过常规 `read`、`edit`、`write`、`apply_patch` 工具调用。两条路径都经过同一个实例和串行队列；模型不填写 `operationId`。

## 目标与版本

普通文件通过 `ContentTarget.kind = "file"` 和空间内路径访问，读取不会自动登记身份。需要持续引用时，`content.associate` 建立 `ContentRef`，区分 `document` 与 `material`。`content.get` 返回解析后的身份、位置和可用状态；移动更新位置，已删除或解除关联的身份不会指向后来占用同一路径的新文件。

| 字段 | 所属对象与用途 |
| --- | --- |
| `ContentInfo.bodyRevision` | 实际文件字节的版本；`content.write.base`、删除正文的 `content.remove.base` 和分页读取的 `revision` 使用它 |
| `ContentInfo.revision` | 已登记内容的身份、位置、状态与组成版本；`content.relink`、`content.setComposition` 和解除材料关联的 `content.remove.base` 使用它。普通文件的该字段同时反映字节与位置 |
| `ContextState.revision` | 学习语境绑定自身的版本；`context.set.base` 使用它 |
| 内容订阅事件的 `revision` | 当前后端的查询失效标识；不能作为文件保存基准或持久历史版本 |

这些字段是不透明字符串。正文编辑不替换组成关系，修改语境成员正文不要求重写语境绑定。目录列举只返回条目元信息，不读取所有文件正文；条目上的空版本表示尚未取得该对象的修改基准。

整篇写入检查 `bodyRevision`，新增文件使用 `{ kind: "absent" }`。精确 `edit` 在当前内容中定位唯一文本片段；补丁使用 `*** Begin Patch` 格式，支持增加、删除、修改和移动。定位用的宽松空白与标点比较不会改写未涉及的字符或换行。

## 客户端保存示例

```ts
const target = {
  kind: "file" as const,
  spaceId,
  location: { kind: "relative" as const, path: "notes/architecture.md" },
};

const opened = await client.readText(target);
const operationId = crypto.randomUUID();
const result = await client.call("content.write", {
  target: opened.content.target,
  base: opened.content.bodyRevision!,
  value: { kind: "text", text: editedText },
  operationId,
});
```

`content.read` 是可分页的预览。`client.readText` 在预览截断时读取对应不可变资源，取得同一修订的完整 UTF-8 正文；二进制交给相应处理器。编辑器不能将截断片段当作整篇内容保存。

断线或超时后保留 `operationId`，通过 `operation.get` 核对。相同操作的重传返回原结果，修改参数须使用新标识。保存回执只确认本次实际提交的草稿版本；后续本地输入和外部修改由草稿服务继续处理。文件保存不会启动模型。

当前内容方法还包括 `content.list/get/read/edit/applyPatch/associate/relink/remove/setComposition`，以及 `operation.get/undo/reconcile`、`context.get/set/preview`。参数、返回值和运行时校验来自 [内容协议](../../src/content/protocol.ts)。移动可以通过补丁表达；独立复制、材料收集、检索与格式转换接口尚未接入。

## 持久数据与可见结果

```text
<space>/
  普通内容文件……
  .repa/
    content/
      catalog.json          # 身份、位置、组成与语境绑定
      operations/<id>.json  # 内容操作的准备、结果与恢复状态
      blobs/<sha256>        # 不可变字节，含操作前后版本及上传资源
    runtime/                # 空间身份、锁和运行记录
    sessions/               # Pi 会话 JSONL
    settings.json           # 空间与会话提示覆盖
```

空间运行锁由 `RuntimeStore` 持有。`ContentStore` 准备具体文件效果，`FileJournal` 先持久保存恢复记录，再写入文件，全部完成后记录 `committed`。正文与相关清单可以属于同一次操作。客户端在完整操作后取得结果批次；原生文件系统访问者仍可能看到中间状态。

操作记录区分 `prepared`、`committed`、`rolled_back`、`needs_recovery` 和 `reconciled`。重开空间时检查未完成操作的真实文件，只在当前内容仍能确认为本操作效果时恢复；不能确认的后续修改保留为冲突。相关结构访问返回 `recovery_required`，按实际文件路径读取和修复仍可进行。

`operation.reconcile` 检查修复后的结果。中断移动涉及身份位置时，需要先通过 `content.relink` 等实际操作修复，再解除状态；原中断记录保留。撤回通过新的 `undoOperationId` 执行，能够分离的后续文本和关系变化继续保留。重复文本、重叠改动或位置重新被占用时返回冲突；当前文本合并依据唯一未变行保守定位，不能保证自动合并所有字符级编辑。撤回文件创建可能保留已建立的空父目录。

文件观察到的前后字节和上传资源目前持续保存在空间中。尚未实现历史清理、资源引用计数与展示实例的临时持有；引入清理前必须一起接通这些保留关系，不能仅按文件年龄删除 blob。

## 外部材料与资源

经过认证的前端调用 `content.associate` 或 `content.relink`，明确选择空间外文件时，应用在 `repa-content-access.json` 中保存该空间对实际规范文件路径的只读授权。授权位于应用配置目录，空间内的内容清单不能自行授予权限。普通模型读写工具不会建立该授权；已启用 Skill 的自有目录只向读取适配器开放。

默认关联原件，内容中保存外部位置。`content.remove` 配合 `detach: true` 解除材料身份关联并保留原件；这一步不等于收回应用已有的文件读取授权。空间外写入当前返回 `permission_required`。

`client.uploadResource(spaceId, bytes, mediaType)` 上传不可变字节，当前单次上限为 64 MiB。内容读取得到的 `ResourceRef` 可通过 `client.resource(ref)` 获取，并支持单个 HTTP 字节范围。资源按已打开空间读取；标识本身不构成授权。当前接口供已认证的前端使用，可执行展示实例的受限资源桥接仍待实现。

`ContentStore` 也解释学习语境：直接关联文档，或读取有序 JSON 组成清单。成员选择展开或引用，普通链接不递归展开；读取失败返回具体问题，不能当作清空。当前实际文本及来源由 `context.preview` 返回，快照何时进入模型由 [Agent 适配层](agent-runtime.md) 决定。
