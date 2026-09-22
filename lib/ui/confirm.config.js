import { CheckCircle, XCircle, Trash2 } from "lucide-react";

/**
 * Confirmable actions registry
 * ❗ UI derives from intent, not caller choice
 */

export const CONFIRM_ACTIONS = {
  approve: {
    title: "Approve Item",
    description: "Are you sure you want to approve this item?",
    confirmLabel: "Approve",
    variant: "primary",
    icon: CheckCircle,
  },

  reject: {
    title: "Reject Item",
    description: "Are you sure you want to reject this item?",
    confirmLabel: "Reject",
    variant: "danger",
    icon: XCircle,
  },

  delete: {
    title: "Delete Item",
    description:
      "This action cannot be undone. Are you sure you want to delete?",
    confirmLabel: "Delete",
    variant: "danger",
    icon: Trash2,
  },
};
