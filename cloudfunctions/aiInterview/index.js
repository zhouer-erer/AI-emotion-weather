const axios = require('axios');

// 智谱AI配置
const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY || '52207ad3adcd416f9f99f29719ffacfa.RTVOoF21BTXsdGGS';
const ZHIPU_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

// 天气名称映射
const weatherNames = {
  sunny: '晴朗',
  partly_cloudy: '多云',
  cloudy: '阴天',
  rainy: '下雨',
  storm: '雷暴',
  snow: '下雪'
};

// 天气对应的情感描述
const weatherMoods = {
  sunny: '开心、满足',
  partly_cloudy: '心情有些起伏',
  cloudy: '有些低落',
  rainy: '有点难过',
  storm: '有些烦躁或焦虑',
  snow: '内心有些平静或麻木'
};

exports.main = async (event, context) => {
  const { step, weather, intensity, tags, previousAnswers = [] } = event;

  console.log('aiInterview called with:', { step, weather, intensity, tags, previousAnswers });

  try {
    // 最后一步：生成完整日记和回复
    if (step >= 2) {
      return await generateDiaryAndReply(weather, intensity, tags, previousAnswers);
    }

    // 生成AI问题
    const question = await generateAIQuestion(step, weather, intensity, tags, previousAnswers);
    return {
      type: 'question',
      content: question
    };
  } catch (error) {
    console.error('aiInterview error:', error);
    // 降级方案
    if (step >= 2) {
      return {
        type: 'diary',
        content: generateFallbackDiary(weather, intensity, tags, previousAnswers)
      };
    } else {
      return {
        type: 'question',
        content: generateFallbackQuestion(step, weather)
      };
    }
  }
};

// 使用AI生成问题
async function generateAIQuestion(step, weather, intensity, tags, previousAnswers) {
  const mood = weatherMoods[weather] || '复杂的心情';
  const weatherName = weatherNames[weather] || weather;
  
  const historyText = previousAnswers.length > 0 
    ? `之前对话：${previousAnswers.join('；')}` 
    : '';
  
  const tagsText = tags && tags.length > 0 
    ? `，影响因素：${tags.join('、')}` 
    : '';

  const prompt = `你是一个温暖的心理咨询师，正在和用户进行对话。用户今天的心情天气是${weatherName}（${mood}），强度${intensity}/5${tagsText}。${historyText}
  
请根据以上信息，问一个开放式的问题来引导用户进一步分享。问题要温柔、共情，不要太正式。`;

  try {
    const response = await axios.post(
      ZHIPU_API_URL,
      {
        model: 'glm-4-flash',
        messages: [
          { role: 'system', content: '你是一个温暖、耐心的倾听者，擅长用开放式问题引导用户表达感受。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 100
      },
      {
        headers: {
          'Authorization': `Bearer ${ZHIPU_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 2500
      }
    );

    return response.data.choices[0].message.content.trim();
  } catch (error) {
    console.error('AI question generation failed, using fallback:', error);
    return generateFallbackQuestion(step, weather);
  }
}

// 生成日记和AI回复
async function generateDiaryAndReply(weather, intensity, tags, previousAnswers) {
  const mood = weatherMoods[weather] || '复杂的心情';
  const weatherName = weatherNames[weather] || weather;
  const tagsText = tags && tags.length > 0 ? `，影响因素：${tags.join('、')}` : '';
  const userInput = previousAnswers.join('；');

  const prompt = `用户今天的心情天气是${weatherName}（${mood}），强度${intensity}/5${tagsText}。用户分享：${userInput}

请帮我完成两件事：
1. 写一段简短的心情日记（第一人称，50字左右）
2. 给出一句温暖的回应或建议

用JSON格式输出：{"diary": "...", "reply": "..."}`;

  try {
    const response = await axios.post(
      ZHIPU_API_URL,
      {
        model: 'glm-4-flash',
        messages: [
          { role: 'system', content: '你是一个温暖的心情记录助手，擅长用简洁温暖的语言记录心情并给予安慰。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.8,
        max_tokens: 200,
        response_format: { type: 'json_object' }
      },
      {
        headers: {
          'Authorization': `Bearer ${ZHIPU_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 2500
      }
    );

    const result = JSON.parse(response.data.choices[0].message.content);
    return {
      type: 'diary',
      content: result.diary || generateFallbackDiary(weather, intensity, tags, previousAnswers),
      reply: result.reply || '今天辛苦了，记得好好照顾自己。'
    };
  } catch (error) {
    console.error('AI diary generation failed, using fallback:', error);
    return {
      type: 'diary',
      content: generateFallbackDiary(weather, intensity, tags, previousAnswers),
      reply: generateFallbackReply(weather)
    };
  }
}

// 降级问题生成
function generateFallbackQuestion(step, weather) {
  const mood = weatherMoods[weather] || '复杂的心情';
  const questions = [
    `今天是什么让你有${mood}的感觉呢？`,
    `可以和我分享一下今天的心情故事吗？`,
    `是什么事情影响了你今天的心情？`,
    `今天最让你印象深刻的是什么？`,
    `如果用一句话形容今天，你会说什么？`
  ];
  
  return questions[step % questions.length];
}

// 降级日记生成
function generateFallbackDiary(weather, intensity, tags, previousAnswers) {
  const date = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
  const weatherName = weatherNames[weather] || weather;
  const tagText = tags && tags.length > 0 ? `，主要是因为${tags.join('、')}` : '';
  
  const templates = [
    `今天是${date}，心情${weatherName}${tagText}。${previousAnswers.length > 0 ? previousAnswers[0] : '记录一下今天的心情。'}`,
    `${date}，今天的心情${weatherName}${tagText}。${previousAnswers.length > 0 ? previousAnswers.slice(-1)[0] : '简简单单的一天。'}`,
    `今天心情${weatherName}，强度${intensity}级${tagText}。${previousAnswers.length > 0 ? previousAnswers.join('，') : '记录心情，记录生活。'}`
  ];
  
  return templates[Math.floor(Math.random() * templates.length)];
}

// 降级回复生成
function generateFallbackReply(weather) {
  const replies = {
    sunny: '今天心情不错呢！继续保持这份好心情，记得和身边的人分享快乐呀！',
    partly_cloudy: '心情有点起伏很正常，给自己一些时间，一切都会慢慢变好的。',
    cloudy: '感觉有点低落吗？没关系，阴天后总会有晴天，给自己一个拥抱吧。',
    rainy: '现在的心情像是在下雨，但是雨后会有彩虹的。记得好好照顾自己。',
    storm: '情绪有点激动，先深呼吸让自己平静下来。一切都会过去的，相信自己。',
    snow: '感觉有点麻木？试着做一些让自己开心的事情，慢慢找回生活的乐趣。'
  };
  
  return replies[weather] || '今天辛苦了，记得好好休息。';
};