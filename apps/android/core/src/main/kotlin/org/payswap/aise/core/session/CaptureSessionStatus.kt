package org.payswap.aise.core.session

/**
 * Local capture-session lifecycle (AISE-005):
 *
 * ```text
 *            begin                 pause
 *  DRAFT ────────────► CAPTURING ◄────────► PAUSED
 *   │                    │  ▲                 │
 *   │  finalize          │  └──── resume ─────┘
 *   │  (empty session)   │ finalize              finalize
 *   ▼                    ▼                         ▼
 *             ┌──────────────► FINALIZED ──── mark synced ────► SYNCED
 *             └──────────────────┘
 * ```
 *
 * `SYNCED` is terminal. The transition matrix in [SessionTransitions] is the
 * single normative definition — the journal fold, the controller and the UI
 * all consult it; nothing else hardcodes a transition.
 *
 * The device never advances a session to a state that claims engineering
 * meaning: FINALIZED means "the operator closed the session and the local
 * manifest is written" — readiness/verification remain server-authoritative
 * (spec/architecture-lock.md authority invariants; `SYNCED` is a transport
 * fact recorded by AISE-030 after a gateway ack, never a quality judgment).
 */
enum class CaptureSessionStatus {
    DRAFT,
    CAPTURING,
    PAUSED,
    FINALIZED,
    SYNCED,
}

/** Typed failure for an illegal session-state transition (fail closed). */
class IllegalSessionTransitionException(
    val from: CaptureSessionStatus,
    val to: CaptureSessionStatus,
) : IllegalArgumentException("illegal capture-session transition ${from.name} -> ${to.name}")

/**
 * THE normative transition matrix of the capture-session state machine.
 *
 * Legal transitions (7):
 *  - DRAFT → CAPTURING          (begin)
 *  - DRAFT → FINALIZED          (finalize an empty/abandoned session)
 *  - CAPTURING → PAUSED         (pause)
 *  - PAUSED → CAPTURING         (resume)
 *  - CAPTURING → FINALIZED      (finalize)
 *  - PAUSED → FINALIZED         (finalize)
 *  - FINALIZED → SYNCED         (marked synced by AISE-030 after a gateway ack)
 *
 * Everything else — including no-op self-transitions — is illegal and
 * rejected with [IllegalSessionTransitionException]. The full legal set is
 * exposed as [LEGAL] so tests can exhaustively verify the matrix.
 */
object SessionTransitions {

    val LEGAL: Set<Pair<CaptureSessionStatus, CaptureSessionStatus>> = setOf(
        CaptureSessionStatus.DRAFT to CaptureSessionStatus.CAPTURING,
        CaptureSessionStatus.DRAFT to CaptureSessionStatus.FINALIZED,
        CaptureSessionStatus.CAPTURING to CaptureSessionStatus.PAUSED,
        CaptureSessionStatus.PAUSED to CaptureSessionStatus.CAPTURING,
        CaptureSessionStatus.CAPTURING to CaptureSessionStatus.FINALIZED,
        CaptureSessionStatus.PAUSED to CaptureSessionStatus.FINALIZED,
        CaptureSessionStatus.FINALIZED to CaptureSessionStatus.SYNCED,
    )

    fun isLegal(from: CaptureSessionStatus, to: CaptureSessionStatus): Boolean = (from to to) in LEGAL

    fun requireLegal(from: CaptureSessionStatus, to: CaptureSessionStatus) {
        if (!isLegal(from, to)) {
            throw IllegalSessionTransitionException(from, to)
        }
    }

    /** All (from, to) pairs over the status set — 25 pairs; tests assert every non-legal one is rejected. */
    fun allPairs(): List<Pair<CaptureSessionStatus, CaptureSessionStatus>> =
        CaptureSessionStatus.entries.flatMap { from -> CaptureSessionStatus.entries.map { from to it } }
}
