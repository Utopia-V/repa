export * as CourseRevision from "./revision"

import { Effect } from "effect"
import {
  InvalidHierarchyError,
  InvalidMappingError,
  createCitationID,
  createItemID,
  createMappingGroupID,
  type CitationID,
  type ItemID,
  type MappingGroupID,
  type MappingKind,
  type RevisionID,
  type RevisionProposal,
  type ViewID,
} from "./schema"

export type ExistingMembership = {
  readonly viewID: ViewID
  readonly revisionID: RevisionID
  readonly itemID: ItemID
}

export type PreparedItem = {
  readonly key: string
  readonly itemID: ItemID
  readonly parentItemID?: ItemID
  readonly title: string
  readonly preorderPosition: number
  readonly depth: number
  readonly createIdentity: boolean
}

export type PreparedMapping = {
  readonly id: MappingGroupID
  readonly kind: MappingKind
  readonly sourceItemIDs: ItemID[]
  readonly targetItemIDs: ItemID[]
  readonly sourceKey: string
  readonly targetKey: string
}

export type PreparedCitation = {
  readonly id: CitationID
  readonly sourceViewID: ViewID
  readonly sourceRevisionID: RevisionID
  readonly itemID: ItemID
}

export type PreparedRevision = {
  readonly items: PreparedItem[]
  readonly mappings: PreparedMapping[]
  readonly citations: PreparedCitation[]
}

type Input = {
  readonly proposal: RevisionProposal
  readonly predecessor?: {
    readonly revisionID: RevisionID
    readonly items: readonly ExistingMembership[]
  }
  readonly citedMemberships: readonly ExistingMembership[]
}

export function prepare(input: Input) {
  return Effect.gen(function* () {
    const hierarchy = yield* validateHierarchy(input.proposal)
    const predecessor = new Map(input.predecessor?.items.map((item) => [item.itemID, item]) ?? [])
    const cited = new Map(input.citedMemberships.map((item) => [membershipKey(item.revisionID, item.itemID), item]))
    const targetByKey = new Map(hierarchy.map((item) => [item.key, item]))
    const assigned = new Map<string, { itemID: ItemID; createIdentity: boolean }>()
    const sourceAssignments = new Set<ItemID>()
    const targetAssignments = new Set<string>()

    if (!input.predecessor && (input.proposal.mappings?.length ?? 0) > 0) {
      return yield* new InvalidMappingError({ detail: "A first revision cannot contain predecessor mappings" })
    }
    if ((input.proposal.mappings?.length ?? 0) > 1024) {
      return yield* new InvalidMappingError({
        detail: "A revision transition cannot contain more than 1024 mapping groups",
      })
    }

    const mappings = yield* Effect.forEach(input.proposal.mappings ?? [], (mapping) =>
      Effect.gen(function* () {
        const sources = [...new Set(mapping.sourceItemIDs)]
        const targets = [...new Set(mapping.targetKeys)]
        if (sources.length !== mapping.sourceItemIDs.length || targets.length !== mapping.targetKeys.length) {
          return yield* new InvalidMappingError({ detail: "A mapping group cannot repeat a source or target" })
        }
        if (sources.some((itemID) => !predecessor.has(itemID))) {
          return yield* new InvalidMappingError({ detail: "Every mapping source must belong to the exact predecessor" })
        }
        if (targets.some((key) => !targetByKey.has(key))) {
          return yield* new InvalidMappingError({ detail: "Every mapping target must belong to the proposed revision" })
        }
        if (sources.some((itemID) => sourceAssignments.has(itemID))) {
          return yield* new InvalidMappingError({
            detail: "A predecessor membership can participate in at most one mapping",
          })
        }
        if (targets.some((key) => targetAssignments.has(key))) {
          return yield* new InvalidMappingError({
            detail: "A target membership can participate in at most one mapping",
          })
        }

        const valid =
          (mapping.kind === "preserve" && sources.length === 1 && targets.length === 1) ||
          (mapping.kind === "split" && sources.length === 1 && targets.length >= 2) ||
          (mapping.kind === "merge" && sources.length >= 2 && targets.length === 1)
        if (!valid) {
          return yield* new InvalidMappingError({
            detail: "Mapping must be preserve 1→1, split 1→N, or merge N→1",
          })
        }
        if (targets.some((key) => targetByKey.get(key)?.reuse !== undefined)) {
          return yield* new InvalidMappingError({ detail: "A mapped target cannot also request identity reuse" })
        }

        sources.forEach((itemID) => sourceAssignments.add(itemID))
        targets.forEach((key) => targetAssignments.add(key))
        const targetItemIDs = targets.map(() => createItemID())
        if (mapping.kind === "preserve") targetItemIDs[0] = sources[0]!
        targets.forEach((key, index) =>
          assigned.set(key, { itemID: targetItemIDs[index]!, createIdentity: mapping.kind !== "preserve" }),
        )
        return {
          id: createMappingGroupID(),
          kind: mapping.kind,
          sourceItemIDs: sources,
          targetItemIDs,
          sourceKey: [...sources].sort().join("\u0000"),
          targetKey: [...targetItemIDs].sort().join("\u0000"),
        } satisfies PreparedMapping
      }),
    )

    const citations: PreparedCitation[] = []
    for (const item of hierarchy) {
      if (assigned.has(item.key)) continue
      if (!item.reuse) {
        assigned.set(item.key, { itemID: createItemID(), createIdentity: true })
        continue
      }
      if (predecessor.has(item.reuse.itemID)) {
        return yield* new InvalidMappingError({
          detail: "Identity retained from the immediate predecessor requires a preserve mapping",
        })
      }
      const source = cited.get(membershipKey(item.reuse.sourceRevisionID, item.reuse.itemID))
      if (!source) {
        return yield* new InvalidMappingError({
          detail: "Reused identity requires an exact committed source membership",
        })
      }
      assigned.set(item.key, { itemID: source.itemID, createIdentity: false })
      citations.push({
        id: createCitationID(),
        sourceViewID: source.viewID,
        sourceRevisionID: source.revisionID,
        itemID: source.itemID,
      })
    }

    const persistent = new Set<ItemID>()
    const items = yield* Effect.forEach(hierarchy, (item) =>
      Effect.gen(function* () {
        const identity = assigned.get(item.key)!
        if (persistent.has(identity.itemID)) {
          return yield* new InvalidMappingError({
            detail: "A revision cannot contain the same Course item identity twice",
          })
        }
        persistent.add(identity.itemID)
        return {
          key: item.key,
          itemID: identity.itemID,
          parentItemID: item.parentKey ? assigned.get(item.parentKey)!.itemID : undefined,
          title: item.title,
          preorderPosition: item.preorderPosition,
          depth: item.depth,
          createIdentity: identity.createIdentity,
        } satisfies PreparedItem
      }),
    )

    return { items, mappings, citations } satisfies PreparedRevision
  })
}

