// test.js - 小程序功能测试脚本
// 在微信开发者工具控制台中运行此脚本进行基本功能测试

function runTests() {
  console.log('=== 数独小程序功能测试开始 ===');

  const page = getCurrentPages()[0];
  if (!page) {
    console.error('❌ 无法获取页面实例');
    return;
  }

  console.log('✅ 页面实例获取成功');

  // 测试1：数据初始化
  console.log('测试1：数据初始化');
  try {
    if (page.data.cells && page.data.cells.length === 81) {
      console.log('✅ 网格数据初始化成功');
    } else {
      console.log('❌ 网格数据初始化失败');
    }
  } catch (error) {
    console.error('❌ 数据初始化测试失败:', error);
  }

  // 测试2：游戏逻辑
  console.log('测试2：游戏逻辑');
  try {
    if (typeof page.generatePuzzle === 'function') {
      console.log('✅ 谜题生成函数存在');
    } else {
      console.log('❌ 谜题生成函数缺失');
    }

    if (typeof page.isValid === 'function') {
      console.log('✅ 验证函数存在');
    } else {
      console.log('❌ 验证函数缺失');
    }
  } catch (error) {
    console.error('❌ 游戏逻辑测试失败:', error);
  }

  // 测试3：UI交互
  console.log('测试3：UI交互');
  try {
    if (page.setDifficulty && page.setMode && page.startNewGame) {
      console.log('✅ UI交互函数存在');
    } else {
      console.log('❌ UI交互函数缺失');
    }
  } catch (error) {
    console.error('❌ UI交互测试失败:', error);
  }

  // 测试4：存储功能
  console.log('测试4：存储功能');
  try {
    // 测试设置存储
    wx.setStorageSync('test_key', 'test_value');
    const value = wx.getStorageSync('test_key');
    if (value === 'test_value') {
      console.log('✅ 存储功能正常');
      wx.removeStorageSync('test_key');
    } else {
      console.log('❌ 存储功能异常');
    }
  } catch (error) {
    console.error('❌ 存储测试失败:', error);
  }

  console.log('=== 测试完成 ===');
  console.log('如果看到大量 ✅ 表示功能正常');
  console.log('如果看到 ❌ 请检查相关代码');
}

// 自动运行测试
if (typeof getCurrentPages === 'function') {
  // 确保页面已加载
  setTimeout(() => {
    runTests();
  }, 2000);
} else {
  console.log('请在微信小程序环境中运行此测试脚本');
}

// 导出测试函数供手动调用
window.runSudokuTests = runTests;

