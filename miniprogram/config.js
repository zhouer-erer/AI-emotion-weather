// 项目配置文件
module.exports = {
  // 云开发环境ID
  cloudEnv: 'your-cloud-env-id',
  
  // 智谱AI配置
  zhipuAI: {
    apiKey: 'your-api-key', // 实际开发时应在云函数环境变量中配置
    apiUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    model: 'glm-4-flash'
  },
  
  // 天气类型映射
  weatherMap: {
    sunny: {
      name: '晴',
      icon: '☀️',
      emotion: '平静/满足',
      score: 5
    },
    partly_cloudy: {
      name: '多云',
      icon: '⛅',
      emotion: '轻微波动',
      score: 4
    },
    cloudy: {
      name: '阴',
      icon: '☁️',
      emotion: '低落',
      score: 3
    },
    rainy: {
      name: '雨',
      icon: '🌧️',
      emotion: '难过',
      score: 2
    },
    storm: {
      name: '雷暴',
      icon: '⛈️',
      emotion: '愤怒/焦虑',
      score: 1
    },
    snow: {
      name: '雪',
      icon: '❄️',
      emotion: '麻木/疏离',
      score: 3
    }
  },
  
  // 情绪类型
  emotionTypes: [
    '焦虑', '抑郁', '兴奋', '平静', '愤怒', '孤独', '满足', '疲惫'
  ],
  
  // 压力源标签
  stressTags: [
    '考试压力', '学业负担', '人际关系', '家庭问题', '未来规划', '健康问题', '经济压力'
  ],
  
  // 舒缓建议
  suggestions: [
    '试试深呼吸3分钟',
    '听一首喜欢的歌',
    '去操场走一圈',
    '和朋友聊聊天',
    '喝一杯热饮',
    '做一些简单的伸展运动',
    '看一部喜剧电影',
    '写一写今天的感受'
  ]
};