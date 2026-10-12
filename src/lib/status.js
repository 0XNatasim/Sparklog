// Status badge mapping: saved=blue (info), submitted=teal (success),
// approved=neutral/black, updated=amber (warning). Not "default": the primary colour
// is the action green, and a draft must not look like a finished step.
export function statusBadgeVariant(status) {
  switch (status) {
    case "saved":
      return "info";
    case "submitted":
      return "success";
    case "approved":
      return "neutral";
    case "updated":
      return "warning";
    default:
      return "secondary";
  }
}
