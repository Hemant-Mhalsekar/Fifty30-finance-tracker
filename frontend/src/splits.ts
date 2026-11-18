// The budget splits a user can choose (the backend accepts only these) and helpers around them.
import type { Cycle } from './api'

export type SplitPreset = 'BALANCED' | 'HIGH_RENT' | 'SAVER' | 'LOW_COST'

export type SplitOption = {
  id: SplitPreset
  name: string
  description: string
  needs: number
  wants: number
  savings: number
}

export const SPLITS: SplitOption[] = [
  { id: 'BALANCED', name: 'Balanced', description: 'The classic 50/30/20 rule', needs: 50, wants: 30, savings: 20 },
  {
    id: 'HIGH_RENT',
    name: 'High rent',
    description: 'More for rent and EMIs in a costly city',
    needs: 60,
    wants: 20,
    savings: 20,
  },
  { id: 'SAVER', name: 'Saver', description: 'Less on wants, more saved', needs: 50, wants: 20, savings: 30 },
  {
    id: 'LOW_COST',
    name: 'Low cost',
    description: 'Low fixed costs, like living with family',
    needs: 40,
    wants: 30,
    savings: 30,
  },
]

/** "60/20/20" */
export function splitLabel(s: { needs: number; wants: number; savings: number }): string {
  return `${s.needs}/${s.wants}/${s.savings}`
}

/** The preset a cycle uses, or null if its percentages match none (older data). */
export function presetOf(cycle: Pick<Cycle, 'needsPct' | 'wantsPct' | 'savingsPct'>): SplitOption | null {
  return (
    SPLITS.find((s) => s.needs === cycle.needsPct && s.wants === cycle.wantsPct && s.savings === cycle.savingsPct) ??
    null
  )
}

/** Salary + bonus: what a cycle's budget is split from. */
export function incomeOf(cycle: Pick<Cycle, 'salaryPaise' | 'bonusPaise'>): number {
  return cycle.salaryPaise + (cycle.bonusPaise ?? 0)
}
