import type { TurnInfo, TurnInspectionExhaustion } from "./gen/types.gen.js"

type Assert<T extends true> = T
type Equal<Left, Right> = (<T>() => T extends Left ? 1 : 2) extends <T>() => T extends Right ? 1 : 2 ? true : false

type Exact = Exclude<TurnInspectionExhaustion, { type: "generic" }>
type _CarrierPresent = Assert<Equal<NonNullable<TurnInfo["inspectionExhaustion"]>, TurnInspectionExhaustion>>
type _ExactGapState = Assert<
  Equal<Exact["gapCounts"], { oversizedCandidateSkipped: number; rangeItemsSkipped: number }>
>
type _MissingSourceRemainsGeneric = Assert<
  Extract<TurnInspectionExhaustion, { type: "generic" }> extends { reason: string } ? true : false
>

export type TurnInspectionCodegenContract = _CarrierPresent | _ExactGapState | _MissingSourceRemainsGeneric
