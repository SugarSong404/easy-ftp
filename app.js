const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const multer = require('multer');
const app = express();
const archiver = require('archiver');
const cookieParser = require('cookie-parser');


const AUTH = {"repo1":"passwd1","repo2":"passwd2"}
const ADMIN_PASSWORD = "123456"

const UPLOAD_PATH = path.join(__dirname, 'public/uploads');
const BASE_DIR = UPLOAD_PATH; 

// 确保上传目录存在
fs.ensureDirSync(UPLOAD_PATH);

// 设置视图引擎和静态文件目录
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 修改文件上传配置
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const pathDict = JSON.parse(req.headers["x-upload-path"] || "{}");
      const decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      const decodedPathDict = Object.fromEntries(
        Object.entries(pathDict).map(([key, value]) => [
          decodeURIComponent(key),
          decodeURIComponent(value),
        ])
      );
      const currentPath = decodeURIComponent(req.headers["x-current-path"] || '');
      // 获取上传路径和文件夹结构
      const uploadPath = path.join(
        BASE_DIR,
        req.cookies.auth.repo,
        currentPath,
        decodedPathDict[decodedName] || ''
      );
  
      // 确保目录存在
      fs.ensureDirSync(uploadPath);
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      const decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      cb(null, decodedName);
    }
  });
    const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 * 1024 }  });

// 拦截首页请求
app.get('/', (req, res) => {
  const auth = req.cookies.auth;
  if (auth && (AUTH[auth.repo] === auth.password || (auth.repo in AUTH && auth.password === ADMIN_PASSWORD))) {
    res.sendFile(path.join(__dirname, 'views/index.html'));
  } else {
    res.sendFile(path.join(__dirname, 'views/login.html'));
  }
});


// 登录接口
app.post('/login', (req, res) => {
  const password  = req.body.password;
  const repo  = req.body.repo;
  if (AUTH[repo] === password || (repo in AUTH && password === ADMIN_PASSWORD)) {
    res.cookie('auth', {"repo":repo,"password":password}, { httpOnly: true });
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, message: '密码错误' });
  }
});

// 登出接口
app.post('/logout', (req, res) => {
  try {
    // 清除客户端保存的 auth cookie
    res.clearCookie('auth', {
      httpOnly: true,
      sameSite: 'strict',  // 防止CSRF攻击
      // secure: true      // 如果使用HTTPS请取消注释
    });
    
    res.json({ 
      success: true,
      message: '登出成功' 
    });
  } catch (err) {
    console.error('登出失败:', err);
    res.status(500).json({ 
      success: false,
      message: '登出失败' 
    });
  }
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'views')));

app.get('/cloud', (req, res) => {
  res.sendFile(path.join(__dirname, 'views/cloud.html'));
});

app.get('/clipboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'views/clipboard.html'));
});



