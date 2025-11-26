import React from 'react';
import { Card, Suit } from '../types';

interface CardDisplayProps {
  card: Card;
  hidden?: boolean;
  className?: string;
  index?: number; // Added for staggered animation
}

export const CardDisplay: React.FC<CardDisplayProps> = ({ card, hidden, className = "", index = 0 }) => {
  // Stagger delay: 100ms per card index
  const style = { animationDelay: `${index * 100}ms` };

  if (hidden) {
    return (
      <div 
        className={`w-14 h-20 sm:w-16 sm:h-24 bg-blue-900 rounded-lg border-2 border-white shadow-md flex items-center justify-center animate-deal ${className}`}
        style={style}
      >
        <div className="w-11 h-17 sm:w-12 sm:h-20 rounded border border-blue-400/30 card-pattern opacity-80"></div>
      </div>
    );
  }

  const isRed = card.suit === Suit.HEARTS || card.suit === Suit.DIAMONDS;

  return (
    <div 
      className={`w-14 h-20 sm:w-16 sm:h-24 bg-white rounded-lg border border-gray-300 shadow-xl flex flex-col items-center justify-between p-1 select-none animate-deal ${className}`}
      style={style}
    >
      <div className={`self-start text-sm sm:text-base font-bold leading-none ${isRed ? 'text-red-600' : 'text-black'}`}>
        {card.rank}
      </div>
      <div className={`text-2xl sm:text-3xl ${isRed ? 'text-red-600' : 'text-black'}`}>
        {card.suit}
      </div>
      <div className={`self-end text-sm sm:text-base font-bold leading-none transform rotate-180 ${isRed ? 'text-red-600' : 'text-black'}`}>
        {card.rank}
      </div>
    </div>
  );
};