import { Card, Rank, Suit, HandPhase, Player } from '../types';

const SUITS = [Suit.HEARTS, Suit.DIAMONDS, Suit.CLUBS, Suit.SPADES];
const RANKS = [
  Rank.TWO, Rank.THREE, Rank.FOUR, Rank.FIVE, Rank.SIX,
  Rank.SEVEN, Rank.EIGHT, Rank.NINE, Rank.TEN,
  Rank.JACK, Rank.QUEEN, Rank.KING, Rank.ACE
];

export const createDeck = (): Card[] => {
  const deck: Card[] = [];
  RANKS.forEach((rank, index) => {
    SUITS.forEach(suit => {
      deck.push({ rank, suit, value: index + 2 });
    });
  });
  return shuffleDeck(deck);
};

export const shuffleDeck = (deck: Card[]): Card[] => {
  const newDeck = [...deck];
  for (let i = newDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
  }
  return newDeck;
};

// --- Hand Evaluation Logic ---

type HandRank = {
  score: number; // Higher is better
  name: string;
  details?: string;
  tieBreakers: number[]; // Array of card values for tie-breaking
};

// Helper to convert card ranks to a frequency map
const getFrequencyMap = (cards: Card[]) => {
  const counts: Record<number, number> = {};
  cards.forEach(c => {
    counts[c.value] = (counts[c.value] || 0) + 1;
  });
  return counts;
};

export const evaluateHand = (holeCards: Card[], communityCards: Card[]): HandRank => {
  const allCards = [...holeCards, ...communityCards];
  if (allCards.length === 0) return { score: 0, name: "等待中", tieBreakers: [] };
  
  // Sort by value descending
  allCards.sort((a, b) => b.value - a.value);

  // Check Flush
  const suitCounts: Record<string, Card[]> = {};
  let flushCards: Card[] | null = null;
  
  for (const c of allCards) {
    if (!suitCounts[c.suit]) suitCounts[c.suit] = [];
    suitCounts[c.suit].push(c);
    if (suitCounts[c.suit].length >= 5) {
      flushCards = suitCounts[c.suit].slice(0, 5); // Best 5 of suit
    }
  }

  // Check Straight
  const getStraight = (cards: Card[]): number | null => {
    const uniqueValues = Array.from(new Set(cards.map(c => c.value))).sort((a, b) => b - a);
    
    // Special Ace low case (A, 5, 4, 3, 2) -> A=14, so check for 14, 5, 4, 3, 2
    if (uniqueValues.includes(14) && uniqueValues.includes(2) && uniqueValues.includes(3) && uniqueValues.includes(4) && uniqueValues.includes(5)) {
        // Check if there is a higher straight.
        // But we need to be careful not to return 5 if a higher straight exists.
        // The loop below handles high straights. If loop finishes without return, we check wheel.
        let isHigh = false;
         for (let i = 0; i < uniqueValues.length - 4; i++) {
             if (uniqueValues[i] - uniqueValues[i+4] === 4) isHigh = true;
         }
         if (!isHigh) return 5; 
    }

    for (let i = 0; i < uniqueValues.length - 4; i++) {
      if (uniqueValues[i] - uniqueValues[i + 4] === 4) {
        return uniqueValues[i]; // Highest card in straight
      }
    }
    return null;
  };

  const straightHigh = getStraight(allCards);
  
  // Straight Flush
  if (flushCards) {
    const sfHigh = getStraight(flushCards);
    if (sfHigh) {
      return { 
        score: 8000 + sfHigh, 
        name: sfHigh === 14 ? "皇家同花顺" : "同花顺",
        tieBreakers: [sfHigh]
      };
    }
  }

  const counts = getFrequencyMap(allCards);
  const kickers = Object.keys(counts).map(Number).sort((a, b) => b - a);
  
  const quads = kickers.filter(k => counts[k] === 4);
  const trips = kickers.filter(k => counts[k] === 3);
  const pairs = kickers.filter(k => counts[k] === 2);

  // Four of a Kind
  if (quads.length > 0) {
    const quadRank = quads[0];
    // Get highest kicker that isn't the quad
    const kicker = kickers.find(k => k !== quadRank) || 0;
    return { 
      score: 7000 + quadRank, 
      name: "四条",
      tieBreakers: [quadRank, kicker]
    };
  }

  // Full House
  if ((trips.length > 0 && pairs.length > 0) || (trips.length > 1)) {
    const highTrip = trips[0];
    const highPair = trips.length > 1 ? trips[1] : pairs[0];
    return { 
      score: 6000 + (highTrip * 10) + highPair, 
      name: "葫芦",
      tieBreakers: [highTrip, highPair]
    };
  }

  // Flush
  if (flushCards) {
    return { 
      score: 5000 + flushCards[0].value, 
      name: "同花",
      tieBreakers: flushCards.map(c => c.value) // All 5 cards matter
    };
  }

  // Straight
  if (straightHigh) {
    return { 
      score: 4000 + straightHigh, 
      name: "顺子",
      tieBreakers: [straightHigh]
    };
  }

  // Three of a Kind
  if (trips.length > 0) {
    const tripRank = trips[0];
    const otherCards = kickers.filter(k => k !== tripRank).slice(0, 2);
    return { 
      score: 3000 + tripRank, 
      name: "三条",
      tieBreakers: [tripRank, ...otherCards]
    };
  }

  // Two Pair
  if (pairs.length >= 2) {
    const highPair = pairs[0];
    const lowPair = pairs[1];
    const kicker = kickers.find(k => k !== highPair && k !== lowPair) || 0;
    return { 
      score: 2000 + (highPair * 10) + lowPair, 
      name: "两对",
      tieBreakers: [highPair, lowPair, kicker]
    };
  }

  // Pair
  if (pairs.length === 1) {
    const pairRank = pairs[0];
    const otherCards = kickers.filter(k => k !== pairRank).slice(0, 3);
    return { 
      score: 1000 + pairRank, 
      name: "对子",
      tieBreakers: [pairRank, ...otherCards]
    };
  }

  // High Card
  return { 
    score: kickers[0], 
    name: "高牌",
    tieBreakers: kickers.slice(0, 5) // Top 5 cards
  };
};

export const getWinner = (players: Player[], communityCards: Card[]): Player | null => {
  const activePlayers = players.filter(p => !p.isFolded);
  if (activePlayers.length === 0) return null;
  if (activePlayers.length === 1) return activePlayers[0];

  let bestPlayer = activePlayers[0];
  let bestRank = evaluateHand(activePlayers[0].hand, communityCards);

  for (let i = 1; i < activePlayers.length; i++) {
    const currentPlayer = activePlayers[i];
    const currentRank = evaluateHand(currentPlayer.hand, communityCards);

    // Compare Primary Score (Hand Type)
    if (currentRank.score > bestRank.score) {
      bestRank = currentRank;
      bestPlayer = currentPlayer;
    } else if (currentRank.score === bestRank.score) {
      // Tie-breaker: Compare individual cards
      for (let j = 0; j < currentRank.tieBreakers.length; j++) {
        const currentKicker = currentRank.tieBreakers[j] || 0;
        const bestKicker = bestRank.tieBreakers[j] || 0;
        
        if (currentKicker > bestKicker) {
          bestRank = currentRank;
          bestPlayer = currentPlayer;
          break;
        } else if (currentKicker < bestKicker) {
          break; // Existing best is better
        }
        // If equal, continue to next kicker
      }
    }
  }
  return bestPlayer;
};
