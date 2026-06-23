const cloud = require('wx-server-sdk');

cloud.init();

exports.main = async (event, context) => {
  const { openid } = event;
  const db = cloud.database();
  
  try {
    // 获取用户当前记录
    const { data: userProfile } = await db.collection('user_profiles')
      .where({ _openid: openid })
      .get();
    
    // 获取用户所有情绪记录
    const { data: emotions } = await db.collection('emotions')
      .where({ _openid: openid })
      .orderBy('date', 'desc')
      .get();
    
    // 计算连续打卡天数
    let streakDays = 0;
    if (emotions.length > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // 将所有日期存入Set便于查找
      const dates = new Set();
      emotions.forEach(item => {
        if (item.date) {
          const date = new Date(item.date);
          date.setHours(0, 0, 0, 0);
          dates.add(date.getTime());
        }
      });
      
      // 从今天开始向前检查连续天数
      const checkDate = new Date(today);
      while (dates.has(checkDate.getTime())) {
        streakDays++;
        checkDate.setDate(checkDate.getDate() - 1);
      }
    }
    
    // 计算总记录数
    const totalRecords = emotions.length;
    
    // 计算最近记录日期
    const lastRecordDate = emotions.length > 0 ? emotions[0].date : null;
    
    // 计算情绪模式
    const emotionPattern = {
      weeklyAvg: {
        sunny: 0, partly_cloudy: 0, cloudy: 0, rainy: 0, storm: 0, snow: 0
      },
      commonTags: [],
      copingStrategies: []
    };
    
    // 统计最近30天的情绪分布
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentEmotions = emotions.filter(item => {
      const itemDate = new Date(item.date);
      return itemDate >= thirtyDaysAgo;
    });
    
    recentEmotions.forEach(item => {
      if (emotionPattern.weeklyAvg[item.weather]) {
        emotionPattern.weeklyAvg[item.weather]++;
      }
      
      // 统计标签
      if (item.tags && item.tags.length > 0) {
        item.tags.forEach(tag => {
          const existingTag = emotionPattern.commonTags.find(t => t.tag === tag);
          if (existingTag) {
            existingTag.count++;
          } else {
            emotionPattern.commonTags.push({ tag, count: 1 });
          }
        });
      }
    });
    
    // 排序标签，取前5个
    emotionPattern.commonTags.sort((a, b) => b.count - a.count);
    emotionPattern.commonTags = emotionPattern.commonTags.slice(0, 5).map(item => item.tag);
    
    // 更新或创建用户画像
    if (userProfile.length > 0) {
      await db.collection('user_profiles').doc(userProfile[0]._id).update({
        data: {
          streakDays,
          totalRecords,
          lastRecordDate,
          emotionPattern,
          updatedAt: db.serverDate()
        }
      });
    } else {
      await db.collection('user_profiles').add({
        data: {
          _openid: openid,
          streakDays,
          totalRecords,
          lastRecordDate,
          emotionPattern,
          createdAt: db.serverDate(),
          updatedAt: db.serverDate()
        }
      });
    }
    
    return {
      success: true,
      data: {
        streakDays,
        totalRecords,
        lastRecordDate
      }
    };
    
  } catch (error) {
    console.error('更新统计失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
};