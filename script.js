let ctx;// web audio engine 
let masterGain;
const decks = { a: null, b: null };
const activeFX = {};

function ensureAudioContext() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();//process all the sound
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.85;
    masterGain.connect(ctx.destination);
    initVU();
    startMainVisualizer();
    buildKnobs();
    setupDragDrop();
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function createDeckChain(id) {
  const gain = ctx.createGain(); gain.gain.value = 0.8;
  const xGain = ctx.createGain(); xGain.gain.value = 1;
  const high = ctx.createBiquadFilter(); high.type='highshelf'; high.frequency.value=4000; high.gain.value=0;
  const mid  = ctx.createBiquadFilter(); mid.type='peaking';    mid.frequency.value=1000;  mid.Q.value=1; mid.gain.value=0;
  const low  = ctx.createBiquadFilter(); low.type='lowshelf';   low.frequency.value=250;   low.gain.value=0;
  const filter = ctx.createBiquadFilter(); filter.type='lowpass'; filter.frequency.value=ctx.sampleRate/2;
  const analyser = ctx.createAnalyser(); analyser.fftSize=1024; analyser.smoothingTimeConstant=0.8;
  const wfAnalyser = ctx.createAnalyser(); wfAnalyser.fftSize=1024;

  gain.connect(filter);
  filter.connect(high);
  high.connect(mid);
  mid.connect(low);
  low.connect(xGain);
  xGain.connect(analyser);
  analyser.connect(wfAnalyser);
  wfAnalyser.connect(masterGain);

  return {
    id, gain, xGain, high, mid, low, filter, analyser, wfAnalyser,
    buffer: null, source: null,
    playing: false, offset: 0, startTime: 0,
    bpm: null, pitchRate: 1,
    looping: false, loopSize: 4, loopStart: 0,
    cuePoints: [null,null,null,null],
    currentCue: 0,
    waveformData: null
  };
}

//  Load track
async function loadTrack(id, input) {
  ensureAudioContext();
  const file = input.files[0];
  if (!file) return;
  
  // Stop existing
  if (decks[id] && decks[id].source) {
    try { decks[id].source.stop(); } catch(e) {}
    decks[id].source = null;
  }
  
  decks[id] = createDeckChain(id);

  const trackName = file.name.replace(/\.[^.]+$/, '').toUpperCase();
  document.getElementById('name'+id.toUpperCase()).textContent = trackName;
  document.getElementById('meta'+id.toUpperCase()).textContent = 'LOADING...';
  setStatus(id, 'idle', 'LOADING');

  try {
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    decks[id].buffer = audioBuffer;
    
    const dur = audioBuffer.duration;
    const mins = Math.floor(dur/60);
    const secs = String(Math.floor(dur%60)).padStart(2,'0');
    document.getElementById('meta'+id.toUpperCase()).textContent = 
      `${(audioBuffer.sampleRate/1000).toFixed(1)}kHz · ${mins}:${secs} · ${audioBuffer.numberOfChannels}CH`;
    
    // Estimate BPM (simple energy-based)
    estimateBPM(id, audioBuffer);
    
    //  static waveform
    drawStaticWaveform(id, audioBuffer);
    
    setStatus(id, 'idle', 'READY');
    // Auto-play
    startDeck(id);
  } catch(err) {
    console.error('Decode error:', err);
    document.getElementById('name'+id.toUpperCase()).textContent = '⚠ DECODE ERROR';
    document.getElementById('meta'+id.toUpperCase()).textContent = err.message || 'TRY ANOTHER FORMAT (MP3, WAV, OGG)';
    setStatus(id, 'idle', 'ERROR');
  }
}

