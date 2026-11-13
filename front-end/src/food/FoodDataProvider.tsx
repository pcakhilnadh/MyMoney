import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { api } from '@/auth/api'
import { useAuth } from '@/auth/AuthContext'
import { db } from '@/db/db'
import { requestSync } from '@/sync/bus'
import type { MealLog } from '@/db/types'

interface FoodData {
  entries: MealLog[]
  goal: number | null
}

interface FoodDataContext {
  data: FoodData | null
  error: string
  retry: () => void
  recordGoal: (goal: number) => Promise<void>
}

const FoodContext = createContext<FoodDataContext | null>(null)
const REFRESH_TIMEOUT_MS = 10000

export function FoodDataProvider({ children }: { children: ReactNode }) {
  const { user, token } = useAuth()
  return (
    <FoodSession key={user?.sub ?? 'signed-out'} token={token}>
      {children}
    </FoodSession>
  )
}

function FoodSession({ children, token }: { children: ReactNode; token: string | null }) {
  const [error, setError] = useState('')
  const request = useRef<AbortController | null>(null)
  const requestId = useRef(0)
  const entries = useLiveQuery(
    async () =>
      (await db.meal_logs.where('status').notEqual('deleted').toArray()).sort(
        (a, b) =>
          a.entry_date.localeCompare(b.entry_date) || a.created_at.localeCompare(b.created_at),
      ),
    [],
  )
  const goal = useLiveQuery(
    async () => (await db.food_settings.get('goal')) ?? { key: 'goal', calories: null },
    [],
  )

  const refreshGoal = useCallback(async () => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    const id = ++requestId.current
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort()
          reject(new Error('Food goal refresh timed out'))
        }, REFRESH_TIMEOUT_MS)
      })
      const result = await Promise.race([
        api<{ calories: number | null }>('/food/goal', token ?? '', {
          signal: controller.signal,
        }),
        timeout,
      ])
      if (requestId.current !== id) return
      await db.food_settings.put({ key: 'goal', calories: result.calories })
      setError('')
    } catch (reason) {
      if (requestId.current !== id) return
      console.error('Unable to refresh the food goal', reason)
      setError('Unable to refresh your food diary. Check your connection and try again.')
    } finally {
      clearTimeout(timer)
      if (request.current === controller) request.current = null
    }
  }, [token])

  useEffect(() => {
    void refreshGoal()
    requestSync()
    const refresh = () => {
      void refreshGoal()
      requestSync()
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    window.addEventListener('online', refresh)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      requestId.current += 1
      request.current?.abort()
      window.removeEventListener('online', refresh)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [refreshGoal])

  const retry = useCallback(() => {
    requestSync()
    void refreshGoal()
  }, [refreshGoal])

  const recordGoal = useCallback(async (calories: number) => {
    requestId.current += 1
    request.current?.abort()
    await db.food_settings.put({ key: 'goal', calories })
    setError('')
  }, [])

  const data =
    entries === undefined || goal === undefined ? null : { entries, goal: goal.calories }

  return (
    <FoodContext.Provider value={{ data, error, retry, recordGoal }}>
      {children}
    </FoodContext.Provider>
  )
}

export function useFoodData(): FoodDataContext {
  const value = useContext(FoodContext)
  if (!value) throw new Error('useFoodData must be used within FoodDataProvider')
  return value
}
