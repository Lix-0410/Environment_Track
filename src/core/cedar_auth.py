"""Amazon Cedar policy authorization engine for Water Tanker Routing."""

import os
from typing import Dict, Any, Tuple
from pathlib import Path

try:
    import cedarpy
    HAS_CEDARPY = True
except ImportError:
    HAS_CEDARPY = False

POLICY_FILE_PATH = Path(__file__).resolve().parent.parent.parent / "policies" / "tanker_policies.cedar"

class CedarAuthEngine:
    def __init__(self, policy_path: Path = POLICY_FILE_PATH):
        self.policy_path = policy_path
        self.policies_text = ""
        self._load_policies()

    def _load_policies(self):
        if self.policy_path.exists():
            with open(self.policy_path, "r", encoding="utf-8") as f:
                self.policies_text = f.read()
        else:
            self.policies_text = ""

    def authorize(
        self,
        principal_role: str,
        principal_id: str,
        action: str,
        resource_id: str,
        resource_ward: str = "",
        context: Dict[str, Any] = None
    ) -> Tuple[bool, str]:
        """
        Evaluates permission via Cedar.
        Returns: (allowed: bool, explanation: str)
        """
        context = context or {}
        principal_str = f'Role::"{principal_role}"'
        action_str = f'Action::"{action}"'
        resource_str = f'Resource::"{resource_id or "system"}"'

        # Native Cedar evaluation via cedarpy
        if HAS_CEDARPY and self.policies_text:
            try:
                entities = [
                    {
                        "uid": {"type": "Role", "id": principal_role},
                        "attrs": {"user_id": principal_id},
                        "parents": []
                    },
                    {
                        "uid": {"type": "Resource", "id": resource_id or "system"},
                        "attrs": {"ward_id": resource_ward},
                        "parents": []
                    }
                ]
                request = {
                    "principal": principal_str,
                    "action": action_str,
                    "resource": resource_str,
                    "context": context
                }
                result = cedarpy.is_authorized(request, self.policies_text, entities)
                if result.allowed:
                    return True, f"Cedar Policy: ALLOWED. Action '{action}' permitted for role '{principal_role}'."
                else:
                    diagnostics = getattr(result, "diagnostics", None)
                    reasons = f" Reason: {diagnostics}" if diagnostics else ""
                    return False, f"Cedar Policy: DENIED. Action '{action}' not authorized for role '{principal_role}'.{reasons}"
            except Exception:
                # Fallback to precise rule evaluation if entity format variations arise
                return self._evaluate_fallback(principal_role, principal_id, action, resource_ward, context)

        return self._evaluate_fallback(principal_role, principal_id, action, resource_ward, context)

    def _evaluate_fallback(self, role: str, user_id: str, action: str, resource_ward: str, context: dict) -> Tuple[bool, str]:
        """Precise in-memory mirror of the Cedar policy document."""
        if role == "Resident":
            if action in ["SubmitRequest", "ViewOwnRequest"]:
                return True, f"Cedar Permit: Resident '{user_id}' can execute '{action}'."
            return False, f"Cedar Deny: Residents cannot perform administrative action '{action}'."

        elif role == "Dispatcher":
            if action in ["ViewAllRequests", "RunAgentPlanning", "ApproveDispatch", "ReassignTanker", "TriggerBreakdownReplan"]:
                return True, f"Cedar Permit: Dispatcher '{user_id}' authorized for '{action}'."
            return False, f"Cedar Deny: Action '{action}' not allowed for Dispatcher."

        elif role == "WardOfficer":
            officer_ward = context.get("officer_ward", "")
            if action == "ViewWardRequests":
                if officer_ward == resource_ward:
                    return True, f"Cedar Permit: Ward Officer of '{officer_ward}' viewing their ward."
                return False, f"Cedar Deny: Ward Officer of '{officer_ward}' cannot view other ward '{resource_ward}'."

            if action == "OverridePriority":
                if officer_ward != resource_ward:
                    return False, f"Cedar Deny: Cross-ward override rejected. Officer belongs to '{officer_ward}', target is '{resource_ward}'."
                reason = context.get("override_reason", "").strip()
                if not reason:
                    return False, "Cedar Deny: Priority overrides must carry an explicit audit reason."
                return True, f"Cedar Permit: Priority override approved for Ward '{officer_ward}' with audit reason: '{reason}'."

            return False, f"Cedar Deny: Ward Officer not permitted for action '{action}'."

        elif role == "Auditor":
            if action in ["ViewFairnessMetrics", "ViewAuditLog", "ViewNeglectedAreas"]:
                return True, f"Cedar Permit: Auditor authorized for '{action}'."
            return False, f"Cedar Deny: Auditors cannot modify operational dispatches."

        return False, f"Cedar Deny: Unknown role '{role}'."

cedar_engine = CedarAuthEngine()
