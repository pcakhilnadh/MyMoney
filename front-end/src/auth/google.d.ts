interface Window {
  google?: {
    accounts: {
      id: {
        initialize: (cfg: {
          client_id: string
          callback: (r: { credential: string }) => void
        }) => void
        renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void
        disableAutoSelect: () => void
      }
    }
  }
}
interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string
  readonly VITE_API_URL?: string
}
