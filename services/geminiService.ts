import { GoogleGenAI } from "@google/genai";
import { GameState, HandPhase, Player, Card, TrainingProfile, SkillLevel, HandRecord } from "../types";
import { evaluateHand } from "../utils/pokerLogic";

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const formatCards = (cards: Card[]) => cards.map(c => `${c.rank}${c.suit}`).join(" ");

export const getStrategicAdvice = async (
  gameState: GameState, 
  profile: TrainingProfile
): Promise<string> => {
  const user = gameState.players[0]; // Assume user is always index 0
  if (user.isFolded) return "你已经弃牌。观察牌局以学习下注模式。";

  const handStrength = evaluateHand(user.hand, gameState.communityCards);
  const position = gameState.currentPlayerIndex === gameState.dealerIndex ? "庄家位 (Late)" : "前位/盲注位 (Early/Blind)";
  
  const prompt = `
    你是一位专业的德州扑克教练，请用中文回答。
    背景信息:
    - 用户等级: ${profile.skillLevel} (评估完成: ${profile.assessmentComplete})
    - 当前阶段: ${gameState.phase}
    - 用户手牌: ${formatCards(user.hand)}
    - 公共牌: ${formatCards(gameState.communityCards)}
    - 底池: ${gameState.pot}, 跟注所需: ${gameState.currentBet - user.currentBet}
    - 牌型: ${handStrength.name} (分数: ${handStrength.score})
    - 位置: ${position}
    - 筹码量: ${user.chips}

    请给出简明扼要的战略建议（最多两句话），告诉用户应该做什么（过牌、跟注、加注、弃牌）以及原因。重点关注底池赔率、牌力潜力或诈唬机会。不要含糊其辞。
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text || "分析牌面并做出你的最佳选择。";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "AI 教练暂时不可用。请凭直觉行动。";
  }
};

export const analyzeSkillLevel = async (gameHistory: HandRecord[]): Promise<Partial<TrainingProfile>> => {
  // Simplify history to reduce tokens and focus on key data
  const summary = gameHistory.map(h => ({
      userHand: formatCards(h.userHand),
      board: formatCards(h.communityCards),
      winner: h.winnerId === 'user' ? 'User' : 'Bot',
      pot: h.pot,
      actions: h.logs.map(l => `${l.actor}: ${l.action}${l.amount ? ' '+l.amount : ''}`).join(' | ')
  }));

  const prompt = `
    请根据这名学生最近 5 局德州扑克的表现进行段位判定。
    
    最近 5 局摘要:
    ${JSON.stringify(summary, null, 2)}
    
    请严格判定:
    1. 技能等级 (必须是以下之一: 新手, 中级, 高级, 职业). 如果表现很差，不要吝啬给“新手”。
    2. 一个主要优点 (中文, 简短).
    3. 一个主要弱点 (中文, 简短).
    
    仅返回 JSON 对象 (不要Markdown): { "skillLevel": "...", "strengths": ["..."], "weaknesses": ["..."] }
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });
    
    return JSON.parse(response.text) as Partial<TrainingProfile>;
  } catch (error) {
    console.error("Assessment Error", error);
    return { skillLevel: SkillLevel.BEGINNER, strengths: ["勇于尝试"], weaknesses: ["经验不足"] };
  }
};

export const analyzeHand = async (hand: HandRecord): Promise<string> => {
    const prompt = `
      请作为德州扑克专家回顾这局牌，并给出中文分析。
      
      牌局信息:
      - 玩家手牌: ${formatCards(hand.userHand)}
      - 对手手牌: ${formatCards(hand.botHand)}
      - 公共牌: ${formatCards(hand.communityCards)}
      - 赢家: ${hand.winnerId === 'user' ? '玩家' : '对手'}
      - 底池: ${hand.pot}
      
      行动记录:
      ${hand.logs.map(l => `[${l.phase}] ${l.actor}: ${l.action} ${l.amount ? l.amount : ''} ${l.details || ''}`).join('\n')}
      
      请点评玩家的关键决策点。玩家打得好吗？有没有犯错？如果是你，你会怎么打？请给出3点具体的改进建议。
    `;
  
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      return response.text || "无法分析此局牌。";
    } catch (error) {
      console.error("Hand Analysis Error", error);
      return "分析服务暂时不可用。";
    }
  };
