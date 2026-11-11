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
  createdDetails?: {
    aliases: string | null
    category: Category
    food_type: FoodType
  }
}
