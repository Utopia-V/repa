# Evidence follow-up v1 historical package snapshot

The formal ALS-016 runner verified
`labs/deepseek-learning-loop/package.json` against SHA-256
`d03e3b5e138604381130fcad7af1a3f4407d53ffea82dac0ead09d7040e09153`
before its model calls. ALS-017 later added the model-initiated-write runner to
the live package file, so the growing lab package intentionally no longer
matches the historical hash.

This directory preserves the exact former package bytes. On 2026-07-11 the
execution manifest path was moved from the live package to this snapshot;
the expected hash and file bytes were not changed. Other formal execution
files and persisted inputs remain named and hashed in
`../../simulated-student-evidence-followup.v1.json`. The formal run must not be
rerun from the current tree.
