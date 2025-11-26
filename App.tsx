import React, { useState, useEffect, useCallback } from 'react';
import { createDeck, getWinner } from './utils/pokerLogic';
import { GameState, HandPhase, Player, TrainingProfile, SkillLevel, HandRecord, HandActionLog } from './types';
import { PlayerSeat } from './components/PlayerSeat';
import { CardDisplay } from './components/CardDisplay';
import { getStrategicAdvice, analyzeSkillLevel, analyzeHand } from './services/geminiService';
import { Brain, Trophy, RefreshCw, MessageSquare, History, X, ChevronRight, Eye, Settings, Users } from 'lucide-react';

const INITIAL_CHIPS = 1000;
const SMALL_BLIND = 10;
const BIG_BLIND = 20;

const PHASE_MAP: Record<HandPhase, string> = {
  [HandPhase.PREFLOP]: '翻牌前',
  [HandPhase.FLOP]: '翻牌圈',
  [HandPhase.TURN]: '转牌圈',
  [HandPhase.RIVER]: '河牌圈',
  [HandPhase.SHOWDOWN]: '摊牌',
  [HandPhase.GAME_OVER]: '游戏结束',
};

// Seat positions pushed to edges to prevent overlap
// Top player moved down to 20% to clear top status bar
// Bottom player moved up to 15% (from bottom) to allow space for chips/badges
const SEAT_POSITIONS: Record<number, any[]> = {
    2: [
        { bottom: '15%', left: '50%', position: 'bottom' }, // User
        { top: '20%', left: '50%', position: 'top' }        // Bot 1
    ],
    3: [
        { bottom: '15%', left: '50%', position: 'bottom' },
        { top: '20%', left: '15%', position: 'top-left' },
        { top: '20%', left: '85%', position: 'top-right' }
    ],
    4: [
        { bottom: '15%', left: '50%', position: 'bottom' },
        { top: '50%', left: '8%', position: 'left' },      
        { top: '20%', left: '50%', position: 'top' },        
        { top: '50%', left: '92%', position: 'right' }       
    ],
    5: [
        { bottom: '15%', left: '50%', position: 'bottom' },
        { top: '50%', left: '8%', position: 'left' },
        { top: '15%', left: '20%', position: 'top-left' },
        { top: '15%', left: '80%', position: 'top-right' },
        { top: '50%', left: '92%', position: 'right' }
    ]
};

