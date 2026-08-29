# Execution Provider Binding 2.0 candidate

This package defines the machine-readable candidate that lets one WSR installation register multiple exact Agent Provider factories while requiring every Workflow Agent-action Role to select one Provider version and one Provider-owned model coordinate explicitly.

The repository document is `<canonical-worktree>/.wsr/role-provider-bindings.json`. Its closed binding is `{agentProvider:{identity,version},model:{provider,model}}`. There is no installation default, provider priority, ordered fallback, ambient discovery, or post-admission rebinding. Missing, unknown, version-mismatched, or capability-incompatible bindings fail before Runner effect.

Admission freezes the factory version, invocation adapter key, canonical descriptor digest, required capabilities, and model coordinate into each resolved Role. Recovery requires an exact registered descriptor match and starts realms only for Providers present in the persisted Manifest. Provider-native credentials and login state remain Provider-owned and are absent from every schema and fixture here.

Run `npm test` to qualify the closed schemas and positive/negative corpus. This is a review candidate and does not alter published 1.x contracts.

[中文](README.zh-CN.md)
