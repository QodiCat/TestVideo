// Shared by the browser renderer, CLI and publisher. Dimensions are half-extents.
const families = {
  fruit: { shape: 'ellipsoid', radii: [1.39, 1.02, 1.13], skin: 'speckle', section: 'plain', roughness: 0.65 },
  vegetable: { shape: 'ellipsoid', radii: [1.5, 0.7, 0.8], skin: 'speckle', section: 'plain', roughness: 0.8 },
  cheese: { shape: 'cylinder', radii: [1.3, 0.55, 1.3], skin: 'smooth', section: 'pores', roughness: 0.8 },
  sweet: { shape: 'box', radii: [1.45, 0.65, 1.0], skin: 'smooth', section: 'plain', roughness: 0.6 },
  bread: { shape: 'box', radii: [1.45, 0.8, 1.0], skin: 'speckle', section: 'pores', roughness: 0.95 },
  care: { shape: 'box', radii: [1.5, 0.48, 1.04], skin: 'smooth', section: 'plain', roughness: 0.85 },
};

// id, Chinese name, family, peel, flesh, core, overrides.
const entries = [
  ['kiwi', '猕猴桃', 'fruit', '#855633', '#a4df43', '#e4f5ad', {section:'kiwi'}],
  ['dragonfruit', '白心火龙果', 'fruit', '#ba2058', '#f3e6eb', '#fff4fa', {label:'DRAGON FRUIT',section:'seeds',roughness:0.37}],
  ['soap', '薰衣草肥皂', 'care', '#9e7bcd', '#c7a9e9', '#eadcfd', {label:'SOAP BAR'}],
  ['golden_kiwi', '黄金猕猴桃', 'fruit', '#977447', '#e9ce43', '#fff2b8', {section:'kiwi'}],
  ['red_dragonfruit', '红心火龙果', 'fruit', '#c42f67', '#b51661', '#e74991', {section:'seeds'}],
  ['watermelon', '西瓜', 'fruit', '#26663b', '#ef4b58', '#ff6d72', {skin:'stripes',section:'watermelon',radii:[1.5,1.08,1.18]}],
  ['yellow_watermelon', '黄瓤西瓜', 'fruit', '#3d7e39', '#f4d444', '#ffe988', {skin:'stripes',section:'watermelon'}],
  ['cantaloupe', '哈密瓜', 'fruit', '#bead72', '#f4a965', '#ffe1ac', {skin:'net',section:'melon'}],
  ['honeydew', '蜜瓜', 'fruit', '#c8d7a2', '#c6e49b', '#f8efd0', {section:'melon'}],
  ['orange', '橙子', 'fruit', '#f18a20', '#ffb23d', '#fff1c6', {section:'citrus',radii:[1.12,1.05,1.12]}],
  ['lemon', '柠檬', 'fruit', '#ead53c', '#f6e594', '#fff8d5', {section:'citrus',radii:[1.5,0.8,0.85]}],
  ['lime', '青柠', 'fruit', '#5e9d35', '#cbe58b', '#f6f5ce', {section:'citrus',radii:[1.08,0.95,1.08]}],
  ['grapefruit', '西柚', 'fruit', '#f1bc62', '#ef887c', '#fff2d4', {section:'citrus'}],
  ['blood_orange', '血橙', 'fruit', '#d8732b', '#b72f41', '#ffcdac', {section:'citrus'}],
  ['pomelo', '柚子', 'fruit', '#c4c75d', '#eed7ac', '#fff4da', {section:'citrus'}],
  ['mandarin', '橘子', 'fruit', '#ed8b28', '#f8b85a', '#fff3d4', {section:'citrus',radii:[1.25,0.83,1.2]}],
  ['green_apple', '青苹果', 'fruit', '#8daf36', '#f1edbd', '#fff7de', {section:'pome',radii:[1.17,1.03,1.1]}],
  ['red_apple', '红苹果', 'fruit', '#b83937', '#f2dfb1', '#fff2d4', {section:'pome',radii:[1.17,1.03,1.1]}],
  ['yellow_apple', '黄苹果', 'fruit', '#dfbd48', '#f3e8c2', '#fff5dd', {section:'pome'}],
  ['asian_pear', '雪梨', 'fruit', '#c4b066', '#ece7ce', '#fff8e9', {section:'pome'}],
  ['guava', '番石榴', 'fruit', '#9db64e', '#ea9a9e', '#f4cbb1', {section:'guava'}],
  ['white_guava', '白心番石榴', 'fruit', '#9cb450', '#e4e7b7', '#f8f1d7', {section:'guava'}],
  ['papaya', '木瓜', 'fruit', '#d5a047', '#ee8947', '#3d2b25', {section:'papaya',radii:[1.55,0.87,0.95]}],
  ['mango', '芒果', 'fruit', '#dfad34', '#f4b332', '#ffe5a0', {section:'stone',radii:[1.5,0.83,1.0]}],
  ['peach', '桃子', 'fruit', '#e49a83', '#f9cf9b', '#9b5334', {section:'stone'}],
  ['nectarine', '油桃', 'fruit', '#c3573d', '#edb855', '#8b4b30', {section:'stone'}],
  ['apricot', '杏子', 'fruit', '#eaa055', '#f6c67c', '#98653e', {section:'stone',radii:[1.05,0.92,1.0]}],
  ['plum', '紫李子', 'fruit', '#624778', '#efc977', '#98603d', {section:'stone'}],
  ['avocado', '牛油果', 'fruit', '#435b33', '#c4d873', '#9b633e', {section:'stone',radii:[1.5,0.9,0.95]}],
  ['passionfruit', '百香果', 'fruit', '#73425e', '#e9bc42', '#f6da75', {section:'seeds'}],
  ['potato', '土豆', 'vegetable', '#b39a6d', '#e9d9a5', '#f6e9be'],
  ['sweet_potato', '红薯', 'vegetable', '#9c5a55', '#e9a44c', '#f6c46c', {radii:[1.65,0.65,0.72]}],
  ['purple_sweet_potato', '紫薯', 'vegetable', '#78516d', '#87508f', '#b183bb'],
  ['taro', '芋头', 'vegetable', '#9b826c', '#e1d5dd', '#f5e9ed', {section:'flecks'}],
  ['beetroot', '甜菜根', 'vegetable', '#70414a', '#9e2447', '#d05273', {section:'rings',radii:[1.15,0.95,1.1]}],
  ['white_radish', '白萝卜', 'vegetable', '#e0e5ce', '#f2f4e6', '#ffffff', {radii:[1.65,0.65,0.7]}],
  ['carrot', '胡萝卜段', 'vegetable', '#d97629', '#ee973f', '#f8c16d', {shape:'cylinder',radii:[0.95,0.9,0.95],section:'rings'}],
  ['cucumber', '黄瓜段', 'vegetable', '#426e32', '#c8dca4', '#ecf0ca', {shape:'cylinder',radii:[1.0,0.8,1.0],skin:'stripes',section:'cucumber'}],
  ['zucchini', '西葫芦段', 'vegetable', '#587b3c', '#e5e6b8', '#f7f2d8', {shape:'cylinder',radii:[1.1,0.8,1.1],skin:'stripes',section:'cucumber'}],
  ['winter_melon', '冬瓜段', 'vegetable', '#749773', '#e4ebd1', '#f8f5df', {shape:'cylinder',radii:[1.3,0.7,1.3],section:'cucumber'}],
  ['pumpkin', '南瓜块', 'vegetable', '#b97330', '#e7a23d', '#f6c968', {shape:'box',radii:[1.4,0.75,1.05]}],
  ['butternut_squash', '奶油南瓜块', 'vegetable', '#c8a36b', '#e8ac59', '#f9d184', {shape:'box'}],
  ['eggplant', '茄子', 'vegetable', '#553954', '#dfdab4', '#f3edcf', {radii:[1.7,0.6,0.68],section:'flecks'}],
  ['tomato', '番茄', 'vegetable', '#c64131', '#e96449', '#f8b365', {radii:[1.2,0.88,1.12],section:'tomato'}],
  ['red_onion', '紫洋葱', 'vegetable', '#925878', '#f0d4e7', '#fcf3f5', {section:'rings',radii:[1.15,1.0,1.1]}],
  ['white_onion', '白洋葱', 'vegetable', '#d9c99a', '#eef0d1', '#ffffff', {section:'rings',radii:[1.15,1.0,1.1]}],
  ['lotus_root', '莲藕段', 'vegetable', '#c2ad8c', '#ede4cd', '#f9f1df', {shape:'cylinder',radii:[1.15,0.72,1.15],section:'lotus'}],
  ['turnip', '芜菁', 'vegetable', '#b08aab', '#e9e4d6', '#faf5ea', {radii:[1.2,0.9,1.1]}],
  ['cheddar', '切达奶酪', 'cheese', '#dba447', '#efbd5e', '#ffe099', {shape:'box'}],
  ['gouda', '高达奶酪', 'cheese', '#b94838', '#edcd7c', '#f7e4aa'],
  ['emmental', '埃曼塔奶酪', 'cheese', '#d8b75d', '#f0d68c', '#fff0bd', {shape:'box'}],
  ['edam', '伊丹奶酪', 'cheese', '#c13e39', '#ebdba1', '#fff1c7'],
  ['mozzarella', '马苏里拉奶酪', 'cheese', '#eee9d8', '#f5f0df', '#fff9ee', {section:'plain'}],
  ['feta', '菲达奶酪', 'cheese', '#e6e1ce', '#f5eddd', '#fff8ef', {shape:'box'}],
  ['brie', '布里奶酪', 'cheese', '#e9e4d7', '#e9dca9', '#f9ecc2', {section:'plain'}],
  ['camembert', '卡芒贝尔奶酪', 'cheese', '#e0ddcb', '#e3d39d', '#f5e8b9', {section:'plain',radii:[1.25,0.4,1.25]}],
  ['blue_cheese', '蓝纹奶酪', 'cheese', '#d7d4b5', '#e9e5c8', '#f7f0da', {shape:'box',section:'marble',ink:'#577b78'}],
  ['pepper_jack', '胡椒杰克奶酪', 'cheese', '#ded0a4', '#efe2b7', '#fff1ce', {shape:'box',section:'flecks',ink:'#66794a'}],
  ['tofu', '豆腐', 'sweet', '#e1dac5', '#f2ecda', '#fff8e9', {section:'pores'}],
  ['firm_tofu', '老豆腐', 'sweet', '#d1bd90', '#e7d5ad', '#f5e8c8', {section:'pores'}],
  ['konjac', '魔芋块', 'sweet', '#9e9887', '#c9c4b1', '#dfdac7', {section:'flecks'}],
  ['rice_cake', '年糕', 'sweet', '#dddcd2', '#f0eee3', '#fffaf1'],
  ['brownie', '布朗尼', 'bread', '#4c3026', '#714638', '#95634a', {section:'chips'}],
  ['vanilla_sponge', '香草海绵蛋糕', 'bread', '#b38142', '#efd397', '#ffe9b9'],
  ['chocolate_sponge', '巧克力海绵蛋糕', 'bread', '#573a2a', '#8b5e41', '#b48359'],
  ['matcha_sponge', '抹茶海绵蛋糕', 'bread', '#6e7740', '#a5b36c', '#d2dca1'],
  ['strawberry_sponge', '草莓海绵蛋糕', 'bread', '#c28088', '#e5b0b5', '#fbd6d6'],
  ['pound_cake', '磅蛋糕', 'bread', '#ad7c3f', '#e1c27e', '#f9e2a3'],
  ['banana_bread', '香蕉面包', 'bread', '#957043', '#cfb477', '#ebd59e', {section:'flecks'}],
  ['white_bread', '白吐司', 'bread', '#ad773f', '#e9ddbe', '#fff4d9'],
  ['whole_wheat_bread', '全麦吐司', 'bread', '#8c633e', '#baa078', '#ddc7a0', {section:'flecks'}],
  ['rye_bread', '黑麦面包', 'bread', '#614735', '#987c5a', '#bca17a', {section:'flecks'}],
  ['cheesecake', '芝士蛋糕', 'sweet', '#b08752', '#efe0b0', '#fff0cc', {section:'layers'}],
  ['tiramisu', '提拉米苏', 'sweet', '#6f4834', '#eee0bc', '#896044', {section:'layers'}],
  ['rainbow_cake', '彩虹蛋糕', 'sweet', '#eee4e5', '#e9b6bd', '#b2c995', {section:'rainbow'}],
  ['red_bean_cake', '红豆糕', 'sweet', '#a57271', '#c29591', '#dfb8ad', {section:'flecks'}],
  ['mung_bean_cake', '绿豆糕', 'sweet', '#b5be74', '#d7dba1', '#eff0c7'],
  ['coconut_bar', '椰蓉糕', 'sweet', '#e3ded0', '#f2eadb', '#fff9ee', {section:'flecks'}],
  ['marshmallow', '棉花糖块', 'sweet', '#ebd9e0', '#faeaf0', '#fff8fc', {radii:[1.3,0.75,1.0]}],
  ['milk_chocolate', '牛奶巧克力', 'sweet', '#674332', '#80563f', '#a77755', {radii:[1.5,0.3,1.05]}],
  ['dark_chocolate', '黑巧克力', 'sweet', '#382921', '#4d372b', '#70503b', {radii:[1.5,0.3,1.05]}],
  ['white_chocolate', '白巧克力', 'sweet', '#ddcea6', '#f0e3c1', '#fff0d4', {radii:[1.5,0.3,1.05]}],
  ['fudge', '奶油软糖', 'sweet', '#ad8654', '#cda976', '#ebce9e'],
  ['nougat', '牛轧糖', 'sweet', '#e4dbbd', '#f3ead1', '#fff6e4', {section:'chips',ink:'#a88756'}],
  ['halva', '芝麻酥糖', 'sweet', '#b49b6d', '#d6c18f', '#eddfb6', {section:'flecks'}],
  ['matcha_chocolate', '抹茶巧克力', 'sweet', '#72824a', '#a2b379', '#c8d4a2', {radii:[1.5,0.3,1.05]}],
  ['milk_soap', '牛奶皂', 'care', '#e2dcc8', '#f2ecda', '#fff8e9'],
  ['rose_soap', '玫瑰皂', 'care', '#bc7488', '#dda5b4', '#f5d1dd', {section:'flecks',ink:'#9c4b62'}],
  ['charcoal_soap', '竹炭皂', 'care', '#333d41', '#566064', '#7b8587'],
  ['honey_soap', '蜂蜜皂', 'care', '#c5913c', '#e0b765', '#f6d89a'],
  ['aloe_soap', '芦荟皂', 'care', '#6c976e', '#a3c69a', '#d4e7bf'],
  ['oat_soap', '燕麦皂', 'care', '#bca77f', '#dccaa4', '#f1e4c8', {section:'flecks',ink:'#8b7556'}],
  ['coffee_soap', '咖啡皂', 'care', '#775b45', '#a78a6d', '#d0b79b', {section:'flecks'}],
  ['sponge', '清洁海绵', 'care', '#cfa83e', '#e5c35d', '#f7df91', {section:'pores',skin:'pores',radii:[1.5,0.65,1.0]}],
  ['floral_foam', '插花花泥', 'care', '#3f6b50', '#62866a', '#8baa8b', {section:'pores',skin:'pores',radii:[1.5,0.7,1.0]}],
  ['modeling_clay', '彩泥块', 'care', '#4b93b6', '#7ab8d1', '#b0dbe6', {section:'marble',ink:'#cce9ed'}],
  ['wax_block', '蜂蜡块', 'care', '#c5a24e', '#e0c574', '#f4e3a6'],
  ['eraser', '橡皮擦', 'care', '#ba8585', '#d8a8a7', '#efd0cb', {radii:[1.5,0.45,0.85]}],
  ['butter', '黄油块', 'sweet', '#e6ce7a', '#f3de95', '#fff0ba', {radii:[1.5,0.5,0.95]}],
  ['peppermint_soap', '薄荷皂', 'care', '#6ca89c', '#a4d1c0', '#d9efe0', {section:'marble',ink:'#eef9eb'}],
];

