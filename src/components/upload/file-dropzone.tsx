'use client'

import { useState, useCallback, useRef } from 'react'
import { Upload, FileText, X, Loader2, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface FileDropzoneProps {
  onFileSelect: (file: File) => void
  accept?: string
  maxSizeMB?: number
  disabled?: boolean
  uploading?: boolean
  progress?: number
  success?: boolean
}

export function FileDropzone({
  onFileSelect,
  accept = '.epub',
  maxSizeMB = 100,
  disabled = false,
  uploading = false,
  progress,
  success = false,
}: FileDropzoneProps) {
  const [dragOver, setDragOver] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const validateFile = useCallback(
    (file: File): boolean => {
      setError(null)

      const validExtensions = accept.split(',').map((ext) => ext.trim())
      const fileExt = '.' + file.name.split('.').pop()?.toLowerCase()
      if (!validExtensions.includes(fileExt)) {
        setError(`Only ${accept} files are supported`)
        return false
      }

      if (file.size > maxSizeMB * 1024 * 1024) {
        setError(`File must be under ${maxSizeMB}MB`)
        return false
      }

      return true
    },
    [accept, maxSizeMB]
  )

  const handleFile = useCallback(
    (file: File) => {
      if (validateFile(file)) {
        setSelectedFile(file)
        onFileSelect(file)
      }
    },
    [validateFile, onFileSelect]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      if (disabled || uploading) return

      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [disabled, uploading, handleFile]
  )

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      if (!disabled && !uploading) setDragOver(true)
    },
    [disabled, uploading]
  )

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }, [])

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleFile(file)
    },
    [handleFile]
  )

  const clearFile = useCallback(() => {
    setSelectedFile(null)
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
  }, [])

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="w-full">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !disabled && !uploading && inputRef.current?.click()}
        className={cn(
          'relative flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-all',
          dragOver
            ? 'border-violet-500 bg-violet-500/5'
            : 'border-[#27272a] bg-[#0a0a0a] hover:border-zinc-600',
          (disabled || uploading) && 'cursor-not-allowed opacity-60',
          success && 'border-emerald-500/50 bg-emerald-500/5'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleInputChange}
          className="hidden"
          disabled={disabled || uploading}
        />

        {success ? (
          <>
            <CheckCircle2 className="mb-3 h-10 w-10 text-emerald-400" />
            <p className="text-sm font-medium text-emerald-300">Upload complete</p>
          </>
        ) : uploading ? (
          <>
            <Loader2 className="mb-3 h-10 w-10 animate-spin text-violet-400" />
            <p className="text-sm font-medium text-zinc-300">
              {progress !== undefined
                ? `Uploading... ${Math.round(progress)}%`
                : 'Processing your book...'}
            </p>
            {selectedFile && (
              <p className="mt-1 text-xs text-zinc-500">{selectedFile.name}</p>
            )}
          </>
        ) : selectedFile ? (
          <>
            <FileText className="mb-3 h-10 w-10 text-violet-400" />
            <p className="text-sm font-medium text-zinc-300">{selectedFile.name}</p>
            <p className="mt-1 text-xs text-zinc-500">
              {formatFileSize(selectedFile.size)}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                clearFile()
              }}
              className="mt-3 text-zinc-500 hover:text-zinc-300"
            >
              <X className="mr-1 h-4 w-4" />
              Remove
            </Button>
          </>
        ) : (
          <>
            <Upload className="mb-3 h-10 w-10 text-zinc-600" />
            <p className="text-sm font-medium text-zinc-300">
              Drop your EPUB file here
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              or click to browse (max {maxSizeMB}MB)
            </p>
          </>
        )}
      </div>

      {error && (
        <p className="mt-2 text-sm text-red-400">{error}</p>
      )}
    </div>
  )
}
