export type Unit = 'g' | 'kg' | 'ml' | 'litre' | 'tsp' | 'tbsp' | 'cup' | 'count'
export interface Portion {
  food: { id: string; name: string }
  amount: string
  unit: Unit
  baseAmount: number | null
}

export const units: Record<
  Unit,
  {
    label: string
    shortLabel: string
    kind: 'mass' | 'volume' | 'count'
    factor: number
    step: number
  }
> = {
  g: { label: 'Grams (g)', shortLabel: 'g', kind: 'mass', factor: 1, step: 50 },
  kg: { label: 'Kilograms (kg)', shortLabel: 'kg', kind: 'mass', factor: 1000, step: 0.5 },
  ml: { label: 'Millilitres (ml)', shortLabel: 'ml', kind: 'volume', factor: 1, step: 50 },
  litre: { label: 'Litres (L)', shortLabel: 'L', kind: 'volume', factor: 1000, step: 0.5 },
  tsp: { label: 'Teaspoon (5 ml)', shortLabel: 'tsp', kind: 'volume', factor: 5, step: 0.5 },
  tbsp: { label: 'Tablespoon (15 ml)', shortLabel: 'tbsp', kind: 'volume', factor: 15, step: 0.5 },
  cup: { label: 'Cup (250 ml)', shortLabel: 'cup', kind: 'volume', factor: 250, step: 0.5 },
  count: { label: 'Count', shortLabel: '', kind: 'count', factor: 1, step: 0.5 },
}
