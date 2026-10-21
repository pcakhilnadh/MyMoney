import { useEffect, useRef } from 'react'
import { GOOGLE_CLIENT_ID, useAuth } from './AuthContext'

const SRC = 'https://accounts.google.com/gsi/client'

function loadScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google) return resolve()
    const s = document.createElement('script')
    s.src = SRC
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Failed to load Google Sign-In'))
    document.head.appendChild(s)
  })
}

export default function GoogleButton() {
  const ref = useRef<HTMLDivElement>(null)
  const { signIn } = useAuth()

  useEffect(() => {
    const clientId = GOOGLE_CLIENT_ID
    if (!clientId) return
    let cancelled = false
    loadScript()
      .then(() => {
        if (cancelled || !ref.current || !window.google) return
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (r) => signIn(r.credential),
        })
        window.google.accounts.id.renderButton(ref.current, {
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          width: 280,
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [signIn])

  if (!GOOGLE_CLIENT_ID)
    return (
      <p className="text-sm text-destructive">
        Set VITE_GOOGLE_CLIENT_ID in front-end/.env to enable Google sign-in.
      </p>
    )
  return <div ref={ref} />
}
