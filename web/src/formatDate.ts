export function formatDate(
  value: string | null,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (!value) return "Date unknown";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const d = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(
    undefined,
    options ?? { year: "numeric", month: "long", day: "numeric" },
  );
}
