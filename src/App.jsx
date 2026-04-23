import React, { useState, useRef, useEffect, useMemo } from 'react';
import { create } from 'zustand';
import { motion, AnimatePresence } from 'framer-motion';
import { Skull, Zap, Settings2, Ghost, RefreshCw, Biohazard, ShieldAlert, Star, Swords, ChevronRight, Crown, Dices, RotateCw, Unlock } from 'lucide-react';

// --- QUOTES ---
const QUOTES = {
  manual: ["Your spark fades…", "All that life… gone.", "You fought well.", "Life total: 0. Hope: also 0.", "Lights out."],
  commander: ["Killed by legend.", "21 reasons to block.", "A hero falls."],
  poison: ["The infection spreads…", "Compleated.", "Phyrexia welcomes you."]
};

// --- STATE MANAGEMENT ---
const useGameStore = create((set, get) => ({
  players: [],
  gameStarted: false,
  monarchEnabled: false,
  monarchId: null,
  startingPlayerId: null,
  highlightedId: null, 
  activeCounters: { poison: false, energy: false, tax: true, exp: false, rad: false },
  
  setupGame: (num) => {
    const colors = ['#ff4b2b', '#0070ff', '#00e600', '#ffcc00'];
    const newPlayers = Array.from({ length: num }, (_, i) => ({
      id: i, life: 40, color: colors[i % colors.length],
      poison: 0, energy: 0, tax: 0, exp: 0, rad: 0,
      damageDealt: {}, isDead: false, deathReason: 'manual'
    }));
    set({ players: newPlayers, gameStarted: true, monarchId: null, startingPlayerId: null, highlightedId: null });
  },

  updateStat: (id, stat, diff) => set(s => ({
    players: s.players.map(p => {
      if (p.id !== id) return p;
      const newVal = Math.max(0, (p[stat] || 0) + diff);
      if (stat === 'life' && newVal <= 0 && !p.isDead) return { ...p, life: 0, isDead: true, deathReason: 'manual' };
      if (stat === 'poison' && newVal >= 10 && !p.isDead) return { ...p, [stat]: newVal, isDead: true, deathReason: 'poison' };
      return { ...p, [stat]: newVal };
    })
  })),

  applyCmdDamage: (attackerId, targetId, diff) => set(s => {
    const attacker = s.players.find(p => p.id === attackerId);
    const currentDmg = attacker.damageDealt[targetId] || 0;
    if (diff < 0 && currentDmg <= 0) return s;
    return {
      players: s.players.map(p => {
        if (p.id === targetId) {
          const lethalByCmd = (currentDmg + diff) >= 21;
          const lethalByLife = (p.life - diff) <= 0;
          const isLethal = lethalByCmd || lethalByLife;
          return { 
            ...p, life: Math.max(0, p.life - diff), isDead: isLethal ? true : p.isDead, 
            deathReason: lethalByCmd ? 'commander' : (lethalByLife ? 'manual' : p.deathReason)
          };
        }
        if (p.id === attackerId) return { ...p, damageDealt: { ...p.damageDealt, [targetId]: currentDmg + diff } };
        return p;
      })
    };
  }),

  setMonarch: (id) => set(s => ({ monarchId: s.monarchId === id ? null : id })),
  toggleMonarchFeature: () => set(s => ({ monarchEnabled: !s.monarchEnabled, monarchId: null })),
  
  rollStartPlayer: () => {
    let count = 0;
    const maxRounds = 12;
    const players = get().players;
    const interval = setInterval(() => {
      set({ highlightedId: count % players.length });
      count++;
      if (count > maxRounds) {
        clearInterval(interval);
        const winner = Math.floor(Math.random() * players.length);
        set({ highlightedId: winner, startingPlayerId: winner });
        setTimeout(() => set({ highlightedId: null, startingPlayerId: null }), 3000);
      }
    }, 150);
  },

  killPlayer: (id) => set(s => ({ players: s.players.map(p => p.id === id ? { ...p, life: 0, isDead: true, deathReason: 'manual' } : p) })),
  revivePlayer: (id) => set(s => ({
    players: s.players.map(p => {
      if (p.id === id) return { ...p, isDead: false, life: 1, deathReason: 'manual', poison: p.deathReason === 'poison' ? 9 : p.poison };
      return { ...p, damageDealt: { ...p.damageDealt, [id]: 0 } };
    })
  })),
  toggleCounterType: (type) => set(s => ({ activeCounters: { ...s.activeCounters, [type]: !s.activeCounters[type] } })),
  exitGame: () => set({ players: [], gameStarted: false })
}));

