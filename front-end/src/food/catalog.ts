export const categories = [
  'base_food',
  'dairy',
  'egg',
  'fish',
  'fruit',
  'grain',
  'ingredient',
  'legume',
  'meat',
  'nut_seed',
  'seafood',
  'vegetable',
] as const

export type Category = (typeof categories)[number]
export type FoodType = 'raw' | 'processed'

export interface Match {
  id: string
  name: string
  score: number
  /** Per-100 g values, captured in the diary when the meal is saved. */
  calories_100g?: number | null
  protein_100g?: number | null
  carbs_100g?: number | null
  fat_100g?: number | null
  createdDetails?: {
    aliases: string | null
    category: Category
    food_type: FoodType
  }
}
