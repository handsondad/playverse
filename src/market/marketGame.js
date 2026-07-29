const ITEMS = [
  { id: "milk", name: "牛奶", icon: "🥛", category: "乳制品" },
  { id: "bread", name: "面包", icon: "🍞", category: "主食" },
  { id: "egg", name: "鸡蛋", icon: "🥚", category: "乳制品" },
  { id: "apple", name: "苹果", icon: "🍎", category: "水果" },
  { id: "banana", name: "香蕉", icon: "🍌", category: "水果" },
  { id: "carrot", name: "胡萝卜", icon: "🥕", category: "蔬菜" },
  { id: "potato", name: "土豆", icon: "🥔", category: "蔬菜" },
  { id: "cheese", name: "奶酪", icon: "🧀", category: "乳制品" },
  { id: "fish", name: "小鱼", icon: "🐟", category: "荤菜" },
  { id: "chicken", name: "鸡腿", icon: "🍗", category: "荤菜" },
  { id: "orange", name: "橙子", icon: "🍊", category: "水果" },
  { id: "tomato", name: "番茄", icon: "🍅", category: "蔬菜" },
  { id: "corn", name: "玉米", icon: "🌽", category: "蔬菜" },
  { id: "broccoli", name: "西兰花", icon: "🥦", category: "蔬菜" },
  { id: "mushroom", name: "蘑菇", icon: "🍄", category: "蔬菜" },
  { id: "butter", name: "黄油", icon: "🧈", category: "乳制品" },
];

function shuffle(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function generateShoppingList(count) {
  return shuffle(ITEMS).slice(0, count).map((item) => item.id);
}

export class MarketGame {
  constructor() {
    this.score = 0;
    this.ordersCompleted = 0;
    this.streak = 0;
    this.feedback = "看看购物清单，把需要的商品放进购物车！";
    this.shoppingList = generateShoppingList(3);
    this.cart = [];
    this.submitted = false;
    this.lastResult = null;
    this.items = ITEMS;
  }

  getLevelCount() {
    if (this.ordersCompleted < 3) {
      return 3;
    }
    if (this.ordersCompleted < 6) {
      return 4;
    }
    return Math.min(5 + Math.floor((this.ordersCompleted - 6) / 3), 7);
  }

  reset() {
    this.score = 0;
    this.ordersCompleted = 0;
    this.streak = 0;
    this.feedback = "看看购物清单，把需要的商品放进购物车！";
    this.shoppingList = generateShoppingList(3);
    this.cart = [];
    this.submitted = false;
    this.lastResult = null;
  }

  toggleCart(itemId) {
    if (this.submitted) {
      return this.getSnapshot();
    }
    const idx = this.cart.indexOf(itemId);
    if (idx >= 0) {
      this.cart = this.cart.filter((id) => id !== itemId);
    } else {
      this.cart = [...this.cart, itemId];
    }
    return this.getSnapshot();
  }

  submit() {
    if (this.submitted) {
      return this.getSnapshot();
    }
    this.submitted = true;

    const listSet = new Set(this.shoppingList);
    const cartSet = new Set(this.cart);
    const correct = [...listSet].every((id) => cartSet.has(id)) && cartSet.size === listSet.size;
    this.lastResult = correct;

    if (correct) {
      this.ordersCompleted += 1;
      this.streak += 1;
      this.score += 10 + this.streak * 2;
      this.feedback = "全部买对啦，购物完成！";
    } else {
      this.streak = 0;
      const missing = [...listSet]
        .filter((id) => !cartSet.has(id))
        .map((id) => ITEMS.find((i) => i.id === id)?.name)
        .filter(Boolean)
        .join("、");
      const extra = [...cartSet]
        .filter((id) => !listSet.has(id))
        .map((id) => ITEMS.find((i) => i.id === id)?.name)
        .filter(Boolean)
        .join("、");
      let msg = "";
      if (missing) {
        msg += `还差：${missing}`;
      }
      if (extra) {
        msg += (msg ? "；" : "") + `多拿了：${extra}`;
      }
      this.feedback = msg || "没有完全对哦，再看看清单。";
    }

    return { ...this.getSnapshot(), correct };
  }

  nextOrder() {
    this.shoppingList = generateShoppingList(this.getLevelCount());
    this.cart = [];
    this.submitted = false;
    this.lastResult = null;
    this.feedback = "新的购物清单！看清楚再去找哦。";
    return this.getSnapshot();
  }

  getSnapshot() {
    return {
      items: ITEMS,
      shoppingList: this.shoppingList,
      cart: this.cart,
      score: this.score,
      ordersCompleted: this.ordersCompleted,
      streak: this.streak,
      feedback: this.feedback,
      submitted: this.submitted,
      lastResult: this.lastResult,
    };
  }
}