function startDeck(id) {
  const d = decks[id];
  if (!d || !d.buffer) return;
  ensureAudioContext();
  if (d.source) { try { d.source.stop(); } catch(e){} }

  const src = ctx.createBufferSource();
  src.buffer = d.buffer;
  src.playbackRate.value = d.pitchRate;
  src.loop = d.looping;
  if (d.looping) {
    src.loopStart = d.loopStart;
    src.loopEnd = d.loopStart + d.loopSize * (60 / (d.bpm || 120));
  }
  src.connect(d.gain);
  src.start(0, d.offset % d.buffer.duration);
  d.source = src;
  d.startTime = ctx.currentTime - d.offset;
  d.playing = true;
  document.getElementById('vinylA' === 'vinyl'+id.toUpperCase() ? 'vinylA' : 'vinyl'+id.toUpperCase()).classList.add('spinning');
  document.getElementById('vinyl'+id.toUpperCase()).classList.add('spinning');
  document.getElementById('playBtn'+id.toUpperCase()).textContent = '⏸ PAUSE';
  setStatus(id, 'playing', 'PLAYING');
  src.onended = () => {
    if (d.playing && !d.looping) {
      d.playing = false;
      d.offset = 0;
      document.getElementById('vinyl'+id.toUpperCase()).classList.remove('spinning');
      document.getElementById('playBtn'+id.toUpperCase()).textContent = '▶ PLAY';
      setStatus(id, 'idle', 'ENDED');
    }
  };
}

function togglePlay(id) {
  ensureAudioContext();
  const d = decks[id];
  if (!d || !d.buffer) { document.getElementById('file'+id.toUpperCase()).click(); return; }
  if (d.playing) {
    d.offset = ctx.currentTime - d.startTime;
    try { d.source.stop(); } catch(e){}
    d.source = null;
    d.playing = false;
    document.getElementById('vinyl'+id.toUpperCase()).classList.remove('spinning');
    document.getElementById('playBtn'+id.toUpperCase()).textContent = '▶ PLAY';
    setStatus(id, 'paused', 'PAUSED');
  } else {
    startDeck(id);
  }
}

function cuePoint(id) {
  const d = decks[id];
  if (!d) return;
  if (d.playing) {
    d.offset = ctx.currentTime - d.startTime;
    try { d.source.stop(); } catch(e){}
    d.source = null; d.playing = false;
    document.getElementById('vinyl'+id.toUpperCase()).classList.remove('spinning');
    document.getElementById('playBtn'+id.toUpperCase()).textContent = '▶ PLAY';
    setStatus(id, 'paused', 'CUE SET');
  } else {
    d.offset = 0;
    startDeck(id);
  }
}

function triggerCue(id, idx) {
  ensureAudioContext();
  const d = decks[id];
  if (!d || !d.buffer) return;
  const el = document.querySelectorAll(`[data-deck="${id}"][data-idx="${idx}"]`)[0];
  if (d.cuePoints[idx] !== null) {
    // cue
    const wasPlaying = d.playing;
    if (d.source) { try{d.source.stop();}catch(e){} d.source=null; d.playing=false; }
    d.offset = d.cuePoints[idx];
    if (wasPlaying) startDeck(id);
  } else {
    // Set cue
    const pos = d.playing ? (ctx.currentTime - d.startTime) : d.offset;
    d.cuePoints[idx] = pos % d.buffer.duration;
    el.textContent = `CUE ${idx+1} ●`;
    el.classList.add('set');
  }
}

function toggleLoop(id) {
  const d = decks[id];
  if (!d) return;
  d.looping = !d.looping;
  if (d.looping) {
    d.loopStart = d.playing ? (ctx.currentTime - d.startTime) % d.buffer.duration : d.offset;
  }
  const btn = document.getElementById('loopBtn'+id.toUpperCase());
  btn.classList.toggle('active', d.looping);
  if (d.playing) { const off = d.playing ? ctx.currentTime - d.startTime : d.offset; d.offset = off % (d.buffer?.duration||1); startDeck(id); }
}

function setLoopSize(bars) {
  ['a','b'].forEach(id => { if (decks[id]) decks[id].loopSize = bars; });
  document.querySelectorAll('.pad').forEach(p => p.classList.remove('active'));
  event.target.classList.add('active');
}

