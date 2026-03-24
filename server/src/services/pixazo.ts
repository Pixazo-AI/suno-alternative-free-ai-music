import { writeFile, mkdir, readFile } from 'fs/promises';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUDIO_DIR = path.join(__dirname, '../../public/audio');

const PIXAZO_API = config.pixazo.apiUrl;
const PIXAZO_KEY = config.pixazo.subscriptionKey;

// ---------------------------------------------------------------------------
// Pixazo API helpers
// ---------------------------------------------------------------------------

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2_000;

/**
 * Make an HTTPS request using Node's https module with family:4 (IPv4 only).
 * Node 20's built-in fetch (undici) tries IPv6 addresses that are unreachable
 * on some networks, causing ETIMEDOUT before IPv4 gets a chance.
 */
function httpsRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: string,
): Promise<{ status: number; body: string; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : 443,
        path: parsed.pathname + parsed.search,
        method,
        headers,
        timeout: REQUEST_TIMEOUT_MS,
        family: 4, // Force IPv4 — avoids undici autoSelectFamily IPv6 hang
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => (data += chunk.toString()));
        res.on('end', () => resolve({
          status: res.statusCode ?? 0,
          body: data,
          headers: (res.headers as Record<string, string>) || {},
        }));
      },
    );
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function httpsDownload(
  url: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; buffer: Buffer; contentType: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : 443,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers,
        timeout: REQUEST_TIMEOUT_MS,
        family: 4,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve({
          status: res.statusCode ?? 0,
          buffer: Buffer.concat(chunks),
          contentType: (res.headers['content-type'] as string) || '',
        }));
      },
    );
    req.on('timeout', () => { req.destroy(); reject(new Error('Download timed out')); });
    req.on('error', reject);
    req.end();
  });
}

function pixazoHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'Ocp-Apim-Subscription-Key': PIXAZO_KEY,
  };
}

async function pixazoRequest(url: string, body: string, label: string): Promise<{ status: number; body: string }> {
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await httpsRequest(url, 'POST', pixazoHeaders(), body);
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const isLast = attempt === MAX_RETRIES;
      console.warn(`${label}: attempt ${attempt}/${MAX_RETRIES} failed — ${lastError.message}${isLast ? '' : ', retrying...'}`);
      if (!isLast) await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
    }
  }
  throw lastError!;
}

/**
 * Submit a music generation request to Pixazo Tracks API.
 */
async function pixazoGenerate(body: Record<string, unknown>): Promise<{ task_id: string; status: string; message?: string }> {
  const res = await pixazoRequest(
    `${PIXAZO_API}/tracks/v1/generate`,
    JSON.stringify(body),
    'Pixazo generate',
  );

  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Pixazo generate failed (${res.status}): ${res.body}`);
  }

  return JSON.parse(res.body) as { task_id: string; status: string; message?: string };
}

/**
 * Poll Pixazo for generation status / result.
 */
async function pixazoPollStatus(taskId: string): Promise<Record<string, unknown>> {
  const res = await pixazoRequest(
    `${PIXAZO_API}/tracks/v1/status`,
    JSON.stringify({ task_id: taskId }),
    'Pixazo status',
  );

  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Pixazo status check failed (${res.status}): ${res.body}`);
  }

  return JSON.parse(res.body) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Generation types & interfaces (public API unchanged)
// ---------------------------------------------------------------------------

export interface GenerationParams {
  // Mode
  customMode: boolean;

  // Simple Mode
  songDescription?: string;

  // Custom Mode
  lyrics: string;
  style: string;
  title: string;

  // Common
  instrumental: boolean;
  vocalLanguage?: string;

  // Music Parameters
  duration?: number;
  bpm?: number;
  keyScale?: string;
  timeSignature?: string;

