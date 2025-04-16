# 效果预览
登录页
![](https://github.com/SugarSong404/easy-ftp/blob/main/assets/s1.png?raw=true)
首页
![](https://github.com/SugarSong404/easy-ftp/blob/main/assets/s2.png?raw=true)
共享剪贴板页
![](https://github.com/SugarSong404/easy-ftp/blob/main/assets/s3.png?raw=true)
共享网盘页
![](https://github.com/SugarSong404/easy-ftp/blob/main/assets/s4.png?raw=true)
# 写在前面
写这个仓库是因为我在常常因为手机、windows、linux等系统间文本不能互通复制而烦恼。

多平台的设备间无法像mac一样隔空投送，而下载某些客户端（微信），每次重新打开又十分麻烦。

各大网盘限速且收费，不如我自己就架设一个好了，当然最主要的还是其文本传输的便携性，网盘功能附带就好。

其实可以使用aList，但是其文本互通没有我所需要的便捷性。
# 提示
该项目的功能十分简单，不需要详细说明如何使用。

关于部署也无非是运行个node而已，要注意的是建立新仓库是通过在public/uploads目录下新建文件夹实现的

建立好文件夹，在app.js中配置好密码（参考已经有的仓库），即可使用这个仓库了
# 废话
这个项目是不走心的状态写的，只为快速可以写好投入使用，编程过程中充斥着大量vibe coding，也存在着Bug（上传文件夹时有时会发生）

看着还勉强可以，想自己部署的就直接跑node吧，我也懒得打包为docker镜像或者上传npm了
