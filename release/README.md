# Contract publication release adapter

This adapter publishes existing immutable publication records and a digest inventory. It does not use npm publication semantics.

```sh
node release/cli/release.cjs config
```

Merge the candidate to `release/next`, select that ref, and dispatch the candidate workflow. Stable remains a separate post-repin action, and only its final GitHub Release step uses the short-lived release App token.