  // Generation Settings
  inferenceSteps?: number;
  guidanceScale?: number;
  batchSize?: number;
  randomSeed?: boolean;
  seed?: number;
  thinking?: boolean;
  enhance?: boolean;
  audioFormat?: 'mp3' | 'flac';
  inferMethod?: 'ode' | 'sde';
  shift?: number;

  // LM Parameters
  lmTemperature?: number;
  lmCfgScale?: number;
  lmTopK?: number;
  lmTopP?: number;
  lmNegativePrompt?: string;
  lmBackend?: 'pt' | 'vllm';
  lmModel?: string;

  // Expert Parameters
  referenceAudioUrl?: string;
  sourceAudioUrl?: string;
  referenceAudioTitle?: string;
  sourceAudioTitle?: string;
  audioCodes?: string;
  repaintingStart?: number;
  repaintingEnd?: number;
  instruction?: string;
  audioCoverStrength?: number;
  taskType?: string;
  useAdg?: boolean;
  cfgIntervalStart?: number;
  cfgIntervalEnd?: number;
  customTimesteps?: string;
  useCotMetas?: boolean;
  useCotCaption?: boolean;
  useCotLanguage?: boolean;
  autogen?: boolean;
  constrainedDecodingDebug?: boolean;
  allowLmBatch?: boolean;
  getScores?: boolean;
  getLrc?: boolean;
  scoreScale?: number;
  lmBatchChunkSize?: number;
  trackName?: string;
  completeTrackClasses?: string[];
  isFormatCaption?: boolean;

  // Model selection
  ditModel?: string;
}

interface GenerationResult {
  audioUrls: string[];
  duration: number;
  bpm?: number;
  keyScale?: string;
  timeSignature?: string;
  status: string;
}

interface JobStatus {
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  queuePosition?: number;
  etaSeconds?: number;
  progress?: number;
  stage?: string;
  result?: GenerationResult;
  error?: string;
}

interface ActiveJob {
  params: GenerationParams;
  startTime: number;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  pixazoTaskId?: string;
  result?: GenerationResult;
  error?: string;
  rawResponse?: unknown;
  queuePosition?: number;
  progress?: number;
  stage?: string;
}

const activeJobs = new Map<string, ActiveJob>();

// Periodic cleanup of old jobs (every 10 minutes, remove jobs older than 1 hour)
setInterval(() => cleanupOldJobs(3600000), 600000);

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

export async function checkSpaceHealth(): Promise<boolean> {
  try {
    const res = await httpsRequest(
      `${PIXAZO_API}/tracks/v1/status`,
      'POST',
      pixazoHeaders(),
      JSON.stringify({ task_id: 'health-check' }),
    );
    // Any response (even 4xx for invalid task) means the API is reachable
    return res.status < 500;
  } catch {
    return false;
  }
}

// Discover endpoints (for compatibility)
export async function discoverEndpoints(): Promise<unknown> {
  return { provider: 'pixazo', endpoint: `${PIXAZO_API}/tracks/v1` };
}

// ---------------------------------------------------------------------------
// Map UI params → Pixazo API request body
// ---------------------------------------------------------------------------

function buildPixazoBody(params: GenerationParams): Record<string, unknown> {
  const prompt = params.customMode
    ? (params.style || 'pop music')
    : (params.songDescription || params.style || 'pop music');

  const body: Record<string, unknown> = {
    prompt,
  };

  // Lyrics
  if (!params.instrumental && params.lyrics) {
    body.lyrics = params.lyrics;
  }

  // Instrumental flag
  if (params.instrumental) {
    body.instrumental = true;
  }

  // Duration (seconds)
  if (params.duration && params.duration > 0) {
    body.duration = params.duration;
  }

  // BPM
  if (params.bpm && params.bpm > 0) {
    body.bpm = params.bpm;
  }

  // Inference steps
  if (params.inferenceSteps && params.inferenceSteps > 0) {
    body.infer_steps = params.inferenceSteps;
  }

  // Guidance scale
  if (params.guidanceScale !== undefined) {
    body.guidance_scale = params.guidanceScale;
  }

  // Seed
  if (!params.randomSeed && params.seed !== undefined && params.seed >= 0) {
    body.seed = params.seed;
  } else {
    body.seed = -1; // random
  }

  // Reference audio
  if (params.referenceAudioUrl) {
    body.reference_audio_url = params.referenceAudioUrl;
  }

  return body;
}

