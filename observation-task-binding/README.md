# Observation Task Binding candidate

This sibling package defines the `agentops.observation-profile@2.0.0` delta for
Task declaration and immutable Delivery membership. It is separate from
`observation/` because the published Observation 1.0.2 inventory binds every byte
in that directory and must remain unchanged.

One admission-time `task.binding` log record carries the exact Task ID, Delivery
ID, Manifest digest, and an optional display name. Evidence atomically derives a
Task declaration and Delivery membership from that accepted owner record. The
display name is presentation metadata, never identity or a reuse key.

This is a review candidate. It does not relabel or widen the published Profile
1.0.0 coordinate.