export default function App() {
  // --- State ---
  const [totalPlayers, setTotalPlayers] = useState<number>(2);
  const [showSettings, setShowSettings] = useState(false);

  const [gameState, setGameState] = useState<GameState>({
    deck: [],
    communityCards: [],
    pot: 0,
    currentBet: 0,
    phase: HandPhase.PREFLOP,
    players: [],
    currentPlayerIndex: 0,
    dealerIndex: 0,
    smallBlind: SMALL_BLIND,
    bigBlind: BIG_BLIND,
    message: "欢迎来到德州扑克 AI 教练",
    handWinnerId: null,
    handLogs: [],
  });

  const [trainingProfile, setTrainingProfile] = useState<TrainingProfile>({
    gamesPlayed: 0,
    handsWon: 0,
    totalWinnings: 0,
    skillLevel: SkillLevel.BEGINNER,
    strengths: [],
    weaknesses: [],
    assessmentComplete: false,
  });

  const [aiAdvice, setAiAdvice] = useState<string>("");
  const [isLoadingAdvice, setIsLoadingAdvice] = useState<boolean>(false);
  const [handRecords, setHandRecords] = useState<HandRecord[]>([]);
  
  // Assessment Mode State
  const [isAssessmentMode, setIsAssessmentMode] = useState(false);
  const [assessmentCount, setAssessmentCount] = useState(0);
  const [showAssessmentResult, setShowAssessmentResult] = useState(false);
  const [assessmentResult, setAssessmentResult] = useState<Partial<TrainingProfile> | null>(null);

  // History UI State
  const [showHistory, setShowHistory] = useState(false);
  const [selectedHand, setSelectedHand] = useState<HandRecord | null>(null);
  const [isAnalyzingHand, setIsAnalyzingHand] = useState(false);

  // --- Initialization ---
  useEffect(() => {
    // Load profile and history
    const savedProfile = localStorage.getItem('pokerProfile');
    const savedHistory = localStorage.getItem('pokerHistory');
    
    if (savedProfile) setTrainingProfile(JSON.parse(savedProfile));
    if (savedHistory) setHandRecords(JSON.parse(savedHistory));
    
    startNewGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save
  useEffect(() => {
    localStorage.setItem('pokerProfile', JSON.stringify(trainingProfile));
  }, [trainingProfile]);

  useEffect(() => {
    localStorage.setItem('pokerHistory', JSON.stringify(handRecords));
  }, [handRecords]);

  // --- Game Logic Controllers ---

  const startNewGame = useCallback((overridePlayerCount?: number) => {
    const playerCount = overridePlayerCount || totalPlayers;

    // If in assessment mode and reached 5 games, stop and show results
    if (isAssessmentMode && assessmentCount >= 5) {
        setIsAssessmentMode(false);
        setAssessmentCount(0);
        analyzeSkillLevel(handRecords.slice(0, 5)).then(result => {
             setAssessmentResult(result);
             setShowAssessmentResult(true);
             setTrainingProfile(p => ({
                 ...p,
                 ...result,
                 assessmentComplete: true
             }));
        });
        return;
    }

    const deck = createDeck();
    
    // Create Players
    const newPlayers: Player[] = [];
    
    // User is always index 0
    const userChips = gameState.players[0]?.chips || INITIAL_CHIPS;
    newPlayers.push({
        id: 'user',
        name: '你',
        chips: userChips <= 0 ? INITIAL_CHIPS : userChips,
        hand: [deck.pop()!, deck.pop()!],
        isFolded: false,
        currentBet: 0,
        isBot: false
    });

    // Create Bots
    const botNames = ['AlphaBot', 'BetaBot', 'GammaBot', 'DeltaBot'];
    for (let i = 1; i < playerCount; i++) {
        // Reuse chips if bot existed, else new stack
        const existingBot = gameState.players[i];
        let botChips = existingBot ? existingBot.chips : INITIAL_CHIPS;
        if (botChips <= 0) botChips = INITIAL_CHIPS;

        newPlayers.push({
            id: `bot-${i}`,
            name: existingBot ? existingBot.name : botNames[i-1],
            chips: botChips,
            hand: [deck.pop()!, deck.pop()!],
            isFolded: false,
            currentBet: 0,
            isBot: true
        });
    }

    // Dealer Rotation
    // If player count changed, reset dealer to 0, else rotate
    const nextDealer = (gameState.players.length !== playerCount) 
        ? 0 
        : (gameState.dealerIndex + 1) % playerCount;
    
    // Blinds Logic
    let sbIndex: number;
    let bbIndex: number;
    let firstActorIndex: number;

    if (playerCount === 2) {
        // Heads Up: Dealer is SB, Other is BB
        sbIndex = nextDealer;
        bbIndex = (nextDealer + 1) % 2;
        firstActorIndex = sbIndex; // Preflop: Dealer (SB) acts first
    } else {
        // 3+ Players: Dealer -> SB -> BB
        sbIndex = (nextDealer + 1) % playerCount;
        bbIndex = (nextDealer + 2) % playerCount;
        // Preflop: UTG acts first (player after BB)
        firstActorIndex = (bbIndex + 1) % playerCount;
    }

    // Post Blinds
    newPlayers[sbIndex].chips -= SMALL_BLIND;
    newPlayers[sbIndex].currentBet = SMALL_BLIND;
    
    newPlayers[bbIndex].chips -= BIG_BLIND;
    newPlayers[bbIndex].currentBet = BIG_BLIND;

    const initialLogs: HandActionLog[] = [
        { phase: 'PREFLOP', actor: 'System', action: '新牌局开始' },
        { phase: 'PREFLOP', actor: newPlayers[sbIndex].name, action: '小盲注', amount: SMALL_BLIND },
        { phase: 'PREFLOP', actor: newPlayers[bbIndex].name, action: '大盲注', amount: BIG_BLIND }
    ];

    setGameState({
      deck,
      communityCards: [],
      pot: SMALL_BLIND + BIG_BLIND,
      currentBet: BIG_BLIND,
      phase: HandPhase.PREFLOP,
      players: newPlayers,
      currentPlayerIndex: firstActorIndex, 
      dealerIndex: nextDealer,
      smallBlind: SMALL_BLIND,
      bigBlind: BIG_BLIND,
      message: "新牌局开始",
      handWinnerId: null,
      handLogs: initialLogs
    });
    setAiAdvice("");
    setSelectedHand(null);
  }, [gameState.dealerIndex, gameState.players, isAssessmentMode, assessmentCount, handRecords, totalPlayers]);

  const changePlayerCount = (count: number) => {
      setTotalPlayers(count);
      setShowSettings(false);
      // Restart game immediately with new count
      startNewGame(count);
  };

  // --- Bot Logic ---
  useEffect(() => {
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    
    if (currentPlayer && currentPlayer.isBot && !currentPlayer.isFolded && gameState.phase !== HandPhase.GAME_OVER && gameState.phase !== HandPhase.SHOWDOWN) {
      const timer = setTimeout(() => {
        // Simple Bot Logic
        const toCall = gameState.currentBet - currentPlayer.currentBet;
        const roll = Math.random();
        
        let action: 'FOLD' | 'CALL' | 'CHECK' | 'RAISE' = 'CALL';
        
        // Always check if can
        if (toCall === 0) action = 'CHECK';
        else if (roll < 0.15 && toCall > 0) action = 'FOLD'; // 15% fold
        else if (roll > 0.85 && gameState.currentBet < 200) action = 'RAISE';
        else action = 'CALL';

        if (action === 'FOLD') handleFold();
        else if (action === 'CHECK') handleCheck();
        else if (action === 'CALL') handleCall();
        else if (action === 'RAISE') handleRaise(gameState.bigBlind * 2);

      }, 1000 + Math.random() * 1000); // 1-2s delay
      return () => clearTimeout(timer);
    }
  }, [gameState.currentPlayerIndex, gameState.phase]);

  // --- Action Processing ---

  const processAction = (
    updatedPlayers: Player[],
    updatedPot: number,
    updatedCurrentBet: number,
    actionMessage: string,
    actionType: string,
    actionAmount?: number
  ) => {
    const activePlayers = updatedPlayers.filter(p => !p.isFolded);
    // Check if only 1 player left
    if (activePlayers.length === 1) {
        setGameState(prev => ({
            ...prev,
            players: updatedPlayers,
            pot: updatedPot,
            currentBet: updatedCurrentBet,
            message: actionMessage,
            handLogs: [...prev.handLogs, { phase: gameState.phase, actor: gameState.players[gameState.currentPlayerIndex].name, action: actionType, amount: actionAmount }]
        }));
        setTimeout(() => endHand(activePlayers[0]), 500);
        return;
    }

    // Determine Next Player
    let nextIdx = (gameState.currentPlayerIndex + 1) % updatedPlayers.length;
    // Skip folded players
    while (updatedPlayers[nextIdx].isFolded) {
        nextIdx = (nextIdx + 1) % updatedPlayers.length;
    }

    // Check if Round Complete
    const roundComplete = activePlayers.every(p => !!p.action && p.currentBet === updatedCurrentBet);

    const newLog: HandActionLog = {
        phase: gameState.phase,
        actor: gameState.players[gameState.currentPlayerIndex].name,
        action: actionType,
        amount: actionAmount,
        details: actionMessage
    };

    if (roundComplete) {
        setGameState(prev => ({
            ...prev,
            players: updatedPlayers,
            pot: updatedPot,
            currentBet: updatedCurrentBet,
            message: actionMessage,
            handLogs: [...prev.handLogs, newLog]
        }));
        
        setTimeout(() => {
            executePhaseChange();
        }, 1000); 
    } else {
        setGameState(prev => ({
            ...prev,
            players: updatedPlayers,
            pot: updatedPot,
            currentBet: updatedCurrentBet,
            currentPlayerIndex: nextIdx,
            message: actionMessage,
            handLogs: [...prev.handLogs, newLog]
        }));
    }
  };

  const executePhaseChange = () => {
    setGameState(prev => {
        const { phase, deck, communityCards, players, handLogs } = prev;
        let nextPhase = phase;
        let newCommunityCards = [...communityCards];
        let newDeck = [...deck];
        let phaseLog: HandActionLog | null = null;

        // Reset round bets and actions
        const updatedPlayers = players.map(p => ({ ...p, currentBet: 0, action: undefined }));

        if (phase === HandPhase.PREFLOP) {
            nextPhase = HandPhase.FLOP;
            newDeck.pop(); // burn
            newCommunityCards.push(newDeck.pop()!, newDeck.pop()!, newDeck.pop()!);
            phaseLog = { phase: 'SYSTEM', actor: 'System', action: '发翻牌', details: `[${newCommunityCards.map(c=>c.rank+c.suit).join(' ')}]` };
        } else if (phase === HandPhase.FLOP) {
            nextPhase = HandPhase.TURN;
            newDeck.pop();
            newCommunityCards.push(newDeck.pop()!);
            phaseLog = { phase: 'SYSTEM', actor: 'System', action: '发转牌', details: `${newCommunityCards[newCommunityCards.length-1].rank}${newCommunityCards[newCommunityCards.length-1].suit}` };
        } else if (phase === HandPhase.TURN) {
            nextPhase = HandPhase.RIVER;
            newDeck.pop();
            newCommunityCards.push(newDeck.pop()!);
            phaseLog = { phase: 'SYSTEM', actor: 'System', action: '发河牌', details: `${newCommunityCards[newCommunityCards.length-1].rank}${newCommunityCards[newCommunityCards.length-1].suit}` };
        } else if (phase === HandPhase.RIVER) {
            nextPhase = HandPhase.SHOWDOWN;
        }

        const newLogs = phaseLog ? [...handLogs, phaseLog] : [...handLogs];

        if (nextPhase === HandPhase.SHOWDOWN) {
             return { ...prev, phase: nextPhase, players: updatedPlayers, communityCards: newCommunityCards, message: "摊牌时刻!", handLogs: newLogs };
        } else {
            // Find first active player after Dealer
            let firstActor = (prev.dealerIndex + 1) % updatedPlayers.length;
            while (updatedPlayers[firstActor].isFolded) {
                firstActor = (firstActor + 1) % updatedPlayers.length;
            }

            return {
                ...prev,
                deck: newDeck,
                communityCards: newCommunityCards,
                phase: nextPhase,
                players: updatedPlayers,
                currentBet: 0,
                currentPlayerIndex: firstActor,
                message: `进入 ${PHASE_MAP[nextPhase]}`,
                handLogs: newLogs
            };
        }
    });
  };

  // --- Winner & End Hand ---
  useEffect(() => {
    if (gameState.phase === HandPhase.SHOWDOWN && !gameState.handWinnerId) {
        const timer = setTimeout(() => {
             const winner = getWinner(gameState.players, gameState.communityCards);
             // getWinner now returns Player | null in types, but logic might return array in updated pokerLogic.
             // Assuming single winner or handle array if type updated.
             // Types.ts says Player | null. PokerLogic update in previous turn might have changed implementation but type signature needs to match.
             // For safety in this file, we assume Player | null or cast if needed. 
             // If getWinner returns Player (single), we proceed.
             endHand(winner as Player | null);
        }, 1000);
        return () => clearTimeout(timer);
    }
  }, [gameState.phase]);

  const endHand = async (winner: Player | null) => {
    if (!winner) return;

    setGameState(current => {
        const winAmount = current.pot;
        const updatedPlayers = current.players.map(p => {
            if (p.id === winner.id) {
                return { ...p, chips: p.chips + winAmount };
            }
            return p;
        });

        const isUserWin = winner.id === 'user';
        
        const newRecord: HandRecord = {
            id: Date.now().toString(),
            timestamp: Date.now(),
            userHand: updatedPlayers[0].hand,
            botHand: updatedPlayers[1].hand, 
            communityCards: current.communityCards,
            winnerId: winner.id,
            pot: current.pot,
            logs: [...current.handLogs, { phase: 'SHOWDOWN', actor: 'System', action: 'Winner', details: `${winner.name} wins ${current.pot}` }],
        };

        setTimeout(() => {
             setHandRecords(prev => [newRecord, ...prev]);
             if (isAssessmentMode) {
                 setAssessmentCount(c => c + 1);
             }
        }, 0);

        setTrainingProfile(p => ({
            ...p,
            gamesPlayed: p.gamesPlayed + 1,
            handsWon: isUserWin ? p.handsWon + 1 : p.handsWon,
            totalWinnings: isUserWin ? p.totalWinnings + winAmount : p.totalWinnings - current.pot
        }));

        return {
            ...current,
            phase: HandPhase.GAME_OVER,
            players: updatedPlayers,
            handWinnerId: winner.id,
            message: `${winner.name} 赢得了 ${winAmount} 筹码!`,
            pot: 0
        };
    });
  };

  // --- Handlers ---
  const handleFold = () => {
    const updatedPlayers = [...gameState.players];
    updatedPlayers[gameState.currentPlayerIndex] = { 
        ...updatedPlayers[gameState.currentPlayerIndex], 
        isFolded: true, 
        action: 'FOLD' 
    };
    processAction(updatedPlayers, gameState.pot, gameState.currentBet, `${updatedPlayers[gameState.currentPlayerIndex].name} 弃牌`, '弃牌');
  };

  const handleCheck = () => {
    const updatedPlayers = [...gameState.players];
    updatedPlayers[gameState.currentPlayerIndex] = { 
        ...updatedPlayers[gameState.currentPlayerIndex], 
        action: 'CHECK' 
    };
    processAction(updatedPlayers, gameState.pot, gameState.currentBet, `${updatedPlayers[gameState.currentPlayerIndex].name} 过牌`, '过牌');
  };

  const handleCall = () => {
    const idx = gameState.currentPlayerIndex;
    const p = gameState.players[idx];
    const amount = gameState.currentBet - p.currentBet;
    
    const updatedPlayers = [...gameState.players];
    updatedPlayers[idx] = {
        ...p,
        chips: p.chips - amount,
        currentBet: p.currentBet + amount,
        action: 'CALL'
    };
    processAction(updatedPlayers, gameState.pot + amount, gameState.currentBet, `${p.name} 跟注 ${amount}`, '跟注', amount);
  };

  const handleRaise = (amount: number) => {
    const idx = gameState.currentPlayerIndex;
    const p = gameState.players[idx];
    const totalBet = gameState.currentBet + amount; 
    const cost = totalBet - p.currentBet;

    const updatedPlayers = [...gameState.players];
    updatedPlayers[idx] = {
        ...p,
        chips: p.chips - cost,
        currentBet: totalBet,
        action: 'RAISE'
    };
    processAction(updatedPlayers, gameState.pot + cost, totalBet, `${p.name} 加注到 ${totalBet}`, '加注', cost);
  };

  const requestHandAnalysis = async (handId?: string) => {
    const targetId = handId || (handRecords.length > 0 ? handRecords[0].id : null);
    if (!targetId) return;

    const targetHand = handRecords.find(h => h.id === targetId);
    if (!targetHand) return;

    if (!handId && targetHand.aiAnalysis) {
        setSelectedHand(targetHand);
        setShowHistory(true);
        return;
    }

    setIsAnalyzingHand(true);
    try {
        const analysis = await analyzeHand(targetHand);
        const updatedHand = { ...targetHand, aiAnalysis: analysis };
        setHandRecords(prev => prev.map(h => h.id === targetId ? updatedHand : h));
        
        if (selectedHand?.id === targetId) {
            setSelectedHand(updatedHand);
        }

        if (!handId) {
            setSelectedHand(updatedHand);
            setShowHistory(true);
        }
    } catch (e) {
        console.error("Analysis failed", e);
    } finally {
        setIsAnalyzingHand(false);
    }
  };

  // Update AI Advice
  useEffect(() => {
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    if (gameState.phase !== HandPhase.GAME_OVER && 
        currentPlayer?.id === 'user' && 
        !currentPlayer.isFolded) {
        
        setIsLoadingAdvice(true);
        getStrategicAdvice(gameState, trainingProfile)
            .then(setAiAdvice)
            .catch(() => setAiAdvice("暂时无法获取建议"))
            .finally(() => setIsLoadingAdvice(false));
    } else {
        setAiAdvice("");
    }
  }, [gameState.phase, gameState.currentPlayerIndex, gameState.communityCards, gameState.pot]);

  const isUserTurn = gameState.players[gameState.currentPlayerIndex]?.id === 'user' && gameState.phase !== HandPhase.GAME_OVER;
  const user = gameState.players[0];

  const isSB = (idx: number) => {
      if (totalPlayers === 2) return idx === gameState.dealerIndex;
      return idx === (gameState.dealerIndex + 1) % totalPlayers;
  };
  const isBB = (idx: number) => {
      if (totalPlayers === 2) return idx === (gameState.dealerIndex + 1) % totalPlayers;
      return idx === (gameState.dealerIndex + 2) % totalPlayers;
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col font-sans">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 p-4 flex justify-between items-center z-50 shadow-md">
        <div className="flex items-center space-x-3">
           <Trophy className="text-yellow-400" size={24} />
           <div>
             <h1 className="font-bold text-lg leading-tight">德州扑克 AI 教练</h1>
             <p className="text-xs text-gray-400 flex items-center">
               等级: <span className="text-blue-400 ml-1">{trainingProfile.skillLevel}</span> 
             </p>
           </div>
        </div>
        <div className="flex items-center space-x-4 text-sm">
             <button 
                onClick={() => setShowSettings(!showSettings)}
                className="flex items-center text-gray-300 hover:text-white transition-colors relative"
             >
                <Users className="mr-2" size={18} />
                <span className="hidden sm:inline">玩家: {totalPlayers}</span>
             </button>

             <button 
                onClick={() => setIsAssessmentMode(!isAssessmentMode)}
                className={`flex items-center transition-colors ${isAssessmentMode ? 'text-yellow-400 animate-pulse' : 'text-gray-300 hover:text-white'}`}
                onClickCapture={() => !isAssessmentMode && startNewGame()}
             >
                <Eye className="mr-2" size={18} />
                <span className="hidden sm:inline">段位检测</span>
             </button>

             <button 
                onClick={() => setShowHistory(true)}
                className="flex items-center text-gray-300 hover:text-white transition-colors"
             >
                <History className="mr-2" size={18} />
                <span className="hidden sm:inline">历史回顾</span>
             </button>
        </div>
      </header>

      {/* Settings Modal */}
      {showSettings && (
          <div className="absolute top-16 right-4 z-50 bg-gray-800 border border-gray-600 rounded-lg shadow-xl p-4 animate-in slide-in-from-top-2">
              <h3 className="font-bold text-gray-200 mb-3 flex items-center"><Settings size={16} className="mr-2" /> 游戏设置</h3>
              <div className="space-y-2">
                  <div className="text-xs text-gray-400">总玩家数 (包括AI)</div>
                  <div className="flex space-x-2">
                      {[2, 3, 4, 5].map(n => (
                          <button
                            key={n}
                            onClick={() => changePlayerCount(n)}
                            className={`w-8 h-8 rounded flex items-center justify-center font-bold transition-all ${totalPlayers === n ? 'bg-blue-600 text-white shadow-lg scale-110' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                          >
                              {n}
                          </button>
                      ))}
                  </div>
              </div>
          </div>
      )}

      {/* Main Game Area */}
      <main className="flex-grow relative overflow-hidden flex flex-col">
        {/* Assessment Banner */}
        {isAssessmentMode && (
            <div className="bg-yellow-600/20 border-b border-yellow-500/30 p-1 text-center text-yellow-400 text-xs font-bold tracking-widest uppercase">
                定级赛进行中: 第 {assessmentCount + 1} / 5 局
            </div>
        )}

        {/* Game Status Bar - Moved Up to top-4 */}
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-40 bg-gray-900/80 backdrop-blur border border-gray-600 px-6 py-2 rounded-full shadow-lg flex items-center animate-in slide-in-from-top-4">
            <MessageSquare size={16} className="text-blue-400 mr-2" />
            <span className="text-sm sm:text-base font-bold text-white tracking-wide truncate max-w-[200px] sm:max-w-none">{gameState.message}</span>
        </div>

        {/* Poker Table */}
        <div className="flex-grow poker-table relative flex items-center justify-center">
            
            {/* Community Cards - Centered */}
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-0 flex space-x-2 sm:space-x-3 perspective-[1000px]">
                {gameState.communityCards.length === 0 && (
                    <div className="text-white/20 font-bold tracking-widest text-2xl select-none">TEXAS HOLD'EM</div>
                )}
                {gameState.communityCards.map((c, i) => (
                    <CardDisplay key={`${c.rank}-${c.suit}`} card={c} index={i} />
                ))}
            </div>

            {/* Pot Display - Moved to 60% (Below Community Cards) */}
            <div className="absolute top-[60%] left-1/2 transform -translate-x-1/2 bg-black/40 px-4 py-1 rounded-full border border-white/10 text-yellow-400 font-mono text-lg shadow-lg z-10">
                底池: {gameState.pot}
            </div>

            {/* Render Players */}
            {gameState.players.map((player, index) => {
                const layout = SEAT_POSITIONS[gameState.players.length]?.[index] || SEAT_POSITIONS[2][index % 2];
                const style: React.CSSProperties = {};
                if (layout.top) style.top = layout.top;
                if (layout.bottom) style.bottom = layout.bottom;
                if (layout.left) style.left = layout.left;
                if (layout.right) style.right = layout.right;
                style.transform = 'translate(-50%)'; 

                return (
                    <div key={player.id} className="absolute" style={style}>
                        <PlayerSeat 
                            player={player} 
                            isActive={gameState.currentPlayerIndex === index && gameState.phase !== HandPhase.GAME_OVER} 
                            isWinner={gameState.phase === HandPhase.GAME_OVER && gameState.handWinnerId === player.id}
                            isDealer={gameState.dealerIndex === index}
                            isSmallBlind={isSB(index)}
                            isBigBlind={isBB(index)}
                            phase={gameState.phase}
                            position={layout.position}
                        />
                    </div>
                );
            })}

            {/* Game Over Message Overlay */}
            {gameState.phase === HandPhase.GAME_OVER && (
                <div className="absolute top-[40%] left-1/2 transform -translate-x-1/2 z-50 text-center pointer-events-none w-full px-4">
                    <div className="text-4xl sm:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 via-yellow-400 to-yellow-600 drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)] animate-in zoom-in duration-300">
                        {gameState.handWinnerId === 'user' ? '你赢了!' : (gameState.players.find(p => p.id === gameState.handWinnerId)?.name || '机器人') + ' 赢了!'}
                    </div>
                    {gameState.pot > 0 && (
                        <div className="text-2xl text-white font-bold drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] mt-1 animate-in slide-in-from-bottom-2 delay-100">
                            +{gameState.pot} 筹码
                        </div>
                    )}
                </div>
            )}
        </div>

        {/* AI Coach Panel (Desktop) - Left */}
        <div className="absolute top-20 left-4 w-64 z-30 hidden lg:block pointer-events-none">
            <div className="bg-gray-800/90 backdrop-blur border-l-4 border-purple-500 p-4 rounded-r-lg shadow-lg text-sm pointer-events-auto">
                <div className="flex items-center text-purple-300 font-bold mb-2">
                    <Brain size={16} className="mr-2" />
                    AI 教练建议
                </div>
                {isLoadingAdvice ? (
                    <div className="animate-pulse text-gray-400 text-xs">正在分析局势...</div>
                ) : (
                    <p className="text-gray-200 leading-relaxed text-xs">
                        {aiAdvice || "轮到你时，我会给出建议。"}
                    </p>
                )}
            </div>
        </div>

        {/* Mobile AI Coach */}
        <div className="lg:hidden bg-gray-800/95 p-3 text-xs flex items-center border-t border-gray-700 z-50">
             <Brain size={16} className="text-purple-400 mr-2 flex-shrink-0" />
             <span className="truncate">{aiAdvice || "等待行动..."}</span>
        </div>

        {/* Action Controls */}
        <div className="h-24 bg-gray-900 border-t border-gray-700 p-4 flex items-center justify-center space-x-2 sm:space-x-4 z-40">
             {gameState.phase !== HandPhase.GAME_OVER ? (
                 <>
                    <button 
                        onClick={handleFold} 
                        disabled={!isUserTurn}
                        className={`flex-1 sm:flex-none px-4 sm:px-6 py-3 rounded-lg font-bold uppercase tracking-wider transition-all transform active:scale-95 ${!isUserTurn ? 'bg-gray-800 text-gray-600 cursor-not-allowed opacity-50' : 'bg-red-900/80 hover:bg-red-800 text-red-200 border border-red-700 shadow-lg shadow-red-900/20'}`}
                    >
                        弃牌
                    </button>
                    
                    {(gameState.currentBet === user?.currentBet) ? (
                        <button 
                            onClick={handleCheck} 
                            disabled={!isUserTurn}
                            className={`flex-1 sm:flex-none px-4 sm:px-6 py-3 rounded-lg font-bold uppercase tracking-wider transition-all transform active:scale-95 ${!isUserTurn ? 'bg-gray-800 text-gray-600 cursor-not-allowed opacity-50' : 'bg-gray-700 hover:bg-gray-600 text-white border border-gray-500 shadow-lg'}`}
                        >
                            过牌
                        </button>
                    ) : (
                        <button 
                            onClick={handleCall} 
                            disabled={!isUserTurn}
                            className={`flex-1 sm:flex-none px-4 sm:px-6 py-3 rounded-lg font-bold uppercase tracking-wider transition-all transform active:scale-95 ${!isUserTurn ? 'bg-gray-800 text-gray-600 cursor-not-allowed opacity-50' : 'bg-green-700 hover:bg-green-600 text-white border border-green-500 shadow-lg shadow-green-900/20'}`}
                        >
                            跟注 {gameState.currentBet - user?.currentBet}
                        </button>
                    )}

                    <button 
                        onClick={() => handleRaise(gameState.bigBlind * 2)} 
                        disabled={!isUserTurn}
                        className={`flex-1 sm:flex-none px-4 sm:px-6 py-3 rounded-lg font-bold uppercase tracking-wider transition-all transform active:scale-95 ${!isUserTurn ? 'bg-gray-800 text-gray-600 cursor-not-allowed opacity-50' : 'bg-yellow-700 hover:bg-yellow-600 text-yellow-100 border border-yellow-500 shadow-lg shadow-yellow-900/20'}`}
                    >
                        加注
                    </button>
                 </>
             ) : (
                <div className="flex space-x-4 w-full max-w-xl px-4 animate-in fade-in slide-in-from-bottom-4">
                     <button 
                        onClick={() => startNewGame()}
                        className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-lg font-bold shadow-lg flex items-center justify-center transition-all hover:scale-[1.02]"
                    >
                        <RefreshCw className="mr-2" size={20} /> 下一局
                    </button>
                    <button 
                        onClick={() => requestHandAnalysis()}
                        disabled={isAnalyzingHand}
                        className="flex-1 bg-purple-900/80 hover:bg-purple-800/80 text-purple-100 border border-purple-500/50 py-3 rounded-lg font-bold flex items-center justify-center transition-all"
                    >
                        {isAnalyzingHand ? (
                            <span className="animate-pulse">AI 分析中...</span>
                        ) : (
                            <>
                                <Brain className="mr-2" size={20} /> AI 分析本局
                            </>
                        )}
                    </button>
                </div>
             )}
        </div>
      </main>

      {/* Reused Result Modal and History Modal */}
      {showAssessmentResult && assessmentResult && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-500">
            <div className="bg-gradient-to-br from-gray-900 to-blue-900 border-2 border-yellow-500 rounded-2xl max-w-lg w-full p-8 shadow-[0_0_50px_rgba(59,130,246,0.3)] relative overflow-hidden transform transition-all animate-in zoom-in-95 duration-300">
                <div className="absolute -top-20 -right-20 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl"></div>
                <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl"></div>

                <div className="relative z-10 text-center">
                    <div className="inline-block p-4 rounded-full bg-yellow-500/10 border border-yellow-500/30 mb-6">
                        <Trophy size={48} className="text-yellow-400" />
                    </div>
                    
                    <h2 className="text-3xl font-black text-white mb-2 tracking-tight">定级完成!</h2>
                    <p className="text-gray-300 mb-8">根据您的表现，AI 已为您定级。</p>

                    <div className="mb-8">
                        <div className="text-sm text-blue-300 uppercase tracking-widest font-bold mb-2">当前段位</div>
                        <div className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-yellow-400 to-yellow-600 drop-shadow-lg">
                            {assessmentResult.skillLevel}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-left mb-8">
                        <div className="bg-green-900/30 border border-green-500/30 p-4 rounded-xl">
                            <h4 className="font-bold text-green-400 text-sm mb-2 flex items-center">
                                <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span> 优点
                            </h4>
                            <ul className="text-xs text-gray-300 space-y-1 list-disc list-inside">
                                {assessmentResult.strengths?.map((s, i) => <li key={i}>{s}</li>) || <li>分析中...</li>}
                            </ul>
                        </div>
                        <div className="bg-red-900/30 border border-red-500/30 p-4 rounded-xl">
                            <h4 className="font-bold text-red-400 text-sm mb-2 flex items-center">
                                <span className="w-2 h-2 bg-red-500 rounded-full mr-2"></span> 弱点
                            </h4>
                            <ul className="text-xs text-gray-300 space-y-1 list-disc list-inside">
                                {assessmentResult.weaknesses?.map((w, i) => <li key={i}>{w}</li>) || <li>分析中...</li>}
                            </ul>
                        </div>
                    </div>

                    <button 
                        onClick={() => setShowAssessmentResult(false)}
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg shadow-lg hover:shadow-blue-500/30 transition-all transform hover:scale-[1.02]"
                    >
                        开始训练
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* History Modal */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity" onClick={() => setShowHistory(false)} />
            
            <div className="relative w-full max-w-md bg-gray-900 shadow-2xl flex flex-col h-full border-l border-gray-700 transform transition-transform animate-in slide-in-from-right">
                <div className="p-4 border-b border-gray-700 flex justify-between items-center">
                    <h2 className="text-xl font-bold flex items-center">
                        <History className="mr-2 text-blue-400" /> 历史回顾
                    </h2>
                    <button onClick={() => setShowHistory(false)} className="text-gray-400 hover:text-white">
                        <X size={24} />
                    </button>
                </div>

                <div className="flex-grow overflow-y-auto p-4 space-y-4">
                    {!selectedHand ? (
                        handRecords.length === 0 ? (
                            <div className="text-center text-gray-500 mt-10">暂无牌局记录</div>
                        ) : (
                            handRecords.map((hand, idx) => (
                                <div 
                                    key={hand.id} 
                                    onClick={() => setSelectedHand(hand)}
                                    className="bg-gray-800 hover:bg-gray-750 border border-gray-700 rounded-xl p-4 cursor-pointer transition-colors flex justify-between items-center group"
                                >
                                    <div className="flex items-center space-x-3">
                                        <div className={`w-2 h-12 rounded-full ${hand.winnerId === 'user' ? 'bg-green-500' : 'bg-red-500'}`} />
                                        <div>
                                            <div className="font-bold text-sm text-gray-300">
                                                {new Date(hand.timestamp).toLocaleTimeString()}
                                            </div>
                                            <div className={`font-mono font-bold ${hand.winnerId === 'user' ? 'text-green-400' : 'text-red-400'}`}>
                                                {hand.winnerId === 'user' ? '+' : '-'}{hand.pot}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <div className="flex -space-x-1 scale-75">
                                            {hand.userHand.map((c, i) => <CardDisplay key={i} card={c} className="shadow-none" />)}
                                        </div>
                                        <ChevronRight className="text-gray-500 group-hover:text-white" />
                                    </div>
                                </div>
                            ))
                        )
                    ) : (
                        <div className="space-y-6">
                            <button 
                                onClick={() => setSelectedHand(null)}
                                className="text-sm text-gray-400 hover:text-white flex items-center"
                            >
                                <ChevronRight className="rotate-180 mr-1" size={16} /> 返回列表
                            </button>

                            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                                <div className="flex justify-between items-end mb-4">
                                     <div className="text-2xl font-bold text-white">
                                        {selectedHand.winnerId === 'user' ? <span className="text-green-400">胜利</span> : <span className="text-red-400">失败</span>}
                                     </div>
                                     <div className="text-yellow-400 font-mono text-lg">Pot: {selectedHand.pot}</div>
                                </div>

                                <div className="flex justify-between text-center text-sm mb-4">
                                    <div>
                                        <div className="text-gray-400 mb-1">你</div>
                                        <div className="flex scale-75 origin-top-left space-x-1">
                                            {selectedHand.userHand.map((c, i) => <CardDisplay key={i} card={c} />)}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-gray-400 mb-1">Bot</div>
                                        <div className="flex scale-75 origin-top-right space-x-1 justify-end">
                                            {selectedHand.botHand.map((c, i) => <CardDisplay key={i} card={c} />)}
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="bg-green-900/30 rounded-lg p-2 flex justify-center space-x-2 border border-green-800/50">
                                    {selectedHand.communityCards.map((c, i) => <CardDisplay key={i} card={c} className="w-10 h-14 text-xs" />)}
                                    {selectedHand.communityCards.length === 0 && <span className="text-gray-500 text-xs py-4">无公共牌</span>}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <h3 className="font-bold text-gray-400 text-sm uppercase tracking-wider">行动记录</h3>
                                <div className="bg-gray-950 rounded-lg p-3 space-y-2 text-sm max-h-40 overflow-y-auto font-mono text-gray-400">
                                    {selectedHand.logs.map((log, i) => (
                                        <div key={i} className="border-b border-gray-800 pb-1 last:border-0">
                                            <span className="text-blue-500">[{log.phase}]</span> {log.actor}: {log.action} {log.amount && <span className="text-yellow-500">{log.amount}</span>}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <h3 className="font-bold text-purple-400 flex items-center">
                                        <Brain size={16} className="mr-2" /> AI 深度分析
                                    </h3>
                                    {!selectedHand.aiAnalysis && (
                                        <button 
                                            onClick={() => requestHandAnalysis(selectedHand.id)}
                                            disabled={isAnalyzingHand}
                                            className="bg-purple-600 hover:bg-purple-500 text-xs px-3 py-1 rounded text-white disabled:opacity-50"
                                        >
                                            {isAnalyzingHand ? '分析中...' : '开始分析'}
                                        </button>
                                    )}
                                </div>
                                
                                <div className="bg-gray-800 p-4 rounded-lg text-sm leading-relaxed border border-gray-700 min-h-[100px]">
                                    {selectedHand.aiAnalysis ? (
                                        <div className="whitespace-pre-wrap">{selectedHand.aiAnalysis}</div>
                                    ) : (
                                        <div className="text-gray-500 italic text-center py-4">
                                            点击上方按钮，让 AI 教练回顾这局牌的关键决策。
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
      )}
    </div>
  );
}