// ---------------------------------------------------------------------------
// Submit generation job
// ---------------------------------------------------------------------------

export async function generateMusicViaAPI(params: GenerationParams): Promise<{ jobId: string }> {
  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  const job: ActiveJob = {
    params,
    startTime: Date.now(),
    status: 'queued',
    queuePosition: 1,
  };

  activeJobs.set(jobId, job);

  // Submit to Pixazo API immediately (it has its own queue)
  processGeneration(jobId, params, job).catch(err => {
    console.error(`Job ${jobId}: background processing error`, err);
    if (job.status !== 'succeeded' && job.status !== 'failed') {
      job.status = 'failed';
      job.error = err.message || 'Generation failed';
    }
  });

  return { jobId };
}

// ---------------------------------------------------------------------------
// Process generation via Pixazo
// ---------------------------------------------------------------------------

async function processGeneration(
  jobId: string,
  params: GenerationParams,
  job: ActiveJob,
): Promise<void> {
  job.status = 'running';
  job.stage = 'Submitting to Pixazo...';

  const body = buildPixazoBody(params);

  console.log(`Job ${jobId}: Submitting to Pixazo`, {
    prompt: (body.prompt as string).slice(0, 80),
    duration: body.duration,
    bpm: body.bpm,
  });

  // Submit generation request
  const submitResult = await pixazoGenerate(body);
  job.pixazoTaskId = submitResult.task_id;
  job.stage = 'Generating music...';

  console.log(`Job ${jobId}: Pixazo task_id=${submitResult.task_id}, status=${submitResult.status}`);

  // Poll for completion
  const maxPollTime = 10 * 60 * 1000; // 10 minutes max
  const pollInterval = 3000; // 3 seconds between polls
  const startTime = Date.now();

  let consecutivePollErrors = 0;
  const MAX_CONSECUTIVE_POLL_ERRORS = 5;

  while (Date.now() - startTime < maxPollTime) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));

    let statusResult: Record<string, unknown>;
    try {
      statusResult = await pixazoPollStatus(submitResult.task_id);
      consecutivePollErrors = 0;
    } catch (pollErr) {
      consecutivePollErrors++;
      console.warn(`Job ${jobId}: Poll error (${consecutivePollErrors}/${MAX_CONSECUTIVE_POLL_ERRORS}):`, pollErr);
      if (consecutivePollErrors >= MAX_CONSECUTIVE_POLL_ERRORS) {
        throw new Error(`Pixazo polling failed after ${MAX_CONSECUTIVE_POLL_ERRORS} consecutive errors: ${pollErr}`);
      }
      continue;
    }
    job.rawResponse = statusResult;

    const status = (statusResult.status as string || '').toLowerCase();

    if (status === 'completed' || status === 'succeeded' || status === 'success') {
      // Generation complete — extract audio URLs
      const audioUrls = extractAudioUrls(statusResult);

      if (audioUrls.length === 0) {
        job.status = 'failed';
        job.error = 'Pixazo returned no audio files';
        return;
      }

      // Download audio files to local storage
      const localUrls: string[] = [];
      for (let i = 0; i < audioUrls.length; i++) {
        try {
          const localUrl = await downloadRemoteAudio(audioUrls[i], jobId, i);
          localUrls.push(localUrl);
        } catch (dlErr) {
          console.warn(`Job ${jobId}: Failed to download audio ${i}, using remote URL`, dlErr);
          localUrls.push(audioUrls[i]);
        }
      }

      const duration = (statusResult.duration as number) || params.duration || 0;

      job.status = 'succeeded';
      job.result = {
        audioUrls: localUrls,
        duration,
        bpm: (statusResult.bpm as number) || params.bpm,
        keyScale: (statusResult.key_scale as string) || params.keyScale,
        timeSignature: (statusResult.time_signature as string) || params.timeSignature,
        status: 'succeeded',
      };

      console.log(`Job ${jobId}: Completed via Pixazo with ${localUrls.length} audio file(s)`);
      return;
    }

    if (status === 'failed' || status === 'error') {
      job.status = 'failed';
      job.error = (statusResult.message as string) || (statusResult.error as string) || 'Pixazo generation failed';
      console.error(`Job ${jobId}: Pixazo generation failed:`, job.error);
      return;
    }

    // Still in progress
    if (statusResult.progress !== undefined) {
      job.progress = statusResult.progress as number;
    }
    if (statusResult.stage) {
      job.stage = statusResult.stage as string;
    } else {
      job.stage = `Generating music (${status})...`;
    }
  }

  // Timed out
  job.status = 'failed';
  job.error = 'Generation timed out after 10 minutes';
}

