// tvComponent.js
// 创建电视组件
function createTV() {
  const tvGroup = new THREE.Group();
  
  // 添加电视柜
  const tvStandGeometry = new THREE.BoxGeometry(2, 0.8, 1.2);
  const tvStandMaterial = new THREE.MeshStandardMaterial({ color: 0xd2bc94 });
  const tvStand = new THREE.Mesh(tvStandGeometry, tvStandMaterial);
  tvStand.position.set(0, 0.4, 0);
  tvStand.castShadow = true;
  tvStand.receiveShadow = true;
  tvGroup.add(tvStand);
  
  // 电视柜和电视之间的支柱
  const tvPillarGroup = new THREE.Group();
  
  // 主支柱
  const pillarGeometry = new THREE.BoxGeometry(0.1, 1, 0.1);
  const pillarMaterial = new THREE.MeshStandardMaterial({ color: 0x555555 });
  const mainPillar = new THREE.Mesh(pillarGeometry, pillarMaterial);
  mainPillar.position.set(0, 0.5, 0);
  mainPillar.castShadow = true;
  tvPillarGroup.add(mainPillar);
  
  // 装饰环1 - 底部
  const ring1Geometry = new THREE.CylinderGeometry(0.08, 0.08, 0.03, 16);
  const ringMaterial = new THREE.MeshStandardMaterial({ color: 0xd4af37 }); // 金色
  const ring1 = new THREE.Mesh(ring1Geometry, ringMaterial);
  ring1.position.set(0, 0.05, 0);
  tvPillarGroup.add(ring1);
  
  // 装饰环2 - 顶部
  const ring2Geometry = new THREE.CylinderGeometry(0.08, 0.08, 0.03, 16);
  const ring2 = new THREE.Mesh(ring2Geometry, ringMaterial);
  ring2.position.set(0, 0.95, 0);
  tvPillarGroup.add(ring2);
  
  // 底座
  const baseGeometry = new THREE.CylinderGeometry(0.15, 0.2, 0.05, 16);
  const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
  const base = new THREE.Mesh(baseGeometry, baseMaterial);
  base.position.set(0, 0, 0);
  tvPillarGroup.add(base);
  
  // 位置调整 - 放在电视柜上方中心位置
  tvPillarGroup.position.set(0, 0.8, 0);
  tvGroup.add(tvPillarGroup);
  
  // 添加电视
  const tvGeometry = new THREE.BoxGeometry(2.5, 1.5, 0.15);
  const tvMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x111111,
    roughness: 0.2
  });
  const tv = new THREE.Mesh(tvGeometry, tvMaterial);
  tv.position.set(0, 1.8, 0);
  tv.castShadow = true;
  tv.receiveShadow = true;
  tvGroup.add(tv);
  
  // 添加电视屏幕
  const screenGeometry = new THREE.PlaneGeometry(2.3, 1.3);
  const screenMaterial = new THREE.MeshBasicMaterial({ 
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 1
  });
  screenMaterial.color.setHSL(Math.random(), 0.8, 0.5);
  const screen = new THREE.Mesh(screenGeometry, screenMaterial);
  screen.position.set(0, 0, 0.08);
  tv.add(screen);
  
  // 公开需要外部控制的对象
  tvGroup.screen = screen;
  tvGroup.screenMaterial = screenMaterial;
  
  // 添加控制方法
  tvGroup.setStatus = function(status) {
    if(status === 'on') {
      screen.visible = true;
    } else {
      screen.visible = false;
    }
  };
  
  tvGroup.setChannel = function(channel) {
    // 根据频道改变屏幕颜色
    screenMaterial.color.setHSL((channel % 20) / 20, 0.8, 0.5);
  };
  
  return tvGroup;
}

// 导出组件
window.createTV = createTV;