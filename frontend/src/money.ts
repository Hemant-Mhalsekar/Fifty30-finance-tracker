// All amounts are integer paise (1 rupee = 100 paise), matching the API.
// Conversion is done on the text, never through floating point, so "0.1" is exactly 10 paise.

const RUPEES_PATTERN = /^(\d+)(?:\.(\d{1,2}))?$/

/**
 * Parses what the user typed in rupees ("1,23,456.7", "500", "₹ 99.99") into paise.
 * Returns null for anything that is not a non-negative amount with at most 2 decimals.
 */
export function parseRupeesToPaise(text: string): number | null {
  const cleaned = text.replace(/[\s,₹]/g, '')
  const match = RUPEES_PATTERN.exec(cleaned)
  if (!match) return null

  const rupees = match[1].replace(/^0+(?=\d)/, '')
  const fraction = (match[2] ?? '').padEnd(2, '0')
  // Above this the number is no longer exact; every API limit is far below it.
  if (rupees.length > 13) return null

  return Number(rupees + fraction)
}

const RUPEE_GROUPING = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

/** Formats paise as Indian rupees with 2 decimals: 12345678 -> "₹1,23,456.78", -500 -> "-₹5.00". */
export function formatPaise(paise: number): string {
  const sign = paise < 0 ? '-' : ''
  const abs = Math.abs(paise)
  const rupees = Math.trunc(abs / 100)
  const fraction = String(abs % 100).padStart(2, '0')
  return `${sign}₹${RUPEE_GROUPING.format(rupees)}.${fraction}`
}

/**
 * A split exactly as the backend computes it (50/30/20 unless given): floor for needs and wants,
 * the remainder for savings, so the three always add up to the amount.
 */
export function splitBudget(
  amountPaise: number,
  pct: { needs: number; wants: number } = { needs: 50, wants: 30 },
): { needs: number; wants: number; savings: number } {
  const needs = Math.floor((amountPaise * pct.needs) / 100)
  const wants = Math.floor((amountPaise * pct.wants) / 100)
  return { needs, wants, savings: amountPaise - needs - wants }
}

/** Paise as plain editable text without grouping: 120050 -> "1200.50", 50000 -> "500". */
export function paiseToInput(paise: number): string {
  const rupees = Math.trunc(paise / 100)
  const fraction = paise % 100
  return fraction === 0 ? String(rupees) : `${rupees}.${String(fraction).padStart(2, '0')}`
}

/** Like formatPaise but drops ".00" on whole rupees, for chart labels: 2500000 -> "₹25,000", 133250 -> "₹1,332.50". */
export function formatPaiseShort(paise: number): string {
  const full = formatPaise(paise)
  return paise % 100 === 0 ? full.slice(0, -3) : full
}

/**
 * Short axis labels in Indian units, whole rupees: 2500000 -> "₹25k", 15000000 -> "₹1.5L",
 * 250000000 -> "₹25L", 1000000000 -> "₹1Cr". Below ₹1,000 it is the plain amount.
 */
export function formatPaiseCompact(paise: number): string {
  const sign = paise < 0 ? '−' : ''
  const rupees = Math.abs(paise) / 100
  const unit = (value: number, suffix: string) => {
    const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10
    return `${sign}₹${rounded}${suffix}`
  }
  if (rupees >= 1_00_00_000) return unit(rupees / 1_00_00_000, 'Cr')
  if (rupees >= 1_00_000) return unit(rupees / 1_00_000, 'L')
  if (rupees >= 1_000) return unit(rupees / 1_000, 'k')
  return `${sign}₹${Math.round(rupees)}`
}
