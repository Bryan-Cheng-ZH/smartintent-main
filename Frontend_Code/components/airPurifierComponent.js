// airPurifierComponent.js
function createAirPurifier() {
  const purifierGroup = new THREE.Group();
  
  // 主体
  const baseGeometry = new THREE.CylinderGeometry(0.35, 0.4, 1.2, 16);
  const baseMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xffffff,
    roughness: 0.4
  });
  const base = new THREE.Mesh(baseGeometry, baseMaterial);
  base.position.y = 0.6;
  base.castShadow = true;
  base.receiveShadow = true;
  purifierGroup.add(base);
  
  // 顶部
  const topGeometry = new THREE.CylinderGeometry(0.32, 0.35, 0.2, 16);
  const topMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xeeeeee,
    roughness: 0.2
  });
  const top = new THREE.Mesh(topGeometry, topMaterial);
  top.position.y = 1.3;
  top.castShadow = true;
  purifierGroup.add(top);
  
  // 控制面板
  const controlGeometry = new THREE.BoxGeometry(0.2, 0.1, 0.02);
  const controlMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
  const control = new THREE.Mesh(controlGeometry, controlMaterial);
  control.position.set(0, 0.9, 0.36);
  purifierGroup.add(control);
  
  // LED显示屏
  const screenGeometry = new THREE.PlaneGeometry(0.18, 0.08);
  const screenMaterial = new THREE.MeshBasicMaterial({
    color: 0x00aaff,
    emissive: 0x00aaff,
    emissiveIntensity: 0.5
  });
  const screen = new THREE.Mesh(screenGeometry, screenMaterial);
  screen.position.set(0, 0.9, 0.37);
  purifierGroup.add(screen);
  purifierGroup.screenMaterial = screenMaterial;
  
  // 添加空气质量数值显示
  const textCanvas = document.createElement('canvas');
  textCanvas.width = 64;
  textCanvas.height = 32;
  const ctx = textCanvas.getContext('2d');
  ctx.fillStyle = '#00aaff';
  ctx.fillRect(0, 0, 64, 32);
  ctx.font = 'bold 20px Arial';
  ctx.fillStyle = 'white';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('25', 32, 16);
  
  const textTexture = new THREE.CanvasTexture(textCanvas);
  const textMaterial = new THREE.MeshBasicMaterial({
    map: textTexture,
    transparent: true
  });
  const textDisplay = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.07), textMaterial);
  textDisplay.position.set(0, 0.9, 0.375);
  purifierGroup.add(textDisplay);
  purifierGroup.textCanvas = textCanvas;
  purifierGroup.textTexture = textTexture;
  
  // 进气格栅
  const grilleGeometry = new THREE.CylinderGeometry(0.38, 0.38, 0.4, 16, 1, true);
  const grilleMaterial = new THREE.MeshStandardMaterial({
    color: 0xcccccc,
    side: THREE.DoubleSide,
    roughness: 0.8
  });
  const grille = new THREE.Mesh(grilleGeometry, grilleMaterial);
  grille.position.y = 0.4;
  purifierGroup.add(grille);
  
  // 出风口
  const outletGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.05, 16, 1, true);
  const outletMaterial = new THREE.MeshStandardMaterial({
    color: 0xdddddd,
    side: THREE.DoubleSide
  });
  const outlet = new THREE.Mesh(outletGeometry, outletMaterial);
  outlet.position.y = 1.4;
  purifierGroup.add(outlet);
  
  // 状态指示灯
  const indicatorGeometry = new THREE.SphereGeometry(0.03, 8, 8);
  const indicatorMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ff88,
    emissive: 0x00ff88,
    emissiveIntensity: 0.6
  });
  const indicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial);
  indicator.position.set(0.15, 0.9, 0.37);
  purifierGroup.add(indicator);
  purifierGroup.indicatorMaterial = indicatorMaterial;
  
  // 底座
  const footGeometry = new THREE.CylinderGeometry(0.42, 0.45, 0.04, 16);
  const footMaterial = new THREE.MeshStandardMaterial({ color: 0xdddddd });
  const foot = new THREE.Mesh(footGeometry, footMaterial);
  foot.position.y = 0.02;
  purifierGroup.add(foot);
  
  // 添加控制按钮
  for (let i = 0; i < 3; i++) {
    const buttonGeometry = new THREE.CircleGeometry(0.02, 12);
    const buttonMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x333333,
      metalness: 0.6,
      roughness: 0.4
    });
    const button = new THREE.Mesh(buttonGeometry, buttonMaterial);
    button.rotation.x = -Math.PI / 2;
    button.position.set(-0.06 + i * 0.06, 0.85, 0.37);
    purifierGroup.add(button);
  }
  
  // 添加控制方法
  purifierGroup.setStatus = function(status) {
    this.screenMaterial.opacity = (status === 'on') ? 1.0 : 0.2;
    this.indicatorMaterial.emissiveIntensity = (status === 'on') ? 0.6 : 0;
  };
  
  purifierGroup.setAirQuality = function(value) {
    // 更新空气质量显示 (0-100)
    const ctx = this.textCanvas.getContext('2d');
    ctx.fillStyle = '#00aaff';
    ctx.fillRect(0, 0, 64, 32);
    ctx.font = 'bold 20px Arial';
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(value.toString(), 32, 16);
    
    this.textTexture.needsUpdate = true;
    
    // 更新指示灯颜色
    if (value < 30) {
      this.indicatorMaterial.color.set(0x00ff00);
      this.indicatorMaterial.emissive.set(0x00ff00);
    } else if (value < 70) {
      this.indicatorMaterial.color.set(0xffff00);
      this.indicatorMaterial.emissive.set(0xffff00);
    } else {
      this.indicatorMaterial.color.set(0xff0000);
      this.indicatorMaterial.emissive.set(0xff0000);
    }
  };
  
  purifierGroup.setFanSpeed = function(speed) {
    // 设置风扇速度 (1-3)
    this.screenMaterial.emissiveIntensity = 0.3 + (speed / 3) * 0.7;
  };
  
  return purifierGroup;
}

window.createAirPurifier = createAirPurifier;