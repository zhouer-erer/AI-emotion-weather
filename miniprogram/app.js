App({
  onLaunch() {
    // 尝试初始化云开发，如果失败则使用本地存储
    this.initCloud();
    
    // 获取或生成openid
    this.getOpenid();
  },
  
  async initCloud() {
    try {
      await wx.cloud.init({
        env: 'cloudbase-d3g63mkw83f8f45e5',
        traceUser: true
      });
      this.globalData.cloudAvailable = true;
      console.log('云开发初始化成功');
    } catch (err) {
      console.error('云开发初始化失败，使用本地存储模式:', err);
      this.globalData.cloudAvailable = false;
      // 初始化本地存储数据
      this.initLocalStorage();
    }
  },
  
  initLocalStorage() {
    // 初始化本地情绪记录
    if (!wx.getStorageSync('local_emotions')) {
      wx.setStorageSync('local_emotions', []);
    }
    // 初始化本地用户信息
    if (!wx.getStorageSync('local_user')) {
      wx.setStorageSync('local_user', {
        streakDays: 0,
        totalRecords: 0
      });
    }
    // 初始化本地树洞数据
    if (!wx.getStorageSync('local_treehole')) {
      wx.setStorageSync('local_treehole', [
        {
          _id: 'demo1',
          weather: 'sunny',
          abstract: '今天心情不错，阳光明媚！',
          fullDiary: '今天心情不错，阳光明媚！感觉一切都很顺利。',
          aiReply: '看到你心情好真为你高兴！继续保持这份积极的心态！',
          emotionType: '满足',
          likes: 5,
          date: new Date().toISOString().slice(0, 10)
        },
        {
          _id: 'demo2',
          weather: 'rainy',
          abstract: '今天有点难过...',
          fullDiary: '今天有点难过，工作压力好大，感觉喘不过气来。',
          aiReply: '抱抱你！压力大的时候记得好好照顾自己，一切都会过去的！',
          emotionType: '低落',
          likes: 12,
          date: new Date().toISOString().slice(0, 10)
        }
      ]);
    }
  },
  
  getOpenid() {
    let openid = wx.getStorageSync('openid');
    if (!openid) {
      openid = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      wx.setStorageSync('openid', openid);
    }
    this.globalData.openid = openid;
    console.log('当前用户ID:', openid);
  },
  
  // 用户点击授权时调用
  async authorizeUser() {
    try {
      const res = await wx.getUserProfile({
        desc: '用于完善会员资料'
      });
      this.globalData.userInfo = res.userInfo;
      wx.setStorageSync('userInfo', res.userInfo);
      return res.userInfo;
    } catch (err) {
      console.log('用户未授权:', err);
      return null;
    }
  },
  
  globalData: {
    userInfo: null,
    openid: '',
    cloudAvailable: false,
    weatherTypes: [
      { type: 'sunny', name: '晴', icon: '☀️' },
      { type: 'partly_cloudy', name: '多云', icon: '⛅' },
      { type: 'cloudy', name: '阴', icon: '☁️' },
      { type: 'rainy', name: '雨', icon: '🌧️' },
      { type: 'storm', name: '雷暴', icon: '⛈️' },
      { type: 'snow', name: '雪', icon: '❄️' }
    ]
  }
});