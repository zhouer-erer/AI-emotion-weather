Page({
  data: {
    todayDate: '',
    greeting: '',
    todayRecord: null,
    todayRecordWeatherIcon: '',
    streakDays: 0,
    weekData: [],
    weatherTypes: [
      { type: 'sunny', name: '晴', icon: '☀️' },
      { type: 'partly_cloudy', name: '多云', icon: '⛅' },
      { type: 'cloudy', name: '阴', icon: '☁️' },
      { type: 'rainy', name: '雨', icon: '🌧️' },
      { type: 'storm', name: '雷暴', icon: '⛈️' },
      { type: 'snow', name: '雪', icon: '❄️' }
    ]
  },

  onLoad() {
    this.setTodayDate();
    this.setGreeting();
    this.loadTodayRecord();
    this.loadWeekData();
    this.loadUserStats();
  },

  onShow() {
    // 每次页面显示时刷新数据
    this.loadTodayRecord();
    this.loadWeekData();
    this.loadUserStats();
  },

  setTodayDate() {
    const date = new Date();
    const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
    this.setData({
      todayDate: `${date.getMonth() + 1}月${date.getDate()}日 周${weekDays[date.getDay()]}`
    });
  },

  setGreeting() {
    const hour = new Date().getHours();
    let greeting = '';
    if (hour < 6) {
      greeting = '夜深了，早点休息哦';
    } else if (hour < 12) {
      greeting = '早上好，新的一天开始了';
    } else if (hour < 18) {
      greeting = '下午好，今天过得怎么样';
    } else {
      greeting = '晚上好，今天辛苦了';
    }
    this.setData({ greeting });
  },

  // 加载今日记录
  async loadTodayRecord() {
    const db = wx.cloud.database();
    const today = new Date().toISOString().slice(0, 10);
    
    try {
      const { data } = await db.collection('emotions')
        .where({
          date: today
        })
        .get();
      
      if (data.length > 0) {
        const record = data[0];
        this.setData({ todayRecord: record });
        // 找到对应的天气图标
        const weatherType = this.data.weatherTypes.find(item => item.type === record.weather);
        if (weatherType) {
          this.setData({ todayRecordWeatherIcon: weatherType.icon });
        }
      }
    } catch (error) {
      console.error('加载今日记录失败:', error);
    }
  },

  // 加载用户统计数据
  async loadUserStats() {
    const db = wx.cloud.database();
    
    try {
      // 从 emotions 集合动态计算连续打卡天数（与"我的"页面逻辑一致）
      const { data: emotions } = await db.collection('emotions')
        .orderBy('date', 'desc')
        .get();
      
      const streakDays = this.calculateStreak(emotions);
      this.setData({ streakDays });
    } catch (error) {
      console.error('加载用户统计失败:', error);
    }
  },

  // 计算连续打卡天数（与"我的"页面逻辑一致）
  calculateStreak(emotions) {
    if (!emotions || emotions.length === 0) return 0;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const dates = new Set();
    emotions.forEach(item => {
      if (item.date) {
        const date = new Date(item.date);
        date.setHours(0, 0, 0, 0);
        dates.add(date.getTime());
      }
    });
    
    let streak = 0;
    const checkDate = new Date(today);
    
    while (dates.has(checkDate.getTime())) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    }
    
    return streak;
  },

  // 加载本周数据
  async loadWeekData() {
    const db = wx.cloud.database();
    const weekData = [];
    const today = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().slice(0, 10);
      const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
      const dayName = `周${weekDays[date.getDay()]}`;
      
      // 查询当天的情绪记录
      try {
        const { data } = await db.collection('emotions')
          .where({ date: dateStr })
          .get();
        
        if (data.length > 0) {
          const weather = data[0].weather;
          const weatherType = this.data.weatherTypes.find(item => item.type === weather);
          weekData.push({
            date: dateStr,
            dayName,
            weather,
            weatherIcon: weatherType ? weatherType.icon : ''
          });
        } else {
          weekData.push({
            date: dateStr,
            dayName,
            weather: null,
            weatherIcon: ''
          });
        }
      } catch (error) {
        console.error('加载周数据失败:', error);
        weekData.push({
          date: dateStr,
          dayName,
          weather: null,
          weatherIcon: ''
        });
      }
    }
    
    this.setData({ weekData });
  },

  // 快捷打卡
  quickRecord(e) {
    const weather = e.currentTarget.dataset.weather;
    // 先存储天气信息到本地存储
    wx.setStorageSync('quickWeather', weather);
    wx.setStorageSync('quickRecord', true);
    // 切换到记一记标签页
    wx.switchTab({
      url: '/pages/record/record'
    });
  }
});