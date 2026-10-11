// ========================================================
// Amazon Cedar Policies for Water Tanker Dispatch System
// ========================================================

// 1. RESIDENT ROLE
// Residents can submit new water requests and view their own requests
permit(
    principal in Role::"Resident",
    action in [Action::"SubmitRequest", Action::"ViewOwnRequest"],
    resource
);

// 2. DISPATCHER ROLE
// Dispatchers can inspect all requests, trigger agent planning, approve dispatches, and reassign tankers
permit(
    principal in Role::"Dispatcher",
    action in [
        Action::"ViewAllRequests",
        Action::"RunAgentPlanning",
        Action::"ApproveDispatch",
        Action::"ReassignTanker",
        Action::"TriggerBreakdownReplan"
    ],
    resource
);

// 3. WARD OFFICER ROLE
// Ward Officers can view ward requests and override priorities ONLY within their ward,
// and ONLY when an explicit override audit reason is provided.
permit(
    principal in Role::"WardOfficer",
    action in [Action::"ViewWardRequests"],
    resource
)
when {
    context.officer_ward == resource.ward_id
};

permit(
    principal in Role::"WardOfficer",
    action == Action::"OverridePriority",
    resource
)
when {
    context.officer_ward == resource.ward_id &&
    context.override_reason != ""
};

// 4. AUDITOR / PUBLIC ROLE
// Auditors and public viewers can only view aggregated fairness statistics and logs
permit(
    principal in Role::"Auditor",
    action in [Action::"ViewFairnessMetrics", Action::"ViewAuditLog", Action::"ViewNeglectedAreas"],
    resource
);
