# Observation Task Binding candidate

This sibling package defines the `agentops.observation-profile@2.0.0` successor for
Task declaration, Delivery membership, and direct Delivery retention association. It is separate from
`observation/` because the published Observation 1.0.2 inventory binds every byte
in that directory and must remain unchanged.

One admission-time `task.binding` log record carries the exact Task ID, Delivery
ID, Manifest digest, bounded canonical evidence-safe Manifest projection and its
digest, plus an optional display name. Evidence atomically derives Task
declaration/membership/guard/display effects and the immutable Manifest reading
from that accepted owner record. The display name is presentation metadata,
never identity or a reuse key. C09 is deterministic from the Delivery ID so an
exact retry or recovery reproduces the same record identity and bytes.

The Workflow family is the validated Manifest projection's stable `workflow_id`.
Its schema coordinate is `<workflow_id>@1`; neither producer nor acceptor keeps
a closed Workflow-name allowlist.

Profile 2 requires direct C01 on every supported Event and Span. Evidence records internal
record-to-Delivery membership during admission; it never infers GC ownership from Trace correlation,
timestamps, arrival order, or payload inspection. The accepted terminal `delivery.summary` projection
time is the Delivery TTL anchor.

This is a review candidate. It does not relabel or widen the published Profile
1.0.0 coordinate.

Each projected resolved Role also carries the frozen Agent Provider version, invocation adapter key,
canonical factory descriptor digest, and required capabilities. This makes multi-Provider attribution
and recovery compatibility exact without consulting current runtime configuration.

Chinese companion: [`README.zh-CN.md`](README.zh-CN.md).
