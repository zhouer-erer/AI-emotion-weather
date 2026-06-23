const https = require('https');
const url = require('url');

// 智谱AI配置
const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY || '52207ad3adcd416f9f99f29719ffacfa.RTVOoF21BTXsdGGS';
const ZHIPU_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

// 天气→情绪映射
const weatherMap = {
  sunny: '平静/满足', 
  partly_cloudy: '轻微波动', 
  cloudy: '低落',
  rainy: '难过', 
  storm: '愤怒/焦虑', 
  snow: '麻木/疏离'
};

exports.main = async (event, context) => {
  const { diary, weather, tags, type, diaries } = event;
  
  if (type === 'monthlyReport') {
    return await generateMonthlyReport(diaries);
  }
  
  return await analyzeSingleDiary(diary, weather, tags);
};

// 使用 https 模块发送请求
function httpsRequest(options, data) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          resolve(response);
        } catch (error) {
          reject(error);
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.write(data);
    req.end();
  });
}

// 分析单条日记
async function analyzeSingleDiary(diary, weather, tags) {
  const mood = weatherMap[weather] || '未知';
  const tagsText = tags && tags.length > 0 ? tags.join('、') : '无';
  
  const systemPrompt = `你是一位专业且温暖的心理咨询师，请仔细分析用户的情绪日记并给出专业分析：

分析任务：
1. 情绪类型识别：从列表中选择最符合的情绪（焦虑、抑郁、兴奋、平静、愤怒、孤独、满足、疲惫）
2. 压力源分析：从日记内容和标签中深入分析1-3个主要压力源或情绪触发因素，要具体描述
3. 情感评分：给出-1.0到1.0的情感极性评分
4. 温暖回复：根据日记具体内容写一段温暖的回复，可以包含表情符号，要共情、具体、详细（80-120字）
5. 行动建议：推荐1个具体可执行的舒缓动作

必须严格输出JSON格式：
{
  "emotionType": "string",
  "keyStressors": ["string"],
  "sentimentScore": number,
  "aiReply": "string",
  "suggestion": "string"
}`;

  try {
    const parsedUrl = url.parse(ZHIPU_API_URL);
    const data = JSON.stringify({
      model: 'glm-4-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `用户心情天气：${mood}，日记内容：${diary}，标签：${tagsText}` }
      ],
      temperature: 0.7,
      max_tokens: 512,
      response_format: { type: 'json_object' }
    });

    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.path,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ZHIPU_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: 2500
    };

    const response = await httpsRequest(options, data);
    const analysis = JSON.parse(response.choices[0].message.content);
    
    return {
      success: true,
      analysis,
      usage: response.usage
    };
    
  } catch (error) {
    console.error('AI分析失败，使用降级方案:', error);
    return {
      success: false,
      error: error.message,
      fallback: generateFallbackAnalysis(weather, tags, diary)
    };
  }
}

// 生成月度报告
async function generateMonthlyReport(diaries) {
  const systemPrompt = `你是一位专业的心理咨询师，擅长分析用户的情绪趋势。请根据用户近30天的情绪日记记录，完成以下任务：
1. 分析整体情绪趋势（如：上升、下降、稳定、波动）
2. 识别最常见的情绪类型
3. 找出主要的压力源或情绪触发因素
4. 给出针对性的建议

必须严格输出JSON格式：
{
  "trend": "string",
  "emotionType": "string",
  "keyStressors": ["string"],
  "suggestion": "string"
}`;

  try {
    const parsedUrl = url.parse(ZHIPU_API_URL);
    const data = JSON.stringify({
      model: 'glm-4-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `用户近30天的情绪记录：\n${diaries}` }
      ],
      temperature: 0.6,
      max_tokens: 512,
      response_format: { type: 'json_object' }
    });

    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.path,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ZHIPU_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: 2500
    };

    const response = await httpsRequest(options, data);
    const analysis = JSON.parse(response.choices[0].message.content);
    
    return {
      success: true,
      analysis,
      usage: response.usage
    };
    
  } catch (error) {
    console.error('月度报告生成失败:', error);
    return {
      success: false,
      error: error.message,
      fallback: {
        trend: '稳定',
        emotionType: '平静',
        keyStressors: ['日常压力'],
        suggestion: '继续保持记录，关注情绪变化'
      }
    };
  }
}

