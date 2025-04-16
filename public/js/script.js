let currentPath = '';

document.addEventListener('DOMContentLoaded', loadFiles);

// 修改 loadFiles 函数
let isLoading = false;
let warehouse = ""

async function loadFiles(path = '') {
    if (isLoading) return;  // 如果当前正在加载，则不做重复请求

    isLoading = true;  // 标记为正在加载

    try {
        // 确保path是字符串且不包含特殊字符
        if (typeof path !== 'string') {
            path = currentPath;
        }
        
        // 清理路径中的非法字符
        path = path.replace(/[<>:"|?*]/g, ''); // 删除非法文件路径字符（Windows）
        
        const res = await fetch(`/files?path=${encodeURIComponent(path)}`);

        if (!res.ok) throw new Error(await res.text());
        
        const data = await res.json();
        currentPath = data.path
        warehouse = data.warehouse

        updateBreadcrumb(data.path);
        renderFiles(data.files);
    } catch (err) {
        console.error('加载文件失败:', err);
        alert('加载文件失败: ' + err.message);
    } finally {
        isLoading = false;  // 加载完成后恢复标志
    }
}


// 修改 updateBreadcrumb 函数
function updateBreadcrumb(path) {
    const parts = path.split('/').filter(p => p);
    let breadcrumb = '<ol class="breadcrumb">';
    breadcrumb += '<li class="breadcrumb-item"><a href="#" data-path="">根目录</a></li>';
    
    let current = '';
    parts.forEach((part, index) => {
        current += `${part}/`;
        const isLast = index === parts.length - 1;
        breadcrumb += `<li class="breadcrumb-item ${isLast ? 'active' : ''}">`;
        if (!isLast) {
            breadcrumb += `<a href="#" data-path="${current.slice(0, -1)}">${part}</a>`;
        } else {
            breadcrumb += part;
        }
        breadcrumb += '</li>';
    });
    
    breadcrumb += '</ol>';
    document.getElementById('breadcrumb').innerHTML = breadcrumb;
}

// 添加事件委托处理面包屑点击
document.getElementById('breadcrumb').addEventListener('click', (e) => {
    if (e.target.tagName === 'A') {
        e.preventDefault();
        const path = e.target.dataset.path;
        loadFiles(path);
    }
});

function renderFiles(files) {
    const tbody = document.getElementById('fileTable');
    tbody.innerHTML = '';
    
    files.forEach(file => {
        const tr = document.createElement('tr');
        tr.className = 'file-item';
        
        const icon = file.isDir ? 
            '<i class="fas fa-folder text-warning"></i>' : 
            '<i class="fas fa-file text-secondary"></i>';
        
        // 修改文件名显示方式 - 统一使用超链接样式
        const nameDisplay = file.isDir ? 
            `<a href="#" class="file-link" data-path="${file.path}" data-isdir="true">${file.name}</a>` :
            `<a href="#" class="file-link" data-path="${file.path}" data-isdir="false">${file.name}</a>`;
        
        tr.innerHTML = `
            <td>
                ${icon}
                ${nameDisplay}
            </td>
            <td>${file.isDir ? '文件夹' : '文件'}</td>
            <td>${new Date(file.mtime).toLocaleString()}</td>
            <td>
                <button class="btn btn-sm btn-outline-secondary rename-btn" data-path="${file.path}">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger ms-1 delete-btn" data-path="${file.path}">
                    <i class="fas fa-trash"></i>
                </button>
                <button class="btn btn-sm btn-outline-primary download-btn" data-path="${file.path}" data-isdir="${file.isDir}">
                    <i class="fas fa-download"></i>
                </button>
            </td>
        `;
        
        tbody.appendChild(tr);
    });
    
    // 使用事件委托处理文件和文件夹点击
// 修改renderFiles中的事件委托
    tbody.addEventListener('click', async (e) => {
    if (isOperating) return;
    
    const link = e.target.closest('.file-link');
    if (link) {
        e.preventDefault();
        const filePath = link.dataset.path;
        const isDir = link.dataset.isdir === 'true';
        
        if (isDir) {
            await loadFiles(filePath);
        } else {
            previewFile(filePath);
        }
        return;
    }
    
    const btn = e.target.closest('button');
    if (!btn) return;
    
    const filePath = btn.dataset.path;
    if (btn.classList.contains('rename-btn')) {
        await renameItem(filePath);
    } else if (btn.classList.contains('delete-btn')) {
        await deleteItem(filePath);
    }else if (btn.classList.contains('download-btn')) {
        await downloadItem(btn.dataset.path, btn.dataset.isdir === 'true');
    }
});
}

// 其他操作函数（新建、重命名、删除、预览等）
async function createFolder() {
    const name = prompt('输入新文件夹名称');
    if (name) {
        try {
            await fetch('/mkdir', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: currentPath, name })
            });
            loadFiles(currentPath);
        } catch (err) {
            alert(err.message);
        }
    }
}

