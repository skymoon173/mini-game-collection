// validate.js - 小程序配置验证脚本
// 在微信开发者工具控制台中运行此脚本验证配置

function validateMiniProgram() {
  console.log('=== 微信小程序配置验证 ===');

  // 检查 app.json
  try {
    const appConfig = require('./app.json');
    console.log('✅ app.json 加载成功');

    // 检查页面配置
    if (appConfig.pages && appConfig.pages.length > 0) {
      console.log('✅ 页面配置正确');
    } else {
      console.log('❌ 页面配置缺失');
    }

    // 检查是否移除了tabBar（因为只有一个页面）
    if (!appConfig.tabBar) {
      console.log('✅ tabBar 已正确移除');
    } else {
      console.log('⚠️  tabBar 配置存在，但只有一个页面');
    }

    // 检查窗口配置
    if (appConfig.window) {
      console.log('✅ 窗口配置存在');
    }

  } catch (error) {
    console.error('❌ app.json 验证失败:', error);
  }

  // 检查项目文件
  const requiredFiles = [
    'app.js',
    'app.json',
    'app.wxss',
    'pages/index/index.js',
    'pages/index/index.wxml',
    'pages/index/index.wxss',
    'pages/index/index.json',
    'project.config.json'
  ];

  console.log('\n=== 文件存在性检查 ===');
  requiredFiles.forEach(file => {
    // 这里无法直接检查文件存在性，但可以在控制台中手动验证
    console.log(`需要检查文件: ${file}`);
  });

  // 检查当前页面
  const pages = getCurrentPages();
  if (pages.length > 0) {
    const currentPage = pages[0];
    console.log('\n=== 页面状态检查 ===');
    console.log('✅ 页面已加载');
    console.log('页面路径:', currentPage.route);
    console.log('页面数据项数量:', Object.keys(currentPage.data).length);

    // 检查关键数据
    if (currentPage.data.cells && currentPage.data.cells.length === 81) {
      console.log('✅ 网格数据正确 (81个单元格)');
    } else {
      console.log('❌ 网格数据异常');
    }

    // 检查关键方法
    const requiredMethods = ['startNewGame', 'setDifficulty', 'setMode', 'validateBoard'];
    const missingMethods = requiredMethods.filter(method => typeof currentPage[method] !== 'function');

    if (missingMethods.length === 0) {
      console.log('✅ 核心方法都存在');
    } else {
      console.log('❌ 缺少方法:', missingMethods.join(', '));
    }

  } else {
    console.log('❌ 页面未加载');
  }

  console.log('\n=== 验证完成 ===');
  console.log('如果看到大量 ✅ 表示配置正确');
  console.log('如果看到 ❌ 请检查相关配置');
  console.log('\n=== 调试建议 ===');
  console.log('1. 在微信开发者工具中点击"编译"');
  console.log('2. 检查控制台是否有错误信息');
  console.log('3. 使用调试按钮测试功能');
  console.log('4. 在不同模拟器中测试显示效果');
}

// 自动运行验证
if (typeof getCurrentPages === 'function') {
  setTimeout(() => {
    validateMiniProgram();
  }, 1000);
} else {
  console.log('请在微信小程序环境中运行此验证脚本');
}

// 导出验证函数
window.validateMiniProgram = validateMiniProgram;
