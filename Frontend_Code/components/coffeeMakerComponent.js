// coffeeMakerComponent.js
function createCoffeeMaker() {
  const coffeeMakerGroup = new THREE.Group();
  
  // 底座
  const baseGeometry = new THREE.BoxGeometry(0.6, 0.1, 0.4);
  const baseMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x333333,
    roughness: 0.4 
  });
  const base = new THREE.Mesh(baseGeometry, baseMaterial);
  base.position.y = 0.05;
  base.castShadow = true;
  base.receiveShadow = true;
  coffeeMakerGroup.add(base);
  
  // 主体
  const bodyGeometry = new THREE.BoxGeometry(0.4, 0.5, 0.3);
  const bodyMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x222222,
    roughness: 0.2,
    metalness: 0.3
  });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.position.set(0, 0.35, 0);
  body.castShadow = true;
  coffeeMakerGroup.add(body);
  
  // 咖啡壶
  const potGeometry = new THREE.CylinderGeometry(0.1, 0.12, 0.3, 16);
  const potMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x555555,
    transparent: true,
    opacity: 0.8,
    roughness: 0.1,
    metalness: 0.5
  });
  const pot = new THREE.Mesh(potGeometry, potMaterial);
  pot.position.set(0, 0.25, 0.2);
  pot.castShadow = true;
  coffeeMakerGroup.add(pot);
  
  // 控制按钮
  const buttonGeometry = new THREE.CircleGeometry(0.03, 16);
  const buttonMaterial = new THREE.MeshStandardMaterial({ color: 0xff3333 });
  const button = new THREE.Mesh(buttonGeometry, buttonMaterial);
  button.rotation.x = -Math.PI / 2;
  button.position.set(0.15, 0.45, 0.16);
  coffeeMakerGroup.add(button);
  coffeeMakerGroup.buttonMaterial = buttonMaterial;
  
  // 状态指示灯
  const indicatorGeometry = new THREE.CircleGeometry(0.015, 12);
  const indicatorMaterial = new THREE.MeshBasicMaterial({ 
    color: 0x00ff00,
    emissive: 0x00ff00,
    emissiveIntensity: 0
  });
  const indicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial);
  indicator.rotation.x = -Math.PI / 2;
  indicator.position.set(-0.15, 0.45, 0.16);
  coffeeMakerGroup.add(indicator);
  coffeeMakerGroup.indicatorMaterial = indicatorMaterial;
  
  // 咖啡液体 - 初始隐藏
  const coffeeGeometry = new THREE.CylinderGeometry(0.09, 0.11, 0.15, 16);
  const coffeeMaterial = new THREE.MeshBasicMaterial({
    color: 0x3e2723,
    transparent: true,
    opacity: 0.9
  });
  const coffee = new THREE.Mesh(coffeeGeometry, coffeeMaterial);
  coffee.position.set(0, 0.175, 0.2);
  coffee.visible = false;
  coffeeMakerGroup.add(coffee);
  coffeeMakerGroup.coffee = coffee;
  
  // 水箱
  const tankGeometry = new THREE.BoxGeometry(0.15, 0.4, 0.25);
  const tankMaterial = new THREE.MeshStandardMaterial({
    color: 0xadd8e6,
    transparent: true,
    opacity: 0.6
  });
  const tank = new THREE.Mesh(tankGeometry, tankMaterial);
  tank.position.set(-0.15, 0.35, 0);
  coffeeMakerGroup.add(tank);
  
  // 添加控制方法
  coffeeMakerGroup.setStatus = function(status) {
    this.indicatorMaterial.emissiveIntensity = (status === 'on') ? 0.8 : 0;
    this.coffee.visible = (status === 'on');
  };
  
  coffeeMakerGroup.setBrewing = function(brewing) {
    // 设置是否正在冲煮
    if (brewing) {
      this.indicatorMaterial.color.set(0xff9900);
      this.indicatorMaterial.emissive.set(0xff9900);
      this.buttonMaterial.color.set(0xff9900);
    } else {
      this.indicatorMaterial.color.set(0x00ff00);
      this.indicatorMaterial.emissive.set(0x00ff00);
      this.buttonMaterial.color.set(0xff3333);
    }
  };
  
  coffeeMakerGroup.setCoffeeFillLevel = function(level) {
    // 设置咖啡壶中咖啡的填充水平 (0-1)
    if (level > 0) {
      this.coffee.visible = true;
      this.coffee.scale.y = level;
      this.coffee.position.y = 0.175 * level;
    } else {
      this.coffee.visible = false;
    }
  };
  
  return coffeeMakerGroup;
}

window.createCoffeeMaker = createCoffeeMaker;