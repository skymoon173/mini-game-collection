// test-fix.js - 测试修复效果的脚本
// 在微信开发者工具控制台中运行此脚本

function testFixes() {
  console.log('=== 数独小程序修复测试 ===');

  const page = getCurrentPages()[0];
  if (!page) {
    console.error('❌ 无法获取页面实例');
    return;
  }

  console.log('✅ 页面实例获取成功');

  // 测试1：检查网格初始化
  console.log('\n=== 网格初始化测试 ===');
  const cells = page.data.cells;
  if (cells && cells.length === 81) {
    console.log('✅ 网格单元格数量正确 (81个)');

    // 检查是否有非零值
    const nonZeroCells = cells.filter(cell => cell.value && cell.value !== '0' && cell.value !== '');
    console.log(`📊 非零单元格数量: ${nonZeroCells.length}`);

    if (nonZeroCells.length > 0) {
      console.log('✅ 谜题已正确生成');
      console.log('示例单元格值:', nonZeroCells.slice(0, 5).map(cell => cell.value));
    } else {
      console.log('❌ 谜题生成失败，所有单元格都是0');
    }

    // 检查只读单元格
    const readonlyCells = cells.filter(cell => cell.isReadonly);
    console.log(`🔒 只读单元格数量: ${readonlyCells.length}`);

  } else {
    console.log('❌ 网格初始化失败');
  }

  // 测试2：检查对比度修复
  console.log('\n=== 对比度修复测试 ===');
  // 这里无法直接测试CSS，但可以检查相关的样式类是否存在
  console.log('ℹ️ 请检查网格边框是否为黑色(#000)，背景是否为深色(#1a1a1a)');

  // 测试3：检查数据一致性
  console.log('\n=== 数据一致性测试 ===');
  if (page.board && Array.isArray(page.board) && page.board.length === 9) {
    console.log('✅ 游戏板数据存在');

    let totalNonZero = 0;
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        if (page.board[row][col] !== 0) {
          totalNonZero++;
        }
      }
    }
    console.log(`📊 游戏板非零数字: ${totalNonZero}`);

  } else {
    console.log('❌ 游戏板数据异常');
  }

  // 测试4：检查难度设置
  console.log('\n=== 难度设置测试 ===');
  console.log('当前难度:', page.data.difficulty);
  console.log('难度索引:', page.data.difficultyIndex);
  console.log('难度选项:', page.data.difficultyOptions);

  const holesExpected = page.getHolesForDifficulty();
  console.log(`预期的空洞数量 (${page.data.difficulty}): ${holesExpected}`);

  // 计算实际空洞数量
  if (page.board) {
    let actualHoles = 0;
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        if (page.board[row][col] === 0) {
          actualHoles++;
        }
      }
    }
    console.log(`实际空洞数量: ${actualHoles}`);
  }

  console.log('\n=== 测试完成 ===');
  console.log('如果看到大量 ✅ 表示修复成功');
  console.log('如果仍有问题，请查看控制台错误信息');

  // 显示测试结果摘要
  const summary = {
    gridInitialized: cells && cells.length === 81,
    puzzleGenerated: cells && cells.some(cell => cell.value && cell.value !== '0'),
    readonlyCells: cells && cells.some(cell => cell.isReadonly),
    boardData: page.board && page.board.length === 9
  };

  const successCount = Object.values(summary).filter(Boolean).length;
  const totalTests = Object.keys(summary).length;

  wx.showModal({
    title: '修复测试结果',
    content: `测试通过: ${successCount}/${totalTests}\n\n网格初始化: ${summary.gridInitialized ? '✅' : '❌'}\n谜题生成: ${summary.puzzleGenerated ? '✅' : '❌'}\n只读单元格: ${summary.readonlyCells ? '✅' : '❌'}\n游戏板数据: ${summary.boardData ? '✅' : '❌'}`,
    showCancel: false
  });
}

// 自动运行测试
if (typeof getCurrentPages === 'function') {
  setTimeout(() => {
    testFixes();
  }, 2000);
} else {
  console.log('请在微信小程序环境中运行此测试脚本');
}

// 导出测试函数
window.testFixes = testFixes;