export const catalog = Object.freeze(Object.fromEntries(entries.map(([id, name, family, peel, flesh, core, overrides]) => [id,
  Object.freeze({id, name, family, label:id.replaceAll('_',' ').toUpperCase(), peel, flesh, core,
    accent:flesh, ...families[family], ...overrides,
    radii:Object.freeze([...(overrides?.radii ?? families[family].radii)])})])));
export const objectIds = Object.freeze(Object.keys(catalog));
export const hasObject = id => typeof id === 'string' && Object.hasOwn(catalog, id);

export function layerPalette(spec) {
  return spec.section === 'rainbow' ? ['#d98189','#eab17b','#e2d27e','#a5c38a','#8ebdd1','#b39bc9']
    : spec.section === 'layers' ? [spec.flesh,spec.core,spec.flesh,spec.core,spec.flesh] : null;
}

// A cut along z exposes this normalized width and height.
export function crossScale(shape, z) {
  const r = Math.sqrt(Math.max(0, 1-z*z));
  return shape === 'box' ? [1,1] : shape === 'cylinder' ? [r,1] : [r,r];
}

// Enumerate occupied grid columns; no allocation proportional to the full cube.
export function gridRows(dimensions, shape, visit) {
  const [nx,ny,nz] = dimensions;
  for (let j=0; j<nz; j++) {
    const z=1-(2*j+1)/nz;
    for (let i=0; i<nx; i++) {
      const x=(2*i+1)/nx-1;
      const d=1-x*x-z*z;
      if (shape !== 'box' && d < -1e-9) continue;
      const r=shape === 'ellipsoid' ? Math.sqrt(Math.max(0,d)) : 1;
      const first=Math.max(0,Math.ceil((1-r)*ny/2-0.5-1e-9));
      const last=Math.min(ny-1,Math.floor((1+r)*ny/2-0.5+1e-9));
      visit(j,x,z,first,last);
    }
  }
}
