// Status badge mapping: saved=blue (default/primary), submitted=green (success),
// approved=neutral/black, updated=amber (warning).
export function statusBadgeVariant(status) {
  switch (status) {
    case "saved":
      return "default";
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
