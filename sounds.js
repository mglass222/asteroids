const Sounds = (() => {
  let ctx = null;
  let master = null;
  let muted = false;
  const MASTER_VOL = 0.4;
  const FIRE_SAMPLE_URL = "assets/fire.wav";
  const FIRE_RETRY_COOLDOWN_MS = 5000;

  let thrustSource = null;
  let thrustGain = null;
  let fireBuffer = null;
  let fireLoadPromise = null;
  let fireLoadFailedAt = 0;

  function init() {
    if (ctx) {
      if (ctx.state === "suspended") ctx.resume();
      return;
    }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER_VOL;
    master.connect(ctx.destination);
    loadFireSample();
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

  function assetUrl(path) {
    const version = window.ASTEROIDS_ASSET_VERSION;
    return version ? `${path}?v=${version}` : path;
  }

  function loadFireSample() {
    if (!ctx || fireLoadPromise) return fireLoadPromise;
    if (fireLoadFailedAt && Date.now() - fireLoadFailedAt < FIRE_RETRY_COOLDOWN_MS) {
      return null;
    }
    fireLoadPromise = fetch(assetUrl(FIRE_SAMPLE_URL))
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load ${FIRE_SAMPLE_URL}`);
        return res.arrayBuffer();
      })
      .then((data) => ctx.decodeAudioData(data))
      .then((buffer) => {
        fireBuffer = buffer;
        fireLoadFailedAt = 0;
      })
      .catch((err) => {
        fireLoadPromise = null;
        fireLoadFailedAt = Date.now();
        console.warn(err);
      });
    return fireLoadPromise;
  }

  function playBuffer(buffer, vol) {
    if (!ctx || !buffer) return false;
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = buffer;
    gain.gain.value = vol;
    src.connect(gain);
    gain.connect(master);
    src.onended = () => {
      src.disconnect();
      gain.disconnect();
    };
    src.start();
    return true;
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

    gain.gain.value = large ? 0.045 : 0.035;
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
      if (playBuffer(fireBuffer, 0.22)) return;
      loadFireSample();
      tone(1320, 0.045, "square", 0.1, 520);
      tone(660, 0.035, "square", 0.035, 330);
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
