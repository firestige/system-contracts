# Evidence Task Query candidate

`evidence.query@1.0.0` supersedes the frozen 0.1 semantics and adds the read-only `/v1/evidence/tasks` route, the exact
non-paginated `/v1/evidence/manifests?manifest_digest=...` route, and the
read-model 2.0 Task/Manifest projection. It is a sibling package because the published
`evidence-query/` directory is an immutable historical inventory.

An accepted Profile 2.0 `task.binding` record atomically creates Task declaration,
Delivery membership, a Delivery uniqueness guard, optional display metadata, and
the immutable evidence-safe Manifest reading. Task and Manifest effects are
permanent Evidence authority. Fact/Trace payloads may retain class-specific physical scrub policies,
but Query 1.0 exposes one Delivery-level logical observation lifecycle to consumers.

The candidate also changes observation retention to a Delivery-level logical boundary. An expired
Delivery leaves every current metric population before metric-specific evaluation units are formed;
retention cannot create `PARTIAL`. Incremental physical scrubbing remains internal. An active Delivery
is partial only when recorded structure or a sanitized, Delivery-scoped integrity marker proves a gap.
Rejected values are never stored as Facts or Metric Results. The superproject durable design is
`docs/systems/evidence/delivery-observation-lifecycle.md` with a Chinese tracking companion.

The route supports bounded Task discovery and exact membership traversal at an
`as_of` cutoff. Each traversal uses its own repeatable-read snapshot and cursor;
there is no cross-route or global snapshot Oracle.
