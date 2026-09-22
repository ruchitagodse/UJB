import { CheckCircle, Clock, XCircle } from "lucide-react";

/**
 * Business status registry
 * ❗ DO NOT style directly in components
 * ❗ DO NOT allow free-form status strings
 */

export const STATUS_CONFIG = {
  approved: {
    label: "Approved",
    variant: "primary",
    icon: CheckCircle,
  },

  pending: {
    label: "Pending",
    variant: "secondary",
    icon: Clock,
  },

  rejected: {
    label: "Rejected",
    variant: "danger",
    icon: XCircle,
  },
};
