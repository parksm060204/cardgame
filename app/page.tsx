'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';

type GameState = 'START' | 'PLAYING' | 'PAUSED' | 'FINISHED';

interface Card {
  id: number;
  fruit: string;
  isFlipped: boolean;
  isMatched: boolean;
}

interface RankItem {
  name: string;
  finishtime: string;
  timestamp: string;
}

const FRUIT_ASSETS = [
  { name: 'apple', path: '/fruits/apple.png' },
  { name: 'banana', path: '/fruits/banana.png' },
  { name: 'cherry', path: '/fruits/cherry.png' },
  { name: 'strawberry', path: '/fruits/strawberry.png' },
  { name: 'grape', path: '/fruits/grape.png' },
  { name: 'pineapple', path: '/fruits/pineapple.png' },
  { name: 'peach', path: '/fruits/peach.png' },
  { name: 'kiwi', path: '/fruits/kiwi.png' },
];

export default function CardGame() {
  const [playerName, setPlayerName] = useState('');
  const [gameState, setGameState] = useState<GameState>('START');
  const [cards, setCards] = useState<Card[]>([]);
  const [flippedCards, setFlippedCards] = useState<number[]>([]);
  const [time, setTime] = useState(0);
  const [score, setScore] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [leaderboard, setLeaderboard] = useState<RankItem[]>([]);

  const GAS_URL = "https://script.google.com/macros/s/AKfycbyyGeVHCdeL5ajpbNrGQlj59zyXbddeTfmM9vxev13BOBMk_eX7cep4TEL7MFIjggk6/exec"; 

  // Initialize and Shuffle Cards
  const initGame = useCallback(() => {
    const doubledFruits = [...FRUIT_ASSETS, ...FRUIT_ASSETS];
    const shuffledCards = doubledFruits
      .sort(() => Math.random() - 0.5)
      .map((fruitObj, index) => ({
        id: index,
        fruit: fruitObj.path,
        isFlipped: false,
        isMatched: false,
      }));
    setCards(shuffledCards);
    setFlippedCards([]);
    setTime(0);
    setScore(0);
    setGameState('PLAYING');
    setIsSaving(false);
    setLeaderboard([]);
  }, []);

  // Timer Logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (gameState === 'PLAYING') {
      interval = setInterval(() => {
        setTime((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [gameState]);

  // Win Condition Check
  useEffect(() => {
    if (cards.length > 0 && cards.every((card) => card.isMatched)) {
      setGameState('FINISHED');
      handleGameEnd();
    }
  }, [cards]);

  const handleGameEnd = async () => {
    await saveGameResult();
    await fetchLeaderboard();
  };

  const saveGameResult = async () => {
    if (!GAS_URL || isSaving) return;
    setIsSaving(true);
    
    try {
      // mode: 'no-cors'와 text/plain을 사용하여 CORS 프리플라이트를 피합니다.
      await fetch(GAS_URL, {
        method: "POST",
        mode: "no-cors", 
        headers: {
          "Content-Type": "text/plain", 
        },
        body: JSON.stringify({
          name: playerName,
          finishtime: formatTime(time),
          timestamp: new Date().toISOString()
        }),
      });
      console.log("Data sent to Google Sheets");
    } catch (error) {
      console.error("Error saving to Google Sheets:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const fetchLeaderboard = async () => {
    if (!GAS_URL) return;
    try {
      const response = await fetch(GAS_URL);
      const data = await response.json();
      
      if (Array.isArray(data)) {
        // 시간순으로 정렬 및 시트 형식 처리
        const parsed = data.map((item: any) => {
          let seconds = 0;
          let displayTime = item.finishtime;
          
          if (typeof displayTime === 'string' && displayTime.includes('T') && displayTime.includes('Z')) {
            // 구글 시트가 "0:32"(분:초)를 0시간 32분으로 자동 변환해 KST 자정 이후 시간으로 저장한 경우
            try {
              const d = new Date(displayTime);
              const timeSplit = d.toLocaleString('en-US', { 
                timeZone: 'Asia/Seoul', 
                hourCycle: 'h23', 
                hour: '2-digit', 
                minute: '2-digit' 
              }).split(':');
              
              const gameMin = parseInt(timeSplit[0], 10) || 0;
              const gameSec = parseInt(timeSplit[1], 10) || 0;
              
              seconds = gameMin * 60 + gameSec;
              displayTime = `${gameMin}:${gameSec.toString().padStart(2, '0')}`;
            } catch (e) {
              console.error("Time parsing error", e);
            }
          } else if (typeof displayTime === 'string' && displayTime.includes(':')) {
            // "0:32" 문자열 형태로 그대로 온 경우
            const parts = displayTime.split(':');
            seconds = (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
          } else {
            seconds = 9999;
          }

          return {
            ...item,
            finishtime: displayTime,
            seconds
          };
        });
        
        const sorted = parsed.sort((a, b) => a.seconds - b.seconds);
        setLeaderboard(sorted.slice(0, 3));
      }
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
    }
  };

  const handleCardClick = (index: number) => {
    if (
      gameState !== 'PLAYING' ||
      isProcessing ||
      cards[index].isFlipped ||
      cards[index].isMatched ||
      flippedCards.includes(index)
    ) {
      return;
    }

    const newCards = [...cards];
    newCards[index].isFlipped = true;
    setCards(newCards);

    const newFlipped = [...flippedCards, index];
    setFlippedCards(newFlipped);

    if (newFlipped.length === 2) {
      setIsProcessing(true);
      const [first, second] = newFlipped;

      if (cards[first].fruit === cards[second].fruit) {
        // Match!
        setTimeout(() => {
          const matchedCards = [...cards];
          matchedCards[first].isMatched = true;
          matchedCards[second].isMatched = true;
          setCards(matchedCards);
          setFlippedCards([]);
          setScore((prev) => prev + 100);
          setIsProcessing(false);
        }, 500);
      } else {
        // No match
        setTimeout(() => {
          const resetCards = [...cards];
          resetCards[first].isFlipped = false;
          resetCards[second].isFlipped = false;
          setCards(resetCards);
          setFlippedCards([]);
          setIsProcessing(false);
        }, 1000);
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const matchedCount = cards.filter(c => c.isMatched).length;
  const progressPercent = cards.length > 0 ? (matchedCount / cards.length) * 100 : 0;

  return (
    <div className="flex flex-col items-center min-h-screen pb-24 relative overflow-x-hidden">
      
      {/* HEADER BAR */}
      <div className="w-full max-w-md flex items-center justify-between p-6">
        <button onClick={() => setGameState('START')} className="text-orange-500 flex items-center gap-2 font-bold">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          <span className="text-xl">Match & Pop</span>
        </button>
        <button onClick={initGame} className="text-orange-400 font-extrabold text-lg">초기화</button>
      </div>

      {gameState === 'START' && (
        <div className="flex flex-col items-center w-full max-w-md px-6 animate-in fade-in duration-700">
          <div className="flex flex-col items-center mt-2 mb-6">
            <h1 className="text-[48px] sm:text-[64px] leading-tight font-black text-center text-[#4a3728] italic">
              MATCH <span className="text-orange-600">&</span><br/>POP
            </h1>
            <div className="flex gap-4 mt-2">
               <div className="w-12 h-12 sm:w-16 sm:h-16 bg-red-100 rounded-full flex items-center justify-center transform -rotate-12 border-4 border-white shadow-lg text-xl sm:text-2xl">🍎</div>
               <div className="w-12 h-12 sm:w-16 sm:h-16 bg-orange-100 rounded-full flex items-center justify-center transform rotate-6 border-4 border-white shadow-lg text-xl sm:text-2xl">🍊</div>
               <div className="w-12 h-12 sm:w-16 sm:h-16 bg-green-100 rounded-full flex items-center justify-center transform -rotate-6 border-4 border-white shadow-lg text-xl sm:text-2xl">🍃</div>
            </div>
          </div>

          <div className="w-full flex flex-col gap-4">
            <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest pl-2">게임 방법</h3>
            <div className="flex justify-between gap-3">
              {[
                { n: 1, t: '카드 뒤집기' },
                { n: 2, t: '짝 맞추기' },
                { n: 3, t: '승리!' }
              ].map((step) => (
                <div key={step.n} className="flex-1 playful-card p-4 flex flex-col items-center text-center gap-2">
                  <div className="w-10 h-10 bg-slate-100 rounded-2xl flex items-center justify-center font-black text-lg">{step.n}</div>
                  <span className="text-[12px] font-bold leading-tight">{step.t}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="w-full mt-6 relative">
            <h3 className="text-xs sm:text-sm font-black text-slate-500 uppercase tracking-widest pl-2 mb-2">닉네임을 입력해 주세요</h3>
            <div className="relative z-10">
              <input
                type="text"
                placeholder="예: 과일대장1"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="w-full p-4 sm:p-6 h-16 sm:h-20 rounded-[28px] sm:rounded-[32px] border-none outline-none text-lg sm:text-xl font-bold playful-card focus:ring-4 focus:ring-orange-200"
              />
              <div className="absolute top-1/2 right-6 -translate-y-1/2 text-slate-300">
                 <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
              </div>
            </div>
          </div>

          <button
            onClick={initGame}
            disabled={!playerName.trim()}
            className="btn-gold w-full mt-8 h-20 sm:h-24 text-xl sm:text-2xl justify-center disabled:grayscale disabled:opacity-50"
          >
            게임 시작 <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </button>
        </div>
      )}

      {(gameState === 'PLAYING' || gameState === 'PAUSED' || gameState === 'FINISHED') && (
        <div className="flex flex-col items-center w-full max-w-sm px-4 animate-in fade-in duration-500">
          
          {/* STATS AREA */}
          <div className="flex gap-4 w-full mb-6 mt-2">
            <div className="flex-1 playful-card p-4 sm:p-6 flex flex-col items-center">
              <span className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-widest mb-0.5">점수</span>
              <span className="text-2xl sm:text-3xl font-black text-orange-800">{score.toLocaleString()}</span>
            </div>
            <div className="flex-1 playful-card p-4 sm:p-6 flex flex-col items-center">
              <span className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-widest mb-0.5">시간</span>
              <span className="text-2xl sm:text-3xl font-black text-green-700 font-mono">{formatTime(time)}</span>
            </div>
          </div>

          {/* GRID */}
          <div className="grid-wrapper mb-6 relative">
            <div className="grid-container">
              {cards.map((card, index) => (
                <div
                  key={card.id}
                  onClick={() => handleCardClick(index)}
                  className={`game-card ${card.isFlipped || card.isMatched ? 'flipped' : ''}`}
                >
                  <div className="card-layer card-layer-front" />
                  <div className="card-layer card-layer-back">
                    <Image src={card.fruit} alt="fruit" width={60} height={60} className="select-none" />
                  </div>
                </div>
              ))}
            </div>
            {gameState === 'PAUSED' && (
              <div className="absolute inset-0 bg-white/20 backdrop-blur-md rounded-[40px] flex items-center justify-center z-10 animate-in fade-in duration-300">
                 <h2 className="text-4xl font-black text-orange-600 drop-shadow-md">일시정지됨</h2>
              </div>
            )}
          </div>

          {/* PROGRESS BAR */}
          <div className="w-full playful-card p-5 sm:p-8 flex flex-col gap-3 mb-2">
            <div className="flex justify-between items-end">
               <span className="text-lg sm:text-xl font-black">레벨 {(matchedCount/2 + 1).toFixed(0)}</span>
               <span className="text-xs sm:text-sm font-bold text-slate-500">{progressPercent.toFixed(0)}% 완료</span>
            </div>
            <div className="progress-container">
              <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>

          {/* CONTROLS */}
          <div className="flex items-center gap-6 sm:gap-10 mt-4">
             <div className="flex flex-col items-center gap-1.5">
                <button onClick={initGame} className="btn-icon w-12 h-12 sm:w-16 sm:h-16">
                   <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                </button>
                <span className="text-[10px] sm:text-xs font-black text-slate-400">시작</span>
             </div>
             <div className="flex flex-col items-center gap-1.5">
                <button 
                  onClick={() => setGameState(gameState === 'PLAYING' ? 'PAUSED' : 'PLAYING')}
                  className={`btn-icon w-16 h-16 sm:w-20 sm:h-20 bg-yellow-100 ${gameState === 'PAUSED' ? 'active' : ''}`}
                >
                   {gameState === 'PLAYING' ? (
                     <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                   ) : (
                     <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                   )}
                </button>
                <span className="text-[10px] sm:text-xs font-black text-slate-400">일시정지</span>
             </div>
             <div className="flex flex-col items-center gap-1.5">
                <button onClick={() => setGameState('PLAYING')} className="btn-icon w-12 h-12 sm:w-16 sm:h-16">
                   <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                </button>
                <span className="text-[10px] sm:text-xs font-black text-slate-400">계속</span>
             </div>
          </div>
        </div>
      )}

      {/* SUCCESS MODAL */}
      {gameState === 'FINISHED' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overlay-blur overflow-y-auto">
          <div className="w-full max-w-sm playful-card p-8 flex flex-col items-center gap-6 modal-animate-in shadow-2xl my-auto">
            <div className="flex flex-col items-center text-center">
               <div className="text-6xl mb-2 animate-bounce">🏆</div>
               <h2 className="text-3xl font-black text-orange-600">미션 클리어!</h2>
               <p className="text-slate-500 font-bold">{playerName}님, 대단해요!</p>
            </div>
            
            <div className="w-full flex gap-3">
              <div className="flex-1 bg-slate-50 rounded-2xl p-4 flex flex-col items-center border-2 border-slate-100">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">최종 점수</span>
                <span className="text-2xl font-black text-orange-800">{score.toLocaleString()}</span>
              </div>
              <div className="flex-1 bg-slate-50 rounded-2xl p-4 flex flex-col items-center border-2 border-slate-100">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">소요 시간</span>
                <span className="text-2xl font-black text-green-700 font-mono">{formatTime(time)}</span>
              </div>
            </div>

            {/* LEADERBOARD SECTION */}
            <div className="w-full mt-2">
               <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <span className="text-lg">🔥</span> TOP 3 랭킹
               </h3>
               <div className="flex flex-col gap-2">
                  {leaderboard.length > 0 ? leaderboard.map((rank, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-white rounded-xl shadow-sm border border-slate-50">
                       <div className="flex items-center gap-3">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${i === 0 ? 'bg-yellow-400 text-white' : i === 1 ? 'bg-slate-300 text-white' : 'bg-orange-200 text-white'}`}>
                             {i + 1}
                          </span>
                          <span className="font-bold text-sm text-slate-700">{rank.name}</span>
                       </div>
                       <span className="text-sm font-black text-orange-600 font-mono">{rank.finishtime}</span>
                    </div>
                  )) : (
                    <div className="text-center py-4 bg-slate-50 rounded-xl text-xs font-bold text-slate-400">
                       랭킹을 불러오는 중...
                    </div>
                  )}
               </div>
            </div>

            <div className="w-full flex flex-col gap-3">
               <button onClick={initGame} className="btn-gold w-full h-16 text-lg justify-center">
                  다시 하기 <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M11 2a9 9 0 0 0-9 9 9 9 0 0 0 9 9 9 9 0 0 0 9-9V9.22c.61-.45 1-1.17 1-2a2 2 0 0 0-2-2 2 2 0 0 0-2 2c0 .83.39 1.55 1 2V11a7 7 0 1 1-7-7c1.55 0 2.97.5 4.14 1.36L14.71 8.8a1 1 0 0 0 .71 1.7h5.1a1 1 0 0 0 1-1V4.4a1 1 0 0 0-1.7-.71l-1.42 1.42A8.995 8.995 0 0 0 11 2Z"/></svg>
               </button>
               <button onClick={() => setGameState('START')} className="w-full h-12 rounded-[20px] bg-slate-100 font-black text-slate-500 hover:bg-slate-200 transition-colors text-sm">
                  처음으로
               </button>
            </div>
          </div>
        </div>
      )}

      {/* BOTTOM NAV */}
      <div className="fixed bottom-0 left-0 right-0 h-24 bg-white/80 backdrop-blur-xl border-t border-slate-100 flex items-center justify-around px-10 z-50">
         <button onClick={() => setGameState('START')} className={`flex flex-col items-center gap-1 font-black ${gameState !== 'START' ? 'text-slate-400' : 'text-orange-600'}`}>
            <div className={`w-12 h-8 rounded-full flex items-center justify-center ${gameState === 'START' ? 'bg-yellow-100' : ''}`}>🎮</div>
            <span className="text-[10px]">플레이</span>
         </button>
         <button className="flex flex-col items-center gap-1 text-slate-400 font-bold">
            <div className="w-12 h-8 flex items-center justify-center text-lg">📊</div>
            <span className="text-[10px]">기록</span>
         </button>
         <button className="flex flex-col items-center gap-1 text-slate-400 font-bold">
            <div className="w-12 h-8 flex items-center justify-center text-lg">⚙️</div>
            <span className="text-[10px]">설정</span>
         </button>
      </div>

    </div>
  );
}
