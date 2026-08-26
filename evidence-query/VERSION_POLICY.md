# Evidence Query machine representation version policy

The current coordinate is frozen `evidence.query@0.1.0` with read-model revision `1.0.0` and Observation Profile `1.0.0`. Contract.gate.1–6 and `firestige` owner approval passed against the exact publication binding. The maximum Contract claim is `VALIDATOR_ONLY`; production and cross-implementation conformance remain unproven.

- PATCH corrects text, fixtures, schemas, or validator behavior without changing accepted JSON meaning, ownership, truth, expiry, ordering, defaults, or errors.
- MINOR adds an optional surface only after the semantic Contract permits it. Because revision `0.1.0` rejects unknown response fields, consumers must reject unsupported later revisions.
- MAJOR changes a required field, route, closed enum, identity/ownership tuple, truth/expiry meaning, lifecycle default/range, snapshot rule, ordering, error mapping, or authority coordinate.
- Observation Profile and read-model revisions are independent coordinates and never silently alias another tuple.
- Any manifest, semantic-section, upstream-machine, or artifact digest mismatch fails closed and returns to owner review.

The immutable RC candidate inventory remains historical and is never relabeled in place. `publication-record-0.1.0.json` binds the final semantic bytes, machine inventory, RC target/assets, gates, and owner approval. A future change follows the version rules above and creates a new record rather than overwriting this revision.
