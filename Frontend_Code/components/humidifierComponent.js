// enhanced-humidifierComponent.js
function createHumidifier() {
  const humidifierGroup = new THREE.Group();
  
  // 底座
  const baseGeometry = new THREE.CylinderGeometry(0.25, 0.3, 0.5, 16);
  const baseMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xffffff,
    roughness: 0.2,
    emissive: 0x88ccff,
    emissiveIntensity: 0
  });
  const base = new THREE.Mesh(baseGeometry, baseMaterial);
  base.position.y = 0.25;
  base.castShadow = true;
  base.receiveShadow = true;
  humidifierGroup.add(base);
  humidifierGroup.baseMaterial = baseMaterial;
  
  // 顶部
  const topGeometry = new THREE.CylinderGeometry(0.2, 0.25, 0.3, 16);
  const topMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xe0e0e0,
    roughness: 0.3
  });
  const top = new THREE.Mesh(topGeometry, topMaterial);
  top.position.y = 0.65;
  top.castShadow = true;
  humidifierGroup.add(top);
  
  // 出雾口
  const outletGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.05, 16);
  const outletMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });
  const outlet = new THREE.Mesh(outletGeometry, outletMaterial);
  outlet.position.y = 0.82;
  humidifierGroup.add(outlet);
  
  // 控制面板
  const panelGeometry = new THREE.BoxGeometry(0.15, 0.1, 0.02);
  const panelMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
  const panel = new THREE.Mesh(panelGeometry, panelMaterial);
  panel.position.set(0, 0.4, 0.26);
  humidifierGroup.add(panel);
  
  // LED显示 - 创建数字显示屏
  const ledPanelGeometry = new THREE.PlaneGeometry(0.1, 0.05);
  const ledPanelMaterial = new THREE.MeshBasicMaterial({ 
    color: 0x00ff88,
    transparent: true,
    opacity: 0
  });
  const ledPanel = new THREE.Mesh(ledPanelGeometry, ledPanelMaterial);
  ledPanel.position.set(0, 0.4, 0.27);
  humidifierGroup.add(ledPanel);
  humidifierGroup.ledPanelMaterial = ledPanelMaterial;
  
  // 创建数字显示
  // 创建一个canvas用于显示当前档位
  const digitCanvas = document.createElement('canvas');
  digitCanvas.width = 64;
  digitCanvas.height = 32;
  const digitCtx = digitCanvas.getContext('2d');
  
  // 创建数字显示纹理
  const digitTexture = new THREE.CanvasTexture(digitCanvas);
  const digitMaterial = new THREE.MeshBasicMaterial({
    map: digitTexture,
    transparent: true,
    opacity: 0
  });
  
  // 创建数字显示网格
  const digitGeometry = new THREE.PlaneGeometry(0.08, 0.04);
  const digitDisplay = new THREE.Mesh(digitGeometry, digitMaterial);
  digitDisplay.position.set(0, 0.4, 0.275);
  humidifierGroup.add(digitDisplay);
  
  // 存储引用
  humidifierGroup.digitCtx = digitCtx;
  humidifierGroup.digitTexture = digitTexture;
  humidifierGroup.digitMaterial = digitMaterial;
  
  // 水位显示器
  const waterLevelGeometry = new THREE.CylinderGeometry(0.22, 0.22, 0.4, 16, 1, true);
  const waterLevelMaterial = new THREE.MeshBasicMaterial({ 
    color: 0x88ccff,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide
  });
  const waterLevel = new THREE.Mesh(waterLevelGeometry, waterLevelMaterial);
  waterLevel.position.y = 0.25; // 初始位置
  waterLevel.scale.y = 0.2; // 初始水位高度为20%
  humidifierGroup.add(waterLevel);
  humidifierGroup.waterLevel = waterLevel;
  humidifierGroup.waterLevelMaterial = waterLevelMaterial;
  
  // 雾气粒子 - 创建更多粒子，初始状态下隐藏
  const mistGroup = new THREE.Group();
  const mistCount = 30; // 增加粒子数量
  for (let i = 0; i < mistCount; i++) {
    const mistGeometry = new THREE.SphereGeometry(0.02 + Math.random() * 0.04, 8, 8);
    const mistMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xffffff,
      transparent: true,
      opacity: 0.4
    });
    const mist = new THREE.Mesh(mistGeometry, mistMaterial);
    
    // 保存原始参数供动画使用
    mist.userData = {
      speed: 0.005 + Math.random() * 0.01,
      fadeRate: 0.98 + Math.random() * 0.01,
      originalSize: mistGeometry.parameters.radius,
      horizontalDrift: (Math.random() - 0.5) * 0.01
    };
    
    mist.position.set(
      (Math.random() - 0.5) * 0.1,
      0.85 + Math.random() * 0.1,
      (Math.random() - 0.5) * 0.1
    );
    mistGroup.add(mist);
  }
  humidifierGroup.add(mistGroup);
  humidifierGroup.mistGroup = mistGroup;
  mistGroup.visible = false;
  
  // 添加光晕效果
  const glowGeometry = new THREE.SphereGeometry(0.35, 16, 16);
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0x88ccff,
    transparent: true,
    opacity: 0
  });
  const glow = new THREE.Mesh(glowGeometry, glowMaterial);
  glow.position.y = 0.65;
  humidifierGroup.add(glow);
  humidifierGroup.glowMaterial = glowMaterial;
  
  // 添加雾气环形效果
  const mistRingGeometry = new THREE.TorusGeometry(0.12, 0.02, 8, 24);
  const mistRingMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0
  });
  const mistRing = new THREE.Mesh(mistRingGeometry, mistRingMaterial);
  mistRing.rotation.x = Math.PI / 2;
  mistRing.position.y = 0.85;
  humidifierGroup.add(mistRing);
  humidifierGroup.mistRing = mistRing;
  humidifierGroup.mistRingMaterial = mistRingMaterial;
  
  // 状态变量
  humidifierGroup.currentIntensity = 0.2; // 默认值为1的20%
  humidifierGroup.intensityLevel = 1;     // 默认档位为1
  humidifierGroup.isOn = false;
  humidifierGroup.animationTime = 0;
  
  // 增强控制方法
  humidifierGroup.setStatus = function(status) {
    this.isOn = (status === 'on');
    this.mistGroup.visible = this.isOn;
    
    // 开关状态变化时的视觉效果
    if (this.isOn) {
      // 打开LED面板和数字显示
      this.ledPanelMaterial.opacity = 0.7;
      this.digitMaterial.opacity = 1.0;
      
      // 如果已经有档位设置，使用当前值；否则默认为1
      const currentLevel = this.intensityLevel || 1;
      
      // 确保更新数字显示
      this.updateLEDDisplay(currentLevel);
      
      // 更新其他视觉效果
      this.baseMaterial.emissiveIntensity = 0.2 * this.currentIntensity;
      this.glowMaterial.opacity = 0.2 * this.currentIntensity;
      this.mistRingMaterial.opacity = 0.3 * this.currentIntensity;
      this.waterLevelMaterial.opacity = 0.3 + 0.2 * this.currentIntensity;
    } else {
      // 完全关闭LED面板和数字显示
      this.ledPanelMaterial.opacity = 0;
      this.digitMaterial.opacity = 0;
      
      // 关闭其他视觉效果
      this.baseMaterial.emissiveIntensity = 0;
      this.glowMaterial.opacity = 0;
      this.mistRingMaterial.opacity = 0;
      this.waterLevelMaterial.opacity = 0.2;
    }
  };
  
  humidifierGroup.setIntensity = function(level) {
    // 保存原始强度值（1-5范围）
    const originalLevel = Math.max(1, Math.min(5, level));
    this.intensityLevel = originalLevel; // 保存整数档位值
    this.currentIntensity = originalLevel / 5; // 归一化的强度值
    
    // 更新数字显示 - 总是更新显示，无论设备是否开启
    this.updateLEDDisplay(originalLevel);
    
    // 如果设备关闭，只更新档位值但不更新视觉效果
    if (!this.isOn) return;
    
    // 设置LED面板颜色 - 根据强度变化色相
    this.ledPanelMaterial.color.setHSL(0.4 - (originalLevel-1) * 0.05, 1, 0.5);
    
    // 调整底座发光效果
    this.baseMaterial.emissiveIntensity = 0.2 * this.currentIntensity;
    
    // 调整光晕效果
    this.glowMaterial.opacity = 0.2 * this.currentIntensity;
    
    // 调整水位显示
    this.waterLevel.scale.y = 0.2 + this.currentIntensity * 0.6; // 20%-80%范围内变化
    this.waterLevelMaterial.opacity = 0.3 + 0.2 * this.currentIntensity;
    this.waterLevelMaterial.color.setHSL(0.55, 0.7, 0.5 + this.currentIntensity * 0.2);
    
    // 调整雾气环
    this.mistRingMaterial.opacity = 0.3 * this.currentIntensity;
    
    // 调整活跃的雾气粒子数量
    const activeMistCount = Math.floor(5 + this.currentIntensity * 25);
    this.mistGroup.children.forEach((mist, i) => {
      if (i < activeMistCount) {
        mist.visible = true;
        
        // 调整粒子大小和不透明度
        const scale = 0.8 + this.currentIntensity * 0.4;
        mist.scale.set(scale, scale, scale);
        
        // 调整粒子属性
        mist.userData.speed = (0.005 + Math.random() * 0.005) * (0.7 + this.currentIntensity * 0.6);
        mist.userData.fadeRate = 0.98 + (1 - this.currentIntensity) * 0.01;
      } else {
        mist.visible = false;
      }
    });
    
    console.log(`加湿器档位已调整为 ${originalLevel}，已更新LED显示`);
  };
  
  // 更新LED显示屏上的数字
  humidifierGroup.updateLEDDisplay = function(level) {
    // 确保level在有效范围内
    const safeLevel = Math.max(1, Math.min(5, level || this.intensityLevel || 1));
    
    // 清除canvas
    this.digitCtx.clearRect(0, 0, 64, 32);
    
    // 设置样式
    this.digitCtx.fillStyle = '#000000';
    this.digitCtx.fillRect(0, 0, 64, 32);
    
    // 绘制数字
    this.digitCtx.font = 'bold 24px Arial';
    this.digitCtx.textAlign = 'center';
    this.digitCtx.textBaseline = 'middle';
    
    // 根据档位设置不同颜色
    const colors = ['#00ff88', '#00e0ff', '#00c0ff', '#00a0ff', '#0080ff'];
    this.digitCtx.fillStyle = colors[safeLevel - 1] || colors[0];
    
    // 绘制档位数字
    this.digitCtx.fillText(safeLevel.toString(), 32, 16);
    
    // 如果设备开启，确保数字显示是可见的
    if (this.isOn && this.digitMaterial) {
      this.digitMaterial.opacity = 1.0;
      this.ledPanelMaterial.opacity = 0.7;
    }
    
    // 更新纹理
    this.digitTexture.needsUpdate = true;
    
    console.log("更新加湿器LED显示，当前档位:", safeLevel);
  };
  
  // 为了兼容index文件中的"level"字段和room文件中的"intensity"字段
  humidifierGroup.setIntensityOrLevel = function(value) {
    // 确保值在1-5范围内
    const level = Math.max(1, Math.min(5, value));
    // 调用setIntensity方法
    this.setIntensity(level);
    
    console.log(`通过兼容方法设置加湿器档位为 ${level}`);
    return level;
  };
  
  humidifierGroup.animate = function(deltaTime) {
    if (!this.isOn) return;
    
    // 更新内部动画计时器
    this.animationTime += deltaTime || 0.016; // 如果没有提供deltaTime，假设约为16ms（60fps）
    
    // 水位轻微波动效果
    const waterScale = this.waterLevel.scale.y;
    this.waterLevel.scale.y = waterScale + Math.sin(this.animationTime * 2) * 0.005 * this.currentIntensity;
    
    // 雾气环脉动效果
    const pulseFactor = 0.5 + Math.sin(this.animationTime * 3) * 0.2;
    this.mistRing.scale.set(
      1 + pulseFactor * 0.1 * this.currentIntensity,
      1 + pulseFactor * 0.1 * this.currentIntensity,
      1
    );
    this.mistRingMaterial.opacity = 0.3 * this.currentIntensity * pulseFactor;
    
    // 雾气粒子动画
    if (this.mistGroup.visible) {
      this.mistGroup.children.forEach(mist => {
        if (!mist.visible) return;
        
        // 上升移动
        mist.position.y += mist.userData.speed;
        
        // 水平漂移
        mist.position.x += mist.userData.horizontalDrift * this.currentIntensity;
        mist.position.z += mist.userData.horizontalDrift * this.currentIntensity * 0.8;
        
        // 淡出效果
        mist.material.opacity *= mist.userData.fadeRate;
        
        // 轻微膨胀效果
        const expansionRate = 1.004 * this.currentIntensity;
        mist.scale.multiplyScalar(expansionRate);
        
        // 重置达到一定高度或完全透明的粒子
        if (mist.position.y > 1.5 || mist.material.opacity < 0.05) {
          // 重置位置
          mist.position.set(
            (Math.random() - 0.5) * 0.1 * (0.5 + this.currentIntensity * 0.8),
            0.85 + Math.random() * 0.05,
            (Math.random() - 0.5) * 0.1 * (0.5 + this.currentIntensity * 0.8)
          );
          // 重置不透明度
          mist.material.opacity = 0.3 + Math.random() * 0.2 * this.currentIntensity;
          // 重置大小
          const originalSize = mist.userData.originalSize;
          const scale = (0.8 + this.currentIntensity * 0.4);
          mist.scale.set(scale, scale, scale);
          // 给一个新的水平漂移值
          mist.userData.horizontalDrift = (Math.random() - 0.5) * 0.01;
        }
      });
    }
    
    // 发光效果的轻微脉动
    const glowPulse = 0.7 + Math.sin(this.animationTime * 1.5) * 0.3;
    this.glowMaterial.opacity = 0.15 * this.currentIntensity * glowPulse;
    this.baseMaterial.emissiveIntensity = 0.15 * this.currentIntensity * glowPulse;
  };
  
  return humidifierGroup;
}

window.createHumidifier = createHumidifier;