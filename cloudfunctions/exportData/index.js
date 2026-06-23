// 云函数：导出数据
const cloud = require('wx-server-sdk');
cloud.init();

const db = cloud.database();

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  
  try {
    // 查询用户的情绪记录
    const { data } = await db.collection('emotions')
      .orderBy('createdAt', 'desc')
      .limit(1000)
      .get();
    
    if (data.length === 0) {
      return {
        success: false,
        message: '暂无数据可导出'
      };
    }
    
    // 转换为CSV格式
    let csvContent = '日期,天气,强度,日记,标签,情绪类型,压力源,AI回复,建议\n';
    
    data.forEach(item => {
      const tags = item.tags ? item.tags.join(';') : '';
      const stressors = item.aiAnalysis?.keyStressors ? item.aiAnalysis.keyStressors.join(';') : '';
      // 处理CSV中的引号
      const diary = (item.diary || '').replace(/"/g, '""');
      const aiReply = (item.aiAnalysis?.aiReply || '').replace(/"/g, '""');
      const suggestion = (item.aiAnalysis?.suggestion || '').replace(/"/g, '""');
      
      csvContent += `${item.date},${item.weather},${item.intensity},"${diary}","${tags}","${item.aiAnalysis?.emotionType || ''}","${stressors}","${aiReply}","${suggestion}"\n`;
    });
    
    // 上传到云存储
    const timestamp = new Date().getTime();
    const fileName = `情绪记录_${timestamp}.csv`;
    
    const uploadRes = await cloud.uploadFile({
      cloudPath: `exports/${OPENID}/${fileName}`,
      fileContent: Buffer.from(csvContent, 'utf8')
    });
    
    // 获取下载链接
    const downloadRes = await cloud.getTempFileURL({
      fileList: [uploadRes.fileID]
    });
    
    return {
      success: true,
      count: data.length,
      fileUrl: downloadRes.fileList[0].tempFileURL,
      fileID: uploadRes.fileID
    };
    
  } catch (error) {
    console.error('导出数据失败:', error);
    return {
      success: false,
      message: '导出失败: ' + error.message
    };
  }
};
