# Selected current-purpose pressure

This lab isolates one consequence of ALS-021. It does not test selection policy
and it is not production code.

ALS-022A reuses the frozen `return_independent_prediction` setup and production
Tutor runner. The only intervention is an oracle-selected current-purpose
contribution added to every model request in the Turn. Eight independent
DeepSeek-V4-Flash (non-thinking) samples answer one question: can the model
realize an explicitly bound unaided-prediction purpose without revealing the
answer first?

The lab deliberately has no blind-review pipeline or broad qualitative score.
The runner records raw sanitized model calls, final Tutor text, durable state,
usage, cost, and a few mechanical inspection signals. The stable result and
human inspection belong under `docs/research/`.

Run with a hard campaign cap of at most USD 0.02:

```powershell
$env:REPA_LAB_MAX_USD='0.02'
bun run labs/selected-current-purpose-pressure/run-oracle.ts
```

There are no provider retries. A failed or interrupted case is retained and
stops the run. Raw artifacts are written under ignored `.runs/` storage.

ALS-022B then tests the still-open semantic selection question without yet
choosing production transport. Eleven direct-help, redirection,
multiple-candidate, timing/staleness, completion, and positive-adoption cases
run twice. The output is a side-effect-free JSON proposal plus local Zod
validation, following ALS-014; a future accepted selection may still use a
runtime control capability because adopting it changes bounded Turn control
state.

```powershell
$env:REPA_LAB_MAX_USD='0.02'
bun run labs/selected-current-purpose-pressure/run-selector.ts
```

ALS-022C is the one admitted redesign after ALS-022B failed. It removes
deterministically illegal candidates and asks only which exact source governs:
the admitted current request, one unchanged Agenda candidate, or unresolved
conflict. It does not let the model author a replacement purpose.

```powershell
$env:REPA_LAB_MAX_USD='0.02'
bun run labs/selected-current-purpose-pressure/run-source-selector.ts
```

ALS-022D is not another selector prompt. After ALS-022B/C reject the universal
classifier, it tests a program-owned conditional default: one legal Agenda
candidate is bound exactly for generic continuation, while a conflicting exact
current request remains higher priority in the ordinary realizing sample.

```powershell
$env:REPA_LAB_MAX_USD='0.02'
bun run labs/selected-current-purpose-pressure/run-conditional-default.ts
```

ALS-022E is the final representation ablation. It removes the manually restated
independent-prediction constraint and adds only conditional-default status for
the exact Agenda reason already present in production context. It decides
whether an additional operative-constraint representation has been earned.

```powershell
$env:REPA_LAB_MAX_USD='0.02'
bun run labs/selected-current-purpose-pressure/run-exact-reason-default.ts
```
