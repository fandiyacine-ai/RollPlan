'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'

type Segment = { id: string; startSeconds: number; endSeconds: number; positionId: string; userRole: string; dominance: string }
type Event = { id: string; timestampSeconds: number; eventTypeId: string; actor: string; outcome: string; techniqueLabel: string | null }
type Insight = { id: string; category: string; severity: string; description: string; suggestion: string }
type Message = { role: 'user' | 'coach'; text: string }
type Lang = 'en' | 'fi' | 'fr' | 'pt' | 'es' | 'ja'

const LANG_LABELS: Record<Lang, string> = { en: 'EN', fi: 'FI', fr: 'FR', pt: 'PT', es: 'ES', ja: 'JA' }
const LANG_STT: Record<Lang, string> = { en: 'en-US', fi: 'fi-FI', fr: 'fr-FR', pt: 'pt-BR', es: 'es-ES', ja: 'ja-JP' }

function fmt(s: number) {
  const m = Math.floor(s / 60)
  return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`
}

function extractYouTubeId(url: string) {
  return url.match(/[?&]v=([^&]+)/)?.[1] ?? url.match(/youtu\.be\/([^?]+)/)?.[1] ?? null
}

function isYouTubeUrl(url: string) {
  return url.includes('youtube.com') || url.includes('youtu.be')
}

declare global {
  interface Window { YT: any; onYouTubeIframeAPIReady: () => void }
}

async function playBase64Mp3(base64: string, onEnd: () => void, onError: () => void): Promise<HTMLAudioElement> {
  const bytes = atob(base64)
  const arr = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
  const blob = new Blob([arr], { type: 'audio/mpeg' })
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)
  audio.onended = () => { URL.revokeObjectURL(url); onEnd() }
  audio.onerror = () => { URL.revokeObjectURL(url); onError() }
  try {
    await audio.play()
  } catch {
    URL.revokeObjectURL(url)
    onError()
  }
  return audio
}

export default function CoachSession({
  match, videoUrl, segments, events, insights,
}: {
  match: { id: string; competitorLabel: string | null; opponentLabel: string; format: string; context: string; eventName: string | null }
  videoUrl: string | null
  segments: Segment[]
  events: Event[]
  insights: Insight[]
}) {
  const [currentTime, setCurrentTime] = useState(0)
  const [messages, setMessages] = useState<Message[]>([])
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [liveTranscript, setLiveTranscript] = useState('')
  const [lang, setLang] = useState<Lang>('en')
  const [speechSupported, setSpeechSupported] = useState(true)
  const [textInput, setTextInput] = useState('')
  const [ttsError, setTtsError] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const ytPlayerRef = useRef<any>(null)
  const recognitionRef = useRef<any>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const isYouTube = videoUrl ? isYouTubeUrl(videoUrl) : false
  const youtubeId = videoUrl && isYouTube ? extractYouTubeId(videoUrl) : null
  const currentSegment = segments.find(s => s.startSeconds <= currentTime && s.endSeconds >= currentTime)

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  useEffect(() => {
    setSpeechSupported(!!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition))
  }, [])

  useEffect(() => {
    if (!isYouTube || !youtubeId) return
    const loadApi = () => {
      if (window.YT?.Player) { initPlayer(); return }
      const tag = document.createElement('script')
      tag.src = 'https://www.youtube.com/iframe_api'
      document.head.appendChild(tag)
      window.onYouTubeIframeAPIReady = initPlayer
    }
    function initPlayer() {
      ytPlayerRef.current = new window.YT.Player('yt-player', {
        videoId: youtubeId,
        playerVars: { rel: 0, modestbranding: 1 },
      })
    }
    loadApi()
    const interval = setInterval(() => {
      if (ytPlayerRef.current?.getCurrentTime) setCurrentTime(ytPlayerRef.current.getCurrentTime())
    }, 500)
    return () => clearInterval(interval)
  }, [isYouTube, youtubeId])

  const speak = useCallback(async (text: string) => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    setTtsError(null)

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, lang }),
      })
      const data = await res.json()
      if (!res.ok || !data.audioContent) {
        setTtsError(data.error ?? 'TTS unavailable')
        setIsSpeaking(false)
        return
      }
      setIsSpeaking(true)
      audioRef.current = await playBase64Mp3(
        data.audioContent,
        () => setIsSpeaking(false),
        () => { setIsSpeaking(false); setTtsError('Audio playback failed') }
      )
    } catch (err) {
      setIsSpeaking(false)
      setTtsError('TTS request failed')
    }
  }, [lang])

  const sendMessage = useCallback(async (userMessage: string) => {
    if (!userMessage.trim() || isLoading) return
    setMessages(prev => [...prev, { role: 'user', text: userMessage }])
    setIsLoading(true)

    try {
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: match.id, message: userMessage, currentTimestampSeconds: currentTime }),
      })
      if (!res.ok || !res.body) {
        setMessages(prev => [...prev, { role: 'coach', text: 'Something went wrong. Try again.' }])
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ''
      setMessages(prev => [...prev, { role: 'coach', text: '' }])
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        fullText += decoder.decode(value, { stream: true })
        setMessages(prev => [...prev.slice(0, -1), { role: 'coach', text: fullText }])
      }
      if (fullText) await speak(fullText)
    } catch {
      setMessages(prev => [...prev, { role: 'coach', text: 'Connection error. Try again.' }])
    } finally {
      setIsLoading(false)
    }
  }, [match.id, currentTime, isLoading, speak])

  const startListening = useCallback(() => {
    if (!speechSupported || isListening || isLoading) return
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; setIsSpeaking(false) }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    const recognition = new SR()
    recognition.lang = LANG_STT[lang]
    recognition.interimResults = true
    recognition.continuous = false
    let finalTranscript = ''
    recognition.onresult = (e: any) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalTranscript += e.results[i][0].transcript
        else interim += e.results[i][0].transcript
      }
      setLiveTranscript(finalTranscript + interim)
    }
    recognition.onend = () => {
      setIsListening(false); setLiveTranscript('')
      if (finalTranscript.trim()) sendMessage(finalTranscript.trim())
    }
    recognition.onerror = () => { setIsListening(false); setLiveTranscript('') }
    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }, [speechSupported, isListening, isLoading, lang, sendMessage])

  const stopListening = useCallback(() => { recognitionRef.current?.stop(); setIsListening(false) }, [])

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!textInput.trim()) return
    sendMessage(textInput.trim())
    setTextInput('')
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between py-2 border-b flex-shrink-0">
        <div>
          <Link href="/player-card" className="text-xs text-muted-foreground hover:text-foreground transition-colors">← Player Card</Link>
          <h1 className="font-semibold text-sm mt-0.5">
            {match.competitorLabel ?? 'You'} vs {match.opponentLabel}
            {match.eventName && <span className="text-muted-foreground font-normal"> · {match.eventName}</span>}
          </h1>
        </div>
        <div className="flex gap-1">
          {(Object.keys(LANG_LABELS) as Lang[]).map(l => (
            <button key={l} onClick={() => setLang(l)}
              className={`text-xs px-2 py-1 rounded transition-colors ${lang === l ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'}`}>
              {LANG_LABELS[l]}
            </button>
          ))}
        </div>
      </div>

      {/* Body: video left, chat right */}
      <div className="flex flex-1 overflow-hidden gap-4 pt-3">

        {/* Left — video */}
        <div className="flex flex-col w-[55%] flex-shrink-0">
          {videoUrl ? (
            <>
              {isYouTube && youtubeId ? (
                <div className="aspect-video rounded-lg overflow-hidden bg-black w-full">
                  <div id="yt-player" className="w-full h-full" />
                </div>
              ) : (
                <video ref={videoRef} src={videoUrl} controls
                  className="w-full aspect-video rounded-lg bg-black"
                  onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime ?? 0)} />
              )}
              <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                <span className="font-mono">{fmt(currentTime)}</span>
                {currentSegment && (
                  <span className="px-2 py-0.5 bg-muted rounded-full">
                    {currentSegment.positionId} · {currentSegment.userRole} · {currentSegment.dominance}
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No video available</div>
          )}
        </div>

        {/* Right — chat */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {messages.length === 0 && (
              <p className="text-sm text-muted-foreground pt-4">
                {videoUrl ? 'Pause the video at any moment and ask your coach what happened.' : 'Ask your coach about this match.'}
              </p>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'coach' && (
                  <div className="w-6 h-6 rounded-full bg-foreground text-background flex items-center justify-center text-xs flex-shrink-0 mt-0.5">C</div>
                )}
                <div className={`rounded-2xl px-3.5 py-2 text-sm max-w-[85%] leading-relaxed ${msg.role === 'user' ? 'bg-foreground text-background rounded-tr-sm' : 'bg-muted rounded-tl-sm'}`}>
                  {msg.text || <span className="opacity-40">thinking…</span>}
                </div>
              </div>
            ))}
            {isListening && liveTranscript && (
              <div className="flex justify-end">
                <div className="rounded-2xl rounded-tr-sm px-3.5 py-2 text-sm max-w-[85%] bg-foreground/10 italic text-muted-foreground">
                  {liveTranscript}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Controls */}
          <div className="border-t pt-3 mt-2 space-y-2 flex-shrink-0">
            {ttsError && <p className="text-xs text-red-500">{ttsError}</p>}

            {speechSupported && (
              <div className="flex items-center gap-3">
                <button
                  onPointerDown={startListening}
                  onPointerUp={stopListening}
                  onPointerLeave={stopListening}
                  disabled={isLoading || isSpeaking}
                  className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 transition-all select-none ${
                    isListening ? 'bg-red-500 text-white scale-110 shadow-lg'
                    : isLoading || isSpeaking ? 'bg-muted text-muted-foreground cursor-not-allowed'
                    : 'bg-foreground text-background hover:opacity-90'
                  }`}
                >
                  {isLoading
                    ? <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                    : isSpeaking
                    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>
                    : <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/></svg>
                  }
                </button>
                <p className="text-xs text-muted-foreground">
                  {isListening ? 'Listening — release to send' : isLoading ? 'Thinking…' : isSpeaking ? 'Coach is speaking…' : 'Hold to talk'}
                </p>
              </div>
            )}

            <form onSubmit={handleTextSubmit} className="flex gap-2">
              <input type="text" value={textInput} onChange={e => setTextInput(e.target.value)}
                placeholder={speechSupported ? 'Or type a question…' : 'Ask your coach…'}
                className="flex-1 rounded-full border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
                disabled={isLoading} />
              <button type="submit" disabled={!textInput.trim() || isLoading}
                className="px-4 py-2 rounded-full bg-foreground text-background text-sm disabled:opacity-40 hover:opacity-90 transition-opacity">
                Send
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
