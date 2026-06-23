const cloud = require('wx-server-sdk');

cloud.init();

exports.main = async (event, context) => {
  try {
    // 直接从上下文获取openid
    const openid = cloud.getWXContext().OPENID;
    
    return {
      openid: openid,
      appid: cloud.getWXContext().APPID
    };
  } catch (error) {
    console.error('登录失败:', error);
    return {
      error: error.message
    };
  }
};