/**
 * Extract audio URLs from a Pixazo status response.
 * Handles various response shapes.
 */
function extractAudioUrls(result: Record<string, unknown>): string[] {
  // Direct audio_url field
  if (typeof result.audio_url === 'string') {
    return [result.audio_url];
  }

  // Array of audio URLs
  if (Array.isArray(result.audio_urls)) {
    return result.audio_urls.filter((u: unknown) => typeof u === 'string') as string[];
  }

  // Nested in data object
  if (result.data && typeof result.data === 'object') {
    const data = result.data as Record<string, unknown>;
    if (typeof data.audio_url === 'string') return [data.audio_url];
    if (Array.isArray(data.audio_urls)) {
      return data.audio_urls.filter((u: unknown) => typeof u === 'string') as string[];
    }
    if (typeof data.url === 'string') return [data.url];
  }

  // output field
  if (typeof result.output === 'string' && result.output.startsWith('http')) {
    return [result.output];
  }
  if (Array.isArray(result.output)) {
    return result.output.filter((u: unknown) => typeof u === 'string' && (u as string).startsWith('http')) as string[];
  }

  // result field
  if (result.result && typeof result.result === 'object') {
    const r = result.result as Record<string, unknown>;
    if (typeof r.audio_url === 'string') return [r.audio_url];
    if (Array.isArray(r.audio_urls)) {
      return r.audio_urls.filter((u: unknown) => typeof u === 'string') as string[];
    }
  }

  return [];
}

/**
 * Download a remote audio URL to local storage.
 */
async function downloadRemoteAudio(remoteUrl: string, jobId: string, index: number): Promise<string> {
  await mkdir(AUDIO_DIR, { recursive: true });

  const dlRes = await httpsDownload(remoteUrl);
  if (dlRes.status < 200 || dlRes.status >= 300) {
    throw new Error(`Failed to download audio: ${dlRes.status}`);
  }

  const buffer = dlRes.buffer;
  if (buffer.length === 0) {
    throw new Error('Downloaded audio file is empty');
  }

  // Determine extension from URL or content-type
  let ext = '.mp3';
  if (remoteUrl.includes('.flac')) ext = '.flac';
  else if (remoteUrl.includes('.wav')) ext = '.wav';
  else if (dlRes.contentType.includes('flac')) ext = '.flac';
  else if (dlRes.contentType.includes('wav')) ext = '.wav';

  const filename = `${jobId}_${index}${ext}`;
  const destPath = path.join(AUDIO_DIR, filename);

  const tmpPath = destPath + '.tmp';
  await writeFile(tmpPath, buffer);
  const { rename } = await import('fs/promises');
  await rename(tmpPath, destPath);

  return `/audio/${filename}`;
}

