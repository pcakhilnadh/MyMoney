import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from '@/auth/AuthContext'
import { api } from '@/auth/api'
import { isCurrencyCode, type CurrencyCode } from '@/lib/currency'

const STORAGE_KEY = 'mymoney.preferred-currency.'

interface CurrencyPreference {
  preferred_currency: CurrencyCode
}

interface CurrencyContextValue {
  currency: CurrencyCode
  loading: boolean
  loadError: string | null
  saveCurrency: (currency: CurrencyCode) => Promise<void>
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null)

function cachedCurrency(sub: string): CurrencyCode | null {
  try {
    const value = localStorage.getItem(`${STORAGE_KEY}${sub}`)
    return isCurrencyCode(value) ? value : null
  } catch (error) {
    console.error('Unable to read the cached currency preference', error)
    return null
  }
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { user, token } = useAuth()
  const userSub = user?.sub ?? null
  return (
    <CurrencySession key={userSub ?? 'signed-out'} userSub={userSub} token={token}>
      {children}
    </CurrencySession>
  )
}

function CurrencySession({
  children,
  userSub,
  token,
}: {
  children: ReactNode
  userSub: string | null
  token: string | null
}) {
  const [currency, setCurrency] = useState<CurrencyCode>(() =>
    userSub ? (cachedCurrency(userSub) ?? 'INR') : 'INR',
  )
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const loading = Boolean(userSub && token && !loaded)

  useEffect(() => {
    if (!userSub || !token) return

    let active = true
    void api<CurrencyPreference>('/money/preferences', token)
      .then((preference) => {
        if (!isCurrencyCode(preference.preferred_currency)) {
          throw new Error('The server returned an unsupported currency preference.')
        }
        if (!active) return
        setCurrency(preference.preferred_currency)
        cacheCurrencyPreference(userSub, preference.preferred_currency)
        setLoadError(null)
      })
      .catch((error: unknown) => {
        console.error('Unable to load the saved currency preference', error)
        if (active) {
          setLoadError('Unable to refresh the saved currency. Showing the locally saved setting.')
        }
      })
      .finally(() => {
        if (active) setLoaded(true)
      })

    return () => {
      active = false
    }
  }, [userSub, token])

  const saveCurrency = useCallback(
    async (nextCurrency: CurrencyCode) => {
      if (!userSub || !token) {
        throw new Error('Sign in online to update your currency preference.')
      }
      if (!isCurrencyCode(nextCurrency)) {
        throw new Error('Choose a supported currency.')
      }

      const preference = await api<CurrencyPreference>('/money/preferences', token, {
        method: 'PUT',
        body: JSON.stringify({ preferred_currency: nextCurrency }),
      })
      if (!isCurrencyCode(preference.preferred_currency)) {
        throw new Error('The server returned an unsupported currency preference.')
      }

      setCurrency(preference.preferred_currency)
      cacheCurrencyPreference(userSub, preference.preferred_currency)
      setLoadError(null)
    },
    [userSub, token],
  )

  const value = useMemo(
    () => ({ currency, loading, loadError, saveCurrency }),
    [currency, loading, loadError, saveCurrency],
  )

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
}

function cacheCurrencyPreference(sub: string, currency: CurrencyCode) {
  try {
    localStorage.setItem(`${STORAGE_KEY}${sub}`, currency)
  } catch (error) {
    console.error('Unable to cache the currency preference', error)
  }
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCurrency() {
  const value = useContext(CurrencyContext)
  if (!value) throw new Error('useCurrency outside CurrencyProvider')
  return value
}
