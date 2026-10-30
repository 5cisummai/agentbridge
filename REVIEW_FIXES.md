# Review fixes

This checklist tracks fixes from the server and runner reviews. Mark an item
complete only after implementing the fix and recording focused verification.
Use `in progress` notes for partial work. Do not commit, push, or deploy.

## Coordination

- One agent owns `server/`; one agent owns `runner/`.
- Each agent updates only its own section below using targeted patches.
- Preserve existing workspace edits, including partial runner lifecycle edits
  from the interrupted agents. Inspect them before continuing.
- Coordinate gateway/runner protocol changes directly. Event replay requires
  gateway deduplication; acknowledged replay requires an explicit acknowledgment
  contract. Record actual delivery guarantees and any remaining limitations.
- Keep fixes focused and add meaningful regression tests for changed behavior.

### Integration verification

- Passed an end-to-end check with the compiled Rust runner, TypeScript WebSocket
  hub, and an isolated PostgreSQL database: profile and workspace RPCs, process
  spawn, partial output, forced WebSocket disconnect, reconnect, retained output,
  monotonic gateway event cursors, exit event, and persisted exited status.
- Test output remained `firstsecond` across the disconnect; gateway events had
  unique cursors 1, 2, and 3. Temporary runner state was removed afterward.
- Final combined checks passed: 18 runner tests with the default parallel
  harness, 10 server tests with isolated PostgreSQL/OAuth flows, server TypeScript
  validation, and `git diff --check`. The temporary PostgreSQL container was
  stopped after validation. All changes remain uncommitted.

## Server

Owner: server agent. Status: complete.

- [x] S1: Validate WebSocket hello parameters and contain async handler errors
  so malformed unauthenticated input cannot crash the process.
- [x] S2: Authorize thread events against the authenticated device.
- [x] S3: Prevent approval and timeout events from colliding with runner event
  sequence numbers; coordinate one consistent sequencing contract.
- [x] S4: Complete OAuth consent with the signed authorization query and the
  provider's consent endpoint.
- [x] S5: Align runner enrollment tokens and verification, including resource
  audience binding; coordinate with the runner agent.
- [x] S6: Preserve and retry approval decisions when device delivery fails.
- [x] S7: Atomically reject expired/already resolved approvals and coordinate
  decisions with timeout processing.
- [x] S8: Update thread status and exit time when an exit event arrives.
- [x] S9: Keep replacement device connections when an older socket closes.
- [x] S10: Persist and return raw runner output when requested.

### Server verification and notes

- All 10 server tests pass with `REVIEW_DATABASE_URL` pointing at an isolated PostgreSQL database; direct `tsc --noEmit` passes. Without that variable, DB integration cases are skipped.
- Real PostgreSQL regressions cover malformed hello, ownership, independent cursor allocation, replay dedupe after retention, raw output, exit status, atomic decisions/timeouts, retry outbox, replacement sockets, and durable event RPC ACKs.
- Live installed Better Auth tests cover logged-out authorize -> signed login query -> email sign-in -> consent POST -> authorization code/state callback; device code creation/verification/approval -> resource-bound JWT token -> enrollment verifier acceptance and wrong-audience rejection.
- Enrollment testing exposed and repaired the placeholder auth schema's missing provider columns, PostgreSQL array representation, and enabled joins without relations. Runner resource links/default MCP registration resources are now configured.
- `0001_review_fixes.sql` passed transactionally against a separate database built from the original HEAD schema with retained seq=5 events and legacy raw/JSON auth array fixtures. Cursor backfill produced event_seq=5, runner_seq=-1; auth arrays converted correctly.
- Protocol: ordered runner thread.event RPCs carry stable runner seq; server ACKs after durable commit and assigns independent client cursors. approval.submit persists idempotently before the canonical runner approval_required event, without a second synthetic event.
- Decisions remain in a durable outbox until acknowledged and retry every 30 seconds. Runner delivery must be idempotent by approval ID.
- Upgrade requires draining old active threads and restarting upgraded runners because old mixed event history has no trustworthy replay watermark. Replay queues survive reconnects within a runner process, not process restarts; retention/buffer limits can discard output. README documents fresh schema push and explicit original-schema SQL migration; no migration journal is claimed.
- `pnpm build` initially attempted an install and was blocked by pnpm's ignored build-script policy; direct installed TypeScript and Vitest binaries completed all checks without changing that policy.

## Runner

Owner: runner agent. Status: complete; focused verification passed.

- [x] R1: Distinguish gateway RPC requests from responses and dispatch requests.
- [x] R2: Terminate the actual process when killing a thread.
- [x] R3: Observe natural/failed process exits, emit exit events, and release
  concurrency slots independently of stdin channel closure.
- [x] R4: Seed home access only once; preserve an intentionally empty allowlist.
- [x] R5: Replace broad approval substring heuristics with conservative,
  stream-aware prompt detection; cover false positives and split prompts.
- [x] R6: Restrict secret database files and application directories to private
  permissions, including existing files where appropriate.
- [x] R7: Preserve pending events across reconnects and implement/document the
  coordinated replay and delivery contract with the server agent.
- [x] R8: Deliver partial output without requiring a trailing newline, and flush
  remaining adapter output at process exit.
- [x] R9: Bound offline output memory with byte/event limits and observable gaps.
- [x] R10: Handle OAuth pending, slow-down, terminal errors, and expiry correctly.
- [x] R11: Remove the profile tests' race on process-wide test directory settings
  so the default parallel test run passes reliably.

### Runner verification and notes

- `cargo test --offline --manifest-path runner/Cargo.toml` passes under the
  default parallel harness: all 18 tests pass, including real WebSocket request dispatch
  and lost-ACK reconnect replay, process exit/kill slot cleanup, partial output,
  split approval prompts, permission modes, empty-root preservation, bounded
  replay overflow, local approval expiry, and OAuth error classification.
- Retained events replay in order across WebSocket reconnects until durable
  gateway ACK; server deduplicates by thread and runner sequence. Approval submit
  is processed before canonical approval event ACK. Replay is memory-only and
  does not survive runner restart.
- Buffer limits: 2,048 events and 4 MiB serialized payload, structured adapter
  buffers 64 KiB, prompt tails bounded. Overflow favors retaining approval/exit
  controls and attaches cumulative global `delivery_gap` counts; oversized
  events become `output_gap`. Overflow can still lose events (including controls
  if controls alone fill the buffer), and gaps do not reconstruct per-thread
  state. A local 900-second fail-closed denial prevents indefinite approval
  blocking if disconnected or submission was lost. Gateway expiry may differ.
- Unix kill targets the PTY process group and waits for lifecycle cleanup.
  Process output is drained before exit (two-second bounded EOF wait prevents
  inherited descriptors in background descendants from blocking cleanup).
- Unix application directories use 0700 and secret files/database use 0600;
  non-Unix uses platform defaults. Profile tests use explicit temporary database
  paths without process-wide environment mutations.
