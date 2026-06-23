Page({
  data: {
    posts: [],
    isLoading: false,
    hasMore: true,
    lastTime: null,
    expandedComments: null,
    commentInputs: {},
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
    this.loadPosts();
  },

  onShow() {
    // 刷新数据
    this.setData({ posts: [], lastTime: null, hasMore: true });
    this.loadPosts();
  },

  // 加载帖子
  async loadPosts() {
    if (this.data.isLoading) return;
    
    this.setData({ isLoading: true });
    
    const db = wx.cloud.database();
    const limit = 20;
    
    try {
      let query = db.collection('treehole')
        .orderBy('createdAt', 'desc')
        .limit(limit);
      
      // 分页加载
      if (this.data.lastTime) {
        query = query.where({
          createdAt: db.command.lt(this.data.lastTime)
        });
      }
      
      const { data } = await query.get();
      
      // 处理数据
      const processedPosts = data.map(post => {
        const weatherType = this.data.weatherTypes.find(item => item.type === post.weather);
        const comments = post.comments || [];
        return {
          ...post,
          weatherIcon: weatherType ? weatherType.icon : '☁️',
          weatherName: weatherType ? weatherType.name : '未知',
          formattedDate: this.formatDate(post.createdAt),
          commentCount: comments.length
        };
      });
      
      // 更新数据
      this.setData({
        posts: [...this.data.posts, ...processedPosts],
        hasMore: processedPosts.length === limit,
        lastTime: data.length > 0 ? data[data.length - 1].createdAt : null,
        isLoading: false
      });
    } catch (error) {
      console.error('加载帖子失败:', error);
      this.setData({ isLoading: false });
    }
  },

  // 加载更多
  loadMore() {
    if (this.data.hasMore && !this.data.isLoading) {
      this.loadPosts();
    }
  },

  // 送阳光（点赞）
  async giveSunshine(e) {
    const id = e.currentTarget.dataset.id;
    const db = wx.cloud.database();
    
    try {
      await db.collection('treehole').doc(id).update({
        data: { likes: db.command.inc(1) }
      });

      // 本地更新
      const posts = this.data.posts.map(post => {
        if (post._id === id) post.likes++;
        return post;
      });
      this.setData({ posts });
      
      wx.showToast({ title: '☀️ 已送达', icon: 'none' });
    } catch (error) {
      console.error('点赞失败:', error);
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  // 获取评论输入框的值
  getCommentInput(id) {
    const post = this.data.posts.find(p => p._id === id);
    return post ? (post.tempComment || '') : '';
  },

  // 格式化日期
  formatDate(date) {
    if (!date) return '';
    
    const d = new Date(date);
    const year = d.getFullYear();
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  },

  // 切换评论区展开/收起
  toggleComments(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({
      expandedComments: this.data.expandedComments === id ? null : id
    });
  },

  // 评论输入
  onCommentInput(e) {
    const id = e.currentTarget.dataset.id;
    const value = e.detail.value;
    const posts = this.data.posts.map(post => {
      if (post._id === id) {
        post.tempComment = value;
      }
      return post;
    });
    this.setData({ posts });
  },

  // 提交评论
  async submitComment(e) {
    const id = e.currentTarget.dataset.id;
    const post = this.data.posts.find(p => p._id === id);
    const content = post ? (post.tempComment || '') : '';
    
    if (!content.trim()) {
      wx.showToast({ title: '请输入评论内容', icon: 'none' });
      return;
    }
    
    const db = wx.cloud.database();
    
    try {
      await db.collection('treehole').doc(id).update({
        data: {
          comments: db.command.push({
            content: content.trim(),
            time: this.formatDate(new Date())
          })
        }
      });
      
      // 本地更新
      const posts = this.data.posts.map(p => {
        if (p._id === id) {
          p.comments = p.comments || [];
          p.comments.push({
            content: content.trim(),
            time: this.formatDate(new Date())
          });
          p.commentCount = p.comments.length;
          p.tempComment = '';  // 清空输入框
        }
        return p;
      });
      
      this.setData({ posts });
      wx.showToast({ title: '💝 评论成功', icon: 'none' });
    } catch (error) {
      console.error('评论失败:', error);
      wx.showToast({ title: '评论失败', icon: 'none' });
    }
  }
});