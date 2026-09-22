import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info,
} from "lucide-react";

/**
 * Toast intent registry
 * ❗ Expresses meaning, not appearance
 */

export const TOAST_CONFIG = {
  success: {
    icon: CheckCircle,
    variant: "primary",
  },

  error: {
    icon: XCircle,
    variant: "danger",
  },

  warning: {
    icon: AlertTriangle,
    variant: "secondary",
  },

  info: {
    icon: Info,
    variant: "ghost",
  },
};
