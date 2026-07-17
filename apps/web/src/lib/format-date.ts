/** Arabic labels with Western digits product-wide (design-system §2.2). */
const dateTimeFormat = new Intl.DateTimeFormat("ar-u-nu-latn", {
  dateStyle: "medium",
  timeStyle: "short",
});

const dateFormat = new Intl.DateTimeFormat("ar-u-nu-latn", {
  dateStyle: "medium",
});

export function formatDateTimeLabel(date: Date): string {
  return dateTimeFormat.format(date);
}

export function formatDateLabel(date: Date): string {
  return dateFormat.format(date);
}
