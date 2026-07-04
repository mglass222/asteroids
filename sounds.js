const Sounds = (() => {
  let ctx = null;
  let master = null;
  let muted = false;
  const MASTER_VOL = 0.4;

  let thrustSource = null;
  let thrustGain = null;

  function init() {
    if (ctx) {
      if (ctx.state === "suspended") ctx.resume();
      return;
    }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER_VOL;
    master.connect(ctx.destination);
  }

  function setMuted(m) {
    muted = m;
    if (master) master.gain.value = muted ? 0 : MASTER_VOL;
  }

  function tone(freq, duration, type, vol, ramp) {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (ramp) {
      osc.frequency.exponentialRampToValueAtTime(ramp, ctx.currentTime + duration);
    }
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.02);
  }

  function noiseBurst(duration, vol, filterFreq) {
    if (!ctx) return;
    const len = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = filterFreq;
    filter.Q.value = 0.8;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
  }

  function setThrust(on) {
    if (!ctx) return;
    if (on && !thrustSource) {
      const len = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      }
      thrustSource = ctx.createBufferSource();
      thrustSource.buffer = buffer;
      thrustSource.loop = true;
      thrustGain = ctx.createGain();
      thrustGain.gain.value = 0.12;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 320;
      thrustSource.connect(filter);
      filter.connect(thrustGain);
      thrustGain.connect(master);
      thrustSource.start();
    } else if (!on && thrustSource) {
      const t = ctx.currentTime;
      thrustGain.gain.cancelScheduledValues(t);
      thrustGain.gain.setValueAtTime(thrustGain.gain.value, t);
      thrustGain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      thrustSource.stop(t + 0.05);
      thrustSource = null;
      thrustGain = null;
    }
  }

  function createUfoSound(large) {
    if (!ctx) return { stop() {} };

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();

    osc.type = "square";
    osc.frequency.value = large ? 200 : 520;
    lfo.frequency.value = large ? 5 : 11;
    lfoGain.gain.value = large ? 70 : 140;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    gain.gain.value = large ? 0.07 : 0.055;
    osc.connect(gain);
    gain.connect(master);
    lfo.start();
    osc.start();

    return {
      stop() {
        const t = ctx.currentTime;
        gain.gain.cancelScheduledValues(t);
        gain.gain.setValueAtTime(0, t);
        try {
          osc.stop(t);
          lfo.stop(t);
        } catch (_) { /* already stopped */ }
        osc.disconnect();
        lfo.disconnect();
        lfoGain.disconnect();
        gain.disconnect();
      },
    };
  }

  return {
    init,
    setMuted,

    fire() {
      tone(880, 0.06, "square", 0.12);
    },

    ufoFire() {
      tone(220, 0.08, "square", 0.1, 110);
    },

    heartbeat(high) {
      tone(high ? 72 : 58, 0.045, "square", 0.075);
    },

    asteroidHit(size) {
      const freqs = [120, 180, 260];
      noiseBurst(0.12 + size * 0.04, 0.18 - size * 0.03, freqs[size] || 260);
    },

    shipExplode() {
      noiseBurst(0.55, 0.35, 90);
      tone(60, 0.5, "sawtooth", 0.15, 30);
    },

    ufoExplode() {
      noiseBurst(0.35, 0.25, 200);
      tone(400, 0.25, "square", 0.1, 80);
    },

    hyperspace() {
      tone(200, 0.35, "sawtooth", 0.12, 1200);
      tone(400, 0.35, "sine", 0.06, 1600);
    },

    extraLife() {
      tone(523, 0.08, "square", 0.12);
      setTimeout(() => tone(659, 0.08, "square", 0.12), 80);
      setTimeout(() => tone(784, 0.15, "square", 0.14), 160);
    },

    setThrust,
    createUfoSound,
  };
})();