// 路由
app.get('/files', async (req, res) => {
    try {
        let dirPath = req.query.path || '';
        
        // 规范化路径
        dirPath = dirPath.replace(/\\/g, '/')  // 统一使用正斜杠
                       .replace(/\/+/g, '/')   // 去除重复斜杠
                       .replace(/^\/|\/$/g, ''); // 去除首尾斜杠
        
        // 防止路径遍历攻击
        if (dirPath.includes('..')) {
            return res.status(400).json({ error: '非法路径' });
        }
        
        const absolutePath = path.join(BASE_DIR, req.cookies.auth.repo, dirPath);
        
        // 检查路径是否存在
        if (!fs.existsSync(absolutePath)) {
            return res.status(404).json({ error: '目录不存在' });
        }
        
        // 确保是目录
        const stat = await fs.stat(absolutePath);
        if (!stat.isDirectory()) {
            return res.status(400).json({ error: '路径不是目录' });
        }
        
        const files = await fs.readdir(absolutePath, { withFileTypes: true });
        const fileList = files.filter(file => file.name !== 'clipboard.txt')
        .map(file => ({
            name: file.name,
            isDir: file.isDirectory(),
            path: path.join(dirPath, file.name).replace(/\\/g, '/'),
            mtime: stat.mtime
        }));
        
        res.json({
            path: dirPath,
            warehouse: req.cookies.auth.repo,
            files: fileList
        });
    } catch (err) {
        console.error('读取目录错误:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/mkdir', async (req, res) => {
    const { path: dirPath, name } = req.body;
    try {
      await fs.mkdir(path.join(BASE_DIR, req.cookies.auth.repo, dirPath, name));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

app.post('/rename', async (req, res) => {
  const { oldPath, newName } = req.body;
  try {
    const fullOldPath = path.join(BASE_DIR, req.cookies.auth.repo, oldPath);
    const fullNewPath = path.join(path.dirname(fullOldPath), newName);
    await fs.rename(fullOldPath, fullNewPath);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/delete', async (req, res) => {
  const { path: filePath } = req.body;
  try {
    const fullPath = path.join(BASE_DIR , req.cookies.auth.repo, filePath);
    await fs.remove(fullPath);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Copy/Cut operation endpoint
app.post('/copy', async (req, res) => {
  const { source, destination, isCut } = req.body;
  try {
    const fullSource = path.join(BASE_DIR, req.cookies.auth.repo, source);
    const fullDest = path.join(BASE_DIR, req.cookies.auth.repo, destination, path.basename(source));
    
    if (isCut) {
      await fs.move(fullSource, fullDest);
    } else {
      await fs.copy(fullSource, fullDest);
    }
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get file stats for multiple files
app.post('/file-stats', async (req, res) => {
  const { files } = req.body;
  try {
    const stats = await Promise.all(files.map(async filePath => {
      const fullPath = path.join(BASE_DIR, req.cookies.auth.repo, filePath);
      const stat = await fs.stat(fullPath);
      return {
        path: filePath,
        name: path.basename(filePath),
        isDir: stat.isDirectory(),
        size: stat.size,
        mtime: stat.mtime
      };
    }));
    
    res.json({ files: stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Pagination endpoint
app.get('/files-paginated', async (req, res) => {
  try {
    let dirPath = req.query.path || '';
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 50;
    
    // Path sanitization
    dirPath = dirPath.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
    if (dirPath.includes('..')) {
      return res.status(400).json({ error: '非法路径' });
    }
    
    const absolutePath = path.join(BASE_DIR, req.cookies.auth.repo, dirPath);
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ error: '目录不存在' });
    }
    
    const stat = await fs.stat(absolutePath);
    if (!stat.isDirectory()) {
      return res.status(400).json({ error: '路径不是目录' });
    }
    
    const allFiles = await fs.readdir(absolutePath, { withFileTypes: true });
    const totalItems = allFiles.length;
    const totalPages = Math.ceil(totalItems / pageSize);
    
    const paginatedFiles = allFiles
      .slice((page - 1) * pageSize, page * pageSize)
      .map(file => ({
        name: file.name,
        isDir: file.isDirectory(),
        path: path.join(dirPath, file.name).replace(/\\/g, '/'),
        mtime: stat.mtime
      }));
    
    res.json({
      path: dirPath,
      files: paginatedFiles,
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages
      }
    });
  } catch (err) {
    console.error('读取目录错误:', err);
    res.status(500).json({ error: err.message });
  }
});

// 修改上传路由
app.post('/upload', upload.array('files'), (req, res) => {
  // 确保Express正确解析内容长度
  res.set('Connection', 'close');
  res.json({
      success: true,
      uploadedTo: path.join(req.headers["x-current-path"])
  });
});
  
  // 添加压缩下载路由
  app.get('/download-compressed', async (req, res) => {
    try {
        const { path: filePath, format = 'zip' } = req.query;
        
        // 安全处理路径
        const safePath = filePath.replace(/\\/g, '/')
                               .replace(/\/+/g, '/')
                               .replace(/^\/|\/$/g, '');
        if (safePath.includes('..')) {
            return res.status(400).send('非法路径');
        }

        const absolutePath = path.join(BASE_DIR, req.cookies.auth.repo, safePath);
        if (!fs.existsSync(absolutePath)) {
            return res.status(404).send('文件/目录不存在');
        }

        const stat = await fs.stat(absolutePath);
        const filename = path.basename(safePath) || 'download';
        if (stat.isDirectory()) {
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}.${format}"`);
            
            if(format==="zip") {
                res.setHeader('Content-Type', 'application/zip');
                const archive = archiver('zip', { zlib: { level: 9 } });
                archive.directory(absolutePath, false);
                archive.pipe(res);
                await archive.finalize();
            }
        } else {
            // 单个文件直接下载
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
            res.sendFile(absolutePath);
        }
    } catch (err) {
        console.error('下载错误:', err);
        res.status(500).send('下载失败: ' + err.message);
    }
});

app.post('/save/:warehouse/:filePath', async (req, res) => {
  const { warehouse, filePath } = req.params;
  const content = req.body.content;
  const fullPath = path.join(BASE_DIR, warehouse, filePath);
  const dirPath = path.dirname(fullPath); // 获取目录路径

  try {
      // 确保目录存在（递归创建）
      await fs.promises.mkdir(dirPath, { recursive: true });

      // 写入文件
      await fs.promises.writeFile(fullPath, content, 'utf-8');
      res.sendStatus(200);
  } catch (err) {
      console.error(err);
      res.sendStatus(500);
  }
});

  app.get('/public/uploads/clipboard.txt', (req, res) => {
    const clipboardFile = path.join(BASE_DIR, req.cookies.auth.repo, 'clipboard.txt');
    // 如果文件不存在则创建
    if (!fs.existsSync(clipboardFile)) {
        fs.writeFileSync(clipboardFile, '', 'utf-8');
    }
    
    fs.readFile(clipboardFile, 'utf8', (err, data) => {
        if (err) {
            console.error('读取剪贴板文件失败:', err);
            return res.status(500).send('无法读取剪贴板内容');
        }
        res.type('text/plain').send(data);
    });
});

// 保存剪贴板内容
app.post('/save-clipboard', (req, res) => {
  const clipboardFile = path.join(BASE_DIR, req.cookies.auth.repo, 'clipboard.txt');
    const { content } = req.body;
    
    if (typeof content !== 'string') {
        return res.status(400).json({ error: '无效的内容格式' });
    }
    
    fs.writeFile(clipboardFile, content, 'utf8', (err) => {
        if (err) {
            console.error('保存剪贴板失败:', err);
            return res.status(500).json({ error: '保存剪贴板失败' });
        }
        res.json({ success: true });
    });
});

const PORT = 3000;
app.listen(PORT, () => console.log(`http://localhost:${PORT}`));