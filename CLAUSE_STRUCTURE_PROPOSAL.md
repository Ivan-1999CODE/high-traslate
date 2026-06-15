# 子句包拆分提案

## 目標

在「步驟二：中文結構拆解」中，把名詞子句與形容詞子句獨立點出來，避免學生把一整段子句誤判成一般補充細節。

## 設計原則

- 名詞子句：整段當作受詞或補語，例如 `that reading is beneficial for children` 是 `know` 的受詞內容。
- 形容詞子句：整段修飾前面的名詞，例如 `where these movies are filmed` 修飾 `locations`。
- 副詞子句：若功能是時間、條件、讓步或原因，先維持在「句首導入 / 補充細節」，不要把所有子句都拆出來，避免分類過細。
- 省略關係代名詞也要點出，例如 `a hobby you can enjoy` 中的 `you can enjoy` 仍是形容詞子句。

## 介面規則

- 子句包放在主幹之後、黏著修飾之前。
- 子句包使用淡橘色卡片，和階段提示一致，但不做成拖拉格。
- 卡片顯示：
  - 子句類型：名詞子句 / 形容詞子句
  - 功能：當受詞、修飾主詞、修飾補語等
  - 引導詞：that / where / 省略 that 或 which
  - 子句主幹：用簡短 S / V / O 或 S / V / C 表示

## 已套用例句

- 93-2：`that as long as we strive, success is achievable`，名詞子句，當 `proves` 的受詞。
- 95-1：`that reading is beneficial for children`，名詞子句，當 `know` 的受詞。
- 97-1：`you can enjoy`，省略關係代名詞的形容詞子句，修飾 `hobby`。
- 101-2：`where these movies are filmed`，形容詞子句，修飾 `locations`。
- 112-1：`that war causes extremely dreadful disasters`，名詞子句，當 `proves` 的受詞。
- 114-2：`that once appeared in sci-fi movies`，形容詞子句，修飾 `magical items`。

## 資料格式

```js
subclauses: [
  {
    type: "名詞子句",
    role: "當受詞",
    marker: "that",
    text: "that reading is beneficial for children",
    target: "know",
    core: "reading / is / beneficial",
    note: "that 後面是一個完整句子，整段當 know 的受詞內容。"
  }
]
```

## 後續建議

- 第一版先只標示，不要求學生拖拉子句內部主幹。
- 等學生熟悉後，再考慮把子句卡片展開成「子句主幹」小練習。
- 若題目同時有 A 句與 B 句主幹，子句包仍放在所有主幹之後，避免版面變得太碎。
