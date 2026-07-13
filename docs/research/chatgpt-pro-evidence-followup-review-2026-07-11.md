# ChatGPT GPT-5.6 Pro review: evidence follow-up boundary

Date: 2026-07-11

Reviewer: ChatGPT GPT-5.6 Pro (subscription, Extended Pro via the private Pro
bridge)

Elapsed: 42.1 seconds

Web search: not requested; this was an architecture and experiment-design
review of supplied local evidence.

## Question

The frozen first-domain benchmark repeatedly disagreed on responses whose
surface conclusion was correct but whose explanation was wrong or missing. The
proposed sole follow-up replaced model-owned `outcome + signal + obligation`
with smaller semantic judgments and deterministic derivation.

## Review changes adopted

1. Treat the follow-up as a **measurement-contract revision**, not a benchmark
   rescue or model improvement.
2. Use task-declared rubric criteria rather than universal
   `conclusion/mechanism` fields. The first slice has `claim` and
   `justification`; another domain may declare different criteria.
3. Keep only criterion satisfaction, a controlled error-tag candidate, and
   audit basis model-owned. Derive outcome, evidence signal, obligation,
   provenance, admission, and persistence deterministically.
4. Do not use higher v2 accuracy alone as success. Require zero illegal derived
   states, exact resolution of both observed disagreement classes, preservation
   of the other cases, and stability under a reordered but equivalent prompt.
5. Keep the selection conclusion independent: the current benchmark gives no
   evidence that inferred state improves one-step selection over stateless
   behavior. It does not show that durable learning state is unnecessary.

## Claim boundary

Even a passing follow-up would support only this statement: the original
redundant evidence representation introduced a labeling confound, and a
criterion-judgment/deterministic-derivation boundary is a better working
hypothesis for the tested slice. It would not validate a universal learning
ontology, real learning effects, or a general scheduler.
