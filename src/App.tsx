/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Truck,
  Trophy,
  Volume2,
  VolumeX,
  RotateCcw,
  Play,
  Pause,
  HelpCircle,
  Shield,
  Zap,
  Clock,
  Package,
  Flame,
  Award,
  Sliders,
  Sparkles,
  Megaphone
} from 'lucide-react';
import { sound } from './services/sound';
import {
  GameState,
  Difficulty,
  TruckColor,
  HighScoreRecord,
  Obstacle,
  GameItem,
  Particle,
  FallingCargo,
  TireTrack
} from './types/game';

const TRUCK_COLOR_MAP: Record<TruckColor, { name: string; hex: string; light: string; body: string }> = {
  blue: { name: '로열 블루', hex: '#2563eb', light: '#93c5fd', body: '#1d4ed8' },
  amber: { name: '선셋 앰버', hex: '#d97706', light: '#fde68a', body: '#b45309' },
  emerald: { name: '에코 민트', hex: '#059669', light: '#a7f3d0', body: '#047857' },
  violet: { name: '사이버 퍼플', hex: '#7c3aed', light: '#ddd6fe', body: '#6d28d9' },
  rose: { name: '레이싱 레드', hex: '#e11d48', light: '#fecdd3', body: '#be123c' },
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'GAME' | 'SETTINGS' | 'LEADERBOARD' | 'RULES'>('GAME');
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(0.6);
  const [difficulty, setDifficulty] = useState<Difficulty>('NORMAL');
  const [truckColor, setTruckColor] = useState<TruckColor>('blue');
  const [records, setRecords] = useState<HighScoreRecord[]>([]);

  // In-Game Live HUD States for React Header
  const [hudState, setHudState] = useState<{
    speed: number;
    cargo: number;
    time: number;
    hasShield: boolean;
    progress: number;
    nearMiss: number;
    combo: number;
    status: GameState;
  }>({
    speed: 0,
    cargo: 10,
    time: 60,
    hasShield: false,
    progress: 0,
    nearMiss: 0,
    combo: 0,
    status: 'START',
  });

  const [resultData, setResultData] = useState<{
    grade: 'S' | 'A' | 'B' | 'C' | 'F';
    gradeColor: string;
    title: string;
    desc: string;
    cargo: number;
    nearMiss: number;
    isClear: boolean;
    timeRemaining: number;
  } | null>(null);

  // References for Canvas and Game Engine
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const animationFrameId = useRef<number | null>(null);

  // Difficulty configurations
  const config = {
    EASY: { totalTime: 70, goalDistance: 50000, spawnMultiplier: 0.8, shieldChance: 0.5 },
    NORMAL: { totalTime: 60, goalDistance: 56000, spawnMultiplier: 1.0, shieldChance: 0.35 },
    HARD: { totalTime: 50, goalDistance: 62000, spawnMultiplier: 1.35, shieldChance: 0.2 },
  }[difficulty];

  // Game Engine mutable state refs (to avoid re-binding loops)
  const engine = useRef({
    gameState: 'START' as GameState,
    gameTime: 60,
    totalTime: 60,
    distanceTraveled: 0,
    goalDistance: 56000,
    cargoCount: 10,
    initialCargo: 10,
    nearMissCount: 0,
    nearMissCombo: 0,
    lastNearMissTime: 0,
    keys: { Left: false, Right: false, Boost: false },
    prevLeft: false,
    prevRight: false,
    turnChangeCounter: 0,
    lastCargoDropTime: 0,
    roadOffset: 0,
    sideSceneryOffset: 0,
    obstacles: [] as Obstacle[],
    items: [] as GameItem[],
    particles: [] as Particle[],
    fallingCargos: [] as FallingCargo[],
    tireTracks: [] as TireTrack[],
    truck: {
      x: 0,
      y: 0,
      width: 62,
      height: 108,
      speed: 0,
      baseSpeed: 7.5,
      boostSpeed: 15.5,
      laneX: 0,
      targetLaneX: 0,
      tilt: 0,
      spinAngle: 0,
      isSpinning: false,
      spinTimer: 0,
      hasShield: false,
    },
    shakeTime: 0,
    entityIdCounter: 1,
  });

  // Load High Scores from LocalStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('cargo_game_records');
      if (saved) {
        setRecords(JSON.parse(saved));
      }
    } catch {
      //
    }
  }, []);

  const saveRecord = useCallback((record: Omit<HighScoreRecord, 'id' | 'date'>) => {
    const newRecord: HighScoreRecord = {
      ...record,
      id: Date.now().toString(),
      date: new Date().toLocaleDateString('ko-KR', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    };
    setRecords((prev) => {
      const updated = [newRecord, ...prev].slice(0, 15);
      try {
        localStorage.setItem('cargo_game_records', JSON.stringify(updated));
      } catch {
        //
      }
      return updated;
    });
  }, []);

  // Sync Audio Settings
  const toggleMute = () => {
    sound.init();
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    sound.setMuted(nextMuted);
  };

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    sound.setVolume(newVol);
  };

  const triggerScreenShake = () => {
    if (wrapperRef.current) {
      wrapperRef.current.classList.remove('shake');
      void wrapperRef.current.offsetWidth;
      wrapperRef.current.classList.add('shake');
      setTimeout(() => {
        wrapperRef.current?.classList.remove('shake');
      }, 300);
    }
  };

  const calculateGrade = (cargo: number) => {
    if (cargo >= 9) return { grade: 'S' as const, color: 'text-amber-400', title: '배달의 신! 완벽한 이사' };
    if (cargo >= 7) return { grade: 'A' as const, color: 'text-emerald-400', title: '베테랑 이사 전문가' };
    if (cargo >= 4) return { grade: 'B' as const, color: 'text-cyan-400', title: '안전 운전자' };
    if (cargo >= 1) return { grade: 'C' as const, color: 'text-indigo-400', title: '초보 배달원' };
    return { grade: 'F' as const, color: 'text-rose-500', title: '이삿짐 전멸 실패' };
  };

  // Start Game
  const startGame = useCallback(() => {
    sound.init();
    const eng = engine.current;
    eng.gameState = 'PLAYING';
    eng.gameTime = config.totalTime;
    eng.totalTime = config.totalTime;
    eng.distanceTraveled = 0;
    eng.goalDistance = config.goalDistance;
    eng.cargoCount = 10;
    eng.initialCargo = 10;
    eng.nearMissCount = 0;
    eng.nearMissCombo = 0;
    eng.lastNearMissTime = 0;
    eng.turnChangeCounter = 0;
    eng.lastCargoDropTime = Date.now();
    eng.obstacles = [];
    eng.items = [];
    eng.particles = [];
    eng.fallingCargos = [];
    eng.tireTracks = [];
    eng.truck.laneX = 0;
    eng.truck.targetLaneX = 0;
    eng.truck.tilt = 0;
    eng.truck.isSpinning = false;
    eng.truck.spinAngle = 0;
    eng.truck.hasShield = false;

    setResultData(null);
    setHudState({
      speed: 0,
      cargo: 10,
      time: config.totalTime,
      hasShield: false,
      progress: 0,
      nearMiss: 0,
      combo: 0,
      status: 'PLAYING',
    });
  }, [config.goalDistance, config.totalTime]);

  const pauseGame = useCallback(() => {
    const eng = engine.current;
    if (eng.gameState === 'PLAYING') {
      eng.gameState = 'PAUSED';
      setHudState((prev) => ({ ...prev, status: 'PAUSED' }));
    } else if (eng.gameState === 'PAUSED') {
      sound.init();
      eng.gameState = 'PLAYING';
      setHudState((prev) => ({ ...prev, status: 'PLAYING' }));
    }
  }, []);

  const dropCargo = useCallback((reason: string) => {
    const eng = engine.current;
    if (eng.truck.hasShield) {
      eng.truck.hasShield = false;
      sound.playShieldAbsorb();
      eng.particles.push({
        x: eng.truck.x + eng.truck.laneX,
        y: eng.truck.y - 45,
        text: '🛡️ 보호막 방어!',
        color: '#38bdf8',
        vy: -2.2,
        alpha: 1,
        life: 50,
      });
      return;
    }

    if (eng.cargoCount <= 0 || eng.gameState !== 'PLAYING') return;

    eng.cargoCount--;
    sound.playDrop();

    eng.fallingCargos.push({
      x: eng.truck.x + eng.truck.laneX,
      y: eng.truck.y - 25,
      vx: (Math.random() - 0.5) * 12,
      vy: -5 - Math.random() * 5,
      rotation: 0,
      vRot: (Math.random() - 0.5) * 0.45,
      alpha: 1,
    });

    eng.particles.push({
      x: eng.truck.x + eng.truck.laneX,
      y: eng.truck.y - 45,
      text: reason || '-1 이삿짐 낙하!',
      color: '#ef4444',
      vy: -2.4,
      alpha: 1,
      life: 45,
    });

    if (eng.cargoCount <= 0) {
      endGame(false, '이삿짐을 전부 분실했습니다!');
    }
  }, []);

  const honkHorn = () => {
    sound.init();
    sound.playHorn();
    const eng = engine.current;
    eng.particles.push({
      x: eng.truck.x + eng.truck.laneX,
      y: eng.truck.y - 65,
      text: '📢 빵! 빵!',
      color: '#fbbf24',
      vy: -3,
      alpha: 1,
      life: 40,
    });
    // Scare away any nearby sedan slightly forward
    eng.obstacles.forEach((obs) => {
      if ((obs.type === 'SEDAN' || obs.type === 'TRUCK') && obs.y > 0 && obs.y < eng.truck.y) {
        obs.vy += 2.5;
      }
    });
  };

  const endGame = useCallback(
    (isSuccess: boolean, message: string) => {
      const eng = engine.current;
      eng.gameState = isSuccess ? 'CLEAR' : 'GAMEOVER';

      if (isSuccess) {
        sound.playGoal();
        const evalGrade = calculateGrade(eng.cargoCount);
        setResultData({
          grade: evalGrade.grade,
          gradeColor: evalGrade.color,
          title: evalGrade.title,
          desc: message,
          cargo: eng.cargoCount,
          nearMiss: eng.nearMissCount,
          isClear: true,
          timeRemaining: Math.ceil(eng.gameTime),
        });

        saveRecord({
          grade: evalGrade.grade,
          cargoLeft: eng.cargoCount,
          nearMissCount: eng.nearMissCount,
          timeRemaining: Math.ceil(eng.gameTime),
          difficulty,
          isClear: true,
        });
      } else {
        sound.playGameOver();
        setResultData({
          grade: 'F',
          gradeColor: 'text-rose-500',
          title: '운반 실패!',
          desc: message,
          cargo: 0,
          nearMiss: eng.nearMissCount,
          isClear: false,
          timeRemaining: Math.ceil(eng.gameTime),
        });

        saveRecord({
          grade: 'F',
          cargoLeft: 0,
          nearMissCount: eng.nearMissCount,
          timeRemaining: Math.ceil(eng.gameTime),
          difficulty,
          isClear: false,
        });
      }

      setHudState((prev) => ({
        ...prev,
        status: eng.gameState,
        cargo: eng.cargoCount,
        time: Math.ceil(eng.gameTime),
      }));
    },
    [difficulty, saveRecord]
  );

  // Resize canvas smoothly
  useEffect(() => {
    const handleResize = () => {
      if (!canvasRef.current) return;
      const canvas = canvasRef.current;
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (rect) {
        canvas.width = rect.width;
        canvas.height = rect.height;
        engine.current.truck.y = canvas.height - 135;
        engine.current.truck.x = canvas.width / 2;
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Keyboard Event Listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const eng = engine.current;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') eng.keys.Left = true;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') eng.keys.Right = true;
      if (e.code === 'Space') {
        // Prevent page scroll
        e.preventDefault();
        eng.keys.Boost = true;
      }

      if (e.code === 'KeyH') {
        honkHorn();
      }

      if (e.code === 'KeyP' || e.code === 'Escape') {
        pauseGame();
      }

      if (eng.gameState === 'START' && (e.code === 'Space' || e.code === 'Enter')) {
        startGame();
      }

      if ((eng.gameState === 'CLEAR' || eng.gameState === 'GAMEOVER') && e.code === 'KeyR') {
        startGame();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const eng = engine.current;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') eng.keys.Left = false;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') eng.keys.Right = false;
      if (e.code === 'Space') eng.keys.Boost = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [pauseGame, startGame]);

  // Main Game Loop
  useEffect(() => {
    let lastTime = performance.now();

    const spawnEntities = (canvasWidth: number) => {
      const eng = engine.current;
      const laneWidth = canvasWidth * 0.46;
      const progressRatio = eng.distanceTraveled / eng.goalDistance;
      const baseChance = (0.042 + progressRatio * 0.038) * config.spawnMultiplier;

      if (Math.random() < baseChance) {
        const types: Obstacle['type'][] = ['SEDAN', 'TRUCK', 'BARREL', 'BARRICADE', 'PUDDLE', 'CONE'];
        const type = types[Math.floor(Math.random() * types.length)];
        const spawnX = (Math.random() - 0.5) * laneWidth;

        const newObs: Obstacle = {
          id: eng.entityIdCounter++,
          x: spawnX,
          y: -120,
          type,
          width: 44,
          height: 44,
          hit: false,
          nearMissed: false,
          vx: 0,
          vy: 0,
          animFrame: 0,
          color: '#e11d48',
        };

        if (type === 'SEDAN') {
          newObs.width = 46;
          newObs.height = 80;
          newObs.vy = Math.random() > 0.4 ? 2.6 : -1.8;
          newObs.color = ['#ef4444', '#3b82f6', '#10b981', '#8b5cf6', '#eab308'][Math.floor(Math.random() * 5)];
        } else if (type === 'TRUCK') {
          newObs.width = 54;
          newObs.height = 98;
          newObs.vy = 1.1;
          newObs.color = '#f59e0b';
        } else if (type === 'BARREL') {
          newObs.width = 38;
          newObs.height = 38;
          newObs.vx = (Math.random() - 0.5) * 4.2;
        } else if (type === 'BARRICADE') {
          newObs.width = 76;
          newObs.height = 32;
        } else if (type === 'PUDDLE') {
          newObs.width = 62;
          newObs.height = 40;
        } else if (type === 'CONE') {
          newObs.width = 32;
          newObs.height = 32;
        }

        eng.obstacles.push(newObs);
      }

      // Items spawn
      if (Math.random() < 0.014) {
        const itemType = Math.random() < config.shieldChance ? 'SHIELD' : 'BOX';
        eng.items.push({
          id: eng.entityIdCounter++,
          x: (Math.random() - 0.5) * laneWidth,
          y: -70,
          type: itemType,
          width: 36,
          height: 36,
          collected: false,
          animFrame: 0,
        });
      }
    };

    const updatePhysics = (delta: number, canvasWidth: number, canvasHeight: number) => {
      const eng = engine.current;
      if (eng.gameState !== 'PLAYING') return;

      eng.gameTime -= delta;
      if (eng.gameTime <= 0) {
        eng.gameTime = 0;
        if (eng.distanceTraveled >= eng.goalDistance) {
          endGame(true, '제한시간 내 목적지에 성공적으로 도착했습니다!');
        } else {
          endGame(false, '제한시간 초과! 목적지에 도달하지 못했습니다.');
        }
        return;
      }

      const isBoosting = eng.keys.Boost;
      let currentSpeed = isBoosting ? eng.truck.boostSpeed : eng.truck.baseSpeed;
      if (eng.truck.isSpinning) currentSpeed *= 0.28;

      eng.truck.speed = currentSpeed;
      eng.distanceTraveled += currentSpeed * 12.2;

      if (eng.distanceTraveled >= eng.goalDistance) {
        endGame(true, '축하합니다! 이사할 집에 모든 이삿짐을 배달했습니다!');
        return;
      }

      // Engine sound
      if (Math.random() < 0.28) {
        sound.playEngine(isBoosting);
      }

      // Combo expiration check
      const now = Date.now();
      if (now - eng.lastNearMissTime > 2500 && eng.nearMissCombo > 0) {
        eng.nearMissCombo = 0;
      }

      // Truck spin logic
      if (eng.truck.isSpinning) {
        eng.truck.spinAngle += 0.38;
        eng.truck.spinTimer--;
        if (eng.truck.spinTimer <= 0) {
          eng.truck.isSpinning = false;
          eng.truck.spinAngle = 0;
        }
      }

      // Steering
      const maxSteer = canvasWidth * 0.22;
      let moveDir = 0;
      if (eng.keys.Left) moveDir -= 1;
      if (eng.keys.Right) moveDir += 1;

      if (eng.keys.Left !== eng.prevLeft || eng.keys.Right !== eng.prevRight) {
        if (moveDir !== 0) eng.turnChangeCounter++;
      }
      eng.prevLeft = eng.keys.Left;
      eng.prevRight = eng.keys.Right;

      if (!eng.truck.isSpinning) {
        eng.truck.targetLaneX += moveDir * 7.5;
        eng.truck.targetLaneX = Math.max(-maxSteer, Math.min(maxSteer, eng.truck.targetLaneX));
      }
      eng.truck.laneX += (eng.truck.targetLaneX - eng.truck.laneX) * 0.26;
      eng.truck.tilt = (eng.truck.targetLaneX - eng.truck.laneX) * 0.055;

      // Tire marks & exhaust smoke
      if (Math.abs(eng.truck.targetLaneX - eng.truck.laneX) > 8 || isBoosting) {
        eng.tireTracks.push({
          x: eng.truck.x + eng.truck.laneX,
          y: eng.truck.y + 32,
          alpha: 0.6,
        });

        eng.particles.push({
          x: eng.truck.x + eng.truck.laneX + (Math.random() - 0.5) * 32,
          y: eng.truck.y + 44,
          vx: (Math.random() - 0.5) * 3,
          vy: Math.random() * 2 + 1.2,
          radius: Math.random() * 4.5 + 2,
          color: isBoosting ? '#38bdf8' : '#64748b',
          alpha: 0.85,
          life: 20,
        });
      }

      // Drop cargo on excessive boosting or crazy turning
      const timeSinceLastDrop = now - eng.lastCargoDropTime;
      if (isBoosting && timeSinceLastDrop > 1800) {
        eng.lastCargoDropTime = now;
        dropCargo('부스터 과속 덜컹!');
      }

      if (eng.turnChangeCounter > 4 && timeSinceLastDrop > 1200) {
        eng.turnChangeCounter = 0;
        eng.lastCargoDropTime = now;
        dropCargo('급회전 차체 흔들림!');
      }

      // Scenery scroll
      eng.roadOffset = (eng.roadOffset + currentSpeed * 2.3) % 40;
      eng.sideSceneryOffset = (eng.sideSceneryOffset + currentSpeed * 1.6) % 120;
      spawnEntities(canvasWidth);

      const truckBounds = {
        left: eng.truck.x + eng.truck.laneX - eng.truck.width / 2 + 6,
        right: eng.truck.x + eng.truck.laneX + eng.truck.width / 2 - 6,
        top: eng.truck.y - eng.truck.height / 2 + 8,
        bottom: eng.truck.y + eng.truck.height / 2 - 8,
      };

      // Item collision
      for (let i = eng.items.length - 1; i >= 0; i--) {
        const item = eng.items[i];
        item.y += currentSpeed * 1.5;
        item.animFrame += 0.1;

        const itemBounds = {
          left: eng.truck.x + item.x - item.width / 2,
          right: eng.truck.x + item.x + item.width / 2,
          top: item.y - item.height / 2,
          bottom: item.y + item.height / 2,
        };

        if (
          !item.collected &&
          truckBounds.left < itemBounds.right &&
          truckBounds.right > itemBounds.left &&
          truckBounds.top < itemBounds.bottom &&
          truckBounds.bottom > itemBounds.top
        ) {
          item.collected = true;

          if (item.type === 'BOX') {
            sound.playItemPickup(false);
            if (eng.cargoCount < eng.initialCargo) {
              eng.cargoCount++;
              eng.particles.push({
                x: eng.truck.x + eng.truck.laneX,
                y: eng.truck.y - 45,
                text: '+1 이삿짐 복구! 📦',
                color: '#10b981',
                vy: -2.2,
                alpha: 1,
                life: 45,
              });
            } else {
              eng.particles.push({
                x: eng.truck.x + eng.truck.laneX,
                y: eng.truck.y - 45,
                text: '최대 이삿짐 유지 중!',
                color: '#f59e0b',
                vy: -2.2,
                alpha: 1,
                life: 40,
              });
            }
          } else if (item.type === 'SHIELD') {
            sound.playItemPickup(true);
            eng.truck.hasShield = true;
            eng.particles.push({
              x: eng.truck.x + eng.truck.laneX,
              y: eng.truck.y - 45,
              text: '🛡️ 에너지 쉴드 장착!',
              color: '#38bdf8',
              vy: -2.4,
              alpha: 1,
              life: 45,
            });
          }
          eng.items.splice(i, 1);
          continue;
        }

        if (item.y > canvasHeight + 70) {
          eng.items.splice(i, 1);
        }
      }

      // Obstacle collision & Near Miss
      for (let i = eng.obstacles.length - 1; i >= 0; i--) {
        const obs = eng.obstacles[i];
        obs.y += currentSpeed * 1.5 + obs.vy;
        obs.x += obs.vx;
        obs.animFrame += 0.1;

        if (obs.type === 'BARREL') {
          if (Math.abs(obs.x) > maxSteer) obs.vx *= -1;
        }

        const obsBounds = {
          left: eng.truck.x + obs.x - obs.width / 2,
          right: eng.truck.x + obs.x + obs.width / 2,
          top: obs.y - obs.height / 2,
          bottom: obs.y + obs.height / 2,
        };

        if (
          !obs.hit &&
          truckBounds.left < obsBounds.right &&
          truckBounds.right > obsBounds.left &&
          truckBounds.top < obsBounds.bottom &&
          truckBounds.bottom > obsBounds.top
        ) {
          obs.hit = true;
          triggerScreenShake();

          if (obs.type === 'PUDDLE') {
            sound.playScreech();
            eng.truck.isSpinning = true;
            eng.truck.spinTimer = 32;
            dropCargo('오일 미끄럼 스핀!');
          } else {
            sound.playHit();
            dropCargo('장애물 정면 충돌!');
          }

          // Crash sparks / splash particles
          for (let p = 0; p < 16; p++) {
            eng.particles.push({
              x: eng.truck.x + obs.x,
              y: obs.y,
              vx: (Math.random() - 0.5) * 8.5,
              vy: (Math.random() - 0.5) * 8.5,
              color: obs.type === 'PUDDLE' ? '#38bdf8' : '#f59e0b',
              radius: Math.random() * 5 + 2,
              alpha: 1,
              life: 25,
            });
          }
        }

        // Near Miss Detection
        if (!obs.hit && !obs.nearMissed && obs.y > eng.truck.y - 12 && obs.y < eng.truck.y + 38) {
          const distX = Math.abs(eng.truck.x + eng.truck.laneX - (eng.truck.x + obs.x));
          if (distX < eng.truck.width / 2 + obs.width / 2 + 20) {
            obs.nearMissed = true;
            eng.nearMissCount++;
            eng.nearMissCombo++;
            eng.lastNearMissTime = now;
            sound.playNearMiss(eng.nearMissCombo);

            const comboText = eng.nearMissCombo > 1 ? `⚡ NEAR MISS x${eng.nearMissCombo} COMBO!` : '⚡ NEAR MISS!';
            eng.particles.push({
              x: eng.truck.x + eng.truck.laneX,
              y: eng.truck.y - 50,
              text: comboText,
              color: eng.nearMissCombo > 2 ? '#f43f5e' : '#f59e0b',
              vy: -2.6,
              alpha: 1,
              life: 42,
            });
          }
        }

        if (obs.y > canvasHeight + 110) {
          eng.obstacles.splice(i, 1);
        }
      }

      // Tire tracks update
      for (let i = eng.tireTracks.length - 1; i >= 0; i--) {
        eng.tireTracks[i].y += currentSpeed * 1.5;
        eng.tireTracks[i].alpha -= 0.022;
        if (eng.tireTracks[i].alpha <= 0 || eng.tireTracks[i].y > canvasHeight) {
          eng.tireTracks.splice(i, 1);
        }
      }

      // Floating particles
      for (let i = eng.particles.length - 1; i >= 0; i--) {
        const p = eng.particles[i];
        if (p.text) {
          p.y += p.vy || -2;
          p.alpha -= 0.022;
        } else {
          p.x += p.vx || 0;
          p.y += p.vy || 0;
          p.alpha -= 1 / p.life;
        }
        if (p.alpha <= 0) eng.particles.splice(i, 1);
      }

      // Falling cargo boxes
      for (let i = eng.fallingCargos.length - 1; i >= 0; i--) {
        const fc = eng.fallingCargos[i];
        fc.x += fc.vx;
        fc.y += fc.vy;
        fc.vy += 0.46;
        fc.rotation += fc.vRot;
        fc.alpha -= 0.016;
        if (fc.alpha <= 0) eng.fallingCargos.splice(i, 1);
      }

      // Sync HUD
      const speedKmh = Math.round(eng.truck.speed * 8);
      const progressPercent = Math.min(100, (eng.distanceTraveled / eng.goalDistance) * 100);

      setHudState({
        speed: speedKmh,
        cargo: eng.cargoCount,
        time: Math.ceil(eng.gameTime),
        hasShield: eng.truck.hasShield,
        progress: progressPercent,
        nearMiss: eng.nearMissCount,
        combo: eng.nearMissCombo,
        status: eng.gameState,
      });
    };

    const renderCanvas = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      const eng = engine.current;
      ctx.clearRect(0, 0, width, height);

      const centerX = width / 2;
      const roadWidth = width * 0.52;
      const leftMargin = centerX - roadWidth / 2;
      const rightMargin = centerX + roadWidth / 2;

      // 1. Parallax Side Scenery (Grass, trees, guardrails, roadside street lights)
      ctx.fillStyle = '#0c2217';
      ctx.fillRect(0, 0, leftMargin - 6, height);
      ctx.fillRect(rightMargin + 6, 0, width - rightMargin, height);

      const spacing = 120;
      for (let y = -spacing; y < height + spacing; y += spacing) {
        const sy = y + eng.sideSceneryOffset;

        // Left trees & shrubs
        ctx.fillStyle = '#059669';
        ctx.beginPath();
        ctx.arc(leftMargin - 38, sy, 22, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#047857';
        ctx.beginPath();
        ctx.arc(leftMargin - 28, sy + 10, 16, 0, Math.PI * 2);
        ctx.fill();

        // Right side buildings & lights
        if (Math.floor(y / spacing) % 2 === 0) {
          ctx.fillStyle = '#334155';
          ctx.fillRect(rightMargin + 24, sy - 14, 32, 32);
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(rightMargin + 30, sy - 6, 8, 8);
        } else {
          ctx.fillStyle = '#10b981';
          ctx.beginPath();
          ctx.arc(rightMargin + 42, sy, 24, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 2. Asphalt Road Surface
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(leftMargin, 0, roadWidth, height);

      // 3. Tire Tracks
      eng.tireTracks.forEach((t) => {
        ctx.fillStyle = `rgba(15, 23, 42, ${t.alpha})`;
        ctx.fillRect(t.x - 18, t.y, 8, 14);
        ctx.fillRect(t.x + 10, t.y, 8, 14);
      });

      // 4. Road Curbs & Lane Stripes
      const stripeHeight = 32;
      for (let y = -stripeHeight; y < height + stripeHeight; y += stripeHeight) {
        const currY = y + eng.roadOffset;
        const isRed = Math.floor((y + eng.roadOffset) / stripeHeight) % 2 === 0;
        ctx.fillStyle = isRed ? '#ef4444' : '#f8fafc';
        ctx.fillRect(leftMargin - 8, currY, 8, stripeHeight);
        ctx.fillRect(rightMargin, currY, 8, stripeHeight);
      }

      // Dashed lane dividers
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 3.5;
      ctx.setLineDash([20, 20]);
      ctx.lineDashOffset = -eng.roadOffset;
      ctx.beginPath();
      ctx.moveTo(centerX - roadWidth / 6, 0);
      ctx.lineTo(centerX - roadWidth / 6, height);
      ctx.moveTo(centerX + roadWidth / 6, 0);
      ctx.lineTo(centerX + roadWidth / 6, height);
      ctx.stroke();
      ctx.setLineDash([]);

      // 5. Goal Line (when close)
      const remainingDist = eng.goalDistance - eng.distanceTraveled;
      if (remainingDist < 1400) {
        const goalY = eng.truck.y - remainingDist / 2.6;
        const checkSize = 16;
        for (let gx = leftMargin; gx < rightMargin; gx += checkSize) {
          for (let gy = 0; gy < 32; gy += checkSize) {
            const isBlack = (Math.floor(gx / checkSize) + Math.floor(gy / checkSize)) % 2 === 0;
            ctx.fillStyle = isBlack ? '#0f172a' : '#f8fafc';
            ctx.fillRect(gx, goalY + gy, checkSize, checkSize);
          }
        }
      }

      // 6. Draw Items
      eng.items.forEach((item) => {
        const ix = centerX + item.x;
        const iy = item.y;
        const floatY = Math.sin(item.animFrame * 2) * 5;

        ctx.save();
        ctx.translate(ix, iy + floatY);

        if (item.type === 'BOX') {
          ctx.fillStyle = '#f59e0b';
          ctx.fillRect(-17, -17, 34, 34);
          ctx.strokeStyle = '#fef08a';
          ctx.lineWidth = 2.5;
          ctx.strokeRect(-17, -17, 34, 34);
          ctx.font = '18px "Jua", cursive';
          ctx.textAlign = 'center';
          ctx.fillText('📦', 0, 7);
        } else if (item.type === 'SHIELD') {
          ctx.fillStyle = '#0284c7';
          ctx.beginPath();
          ctx.arc(0, 0, 19, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.font = '18px "Jua", cursive';
          ctx.textAlign = 'center';
          ctx.fillText('🛡️', 0, 7);
        }

        ctx.restore();
      });

      // 7. Draw Obstacles
      eng.obstacles.forEach((obs) => {
        const ox = centerX + obs.x;
        const oy = obs.y;

        // Warning marker if top of screen
        if (oy < 30 && (obs.type === 'SEDAN' || obs.type === 'TRUCK' || obs.type === 'BARREL')) {
          ctx.fillStyle = '#ef4444';
          ctx.font = '700 15px "Jua", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('🚨 주의!', ox, 35);
        }

        ctx.save();
        ctx.translate(ox, oy);

        if (obs.type === 'SEDAN' || obs.type === 'TRUCK') {
          // Shadow
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.fillRect(-obs.width / 2 + 4, -obs.height / 2 + 6, obs.width, obs.height);

          // Car Body
          ctx.fillStyle = obs.color;
          ctx.fillRect(-obs.width / 2, -obs.height / 2, obs.width, obs.height);

          // Roof / Windshield
          ctx.fillStyle = '#94a3b8';
          ctx.fillRect(-obs.width / 2 + 5, -obs.height / 2 + 12, obs.width - 10, 16);

          // Headlights or Taillights
          ctx.fillStyle = obs.vy < 0 ? '#fef08a' : '#ef4444';
          ctx.fillRect(-obs.width / 2 + 3, obs.height / 2 - 5, 8, 4);
          ctx.fillRect(obs.width / 2 - 11, obs.height / 2 - 5, 8, 4);
        } else if (obs.type === 'BARREL') {
          ctx.rotate(obs.animFrame);
          ctx.fillStyle = '#b45309';
          ctx.fillRect(-19, -19, 38, 38);
          ctx.fillStyle = '#f59e0b';
          ctx.fillRect(-15, -15, 30, 30);
        } else if (obs.type === 'BARRICADE') {
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(-obs.width / 2, -10, 8, 20);
          ctx.fillRect(obs.width / 2 - 8, -10, 8, 20);

          const isOrange = Math.floor(obs.animFrame * 5) % 2 === 0;
          ctx.fillStyle = isOrange ? '#f97316' : '#f8fafc';
          ctx.fillRect(-obs.width / 2 + 4, -12, obs.width - 8, 14);

          ctx.fillStyle = Math.floor(obs.animFrame * 10) % 2 === 0 ? '#fbbf24' : '#78350f';
          ctx.beginPath();
          ctx.arc(0, -16, 6, 0, Math.PI * 2);
          ctx.fill();
        } else if (obs.type === 'PUDDLE') {
          ctx.fillStyle = '#0284c7';
          ctx.beginPath();
          ctx.ellipse(0, 0, obs.width / 2, obs.height / 2, Math.sin(obs.animFrame) * 0.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#38bdf8';
          ctx.beginPath();
          ctx.ellipse(-5, -2, obs.width / 4, obs.height / 4, 0, 0, Math.PI * 2);
          ctx.fill();
        } else if (obs.type === 'CONE') {
          const bounceY = Math.abs(Math.sin(obs.animFrame * 3)) * 4;
          ctx.translate(0, -bounceY);
          ctx.fillStyle = '#f97316';
          ctx.beginPath();
          ctx.moveTo(0, -16);
          ctx.lineTo(-14, 14);
          ctx.lineTo(14, 14);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(-8, -2, 16, 5);
        }

        ctx.restore();
      });

      // 8. Draw Player Truck
      ctx.save();
      ctx.translate(eng.truck.x + eng.truck.laneX, eng.truck.y);
      ctx.rotate(eng.truck.tilt + eng.truck.spinAngle);

      // Headlight beams onto road
      ctx.fillStyle = 'rgba(254, 240, 138, 0.12)';
      ctx.beginPath();
      ctx.moveTo(-eng.truck.width / 2 + 8, -eng.truck.height / 2);
      ctx.lineTo(-eng.truck.width / 2 - 40, -eng.truck.height / 2 - 130);
      ctx.lineTo(eng.truck.width / 2 + 40, -eng.truck.height / 2 - 130);
      ctx.lineTo(eng.truck.width / 2 - 8, -eng.truck.height / 2);
      ctx.closePath();
      ctx.fill();

      // Shield Aura
      if (eng.truck.hasShield) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(0, 0, eng.truck.height / 2 + 10, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
        ctx.beginPath();
        ctx.arc(0, 0, eng.truck.height / 2 + 10, 0, Math.PI * 2);
        ctx.fill();
      }

      // Truck Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(-eng.truck.width / 2 + 4, -eng.truck.height / 2 + 10, eng.truck.width, eng.truck.height);

      const colorSet = TRUCK_COLOR_MAP[truckColor];

      // Truck Cabin (front)
      ctx.fillStyle = colorSet.body;
      ctx.fillRect(-eng.truck.width / 2, -eng.truck.height / 2, eng.truck.width, eng.truck.height - 24);

      // Cargo Bed
      ctx.fillStyle = colorSet.hex;
      ctx.fillRect(-eng.truck.width / 2 + 3, eng.truck.height / 2 - 30, eng.truck.width - 6, 26);

      // Cabin Windshield
      ctx.fillStyle = colorSet.light;
      ctx.fillRect(-eng.truck.width / 2 + 8, -eng.truck.height / 2 + 10, eng.truck.width - 16, 14);

      // Headlights
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(-eng.truck.width / 2 + 4, -eng.truck.height / 2, 8, 4);
      ctx.fillRect(eng.truck.width / 2 - 12, -eng.truck.height / 2, 8, 4);

      // Tail lights
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(-eng.truck.width / 2 + 4, eng.truck.height / 2 - 4, 10, 4);
      ctx.fillRect(eng.truck.width / 2 - 14, eng.truck.height / 2 - 4, 10, 4);

      // Stacked Cargo Boxes on the Bed
      const boxWidth = 26;
      const boxHeight = 16;
      for (let i = 0; i < eng.cargoCount; i++) {
        const row = Math.floor(i / 2);
        const col = i % 2;
        const bx = col === 0 ? -boxWidth + 2 : 2;
        const by = -eng.truck.height / 2 + 28 + row * (boxHeight - 2);

        ctx.fillStyle = '#d97706';
        ctx.fillRect(bx, by, boxWidth - 4, boxHeight - 4);
        ctx.strokeStyle = '#78350f';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(bx, by, boxWidth - 4, boxHeight - 4);

        // Tape ribbon on cargo box
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(bx + (boxWidth - 4) / 2 - 2, by, 4, boxHeight - 4);
      }

      ctx.restore();

      // 9. Falling Cargos
      eng.fallingCargos.forEach((fc) => {
        ctx.save();
        ctx.translate(fc.x, fc.y);
        ctx.rotate(fc.rotation);
        ctx.globalAlpha = fc.alpha;
        ctx.fillStyle = '#b45309';
        ctx.fillRect(-13, -9, 26, 18);
        ctx.strokeStyle = '#451a03';
        ctx.strokeRect(-13, -9, 26, 18);
        ctx.restore();
      });

      // 10. Floating Particle Texts & Dust
      eng.particles.forEach((p) => {
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.alpha);

        if (p.text) {
          ctx.font = '900 17px "Jua", sans-serif';
          ctx.fillStyle = p.color;
          ctx.textAlign = 'center';
          ctx.fillText(p.text, p.x, p.y);
        } else {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius || 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      });
    };

    const loop = (now: number) => {
      const delta = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      if (canvasRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          updatePhysics(delta, canvas.width, canvas.height);
          renderCanvas(ctx, canvas.width, canvas.height);
        }
      }

      animationFrameId.current = requestAnimationFrame(loop);
    };

    animationFrameId.current = requestAnimationFrame(loop);
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [config.goalDistance, config.shieldChance, config.spawnMultiplier, dropCargo, endGame, truckColor]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-start p-2 sm:p-4 md:p-6 overflow-x-hidden font-sans">
      {/* Universal 3-Zone Top Bar Contract */}
      <header className="w-full max-w-4xl flex items-center justify-between gap-4 sm:gap-8 px-4 py-3 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl mb-4">
        {/* Zone 1: Brand Wordmark */}
        <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
          <span className="text-2xl sm:text-3xl animate-bounce">🚚</span>
          <span className="font-jua text-lg sm:text-2xl text-amber-400 arcade-glow tracking-wide">
            이삿짐 운반 대작전
          </span>
        </div>

        {/* Zone 2: Navigation Links */}
        <nav className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm font-medium">
          <button
            onClick={() => setActiveTab('GAME')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'GAME'
                ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            게임 플레이
          </button>
          <button
            onClick={() => setActiveTab('SETTINGS')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1 ${
              activeTab === 'SETTINGS'
                ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>설정</span>
          </button>
          <button
            onClick={() => setActiveTab('LEADERBOARD')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1 ${
              activeTab === 'LEADERBOARD'
                ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Trophy className="w-3.5 h-3.5" />
            <span>기록실</span>
          </button>
          <button
            onClick={() => setActiveTab('RULES')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1 ${
              activeTab === 'RULES'
                ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>도움말</span>
          </button>
        </nav>

        {/* Zone 3: Primary Action (Sound Mute / Unmute & Restart) */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={toggleMute}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-400 rounded-xl transition border border-slate-700"
            title={isMuted ? '음소거 해제' : '음소거'}
            aria-label="음향 켜기/끄기"
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>
        </div>
      </header>

      {/* Main Game Card Viewport */}
      {activeTab === 'GAME' && (
        <main
          ref={wrapperRef}
          className="relative w-full max-w-4xl bg-slate-900 rounded-2xl shadow-2xl overflow-hidden border-2 border-slate-800 flex flex-col items-center transition-all"
        >
          {/* Top In-Game Dashboard HUD */}
          <div className="w-full bg-slate-900/95 border-b-2 border-slate-800 p-2.5 sm:p-3 flex flex-wrap items-center justify-between gap-2 z-10">
            {/* Speedometer */}
            <div className="flex items-center space-x-1.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
              <Zap className="w-4 h-4 text-yellow-400" />
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">속도</div>
                <div className="font-jua text-base sm:text-lg text-yellow-400 leading-none">
                  {hudState.speed} km/h
                </div>
              </div>
            </div>

            {/* Cargo Box Counter */}
            <div className="flex items-center space-x-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
              <Package className="w-4 h-4 text-emerald-400" />
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">남은 이삿짐</div>
                <div className="font-jua text-base sm:text-lg text-emerald-400 leading-none">
                  {hudState.cargo} / 10개
                </div>
              </div>
            </div>

            {/* Near Miss Counter & Combo Badge */}
            <div className="flex items-center space-x-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
              <Flame className={`w-4 h-4 ${hudState.combo > 1 ? 'text-rose-500 animate-pulse' : 'text-amber-400'}`} />
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">아슬아슬 피하기</div>
                <div className="font-jua text-base sm:text-lg text-amber-400 leading-none">
                  {hudState.nearMiss}회 {hudState.combo > 1 && <span className="text-rose-400 text-xs">x{hudState.combo}!</span>}
                </div>
              </div>
            </div>

            {/* Shield Indicator */}
            {hudState.hasShield && (
              <div className="flex items-center space-x-1.5 bg-cyan-950/90 px-3 py-1.5 rounded-xl border border-cyan-500/60 shadow-lg shadow-cyan-500/20">
                <Shield className="w-4 h-4 text-cyan-300 animate-pulse" />
                <span className="text-xs font-bold text-cyan-300">보호막 활성</span>
              </div>
            )}

            {/* Timer */}
            <div className="flex items-center space-x-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
              <Clock className={`w-4 h-4 ${hudState.time <= 15 ? 'text-rose-400 animate-bounce' : 'text-cyan-400'}`} />
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">제한시간</div>
                <div
                  className={`font-jua text-base sm:text-lg leading-none ${
                    hudState.time <= 15 ? 'text-rose-400 font-black' : 'text-cyan-400'
                  }`}
                >
                  {hudState.time}s
                </div>
              </div>
            </div>

            {/* Pause Button */}
            {hudState.status === 'PLAYING' && (
              <button
                onClick={pauseGame}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700"
                title="일시정지 (P / Esc)"
                aria-label="일시정지"
              >
                <Pause className="w-4 h-4" />
              </button>
            )}
            {hudState.status === 'PAUSED' && (
              <button
                onClick={pauseGame}
                className="p-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl"
                title="계속하기"
                aria-label="계속하기"
              >
                <Play className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Progress Bar Track */}
          <div className="w-full bg-slate-950 px-4 py-2 border-b border-slate-800 flex items-center space-x-3 z-10">
            <span className="text-xs text-slate-400 font-bold uppercase shrink-0">출발 🚚</span>
            <div className="relative flex-1 bg-slate-800 h-3 rounded-full overflow-hidden border border-slate-700">
              <div
                className="bg-gradient-to-r from-amber-500 via-emerald-400 to-cyan-400 h-full transition-all duration-75"
                style={{ width: `${hudState.progress}%` }}
              />
            </div>
            <span className="text-xs text-amber-400 font-bold uppercase shrink-0">🏡 목적지</span>
          </div>

          {/* Canvas Viewport */}
          <div
            className="relative w-full flex justify-center items-center bg-slate-950 overflow-hidden"
            style={{ height: '520px' }}
          >
            <canvas ref={canvasRef} className="w-full h-full block" />

            {/* Overlay Screen: Ready / Start */}
            {hudState.status === 'START' && (
              <div className="absolute inset-0 bg-slate-950/92 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-20">
                <div className="text-5xl sm:text-6xl mb-2 animate-bounce">🚚📦</div>
                <h2 className="font-jua text-3xl sm:text-5xl text-amber-400 arcade-glow mb-2">
                  이삿짐 운반 대작전!
                </h2>
                <p className="text-slate-300 text-xs sm:text-sm max-w-md mb-5 leading-relaxed">
                  {config.totalTime}초 안에 목적지까지 안전하게 이삿짐을 운반하세요!<br />
                  <span className="text-cyan-300 font-bold">📦 상자</span>로 잃어버린 짐을 복구하고,{' '}
                  <span className="text-amber-300 font-bold">🛡️ 쉴드</span>로 1회 충돌을 방어하세요.<br />
                  <span className="text-rose-400 font-medium">급회전, 장애물 충돌, 부스터 남발</span> 시 상자가 낙하합니다!
                </p>

                {/* Difficulty Quick Select */}
                <div className="flex items-center gap-2 mb-5">
                  <span className="text-xs text-slate-400 font-medium mr-1">난이도:</span>
                  {(['EASY', 'NORMAL', 'HARD'] as Difficulty[]).map((d) => (
                    <button
                      key={d}
                      onClick={() => setDifficulty(d)}
                      className={`px-3 py-1 text-xs font-bold rounded-lg border transition ${
                        difficulty === d
                          ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-md'
                          : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      {d === 'EASY' ? '쉬움 (70초)' : d === 'NORMAL' ? '보통 (60초)' : '하드 러시 (50초)'}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-3 max-w-xs w-full mb-6 text-xs text-slate-300">
                  <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-700 flex flex-col items-center">
                    <span className="font-bold text-amber-400 mb-0.5">← / → (A / D)</span>
                    <span>차선 이동 및 급회전</span>
                  </div>
                  <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-700 flex flex-col items-center">
                    <span className="font-bold text-cyan-400 mb-0.5">Spacebar</span>
                    <span>부스터 터보 가속</span>
                  </div>
                </div>

                <button
                  onClick={startGame}
                  className="font-jua text-xl sm:text-2xl px-10 py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold rounded-2xl shadow-xl transform transition active:scale-95 border-2 border-amber-300 flex items-center gap-2 cursor-pointer"
                >
                  <Play className="w-6 h-6 fill-current" />
                  <span>운전 시작하기 (Space / Enter)</span>
                </button>
              </div>
            )}

            {/* Overlay Screen: Paused */}
            {hudState.status === 'PAUSED' && (
              <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-20">
                <div className="text-4xl mb-2">⏸️</div>
                <h2 className="font-jua text-3xl sm:text-4xl text-amber-400 mb-3">잠시 멈춤</h2>
                <p className="text-slate-300 text-sm mb-6">숨을 고르고 목적지까지 다시 출발하세요!</p>
                <div className="flex gap-3">
                  <button
                    onClick={pauseGame}
                    className="font-jua text-lg px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-lg border border-emerald-400 transition"
                  >
                    계속 운전하기
                  </button>
                  <button
                    onClick={startGame}
                    className="font-jua text-lg px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-xl border border-slate-600 transition"
                  >
                    처음부터 재도전
                  </button>
                </div>
              </div>
            )}

            {/* Overlay Screen: Result (Clear / Game Over) */}
            {(hudState.status === 'CLEAR' || hudState.status === 'GAMEOVER') && resultData && (
              <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-20">
                <div className={`font-jua text-7xl sm:text-8xl mb-1 drop-shadow-xl ${resultData.gradeColor}`}>
                  {resultData.grade}
                </div>
                <div className="text-4xl sm:text-5xl mb-2">{resultData.isClear ? '🎉' : '💥'}</div>
                <h2 className={`font-jua text-3xl sm:text-4xl mb-2 ${resultData.gradeColor}`}>
                  {resultData.title}
                </h2>
                <p className="text-slate-300 text-xs sm:text-sm mb-5 max-w-sm">{resultData.desc}</p>

                <div className="grid grid-cols-3 gap-2 max-w-md w-full mb-6">
                  <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-xl">
                    <div className="text-[10px] text-slate-400 uppercase font-bold mb-0.5">남은 이삿짐</div>
                    <div className="font-jua text-2xl text-emerald-400">{resultData.cargo}개</div>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-xl">
                    <div className="text-[10px] text-slate-400 uppercase font-bold mb-0.5">아슬아슬 회피</div>
                    <div className="font-jua text-2xl text-amber-400">{resultData.nearMiss}회</div>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-xl">
                    <div className="text-[10px] text-slate-400 uppercase font-bold mb-0.5">남은 시간</div>
                    <div className="font-jua text-2xl text-cyan-400">{resultData.timeRemaining}s</div>
                  </div>
                </div>

                <button
                  onClick={startGame}
                  className="font-jua text-xl px-9 py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold rounded-2xl shadow-xl border-2 border-amber-300 transform transition active:scale-95 flex items-center gap-2 cursor-pointer"
                >
                  <RotateCcw className="w-5 h-5" />
                  <span>다시 도전하기 (R)</span>
                </button>
              </div>
            )}
          </div>

          {/* On-Screen Mobile & Touch Interactive Controls */}
          <div className="w-full bg-slate-900/95 border-t border-slate-800 p-3 flex items-center justify-between gap-2">
            {/* Steering Left */}
            <div className="flex items-center gap-2">
              <button
                onMouseDown={() => {
                  engine.current.keys.Left = true;
                }}
                onMouseUp={() => {
                  engine.current.keys.Left = false;
                }}
                onTouchStart={(e) => {
                  e.preventDefault();
                  engine.current.keys.Left = true;
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  engine.current.keys.Left = false;
                }}
                className="w-14 h-14 bg-slate-800 active:bg-amber-500 active:text-slate-950 text-slate-200 border-2 border-slate-700 active:border-amber-400 rounded-2xl flex items-center justify-center font-jua text-2xl shadow-md transition-transform active:scale-95 select-none"
                aria-label="왼쪽 이동"
              >
                ◀
              </button>

              <button
                onMouseDown={() => {
                  engine.current.keys.Right = true;
                }}
                onMouseUp={() => {
                  engine.current.keys.Right = false;
                }}
                onTouchStart={(e) => {
                  e.preventDefault();
                  engine.current.keys.Right = true;
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  engine.current.keys.Right = false;
                }}
                className="w-14 h-14 bg-slate-800 active:bg-amber-500 active:text-slate-950 text-slate-200 border-2 border-slate-700 active:border-amber-400 rounded-2xl flex items-center justify-center font-jua text-2xl shadow-md transition-transform active:scale-95 select-none"
                aria-label="오른쪽 이동"
              >
                ▶
              </button>
            </div>

            {/* Horn button */}
            <button
              onClick={honkHorn}
              className="px-4 py-3 bg-slate-800 hover:bg-slate-700 active:bg-amber-500 active:text-slate-950 text-amber-400 border border-slate-700 rounded-2xl font-jua text-sm flex items-center gap-1.5 shadow-md active:scale-95 transition"
              title="경적 울리기 (H)"
            >
              <Megaphone className="w-4 h-4" />
              <span>경적 (H)</span>
            </button>

            {/* Boost Turbo Button */}
            <button
              onMouseDown={() => {
                engine.current.keys.Boost = true;
              }}
              onMouseUp={() => {
                engine.current.keys.Boost = false;
              }}
              onTouchStart={(e) => {
                e.preventDefault();
                engine.current.keys.Boost = true;
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                engine.current.keys.Boost = false;
              }}
              className="px-6 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 active:from-cyan-400 active:to-blue-400 text-white font-jua text-base sm:text-lg border border-cyan-400 rounded-2xl flex items-center gap-2 shadow-lg shadow-cyan-500/20 active:scale-95 select-none"
            >
              <Zap className="w-5 h-5 text-yellow-300 animate-pulse" />
              <span>부스터 (Space)</span>
            </button>
          </div>

          {/* Footer Guide */}
          <div className="w-full bg-slate-950 border-t border-slate-800 px-4 py-2 text-center text-xs text-slate-400 flex flex-wrap justify-around gap-2">
            <span>🕹️ 조작: <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 text-slate-200">A / ←</kbd> <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 text-slate-200">D / →</kbd></span>
            <span>⚡ 부스터: <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 text-slate-200">Space</kbd></span>
            <span>📢 경적: <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 text-slate-200">H</kbd></span>
            <span>⏸️ 일시정지: <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 text-slate-200">P / Esc</kbd></span>
            <span>🔄 재도전: <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 text-slate-200">R</kbd></span>
          </div>
        </main>
      )}

      {/* Settings Tab */}
      {activeTab === 'SETTINGS' && (
        <section className="w-full max-w-4xl bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-2xl">
          <div className="flex items-center gap-2.5 mb-6 border-b border-slate-800 pb-4">
            <Sliders className="w-6 h-6 text-amber-400" />
            <h2 className="font-jua text-2xl text-amber-400">게임 환경 & 트럭 커스텀</h2>
          </div>

          <div className="space-y-6">
            {/* Truck Color Customization */}
            <div>
              <label className="block text-sm font-bold text-slate-300 mb-3">🚚 트럭 색상 선택</label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {(Object.keys(TRUCK_COLOR_MAP) as TruckColor[]).map((cKey) => {
                  const c = TRUCK_COLOR_MAP[cKey];
                  const isSelected = truckColor === cKey;
                  return (
                    <button
                      key={cKey}
                      onClick={() => setTruckColor(cKey)}
                      className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition cursor-pointer ${
                        isSelected
                          ? 'border-amber-400 bg-slate-800 shadow-lg shadow-amber-500/10'
                          : 'border-slate-800 bg-slate-950 hover:border-slate-700'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-full border border-white/20" style={{ backgroundColor: c.hex }} />
                      <span className={`text-xs font-bold ${isSelected ? 'text-amber-400' : 'text-slate-400'}`}>
                        {c.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Difficulty Setting */}
            <div>
              <label className="block text-sm font-bold text-slate-300 mb-3">🎯 난이도 설정</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  onClick={() => setDifficulty('EASY')}
                  className={`p-4 rounded-xl border text-left transition cursor-pointer ${
                    difficulty === 'EASY'
                      ? 'border-emerald-500 bg-emerald-950/40 text-emerald-300'
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="font-jua text-lg mb-1 text-emerald-400">초급 운전자 (쉬움)</div>
                  <div className="text-xs text-slate-400">제한시간 70초, 장애물 밀도 20% 감소, 보호막 아이템 다수 등장</div>
                </button>

                <button
                  onClick={() => setDifficulty('NORMAL')}
                  className={`p-4 rounded-xl border text-left transition cursor-pointer ${
                    difficulty === 'NORMAL'
                      ? 'border-amber-500 bg-amber-950/40 text-amber-300'
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="font-jua text-lg mb-1 text-amber-400">정규 배달 (보통)</div>
                  <div className="text-xs text-slate-400">제한시간 60초, 표준 교통량 및 장애물 밸런스, 기본 규칙</div>
                </button>

                <button
                  onClick={() => setDifficulty('HARD')}
                  className={`p-4 rounded-xl border text-left transition cursor-pointer ${
                    difficulty === 'HARD'
                      ? 'border-rose-500 bg-rose-950/40 text-rose-300'
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="font-jua text-lg mb-1 text-rose-400">초특급 배송 (하드 러시)</div>
                  <div className="text-xs text-slate-400">제한시간 50초, 고속 트래픽 + 장애물 35% 증가, 극한의 집중력</div>
                </button>
              </div>
            </div>

            {/* Sound Volume Setting */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-bold text-slate-300">🔊 효과음 볼륨</label>
                <span className="text-xs text-amber-400 font-bold">{Math.round(volume * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={volume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                className="w-full accent-amber-500 h-2 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            <div className="pt-4 flex justify-end">
              <button
                onClick={() => {
                  startGame();
                  setActiveTab('GAME');
                }}
                className="font-jua text-lg px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl transition shadow-lg cursor-pointer"
              >
                설정 적용하고 게임 시작
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Leaderboard / Records Tab */}
      {activeTab === 'LEADERBOARD' && (
        <section className="w-full max-w-4xl bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-6 border-b border-slate-800 pb-4">
            <div className="flex items-center gap-2.5">
              <Trophy className="w-6 h-6 text-amber-400" />
              <h2 className="font-jua text-2xl text-amber-400">배달 명예의 전당 (최근 기록)</h2>
            </div>
            {records.length > 0 && (
              <button
                onClick={() => {
                  setRecords([]);
                  localStorage.removeItem('cargo_game_records');
                }}
                className="text-xs text-rose-400 hover:text-rose-300 underline"
              >
                기록 초기화
              </button>
            )}
          </div>

          {records.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p className="font-jua text-lg text-slate-400">아직 등록된 배달 기록이 없습니다.</p>
              <p className="text-xs mt-1">게임을 플레이하고 첫 완주 기록을 남겨보세요!</p>
              <button
                onClick={() => {
                  setActiveTab('GAME');
                  startGame();
                }}
                className="mt-4 font-jua text-sm px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl"
              >
                지금 운전하기
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase">
                    <th className="py-2.5 px-3">등급</th>
                    <th className="py-2.5 px-3">결과</th>
                    <th className="py-2.5 px-3">남은 이삿짐</th>
                    <th className="py-2.5 px-3">아슬아슬 회피</th>
                    <th className="py-2.5 px-3">남은 시간</th>
                    <th className="py-2.5 px-3">난이도</th>
                    <th className="py-2.5 px-3">일시</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {records.map((r) => {
                    const gradeColors: Record<string, string> = {
                      S: 'text-amber-400 bg-amber-400/10 border-amber-400/30',
                      A: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
                      B: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/30',
                      C: 'text-indigo-400 bg-indigo-400/10 border-indigo-400/30',
                      F: 'text-rose-500 bg-rose-500/10 border-rose-500/30',
                    };
                    return (
                      <tr key={r.id} className="hover:bg-slate-800/50 transition">
                        <td className="py-3 px-3">
                          <span
                            className={`font-jua text-base px-2.5 py-0.5 rounded-lg border font-bold ${
                              gradeColors[r.grade] || 'text-slate-300'
                            }`}
                          >
                            {r.grade}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span className={r.isClear ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                            {r.isClear ? '목적지 도착' : '운반 실패'}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-jua text-base text-slate-200">{r.cargoLeft}개</td>
                        <td className="py-3 px-3 font-jua text-base text-amber-400">{r.nearMissCount}회</td>
                        <td className="py-3 px-3 font-jua text-base text-cyan-400">{r.timeRemaining}s</td>
                        <td className="py-3 px-3 text-xs text-slate-400">
                          {r.difficulty === 'EASY' ? '쉬움' : r.difficulty === 'NORMAL' ? '보통' : '하드'}
                        </td>
                        <td className="py-3 px-3 text-xs text-slate-500">{r.date}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Rules & Tips Tab */}
      {activeTab === 'RULES' && (
        <section className="w-full max-w-4xl bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-2xl">
          <div className="flex items-center gap-2.5 mb-6 border-b border-slate-800 pb-4">
            <HelpCircle className="w-6 h-6 text-amber-400" />
            <h2 className="font-jua text-2xl text-amber-400">게임 규칙 & 고득점 비법</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-slate-300">
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
              <div className="font-jua text-base text-amber-400 mb-2 flex items-center gap-2">
                <span>📦</span>
                <span>이삿짐 분실 조건</span>
              </div>
              <ul className="space-y-1.5 text-xs text-slate-400 list-disc list-inside">
                <li><strong className="text-slate-200">장애물 충돌:</strong> 세단, 트럭, 드럼통, 바리케이드 충돌 시 -1개 낙하</li>
                <li><strong className="text-slate-200">급회전 쏠림:</strong> 짧은 시간 내 좌우로 연속 회전하면 관성으로 -1개 낙하</li>
                <li><strong className="text-slate-200">부스터 과속:</strong> 스페이스바 부스터를 1.6초 이상 연속 가속 시 -1개 낙하</li>
                <li><strong className="text-slate-200">오일 웅덩이:</strong> 밟으면 360도 스핀하며 속도 급감 및 -1개 낙하</li>
              </ul>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
              <div className="font-jua text-base text-emerald-400 mb-2 flex items-center gap-2">
                <span>✨</span>
                <span>아이템 및 특수 액션</span>
              </div>
              <ul className="space-y-1.5 text-xs text-slate-400 list-disc list-inside">
                <li><strong className="text-emerald-300">📦 상자 아이템:</strong> 먹으면 잃어버렸던 이삿짐 1개를 즉시 복구!</li>
                <li><strong className="text-cyan-300">🛡️ 보호막 아이템:</strong> 충돌이나 낙하 1회를 완벽하게 방어!</li>
                <li><strong className="text-amber-300">⚡ NEAR MISS:</strong> 장애물 옆을 간발의 차로 스쳐 지나가면 콤보 획득!</li>
                <li><strong className="text-yellow-300">📢 경적(H):</strong> 앞길을 막는 세단을 앞으로 이동시켜 길 확보 가능!</li>
              </ul>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
              <div className="font-jua text-base text-cyan-400 mb-2 flex items-center gap-2">
                <Award className="w-4 h-4 text-cyan-400" />
                <span>최종 평가 등급 (S ~ F)</span>
              </div>
              <div className="space-y-1 text-xs">
                <div><span className="text-amber-400 font-bold">S 등급:</span> 남은 이삿짐 9~10개 (이사의 달인)</div>
                <div><span className="text-emerald-400 font-bold">A 등급:</span> 남은 이삿짐 7~8개 (베테랑 기사)</div>
                <div><span className="text-cyan-400 font-bold">B 등급:</span> 남은 이삿짐 4~6개 (안전 운전자)</div>
                <div><span className="text-indigo-400 font-bold">C 등급:</span> 남은 이삿짐 1~3개 (초보 배달원)</div>
                <div><span className="text-rose-400 font-bold">F 등급:</span> 이삿짐 전멸 또는 제한시간 초과</div>
              </div>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col justify-between">
              <div>
                <div className="font-jua text-base text-yellow-400 mb-2 flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  <span>S랭크 달성 꿀팁</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  부스터는 직선 구간에서 1초씩 끊어서 짧게 사용하는 것이 안전합니다.
                  드럼통은 좌우로 튕겨 다니므로 거리를 두고 피하고, 오일 웅덩이는 차선 중앙을 유지해 피하세요!
                </p>
              </div>
              <button
                onClick={() => setActiveTab('GAME')}
                className="mt-3 font-jua text-sm py-2 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-bold transition text-center"
              >
                이삿짐 운반하러 가기 🚚
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
