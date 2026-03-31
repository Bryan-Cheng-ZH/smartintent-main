// airConditionerComponent.js
// 创建空调组件
function createAirConditioner() {
  const acGroup = new THREE.Group();

  // 空调主体 - 白色长方形盒子
  const acBodyGeometry = new THREE.BoxGeometry(2.2, 0.7, 0.6);
  const acBodyMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xfafafa,
    roughness: 0.2,
    metalness: 0.1
  });
  const acBody = new THREE.Mesh(acBodyGeometry, acBodyMaterial);
  acBody.castShadow = true;
  acBody.receiveShadow = true;
  acGroup.add(acBody);

  // 创建圆滑效果 - 底部装饰条
  const bottomTrimGeometry = new THREE.BoxGeometry(2.2, 0.05, 0.65);
  const bottomTrimMaterial = new THREE.MeshStandardMaterial({
    color: 0xe0e0e0,
    roughness: 0.3,
    metalness: 0.5
  });
  const bottomTrim = new THREE.Mesh(bottomTrimGeometry, bottomTrimMaterial);
  bottomTrim.position.y = -0.35;
  bottomTrim.position.z = 0.01;
  acGroup.add(bottomTrim);

  // 顶部装饰条
  const topTrimGeometry = new THREE.BoxGeometry(2.2, 0.05, 0.65);
  const topTrim = new THREE.Mesh(topTrimGeometry, bottomTrimMaterial);
  topTrim.position.y = 0.35;
  topTrim.position.z = 0.01;
  acGroup.add(topTrim);

  // 前面板 - 微微凸出的面板
  const frontPanelGeometry = new THREE.BoxGeometry(2.15, 0.6, 0.05);
  const frontPanelMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.1,
    metalness: 0.2
  });
  const frontPanel = new THREE.Mesh(frontPanelGeometry, frontPanelMaterial);
  frontPanel.position.z = 0.3;
  acGroup.add(frontPanel);

  // 空调的出风口 - 水平长条形
  const ventGeometry = new THREE.BoxGeometry(1.9, 0.2, 0.05);
  const ventMaterial = new THREE.MeshStandardMaterial({
    color: 0xf0f0f0,
    roughness: 0.6
  });
  const vent = new THREE.Mesh(ventGeometry, ventMaterial);
  vent.position.set(0, -0.18, 0.33);
  acGroup.add(vent);
  acGroup.vent = vent; // 保存出风口引用，便于定位粒子系统

  // 添加出风口内部 - 黑色区域
  const ventInsideGeometry = new THREE.BoxGeometry(1.85, 0.16, 0.05);
  const ventInsideMaterial = new THREE.MeshStandardMaterial({
    color: 0x222222,
    roughness: 0.9
  });
  const ventInside = new THREE.Mesh(ventInsideGeometry, ventInsideMaterial);
  ventInside.position.set(0, -0.18, 0.36);
  acGroup.add(ventInside);

  // 创建叶片
  const blades = [];
  for (let i = 0; i < 10; i++) {
    const bladeGeometry = new THREE.BoxGeometry(0.17, 0.02, 0.04);
    const bladeMaterial = new THREE.MeshStandardMaterial({
      color: 0xf8f8f8,
      roughness: 0.2,
      metalness: 0.5
    });
    const blade = new THREE.Mesh(bladeGeometry, bladeMaterial);
    blade.position.set(-0.85 + i * 0.19, -0.18, 0.38);
    blade.rotation.z = 0.3; // 倾斜角度
    acGroup.add(blade);
    blades.push(blade);
  }
  acGroup.blades = blades;

  // 添加控制面板
  const controlPanelGeometry = new THREE.BoxGeometry(0.5, 0.3, 0.02);
  const controlPanelMaterial = new THREE.MeshStandardMaterial({
    color: 0x333333,
    roughness: 0.7
  });
  const controlPanel = new THREE.Mesh(controlPanelGeometry, controlPanelMaterial);
  controlPanel.position.set(0.8, 0.12, 0.33);
  acGroup.add(controlPanel);

  // LED显示屏
  const displayGeometry = new THREE.PlaneGeometry(0.3, 0.15);
  const displayMaterial = new THREE.MeshBasicMaterial({
    color: 0x00aaff,
    emissive: 0x00aaff,
    emissiveIntensity: 1.0
  });
  const display = new THREE.Mesh(displayGeometry, displayMaterial);
  display.position.set(0.8, 0.15, 0.34);
  acGroup.add(display);
  acGroup.display = display;
  acGroup.displayMaterial = displayMaterial;

  // 温度显示 - "22°C"温度
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = 128;
  tempCanvas.height = 64;
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.fillStyle = '#00aaff';
  tempCtx.fillRect(0, 0, 128, 64);
  tempCtx.font = 'bold 40px Arial';
  tempCtx.fillStyle = 'white';
  tempCtx.textAlign = 'center';
  tempCtx.textBaseline = 'middle';
  tempCtx.fillText('24°C', 64, 32);

  const tempTexture = new THREE.CanvasTexture(tempCanvas);
  const tempDisplayMaterial = new THREE.MeshBasicMaterial({
    map: tempTexture,
    transparent: true
  });
  const tempDisplay = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.14), tempDisplayMaterial);
  tempDisplay.position.set(0.8, 0.15, 0.345);
  acGroup.add(tempDisplay);
  acGroup.tempDisplay = tempDisplay;
  acGroup.tempTexture = tempTexture;
  acGroup.tempDisplayMaterial = tempDisplayMaterial;

  // 电源按钮 - 绿色激活状态
  const acButtonGeometry = new THREE.CircleGeometry(0.035, 16);
  const buttonActiveMaterial = new THREE.MeshStandardMaterial({
    color: 0x00cc66,
    roughness: 0.4,
    metalness: 0.6,
    emissive: 0x00cc66,
    emissiveIntensity: 0.3
  });
  const buttonInactiveMaterial = new THREE.MeshStandardMaterial({
    color: 0x444444,
    roughness: 0.5,
    metalness: 0.8
  });
  
  const powerButton = new THREE.Mesh(acButtonGeometry, buttonActiveMaterial);
  powerButton.position.set(0.6, 0.15, 0.34);
  acGroup.add(powerButton);
  acGroup.powerButton = powerButton;
  acGroup.buttonActiveMaterial = buttonActiveMaterial;
  acGroup.buttonInactiveMaterial = buttonInactiveMaterial;

  // 空调上方的电源指示灯
  const indicatorGeometry = new THREE.BoxGeometry(0.05, 0.02, 0.05);
  const indicatorMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    emissive: 0x00ff00,
    emissiveIntensity: 0.5
  });
  const indicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial);
  indicator.position.set(-0.9, 0.35, 0.31);
  acGroup.add(indicator);
  acGroup.indicator = indicator;
  acGroup.indicatorMaterial = indicatorMaterial;

  // ===== 添加送风特效 =====
  // 创建风速指示灯
  const fanSpeedLights = [];
  const fanLightGeometry = new THREE.CircleGeometry(0.02, 16);
  const fanLightOnMaterial = new THREE.MeshBasicMaterial({
    color: 0x4fc3f7,
    emissive: 0x4fc3f7,
    emissiveIntensity: 0.5
  });
  const fanLightOffMaterial = new THREE.MeshBasicMaterial({
    color: 0x333333,
    emissive: 0x333333,
    emissiveIntensity: 0
  });

  // 创建3个风速指示灯
  for (let i = 0; i < 3; i++) {
    const light = new THREE.Mesh(fanLightGeometry, fanLightOffMaterial.clone());
    light.position.set(0.6 + i * 0.06, 0.05, 0.34);
    acGroup.add(light);
    fanSpeedLights.push(light);
  }
  acGroup.fanSpeedLights = fanSpeedLights;
  acGroup.fanLightOnMaterial = fanLightOnMaterial;
  acGroup.fanLightOffMaterial = fanLightOffMaterial;
  
  // 创建完全对齐送风口的气流效果组
  const airflowGroup = new THREE.Group();
  // 使用vent的位置作为参考点，确保气流从送风口开始
  airflowGroup.position.copy(vent.position);
  // 稍微向前移动，避免与送风口重叠
  airflowGroup.position.z += 0.03;
  acGroup.add(airflowGroup);
  acGroup.airflowGroup = airflowGroup;
  
  // 创建送风粒子系统
  const particleCount = 200;
  const particlesGeometry = new THREE.BufferGeometry();
  const particleMaterial = new THREE.PointsMaterial({
    color: 0xadd8e6, // 默认冷风颜色
    size: 0.03,
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true
  });
  
  // 创建粒子位置数组
  const positions = new Float32Array(particleCount * 3);
  
  // 初始化粒子位置 - 确保完全从送风口开始
  for (let i = 0; i < particleCount; i++) {
    // x位置在出风口宽度范围内，精确匹配出风口宽度(1.85)
    positions[i * 3] = (Math.random() - 0.5) * 1.85; 
    // y位置 - 以送风口为起点，向下分布
    positions[i * 3 + 1] = -Math.random() * 2.5; 
    // z位置，从送风口开始向外
    positions[i * 3 + 2] = Math.random() * 0.05; 
  }
  
  particlesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const particles = new THREE.Points(particlesGeometry, particleMaterial);
  airflowGroup.add(particles);
  acGroup.particles = particles;
  acGroup.particlesGeometry = particlesGeometry;
  acGroup.particleMaterial = particleMaterial;

  // 创建气流纹理 - 动态生成波浪效果纹理
  function createAirflowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    // 创建线性渐变
    const gradient = ctx.createLinearGradient(0, 0, 0, 512);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    
    ctx.fillStyle = gradient;
    
    // 绘制波形图案
    for (let i = 0; i < 10; i++) {
      const y = i * 50;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x < 256; x++) {
        const waveHeight = Math.sin(x / 20) * 8;
        ctx.lineTo(x, y + waveHeight);
      }
      ctx.lineTo(256, y);
      ctx.fill();
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 2);
    return texture;
  }

  // 创建半透明气流板 - 完全匹配出风口尺寸和位置
  const airflowTexture = createAirflowTexture();
  const airflowMaterial = new THREE.MeshBasicMaterial({
    map: airflowTexture,
    transparent: true,
    opacity: 0.2,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  });
  
  // 精确匹配出风口宽度(1.85)
  const airflowGeometry = new THREE.PlaneGeometry(1.85, 2.5);
  const airflow = new THREE.Mesh(airflowGeometry, airflowMaterial);
  // 旋转气流平面让它向下延伸
  airflow.rotation.x = Math.PI / 2;
  // 定位气流平面起点与送风口对齐
  airflow.position.y = -1.25;
  airflowGroup.add(airflow);
  acGroup.airflow = airflow;
  acGroup.airflowTexture = airflowTexture;

  // 默认隐藏气流特效
  airflowGroup.visible = false;

  // 当前的动画参数
  const animationParams = {
    particleSpeed: 0.02,  // 默认中速
    textureOffset: 0,
    fanSpeed: 'medium'    // 默认中速档位
  };
  acGroup.animationParams = animationParams;

  // 添加控制方法
  acGroup.setStatus = function(status) {
    if(status === 'on') {
      // 显示界面元素
      this.displayMaterial.opacity = 1;
      this.indicatorMaterial.emissiveIntensity = 0.5;
      this.powerButton.material = this.buttonActiveMaterial;
      
      // 显示温度数字
      if(this.tempDisplay) {
        this.tempDisplay.visible = true;
      }
      
      // 显示送风特效
      if(this.airflowGroup) {
        this.airflowGroup.visible = true;
      }
      
      // 更新风速指示灯
      this.updateFanSpeedLights();
    } else {
      // 调暗界面元素
      this.displayMaterial.opacity = 0.2;
      this.indicatorMaterial.emissiveIntensity = 0;
      this.powerButton.material = this.buttonInactiveMaterial;
      
      // 关闭显示温度数字
      if(this.tempDisplay) {
        this.tempDisplay.visible = false;
      }
      
      // 隐藏送风特效
      if(this.airflowGroup) {
        this.airflowGroup.visible = false;
      }
      
      // 关闭所有风速指示灯
      if(this.fanSpeedLights) {
        this.fanSpeedLights.forEach(light => {
          light.material = this.fanLightOffMaterial.clone();
        });
      }
    }
  };
  
  acGroup.setTemperature = function(temperature) {
    // 更新温度显示
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 128;
    tempCanvas.height = 64;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.fillStyle = '#00aaff';
    tempCtx.fillRect(0, 0, 128, 64);
    tempCtx.font = 'bold 40px Arial';
    tempCtx.fillStyle = 'white';
    tempCtx.textAlign = 'center';
    tempCtx.textBaseline = 'middle';
    tempCtx.fillText(temperature + '°C', 64, 32);
    
    if(this.tempTexture) this.tempTexture.dispose();
    this.tempTexture = new THREE.CanvasTexture(tempCanvas);
    this.tempDisplayMaterial.map = this.tempTexture;
    this.tempDisplayMaterial.needsUpdate = true;
  };
  
  acGroup.setMode = function(mode) {
    // 设置模式和对应指示灯颜色
    const indicatorColor = mode === 'cool' ? 0x00aaff : 0xff6600;
    this.indicatorMaterial.color.set(indicatorColor);
    this.indicatorMaterial.emissive.set(indicatorColor);
    
    // 同时更新气流颜色
    if(this.particleMaterial) {
      if (mode === 'cool') {
        // 冷风 - 蓝色调
        this.particleMaterial.color.set(0xadd8e6);
      } else {
        // 热风 - 红色调
        this.particleMaterial.color.set(0xffccbc);
      }
    }
  };
  
  // 更新风速指示灯
  acGroup.updateFanSpeedLights = function() {
    // 重置所有指示灯
    if(!this.fanSpeedLights) return;
    
    this.fanSpeedLights.forEach(light => {
      light.material = this.fanLightOffMaterial.clone();
    });
    
    // 根据风速点亮对应数量的指示灯
    if (this.airflowGroup && this.airflowGroup.visible) {
      if (this.animationParams.fanSpeed === 'low') {
        this.fanSpeedLights[0].material = this.fanLightOnMaterial.clone();
      } else if (this.animationParams.fanSpeed === 'medium') {
        this.fanSpeedLights[0].material = this.fanLightOnMaterial.clone();
        this.fanSpeedLights[1].material = this.fanLightOnMaterial.clone();
      } else if (this.animationParams.fanSpeed === 'high') {
        this.fanSpeedLights.forEach(light => {
          light.material = this.fanLightOnMaterial.clone();
        });
      }
    }
  };
  
  // 设置风速函数
  acGroup.setFanSpeed = function(speed) {
    // 保存当前风速设置
    if(!this.animationParams) return;
    this.animationParams.fanSpeed = speed;
    
    // 更新风速参数
    if (speed === 'low') {
      this.animationParams.particleSpeed = 0.01;
      if(this.particleMaterial) this.particleMaterial.opacity = 0.2;
      if(this.airflow) this.airflow.scale.set(0.6, 0.6, 0.6);
    } else if (speed === 'medium') {
      this.animationParams.particleSpeed = 0.02;
      if(this.particleMaterial) this.particleMaterial.opacity = 0.3;
      if(this.airflow) this.airflow.scale.set(0.8, 0.8, 0.8);
    } else if (speed === 'high') {
      this.animationParams.particleSpeed = 0.03;
      if(this.particleMaterial) this.particleMaterial.opacity = 0.4;
      if(this.airflow) this.airflow.scale.set(1, 1, 1);
    }
    
    // 更新风速指示灯
    if (this.airflowGroup && this.airflowGroup.visible) {
      this.updateFanSpeedLights();
    }
  };
  
  acGroup.animateBlades = function() {
    try {
      // 叶片效果 - 随时间摆动
      let time = Date.now() * 0.001;
      if(this.blades) {
        for(let i = 0; i < this.blades.length; i++) {
          this.blades[i].rotation.z = 0.3 + Math.sin(time + i * 0.2) * 0.1;
        }
      }
      
      // 送风效果动画 - 仅当空调开启时
      if (this.airflowGroup && this.airflowGroup.visible && this.particlesGeometry) {
        // 更新粒子位置
        const positions = this.particlesGeometry.attributes.position.array;
        
        for (let i = 0; i < positions.length / 3; i++) {
          // 粒子向下移动 - 速度取决于风速设置
          positions[i * 3 + 1] -= this.animationParams.particleSpeed;
          
          // 当粒子移动到底部时，重置到顶部
          if (positions[i * 3 + 1] < -2.5) {
            positions[i * 3] = (Math.random() - 0.5) * 1.85;
            positions[i * 3 + 1] = 0;
            positions[i * 3 + 2] = Math.random() * 0.05;
          }
          
          // 添加水平方向的轻微波动，更真实的气流效果
          const wobble = Math.sin(time * 3 + i) * 0.002;
          positions[i * 3] += wobble;
        }
        
        // 标记粒子位置需要更新
        this.particlesGeometry.attributes.position.needsUpdate = true;
        
        // 更新气流纹理动画 - 流动效果
        if (this.airflowTexture && this.animationParams) {
          this.animationParams.textureOffset += this.animationParams.particleSpeed * 0.1;
          this.airflowTexture.offset.y = this.animationParams.textureOffset;
        }
      }
    } catch(e) {
      console.error("空调动画错误:", e);
    }
  };

  // 初始状态设置
  acGroup.setStatus('off'); // 默认为关闭状态
  acGroup.setFanSpeed('medium'); // 默认中速风
  
  // 确保初始状态下温度显示和气流特效都是隐藏的
  if(acGroup.tempDisplay) acGroup.tempDisplay.visible = false;
  if(acGroup.airflowGroup) acGroup.airflowGroup.visible = false;
  
  // 空调温度初始化
  acGroup.setTemperature(24);

  return acGroup;
}

// 导出组件
window.createAirConditioner = createAirConditioner;