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
- 97-1：`you can enjoy for a lifetime`，省略關係代名詞的形容詞子句，修飾 `hobby`。
- 101-2：`where these movies are filmed`，形容詞子句，修飾 `locations`。
- 108-2：`who emphasize workplace efficiency`，形容詞子句，修飾 `those`。
- 111-2：`that pets bring`，形容詞子句，修飾 `the joy`。
- 112-1：`that war causes extremely dreadful disasters`，名詞子句，當 `proves` 的受詞。
- 114-2：`that once appeared in sci-fi movies`，形容詞子句，修飾 `magical items`。

## 英文組句與進階練習的共用切塊

- `pieces` / `answerPieces` 的每一塊都以 `source` 指向中文結構的 `slot`，或形容詞子句的 `id`；主詞、動詞、受詞與補語不跨格合併。
- 名詞子句整塊對應主句的受詞格；形容詞子句與先行詞分開，整塊指向獨立子句包。子句的中文、類型、修飾對象與英文範圍共用同一筆資料。
- 完整子句的邊界優先於固定搭配與片語細分。例如 `that reading is beneficial for children` 整塊保留，不再把 `children` 切出去。
- 進階的「片語／子句組字」依相同片段出題，顯示對應中文與結構標籤；名詞子句、形容詞子句各自獨立練習，不與主詞名詞或句首框架合併。
- 子句內的時間、地點等成分保留在完整子句及其說明中，不另外建立無法對應組句片段的中文拖拉格。
- 修改切塊後，以內容簽章辨識儲存的排列；舊片段編號不能直接套用新版文字。已完成資格保留，新子句組字仍需自行完成。

## 介系詞切分規則

在不跨越上述結構及完整子句邊界的前提下，決定「介系詞要切給前面的動詞／名詞，還是後面的名詞」時，依下列規則：

1. **固定搭配 → 介系詞黏前面那個字。**
   動詞或名詞「鎖死」某個介系詞、換掉就變別的意思時，介系詞跟著前面的字，讓學生重組時順便學搭配。
   - `a serious impact on` ＋ `society`（impact on）
   - `to demonstrate respect for` ＋ `local culture and customs`（respect for）
   - `a lifelong commitment to` ＋ `animals`（commitment to）
   - `beneficial for` 保留固定搭配；95-1 整個名詞子句仍為單一片段。
   - 包在同一塊裡、不另外切開的搭配也算（cope with、listen to、accustomed to、based on、take on、go against、fascinated by、take care of）。106-1 依上方結構分成被動動詞 `is often covered` 與覆蓋物 `with thick snow`。

2. **自由的介系詞片語 → 介系詞跟後面名詞。**
   地點、時間、情境等副詞片語，介系詞是後面名詞的頭，整組切給後面。
   - `in class`、`in urban areas`、`in winter`、`in Taiwan`、`for a lifetime`、`from different countries`、`throughout the country`、`on their own`、`as the main goal`。

3. **屬格 `of` → 一律跟後面名詞**（相當於中文「的」，沒有教搭配的價值，不黏前面）。
   - `representative` ＋ `of our local culture`
   - `The rapid development` ＋ `of space technology`
   - `the goal` ＋ `of all humanity`

4. **動詞 governs 的 `into` / `from`（divide X into Y、borrow X from Y）→ 維持原樣，介系詞跟後面名詞。**
   這類動詞與介系詞之間隔了受詞、連結不夠緊密，硬黏前面反而難判讀，故不黏。
   - `divide` ＋ `students` ＋ `into different groups`
   - `to borrow books from the library` 整段對應上方的「行為」，`more` 另對應「程度」。

> 同一結構單位內可保留完整片語；這些規則不要求每個介系詞都另外切塊。

## 資料格式

```js
subclauses: [
  {
    id: "subclause-1",
    chinese: "閱讀對兒童有益",
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

## 練習範圍

- 中文結構階段的子句包仍為說明卡，不要求學生拖拉子句內部主幹。
- 進階階段須把完整子句的單字排好；目前不另外新增子句內部的 S / V / O 拖拉格。
- 若題目同時有 A 句與 B 句主幹，子句包仍放在所有主幹之後，避免版面變得太碎。
