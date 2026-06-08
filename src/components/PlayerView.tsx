import React, { useState, useEffect, useRef } from 'react';
import { 
  Volume2, VolumeX, Radio, Eye, HeartHandshake, History, 
  Activity, Sparkles, Bell, RefreshCw, CheckCircle, Volume1
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Announcement, SyncMessage } from '../types';
import { playSyntheticGong, speakPortugueseText } from '../utils/audio';
import { getAudioFile } from '../utils/db';

export default function PlayerView() {
  // Sync Status
  const [currentAnnouncement, setCurrentAnnouncement] = useState<Announcement | null>(null);
  const [playingStatus, setPlayingStatus] = useState<'idle' | 'playing'>('idle');
  const [volume, setVolume] = useState<number>(0.8); // 0.0 to 1.0
  const [progress, setProgress] = useState<number>(0); // 0 to 100
  const [secondsRemaining, setSecondsRemaining] = useState<number>(0);
  const [isTTS, setIsTTS] = useState<boolean>(false);
  const [customText, setCustomText] = useState<string>('');
  const [isAudioUnlocked, setIsAudioUnlocked] = useState<boolean>(false);
  
  // History list
  const [history, setHistory] = useState<{ time: string; title: string; category: string }[]>([]);

  // Refs
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<any>(null);
  const isAudioUnlockedRef = useRef<boolean>(false);

  // Sync state to mutable ref to dodge stale closure issues in persistent connection loop
  useEffect(() => {
    isAudioUnlockedRef.current = isAudioUnlocked;
  }, [isAudioUnlocked]);

  const lastProcessedTimestampRef = useRef<number>(-1);

  // Keep currentAnnouncement in a ref to avoid stale closures in the channel listener
  const currentAnnouncementRef = useRef<Announcement | null>(null);
  useEffect(() => {
    currentAnnouncementRef.current = currentAnnouncement;
  }, [currentAnnouncement]);

  // Poll the backend server for commands (enabling cross-PC/multi-device sync)
  useEffect(() => {
    let active = true;

    const pollServerState = async () => {
      try {
        const titleToSend = currentAnnouncementRef.current?.title || null;
        // Dual-purpose query: report receiver's live metadata, then receive latest system commands
        // Prevent browser caching using a cache-busting timestamp
        const res = await fetch(`/api/state?active=true&isAudioUnlocked=${isAudioUnlockedRef.current}&playingId=${encodeURIComponent(titleToSend || '')}&_t=${Date.now()}`);
        if (!active) return;

        if (res.ok) {
          const data = await res.json();
          const serverState = data.state;

          if (serverState) {
            const isPlayAction = serverState.action === 'PLAY';
            // Only process state if audio is unlocked OR if it is a stop/set volume action (which elements can handle in state safely)
            const canProcess = isAudioUnlockedRef.current || !isPlayAction;

            if (canProcess) {
              if (lastProcessedTimestampRef.current === -1) {
                // On initial load, we want to play the current active audio ONLY if it was triggered very recently (e.g., less than 45 seconds ago)
                const isRecent = isPlayAction && (Date.now() - serverState.timestamp < 45000);
                if (isRecent) {
                  // Set to one less than the server timestamp so the comparison immediately triggers play
                  lastProcessedTimestampRef.current = serverState.timestamp - 1;
                } else {
                  // Mark as processed without playing
                  lastProcessedTimestampRef.current = serverState.timestamp;
                }
              }

              if (serverState.timestamp > lastProcessedTimestampRef.current) {
                lastProcessedTimestampRef.current = serverState.timestamp;

                if (serverState.action === 'PLAY') {
                  setVolume(serverState.volume ?? 0.8);
                  setIsTTS(serverState.isTTS || false);
                  setCustomText(serverState.customText || '');

                  triggerReceiverPlay(
                    serverState.currentAnnouncement,
                    serverState.currentAnnouncement?.isCustom || serverState.currentAnnouncement?.category === 'custom' || false,
                    serverState.volume,
                    serverState.fallbackMode,
                    serverState.isTTS,
                    serverState.customText
                  );
                } else if (serverState.action === 'STOP') {
                  stopAllPlayback();
                } else if (serverState.action === 'SET_VOLUME') {
                  setVolume(serverState.volume ?? 0.8);
                  if (audioRef.current) {
                    audioRef.current.volume = serverState.volume;
                  }
                }
              }
            }
          }
        }
      } catch (err) {
        // dynamic fail-open during server startup
      }
    };

    const interval = setInterval(pollServerState, 800);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  // Communicate with the Operator tab
  useEffect(() => {
    const channel = new BroadcastChannel('hmmb_audio_system');
    broadcastChannelRef.current = channel;

    // Send status report back to Operator
    const sendStatusReport = (activeState: boolean, currentTitle?: string) => {
      channel.postMessage({
        type: 'RECEIVER_STATUS',
        payload: {
          active: activeState,
          playingId: currentTitle || null,
          isAudioUnlocked: isAudioUnlockedRef.current
        }
      });
    };

    // Listen to Operator commands
    channel.onmessage = async (event) => {
      const msg = event.data;
      
      if (msg.type === 'PING') {
        channel.postMessage({ type: 'PONG' });
        sendStatusReport(true, currentAnnouncementRef.current?.title);
      } else if (msg.type === 'PLAY') {
        const { announcement, isCustom, volume: reqVolume, fallbackMode, isTTS: reqIsTTS, customText: reqCustomText } = msg.payload;
        
        // Update volume state
        setVolume(reqVolume ?? 0.8);
        setIsTTS(reqIsTTS || false);
        setCustomText(reqCustomText || '');

        // Trigger Play Sequence
        triggerReceiverPlay(announcement, isCustom, reqVolume, fallbackMode, reqIsTTS, reqCustomText);

      } else if (msg.type === 'STOP') {
        stopAllPlayback();
      } else if (msg.type === 'SET_VOLUME') {
        const { volume: reqVolume } = msg.payload;
        setVolume(reqVolume ?? 0.8);
        if (audioRef.current) {
          audioRef.current.volume = reqVolume;
        }
      }
    };

    // Initial heart beat signal
    channel.postMessage({ type: 'PONG' });
    sendStatusReport(true);

    return () => {
      stopAllPlayback();
      channel.close();
    };
  }, []);

  // Handle countdown triggers when an active announcement starts
  useEffect(() => {
    if (playingStatus === 'playing' && currentAnnouncement) {
      if (timerRef.current) clearInterval(timerRef.current);
      
      const totalSecs = currentAnnouncement.duration || 6;
      let secsLeft = totalSecs;
      setSecondsRemaining(secsLeft);
      setProgress(100);

      const interval = 1000;
      timerRef.current = setInterval(() => {
        secsLeft -= 1;
        setSecondsRemaining(Math.max(0, secsLeft));
        const fraction = (secsLeft / totalSecs) * 100;
        setProgress(Math.max(0, fraction));

        if (secsLeft <= 0) {
          clearInterval(timerRef.current);
          setPlayingStatus('idle');
          setCurrentAnnouncement(null);
          // Notify operator
          if (broadcastChannelRef.current) {
            broadcastChannelRef.current.postMessage({
              type: 'RECEIVER_STATUS',
              payload: { active: true, playingId: null }
            });
          }
        }
      }, interval);

      // Append to local session announcements log
      const now = new Date();
      const ptTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setHistory(prev => [
        { 
          time: ptTime, 
          title: isTTS ? `Voz: "${customText.substring(0, 36)}..."` : currentAnnouncement.title, 
          category: currentAnnouncement.category 
        },
        ...prev.slice(0, 9) // keep last 10
      ]);
    }
  }, [playingStatus]);

  // Actual local receiver playback engine
  const triggerReceiverPlay = async (
    announcement: Announcement, 
    isCustom: boolean, 
    vol: number, 
    fallbackMode: boolean,
    reqIsTTS: boolean,
    reqCustomText: string
  ) => {
    // 1. Reset any running soundboards
    stopAllPlayback();

    setCurrentAnnouncement(announcement);
    setPlayingStatus('playing');

    // Sync status update to Operator panel
    if (broadcastChannelRef.current) {
      broadcastChannelRef.current.postMessage({
        type: 'RECEIVER_STATUS',
        payload: { active: true, playingId: announcement.title }
      });
    }

    const onAudioEnded = () => {
      setPlayingStatus('idle');
      setCurrentAnnouncement(null);
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.postMessage({
          type: 'RECEIVER_STATUS',
          payload: { active: true, playingId: null }
        });
      }
    };

    // Unified voice fallback handler
    const runSpeechFallback = () => {
      if (fallbackMode) {
        playSyntheticGong(vol).then(() => {
          const speechPhrase = reqIsTTS ? reqCustomText : `Atenção: ${announcement.title}`;
          speakPortugueseText(speechPhrase, vol, onAudioEnded);
        });
      } else {
        onAudioEnded();
      }
    };

    // Route A: Direct Text to Speech Broadcast
    if (reqIsTTS) {
      playSyntheticGong(vol).then(() => {
        speakPortugueseText(reqCustomText, vol, onAudioEnded);
      });
      return;
    }

    // Route B: Custom files fetched from Server (statically) or local IndexedDB fallback
    if (isCustom) {
      try {
        let finalUrl = announcement.audioUrl;
        
        // Ensure path uses /uploads served by fullstack server if it's a raw filename
        if (!finalUrl.startsWith('http') && !finalUrl.startsWith('/') && !finalUrl.startsWith('blob:')) {
          finalUrl = `/uploads/${encodeURIComponent(finalUrl)}`;
        }

        const player = new Audio(finalUrl);
        player.volume = vol;
        audioRef.current = player;
        
        player.onended = onAudioEnded;
        player.onerror = async () => {
          console.warn(`Network audio ${finalUrl} failed. Checking local IndexedDB cache fallback...`);
          try {
            const fileBlob = await getAudioFile(announcement.audioUrl);
            if (fileBlob) {
              const fileUrl = URL.createObjectURL(fileBlob);
              const fallbackPlayer = new Audio(fileUrl);
              fallbackPlayer.volume = vol;
              audioRef.current = fallbackPlayer;
              fallbackPlayer.onended = onAudioEnded;
              fallbackPlayer.onerror = runSpeechFallback;
              fallbackPlayer.play().catch(runSpeechFallback);
            } else {
              runSpeechFallback();
            }
          } catch (offlineErr) {
            runSpeechFallback();
          }
        };

        player.play().catch(async (err) => {
          console.warn("Blocked by browser autoplay security rules or load error. Loading fallback...", err);
          runSpeechFallback();
        });
      } catch (err) {
        console.warn("Error setting up custom audio playing sequence:", err);
        runSpeechFallback();
      }
      return;
    }

    // Route C: Standard presets served on the server
    const player = new Audio(announcement.audioUrl);
    player.volume = vol;
    audioRef.current = player;

    player.onended = onAudioEnded;
    player.onerror = () => {
      console.warn(`Standard audio file ${announcement.audioUrl} not found. Running voice synthesized fallback.`);
      runSpeechFallback();
    };

    player.play().catch(err => {
      console.warn("Standard audio autoplay blocked by tab focus. Using speech synthesis fallback:", err);
      runSpeechFallback();
    });
  };

  // Turn off all running audio channels immediately
  const stopAllPlayback = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    setPlayingStatus('idle');
  };

  // Test sound function
  const triggerSelfTest = () => {
    playSyntheticGong(volume);
  };

  // Safe gesture unlocker to satisfy browser autoplay security policies (enables local Audio, TTS, and AudioContext)
  const unlockAudio = async () => {
    if (isAudioUnlockedRef.current) return;
    
    try {
      // 1. Un suspend/Initialize generic browser audio context
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const dummyCtx = new AudioCtx();
        if (dummyCtx.state === 'suspended') {
          await dummyCtx.resume();
        }
        dummyCtx.close();
      }
      
      // 2. Play warm major tone welcome ding to confirm output works
      await playSyntheticGong(volume);
      
      // 3. Trigger empty spoken utterance to fully warrant text-to-speech engine availability
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const dummyUtterance = new SpeechSynthesisUtterance('Alto falante ativo');
        dummyUtterance.lang = 'pt-BR';
        dummyUtterance.volume = volume;
        window.speechSynthesis.speak(dummyUtterance);
      }
      
      setIsAudioUnlocked(true);
      isAudioUnlockedRef.current = true;
      
      // 4. Instantly notify the dispatch operator that this client is fully unlocked
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.postMessage({
          type: 'RECEIVER_STATUS',
          payload: {
            active: true,
            playingId: currentAnnouncement?.title || null,
            isAudioUnlocked: true
          }
        });
      }
    } catch (err) {
      console.warn("Failed to activate player speaker outputs:", err);
    }
  };

  // Automatically intercepts any page clicks or keyboard inputs to seamlessly unlock audio in the background
  useEffect(() => {
    const handleBackgroundGesture = () => {
      if (!isAudioUnlockedRef.current) {
        unlockAudio();
      }
    };
    window.addEventListener('click', handleBackgroundGesture);
    window.addEventListener('keydown', handleBackgroundGesture);
    return () => {
      window.removeEventListener('click', handleBackgroundGesture);
      window.removeEventListener('keydown', handleBackgroundGesture);
    };
  }, [volume]);

  return (
    <div className="min-h-full flex-1 w-full bg-slate-50 text-slate-800 flex flex-col p-4 sm:p-6 md:p-8" id="player_terminal_viewport">
      
      {/* HEADER: Dynamic Status indicator */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-slate-200 pb-5" id="player_top_panel">
        <div className="flex items-center gap-3">
          <div className="bg-orange-600 p-2.5 rounded-lg text-white shadow-md shadow-orange-100 animate-pulse">
            <Radio className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold font-sans tracking-tight text-slate-800">HMMB • Terminal de Áudio Sincronizado</h1>
            <p className="text-xs text-orange-600 font-mono font-medium">Lobby & Som Ambiente Integrado</p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-slate-600 shadow-sm">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-orange-500 rounded-full animate-ping"></span>
            <span className="font-bold font-sans text-[10px] text-slate-700 uppercase tracking-wider">ESCUTANDO TRANSMISSÕES</span>
          </div>
          <span className="text-slate-300">|</span>
          <button 
            onClick={triggerSelfTest}
            className="text-slate-600 hover:text-slate-900 flex items-center gap-1 font-sans font-bold transition-colors cursor-pointer"
            title="Sintetizar som de gongo teste"
          >
            <Volume1 className="h-4 w-4 text-orange-600" /> Testar Alto-falante
          </button>
        </div>
      </div>

      {/* CORE DISPLAY STAGE */}
      <div className="flex-grow flex flex-col xl:flex-row gap-6 mt-6 items-stretch" id="player_core_grid">
        
        {/* Playback Focus Signboard (takes 2/3 on XL screens) */}
        <div className="flex-1 bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 md:p-10 flex flex-col items-center justify-between text-center relative overflow-hidden shadow-sm" id="visual_signage_screen">
          
          <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5 bg-slate-50 border border-slate-200/60 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold text-slate-500 shadow-xs">
            <Volume2 className="h-3 w-3 text-orange-600 animate-pulse" />
            VOLUME: {Math.round(volume * 100)}%
          </div>

          <AnimatePresence mode="wait">
            {playingStatus === 'playing' && currentAnnouncement ? (
              <motion.div
                key={currentAnnouncement.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.25 }}
                className="w-full flex-grow flex flex-col items-center justify-center space-y-8 py-6 z-10"
              >
                {/* Visual Category Alert Card */}
                <div className={`p-4 rounded-xl border max-w-lg mx-auto flex items-center justify-center gap-2 mb-2 font-mono font-bold text-xs ${
                  currentAnnouncement.category === 'success' 
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : currentAnnouncement.category === 'warning'
                    ? 'bg-amber-50 border-amber-200 text-amber-700'
                    : 'bg-rose-50 border-rose-200 text-rose-700 shadow-sm'
                }`}>
                  <Bell className="h-4 w-4 animate-bounce" />
                  {currentAnnouncement.category === 'success' ? 'COMUNICAÇÃO PADRÃO' :
                   currentAnnouncement.category === 'warning' ? 'AVISO / ORIENTAÇÃO' : 'CHAMADA DE URGÊNCIA'}
                </div>

                {/* Subtitle announcement text */}
                <div className="space-y-4">
                  <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-slate-900 font-sans tracking-tight leading-tight max-w-2xl px-2">
                    {isTTS ? (
                      <span className="text-indigo-600">"{customText}"</span>
                    ) : (
                      currentAnnouncement.title
                    )}
                  </h2>
                  <p className="text-slate-500 text-sm max-w-lg mx-auto font-sans font-medium">
                    {isTTS ? "Anúncio por voz sintetizado em tempo real pelas caixas do hospital." : currentAnnouncement.description}
                  </p>
                </div>

                {/* Countdown visual wave ring */}
                <div className="relative flex items-center justify-center h-28 w-28 mt-4">
                  {/* Rotating wave rings */}
                  <div className={`absolute inset-0 rounded-full border-2 border-dashed animate-spin ${
                    currentAnnouncement.category === 'success' ? 'border-orange-500/30' :
                    currentAnnouncement.category === 'warning' ? 'border-amber-500/30' : 'border-rose-500/30'
                  }`} style={{ animationDuration: '10s' }} />
                  <div className={`absolute inset-2 rounded-full border border-dashed animate-spin ${
                    currentAnnouncement.category === 'success' ? 'border-orange-500/20' :
                    currentAnnouncement.category === 'warning' ? 'border-amber-500/20' : 'border-rose-500/20'
                  }`} style={{ animationDuration: '6s', animationDirection: 'reverse' }} />
                  
                  {/* Center Seconds counter */}
                  <div className="absolute inset-4 rounded-full bg-slate-50 flex flex-col items-center justify-center shadow-inner border border-slate-200">
                    <span className="text-3xl font-extrabold font-mono text-slate-800">{secondsRemaining}</span>
                    <span className="text-[9px] uppercase tracking-wider font-bold text-slate-400">segundos</span>
                  </div>
                </div>

                {/* Beautiful active visual SVGs Waveform animated */}
                <div className="flex items-center justify-center gap-1 w-64 h-10 mt-6" id="player_wave_bars">
                  {[...Array(16)].map((_, i) => (
                    <motion.div
                      key={i}
                      className={`w-1 rounded-full ${
                        currentAnnouncement.category === 'success' ? 'bg-orange-500 animate-pulse' :
                        currentAnnouncement.category === 'warning' ? 'bg-amber-500 animate-pulse' : 'bg-rose-500 animate-pulse'
                      }`}
                      animate={{
                        height: [12, Math.random() * 32 + 10, 12]
                      }}
                      transition={{
                        repeat: Infinity,
                        duration: 0.5 + Math.random() * 0.4,
                        ease: "easeInOut"
                      }}
                    />
                  ))}
                </div>
              </motion.div>
            ) : !isAudioUnlocked ? (
              <motion.div
                key="unlock_required_state"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="w-full flex-grow flex flex-col items-center justify-center space-y-5 py-12 px-4"
              >
                <div className="h-14 w-14 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center shadow-xs animate-bounce">
                  <Volume2 className="h-6 w-6 text-amber-600" />
                </div>
                <div className="space-y-1.5 max-w-sm">
                  <h3 className="text-sm font-bold text-slate-800 font-sans tracking-tight">Alto-Falante Não Autorizado</h3>
                  <p className="text-xs text-slate-500 leading-relaxed font-sans">
                    Navegadores bloqueiam áudios automáticos por segurança. Clique no botão abaixo para habilitar o som das caixas acústicas do hospital.
                  </p>
                </div>
                <button
                  onClick={unlockAudio}
                  className="px-6 py-3 bg-orange-600 hover:bg-orange-500 active:scale-95 text-white font-sans text-xs font-bold rounded-xl shadow-lg shadow-orange-100 flex items-center gap-2 transition-all cursor-pointer border border-orange-500/10"
                >
                  <Volume2 className="h-3.5 w-3.5 fill-current" /> Ativar Alto-falantes do Receptor
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="idle_state"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="w-full flex-grow flex flex-col items-center justify-center space-y-4 py-12"
              >
                <div className="h-16 w-16 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center shadow-inner">
                  <Radio className="h-7 w-7 text-orange-600/50 animate-pulse" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-slate-700 font-sans">Aguardando Transmissão de Áudio</h3>
                  <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed font-sans">
                    Alto-falante ativo e operando. Deixe esta janela aberta para receber as transmissões do painel do operador.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* SIDE BAR PANEL: History and Monitor details */}
        <div className="w-full xl:w-80 bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-4 shadow-sm" id="player_history_sidebar">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <History className="h-4.5 w-4.5 text-slate-500" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-sans">Histórico de Transmissão</h3>
          </div>

          <div className="flex-grow space-y-2.5 overflow-y-auto max-h-80 xl:max-h-none pr-1">
            {history.length > 0 ? (
              history.map((h, idx) => (
                <div 
                  key={idx} 
                  className={`p-2.5 rounded-xl border text-xs flex flex-col gap-1 transition-all hover:bg-slate-50/50 ${
                    h.category === 'success' ? 'bg-white border-orange-100 text-slate-700' :
                    h.category === 'warning' ? 'bg-white border-amber-100 text-slate-700' :
                    'bg-white border-rose-100 text-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[9px] text-slate-400 font-bold">{h.time}</span>
                    <span className={`h-1.5 w-1.5 rounded-full ${
                      h.category === 'success' ? 'bg-orange-500' :
                      h.category === 'warning' ? 'bg-amber-500' : 'bg-rose-500'
                    }`} />
                  </div>
                  <p className="font-semibold font-sans truncate pr-1 text-slate-800" title={h.title}>{h.title}</p>
                </div>
              ))
            ) : (
              <p className="text-center py-10 text-xs text-slate-500 italic">Nenhum anúncio transmitido nesta sessão.</p>
            )}
          </div>

          <div className="bg-slate-500/10 p-3 rounded-xl border border-slate-200 text-[10px] text-slate-500 space-y-1 font-mono leading-relaxed">
            <p className="font-sans font-bold text-[11px] text-slate-600 mb-1 flex items-center gap-1">
              <CheckCircle className="h-3 w-3 text-orange-600" /> Como Funciona?
            </p>
            <p>1. Abra esta tela no terminal conectado às caixas acústicas do hospital.</p>
            <p>2. Opere o som tranquilamente na outra tab.</p>
            <p>3. Os comandos de volume, mudo e reproduções sincronizam instantaneamente.</p>
          </div>
        </div>

      </div>
    </div>
  );
}
