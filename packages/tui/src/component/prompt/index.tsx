import {
  BoxRenderable,
  RGBA,
  TextareaRenderable,
  MouseEvent,
  PasteEvent,
  decodePasteBytes,
  type KeyEvent,
  type Renderable,
} from "@opentui/core"
import type { CommandContext } from "@opentui/keymap"
import { createEffect, createMemo, onMount, createSignal, onCleanup, on, Show, Switch, Match } from "solid-js"
import { registerOpencodeSpinner } from "../register-spinner"
import path from "path"
import { fileURLToPath } from "url"
import { useLocal } from "../../context/local"
import { tint, useTheme } from "../../context/theme"
import { EmptyBorder, SplitBorder } from "../../ui/border"
import { useTuiPaths, useTuiTerminalEnvironment } from "../../context/runtime"
import { useClipboard } from "../../context/clipboard"
import { Spinner } from "../spinner"
import { useSDK } from "../../context/sdk"
import { useRoute } from "../../context/route"
import { useProject } from "../../context/project"
import { useSync } from "../../context/sync"
import { useEvent } from "../../context/event"
import { editorSelectionKey, useEditorContext, type EditorSelection } from "../../context/editor"
import { normalizePromptContent, openEditor } from "../../editor"
import { useExit } from "../../context/exit"
import { promptOffsetWidth } from "../../prompt/display"
import { createStore, produce, unwrap } from "solid-js/store"
import { usePromptHistory, type PromptInfo } from "../../prompt/history"
import { computePromptTraits } from "../../prompt/traits"
import { expandPastedTextPlaceholders, expandTrackedPastedText } from "../../prompt/part"
import { usePromptStash } from "../../prompt/stash"
import { DialogStash } from "../dialog-stash"
import { type AutocompleteRef, Autocomplete } from "./autocomplete"
import { useRenderer, useTerminalDimensions, type JSX } from "@opentui/solid"
import type { AssistantMessage, FilePart, UserMessage } from "@opencode-ai/sdk/v2"
import { Locale } from "../../util/locale"
import { errorMessage } from "../../util/error"
import { formatDuration } from "../../util/format"
import { createColors, createFrames } from "../../ui/spinner"
import { useDialog } from "../../ui/dialog"
import { DialogProvider as DialogProviderConnect } from "../dialog-provider"
import { DialogAlert } from "../../ui/dialog-alert"
import { useToast } from "../../ui/toast"
import { useKV } from "../../context/kv"
import { createFadeIn } from "../../util/signal"
import { DialogSkill } from "../dialog-skill"
import { useArgs } from "../../context/args"
import { REPA_BASE_MODE, useBindings, useCommandShortcut, useLeaderActive, useOpencodeKeymap } from "../../keymap"
import { useTuiConfig } from "../../config"
import { usePromptStartLocation } from "./move"
import { readLocalAttachment } from "./local-attachment"
import { Identifier } from "@opencode-ai/core/id/id"
import type { ForkDraft } from "../../util/fork-draft"
import { captureVisibleTurn, dispatchVisibleTurn, type VisibleTurnTarget } from "../../util/visible-turn"

registerOpencodeSpinner()

export type PromptProps = {
  sessionID?: string
  fork?: ForkDraft
  visible?: boolean
  disabled?: boolean
  onSubmit?: () => void
  ref?: (ref: PromptRef | undefined) => void
  hint?: JSX.Element
  right?: JSX.Element
  showPlaceholder?: boolean
  placeholders?: {
    normal?: string[]
    shell?: string[]
  }
}

