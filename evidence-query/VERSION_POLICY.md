# Evidence Query machine representation version policy

The current coordinate is `evidence.query@0.1.0` with read-model revision `1.0.0` and Observation Profile `1.0.0`. It is a `REVIEW_CANDIDATE`, not a publication. The only permitted claim is `VALIDATOR_ONLY`; schema-only, production, and cross-implementation conformance claims are false.

- PATCH corrects text, fixtures, schemas, or validator behavior without changing accepted JSON meaning, ownership, truth, expiry, ordering, defaults, or errors.
- MINOR adds an optional surface only after the semantic Contract permits it. Because revision `0.1.0` rejects unknown response fields, consumers must reject unsupported later revisions.
- MAJOR changes a required field, route, closed enum, identity/ownership tuple, truth/expiry meaning, lifecycle default/range, snapshot rule, ordering, error mapping, or authority coordinate.
- Observation Profile and read-model revisions are independent coordinates and never silently alias another tuple.
- Any manifest, semantic-section, upstream-machine, or artifact digest mismatch fails closed and returns to owner review.

Publication requires the semantic and machine revisions to become `FROZEN` together after contract.gate.1–6 and explicit owner approval. This candidate inventory must never be relabeled as published in place.
