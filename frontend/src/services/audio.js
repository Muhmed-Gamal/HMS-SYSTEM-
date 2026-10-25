/**
 * HMS Barcode System - Audio Effects Service
 * Uses Web Audio API for instantaneous scanner sound feedback
 */

let audioCtx = null;

function getAudioContext() {
    if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) audioCtx = new AudioContextClass();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

function playTone(freq, type, duration, delay = 0) {
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        setTimeout(() => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, ctx.currentTime);
            gain.gain.setValueAtTime(0.12, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + duration);
        }, delay);
    } catch (e) {
        // Audio error ignored silently
    }
}

export function playBeepSuccess() {
    playTone(987.77, 'sine', 0.08, 0);
    playTone(1318.51, 'sine', 0.10, 80);
}

export function playBeepError() {
    playTone(220, 'sawtooth', 0.18, 0);
    playTone(180, 'sawtooth', 0.22, 140);
}
