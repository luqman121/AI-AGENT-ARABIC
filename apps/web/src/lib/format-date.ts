/** Arabic labels with Western digits product-wide (design-system §2.2). */
const PRODUCT_TIME_ZONE = "Asia/Muscat";

const dateTimeFormat = new Intl.DateTimeFormat("ar-u-nu-latn", {
  dateStyle: "medium",
  timeZone: PRODUCT_TIME_ZONE,
  timeStyle: "short",
});

const dateFormat = new Intl.DateTimeFormat("ar-u-nu-latn", {
  dateStyle: "medium",
  timeZone: PRODUCT_TIME_ZONE,
});

export function formatDateTimeLabel(date: Date): string {
  return dateTimeFormat.format(date);
}

export function formatDateLabel(date: Date): string {
  return dateFormat.format(date);
}
