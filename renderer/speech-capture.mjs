// Adapted from Fei2411/DeepSeek-Bot ds-bot/src/client/speech.js.
// Original license and attribution are retained in LICENSE and NOTICE.
export function waveBytes(samples, rate = 16000) {
  const bytes = new Uint8Array(44 + samples.length * 2)
  const view = new DataView(bytes.buffer)
  const ascii = (at, text) => { for (let index = 0; index < text.length; index += 1) bytes[at + index] = text.charCodeAt(index) }
  ascii(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  ascii(8, 'WAVEfmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  ascii(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  samples.forEach((sample, index) => {
    const value = Math.max(-1, Math.min(1, sample))
    view.setInt16(44 + index * 2, value < 0 ? Math.round(value * 0x8000) : Math.round(value * 0x7fff), true)
  })
  return bytes
}

export function base64Of(bytes) {
  let text = ''
  for (let index = 0; index < bytes.length; index += 0x8000) text += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  return btoa(text)
}

const captureError = (kind, cause) => Object.assign(new Error(kind), { kind, cause })

// One microphone recording. level() reads the live loudness (0–1); finish() returns
// the WAV, or null when nothing was recorded; cancel() drops it.
export async function openCapture({deviceId=typeof localStorage==='undefined'?'':localStorage.getItem('pi-bot.microphone')||''} = {}) {
  const devices = navigator.mediaDevices
  if (!devices?.getUserMedia || typeof MediaRecorder === 'undefined') throw captureError('unavailable')
  let stream
  try {
    stream = await devices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, ...(deviceId?{deviceId:{exact:deviceId}}:{}) }, video: false })
  } catch (error) {
    throw captureError(error?.name === 'NotAllowedError' ? 'blocked' : ['NotFoundError','OverconstrainedError'].includes(error?.name)?'missing':'failed', error)
  }
  let audio,recorder,analyser
  try {
    audio = new AudioContext()
    await audio.resume()
    analyser = audio.createAnalyser()
    analyser.fftSize = 512
    audio.createMediaStreamSource(stream).connect(analyser)
    recorder = new MediaRecorder(stream)
  } catch(error) { stream.getTracks().forEach(track=>track.stop());if(audio)void audio.close().catch(()=>{});throw captureError('failed',error) }
  const frame = new Float32Array(analyser.fftSize)
  const chunks = []
  recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data) }
  try { recorder.start() } catch(error) { stream.getTracks().forEach(track=>track.stop());void audio.close().catch(()=>{});throw captureError('failed',error) }
  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    if (recorder.state !== 'inactive') recorder.stop()
    stream.getTracks().forEach(track => track.stop())
    void audio.close().catch(() => {})
  }
  return {
    echoCancellation:stream.getAudioTracks?.()[0]?.getSettings?.().echoCancellation===true,
    level() {
      if (closed) return 0
      analyser.getFloatTimeDomainData(frame)
      let sum = 0
      for (const sample of frame) sum += sample * sample
      return Math.min(1, Math.sqrt(sum / frame.length) * 4)
    },
    cancel: close,
    async finish(maxSeconds) {
      if (closed || recorder.state === 'inactive') { close(); return null }
      try {
        await new Promise((resolve) => { recorder.onstop = resolve; recorder.stop() })
        stream.getTracks().forEach(track => track.stop())
        const blob = new Blob(chunks, { type: recorder.mimeType })
        if (blob.size === 0) return null
        const decoded = await audio.decodeAudioData(await blob.arrayBuffer())
        const length = Math.max(1, Math.floor(Math.min(decoded.duration, maxSeconds) * 16000))
        const offline = new OfflineAudioContext(1, length, 16000)
        const source = offline.createBufferSource()
        source.buffer = decoded
        source.connect(offline.destination)
        source.start()
        return waveBytes((await offline.startRendering()).getChannelData(0))
      } finally { close() }
    },
  }
}

export function turnDetector({ loud = 0.12, quiet = 0.06, quietMs = 1200 } = {}) {
  let spoke=false,quietSince=null,lastText='',textAt=null
  const levels=[]
  return (level, now, transcript='') => {
    level=Math.max(0,Math.min(1,Number(level)||0))
    const text=String(transcript||'').trim()
    if(text&&text!==lastText){lastText=text;textAt=now;spoke=true;quietSince=null;levels.length=0}
    levels.push([now,level]);while(levels.length&&now-levels[0][0]>900)levels.shift()
    if(level>=loud){spoke=true;quietSince=null}
    else if(spoke&&level<quiet)quietSince??=now
    else quietSince=null
    if(!spoke)return 'waiting'
    if(quietSince!==null&&now-quietSince>=quietMs)return 'done'
    // A quiet voice can produce ASR text without crossing the volume trigger.
    // Constant fan/driver noise must not hold that completed utterance open.
    // Growing text and changing speech levels reset/prevent this fallback.
    if(textAt!==null){
      const stable=now-textAt
      if(stable>=Math.max(1600,quietMs)&&level<loud)return 'done'
      if(stable>=Math.max(2800,quietMs)&&levels.length>1&&now-levels[0][0]>=700){
        const values=levels.map(v=>v[1]),peak=Math.max(...values),floor=Math.min(...values)
        if(peak-floor<=Math.max(.018,peak*.12))return 'done'
      }
    }
    return 'speech'
  }
}