function nudge(id, amt) {
  const d = decks[id];
  if (!d || !d.playing) return;
  const pos = ctx.currentTime - d.startTime;
  d.offset = Math.max(0, pos + amt);
  startDeck(id);
}

function seekDeck(id, e) {
  const d = decks[id];
  if (!d || !d.buffer) return;
  const rect = e.currentTarget.getBoundingClientRect();
  const pct = (e.clientX - rect.left) / rect.width;
  d.offset = pct * d.buffer.duration;
  if (d.playing) startDeck(id);
}

function setPitch(id, val) {
  const d = decks[id];
  const rate = parseFloat(val);
  if (d) {
    d.pitchRate = rate;
    if (d.source) d.source.playbackRate.value = rate;
    if (d.bpm) document.getElementById('bpm'+id.toUpperCase()).textContent = (d.bpm * rate).toFixed(1);
  }
  const pct = Math.round((rate - 1) * 100);
  document.getElementById('pitchVal'+id.toUpperCase()).textContent = (pct >= 0 ? '+' : '') + pct + '%';
}

function syncBpm(id) {
  const other = id === 'a' ? 'b' : 'a';
  const dThis = decks[id], dOther = decks[other];
  if (!dThis?.bpm || !dOther?.bpm) return;
  const ratio = dOther.bpm / dThis.bpm;
  document.getElementById('pitch'+id.toUpperCase()).value = ratio;
  setPitch(id, ratio);
}

function setStatus(id, cls, txt) {
  const el = document.getElementById('status'+id.toUpperCase());
  el.className = 'deck-status ' + cls;
  el.textContent = txt;
}

//  EQ / FILTERS  used as a filtering the sound 
function setKnobParam(id, param, val) {
  const d = decks[id];
  if (!d) return;
  if (param === 'high')   d.high.gain.value   = (val/100)*30 - 15;
  if (param === 'mid')    d.mid.gain.value    = (val/100)*30 - 15;
  if (param === 'low')    d.low.gain.value    = (val/100)*30 - 15;
  if (param === 'filter') {
    const freq = Math.pow(2, (val/100)*10) * 20;
    d.filter.frequency.value = Math.min(freq, ctx.sampleRate/2 - 100);
  }
  if (param === 'vol')    d.gain.gain.value   = val/100;
}

// CROSSFADER 
function setCrossfader(val) {
  const v = val/100;
  if (decks.a) decks.a.xGain.gain.value = Math.cos(v * Math.PI / 2);
  if (decks.b) decks.b.xGain.gain.value = Math.cos((1-v) * Math.PI / 2);
}

function setMasterVol(val) {
  if (masterGain) masterGain.gain.value = parseFloat(val);
  document.getElementById('masterVolVal').textContent = Math.round(val*100)+'%';
}

//  EFFECTS 
let fxNodes = {};
function toggleFX(name) {
  ensureAudioContext();
  const btn = Array.from(document.querySelectorAll('.fx-btn')).find(b => b.textContent === name.toUpperCase());
  if (activeFX[name]) {
    activeFX[name] = false;
    if(btn) btn.classList.remove('active');
  } else {
    activeFX[name] = true;
    if(btn) btn.classList.add('active');
    // Simple flash effect visual feedback
    ['a','b'].forEach(id => {
      const d = decks[id];
      if (!d || !d.buffer) return;
      if (name === 'echo' && !fxNodes.delay) {
        const delay = ctx.createDelay(2);
        delay.delayTime.value = 0.375;
        const fbGain = ctx.createGain();
        fbGain.gain.value = 0.4;
        d.wfAnalyser.connect(delay);
        delay.connect(fbGain);
        fbGain.connect(delay);
        fbGain.connect(masterGain);
        fxNodes.delay = { delay, fbGain };
      }
    });
  }
}

