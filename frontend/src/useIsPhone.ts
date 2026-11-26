import { useEffect, useState } from 'react'

const PHONE = '(max-width: 767px)'

/** True below the tablet breakpoint (the same 768px the CSS uses), following window resizes. */
export function useIsPhone(): boolean {
  const [phone, setPhone] = useState(() => window.matchMedia(PHONE).matches)
  useEffect(() => {
    const query = window.matchMedia(PHONE)
    const update = () => setPhone(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return phone
}