let isOperating = false; // 全局操作锁

async function deleteItem(filePath) {
    if (window.isOperating) return;
    
    if (confirm('确定要删除吗？')) {
        window.isOperating = true;
        try {
            const response = await fetch('/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: filePath })
            });
            
            if (!response.ok) {
                throw new Error(await response.text());
            }
            
            await loadFiles(currentPath); // 等待刷新完成
        } catch (err) {
            console.error('删除失败:', err);
            alert('删除失败: ' + err.message);
        } finally {
            window.isOperating = false;
        }
    }
}

// 提前在全局初始化
const previewModal = new bootstrap.Modal(document.getElementById('previewModal'), {
    backdrop: true,
    keyboard: true
});

const previewContent = document.getElementById('previewContent');
const saveBtn = document.getElementById('savePreviewBtn');

async function previewFile(filePath) {
    const ext = filePath.split('.').pop().toLowerCase();
    const isText = ['txt', 'js', 'py', 'html', 'css', 'json', 'md', 'yml', 'yaml', 'cpp', 'c', 'h'].includes(ext);
    const isVideo = ['mp4', 'avi', 'mov', 'mkv', 'webm'].includes(ext); // 支持的视频格式

    const encodedPath = encodeURIComponent(filePath);
    const encodedWarehouse = encodeURIComponent(warehouse);

    if (['jpg', 'jpeg', 'png', 'gif'].includes(ext)) {
        previewContent.innerHTML = `<img src="/uploads/${encodedWarehouse}/${encodedPath}" class="preview-image img-fluid">`;
        saveBtn.classList.add('d-none'); // 隐藏保存按钮
    } else if (isText) {
        const res = await fetch(`/uploads/${encodedWarehouse}/${encodedPath}`);
        const text = await res.text();

        // 使用 textarea 显示文本
        previewContent.innerHTML = `
            <textarea id="editableText" class="form-control w-100 h-100" style="min-height: 60vh; white-space: pre; font-family: monospace;">${escapeHtml(text)}</textarea>
        `;
        saveBtn.classList.remove('d-none');

        // 保存时绑定事件
        saveBtn.onclick = async () => {
            const newText = document.getElementById('editableText').value;

            const response = await fetch(`/save/${encodedWarehouse}/${encodedPath}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ content: newText })
            });

            if (response.ok) {
                alert('保存成功！');
            } else {
                alert('保存失败！');
            }
        };
    } else if (isVideo) {
        // 如果是视频文件，使用 video 标签进行预览
        previewContent.innerHTML = `
            <video controls class="w-100" style="max-height: 80vh;">
                <source src="/uploads/${encodedWarehouse}/${encodedPath}" type="video/${ext}">
                您的浏览器不支持 HTML5 视频标签。
            </video>
        `;
        saveBtn.classList.add('d-none'); // 隐藏保存按钮，因为视频不需要编辑
    } else {
        previewContent.innerHTML = '不支持预览此文件类型';
        saveBtn.classList.add('d-none');
    }

    previewModal.show();
}



document.getElementById('previewModal').addEventListener('hidden.bs.modal', function () {
    document.getElementById('previewContent').innerHTML = '';
});


function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// 上传功能
function uploadFile() {
    document.getElementById('fileInput').click();
}


// 添加上传文件函数
// 上传状态跟踪变量
let uploadStartTime;
let lastLoaded = 0;
let lastTime = 0;
let speedSamples = [];

async function uploadFiles(files, targetPath = '') {
    // 显示进度条
    const progressContainer = document.getElementById('uploadProgressContainer');
    const progressBar = document.getElementById('uploadProgressBar');
    const percentageText = document.getElementById('uploadPercentage');
    const fileNameText = document.getElementById('uploadFileName');
    const speedText = document.getElementById('uploadSpeed');
    const timeRemainingText = document.getElementById('uploadTimeRemaining');
    
    // 如果是多文件上传，显示第一个文件名
    fileNameText.textContent = `正在上传: ${files.length > 1 ? `${files.length}个文件` : files[0].name}`;
    progressContainer.style.display = 'block';
    
    const formData = new FormData();
    let pathDict = {};
    
    // 添加所有文件
    Array.from(files).forEach(file => {
        let relativePath = file.webkitRelativePath || '/';
        relativePath = relativePath.split('/').slice(0, -1).join('/') || '/';
        pathDict[encodeURIComponent(file.name)] = encodeURIComponent(relativePath);
        formData.append('files', file);
    });
    
    try {
        uploadStartTime = Date.now();
        lastLoaded = 0;
        lastTime = uploadStartTime;
        speedSamples = [];
        
        const xhr = new XMLHttpRequest();
        
        // 进度事件处理
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 100);
                progressBar.style.width = `${percent}%`;
                percentageText.textContent = `${percent}%`;
                
                // 计算上传速度
                const now = Date.now();
                const timeDiff = (now - lastTime) / 1000; // 秒
                const loadedDiff = e.loaded - lastLoaded;
                
                if (timeDiff > 0) {
                    const currentSpeed = loadedDiff / timeDiff; // 字节/秒
                    speedSamples.push(currentSpeed);
                    
                    // 保留最近5个样本
                    if (speedSamples.length > 5) {
                        speedSamples.shift();
                    }
                    
                    // 计算平均速度
                    const avgSpeed = speedSamples.reduce((a, b) => a + b, 0) / speedSamples.length;
                    const speedMB = (avgSpeed / (1024 * 1024)).toFixed(2);
                    speedText.textContent = `速度: ${speedMB} MB/s`;
                    
                    // 计算剩余时间
                    const remainingBytes = e.total - e.loaded;
                    const remainingTime = remainingBytes / avgSpeed; // 秒
                    
                    if (avgSpeed > 0) {
                        timeRemainingText.textContent = `剩余时间: ${formatTime(remainingTime)}`;
                    }
                }
                
                lastLoaded = e.loaded;
                lastTime = now;
            }
        });
        
        // 完成处理
        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                // 上传完成，延迟隐藏进度条
                setTimeout(() => {
                    progressContainer.style.display = 'none';
                    progressBar.style.width = '0%';
                    percentageText.textContent = '0%';
                }, 1000);
            }
        });
        
        // 错误处理
        xhr.addEventListener('error', () => {
            progressBar.classList.remove('progress-bar-striped', 'progress-bar-animated');
            progressBar.classList.add('bg-danger');
            percentageText.textContent = '上传失败';
        });
        
        xhr.open('POST', '/upload');
        xhr.setRequestHeader('X-Upload-Path', JSON.stringify(pathDict));
        xhr.setRequestHeader('X-Current-Path', encodeURIComponent(targetPath));
        xhr.send(formData);
        
        const response = await new Promise((resolve, reject) => {
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(JSON.parse(xhr.responseText));
                } else {
                    reject(new Error(xhr.statusText));
                }
            };
            xhr.onerror = () => reject(new Error('上传失败'));
        });
        
        if (!response.success) throw new Error(response.error || '上传失败');
        
        loadFiles(currentPath); // 刷新当前目录
        return response;
    } catch (err) {
        console.error('上传失败:', err);
        alert('上传失败: ' + err.message);
        throw err;
    } finally {
        // 上传完成后重置状态
        if (uploadStartTime && Date.now() - uploadStartTime > 1000) {
            setTimeout(() => {
                progressContainer.style.display = 'none';
            }, 2000);
        }
    }
}

// 辅助函数：格式化时间为可读格式
function formatTime(seconds) {
    if (seconds < 60) {
        return `${Math.ceil(seconds)}秒`;
    } else if (seconds < 3600) {
        return `${Math.floor(seconds / 60)}分${Math.ceil(seconds % 60)}秒`;
    } else {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours}小时${minutes}分`;
    }
}
  
  // 修改文件上传处理
  document.getElementById('fileInput').addEventListener('change', async function(e) {
    if (e.target.files.length > 0) {
      await uploadFiles(e.target.files, currentPath);
      e.target.value = ''; // 清空选择
    }
  });
  
  // 添加上传文件夹处理
  document.getElementById('folderInput').addEventListener('change', async function(e) {
    if (e.target.files.length > 0) {
      await uploadFiles(e.target.files, currentPath);
      e.target.value = ''; // 清空选择
    }
  });

  // 添加重命名函数
async function renameItem(itemPath) {
    if (window.isOperating) return;
    
    const oldName = itemPath.split('/').pop();
    const newName = prompt('输入新名称', oldName);
    
    if (newName === null || newName.trim() === oldName) {
        return; 
    }
    
    if (!newName || /[\\/:*?"<>|]/.test(newName)) {
        alert('文件名不能包含特殊字符: \\ / : * ? " < > |');
        return;
    }
    
    window.isOperating = true;
    try {
        const response = await fetch('/rename', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                oldPath: itemPath,
                newName: newName
            })
        });
        
        if (!response.ok) {
            throw new Error(await response.text());
        }
        
        await loadFiles(currentPath);
    } catch (err) {
        console.error('重命名失败:', err);
        alert('重命名失败: ' + err.message);
    } finally {
        window.isOperating = false;
    }
}