const InteractiveZone = ({ onClick, onLongPress, children, style = {} }) => {
  const timerRef = useRef(null);
  const repeatRef = useRef(null);
  const isLongPress = useRef(false);
  const lastTouchTime = useRef(0);

  const handleStart = (e) => {
    if (e.type === 'mousedown' && Date.now() - lastTouchTime.current < 400) return;
    if (e.type === 'touchstart') lastTouchTime.current = Date.now();

    isLongPress.current = false;
    timerRef.current = setTimeout(() => {
      isLongPress.current = true;
      if (onLongPress) {
        onLongPress();
        repeatRef.current = setInterval(onLongPress, 300);
      }
    }, 600);
  };

  const handleEnd = (e) => {
    if (e.type === 'touchend') e.preventDefault();
    clearTimeout(timerRef.current);
    clearInterval(repeatRef.current);
    if (!isLongPress.current) onClick();
  };

  return (
    <div onTouchStart={handleStart} onTouchEnd={handleEnd} onMouseDown={handleStart} onMouseUp={handleEnd}
      style={{ ...style, WebkitTapHighlightColor: 'transparent', touchAction: 'none', userSelect: 'none' }}>
      {children}
    </div>
  );
};

const PlayerPanel = ({ player, totalPlayers, index, allPlayers, activeCounters, monarchEnabled, monarchId, highlightedId }) => {
  const { updateStat, applyCmdDamage, killPlayer, revivePlayer, setMonarch } = useGameStore();
  const [showCmd, setShowCmd] = useState(false);
  const [delta, setDelta] = useState(0);
  const timerRef = useRef(null);
  const prevLifeRef = useRef(player.life);
  const isMonarch = monarchId === player.id;
  const isBeingHighlighted = highlightedId === player.id;

  const deathQuote = useMemo(() => {
    if (!player.isDead) return "";
    const list = QUOTES[player.deathReason] || QUOTES.manual;
    return list[Math.floor(Math.random() * list.length)];
  }, [player.isDead, player.deathReason]);

  useEffect(() => {
    const diff = player.life - prevLifeRef.current;
    if (diff !== 0) {
      setDelta(prev => prev + diff);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setDelta(0), 1800);
    }
    prevLifeRef.current = player.life;
  }, [player.life]);

  const isTopRow = totalPlayers > 1 && (totalPlayers === 2 ? index === 0 : index < 2);

  return (
    <div style={{ 
      position: 'relative', height: '100%', width: '100%', overflow: 'hidden',
      backgroundColor: player.isDead ? '#0a0a0a' : player.color,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      transform: isTopRow ? 'rotate(180deg)' : 'none',
      transition: 'background-color 0.8s ease'
    }}>
      <AnimatePresence>{isBeingHighlighted && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.7 }} exit={{ opacity: 0 }} style={startingPulseStyle} />}</AnimatePresence>

      <motion.div animate={{ x: showCmd ? 0 : '100%' }} style={cmdTrayStyle}>
        <div style={cmdHeaderStyle}>DEALT BY ME</div>
        {allPlayers.filter(ap => ap.id !== player.id).map(target => (
          <div key={target.id} style={cmdRowStyle}>
            <div style={{ ...colorDot, background: target.color }} />
            <span style={{ flex: 1, fontWeight: '900', fontSize: '18px', color: '#fff' }}>{player.damageDealt[target.id] || 0}</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <InteractiveZone onClick={() => applyCmdDamage(player.id, target.id, -1)} style={cmdBtn}>-</InteractiveZone>
              <InteractiveZone onClick={() => applyCmdDamage(player.id, target.id, 1)} style={cmdBtn}>+</InteractiveZone>
            </div>
          </div>
        ))}
      </motion.div>

      {!player.isDead && <InteractiveZone onClick={() => setShowCmd(!showCmd)} style={cmdToggleStyle}>{showCmd ? <ChevronRight size={24} /> : <Swords size={22} />}</InteractiveZone>}

      {monarchEnabled && !player.isDead && (
        <InteractiveZone onClick={() => setMonarch(player.id)} style={{ ...monarchBtnStyle, background: isMonarch ? '#ffd700' : 'rgba(0,0,0,0.4)' }}>
          <div style={{ position: 'relative', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Crown size={20} color="#000" strokeWidth={3} style={{position: 'absolute'}} />
            <Crown size={20} color={isMonarch ? '#000' : '#ffd700'} fill={isMonarch ? '#000' : 'none'} style={{position: 'absolute'}} />
          </div>
        </InteractiveZone>
      )}

      {!player.isDead && (
        <>
          <InteractiveZone onClick={() => updateStat(player.id, 'life', -1)} onLongPress={() => updateStat(player.id, 'life', -10)} style={{ position: 'absolute', left: 0, width: '50%', height: '100%', zIndex: 10 }} />
          <InteractiveZone onClick={() => updateStat(player.id, 'life', 1)} onLongPress={() => updateStat(player.id, 'life', 10)} style={{ position: 'absolute', right: 0, width: '50%', height: '100%', zIndex: 10 }} />
        </>
      )}

      <div style={{ pointerEvents: 'none', textAlign: 'center', zIndex: 50, position: 'relative', width: '85%' }}>
        <AnimatePresence>
          {isMonarch && !player.isDead && (
            <motion.div initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} style={bigCrownPos}>
              <div style={monarchAura} />
              <motion.div animate={{ y: [0, -15, 0] }} transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }} style={{ position: 'relative', width: 110, height: 110, filter: 'drop-shadow(0 0 15px rgba(0,0,0,0.8))' }}>
                <Crown size={110} color="#000" fill="none" strokeWidth={4} style={{ position: 'absolute', left: 0, top: 0 }} />
                <Crown size={110} color="#ffd700" fill="rgba(255, 215, 0, 0.2)" strokeWidth={2} style={{ position: 'absolute', left: 0, top: 0 }} />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {player.isDead ? (
            <motion.div key="dead" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ pointerEvents: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <p style={quoteStyle}>“{deathQuote}”</p>
              <InteractiveZone onClick={() => revivePlayer(player.id)} style={reviveBtnStyle}><RefreshCw size={16}/> REVIVE</InteractiveZone>
            </motion.div>
          ) : (
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AnimatePresence>
                {delta !== 0 && (
                    <motion.div key="delta" initial={{ opacity: 0, y: 0 }} animate={{ opacity: 1, y: -70 }} exit={{ opacity: 0 }} 
                        style={{ ...deltaStyle, color: delta > 0 ? '#4ade80' : '#ff4d4d', WebkitTextStroke: '4px black', textShadow: '0 0 10px rgba(0,0,0,0.8)' }}>
                        {delta > 0 ? `+${delta}` : delta}
                    </motion.div>
                )}
              </AnimatePresence>
              <div style={lifeStyle}>{player.life}</div>
            </div>
          )}
        </AnimatePresence>
      </div>

      {!player.isDead && (
        <div style={countersBarStyle}>
          {activeCounters.poison && <CounterButton icon={<Skull size={14} color="#22c55e" />} value={player.poison} onClick={(d) => updateStat(player.id, 'poison', d)} />}
          {activeCounters.rad && <CounterButton icon={<Biohazard size={14} color="#bef264" />} value={player.rad} onClick={(d) => updateStat(player.id, 'rad', d)} />}
          {activeCounters.energy && <CounterButton icon={<Zap size={14} color="#3b82f6" />} value={player.energy} onClick={(d) => updateStat(player.id, 'energy', d)} />}
          {activeCounters.exp && <CounterButton icon={<Star size={14} color="#fbbf24" />} value={player.exp} onClick={(d) => updateStat(player.id, 'exp', d)} />}
        </div>
      )}

      {activeCounters.tax && !player.isDead && (
        <div style={{ ...taxWrapper, zIndex: 60 }}>
          <div style={taxOrbStyle}>
            <InteractiveZone onClick={() => updateStat(player.id, 'tax', -2)} style={taxBtn}>-</InteractiveZone>
            <ShieldAlert size={18} color="#facc15" />
            <span style={{ fontWeight: '900', color: '#fff', fontSize: '18px' }}>{player.tax}</span>
            <InteractiveZone onClick={() => updateStat(player.id, 'tax', 2)} style={taxBtn}>+</InteractiveZone>
          </div>
        </div>
      )}

      {!player.isDead && <InteractiveZone onClick={() => killPlayer(player.id)} style={{ ...deathBtnStyle, zIndex: 60 }}><Skull size={18} /></InteractiveZone>}
    </div>
  );
};

