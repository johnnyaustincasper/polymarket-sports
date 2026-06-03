export type CardExportStatus = 'idle' | 'working' | 'done' | 'error'

export const CARD_IMAGE_MIME = 'image/jpeg'
export const CARD_IMAGE_QUALITY = 0.94
export const CARD_EXPORT_HIDE_SELECTOR = '[data-card-export-hide="true"]'
export const CARD_EXPORT_ROOT_SELECTOR = '[data-card-export-root="true"]'

export function buildCardImageFileName(title: string, now = new Date()) {
  const slug = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
    .replace(/-+$/g, '') || 'card'
  const date = now.toISOString().slice(0, 10)
  return `athlete-intelligence-${slug}-${date}.jpg`
}

export function cardExportStatusLabel(status: CardExportStatus) {
  if (status === 'working') return 'Creating JPEG…'
  if (status === 'done') return 'JPEG ready'
  if (status === 'error') return 'Could not export JPEG'
  return 'Export JPEG'
}

export function canShareFiles(navigatorLike: Pick<Navigator, 'canShare'> | Record<string, unknown>, files: File[]) {
  const candidate = navigatorLike as { canShare?: (data: ShareData) => boolean }
  if (typeof candidate.canShare !== 'function') return false
  try {
    return candidate.canShare({ files })
  } catch {
    return false
  }
}

function copyComputedStyles(source: Element, target: Element) {
  const computed = window.getComputedStyle(source)
  const targetStyle = (target as HTMLElement).style
  for (const property of Array.from(computed)) {
    targetStyle.setProperty(property, computed.getPropertyValue(property), computed.getPropertyPriority(property))
  }
  Array.from(source.children).forEach((sourceChild, index) => {
    const targetChild = target.children[index]
    if (targetChild) copyComputedStyles(sourceChild, targetChild)
  })
}

function prepareExportClone(element: HTMLElement, width: number) {
  const clone = element.cloneNode(true) as HTMLElement
  copyComputedStyles(element, clone)
  clone.querySelectorAll(CARD_EXPORT_HIDE_SELECTOR).forEach(node => {
    const el = node as HTMLElement
    el.style.display = 'none'
    el.setAttribute('aria-hidden', 'true')
  })
  clone.style.width = `${width}px`
  clone.style.minWidth = `${width}px`
  clone.style.maxWidth = `${width}px`
  clone.style.boxSizing = 'border-box'
  clone.style.transform = 'none'
  clone.style.animation = 'none'
  return clone
}

function svgDataUrlForElement(element: HTMLElement, width: number, height: number) {
  const clone = prepareExportClone(element, width)
  const wrapper = document.createElement('div')
  wrapper.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')
  wrapper.style.width = `${width}px`
  wrapper.style.minHeight = `${height}px`
  wrapper.style.background = '#020501'
  wrapper.style.color = '#f4ffe8'
  wrapper.style.fontFamily = window.getComputedStyle(element).fontFamily || 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
  wrapper.appendChild(clone)
  const xhtml = new XMLSerializer().serializeToString(wrapper)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject width="100%" height="100%">${xhtml}</foreignObject></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function imageFromDataUrl(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Card image render failed'))
    image.src = url
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error('Card JPEG export failed'))
    }, type, quality)
  })
}

export async function renderCardElementToJpegFile(element: HTMLElement, fileName: string) {
  const rect = element.getBoundingClientRect()
  const width = Math.max(1, Math.ceil(element.scrollWidth || rect.width))
  const height = Math.max(1, Math.ceil(element.scrollHeight || rect.height))
  const scale = Math.min(3, Math.max(2, window.devicePixelRatio || 2))
  const dataUrl = svgDataUrlForElement(element, width, height)
  const image = await imageFromDataUrl(dataUrl)
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(width * scale)
  canvas.height = Math.ceil(height * scale)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Card JPEG export unavailable')
  context.scale(scale, scale)
  context.fillStyle = '#020501'
  context.fillRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)
  const blob = await canvasToBlob(canvas, CARD_IMAGE_MIME, CARD_IMAGE_QUALITY)
  return new File([blob], fileName, { type: CARD_IMAGE_MIME, lastModified: Date.now() })
}

export function downloadFile(file: File) {
  const url = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = file.name
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function buildImageOnlyShareData(title: string, file: File): ShareData {
  return { title, files: [file] }
}

export async function shareOrDownloadCardImage(options: { element: HTMLElement; title: string }) {
  const file = await renderCardElementToJpegFile(options.element, buildCardImageFileName(options.title))
  if (navigator.share && canShareFiles(navigator, [file])) {
    await navigator.share(buildImageOnlyShareData(options.title, file))
    return 'shared'
  }
  downloadFile(file)
  return 'downloaded'
}
