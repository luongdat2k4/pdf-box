import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { expectExternal } from '../ads'

export const isNative = () => Capacitor.isNativePlatform()

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Save to the device: Documents/PDFToolbox on native, a download in the browser. */
export async function saveToDevice(name: string, blob: Blob): Promise<string> {
  if (!isNative()) {
    downloadBlob(name, blob)
    return name
  }
  const res = await Filesystem.writeFile({
    path: `PDFToolbox/${name}`,
    data: await blobToBase64(blob),
    directory: Directory.Documents,
    recursive: true,
  })
  return res.uri
}

export async function shareFile(name: string, blob: Blob): Promise<void> {
  if (isNative()) {
    const res = await Filesystem.writeFile({
      path: `share/${name}`,
      data: await blobToBase64(blob),
      directory: Directory.Cache,
      recursive: true,
    })
    expectExternal() // the share sheet leaves the app; coming back shows no app-open ad
    await Share.share({ title: name, url: res.uri })
    return
  }
  const file = new File([blob], name, { type: blob.type })
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: name })
  } else {
    downloadBlob(name, blob)
  }
}