const CounterButton = ({ icon, value, onClick }) => (
  <div style={cntContainer}>
    <InteractiveZone onClick={() => onClick(-1)} style={cntStep}>-</InteractiveZone>
    {icon} <span style={{fontSize: '16px'}}>{value}</span>
    <InteractiveZone onClick={() => onClick(1)} style={cntStep}>+</InteractiveZone>
  </div>
);

// --- STYLES ---
const bigCrownPos = { position: 'absolute', top: '-115px', left: '50%', transform: 'translateX(-50%)', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const monarchAura = { position: 'absolute', width: '200px', height: '180px', background: 'radial-gradient(circle, rgba(0,0,0,0.6) 0%, transparent 75%)', pointerEvents: 'none' };
const cmdTrayStyle = { position: 'absolute', right: 0, top: 0, bottom: 0, width: '165px', background: 'rgba(0,0,0,0.95)', zIndex: 150, borderLeft: '1px solid #333', display: 'flex', flexDirection: 'column', gap: '8px', padding: '15px' };
const cmdHeaderStyle = { fontSize: '9px', fontWeight: 'bold', color: '#666', textAlign: 'center', textTransform: 'uppercase' };
const cmdRowStyle = { display: 'flex', alignItems: 'center', background: '#1a1a1a', padding: '10px', borderRadius: '12px', gap: '8px' };
const cmdBtn = { background: '#333', color: '#fff', borderRadius: '6px', width: '36px', height: '36px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' };
// Elevated Z-Index here to ensure it's clickable above the drawer
const cmdToggleStyle = { position: 'absolute', right: '10px', bottom: '10px', zIndex: 200, background: 'rgba(0,0,0,0.7)', border: '1px solid #444', color: '#fff', borderRadius: '50%', width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const monarchBtnStyle = { position: 'absolute', right: '10px', top: '10px', zIndex: 60, border: '1px solid #444', borderRadius: '50%', width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const lifeStyle = { fontSize: 'min(30vw, 150px)', fontWeight: '900', color: '#fff', fontStyle: 'italic' };
const deltaStyle = { position: 'absolute', width: '100%', textAlign: 'center', fontSize: '65px', fontWeight: '900', fontStyle: 'italic', zIndex: 60 };
const quoteStyle = { fontSize: '18px', fontWeight: '700', color: '#fff', fontStyle: 'italic', marginBottom: '20px', textAlign: 'center' };
const reviveBtnStyle = { padding: '12px 24px', background: '#fff', color: '#000', border: 'none', borderRadius: '12px', fontWeight: '900', marginTop: '15px', display: 'flex', alignItems: 'center', gap: '8px' };
const countersBarStyle = { position: 'absolute', bottom: '20px', display: 'flex', gap: '6px', zIndex: 60, left: '50%', transform: 'translateX(-50%)' };
const cntContainer = { display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(0,0,0,0.85)', padding: '6px 12px', borderRadius: '12px', border: '1px solid #333', color: '#fff', fontWeight: '900' };
const cntStep = { color: '#fff', fontSize: '24px', padding: '0 8px', display: 'flex', alignItems: 'center' };
const taxBtn = { color: '#fff', fontSize: '24px', display: 'flex', alignItems: 'center' };
const taxWrapper = { position: 'absolute', top: '20px', left: '20px' };
const taxOrbStyle = { display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(0,0,0,0.8)', padding: '5px 12px', borderRadius: '20px', border: '1px solid #facc1533' };
const deathBtnStyle = { position: 'absolute', bottom: '10px', left: '10px', width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(0,0,0,0.3)', border: '1px solid #444', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const startingPulseStyle = { position: 'absolute', inset: 0, background: '#fff', zIndex: 200, pointerEvents: 'none' };
const colorDot = { width: '8px', height: '8px', borderRadius: '50%' };

export default function App() {
  const { gameStarted, players, setupGame, exitGame, activeCounters, toggleCounterType, monarchEnabled, toggleMonarchFeature, rollStartPlayer, monarchId, highlightedId } = useGameStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isPortrait, setIsPortrait] = useState(window.innerHeight > window.innerWidth);
  const [bypassRotation, setBypassRotation] = useState(false);

  useEffect(() => {
    document.documentElement.style.height = '100dvh';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.height = '100dvh';
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100vw';
    document.body.style.backgroundColor = '#000';

    const handleResize = () => setIsPortrait(window.innerHeight > window.innerWidth);
    window.addEventListener('resize', handleResize);
    
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const needsLandscape = gameStarted && players.length > 2 && !bypassRotation;

  if (needsLandscape && isPortrait) {
    return (
      <div style={{ height: '100dvh', width: '100vw', background: '#000', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '20px', zIndex: 9999 }}>
        <motion.div animate={{ rotate: 90 }} transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}>
          <RotateCw size={60} color="#ffd700" />
        </motion.div>
        <h2 style={{ fontFamily: 'system-ui', fontWeight: '900', fontStyle: 'italic', textAlign: 'center', padding: '0 40px' }}>PLEASE ROTATE DEVICE FOR 3+ PLAYERS</h2>
        <InteractiveZone onClick={() => setBypassRotation(true)} style={{ position: 'absolute', bottom: '40px', padding: '10px 20px', background: '#222', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', color: '#666', border: '1px solid #333' }}>
          <Unlock size={14} /> I ALREADY HAVE (BYPASS)
        </InteractiveZone>
      </div>
    );
  }

  if (!gameStarted) {
    return (
      <div style={{ height: '100dvh', width: '100vw', background: '#000', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui' }}>
        <h1 style={{ fontSize: '10vw', fontWeight: '900', fontStyle: 'italic', marginBottom: '40px', letterSpacing: '-2px' }}>MTG NEXUS</h1>
        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {[2, 3, 4].map(n => <InteractiveZone key={n} onClick={() => setupGame(n)} style={{ padding: '20px 30px', background: '#111', border: '1px solid #333', color: '#fff', borderRadius: '15px', fontWeight: '900', fontSize: '18px' }}>{n} PLAYERS</InteractiveZone>)}
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
        height: '100dvh', 
        width: '100vw', 
        background: '#000', 
        display: 'grid', 
        gridTemplateColumns: (players.length === 2 || (isPortrait && players.length > 2)) ? '1fr' : '1fr 1fr', 
        gridTemplateRows: players.length === 2 ? '1fr 1fr' : (isPortrait ? `repeat(${players.length}, 1fr)` : `repeat(${Math.ceil(players.length / 2)}, 1fr)`),
        touchAction: 'none', 
        overflow: 'hidden', 
        boxSizing: 'border-box' 
    }}>
      {players.map((p, i) => (
        <div key={p.id} style={{ gridColumn: (players.length === 3 && i === 2 && !isPortrait) ? '1 / span 2' : 'auto', height: '100%', width: '100%' }}>
          <PlayerPanel player={p} totalPlayers={players.length} index={i} allPlayers={players} activeCounters={activeCounters} monarchEnabled={monarchEnabled} monarchId={monarchId} highlightedId={highlightedId} />
        </div>
      ))}
      
      {/* MENU ALIGNMENT FIXES APPLIED BELOW */}
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {menuOpen && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ background: '#000', border: '1px solid #444', padding: '15px', borderRadius: '24px', marginBottom: '10px', width: '220px', boxShadow: '0 10px 30px rgba(0,0,0,0.8)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <InteractiveZone onClick={rollStartPlayer} style={{ width: '100%', padding: '12px', background: '#3b82f6', color: '#fff', borderRadius: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}><Dices size={18}/> ROLL START</InteractiveZone>
            <InteractiveZone onClick={toggleMonarchFeature} style={{ width: '100%', padding: '12px', background: monarchEnabled ? '#ffd700' : '#222', color: monarchEnabled ? '#000' : '#fff', borderRadius: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}><Crown size={18} fill={monarchEnabled ? '#000' : 'none'} /> MONARCH: {monarchEnabled ? 'ON' : 'OFF'}</InteractiveZone>
            
            {/* Counter Grid Fixed Alignment */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', width: '100%' }}>
              {Object.keys(activeCounters).map(k => (
                <InteractiveZone key={k} onClick={() => toggleCounterType(k)} style={{ padding: '10px 5px', background: activeCounters[k] ? '#fff' : '#222', color: activeCounters[k] ? '#000' : '#fff', borderRadius: '10px', fontSize: '10px', fontWeight: '900', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{k.toUpperCase()}</InteractiveZone>
              ))}
            </div>
            
            <InteractiveZone onClick={() => { if(confirm('Exit Game?')) { exitGame(); setBypassRotation(false); } }} style={{ width: '100%', padding: '12px', background: '#ff4d4d', color: '#fff', borderRadius: '10px', fontWeight: 'bold', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>EXIT</InteractiveZone>
          </motion.div>
        )}
        <InteractiveZone onClick={() => setMenuOpen(!menuOpen)} style={{ background: '#000', border: '2px solid #555', width: '60px', height: '60px', borderRadius: '50%', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(0,0,0,0.5)' }}><Settings2 size={28}/></InteractiveZone>
      </div>
    </div>
  );
}