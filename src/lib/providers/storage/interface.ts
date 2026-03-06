export interface IStorageProvider {
  /** Upload a file, return its URL */
  upload(
    bucket: string,
    path: string,
    data: Buffer | Blob | ArrayBuffer,
    options?: { contentType?: string; upsert?: boolean },
  ): Promise<{ url: string }>

  /** Get a time-limited signed URL */
  getSignedUrl(bucket: string, path: string, expiresIn: number): Promise<string>

  /** Get a permanent public URL */
  getPublicUrl(bucket: string, path: string): string

  /** Delete a file */
  delete(bucket: string, path: string): Promise<void>

  /** Get file size in bytes */
  getFileSize(bucket: string, path: string): Promise<number>
}
