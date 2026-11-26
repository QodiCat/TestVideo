# 100 种可切割物品

包含原有 3 种，新增 97 种。采用椭圆体、圆角方块和圆柱三类简化模型；每种有独立的颜色、尺寸或纹理参数。品种及口味变体也分别计入预设数量。

这是程序化 3D 动画。果核、种子、奶酪孔洞等是切面纹理；不模拟硬核阻刀、流心、拉丝、柔体或真实物理断裂。胡萝卜、黄瓜、莲藕等以规则段形建模。

配置中的 `object` 使用下表 ID。`label` 只修改字幕，不改变物品。

```powershell
node scripts/objects.mjs
node scripts/render.mjs examples/objects/watermelon.json output/watermelon.mp4
```

自动发布的 `video.objects` 也接受全部 ID。此处只扩展支持范围，不改动已有排期和发布账号。

| 序号 | 物品 | ID | 分类 | 形状 | 切面纹理 |
|---|---|---|---|---|---|
| 1 | 猕猴桃 | `kiwi` | 水果 | 椭圆体 | kiwi |
| 2 | 白心火龙果 | `dragonfruit` | 水果 | 椭圆体 | seeds |
| 3 | 薰衣草肥皂 | `soap` | 日用品 | 圆角方块 | plain |
| 4 | 黄金猕猴桃 | `golden_kiwi` | 水果 | 椭圆体 | kiwi |
| 5 | 红心火龙果 | `red_dragonfruit` | 水果 | 椭圆体 | seeds |
| 6 | 西瓜 | `watermelon` | 水果 | 椭圆体 | watermelon |
| 7 | 黄瓤西瓜 | `yellow_watermelon` | 水果 | 椭圆体 | watermelon |
| 8 | 哈密瓜 | `cantaloupe` | 水果 | 椭圆体 | melon |
| 9 | 蜜瓜 | `honeydew` | 水果 | 椭圆体 | melon |
| 10 | 橙子 | `orange` | 水果 | 椭圆体 | citrus |
| 11 | 柠檬 | `lemon` | 水果 | 椭圆体 | citrus |
| 12 | 青柠 | `lime` | 水果 | 椭圆体 | citrus |
| 13 | 西柚 | `grapefruit` | 水果 | 椭圆体 | citrus |
| 14 | 血橙 | `blood_orange` | 水果 | 椭圆体 | citrus |
| 15 | 柚子 | `pomelo` | 水果 | 椭圆体 | citrus |
| 16 | 橘子 | `mandarin` | 水果 | 椭圆体 | citrus |
| 17 | 青苹果 | `green_apple` | 水果 | 椭圆体 | pome |
| 18 | 红苹果 | `red_apple` | 水果 | 椭圆体 | pome |
| 19 | 黄苹果 | `yellow_apple` | 水果 | 椭圆体 | pome |
| 20 | 雪梨 | `asian_pear` | 水果 | 椭圆体 | pome |
| 21 | 番石榴 | `guava` | 水果 | 椭圆体 | guava |
| 22 | 白心番石榴 | `white_guava` | 水果 | 椭圆体 | guava |
| 23 | 木瓜 | `papaya` | 水果 | 椭圆体 | papaya |
| 24 | 芒果 | `mango` | 水果 | 椭圆体 | stone |
| 25 | 桃子 | `peach` | 水果 | 椭圆体 | stone |
| 26 | 油桃 | `nectarine` | 水果 | 椭圆体 | stone |
| 27 | 杏子 | `apricot` | 水果 | 椭圆体 | stone |
| 28 | 紫李子 | `plum` | 水果 | 椭圆体 | stone |
| 29 | 牛油果 | `avocado` | 水果 | 椭圆体 | stone |
| 30 | 百香果 | `passionfruit` | 水果 | 椭圆体 | seeds |
| 31 | 土豆 | `potato` | 瓜菜 | 椭圆体 | plain |
| 32 | 红薯 | `sweet_potato` | 瓜菜 | 椭圆体 | plain |
| 33 | 紫薯 | `purple_sweet_potato` | 瓜菜 | 椭圆体 | plain |
| 34 | 芋头 | `taro` | 瓜菜 | 椭圆体 | flecks |
| 35 | 甜菜根 | `beetroot` | 瓜菜 | 椭圆体 | rings |
| 36 | 白萝卜 | `white_radish` | 瓜菜 | 椭圆体 | plain |
| 37 | 胡萝卜段 | `carrot` | 瓜菜 | 圆柱 | rings |
| 38 | 黄瓜段 | `cucumber` | 瓜菜 | 圆柱 | cucumber |
| 39 | 西葫芦段 | `zucchini` | 瓜菜 | 圆柱 | cucumber |
| 40 | 冬瓜段 | `winter_melon` | 瓜菜 | 圆柱 | cucumber |
| 41 | 南瓜块 | `pumpkin` | 瓜菜 | 圆角方块 | plain |
| 42 | 奶油南瓜块 | `butternut_squash` | 瓜菜 | 圆角方块 | plain |
| 43 | 茄子 | `eggplant` | 瓜菜 | 椭圆体 | flecks |
| 44 | 番茄 | `tomato` | 瓜菜 | 椭圆体 | tomato |
| 45 | 紫洋葱 | `red_onion` | 瓜菜 | 椭圆体 | rings |
| 46 | 白洋葱 | `white_onion` | 瓜菜 | 椭圆体 | rings |
| 47 | 莲藕段 | `lotus_root` | 瓜菜 | 圆柱 | lotus |
| 48 | 芜菁 | `turnip` | 瓜菜 | 椭圆体 | plain |
| 49 | 切达奶酪 | `cheddar` | 奶酪 | 圆角方块 | pores |
| 50 | 高达奶酪 | `gouda` | 奶酪 | 圆柱 | pores |
| 51 | 埃曼塔奶酪 | `emmental` | 奶酪 | 圆角方块 | pores |
| 52 | 伊丹奶酪 | `edam` | 奶酪 | 圆柱 | pores |
| 53 | 马苏里拉奶酪 | `mozzarella` | 奶酪 | 圆柱 | plain |
| 54 | 菲达奶酪 | `feta` | 奶酪 | 圆角方块 | pores |
| 55 | 布里奶酪 | `brie` | 奶酪 | 圆柱 | plain |
| 56 | 卡芒贝尔奶酪 | `camembert` | 奶酪 | 圆柱 | plain |
| 57 | 蓝纹奶酪 | `blue_cheese` | 奶酪 | 圆角方块 | marble |
| 58 | 胡椒杰克奶酪 | `pepper_jack` | 奶酪 | 圆角方块 | flecks |
| 59 | 豆腐 | `tofu` | 甜点与食品 | 圆角方块 | pores |
| 60 | 老豆腐 | `firm_tofu` | 甜点与食品 | 圆角方块 | pores |
| 61 | 魔芋块 | `konjac` | 甜点与食品 | 圆角方块 | flecks |
| 62 | 年糕 | `rice_cake` | 甜点与食品 | 圆角方块 | plain |
| 63 | 布朗尼 | `brownie` | 面包与蛋糕 | 圆角方块 | chips |
| 64 | 香草海绵蛋糕 | `vanilla_sponge` | 面包与蛋糕 | 圆角方块 | pores |
| 65 | 巧克力海绵蛋糕 | `chocolate_sponge` | 面包与蛋糕 | 圆角方块 | pores |
| 66 | 抹茶海绵蛋糕 | `matcha_sponge` | 面包与蛋糕 | 圆角方块 | pores |
| 67 | 草莓海绵蛋糕 | `strawberry_sponge` | 面包与蛋糕 | 圆角方块 | pores |
| 68 | 磅蛋糕 | `pound_cake` | 面包与蛋糕 | 圆角方块 | pores |
| 69 | 香蕉面包 | `banana_bread` | 面包与蛋糕 | 圆角方块 | flecks |
| 70 | 白吐司 | `white_bread` | 面包与蛋糕 | 圆角方块 | pores |
| 71 | 全麦吐司 | `whole_wheat_bread` | 面包与蛋糕 | 圆角方块 | flecks |
| 72 | 黑麦面包 | `rye_bread` | 面包与蛋糕 | 圆角方块 | flecks |
| 73 | 芝士蛋糕 | `cheesecake` | 甜点与食品 | 圆角方块 | layers |
| 74 | 提拉米苏 | `tiramisu` | 甜点与食品 | 圆角方块 | layers |
| 75 | 彩虹蛋糕 | `rainbow_cake` | 甜点与食品 | 圆角方块 | rainbow |
| 76 | 红豆糕 | `red_bean_cake` | 甜点与食品 | 圆角方块 | flecks |
| 77 | 绿豆糕 | `mung_bean_cake` | 甜点与食品 | 圆角方块 | plain |
| 78 | 椰蓉糕 | `coconut_bar` | 甜点与食品 | 圆角方块 | flecks |
| 79 | 棉花糖块 | `marshmallow` | 甜点与食品 | 圆角方块 | plain |
| 80 | 牛奶巧克力 | `milk_chocolate` | 甜点与食品 | 圆角方块 | plain |
| 81 | 黑巧克力 | `dark_chocolate` | 甜点与食品 | 圆角方块 | plain |
| 82 | 白巧克力 | `white_chocolate` | 甜点与食品 | 圆角方块 | plain |
| 83 | 奶油软糖 | `fudge` | 甜点与食品 | 圆角方块 | plain |
| 84 | 牛轧糖 | `nougat` | 甜点与食品 | 圆角方块 | chips |
| 85 | 芝麻酥糖 | `halva` | 甜点与食品 | 圆角方块 | flecks |
| 86 | 抹茶巧克力 | `matcha_chocolate` | 甜点与食品 | 圆角方块 | plain |
| 87 | 牛奶皂 | `milk_soap` | 日用品 | 圆角方块 | plain |
| 88 | 玫瑰皂 | `rose_soap` | 日用品 | 圆角方块 | flecks |
| 89 | 竹炭皂 | `charcoal_soap` | 日用品 | 圆角方块 | plain |
| 90 | 蜂蜜皂 | `honey_soap` | 日用品 | 圆角方块 | plain |
| 91 | 芦荟皂 | `aloe_soap` | 日用品 | 圆角方块 | plain |
| 92 | 燕麦皂 | `oat_soap` | 日用品 | 圆角方块 | flecks |
| 93 | 咖啡皂 | `coffee_soap` | 日用品 | 圆角方块 | flecks |
| 94 | 清洁海绵 | `sponge` | 日用品 | 圆角方块 | pores |
| 95 | 插花花泥 | `floral_foam` | 日用品 | 圆角方块 | pores |
| 96 | 彩泥块 | `modeling_clay` | 日用品 | 圆角方块 | marble |
| 97 | 蜂蜡块 | `wax_block` | 日用品 | 圆角方块 | plain |
| 98 | 橡皮擦 | `eraser` | 日用品 | 圆角方块 | plain |
| 99 | 黄油块 | `butter` | 甜点与食品 | 圆角方块 | plain |
| 100 | 薄荷皂 | `peppermint_soap` | 日用品 | 圆角方块 | marble |
