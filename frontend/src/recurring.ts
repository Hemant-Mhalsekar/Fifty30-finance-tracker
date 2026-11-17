/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st, 22nd, 31st. */
export function ordinal(day: number): string {
  const lastTwo = day % 100
  if (lastTwo >= 11 && lastTwo <= 13) return `${day}th`
  switch (day % 10) {
    case 1:
      return `${day}st`
    case 2:
      return `${day}nd`
    case 3:
      return `${day}rd`
    default:
      return `${day}th`
  }
}

/** "Every month on the 5th"; days that some months lack say where they fall instead. */
export function scheduleLabel(dayOfMonth: number): string {
  const base = `Every month on the ${ordinal(dayOfMonth)}`
  return dayOfMonth >= 29 ? `${base} (or the last day of shorter months)` : base
}
