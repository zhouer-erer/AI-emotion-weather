Page({
  data: {
    step: 1,                    // 当前步骤：1选天气，2选强度，3选标签，4AI访谈1，5AI访谈2，6完成
    selectedWeather: '',
    selectedWeatherIcon: '',
    selectedWeatherName: '',
    intensity: 3,
    tags: [],
    allTags: ['考试压力', '学业负担', '人际关系', '家庭问题', '未来规划', '健康问题', '经济压力', '工作压力', '感情问题', '其他'],
    aiQuestion: '',
    aiChatReply: '',
    userAnswer: '',
    canSubmit: false,
    chatHistory: [],
    diaryText: '',
    aiAnalysis: null,
    isLoading: false,
    weatherTypes: [
      { type: 'sunny', name: '晴', icon: '☀️', emotion: '平静/满足' },
      { type: 'partly_cloudy', name: '多云', icon: '⛅', emotion: '轻微波动' },
      { type: 'cloudy', name: '阴', icon: '☁️', emotion: '低落' },
      { type: 'rainy', name: '雨', icon: '🌧️', emotion: '难过' },
      { type: 'storm', name: '雷暴', icon: '⛈️', emotion: '愤怒/焦虑' },
      { type: 'snow', name: '雪', icon: '❄️', emotion: '麻木/疏离' }
    ]
  },

  onLoad(options) {
    // 检查是否是快捷打卡
    const quickWeather = wx.getStorageSync('quickWeather');
    const quickRecord = wx.getStorageSync('quickRecord');
    
    if (quickWeather && quickRecord) {
      const weatherType = this.data.weatherTypes.find(item => item.type === quickWeather);
      this.setData({ 
        selectedWeather: quickWeather, 
        step: 2,
        selectedWeatherIcon: weatherType ? weatherType.icon : '',
        selectedWeatherName: weatherType ? weatherType.name : ''
      });
      wx.removeStorageSync('quickWeather');
      wx.removeStorageSync('quickRecord');
    } else if (options.weather) {
      const weatherType = this.data.weatherTypes.find(item => item.type === options.weather);
      this.setData({ 
        selectedWeather: options.weather, 
        step: 2,
        selectedWeatherIcon: weatherType ? weatherType.icon : '',
        selectedWeatherName: weatherType ? weatherType.name : ''
      });
    }
  },

  // 选择天气
  selectWeather(e) {
    const weather = e.currentTarget.dataset.weather;
    const weatherType = this.data.weatherTypes.find(item => item.type === weather);
    this.setData({ 
      selectedWeather: weather, 
      step: 2,
      selectedWeatherIcon: weatherType ? weatherType.icon : '',
      selectedWeatherName: weatherType ? weatherType.name : ''
    });
  },

  // 选择强度
  selectIntensity(e) {
    const intensity = e.currentTarget.dataset.intensity;
    this.setData({ intensity, step: 3 });
  },

  // 选择/取消标签
  toggleTag(e) {
    const tag = e.currentTarget.dataset.tag;
    let tags = [...this.data.tags];
    const index = tags.indexOf(tag);
    if (index > -1) {
      tags.splice(index, 1);
    } else {
      tags.push(tag);
    }
    // 生成已选择标签的索引映射，用于模板判断
    const selectedTagIndexes = {};
    tags.forEach(t => {
      selectedTagIndexes[t] = true;
    });
    this.setData({ tags, selectedTagIndexes });
  },

  // 确认标签，进入AI访谈
  confirmTags() {
    this.setData({ step: 4 });
    this.loadAiQuestion(0);
  },

  // 加载AI问题或生成日记
  async loadAiQuestion(questionIndex) {
    try {
      // 前端直接调用AI接口，避免云函数超时
      const result = await this.callAiInterview({
        step: questionIndex,
        weather: this.data.selectedWeather,
        intensity: this.data.intensity,
        tags: this.data.tags,
        previousAnswers: this.getPreviousAnswers()
      });
      
      if (result.type === 'question') {
        // 添加AI问题到聊天历史
        const newChat = [...this.data.chatHistory, { type: 'ai', content: result.content }];
        this.setData({ 
          chatHistory: newChat,
          aiQuestion: result.content 
        });
        
        // 设置正确的步骤（4或5）
        if (questionIndex === 0) {
          this.setData({ step: 4 });
        } else {
          this.setData({ step: 5 });
        }
      } else {
        // 生成日记完成，添加到聊天历史
        const newChat = [...this.data.chatHistory, { type: 'ai', content: result.content }];
        this.setData({ 
          chatHistory: newChat,
          diaryText: result.content, 
          step: 6 
        });
        
        // 如果AI返回了回复，添加到聊天历史
        if (result.reply) {
          const chatWithReply = [...this.data.chatHistory, { type: 'ai', content: result.reply }];
          this.setData({ chatHistory: chatWithReply });
        }
        
        this.analyzeEmotion();
      }
    } catch (error) {
      console.error('加载AI问题失败:', error);
      this.setData({ 
        diaryText: '今天的心情有点复杂，记录下来感觉好多了。',
        step: 6 
      });
      this.analyzeEmotion();
    }
  },

  // 获取之前的回答
  getPreviousAnswers() {
    return this.data.chatHistory
      .filter(item => item.type === 'user')
      .map(item => item.content);
  },

  // 绑定用户回答
  bindUserAnswer(e) {
    const value = e.detail.value;
    const canSubmit = value && value.replace(/\s/g, '').length > 0;
    this.setData({ userAnswer: value, canSubmit });
  },

  // 提交回答，进入下一步
  async submitAnswer() {
    if (!this.data.userAnswer.trim()) {
      wx.showToast({ title: '请输入你的回答', icon: 'none' });
      return;
    }
    
    // 添加用户回答到聊天历史
    const newChat = [...this.data.chatHistory, { type: 'user', content: this.data.userAnswer }];
    this.setData({ chatHistory: newChat, userAnswer: '', canSubmit: false });
    
    // 检查当前是第几个问题
    const answerCount = this.getPreviousAnswers().length;
    
    if (answerCount < 2) {
      // 还没回答完2个问题，继续下一个问题
      this.loadAiQuestion(answerCount);
    } else {
      // 回答完2个问题，生成日记
      this.loadAiQuestion(2);
    }
  },

  // AI情绪分析
  async analyzeEmotion() {
    try {
      const weather = this.data.selectedWeather;
      const tags = this.data.tags || [];
      const diary = this.data.diaryText || '';
      
      // 先使用降级方案，确保用户能看到内容
      const fallbackAnalysis = this.generateFallbackAnalysis(weather, tags, diary);
      this.setData({ aiAnalysis: fallbackAnalysis });
      
      // 尝试调用AI接口获取更好的分析
      try {
        const result = await this.callZhipuAI({
          diary: diary,
          weather: weather,
          tags: tags
        });
        
        console.log('AI分析结果:', result);
        
        if (result.success && result.analysis) {
          const aiAnalysis = result.analysis;
          if (!aiAnalysis.keyStressors || aiAnalysis.keyStressors.length === 0) {
            aiAnalysis.keyStressors = tags.length > 0 ? tags : ['日常压力'];
          }
          // 确保情感评分存在
          if (aiAnalysis.sentimentScore === undefined) {
            aiAnalysis.sentimentScore = fallbackAnalysis.sentimentScore;
          }
          this.setData({ aiAnalysis: aiAnalysis });
          console.log('AI分析已更新');
        }
      } catch (aiError) {
        console.log('AI接口调用失败，使用降级方案:', aiError);
      }
    } catch (error) {
      console.error('AI分析失败:', error);
      const weather = this.data.selectedWeather;
      const tags = this.data.tags || [];
      this.setData({
        aiAnalysis: this.generateFallbackAnalysis(weather, tags, this.data.diaryText || '')
      });
    }
  },

  // 保存记录
  async saveRecord() {
    this.setData({ isLoading: true });
    
    try {
      const db = wx.cloud.database();
      const dateStr = new Date().toISOString().slice(0, 10);
      
      console.log('开始保存记录:', { dateStr, weather: 
        this.data.selectedWeather });
      
      if (!this.data.selectedWeather) {
        throw new Error('请选择心情天气');
      }
      
      // 获取压力源数据
      const keyStressors = this.data.aiAnalysis &&
       this.data.aiAnalysis.keyStressors && Array.isArray
       (this.data.aiAnalysis.keyStressors)
        ? this.data.aiAnalysis.keyStressors
        : (this.data.tags && this.data.tags.length > 0 ? 
          this.data.tags : ['日常压力']);
      
      await db.collection('emotions').add({
        data: {
          date: dateStr,
          weather: this.data.selectedWeather,
          intensity: this.data.intensity,
          diary: this.data.diaryText || '暂无内容',
          tags: this.data.tags || [],
          keyStressors: keyStressors,
          aiAnalysis: this.data.aiAnalysis,
          isPublic: false,
          likes: 0,
          createdAt: db.serverDate()
        }
      });

      console.log('记录保存成功');

      // 更新用户统计数据
      await this.updateUserStats();

      wx.showToast({ title: '记录成功', icon: 'success' });
      setTimeout(() => {
        wx.switchTab({ url: '/pages/index/index' });
      }, 1500);
      
    } catch (err) {
      console.error('保存失败:', err);
      wx.showToast({ title: '保存失败: ' + (err.message || '未知错误'), icon: 'none', duration: 2000 });
    } finally {
      this.setData({ isLoading: false });
    }
  },

  // 发布到树洞
  async publishToTreehole() {
    this.setData({ isLoading: true });
    
    try {
      const db = wx.cloud.database();
      const dateStr = new Date().toISOString().slice(0, 10);
      
      console.log('开始发布到树洞:', { dateStr });
      
      // 只发布到树洞，不重复保存到emotions
      await db.collection('treehole').add({
        data: {
          weather: this.data.selectedWeather,
          abstract: (this.data.diaryText || '').slice(0, 50) + ((this.data.diaryText || '').length > 50 ? '...' : ''),
          fullDiary: this.data.diaryText || '',
          aiReply: this.data.aiAnalysis ? this.data.aiAnalysis.aiReply : '',
          emotionType: this.data.aiAnalysis ? this.data.aiAnalysis.emotionType : '',
          likes: 0,
          createdAt: db.serverDate(),
          date: dateStr
        }
      });

      console.log('发布成功');

      wx.showToast({ title: '发布成功', icon: 'success' });
      setTimeout(() => {
        wx.switchTab({ url: '/pages/square/square' });
      }, 1500);
      
    } catch (err) {
      console.error('发布失败:', err);
      wx.showToast({ title: '发布失败: ' + (err.message || '未知错误'), icon: 'none', duration: 2000 });
    } finally {
      this.setData({ isLoading: false });
    }
  },

  // 更新用户统计
  async updateUserStats() {
    try {
      const openid = wx.getStorageSync('openid');
      if (!openid) {
        console.log('openid 不存在，跳过用户统计更新');
        return;
      }
      
      const result = await wx.cloud.callFunction({
        name: 'updateStats',
        data: { openid }
      });
      
      console.log('用户统计更新成功:', result);
    } catch (error) {
      console.error('更新用户统计失败:', error);
    }
  },

  // 返回上一步
  goBack() {
    if (this.data.step > 1) {
      this.setData({ step: this.data.step - 1 });
    } else {
      wx.navigateBack();
    }
  },

  // 前端直接调用AI访谈接口
  async callAiInterview(data) {
    const { step, weather, intensity, tags, previousAnswers } = data;
    const weatherMap = {
      sunny: '晴', 
      partly_cloudy: '多云', 
      cloudy: '阴',
      rainy: '雨', 
      storm: '雷暴', 
      snow: '雪'
    };
    const weatherName = weatherMap[weather] || '未知';
    const tagsText = tags && tags.length > 0 ? tags.join('、') : '无';
    const answersText = previousAnswers && previousAnswers.length > 0 ? previousAnswers.join('；') : '无';
    
    if (step < 2) {
      // 生成问题
      const questions = [
        `今天的心情天气是${weatherName}，强度${intensity}/5。是什么让你今天有这样的心情呢？`,
        `我了解到你的心情受到了${tagsText}的影响。能和我说说具体发生了什么吗？`,
        `谢谢你的分享！根据我们的对话，我来帮你整理一下今天的心情日记。`
      ];
      
      return {
        type: 'question',
        content: questions[step]
      };
    } else {
      // 生成日记
      const weatherEmotions = {
        sunny: '开心、满足',
        partly_cloudy: '平静中带着一丝波动',
        cloudy: '有些低落',
        rainy: '感到难过',
        storm: '有些焦虑或烦躁',
        snow: '感觉有些麻木'
      };
      const emotion = weatherEmotions[weather] || '复杂';
      
      let diary = `今天是${this.getCurrentDate()}，心情${emotion}，主要是因为${tagsText}。`;
      if (answersText !== '无') {
        diary += `\n\n${answersText}`;
      }
      diary += '\n\n今天的心情记录下来，感觉好多了。😊';
      
      return {
        type: 'diary',
        content: diary
      };
    }
  },

  // 获取当前日期
  getCurrentDate() {
    const d = new Date();
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    return `${year}年${month}月${day}日`;
  },

  // 前端直接调用智谱AI接口
  async callZhipuAI(data) {
    const { diary, weather, tags } = data;
    const weatherMap = {
      sunny: '平静/满足', 
      partly_cloudy: '轻微波动', 
      cloudy: '低落',
      rainy: '低落', 
      storm: '愤怒/焦虑', 
      snow: '麻木/疏离'
    };
    const mood = weatherMap[weather] || '未知';
    const tagsText = tags && tags.length > 0 ? tags.join('、') : '无';
    
    const systemPrompt = `你是一位专业且温暖的心理咨询师，请仔细分析用户的情绪日记并给出专业分析：

分析任务：
1. 情绪类型识别：从列表中选择最符合的情绪（焦虑、抑郁、兴奋、平静、愤怒、孤独、满足、疲惫）
2. 压力源分析：从日记内容和标签中深入分析1-3个主要压力源或情绪触发因素，要具体描述
3. 情感评分：给出-1.0到1.0的情感极性评分
4. 温暖回复：根据日记具体内容写一段温暖的回复，可以包含表情符号，要共情、具体、详细（80-120字）
5. 行动建议：推荐1个具体可执行的舒缓动作

必须严格输出JSON格式，不要有其他内容：
{
  "emotionType": "string",
  "keyStressors": ["string"],
  "sentimentScore": number,
  "aiReply": "string",
  "suggestion": "string"
}`;

    return new Promise((resolve, reject) => {
      wx.request({
        url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
        method: 'POST',
        header: {
          'Authorization': 'Bearer 52207ad3adcd416f9f99f29719ffacfa.RTVOoF21BTXsdGGS',
          'Content-Type': 'application/json'
        },
        data: {
          model: 'glm-4-flash',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `用户心情天气：${mood}，日记内容：${diary}，标签：${tagsText}` }
          ],
          temperature: 0.7,
          max_tokens: 800,
          stream: false
        },
        timeout: 15000,
        success: (res) => {
          console.log('AI分析响应:', res);
          if (res.statusCode === 200 && res.data.choices && res.data.choices[0]) {
            try {
              const content = res.data.choices[0].message.content;
              const analysis = JSON.parse(content);
              resolve({ success: true, analysis });
            } catch (parseError) {
              console.error('解析AI响应失败:', parseError, res.data);
              resolve({ success: false });
            }
          } else {
            console.error('AI返回错误:', res.statusCode, res.data);
            resolve({ success: false });
          }
        },
        fail: (err) => {
          console.error('AI请求失败:', err);
          resolve({ success: false });
        }
      });
    });
  },

  // 生成降级分析
  generateFallbackAnalysis(weather, tags, diary) {
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
});