function pastedFilepath(value: string, platform: string) {
  const raw = value.replace(/^['"]+|['"]+$/g, "")
  if (raw.startsWith("file://")) {
    try {
      return fileURLToPath(raw)
    } catch {}
  }
  if (platform === "win32") return raw
  return raw.replace(/\\(.)/g, "$1")
}

export type PromptRef = {
  focused: boolean
  current: PromptInfo
  set(prompt: PromptInfo): void
  reset(): void
  blur(): void
  focus(): void
  submit(): void
}

type DeliveryState =
  | { type: "editing" }
  | { type: "later_selected"; target: VisibleTurnTarget; turnStartRevision: number }
  | { type: "undelivered"; reason: string }

type LaterSelected = Extract<DeliveryState, { type: "later_selected" }>

type SubmissionAttempt = Readonly<{
  deliveryKind: "start" | "steer"
  sessionID?: string
  target?: VisibleTurnTarget
  selected?: LaterSelected
  busyNormal: boolean
  observedDelivery: DeliveryState
  turnStartRevision: number
}>

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

const DRAFT_RETENTION_MIN_CHARS = 20

function randomIndex(count: number) {
  if (count <= 0) return 0
  return Math.floor(Math.random() * count)
}

function fadeColor(color: RGBA, alpha: number) {
  return RGBA.fromValues(color.r, color.g, color.b, color.a * alpha)
}

function hasEditorRangeSelection(selection: EditorSelection["ranges"][number]) {
  return (
    selection.selection.start.line !== selection.selection.end.line ||
    selection.selection.start.character !== selection.selection.end.character
  )
}

function getEditorRangeLabel(selection: EditorSelection["ranges"][number]) {
  if (!hasEditorRangeSelection(selection)) return
  if (selection.selection.start.line === selection.selection.end.line) return `#${selection.selection.start.line}`
  return `#${selection.selection.start.line}-${selection.selection.end.line}`
}

function formatEditorContext(selection: EditorSelection) {
  const selected = selection.ranges.filter(hasEditorRangeSelection)
  if (selected.length === 0)
    return `<system-reminder>Note: The user opened the file "${selection.filePath}". This may or may not be relevant to the current task.</system-reminder>\n`

  const ranges = selected.map((range, index) => {
    const prefix = selected.length > 1 ? `Selection ${index + 1}: ` : ""
    return `Note: The user selected ${prefix}${getEditorRangeLabel(range)} from "${selection.filePath}". \`\`\`${range.text}\`\`\`\n\n`
  })

  return `<system-reminder>${ranges.join("\n")} This may or may not be relevant to the current task.</system-reminder>\n`
}

function expandCommandTemplate(template: string, argumentsText: string) {
  const args = argumentsText.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((arg) => arg.replace(/^"|"$/g, "")) ?? []
  const placeholders = template.match(/\$\d+/g) ?? []
  const last = Math.max(0, ...placeholders.map((item) => Number(item.slice(1))))
  const expanded = template.replace(/\$(\d+)/g, (_, value: string) => {
    const position = Number(value)
    if (position === last) return args.slice(position - 1).join(" ")
    return args[position - 1] ?? ""
  })
  const usesArguments = template.includes("$ARGUMENTS")
  const result = expanded.replaceAll("$ARGUMENTS", argumentsText)
  if (placeholders.length > 0 || usesArguments || !argumentsText.trim()) return result.trim()
  return `${result}\n\n${argumentsText}`.trim()
}

let stashed: { prompt: PromptInfo; cursor: number } | undefined

export function Prompt(props: PromptProps) {
  let input: TextareaRenderable
  let anchor: BoxRenderable
  const [inputTarget, setInputTarget] = createSignal<TextareaRenderable | undefined>()

  const leader = useLeaderActive()
  const local = useLocal()
  const args = useArgs()
  const paths = useTuiPaths()
  const terminalEnvironment = useTuiTerminalEnvironment()
  const clipboard = useClipboard()
  const sdk = useSDK()
  const editor = useEditorContext()
  const route = useRoute()
  const project = useProject()
  const sync = useSync()
  const tuiConfig = useTuiConfig()
  const dialog = useDialog()
  const toast = useToast()
  const status = createMemo(() => sync.data.session_status?.[props.sessionID ?? ""] ?? { type: "idle" })
  const visibleActiveTurnID = createMemo(() => (props.sessionID ? sync.session.activeTurn(props.sessionID) : undefined))
  const history = usePromptHistory()
  const stash = usePromptStash()
  const keymap = useOpencodeKeymap()
  const agentShortcut = useCommandShortcut("agent.cycle")
  const paletteShortcut = useCommandShortcut("command.palette.show")
  const laterShortcut = useCommandShortcut("input.submit")
  const currentWorkShortcut = useCommandShortcut("session.steer")
  const renderer = useRenderer()
  const exit = useExit()
  const dimensions = useTerminalDimensions()
  const { theme, syntax } = useTheme()
  const kv = useKV()
  const animationsEnabled = createMemo(() => kv.get("animations_enabled", true))
  const list = createMemo(() => props.placeholders?.normal ?? [])
  const shell = createMemo(() => props.placeholders?.shell ?? [])
  const fileContextEnabled = createMemo(() => kv.get("file_context_enabled", true))
  const [dismissedEditorSelectionKey, setDismissedEditorSelectionKey] = createSignal<string>()
  const editorContext = createMemo(() => {
    const selection = fileContextEnabled() ? editor.selection() : undefined
    if (!selection) return
    return editorSelectionKey(selection) === dismissedEditorSelectionKey() ? undefined : selection
  })
  const editorPath = createMemo(() => editorContext()?.filePath)
  const editorSelectionLabel = createMemo(() => {
    const ranges = editorContext()?.ranges
    if (!ranges) return
    const first = ranges.find(hasEditorRangeSelection) ?? ranges[0]
    if (!first) return
    return [getEditorRangeLabel(first), ranges.length > 1 ? `+${ranges.length - 1}` : undefined]
      .filter(Boolean)
      .join(" ")
  })
  const editorFileLabel = createMemo(() => {
    const value = editorPath()
    if (!value) return
    const filename = path.basename(value)
    const file = /^index\.[^./]+$/.test(filename)
      ? [path.basename(path.dirname(value)), filename].filter(Boolean).join("/")
      : filename
    return `${file.split(path.sep).join("/")}${editorSelectionLabel() ?? ""}`
  })
  const editorFileLabelDisplay = createMemo(() => {
    const file = editorFileLabel()
    if (!file) return
    return Locale.truncateMiddle(file, Math.max(12, Math.min(48, Math.floor(dimensions().width / 3))))
  })
  const editorContextLabelState = createMemo(() => editor.labelState())
  const [auto, setAuto] = createSignal<AutocompleteRef>()
  const startLocation = usePromptStartLocation({ projectID: project.project })
  const [cursorVersion, setCursorVersion] = createSignal(0)
  const currentProviderLabel = createMemo(() => local.model.parsed().provider)
  const hasRightContent = createMemo(() => Boolean(props.right))

  function promptModelWarning() {
    toast.show({
      variant: "warning",
      message: "Connect a provider to send prompts",
      duration: 3000,
    })
    if (sync.data.provider.length === 0) {
      dialog.replace(() => <DialogProviderConnect />)
    }
  }

  function dismissEditorContext() {
    setDismissedEditorSelectionKey(editorSelectionKey(editorContext()))
    editor.clearSelection()
  }
  const fileStyleId = syntax().getStyleId("extmark.file")!
  const agentStyleId = syntax().getStyleId("extmark.agent")!
  const pasteStyleId = syntax().getStyleId("extmark.paste")!
  let promptPartTypeId = 0
  const event = useEvent()
  const [turnStartRevision, setTurnStartRevision] = createSignal(0)
  const observedTurnStarts = new Set<string>()

  event.on("turn.started", (evt, { directory }) => {
    if (directory !== project.instance.directory()) return
    if (evt.properties.sessionID !== props.sessionID) return
    if (observedTurnStarts.has(evt.properties.turnID)) return
    observedTurnStarts.add(evt.properties.turnID)
    setTurnStartRevision((revision) => revision + 1)
  })

  event.on("tui.prompt.append", (evt, { directory }) => {
    if (directory !== project.instance.directory()) return
    if (!input || input.isDestroyed) return
    if (deliveryPending()) return
    input.insertText(evt.properties.text)
    setTimeout(() => {
      // setTimeout is a workaround and needs to be addressed properly
      if (!input || input.isDestroyed) return
      input.getLayoutNode().markDirty()
      input.gotoBufferEnd()
      renderer.requestRender()
    }, 0)
  })

  createEffect(() => {
    if (!input || input.isDestroyed) return
    if (props.disabled) input.cursorColor = theme.backgroundElement
    if (!props.disabled) input.cursorColor = theme.text
  })

  const lastUserMessage = createMemo(() => {
    if (!props.sessionID) return undefined
    const messages = sync.data.message[props.sessionID]
    if (!messages) return undefined
    return messages.findLast((m): m is UserMessage => m.role === "user")
  })

  const usage = createMemo(() => {
    if (!props.sessionID) return
    const session = sync.session.get(props.sessionID)
    const msg = sync.data.message[props.sessionID] ?? []
    const last = msg.findLast((item): item is AssistantMessage => item.role === "assistant" && item.tokens.output > 0)
    if (!last) return

    const tokens =
      last.tokens.input + last.tokens.output + last.tokens.reasoning + last.tokens.cache.read + last.tokens.cache.write
    if (tokens <= 0) return

    const model = sync.data.provider.find((item) => item.id === last.providerID)?.models[last.modelID]
    const pct = model?.limit.context ? `${Math.round((tokens / model.limit.context) * 100)}%` : undefined
    const cost = session?.cost ?? 0
    return {
      context: pct ? `${Locale.number(tokens)} (${pct})` : Locale.number(tokens),
      cost: cost > 0 ? money.format(cost) : undefined,
    }
  })

  const [store, setStore] = createStore<{
    prompt: PromptInfo
    mode: "normal" | "shell"
    extmarkToPartIndex: Map<number, number>
    interrupt: number
    placeholder: number
  }>({
    placeholder: randomIndex(list().length),
    prompt: {
      input: "",
      parts: [],
    },
    mode: "normal",
    extmarkToPartIndex: new Map(),
    interrupt: 0,
  })
  const [delivery, setDelivery] = createSignal<DeliveryState>({ type: "editing" })
  const [deliveryPending, setDeliveryPending] = createSignal(false)
  let editRevision = 0
  const deliveryLabel = createMemo(() => {
    const current = delivery()
    if (current.type === "later_selected") return "send after this response · editable · this window only"
    if (current.type === "undelivered") return `not sent · ${current.reason}`
    return undefined
  })

  createEffect(() => {
    const sessionID = props.sessionID
    if (!sessionID || status().type === "idle" || visibleActiveTurnID()) return
    void sync.session.hydrateActiveTurn(sessionID).catch(() => {})
  })

  createEffect(() => {
    const selected = delivery()
    const activeTurnID = visibleActiveTurnID()
    const currentStatus = status().type
    if (selected.type !== "later_selected" || store.mode !== "normal") return
    if (turnStartRevision() !== selected.turnStartRevision) {
      markUndelivered("Another response started before this draft could be sent.")
      return
    }
    if (deliveryPending()) return
    if (currentStatus === "idle") {
      if (activeTurnID) return
      void submit("start", undefined, selected)
      return
    }
    if (!activeTurnID || selected.target.turnID === activeTurnID) return
    markUndelivered("Another response started before this draft could be sent.")
  })

  createEffect(
    on(
      () => props.sessionID,
      () => {
        setStore("placeholder", randomIndex(list().length))
      },
      { defer: true },
    ),
  )

  // Initialize agent/model/variant from last user message when session changes
  let syncedSessionID: string | undefined
  createEffect(() => {
    const sessionID = props.sessionID
    const msg = lastUserMessage()

    if (sessionID !== syncedSessionID) {
      if (!sessionID || !msg) return

      syncedSessionID = sessionID

      // Only set agent if it's a primary agent (not a subagent)
      const isPrimaryAgent = !!local.agent.get(msg.agent)
      if (msg.agent && isPrimaryAgent) {
        // Keep command line --agent if specified.
        if (!args.agent) local.agent.set(msg.agent)
        if (msg.model) {
          local.model.set(msg.model)
          local.model.variant.set(msg.model.variant)
        }
      }
    }
  })

  const promptCommands = createMemo(() =>
    [
      {
        title: "Clear prompt",
        name: "prompt.clear",
        category: "Prompt",
        hidden: true,
        run: () => {
          clearPrompt()
          dialog.clear()
        },
      },
      {
        title: "Submit prompt",
        name: "prompt.submit",
        category: "Prompt",
        hidden: true,
        run: async () => {
          if (!input.focused) return
          const handled = await submit()
          if (!handled) return

          dialog.clear()
        },
      },
      {
        title: "Remove editor context",
        name: "prompt.editor_context.clear",
        category: "Prompt",
        enabled: Boolean(editorContext()) && !deliveryPending(),
        run: () => {
          if (deliveryPending()) return
          dismissEditorContext()
          dialog.clear()
        },
      },
      {
        title: "Paste",
        name: "prompt.paste",
        category: "Prompt",
        hidden: true,
        run: async (ctx: CommandContext<Renderable, KeyEvent>) => {
          if (deliveryPending()) return
          const revision = editRevision
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          const content = await clipboard.read?.()
          if (!canApplyEdit(revision)) return
          if (content?.mime.startsWith("image/")) {
            await pasteAttachment(
              {
                filename: "clipboard",
                mime: content.mime,
                content: content.data,
              },
              revision,
            )
            return
          }
          if (content?.mime === "text/plain") {
            await pasteInputText(content.data, revision)
          }
        },
      },
      {
        title: "Interrupt session",
        name: "session.interrupt",
        category: "Session",
        hidden: true,
        enabled: status().type !== "idle" && !!visibleActiveTurnID(),
        run: () => {
          if (auto()?.visible) return
          if (!input.focused) return
          // TODO: this should be its own command
          if (store.mode === "shell") {
            setStore("mode", "normal")
            return
          }
          if (!props.sessionID) return

          setStore("interrupt", store.interrupt + 1)

          setTimeout(() => {
            setStore("interrupt", 0)
          }, 5000)

          if (store.interrupt >= 2) {
            const target = captureVisibleTurn(props.sessionID, visibleActiveTurnID())
            void dispatchVisibleTurn(target, (visible) =>
              sdk.client.session.interruptTurn({ sessionID: visible.sessionID, turnID: visible.turnID }),
            ).catch(() => {})
            setStore("interrupt", 0)
          }
          dialog.clear()
        },
      },
      {
        title: "Add to/correct this response",
        desc: "Send the current draft to the response already in progress",
        name: "session.steer",
        category: "Session",
        enabled:
          status().type !== "idle" &&
          !!visibleActiveTurnID() &&
          !!store.prompt.input &&
          store.mode === "normal" &&
          !deliveryPending() &&
          !props.fork,
        run: async () => {
          if (!input.focused || auto()?.visible) return
          const target = captureVisibleTurn(props.sessionID, visibleActiveTurnID())
          const selected = delivery()
          const handled = await submit("steer", target, selected.type === "later_selected" ? selected : undefined)
          if (handled) dialog.clear()
        },
      },
      {
        title: "Open editor",
        category: "Session",
        name: "prompt.editor",
        slashName: "editor",
        run: async () => {
          if (deliveryPending()) return
          const revision = editRevision
          dialog.clear()

          // replace summarized text parts with the actual text
          const text = store.prompt.parts
            .filter((p) => p.type === "text")
            .reduce((acc, p) => {
              if (!p.source) return acc
              return acc.replace(p.source.text.value, p.text)
            }, store.prompt.input)

          const nonTextParts = store.prompt.parts.filter((p) => p.type !== "text")

          const value = text
          const content = await openEditor({
            renderer,
            value,
            cwd:
              (project.instance.path().worktree === "/" ? undefined : project.instance.path().worktree) ||
              project.instance.directory() ||
              paths.cwd,
          })
          if (!canApplyEdit(revision)) return
          if (!content) return
          const normalized = normalizePromptContent(content)

          input.setText(normalized)

          // Update positions for nonTextParts based on their location in new content
          // Filter out parts whose virtual text was deleted
          // this handles a case where the user edits the text in the editor
          // such that the virtual text moves around or is deleted
          const updatedNonTextParts = nonTextParts
            .map((part) => {
              let virtualText = ""
              if (part.type === "file" && part.source?.text) {
                virtualText = part.source.text.value
              } else if (part.type === "agent" && part.source) {
                virtualText = part.source.value
              }

              if (!virtualText) return part

              const newStart = normalized.indexOf(virtualText)
              // if the virtual text is deleted, remove the part
              if (newStart === -1) return null

              const newEnd = newStart + virtualText.length

              if (part.type === "file" && part.source?.text) {
                return {
                  ...part,
                  source: {
                    ...part.source,
                    text: {
                      ...part.source.text,
                      start: newStart,
                      end: newEnd,
                    },
                  },
                }
              }

              if (part.type === "agent" && part.source) {
                return {
                  ...part,
                  source: {
                    ...part.source,
                    start: newStart,
                    end: newEnd,
                  },
                }
              }

              return part
            })
            .filter((part) => part !== null)

          setStore("prompt", {
            input: normalized,
            // keep only the non-text parts because the text parts were
            // already expanded inline
            parts: updatedNonTextParts,
          })
          updateDeliveryAfterEdit(normalized)
          restoreExtmarksFromParts(updatedNonTextParts)
          input.cursorOffset = Bun.stringWidth(normalized)
        },
      },
      {
        title: "Skills",
        name: "prompt.skills",
        category: "Prompt",
        slashName: "skills",
        run: () => {
          if (deliveryPending()) return
          dialog.replace(() => (
            <DialogSkill
              onSelect={(skill) => {
                if (deliveryPending()) return
                input.setText(`/${skill} `)
                setStore("prompt", {
                  input: `/${skill} `,
                  parts: [],
                })
                updateDeliveryAfterEdit(`/${skill} `)
                input.gotoBufferEnd()
              }}
            />
          ))
        },
      },
      {
        title: "Start session in another directory",
        desc: "Choose a local directory for the next session",
        name: "session.start_location",
        category: "Session",
        enabled: props.sessionID == null,
        slashName: "directory",
        run: () => {
          startLocation.open()
        },
      },
    ].map((entry) => ({
      namespace: "palette",
      ...entry,
    })),
  )

  useBindings(() => ({
    commands: promptCommands(),
  }))

  useBindings(() => ({
    mode: REPA_BASE_MODE,
    bindings: tuiConfig.keybinds.gather("prompt.palette", [
      "prompt.submit",
      "prompt.editor",
      "prompt.editor_context.clear",
      "prompt.stash",
      "prompt.stash.pop",
      "prompt.stash.list",
      "prompt.skills",
      "session.interrupt",
      "session.steer",
      "session.start_location",
    ]),
  }))

  const ref: PromptRef = {
    get focused() {
      return input.focused
    },
    get current() {
      return store.prompt
    },
    focus() {
      input.focus()
    },
    blur() {
      input.blur()
    },
    set(prompt) {
      if (deliveryPending()) return
      input.setText(prompt.input)
      setStore("prompt", prompt)
      updateDeliveryAfterEdit(prompt.input)
      restoreExtmarksFromParts(prompt.parts)
      input.gotoBufferEnd()
    },
    reset() {
      if (deliveryPending()) return
      input.clear()
      input.extmarks.clear()
      setStore("prompt", {
        input: "",
        parts: [],
      })
      setStore("extmarkToPartIndex", new Map())
      setDelivery({ type: "editing" })
    },
    submit() {
      void submit()
    },
  }

  onMount(() => {
    const saved = stashed
    stashed = undefined
    if (store.prompt.input) return
    if (saved && saved.prompt.input) {
      input.setText(saved.prompt.input)
      setStore("prompt", saved.prompt)
      restoreExtmarksFromParts(saved.prompt.parts)
      input.cursorOffset = saved.cursor
    }
  })

  onCleanup(() => {
    if (store.prompt.input) {
      stashed = { prompt: unwrap(store.prompt), cursor: input.cursorOffset }
    }
    setInputTarget(undefined)
    props.ref?.(undefined)
  })

  createEffect(() => {
    if (!input || input.isDestroyed) return
    if (props.visible === false || dialog.stack.length > 0 || deliveryPending()) {
      if (input.focused) input.blur()
      return
    }

    // Slot/plugin updates can remount the background prompt while a dialog is open.
    // Keep focus with the dialog and let the prompt reclaim it after the dialog closes.
    if (!input.focused) input.focus()
  })

  createEffect(() => {
    if (!input || input.isDestroyed) return
    input.traits = {
      ...input.traits,
      ...computePromptTraits({
        mode: store.mode,
        autocompleteVisible: !!auto()?.visible,
      }),
    }
  })

  function restoreExtmarksFromParts(parts: PromptInfo["parts"]) {
    input.extmarks.clear()
    setStore("extmarkToPartIndex", new Map())

    parts.forEach((part, partIndex) => {
      let start = 0
      let end = 0
      let virtualText = ""
      let styleId: number | undefined

      if (part.type === "file" && part.source?.text) {
        start = part.source.text.start
        end = part.source.text.end
        virtualText = part.source.text.value
        styleId = fileStyleId
      } else if (part.type === "agent" && part.source) {
        start = part.source.start
        end = part.source.end
        virtualText = part.source.value
        styleId = agentStyleId
      } else if (part.type === "text" && part.source?.text) {
        start = part.source.text.start
        end = part.source.text.end
        virtualText = part.source.text.value
        styleId = pasteStyleId
      }

      if (virtualText) {
        const extmarkId = input.extmarks.create({
          start,
          end,
          virtual: true,
          styleId,
          typeId: promptPartTypeId,
        })
        setStore("extmarkToPartIndex", (map: Map<number, number>) => {
          const newMap = new Map(map)
          newMap.set(extmarkId, partIndex)
          return newMap
        })
      }
    })
  }

  function syncExtmarksWithPromptParts() {
    const allExtmarks = input.extmarks.getAllForTypeId(promptPartTypeId)
    setStore(
      produce((draft) => {
        const newMap = new Map<number, number>()
        const newParts: typeof draft.prompt.parts = []

        for (const extmark of allExtmarks) {
          const partIndex = draft.extmarkToPartIndex.get(extmark.id)
          if (partIndex !== undefined) {
            const part = draft.prompt.parts[partIndex]
            if (part) {
              if (part.type === "agent" && part.source) {
                part.source.start = extmark.start
                part.source.end = extmark.end
              } else if (part.type === "file" && part.source?.text) {
                part.source.text.start = extmark.start
                part.source.text.end = extmark.end
              } else if (part.type === "text" && part.source?.text) {
                part.source.text.start = extmark.start
                part.source.text.end = extmark.end
              }
              newMap.set(extmark.id, newParts.length)
              newParts.push(part)
            }
          }
        }

        draft.extmarkToPartIndex = newMap
        draft.prompt.parts = newParts
      }),
    )
  }

  const stashCommands = createMemo(() =>
    [
      {
        title: "Stash prompt",
        name: "prompt.stash",
        category: "Prompt",
        enabled: !!store.prompt.input && !deliveryPending(),
        run: () => {
          if (!store.prompt.input || deliveryPending()) return
          stash.push({
            input: store.prompt.input,
            parts: store.prompt.parts,
          })
          input.extmarks.clear()
          input.clear()
          setStore("prompt", { input: "", parts: [] })
          setStore("extmarkToPartIndex", new Map())
          setDelivery({ type: "editing" })
          dialog.clear()
        },
      },
      {
        title: "Stash pop",
        name: "prompt.stash.pop",
        category: "Prompt",
        enabled: stash.list().length > 0 && !deliveryPending(),
        run: () => {
          if (deliveryPending()) return
          const entry = stash.pop()
          if (entry) {
            input.setText(entry.input)
            setStore("prompt", { input: entry.input, parts: entry.parts })
            updateDeliveryAfterEdit(entry.input)
            restoreExtmarksFromParts(entry.parts)
            input.gotoBufferEnd()
          }
          dialog.clear()
        },
      },
      {
        title: "Stash list",
        name: "prompt.stash.list",
        category: "Prompt",
        enabled: stash.list().length > 0 && !deliveryPending(),
        run: () => {
          if (deliveryPending()) return
          dialog.replace(() => (
            <DialogStash
              canMutate={() => !deliveryPending()}
              onSelect={(entry) => {
                if (deliveryPending()) return
                input.setText(entry.input)
                setStore("prompt", { input: entry.input, parts: entry.parts })
                updateDeliveryAfterEdit(entry.input)
                restoreExtmarksFromParts(entry.parts)
                input.gotoBufferEnd()
              }}
            />
          ))
        },
      },
    ].map((entry) => ({
      namespace: "palette",
      ...entry,
    })),
  )

  useBindings(() => ({
    commands: stashCommands(),
  }))

  useBindings(() => {
    return {
      target: inputTarget,
      enabled: inputTarget() !== undefined && !props.disabled && !deliveryPending(),
      bindings: tuiConfig.keybinds.get("prompt.paste"),
    }
  })

  useBindings(() => {
    return {
      target: inputTarget,
      enabled: inputTarget() !== undefined && !props.disabled && !deliveryPending() && store.prompt.input !== "",
      bindings: tuiConfig.keybinds.get("prompt.clear"),
    }
  })

  useBindings(() => {
    return {
      target: inputTarget,
      enabled: (() => {
        cursorVersion()
        return (
          inputTarget() !== undefined &&
          !props.disabled &&
          !deliveryPending() &&
          store.mode === "normal" &&
          !auto()?.visible &&
          input?.visualCursor.offset === 0
        )
      })(),
      bindings: [
        {
          key: "!",
          desc: "Shell mode",
          group: "Prompt",
          cmd: () => {
            if (deliveryPending()) return
            setStore("placeholder", randomIndex(shell().length))
            setStore("mode", "shell")
            setDelivery({ type: "editing" })
          },
        },
      ],
    }
  })

  useBindings(() => {
    return {
      target: inputTarget,
      enabled: inputTarget() !== undefined && store.mode === "shell" && !deliveryPending(),
      bindings: [{ key: "escape", desc: "Exit shell mode", group: "Prompt", cmd: () => setStore("mode", "normal") }],
    }
  })

  useBindings(() => {
    return {
      target: inputTarget,
      enabled: (() => {
        cursorVersion()
        return (
          inputTarget() !== undefined &&
          store.mode === "shell" &&
          !deliveryPending() &&
          input?.visualCursor.offset === 0
        )
      })(),
      bindings: [{ key: "backspace", desc: "Exit shell mode", group: "Prompt", cmd: () => setStore("mode", "normal") }],
    }
  })

  useBindings(() => {
    return {
      target: inputTarget,
      enabled: (() => {
        cursorVersion()
        return (
          inputTarget() !== undefined &&
          !props.disabled &&
          !deliveryPending() &&
          !auto()?.visible &&
          input !== undefined
        )
      })(),
      commands: [
        {
          name: "prompt.history.previous",
          title: "Previous prompt history",
          category: "Prompt",
          run() {
            if (input.cursorOffset !== 0) {
              if (input.scrollY + input.visualCursor.visualRow === 0) input.cursorOffset = 0
              return false
            }

            const item = history.move(-1, input.plainText)
            if (!item) return false
            input.setText(item.input)
            setStore("prompt", item)
            updateDeliveryAfterEdit(item.input)
            setStore("mode", item.mode ?? "normal")
            if (item.mode === "shell") setDelivery({ type: "editing" })
            restoreExtmarksFromParts(item.parts)
            input.cursorOffset = 0
          },
        },
      ],
      bindings: tuiConfig.keybinds.get("prompt.history.previous"),
    }
  })

  useBindings(() => {
    return {
      target: inputTarget,
      enabled: (() => {
        cursorVersion()
        return (
          inputTarget() !== undefined &&
          !props.disabled &&
          !deliveryPending() &&
          !auto()?.visible &&
          input !== undefined
        )
      })(),
      commands: [
        {
          name: "prompt.history.next",
          title: "Next prompt history",
          category: "Prompt",
          run() {
            if (input.cursorOffset !== input.plainText.length) {
              if (
                input.scrollY + input.visualCursor.visualRow ===
                Math.max(0, input.editorView.getTotalVirtualLineCount() - 1)
              )
                input.cursorOffset = input.plainText.length
              return false
            }

            const item = history.move(1, input.plainText)
            if (!item) return false
            input.setText(item.input)
            setStore("prompt", item)
            updateDeliveryAfterEdit(item.input)
            setStore("mode", item.mode ?? "normal")
            if (item.mode === "shell") setDelivery({ type: "editing" })
            restoreExtmarksFromParts(item.parts)
            input.cursorOffset = input.plainText.length
          },
        },
      ],
      bindings: tuiConfig.keybinds.get("prompt.history.next"),
    }
  })

  let submitting = false

  function captureSubmission(
    deliveryKind: "start" | "steer" = "start",
    target?: VisibleTurnTarget,
    selected?: LaterSelected,
  ): SubmissionAttempt {
    const observedDelivery = delivery()
    const busyNormal =
      deliveryKind === "start" &&
      !selected &&
      Boolean(props.sessionID) &&
      !props.fork &&
      store.mode === "normal" &&
      status().type !== "idle"
    return {
      deliveryKind,
      sessionID: props.sessionID,
      ...(target
        ? { target }
        : busyNormal
          ? { target: captureVisibleTurn(props.sessionID, visibleActiveTurnID()) }
          : {}),
      ...(selected ? { selected } : {}),
      busyNormal,
      observedDelivery,
      turnStartRevision: turnStartRevision(),
    }
  }

  function claimSubmission() {
    if (submitting) return false
    submitting = true
    editRevision += 1
    setDeliveryPending(true)
    return true
  }

  async function runSubmission(attempt: SubmissionAttempt) {
    try {
      return await submitInner(attempt)
    } finally {
      submitting = false
      setDeliveryPending(false)
    }
  }

  function submit(deliveryKind: "start" | "steer" = "start", target?: VisibleTurnTarget, selected?: LaterSelected) {
    const attempt = captureSubmission(deliveryKind, target, selected)
    if (!claimSubmission()) return Promise.resolve(false)
    return runSubmission(attempt)
  }

  function scheduleSubmit() {
    const attempt = captureSubmission()
    if (!claimSubmission()) return
    setTimeout(() => setTimeout(() => void runSubmission(attempt), 0), 0)
  }

  async function submitInner(attempt: SubmissionAttempt) {
    const { deliveryKind, target, selected } = attempt
    // IME: double-defer may fire before onContentChange flushes the last
    // composed character (e.g. Korean hangul) to the store, so read
    // plainText directly and sync before any downstream reads.
    if (input && !input.isDestroyed && input.plainText !== store.prompt.input) {
      setStore("prompt", "input", input.plainText)
      syncExtmarksWithPromptParts()
    }
    if (attempt.sessionID !== props.sessionID) {
      if (selected || attempt.busyNormal) {
        markUndelivered("The learning session changed before this draft could be sent.")
      }
      return false
    }
    if (selected && delivery() !== selected) return false
    if (selected && (selected.target.sessionID !== props.sessionID || props.fork)) {
      markUndelivered("The learning session changed before this draft could be sent.")
      return true
    }
    if (props.disabled) {
      if (selected) markUndelivered("The composer became unavailable before this draft could be sent.")
      return false
    }
    if (startLocation.creating()) {
      if (selected) markUndelivered("The learning location changed before this draft could be sent.")
      return false
    }
    if (auto()?.visible) {
      if (selected) markUndelivered("A composer choice was still open when this draft became ready.")
      return false
    }
    if (!store.prompt.input) {
      if (selected) setDelivery({ type: "editing" })
      return false
    }
    const agent = local.agent.current()
    if (!agent) {
      if (selected) markUndelivered("No learning agent was available for this draft.")
      return false
    }
    const trimmed = store.prompt.input.trim()
    if (trimmed === "exit" || trimmed === "quit" || trimmed === ":q") {
      if (selected) setDelivery({ type: "editing" })
      void exit()
      return true
    }
    const selectedModel = local.model.current()
    if (!selectedModel) {
      void promptModelWarning()
      if (selected) markUndelivered("No model was available for this draft.")
      return false
    }

    if (attempt.busyNormal) {
      if (attempt.observedDelivery.type === "later_selected") return true
      if (!target) {
        toast.show({
          title: "Not selected",
          message: "The current response is still loading. Your draft remains editable; try again when it appears.",
          variant: "warning",
        })
        return true
      }
      if (turnStartRevision() !== attempt.turnStartRevision) {
        markUndelivered("Another response started before this draft could be sent.")
        return true
      }
      setDelivery({
        type: "later_selected",
        target,
        turnStartRevision: attempt.turnStartRevision,
      })
      toast.show({
        message: `This will send after the current response. Keep editing here, or use ${
          currentWorkShortcut() || "the current-response action"
        } to add or correct it now.`,
        variant: "info",
        duration: 3000,
      })
      return true
    }

    if (deliveryKind === "steer" && (store.mode !== "normal" || !props.sessionID || props.fork)) {
      markUndelivered("No current response was available for this draft.")
      toast.show({ message: "This draft was not sent. It remains editable here.", variant: "warning" })
      return true
    }

    if (deliveryKind === "steer" && (!target || target.sessionID !== props.sessionID)) {
      markUndelivered("The response changed before this draft could be added.")
      toast.show({
        title: "Not sent",
        message: "The response changed before this draft could be added. Choose where to send it again.",
        variant: "warning",
      })
      return true
    }

    if (deliveryKind === "steer" && selected?.target && !sameVisibleTurn(selected.target, target)) {
      markUndelivered("The response changed before this draft could be added.")
      toast.show({
        title: "Not sent",
        message: "The response changed before this draft could be added. It was not sent to the new response.",
        variant: "warning",
      })
      return true
    }

    const currentDelivery = delivery()
    const claimed =
      selected ?? (deliveryKind === "start" && currentDelivery.type === "later_selected" ? currentDelivery : undefined)
    if (claimed && currentDelivery !== claimed) return false
    setDelivery({ type: "editing" })

    syncExtmarksWithPromptParts()
    const promptSnapshot = structuredClone(unwrap(store.prompt))
    const currentMode = store.mode
    const inputText = expandTrackedPastedText(
      promptSnapshot.input,
      promptSnapshot.parts.flatMap((part) => {
        if (part.type !== "text" || !part.source?.text) return []
        return [{ start: part.source.text.start, end: part.source.text.end, text: part.text }]
      }),
    )
    const nonTextParts = promptSnapshot.parts.filter((part) => part.type !== "text")
    const editorSelection = editorContext()
    const editorParts =
      editorSelection && editor.labelState() === "pending"
        ? [
            {
              type: "text" as const,
              text: formatEditorContext(editorSelection),
              synthetic: true,
              metadata: {
                kind: "editor_context",
                source: editorSelection.source ?? "editor",
                filePath: editorSelection.filePath,
                ranges: editorSelection.ranges,
              },
            },
          ]
        : []

    const variant = local.model.variant.current()
    let sessionID = props.fork?.targetSessionID ?? props.sessionID
    let directory = project.instance.directory()
    let finishMoveProgress = false
    if (sessionID == null) {
      const selectedDirectory = await startLocation.getDirectory(promptSnapshot.input)
      if (startLocation.pending() && !selectedDirectory) return false
      finishMoveProgress = Boolean(startLocation.progress())
      directory = selectedDirectory ?? directory
      sessionID = Identifier.ascending("session")
    }

    if (currentMode === "shell") {
      if (!props.sessionID || props.fork) {
        if (finishMoveProgress) startLocation.finishSubmit()
        toast.show({ message: "Start a learner turn before running a shell command.", variant: "warning" })
        return true
      }
      startLocation.startSubmit()
      await sdk.client.session.shell(
        {
          sessionID,
          agent: agent.name,
          model: {
            providerID: selectedModel.providerID,
            modelID: selectedModel.modelID,
          },
          command: inputText,
        },
        { throwOnError: true },
      )
      setStore("mode", "normal")
    } else {
      startLocation.startSubmit()
      const firstLineEnd = inputText.indexOf("\n")
      const firstLine = firstLineEnd === -1 ? inputText : inputText.slice(0, firstLineEnd)
      const [commandName, ...firstLineArgs] = firstLine.split(" ")
      const known = commandName?.startsWith("/")
        ? sync.data.command.find((item) => item.name === commandName.slice(1))
        : undefined
      const restOfInput = firstLineEnd === -1 ? "" : inputText.slice(firstLineEnd + 1)
      const argumentsText = firstLineArgs.join(" ") + (restOfInput ? "\n" + restOfInput : "")
      const parts = [
        ...editorParts,
        {
          type: "text" as const,
          text: known ? expandCommandTemplate(known.template, argumentsText) : inputText,
        },
        ...nonTextParts,
      ]
      const turnID = Identifier.create("trn", "ascending")
      const inputID = Identifier.create("tri", "ascending")
      const messageID = Identifier.ascending("message")

      try {
        if (deliveryKind === "steer") {
          await dispatchVisibleTurn(target, (visible) =>
            sdk.client.session.steer(
              {
                sessionID: visible.sessionID,
                turnID: visible.turnID,
                inputID,
                messageID,
                agent: known?.agent ?? agent.name,
                model: selectedModel,
                variant,
                parts,
              },
              { throwOnError: true },
            ),
          )
        } else {
          await sdk.client.session.start(
            {
              sessionID,
              turnID,
              inputID,
              messageID,
              agent: known?.agent ?? agent.name,
              model: selectedModel,
              variant,
              parts,
              directory,
              ...(!props.sessionID ? { session: {} } : {}),
              ...(props.fork
                ? {
                    fork: {
                      sourceSessionID: props.fork.sourceSessionID,
                      sourceEventSequence: props.fork.sourceEventSequence,
                      ...(props.fork.cutoffMessageID ? { cutoffMessageID: props.fork.cutoffMessageID } : {}),
                    },
                  }
                : {}),
            },
            { throwOnError: true },
          )
        }
      } catch (error) {
        if (finishMoveProgress) startLocation.finishSubmit()
        if (deliveryKind === "steer")
          markUndelivered("This draft was not accepted by the response. Choose where to send it again.")
        if (claimed && deliveryKind === "start")
          markUndelivered("This draft was not accepted as the next message. Choose where to send it again.")
        toast.show({
          title: deliveryKind === "steer" || claimed ? "Not sent" : "Failed to send",
          message: `${errorMessage(error)} The draft remains editable here.`,
          variant: "error",
        })
        return true
      }
      if (editorParts.length > 0) editor.markSelectionSent()
    }
    history.append({
      ...promptSnapshot,
      mode: currentMode,
    })
    input.extmarks.clear()
    setStore("prompt", {
      input: "",
      parts: [],
    })
    setStore("extmarkToPartIndex", new Map())
    setDelivery({ type: "editing" })
    props.onSubmit?.()

    // temporary hack to make sure the message is sent
    if (!props.sessionID || props.fork) {
      if (editorParts.length > 0) editor.preserveSelectionFromNewSession()
      route.navigate({ type: "session", sessionID })
    }
    input.clear()
    if (finishMoveProgress) startLocation.finishSubmit()
    return true
  }

  function sameVisibleTurn(left: VisibleTurnTarget, right: VisibleTurnTarget | undefined) {
    return left.sessionID === right?.sessionID && left.turnID === right.turnID
  }

  function markUndelivered(reason: string) {
    setDelivery({ type: "undelivered", reason })
  }

  function updateDeliveryAfterEdit(value: string) {
    const current = delivery()
    if (!value || current.type === "undelivered") setDelivery({ type: "editing" })
  }

  function canApplyEdit(revision: number) {
    return !deliveryPending() && revision === editRevision
  }

  function pasteText(text: string, virtualText: string, revision = editRevision) {
    if (!canApplyEdit(revision)) return
    const currentOffset = input.cursorOffset
    const extmarkStart = currentOffset
    const extmarkEnd = extmarkStart + promptOffsetWidth(virtualText)

    input.insertText(virtualText + " ")

    const extmarkId = input.extmarks.create({
      start: extmarkStart,
      end: extmarkEnd,
      virtual: true,
      styleId: pasteStyleId,
      typeId: promptPartTypeId,
    })

    setStore(
      produce((draft) => {
        const partIndex = draft.prompt.parts.length
        draft.prompt.parts.push({
          type: "text" as const,
          text,
          source: {
            text: {
              start: extmarkStart,
              end: extmarkEnd,
              value: virtualText,
            },
          },
        })
        draft.extmarkToPartIndex.set(extmarkId, partIndex)
      }),
    )
  }

  async function pasteInputText(text: string, revision = editRevision) {
    if (!canApplyEdit(revision)) return
    const normalizedText = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    const pastedContent = normalizedText.trim()
    const filepath = pastedFilepath(pastedContent, terminalEnvironment.platform)
    const isUrl = /^(https?):\/\//.test(filepath)
    if (!isUrl) {
      const attachment = await readLocalAttachment(filepath)
      if (!canApplyEdit(revision)) return
      const filename = path.basename(filepath)
      if (attachment?.type === "text") {
        pasteText(attachment.content, `[SVG: ${filename ?? "image"}]`, revision)
        return
      }
      if (attachment?.type === "binary") {
        await pasteAttachment(
          {
            filename,
            filepath,
            mime: attachment.mime,
            content: Buffer.from(attachment.content).toString("base64"),
          },
          revision,
        )
        return
      }
    }

    const lineCount = (pastedContent.match(/\n/g)?.length ?? 0) + 1
    if (
      (lineCount >= 3 || pastedContent.length > 150) &&
      kv.get("paste_summary_enabled", !sync.data.config.experimental?.disable_paste_summary)
    ) {
      pasteText(pastedContent, `[Pasted ~${lineCount} lines]`, revision)
      return
    }

    if (!canApplyEdit(revision)) return
    input.insertText(normalizedText)

    setTimeout(() => {
      if (!input || input.isDestroyed) return
      input.getLayoutNode().markDirty()
      renderer.requestRender()
    }, 0)
  }

  async function pasteAttachment(
    file: { filename?: string; filepath?: string; content: string; mime: string },
    revision = editRevision,
  ) {
    if (!canApplyEdit(revision)) return
    const currentOffset = input.cursorOffset
    const extmarkStart = currentOffset
    const pdf = file.mime === "application/pdf"
    const count = store.prompt.parts.filter((x) => {
      if (x.type !== "file") return false
      if (pdf) return x.mime === "application/pdf"
      return x.mime.startsWith("image/")
    }).length
    const virtualText = pdf ? `[PDF ${count + 1}]` : `[Image ${count + 1}]`
    const extmarkEnd = extmarkStart + virtualText.length
    const textToInsert = virtualText + " "

    input.insertText(textToInsert)

    const extmarkId = input.extmarks.create({
      start: extmarkStart,
      end: extmarkEnd,
      virtual: true,
      styleId: pasteStyleId,
      typeId: promptPartTypeId,
    })

    const part: Omit<FilePart, "id" | "messageID" | "sessionID"> = {
      type: "file" as const,
      mime: file.mime,
      filename: file.filename,
      url: `data:${file.mime};base64,${file.content}`,
      source: {
        type: "file",
        path: file.filepath ?? file.filename ?? "",
        text: {
          start: extmarkStart,
          end: extmarkEnd,
          value: virtualText,
        },
      },
    }
    setStore(
      produce((draft) => {
        const partIndex = draft.prompt.parts.length
        draft.prompt.parts.push(part)
        draft.extmarkToPartIndex.set(extmarkId, partIndex)
      }),
    )
    return
  }

  function clearPrompt() {
    if (deliveryPending()) return
    setDelivery({ type: "editing" })
    if (store.prompt.input.trim().length >= DRAFT_RETENTION_MIN_CHARS || store.prompt.parts.length > 0) {
      history.append({
        ...store.prompt,
        mode: store.mode,
      })
    }
    input.clear()
    input.extmarks.clear()
    setStore("prompt", {
      input: "",
      parts: [],
    })
    setStore("extmarkToPartIndex", new Map())
  }

  const highlight = createMemo(() => {
    if (leader()) return theme.border
    if (store.mode === "shell") return theme.primary
    const agent = local.agent.current()
    if (!agent) return theme.border
    return local.agent.color(agent.name)
  })

  const showVariant = createMemo(() => {
    const variants = local.model.variant.list()
    if (variants.length === 0) return false
    const current = local.model.variant.current()
    return !!current
  })

  const agentMetaAlpha = createFadeIn(() => !!local.agent.current(), animationsEnabled)
  const modelMetaAlpha = createFadeIn(() => !!local.agent.current() && store.mode === "normal", animationsEnabled)
  const variantMetaAlpha = createFadeIn(
    () => !!local.agent.current() && store.mode === "normal" && showVariant(),
    animationsEnabled,
  )
  const borderHighlight = createMemo(() => tint(theme.border, highlight(), agentMetaAlpha()))

  const placeholderText = createMemo(() => {
    if (props.showPlaceholder === false) return undefined
    if (store.mode === "shell") {
      if (!shell().length) return undefined
      const example = shell()[store.placeholder % shell().length]
      return `Run a command... "${example}"`
    }
    if (!list().length) return undefined
    return `Ask anything... "${list()[store.placeholder % list().length]}"`
  })

  const spinnerDef = createMemo(() => {
    const agent =
      status().type !== "idle"
        ? (local.agent.list().find((a) => a.name === lastUserMessage()?.agent) ?? local.agent.current())
        : local.agent.current()
    const color = agent ? local.agent.color(agent.name) : theme.border
    return {
      frames: createFrames({
        color,
        style: "blocks",
        inactiveFactor: 0.6,
        // enableFading: false,
        minAlpha: 0.3,
      }),
      color: createColors({
        color,
        style: "blocks",
        inactiveFactor: 0.6,
        // enableFading: false,
        minAlpha: 0.3,
      }),
    }
  })
  const maxHeight = createMemo(() => tuiConfig.prompt?.max_height ?? Math.max(6, Math.floor(dimensions().height / 3)))
  const moveLabelWidth = createMemo(() => Math.max(12, Math.min(44, dimensions().width - 48)))

  return (
    <>
      <box ref={(r: BoxRenderable) => (anchor = r)} visible={props.visible !== false} width="100%">
        <box
          width="100%"
          border={["left"]}
          borderColor={borderHighlight()}
          customBorderChars={{
            ...SplitBorder.customBorderChars,
            bottomLeft: "╹",
          }}
        >
          <box
            paddingLeft={2}
            paddingRight={2}
            paddingTop={1}
            flexShrink={0}
            backgroundColor={theme.backgroundElement}
            flexGrow={1}
            width="100%"
          >
            <textarea
              width="100%"
              placeholder={placeholderText()}
              placeholderColor={theme.textMuted}
              textColor={leader() ? theme.textMuted : theme.text}
              focusedTextColor={leader() ? theme.textMuted : theme.text}
              minHeight={1}
              maxHeight={maxHeight()}
              onContentChange={() => {
                const value = input.plainText
                setStore("prompt", "input", value)
                updateDeliveryAfterEdit(value)
                auto()?.onInput(value)
                syncExtmarksWithPromptParts()
                setCursorVersion((value) => value + 1)
              }}
              onCursorChange={() => setCursorVersion((value) => value + 1)}
              onKeyDown={(e: { preventDefault(): void }) => {
                if (props.disabled || deliveryPending()) {
                  e.preventDefault()
                  return
                }
              }}
              onSubmit={() => {
                // IME: double-defer so the last composed character (e.g. Korean
                // hangul) is flushed to plainText before we read it for submission.
                // Capture the visible response and freeze competing editor writes now;
                // only the final text flush is deferred.
                scheduleSubmit()
              }}
              onPaste={async (event: PasteEvent) => {
                if (props.disabled || deliveryPending()) {
                  event.preventDefault()
                  return
                }

                // Normalize line endings at the boundary
                // Windows ConPTY/Terminal often sends CR-only newlines in bracketed paste
                // Replace CRLF first, then any remaining CR
                const normalizedText = decodePasteBytes(event.bytes).replace(/\r\n/g, "\n").replace(/\r/g, "\n")
                const pastedContent = normalizedText.trim()

                // Windows Terminal <1.25 can surface image-only clipboard as an
                // empty bracketed paste. Windows Terminal 1.25+ does not.
                if (!pastedContent) {
                  keymap.dispatchCommand("prompt.paste")
                  return
                }

                // Once we cross an async boundary below, the terminal may perform its
                // default paste unless we suppress it first and handle insertion ourselves.
                event.preventDefault()

                await pasteInputText(normalizedText)
              }}
              ref={(r: TextareaRenderable) => {
                input = r
                Object.assign(r, {
                  getClipboardText: (text: string) => expandPastedTextPlaceholders(text, store.prompt.parts),
                })
                setInputTarget(r)
                if (promptPartTypeId === 0) {
                  promptPartTypeId = input.extmarks.registerType("prompt-part")
                }
                props.ref?.(ref)
                setTimeout(() => {
                  // setTimeout is a workaround and needs to be addressed properly
                  if (!input || input.isDestroyed) return
                  input.cursorColor = theme.text
                }, 0)
              }}
              onMouseDown={(r: MouseEvent) => r.target?.focus()}
              focusedBackgroundColor={theme.backgroundElement}
              cursorColor={props.disabled ? theme.backgroundElement : theme.text}
              syntaxStyle={syntax()}
            />
            <box flexDirection="row" flexShrink={0} paddingTop={1} gap={1} justifyContent="space-between">
              <box flexDirection="row" gap={1}>
                <Show when={local.agent.current()} fallback={<box height={1} />}>
                  {(agent) => (
                    <>
                      <text fg={fadeColor(highlight(), agentMetaAlpha())}>
                        {store.mode === "shell" ? "Shell" : Locale.titlecase(agent().name)}
                      </text>
                      <Show when={store.mode === "normal" && local.permission.mode === "auto"}>
                        <text fg={fadeColor(theme.textMuted, agentMetaAlpha())}>auto</text>
                      </Show>
                      <Show when={store.mode === "normal"}>
                        <box flexDirection="row" gap={1}>
                          <text fg={fadeColor(theme.textMuted, modelMetaAlpha())}>·</text>
                          <text
                            flexShrink={0}
                            fg={fadeColor(leader() ? theme.textMuted : theme.text, modelMetaAlpha())}
                          >
                            {local.model.parsed().model}
                          </text>
                          <text fg={fadeColor(theme.textMuted, modelMetaAlpha())}>{currentProviderLabel()}</text>
                          <Show when={showVariant()}>
                            <text fg={fadeColor(theme.textMuted, variantMetaAlpha())}>·</text>
                            <text>
                              <span style={{ fg: fadeColor(theme.warning, variantMetaAlpha()), bold: true }}>
                                {local.model.variant.current()}
                              </span>
                            </text>
                          </Show>
                        </box>
                      </Show>
                    </>
                  )}
                </Show>
              </box>
              <Show when={hasRightContent()}>
                <box flexDirection="row" gap={1} alignItems="center">
                  {props.right}
                </box>
              </Show>
            </box>
          </box>
        </box>
        <box
          height={1}
          border={["left"]}
          borderColor={borderHighlight()}
          customBorderChars={{
            ...EmptyBorder,
            vertical: theme.backgroundElement.a !== 0 ? "╹" : " ",
          }}
        >
          <box
            height={1}
            border={["bottom"]}
            borderColor={theme.backgroundElement}
            customBorderChars={
              theme.backgroundElement.a !== 0
                ? {
                    ...EmptyBorder,
                    horizontal: "▀",
                  }
                : {
                    ...EmptyBorder,
                    horizontal: " ",
                  }
            }
          />
        </box>
        <box width="100%" flexDirection="row" justifyContent="space-between">
          <Switch>
            <Match when={status().type !== "idle"}>
              <box flexDirection="column" gap={0} flexGrow={1}>
                <box flexDirection="row" gap={1} flexGrow={1}>
                  <box marginLeft={1}>
                    <Show when={kv.get("animations_enabled", true)} fallback={<text fg={theme.textMuted}>[⋯]</text>}>
                      <spinner color={spinnerDef().color} frames={spinnerDef().frames} interval={40} />
                    </Show>
                  </box>
                  <box flexDirection="row" gap={1} flexShrink={0}>
                    {(() => {
                      const retry = createMemo(() => {
                        const s = status()
                        if (s.type !== "retry") return
                        return s
                      })
                      const message = createMemo(() => {
                        const r = retry()
                        if (!r) return
                        if (r.message.includes("exceeded your current quota") && r.message.includes("gemini"))
                          return "gemini is way too hot right now"
                        if (r.message.length > 80) return r.message.slice(0, 80) + "..."
                        return r.message
                      })
                      const isTruncated = createMemo(() => {
                        const r = retry()
                        if (!r) return false
                        return r.message.length > 120
                      })
                      const [seconds, setSeconds] = createSignal(0)
                      onMount(() => {
                        const timer = setInterval(() => {
                          const next = retry()?.next
                          if (next) setSeconds(Math.round((next - Date.now()) / 1000))
                        }, 1000)

                        onCleanup(() => {
                          clearInterval(timer)
                        })
                      })
                      const handleMessageClick = () => {
                        const r = retry()
                        if (!r) return
                        if (isTruncated()) {
                          void DialogAlert.show(dialog, "Retry Error", r.message)
                        }
                      }

                      const retryText = () => {
                        const r = retry()
                        if (!r) return ""
                        const baseMessage = message()
                        const truncatedHint = isTruncated() ? " (click to expand)" : ""
                        const duration = formatDuration(seconds())
                        const retryInfo = ` [retrying ${duration ? `in ${duration} ` : ""}attempt #${r.attempt}]`
                        return baseMessage + truncatedHint + retryInfo
                      }

                      return (
                        <Show when={retry()}>
                          <box onMouseUp={handleMessageClick}>
                            <text fg={theme.error}>{retryText()}</text>
                          </box>
                        </Show>
                      )
                    })()}
                  </box>
                  <Show when={deliveryLabel()}>{(label) => <text fg={theme.warning}>{label()}</text>}</Show>
                </box>
                <Switch>
                  <Match when={store.mode === "normal"}>
                    <box
                      marginLeft={1}
                      flexDirection={dimensions().width < 90 ? "column" : "row"}
                      gap={dimensions().width < 90 ? 0 : 2}
                    >
                      <text fg={theme.text}>
                        {laterShortcut() || "enter"}{" "}
                        <span style={{ fg: theme.textMuted }}>send after this response</span>
                      </text>
                      <text fg={theme.text}>
                        {currentWorkShortcut() || "commands"}{" "}
                        <span style={{ fg: theme.textMuted }}>add/correct this response</span>
                      </text>
                      <text fg={store.interrupt > 0 ? theme.primary : theme.text}>
                        esc{" "}
                        <span style={{ fg: store.interrupt > 0 ? theme.primary : theme.textMuted }}>
                          {store.interrupt > 0 ? "again to interrupt" : "interrupt"}
                        </span>
                      </text>
                    </box>
                  </Match>
                  <Match when={true}>
                    <box marginLeft={1}>
                      <text fg={theme.text}>
                        esc <span style={{ fg: theme.textMuted }}>exit shell mode</span>
                      </text>
                    </box>
                  </Match>
                </Switch>
              </box>
            </Match>
            <Match when={startLocation.progress()}>
              {(progress) => (
                <box paddingLeft={3}>
                  <Spinner color={theme.accent}>
                    {progress()}
                    <span style={{ fg: theme.textMuted }}>{".".repeat(startLocation.creatingDots())}</span>
                  </Spinner>
                </box>
              )}
            </Match>
            <Match when={startLocation.pendingNew()}>
              <box paddingLeft={3}>
                <text fg={theme.accent}>(new working copy)</text>
              </box>
            </Match>
            <Match when={deliveryLabel()}>
              <box paddingLeft={3}>
                <text fg={theme.warning}>{deliveryLabel()}</text>
              </box>
            </Match>
            <Match when={true}>{props.hint ?? <text />}</Match>
          </Switch>
          <Show when={status().type === "idle"}>
            <box gap={2} flexDirection="row">
              <Show when={editorContextLabelState() !== "none" ? editorFileLabelDisplay() : undefined}>
                {(file) => (
                  <text fg={editorContextLabelState() === "pending" ? theme.secondary : theme.textMuted}>{file()}</text>
                )}
              </Show>
              <Switch>
                <Match when={store.mode === "normal"}>
                  <Switch>
                    <Match when={usage()}>
                      {(item) => (
                        <text fg={theme.textMuted} wrapMode="none">
                          {[item().context, item().cost].filter(Boolean).join(" · ")}
                        </text>
                      )}
                    </Match>
                    <Match when={true}>
                      <text fg={theme.text}>
                        {agentShortcut()} <span style={{ fg: theme.textMuted }}>agents</span>
                      </text>
                    </Match>
                  </Switch>
                  <text fg={theme.text}>
                    {paletteShortcut()} <span style={{ fg: theme.textMuted }}>commands</span>
                  </text>
                </Match>
                <Match when={store.mode === "shell"}>
                  <text fg={theme.text}>
                    esc <span style={{ fg: theme.textMuted }}>exit shell mode</span>
                  </text>
                </Match>
              </Switch>
            </box>
          </Show>
        </box>
      </box>
      <Autocomplete
        sessionID={props.sessionID}
        ref={(r) => {
          setAuto(() => r)
        }}
        anchor={() => anchor}
        input={() => input}
        setPrompt={(cb) => {
          if (deliveryPending()) return
          setStore("prompt", produce(cb))
          updateDeliveryAfterEdit(store.prompt.input)
        }}
        setExtmark={(partIndex, extmarkId) => {
          setStore("extmarkToPartIndex", (map: Map<number, number>) => {
            const newMap = new Map(map)
            newMap.set(extmarkId, partIndex)
            return newMap
          })
        }}
        value={store.prompt.input}
        fileStyleId={fileStyleId}
        agentStyleId={agentStyleId}
        promptPartTypeId={() => promptPartTypeId}
      />
    </>
  )
}
