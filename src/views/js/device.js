// 浏览器指纹生成器
// 基于 canvas、WebGL、UA、屏幕、时区、语言等特征生成设备唯一标识
// 生成后存入 localStorage，后续请求自动携带 X-Device-Id header
(function () {
  'use strict';

  // 简单 hash 函数（FNV-1a 变体），输出 16 位 hex
  function hash(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('00000000' + h.toString(16)).slice(-8);
  }

  // Canvas 指纹：绘制特定文本与图形，取 toDataURL 的 hash
  function canvasFingerprint() {
    try {
      var canvas = document.createElement('canvas');
      canvas.width = 220;
      canvas.height = 30;
      var ctx = canvas.getContext('2d');
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(0, 0, 100, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('错题助手-device-指纹-∀∂∫∞∑', 2, 2);
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.fillText('错题助手-device-指纹-∀∂∫∞∑', 4, 4);
      return hash(canvas.toDataURL());
    } catch (e) {
      return 'nocanvas';
    }
  }

  // WebGL 指纹：取 renderer/vendor 信息
  function webglFingerprint() {
    try {
      var canvas = document.createElement('canvas');
      var gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return 'nowebgl';
      var dbg = gl.getExtension('WEBGL_debug_renderer_info');
      if (!dbg) return 'noinfo';
      var vendor = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || '';
      var renderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '';
      return hash(vendor + '|' + renderer);
    } catch (e) {
      return 'webglerr';
    }
  }

  // 生成完整设备指纹
  function generateFingerprint() {
    var parts = [
      navigator.userAgent || '',
      navigator.language || '',
      (navigator.languages || []).join(','),
      screen.width + 'x' + screen.height + 'x' + screen.colorDepth,
      new Date().getTimezoneOffset().toString(),
      Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      canvasFingerprint(),
      webglFingerprint(),
      navigator.hardwareConcurrency || '0',
      (navigator.deviceMemory || 0).toString(),
      navigator.platform || ''
    ];
    // 双重 hash 拼接得到 16 位 hex
    var raw = parts.join('||');
    return hash(raw) + hash(raw + 'salt-fenbi');
  }

  // 获取或生成设备 ID，优先从 localStorage 读取（持久化）
  function getDeviceId() {
    try {
      var stored = localStorage.getItem('device_id');
      if (stored && /^[a-f0-9]{16}$/.test(stored)) return stored;
    } catch (e) {}
    var fp = generateFingerprint();
    try { localStorage.setItem('device_id', fp); } catch (e) {}
    return fp;
  }

  var deviceId = getDeviceId();
  window.__DEVICE_ID__ = deviceId;
  window.getDeviceId = function () { return deviceId; };

  // 写入 cookie（便于后端首次请求即可读取，无需等待 JS 执行）
  try {
    if (!document.cookie.match(/device_id=[a-f0-9]{16}/)) {
      document.cookie = 'device_id=' + deviceId + ';path=/;max-age=315360000;SameSite=Lax';
    }
  } catch (e) {}

  // 拦截 XMLHttpRequest，自动添加 X-Device-Id header
  try {
    var origOpen = XMLHttpRequest.prototype.open;
    var origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function () {
      this._deviceId = deviceId;
      return origOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
      try { this.setRequestHeader('X-Device-Id', this._deviceId); } catch (e) {}
      return origSend.apply(this, arguments);
    };
  } catch (e) {}

  // 拦截 fetch
  if (window.fetch) {
    var origFetch = window.fetch;
    window.fetch = function (input, init) {
      init = init || {};
      init.headers = init.headers || {};
      // 兼容 Headers 对象与普通对象
      if (init.headers instanceof Headers) {
        if (!init.headers.has('X-Device-Id')) init.headers.set('X-Device-Id', deviceId);
      } else if (!init.headers['X-Device-Id']) {
        init.headers['X-Device-Id'] = deviceId;
      }
      return origFetch.call(this, input, init);
    };
  }
})();
