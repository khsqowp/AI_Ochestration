import { useEffect } from 'react'

type SeoMeta = {
  title?: string
  description?: string
  canonical?: string
  ogUrl?: string
  structuredData?: Record<string, unknown>
}

export function useSeoMeta({ title, description, canonical, ogUrl, structuredData }: SeoMeta) {
  const structuredJson = structuredData ? JSON.stringify(structuredData) : undefined

  useEffect(() => {
    if (!title) return

    const previousTitle = document.title
    document.title = title

    const descriptionText = description ?? title
    const canonicalHref = canonical ?? window.location.href
    const ogUrlValue = ogUrl ?? canonicalHref
    const setMeta = (selector: string, attribute: 'name' | 'property', key: string, value: string) => {
      let element = document.querySelector<HTMLMetaElement>(selector)
      const created = !element
      if (!element) {
        element = document.createElement('meta')
        element.setAttribute(attribute, key)
        document.head.appendChild(element)
      }
      const previous = element.content
      element.content = value
      return () => { if (created) element!.remove(); else element!.content = previous }
    }
    const setCanonical = () => {
      let element = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
      const created = !element
      if (!element) {
        element = document.createElement('link')
        element.rel = 'canonical'
        document.head.appendChild(element)
      }
      const previous = element.href
      element.href = canonicalHref
      return () => { if (created) element!.remove(); else element!.href = previous }
    }
    const restoreDescription = setMeta('meta[name="description"]', 'name', 'description', descriptionText)
    const restoreOgTitle = setMeta('meta[property="og:title"]', 'property', 'og:title', title)
    const restoreOgDescription = setMeta('meta[property="og:description"]', 'property', 'og:description', descriptionText)
    const restoreOgUrl = setMeta('meta[property="og:url"]', 'property', 'og:url', ogUrlValue)
    const restoreCanonical = setCanonical()

    let jsonLd: HTMLScriptElement | undefined
    if (structuredJson) {
      jsonLd = document.createElement('script')
      jsonLd.type = 'application/ld+json'
      jsonLd.textContent = structuredJson
      document.head.appendChild(jsonLd)
    }

    return () => {
      document.title = previousTitle
      restoreDescription()
      restoreOgTitle()
      restoreOgDescription()
      restoreOgUrl()
      restoreCanonical()
      jsonLd?.remove()
    }
  }, [title, description, canonical, ogUrl, structuredJson])
}
