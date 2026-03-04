'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { ReactReader } from 'react-reader'
import type { Rendition } from 'epubjs'

interface EpubReaderProps {
  url: string
  bookId: string
  initialCfi?: string | null
  onLocationChange?: (cfi: string, progress: number) => void
}

export function EpubReader({
  url,
  bookId,
  initialCfi,
  onLocationChange,
}: EpubReaderProps) {
  const [location, setLocation] = useState<string | number>(initialCfi || 0)
  const renditionRef = useRef<Rendition | null>(null)

  const locationChanged = useCallback(
    (epubcfi: string) => {
      setLocation(epubcfi)

      if (renditionRef.current) {
        const currentLocation = renditionRef.current.currentLocation() as any
        if (currentLocation?.start?.percentage !== undefined) {
          onLocationChange?.(epubcfi, currentLocation.start.percentage)
        }
      }
    },
    [onLocationChange]
  )

  // Apply dark theme to the EPUB content
  const applyTheme = useCallback((rendition: Rendition) => {
    renditionRef.current = rendition

    rendition.themes.override('color', '#e4e4e7') // zinc-200
    rendition.themes.override('background', '#0a0a0a')

    rendition.themes.register('dark', {
      'body': {
        'color': '#e4e4e7 !important',
        'background': '#0a0a0a !important',
        'font-family': 'Inter, system-ui, -apple-system, sans-serif !important',
        'line-height': '1.8 !important',
        'padding': '0 20px !important',
      },
      'p': {
        'color': '#d4d4d8 !important',
        'margin-bottom': '1em !important',
      },
      'h1, h2, h3, h4, h5, h6': {
        'color': '#fafafa !important',
      },
      'a': {
        'color': '#a78bfa !important',
      },
      'img': {
        'max-width': '100% !important',
        'height': 'auto !important',
      },
    })

    rendition.themes.select('dark')
  }, [])

  return (
    <div className="h-full w-full" style={{ background: '#0a0a0a' }}>
      <ReactReader
        url={url}
        location={location}
        locationChanged={locationChanged}
        getRendition={applyTheme}
        epubOptions={{
          allowScriptedContent: false,
        }}
        readerStyles={{
          ...({
            container: {
              overflow: 'hidden',
              height: '100%',
            },
            readerArea: {
              backgroundColor: '#0a0a0a',
              transition: 'none',
            },
            titleArea: {
              display: 'none',
            },
            tocArea: {
              background: '#141414',
              color: '#e4e4e7',
            },
            tocAreaButton: {
              color: '#a1a1aa',
            },
            tocButton: {
              color: '#e4e4e7',
            },
            tocButtonExpanded: {
              background: '#27272a',
            },
            tocButtonBar: {
              background: '#a1a1aa',
            },
            tocButtonBarTop: {
              background: '#a1a1aa',
            },
            arrow: {
              color: '#a1a1aa',
              fontSize: '40px',
            },
            arrowHover: {
              color: '#a78bfa',
            },
            prev: {
              background: 'transparent',
            },
            next: {
              background: 'transparent',
            },
          } as any),
        }}
      />
    </div>
  )
}
