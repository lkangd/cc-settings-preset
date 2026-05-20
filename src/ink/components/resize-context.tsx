import React, { createContext, useContext } from 'react'

const InkResizeContext = createContext(0)

type InkResizeProviderProps = {
  value: number
  children: React.ReactNode
}

export function InkResizeProvider({ value, children }: InkResizeProviderProps) {
  return <InkResizeContext.Provider value={value}>{children}</InkResizeContext.Provider>
}

export function useInkResizeVersion(): number {
  return useContext(InkResizeContext)
}
