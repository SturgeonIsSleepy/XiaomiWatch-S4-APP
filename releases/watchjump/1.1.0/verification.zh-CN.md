# 跳一跳 1.1.0 基础验证

- 官方 aiot-toolkit 2.0.5 构建通过；版本1.1.0 / 2，新增 system.vibrator 声明。
- 7项基础测试通过：蓄力、落点/得分、动画有界与中断清理、震动节流、关闭和同步异常降级、设置写入、中心连击2/4/6计分。
- 官方 Watch S4 466×466 模拟环境：安装打开、角色和平台压缩、能量圈、空中翻转、落地回弹与浮动加分、失误/重开、震动开关和设置保存。
- 在逐帧截图中确认角色倒置的翻转画面，见 air-flip.png。修复动态旋转样式在该运行时必须采用编译JSON格式的兼容问题。
- native日志确认调用 system_vibrator_wrap_vibrate；模拟器振动后端返回-138，因此不把接口调用视作实体马达震动成功。
- 修复直接从销毁钩子调用另一生命周期钩子导致的兼容问题；最终会话正常退出，未见JS异常。
- 没有进行压力测试、真机震感、帧率、功耗或温控测试。

官方支持说明：https://iot.mi.com/vela/quickapp/zh/features/system/vibrator.html
S4支持 vibrator.vibrate；start、stop 和 getSystemDefaultMode 列为S4不支持，所以本版只使用有限short脉冲，无持续振动任务。
