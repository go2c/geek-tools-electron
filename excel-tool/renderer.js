// 全局变量
let selectedFilePath = null;
let currentOperation = 'merge';
let excelHeaders = [];

// DOM 元素
const backBtn = document.getElementById('backBtn');
const selectFileBtn = document.getElementById('selectFileBtn');
const fileName = document.getElementById('fileName');
const operationCards = document.querySelectorAll('.operation-card');
const columnsSection = document.getElementById('columnsSection');
const columnsTitle = document.getElementById('columnsTitle');
const columnsGrid = document.getElementById('columnsGrid');
const selectAllBtn = document.getElementById('selectAllBtn');
const clearAllBtn = document.getElementById('clearAllBtn');
const processBtn = document.getElementById('processBtn');
const statusSection = document.getElementById('statusSection');
const statusInfo = document.getElementById('statusInfo');

// 操作类型标题映射
const operationTitles = {
    merge: '选择需要合并的列',
    unmerge: '选择需要取消合并的列',
    stats: '选择分组统计的列'
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    bindEvents();
});

// 绑定事件
function bindEvents() {
    // 返回按钮
    backBtn.addEventListener('click', () => {
        window.electronAPI.navigateTo('home');
    });
    
    // 文件选择
    selectFileBtn.addEventListener('click', handleFileSelect);
    
    // 操作类型切换
    operationCards.forEach(card => {
        card.addEventListener('click', () => {
            switchOperation(card.dataset.operation);
        });
    });
    
    // 列选择操作
    selectAllBtn.addEventListener('click', selectAllColumns);
    clearAllBtn.addEventListener('click', clearAllColumns);
    
    // 处理按钮
    processBtn.addEventListener('click', handleProcess);
}

// 处理文件选择
async function handleFileSelect() {
    try {
        const filePath = await window.electronAPI.openFileDialog();
        
        if (filePath) {
            selectedFilePath = filePath;
            fileName.textContent = filePath.split('\\').pop().split('/').pop();
            fileName.style.color = '#333';
            fileName.style.fontWeight = '500';
            
            // 读取Excel文件的列名
            await loadExcelHeaders(filePath);
            
            // 更新处理按钮状态
            updateProcessButton();
        }
    } catch (error) {
        console.error('选择文件失败：', error);
        showStatus('error', '选择文件失败', error.message);
    }
}

// 加载Excel文件的列名
async function loadExcelHeaders(filePath) {
    try {
        const result = await window.electronAPI.getExcelHeaders(filePath);
        
        if (result.success) {
            excelHeaders = result.headers;
            renderColumnCheckboxes();
        } else {
            showStatus('error', '读取Excel文件失败', result.message);
        }
    } catch (error) {
        console.error('读取Excel文件失败：', error);
        showStatus('error', '读取Excel文件失败', error.message);
    }
}

// 渲染列复选框
function renderColumnCheckboxes() {
    columnsGrid.innerHTML = '';
    
    excelHeaders.forEach((header, index) => {
        const checkbox = document.createElement('div');
        checkbox.className = 'column-checkbox';
        checkbox.innerHTML = `
            <input type="checkbox" id="col-${index}" value="${header}">
            <label for="col-${index}">${header}</label>
        `;
        columnsGrid.appendChild(checkbox);
    });
    
    // 绑定复选框变化事件
    const checkboxes = columnsGrid.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => {
        cb.addEventListener('change', updateProcessButton);
    });
}

// 切换操作类型
function switchOperation(operation) {
    currentOperation = operation;
    
    // 更新卡片状态
    operationCards.forEach(card => {
        if (card.dataset.operation === operation) {
            card.classList.add('active');
        } else {
            card.classList.remove('active');
        }
    });
    
    // 更新列选择区域标题
    columnsTitle.textContent = operationTitles[operation];
    
    // 显示列选择区域
    columnsSection.classList.add('active');
    
    // 更新处理按钮状态
    updateProcessButton();
}

// 全选列
function selectAllColumns() {
    const checkboxes = columnsGrid.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => {
        cb.checked = true;
    });
    updateProcessButton();
}

// 清空列选择
function clearAllColumns() {
    const checkboxes = columnsGrid.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => {
        cb.checked = false;
    });
    updateProcessButton();
}

// 更新处理按钮状态
function updateProcessButton() {
    const selectedColumns = getSelectedColumns();
    const hasFile = selectedFilePath !== null;
    const hasColumns = selectedColumns.length > 0;
    
    processBtn.disabled = !hasFile || !hasColumns;
}

// 获取选中的列
function getSelectedColumns() {
    const checkboxes = columnsGrid.querySelectorAll('input[type="checkbox"]:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

// 处理Excel
async function handleProcess() {
    if (!selectedFilePath) {
        showStatus('error', '错误', '请先选择Excel文件');
        return;
    }
    
    const selectedColumns = getSelectedColumns();
    if (selectedColumns.length === 0) {
        showStatus('error', '错误', '请至少选择一列');
        return;
    }
    
    // 禁用按钮，显示加载状态
    processBtn.disabled = true;
    processBtn.innerHTML = '<span class="spinner"></span> 处理中...';
    
    showStatus('loading', '处理中', '正在处理Excel文件，请稍候...');
    
    try {
        const result = await window.electronAPI.processExcel(
            selectedFilePath,
            currentOperation,
            selectedColumns
        );
        
        if (result.success) {
            showStatus('success', '处理完成', result.message, result.filePath);
        } else {
            showStatus('error', '处理失败', result.message);
        }
    } catch (error) {
        console.error('处理失败：', error);
        showStatus('error', '处理失败', error.message);
    } finally {
        // 恢复按钮状态
        processBtn.disabled = false;
        processBtn.innerHTML = '<span>⚡</span> 开始处理';
        updateProcessButton();
    }
}

// 显示状态
function showStatus(type, title, message, filePath = null) {
    statusSection.classList.add('active');
    
    let icon = '';
    let details = message;
    
    if (type === 'loading') {
        icon = '<div class="spinner"></div>';
        statusInfo.className = 'status-info loading';
    } else if (type === 'success') {
        icon = '✅';
        statusInfo.className = 'status-info success';
    } else if (type === 'error') {
        icon = '❌';
        statusInfo.className = 'status-info error';
    }
    
    let fileDetails = '';
    if (filePath) {
        fileDetails = `<div class="file-path">${filePath}</div>`;
    }
    
    statusInfo.innerHTML = `
        <div class="status-icon">${icon}</div>
        <div class="status-text">
            <strong>${title}</strong>
            ${details}
            ${fileDetails}
        </div>
    `;
}
