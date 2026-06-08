import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, Square, Trash2, Megaphone, Clock, Plus, Search, 
  FileAudio, Tv, Settings, Activity, Sparkles, ExternalLink, 
  X, ChevronRight, Mic, Info, Bell, Wifi, Layers, PlusCircle, AlertTriangle,
  Volume2, VolumeX
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Announcement, QueueItem, SyncMessage } from '../types';
import { INITIAL_ANNOUNCEMENTS } from '../data';
import { playSyntheticGong, speakPortugueseText } from '../utils/audio';
import { saveAudioFile, getAudioFile, listAudioFiles, deleteAudioFile } from '../utils/db';

export default function OperatorPanel() {
  // Soundboard State
  const [announcements, setAnnouncements] = useState<Announcement[]>(INITIAL_ANNOUNCEMENTS);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  
  // Custom uploaded files State
  const [customFiles, setCustomFiles] = useState<{ name: string; url: string; size: number }[]>([]);
  const [uploadError, setUploadError] = useState('');
  
  // Playback Control States
  const [playbackOutput, setPlaybackOutput] = useState<'local' | 'remote' | 'both'>('both');
  const [volume, setVolume] = useState<number>(80); // 0 to 100
  const [isMuted, setIsMuted] = useState(false);
  const [fallbackMode, setFallbackMode] = useState<boolean>(true); // Fallback to synthesized bell + TTS if file fails
  
  // Statuses
  const [isReceiverConnected, setIsReceiverConnected] = useState<boolean>(false);
  const [isReceiverUnlocked, setIsReceiverUnlocked] = useState<boolean>(true);
  const [currentLocalPlaying, setCurrentLocalPlaying] = useState<string | null>(null);
  const [currentBroadcasting, setCurrentBroadcasting] = useState<string | null>(null);
  const [lastPlayedItem, setLastPlayedItem] = useState<string>('');
  
  // Text to Speech Custom Announcer State
  const [ttsText, setTtsText] = useState('');
  const [ttsCategory, setTtsCategory] = useState<'success' | 'warning' | 'danger'>('warning');

  // Queue State
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [autoPlayQueue, setAutoPlayQueue] = useState(true);

  // References
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const localAudioRef = useRef<HTMLAudioElement | null>(null);
  const currentLocalTimerRef = useRef<any>(null);

  // Initialize Broadcast Channel and load Custom Audios from IndexedDB
  useEffect(() => {
    // 1. Setup Broadcast Channel
    const pChan = new BroadcastChannel('hmmb_audio_system');
    broadcastChannelRef.current = pChan;

    // Heartbeat mechanism to detect secondary player screen
    const checkConnection = () => {
      pChan.postMessage({ type: 'PING' });
    };

    pChan.onmessage = (event) => {
      const msg = event.data;
      if (msg.type === 'PONG') {
        setIsReceiverConnected(true);
      } else if (msg.type === 'RECEIVER_STATUS') {
        setIsReceiverConnected(msg.payload?.active || false);
        setIsReceiverUnlocked(msg.payload?.isAudioUnlocked !== false);
        if (msg.payload?.playingId) {
          setCurrentBroadcasting(msg.payload.playingId);
        } else {
          setCurrentBroadcasting(null);
        }
      }
    };

    // Ping every 3 seconds to keep track of connection status
    const pingInterval = setInterval(checkConnection, 3000);
    // Initial ping
    checkConnection();

    // 2. Load custom audios from DB
    loadCustomFilesFromDB();

    return () => {
      clearInterval(pingInterval);
      pChan.close();
      if (currentLocalTimerRef.current) clearTimeout(currentLocalTimerRef.current);
    };
  }, []);

  // Update dynamic URLs when customFiles list shifts
  const loadCustomFilesFromDB = async () => {
    try {
      const fileNames = await listAudioFiles();
      const loaded: { name: string; url: string; size: number }[] = [];
      
      for (const name of fileNames) {
        const blob = await getAudioFile(name);
        if (blob) {
          loaded.push({
            name,
            url: URL.createObjectURL(blob),
            size: Math.round(blob.size / 1024) // KB
          });
        }
      }
      setCustomFiles(loaded);
    } catch (e) {
      console.error("Failed to load files from IndexedDB", e);
    }
  };

  // Broadcast any changes to volume to the Player Screen
  useEffect(() => {
    if (broadcastChannelRef.current) {
      broadcastChannelRef.current.postMessage({
        type: 'SET_VOLUME',
        payload: { volume: isMuted ? 0 : volume / 100 }
      });
    }
  }, [volume, isMuted]);

  // Synchronize custom files retrieved from DB to announcements list automatically
  useEffect(() => {
    const customAnnouncements: Announcement[] = customFiles.map((file, idx) => ({
      id: 'custom_' + file.name,
      title: file.name.replace(/\.[^/.]+$/, ""), // remove extension
      audioUrl: file.name,
      category: 'custom' as any, // assigned custom category
      description: 'Áudio customizado em formato MP3, gravado com sucesso no projeto e mantido entre recarregamentos.',
      duration: 10, // approximate duration estimate
      isCustom: true
    }));
    
    setAnnouncements([...INITIAL_ANNOUNCEMENTS, ...customAnnouncements]);
  }, [customFiles]);

  // Sync state when queue plays
  useEffect(() => {
    if (autoPlayQueue && queue.length > 0 && !currentLocalPlaying && !currentBroadcasting) {
      // Find the first pending item
      const nextItem = queue.find(q => q.status === 'pending');
      if (nextItem) {
        triggerPlayItem(nextItem);
      }
    }
  }, [queue, currentLocalPlaying, currentBroadcasting, autoPlayQueue]);

  // Method to launch external visual receptor tab
  const openPlayerTab = () => {
    window.open(window.location.origin + '?mode=player', '_blank', 'width=1000,height=700,status=no,menubar=no');
  };

  // Custom Local playback engine
  const playLocalAudioEngine = (
    title: string, 
    sourceUrl: string, 
    category: string,
    isTTS: boolean = false, 
    ttsTextContent: string = ""
  ) => {
    // Stop prior local audios & timers
    if (localAudioRef.current) {
      localAudioRef.current.pause();
      localAudioRef.current = null;
    }
    if (currentLocalTimerRef.current) {
      clearTimeout(currentLocalTimerRef.current);
    }

    const currentVol = isMuted ? 0 : volume / 100;
    setCurrentLocalPlaying(title);

    const onPlaybackFinished = () => {
      setCurrentLocalPlaying(null);
    };

    const handleSpeechFallback = () => {
      if (fallbackMode) {
        // First play digital chime, then speak title or ttsTextContent
        playSyntheticGong(currentVol).then(() => {
          const phrase = isTTS ? ttsTextContent : `Atenção: ${title}`;
          speakPortugueseText(phrase, currentVol, onPlaybackFinished);
        });
      } else {
        onPlaybackFinished();
      }
    };

    if (isTTS) {
      // Direct Text to speech
      playSyntheticGong(currentVol).then(() => {
        speakPortugueseText(ttsTextContent, currentVol, onPlaybackFinished);
      });
    } else {
      // Try playing the real audio file
      const audio = new Audio(sourceUrl);
      audio.volume = currentVol;
      localAudioRef.current = audio;

      audio.onended = onPlaybackFinished;
      audio.onerror = () => {
        console.warn(`Local audio "${sourceUrl}" failed to find/load. Using voice fallback.`);
        handleSpeechFallback();
      };

      audio.play().catch((err) => {
        console.warn("Audio autoplay blocked or failed. Loading speech synthesis fallback:", err);
        handleSpeechFallback();
      });
    }
  };

  // Main action dispatch hub
  const playAnnouncement = (item: Announcement, isCustom: boolean = false) => {
    setLastPlayedItem(item.title);
    const actIsCustom = isCustom || item.category === 'custom' || (item as any).isCustom || false;

    // 1. Play Locally if required
    if (playbackOutput === 'local' || playbackOutput === 'both') {
      const audioSrc = actIsCustom 
        ? (customFiles.find(f => f.name === item.audioUrl || f.name === item.title)?.url || item.audioUrl) 
        : item.audioUrl;
      playLocalAudioEngine(item.title, audioSrc, item.category);
    }

    // 2. Play Remotely if required
    if (playbackOutput === 'remote' || playbackOutput === 'both') {
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.postMessage({
          type: 'PLAY',
          payload: {
            announcement: item,
            isCustom: actIsCustom,
            volume: isMuted ? 0 : volume / 100,
            fallbackMode
          }
        });
        
        // Simulating broadcasting activation if receiver is not running
        if (!isReceiverConnected) {
          setCurrentBroadcasting(item.title);
          // Auto clear broadcast indicator after mock duration
          setTimeout(() => {
            setCurrentBroadcasting(null);
          }, (item.duration || 6) * 1000);
        }
      }
    }
  };

  // Custom File Uploader logic
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('audio/')) {
      setUploadError('Formato de arquivo inválido. Por favor envie apenas arquivos de áudio (.mp3).');
      return;
    }

    if (file.size > 8 * 1024 * 1024) { // 8MB limit
      setUploadError('Arquivo muito grande. Limite de tamanho: 8MB.');
      return;
    }

    setUploadError('');
    try {
      await saveAudioFile(file.name, file);
      await loadCustomFilesFromDB();

      // Notify player screen of new files loaded
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.postMessage({ type: 'REFRESH_ASSETS' });
      }
    } catch (err: any) {
      setUploadError('Falha ao salvar no banco local IndexedDB: ' + (err.message || err));
    }
  };

  // Remove uploaded file
  const removeUploadedAudio = async (filename: string) => {
    try {
      await deleteAudioFile(filename);
      await loadCustomFilesFromDB();
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.postMessage({ type: 'REFRESH_ASSETS' });
      }
    } catch (err) {
      console.error("Failed to delete file", err);
    }
  };

  // Text-To-Speech announcement trigger
  const playCustomTTS = () => {
    if (!ttsText.trim()) return;

    const mockAnnouncement: Announcement = {
      id: 'tts_' + Date.now(),
      title: 'Aviso Personalizado Recitado',
      description: ttsText,
      audioUrl: '',
      category: ttsCategory,
      duration: Math.ceil(ttsText.length / 12) + 2
    };

    setLastPlayedItem('Aviso Personalizado: ' + ttsText.substring(0, 30) + '...');

    if (playbackOutput === 'local' || playbackOutput === 'both') {
      playLocalAudioEngine('Aviso Geral', '', ttsCategory, true, ttsText);
    }

    if (playbackOutput === 'remote' || playbackOutput === 'both') {
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.postMessage({
          type: 'PLAY',
          payload: {
            announcement: mockAnnouncement,
            isTTS: true,
            volume: isMuted ? 0 : volume / 100,
            fallbackMode: true,
            customText: ttsText
          }
        });
      }
    }
  };

  // General audio stop commands
  const stopAllAudios = () => {
    // Stop local
    if (localAudioRef.current) {
      localAudioRef.current.pause();
      localAudioRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setCurrentLocalPlaying(null);

    // Stop remote
    if (broadcastChannelRef.current) {
      broadcastChannelRef.current.postMessage({ type: 'STOP' });
    }
    setCurrentBroadcasting(null);
  };

  // Queue Operations
  const addToQueue = (item: Announcement, isCustom = false) => {
    const fresh: QueueItem = {
      id: 'q_' + Date.now() + Math.random().toString(36).substr(2, 4),
      announcement: isCustom ? {
        ...item,
        id: 'cust_' + item.id
      } : item,
      status: 'pending'
    };
    setQueue(prev => [...prev, fresh]);
  };

  const addCustomTtsToQueue = () => {
    if (!ttsText.trim()) return;
    const mockAnnouncement: Announcement = {
      id: 'tts_' + Date.now(),
      title: 'Aviso de Voz: ' + ttsText.substring(0, 32) + (ttsText.length > 32 ? '...' : ''),
      description: ttsText,
      audioUrl: '',
      category: ttsCategory,
      duration: Math.ceil(ttsText.length / 10) + 2
    };

    const fresh: QueueItem = {
      id: 'q_' + Date.now(),
      announcement: mockAnnouncement,
      customText: ttsText,
      status: 'pending'
    };
    setQueue(prev => [...prev, fresh]);
    setTtsText('');
  };

  const removeFromQueue = (id: string) => {
    setQueue(prev => prev.filter(q => q.id !== id));
  };

  const clearQueue = () => {
    setQueue([]);
  };

  const triggerPlayItem = (qItem: QueueItem) => {
    // mark as playing
    setQueue(prev => prev.map(qi => qi.id === qItem.id ? { ...qi, status: 'playing' as const } : qi));
    
    // play
    if (qItem.customText) {
      // it was a custom tts
      if (playbackOutput === 'local' || playbackOutput === 'both') {
        playLocalAudioEngine(qItem.announcement.title, '', qItem.announcement.category, true, qItem.customText);
      }
      if (playbackOutput === 'remote' || playbackOutput === 'both') {
        if (broadcastChannelRef.current) {
          broadcastChannelRef.current.postMessage({
            type: 'PLAY',
            payload: {
              announcement: qItem.announcement,
              isTTS: true,
              volume: isMuted ? 0 : volume / 100,
              fallbackMode: true,
              customText: qItem.customText
            }
          });
        }
      }
    } else {
      // standard item
      const isCustomKey = qItem.announcement.id.startsWith('cust_');
      const baseAnn = isCustomKey 
        ? { ...qItem.announcement, id: qItem.announcement.id.replace('cust_', '') }
        : qItem.announcement;
      playAnnouncement(baseAnn, isCustomKey);
    }

    // listen to finish to mark completed
    const estSecs = (qItem.announcement.duration || 6) * 1000;
    setTimeout(() => {
      setQueue(prev => prev.map(qi => qi.id === qItem.id ? { ...qi, status: 'completed' as const } : qi).filter(qi => qi.status !== 'completed'));
    }, estSecs);
  };

  // Filter list
  const filteredAnnouncements = announcements.filter(item => {
    const matchSearch = item.title.toLowerCase().includes(search.toLowerCase()) || 
                        item.description.toLowerCase().includes(search.toLowerCase());
    const matchCat = selectedCategory === 'all' || item.category === selectedCategory;
    return matchSearch && matchCat;
  });

  return (
    <div className="min-h-full flex-1 w-full bg-slate-50 text-slate-800 flex flex-col md:flex-row pb-12" id="operator_viewport_container">
      {/* LEFT SIDEBAR: Operator Controls & System Status */}
      <div className="w-full md:w-80 bg-white text-slate-800 p-6 flex flex-col justify-between border-r border-slate-250 shadow-sm" id="operator_sidebar">
        <div>
          {/* HMMB Header */}
          <div className="flex items-center gap-3 mb-6" id="hmmb_header_logo_area">
            <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center text-white font-bold shadow-md shadow-emerald-100">
              H
            </div>
            <div>
              <h1 className="text-xl font-bold font-sans tracking-tight text-slate-800">
                HMMB <span className="text-slate-400 font-normal">| Anúncios</span>
              </h1>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-mono">Console de Controle v1.2</p>
            </div>
          </div>

          <div className="border-t border-slate-200/80 my-4" />

          {/* Quick System Connection Indicator */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 mb-5 animate-fade-in" id="sync_status_indicators">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 font-sans flex items-center gap-2 mb-2">
              <Activity className="h-3.5 w-3.5 text-emerald-500" /> STATUS DE CONEXÃO
            </h2>
            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Tela Secundária:</span>
                {isReceiverConnected ? (
                  <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-md font-sans text-[10px] border border-emerald-200 font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> CONECTADO
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 px-2.5 py-0.5 rounded-md font-sans text-[10px] border border-amber-200 font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> AGUARDANDO
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1 pt-2 border-t border-slate-200/60">
                <span className="text-slate-500 text-[11px]">Canal Sincronizado: <strong className="text-slate-700 font-mono">hmmb_audio_system</strong></span>
              </div>
              
              {isReceiverConnected && !isReceiverUnlocked && (
                <div className="mt-2.5 p-2.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg text-[11px] leading-relaxed font-sans font-medium flex items-start gap-1.5">
                  <span className="text-xs">⚠️</span>
                  <div>
                    <p className="font-bold text-[11px]">Alto-falante Bloqueado</p>
                    <p className="text-[10px] text-amber-700 font-normal mt-0.5">Clique no botão verde de ativação de som na aba do receptor para habilitar os avisos automáticos.</p>
                  </div>
                </div>
              )}
            </div>

            {/* CTA to open second tab */}
            <button 
              onClick={openPlayerTab}
              className="mt-3.5 w-full bg-slate-900 hover:bg-slate-800 active:scale-95 text-white py-2 px-3 rounded-lg font-sans text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-sm"
              id="btn_open_player_tab"
            >
              <Tv className="h-3.5 w-3.5" /> Abrir Tela do Receptor
              <ExternalLink className="h-3 w-3 text-slate-300" />
            </button>
          </div>

          {/* Audio Output Selector */}
          <div className="space-y-2 mb-5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block font-sans">
              Direcionar Saída de Som:
            </label>
            <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200/55" id="output_direction_selectors">
              {(['local', 'remote', 'both'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setPlaybackOutput(mode)}
                  className={`text-[11px] py-1.5 px-1 rounded-md capitalize font-semibold transition-all ${
                    playbackOutput === mode
                      ? 'bg-white text-slate-900 border border-slate-200/40 font-bold shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {mode === 'local' ? 'Local' : mode === 'remote' ? 'Auto-falante' : 'Ambos'}
                </button>
              ))}
            </div>
          </div>

          {/* Volume Control */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2 mb-5" id="sidebar_volume_section">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 font-sans">Volume Geral</span>
              <span className="text-xs text-slate-700 font-mono font-bold">{isMuted ? 'MUDO' : `${volume}%`}</span>
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setIsMuted(!isMuted)} 
                className="text-slate-500 hover:text-slate-800 transition-colors"
                title={isMuted ? "Ativar som" : "Desativar som"}
              >
                {isMuted ? <VolumeX className="h-4 w-4 text-rose-500" /> : <Volume2 className="h-4 w-4 text-slate-600" />}
              </button>
              <input 
                type="range" 
                min="0" 
                max="100" 
                value={volume} 
                onChange={(e) => {
                  setVolume(Number(e.target.value));
                  if (isMuted) setIsMuted(false);
                }}
                className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
              />
            </div>
          </div>

          {/* Fallback settings */}
          <div className="flex items-center justify-between text-xs bg-slate-50 p-3 rounded-xl border border-slate-200" id="fallback_voice_override_setting">
            <span className="text-slate-600 font-medium font-sans">Sintetizador por Voz</span>
            <button
              onClick={() => setFallbackMode(!fallbackMode)}
              className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors focus:outline-none ${
                fallbackMode ? 'bg-emerald-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                  fallbackMode ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          <p className="text-[10px] text-slate-400 mt-1.5 pl-1 italic">
            Gera aviso falado em português se o MP3 não estiver disponível.
          </p>
        </div>

        {/* Footer info inside sidebar */}
        <div className="pt-6 border-t border-slate-100 text-[10px] text-slate-400 text-center uppercase tracking-wider font-semibold" id="developer_watermark">
          <p>Erian Oliveira — 2026</p>
        </div>
      </div>

      {/* RIGHT MAIN CONTAINER: Audio Grid & Text-To-Speech */}
      <div className="flex-1 p-4 sm:p-6 md:p-8 flex flex-col gap-6" id="dashboard_mainframe">
        
        {/* TOP STATUS BAR matching clean minimalist layout */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4" id="live_broadcasting_strip">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600 shadow-sm border border-emerald-100">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800 font-sans tracking-tight">Monitor de Transmissão Principal</h2>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mt-0.5">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  Local: {currentLocalPlaying ? (
                    <strong className="text-emerald-600 font-sans">"{currentLocalPlaying}"</strong>
                  ) : <span className="text-slate-400 font-medium">Livre / Ocioso</span>}
                </span>
                <span className="hidden sm:inline text-slate-300">|</span>
                <span className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${isReceiverConnected ? 'bg-indigo-500 animate-pulse' : 'bg-slate-300'}`}></span>
                  Recepção: {currentBroadcasting ? (
                    <strong className="text-indigo-600 font-sans">"{currentBroadcasting}"</strong>
                  ) : <span className="text-slate-400 font-medium">Livre / Ocioso</span>}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={stopAllAudios}
              className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white rounded-lg font-sans text-xs font-bold shadow-md shadow-rose-100 flex items-center gap-2 transition-colors cursor-pointer"
              id="global_stop_button"
            >
              <Square className="h-3.5 w-3.5 fill-current" /> PARAR TODOS OS ÁUDIOS
            </button>
          </div>
        </div>

        {/* MIDDLE SECTION: Grid and Side tools */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6" id="dashboard_grid_and_sidebar">
          
          {/* Main Soundboard Board (takes 2 cols in XL) */}
          <div className="xl:col-span-2 space-y-6">
            
            {/* Header & Categories */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-5" id="soundboard_collection_manager">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-slate-800 font-sans">Anúncios Hospitalares Disponíveis</h3>
                  <p className="text-xs text-slate-400 font-medium">Selecione uma mensagem abaixo para reprodução instantânea</p>
                </div>
                
                {/* Search Text */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Filtrar por nome do anúncio..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-sans w-full sm:w-60 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-medium"
                  />
                </div>
              </div>

              {/* Category Pills matching Clean Minimalism styling guidelines */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1 border-b border-slate-100 pb-3" id="category_pills_filters">
                {[
                  { id: 'all', label: 'Todos os Áudios', color: 'bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200/70' },
                  { id: 'success', label: 'Saudações & Boas-Vindas', color: 'bg-emerald-50/40 hover:bg-emerald-50 text-emerald-700 border border-emerald-100' },
                  { id: 'warning', label: 'Protocolos & Orientação', color: 'bg-amber-50/40 hover:bg-amber-50 text-amber-700 border border-amber-100' },
                  { id: 'danger', label: 'Chamadas e Emergência', color: 'bg-rose-50/40 hover:bg-rose-50 text-rose-700 border border-rose-100' },
                  { id: 'custom', label: 'Meus Áudios MP3', color: 'bg-indigo-50/40 hover:bg-indigo-50 text-indigo-700 border border-indigo-100' }
                ].map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`text-xs px-3.5 py-1.5 rounded-full font-semibold font-sans cursor-pointer transition-all ${
                      selectedCategory === cat.id 
                        ? 'bg-slate-900 text-white border-transparent scale-102 font-bold shadow-sm' 
                        : cat.color
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Render Announcements Grid in clean cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1" id="soundboard_grid">
                {filteredAnnouncements.length > 0 ? (
                  filteredAnnouncements.map((item) => {
                    const isSuccess = item.category === 'success';
                    const isWarning = item.category === 'warning';
                    const isCustom = item.category === 'custom';
                    
                    return (
                      <div 
                        key={item.id}
                        onClick={() => playAnnouncement(item)}
                        className={`p-4 rounded-xl border text-left transition-all hover:translate-y-[-1px] hover:shadow-md cursor-pointer group flex flex-col justify-between min-h-[140px] ${
                          isSuccess
                            ? 'bg-white border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/30' 
                            : isWarning
                            ? 'bg-white border-slate-200 hover:border-amber-500 hover:bg-amber-50/30'
                            : isCustom
                            ? 'bg-white border-slate-200 hover:border-indigo-500 hover:bg-indigo-50/30 border-l-4 border-l-indigo-500'
                            : 'bg-white border-rose-100 hover:border-rose-500 hover:bg-rose-550/10 border-l-4 border-l-rose-500'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-1.5">
                            <span className={`text-[9px] uppercase tracking-wider font-bold ${
                              isSuccess ? 'text-emerald-600' : isWarning ? 'text-amber-600' : isCustom ? 'text-indigo-600' : 'text-rose-600'
                            }`}>
                              {isSuccess ? 'GERAL' : isWarning ? 'SEGURANÇA & LOGÍSTICA' : isCustom ? 'ARQUIVO MP3 ENVIADO' : 'URGENTE'}
                            </span>
                            <span className="text-[10px] font-mono font-medium text-slate-400 group-hover:text-slate-600 transition-colors flex items-center gap-1">
                              <Clock className="w-3 h-3" /> ~{item.duration || 6}s
                            </span>
                          </div>
                          
                          <h4 className="font-semibold text-slate-800 text-sm group-hover:text-slate-950 transition-colors mt-1">
                            {item.title}
                          </h4>
                          <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed mt-1">
                            {item.description}
                          </p>
                        </div>

                        <div className="flex items-center justify-between border-t border-slate-100 pt-2.5 mt-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              addToQueue(item, isCustom);
                            }}
                            className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 p-1.5 rounded-lg transition-colors flex items-center gap-1 text-[11px] font-semibold"
                            title="Adicionar à lista de reprodução automática"
                          >
                            <Plus className="h-3.5 w-3.5" /> Enfileirar
                          </button>
                          
                          <span className={`text-xs px-2.5 py-1 rounded-md font-bold transition-all text-white flex items-center gap-1 ${
                            isSuccess ? 'bg-emerald-600 group-hover:bg-emerald-700' :
                            isWarning ? 'bg-amber-500 group-hover:bg-amber-600' : 
                            isCustom ? 'bg-indigo-600 group-hover:bg-indigo-700' : 'bg-rose-600 group-hover:bg-rose-700'
                          }`}>
                            <Play className="h-3 w-3 fill-current" /> Tocar
                          </span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="col-span-2 text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    <AlertTriangle className="h-8 w-8 text-amber-400 mx-auto mb-2" />
                    <p className="text-xs font-semibold text-slate-400 font-sans uppercase">Nenhum anúncio localizado</p>
                    <p className="text-xs text-slate-500 mt-1">Experimente buscar por outros termos.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Custom file management block (Meus Arquivos) */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4" id="custom_uploaded_files_area">
              <div>
                <h3 className="text-base font-bold text-slate-800 font-sans flex items-center gap-2">
                  <FileAudio className="h-5 w-5 text-emerald-600" /> Meus Arquivos MP3 Enviados
                </h3>
                <p className="text-xs text-slate-400 font-medium">Envie arquivos de áudio sob demanda para arquivar localmente</p>
              </div>

              {/* Upload field */}
              <div className="border-2 border-dashed border-slate-200 bg-slate-50/50 hover:bg-slate-50 p-6 rounded-xl text-center transition-all cursor-pointer">
                <label className="cursor-pointer block">
                  <input
                    type="file"
                    accept="audio/mp3,audio/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <div className="space-y-1.5">
                    <PlusCircle className="h-8 w-8 text-emerald-600 mx-auto" />
                    <p className="text-xs font-semibold text-slate-700">
                      Clique para <span className="text-emerald-700 underline">enviar novo áudio MP3</span>
                    </p>
                    <p className="text-[10px] text-slate-400">Armazenamento local seguro ilimitado de até 8MB</p>
                  </div>
                </label>
              </div>

              {uploadError && (
                <div className="bg-rose-50 border border-rose-100 text-rose-700 text-xs px-3 py-2 rounded-lg font-medium">
                  {uploadError}
                </div>
              )}

              {/* Uploaded items listing */}
              <div className="space-y-2 mt-2">
                {customFiles.length > 0 ? (
                  customFiles.map((file, idx) => {
                    const customAnnouncement: Announcement = {
                      id: 'custom_' + idx,
                      title: file.name.replace(/\.[^/.]+$/, ""), // remove extension
                      audioUrl: file.name,
                      category: 'warning',
                      description: 'Áudio customizado salvo localmente.',
                      duration: 8
                    };
                    return (
                      <div key={idx} className="flex items-center justify-between p-3.5 bg-slate-50 hover:bg-white border border-slate-200 rounded-xl text-xs transition-all hover:shadow-sm">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                            <FileAudio className="h-4.5 w-4.5" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-800 truncate" title={file.name}>{file.name}</p>
                            <p className="text-[10px] text-slate-400 font-mono font-medium">{file.size} KB • Salvo</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => addToQueue(customAnnouncement, true)}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-600 p-1.5 rounded-lg transition-colors"
                            title="Adicionar à fila"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => playAnnouncement(customAnnouncement, true)}
                            className="bg-slate-900 hover:bg-slate-800 text-white font-semibold py-1.5 px-3 rounded-lg font-sans text-xs flex items-center gap-1 transition-colors"
                          >
                            <Play className="h-3 w-3 fill-current" /> Tocar
                          </button>
                          <button
                            onClick={() => removeUploadedAudio(file.name)}
                            className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-1.5 rounded-lg transition-colors"
                            title="Deletar arquivo"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-center py-4 text-xs text-slate-400 italic">Nenhum arquivo customizado enviado até o momento.</p>
                )}
              </div>
            </div>

          </div>

          {/* Right side widgets: TTS Custom Voice & Announcement Queue */}
          <div className="space-y-6">
            
            {/* Custom Input Text Broadcast Widget (Microfone/TTS) */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4" id="custom_tts_microphone_widget">
              <div>
                <h3 className="text-base font-bold text-slate-800 font-sans flex items-center gap-2">
                  <Mic className="h-5 w-5 text-indigo-600" /> Transmissão de Voz (TTS)
                </h3>
                <p className="text-xs text-slate-400 font-medium">Insira um aviso customizado de viva-voz para ser proferido em lote</p>
              </div>

              {/* Text Area */}
              <div className="space-y-2.5">
                <textarea
                  value={ttsText}
                  onChange={(e) => setTtsText(e.target.value)}
                  placeholder="Ex: Dr. Carlos Eduardo comparecer à sala de triagem do Pronto Socorro..."
                  rows={4}
                  className="w-full text-xs font-sans p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-medium leading-relaxed"
                />
                
                {/* Category choices */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Estilo do Chime Inicial</label>
                  <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-lg text-[10px] font-sans font-semibold border border-slate-200/50">
                    {[
                      { id: 'success', label: 'Informativo' },
                      { id: 'warning', label: 'Orientação' },
                      { id: 'danger', label: 'Urgente' }
                    ].map(cat => (
                      <button
                        key={cat.id}
                        onClick={() => setTtsCategory(cat.id as any)}
                        className={`py-1 rounded text-center cursor-pointer transition-all ${
                          ttsCategory === cat.id
                            ? cat.id === 'success' ? 'bg-emerald-600 text-white shadow-xs font-bold' :
                              cat.id === 'warning' ? 'bg-amber-500 text-white shadow-xs font-bold' : 'bg-rose-600 text-white shadow-xs font-bold'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Trigger Buttons */}
              <div className="flex gap-2 pt-1.5">
                <button
                  type="button"
                  onClick={addCustomTtsToQueue}
                  disabled={!ttsText.trim()}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 font-sans text-xs font-semibold py-2 px-3 rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" /> Enfileirar
                </button>
                <button
                  type="button"
                  onClick={playCustomTTS}
                  disabled={!ttsText.trim()}
                  className="flex-1 bg-slate-900 hover:bg-slate-800 active:scale-97 disabled:opacity-50 text-white font-sans text-xs font-bold py-2 px-3 rounded-lg flex items-center justify-center gap-1 shadow transition-all cursor-pointer"
                >
                  <Play className="h-3.5 w-3.5 fill-current" /> Falar Agora
                </button>
              </div>
            </div>

            {/* SOUND QUEUE LIST CARD */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4" id="announcement_queue_card">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-800 font-sans flex items-center gap-2">
                    <Layers className="h-5 w-5 text-emerald-600" /> Fila de Sonorização
                  </h3>
                  <p className="text-xs text-slate-400 font-medium">Controle de lotes automatizado</p>
                </div>
                {queue.length > 0 && (
                  <button 
                    onClick={clearQueue}
                    className="text-xs text-rose-600 hover:text-rose-700 font-sans font-bold flex items-center gap-0.5"
                    title="Limpar toda a fila"
                  >
                    <Trash2 className="h-3 w-3" /> Limpar
                  </button>
                )}
              </div>

              {/* Automatic sequencer play switch */}
              <div className="flex items-center justify-between text-xs bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="text-slate-600 font-semibold font-sans">Reprodução Automática</span>
                <button
                  onClick={() => setAutoPlayQueue(!autoPlayQueue)}
                  className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors focus:outline-none ${
                    autoPlayQueue ? 'bg-emerald-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`inline-block h-2.5 w-2.5 transform rounded-full bg-white transition-transform ${
                      autoPlayQueue ? 'translate-x-4.5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Queue Items loop */}
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                <AnimatePresence initial={false}>
                  {queue.length > 0 ? (
                    queue.map((item) => (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2.5 ${
                          item.status === 'playing'
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-900 font-bold'
                            : 'bg-white border-slate-200 text-slate-700'
                        }`}
                      >
                        <div className="min-w-0 pr-1 space-y-0.5">
                          <p className="truncate font-sans md:text-xs">
                            {item.status === 'playing' && '🔊 '}
                            {item.announcement.title}
                          </p>
                          <p className="text-[10px] text-slate-400 truncate leading-none">
                            {item.customText ? 'Mensagem ditada' : `Arquivo: ${item.announcement.audioUrl}`}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {item.status === 'pending' && (
                            <button
                              onClick={() => triggerPlayItem(item)}
                              className="text-emerald-700 hover:text-emerald-600 bg-emerald-50 hover:bg-emerald-100 p-1 rounded-md"
                              title="Tocar agora"
                            >
                              <Play className="h-3 w-3" />
                            </button>
                          )}
                          <button
                            onClick={() => removeFromQueue(item.id)}
                            className="text-slate-400 hover:text-rose-500 hover:bg-slate-50 p-1 rounded-md"
                            title="Remover da fila"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      </motion.div>
                    ))
                  ) : (
                    <p className="text-center py-6 text-xs text-slate-400 italic">A fila de reprodução automática está vazia.</p>
                  )}
                </AnimatePresence>
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