//  BPM ESTIMATION 
function estimateBPM(id, buffer) {
  const data = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const step = Math.floor(sr * 0.01);
  const energy = [];
  for (let i = 0; i < data.length - step; i += step) {
    let e = 0;
    for (let j = 0; j < step; j++) e += data[i+j] * data[i+j];
    energy.push(e / step);
  }
  //  peaks
  const avg = energy.reduce((a,b)=>a+b,0)/energy.length;
  let peaks = 0, lastPeak = -50;
  for (let i = 1; i < energy.length-1; i++) {
    if (energy[i] > avg*1.5 && energy[i] > energy[i-1] && energy[i] > energy[i+1] && i - lastPeak > 30) {
      peaks++; lastPeak = i;
    }
  }
  const durationSec = data.length / sr;
  const bpm = Math.round((peaks / durationSec) * 60);
  const clampedBpm = Math.max(60, Math.min(200, bpm));
  decks[id].bpm = clampedBpm;
  document.getElementById('bpm'+id.toUpperCase()).textContent = clampedBpm.toFixed(1);
  updateGlobalBpm();
}

function updateGlobalBpm() {
  const bpms = ['a','b'].map(id => decks[id]?.bpm).filter(Boolean);
  if (bpms.length) document.getElementById('globalBpm').textContent = `♩ MASTER BPM: ${(bpms.reduce((a,b)=>a+b,0)/bpms.length).toFixed(1)}`;
}

//  WAVEFORM DRAWING 
function drawStaticWaveform(id, buffer) {
  const canvas = document.getElementById('wfCanvas'+id.toUpperCase());
  const container = document.getElementById('wf'+id.toUpperCase());
  canvas.width = container.offsetWidth || 300;
  canvas.height = 50;
  const ctx2 = canvas.getContext('2d');
  const data = buffer.getChannelData(0);
  const W = canvas.width, H = canvas.height;
  const step = Math.ceil(data.length / W);
  const color = id === 'a' ? '#ff2d78' : '#00d4ff';
  ctx2.fillStyle = '#0a0a14';
  ctx2.fillRect(0,0,W,H);
  ctx2.strokeStyle = color;
  ctx2.lineWidth = 1;
  ctx2.beginPath();
  for (let i = 0; i < W; i++) {
    let max = 0;
    for (let j = 0; j < step; j++) {
      const v = Math.abs(data[i*step+j] || 0);
      if (v > max) max = v;
    }
    const h = max * H * 0.9;
    ctx2.moveTo(i, H/2 - h/2);
    ctx2.lineTo(i, H/2 + h/2);
  }
  ctx2.stroke();
  decks[id].waveformData = true;
}

