# DeepSeek bounded material retrieval experiment

Date: 2026-07-11

Status: Research observation for ALS-008. This document does not select a note
format, search engine, vector database, context compiler, or durable source
reference representation.

## Question

Can a generic search-then-read tool path preserve exact source-grounded answers
while avoiding the context expansion of returning an entire course artifact?

The live comparison used:

- **DeepSeek-V4-Flash (API, non-thinking)**; and
- **DeepSeek-V4-Pro (API, thinking=max)**.

ChatGPT GPT-5.6 Pro was not consulted for this batch.

## Setup

The lab generated a 900-line, 121,112-character fictional course
specification. Fictional names and values prevent either model from answering
from pretraining.

The material contained:

- an obsolete classroom Zephyr example at lines 121-122 with distractor values
  `LANTERN-71` and `34 ms`; and
- an authoritative production section at lines 516-521 with activation code
  `LANTERN-17` and mandatory interval `43 ms`.

The user asked for the two production values and a stable source reference with
a line range covering both facts.

Two paths were compared:

1. **Full payload** — one tool returned all 900 numbered lines plus
   `material:zephyr-course-spec:v1`.
2. **Bounded source read** — a search tool returned only the stable source
   reference and candidate range 516-521; a second tool then returned that
   exact window and `material:zephyr-course-spec:v1#L516-L521`.

The search preview deliberately omitted the requested values. The bounded path
therefore had to perform the exact read. The window executor also rejected a
range that had not been returned by search.

Each variant ran three times per model, with at most four model steps and 2,500
output tokens. Full synthetic payloads and complete model outputs are stored in
the local Git-ignored `.runs/` traces. The fixture is
`labs/deepseek-learning-loop/material-retrieval.ts`.

## Oracle correction

Early runs exposed two bad presentation assumptions in the lab oracle:

- a valid citation had to be formatted as one literal `source#Lx-Ly` string;
  and
- values and ranges had to use ASCII spaces and hyphens.

Models instead produced equally inspectable forms such as:

```text
Source reference: material:zephyr-course-spec:v1, lines 0516–0521
43 ms
lines `0518‑0519`
```

The semantic requirement is the same source identity plus a range containing
both fact lines, not a Markdown spelling. The oracle now applies Unicode NFKC,
normalizes display spaces/dashes, and validates line coverage. Five concrete
forms, including a distractor range rejection, are covered by unit tests in
`lab.test.ts`.

DeepSeek-V4-Pro's six recorded outputs were replayed offline through the final
oracle; all six passed. The pre-correction raw traces remain unchanged and the
intermediate false failures are not presented as model errors.

## Results

Both models answered the exact fictional facts and cited a covering source
range in every final-oracle trial.

| Model | Variant | Correct answer and citation | Mean returned characters | Mean model steps | Mean input tokens | Mean uncached input | Mean output tokens | Mean reasoning tokens | Mean elapsed | Mean cost upper bound |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| DeepSeek-V4-Flash | full payload | 3/3 | 121,231 | 2 | 30,505 | 41 after prior cache warmup | 163 | 0 | 2,404 ms | USD 0.00013659 after warmup |
| DeepSeek-V4-Flash | bounded source read | 3/3 | 849 | 3 | 2,388 | 596 | 282 | 0 | 3,215 ms | USD 0.00016732 |
| DeepSeek-V4-Pro | full payload | 3/3 | 121,231 | 2 | 30,752 | 29,814 | 729 | 495 | 11,868 ms | USD 0.01360658 |
| DeepSeek-V4-Pro | bounded source read | 3/3 | 849 | 3 | 2,742 | 651 | 404 | 147 | 7,911 ms | USD 0.00064239 |

The bounded path reduced returned characters by about 143 times. It reduced
cumulative input tokens about 12.8 times for DeepSeek-V4-Flash and 11.2 times
for DeepSeek-V4-Pro.

## Cold-path and cache behavior

The corrected one-trial DeepSeek-V4-Flash smoke run provides a less
cache-dominated comparison:

| Variant | Input tokens | Uncached input | Cost upper bound | Elapsed |
|---|---:|---:|---:|---:|
| full payload | 30,505 | 29,737 | USD 0.00422889 | 3,676 ms |
| bounded source read | 2,397 | 605 | USD 0.00017176 | 3,456 ms |

In the later repeated DeepSeek-V4-Flash sample, the full 121k-character result
was almost entirely a cache read. Its estimated charge consequently fell below
the bounded path despite occupying far more model context.

That does not make the representations equivalent. Provider caching can lower
billing and latency; it does not recover context-window capacity, remove
irrelevant tokens from attention, or eliminate the possibility of competing
distractors. Token load, cache billing, latency, and answer quality must remain
separate measurements.

## What the experiment demonstrates

Current generic tool-loop machinery was sufficient for:

- deterministic search followed by a provenance-bearing bounded read;
- enforcing that a read range came from the preceding search result;
- carrying a stable source identity and line range through tool results into
  the final answer;
- preserving accuracy despite an explicit obsolete distractor; and
- measuring the context and step trade-off without a custom agent loop.

The extra search/read step was not free. It added one model step. For a cached
DeepSeek-V4-Flash payload, the full path was faster in the repeated sample. For
DeepSeek-V4-Pro, bounded retrieval was both much cheaper and about one third
faster in this sample because the large payload induced substantially more
input, output, and reasoning tokens.

## What remains unresolved

The fixture used deterministic exact search over synthetic material. It did
not evaluate:

- retrieval recall on real textbooks, slides, PDFs, video transcripts, or
  learner notes;
- whether the correct section can be localized without an exact phrase;
- teaching that needs several distant passages or a whole-course structure;
- source mutation, versioning, snapshot retention, or stale references;
- prompt injection inside retrieved material;
- whether lines, byte spans, semantic blocks, message parts, or content hashes
  should identify a source region; or
- human learning outcomes.

Bounded retrieval also must not be confused with a teacher having no global
view. A learning agent may need a compact course map, goals, recent evidence,
and prerequisite structure in context while lazily loading the detailed
material needed for the current action. ALS-008 tests only the detailed-read
side of that arrangement.

## Current working conclusion

Do not make “return the whole artifact” the default merely because the model's
context window can hold it. When the current task can be localized, prefer a
bounded read that preserves a stable source reference and enough surrounding
content to inspect the claim. Keep a separate compact global view when the
learning decision needs it.

This is a context/tool-shape hypothesis, not a storage-format decision. It does
not imply Markdown, RAG, embeddings, or a duplicated evidence database.
