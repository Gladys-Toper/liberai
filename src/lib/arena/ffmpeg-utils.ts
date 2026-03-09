// ═══════════════════════════════════════════════════════════════════════════
// FFmpeg Utilities — Frame Extraction + Video Concatenation
// ═══════════════════════════════════════════════════════════════════════════
//
// Uses ffmpeg-static (bundled binary) + fluent-ffmpeg for:
// 1. Extracting the last frame of a video segment → JPG buffer
// 2. Concatenating multiple MP4 segments into a single video
//
// Both operations use /tmp for intermediate files (Vercel serverless: ~512MB).
// ═══════════════════════════════════════════════════════════════════════════

import { randomUUID } from 'crypto'
import { writeFile, readFile, unlink, writeFile as writeFileAsync } from 'fs/promises'
import { join } from 'path'
import ffmpegStatic from 'ffmpeg-static'
import ffmpeg from 'fluent-ffmpeg'

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic)
}

const TMP_DIR = '/tmp'

/**
 * Extract the last frame from an MP4 buffer as a JPG image.
 * Used to seed the next segment's image2video call.
 */
export async function extractLastFrame(videoBuffer: Buffer): Promise<Buffer> {
  const id = randomUUID().slice(0, 8)
  const inputPath = join(TMP_DIR, `input-${id}.mp4`)
  const outputPath = join(TMP_DIR, `frame-${id}.jpg`)

  try {
    await writeFile(inputPath, videoBuffer)

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions([
          '-sseof', '-0.5',    // Seek to 0.5s before end
          '-frames:v', '1',    // Extract 1 frame
          '-q:v', '2',         // High quality JPG
        ])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(new Error(`FFmpeg frame extraction failed: ${err.message}`)))
        .run()
    })

    const frameBuffer = await readFile(outputPath)
    console.log(`[FFmpeg] Extracted last frame: ${Math.round(frameBuffer.length / 1024)}KB`)
    return frameBuffer
  } finally {
    // Clean up temp files
    await unlink(inputPath).catch(() => {})
    await unlink(outputPath).catch(() => {})
  }
}

/**
 * Concatenate multiple MP4 segment buffers into a single MP4.
 * Uses ffmpeg concat demuxer with stream copy (no re-encoding).
 * All segments must have identical codec/resolution (from same Kling API).
 */
export async function concatenateVideos(segments: Buffer[]): Promise<Buffer> {
  if (segments.length === 0) throw new Error('No segments to concatenate')
  if (segments.length === 1) return segments[0]

  const id = randomUUID().slice(0, 8)
  const segmentPaths: string[] = []
  const listPath = join(TMP_DIR, `concat-${id}.txt`)
  const outputPath = join(TMP_DIR, `output-${id}.mp4`)

  try {
    // Write each segment to a temp file
    for (let i = 0; i < segments.length; i++) {
      const segPath = join(TMP_DIR, `seg-${id}-${i}.mp4`)
      await writeFile(segPath, segments[i])
      segmentPaths.push(segPath)
    }

    // Write concat list file
    const listContent = segmentPaths.map((p) => `file '${p}'`).join('\n')
    await writeFileAsync(listPath, listContent)

    // Concatenate using ffmpeg concat demuxer
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(listPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions(['-c', 'copy'])  // Stream copy, no re-encode
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(new Error(`FFmpeg concatenation failed: ${err.message}`)))
        .run()
    })

    const outputBuffer = await readFile(outputPath)
    console.log(`[FFmpeg] Concatenated ${segments.length} segments → ${Math.round(outputBuffer.length / 1024 / 1024)}MB`)
    return outputBuffer
  } finally {
    // Clean up all temp files
    for (const p of segmentPaths) {
      await unlink(p).catch(() => {})
    }
    await unlink(listPath).catch(() => {})
    await unlink(outputPath).catch(() => {})
  }
}
