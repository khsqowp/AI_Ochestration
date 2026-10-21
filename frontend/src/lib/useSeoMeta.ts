import { useEffect } from 'react'

type SeoMeta = {
  title?: string
  description?: string
  structuredData?: Record<string, unknown>
}

export function useSeoMeta({ title, description, structuredData }: SeoMeta) {
  const structuredJson = structuredData ? JSON.stringify(structuredData) : undefined

  useEffect(() => {
    if (!title) return

    const previousTitle = document.title
    document.title = title

    let descriptionMeta = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    const createdDescription = !descriptionMeta
    if (!descriptionMeta) {
      descriptionMeta = document.createElement('meta')
      descriptionMeta.name = 'description'
      document.head.appendChild(descriptionMeta)
    }
    const previousDescription = descriptionMeta.content
    if (description) descriptionMeta.content = description

    let jsonLd: HTMLScriptElement | undefined
    if (structuredJson) {
      jsonLd = document.createElement('script')
      jsonLd.type = 'application/ld+json'
      jsonLd.textContent = structuredJson
      document.head.appendChild(jsonLd)
    }

    return () => {
      document.title = previousTitle
      if (createdDescription) descriptionMeta.remove()
      else descriptionMeta.content = previousDescription
      jsonLd?.remove()
    }
  }, [title, description, structuredJson])
}
