import { useRef, useEffect, useCallback } from 'react';

/**
 * useRepSound — Web Audio API + Speech Synthesis hook for workout sound feedback.
 *
 * - Rep success: short high-pitched beep (800Hz, 150ms) + TTS announces rep number
 * - WARNING feedback: low buzzer "แต่ด" sound (~150Hz, 300ms, sawtooth wave)
 *
 * @param {number} reps - current rep count
 * @param {string} feedback - current form feedback text
 * @param {boolean} soundEnabled - whether sound is on
 */
export default function useRepSound(reps, feedback, soundEnabled) {
    const audioCtxRef = useRef(null);
    const lastWarningTimeRef = useRef(0);
    const prevRepsRef = useRef(reps);
    const prevFeedbackRef = useRef(feedback);
    const isFirstRender = useRef(true);

    // Lazily create AudioContext (must be after user gesture)
    const getAudioCtx = useCallback(() => {
        if (!audioCtxRef.current) {
            audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
        }
        // Resume if suspended (browser autoplay policy)
        if (audioCtxRef.current.state === 'suspended') {
            audioCtxRef.current.resume();
        }
        return audioCtxRef.current;
    }, []);

    // Play a clean high-pitched beep for rep success
    const playRepSound = useCallback(() => {
        const ctx = getAudioCtx();
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(1000, now + 0.08);

        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.15);
    }, [getAudioCtx]);

    // Play a low buzzer "แต่ด" for WARNING
    const playWarningSound = useCallback(() => {
        const ctx = getAudioCtx();
        const now = ctx.currentTime;

        // First beep "ติ๊ด"
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(1200, now);

        gain1.gain.setValueAtTime(0.35, now);
        gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

        osc1.connect(gain1);
        gain1.connect(ctx.destination);

        osc1.start(now);
        osc1.stop(now + 0.1);

        // Second beep "ติ๊ด" (after 150ms gap)
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();

        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1200, now + 0.25);

        gain2.gain.setValueAtTime(0.001, now);
        gain2.gain.setValueAtTime(0.35, now + 0.25);
        gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

        osc2.connect(gain2);
        gain2.connect(ctx.destination);

        osc2.start(now + 0.25);
        osc2.stop(now + 0.35);
    }, [getAudioCtx]);

    // Speak rep count using Web Speech API
    const speakRepCount = useCallback((repNumber) => {
        if (!window.speechSynthesis) return;

        // Cancel any queued speech to avoid overlap
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(String(repNumber));
        utterance.rate = 1.3;     // slightly faster for exercise pace
        utterance.pitch = 1.1;    // slightly higher for clarity
        utterance.volume = 1.0;   // max volume
        utterance.lang = 'en-US'; // English numbers for universal clarity

        window.speechSynthesis.speak(utterance);
    }, []);

    // Watch reps change → play rep sound + speak rep number
    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            prevRepsRef.current = reps;
            prevFeedbackRef.current = feedback;
            return;
        }

        if (!soundEnabled) {
            prevRepsRef.current = reps;
            return;
        }

        if (reps > prevRepsRef.current) {
            playRepSound();
            // Speak the rep number after a short delay so beep plays first
            setTimeout(() => speakRepCount(reps), 200);
        }
        prevRepsRef.current = reps;
    }, [reps, soundEnabled, playRepSound, speakRepCount]);

    // Watch feedback change → play warning (debounced 2s)
    useEffect(() => {
        if (!soundEnabled) {
            prevFeedbackRef.current = feedback;
            return;
        }

        const isWarning = feedback && feedback.startsWith('WARNING');
        const wasWarning = prevFeedbackRef.current && prevFeedbackRef.current.startsWith('WARNING');

        // Only trigger on transition TO a warning state
        if (isWarning && !wasWarning) {
            const now = Date.now();
            if (now - lastWarningTimeRef.current > 2000) {
                lastWarningTimeRef.current = now;
                playWarningSound();
            }
        }
        prevFeedbackRef.current = feedback;
    }, [feedback, soundEnabled, playWarningSound]);

    // Cleanup AudioContext + Speech on unmount
    useEffect(() => {
        return () => {
            if (audioCtxRef.current) {
                audioCtxRef.current.close();
                audioCtxRef.current = null;
            }
            if (window.speechSynthesis) {
                window.speechSynthesis.cancel();
            }
        };
    }, []);
}
