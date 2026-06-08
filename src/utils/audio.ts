// Web Audio API & Speech Synthesis helpers

/**
 * Plays a high-quality 3-tone electronic hospital bell chime.
 * Ideal as a prefix for an announcement or as a default fallback system.
 */
export function playSyntheticGong(volume: number = 0.8): Promise<void> {
  return new Promise((resolve) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) {
        resolve();
        return;
      }
      
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const osc3 = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      // Warm major chord: F4 (349.23 Hz), A4 (440.00 Hz), C5 (523.25 Hz)
      osc1.frequency.setValueAtTime(349.23, now);
      osc2.frequency.setValueAtTime(440.00, now);
      osc3.frequency.setValueAtTime(523.25, now);
      
      osc1.type = 'sine';
      osc2.type = 'sine';
      osc3.type = 'sine';
      
      gainNode.gain.setValueAtTime(0, now);
      // Gentle warning chime ramp
      gainNode.gain.linearRampToValueAtTime(volume * 0.3, now + 0.08);
      gainNode.gain.setValueAtTime(volume * 0.3, now + 0.3);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 1.8);
      
      osc1.connect(gainNode);
      osc2.connect(gainNode);
      osc3.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      osc1.start(now);
      osc2.start(now);
      osc3.start(now);
      
      osc1.stop(now + 2.0);
      osc2.stop(now + 2.0);
      osc3.stop(now + 2.0);
      
      setTimeout(() => {
        ctx.close();
        resolve();
      }, 2000);
    } catch (e) {
      console.warn("Could not play synthesized audio:", e);
      resolve();
    }
  });
}

/**
 * Speaks a text in Portuguese using Browser Text-To-Speech (SpeechSynthesis).
 */
export function speakPortugueseText(text: string, volume: number = 1.0, onEnd?: () => void): void {
  if (!('speechSynthesis' in window)) {
    if (onEnd) onEnd();
    return;
  }

  // Cancel prior speech to prevent overlap
  window.speechSynthesis.cancel();

  // Create utterance with portuguese config
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'pt-BR';
  // A calm, serene, and slower rate is highly reassuring (standard is 1.0; 0.85 is beautifully paced)
  utterance.rate = 0.83; 
  // Pitch set slightly above 1.0 for a warm, soft, and crystal-clear high-quality tone
  utterance.pitch = 1.03; 
  utterance.volume = volume;

  // Retrieve available voices on the current browser device
  const voices = window.speechSynthesis.getVoices();
  const ptVoices = voices.filter(v => 
    v.lang.toLowerCase().includes('pt-br') || 
    v.lang.toLowerCase().startsWith('pt')
  );

  // Preference list for known pleasant Portuguese female speakers or female indicators
  const femaleKeywords = [
    'maria', 'luciana', 'heloisa', 'francisca', 'victoria', 
    'joana', 'female', 'mulher', 'zira', 'samantha', 'leticia', 
    'fernanda', 'camila', 'raquel', 'clara', 'ana', 'rita', 
    'ines', 'carolina', 'yolanda', 'helena', 'claudia'
  ];

  // Specific male keywords to filter out male voices (like Microsoft Daniel / Felipe / Google Male etc.)
  const maleKeywords = [
    'daniel', 'felipe', 'ricardo', 'lucas', 'marcos', 
    'helio', 'male', 'homem', 'guy', 'thiago', 'junior', 
    'filipe', 'standard', 'narrator-male'
  ];

  // Filter out any voice with clear male indicators
  const cleanPtVoices = ptVoices.filter(v => {
    const name = v.name.toLowerCase();
    return !maleKeywords.some(mw => name.includes(mw));
  });

  // 1. Look for pt-BR voices that contain female name keywords or Google's native female voice
  let selectedVoice = cleanPtVoices.find(v => {
    const name = v.name.toLowerCase();
    const isPtBr = v.lang.toLowerCase().includes('pt-br');
    return isPtBr && (
      femaleKeywords.some(fw => name.includes(fw)) ||
      (name.includes('google') && isPtBr) // Chrome's "Google português do Brasil" is high-quality female
    );
  });

  // 2. Look for any pt-BR voice that does not have male keywords
  if (!selectedVoice) {
    selectedVoice = cleanPtVoices.find(v => v.lang.toLowerCase().includes('pt-br'));
  }

  // 3. Look for any Portuguese voice (e.g., pt-PT) that contains female keywords
  if (!selectedVoice) {
    selectedVoice = cleanPtVoices.find(v => {
      const name = v.name.toLowerCase();
      return femaleKeywords.some(fw => name.includes(fw));
    });
  }

  // 4. Default to any clean pt voice
  if (!selectedVoice && cleanPtVoices.length > 0) {
    selectedVoice = cleanPtVoices[0];
  }

  // 5. Ultimate fallback to any pt voice
  if (!selectedVoice && ptVoices.length > 0) {
    selectedVoice = ptVoices[0];
  }

  if (selectedVoice) {
    utterance.voice = selectedVoice;
  }

  if (onEnd) {
    utterance.onend = () => onEnd();
    utterance.onerror = () => onEnd();
  }

  window.speechSynthesis.speak(utterance);
}

// Prime the voices cache on module load to prevent empty getVoices() on first speak
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.getVoices();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.getVoices();
    };
  }
}

