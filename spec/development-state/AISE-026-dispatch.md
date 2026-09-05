Temporary dispatch relay artifact for AISE-026; remove before governance merge.

WORK_ITEM=AISE-026
OWNER=ZAI
REPOSITORY=pectoraux/AISE
BASE_SHA=b63f973c8512c3728413625911c37854a16ed3f5
WORK_ORDER=spec/work-orders.md#AISE-026
ARCHITECTURE=v1.0 frozen
BRANCH=feat/AISE-026-mep-pipe-reconstruction
PR=(none yet; create exactly one for AISE-026)
OWNED_SURFACE=services/reality/semantics/mep/**
FORBIDDEN_SURFACES=apps/android/**; apps/web/** unless explicitly required by the Work Order; unrelated/cross-scope changes; canonical authority changes; epistemic semantic changes
ASSURANCE=CRITICAL
DEPENDENCIES=AISE-009; AISE-011; AISE-012; AISE-022 (all finalized)
ACCEPTANCE=controlled fixture benchmark plus topology/evidence correctness for pipe centerline, diameter, and connectivity representation
MERGE_GATE=ARCHITECT
SELF_MERGE=FORBIDDEN
