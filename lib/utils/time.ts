export function formatRelativeTime(value?: string | Date) {
  if (!value) return "Recently";
  const date = typeof value === "string" ? new Date(value) : value;
  const diff = Date.now() - date.getTime();

  if (Number.isNaN(diff)) return "Recently";

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return "Just now";
  if (diff < hour) {
    const count = Math.max(1, Math.floor(diff / minute));
    return `${count} ${count === 1 ? "minute" : "minutes"} ago`;
  }
  if (diff < day) {
    const count = Math.max(1, Math.floor(diff / hour));
    return `${count} ${count === 1 ? "hour" : "hours"} ago`;
  }

  const count = Math.max(1, Math.floor(diff / day));
  return `${count} ${count === 1 ? "day" : "days"} ago`;
}
