/**
 * The badge distinguishes overdue by more than colour — the label itself says
 * "Overdue", so it still reads for someone who can't tell the two apart.
 */
export type DueTone = "overdue" | "today" | "neutral";

export function dueDateLabel(
  value: string | null,
): { label: string; tone: DueTone } | null {
  if (!value) return null;

  const due = new Date(value);
  if (Number.isNaN(due.getTime())) return null;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const startOfDue = new Date(due);
  startOfDue.setHours(0, 0, 0, 0);

  const days = Math.round(
    (startOfDue.getTime() - startOfToday.getTime()) / (24 * 60 * 60 * 1000),
  );

  if (days < 0) {
    return {
      label: `Overdue — ${formatDate(due)}`,
      tone: "overdue",
    };
  }
  if (days === 0) return { label: "Due today", tone: "today" };
  if (days === 1) return { label: "Due tomorrow", tone: "neutral" };

  return { label: `Due ${formatDate(due)}`, tone: "neutral" };
}

function formatDate(date: Date) {
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
