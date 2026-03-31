// modernSofa.js - 现代风格沙发组件
// 为您的 Three.js 智能家居场景设计的更现代沙发

function createModernSofa() {
  const sofaGroup = new THREE.Group();

  // 配色方案
  const colors = {
    mainBody: 0x37474f,       // 深蓝灰色主体
    cushions: 0x78909c,       // 浅蓝灰色坐垫
    accent: 0xeceff1,         // 白灰色装饰元素
    metal: 0xb0bec5,          // 金属部件
    legs: 0x212121            // 黑色腿
  };

  // 沙发底座 - 平滑的弧形底座
  const baseGeometry = new THREE.BoxGeometry(2.4, 0.15, 1.2);
  const baseMaterial = new THREE.MeshStandardMaterial({ 
    color: colors.mainBody, 
    roughness: 0.3,
    metalness: 0.1
  });
  const base = new THREE.Mesh(baseGeometry, baseMaterial);
  base.position.y = 0.15;
  sofaGroup.add(base);

  // 创建沙发底部的弧形造型
  const baseEdgeGeometry = new THREE.BoxGeometry(2.4, 0.07, 1.25);
  const baseEdge = new THREE.Mesh(baseEdgeGeometry, baseMaterial);
  baseEdge.position.set(0, 0.05, 0);
  baseEdge.scale.set(0.98, 1, 1.02);
  sofaGroup.add(baseEdge);

  // 沙发背部框架 - 更精细的设计
  const backFrameGeometry = new THREE.BoxGeometry(2.4, 0.9, 0.2);
  const backFrameMaterial = new THREE.MeshStandardMaterial({ 
    color: colors.mainBody, 
    roughness: 0.5 
  });
  const backFrame = new THREE.Mesh(backFrameGeometry, backFrameMaterial);
  backFrame.position.set(0, 0.6, -0.5);
  backFrame.castShadow = true;
  sofaGroup.add(backFrame);

  // 创建更精细的底面，稍微向内弧形
  const backBottomGeometry = new THREE.BoxGeometry(2.35, 0.2, 0.15);
  const backBottom = new THREE.Mesh(backBottomGeometry, backFrameMaterial);
  backBottom.position.set(0, 0.2, -0.48);
  sofaGroup.add(backBottom);

  // 沙发主坐垫 - 分成三个独立的垫子，更加舒适和真实
  const createSeatCushion = (x) => {
    const cushionGroup = new THREE.Group();
    
    // 主坐垫形状
    const cushionGeometry = new THREE.BoxGeometry(0.75, 0.18, 0.9);
    const cushionMaterial = new THREE.MeshStandardMaterial({ 
      color: colors.cushions, 
      roughness: 0.7 
    });
    const cushion = new THREE.Mesh(cushionGeometry, cushionMaterial);
    cushion.castShadow = true;
    cushionGroup.add(cushion);
    
    // 坐垫前边缘略微隆起
    const frontEdgeGeometry = new THREE.BoxGeometry(0.75, 0.05, 0.1);
    const frontEdge = new THREE.Mesh(frontEdgeGeometry, cushionMaterial);
    frontEdge.position.set(0, -0.05, 0.4);
    cushionGroup.add(frontEdge);
    
    // 添加装饰线
    const lineGeometry = new THREE.BoxGeometry(0.73, 0.01, 0.88);
    const lineMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x2c3e50, 
      roughness: 0.5 
    });
    const decorLine = new THREE.Mesh(lineGeometry, lineMaterial);
    decorLine.position.set(0, 0.09, 0);
    cushionGroup.add(decorLine);
    
    // 添加按扣效果
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 2; j++) {
        const buttonGeometry = new THREE.CylinderGeometry(0.015, 0.015, 0.01, 12);
        const buttonMaterial = new THREE.MeshStandardMaterial({ 
          color: colors.mainBody, 
          roughness: 0.3 
        });
        const button = new THREE.Mesh(buttonGeometry, buttonMaterial);
        button.rotation.x = Math.PI / 2;
        button.position.set(-0.25 + i * 0.25, 0.1, -0.2 + j * 0.4);
        cushionGroup.add(button);
      }
    }
    
    cushionGroup.position.set(x, 0.35, 0.05);
    return cushionGroup;
  };

  // 添加三个坐垫
  sofaGroup.add(createSeatCushion(-0.78));
  sofaGroup.add(createSeatCushion(0));
  sofaGroup.add(createSeatCushion(0.78));

  // 背靠垫 - 三个独立的垫子
  const createBackCushion = (x) => {
    const cushionGroup = new THREE.Group();
    
    // 主靠背垫
    const cushionGeometry = new THREE.BoxGeometry(0.75, 0.6, 0.15);
    const cushionMaterial = new THREE.MeshStandardMaterial({ 
      color: colors.cushions, 
      roughness: 0.7 
    });
    const cushion = new THREE.Mesh(cushionGeometry, cushionMaterial);
    cushion.castShadow = true;
    cushionGroup.add(cushion);
    
    // 添加装饰线
    const hLineGeometry = new THREE.BoxGeometry(0.73, 0.01, 0.13);
    const lineGeometry = new THREE.BoxGeometry(0.73, 0.58, 0.01);
    const lineMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x2c3e50, 
      roughness: 0.5 
    });
    
    const decorLine1 = new THREE.Mesh(hLineGeometry, lineMaterial);
    decorLine1.position.set(0, 0.2, 0);
    cushionGroup.add(decorLine1);
    
    const decorLine2 = new THREE.Mesh(hLineGeometry, lineMaterial);
    decorLine2.position.set(0, -0.2, 0);
    cushionGroup.add(decorLine2);
    
    const decorLine3 = new THREE.Mesh(lineGeometry, lineMaterial);
    decorLine3.position.set(0, 0, 0.07);
    cushionGroup.add(decorLine3);
    
    // 按扣效果
    for (let i = 0; i < 3; i++) {
      const buttonGeometry = new THREE.CylinderGeometry(0.015, 0.015, 0.01, 12);
      const buttonMaterial = new THREE.MeshStandardMaterial({ 
        color: colors.mainBody, 
        roughness: 0.3 
      });
      const button = new THREE.Mesh(buttonGeometry, buttonMaterial);
      button.rotation.z = Math.PI / 2;
      button.position.set(0, -0.2 + i * 0.2, 0.08);
      cushionGroup.add(button);
    }
    
    cushionGroup.position.set(x, 0.8, -0.4);
    return cushionGroup;
  };

  // 添加三个靠背垫
  sofaGroup.add(createBackCushion(-0.78));
  sofaGroup.add(createBackCushion(0));
  sofaGroup.add(createBackCushion(0.78));

  // 装饰性扶手垫
  const createArmrest = (x) => {
    const armGroup = new THREE.Group();
    
    // 扶手主体
    const armGeometry = new THREE.BoxGeometry(0.2, 0.4, 1);
    const armMaterial = new THREE.MeshStandardMaterial({ 
      color: colors.mainBody, 
      roughness: 0.5 
    });
    const arm = new THREE.Mesh(armGeometry, armMaterial);
    arm.position.set(0, 0.2, 0);
    arm.castShadow = true;
    armGroup.add(arm);
    
    // 扶手垫
    const padGeometry = new THREE.BoxGeometry(0.25, 0.05, 0.7);
    const padMaterial = new THREE.MeshStandardMaterial({ 
      color: colors.cushions, 
      roughness: 0.7 
    });
    const pad = new THREE.Mesh(padGeometry, padMaterial);
    pad.position.set(0, 0.43, 0);
    armGroup.add(pad);
    
    // 装饰条
    const trimGeometry = new THREE.BoxGeometry(0.22, 0.02, 0.72);
    const trimMaterial = new THREE.MeshStandardMaterial({ 
      color: colors.metal, 
      metalness: 0.7, 
      roughness: 0.3 
    });
    const trim = new THREE.Mesh(trimGeometry, trimMaterial);
    trim.position.set(0, 0.4, 0);
    armGroup.add(trim);
    
    armGroup.position.set(x, 0.3, 0);
    return armGroup;
  };

  // 添加扶手
  sofaGroup.add(createArmrest(-1.3));
  sofaGroup.add(createArmrest(1.3));

  // 现代风格的沙发腿
  const createLeg = (x, z) => {
    const legGroup = new THREE.Group();
    
    // 金属框架
    const frameGeometry = new THREE.BoxGeometry(0.05, 0.15, 0.05);
    const frameMaterial = new THREE.MeshStandardMaterial({ 
      color: colors.metal, 
      metalness: 0.8, 
      roughness: 0.2 
    });
    const legFrame = new THREE.Mesh(frameGeometry, frameMaterial);
    legFrame.position.set(0, -0.08, 0);
    legGroup.add(legFrame);
    
    // 底部垫片
    const padGeometry = new THREE.CylinderGeometry(0.04, 0.04, 0.01, 16);
    const padMaterial = new THREE.MeshStandardMaterial({ 
      color: colors.legs, 
      roughness: 0.8 
    });
    const pad = new THREE.Mesh(padGeometry, padMaterial);
    pad.position.set(0, -0.16, 0);
    legGroup.add(pad);
    
    legGroup.position.set(x, 0, z);
    return legGroup;
  };

  // 添加四条腿
  sofaGroup.add(createLeg(-1.1, 0.4));
  sofaGroup.add(createLeg(1.1, 0.4));
  sofaGroup.add(createLeg(-1.1, -0.4));
  sofaGroup.add(createLeg(1.1, -0.4));

  // 添加装饰性的抱枕
  const createPillow = (x, z, color, rotation) => {
    const pillowGroup = new THREE.Group();
    
    // 抱枕主体
    const pillowGeometry = new THREE.BoxGeometry(0.35, 0.35, 0.08);
    const pillowMaterial = new THREE.MeshStandardMaterial({ 
      color: color, 
      roughness: 0.9 
    });
    const pillow = new THREE.Mesh(pillowGeometry, pillowMaterial);
    pillow.castShadow = true;
    pillowGroup.add(pillow);
    
    // 抱枕边框
    const borderGeometry = new THREE.BoxGeometry(0.37, 0.37, 0.01);
    const borderMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x2c3e50, 
      roughness: 0.8 
    });
    const border = new THREE.Mesh(borderGeometry, borderMaterial);
    border.position.set(0, 0, 0.05);
    pillowGroup.add(border);
    
    pillowGroup.position.set(x, 0.55, z);
    if (rotation) {
      pillowGroup.rotation.z = rotation;
      pillowGroup.rotation.x = -0.3;
    }
    
    return pillowGroup;
  };

  // 添加装饰抱枕
  sofaGroup.add(createPillow(-0.7, -0.25, 0xeceff1, 0.3));
  sofaGroup.add(createPillow(0.8, -0.25, 0x90caf9, -0.2));

  // 整体优化
  sofaGroup.traverse(child => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  return sofaGroup;
}

// 将函数添加到全局作用域
window.createModernSofa = createModernSofa;