// 生成降级分析（基于用户实际输入）
function generateFallbackAnalysis(weather, tags, diary) {
  const keywords = {
    positive: ['开心', '高兴', '快乐', '幸福', '满足', '好', '棒', '顺利', '成功', '完成', '喜欢', '爱', '感谢', '美好', '赞'],
    negative: ['难过', '伤心', '失望', '焦虑', '烦躁', '压力', '累', '疲惫', '孤独', '担心', '害怕', '痛苦', '郁闷', '烦', '愁']
  };
  
  const stressKeywords = {
    '学业': ['考试', '学习', '作业', '复习', '成绩', '上课'],
    '工作': ['工作', '上班', '加班', '项目', '任务', '老板', '同事'],
    '人际关系': ['朋友', '家人', '恋爱', '分手', '吵架', '孤独'],
    '健康': ['身体', '生病', '累', '疲惫', '失眠'],
    '经济': ['钱', '花费', '工资', '开销'],
    '未来': ['迷茫', '未来', '方向', '前途']
  };
  
  let emotionType = '平静';
  let sentimentScore = 0;
  let keyStressors = [];
  let aiReply = '';
  let suggestion = '';
  
  if (diary) {
    const lowerDiary = diary.toLowerCase();
    
    for (const [stressType, stressKeys] of Object.entries(stressKeywords)) {
      if (stressKeys.some(keyword => lowerDiary.includes(keyword))) {
        keyStressors.push(stressType);
      }
    }
    
    if (keyStressors.length === 0 && tags && tags.length > 0) {
      keyStressors = [...tags];
    }
    
    if (keyStressors.length === 0) {
      keyStressors = ['日常压力'];
    }
    
    let positiveCount = 0;
    let negativeCount = 0;
    
    keywords.positive.forEach(keyword => {
      if (lowerDiary.includes(keyword)) positiveCount++;
    });
    
    keywords.negative.forEach(keyword => {
      if (lowerDiary.includes(keyword)) negativeCount++;
    });
    
    if (positiveCount > negativeCount) {
      emotionType = '满足';
      sentimentScore = Math.min(0.8, 0.3 + positiveCount * 0.15);
    } else if (negativeCount > positiveCount) {
      emotionType = '低落';
      sentimentScore = Math.max(-0.8, -0.3 - negativeCount * 0.15);
    }
  } else {
    keyStressors = (tags && tags.length > 0) ? [...tags] : ['日常压力'];
  }
  
  const weatherAdjustments = {
    sunny: { emotion: '满足', score: 0.3 },
    partly_cloudy: { emotion: '平静', score: 0.1 },
    cloudy: { emotion: '低落', score: -0.1 },
    rainy: { emotion: '难过', score: -0.3 },
    storm: { emotion: '焦虑', score: -0.5 },
    snow: { emotion: '疲惫', score: -0.2 }
  };
  
  const adjustment = weatherAdjustments[weather];
  if (adjustment) {
    if (emotionType === '平静' || sentimentScore === 0) {
      emotionType = adjustment.emotion;
      sentimentScore = adjustment.score;
    }
    sentimentScore = Math.max(-1, Math.min(1, sentimentScore + adjustment.score * 0.3));
  }
  
  const suggestions = {
    happy: [
      '今天心情真好！可以多吃点甜食犒劳自己',
      '心情不错的时候适合和朋友出去玩',
      '保持这份好心情，去做一些喜欢的事情',
      '好天气配好心情，出去散散步吧',
      '可以记录下这份快乐，以后回忆起来也很美好'
    ],
    calm: [
      '平静的心情很适合思考，可以写写日记',
      '听听轻音乐，放松一下身心',
      '泡一杯茶，享受这平静的时光',
      '做一些简单的拉伸运动，放松身体',
      '整理一下房间，让环境也变得清爽'
    ],
    sad: [
      '心情不好的时候可以多吃点甜食，甜食能让人快乐',
      '出去散散步，呼吸一下新鲜空气',
      '和好朋友聊聊天，倾诉一下会好受些',
      '看一部喜欢的电影，转移注意力',
      '泡个热水澡，放松身心'
    ],
    anxious: [
      '试试深呼吸练习，慢慢让自己平静下来',
      '出去走走，运动一下释放压力',
      '听一些舒缓的音乐，放松神经',
      '把烦恼写下来，会感觉轻松很多',
      '找个安静的地方坐一坐，让思绪沉淀'
    ],
    tired: [
      '感觉累了就好好休息一下',
      '泡个脚放松一下，早点睡觉',
      '喝杯热牛奶，有助于放松',
      '做一些轻松的事情，别给自己太大压力',
      '适当休息才能更好地出发'
    ]
  };
  
  const replies = {
    happy: [
      '今天心情不错呢！继续保持这份好心情，把快乐传递给身边的人吧！🎉',
      '看到你开心真为你高兴！这份喜悦值得好好珍藏，希望你每天都能这么快乐！😊',
      '这份快乐很珍贵，好好享受吧！记得和朋友分享这份好心情，让快乐加倍！✨',
      '太棒了！你的努力和积极心态带来了今天的好心情，继续保持！💪',
      '阳光明媚的心情真好，愿这份快乐一直伴随着你！☀️'
    ],
    calm: [
      '平静也是一种美好的状态，享受此刻的安宁吧。内心的平和是最珍贵的礼物。🌿',
      '内心平静的时候，适合思考和沉淀。这是自我成长的好时机。🧘',
      '这样的状态很舒服，继续保持。平淡中蕴含着生活的真谛。🍵',
      '心如止水，这是一种难得的境界。好好享受这份宁静。🌊',
      '平静的心情像一杯清茶，细细品味，自有芬芳。☕'
    ],
    sad: [
      '我知道现在有点难过，但请相信一切都会好起来的。风雨过后总会有彩虹，你不是一个人。🌈',
      '难过的时候记得好好照顾自己。给自己一个温暖的拥抱，一切都会过去的。🤗',
      '给自己一些时间，慢慢会好的。想哭就哭出来，释放一下情绪会好受很多。💧',
      '每个人都会有心情低落的时候，这很正常。好好休息，明天又是新的一天。🌙',
      '别太难过了，失败是成功之母，这次的挫折只是为了让你变得更强大。💫'
    ],
    anxious: [
      '我感受到你的焦虑了，别太担心，一切都会过去的。深呼吸，让自己慢慢平静下来。🌬️',
      '焦虑的时候，试着做一些能让你专注的事情。把注意力转移到喜欢的事情上。🎨',
      '深呼吸，让自己慢慢平静下来。你已经做得很好了，不要给自己太大压力。💆',
      '焦虑是正常的反应，说明你很在乎这件事。相信自己的能力，你可以的！💯',
      '别想太多，一步一步来。把大目标分解成小步骤，慢慢就会好起来。🐾'
    ],
    tired: [
      '累了就好好休息，不要勉强自己。身体是革命的本钱，休息好了才能更好地出发。🛌',
      '身体需要休息，给自己放个假吧。好好睡一觉，醒来又是充满活力的一天。😴',
      '休息好了才能更好地面对明天。劳逸结合才是长久之计，照顾好自己最重要。💖',
      '辛苦了！适当放松一下，听听音乐或者看一部喜欢的电影，让自己恢复能量。🎵',
      '感觉累了就歇一歇，这不是偷懒，而是为了走更远的路。🚶'
    ]
  };
  
  let category = 'calm';
  if (sentimentScore > 0.3) category = 'happy';
  else if (sentimentScore < -0.3) category = 'sad';
  else if (sentimentScore < -0.1) category = 'tired';
  
  if (emotionType === '焦虑') category = 'anxious';
  
  aiReply = replies[category][Math.floor(Math.random() * replies[category].length)];
  suggestion = suggestions[category][Math.floor(Math.random() * suggestions[category].length)];
  
  return {
    emotionType,
    keyStressors: keyStressors.slice(0, 3),
    sentimentScore: Math.round(sentimentScore * 10) / 10,
    aiReply,
    suggestion
  };
}