# Evaluation Metric Catalog version policy

The current first-release candidate is `agentops.evaluation.metric-catalog@1.0.0`. It contains the exact 14-metric meaning, denominator and coverage decisions closed by issue #79, with the machine closure from issue #44 revised to match. This is the lifecycle-required first frozen-version boundary.

Metric Catalog `0.1.0` is `NON_RESOLVING_LEGACY_HISTORY_ONLY`. It remains available only through Git history and must not be selected, resolved, advertised as current, or accepted by a `1.0.0` consumer.

- PATCH: non-semantic text or validator corrections that preserve accepted meaning.
- MINOR: backward-compatible optional representation additions that do not alter any metric meaning, formula, eligibility, or input set.
- MAJOR: metric addition/removal, formula, eligibility, value semantics, coverage policy, or closed input-set changes; it restarts the full Contract lifecycle.
- Metric, schema, example, fixture, dependency and package revisions bind exactly to `1.0.0`; compatibility is never inferred from matching identifiers or SemVer.

Until contract.gate.1–contract.gate.6 and `evidence-governance-owner` approval pass, `1.0.0` remains `REVIEW_CANDIDATE`, is not published, and admits no BI or implementation conformance claim.
