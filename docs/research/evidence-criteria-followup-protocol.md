# Evidence criteria follow-up protocol

Date: 2026-07-11

Status: pre-registered before follow-up model calls; the completed failed result
is recorded in `evidence-criteria-followup-2026-07-11.md`.

This is the single targeted follow-up permitted by the frozen v1 result policy.
It addresses only the repeated evidence-representation confound. Selection
fixtures, weights, prompts, and scores will not be changed or rerun.

## Immutable inputs

The follow-up reuses the 24 learner responses already persisted by formal v1:

| Trial | Raw artifact SHA-256 |
|---:|---|
| 1 | `8d13495577c4fc652decd2a92dd08531697d3029197f4fd79b8d54c72486e688` |
| 2 | `9b4e2a737a76153da0eaba8aed0472577d773a649dc370334b6ad71f787b0be9` |
| 3 | `b5f9b0bee4c767d8b6a275d03208cb8a47a82428a79af8c78550ce64689cc902` |

No new student response is rendered. Each response is judged in isolation.
Expected candidates, fixture categories, prior model candidates, hidden learner
profiles, and selection outcomes are absent from model requests.

## Revised measurement contract

Each task declares two local rubric criteria in this slice:

- `claim`: the externally checkable conclusion or requested repair;
- `justification`: the required explanation or rule.

These names are fixture-local rubric dimensions, not a proposed universal
ontology. A future domain may declare different criteria.

The model returns only:

```text
case ID
source reference
criterion ID -> satisfied | violated | unresolved
controlled error-tag candidate or null
brief audit basis
```

The program owns exact criterion coverage and derives:

```text
claim violated -> incorrect
claim unresolved -> unresolved
claim satisfied + any required criterion violated/unresolved -> partial
all required criteria satisfied -> correct

correct + no assistance -> independent_success + no obligation
correct + hint -> assisted_success + verification
incorrect -> failure + targeted_review
partial/unresolved -> uncertain + diagnostic
```

The model cannot output assistance, overall outcome, evidence signal,
obligation, mastery, or persistence state.

## Prompt robustness

Two semantically equivalent frozen prompt orders are used:

- `criteria_first`;
- `rubric_first`.

Each variant judges all 24 responses with one response per model call using
DeepSeek-V4-Flash (API, non-thinking), temperature 0. This is one follow-up with
a prompt-order falsifier, not two attempts from which a preferred result may be
selected.

## Predeclared falsifiers

The representation-confound hypothesis passes only if **both** prompt variants
satisfy all conditions:

1. zero schema, identity, criterion-coverage, source, or illegal-tag failures;
2. zero false-independent derived claims;
3. deterministic derivation passes its pure contract tests with zero illegal
   outcome/signal/obligation combinations;
4. the two observed disagreement cases (`object-this-partial` and
   `second-bind-partial`) match their frozen candidate oracle in all three
   trials: 6/6 per prompt variant;
5. at least 17/18 non-confound records remain exact per prompt variant;
6. at least 23/24 total derived evidence records are exact per prompt variant;
7. the two prompt variants agree on at least 23/24 derived evidence records;
   and
8. no task-specific exception or JavaScript-specific field is introduced into
   the generic candidate schema.

The thresholds do not establish statistical significance or human validity.
They only decide whether the revised measurement boundary resolves the exact
observed confound without creating a new one.

## Result branch

- If all falsifiers pass, retain rubric-criterion judgment plus deterministic
  derivation as a working learning-domain boundary for the later headless
  contract slice. Do not promote a universal schema.
- If any falsifier fails, do not add the revised abstraction to production.
  Retain deterministic rejection of inconsistent LLM candidates and record the
  evidence representation as unresolved.

There is no second repair experiment after this follow-up.