function validateHierarchy(proposal: RevisionProposal) {
  return Effect.gen(function* () {
    if (proposal.items.length < 1 || proposal.items.length > 1024) {
      return yield* new InvalidHierarchyError({ detail: "A revision must contain between 1 and 1024 items" })
    }

    const known = new Set<string>()
    let ancestors: string[] = []
    return yield* Effect.forEach(proposal.items, (item, preorderPosition) =>
      Effect.gen(function* () {
        const key = item.key.trim()
        const title = item.title.trim()
        if (!key || known.has(key)) {
          return yield* new InvalidHierarchyError({ detail: "Every proposed item key must be non-empty and unique" })
        }
        if (codepoints(title) < 1 || codepoints(title) > 500) {
          return yield* new InvalidHierarchyError({ detail: "Item titles must contain 1 to 500 Unicode code points" })
        }

        const parentKey = item.parentKey?.trim()
        if (item.parentKey !== undefined && !parentKey) {
          return yield* new InvalidHierarchyError({ detail: "A provided parent key must be non-empty" })
        }
        const parentIndex = parentKey ? ancestors.indexOf(parentKey) : -1
        if (parentKey && (!known.has(parentKey) || parentIndex === -1)) {
          return yield* new InvalidHierarchyError({
            detail: "Every parent must be a preceding member of the current depth-first ancestor path",
          })
        }
        const depth = parentKey ? parentIndex + 1 : 0
        if (depth > 16) {
          return yield* new InvalidHierarchyError({ detail: "Revision hierarchy depth cannot exceed 16" })
        }

        known.add(key)
        ancestors = parentKey ? [...ancestors.slice(0, parentIndex + 1), key] : [key]
        return { ...item, key, title, parentKey, preorderPosition, depth }
      }),
    )
  })
}

function membershipKey(revisionID: RevisionID, itemID: ItemID) {
  return `${revisionID}\u0000${itemID}`
}

function codepoints(value: string) {
  return Array.from(value).length
}