// 全局操作锁函数
async function withOperationLock(fn) {
    if (window.isOperating) return;
    window.isOperating = true;
    
    // 显示全局遮罩
    const overlay = document.createElement('div');
    overlay.className = 'operating';
    overlay.innerHTML = '<div class="spinner-border operating-spinner text-primary"></div>';
    document.body.appendChild(overlay);
    
    try {
        await fn();
    } catch (err) {
        console.error('操作失败:', err);
        alert('操作失败: ' + err.message);
    } finally {
        window.isOperating = false;
        document.body.removeChild(overlay);
    }
}



// 在文件末尾添加
document.getElementById('homeBtn').addEventListener('click', () => {
    console.log('返回首页按钮点击');
    window.location.href = '/';
});


function getBasename(fullPath) {
    return fullPath.split('/').pop() || fullPath.split('\\').pop() || 'file';
}

// 单个文件下载
async function downloadSingleFile(itemPath) {
    const iframe = document.createElement('iframe');
    iframe.src = `/download-compressed?path=${encodeURIComponent(itemPath)}`;
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    
    setTimeout(() => {
        document.body.removeChild(iframe);
    }, 5000); // 5秒后自动移除
}

// 修改后的下载函数 - 直接使用ZIP格式压缩文件夹
async function downloadItem(itemPath, isDir) {
    if (window.isOperating) return;
    window.isOperating = true;
    
    try {
        // 使用iframe下载避免弹出窗口被拦截
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        
        if (isDir) {
            // 文件夹直接使用ZIP格式下载
            iframe.src = `/download-compressed?path=${encodeURIComponent(itemPath)}&format=zip`;
        } else {
            // 单个文件直接下载
            iframe.src = `/download-compressed?path=${encodeURIComponent(itemPath)}`;
        }
        
        document.body.appendChild(iframe);
        
        // 5秒后自动移除iframe
        setTimeout(() => {
            document.body.removeChild(iframe);
            window.isOperating = false;
        }, 3000);
    } catch (err) {
        console.error('下载失败:', err);
        alert('下载失败: ' + err.message);
        window.isOperating = false;
    }
}