//  MAIN VISUAL
let mainAnalyserA, mainAnalyserB;
function startMainVisualizer() {
  const canvas = document.getElementById('mainCanvas');
  const ctx2 = canvas.getContext('2d');
  function resize() { canvas.width = canvas.offsetWidth; canvas.height = 160; }
  resize(); window.addEventListener('resize', resize);
  function draw() {
    requestAnimationFrame(draw);
    const W = canvas.width, H = canvas.height;
    ctx2.fillStyle = 'rgba(8,8,16,0.3)';
    ctx2.fillRect(0,0,W,H);

    // Draw both decks
    [['a','#ff2d78'],[' b','#00d4ff']].forEach(([rawId, color], di) => {
      const id = rawId.trim();
      const d = decks[id];
      if (!d) return;
      const bufLen = d.analyser.frequencyBinCount;
      const freqData = new Uint8Array(bufLen);
      d.analyser.getByteFrequencyData(freqData);
      const bars = 80;
      const barW = (W/2) / bars - 1;
      const offsetX = di === 0 ? 0 : W/2;
      for (let i = 0; i < bars; i++) {
        const idx = Math.floor(i * bufLen / bars);
        const val = freqData[idx] / 255;
        const bh = val * (H - 4);
        const x = offsetX + i * (barW + 1);
        const alpha = 0.4 + val * 0.6;
        ctx2.fillStyle = color + Math.floor(alpha*255).toString(16).padStart(2,'0');
        ctx2.fillRect(x, H - bh, barW, bh);
        if (val > 0.75) {
          ctx2.fillStyle = '#fff';
          ctx2.fillRect(x, H - bh - 2, barW, 2);
        }
      }
    });

    // Center divider
    ctx2.strokeStyle = '#222235';
    ctx2.lineWidth = 1;
    ctx2.beginPath();
    ctx2.moveTo(W/2, 0); ctx2.lineTo(W/2, H);
    ctx2.stroke();

    // Labels
    ctx2.font = '700 10px Orbitron';
    ctx2.fillStyle = 'rgba(255,45,120,0.3)';
    ctx2.fillText('DECK A', 8, 14);
    ctx2.fillStyle = 'rgba(0,212,255,0.3)';
    ctx2.fillText('DECK B', W/2 + 8, 14);

    // Update playheads
    ['a','b'].forEach(id => {
      const d = decks[id];
      if (!d || !d.buffer) return;
      const pos = d.playing ? (ctx.currentTime - d.startTime) % d.buffer.duration : d.offset;
      const pct = pos / d.buffer.duration;
      const wfEl = document.getElementById('wf'+id.toUpperCase());
      document.getElementById('head'+id.toUpperCase()).style.left = (pct * wfEl.offsetWidth) + 'px';
    });
  }
  draw();
}

//  VU METERS 
function initVU() {
  const section = document.getElementById('vuSection');
  section.innerHTML = '';
  ['DECK A','DECK B','MASTER'].forEach(label => {
    const div = document.createElement('div');
    div.className = 'vu-meter';
    const bars = document.createElement('div');
    bars.className = 'vu-bars';
    bars.id = 'vu_'+label.replace(' ','_');
    for (let i = 0; i < 20; i++) {
      const b = document.createElement('div');
      b.className = 'vu-bar';
      b.style.height = '4px';
      b.style.background = i < 14 ? '#00ff88' : i < 17 ? '#ffe500' : '#ff2d78';
      bars.appendChild(b);
    }
    div.appendChild(bars);
    const lbl = document.createElement('div');
    lbl.className = 'vu-label';
    lbl.textContent = label;
    div.appendChild(lbl);
    section.appendChild(div);
  });
  animateVU();
}

function animateVU() {
  requestAnimationFrame(animateVU);
  [['DECK_A','a'],['DECK_B','b']].forEach(([vuId, deckId]) => {
    const d = decks[deckId];
    const bars = document.querySelectorAll('#vu_'+vuId+' .vu-bar');
    if (!d || !d.playing) { bars.forEach(b => b.style.height = '4px'); return; }
    const data = new Uint8Array(d.analyser.frequencyBinCount);
    d.analyser.getByteFrequencyData(data);
    const avg = data.reduce((a,b)=>a+b,0)/(data.length*255);
    const level = Math.round(avg * 25);
    bars.forEach((b, i) => { b.style.height = i < level ? '100%' : '4px'; });
  });
}

//KNOB SYSTEM 
function buildKnobs() {
  document.querySelectorAll('.knob-container').forEach(container => {
    const id = container.dataset.deck;
    const param = container.dataset.param;
    let val = parseFloat(container.dataset.value);
    const canvas = container.querySelector('.knob-canvas');
    drawKnob(canvas, val, id);
    
    let dragging = false, startY, startVal;
    container.addEventListener('mousedown', e => {
      dragging = true; startY = e.clientY; startVal = val;
      e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      const dy = startY - e.clientY;
      val = Math.max(0, Math.min(100, startVal + dy));
      container.dataset.value = val;
      drawKnob(canvas, val, id);
      document.getElementById('kv'+id.toUpperCase()+'_'+param).textContent = Math.round(val);
      setKnobParam(id, param, val);
    });
    document.addEventListener('mouseup', () => dragging = false);

    // Touch support
    container.addEventListener('touchstart', e => {
      dragging = true; startY = e.touches[0].clientY; startVal = val; e.preventDefault();
    }, {passive:false});
    document.addEventListener('touchmove', e => {
      if (!dragging) return;
      const dy = startY - e.touches[0].clientY;
      val = Math.max(0, Math.min(100, startVal + dy));
      container.dataset.value = val;
      drawKnob(canvas, val, id);
      document.getElementById('kv'+id.toUpperCase()+'_'+param).textContent = Math.round(val);
      setKnobParam(id, param, val);
    }, {passive:true});
    document.addEventListener('touchend', () => dragging = false);
  });
}

