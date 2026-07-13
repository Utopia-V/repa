# Formal main v1 historical package snapshot

The formal ALS-015 runner verified
`labs/deepseek-learning-loop/package.json` against SHA-256
`f9efc35e8661704aef1d55294e0e7a298bb48e886217fb44519d10df93aa70d6`
before all model calls. ALS-016 later added the evidence-follow-up script to the
live package file, so the current tree intentionally no longer matches that
historical hash.

This directory preserves the exact former package bytes. Other formal execution
files remain named and hashed in
`../../simulated-student-benchmark.v1.json`. The formal trial IDs already have
persisted local artifacts and must not be rerun from the current tree.
