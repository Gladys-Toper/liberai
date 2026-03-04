import JSZip from 'jszip'

export interface ParsedBook {
  title: string
  creator: string | null
  description: string | null
  language: string
  publisher: string | null
  coverImage: Buffer | null
  coverMimeType: string | null
  chapters: ParsedChapter[]
}

export interface ParsedChapter {
  title: string
  content: string
  chapterNumber: number
  wordCount: number
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(parseInt(code)))
    .replace(/\s+/g, ' ')
    .trim()
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

/**
 * Extract text content between XML tags (simple regex-based parser for server-side).
 */
function getTagContent(xml: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')
  const match = xml.match(regex)
  return match ? match[1].trim() : null
}

function getAttr(xml: string, tag: string, attr: string): string | null {
  const tagRegex = new RegExp(`<${tag}[^>]*${attr}="([^"]*)"[^>]*>`, 'i')
  const match = xml.match(tagRegex)
  return match ? match[1] : null
}

/**
 * Parse an EPUB file buffer on the server and extract metadata + chapters.
 * EPUB is a ZIP containing XHTML content + OPF metadata.
 */
export async function parseEpub(buffer: ArrayBuffer): Promise<ParsedBook> {
  const zip = await JSZip.loadAsync(buffer)

  // 1. Find the OPF file path from container.xml
  const containerXml = await zip.file('META-INF/container.xml')?.async('text')
  if (!containerXml) {
    throw new Error('Invalid EPUB: missing META-INF/container.xml')
  }

  const opfPath = getAttr(containerXml, 'rootfile', 'full-path')
  if (!opfPath) {
    throw new Error('Invalid EPUB: cannot find OPF path in container.xml')
  }

  const opfContent = await zip.file(opfPath)?.async('text')
  if (!opfContent) {
    throw new Error(`Invalid EPUB: cannot read OPF file at ${opfPath}`)
  }

  // Base directory of the OPF file (for resolving relative paths)
  const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : ''

  // 2. Parse metadata from OPF
  const title = getTagContent(opfContent, 'dc:title') || getTagContent(opfContent, 'title') || 'Untitled'
  const creator = getTagContent(opfContent, 'dc:creator') || getTagContent(opfContent, 'creator') || null
  const description = getTagContent(opfContent, 'dc:description') || getTagContent(opfContent, 'description') || null
  const language = getTagContent(opfContent, 'dc:language') || getTagContent(opfContent, 'language') || 'en'
  const publisher = getTagContent(opfContent, 'dc:publisher') || getTagContent(opfContent, 'publisher') || null

  // 3. Parse manifest — map item ids to hrefs and media-types
  const manifest = new Map<string, { href: string; mediaType: string }>()
  const manifestRegex = /<item\s+[^>]*id="([^"]*)"[^>]*href="([^"]*)"[^>]*media-type="([^"]*)"[^>]*\/?>/gi
  // Also handle attributes in different order
  const manifestRegex2 = /<item\s+[^>]*href="([^"]*)"[^>]*id="([^"]*)"[^>]*media-type="([^"]*)"[^>]*\/?>/gi
  let match

  while ((match = manifestRegex.exec(opfContent)) !== null) {
    manifest.set(match[1], { href: match[2], mediaType: match[3] })
  }
  while ((match = manifestRegex2.exec(opfContent)) !== null) {
    manifest.set(match[2], { href: match[1], mediaType: match[3] })
  }

  // Fallback: more flexible item parsing
  if (manifest.size === 0) {
    const itemRegex = /<item\s+([^>]*)\/?\s*>/gi
    while ((match = itemRegex.exec(opfContent)) !== null) {
      const attrs = match[1]
      const id = attrs.match(/id="([^"]*)"/)?.[1]
      const href = attrs.match(/href="([^"]*)"/)?.[1]
      const mt = attrs.match(/media-type="([^"]*)"/)?.[1]
      if (id && href && mt) {
        manifest.set(id, { href, mediaType: mt })
      }
    }
  }

  // 4. Parse spine — ordered list of content item IDs
  const spineRegex = /<itemref\s+[^>]*idref="([^"]*)"[^>]*\/?>/gi
  const spineIds: string[] = []
  while ((match = spineRegex.exec(opfContent)) !== null) {
    spineIds.push(match[1])
  }

  // 5. Parse NCX/navigation for chapter titles
  const navMap = new Map<string, string>()

  // Try to find NCX file
  const ncxItem = Array.from(manifest.values()).find(
    (item) => item.mediaType === 'application/x-dtbncx+xml'
  )
  if (ncxItem) {
    const ncxPath = opfDir + ncxItem.href
    const ncxContent = await zip.file(ncxPath)?.async('text')
    if (ncxContent) {
      const navPointRegex = /<navPoint[^>]*>[\s\S]*?<text>\s*([\s\S]*?)\s*<\/text>[\s\S]*?<content\s+src="([^"]*)"[^>]*\/?>/gi
      while ((match = navPointRegex.exec(ncxContent)) !== null) {
        const label = stripHtml(match[1])
        const src = match[2]
        navMap.set(src, label)
        // Also store without fragment
        if (src.includes('#')) {
          navMap.set(src.split('#')[0], label)
        }
      }
    }
  }

  // Also try EPUB3 nav document
  const navItem = Array.from(manifest.entries()).find(
    ([_id, item]) => item.mediaType === 'application/xhtml+xml' && opfContent.includes(`properties="nav"`)
  )
  if (navItem) {
    const navPath = opfDir + navItem[1].href
    const navContent = await zip.file(navPath)?.async('text')
    if (navContent) {
      const linkRegex = /<a\s+[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi
      while ((match = linkRegex.exec(navContent)) !== null) {
        const href = match[1]
        const label = stripHtml(match[2])
        if (label) {
          navMap.set(href, label)
          if (href.includes('#')) {
            navMap.set(href.split('#')[0], label)
          }
        }
      }
    }
  }

  // 6. Extract chapters from spine
  const chapters: ParsedChapter[] = []
  let chapterNumber = 1

  for (const itemId of spineIds) {
    const item = manifest.get(itemId)
    if (!item) continue
    if (!item.mediaType.includes('html') && !item.mediaType.includes('xml')) continue

    const filePath = opfDir + item.href
    const fileContent = await zip.file(filePath)?.async('text')
    if (!fileContent) continue

    const text = stripHtml(fileContent)
    if (!text || text.length < 50) continue // Skip trivial sections

    const wordCount = countWords(text)

    // Try to find chapter title from nav
    const href = item.href
    const chapterTitle =
      navMap.get(href) ||
      navMap.get(href.split('#')[0]) ||
      // Try extracting from first <h1>, <h2>, or <title> tag in the content
      getTagContent(fileContent, 'h1') ||
      getTagContent(fileContent, 'h2') ||
      getTagContent(fileContent, 'title') ||
      `Chapter ${chapterNumber}`

    chapters.push({
      title: stripHtml(chapterTitle).slice(0, 200),
      content: text,
      chapterNumber,
      wordCount,
    })
    chapterNumber++
  }

  // 7. Extract cover image
  let coverImage: Buffer | null = null
  let coverMimeType: string | null = null

  // Look for cover in metadata
  const coverMetaRegex = /<meta\s+[^>]*name="cover"[^>]*content="([^"]*)"[^>]*\/?>/i
  const coverMeta = opfContent.match(coverMetaRegex)
  if (coverMeta) {
    const coverItem = manifest.get(coverMeta[1])
    if (coverItem && coverItem.mediaType.startsWith('image/')) {
      const coverPath = opfDir + coverItem.href
      const coverData = await zip.file(coverPath)?.async('nodebuffer')
      if (coverData) {
        coverImage = coverData
        coverMimeType = coverItem.mediaType
      }
    }
  }

  // Fallback: look for item with "cover" in id or properties
  if (!coverImage) {
    const coverEntry = Array.from(manifest.entries()).find(
      ([id, item]) =>
        (id.toLowerCase().includes('cover') && item.mediaType.startsWith('image/'))
    )
    if (coverEntry) {
      const coverPath = opfDir + coverEntry[1].href
      const coverData = await zip.file(coverPath)?.async('nodebuffer')
      if (coverData) {
        coverImage = coverData
        coverMimeType = coverEntry[1].mediaType
      }
    }
  }

  return {
    title,
    creator,
    description: description ? stripHtml(description) : null,
    language,
    publisher,
    coverImage,
    coverMimeType,
    chapters,
  }
}
