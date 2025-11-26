import React from 'react';
import { Player, HandPhase } from '../types';
import { CardDisplay } from './CardDisplay';
import { User, Bot, CircleDollarSign, Crown } from 'lucide-react';

interface PlayerSeatProps {
  player: Player;
  isActive: boolean;
  isDealer: boolean;
  isSmallBlind?: boolean;
  isBigBlind?: boolean;
  phase: HandPhase;
  position: 'bottom' | 'top' | 'left' | 'right' | 'top-left' | 'top-right';
  isWinner?: boolean;
}

export const PlayerSeat: React.FC<PlayerSeatProps> = ({ 
  player, 
  isActive, 
  isDealer, 
  isSmallBlind,
  isBigBlind,
  phase, 
  position, 
  isWinner 
}) => {
  const showCards = position === 'bottom' || phase === HandPhase.SHOWDOWN || phase === HandPhase.GAME_OVER;

  const ringClass = isWinner 
    ? 'border-yellow-500 ring-4 ring-yellow-500/60 shadow-[0_0_30px_rgba(234,179,8,0.4)] scale-105' 
    : isActive 
        ? 'border-yellow-400 ring-2 ring-yellow-400/50' 
        : 'border-gray-700';

  // Layout Logic
  const isTop = position === 'top' || position === 'top-left' || position === 'top-right';
  const isRightSide = position === 'right' || position === 'top-right' || position === 'bottom-right';

  // For Top players, we reverse the flex column so Avatar is on Top (Outer) and Cards are Bottom (Inner/Table Center).
  // For Bottom/Side players, standard col (Cards Top -> Inner, Avatar Bottom -> Outer).
  // Added larger GAP (gap-4) to prevent overlap between cards and avatar box.
  const containerClass = isTop ? 'flex flex-col-reverse items-center gap-4' : 'flex flex-col items-center gap-4';
  
  // Chip Position: Always on the "Outer" side of the avatar (Away from table center)
  // Increased offset to prevent touching avatar border
  const chipClass = isTop ? 'absolute -top-11' : 'absolute -bottom-11';

  // Badge Positions: Moved further out to avoid overlap with avatar box
  // Using -16 (4rem) to ensure clear separation
  const dealerPositionClass = isTop ? '-bottom-6 -right-16' : '-top-6 -right-16';
  const blindPositionClass = isTop ? '-bottom-6 -left-16' : '-top-6 -left-16';

  // Action Badge: Push to left/right significantly to avoid screen cutoff and overlap with other badges
  const actionBadgeClass = isRightSide 
    ? 'absolute -left-28 top-1/2 -translate-y-1/2 origin-right' 
    : 'absolute -right-28 top-1/2 -translate-y-1/2 origin-left';

  return (
    <div className={`relative transition-all duration-300 ${player.isFolded ? 'opacity-50' : 'opacity-100'} ${containerClass}`}>
      
      {/* Cards */}
      <div className={`flex space-x-2 z-10 perspective-[1000px]`}>
        {player.hand.map((card, idx) => (
          <CardDisplay 
            key={`${card.rank}-${card.suit}`} 
            card={card} 
            hidden={!showCards} 
            index={idx} 
          />
        ))}
      </div>

      {/* Avatar & Info Container */}
      <div className={`relative w-28 sm:w-32 bg-gray-900/90 rounded-xl border-2 p-2 flex flex-col items-center shadow-lg backdrop-blur-sm transition-all duration-300 z-20 ${ringClass}`}>
        
        {/* Dealer Button */}
        {isDealer && (
          <div className={`absolute ${dealerPositionClass} w-8 h-8 bg-white rounded-full border-2 border-gray-900 shadow-md flex items-center justify-center text-[10px] font-black text-black z-30`}>
            D
          </div>
        )}

        {/* Blind Indicators */}
        {isSmallBlind && (
          <div className={`absolute ${blindPositionClass} w-8 h-8 bg-indigo-600 rounded-full border-2 border-white shadow-md flex items-center justify-center text-[10px] font-bold text-white z-30`}>
            SB
          </div>
        )}
        {isBigBlind && (
          <div className={`absolute ${blindPositionClass} w-8 h-8 bg-orange-600 rounded-full border-2 border-white shadow-md flex items-center justify-center text-[10px] font-bold text-white z-30`}>
            BB
          </div>
        )}

        {/* Crown for Winner */}
        {isWinner && (
            <div className={`absolute left-1/2 transform -translate-x-1/2 text-yellow-400 animate-bounce drop-shadow-lg z-40 ${isTop ? '-bottom-14' : '-top-14'}`}>
                <Crown size={32} fill="currentColor" />
            </div>
        )}

        <div className={`absolute bg-gray-800 p-1.5 rounded-full border border-gray-600 ${isTop ? '-bottom-5' : '-top-5'}`}>
           {player.isBot ? <Bot className="text-gray-300" size={20} /> : <User className="text-blue-300" size={20} />}
        </div>
        
        <div className="my-1 text-center w-full overflow-hidden">
          <div className="font-bold text-white text-xs sm:text-sm truncate w-full px-1">{player.name}</div>
        </div>

        {/* Action Badge */}
        {player.action && (
          <div className={`${actionBadgeClass} bg-blue-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-md shadow-xl animate-bounce z-40 whitespace-nowrap border border-blue-400`}>
            {player.action}
          </div>
        )}

        {/* Bet/Chips Display */}
        {/* Chips Total */}
        <div className="flex items-center justify-center text-yellow-500 font-mono text-xs mb-1">
            <CircleDollarSign size={12} className="mr-1" />
            {player.chips}
        </div>

        {/* Current Round Bet (Floating Badge) */}
        {player.currentBet > 0 && (
           <div className={`${chipClass} bg-black/90 text-yellow-300 px-3 py-1 rounded-full text-[11px] font-mono border border-yellow-500/50 whitespace-nowrap z-20 shadow-md`}>
             ${player.currentBet}
           </div>
        )}
      </div>
    </div>
  );
};