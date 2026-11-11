export function encodeImage(image: Blob): Promise<{ mime_type: string; data: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read the photo.'))
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Could not read the photo.'))
        return
      }
      resolve({ mime_type: image.type, data: reader.result.split(',')[1] })
    }
    reader.readAsDataURL(image)
  })
}
