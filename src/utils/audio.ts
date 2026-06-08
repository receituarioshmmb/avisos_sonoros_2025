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

  // Cancel prior speech
  window.speechSynthesis.cancel();

  // Create utterance with portuguese config
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'pt-BR';
  utterance.rate = 0.95; // Slightly slower for crisp hospital announcements
  utterance.pitch = 1.0;
  utterance.volume = volume;

  // Attempt to select a natural portuguese speaker
  const voices = window.speechSynthesis.getVoices();
  const ptVoice = voices.find(v => 
    v.lang.toLowerCase().includes('pt-br') || 
    v.lang.toLowerCase().startsWith('pt')
  );
  if (ptVoice) {
    utterance.voice = ptVoice;
  }

  if (onEnd) {
    utterance.onend = () => onEnd();
    utterance.onerror = () => onEnd();
  }

  window.speechSynthesis.speak(utterance);
}
