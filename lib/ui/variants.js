/**
 * Central UI variant registry
 * Used by Button, Badge, Alert, Toast, etc.
 * Variants express INTENT, not color.
 */

export const UI_VARIANTS = {
  primary: {
    bg: "bg-primary",
    text: "text-primary-foreground",
    hover: "hover:bg-primary/90",
    border: "",
  },

  secondary: {
    bg: "bg-secondary",
    text: "text-secondary-foreground",
    hover: "hover:bg-secondary/80",
    border: "",
  },

  danger: {
    bg: "bg-destructive",
    text: "text-destructive-foreground",
    hover: "hover:bg-destructive/90",
    border: "",
  },

  ghost: {
    bg: "bg-transparent",
    text: "text-foreground",
    hover: "hover:bg-muted",
    border: "",
  },

  outline: {
    bg: "bg-background",
    text: "text-foreground",
    hover: "hover:bg-muted",
    border: "border border-border",
  },
};
