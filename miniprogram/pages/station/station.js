Page({
  data: {
    monthlyData: [],
    aiReport: null,
    stressTags: [],
    isLoading: false,
    historyRecords: [],
    monthStats: {
      totalRecords: 0,
      avgScore: '--',
      highestWeather: '--'
    },
    pieChartData: [],
    weatherTypes: [
      { type: 'sunny', name: '晴', icon: '☀️', color: '#FFD93D' },
      { type: 'partly_cloudy', name: '多云', icon: '⛅', color: '#9B59B6' },
      { type: 'cloudy', name: '阴', icon: '☁️', color: '#7F8C8D' },
      { type: 'rainy', name: '雨', icon: '🌧️', color: '#3498DB' },
      { type: 'storm', name: '雷暴', icon: '⛈️', color: '#2C3E50' },
      { type: 'snow', name: '雪', icon: '❄️', color: '#E74C3C' }
    ]
  },

  onShow() {
    this.loadData();
  },

  onLoad() {
    this.loadData();
  },

  async loadData() {
    this.setData({ isLoading: true });
    
    try {
      await Promise.all([
        this.loadMonthlyRecords(),
        this.loadStressTags()
      ]);
      
      await this.generateAIReport();
      this.calculateStats();
      this.generatePieChart();
    } catch (error) {
      console.error('加载数据失败:', error);
    } finally {
      this.setData({ isLoading: false });
    }
  },

  async loadMonthlyRecords() {
    const db = wx.cloud.database();
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    try {
      const res = await db.collection('emotions')
        .where({
          createdAt: db.command.gte(startOfMonth)
        })
        .orderBy('createdAt', 'desc')
        .get();
      
      const records = res.data.map(record => {
        const weatherType = this.data.weatherTypes.find(item => item.type === record.weather);
        const d = new Date(record.createdAt);
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const day = d.getDate().toString().padStart(2, '0');
        const hours = d.getHours().toString().padStart(2, '0');
        const minutes = d.getMinutes().toString().padStart(2, '0');
        
        const weatherScores = { sunny: 80, partly_cloudy: 65, cloudy: 50, rainy: 35, storm: 20, snow: 40 };
        const weatherScore = weatherScores[record.weather] || 50;
        const sentiment = record.sentimentScore || 0;
        const finalScore = Math.round(weatherScore + sentiment * 10);
        
        return {
          ...record,
          weatherIcon: weatherType ? weatherType.icon : '☁️',
          weatherName: weatherType ? weatherType.name : '未知',
          formattedDate: `${month}-${day} ${hours}:${minutes}`,
          dateStr: `${month}-${day}`,
          moodScore: Math.max(0, Math.min(100, finalScore))
        };
      });
      
      this.setData({ 
        historyRecords: records,
        monthlyData: records
      });
    } catch (error) {
      console.error('加载月度记录失败:', error);
    }
  },



  async generateAIReport() {
    const records = this.data.monthlyData;
    
    if (records.length === 0) {
      this.setData({ aiReport: null });
      return;
    }
    
    // 先显示降级方案，确保用户能看到内容
    const moodScore = this.calculateMoodScore();
    const fallbackReport = {
      trend: this.calculateTrend(),
      emotionType: this.getMostCommonEmotion(),
      suggestion: this.generateSuggestion(),
      moodScore,
      scoreComment: this.generateScoreComment(moodScore)
    };
    
    this.setData({ aiReport: fallbackReport });
    
    // 尝试调用AI接口获取更好的分析
    try {
      const result = await this.callZhipuAI(records);
      console.log('AI返回结果:', result);
      
      if (result.success && result.analysis) {
        const report = result.analysis;
        report.moodScore = moodScore;
        report.scoreComment = this.generateScoreComment(moodScore);
        this.setData({ aiReport: report });
        console.log('AI报告已更新');
      }
    } catch (aiError) {
      console.log('AI调用失败，继续使用降级方案:', aiError);
    }
  },

  // 调用智谱AI接口
  async callZhipuAI(records) {
    const diaries = records.map(r => `${r.dateStr} ${r.weatherName}: ${r.diary || r.abstract || '心情记录'}`).join('\n');
    
    const systemPrompt = `你是一位专业且温暖的心理咨询师，请根据用户近30天的情绪日记记录，完成以下分析：
1. 分析整体情绪趋势（如：上升、下降、稳定、波动）
2. 识别最常见的情绪类型（如：开心、平静、低落、焦虑、疲惫）
3. 找出1-3个主要的压力源或情绪触发因素，从日记内容分析
4. 给出针对性的建议，包括具体的改善心情的方法

必须严格输出JSON格式，不要有其他内容：
{
  "trend": "string",
  "emotionType": "string",
  "keyStressors": ["string"],
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
            { role: 'user', content: `用户近30天的情绪记录：\n${diaries}` }
          ],
          temperature: 0.6,
          max_tokens: 800,
          stream: false
        },
        timeout: 15000,
        success: (res) => {
          console.log('AI响应:', res);
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

  // 计算情绪趋势
  calculateTrend() {
    const records = this.data.monthlyData;
    if (records.length < 3) return '稳定';
    
    const scores = records.map(r => {
      const weatherScores = { sunny: 80, partly_cloudy: 65, cloudy: 50, rainy: 35, storm: 20, snow: 40 };
      return weatherScores[r.weather] || 50;
    });
    
    const recent = scores.slice(0, Math.floor(records.length / 2));
    const earlier = scores.slice(Math.floor(records.length / 2));
    
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const earlierAvg = earlier.reduce((a, b) => a + b, 0) / earlier.length;
    
    if (recentAvg > earlierAvg + 10) return '上升';
    if (recentAvg < earlierAvg - 10) return '下降';
    return '稳定';
  },

  // 获取最常见的情绪
  getMostCommonEmotion() {
    const records = this.data.monthlyData;
    const weatherCounts = {};
    
    records.forEach(record => {
      weatherCounts[record.weather] = (weatherCounts[record.weather] || 0) + 1;
    });
    
    const maxWeather = Object.entries(weatherCounts).reduce((a, b) => a[1] > b[1] ? a : b)[0];
    const weatherType = this.data.weatherTypes.find(w => w.type === maxWeather);
    
    return weatherType ? weatherType.name + '心情' : '平静';
  },

  // 生成建议
  generateSuggestion() {
    const moodScore = this.calculateMoodScore();
    
    if (moodScore >= 80) {
      return '🎉 太棒了！你的情绪状态非常好，继续保持这份积极的心态！记得多和朋友分享你的快乐，让快乐加倍！';
    } else if (moodScore >= 60) {
      return '😊 不错哦！你的情绪状态比较稳定。偶尔可以给自己一些小奖励，比如吃点甜食或者看一部喜欢的电影，让心情更美好！';
    } else if (moodScore >= 40) {
      return '💪 最近可能有点小压力，这很正常。试着做一些能让你放松的事情，比如出去散散步、听听音乐，或者和好朋友聊聊天。';
    } else {
      return '🤗 抱抱你！最近心情可能不太好，记得好好照顾自己。难过的时候不要憋着，可以找朋友倾诉，或者做一些能让你开心的事情。一切都会好起来的！';
    }
  },

  calculateMoodScore() {
    const records = this.data.monthlyData;
    if (records.length === 0) return 50;
    
    const weatherScores = {
      sunny: 80,
      partly_cloudy: 65,
      cloudy: 50,
      rainy: 35,
      storm: 20,
      snow: 40
    };
    
    let totalScore = 0;
    records.forEach(record => {
      const score = weatherScores[record.weather] || 50;
      const sentiment = record.sentimentScore || 0;
      totalScore += score + sentiment * 10;
    });
    
    const avgScore = Math.round(totalScore / records.length);
    return Math.max(0, Math.min(100, avgScore));
  },

  generateScoreComment(score) {
    if (score >= 80) {
      return `🎉 太棒了！你的情绪指数很高，继续保持这份积极的心态！记得分享你的快乐给身边的人哦~`;
    } else if (score >= 60) {
      return `😊 不错哦！你的情绪状态比较稳定，偶尔可以给自己一些小奖励，让心情更美好！`;
    } else if (score >= 40) {
      return `💪 最近可能有点小压力，别担心，这很正常。试着做一些喜欢的事情放松一下吧！`;
    } else {
      return `🤗 抱抱你！最近心情可能不太好，记得照顾好自己。难过的时候可以找朋友聊聊，或者做一些能让你开心的事情。`;
    }
  },

  generateFallbackReport() {
    const records = this.data.monthlyData;
    const weatherCounts = {};
    let totalScore = 0;
    
    records.forEach(record => {
      weatherCounts[record.weather] = (weatherCounts[record.weather] || 0) + 1;
      const weatherScore = { sunny: 80, partly_cloudy: 65, cloudy: 50, rainy: 35, storm: 20, snow: 40 }[record.weather] || 50;
      totalScore += weatherScore;
    });
    
    const maxWeather = Object.entries(weatherCounts).reduce((a, b) => a[1] > b[1] ? a : b)[0];
    const weatherType = this.data.weatherTypes.find(w => w.type === maxWeather);
    
    return {
      trend: totalScore / records.length > 60 ? '上升' : '稳定',
      mainEmotion: weatherType ? weatherType.name + '心情' : '平静',
      stressors: this.data.stressTags.slice(0, 3).map(t => t.tag) || ['日常压力'],
      suggestion: '继续保持记录，关注情绪变化，适当放松自己'
    };
  },

  calculateStats() {
    const records = this.data.monthlyData;
    
    if (records.length === 0) {
      this.setData({
        monthStats: {
          totalRecords: 0,
          avgScore: '--',
          highestWeather: '--'
        }
      });
      return;
    }
    
    const weatherCounts = {};
    let totalScore = 0;
    
    records.forEach(record => {
      weatherCounts[record.weather] = (weatherCounts[record.weather] || 0) + 1;
      const score = { sunny: 80, partly_cloudy: 65, cloudy: 50, rainy: 35, storm: 20, snow: 40 }[record.weather] || 50;
      totalScore += score;
    });
    
    const maxWeather = Object.entries(weatherCounts).reduce((a, b) => a[1] > b[1] ? a : b)[0];
    const weatherType = this.data.weatherTypes.find(w => w.type === maxWeather);
    
    this.setData({
      monthStats: {
        totalRecords: records.length,
        avgScore: Math.round(totalScore / records.length),
        highestWeather: weatherType ? weatherType.icon + ' ' + weatherType.name : '--'
      }
    });
  },

  generatePieChart() {
    const records = this.data.monthlyData;
    
    if (records.length === 0) {
      this.setData({ pieChartData: [] });
      return;
    }
    
    const weatherCounts = {};
    records.forEach(record => {
      weatherCounts[record.weather] = (weatherCounts[record.weather] || 0) + 1;
    });
    
    const total = records.length;
    const pieData = [];
    
    this.data.weatherTypes.forEach(weatherType => {
      const count = weatherCounts[weatherType.type] || 0;
      if (count > 0) {
        const percent = Math.round((count / total) * 100);
        
        pieData.push({
          emotion: weatherType.name,
          count,
          percent,
          color: weatherType.color
        });
      }
    });
    
    // 按数量排序
    pieData.sort((a, b) => b.count - a.count);
    
    this.setData({ pieChartData: pieData });
  },

  // 加载压力源标签
  async loadStressTags() {
    const db = wx.cloud.database();
    
    try {
      const res = await db.collection('emotions').get();
      const allTags = [];
      
      res.data.forEach(record => {
        // 同时检查 keyStressors 和 tags 字段
        if (record.keyStressors && Array.isArray(record.keyStressors)) {
          allTags.push(...record.keyStressors);
        }
        if (record.tags && Array.isArray(record.tags)) {
          allTags.push(...record.tags);
        }
        // 如果没有标签，从日记内容中提取关键词
        if (!record.keyStressors && !record.tags && record.diary) {
          const extractedTags = this.extractTagsFromDiary(record.diary);
          if (extractedTags.length > 0) {
            allTags.push(...extractedTags);
          }
        }
      });
      
      // 统计标签频率
      const tagCounts = {};
      allTags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
      
      // 转换为数组并排序
      const stressTags = Object.entries(tagCounts)
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count);
      
      this.setData({ stressTags });
    } catch (error) {
      console.error('加载压力源标签失败:', error);
      this.setData({ stressTags: [] });
    }
  },

  // 从日记内容中提取关键词作为压力源
  extractTagsFromDiary(diary) {
    const keywords = {
      '学业': ['考试', '学习', '作业', '复习', '成绩', '上课', '课程', '大学', '高中', '初中'],
      '工作': ['工作', '上班', '加班', '项目', '任务', '老板', '同事', '公司', '职场'],
      '人际关系': ['朋友', '家人', '恋爱', '分手', '吵架', '孤独', '闺蜜', '兄弟', '关系'],
      '健康': ['身体', '生病', '累', '疲惫', '失眠', '头痛', '休息'],
      '经济': ['钱', '花费', '工资', '开销', '消费'],
      '未来': ['迷茫', '未来', '方向', '前途'],
      '家庭': ['家人', '父母', '亲情'],
      '感情': ['恋爱', '喜欢', '爱', '爱情']
    };
    
    const foundTags = [];
    const lowerDiary = diary.toLowerCase();
    
    Object.entries(keywords).forEach(([tag, keys]) => {
      if (keys.some(keyword => lowerDiary.includes(keyword))) {
        foundTags.push(tag);
      }
    });
    
    return foundTags.length > 0 ? foundTags : ['日常压力'];
  }
});