// ---------------------------------------------------------------------------
// Job status
// ---------------------------------------------------------------------------

export async function getJobStatus(jobId: string): Promise<JobStatus> {
  const job = activeJobs.get(jobId);

  if (!job) {
    return {
      status: 'failed',
      error: 'Job not found',
    };
  }

  if (job.status === 'succeeded' && job.result) {
    return {
      status: 'succeeded',
      result: job.result,
    };
  }

  if (job.status === 'failed') {
    return {
      status: 'failed',
      error: job.error || 'Generation failed',
    };
  }

  const elapsed = Math.floor((Date.now() - job.startTime) / 1000);

  if (job.status === 'queued') {
    return {
      status: job.status,
      queuePosition: job.queuePosition,
      etaSeconds: (job.queuePosition || 1) * 180,
    };
  }

  // Running
  return {
    status: job.status,
    etaSeconds: Math.max(0, 180 - elapsed),
    progress: job.progress,
    stage: job.stage,
  };
}

// Get raw response for debugging
export function getJobRawResponse(jobId: string): unknown | null {
  const job = activeJobs.get(jobId);
  return job?.rawResponse || null;
}

// ---------------------------------------------------------------------------
// Audio helpers
// ---------------------------------------------------------------------------

export async function getAudioStream(audioPath: string): Promise<Response> {
  if (audioPath.startsWith('http')) {
    const dl = await httpsDownload(audioPath);
    const ext = audioPath.endsWith('.flac') ? 'flac' : 'mpeg';
    return new Response(dl.buffer, {
      status: dl.status,
      headers: { 'Content-Type': dl.contentType || `audio/${ext}` },
    });
  }

  if (audioPath.startsWith('/audio/')) {
    const localPath = path.join(AUDIO_DIR, audioPath.replace('/audio/', ''));
    try {
      const buffer = await readFile(localPath);
      const ext = localPath.endsWith('.flac') ? 'flac' : 'mpeg';
      return new Response(buffer, {
        status: 200,
        headers: { 'Content-Type': `audio/${ext}` }
      });
    } catch (err) {
      console.error('Failed to read local audio file:', localPath, err);
      return new Response(null, { status: 404 });
    }
  }

  // Absolute path — try reading directly from disk
  if (audioPath.startsWith('/')) {
    try {
      const buffer = await readFile(audioPath);
      const ext = audioPath.endsWith('.flac') ? 'flac' : audioPath.endsWith('.wav') ? 'wav' : 'mpeg';
      return new Response(buffer, {
        status: 200,
        headers: { 'Content-Type': `audio/${ext}` }
      });
    } catch {
      // Fall through
    }
  }

  return new Response(null, { status: 404 });
}

export async function downloadAudio(remoteUrl: string, songId: string): Promise<string> {
  await mkdir(AUDIO_DIR, { recursive: true });

  const response = await getAudioStream(remoteUrl);
  if (!response.ok) {
    throw new Error(`Failed to download audio: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  const ext = remoteUrl.includes('.flac') ? '.flac' : '.mp3';
  const filename = `${songId}${ext}`;
  const filepath = path.join(AUDIO_DIR, filename);

  await writeFile(filepath, Buffer.from(buffer));
  console.log(`Downloaded audio to ${filepath}`);

  return `/audio/${filename}`;
}

export async function downloadAudioToBuffer(remoteUrl: string): Promise<{ buffer: Buffer; size: number }> {
  const response = await getAudioStream(remoteUrl);
  if (!response.ok) {
    throw new Error(`Failed to download audio: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return { buffer, size: buffer.length };
}

export function cleanupJob(jobId: string): void {
  activeJobs.delete(jobId);
}

export function cleanupOldJobs(maxAgeMs: number = 3600000): void {
  const now = Date.now();
  for (const [jobId, job] of activeJobs) {
    if (now - job.startTime > maxAgeMs) {
      activeJobs.delete(jobId);
    }
  }
}

