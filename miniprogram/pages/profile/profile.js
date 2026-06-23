Page({
  data: {
    userInfo: {
      nickName: '匿名用户',
      avatarUrl: '',
      openid: ''
    },
    userStats: {
      streakDays: 0,
      totalRecords: 0,
      lastRecordDate: '未记录'
    },
    emotionPattern: {
      commonEmotions: '暂无数据',
      commonTags: '暂无数据',
      weeklyDistribution: []
    }
  },

  async onLoad() {
    await this.loadUserInfo();
    await this.loadUserStats();
    await this.loadEmotionPattern();
  },

  onShow() {
    // 每次页面显示时刷新数据
    this.loadUserStats();
    this.loadEmotionPattern();
  },

  // 加载用户信息
  async loadUserInfo() {
    const userInfo = wx.getStorageSync('userInfo');
    const openid = wx.getStorageSync('openid');
    
    if (userInfo) {
      this.setData({ userInfo: { ...userInfo, openid } });
    }
  },

  // 加载用户统计数据
  async loadUserStats() {
    const db = wx.cloud.database();
    
    try {
      // 使用 count() 获取准确的总记录数（不受分页限制）
      const countRes = await db.collection('emotions').count();
      const totalRecords = countRes.total || 0;
      
      // 获取所有记录用于计算连续打卡天数
      const { data: emotions } = await db.collection('emotions')
        .orderBy('date', 'desc')
        .get();
      
      const streakDays = this.calculateStreak(emotions);
      const lastRecordDate = emotions[0]?.date || '未记录';
      
      this.setData({
        userStats: {
          streakDays,
          totalRecords,
          lastRecordDate
        }
      });
    } catch (error) {
      console.error('加载用户统计失败:', error);
    }
  },

  // 计算连续打卡天数
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

  // 加载情绪模式
  async loadEmotionPattern() {
    const db = wx.cloud.database();
    
    try {
      const { data: emotions } = await db.collection('emotions')
        .orderBy('createdAt', 'desc')
        .limit(100)
        .get();
      
      if (emotions.length > 0) {
        const weatherCount = { sunny: 0, partly_cloudy: 0, cloudy: 0, rainy: 0, storm: 0, snow: 0 };
        const tagCount = {};
        
        emotions.forEach(item => {
          if (item.weather && weatherCount[item.weather] !== undefined) {
            weatherCount[item.weather]++;
          }
          if (item.tags && item.tags.length > 0) {
            item.tags.forEach(tag => {
              tagCount[tag] = (tagCount[tag] || 0) + 1;
            });
          }
        });

        const total = emotions.length;
        const weeklyDistribution = [
          { weather: 'sunny', name: '晴', icon: '☀️', count: weatherCount.sunny, percentage: Math.round(weatherCount.sunny / total * 100) },
          { weather: 'partly_cloudy', name: '多云', icon: '⛅', count: weatherCount.partly_cloudy, percentage: Math.round(weatherCount.partly_cloudy / total * 100) },
          { weather: 'cloudy', name: '阴', icon: '☁️', count: weatherCount.cloudy, percentage: Math.round(weatherCount.cloudy / total * 100) },
          { weather: 'rainy', name: '雨', icon: '🌧️', count: weatherCount.rainy, percentage: Math.round(weatherCount.rainy / total * 100) },
          { weather: 'storm', name: '雷暴', icon: '⛈️', count: weatherCount.storm, percentage: Math.round(weatherCount.storm / total * 100) },
          { weather: 'snow', name: '雪', icon: '❄️', count: weatherCount.snow, percentage: Math.round(weatherCount.snow / total * 100) }
        ].sort((a, b) => b.count - a.count);

        const commonTags = Object.entries(tagCount)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(item => item[0]);

        const commonEmotions = weeklyDistribution
          .filter(item => item.count > 0)
          .map(item => `${item.name}(${item.count})`)
          .join(', ') || '暂无数据';

        this.setData({
          emotionPattern: {
            commonEmotions,
            commonTags: commonTags.join(', ') || '暂无数据',
            weeklyDistribution
          }
        });
      }
    } catch (error) {
      console.error('加载情绪模式失败:', error);
    }
  },

  // 导出数据
  async exportData() {
    wx.showLoading({ title: '正在导出...' });
    
    try {
      const res = await wx.cloud.callFunction({
        name: 'exportData',
        data: {}
      });
      
      wx.hideLoading();
      
      if (res.result.success) {
        wx.showModal({
          title: '导出成功',
          content: `共导出 ${res.result.count} 条记录\n\n请复制链接在浏览器中下载：\n${res.result.fileUrl}`,
          showCancel: true,
          confirmText: '复制链接',
          success: (modalRes) => {
            if (modalRes.confirm) {
              wx.setClipboardData({
                data: res.result.fileUrl,
                success: () => {
                  wx.showToast({ title: '链接已复制', icon: 'success' });
                }
              });
            }
          }
        });
      } else {
        // 降级方案：本地生成CSV
        this.exportDataLocally();
      }
    } catch (error) {
      wx.hideLoading();
      console.error('导出数据失败:', error);
      // 降级方案：本地生成CSV
      this.exportDataLocally();
    }
  },

  // 本地导出数据（降级方案）
  async exportDataLocally() {
    const db = wx.cloud.database();
    
    try {
      const { data } = await db.collection('emotions')
        .orderBy('createdAt', 'desc')
        .get();
      
      if (data.length === 0) {
        wx.showToast({ title: '暂无数据可导出', icon: 'none' });
        return;
      }
      
      let csvContent = '日期,天气,强度,日记,标签,情绪类型,AI回复,建议\n';
      
      data.forEach(item => {
        const tags = item.tags ? item.tags.join(';') : '';
        const diary = (item.diary || '').replace(/"/g, '""');
        const aiReply = (item.aiAnalysis?.aiReply || '').replace(/"/g, '""');
        const suggestion = (item.aiAnalysis?.suggestion || '').replace(/"/g, '""');
        
        csvContent += `${item.date},${item.weather},${item.intensity},"${diary}","${tags}","${item.aiAnalysis?.emotionType || ''}","${aiReply}","${suggestion}"\n`;
      });
      
      wx.setStorageSync('exportedData', csvContent);
      
      wx.showModal({
        title: '导出成功',
        content: `共导出 ${data.length} 条记录\n\n数据已保存到本地存储`,
        showCancel: false
      });
    } catch (error) {
      console.error('本地导出失败:', error);
      wx.showToast({ title: '导出失败', icon: 'none' });
    }
  },

  // 设置提醒
  setReminder() {
    wx.showActionSheet({
      itemList: ['订阅每日提醒', '取消订阅'],
      success: (res) => {
        if (res.tapIndex === 0) {
          // 订阅每日提醒
          wx.requestSubscribeMessage({
            tmplIds: ['请替换为你的模板ID'],
            success: (res) => {
              console.log('订阅成功:', res);
              wx.setStorageSync('reminderEnabled', true);
              wx.showToast({ title: '订阅成功', icon: 'success' });
            },
            fail: (err) => {
              console.error('订阅失败:', err);
              // 使用本地提醒作为降级方案
              this.setLocalReminder();
            }
          });
        } else if (res.tapIndex === 1) {
          wx.setStorageSync('reminderEnabled', false);
          wx.showToast({ title: '已取消订阅', icon: 'success' });
        }
      }
    });
  },

  // 设置本地提醒（降级方案）
  setLocalReminder() {
    wx.showModal({
      title: '设置提醒时间',
      content: '请选择每日提醒时间',
      showCancel: true,
      confirmText: '选择时间',
      success: (res) => {
        if (res.confirm) {
          wx.showToast({ 
            title: '已开启本地提醒\n记得每天打开小程序哦~', 
            icon: 'none',
            duration: 2000
          });
          wx.setStorageSync('reminderEnabled', true);
        }
      }
    });
  },

  // 关于我们
  about() {
    wx.showModal({
      title: '关于情绪气象台',
      content: '情绪气象台是一个用天气隐喻记录情绪的小程序，AI做你的专属气象员。\n\n版本：v1.0.0\n开发者：周淑儿',
      showCancel: false
    });
  },

  // 反馈建议
  feedback() {
    wx.showModal({
      title: '反馈建议',
      editable: true,
      placeholderText: '请输入您的反馈或建议...',
      success: async (res) => {
        if (res.confirm && res.content) {
          const db = wx.cloud.database();
          const userInfo = this.data.userInfo;
          
          try {
            await db.collection('feedback').add({
              data: {
                content: res.content,
                nickName: userInfo.nickName || '匿名用户',
                avatarUrl: userInfo.avatarUrl || '',
                createdAt: db.serverDate()
              }
            });
            
            wx.showToast({ title: '感谢您的反馈！', icon: 'success' });
          } catch (error) {
            console.error('提交反馈失败:', error);
            // 降级方案：保存到本地存储
            const feedbacks = wx.getStorageSync('feedbacks') || [];
            feedbacks.push({
              content: res.content,
              nickName: userInfo.nickName || '匿名用户',
              avatarUrl: userInfo.avatarUrl || '',
              createdAt: new Date().toISOString()
            });
            wx.setStorageSync('feedbacks', feedbacks);
            wx.showToast({ title: '反馈已保存，稍后会提交', icon: 'success' });
          }
        }
      }
    });
  },

  // 选择头像
  onChooseAvatar(e) {
    const { avatarUrl } = e.detail;
    const openid = wx.getStorageSync('openid') || '';
    const userInfo = { ...this.data.userInfo, avatarUrl, openid };
    wx.setStorageSync('userInfo', userInfo);
    this.setData({ userInfo });
    wx.showToast({ title: '头像已更新', icon: 'success' });
  },

  // 昵称输入
  onNicknameInput(e) {
    const userInfo = { ...this.data.userInfo, nickName: e.detail.value };
    this.setData({ userInfo });
  },

  // 昵称输入完成
  onNicknameBlur(e) {
    const nickName = e.detail.value;
    if (nickName && nickName.trim()) {
      const openid = wx.getStorageSync('openid') || '';
      const userInfo = { ...this.data.userInfo, nickName: nickName.trim(), openid };
      wx.setStorageSync('userInfo', userInfo);
      this.setData({ userInfo });
    }
  }
});