function drawKnob(canvas, val, deckId) {
  const ctx2 = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, cx = W/2, cy = H/2, r = cx-4;
  ctx2.clearRect(0,0,W,H);
  const startAngle = 0.75 * Math.PI;
  const endAngle = 2.25 * Math.PI;
  const angle = startAngle + (val/100) * (endAngle - startAngle);
  const color = deckId === 'a' ? '#ff2d78' : '#00d4ff';
  // Track
  ctx2.beginPath(); ctx2.arc(cx,cy,r,startAngle,endAngle);
  ctx2.strokeStyle='#222235'; ctx2.lineWidth=4; ctx2.stroke();
  // Fill
  ctx2.beginPath(); ctx2.arc(cx,cy,r,startAngle,angle);
  ctx2.strokeStyle=color; ctx2.lineWidth=4; ctx2.stroke();
  // Dot
  const dx = cx + Math.cos(angle)*(r-2), dy2 = cy + Math.sin(angle)*(r-2);
  ctx2.beginPath(); ctx2.arc(dx,dy2,3,0,Math.PI*2);
  ctx2.fillStyle=color; ctx2.fill();
  // Center
  ctx2.beginPath(); ctx2.arc(cx,cy,r*0.35,0,Math.PI*2);
  ctx2.fillStyle='#0f0f1a'; ctx2.fill();
  ctx2.strokeStyle=color+'55'; ctx2.lineWidth=1.5; ctx2.stroke();
}

//  Drop system
function setupDragDrop() {
  ['a','b'].forEach(id => {
    const deck = document.getElementById('deck'+id.toUpperCase());
    deck.addEventListener('dragover', e => { e.preventDefault(); deck.style.borderColor = id==='a'?'var(--a)':'var(--b)'; });
    deck.addEventListener('dragleave', () => deck.style.borderColor='');
    deck.addEventListener('drop', e => {
      e.preventDefault(); deck.style.borderColor='';
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('audio/')) {
        const dt = new DataTransfer();
        dt.items.add(file);
        document.getElementById('file'+id.toUpperCase()).files = dt.files;
        loadTrack(id, document.getElementById('file'+id.toUpperCase()));
      }
    });
  });
}

// KEYBOARD SHORTCUTS 
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (k === 'q') { ensureAudioContext(); togglePlay('a'); }
  if (k === 'w') { ensureAudioContext(); cuePoint('a'); }
  if (k === 'p') { ensureAudioContext(); togglePlay('b'); }
  if (k === 'o') { ensureAudioContext(); cuePoint('b'); }
  if (k === 'z') nudge('a', -0.1);
  if (k === 'x') nudge('a',  0.1);
  if (k === 'n') nudge('b', -0.1);
  if (k === 'm') nudge('b',  0.1);
  if (k === 's') syncBpm('a');
  if (k === 'l') toggleLoop('a');
  if (k === 'k') toggleLoop('b');
});

// Info
console.log('🎧 DJ MIX PRO\nKeyboard: Q=Play A, P=Play B, W=Cue A, O=Cue B\nZ/X=Nudge A, N/M=Nudge B, S=Sync A, L=Loop A, K=Loop B');