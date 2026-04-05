'use client'
import { useState, useEffect } from 'react'

export function useResponsive() {
  const [screen, setScreen] = useState('desktop')

  useEffect(() => {
    const check = () => {
      const w = window.innerWidth
      setScreen(w < 640 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop')
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  return {
    screen,
    isMobile: screen === 'mobile',
    isTablet: screen === 'tablet',
    isDesktop: screen === 'desktop',
    isMobileOrTablet: screen !== 'desktop',
  }
}
